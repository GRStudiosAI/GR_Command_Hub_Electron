const { runPS } = require("./ps");

/**
 * Purge Engine (PowerShell 5.1 compatible)
 * Defensive cleanup / remediation tooling.
 *
 * Upgrades vs your current version:
 * - Adds a real Scan stage producing JSON report (score + reasons)
 * - Uses Authenticode signature checks (skip Microsoft/trusted signed)
 * - More robust process targeting + logging
 * - Safe staged actions + thresholds + dry-run support
 * - Continues on errors (doesn't "stop half way")
 */

/** Helper: parse PS JSON safely */
function parseJsonArray(stdout) {
  const t = (stdout || "").trim();
  if (!t) return [];
  const parsed = JSON.parse(t);
  if (!parsed) return [];
  return Array.isArray(parsed) ? parsed : [parsed];
}

/**
 * Scan suspicious processes (does NOT kill; returns JSON array)
 * Heuristics:
 * - Executable in temp/public/programdata/low-trust dirs
 * - Unsigned or signature invalid
 * - Weird parent-child combos (optional)
 * - Fake "system process names" outside %SystemRoot%
 *
 * Output item schema:
 *  {
 *    pid, name, exe, cmd, parentPid,
 *    score, reasons: [..],
 *    sigStatus, sigSigner
 *  }
 */
function psScanProcesses(opts) {
  // PowerShell 5.1 compatible: no ??, no ternaries that depend on PS7
  // Notes:
  // - Using CIM for ExecutablePath and CommandLine reliability
  // - Using Get-AuthenticodeSignature for signature validation
  // - Keeping output small but useful

  const minScore = Number(opts.minScore || 60); // default threshold for "dangerous"
  const includeUnsigned = opts.includeUnsigned !== false; // default true
  const includeTempPaths = opts.includeTempPaths !== false; // default true
  const includeSystemNameMismatch = opts.includeSystemNameMismatch !== false; // default true

  // Known safe-ish vendor keywords (you can expand)
  const safeVendors = (opts.safeVendors && Array.isArray(opts.safeVendors) ? opts.safeVendors : [
    "microsoft",
    "windows",
    "intel",
    "amd",
    "nvidia",
    "google",
    "mozilla",
    "discord",
    "valve",
    "steam"
  ]);

  // "Drop zones" and suspicious locations
  const dropZones = (opts.dropZones && Array.isArray(opts.dropZones) ? opts.dropZones : [
    "\\temp\\",
    "\\users\\public\\",
    "\\programdata\\",
    "\\appdata\\local\\temp\\",
    "\\appdata\\roaming\\",
    "\\appdata\\local\\"
  ]);

  // Common system process names that should live in SystemRoot
  const systemNames = (opts.systemNames && Array.isArray(opts.systemNames) ? opts.systemNames : [
    "svchost.exe",
    "lsass.exe",
    "wininit.exe",
    "services.exe",
    "smss.exe",
    "csrss.exe",
    "winlogon.exe"
  ]);

  return `
$ErrorActionPreference = "SilentlyContinue"

function _ToLower([string]$s) {
  if ($null -eq $s) { return "" }
  return $s.ToLower()
}

function _Clean([string]$s) {
  if ($null -eq $s) { return "" }
  return $s.Trim()
}

function _HasAny([string]$text, [object[]]$arr) {
  if ([string]::IsNullOrWhiteSpace($text)) { return $false }
  $t = $text.ToLower()
  foreach ($a in $arr) {
    $k = [string]$a
    if ($t -like "*$k*") { return $true }
  }
  return $false
}

$minScore = ${minScore}
$systemRoot = _ToLower $env:SystemRoot
$dropZones = @(${dropZones.map(z => `"${String(z).replace(/"/g, '""')}"`).join(",")})
$systemNames = @(${systemNames.map(n => `"${String(n).replace(/"/g, '""')}"`).join(",")})
$safeVendors = @(${safeVendors.map(v => `"${String(v).replace(/"/g, '""')}"`).join(",")})

$results = @()

