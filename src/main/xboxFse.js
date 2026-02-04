/**
 * Xbox Full Screen Experience (FSE) Toolkit
 * © 2026 | All Rights Reserved.
 */

const { runPS } = require("./ps");
const os = require("os");

/* =====================================================
   CONFIG
===================================================== */

// Feature IDs for FSE
const VIVE_IDS = ["52580392", "50902630", "59765208", "54252723", "50552075"];

// Required Windows build for FSE UI + functionality
const FSE_REQUIREMENT = {
  minBuild: 26220,
  minUbr: 7752
};

/* =====================================================
   WINDOWS VERSION SCANNER
===================================================== */

async function getWindowsVersion() {
  // NOTE: Windows 11 still reports NT version 10.0 for compatibility, so DO NOT
  // use os.release() to decide 10 vs 11. We only use it as a last-resort fallback.
  const fallbackBuild = parseInt((os.release().split(".")[2] || "0"), 10) || 0;

  try {
    // PowerShell is the source of truth here.
    // This script is intentionally shaped like the user's Get-WindowsVersionDetails function,
    // but returns JSON for app consumption.
    const script = `
      $ErrorActionPreference = 'SilentlyContinue'

      function Get-WindowsVersionDetails {
        $computerInfo = Get-ComputerInfo | Select-Object WindowsProductName, WindowsVersion, OsVersion, OsHardwareAbstractionLayer, OsName

        $regPath = 'HKLM:\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion'
        $cv = Get-ItemProperty -Path $regPath

        $build = $cv.CurrentBuildNumber
        if ([string]::IsNullOrWhiteSpace($build)) { $build = $cv.CurrentBuild }
        $ubr = $cv.UBR
        if ($null -eq $ubr) { $ubr = 0 }

        $displayVersion = $cv.DisplayVersion
        if ([string]::IsNullOrWhiteSpace($displayVersion)) { $displayVersion = $cv.ReleaseId }

        $productName = $cv.ProductName
        if ([string]::IsNullOrWhiteSpace($productName)) { $productName = $computerInfo.WindowsProductName }

        $edition = $cv.EditionID
        $buildLabEx = $cv.BuildLabEx

        # NT version strings (explicit)
        $nt = [System.Environment]::OSVersion.Version
        $ntVersion = "$($nt.Major).$($nt.Minor)"
        $ntFull = "$($nt.Major).$($nt.Minor).$($nt.Build).$($nt.Revision)"

        # OS major (10 vs 11) derived from build threshold (Win11 = 22000+)
        $osMajor = 10
        try {
          if ([int]$build -ge 22000) { $osMajor = 11 }
        } catch {}

        # Insider detection (best-effort, using both Applicability and UI\\Selection)
        $isInsider = $false
        $ring = ''
        $branch = ''
        $contentType = 'Mainline'

        $appPath = 'HKLM:\\SOFTWARE\\Microsoft\\WindowsSelfHost\\Applicability'
        if (Test-Path $appPath) {
          $app = Get-ItemProperty -Path $appPath
          if ($app) {
            if ($app.Ring) { $ring = $app.Ring }
            if ($app.BranchName) { $branch = $app.BranchName }
            if ($app.ContentType) { $contentType = $app.ContentType }
          }
        }

        $uiPath = 'HKLM:\\SOFTWARE\\Microsoft\\WindowsSelfHost\\UI\\Selection'
        if (Test-Path $uiPath) {
          $ui = Get-ItemProperty -Path $uiPath
          if ($ui) {
            if ($ui.BranchName -and [string]::IsNullOrWhiteSpace($branch)) { $branch = $ui.BranchName }
            if ($ui.Ring -and [string]::IsNullOrWhiteSpace($ring)) { $ring = $ui.Ring }
            if ($ui.ContentType -and $ui.ContentType) { $contentType = $ui.ContentType }
          }
        }

        # Decide insider based on signals (contentType not Mainline OR ring/branch present)
        if (($contentType -and $contentType -ne 'Mainline') -or (-not [string]::IsNullOrWhiteSpace($ring)) -or (-not [string]::IsNullOrWhiteSpace($branch))) {
          if (-not ($contentType -eq 'Mainline' -and [string]::IsNullOrWhiteSpace($ring) -and [string]::IsNullOrWhiteSpace($branch))) {
            $isInsider = $true
          }
        }

        # Channel label
        $channel = 'Live'
        if ($isInsider) {
          $r = ('' + $ring)
          if ($r -match 'Canary') { $channel = 'Insider Canary' }
          elseif ($r -match 'Dev') { $channel = 'Insider Dev' }
          elseif ($r -match 'Beta') { $channel = 'Insider Beta' }
          elseif ($r -match 'ReleasePreview|RP') { $channel = 'Release Preview' }
          else { $channel = 'Insider' }
        }

        # Normalize version fields for UI
        $ver = $displayVersion

        # OS label string (should show 11 when build>=22000)
        $osLabel = 'Windows 10'
        if ($osMajor -ge 11) { $osLabel = 'Windows 11' }
        if ($productName -match 'Windows 11') { $osLabel = 'Windows 11' }
        elseif ($productName -match 'Windows 10') { $osLabel = 'Windows 10' }

        [PSCustomObject]@{
          osLabel        = $osLabel
          osMajor        = $osMajor
          productName    = $productName
          edition        = $edition
          displayVersion = $cv.DisplayVersion
          releaseId      = $cv.ReleaseId
          version        = $ver
          release        = $ver
          build          = [int]$build
          ubr            = [int]$ubr
          full           = ("{0}.{1}" -f $build, $ubr)
          ntVersion      = $ntVersion
          ntFull         = $ntFull
          isInsider      = $isInsider
          ring           = $ring
          branch         = $branch
          contentType    = $contentType
          channel        = $channel
          buildLabEx     = $buildLabEx
        }
      }

      Get-WindowsVersionDetails | ConvertTo-Json -Compress
    `;

    const { stdout } = await runPS(script);
    const obj = JSON.parse(stdout || "{}");

    return {
      // For display, always prefer the real productName when present.
      // For the OS label (10 vs 11), trust osMajor/build threshold.
      osLabel: obj.osLabel || (Number(obj.build || fallbackBuild) >= 22000 ? "Windows 11" : "Windows 10"),
      osMajor: Number(obj.osMajor || (Number(obj.build || fallbackBuild) >= 22000 ? 11 : 10)),
      productName: obj.productName || "",
      edition: obj.edition || "",
      displayVersion: obj.displayVersion || "",
      releaseId: obj.releaseId || "",
      version: obj.version || "",
      release: obj.release || obj.version || "",
      build: Number(obj.build || fallbackBuild),
      ubr: Number(obj.ubr || 0),
      full: obj.full || `${obj.build || fallbackBuild}.${obj.ubr || 0}`,
      ntVersion: obj.ntVersion || "10.0",
      ntFull: obj.ntFull || "",
      channel: obj.channel || "Live",
      isInsider: !!obj.isInsider,
      ring: obj.ring || "",
      branch: obj.branch || "",
      contentType: obj.contentType || ""
    };
  } catch {
    return {
      osLabel: (fallbackBuild >= 22000 ? "Windows 11" : "Windows 10"),
      osMajor: (fallbackBuild >= 22000 ? 11 : 10),
      productName: "",
      edition: "",
      displayVersion: "",
      releaseId: "",
      version: "",
      release: "",
      build: fallbackBuild,
      ubr: 0,
      full: String(fallbackBuild),
      ntVersion: "",
      ntFull: "",
      channel: "Live",
      isInsider: false,
      ring: "",
      branch: "",
      contentType: ""
    };
  }
}

