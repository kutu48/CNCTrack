/**
 * Central Configuration — FIX 1
 * --------------------------------------------------------------------
 * JANGAN PERNAH hardcode URL di file manapun.
 * Semua file WAJIB:  import { CONFIG } from "./config.js";
 *
 * Keuntungan:
 *   localhost   → http://localhost:5000/api
 *   127.0.0.1   → http://127.0.0.1:5000/api
 *   192.168.x.x → http://192.168.x.x:5000/api  (otomatis untuk HP)
 *   VPS domain  → http://vps.company.com:5000/api
 *
 * Override manual (jika perlu port berbeda):
 *   localStorage.setItem("cnc_api_base", "https://api.company.com/api")
 */
const host = window.location.hostname;
const protocol = window.location.protocol;

export const CONFIG = {
  API_BASE:
    localStorage.getItem("cnc_api_base") ||
    `${protocol}//${host}:5000/api`,
};

/**
 * Re-read CONFIG.API_BASE (dipakai setelah user mengubah localStorage).
 */
export function getApiBase() {
  return (
    localStorage.getItem("cnc_api_base") ||
    `${protocol}//${host}:5000/api`
  );
}

/**
 * Override API base manual.
 */
export function setApiBase(url) {
  if (url) localStorage.setItem("cnc_api_base", url.replace(/\/+$/, ""));
  else localStorage.removeItem("cnc_api_base");
}