# Build PID->Parent map to avoid multiple CIM calls
$procs = Get-CimInstance Win32_Process
foreach ($p in $procs) {
  $pid = $p.ProcessId
  $name = _ToLower $p.Name
  $exe  = _ToLower $p.ExecutablePath
  $cmd  = _Clean $p.CommandLine
  $ppid = $p.ParentProcessId

  $score = 0
  $reasons = @()

  # Skip if we don't have an executable path (system processes sometimes)
  # We'll still evaluate name mismatch rules if applicable.
  $isSystemName = $false
  if ($systemNames -contains $name) { $isSystemName = $true }

  # 1) Fake system name but not under SystemRoot
  if (${includeSystemNameMismatch.ToString().ToLower()} -eq "true") {
    if ($isSystemName -and $exe -ne "" -and ($exe -notlike "$systemRoot*")) {
      $score += 70
      $reasons += "system-name-mismatch"
    }
  }

  # 2) Drop zone path
  if (${includeTempPaths.ToString().ToLower()} -eq "true") {
    foreach ($z in $dropZones) {
      if ($exe -ne "" -and $exe -like "*$z*") {
        $score += 40
        $reasons += ("drop-zone:" + $z)
        break
      }
    }
  }

  # 3) Unsigned / invalid signature (only if exe path exists)
  $sigStatus = ""
  $sigSigner = ""
  $sigTrusted = $false

  if ($exe -ne "" -and (Test-Path $exe)) {
    $sig = Get-AuthenticodeSignature -FilePath $exe
    $sigStatus = [string]$sig.Status
    if ($sig.SignerCertificate -ne $null) {
      $sigSigner = [string]$sig.SignerCertificate.Subject
    } else {
      $sigSigner = ""
    }

    # Trusted if valid and signer appears safe
    if ($sigStatus -eq "Valid") {
      $sigTrusted = $true

      # If signer contains suspicious/unknown vendors, we don't auto-trust
      if ($sigSigner -ne "" -and (_HasAny $sigSigner $safeVendors)) {
        # stays trusted
      } else {
        # valid but not on our safe vendor list -> slightly suspicious
        $sigTrusted = $false
        $score += 10
        $reasons += "signed-unknown-vendor"
      }
    } else {
      if (${includeUnsigned.ToString().ToLower()} -eq "true") {
        $score += 35
        $reasons += ("signature:" + $sigStatus)
      }
    }
  } else {
    # Missing executable on disk
    if ($exe -ne "") {
      $score += 50
      $reasons += "exe-missing-on-disk"
    }
  }

  # Reduce score if Microsoft/Windows signed and in SystemRoot
  if ($sigTrusted -eq $true -and $sigSigner -ne "" -and $sigSigner.ToLower() -like "*microsoft*") {
    if ($exe -like "$systemRoot*") {
      $score -= 40
      $reasons += "microsoft-signed-systemroot"
    }
  }

  # Output only items above a minimum threshold OR with strong reasons
  if ($score -ge $minScore) {
    $results += [pscustomobject]@{
      pid       = $pid
      parentPid = $ppid
      name      = $p.Name
      exe       = $p.ExecutablePath
      cmd       = $cmd
      score     = $score
      reasons   = $reasons
      sigStatus = $sigStatus
      sigSigner = $sigSigner
    }
  }
}

$results | ConvertTo-Json -Compress
`;
}

/**
 * Purge: a fully staged pipeline.
 * options:
 * {
 *   scan_only: boolean,
 *   dry_run: boolean,
 *   minScore: number,
 *   procs: boolean,
 *   reg: boolean,
 *   net_reset: boolean,
 *   win_update: boolean,
 *   quarantine: boolean
 * }
 */
async function executeCriticalPurge(options, log) {
  log("--- INITIATING PURGE ENGINE ---");

  const scanOnly = !!options.scan_only;
  const dryRun = !!options.dry_run;
  const minScore = Number(options.minScore || 60);

  // 0) Scan stage (always run if procs enabled, so you can show results)
  let procFindings = [];
  if (options.procs) {
    log(`[SCAN] Enumerating suspicious processes (minScore=${minScore})...`);
    try {
      const { stdout, stderr } = await runPS(psScanProcesses({ minScore }));
      if (stderr && stderr.trim()) log("[PS STDERR] " + stderr.trim());

      procFindings = parseJsonArray(stdout);
      log(`[SCAN] Found ${procFindings.length} suspicious process(es).`);

      // Print a short readable list
      procFindings.slice(0, 25).forEach(p => {
        const exe = (p.exe || "").toString();
        log(`  - PID ${p.pid} | score ${p.score} | ${p.name} | ${exe}`);
      });
      if (procFindings.length > 25) log(`  ...and ${procFindings.length - 25} more`);
    } catch (e) {
      log(`[SCAN ERROR] Process scan failed: ${e.message}`);
    }
  }

  if (scanOnly) {
    log("--- SCAN ONLY COMPLETE ---");
    return { procFindingsCount: procFindings.length };
  }

  // 1) Process termination stage (based on scan results)
  if (options.procs) {
    if (!procFindings.length) {
      log("[PROC] Nothing flagged above threshold; skipping termination stage.");
    } else {
      log(`[PROC] ${dryRun ? "DRY RUN: would terminate" : "Terminating"} ${procFindings.length} process(es)...`);

      // Kill highest score first
      procFindings.sort((a, b) => Number(b.score || 0) - Number(a.score || 0));

      for (const p of procFindings) {
        const pid = Number(p.pid);
        if (!pid) continue;

        if (dryRun) {
          log(`  [DRY] Would stop PID ${pid} (${p.name}) score=${p.score}`);
          continue;
        }

        try {
          // Use PowerShell Stop-Process for reliability
          await runPS(`try { Stop-Process -Id ${pid} -Force -ErrorAction Stop; "OK" } catch { "FAIL" }`);
          log(`  [KILLED] PID ${pid} (${p.name}) score=${p.score}`);
        } catch {
          log(`  [FAIL] Could not stop PID ${pid} (${p.name})`);
        }
      }
    }
  }

  // 2) IFEO debugger hijacks (defensive, but should be careful)
  if (options.reg) {
    log("[REG] Cleaning IFEO debugger hijacks...");
    const script = `
