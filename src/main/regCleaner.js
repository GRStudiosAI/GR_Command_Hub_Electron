const { runPS } = require("./ps");
const { storePaths, readJSON, writeJSON } = require("./store");

/**
 * Registry Cleaner (safe categories only)
 * - Uses PowerShell to enumerate keys/values and check for missing file paths
 * - Stores results to regCleaner.json via storePaths()
 *
 * Output schema (array):
 *   { category, hive, path, name, value, note }
 *
 * fixRegistryIssues() deletes ONLY the value (not the key), except for App Paths / Uninstall
 * where it deletes the *specific* value that is broken.
 */

const REG_MAP = {
  "Missing Shared DLLs": { hive: "HKLM", path: "SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\SharedDlls" },
  "Application Paths": { hive: "HKLM", path: "SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\App Paths" },
  "Installer": { hive: "HKLM", path: "SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Installer\\Folders" },
  "Run At Startup": { hive: "HKLM", path: "SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Run" },
  "MUI Cache": { hive: "HKCU", path: "Software\\Classes\\Local Settings\\Software\\Microsoft\\Windows\\Shell\\MuiCache" },
  "Obsolete Software": { hive: "HKLM", path: "SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Uninstall" },
  "Fonts": { hive: "HKLM", path: "SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\Fonts" }
};

/** Normalize PowerShell JSON output (array/object/empty) */
function normalizeJson(stdout) {
  const t = (stdout || "").trim();
  if (!t) return [];
  const parsed = JSON.parse(t);
  if (!parsed) return [];
  return Array.isArray(parsed) ? parsed : [parsed];
}

