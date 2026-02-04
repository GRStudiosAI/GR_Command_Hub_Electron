const { runPS } = require("./ps");

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
  uninstallFseRegistry
};