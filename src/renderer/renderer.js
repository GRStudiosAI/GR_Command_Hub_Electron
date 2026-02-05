// src/renderer/renderer.js

if (!window.api) {
  alert("window.api missing → preload.js not loaded. Check src/main/main.js preload path.");
  throw new Error("window.api missing");
}

const terminal = document.getElementById("terminal");
const view = document.getElementById("view");

function log(line) {
  terminal.textContent += line + "\n";
  terminal.scrollTop = terminal.scrollHeight;
}


function showToast(message, type = "ok", ms = 2200) {
  const host = document.getElementById("toastHost");
  if (!host) return;

  const el = document.createElement("div");
  el.className = `toast ${type}`;
  el.textContent = message;
  host.appendChild(el);

  setTimeout(() => {
    try { el.remove(); } catch {}
  }, ms);
}

async function runUpdateCheck() {
  const btn = document.getElementById("btnCheckUpdates");
  const status = document.getElementById("updateStatus");
  if (!btn) return;

  btn.disabled = true;
  if (status) status.textContent = "Checking…";

  try {
    const res = await window.api.updateCheck();
    // res: { status: "upToDate" | "updateAvailable" | "notConfigured" | "error", ... }
    if (res && res.status === "upToDate") {
      if (status) status.textContent = "Up to date.";
      showToast("You’re up to date.", "ok");
    } else if (res && res.status === "updateAvailable") {
      if (status) status.textContent = `Update available: v${res.latest || res.version || "?"}`;
      // main process shows dialog; toast is just a hint
      showToast(`Update available: v${res.latest || res.version || "?"}`, "warn", 3200);
    } else if (res && res.status === "notConfigured") {
      if (status) status.textContent = "Updater not configured.";
      showToast("Updater not configured.", "err", 3200);
    } else if (res && res.status === "error") {
      if (status) status.textContent = "Update check failed.";
      showToast("Update check failed.", "err", 3200);
    } else {
      if (status) status.textContent = "";
    }
  } catch (e) {
    if (status) status.textContent = "Update check failed.";
    showToast("Update check failed.", "err", 3200);
  } finally {
    btn.disabled = false;
    setTimeout(() => { if (status && status.textContent === "Checking…") status.textContent = ""; }, 800);
  }
}

function initUpdateButton() {
  const btn = document.getElementById("btnCheckUpdates");
  if (!btn) return;
  btn.addEventListener("click", () => runUpdateCheck());
}


function setActive(viewName) {
  document.querySelectorAll(".nav").forEach((b) => {
    b.classList.toggle("active", b.dataset.view === viewName);
  });
}

function checkbox(label, id, checked = false) {
  const row = document.createElement("label");
  row.className = "checkRow";
  row.innerHTML = `<input type="checkbox" id="${id}" ${checked ? "checked" : ""}/> <span>${label}</span>`;
  return row;
}

function button(text, cls, onClick) {
  const b = document.createElement("button");
  b.className = `btn ${cls || ""}`;
  b.textContent = text;
  b.onclick = onClick;
  return b;
}

function readChecks(ids) {
  const out = {};
  for (const id of ids) out[id] = !!document.getElementById(id)?.checked;
  return out;
}

async function runAndPrint(promise) {
  try {
    const res = await promise;
    for (const l of res.logs || []) log(l);
    if (res.message) log(res.message);
    return res;
  } catch (e) {
    log(`[*] ERROR: ${e?.message || e}`);
    console.error(e);
  }
}