/** Build a PowerShell scanner per category (more accurate than generic Get-ItemProperty) */
function psScanCategory(category, hive, subPath) {
  const psRoot = `${hive}:\\${subPath.replace(/\\\\/g, "\\")}`;

  // Common helpers: expand env vars, trim quotes, split "path,0" style
  const helpers = `
function _CleanPath([string]$s) {
  if ([string]::IsNullOrWhiteSpace($s)) { return $null }
  $x = $s.Trim()
  # remove leading/trailing quotes
  $x = $x.Trim('"')
  # MuiCache value-names often append metadata like ".FriendlyAppName" or ".ApplicationCompany"
  $x = ($x -replace '\.(FriendlyAppName|ApplicationCompany|ApplicationDescription|ApplicationName|Company)$','')
  # handle "C:\\path\\file.dll,0" or similar
  if ($x -match ',\\s*\\d+$') { $x = ($x -split ',')[0] }
  # expand env vars
  $x = [Environment]::ExpandEnvironmentVariables($x)
  return $x
}
function _Add([ref]$arr, $cat, $h, $p, $n, $v, $note) {
  $arr.Value += [pscustomobject]@{
    category = $cat
    hive = $h
    path = $p
    name = $n
    value = $v
    note = $note
  }
}
`;

  // Category-specific scanners
  if (category === "Missing Shared DLLs") {
    // SharedDlls stores paths as VALUE NAMES (often REG_DWORD counts)
    return `
${helpers}
$found = @()
$k = "${psRoot}"
try {
  if (Test-Path $k) {
    $item = Get-Item -Path $k -ErrorAction SilentlyContinue
    if ($item) {
      $item.GetValueNames() | ForEach-Object {
        $name = $_
        $p = _CleanPath $name
        if ($p -and ($p -match '^[A-Za-z]:\\\\') ) {
          if (-not (Test-Path $p)) {
            _Add ([ref]$found) "${category}" "${hive}" "${subPath}" $name "" "path referenced as value-name missing"
          }
        }
      }
    }
  }
} catch {}
$found | ConvertTo-Json -Compress
`;
  }

  if (category === "Application Paths") {
    // App Paths uses subkeys. Default value often points to EXE; "Path" value is optional.
    return `
${helpers}
$found = @()
$k = "${psRoot}"
try {
  if (Test-Path $k) {
    Get-ChildItem -Path $k -ErrorAction SilentlyContinue | ForEach-Object {
      $sub = $_.PSPath
      $rel = $_.PSChildName
      try {
        $p = Get-ItemProperty -Path $sub -ErrorAction SilentlyContinue
        if ($p) {
          # Default value is (default) property name in PS: usually stored as "(default)" via GetValue("")
          $default = (Get-Item -Path $sub).GetValue("")
          $exe = _CleanPath $default
          if ($exe -and ($exe -match '^[A-Za-z]:\\\\') -and (-not (Test-Path $exe))) {
            _Add ([ref]$found) "${category}" "${hive}" ("${subPath}" + "\\" + $rel) "(Default)" $default "default exe missing"
          }

          # Some apps store additional values containing file paths
          (Get-Item -Path $sub).GetValueNames() | ForEach-Object {
            $n = $_
            if ($n -eq "") { return }
            if ($n -in @("PSPath","PSParentPath","PSChildName","PSDrive","PSProvider")) { return }
            $v = (Get-Item -Path $sub).GetValue($n)
            if ($v -is [string]) {
              $cp = _CleanPath $v
              if ($cp -and ($cp -match '^[A-Za-z]:\\\\') -and (-not (Test-Path $cp))) {
                _Add ([ref]$found) "${category}" "${hive}" ("${subPath}" + "\\" + $rel) $n $v "value path missing"
              }
            }
          }
        }
      } catch {}
    }
  }
} catch {}
$found | ConvertTo-Json -Compress
`;
  }

  if (category === "Obsolete Software") {
    // Uninstall uses subkeys. Check DisplayIcon, InstallLocation, UninstallString (paths).
    return `
${helpers}
$found = @()
$k = "${psRoot}"
try {
  if (Test-Path $k) {
    Get-ChildItem -Path $k -ErrorAction SilentlyContinue | ForEach-Object {
      $sub = $_.PSPath
      $rel = $_.PSChildName
      try {
        $p = Get-ItemProperty -Path $sub -ErrorAction SilentlyContinue
        if ($p) {
          $targets = @(
            @{ name="DisplayIcon"; val=$p.DisplayIcon },
            @{ name="InstallLocation"; val=$p.InstallLocation },
            @{ name="UninstallString"; val=$p.UninstallString },
            @{ name="QuietUninstallString"; val=$p.QuietUninstallString }
          )

          foreach ($t in $targets) {
            $raw = [string]$t.val
            if ([string]::IsNullOrWhiteSpace($raw)) { continue }

            # UninstallString can be like: "C:\\path\\uninstall.exe" /args
            $first = $raw.Trim()
            if ($first.StartsWith('"')) {
              $first = ($first -split '"')[1]
            } else {
              $first = ($first -split '\\s+')[0]
            }

            $cp = _CleanPath $first
            if ($cp -and ($cp -match '^[A-Za-z]:\\\\') -and (-not (Test-Path $cp))) {
              _Add ([ref]$found) "${category}" "${hive}" ("${subPath}" + "\\" + $rel) $t.name $raw "referenced path missing"
            }
          }
        }
      } catch {}
    }
  }
} catch {}
$found | ConvertTo-Json -Compress
`;
  }

  if (category === "Installer") {
    // Installer\\Folders values are often folder paths as VALUE NAMES or values
    return `
${helpers}
$found = @()
$k = "${psRoot}"
try {
  if (Test-Path $k) {
    $item = Get-Item -Path $k -ErrorAction SilentlyContinue
    if ($item) {
      $item.GetValueNames() | ForEach-Object {
        $n = $_
        $val = $item.GetValue($n)
        # Sometimes folder path is the value name; sometimes it's the value
        $candidates = @()
        if ($n) { $candidates += $n }
        if ($val) { $candidates += [string]$val }

        foreach ($c in $candidates) {
          $p = _CleanPath $c
          if ($p -and ($p -match '^[A-Za-z]:\\\\') -and (-not (Test-Path $p))) {
            _Add ([ref]$found) "${category}" "${hive}" "${subPath}" $n ([string]$val) "installer folder missing"
            break
          }
        }
      }
    }
  }
} catch {}
$found | ConvertTo-Json -Compress
`;
  }

  if (category === "Run At Startup") {
    // Run contains command lines; check executable target exists
    return `
${helpers}
$found = @()
$k = "${psRoot}"
try {
  if (Test-Path $k) {
    $item = Get-Item -Path $k -ErrorAction SilentlyContinue
    if ($item) {
      $item.GetValueNames() | ForEach-Object {
        $n = $_
        $raw = [string]$item.GetValue($n)
        if ([string]::IsNullOrWhiteSpace($raw)) { return }

        # Extract exe from command line
        $first = $raw.Trim()
        if ($first.StartsWith('"')) {
          $first = ($first -split '"')[1]
        } else {
          $first = ($first -split '\\s+')[0]
        }

        $cp = _CleanPath $first
        if ($cp -and ($cp -match '^[A-Za-z]:\\\\') -and (-not (Test-Path $cp))) {
          _Add ([ref]$found) "${category}" "${hive}" "${subPath}" $n $raw "startup target missing"
        }
      }
    }
  }
} catch {}
$found | ConvertTo-Json -Compress
`;
  }

  if (category === "Fonts") {
    // Fonts values are often filenames; actual files live under %WINDIR%\\Fonts
    return `
${helpers}
$found = @()
$k = "${psRoot}"
$fontsDir = Join-Path $env:WINDIR "Fonts"
try {
  if (Test-Path $k) {
    $item = Get-Item -Path $k -ErrorAction SilentlyContinue
    if ($item) {
      $item.GetValueNames() | ForEach-Object {
        $n = $_
        $v = [string]$item.GetValue($n)
        if ([string]::IsNullOrWhiteSpace($v)) { return }

        $file = _CleanPath $v
        # If it isn't a rooted path, assume it's a filename under Fonts
        if ($file -and -not (Split-Path $file -IsAbsolute)) {
          $file = Join-Path $fontsDir $file
        }

        if ($file -and (-not (Test-Path $file))) {
          _Add ([ref]$found) "${category}" "${hive}" "${subPath}" $n $v "font file missing"
        }
      }
    }
  }
} catch {}
$found | ConvertTo-Json -Compress
`;
  }

  if (category === "MUI Cache") {
    // MUI cache contains file paths or app paths as value names sometimes
    return `
${helpers}
$found = @()
$k = "${psRoot}"
try {
  if (Test-Path $k) {
    $item = Get-Item -Path $k -ErrorAction SilentlyContinue
    if ($item) {
      $item.GetValueNames() | ForEach-Object {
        $n = $_
        $p = _CleanPath $n
        if ($p -and ($p -match '^[A-Za-z]:\\\\') -and (-not (Test-Path $p))) {
          _Add ([ref]$found) "${category}" "${hive}" "${subPath}" $n "" "cached path missing (value-name)"
        }
      }
    }
  }
} catch {}
$found | ConvertTo-Json -Compress
`;
  }

  // fallback: do nothing (we only scan safe implemented categories)
  return `
@() | ConvertTo-Json -Compress
`;
}

