/**
 * IndexedDB wrapper — PRD §9.3
 * Replaces localStorage with structured IndexedDB stores:
 *   - cache_templates, cache_parts, cache_storages, cache_users, cache_movements
 *   - outbox_actions (§9.1 offline queue)
 *   - settings (JWT tokens, session)
 *
 * FIX: All public symbols are now EXPORTED (previously bare const → import resolved to undefined).
 */
const DB_NAME = "cnc_tracker_v2";
const DB_VERSION = 1;

export const STORES = {
  templates: "cache_templates",
  parts: "cache_parts",
  storages: "cache_storages",
  users: "cache_users",
  movements: "cache_movements",
  petMasters: "cache_pet_masters",
  outbox: "outbox_actions",
  settings: "settings",
};

let _db = null;

/**
 * Open (and cache) the IndexedDB connection.
 * Handles stale/closed connections via onversionchange.
 */
export function openDB() {
  if (_db) return Promise.resolve(_db);
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (e) => {
      const db = e.target.result;
      Object.values(STORES).forEach((name) => {
        if (db.objectStoreNames.contains(name)) return;
        if (name === STORES.outbox) {
          db.createObjectStore(name, { keyPath: "client_action_id" });
        } else if (name === STORES.settings) {
          db.createObjectStore(name, { keyPath: "key" });
        } else {
          const store = db.createObjectStore(name, { keyPath: "id" });
          store.createIndex("updatedAt", "updatedAt", { unique: false });
        }
      });
    };
    req.onsuccess = (e) => {
      _db = e.target.result;
      // Invalidate cache if another tab upgrades the DB
      _db.onversionchange = () => {
        try { _db.close(); } catch (_) {}
        _db = null;
      };
      resolve(_db);
    };
    req.onerror = () => reject(req.error);
    req.onblocked = () => reject(new Error("IndexedDB diblokir (tab lain masih terbuka). Tutup tab lain lalu refresh."));
  });
}

/** Get a fresh transaction + object store for a single store name */
function tx(storeName, mode = "readonly") {
  return openDB().then((db) => db.transaction(storeName, mode).objectStore(storeName));
}

// ---------------------------------------------------------------------------
// Generic CRUD — all methods return Promises
// ---------------------------------------------------------------------------
export const idb = {
  async put(store, item) {
    const os = await tx(store, "readwrite");
    return new Promise((res, rej) => {
      const r = os.put(item);
      r.onsuccess = () => res(item);
      r.onerror = () => rej(r.error);
    });
  },

  /**
   * Bulk-put many items in a SINGLE transaction for atomicity.
   * FIX: explicitly holds the transaction open until oncomplete.
   */
  async putMany(store, items) {
    if (!items || !items.length) return [];
    const db = await openDB();
    const transaction = db.transaction(store, "readwrite");
    const os = transaction.objectStore(store);
    items.forEach((item) => os.put(item));
    return new Promise((res, rej) => {
      transaction.oncomplete = () => res(items);
      transaction.onerror = () => rej(transaction.error);
      transaction.onabort = () => rej(transaction.error || new Error("Transaction aborted"));
    });
  },

  async getAll(store) {
    const os = await tx(store);
    return new Promise((res, rej) => {
      const r = os.getAll();
      r.onsuccess = () => res(r.result || []);
      r.onerror = () => rej(r.error);
    });
  },

  async get(store, key) {
    const os = await tx(store);
    return new Promise((res, rej) => {
      const r = os.get(key);
      r.onsuccess = () => res(r.result);
      r.onerror = () => rej(r.error);
    });
  },

  async delete(store, key) {
    const os = await tx(store, "readwrite");
    return new Promise((res, rej) => {
      const r = os.delete(key);
      r.onsuccess = () => res();
      r.onerror = () => rej(r.error);
    });
  },

  async clear(store) {
    const os = await tx(store, "readwrite");
    return new Promise((res, rej) => {
      const r = os.clear();
      r.onsuccess = () => res();
      r.onerror = () => rej(r.error);
    });
  },

  async count(store) {
    const os = await tx(store);
    return new Promise((res, rej) => {
      const r = os.count();
      r.onsuccess = () => res(r.result || 0);
      r.onerror = () => rej(r.error);
    });
  },
};

// ---------------------------------------------------------------------------
// Settings helpers (JWT tokens, session, syncAnchor)
// ---------------------------------------------------------------------------
export const settings = {
  async get(key) {
    const row = await idb.get(STORES.settings, key);
    return row ? row.value : null;
  },
  async set(key, value) {
    return idb.put(STORES.settings, { key, value });
  },
  async remove(key) {
    return idb.delete(STORES.settings, key);
  },
  async clear() {
    return idb.clear(STORES.settings);
  },
};

// ---------------------------------------------------------------------------
// Cache helpers (apply sync delta to IndexedDB)
// ---------------------------------------------------------------------------
export const cache = {
  async applyFullSync(data) {
    if (!data) return;
    // Clear + repopulate each store (order: put-then-no-need-clear for safety)
    await idb.clear(STORES.templates);
    await idb.clear(STORES.parts);
    await idb.clear(STORES.storages);
    await idb.clear(STORES.users);
    await idb.clear(STORES.movements);
    if (data.templates) await idb.putMany(STORES.templates, data.templates);
    if (data.parts) await idb.putMany(STORES.parts, data.parts);
    if (data.storages) await idb.putMany(STORES.storages, data.storages);
    if (data.users) await idb.putMany(STORES.users, data.users);
    if (data.movements) await idb.putMany(STORES.movements, data.movements);
    if (data.masters && data.masters.petBoards) {
      await idb.clear(STORES.petMasters);
      await idb.putMany(STORES.petMasters, data.masters.petBoards);
    }
  },

  async applyDelta(delta) {
    if (!delta) return;
    if (delta.templates) await idb.putMany(STORES.templates, delta.templates);
    if (delta.parts) await idb.putMany(STORES.parts, delta.parts);
    if (delta.storages) await idb.putMany(STORES.storages, delta.storages);
    if (delta.users) await idb.putMany(STORES.users, delta.users);
    if (delta.movements) await idb.putMany(STORES.movements, delta.movements);
  },

  async getAllTemplates() { return idb.getAll(STORES.templates); },
  async getAllParts() { return idb.getAll(STORES.parts); },
  async getAllStorages() { return idb.getAll(STORES.storages); },
  async getAllUsers() { return idb.getAll(STORES.users); },
  async getAllMovements() { return idb.getAll(STORES.movements); },
  async getAllPetMasters() { return idb.getAll(STORES.petMasters); },

  async clearAll() {
    await idb.clear(STORES.templates);
    await idb.clear(STORES.parts);
    await idb.clear(STORES.storages);
    await idb.clear(STORES.users);
    await idb.clear(STORES.movements);
    await idb.clear(STORES.petMasters);
  },
};