/* =====================================================
   BUILD SUPPORT CHECK
===================================================== */

async function getFseSupport() {

  const version = await getWindowsVersion();

  const supported =
    version.build > FSE_REQUIREMENT.minBuild ||
    (
      version.build === FSE_REQUIREMENT.minBuild &&
      version.ubr >= FSE_REQUIREMENT.minUbr
    );

  return {
    supported,
    version,
    reason: supported
      ? "Supported"
      : `Requires Windows ${FSE_REQUIREMENT.minBuild}.${FSE_REQUIREMENT.minUbr}+`
  };
}

/* =====================================================
   FILE VALIDATION
===================================================== */

async function assertFileExists(path, name) {

  const { stdout } = await runPS(`Test-Path "${path}"`);

  if (stdout.trim().toLowerCase() !== "true") {
    throw new Error(`${name} missing at ${path}`);
  }
}

/* =====================================================
   PHYS PANEL TASK
===================================================== */

async function installPhysPanelTask(log = console.log) {

  const exe = `C:\\Hidden Features\\PhysPanelCS.exe`;

  await assertFileExists(exe, "PhysPanelCS");

  log("[*] Installing PhysPanel override task...");

  await runPS(
    `schtasks /Create /TN "XboxFSE-PhysPanelCS" /SC ONSTART /RL HIGHEST /RU "SYSTEM" /TR '"${exe}"' /F`
  );

  await runPS(`schtasks /Run /TN "XboxFSE-PhysPanelCS"`);

  log("[+] PhysPanel scheduled task installed.");
}