// ---------------------------
// FSE UI: Windows build + bundle detection
// ---------------------------
async function loadFseVersionInfo() {
  const elBuild = document.getElementById("uiWinBuild");
  const elChan = document.getElementById("uiWinChannel");

  // If the FSE view isn't mounted yet, do nothing.
  if (!elBuild || !elChan) return;

  try {
    const v = await window.api.getWindowsVersion();
    // v: { build, ubr, full, release, displayVersion, productName, edition, channel, isInsider, ring, branch }

    // Patch: FSE version guard
    // Disable the FSE registry checkbox when Windows is below 26220.7752.
    // (Do not change scanner or UI structure.)
    const fseReg = document.getElementById("fse_reg");
    if (fseReg) {
      const build = Number(v.build || 0);
      const ubr = Number(v.ubr || 0);
      const supported = build > 26220 || (build === 26220 && ubr >= 7752);
      fseReg.disabled = !supported;
      if (!supported) fseReg.checked = false;
    }

    // Also disable the Hidden Features folder install checkbox on unsupported builds.
    const fseFiles = document.getElementById("fse_files");
    if (fseFiles) {
      const build = Number(v.build || 0);
      const ubr = Number(v.ubr || 0);
      const supported = build > 26220 || (build === 26220 && ubr >= 7752);
      fseFiles.disabled = !supported;
      if (!supported) fseFiles.checked = false;
    }

    const releaseText = v.release ? `${v.release}` : (v.displayVersion || "");
    const insiderText = v.isInsider ? "Insider" : "Live";

    const full = v.full || (v.build ? String(v.build) : "");
    elBuild.textContent = releaseText
      ? `Build: ${full} (${releaseText} • ${insiderText})`
      : `Build: ${full} (${insiderText})`;

    const bundle = String(v.channel || "").toUpperCase() || "LEGACY";
    const ringBits = [v.ring, v.branch].filter(Boolean).join(" | ");
    elChan.textContent = ringBits
      ? `Bundle: ${bundle} — ${ringBits}`
      : `Bundle: ${bundle}`;
  } catch (err) {
    elBuild.textContent = "Build: (detection error)";
    elChan.textContent = "Bundle: (detection error)";
    console.error(err);
  }
}


async function loadSidebarVersionInfo() {
  const elOs = document.getElementById("winOs");
  const elOsNum = document.getElementById("winOsNum");
  const elNt = document.getElementById("winNt");
  const elVer = document.getElementById("winVer");
  const elChan = document.getElementById("winChan");
  const elBuild = document.getElementById("winBuild");

  if (!elOs || !elVer || !elChan || !elBuild) return;

  try {
    const v = await window.api.getWindowsVersion();

    // -----------------------------
    // BUILD NUMBER (source of truth)
    // -----------------------------
    const buildNum =
      Number(v.build) ||
      Number(String(v.full || "").split(".")[0]) ||
      0;

    // -----------------------------
    // OS MAJOR (10 vs 11)
    // -----------------------------
    const osMajor = buildNum >= 22000 ? "11" : (buildNum > 0 ? "10" : "—");
    if (elOsNum) elOsNum.textContent = `OS: ${osMajor}`;

    // -----------------------------
    // EDITION (Pro / Home / etc.)
    // -----------------------------
    let edition = "";
    if (v.edition && String(v.edition).trim()) {
      edition = String(v.edition).trim();
    } else if (v.productName) {
      if (/enterprise/i.test(v.productName)) edition = "Enterprise";
      else if (/education/i.test(v.productName)) edition = "Education";
      else if (/pro/i.test(v.productName)) edition = "Pro";
      else if (/home/i.test(v.productName)) edition = "Home";
    }

    // -----------------------------
    // WINDOWS DISPLAY NAME
    // (DO NOT trust ProductName)
    // -----------------------------
    const windowsName = `Windows ${osMajor}${edition ? " " + edition : ""}`.trim();
    elOs.textContent = `Windows: ${windowsName}`;

    // -----------------------------
    // NT VERSION
    // -----------------------------
    const nt = (v.ntVersion && String(v.ntVersion).trim())
      ? String(v.ntVersion).trim()
      : "10.0";

    const ntFull = (v.ntFull && String(v.ntFull).trim())
      ? String(v.ntFull).trim()
      : "";

    elNt.textContent = ntFull
      ? `NT: ${nt} (${ntFull})`
      : `NT: ${nt}`;

    // -----------------------------
    // DISPLAY VERSION (25H2 / 24H2)
    // -----------------------------
    const ver = (v.version && String(v.version).trim())
      ? String(v.version).trim()
      : "—";
    elVer.textContent = `Version: ${ver}`;

    // -----------------------------
    // CHANNEL / INSIDER
    // -----------------------------
    let chan = v.channel || "Live";
    const extras = [];
    if (v.branch) extras.push(v.branch);
    if (v.ring && !String(v.ring).toLowerCase().includes("unknown")) {
      extras.push(v.ring);
    }
    if (extras.length) chan += ` (${extras.join(", ")})`;
    elChan.textContent = `Channel: ${chan}`;

    // -----------------------------
    // BUILD (build.UBR preferred)
    // -----------------------------
    const fullBuild =
      (v.full && String(v.full).trim())
        ? String(v.full).trim()
        : (v.build && v.ubr != null)
          ? `${v.build}.${v.ubr}`
          : (v.build ? String(v.build) : "—");

    elBuild.textContent = `Build: ${fullBuild}`;

  } catch (err) {
    console.error("Windows scanner failed:", err);
    elOs.textContent = "Windows: —";
    if (elOsNum) elOsNum.textContent = "OS: —";
    elNt.textContent = "NT: —";
    elVer.textContent = "Version: —";
    elChan.textContent = "Channel: —";
    elBuild.textContent = "Build: —";
  }
}


