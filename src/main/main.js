const { app, BrowserWindow, ipcMain, Menu } = require("electron");
const path = require("path");

const { checkForUpdates } = require("./updater");

const { applyTweaks, revertTweaks } = require("./debloater");
const { executeCriticalPurge } = require("./purge");
const {
  installFseFiles,
  applyFseRegistry,
  uninstallFseFiles,
  uninstallFseRegistry,
} = require("./xboxFse");
const { advancedScan, fixRegistryIssues, REG_MAP } = require("./regCleaner");
const { getTools, isInstalled, installTool, uninstallTool } = require("./toolsInstaller");

let mainWindow = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1160,
    height: 900,
    backgroundColor: "#0b0f14",

    // ✅ Hide native title bar
    frame: false,
    titleBarStyle: "hidden",

    // Icon (dev vs packaged)
    icon: app.isPackaged
      ? path.join(process.resourcesPath, "assets", "logo.ico")
      : path.join(process.cwd(), "assets", "logo.ico"),

    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,

      // ✅ Disable DevTools in production UI
      devTools: false,
    },
  });

  // ✅ Remove menu bar completely
  Menu.setApplicationMenu(null);
  mainWindow.setMenuBarVisibility(false);
  mainWindow.autoHideMenuBar = true;

  mainWindow.loadFile(path.join(__dirname, "../renderer/index.html"));
}

app.whenReady().then(async () => {
  createWindow();
  // Auto-check updates (silent) using Update-Server branch feed
  await checkForUpdates({ silent: true }, (m) => console.log(m));
});

// ----- IPC: FSE Version Detection -----
ipcMain.handle("fse:getVersion", async () => {
  // xboxFse exports getWindowsVersion
  const { getWindowsVersion } = require("./xboxFse");
  return await getWindowsVersion();
});

// ✅ Block DevTools + common inspect shortcuts + new windows
app.on("browser-window-created", (_evt, window) => {
  // Deny window.open / target=_blank
  window.webContents.setWindowOpenHandler(() => ({ action: "deny" }));

  // Prevent keyboard shortcuts (F12, Ctrl+Shift+I/J/C, Ctrl+U)
  window.webContents.on("before-input-event", (event, input) => {
    const key = (input.key || "").toLowerCase();

    const isDevtools =
      input.key === "F12" ||
      (input.control && input.shift && key === "i") ||
      (input.control && input.shift && key === "j") ||
      (input.control && input.shift && key === "c") || // element picker
      (input.control && key === "u"); // view source

    if (isDevtools) event.preventDefault();
  });

  // Also block context menu "Inspect Element"
  window.webContents.on("context-menu", (e) => e.preventDefault());
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

// -------- Window controls (frameless) --------
ipcMain.handle("win:minimize", () => {
  if (mainWindow) mainWindow.minimize();
});

ipcMain.handle("win:maximizeToggle", () => {
  if (!mainWindow) return;
  if (mainWindow.isMaximized()) mainWindow.unmaximize();
  else mainWindow.maximize();
});

ipcMain.handle("win:close", () => {
  if (mainWindow) mainWindow.close();
});

ipcMain.handle("update:check", async () => {
  // Manual check (shows dialogs)
  return await checkForUpdates({ silent: false }, (m) => console.log(m));
});

// ----- IPC: Debloater -----
ipcMain.handle("debloater:apply", async (_evt, tweaks) => {
  const logs = [];
  const log = (m) => logs.push(`[*] ${m}`);
  await applyTweaks(tweaks, log);
  return { ok: true, logs };
});

ipcMain.handle("debloater:revert", async (_evt, tweaks) => {
  const logs = [];
  const log = (m) => logs.push(`[*] ${m}`);
  await revertTweaks(tweaks, log);
  return { ok: true, logs };
});

// ----- IPC: Purge -----
ipcMain.handle("purge:run", async (_evt, opts) => {
  const logs = [];
  const log = (m) => logs.push(`[*] ${m}`);
  await executeCriticalPurge(opts, log);
  return { ok: true, logs };
});

// ----- IPC: FSE -----
ipcMain.handle("fse:install", async (_evt, opts) => {
  const logs = [];
  const log = (m) => logs.push(`[*] ${m}`);
  if (opts.files) await installFseFiles(log);
  if (opts.registry) await applyFseRegistry(log);
  return { ok: true, logs };
});

ipcMain.handle("fse:uninstall", async (_evt, opts) => {
  const logs = [];
  const log = (m) => logs.push(`[*] ${m}`);
  if (opts.files) await uninstallFseFiles(log);
  if (opts.registry) await uninstallFseRegistry(log);
  return { ok: true, logs };
});

// ----- IPC: Registry Cleaner -----
ipcMain.handle("reg:listCategories", async () => Object.keys(REG_MAP));

ipcMain.handle("reg:scan", async (_evt, categories) => {
  const logs = [];
  const log = (m) => logs.push(`[*] ${m}`);
  const count = await advancedScan(categories, log);
  return { ok: true, count, logs };
});

ipcMain.handle("reg:fix", async () => {
  const logs = [];
  const log = (m) => logs.push(`[*] ${m}`);
  const count = await fixRegistryIssues(log);
  return { ok: true, count, logs };
});

// ----- IPC: Tools Installer -----
ipcMain.handle("tools:list", async () => {
  const logs = [];
  const log = (m) => logs.push(String(m));

  const tools = getTools();
  // Compute installed status (best-effort)
  const out = [];
  for (const t of tools) {
    try {
      const installed = await isInstalled(t, log);
      out.push({
        id: t.id,
        name: t.name,
        description: t.description,
        installed,
      });
    } catch (e) {
      out.push({ id: t.id, name: t.name, description: t.description, installed: false });
      log(`[*] Status check failed for ${t.id}: ${e.message}`);
    }
  }
  return { ok: true, tools: out, logs };
});

ipcMain.handle("tools:install", async (_evt, toolId) => {
  const logs = [];
  const log = (m) => logs.push(`[*] ${m}`);
  const tools = getTools();
  const tool = tools.find((t) => t.id === toolId);
  if (!tool) return { ok: false, logs: [`[*] Unknown tool: ${toolId}`] };

  const downloadRoot = path.join(app.getPath("userData"), "downloads");
  await installTool(tool, downloadRoot, log);
  return { ok: true, logs };
});

ipcMain.handle("tools:uninstall", async (_evt, toolId) => {
  const logs = [];
  const log = (m) => logs.push(`[*] ${m}`);
  const tools = getTools();
  const tool = tools.find((t) => t.id === toolId);
  if (!tool) return { ok: false, logs: [`[*] Unknown tool: ${toolId}`] };

  await uninstallTool(tool, log);
  return { ok: true, logs };
});
