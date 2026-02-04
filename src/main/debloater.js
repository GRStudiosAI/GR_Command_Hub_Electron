const { runPS } = require("./ps");

/**
 * Debloater / Tweak Engine (PS 5.1 compatible)
 * - Robust logging
 * - Continues on errors
 * - Creates registry keys before editing
 * - Avoids CMD-only syntax inside PowerShell
 *
 * NOTE: Some actions are not fully reversible (ex: removing Appx packages).
 * This file logs those cases clearly.
 */

async function ps(cmd, log, label = "") {
  try {
    const { stdout, stderr } = await runPS(cmd);
    if (stderr && stderr.trim()) log(`[PS STDERR] ${stderr.trim()}`);
    if (stdout && stdout.trim()) log(label ? `${label}: ${stdout.trim()}` : stdout.trim());
    return { ok: true, stdout: stdout || "", stderr: stderr || "" };
  } catch (e) {
    log(`[X] ${label || "Command failed"}: ${e.message}`);
    return { ok: false, error: e };
  }
}

function psEnsureRegKey(hkPath) {
  // Creates key if missing (PowerShell Registry provider path required)
  return `
$k = "${hkPath}"
if (!(Test-Path $k)) { New-Item -Path $k -Force | Out-Null }
`;
}

async function applyTweaks(tweaks, log) {
  log("--- INITIATING FULL SYSTEM HARDENING ---");
  let needsExplorerRestart = false;

  // --- 0) Restore point ---
  if (tweaks.restore_point) {
    log("[*] Creating System Restore Point...");
    // Restore points can be blocked by policy/edition; log but continue
    await ps(
      `
try {
  Enable-ComputerRestore -Drive "C:\\\\" | Out-Null
  Checkpoint-Computer -Description "GR_Full_Debloat" -RestorePointType "MODIFY_SETTINGS" | Out-Null
  "RESTORE_POINT_OK"
} catch {
  "RESTORE_POINT_FAILED: " + $_.Exception.Message
}
`,
      log,
      "Restore Point"
    );
  }

  // --- 1) Classic context menu (Win11) ---
  if (tweaks.classic_context_menu) {
    log("[*] Applying Classic Right-Click Menu...");
    // reg.exe is fine here and reliable
    await ps(
      'reg add "HKCU\\Software\\Classes\\CLSID\\{86ca1aa0-34aa-4e8b-a509-50c905bae2a2}\\InprocServer32" /ve /d "" /f',
      log,
      "Classic Context Menu"
    );
    needsExplorerRestart = true;
  }

  // --- 2) Telemetry / DiagTrack ---
  if (tweaks.disable_telemetry) {
    log("[*] Hard-locking Telemetry & DiagTrack...");

    // Ensure policy keys exist then set values
    await ps(
      `
${psEnsureRegKey("HKLM:\\SOFTWARE\\Policies\\Microsoft\\Windows\\DataCollection")}
Set-ItemProperty -Path "HKLM:\\SOFTWARE\\Policies\\Microsoft\\Windows\\DataCollection" -Name "AllowTelemetry" -Type DWord -Value 0 -Force

${psEnsureRegKey("HKLM:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Policies\\DataCollection")}
Set-ItemProperty -Path "HKLM:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Policies\\DataCollection" -Name "AllowTelemetry" -Type DWord -Value 0 -Force

try { Stop-Service -Name "DiagTrack" -Force -ErrorAction Stop } catch {}
try { Set-Service -Name "DiagTrack" -StartupType Disabled -ErrorAction Stop } catch {}
"TELEMETRY_LOCKED"
`,
      log,
      "Telemetry"
    );
  }

  // --- 3) Disable location privacy ---
  if (tweaks.disable_location) {
    log("[*] Disabling System Location Privacy...");

    await ps(
      `
${psEnsureRegKey("HKLM:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\CapabilityAccessManager\\ConsentStore\\location")}
Set-ItemProperty -Path "HKLM:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\CapabilityAccessManager\\ConsentStore\\location" -Name "Value" -Type String -Value "Deny" -Force
Set-ItemProperty -Path "HKLM:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\CapabilityAccessManager\\ConsentStore\\location" -Name "SensorPermissionState" -Type DWord -Value 0 -Force
"LOCATION_DISABLED"
`,
      log,
      "Location"
    );
  }

  // --- 4) Disable GameDVR / Game Bar hooks ---
  // IMPORTANT: Removing the Game Bar app is not fully reversible without reinstalling from Store.
  if (tweaks.disable_gamedvr) {
    log("[*] Disabling GameDVR policy...");

    await ps(
      `
${psEnsureRegKey("HKLM:\\SOFTWARE\\Policies\\Microsoft\\Windows\\GameDVR")}
Set-ItemProperty -Path "HKLM:\\SOFTWARE\\Policies\\Microsoft\\Windows\\GameDVR" -Name "AllowGameDVR" -Type DWord -Value 0 -Force
"GameDVR_POLICY_SET"
`,
      log,
      "GameDVR"
    );

    // Optional removal (only if you REALLY want it). Your old code always removed it.
    // Keep it enabled by default? If you want removal, set tweaks.remove_gamebar = true in your UI.
    if (tweaks.remove_gamebar) {
      log("[!] Removing Xbox Game Bar package (not easily reversible)...");
      await ps(
        `
$pkg = Get-AppxPackage *Microsoft.XboxGamingOverlay* -AllUsers
if ($pkg) {
  try { $pkg | Remove-AppxPackage -AllUsers -ErrorAction SilentlyContinue } catch {}
  "GAMEBAR_REMOVE_ATTEMPTED"
} else {
  "GAMEBAR_NOT_FOUND"
}
`,
        log,
        "Game Bar Removal"
      );
    }
  }

  // --- 5) Set non-essential services to Manual ---
  if (tweaks.set_services_manual) {
    log("[*] Setting non-essential services to Manual...");
    const services = ["SysMain", "MapsBroker", "TabletInputService", "WbioSrvc"];

    for (const svc of services) {
      await ps(
        `
try {
  $s = Get-Service -Name "${svc}" -ErrorAction Stop
  Set-Service -Name "${svc}" -StartupType Manual -ErrorAction Stop
  "OK"
} catch {
  "MISSING_OR_DENIED"
}
`,
        log,
        `Service ${svc}`
      );
    }
  }

  // --- 6) Disable IPv6 (DisabledComponents) ---
  if (tweaks.disable_ipv6) {
    log("[*] Disabling IPv6 (DisabledComponents=255)...");
    await ps(
      'reg add "HKLM\\SYSTEM\\CurrentControlSet\\Services\\Tcpip6\\Parameters" /v DisabledComponents /t REG_DWORD /d 255 /f',
      log,
      "IPv6"
    );
  }

  // --- 7) Temp cleanup / Disk cleanup ---
  if (tweaks.run_disk_cleanup || tweaks.delete_temp) {
    log("[*] Deep Cleaning System Temp & Disk...");

    // Use Remove-Item (PowerShell-native) and clear multiple temp locations safely
    await ps(
      `
$targets = @(
  $env:TEMP,
  $env:TMP,
  (Join-Path $env:SystemRoot "Temp")
) | Where-Object { $_ -and (Test-Path $_) } | Select-Object -Unique

foreach ($t in $targets) {
  try {
    Remove-Item -Path (Join-Path $t "*") -Recurse -Force -ErrorAction SilentlyContinue
    "CLEARED: $t"
  } catch {
    "FAILED: $t"
  }
}
`,
      log,
      "Temp Cleanup"
    );

    if (tweaks.run_disk_cleanup) {
      // cleanmgr needs sageset configured to do much; still run it
      await ps(`Start-Process -FilePath "cleanmgr.exe" -ArgumentList "/sagerun:1" -Wait`, log, "Disk Cleanup");
    }
  }

  // --- 8) Remove OneDrive ---
  if (tweaks.remove_onedrive) {
    log("[*] Force-Uninstalling OneDrive...");

    await ps(
      `
try { Stop-Process -Name "OneDrive" -Force -ErrorAction SilentlyContinue } catch {}
$syswow = Join-Path $env:WINDIR "SysWOW64\\OneDriveSetup.exe"
$system32 = Join-Path $env:WINDIR "System32\\OneDriveSetup.exe"

if (Test-Path $syswow) {
  Start-Process -FilePath $syswow -ArgumentList "/uninstall" -Wait
  "UNINSTALL_OK: SysWOW64"
} elseif (Test-Path $system32) {
  Start-Process -FilePath $system32 -ArgumentList "/uninstall" -Wait
  "UNINSTALL_OK: System32"
} else {
  "OneDriveSetup.exe not found"
}
`,
      log,
      "OneDrive"
    );
  }

  // --- 9) Disable background apps ---
  if (tweaks.disable_background_apps) {
    log("[*] Blocking Apps from running in background...");
    await ps(
      `
${psEnsureRegKey("HKLM:\\SOFTWARE\\Policies\\Microsoft\\Windows\\AppPrivacy")}
Set-ItemProperty -Path "HKLM:\\SOFTWARE\\Policies\\Microsoft\\Windows\\AppPrivacy" -Name "LetAppsRunInBackground" -Type DWord -Value 2 -Force
"BACKGROUND_APPS_BLOCKED"
`,
      log,
      "Background Apps"
    );
  }

  // --- Restart Explorer if needed ---
  if (needsExplorerRestart) {
    log("[!] Restarting Windows Explorer to apply changes...");
    await ps(
      `
try { Stop-Process -Name "explorer" -Force -ErrorAction SilentlyContinue } catch {}
Start-Process "explorer.exe"
"EXPLORER_RESTARTED"
`,
      log,
      "Explorer Restart"
    );
  }

  log("--- ALL TWEAKS APPLIED (WITH LOGGED RESULTS) ---");
}

