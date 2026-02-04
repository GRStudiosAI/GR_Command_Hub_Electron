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
document.getElementById("btnCopyLog").onclick = () => window.api.copy(terminal.textContent);

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
  essentialIds.forEach(([t, k]) => essential.appendChild(checkbox(t, k, false)));

  const advanced = document.createElement("div");
  advanced.innerHTML = `<div class="sectionTitle">Advanced Tweaks - CAUTION</div>`;
  const advIds = [
    ["Disable Background Apps", "disable_background_apps"],
    ["Disable IPv6", "disable_ipv6"],
    ["Uninstall OneDrive", "remove_onedrive"],
    ["Set Classic Right-Click Menu", "classic_context_menu"],
  ];
  advIds.forEach(([t, k]) => advanced.appendChild(checkbox(t, k, false)));

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

  renderDebloater();
})();
