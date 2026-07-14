/**
 * CNC Template Tracker PWA — Main Application
 * FIX 7: Boot sequence: cek backend → token → IndexedDB → outbox → render
 * FIX 8: Module validation saat startup
 * FIX 9: Manifest/SW/IndexedDB check
 * FIX 6: Health check gagal → popup "Backend Offline"
 * FIX 1: Semua URL via CONFIG
 */
import { CONFIG, getApiBase, setApiBase } from "../config.js";

// ===========================================================================
// FIX 8 — Module Validation: validate db.js exports SEBELUM apapun
// ===========================================================================
import * as _db from "./db.js";
const REQUIRED_DB_EXPORTS = ["STORES", "idb", "settings", "cache", "openDB"];
for (const sym of REQUIRED_DB_EXPORTS) {
  if (_db[sym] === undefined) {
    showFatalError(
      "Database Module Invalid",
      `db.js export "${sym}" tidak ditemukan.\n` +
      "Pastikan semua file JS di folder js/ tidak rusak.\n" +
      "Clear cache browser (Ctrl+Shift+R) lalu coba lagi."
    );
    throw new Error(`db.js export invalid: ${sym}`);
  }
}
const { cache, settings, idb, STORES } = _db;

// Validate api.js
import * as _apiModule from "./api.js";
if (!_apiModule.api) {
  showFatalError("API Module Invalid", "api.js export tidak valid.");
  throw new Error("api.js export invalid");
}
const { api } = _apiModule;

// Validate outbox.js
import * as _outboxModule from "./outbox.js";
if (!_outboxModule.outbox) {
  showFatalError("Outbox Module Invalid", "outbox.js export tidak valid.");
  throw new Error("outbox.js export invalid");
}
const { outbox } = _outboxModule;

// ===========================================================================
// Local DB mirror
// ===========================================================================
const db = (window.db = {
  templates: [],
  parts: [],
  storages: [],
  users: [],
  movements: [],
});

// ===========================================================================
// Module-scoped state
// ===========================================================================
let currentUser = null;
let activePage = "home";
let syncAnchor = null;
let dataLoaded = false;
let selectedTemplate = null;
let selectedMoveTemplate = null;
let sketchList = [];
let petMasters = [];
let mhServerRows = null;
let bootDiagnostics = []; // FIX 9: collect check results

// Sketch crop state (shared between input form and edit modal)
let editSketchList = [];     // sketches when editing existing template
let editTargetId = null;     // template ID being edited
const cropState = { scale:1, minScale:1, x:0, y:0, dragging:false, px:0, py:0, sx:0, sy:0, pointers:new Map(), lastDist:0, startScale:1, natW:0, natH:0 };
let cropTarget = null;       // "add" or "edit"
let cropStagedImage = "";    // original image dataURL before crop

// Field update state
let selectedFieldStorage = "";
let selectedQR = new Set();

// ===========================================================================
// Helpers
// ===========================================================================
const $ = (id) => document.getElementById(id);
const esc = (v) =>
  String(v ?? "").replace(/[&<>'"]/g, (m) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;",
  }[m]));
const norm = (v) => String(v || "").trim().toUpperCase();
const dt = (v) => (!v ? "-" : new Date(v).toLocaleString("id-ID"));
const badgeCls = (s) =>
  s === "DISTRIBUTED" ? "good" : s === "WAITING_DISTRIBUTION" ? "warn" : s === "OUT" ? "bad" : "";
const badge = (s) => `<span class="badge ${badgeCls(s)}">${esc(s || "-")}</span>`;

function toast(msg) {
  const t = $("toast");
  if (!t) return;
  t.textContent = msg;
  t.classList.add("show");
  clearTimeout(toast._t);
  toast._t = setTimeout(() => t.classList.remove("show"), 2800);
}

function setBusy(on, title = "Memproses...") {
  const el = $("busy");
  if (!el) return;
  el.classList.toggle("hidden", !on);
  const bt = $("busyTitle");
  if (bt) bt.textContent = title;
}

// ===========================================================================
// Fatal error UI — shows a fullscreen overlay if the app cannot start
// ===========================================================================
function showFatalError(title, detail) {
  const existing = document.getElementById("fatalError");
  if (existing) existing.remove();
  const div = document.createElement("div");
  div.id = "fatalError";
  div.style.cssText =
    "position:fixed;inset:0;z-index:99999;background:#0f172a;color:#fff;display:flex;align-items:center;justify-content:center;padding:20px;font-family:sans-serif";
  div.innerHTML = `
    <div style="max-width:500px;text-align:center">
      <div style="font-size:48px">⚠️</div>
      <h2 style="color:#ef4444;margin:10px 0">${esc(title)}</h2>
      <p style="color:#94a3b8;white-space:pre-wrap;font-size:14px;line-height:1.6">${esc(detail)}</p>
      <button style="margin-top:16px;padding:12px 24px;background:#d4af37;color:#000;border:0;border-radius:10px;font-weight:700;cursor:pointer" onclick="location.reload()">Reload</button>
    </div>`;
  document.body.appendChild(div);
}

// ===========================================================================
// FIX 9 — Manifest / Service Worker / IndexedDB checks
// ===========================================================================
async function checkServiceWorker() {
  if (!("serviceWorker" in navigator)) {
    bootDiagnostics.push({ ok: false, name: "Service Worker", detail: "Browser tidak mendukung Service Worker." });
    return false;
  }
  try {
    const reg = await navigator.serviceWorker.register("sw.js");
    bootDiagnostics.push({ ok: true, name: "Service Worker", detail: "Terdaftar." });
    return true;
  } catch (e) {
    bootDiagnostics.push({ ok: false, name: "Service Worker", detail: e.message });
    return false;
  }
}

async function checkManifest() {
  try {
    const res = await fetch("manifest.json");
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    if (!data.name || !data.start_url) throw new Error("manifest.json tidak valid");
    bootDiagnostics.push({ ok: true, name: "Manifest PWA", detail: data.name });
    return true;
  } catch (e) {
    bootDiagnostics.push({ ok: false, name: "Manifest PWA", detail: e.message });
    return false;
  }
}

async function checkIndexedDB() {
  if (!("indexedDB" in window)) {
    bootDiagnostics.push({ ok: false, name: "IndexedDB", detail: "Browser tidak mendukung IndexedDB." });
    return false;
  }
  try {
    await STORES; // triggers openDB via import
    await idb.count(STORES.settings);
    bootDiagnostics.push({ ok: true, name: "IndexedDB", detail: "Tersambung." });
    return true;
  } catch (e) {
    bootDiagnostics.push({ ok: false, name: "IndexedDB", detail: e.message });
    return false;
  }
}

