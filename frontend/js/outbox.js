/**
 * Offline Outbox — PRD §9.1
 * Every write action goes through the outbox:
 *   1. Store action to IndexedDB outbox_actions with client_action_id (UUID v4)
 *   2. Apply optimistic update to local cache (UI feels instant)
 *   3. When online: drain outbox to POST /api/sync/outbox
 *   4. Server uses client_action_id for idempotency (§6.10)
 *   5. Conflicts shown in "Perlu Ditinjau" panel
 */
import { STORES, idb } from "./db.js";
import { api } from "./api.js";

function uuid() {
  if (crypto.randomUUID) return crypto.randomUUID();
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === "x" ? r : (r & 0x3) | 0x8).toString(16);
  });
}

function isOnline() {
  return navigator.onLine;
}

// Guard against multiple concurrent drains (FIX: previously could double-send)
let _draining = null;

export const outbox = {
  /**
   * Queue an action for the outbox.
   * @param {string} actionType — ADD_TEMPLATE, DISTRIBUTE, MOVE, PET_BOARD_IN, ADD_STORAGE, etc.
   * @param {object} payload    — action data
   * @param {function|null} optimisticFn — local cache update (runs immediately for instant UI)
   * @returns {Promise<string>} client_action_id
   */
  async enqueue(actionType, payload, optimisticFn) {
    const cid = uuid();
    const action = {
      client_action_id: cid,
      action_type: actionType,
      payload,
      status: "pending",
      created_at_client: new Date().toISOString(),
    };

    await idb.put(STORES.outbox, action);

    // Optimistic update — UI reflects change immediately
    if (optimisticFn) {
      try {
        await optimisticFn();
      } catch (e) {
        console.warn("Optimistic update failed (non-fatal):", e);
      }
    }

    // Try to sync immediately if online
    if (isOnline()) {
      this.drain().catch(() => {});
    }

    return cid;
  },

  /**
   * Drain ALL pending actions to server in a single batch.
   * Idempotent — guarded against concurrent calls.
   * Called on: online event, after each enqueue, manual "Sync Sekarang" button.
   */
  async drain() {
    // FIX: guard against concurrent drains
    if (_draining) return _draining;

    const pending = (await idb.getAll(STORES.outbox))
      .filter((a) => a.status === "pending")
      .sort((a, b) => (a.created_at_client || "").localeCompare(b.created_at_client || ""));

    if (!pending.length) {
      return { synced: 0 };
    }

    _draining = (async () => {
      const actions = pending.map((a) => ({
        client_action_id: a.client_action_id,
        action_type: a.action_type,
        payload: a.payload,
      }));

      try {
        const res = await api.outbox(actions);
        const results = res.results || [];

        for (const r of results) {
          const cid = r.client_action_id;
          if (r.status === "applied") {
            // Success — remove from outbox
            await idb.delete(STORES.outbox, cid);
          } else if (r.status === "conflict") {
            // Mark as conflict — show in "Perlu Ditinjau" panel
            const item = await idb.get(STORES.outbox, cid);
            if (item) {
              item.status = "conflict";
              item.conflictReason = r.reason || r.msg || "";
              await idb.put(STORES.outbox, item);
            }
          } else {
            // Rejected — keep for manual review
            const item = await idb.get(STORES.outbox, cid);
            if (item) {
              item.status = "rejected";
              item.rejectReason = r.reason || r.msg || "";
              await idb.put(STORES.outbox, item);
            }
          }
        }

        const synced = results.filter((r) => r.status === "applied").length;
        window.dispatchEvent(new CustomEvent("outbox-synced", { detail: { synced, results } }));
        return { synced, results };
      } catch (e) {
        // Network error — actions stay pending, will retry on next online event
        console.warn("Outbox drain failed (will retry):", e.message);
        return { synced: 0, error: e.message };
      }
    })();

    _draining.finally(() => { _draining = null; });
    return _draining;
  },

  async getPending() {
    return (await idb.getAll(STORES.outbox)).filter((a) => a.status === "pending");
  },

  async getConflicts() {
    const all = await idb.getAll(STORES.outbox);
    return all.filter((a) => a.status === "conflict" || a.status === "rejected");
  },

  async resolveConflict(cid, action) {
    if (action === "cancel") {
      await idb.delete(STORES.outbox, cid);
    } else if (action === "resend") {
      const item = await idb.get(STORES.outbox, cid);
      if (item) {
        item.status = "pending";
        item.conflictReason = "";
        item.rejectReason = "";
        await idb.put(STORES.outbox, item);
        this.drain().catch(() => {});
      }
    }
  },

  async pendingCount() {
    const all = await idb.getAll(STORES.outbox);
    return all.filter((a) => a.status === "pending").length;
  },

  async clearAll() {
    return idb.clear(STORES.outbox);
  },
};

// ---------------------------------------------------------------------------
// Online/offline event listeners (§9.1)
// ---------------------------------------------------------------------------
window.addEventListener("online", () => {
  console.log("🌐 Back online — draining outbox...");
  outbox.drain().then(({ synced }) => {
    if (synced > 0) {
      console.log(`✅ Synced ${synced} offline action(s)`);
      window.dispatchEvent(new CustomEvent("outbox-synced", { detail: { synced } }));
    }
  });
});

// Register Background Sync if supported (§9.1)
if ("serviceWorker" in navigator && "SyncManager" in window) {
  navigator.serviceWorker.ready.then((reg) => {
    reg.sync.register("cnc-outbox-sync").catch(() => {
      // Background Sync not critical — we also drain on 'online' event
    });
  }).catch(() => {});
}