async function revertTweaks(tweaks, log) {
  log("--- RESTORING WINDOWS DEFAULTS ---");
  let needsExplorerRestart = false;

  // --- Classic context menu revert ---
  if (tweaks.classic_context_menu) {
    log("[!] Reverting Context Menu...");
    await ps('reg delete "HKCU\\Software\\Classes\\CLSID\\{86ca1aa0-34aa-4e8b-a509-50c905bae2a2}" /f', log, "Context Menu Revert");
    needsExplorerRestart = true;
  }

  // --- IPv6 revert ---
  if (tweaks.disable_ipv6) {
    log("[!] Re-enabling IPv6...");
    await ps('reg delete "HKLM\\SYSTEM\\CurrentControlSet\\Services\\Tcpip6\\Parameters" /v DisabledComponents /f', log, "IPv6 Revert");
  }

  // --- Telemetry revert ---
  if (tweaks.disable_telemetry) {
    log("[!] Re-enabling Telemetry...");

    // Re-enable service, and remove policy values we added (safer than guessing original)
    await ps(
      `
try { Set-Service -Name "DiagTrack" -StartupType Automatic -ErrorAction SilentlyContinue } catch {}
try { Start-Service -Name "DiagTrack" -ErrorAction SilentlyContinue } catch {}

try { Remove-ItemProperty -Path "HKLM:\\SOFTWARE\\Policies\\Microsoft\\Windows\\DataCollection" -Name "AllowTelemetry" -ErrorAction SilentlyContinue } catch {}
try { Remove-ItemProperty -Path "HKLM:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Policies\\DataCollection" -Name "AllowTelemetry" -ErrorAction SilentlyContinue } catch {}

"TELEMETRY_REVERT_ATTEMPTED"
`,
      log,
      "Telemetry Revert"
    );
  }

  // --- Location revert ---
  if (tweaks.disable_location) {
    log("[!] Re-enabling Location...");
    await ps(
      `
try {
  Set-ItemProperty -Path "HKLM:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\CapabilityAccessManager\\ConsentStore\\location" -Name "Value" -Type String -Value "Allow" -Force
  Set-ItemProperty -Path "HKLM:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\CapabilityAccessManager\\ConsentStore\\location" -Name "SensorPermissionState" -Type DWord -Value 1 -Force
  "LOCATION_REVERT_OK"
} catch {
  "LOCATION_REVERT_FAILED"
}
`,
      log,
      "Location Revert"
    );
  }

  // --- GameDVR revert ---
  if (tweaks.disable_gamedvr) {
    log("[!] Re-enabling GameDVR policy...");
    await ps(
      `
try { Remove-ItemProperty -Path "HKLM:\\SOFTWARE\\Policies\\Microsoft\\Windows\\GameDVR" -Name "AllowGameDVR" -ErrorAction SilentlyContinue } catch {}
"GameDVR_POLICY_REMOVED"
`,
      log,
      "GameDVR Revert"
    );

    if (tweaks.remove_gamebar) {
      log("[!] NOTE: Game Bar removal is not auto-reversible. Reinstall from Microsoft Store if needed.");
    }
  }

  // --- Background apps revert ---
  if (tweaks.disable_background_apps) {
    log("[!] Re-enabling background apps...");
    await ps(
      `
try { Remove-ItemProperty -Path "HKLM:\\SOFTWARE\\Policies\\Microsoft\\Windows\\AppPrivacy" -Name "LetAppsRunInBackground" -ErrorAction SilentlyContinue } catch {}
"BACKGROUND_APPS_POLICY_REMOVED"
`,
      log,
      "Background Apps Revert"
    );
  }

  // --- Explorer restart if needed ---
  if (needsExplorerRestart) {
    log("[!] Restarting Windows Explorer to apply changes...");
    await ps(
      `
try { Stop-Process -Name "explorer" -Force -ErrorAction SilentlyContinue } catch {}
Start-Process "explorer.exe"
"EXPLORER_RESTARTED"
`,
      log,
      "Explorer Restart"
    );
  }

  log("--- SYSTEM DEFAULTS RESTORED (WITH LOGGED RESULTS) ---");
}

module.exports = { applyTweaks, revertTweaks };