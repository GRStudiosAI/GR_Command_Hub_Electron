const fs = require("fs");
const path = require("path");
const https = require("https");
const { spawn } = require("child_process");

// ---- Helpers ----
function httpGetJson(url, headers = {}) {
  return new Promise((resolve, reject) => {
    const req = https.get(
      url,
      {
        headers: {
          "User-Agent": "GR-Command-Hub",
          Accept: "application/vnd.github+json",
          ...headers,
        },
      },
      (res) => {
        const { statusCode, headers: h } = res;

        // Handle redirects
        if (statusCode && statusCode >= 300 && statusCode < 400 && h.location) {
          res.resume();
          return resolve(httpGetJson(h.location, headers));
        }

        let data = "";
        res.setEncoding("utf8");
        res.on("data", (chunk) => (data += chunk));
        res.on("end", () => {
          if (!statusCode || statusCode < 200 || statusCode >= 300) {
            return reject(new Error(`HTTP ${statusCode} for ${url}: ${data.slice(0, 300)}`));
          }
          try {
            resolve(JSON.parse(data));
          } catch (e) {
            reject(new Error(`Failed to parse JSON from ${url}: ${e.message}`));
          }
        });
      }
    );
    req.on("error", reject);
  });
}

function downloadFile(url, destPath, log = () => {}) {
  return new Promise((resolve, reject) => {
    fs.mkdirSync(path.dirname(destPath), { recursive: true });

    const file = fs.createWriteStream(destPath);

    const doGet = (u) => {
      https
        .get(
          u,
          {
            headers: {
              "User-Agent": "GR-Command-Hub",
              Accept: "application/octet-stream",
            },
          },
          (res) => {
            const { statusCode, headers } = res;
            if (statusCode && statusCode >= 300 && statusCode < 400 && headers.location) {
              res.resume();
              return doGet(headers.location);
            }
            if (!statusCode || statusCode < 200 || statusCode >= 300) {
              res.resume();
              return reject(new Error(`Download failed: HTTP ${statusCode} for ${u}`));
            }
            res.pipe(file);
            file.on("finish", () => {
              file.close(() => {
                log(`[*] Downloaded: ${destPath}`);
                resolve(destPath);
              });
            });
          }
        )
        .on("error", (err) => {
          try {
            fs.unlinkSync(destPath);
          } catch {}
          reject(err);
        });
    };

    log(`[*] Downloading: ${url}`);
    doGet(url);
  });
}

function execFileWait(filePath, args = [], log = () => {}) {
  return new Promise((resolve, reject) => {
    log(`[*] Running: ${filePath} ${args.join(" ")}`.trim());
    const child = spawn(filePath, args, { windowsHide: true });
    child.stdout.on("data", (d) => log(String(d).trim()));
    child.stderr.on("data", (d) => log(String(d).trim()));
    child.on("error", reject);
    child.on("close", (code) => resolve(code ?? 0));
  });
}

function execPowerShellJson(psScript, log = () => {}) {
  return new Promise((resolve, reject) => {
    const args = [
      "-NoProfile",
      "-ExecutionPolicy",
      "Bypass",
      "-Command",
      psScript,
    ];
    const child = spawn("powershell.exe", args, { windowsHide: true });

    let out = "";
    let err = "";
    child.stdout.on("data", (d) => (out += String(d)));
    child.stderr.on("data", (d) => (err += String(d)));

    child.on("error", reject);
    child.on("close", (code) => {
      if (code !== 0) {
        log(`[*] PowerShell error: ${err.trim()}`);
        return reject(new Error(err.trim() || `PowerShell failed with code ${code}`));
      }
      try {
        resolve(JSON.parse(out.trim() || "{}"));
      } catch (e) {
        reject(new Error(`Failed to parse PowerShell JSON: ${e.message}\nOutput: ${out.slice(0, 300)}`));
      }
    });
  });
}

