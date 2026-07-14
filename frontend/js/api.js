/**
 * API wrapper — PRD §9.4 + FIX 1 + FIX 6
 * --------------------------------------------------------------------
 * FIX 1: Semua URL pakai CONFIG.API_BASE dari config.js — tidak ada hardcode.
 * FIX 6: Health check error ditampilkan sebagai "Backend Offline", bukan "Failed to fetch".
 */
import { settings } from "./db.js";
import { getApiBase } from "../config.js";

let _refreshing = null;

async function getTokens() {
  return {
    access: await settings.get("access_token"),
    refresh: await settings.get("refresh_token"),
  };
}

async function refreshToken() {
  if (_refreshing) return _refreshing;
  _refreshing = (async () => {
    const { refresh } = await getTokens();
    if (!refresh) throw new Error("No refresh token");
    const res = await fetch(`${getApiBase()}/auth/refresh`, {
      method: "POST",
      headers: { Authorization: `Bearer ${refresh}` },
    });
    if (!res.ok) throw new Error("Refresh failed");
    const data = await res.json();
    if (data.access_token) {
      await settings.set("access_token", data.access_token);
      return data.access_token;
    }
    throw new Error("No access token in refresh response");
  })();
  _refreshing.finally(() => (_refreshing = null));
  return _refreshing;
}

/**
 * FIX 6: Klasifikasi error yang jelas — bukan "Failed to fetch".
 */
function classifyNetworkError(err) {
  if (navigator.onLine) {
    return {
      type: "backend-offline",
      message: `Backend Offline — tidak dapat terhubung ke ${getApiBase()}. Pastikan backend sedang berjalan.`,
    };
  }
  return {
    type: "offline",
    message: "Offline — aksi tersimpan lokal dan akan tersinkron saat online.",
  };
}

/**
 * Core authenticated fetch. Auto-refresh on 401.
 */
async function apiFetch(path, options = {}) {
  const { access } = await getTokens();
  const headers = { "Content-Type": "application/json", ...(options.headers || {}) };
  if (access) headers["Authorization"] = `Bearer ${access}`;

  let res;
  try {
    res = await fetch(`${getApiBase()}${path}`, { ...options, headers });
  } catch (networkErr) {
    const info = classifyNetworkError(networkErr);
    const err = new Error(info.message);
    err.type = info.type;
    throw err;
  }

  // Auto-refresh on 401
  if (res.status === 401 && !options._retried) {
    try {
      await refreshToken();
      return apiFetch(path, { ...options, _retried: true });
    } catch (_) {
      window.dispatchEvent(new CustomEvent("auth-expired"));
      throw new Error("Sesi berakhir. Silakan login ulang.");
    }
  }

  const text = await res.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    const err = new Error(`Server mengembalikan respons non-JSON (HTTP ${res.status}). URL: ${getApiBase()}`);
    err.type = "backend-error";
    throw err;
  }

  if (!res.ok || data.ok === false) {
    throw new Error(data.msg || data.message || `HTTP ${res.status}`);
  }
  return data;
}

export const api = {
  get base() {
    return getApiBase();
  },

  // ------------------------------------------------------------------
  // AUTH
  // ------------------------------------------------------------------
  async login(username, password) {
    const base = getApiBase();
    let res;
    try {
      res = await fetch(`${base}/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });
    } catch (networkErr) {
      const info = classifyNetworkError(networkErr);
      const err = new Error(info.message);
      err.type = info.type;
      throw err;
    }
    let data;
    try {
      data = await res.json();
    } catch {
      const err = new Error(`Backend Offline atau URL salah: ${base}`);
      err.type = "backend-offline";
      throw err;
    }
    if (!data.ok) throw new Error(data.msg || "Login gagal");
    await settings.set("access_token", data.access_token);
    await settings.set("refresh_token", data.refresh_token);
    await settings.set("user", data.user);
    return data.user;
  },

  async logout() {
    await settings.remove("access_token");
    await settings.remove("refresh_token");
    await settings.remove("user");
  },

  async getCurrentUser() {
    return settings.get("user");
  },

  // ------------------------------------------------------------------
  // SYNC (PRD §8)
  // ------------------------------------------------------------------
  sync(since, days) {
    const qs = since
      ? `since=${encodeURIComponent(since)}&days=${days || 7}`
      : `days=${days || 7}`;
    return apiFetch(`/sync?${qs}`);
  },

  outbox(actions) {
    return apiFetch("/sync/outbox", { method: "POST", body: JSON.stringify({ actions }) });
  },

  // ------------------------------------------------------------------
  // TEMPLATES (PRD §8)
  // ------------------------------------------------------------------
  addTemplate(d) { return apiFetch("/templates", { method: "POST", body: JSON.stringify(d) }); },
  updateTemplate(id, d) { return apiFetch(`/templates/${id}`, { method: "PUT", body: JSON.stringify(d) }); },
  distribute(id, d) { return apiFetch(`/templates/${id}/distribute`, { method: "POST", body: JSON.stringify(d) }); },
  move(id, d) { return apiFetch(`/templates/${id}/move`, { method: "POST", body: JSON.stringify(d) }); },
  bulkImport(d) { return apiFetch("/templates/bulk-import", { method: "POST", body: JSON.stringify(d) }); },
  getSketches(id) { return apiFetch(`/templates/${id}/sketches`); },
  async uploadSketches(id, formData) {
    const { access } = await getTokens();
    const res = await fetch(`${getApiBase()}/templates/${id}/sketches`, {
      method: "POST",
      headers: access ? { Authorization: `Bearer ${access}` } : {},
      body: formData,
    });
    return res.json();
  },

  // ------------------------------------------------------------------
  // MOVEMENTS
  // ------------------------------------------------------------------
  movements(params) { return apiFetch(`/movements?${new URLSearchParams(params)}`); },

  // ------------------------------------------------------------------
  // STORAGES
  // ------------------------------------------------------------------
  addStorage(d) { return apiFetch("/storages", { method: "POST", body: JSON.stringify(d) }); },
  listStorages() { return apiFetch("/storages"); },

  // ------------------------------------------------------------------
  // USERS
  // ------------------------------------------------------------------
  addUser(d) { return apiFetch("/users", { method: "POST", body: JSON.stringify(d) }); },
  resetPassword(u, d) { return apiFetch(`/users/${u}/reset-password`, { method: "POST", body: JSON.stringify(d) }); },

  // ------------------------------------------------------------------
  // PET/PVC BOARD (PRD §5.2)
  // ------------------------------------------------------------------
  petBoardMasters() { return apiFetch("/pet-boards/masters"); },
  addPetBoardMaster(d) { return apiFetch("/pet-boards/masters", { method: "POST", body: JSON.stringify(d) }); },
  deletePetBoardMaster(code) { return apiFetch(`/pet-boards/masters/${code}`, { method: "DELETE" }); },
  petBoardStock() { return apiFetch("/pet-boards/stock"); },
  petBoardIn(d) { return apiFetch("/pet-boards/in", { method: "POST", body: JSON.stringify(d) }); },
  petBoardOut(d) { return apiFetch("/pet-boards/out", { method: "POST", body: JSON.stringify(d) }); },
  petBoardReport(params) { return apiFetch(`/pet-boards/report?${new URLSearchParams(params)}`); },

  // ------------------------------------------------------------------
  // MASTERS (autocomplete)
  // ------------------------------------------------------------------
  masters(type) { return apiFetch(`/masters/${type}`); },
};