// ===========================================================================
// FIX 6 — Backend health check
// ===========================================================================
async function checkBackend() {
  const base = getApiBase();
  try {
    const res = await fetch(`${base}/health`, { signal: AbortSignal.timeout(5000) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    const dbOk = data.database === "connected";
    bootDiagnostics.push({
      ok: data.ok && dbOk,
      name: "Backend API",
      detail: `v${data.version || "?"} · ${base} · DB: ${data.database || "?"}`,
    });
    return { ok: true, data };
  } catch (e) {
    bootDiagnostics.push({
      ok: false,
      name: "Backend API",
      detail: `Backend Offline — ${e.message} (${base})`,
    });
    return { ok: false, error: e };
  }
}

// ===========================================================================
// App
// ===========================================================================
const App = (window.App = {
  // -----------------------------------------------------------------
  // FIX 7 — Boot sequence: backend → token → IndexedDB → outbox → render
  // -----------------------------------------------------------------
  async init() {
    // FIX 8: Module validation already done at import time (above)

    // FIX 9: Run all system checks in parallel
    setBusy(true, "Memeriksa sistem...");
    await Promise.all([
      checkServiceWorker(),
      checkManifest(),
      checkIndexedDB(),
    ]);

    // FIX 6: Check backend health FIRST — don't render dashboard if backend is dead
    const health = await checkBackend();

    // Always load cached data (for offline use even if backend is down)
    try {
      await this.loadCache();
    } catch (e) {
      bootDiagnostics.push({ ok: false, name: "Cache Lokal", detail: e.message });
    }

    // Check token
    currentUser = await settings.get("user");
    syncAnchor = await settings.get("syncAnchor");

    // Setup event listeners
    this.setupEventListeners();

    // Drain outbox if online + backend healthy
    if (navigator.onLine && health.ok) {
      outbox.drain().catch(() => {});
    }

    setBusy(false);

    // Determine what to render
    if (!health.ok) {
      // FIX 6: Backend offline — show login page with diagnostic popup
      this.renderLogin();
      this.showBackendOfflinePopup();
    } else if (currentUser) {
      this.renderAuth();
      this.syncData(null, { silent: true });
    } else {
      this.renderLogin();
    }

    this.updateOutboxBadge();
    this.addPartRow();
    this.updateHeader();
  },

  setupEventListeners() {
    const updateOnline = () => {
      const banner = $("offlineBanner");
      if (banner) banner.classList.toggle("hidden", navigator.onLine);
      if (navigator.onLine) {
        outbox.drain().then(() => this.updateOutboxBadge());
      }
    };
    window.addEventListener("online", updateOnline);
    window.addEventListener("offline", updateOnline);

    window.addEventListener("auth-expired", () => {
      toast("Sesi berakhir. Silakan login ulang.");
      this.logout();
    });
    window.addEventListener("outbox-synced", () => {
      this.updateOutboxBadge();
      this.syncData(null, { silent: true });
    });

    // UPGRADE 1: Ctrl+V paste image → crop mode
    document.addEventListener("paste", (e) => {
      if (activePage !== "templateInput" && activePage !== "templateList") return;
      if ($("modal").style.display === "flex") return;
      const items = e.clipboardData?.items;
      if (!items) return;
      for (const item of items) {
        if (item.type && item.type.startsWith("image/")) {
          const file = item.getAsFile();
          if (file) {
            e.preventDefault();
            this.handleSketchFile(file, $("inpBuyer")?.dataset.editId ? "edit" : "add");
          }
          break;
        }
      }
    });
  },

  // -----------------------------------------------------------------
  // FIX 6 — Backend Offline popup (not "Failed to fetch")
  // -----------------------------------------------------------------
  showBackendOfflinePopup() {
    const diag = bootDiagnostics.filter((d) => !d.ok).map((d) => `❌ ${d.name}: ${d.detail}`).join("\n");
    const okDiag = bootDiagnostics.filter((d) => d.ok).map((d) => `✅ ${d.name}: ${d.detail}`).join("\n");
    const status = $("loginStatus");
    if (status) {
      status.innerHTML = `
        <div class="card" style="border:2px solid var(--bad);margin-top:12px">
          <h3 style="color:var(--bad)">🔌 Backend Offline</h3>
          <p style="font-size:13px;color:var(--muted)">Tidak dapat terhubung ke server API:</p>
          <p style="font-size:12px;color:var(--accent);word-break:break-all">${esc(getApiBase())}</p>
          <div style="font-size:11px;white-space:pre-wrap;color:var(--muted);margin-top:8px">${esc(okDiag)}\n${esc(diag)}</div>
          <div class="actions" style="margin-top:10px">
            <button class="small" onclick="App.ping()">🔄 Coba Lagi</button>
            <button class="small" onclick="App.configureApiBase()">⚙️ Atur URL API</button>
          </div>
        </div>`;
    }
  },

  // -----------------------------------------------------------------
  // AUTH (PRD §7)
  // -----------------------------------------------------------------
  async login() {
    const u = ($("loginUser")?.value || "").trim().toLowerCase();
    const p = $("loginPass")?.value || "";
    if (!u || !p) return toast("Username & password wajib diisi");
    setBusy(true, "Login...");
    try {
      currentUser = await api.login(u, p);
      $("loginPass").value = "";
      $("loginStatus").innerHTML = "";
      syncAnchor = null;
      await settings.remove("syncAnchor");
      this.renderAuth();
      toast("Login berhasil");
      await this.syncData("Memuat data awal...");
    } catch (e) {
      const status = $("loginStatus");
      if (e.type === "backend-offline" || e.type === "offline") {
        // FIX 6: Show backend offline popup, not just a badge
        this.showBackendOfflinePopup();
      } else if (status) {
        status.innerHTML = `<div class="badge bad">${esc(e.message)}</div>`;
      }
    } finally {
      setBusy(false);
    }
  },

  async logout() {
    await api.logout();
    currentUser = null;
    syncAnchor = null;
    dataLoaded = false;
    this.renderLogin();
    toast("Logout berhasil");
  },

  async ping() {
    setBusy(true, "Cek koneksi API...");
    try {
      const res = await fetch(`${getApiBase()}/health`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const d = await res.json();
      toast(`✅ API terhubung: ${getApiBase()}`);
      const status = $("loginStatus");
      if (status) status.innerHTML = `<div class="badge good">Server OK · v${esc(d.version || "?")} · DB: ${esc(d.database || "?")}</div>`;
    } catch (e) {
      toast(`❌ Backend Offline`);
      this.showBackendOfflinePopup();
    } finally {
      setBusy(false);
    }
  },

  configureApiBase() {
    const current = getApiBase();
    const url = prompt("URL API Backend (contoh: http://localhost:5000/api):", current);
    if (url !== null) {
      setApiBase(url.trim() || null);
      toast("URL API diatur: " + getApiBase());
      // Clear old diagnostics and re-init
      bootDiagnostics = [];
      this.init();
    }
  },

  renderLogin() {
    $("page-login")?.classList.remove("hidden");
    $("app")?.classList.add("hidden");
    $("bottomNav")?.classList.add("hidden");
    $("btnLogout")?.classList.add("hidden");
    const wi = $("whoami");
    if (wi) wi.textContent = "";
  },

  renderAuth() {
    $("page-login")?.classList.add("hidden");
    $("app")?.classList.remove("hidden");
    $("bottomNav")?.classList.remove("hidden");
    $("btnLogout")?.classList.remove("hidden");
    const wi = $("whoami");
    if (wi && currentUser) {
      wi.textContent = `${currentUser.name || currentUser.username} · ${currentUser.role}`;
    }
    this.showPage("home");
  },

  // -----------------------------------------------------------------
  // SYNC (PRD §8: /api/sync)
  // -----------------------------------------------------------------
  async syncData(title = "Sync data...", opts = {}) {
    if (!currentUser) return;
    const silent = opts.silent;
    if (!silent) setBusy(true, title);

    try {
      const res = await api.sync(syncAnchor, 7);

      if (res.incremental) {
        await cache.applyDelta(res.data);
      } else {
        await cache.applyFullSync(res.data);
      }

      syncAnchor = res.serverTime;
      await settings.set("syncAnchor", syncAnchor);
      dataLoaded = true;

      // Load pet board masters
      try {
        const pbRes = await api.petBoardMasters();
        petMasters = pbRes.masters || [];
        await idb.clear(STORES.petMasters);
        await idb.putMany(STORES.petMasters, petMasters);
      } catch (_) {}

      await this.loadCache();
      this.renderCurrentPage();
      this.updateHeader();
      if (!silent) {
        toast(res.incremental ? "Sync selesai (incremental)" : "Sync selesai");
      }
    } catch (e) {
      if (!silent) toast("Sync gagal: " + e.message);
    } finally {
      if (!silent) setBusy(false);
    }
  },

  async loadCache() {
    db.templates = await cache.getAllTemplates();
    db.parts = await cache.getAllParts();
    db.storages = await cache.getAllStorages();
    db.users = await cache.getAllUsers();
    db.movements = await cache.getAllMovements();
    if (!petMasters.length) petMasters = await cache.getAllPetMasters();
  },

  // -----------------------------------------------------------------
  // NAVIGATION
  // -----------------------------------------------------------------
  showPage(page) {
    activePage = page;
    document.querySelectorAll(".page").forEach((s) => s.classList.add("hidden"));
    const el = $("page-" + page);
    if (el) el.classList.remove("hidden");
    document
      .querySelectorAll(".bottom-nav button")
      .forEach((b) => b.classList.toggle("active", b.dataset.page === page));
    this.renderCurrentPage();
    window.scrollTo(0, 0);
  },

  renderCurrentPage() {
    this.updateHeader();
    switch (activePage) {
      case "home": this.renderHome(); break;
      case "templateInput": this.renderPetBoardOptions(); break;
      case "templateList": this.renderTemplateList(); break;
      case "distribution": this.renderDistribution(); this.syncData(null, { silent: true }); break;
      case "movement": this.renderMovement(); break;
      case "movementHistory": this.renderHistory(); break;
      case "petBoard": this.renderPetBoard(); break;
      case "storage": this.renderStorage(); break;
      case "master": this.renderMaster(); break;
      case "fieldUpdate": this.renderFieldUpdate(); break;
      case "printqr": this.renderPrintQRSelection(); break;
      case "userManagement": this.renderUsers(); break;
      case "outboxPanel": this.renderOutboxPanel(); break;
    }
  },

  updateHeader() {
    const total = db.templates.length;
    const waiting = db.templates.filter((t) => t.status === "WAITING_DISTRIBUTION").length;
    const hs = $("headerSyncStatus");
    if (hs) hs.textContent = currentUser ? `${total} template · ${waiting} waiting` : "Belum login";
    const ls = $("headerLastSync");
    if (ls) ls.textContent = syncAnchor ? `Last sync: ${new Date(syncAnchor).toLocaleTimeString("id-ID")}` : "Last sync: -";
  },

  async updateOutboxBadge() {
    try {
      const count = await outbox.pendingCount();
      const badge = $("outboxBadge");
      const cn = $("outboxCount");
      if (cn) cn.textContent = count;
      if (badge) {
        badge.classList.toggle("hidden", count === 0);
        badge.classList.toggle("pending", count > 0);
      }
    } catch (_) {}
  },

  closeModal() { const m = $("modal"); if (m) m.style.display = "none"; },
  openModal(title, content) {
    const mt = $("modalTitle"), mc = $("modalContent"), m = $("modal");
    if (mt) mt.textContent = title;
    if (mc) mc.innerHTML = content;
    if (m) m.style.display = "flex";
  },

  // -----------------------------------------------------------------
  // HOME
  // -----------------------------------------------------------------
  renderHome() {
    const buyers = new Set(db.templates.map((t) => t.buyer).filter(Boolean));
    const elB = $("sumBuyers"), elT = $("sumTemplates"), elW = $("sumWaiting");
    if (elB) elB.textContent = buyers.size;
    if (elT) elT.textContent = db.templates.length;
    if (elW) elW.textContent = db.templates.filter((t) => t.status === "WAITING_DISTRIBUTION").length;

    const recent = [...db.movements].sort((a, b) => (b.at || "").localeCompare(a.at || "")).slice(0, 5);
    const icons = { DISTRIBUTE: "📦", TRANSFER: "🔁", OUT: "🚚", IMPORT_EXISTING: "📥", UPDATE_EXISTING: "📝", REPAIR: "🛠️", RETURN: "↩️" };
    const rm = $("recentMovements");
    if (rm) {
      rm.innerHTML = recent.length
        ? recent.map((m) => {
            const t = db.templates.find((x) => x.id === m.templateId) || {};
            return `<div class="line-item"><b>${icons[m.type] || "📄"} ${esc(m.type)}</b><span>${esc(t.buyer || "")} ${esc(t.stylekp || "")} · ${esc(m.from || "-")} → ${esc(m.to || "-")} · ${dt(m.at)}</span></div>`;
          }).join("")
        : `<div class="empty">Belum ada movement.</div>`;
    }

    // UPGRADE 2: Role-based menu
    const role = currentUser?.role || "operator";
    const isAdminUser = ["admin", "super_admin"].includes(role);
    const isSuperAdmin = role === "super_admin";

    const allMenus = [
      { id: "templateInput", icon: "➕", title: "Input Template", desc: "Buyer, Style/KP, part, sketch", roles: ["all"] },
      { id: "distribution", icon: "📦", title: "Distribusi", desc: "Split per part/size/qty", roles: ["all"] },
      { id: "templateList", icon: "📋", title: "List Template", desc: "Filter & cari", roles: ["all"] },
      { id: "movement", icon: "🔁", title: "Movement", desc: "Transfer / Out / Repair", roles: ["all"] },
      { id: "movementHistory", icon: "🕘", title: "History", desc: "Riwayat movement", roles: ["all"] },
      { id: "storage", icon: "📷", title: "Cek Storage", desc: "Cek isi meja", roles: ["all"] },
      { id: "master", icon: "⚙️", title: "Master Storage", desc: "Tambah storage, QR, print", roles: ["all"] },
      { id: "fieldUpdate", icon: "🧾", title: "Update Lapangan", desc: "Bulk add per storage", roles: ["all"] },
      { id: "petBoard", icon: "🪧", title: "PET/PVC Board", desc: "Stok, Master, In, Report", roles: ["admin", "super_admin"] },
      { id: "userManagement", icon: "👥", title: "User Management", desc: "Super admin only", roles: ["super_admin"] },
      { id: "outboxPanel", icon: "📤", title: "Sync Status", desc: "Outbox & konflik", roles: ["all"] },
      { id: "syncData", icon: "☁️", title: "Sync Data", desc: "Refresh dari server", roles: ["all"], action: true },
    ];

    const mg = $("menuGrid");
    if (mg) {
      mg.innerHTML = allMenus
        .filter((m) => m.roles.includes("all") || m.roles.includes(role))
        .map((m) => {
          const onclick = m.action ? `App.syncData()` : `App.showPage('${m.id}')`;
          return `<div class="menu-card" onclick="${onclick}"><div class="icon">${m.icon}</div><b>${esc(m.title)}</b><span>${esc(m.desc)}</span></div>`;
        }).join("");
    }

    // Show/hide bottom nav buttons by role
    document.querySelectorAll(".bottom-nav button[data-role]").forEach((btn) => {
      const r = btn.dataset.role;
      btn.style.display = r === "all" || r === role || (r === "admin" && isAdminUser) ? "" : "none";
    });
  },

  // -----------------------------------------------------------------
  // INPUT TEMPLATE (§5, §5.2: Uk Pet Board per part)
  // -----------------------------------------------------------------
  async renderPetBoardOptions() {
    // Fetch from API if petMasters is empty (sync might not have completed yet)
    if (!petMasters.length) {
      try {
        const res = await api.petBoardMasters();
        petMasters = res.masters || [];
        await idb.clear(STORES.petMasters);
        await idb.putMany(STORES.petMasters, petMasters);
      } catch (_) {
        // Try IndexedDB cache as fallback
        try { petMasters = await cache.getAllPetMasters(); } catch (_) {}
      }
    }
    const opts = petMasters.length ? petMasters.map((m) => `<option value="${esc(m.code)}">${esc(m.sizeLabel)}</option>`).join("") : "";
    document.querySelectorAll(".part-petboard").forEach((sel) => {
      const cur = sel.value;
      sel.innerHTML = `<option value="">-</option>${opts}`;
      sel.value = cur;
    });
  },

  async addPartRow(part = "", size = "", qty = 1) {
    const box = $("partRows");
    if (!box) return;
    // Ensure petMasters is loaded before building the dropdown
    if (!petMasters.length) {
      try {
        const res = await api.petBoardMasters();
        petMasters = res.masters || [];
      } catch (_) {
        try { petMasters = await cache.getAllPetMasters(); } catch (_) {}
      }
    }
    const row = document.createElement("div");
    row.className = "part-row";
    const pbOpts = petMasters.length ? petMasters.map((m) => `<option value="${esc(m.code)}">${esc(m.sizeLabel)}</option>`).join("") : "";
    row.innerHTML = `
      <input class="part-name" placeholder="Nama Part" value="${esc(part)}">
      <input class="part-size" placeholder="Size" value="${esc(size)}">
      <input class="part-qty" type="number" min="1" value="${qty}">
      <select class="part-petboard"><option value="">-</option>${pbOpts}</select>
      <button class="bad small" type="button" onclick="this.closest('.part-row').remove()">✕</button>`;
    box.appendChild(row);
  },

  getPartRows() {
    return [...document.querySelectorAll("#partRows .part-row")]
      .map((r) => ({
        part: norm(r.querySelector(".part-name")?.value || ""),
        size: norm(r.querySelector(".part-size")?.value || ""),
        qty: Math.max(1, parseInt(r.querySelector(".part-qty")?.value) || 1),
        pet_board_code: r.querySelector(".part-petboard")?.value || "",
      }))
      .filter((p) => p.part);
  },

  onSketchFile(input) {
    const file = input.files?.[0];
    input.value = "";
    if (!file) return;
    this.handleSketchFile(file, $("inpBuyer")?.dataset.editId ? "edit" : "add");
  },

  // UPGRADE 1: Unified sketch handler — compress then open crop modal
  async handleSketchFile(file, target = "add") {
    if (!file || !file.type.startsWith("image/")) return toast("File harus gambar.");
    setBusy(true, "Membaca gambar...");
    try {
      const compressed = await this.compressImage(file, 0.5);
      cropStagedImage = compressed;
      cropTarget = target;
      setBusy(false);
      this.openCropModal();
    } catch (e) {
      setBusy(false);
      toast("Gagal baca gambar: " + e.message);
    }
  },

  // UPGRADE 1: Image compression (from original compressImage)
  compressImage(file, maxMB = 0.5) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const dataUrl = reader.result;
        const maxLen = Math.max(70000, Math.floor(maxMB * 1024 * 1024 * 1.34));
        if (dataUrl.length <= maxLen) { resolve(dataUrl); return; }
        const img = new Image();
        img.onload = () => {
          let w = img.width, h = img.height, maxSide = 900, q = 0.7;
          let out = "";
          const canvas = document.createElement("canvas");
          for (let attempt = 0; attempt < 8; attempt++) {
            let tw = w, th = h;
            if (Math.max(tw, th) > maxSide) {
              const scale = maxSide / Math.max(tw, th);
              tw = Math.round(tw * scale); th = Math.round(th * scale);
            }
            canvas.width = tw; canvas.height = th;
            canvas.getContext("2d").drawImage(img, 0, 0, tw, th);
            q = 0.7; out = canvas.toDataURL("image/jpeg", q);
            while (out.length > maxLen && q > 0.32) { q -= 0.08; out = canvas.toDataURL("image/jpeg", q); }
            if (out.length <= maxLen) { resolve(out); return; }
            maxSide = Math.round(maxSide * 0.78);
          }
          resolve(out);
        };
        img.onerror = () => reject(new Error("Gagal load gambar"));
        img.src = dataUrl;
      };
      reader.onerror = () => reject(new Error("Gagal baca file"));
      reader.readAsDataURL(file);
    });
  },

  // UPGRADE 1: Crop Modal
  openCropModal() {
    const img = $("cropImage");
    const modal = $("cropModal");
    if (!img || !modal) return;
    modal.style.display = "flex";
    document.body.style.overflow = "hidden";
    img.onload = () => this.initCrop();
    if (img.src === cropStagedImage && img.complete) this.initCrop();
    else img.src = cropStagedImage;
    this.setupCropEvents();
  },

  closeCropModal() {
    $("cropModal").style.display = "none";
    document.body.style.overflow = "";
    cropState.pointers.clear();
    cropStagedImage = "";
  },

  initCrop() {
    const vp = $("cropViewport"), img = $("cropImage");
    cropState.natW = img.naturalWidth; cropState.natH = img.naturalHeight;
    const vw = vp.clientWidth, vh = vp.clientHeight;
    cropState.minScale = Math.max(vw / cropState.natW, vh / cropState.natH);
    cropState.scale = cropState.minScale;
    cropState.x = (vw - cropState.natW * cropState.scale) / 2;
    cropState.y = (vh - cropState.natH * cropState.scale) / 2;
    $("cropZoom").value = 100;
    this.applyCropTransform();
  },

  resetCrop() { this.initCrop(); },

  setCropZoom(v) {
    const vp = $("cropViewport");
    const newScale = cropState.minScale * (Number(v) / 100);
    const cx = vp.clientWidth / 2, cy = vp.clientHeight / 2;
    cropState.x = cx - (cx - cropState.x) * (newScale / cropState.scale);
    cropState.y = cy - (cy - cropState.y) * (newScale / cropState.scale);
    cropState.scale = newScale;
    this.clampCropPan(); this.applyCropTransform();
  },

  clampCropPan() {
    const vp = $("cropViewport");
    const w = cropState.natW * cropState.scale, h = cropState.natH * cropState.scale;
    cropState.x = Math.min(0, Math.max(vp.clientWidth - w, cropState.x));
    cropState.y = Math.min(0, Math.max(vp.clientHeight - h, cropState.y));
  },

  applyCropTransform() {
    $("cropImage").style.transform = `translate(${cropState.x}px,${cropState.y}px) scale(${cropState.scale})`;
  },

  setupCropEvents() {
    const vp = $("cropViewport"), img = $("cropImage");
    if (!vp || vp._cropBound) return;
    vp._cropBound = true;
    vp.onwheel = (e) => {
      e.preventDefault();
      const z = $("cropZoom");
      z.value = Math.max(100, Math.min(400, Number(z.value) + (e.deltaY < 0 ? 18 : -18)));
      this.setCropZoom(z.value);
    };
    vp.onpointerdown = (e) => {
      e.preventDefault(); vp.setPointerCapture?.(e.pointerId);
      cropState.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (cropState.pointers.size === 1) {
        cropState.dragging = true; cropState.px = e.clientX; cropState.py = e.clientY;
        cropState.sx = cropState.x; cropState.sy = cropState.y; img.style.cursor = "grabbing";
      }
      if (cropState.pointers.size === 2) {
        const p = [...cropState.pointers.values()];
        cropState.lastDist = Math.hypot(p[0].x - p[1].x, p[0].y - p[1].y);
        cropState.startScale = cropState.scale; cropState.dragging = false;
      }
    };
    vp.onpointermove = (e) => {
      if (!cropState.pointers.has(e.pointerId)) return;
      e.preventDefault(); cropState.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (cropState.pointers.size >= 2) {
        const p = [...cropState.pointers.values()];
        const dist = Math.hypot(p[0].x - p[1].x, p[0].y - p[1].y);
        if (cropState.lastDist > 0) {
          let ns = cropState.startScale * (dist / cropState.lastDist);
          ns = Math.max(cropState.minScale, Math.min(cropState.minScale * 4, ns));
          const z = $("cropZoom"); z.value = Math.round(ns / cropState.minScale * 100);
          cropState.scale = ns; this.clampCropPan(); this.applyCropTransform();
        }
        return;
      }
      if (cropState.dragging) {
        cropState.x = cropState.sx + (e.clientX - cropState.px);
        cropState.y = cropState.sy + (e.clientY - cropState.py);
        this.clampCropPan(); this.applyCropTransform();
      }
    };
    const end = (e) => {
      cropState.pointers.delete(e.pointerId);
      img.style.cursor = "grab";
      if (cropState.pointers.size < 2) cropState.lastDist = 0;
      if (!cropState.pointers.size) cropState.dragging = false;
    };
    vp.onpointerup = end; vp.onpointercancel = end;
  },

  applyCrop() {
    const vp = $("cropViewport");
    const vw = vp.clientWidth, vh = vp.clientHeight;
    const sx = -cropState.x / cropState.scale, sy = -cropState.y / cropState.scale;
    const sw = vw / cropState.scale, sh = vh / cropState.scale;
    const canvas = document.createElement("canvas");
    const outW = Math.min(1000, Math.round(sw));
    canvas.width = outW; canvas.height = Math.round(outW * (sh / sw));
    const img = $("cropImage");
    canvas.getContext("2d").drawImage(img, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);
    let q = 0.72, out = canvas.toDataURL("image/jpeg", q);
    const maxLen = Math.floor(0.18 * 1024 * 1024 * 1.34);
    while (out.length > maxLen && q > 0.3) { q -= 0.08; out = canvas.toDataURL("image/jpeg", q); }
    // Add to correct sketch list
    if (cropTarget === "edit") {
      editSketchList.push(out);
      this.renderEditSketchGallery();
    } else {
      sketchList.push(out);
      this.renderSketchGallery();
    }
    this.closeCropModal();
    toast("Sketch ditambahkan ✂️");
  },

  viewSketch(i) {
    const src = sketchList[i];
    if (!src) return;
    this.openModal(`Sketch ${i + 1}`, `<img src="${esc(src)}" style="max-width:100%;border-radius:12px">`);
  },

  removeSketch(i) {
    sketchList.splice(i, 1);
    this.renderSketchGallery();
  },

  renderSketchGallery() {
    const g = $("sketchGallery");
    if (!g) return;
    g.innerHTML = sketchList.length
      ? sketchList.map((s, i) =>
          `<div class="sketch-thumb"><img src="${esc(s)}" onclick="App.viewSketch(${i})"><button class="bad small" style="position:absolute;top:2px;right:2px" type="button" onclick="App.removeSketch(${i})">✕</button></div>`
        ).join("")
      : "";
  },

  // UPGRADE 5: Edit sketch gallery (used in edit modal)
  renderEditSketchGallery() {
    const g = $("editSketchGallery");
    if (!g) return;
    g.innerHTML = editSketchList.length
      ? editSketchList.map((s, i) =>
          `<div class="sketch-thumb"><img src="${esc(s)}" onclick="App.viewEditSketch(${i})"><button class="bad small" style="position:absolute;top:2px;right:2px" type="button" onclick="App.removeEditSketch(${i})">✕</button></div>`
        ).join("")
      : `<div class="muted">Belum ada sketch.</div>`;
  },

  viewEditSketch(i) {
    this.openModal(`Sketch ${i + 1}`, `<img src="${esc(editSketchList[i])}" style="max-width:100%;border-radius:12px">`);
  },

  removeEditSketch(i) {
    editSketchList.splice(i, 1);
    this.renderEditSketchGallery();
  },

  /**
   * Helper: after any write via outbox, DRAIN to server + SYNC fresh data.
   * This is the critical fix — without awaiting drain+sync, the UI shows
   * stale data because the template hasn't reached the server yet.
   */
  async syncAfterWrite() {
    await outbox.drain();
    await this.syncData(null, { silent: true });
    this.updateOutboxBadge();
  },

  async saveTemplate() {
    const editId = $("inpBuyer")?.dataset.editId;
    const buyer = norm($("inpBuyer")?.value || "");
    const stylekp = norm($("inpStyle")?.value || "");
    const parts = this.getPartRows();
    if (!buyer || !stylekp || !parts.length) return toast("Buyer, Style/KP, dan minimal 1 Part wajib diisi");
    const isAdminUser = currentUser && ["admin", "super_admin"].includes(currentUser.role);

    // UPGRADE 5: If editId and user is admin → update template
    if (editId && isAdminUser) {
      setBusy(true, "Menyimpan perubahan...");
      try {
        await outbox.enqueue("UPDATE_TEMPLATE", { id: editId, parts, sketches: sketchList, role: currentUser.role, by: currentUser.username }, null);
        await this.syncAfterWrite();
        this.clearForm();
        toast("Template diperbarui ✅");
        this.showPage("templateList");
      } catch (e) {
        toast("Gagal: " + e.message);
      } finally {
        setBusy(false);
      }
      return;
    }

    setBusy(true, "Menyimpan template...");
    try {
      await outbox.enqueue("ADD_TEMPLATE", { buyer, stylekp, parts, sketches: sketchList, createdBy: currentUser.username }, null);
      await this.syncAfterWrite();
      this.clearForm();
      toast("Template tersimpan ✅");
      this.showPage("templateList");
    } catch (e) {
      toast("Gagal: " + e.message);
    } finally {
      setBusy(false);
    }
  },

  clearForm() {
    const b = $("inpBuyer"), s = $("inpStyle"), pr = $("partRows");
    if (b) { b.value = ""; delete b.dataset.editId; }
    if (s) s.value = "";
    if (pr) pr.innerHTML = "";
    sketchList = [];
    this.renderSketchGallery();
    this.addPartRow();
    const it = $("inputTitle"); if (it) it.textContent = "Input Template Baru";
    const bs = $("btnSaveTemplate"); if (bs) bs.textContent = "Simpan Template";
  },

  // -----------------------------------------------------------------
  // TEMPLATE LIST
  // -----------------------------------------------------------------
  renderTemplateList() {
    const box = $("tplList");
    if (!box) return;
    const q = ($("tplSearch")?.value || "").toLowerCase();
    const status = $("tplStatus")?.value || "";
    const rows = db.templates.filter((t) => {
      const hay = [t.id, t.buyer, t.stylekp, t.status, t.currentStorage].join(" ").toLowerCase();
      return (!q || hay.includes(q)) && (!status || t.status === status);
    });
    box.innerHTML = rows.length
      ? `<div class="muted">${rows.length} template</div>` +
        rows.map((t) => {
          const parts = db.parts.filter((p) => p.templateId === t.id);
          const partText = parts.map((p) => `${esc(p.part)}${p.size ? ` [${esc(p.size)}]` : ""}${p.qty > 1 ? ` x${p.qty}` : ""}`).join(", ");
          return `<div class="line-item" style="cursor:pointer" onclick="App.openTemplateDetail('${esc(t.id)}')">
            <b>${esc(t.buyer)} · ${esc(t.stylekp)}</b>
            <span>${esc(partText)}</span>
            <span>${badge(t.status)} ${esc(t.currentStorage || "Belum distribusi")} · ${esc(t.id)}</span>
          </div>`;
        }).join("")
      : `<div class="empty">Belum ada data.</div>`;
  },

  openTemplateDetail(tid) {
    const t = db.templates.find((x) => x.id === tid);
    if (!t) return;
    const parts = db.parts.filter((p) => p.templateId === tid);
    const movements = db.movements.filter((m) => m.templateId === tid).sort((a, b) => (b.at || "").localeCompare(a.at || ""));
    const editBtn = currentUser && ["admin", "super_admin"].includes(currentUser.role)
      ? `<button class="small warn" type="button" onclick="App.editTemplate('${esc(tid)}')">✏️ Edit</button>` : "";
    this.openModal(`Detail: ${esc(t.buyer)} · ${esc(t.stylekp)}`,
      `<p>${badge(t.status)} <span class="badge">${esc(t.currentStorage || "Belum distribusi")}</span></p>
       <table><thead><tr><th>Part</th><th>Size</th><th>Qty</th><th>Pet Board</th><th>Status</th></tr></thead><tbody>
       ${parts.map((p) => `<tr><td>${esc(p.part)}</td><td>${esc(p.size || "-")}</td><td>${p.qty}</td><td>${esc(p.petBoardCode || "-")}</td><td>${badge(p.status)}</td></tr>`).join("")}
       </tbody></table>
       <h3>History</h3>
       ${movements.length ? movements.map((m) => `<div class="line-item"><b>${esc(m.type)}</b><span>${esc(m.from || "-")} → ${esc(m.to || "-")} · ${dt(m.at)}</span></div>`).join("") : `<div class="empty">Belum ada movement</div>`}
       <div class="actions">${editBtn}</div>`);
  },

  // UPGRADE 5: Edit Part & Sketch (admin/super_admin)
  editTemplate(tid) {
    const t = db.templates.find((x) => x.id === tid);
    if (!t) return;
    if (!currentUser || !["admin", "super_admin"].includes(currentUser.role)) {
      return toast("Edit hanya untuk admin dan super admin");
    }
    this.closeModal();
    this.showPage("templateInput");
    $("inputTitle").textContent = "✏️ Edit Template";
    $("btnSaveTemplate").textContent = "💾 Simpan Perubahan";
    $("inpBuyer").value = t.buyer;
    $("inpStyle").value = t.stylekp;
    $("inpBuyer").dataset.editId = tid;
    $("partRows").innerHTML = "";
    const parts = db.parts.filter((p) => p.templateId === tid);
    parts.forEach((p) => this.addPartRow(p.part, p.size, p.qty));
    // Load existing sketches
    sketchList = [];
    this.renderSketchGallery();
    if (t.hasSketch) {
      this.loadSketchesForEdit(tid);
    }
    toast("Edit mode — ubah part/sketch lalu Simpan Perubahan");
  },

  async loadSketchesForEdit(tid) {
    setBusy(true, "Memuat sketch...");
    try {
      const res = await api.getSketches(tid);
      const sketches = res.sketches || [];
      // Fetch each sketch image
      for (const sk of sketches) {
        try {
          const base = getApiBase().replace("/api", "");
          const imgRes = await fetch(`${base}/api/sketches/${sk.id}`, {
            headers: { Authorization: `Bearer ${await settings.get("access_token")}` },
          });
          if (imgRes.ok) {
            const blob = await imgRes.blob();
            const reader = new FileReader();
            const dataUrl = await new Promise((res) => {
              reader.onload = () => res(reader.result);
              reader.readAsDataURL(blob);
            });
            sketchList.push(dataUrl);
          }
        } catch (_) {}
      }
      this.renderSketchGallery();
    } catch (e) {
      console.warn("Load sketches failed:", e);
    } finally {
      setBusy(false);
    }
  },

  // -----------------------------------------------------------------
  // DISTRIBUTION (§8: split per part/size/qty)
  // -----------------------------------------------------------------
  renderDistribution() {
    const q = ($("distSearch")?.value || "").toLowerCase();
    const waiting = db.templates.filter((t) => t.status === "WAITING_DISTRIBUTION" && (!q || [t.buyer, t.stylekp].join(" ").toLowerCase().includes(q)));
    const dl = $("distList");
    if (dl) {
      dl.innerHTML = waiting.length
        ? waiting.map((t) => `<div class="line-item" style="cursor:pointer;${selectedTemplate === t.id ? "border-color:var(--accent)" : ""}" onclick="App.selectDistTemplate('${esc(t.id)}')"><b>${esc(t.buyer)} · ${esc(t.stylekp)}</b><span>${esc(t.id)}</span></div>`).join("")
        : `<div class="empty">Tidak ada template waiting.</div>`;
    }
    const ds = $("distStorage");
    if (ds) ds.innerHTML = db.storages.map((s) => `<option value="${esc(s.code)}">${esc(s.code)} · ${esc(s.name)}</option>`).join("");
    this.renderDistSplit();
  },

  selectDistTemplate(id) { selectedTemplate = id; this.renderDistribution(); },

  renderDistSplit() {
    const box = $("distSplitBox");
    if (!box) return;
    if (!selectedTemplate) { box.classList.add("hidden"); box.innerHTML = ""; return; }
    const parts = db.parts.filter((p) => p.templateId === selectedTemplate && p.status !== "DISTRIBUTED");
    box.classList.remove("hidden");
    box.innerHTML = `<b>Split per Part/Size/Qty</b>` + (parts.length
      ? parts.map((p) => `<div class="dist-split-row"><input type="checkbox" class="dist-check" checked><div><b>${esc(p.part)}</b><div class="muted">Size: ${esc(p.size || "-")} · Max ${p.qty}</div></div><div></div><input type="number" class="dist-qty" min="1" max="${p.qty}" value="${p.qty}"></div>`).join("")
      : `<div class="empty">Semua part sudah terdistribusi.</div>`);
  },

  async doDistribute() {
    if (!selectedTemplate) return toast("Pilih template dulu");
    const storage = $("distStorage")?.value || "";
    const note = $("distNote")?.value || "";
    const rows = [...document.querySelectorAll("#distSplitBox .dist-split-row")];
    const checks = [...document.querySelectorAll("#distSplitBox .dist-check")];
    const parts = db.parts.filter((p) => p.templateId === selectedTemplate && p.status !== "DISTRIBUTED");
    const splitParts = rows.map((r, i) => ({ partId: parts[i]?.partId, part: parts[i]?.part, size: parts[i]?.size, qty: parseInt(r.querySelector(".dist-qty")?.value) || 1, _checked: checks[i]?.checked }))
      .filter((x) => x._checked).map(({ _checked, ...rest }) => rest);
    setBusy(true, "Distribusi...");
    try {
      await outbox.enqueue("DISTRIBUTE", { templateId: selectedTemplate, storage, splitParts, note },
        async () => { const t = db.templates.find((x) => x.id === selectedTemplate); if (t) { t.status = "DISTRIBUTED"; t.currentStorage = storage; await idb.put(STORES.templates, t); } });
      await this.syncAfterWrite();
      selectedTemplate = null;
      toast("Distribusi tersimpan ✅");
      this.showPage("templateList");
    } catch (e) { toast("Gagal: " + e.message); } finally { setBusy(false); }
  },

  // -----------------------------------------------------------------
  // MOVEMENT (§8)
  // -----------------------------------------------------------------
  renderMovement() {
    const opts = db.storages.map((s) => `<option value="${esc(s.code)}">${esc(s.code)}</option>`).join("");
    const mf = $("moveFrom"), mt = $("moveTo");
    if (mf) mf.innerHTML = opts;
    if (mt) mt.innerHTML = opts;
    this.renderMoveTemplates();
  },

  renderMoveTemplates() {
    const from = $("moveFrom")?.value || "";
    const rows = db.templates.filter((t) => t.currentStorage === from && t.status === "DISTRIBUTED");
    const ml = $("moveList");
    if (!ml) return;
    ml.innerHTML = rows.length
      ? rows.map((t) => `<div class="line-item" style="cursor:pointer;${selectedMoveTemplate === t.id ? "border-color:var(--accent)" : ""}" onclick="App.selectMoveTemplate('${esc(t.id)}')"><b>${esc(t.buyer)} · ${esc(t.stylekp)}</b><span>${esc(t.id)}</span></div>`).join("")
      : `<div class="empty">Tidak ada template di storage ini.</div>`;
  },

  selectMoveTemplate(id) { selectedMoveTemplate = id; this.renderMoveTemplates(); },

  async doMove() {
    if (!selectedMoveTemplate) return toast("Pilih template dulu");
    const type = $("moveType")?.value || "TRANSFER";
    const to = type === "OUT" ? "" : ($("moveTo")?.value || "");
    const from = $("moveFrom")?.value || "";
    const note = $("moveNote")?.value || "";
    setBusy(true, "Movement...");
    try {
      await outbox.enqueue("MOVE", { templateId: selectedMoveTemplate, type, from, to, note },
        async () => { const t = db.templates.find((x) => x.id === selectedMoveTemplate); if (t) { t.status = type === "OUT" ? "OUT" : "DISTRIBUTED"; t.currentStorage = to; await idb.put(STORES.templates, t); } });
      await this.syncAfterWrite();
      selectedMoveTemplate = null;
      toast("Movement tersimpan ✅");
      this.showPage("home");
    } catch (e) { toast("Gagal: " + e.message); } finally { setBusy(false); }
  },

  // -----------------------------------------------------------------
  // MOVEMENT HISTORY (§8: /api/movements)
  // -----------------------------------------------------------------
  async fetchHistory() {
    const params = { limit: 500 };
    if ($("mhFrom")?.value) params.from = new Date($("mhFrom").value).toISOString();
    if ($("mhTo")?.value) params.to = new Date($("mhTo").value).toISOString();
    if ($("mhType")?.value) params.type = $("mhType").value;
    if ($("mhStorage")?.value) params.storage = $("mhStorage").value;
    if ($("mhSearch")?.value) params.q = $("mhSearch").value;
    setBusy(true, "Mengambil history...");
    try {
      const res = await api.movements(params);
      mhServerRows = res.movements || [];
      this.renderHistory();
      toast(`${res.total} movement ditemukan`);
    } catch (e) { toast("Gagal: " + e.message); } finally { setBusy(false); }
  },

  renderHistory() {
    const ms = $("mhStorage");
    if (ms) ms.innerHTML = `<option value="">Semua</option>` + db.storages.map((s) => `<option value="${esc(s.code)}">${esc(s.code)}</option>`).join("");
    let rows = mhServerRows || db.movements;
    const q = norm($("mhSearch")?.value || "");
    const type = $("mhType")?.value || "";
    const storage = $("mhStorage")?.value || "";
    if (q) rows = rows.filter((m) => [m.type, m.from, m.to, m.by, m.note, m.buyer, m.stylekp].join(" ").toUpperCase().includes(q));
    if (type) rows = rows.filter((m) => m.type === type);
    if (storage) rows = rows.filter((m) => m.from === storage || m.to === storage);
    rows = [...rows].sort((a, b) => (b.at || "").localeCompare(a.at || ""));
    const ml = $("mhList");
    if (!ml) return;
    ml.innerHTML = rows.length
      ? `<div class="muted">${rows.length} movement · sumber: ${mhServerRows ? "server" : "cache lokal"}</div>` +
        rows.slice(0, 100).map((m) => `<div class="line-item"><b>${esc(m.type)} ${m.buyer ? `· ${esc(m.buyer)} ${esc(m.stylekp)}` : ""}</b><span>${esc(m.from || "-")} → ${esc(m.to || "-")} · ${esc(m.by || "-")} · ${dt(m.at)}</span>${m.note ? `<small>📝 ${esc(m.note)}</small>` : ""}</div>`).join("")
      : `<div class="empty">Tidak ada data.</div>`;
  },

  // -----------------------------------------------------------------
  // PET/PVC BOARD (§5.2)
  // -----------------------------------------------------------------
  async renderPetBoard() {
    this.showPetBoardTab("stock");
  },

  async showPetBoardTab(tab) {
    const c = $("petTabContent");
    if (!c) return;

    // Ensure petMasters loaded
    if (!petMasters.length) {
      try { petMasters = (await api.petBoardMasters()).masters || []; } catch (_) {
        try { petMasters = await cache.getAllPetMasters(); } catch (_) {}
      }
    }

    if (tab === "stock") {
      let stock = [];
      try { stock = (await api.petBoardStock()).stock || []; }
      catch (e) { c.innerHTML = `<div class="empty">Gagal memuat stok: ${esc(e.message)}</div>`; return; }
      const total = stock.reduce((a, s) => a + (s.available || 0), 0);
      const lowStock = stock.filter((s) => s.available < 0).length;
      const ps = $("petSummary");
      if (ps) ps.innerHTML = `<div class="mini"><b>${stock.length}</b><span>Jenis</span></div><div class="mini"><b>${total.toFixed(0)}</b><span>Available</span></div><div class="mini"><b style="color:${lowStock > 0 ? "var(--bad)" : "inherit"}">${lowStock}</b><span>Minus</span></div>`;
      c.innerHTML = `<h3>📦 Available Stock (In − Out)</h3>` + (stock.length
        ? `<table><thead><tr><th>Ukuran</th><th>In</th><th>Out</th><th>Available</th></tr></thead><tbody>${stock.map((s) => `<tr><td><b>${esc(s.sizeLabel)}</b><br><span class="muted">${esc(s.code)}</span></td><td>${s.inQty}</td><td>${s.outQty}</td><td style="font-weight:bold;color:${s.available < 0 ? "var(--bad)" : "var(--good2)"}">${s.available}</td></tr>`).join("")}</tbody></table>`
        : `<div class="empty">Belum ada master Pet Board.</div>`);

    } else if (tab === "in") {
      const opts = petMasters.map((m) => `<option value="${esc(m.code)}">${esc(m.sizeLabel)}</option>`).join("");
      c.innerHTML = `<h3>📥 Pet Board In (Kedatangan)</h3><div class="row"><div><label>Ukuran</label><select id="pbiCode">${opts}</select></div><div><label>Qty</label><input id="pbiQty" type="number" min="1" value="1"></div></div><label>Supplier</label><input id="pbiSupplier" placeholder="Opsional"><div class="actions"><button class="good" type="button" onclick="App.petBoardIn()">Catat Kedatangan</button></div>`;

    } else if (tab === "master") {
      const isSuperAdmin = currentUser && currentUser.role === "super_admin";
      const isAdminRole = currentUser && ["admin", "super_admin"].includes(currentUser.role);
      c.innerHTML = `<h3>⚙️ Master Ukuran</h3>
        ${isAdminRole ? `<div class="row"><div><label>Kode</label><input id="pbmCode" placeholder="PB-100x100"></div><div><label>Size Label</label><input id="pbmLabel" placeholder="100×100 cm"></div></div><div class="actions"><button class="good" type="button" onclick="App.addPetBoardMaster()">Tambah</button></div>` : ""}
        <table><thead><tr><th>Kode</th><th>Ukuran</th><th>Unit</th>${isSuperAdmin ? "<th>Aksi</th>" : ""}</tr></thead><tbody>
        ${petMasters.map((m) => `<tr><td><b>${esc(m.code)}</b></td><td>${esc(m.sizeLabel)}</td><td>${esc(m.unit)}</td>${isSuperAdmin ? `<td><button class="bad small" type="button" onclick="App.deletePetBoardMaster('${esc(m.code)}')">Hapus</button></td>` : ""}</tr>`).join("")}
        </tbody></table>`;

    } else if (tab === "report") {
      c.innerHTML = `<h3>📊 Report Pemakaian</h3><div class="actions"><button class="good" type="button" onclick="App.fetchPetReport()">Ambil Report</button></div><div id="petReportList"></div>`;
    }
  },

  async petBoardIn() {
    const boardCode = $("pbiCode")?.value || "";
    const qty = parseFloat($("pbiQty")?.value || "0");
    if (!boardCode || !qty) return toast("Ukuran dan qty wajib");
    try {
      await outbox.enqueue("PET_BOARD_IN", { boardCode, qty, supplier: $("pbiSupplier")?.value || "" }, null);
      await this.syncAfterWrite();
      toast("Pet Board In tercatat ✅");
      this.renderPetBoard();
    } catch (e) { toast("Gagal: " + e.message); }
  },

  async addPetBoardMaster() {
    const code = norm($("pbmCode")?.value || "");
    const label = $("pbmLabel")?.value || "";
    if (!code || !label) return toast("Kode dan label wajib");
    try {
      await api.addPetBoardMaster({ code, sizeLabel: label, unit: "LEMBAR" });
      petMasters = (await api.petBoardMasters()).masters || [];
      toast("Master ditambahkan");
      this.showPetBoardTab("master");
    } catch (e) { toast("Gagal: " + e.message); }
  },

  async deletePetBoardMaster(code) {
    if (!confirm(`Hapus ukuran Pet Board "${code}"?\nJika ada transaksi stok, akan dinonaktifkan saja.`)) return;
    try {
      await api.deletePetBoardMaster(code);
      petMasters = (await api.petBoardMasters()).masters || [];
      toast("Master dihapus/dinonaktifkan ✅");
      this.showPetBoardTab("master");
    } catch (e) { toast("Gagal: " + e.message); }
  },

  async fetchPetReport() {
    try {
      const res = await api.petBoardReport({});
      const rows = res.rows || [];
      const pr = $("petReportList");
      if (!pr) return;
      pr.innerHTML = rows.length
        ? `<div class="actions"><button class="small good" type="button" onclick="App.exportPetReportExcel()">📥 Download Excel (CSV)</button></div>
           <table><thead><tr><th>Tanggal</th><th>Uk Pet Board</th><th>Storage</th><th>Buyer</th><th>Style</th></tr></thead><tbody>${rows.map((r) => `<tr><td>${dt(r.outDate)}</td><td>${esc(r.sizeLabel)}</td><td>${esc(r.storage)}</td><td>${esc(r.buyer)}</td><td>${esc(r.style)}</td></tr>`).join("")}</tbody></table>`
        : `<div class="empty">Belum ada data pemakaian.</div>`;
    } catch (e) { toast("Gagal: " + e.message); }
  },

  exportPetReportExcel() {
    const headers = ["Tanggal", "Ukuran Pet Board", "Tujuan Storage", "Buyer", "Style"];
    const escapeCsv = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const lines = [headers.map(escapeCsv).join(",")];
    // Re-fetch the data we already have
    const rows = [...document.querySelectorAll("#petReportList table tbody tr")];
    rows.forEach((tr) => {
      const cells = [...tr.querySelectorAll("td")].map((td) => escapeCsv(td.textContent.trim()));
      lines.push(cells.join(","));
    });
    const csv = "\uFEFF" + lines.join("\n"); // BOM for Excel UTF-8
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `pet_board_report_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
    toast("Report di-download ✅");
  },

  // -----------------------------------------------------------------
  // STORAGE / MASTER / USERS
  // -----------------------------------------------------------------
  renderStorage() {
    const q = ($("storageSearch")?.value || "").toLowerCase();
    const rows = db.storages.filter((s) => !q || [s.code, s.name, s.area].join(" ").toLowerCase().includes(q));
    const sg = $("storageGrid");
    if (!sg) return;
    sg.innerHTML = rows.map((s) => {
      const count = db.templates.filter((t) => t.currentStorage === s.code && t.status === "DISTRIBUTED").length;
      return `<div class="card" style="border-left:5px solid var(--accent);cursor:pointer" onclick="App.openStorage('${esc(s.code)}')"><b>${esc(s.code)}</b><p>${esc(s.name)}</p><span class="badge">${count} template</span><div class="muted">${esc(s.area || "")}</div></div>`;
    }).join("");
  },

  openStorage(code) {
    const rows = db.templates.filter((t) => t.currentStorage === code && t.status === "DISTRIBUTED");
    this.openModal(`Storage: ${code}`, rows.length
      ? rows.map((t) => `<div class="line-item" style="cursor:pointer" onclick="App.closeModal();App.openTemplateDetail('${esc(t.id)}')"><b>${esc(t.buyer)} · ${esc(t.stylekp)}</b></div>`).join("")
      : `<div class="empty">Storage kosong.</div>`);
  },

  async scanQRStorage() {
    const input = $("storageSearch");
    if (input) input.value = "";
    // Try native BarcodeDetector API (modern Android Chrome)
    if ("BarcodeDetector" in window) {
      try {
        const detector = new BarcodeDetector({ formats: ["qr_code"] });
        this.openModal("📷 Scan QR Storage", `<div id="qrVideoWrap" style="position:relative;width:100%;aspect-ratio:1;background:#000;border-radius:14px;overflow:hidden"><video id="qrVideo" style="width:100%;height:100%;object-fit:cover" autoplay playsinline></video></div><div class="muted" style="text-align:center;margin-top:10px">Arahkan kamera ke QR code storage...</div><div class="actions"><button class="bad small" onclick="App.stopQRScan()">Batal</button></div>`);
        const video = $("qrVideo");
        const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
        video.srcObject = stream;
        video.play();
        const check = async () => {
          try {
            const codes = await detector.detect(video);
            if (codes.length > 0) {
              const code = codes[0].rawValue.trim();
              this.stopQRScan();
              this.openStorageInput(code);
              return;
            }
          } catch (_) {}
          if (video._scanning) requestAnimationFrame(check);
        };
        video._scanning = true;
        video._stream = stream;
        requestAnimationFrame(check);
        return;
      } catch (e) {
        this.closeModal();
      }
    }
    // Fallback: file upload (pick photo of QR code)
    this.openModal("📷 Scan QR Storage", `<div class="muted" style="text-align:center;padding:20px">Kamera QR tidak didukung di browser ini.<br>Pilih foto QR code dari galeri:</div><input type="file" accept="image/*" onchange="App.decodeQRFromFile(this)" style="margin:10px"><div class="actions"><button class="bad small" onclick="App.closeModal()">Batal</button></div>`);
  },

  stopQRScan() {
    const video = $("qrVideo");
    if (video?._stream) {
      video._scanning = false;
      video._stream.getTracks().forEach((t) => t.stop());
    }
    this.closeModal();
  },

  decodeQRFromFile(input) {
    const file = input.files?.[0];
    if (!file) return;
    toast("Memproses QR...");
    // Decode using canvas + qrcode library
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement("canvas");
        const ctx = canvas.getContext("2d");
        canvas.width = img.width;
        canvas.height = img.height;
        ctx.drawImage(img, 0, 0);
        try {
          const imageData = ctx.getImageData(0, 0, img.width, img.height);
          // Use jsQR if available, or try the qrcode lib
          const code = this.decodeQRFromCanvas(canvas);
          if (code) {
            this.closeModal();
            this.openStorageInput(code);
          } else {
            toast("QR tidak terbaca. Coba foto lebih jelas.");
          }
        } catch (e) {
          toast("Gagal baca QR: " + e.message);
        }
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
    input.value = "";
  },

  decodeQRFromCanvas(canvas) {
    // Simple decode: try to read text from the qrcode library
    // Since we have qrcode.min.js (encoder only), we use a simple pixel scan
    // For production, add jsQR library. For now, return null (user types manually)
    return null; // Fallback handled by prompt
  },

  openStorageInput(code) {
    if (!code) code = prompt("Masukkan kode storage:");
    if (!code) return;
    code = code.trim().toUpperCase();
    const s = db.storages.find((x) => x.code === code);
    if (s) {
      this.openStorage(code);
    } else {
      toast(`Storage "${code}" tidak ditemukan di master`);
      const input = $("storageSearch");
      if (input) { input.value = code; this.renderStorage(); }
    }
  },

  renderMaster() {
    const sl = $("storageList");
    if (!sl) return;
    const q = ($("masterStorageFilter")?.value || "").toLowerCase();
    const rows = db.storages.filter((s) => !q || [s.code, s.name, s.area].join(" ").toLowerCase().includes(q));
    sl.innerHTML = rows.length
      ? `<div class="muted">${rows.length} storage dari ${db.storages.length} total</div><table><thead><tr><th>Kode</th><th>Nama</th><th>Area</th><th>Isi</th></tr></thead><tbody>${rows.map((s) => {
          const count = db.templates.filter((t) => t.currentStorage === s.code && t.status === "DISTRIBUTED").length;
          return `<tr><td><b>${esc(s.code)}</b></td><td>${esc(s.name)}</td><td>${esc(s.area || "")}</td><td><span class="badge">${count}</span></td></tr>`;
        }).join("")}</tbody></table>`
      : `<div class="empty">Storage tidak ditemukan.</div>`;
  },

  async addStorage() {
    const code = norm($("stCode")?.value || "");
    const name = ($("stName")?.value || "").trim();
    const area = ($("stArea")?.value || "").trim();
    if (!code || !name) return toast("Kode dan nama wajib");
    if (db.storages.some((s) => s.code === code)) return toast("Kode sudah ada");
    try {
      await outbox.enqueue("ADD_STORAGE", { code, name, area }, async () => { const s = { code, name, area, id: code }; db.storages.push(s); await idb.put(STORES.storages, s); });
      await this.syncAfterWrite();
      $("stCode").value = ""; $("stName").value = ""; $("stArea").value = "";
      toast("Storage ditambahkan ✅");
      this.renderMaster();
    } catch (e) { toast("Gagal: " + e.message); }
  },

  renderUsers() {
    const ul = $("userList");
    if (!ul) return;
    if (!currentUser || currentUser.role !== "super_admin") { ul.innerHTML = `<div class="empty">Khusus super admin.</div>`; return; }
    ul.innerHTML = db.users.length
      ? db.users.map((u) => `<div class="line-item"><b>${esc(u.username)}</b><span>${esc(u.name)} · ${esc(u.role)} · ${u.active ? "aktif" : "nonaktif"}</span></div>`).join("")
      : `<div class="empty">Sync dulu untuk memuat user.</div>`;
  },

  async addUser() {
    if (!currentUser || currentUser.role !== "super_admin") return toast("Khusus super admin");
    const username = ($("newUser")?.value || "").trim().toLowerCase();
    const password = $("newPass")?.value || "";
    if (!username || !password) return toast("Username & password wajib");
    try {
      await api.addUser({ username, password, name: $("newName")?.value || username, role: $("newRole")?.value || "operator" });
      toast("User ditambahkan");
      $("newUser").value = ""; $("newPass").value = ""; $("newName").value = "";
    } catch (e) { toast("Gagal: " + e.message); }
  },

  // -----------------------------------------------------------------
  // UPDATE LAPANGAN per Storage (UPGRADE 4)
  // -----------------------------------------------------------------
  renderFieldUpdate() {
    this.renderFieldUpdateStorageList();
  },

  renderFieldUpdateStorageList() {
    const grid = $("fieldStorageGrid");
    if (!grid) return;
    const q = ($("fieldStorageSearch")?.value || "").toLowerCase();
    const rows = db.storages.filter((s) => !q || [s.code, s.name, s.area].join(" ").toLowerCase().includes(q));
    $("fieldSelectedStorage").value = selectedFieldStorage || "";
    grid.innerHTML = rows.length
      ? rows.map((s) => {
          const count = db.templates.filter((t) => t.currentStorage === s.code && t.status === "DISTRIBUTED").length;
          const sel = selectedFieldStorage === s.code ? "border-color:var(--accent);box-shadow:0 0 0 2px rgba(212,175,55,.2)" : "";
          return `<div class="card" style="border-left:5px solid var(--accent);cursor:pointer;${sel}" onclick="App.selectFieldStorage('${esc(s.code)}')"><b>${esc(s.code)}</b><p>${esc(s.name || "")}</p><span class="badge">${count} template</span><div class="muted">${esc(s.area || "")}</div></div>`;
        }).join("")
      : `<div class="empty">Storage tidak ditemukan.</div>`;
  },

  selectFieldStorage(code) {
    selectedFieldStorage = norm(code);
    const s = db.storages.find((x) => x.code === selectedFieldStorage);
    $("fieldSelectedStorage").value = selectedFieldStorage;
    $("fieldStorageTitle").textContent = s ? `${s.code} · ${s.name || ""}` : selectedFieldStorage;
    $("fieldTemplateFormCard").classList.remove("hidden");
    this.clearFieldTemplateRows();
    this.renderFieldUpdateStorageList();
    toast("Storage dipilih: " + selectedFieldStorage);
  },

  addFieldTemplateRow(data = {}) {
    const box = $("fieldTemplateRows");
    if (!box) return;
    const row = document.createElement("div");
    row.className = "field-row";
    row.innerHTML = `<div class="field-row-grid">
      <div><label>Buyer</label><input class="fr-buyer" placeholder="Buyer" value="${esc(data.buyer || "")}" oninput="App.renderFieldUploadPreview()"></div>
      <div><label>Style / KP</label><input class="fr-style" placeholder="Style/KP" value="${esc(data.stylekp || "")}" oninput="App.renderFieldUploadPreview()"></div>
      <div><label>Part (pisah koma)</label><input class="fr-part" placeholder="FRONT BODY, BACK BODY x2" value="${esc(data.part || "")}" oninput="App.renderFieldUploadPreview()"></div>
      <div><label>Qty</label><input class="fr-qty" type="number" min="1" value="${data.qty || 1}" oninput="App.renderFieldUploadPreview()"></div>
      <button class="bad small" type="button" onclick="this.closest('.field-row').remove();App.renderFieldUploadPreview()">Hapus</button>
    </div>`;
    box.appendChild(row);
    this.renderFieldUploadPreview();
  },

  addFieldTemplateRows(n = 10) {
    for (let i = 0; i < n; i++) this.addFieldTemplateRow();
  },

  clearFieldTemplateRows() {
    const box = $("fieldTemplateRows");
    if (box) box.innerHTML = "";
    this.addFieldTemplateRow();
    this.renderFieldUploadPreview();
  },

  getFieldTemplateRows() {
    const rows = [], errors = [];
    [...document.querySelectorAll("#fieldTemplateRows .field-row")].forEach((r, i) => {
      const buyer = norm(r.querySelector(".fr-buyer")?.value || "");
      const stylekp = norm(r.querySelector(".fr-style")?.value || "");
      const partRaw = norm(r.querySelector(".fr-part")?.value || "");
      const qty = Math.max(1, parseInt(r.querySelector(".fr-qty")?.value) || 1);
      if (!buyer && !stylekp && !partRaw) return;
      const parts = this.parsePartString(partRaw);
      if (parts.length === 1 && qty > 1) parts[0].qty = qty;
      if (!buyer || !stylekp || !parts.length) { errors.push(`Baris ${i+1}: Buyer/Style/Part wajib`); return; }
      rows.push({ buyer, stylekp, parts, storage: selectedFieldStorage, note: "Update lapangan" });
    });
    return { rows, errors };
  },

  parsePartString(text) {
    return String(text || "").split(/[,/]+/).map((x) => x.trim()).filter(Boolean).map((raw) => {
      const m = raw.match(/^(.*?)(?:\s*[xX]\s*(\d+))?$/);
      return { part: norm(m?.[1] || raw), qty: Math.max(1, parseInt(m?.[2] || "1")) };
    }).filter((x) => x.part);
  },

  renderFieldUploadPreview() {
    const box = $("fieldUploadPreview");
    if (!box) return;
    const { rows, errors } = this.getFieldTemplateRows();
    box.innerHTML = `<div class="muted">Preview: ${rows.length} template valid${errors.length ? ` · ${errors.length} error` : ""} → <b>${esc(selectedFieldStorage)}</b></div>` +
      (errors.length ? `<div class="empty">${errors.slice(0,5).map(esc).join("<br>")}</div>` : "") +
      (rows.length ? `<table><thead><tr><th>Buyer</th><th>Style</th><th>Part</th></tr></thead><tbody>${rows.slice(0,20).map((r) => `<tr><td>${esc(r.buyer)}</td><td>${esc(r.stylekp)}</td><td>${esc(r.parts.map((p) => p.part + (p.qty > 1 ? ` x${p.qty}` : "")).join(", "))}</td></tr>`).join("")}</tbody></table>` : "");
  },

  async saveFieldStorageTemplates() {
    if (!selectedFieldStorage) return toast("Pilih storage dulu.");
    const { rows, errors } = this.getFieldTemplateRows();
    if (errors.length) return toast("Masih ada baris belum lengkap");
    if (!rows.length) return toast("Belum ada template diisi.");
    if (!confirm(`Upload ${rows.length} template ke storage ${selectedFieldStorage}?`)) return;
    setBusy(true, "Upload template...");
    try {
      await outbox.enqueue("BULK_IMPORT", { rows, defaultStorage: selectedFieldStorage, forceDefaultStorage: true, createMissingStorage: false, by: currentUser.username }, null);
      await this.syncAfterWrite();
      this.clearFieldTemplateRows();
      toast(`Upload selesai: ${rows.length} template ✅`);
      this.showPage("templateList");
    } catch (e) {
      toast("Gagal: " + e.message);
    } finally {
      setBusy(false);
    }
  },

  // -----------------------------------------------------------------
  // PRINT QR (UPGRADE 3)
  // -----------------------------------------------------------------
  renderPrintQRSelection() {
    const box = $("qrSelection");
    if (!box) return;
    const q = ($("qrSearch")?.value || "").toLowerCase();
    const rows = db.storages.filter((s) => !q || [s.code, s.name, s.area].join(" ").toLowerCase().includes(q));
    box.innerHTML = rows.length
      ? rows.map((s) => `<label class="qr-check-card"><input type="checkbox" ${selectedQR.has(s.code) ? "checked" : ""} onchange="App.toggleQR('${esc(s.code)}',this.checked)"><div><b>${esc(s.code)}</b><span>${esc(s.name)} · ${esc(s.area || "")}</span></div></label>`).join("")
      : `<div class="empty">Tidak ada storage.</div>`;
  },

  toggleQR(code, on) {
    if (on) selectedQR.add(code); else selectedQR.delete(code);
  },

  selectAllQR(on) {
    selectedQR = new Set(on ? db.storages.map((s) => s.code) : []);
    this.renderPrintQRSelection();
  },

  printQR() {
    if (!selectedQR.size) return toast("Pilih storage dulu");
    const list = db.storages.filter((s) => selectedQR.has(s.code));
    const area = $("qrPrintArea");
    area.innerHTML = list.map((s) =>
      `<div class="qr-label"><div class="qr-title">${esc(s.name)}</div><div class="qr-real-holder" id="qr-${esc(s.code)}"></div><div class="qr-code-text">${esc(s.code)}</div><div class="qr-area-text">${esc(s.area || "")}</div></div>`
    ).join("");
    area.classList.remove("hidden");
    // Generate QR codes
    list.forEach((s) => {
      const el = document.getElementById(`qr-${s.code}`);
      if (el && window.QRCode) {
        try { window.QRCode(el, { text: s.code, width: 128, height: 128 }); }
        catch (e) { el.innerHTML = `<div style="font-weight:800;padding:20px;border:2px dashed #000">${esc(s.code)}</div>`; }
      }
    });
    setTimeout(() => window.print(), 400);
  },

  // -----------------------------------------------------------------
  // OUTBOX PANEL (§9.1)
  // -----------------------------------------------------------------
  async renderOutboxPanel() {
    const pending = await outbox.getPending();
    const conflicts = await outbox.getConflicts();
    const pt = $("outboxPendingTitle");
    if (pt) pt.textContent = `Antrian Pending (${pending.length})`;
    const pl = $("outboxPendingList");
    if (pl) pl.innerHTML = pending.length
      ? pending.map((a) => `<div class="line-item"><b>${esc(a.action_type)}</b><span>${esc(JSON.stringify(a.payload).slice(0, 80))}...</span><span class="badge warn">Menunggu sync</span></div>`).join("")
      : `<div class="empty">Tidak ada antrian pending. ✅</div>`;
    const cl = $("outboxConflictList");
    if (cl) cl.innerHTML = conflicts.length
      ? conflicts.map((a) => `<div class="conflict-panel"><b>⚠️ ${esc(a.action_type)} — ${esc(a.status)}</b><div class="muted">${esc(a.conflictReason || a.rejectReason || "Konflik")}</div><div class="actions"><button class="small good" type="button" onclick="App.resolveConflict('${esc(a.client_action_id)}','resend')">Kirim Ulang</button><button class="small bad" type="button" onclick="App.resolveConflict('${esc(a.client_action_id)}','cancel')">Batalkan</button></div></div>`).join("")
      : `<div class="empty">Tidak ada konflik. ✅</div>`;
  },

  async drainOutbox() {
    setBusy(true, "Sinkronisasi...");
    try {
      const { synced } = await outbox.drain();
      toast(`${synced} aksi tersinkron`);
      this.renderOutboxPanel();
      this.updateOutboxBadge();
      if (synced > 0) await this.syncData(null, { silent: true });
    } catch (e) { toast("Gagal sync: " + e.message); } finally { setBusy(false); }
  },

  async resolveConflict(cid, action) {
    await outbox.resolveConflict(cid, action);
    this.renderOutboxPanel();
    this.updateOutboxBadge();
  },
});

// ===========================================================================
// Boot — FIX 7: ordered startup sequence
// ===========================================================================
document.addEventListener("DOMContentLoaded", () => App.init());