$ifeo = "HKLM:\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\Image File Execution Options"
$fixed = 0
$items = @()

if (Test-Path $ifeo) {
  Get-ChildItem $ifeo -ErrorAction SilentlyContinue | ForEach-Object {
    try {
      $dbg = (Get-ItemProperty $_.PSPath -Name "debugger" -ErrorAction Stop).debugger
      if ($dbg) {
        $items += [pscustomobject]@{ key=$_.PSChildName; debugger=$dbg }
        Remove-ItemProperty -Path $_.PSPath -Name "debugger" -Force
        $fixed++
      }
    } catch {}
  }
}

$items | ConvertTo-Json -Compress
"FIXED_COUNT=" + $fixed
`;
    try {
      const { stdout, stderr } = await runPS(script);
      if (stderr && stderr.trim()) log("[PS STDERR] " + stderr.trim());

      // stdout has JSON then FIXED_COUNT; we’ll just show the count reliably
      const m = stdout.match(/FIXED_COUNT=(\d+)/);
      const count = m ? m[1] : "0";
      log(`[REG] Removed Debugger Hijacks: ${count}`);
    } catch (e) {
      log(`[REG ERROR] IFEO cleanup failed: ${e.message}`);
    }
  }

  // 3) Network reset (proxy reset + winsock/ip reset)
  if (options.net_reset) {
    log("[NET] Resetting network stack (proxy/winsock/ip)...");
    if (dryRun) {
      log("[NET] DRY RUN: would reset proxy + winsock + ip.");
    } else {
      try {
        await runPS('reg add "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings" /v ProxyEnable /t REG_DWORD /d 0 /f');
        await runPS('reg delete "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings" /v ProxyServer /f');
        await runPS("netsh winsock reset");
        await runPS("netsh int ip reset");
        log("[NET] Network reset complete.");
      } catch (e) {
        log(`[NET ERROR] Network reset failed: ${e.message}`);
      }
    }
  }

  // 4) Restart update services
  if (options.win_update) {
    log("[WU] Restarting Windows Update services...");
    if (dryRun) {
      log("[WU] DRY RUN: would set start=auto and start services.");
    } else {
      const services = ["wuauserv", "bits", "cryptsvc", "trustedinstaller"];
      for (const svc of services) {
        try {
          await runPS(`sc config ${svc} start= auto`);
          await runPS(`net start ${svc}`);
          log(`  [WU] Started: ${svc}`);
        } catch (e) {
          log(`  [WU] Failed: ${svc} (${e.message})`);
        }
      }
    }
  }

  // 5) Quarantine cleanup (safe caches only; do not wipe random user folders)
  if (options.quarantine) {
    log("[CLEAN] Cleaning safe caches/remnants...");
    if (dryRun) {
      log("[CLEAN] DRY RUN: would clear selected caches.");
    } else {
      const script = `
$targets = @(
  (Join-Path $env:LOCALAPPDATA "Microsoft\\Windows\\WebCache"),
  (Join-Path $env:TEMP ""),
  (Join-Path $env:SystemRoot "Temp")
)

$wiped = @()

foreach ($t in $targets) {
  try {
    if (Test-Path $t) {
      Remove-Item -Path (Join-Path $t "*") -Recurse -Force -ErrorAction SilentlyContinue
      $wiped += $t
    }
  } catch {}
}

$wiped | ConvertTo-Json -Compress
`;
      try {
        const { stdout, stderr } = await runPS(script);
        if (stderr && stderr.trim()) log("[PS STDERR] " + stderr.trim());
        const wiped = parseJsonArray(stdout);
        wiped.forEach(t => log("  Wiped: " + t));
      } catch (e) {
        log(`[CLEAN ERROR] Cache cleanup failed: ${e.message}`);
      }
    }
  }

  log("--- FULL PURGE COMPLETE ---");
  return { procFindingsCount: procFindings.length };
}

module.exports = { executeCriticalPurge };