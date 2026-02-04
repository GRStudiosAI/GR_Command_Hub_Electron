const { runPS } = require("./ps");
const os = require("os");

/*
  Xbox Full Screen Experience (Registry Only)
  Exports MUST match:
    installFseFiles,
    applyFseRegistry,
    uninstallFseFiles,
    uninstallFseRegistry

  Behavior:
  - Apply/revert registry tweaks
  - Restart Explorer (no reboot by default)
  - Detect if reboot is pending
  - Return { rebootRequired, rebooting }
*/

async function ps(cmd, log, label = "") {
  try {
    const { stdout, stderr } = await runPS(cmd);
    if (stderr && stderr.trim()) log(`[PS STDERR] ${stderr.trim()}`);
    if (stdout && stdout.trim()) log(label ? `${label}: ${stdout.trim()}` : stdout.trim());
    return { ok: true, stdout: stdout || "", stderr: stderr || "" };
  } catch (e) {
    log(`[X] ${label || "Command failed"}: ${e.message}`);
    return { ok: false, stdout: "", stderr: "", error: e };
  }
}

function ensureKey(path) {
  return `
$k = "${path}"
if (!(Test-Path $k)) { New-Item -Path $k -Force | Out-Null }
`;
}

/**
 * Check common "reboot pending" signals.
 * Not perfect, but good enough to decide whether to prompt.
 */
async function checkRebootPending(log) {
  const script = `
$pending = $false

# Windows Update reboot required
try {
  if (Test-Path "HKLM:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\WindowsUpdate\\Auto Update\\RebootRequired") {
    $pending = $true
  }
} catch {}

# CBS reboot pending
try {
  if (Test-Path "HKLM:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Component Based Servicing\\RebootPending") {
    $pending = $true
  }
} catch {}

# Pending file rename operations
try {
  $p = Get-ItemProperty -Path "HKLM:\\SYSTEM\\CurrentControlSet\\Control\\Session Manager" -Name "PendingFileRenameOperations" -ErrorAction SilentlyContinue
  if ($p -and $p.PendingFileRenameOperations) { $pending = $true }
} catch {}

# Computer name/domain change pending (rare)
try {
  if (Test-Path "HKLM:\\SYSTEM\\CurrentControlSet\\Control\\ComputerName\\ActiveComputerName") {
    # not a strong signal; ignore
  }
} catch {}

if ($pending) { "PENDING" } else { "NO" }
`;
  const r = await ps(script, log, "Reboot Check");
  return (r.stdout || "").includes("PENDING");
}

/* ========================================
   INSTALL FSE FILES (Not used — registry only)
   ======================================== */
async function installFseFiles(log) {
  log("[FSE] No file installation required (Registry Only Mode).");
  return { ok: true, rebootRequired: false };
}

/* ========================================
   APPLY REGISTRY TWEAKS
   - no reboot by default
   - restarts Explorer
   ======================================== */