/* -------- Copy / Paste support --------
   - Copy selected text to clipboard
   - Paste into focused input/textarea
*/
document.addEventListener("keydown", (e) => {
  const key = e.key.toLowerCase();

  // Copy
  if (e.ctrlKey && key === "c") {
    const sel = window.getSelection()?.toString();
    if (sel && sel.trim()) window.api.copy(sel);
  }

  // Paste
  if (e.ctrlKey && key === "v") {
    const text = window.api.paste();
    const el = document.activeElement;

    // Only paste into editable elements
    if (el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA")) {
      const start = el.selectionStart ?? el.value.length;
      const end = el.selectionEnd ?? el.value.length;
      el.value = el.value.slice(0, start) + text + el.value.slice(end);
      el.selectionStart = el.selectionEnd = start + text.length;
      e.preventDefault();
    }
  }
});

/* -------- Window controls (frameless) -------- */
document.getElementById("btnMin").onclick = () => window.api.winMinimize();
document.getElementById("btnMax").onclick = () => window.api.winMaximizeToggle();
document.getElementById("btnClose").onclick = () => window.api.winClose();

/* -------- Terminal controls -------- */
document.getElementById("btnClearLog").onclick = () => (terminal.textContent = "");
document.getElementById("btnCopyLog").onclick = async () => {
  const text = terminal.textContent || "";
  if (!text.trim()) return;

  // Primary: Electron clipboard bridge
  try {
    window.api.copy(text);
  } catch {}

  // Fallback: Web clipboard API (can be more reliable on some setups)
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
    }
  } catch {}

  // Give user feedback in the terminal
  terminal.textContent += "\n[*] Copied terminal log to clipboard.";
  terminal.scrollTop = terminal.scrollHeight;
};

/* -------- Views -------- */
function renderDebloater() {
  setActive("debloater");
  view.innerHTML = "";

  const card = document.createElement("div");
  card.className = "card";
  card.innerHTML = `
    <div class="h1">WINDOWS SYSTEM OPTIMIZATION</div>
    <div class="p">Select tweaks, then RUN. Undo restores selected items.</div>
  `;

  const essential = document.createElement("div");
  essential.innerHTML = `<div class="sectionTitle">Essential Tweaks</div>`;
  const essentialIds = [
    ["Create Restore Point", "restore_point"],
    ["Delete Temporary Files", "delete_temp"],
    ["Disable Telemetry", "disable_telemetry"],
    ["Disable GameDVR", "disable_gamedvr"],
    ["Disable Location Tracking", "disable_location"],
    ["Run Disk Cleanup", "run_disk_cleanup"],
    ["Set Services to Manual", "set_services_manual"],
  ];
  const essentialGrid = document.createElement("div");
  essentialGrid.className = "grid2";
  essentialIds.forEach(([t, k]) => essentialGrid.appendChild(checkbox(t, k, false)));
  essential.appendChild(essentialGrid);

  const advanced = document.createElement("div");
  advanced.innerHTML = `<div class="sectionTitle">Advanced Tweaks - CAUTION</div>`;
  const advIds = [
    ["Disable Background Apps", "disable_background_apps"],
    ["Disable IPv6", "disable_ipv6"],
    ["Uninstall OneDrive", "remove_onedrive"],
    ["Set Classic Right-Click Menu", "classic_context_menu"],
  ];
  const advancedGrid = document.createElement("div");
  advancedGrid.className = "grid2";
  advIds.forEach(([t, k]) => advancedGrid.appendChild(checkbox(t, k, false)));
  advanced.appendChild(advancedGrid);

  const btnRow = document.createElement("div");
  btnRow.className = "btnRow";

  btnRow.appendChild(
    button("RUN TWEAKS", "primary", async () => {
      log("[*] Running tweaks...");
      const tweaks = readChecks([...essentialIds, ...advIds].map((x) => x[1]));
      await runAndPrint(window.api.debloaterApply(tweaks));
    })
  );

  btnRow.appendChild(
    button("UNDO SELECTED TWEAKS", "ghost", async () => {
      log("[*] Reverting selected tweaks...");
      const tweaks = readChecks([...essentialIds, ...advIds].map((x) => x[1]));
      await runAndPrint(window.api.debloaterRevert(tweaks));
    })
  );

  card.appendChild(essential);
  card.appendChild(advanced);
  card.appendChild(btnRow);
  view.appendChild(card);
}

