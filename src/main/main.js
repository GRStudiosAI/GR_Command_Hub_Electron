const { app, BrowserWindow, ipcMain, Menu } = require("electron");
const path = require("path");

const { applyTweaks, revertTweaks } = require("./debloater");
const { executeCriticalPurge } = require("./purge");
const {
  installFseFiles,
  applyFseRegistry,
  uninstallFseFiles,
  uninstallFseRegistry,
} = require("./xboxFse");
const { advancedScan, fixRegistryIssues, REG_MAP } = require("./regCleaner");

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

app.whenReady().then(() => {
  createWindow();
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