async function advancedScan(categories, log) {
  log("--- SCANNING SELECTED REGISTRY CATEGORIES ---");
  let found = [];

  for (const cat of categories) {
    const map = REG_MAP[cat];
    if (!map) {
      log(`[!] ${cat} is unsupported or protected (skipping).`);
      continue;
    }

    log(`[*] Scanning: ${cat} ...`);
    const ps = psScanCategory(cat, map.hive, map.path);

    let stdout = "";
    try {
      const res = await runPS(ps);
      stdout = res.stdout || "";
    } catch (e) {
      log(`[x] PowerShell scan error in "${cat}": ${e.message}`);
      continue;
    }

    try {
      const arr = normalizeJson(stdout);
      if (arr.length) found = found.concat(arr);
      log(`    -> ${arr.length} issue(s) found in ${cat}`);
    } catch (e) {
      log(`[x] JSON parse error in "${cat}". Raw output:\n${stdout}`);
    }
  }

  const { regCleaner } = storePaths();
  await writeJSON(regCleaner, found);

  log(`Scan complete. Found ${found.length} orphaned item(s).`);
  return found.length;
}

async function fixRegistryIssues(log) {
  const { regCleaner } = storePaths();
  const found = await readJSON(regCleaner, []);
  if (!found.length) {
    log("Nothing to fix. Run a scan first.");
    return 0;
  }

  log(`--- REPAIRING ${found.length} ITEM(S) ---`);
  // Keep one clear start line (UI already shows the button action)
  log("[*] Fixing issues from last scan...");

  // Determine elevation. HKLM fixes require admin.
  let isAdmin = false;
  try {
    const adminCheck = await runPS(`([Security.Principal.WindowsPrincipal] [Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator) | ConvertTo-Json -Compress`);
    isAdmin = String((adminCheck.stdout || "").trim()).toLowerCase().includes("true");
  } catch {
    isAdmin = false;
  }

  // IMPORTANT:
  // Deleting one-by-one by spawning a new PowerShell process for each entry is slow,
  // which makes the UI look "stuck" (logs only print after IPC resolves).
  // Batch deletions into a single PowerShell run to finish fast and return a full log.

  const ops = [];
  for (const item of found) {
    const hive = item.hive;
    const sub = item.path || "";
    const regPath = sub ? `${hive}\\${sub}` : hive;
    const name = item.name;

    if (!name) continue;
    if (name === "(Default)") continue; // keep safety rule

    const needsAdmin = String(hive).toUpperCase() === "HKLM";

    if (needsAdmin && !isAdmin) {
      // Don't attempt HKLM writes without admin; report cleanly.
      ops.push({ category: item.category || "Unknown", regPath, name, skip: true, reason: "Requires Administrator" });
      continue;
    }

    ops.push({ category: item.category || "Unknown", regPath, name, skip: false, reason: "" });
  }

  if (!ops.length) {
    log("Nothing safe to fix from last scan.");
    return 0;
  }

  const b64 = Buffer.from(JSON.stringify(ops), "utf8").toString("base64");
  const ps = `
$ErrorActionPreference = 'SilentlyContinue'
$json = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('${b64}'))
$ops = $json | ConvertFrom-Json
$out = @()

function _HiveAndSubkey([string]$rp) {
  if ([string]::IsNullOrWhiteSpace($rp)) { return $null }
  # rp format: HKLM\SOFTWARE\... or HKCU\Software\...
  $i = $rp.IndexOf('\\')
  if ($i -lt 0) { return @{ hive=$rp; subkey='' } }
  return @{ hive=$rp.Substring(0,$i); subkey=$rp.Substring($i+1) }
}

function _OpenBaseKey([string]$hiveName) {
  switch ($hiveName.ToUpperInvariant()) {
    'HKLM' { return [Microsoft.Win32.RegistryKey]::OpenBaseKey([Microsoft.Win32.RegistryHive]::LocalMachine, [Microsoft.Win32.RegistryView]::Registry64) }
    'HKCU' { return [Microsoft.Win32.RegistryKey]::OpenBaseKey([Microsoft.Win32.RegistryHive]::CurrentUser, [Microsoft.Win32.RegistryView]::Default) }
    'HKCR' { return [Microsoft.Win32.RegistryKey]::OpenBaseKey([Microsoft.Win32.RegistryHive]::ClassesRoot, [Microsoft.Win32.RegistryView]::Default) }
    'HKU'  { return [Microsoft.Win32.RegistryKey]::OpenBaseKey([Microsoft.Win32.RegistryHive]::Users, [Microsoft.Win32.RegistryView]::Default) }
    'HKCC' { return [Microsoft.Win32.RegistryKey]::OpenBaseKey([Microsoft.Win32.RegistryHive]::CurrentConfig, [Microsoft.Win32.RegistryView]::Default) }
    default { return $null }
  }
}

foreach ($op in $ops) {
  $rp = [string]$op.regPath
  $nm = [string]$op.name
  $cat = [string]$op.category
  $skip = $false
  $reason = $null
  try { $skip = [bool]$op.skip } catch { $skip = $false }
  try { $reason = [string]$op.reason } catch { $reason = $null }

  if ($skip) {
    $out += [pscustomobject]@{ ok = $false; category = $cat; regPath = $rp; name = $nm; error = $reason }
    continue
  }

  $ok = $false
  $err = $null
  try {
    $hs = _HiveAndSubkey $rp
    $base = _OpenBaseKey $hs.hive
    if ($base -eq $null) { throw "Unsupported hive: $($hs.hive)" }

    $key = $base.OpenSubKey($hs.subkey, $true)
    if ($key -eq $null) { throw "Key not found" }

    # DeleteValue handles any characters in the value name (including backslashes) reliably.
    $key.DeleteValue($nm, $false)
    $key.Close()
    $base.Close()
    $ok = $true
  } catch {
    $ok = $false
    $err = $_.Exception.Message
  }

  $out += [pscustomobject]@{ ok = $ok; category = $cat; regPath = $rp; name = $nm; error = $err }
}

$out | ConvertTo-Json -Compress
`;

  let results = [];
  try {
    const res = await runPS(ps);
    results = normalizeJson(res.stdout);
  } catch (e) {
    log(`[x] Repair failed to execute: ${e.message}`);
    return 0;
  }

  let ok = 0;
  let fail = 0;
  for (const r of results) {
    if (r.ok) {
      ok++;
      log(` Removed: [${r.category}] ${r.regPath} -> ${r.name}`);
    } else {
      fail++;
      const msg = r.error ? ` (${r.error})` : "";
      log(` [x] Failed: [${r.category}] ${r.regPath} -> ${r.name}${msg}`);
    }
  }

  await writeJSON(regCleaner, []);
  log(`Repair complete. Success: ${ok}, Failed: ${fail}`);
  return ok;
}

module.exports = { advancedScan, fixRegistryIssues, REG_MAP };