function renderPurge() {
  setActive("purge");
  view.innerHTML = "";

  const card = document.createElement("div");
  card.className = "card";
  card.innerHTML = `
    <div class="h1" style="color:#ff6b6b">CRITICAL SYSTEM PURGE ENGINE</div>
    <div class="p">Select actions, then INITIATE PURGE. (Admin required)</div>
  `;

  const opts = [
    ["Kill Suspicious Processes", "procs"],
    ["Scrub Registry Boot Hooks (IFEO)", "reg"],
    ["Reset Network Redirections", "net_reset"],
    ["Reset Windows Update", "win_update"],
    ["Empty Global Quarantine", "quarantine"],
  ];
  opts.forEach(([t, k]) => card.appendChild(checkbox(t, k, false)));

  const btnRow = document.createElement("div");
  btnRow.className = "btnRow";
  btnRow.appendChild(
    button("INITIATE PURGE", "danger", async () => {
      log("[*] Initiating purge...");
      const payload = readChecks(opts.map((x) => x[1]));
      await runAndPrint(window.api.purgeRun(payload));
    })
  );

  card.appendChild(btnRow);
  view.appendChild(card);
}

function renderFSE() {
  setActive("fse");
  view.innerHTML = "";

  const card = document.createElement("div");
  card.className = "card";
  card.innerHTML = `
    <div class="h1" style="color:#7CFF8A">XBOX FSE TOOLKIT</div>
    <div class="p">Install Hidden Features folder and/or apply registry + ViVeTool IDs.</div>

    <div class="fse-version-box">
      <div class="fse-version-title">Windows Detection</div>
      <div class="fse-version-row"><span id="uiWinBuild">Build: Detecting...</span></div>
      <div class="fse-version-row"><span id="uiWinChannel">Bundle: Detecting...</span></div>
    </div>
  `;

  card.appendChild(
    checkbox("Install Hidden Features Folder (hidden_features.zip → C:\\Hidden Features)", "fse_files", false)
  );
  card.appendChild(checkbox("Apply FSE Registry Fixes + ViVeTool IDs", "fse_reg", false));

  const btnRow = document.createElement("div");
  btnRow.className = "btnRow";

  btnRow.appendChild(
    button("APPLY / INSTALL", "good", async () => {
      log("[*] Applying FSE...");
      const payload = {
        files: !!document.getElementById("fse_files").checked,
        registry: !!document.getElementById("fse_reg").checked,
      };
      await runAndPrint(window.api.fseInstall(payload));
    })
  );

  btnRow.appendChild(
    button("REMOVE / UNINSTALL", "danger", async () => {
      log("[*] Uninstalling FSE...");
      const payload = {
        files: !!document.getElementById("fse_files").checked,
        registry: !!document.getElementById("fse_reg").checked,
      };
      await runAndPrint(window.api.fseUninstall(payload));
    })
  );

  card.appendChild(btnRow);
  view.appendChild(card);

  // Populate version box once the DOM nodes exist
  loadFseVersionInfo();
}

// ---------------------------
// Tools Installer (dynamic downloader)
// ---------------------------
async function renderTools() {
  setActive("tools");
  view.innerHTML = "";

  const card = document.createElement("div");
  card.className = "card";
  card.innerHTML = `
    <div class="h1">TOOLS INSTALLER</div>
    <div class="p">
      Installs tools safely by downloading the latest official releases (recommended for public builds).
      Requires internet connection and Administrator for system-wide installs.
    </div>
    <div id="toolsWrap" class="grid2"></div>
  `;

  view.appendChild(card);

  const wrap = document.getElementById("toolsWrap");
  wrap.innerHTML = `<div class="p">Loading tools…</div>`;

  const tools = await runAndPrint(window.api.toolsList());
  if (!tools?.tools) {
    wrap.innerHTML = `<div class="p">Unable to load tools list.</div>`;
    return;
  }

  wrap.innerHTML = "";

  tools.tools.forEach((t) => {
    const tile = document.createElement("div");
    tile.className = "card";
    tile.style.margin = "0";

    const status = t.installed ? "Installed" : "Not installed";
    const statusColor = t.installed ? "#7CFF8A" : "#ffb86b";

    tile.innerHTML = `
      <div class="h1" style="font-size:18px">${t.name}</div>
      <div class="p" style="margin-top:6px">${t.description || ""}</div>
      <div class="p" style="margin-top:8px"><b>Status:</b> <span style="color:${statusColor}">${status}</span></div>
      <div class="btnRow" style="margin-top:12px;justify-content:flex-start;gap:10px"></div>
    `;

    const btnRow = tile.querySelector(".btnRow");

    const installBtn = button("INSTALL / UPDATE", "primary", async () => {
      log(`[*] Installing ${t.name}…`);
      await runAndPrint(window.api.toolsInstall(t.id));
      await renderTools();
    });

    const uninstallBtn = button("UNINSTALL", "danger", async () => {
      log(`[*] Uninstalling ${t.name}…`);
      await runAndPrint(window.api.toolsUninstall(t.id));
      await renderTools();
    });

    btnRow.appendChild(installBtn);
    btnRow.appendChild(uninstallBtn);

    wrap.appendChild(tile);
  });
}