async function applyFseRegistry(log, options = {}) {
  const opts = {
    restartExplorer: options.restartExplorer !== false, // default true
    reboot: !!options.reboot // default false
  };

  log("--- APPLYING XBOX FSE REGISTRY ---");

  // DeviceForm = 46
  await ps(
    `
${ensureKey("HKLM:\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\OEM")}
Set-ItemProperty -Path "HKLM:\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\OEM" -Name "DeviceForm" -Type DWord -Value 46 -Force
"OK"
`,
    log,
    "DeviceForm"
  );

  // UX console flags
  await ps(
    `
${ensureKey("HKLM:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Control Panel\\Settings\\UX")}
Set-ItemProperty -Path "HKLM:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Control Panel\\Settings\\UX" -Name "IsConsole" -Type DWord -Value 1 -Force
Set-ItemProperty -Path "HKLM:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Control Panel\\Settings\\UX" -Name "ShowConsoleFeatures" -Type DWord -Value 1 -Force
"OK"
`,
    log,
    "UX Console Flags"
  );

  // Close Settings if open (harmless)
  await ps(
    `
$proc = Get-Process SystemSettings -ErrorAction SilentlyContinue
if ($proc) { Stop-Process -Name SystemSettings -Force }
"OK"
`,
    log,
    "Close Settings"
  );

  // Restart Explorer to apply UI-visible changes without reboot
  if (opts.restartExplorer) {
    log("[FSE] Restarting Explorer to apply changes without reboot...");
    await ps(
      `
try { Stop-Process -Name explorer -Force -ErrorAction SilentlyContinue } catch {}
Start-Process explorer.exe
"OK"
`,
      log,
      "Explorer Restart"
    );
  }

  // Determine if reboot is pending (system-wide signals)
  const rebootRequired = await checkRebootPending(log);

  if (rebootRequired) {
    log("[FSE] Windows indicates a reboot may be required for ALL changes to fully apply.");
  } else {
    log("[FSE] No reboot signals detected. Changes should apply after Explorer restart.");
  }

  // If caller forces reboot, do it and return flag so UI can show popup BEFORE calling this
  if (opts.reboot) {
    log("[FSE] Reboot requested. System is rebooting...");
    // Give UI time: you should show popup BEFORE calling this option
    await ps(`shutdown /r /t 3`, log, "Reboot");
    return { ok: true, rebootRequired: true, rebooting: true };
  }

  return { ok: true, rebootRequired, rebooting: false };
}

/* =============================
   WINDOWS VERSION INFO (for UI)
   - Never throws
   - Always returns a usable build/version string
   - Covers 23H2 → 25H2 (Live + Insider)
============================= */

function _safeInt(v, fallback = null) {
  const n = parseInt(String(v ?? "").trim(), 10);
  return Number.isFinite(n) ? n : fallback;
}

function _mapRelease(build) {
  // Stable anchors:
  // 23H2 => 22631.x
  // 24H2 => 26100.x
  // 25H2 (Insider / early) => 26200.x (and newer)
  if (build >= 26200) return "25H2";
  if (build >= 26100) return "24H2";
  if (build >= 22631) return "23H2";
  return "pre-23H2";
}

function _mapBundle(build) {
  // Your FSE bundles switch at 26100+
  return build >= 26100 ? "modern" : "legacy";
}