async function findUninstallEntry(displayNameRegex, log = () => {}) {
  // Search both 64-bit and 32-bit uninstall keys.
  const rx = displayNameRegex.toString().replace(/^\//, "").replace(/\/[gimsuy]*$/, "");
  const ps = `
$ErrorActionPreference='SilentlyContinue';
$rx = [regex]::new('${rx}', 'IgnoreCase');
$paths = @(
  'HKLM:\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*',
  'HKLM:\\Software\\WOW6432Node\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*',
  'HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*'
);
$items = foreach($p in $paths){ Get-ItemProperty $p }
$match = $items | Where-Object { $_.DisplayName -and $rx.IsMatch($_.DisplayName) } | Select-Object -First 1 DisplayName,UninstallString,QuietUninstallString
if($match){ $match | ConvertTo-Json -Compress } else { '{}' }
`;
  try {
    const res = await execPowerShellJson(ps, log);
    if (res && res.DisplayName) return res;
  } catch (e) {
    log(`[*] Uninstall lookup failed: ${e.message}`);
  }
  return null;
}

async function wingetAvailable() {
  return new Promise((resolve) => {
    const child = spawn("winget.exe", ["--version"], { windowsHide: true });
    child.on("error", () => resolve(false));
    child.on("close", (code) => resolve(code === 0));
  });
}

async function wingetInstall(id, log = () => {}) {
  // --source winget avoids Store prompts; accept agreements for unattended.
  const args = [
    "install",
    "--id",
    id,
    "--silent",
    "--accept-package-agreements",
    "--accept-source-agreements",
    "--source",
    "winget",
  ];
  const code = await execFileWait("winget.exe", args, log);
  return code;
}

async function wingetUninstall(id, log = () => {}) {
  const args = [
    "uninstall",
    "--id",
    id,
    "--silent",
    "--accept-package-agreements",
    "--accept-source-agreements",
    "--source",
    "winget",
  ];
  const code = await execFileWait("winget.exe", args, log);
  return code;
}

// ---- Tool definitions ----
// You can extend this list later. The renderer page auto-updates.
const TOOL_DEFS = [
  {
    id: "explorerpatcher",
    name: "ExplorerPatcher",
    description: "Classic taskbar + shell tweaks. Downloads latest release automatically.",
    method: "github",
    repo: "valinet/ExplorerPatcher",
    assetMatch: /ep_setup.*\.exe$/i,
    installArgs: ["/SILENT"],
    uninstallDisplayName: /ExplorerPatcher/i,
  },
  {
    id: "7zip",
    name: "7-Zip",
    description: "File archiver. Installs via winget (latest stable).",
    method: "winget",
    wingetId: "7zip.7zip",
    uninstallDisplayName: /7-zip/i,
  },
  {
    id: "notepadpp",
    name: "Notepad++",
    description: "Text editor. Installs via winget (latest stable).",
    method: "winget",
    wingetId: "Notepad++.Notepad++",
    uninstallDisplayName: /Notepad\+\+/i,
  },
];

function getTools() {
  return TOOL_DEFS.map((t) => ({ ...t }));
}

async function isInstalled(tool, log = () => {}) {
  const entry = await findUninstallEntry(tool.uninstallDisplayName, log);
  return !!entry;
}

async function installTool(tool, downloadRoot, log = () => {}) {
  if (tool.method === "winget") {
    const ok = await wingetAvailable();
    if (!ok) throw new Error("winget is not available on this system.");
    const code = await wingetInstall(tool.wingetId, log);
    if (code !== 0) throw new Error(`winget install failed (${code}).`);
    return;
  }

  if (tool.method === "github") {
    const rel = await httpGetJson(`https://api.github.com/repos/${tool.repo}/releases/latest`);
    const assets = Array.isArray(rel.assets) ? rel.assets : [];
    const asset = assets.find((a) => tool.assetMatch.test(a.name || ""));
    if (!asset || !asset.browser_download_url) {
      throw new Error(`Could not find matching release asset for ${tool.repo}.`);
    }
    const dest = path.join(downloadRoot, tool.id, asset.name);
    await downloadFile(asset.browser_download_url, dest, log);

    // Try silent first. If it fails, log and re-run normally.
    let code = await execFileWait(dest, tool.installArgs || [], log);
    if (code !== 0) {
      log(`[*] Silent install returned code ${code}. Trying interactive…`);
      code = await execFileWait(dest, [], log);
    }
    if (code !== 0) throw new Error(`Installer exited with code ${code}.`);
    return;
  }

  throw new Error(`Unknown tool method: ${tool.method}`);
}

async function uninstallTool(tool, log = () => {}) {
  if (tool.method === "winget") {
    const ok = await wingetAvailable();
    if (ok) {
      const code = await wingetUninstall(tool.wingetId, log);
      if (code === 0) return;
      log(`[*] winget uninstall failed (${code}); falling back to registry uninstall string…`);
    }
  }

  const entry = await findUninstallEntry(tool.uninstallDisplayName, log);
  if (!entry) {
    log("[*] Tool not found in uninstall registry.");
    return;
  }

  const cmd = entry.QuietUninstallString || entry.UninstallString;
  if (!cmd) throw new Error("Uninstall command not found.");

  // Execute via cmd.exe so quoted strings are handled.
  const code = await execFileWait("cmd.exe", ["/c", cmd], log);
  if (code !== 0) throw new Error(`Uninstall exited with code ${code}.`);
}

module.exports = {
  getTools,
  isInstalled,
  installTool,
  uninstallTool,
};