async function renderReg() {
  setActive("reg");
  view.innerHTML = "";

  const card = document.createElement("div");
  card.className = "card";
  card.innerHTML = `
    <div class="h1">REGISTRY CLEANER</div>
    <div class="p">Scan safe categories for dead file paths, then fix selected scan results.</div>
  `;

  const cats = await window.api.regListCategories();
  const wrap = document.createElement("div");
  wrap.className = "grid2";

  cats.forEach((c) => {
    const id = "reg_" + c.replace(/[^a-z0-9]/gi, "_");
    const row = checkbox(c, id, false);
    row.dataset.cat = c;
    wrap.appendChild(row);
  });

  const btnRow = document.createElement("div");
  btnRow.className = "btnRow";
  btnRow.appendChild(
    button("SCAN FOR ISSUES", "primary", async () => {
      log("[*] Registry scan...");
      const selected = [...wrap.querySelectorAll("label.checkRow input:checked")].map(
        (i) => i.parentElement.dataset.cat
      );
      const res = await runAndPrint(window.api.regScan(selected));
      if (res?.count !== undefined) log(`[*] Scan complete. Found ${res.count} orphaned items.`);
    })
  );

  btnRow.appendChild(
    button("FIX SELECTED", "ghost", async () => {
      log("[*] Fixing issues from last scan...");
      const res = await runAndPrint(window.api.regFix());
      if (res?.count !== undefined) log(`[*] Fixed ${res.count} items.`);
    })
  );

  card.appendChild(wrap);
  card.appendChild(btnRow);
  view.appendChild(card);
}

function renderAbout() {
  setActive("about");
  view.innerHTML = `
    <div class="card">
      <div class="h1">ABOUT</div>
      <div class="p">
        GR Command Hub is a Windows optimization and recovery suite.
        It performs system-level changes (registry, services, cleanup) and must be run as Administrator.
      </div>
      <div class="p">
        <b>Author:</b> TheBatGOD<br/>
        <b>Copyright:</b> © 2026 GR Studios AI
      </div>
      <div class="p">
        For best results, use on supported Windows builds and review each option before applying.
      </div>
    </div>
  `;
}

function renderTOS() {
  setActive("tos");
  view.innerHTML = `
    <div class="card">
      <div class="h1">TERMS OF SERVICE</div>
      <div class="p">
        This software is provided <b>"AS IS"</b> without warranty of any kind.
        You understand and agree that system changes may affect stability, data, or installed applications.
      </div>
      <div class="p">
        You accept full responsibility for any changes made using this tool.
        GR Studios AI and TheBatGOD are not liable for any damages, data loss, or downtime.
      </div>
      <div class="p">
        Use at your own risk. If you do not agree, do not use this software.
      </div>
    </div>
  `;
}

/* -------- Navigation -------- */
document.querySelectorAll(".nav").forEach((btn) => {
  btn.addEventListener("click", async () => {
    if (btn.dataset.view === "debloater") renderDebloater();
    if (btn.dataset.view === "purge") renderPurge();
    if (btn.dataset.view === "fse") renderFSE();
    if (btn.dataset.view === "reg") await renderReg();
    if (btn.dataset.view === "tools") await renderTools();
    if (btn.dataset.view === "about") renderAbout();
    if (btn.dataset.view === "tos") renderTOS();
  });
});

/* -------- Init + Logos --------
   Use PNG for HTML <img> (ICO is unreliable in <img>).
   Put your image at: assets/logo.png
*/
(() => {
  const sidebarLogo = document.getElementById("logo");
  const topLogo = document.getElementById("logoTop");

  sidebarLogo.src = "../../assets/logo.png";
  topLogo.src = "../../assets/logo.png";

  // Always-on OS info (left sidebar)
  loadSidebarVersionInfo();
  initUpdateButton();

  renderDebloater();
})();