async function getWindowsVersion() {
  // Defaults (never leave UI empty)
  const fallbackBuild = _safeInt(String(os.release() || "").split(".")[2], 0);
  const fallback = {
    build: fallbackBuild,
    ubr: null,
    full: String(fallbackBuild || "0"),
    release: _mapRelease(fallbackBuild),
    displayVersion: null,
    productName: null,
    edition: null,
    isInsider: false,
    ring: null,
    branch: null,
    contentType: null,
    channel: _mapBundle(fallbackBuild),
  };

  try {
    const script = `
$ErrorActionPreference = "SilentlyContinue"

$cv = Get-ItemProperty "HKLM:\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion"
$build = [int]$cv.CurrentBuildNumber
$ubr = [int]$cv.UBR
$full = "$build.$ubr"

$display = $cv.DisplayVersion
if (-not $display) { $display = $cv.ReleaseId }

$prod = $cv.ProductName
$edition = $cv.EditionID

$ring = $null
$branch = $null
$contentType = $null

try {
  $sel = Get-ItemProperty "HKLM:\\SOFTWARE\\Microsoft\\WindowsSelfHost\\UI\\Selection"
  $ring = $sel.UIRing
  $branch = $sel.UIBranch
} catch {}

try {
  $app = Get-ItemProperty "HKLM:\\SOFTWARE\\Microsoft\\WindowsSelfHost\\Applicability"
  if (-not $ring) { $ring = $app.Ring }
  if (-not $branch) { $branch = $app.BranchName }
  $contentType = $app.ContentType
} catch {}

$isInsider = $false
if ($ring -or $branch -or $contentType) { $isInsider = $true }

$release = if ($build -ge 26200) { "25H2" } elseif ($build -ge 26100) { "24H2" } elseif ($build -ge 22631) { "23H2" } else { "pre-23H2" }
$bundle  = if ($build -ge 26100) { "modern" } else { "legacy" }

[pscustomobject]@{
  build        = $build
  ubr          = $ubr
  full         = $full
  release      = $release
  displayVersion = $display
  productName  = $prod
  edition      = $edition
  isInsider    = $isInsider
  ring         = $ring
  branch       = $branch
  contentType  = $contentType
  channel      = $bundle
} | ConvertTo-Json -Compress
`;

    const r = await runPS(script);
    const raw = (r.stdout || "").trim();
    const obj = JSON.parse(raw || "{}");

    const build = _safeInt(obj.build, fallback.build);
    const ubr = _safeInt(obj.ubr, null);

    const out = {
      build,
      ubr,
      full: obj.full || (ubr !== null ? `${build}.${ubr}` : String(build)),
      release: obj.release || _mapRelease(build),
      displayVersion: obj.displayVersion || null,
      productName: obj.productName || null,
      edition: obj.edition || null,
      isInsider: !!obj.isInsider,
      ring: obj.ring || null,
      branch: obj.branch || null,
      contentType: obj.contentType || null,
      channel: obj.channel || _mapBundle(build),
    };

    // Guarantee key fields so UI never renders "Unknown"
    if (!out.full) out.full = String(out.build || "0");
    if (!out.channel) out.channel = _mapBundle(out.build || 0);
    if (!out.release) out.release = _mapRelease(out.build || 0);

    return out;
  } catch {
    return fallback;
  }
}

/* ========================================
   UNINSTALL FILES (Not used)
   ======================================== */
async function uninstallFseFiles(log) {
  log("[FSE] No file removal required (Registry Only Mode).");
  return { ok: true, rebootRequired: false };
}

/* ========================================
   REVERT REGISTRY
   ======================================== */
async function uninstallFseRegistry(log, options = {}) {
  const opts = {
    restartExplorer: options.restartExplorer !== false,
    reboot: !!options.reboot
  };

  log("--- REMOVING XBOX FSE REGISTRY ---");

  await ps(
    `
Remove-ItemProperty -Path "HKLM:\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\OEM" -Name "DeviceForm" -ErrorAction SilentlyContinue
"OK"
`,
    log,
    "Remove DeviceForm"
  );

  await ps(
    `
Remove-ItemProperty -Path "HKLM:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Control Panel\\Settings\\UX" -Name "IsConsole" -ErrorAction SilentlyContinue
Remove-ItemProperty -Path "HKLM:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Control Panel\\Settings\\UX" -Name "ShowConsoleFeatures" -ErrorAction SilentlyContinue
"OK"
`,
    log,
    "Remove UX Flags"
  );

  if (opts.restartExplorer) {
    log("[FSE] Restarting Explorer to apply revert without reboot...");
    await ps(
      `
try { Stop-Process -Name explorer -Force -ErrorAction SilentlyContinue } catch {}
Start-Process explorer.exe
"OK"
`,
      log,
      "Explorer Restart"
    );
  }

  const rebootRequired = await checkRebootPending(log);
  if (rebootRequired) log("[FSE] Windows indicates a reboot may be required for ALL revert changes to fully apply.");

  if (opts.reboot) {
    log("[FSE] Reboot requested. System is rebooting...");
    await ps(`shutdown /r /t 3`, log, "Reboot");
    return { ok: true, rebootRequired: true, rebooting: true };
  }

  return { ok: true, rebootRequired, rebooting: false };
}

/* ========================================
   EXPORTS MATCH YOUR MAIN EXACTLY
   ======================================== */
module.exports = {
  installFseFiles,
  applyFseRegistry,
  uninstallFseFiles,
  uninstallFseRegistry,
  getWindowsVersion
};