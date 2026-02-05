const { app, dialog, shell } = require("electron");
const https = require("https");
const fs = require("fs");
const path = require("path");

/**
 * Minimal updater for GR Command Hub
 * - Reads update feed JSON from Update-Server branch (raw.githubusercontent.com)
 * - Compares against app.getVersion()
 * - Prompts user to download installer/portable
 *
 * Feed format (latest.json):
 * {
 *   "version": "0.2.0",
 *   "channel": "stable",
 *   "notes": "...",
 *   "installer": "https://raw.githubusercontent.com/<ORG>/<REPO>/Update-Server/v0.2.0/GR_Command_Hub_Setup.exe",
 *   "portable": "https://raw.githubusercontent.com/<ORG>/<REPO>/Update-Server/v0.2.0/GR_Command_Hub_Portable.exe"
 * }
 */

function readConfig() {
  // Prefer project root config in dev, userData config in prod, fallback to defaults
  const defaults = {
    updateServer: "https://raw.githubusercontent.com/<USER_OR_ORG>/<REPO>/Update-Server/latest.json",
    channel: "stable",
    checkOnStartup: true,
    prefer: "installer" // installer | portable
  };

  const candidates = [
    // dev: repo root
    path.join(process.cwd(), "update.config.json"),
    // packaged: alongside resources (if you ship it)
    path.join(process.resourcesPath || "", "update.config.json"),
    // user override
    path.join(app.getPath("userData"), "update.config.json"),
  ].filter(Boolean);

  for (const p of candidates) {
    try {
      if (fs.existsSync(p)) {
        const cfg = JSON.parse(fs.readFileSync(p, "utf8"));
        return { ...defaults, ...cfg };
      }
    } catch {
      // ignore malformed config
    }
  }
  return defaults;
}

function httpsGetJson(url) {
  return new Promise((resolve, reject) => {
    https
      .get(url, { headers: { "User-Agent": "GR-Command-Hub" } }, (res) => {
        let data = "";
        res.on("data", (chunk) => (data += chunk));
        res.on("end", () => {
          if (res.statusCode && res.statusCode >= 400) {
            return reject(new Error(`HTTP ${res.statusCode} for ${url}`));
          }
          try {
            resolve(JSON.parse(data));
          } catch (e) {
            reject(new Error(`Invalid JSON from update server: ${e.message}`));
          }
        });
      })
      .on("error", reject);
  });
}

function normalizeVersion(v) {
  return String(v || "").trim().replace(/^v/i, "");
}

function cmpVersions(a, b) {
  const pa = normalizeVersion(a).split(".").map((n) => parseInt(n, 10) || 0);
  const pb = normalizeVersion(b).split(".").map((n) => parseInt(n, 10) || 0);
  const len = Math.max(pa.length, pb.length);
  for (let i = 0; i < len; i++) {
    const da = pa[i] || 0;
    const db = pb[i] || 0;
    if (da > db) return 1;
    if (da < db) return -1;
  }
  return 0;
}

async function checkForUpdates({ silent = true } = {}, log = null) {
  const cfg = readConfig();

  // If still placeholder, don't annoy the user.
  if (String(cfg.updateServer || "").includes("<USER_OR_ORG>") || String(cfg.updateServer || "").includes("<REPO>")) {
    if (!silent) {
      await dialog.showMessageBox({
        type: "warning",
        title: "Update Server Not Configured",
        message: "Update server URL is not configured yet.",
        detail:
          "Edit update.config.json and set updateServer to your GitHub raw URL:\n" +
          "https://raw.githubusercontent.com/<ORG>/<REPO>/Update-Server/latest.json",
        buttons: ["OK"],
      });
    }
    return { ok: false, reason: "not_configured" };
  }

  try {
    const feed = await httpsGetJson(cfg.updateServer);
    const current = normalizeVersion(app.getVersion());
    const latest = normalizeVersion(feed.version);

    if (!latest) return { ok: false, reason: "bad_feed" };

    if (cmpVersions(latest, current) <= 0) {
      if (!silent) {
        await dialog.showMessageBox({
          type: "info",
          title: "No Updates",
          message: `You're up to date (v${current}).`,
          buttons: ["OK"],
        });
      }
      return { ok: true, updateAvailable: false, current, latest };
    }

    const prefer = (cfg.prefer || "installer").toLowerCase() === "portable" ? "portable" : "installer";
    const url = feed[prefer] || feed.installer || feed.portable;

    const buttons = url ? ["Download", "Later"] : ["OK"];
    const detail = (feed.notes ? String(feed.notes) : "").trim();

    const r = await dialog.showMessageBox({
      type: "info",
      title: "Update Available",
      message: `Update available: v${latest} (you have v${current}).`,
      detail: detail || "A new version is available.",
      buttons,
      defaultId: 0,
      cancelId: 1,
      noLink: true,
    });

    if (r.response === 0 && url) {
      await shell.openExternal(String(url));
    }
    return { ok: true, updateAvailable: true, current, latest, url };
  } catch (e) {
    if (log) log(`[Updater] ${e.message}`);
    if (!silent) {
      await dialog.showMessageBox({
        type: "error",
        title: "Update Check Failed",
        message: "Could not check for updates.",
        detail: e.message,
        buttons: ["OK"],
      });
    }
    return { ok: false, reason: "error", error: e.message };
  }
}

module.exports = { checkForUpdates, readConfig };