/* =====================================================
   ENABLE VIVETOOL IDS
===================================================== */

async function installFseFiles(log = console.log) {

  const support = await getFseSupport();
  if (!support.supported) {
    log(`[!] ${support.reason}`);
    return { ok: false };
  }

  const viveExe = "C:\\Hidden Features\\vivetool.exe";

  await assertFileExists(viveExe, "ViVeTool");

  log(`[*] Enabling FSE Feature IDs...`);

  for (const id of VIVE_IDS) {

    try {

      const cmd =
        `& "${viveExe}" /enable /id:${id} /variant:1 /store:both /priority:service 2>&1`;

      const res = await runPS(cmd);

      log(`[+] ID ${id} applied`);

    } catch (err) {

      log(`[!] Failed ID ${id}`);
    }
  }

  return { ok: true };
}

/* =====================================================
   REGISTRY APPLY
===================================================== */

async function applyFseRegistry(log = console.log) {

  const support = await getFseSupport();
  if (!support.supported) {
    log(`[!] ${support.reason}`);
    return { ok: false };
  }

  log("[*] Applying Console Registry...");

  const script = `

    New-Item "HKLM:\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\OEM" -Force | Out-Null
    Set-ItemProperty "HKLM:\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\OEM" DeviceForm 46 -Type DWord

    New-Item "HKLM:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Control Panel\\Settings\\UX" -Force | Out-Null
    Set-ItemProperty "HKLM:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Control Panel\\Settings\\UX" IsConsole 1 -Type DWord
    Set-ItemProperty "HKLM:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Control Panel\\Settings\\UX" ShowConsoleFeatures 1 -Type DWord

    New-Item "HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\GamingConfiguration" -Force | Out-Null
    Set-ItemProperty "HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\GamingConfiguration" IsGamingPostureEnabled 1 -Type DWord

  `;

  await runPS(script);

  await installPhysPanelTask(log);

  log("[+] Registry optimized");

  return { ok: true };
}

/* =====================================================
   DISABLE / CLEANUP
===================================================== */

async function removeFse(log = console.log) {

  log("[*] Removing FSE...");

  await runPS(`schtasks /Delete /TN "XboxFSE-PhysPanelCS" /F`);

  log("[+] FSE removed.");
}

/* =====================================================
   EXPORTS
===================================================== */

module.exports = {

  getWindowsVersion,
  getFseSupport,
  installFseFiles,
  applyFseRegistry,
  removeFse
};