const { contextBridge, ipcRenderer, clipboard } = require("electron");

contextBridge.exposeInMainWorld("api", {
  // Window controls (frameless)
  winMinimize: () => ipcRenderer.invoke("win:minimize"),
  winMaximizeToggle: () => ipcRenderer.invoke("win:maximizeToggle"),
  winClose: () => ipcRenderer.invoke("win:close"),

  // Copy / Paste
  copy: (text) => clipboard.writeText(String(text ?? "")),
  paste: () => clipboard.readText(),

  // App actions
  debloaterApply: (tweaks) => ipcRenderer.invoke("debloater:apply", tweaks),
  debloaterRevert: (tweaks) => ipcRenderer.invoke("debloater:revert", tweaks),

  purgeRun: (opts) => ipcRenderer.invoke("purge:run", opts),

  fseInstall: (opts) => ipcRenderer.invoke("fse:install", opts),
  fseUninstall: (opts) => ipcRenderer.invoke("fse:uninstall", opts),

  // FSE version detection (Windows build + bundle channel)
  getWindowsVersion: () => ipcRenderer.invoke("fse:getVersion"),

  regListCategories: () => ipcRenderer.invoke("reg:listCategories"),
  regScan: (cats) => ipcRenderer.invoke("reg:scan", cats),
  regFix: () => ipcRenderer.invoke("reg:fix"),

  // Tools installer (dynamic)
  toolsList: () => ipcRenderer.invoke("tools:list"),
  toolsInstall: (toolId) => ipcRenderer.invoke("tools:install", String(toolId || "")),
  toolsUninstall: (toolId) => ipcRenderer.invoke("tools:uninstall", String(toolId || "")),
});
