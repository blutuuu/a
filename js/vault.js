/* Blutu — Control de Versión Ligero, Bóveda IndexedDB/LocalStorage y Deduplicación */
export function initVisibilityLifecycle() {
  document.addEventListener("visibilitychange", () => {
    document.body.classList.toggle("page-is-hidden", document.hidden);
  });
}

export function purgeObsoleteLocalStorage() {
  try {
    localStorage.removeItem("blutu_merch_items");
    localStorage.removeItem("blutu_merch_section_visible");
    localStorage.removeItem("blutu_merch_desc");
    localStorage.removeItem("blutu_merch_categories");
    localStorage.removeItem("blutu_cart_config");
    localStorage.removeItem("blutu_live_buttons");
    localStorage.removeItem("blutu_live_section_visible");
    localStorage.removeItem("blutu_live_desc");
  } catch (e) {}
}

export function initFreshServerVersionCheck(getCurrentBuildTimestamp) {
  const isBusyEditingOrSaving = function () {
    if (typeof window === "undefined") return false;
    if (window.isAdminMode) return true;
    if ((Number(window.__pendingCloudSaveCount) || 0) > 0) return true;
    if (hasPendingCloudSyncChanges()) return true;
    const modalIds = ["blogReadModal", "merchDetailModal", "galleryMediaModal", "cartConfigModal", "passwordModal", "adminModal"];
    for (let i = 0; i < modalIds.length; i++) {
      const el = document.getElementById(modalIds[i]);
      if (el && el.style && el.style.display && el.style.display !== "none") return true;
    }
    return false;
  };

  const runVersionCheck = function () {
    if (document.hidden || isBusyEditingOrSaving()) return;
    try {
      const checkTarget = "/index.html?_chk=" + Date.now();
      fetch(checkTarget, {
        method: "GET",
        cache: "no-store",
        headers: {
          "Cache-Control": "no-cache, no-store, must-revalidate",
          "Pragma": "no-cache"
        }
      })
        .then((res) => (res.ok ? res.text() : null))
        .then((htmlText) => {
          if (!htmlText) return;
          if (isBusyEditingOrSaving()) return;
          const metaMatch = htmlText.match(/<meta[^>]*name=["']blutu-build-timestamp["'][^>]*content=["'](\d+)["']/i);
          const legacyMatch = htmlText.match(/blutuBuildTimestamp\s*=\s*(\d+)/);
          const rawTs = (metaMatch && metaMatch[1]) || (legacyMatch && legacyMatch[1]);
          if (rawTs) {
            const serverTimestamp = parseInt(rawTs, 10);
            const localTimestamp = Number(getCurrentBuildTimestamp()) || 0;
            if (serverTimestamp > localTimestamp) {
              const tsStr = String(serverTimestamp);
              const curUrl = new URL(window.location.href);
              if (curUrl.searchParams.get("_v") === tsStr) return;
              try {
                if (sessionStorage.getItem("blutu_reloaded_build_ts") === tsStr) return;
                sessionStorage.setItem("blutu_reloaded_build_ts", tsStr);
              } catch (e) {}
              const cleanPath = decodeURIComponent(curUrl.pathname || "/").replace(/^\/+|\/+$/g, "");
              if (cleanPath && cleanPath !== "index.html" && cleanPath !== "404.html") {
                try { sessionStorage.setItem("blutu_spa_route", cleanPath); } catch (e) {}
                try { window.name = "__blutu_spa__:" + cleanPath; } catch (e) {}
              }
              window.location.replace("/?_v=" + encodeURIComponent(tsStr));
            }
          }
        })
        .catch(() => {});
    } catch (e) {}
  };

  const scheduleIdleCheck = function () {
    if (typeof window.requestIdleCallback === "function") {
      window.requestIdleCallback(runVersionCheck, { timeout: 5000 });
    } else {
      setTimeout(runVersionCheck, 3500);
    }
  };

  if (document.readyState === "complete") {
    scheduleIdleCheck();
  } else {
    window.addEventListener("load", scheduleIdleCheck, { once: true });
  }
}

export function safeSetStorage(key, val) {
  try {
    const data = typeof val === "string" ? val : JSON.stringify(val);
    localStorage.setItem(key, data);
  } catch (e) {}
}

export function safeGetStorage(key, fallback) {
  try {
    const val = localStorage.getItem(key);
    if (val === null) return fallback;
    try { return JSON.parse(val); } catch (e) { return val; }
  } catch (e) {
    return fallback;
  }
}

export function initMobileAppDeepLinks() {
  const applyLinks = () => {
    const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
    const isInstagram = /Instagram|FBAN|FBAV/i.test(navigator.userAgent);
    if (isMobile) {
      const appLinks = document.querySelectorAll("[data-app]");
      appLinks.forEach((link) => {
        const appUri = link.getAttribute("data-app");
        const webUrl = link.getAttribute("data-web") || link.href;
        if (link.classList.contains("ig-btn-single")) {
          if (isInstagram) {
            link.href = webUrl;
            link.removeAttribute("target");
            return;
          }
        }
        if (appUri && (link.classList.contains("spotify") || link.classList.contains("ig-btn-single"))) {
          link.href = appUri;
          link.removeAttribute("target");
        }
      });
    }
  };
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", applyLinks, { once: true });
  } else {
    applyLinks();
  }
}

export function getPostTimestampMs(val) {
  if (!val) return 0;
  if (typeof val === "number") return Number.isFinite(val) ? val : 0;
  if (typeof val === "string") {
    const parsed = Date.parse(val);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  if (val instanceof Date) {
    const ms = val.getTime();
    return Number.isFinite(ms) ? ms : 0;
  }
  if (typeof val === "object") {
    if (typeof val.toMillis === "function") {
      try {
        const ms = val.toMillis();
        return Number.isFinite(ms) ? ms : 0;
      } catch (e) { return 0; }
    }
    if (typeof val.seconds === "number") {
      return (val.seconds * 1000) + Math.floor((Number(val.nanoseconds) || 0) / 1e6);
    }
  }
  return 0;
}

function normalizeStoredTimestampIso(val) {
  if (!val) return "";
  if (typeof val === "string") return val;
  const ms = getPostTimestampMs(val);
  return ms > 0 ? new Date(ms).toISOString() : "";
}

/* COLA DURADERA DE CAMBIOS PENDIENTES DE NUBE (CACHÉ EN RAM + ESCRITURA AMORTIGUADA SIN BLOQUEAR EL HILO PRINCIPAL) */
const UNSYNCED_POSTS_STORAGE_KEY = "blutu_unsynced_posts_map_v1";
const UNSYNCED_SITE_SIG_KEY = "blutu_unsynced_site_sig_v1";

let unsyncedPostsMemCache = null;
let unsyncedSiteSigMemCache = undefined;
let unsyncedPostsDirty = false;
let unsyncedPostsFlushTimer = null;

function ensureUnsyncedPostsMapLoaded() {
  if (unsyncedPostsMemCache !== null) return unsyncedPostsMemCache;
  try {
    const raw = localStorage.getItem(UNSYNCED_POSTS_STORAGE_KEY);
    if (!raw) {
      unsyncedPostsMemCache = {};
      return unsyncedPostsMemCache;
    }
    const parsed = JSON.parse(raw);
    unsyncedPostsMemCache = (parsed && typeof parsed === "object" && !Array.isArray(parsed)) ? parsed : {};
  } catch (e) {
    unsyncedPostsMemCache = {};
  }
  return unsyncedPostsMemCache;
}

function ensureUnsyncedSiteSigLoaded() {
  if (unsyncedSiteSigMemCache !== undefined) return unsyncedSiteSigMemCache;
  try {
    unsyncedSiteSigMemCache = localStorage.getItem(UNSYNCED_SITE_SIG_KEY) || "";
  } catch (e) {
    unsyncedSiteSigMemCache = "";
  }
  return unsyncedSiteSigMemCache;
}

export function flushPendingCloudSyncQueueToStorage() {
  if (unsyncedPostsFlushTimer) {
    clearTimeout(unsyncedPostsFlushTimer);
    unsyncedPostsFlushTimer = null;
  }
  if (!unsyncedPostsDirty || unsyncedPostsMemCache === null) return;
  unsyncedPostsDirty = false;
  try {
    const keys = Object.keys(unsyncedPostsMemCache);
    if (keys.length === 0) {
      localStorage.removeItem(UNSYNCED_POSTS_STORAGE_KEY);
    } else {
      localStorage.setItem(UNSYNCED_POSTS_STORAGE_KEY, JSON.stringify(unsyncedPostsMemCache));
    }
  } catch (e) {}
}

function scheduleFlushUnsyncedPostsMap(immediate = false) {
  unsyncedPostsDirty = true;
  if (immediate) {
    flushPendingCloudSyncQueueToStorage();
    return;
  }
  if (unsyncedPostsFlushTimer) return;
  unsyncedPostsFlushTimer = setTimeout(() => {
    unsyncedPostsFlushTimer = null;
    flushPendingCloudSyncQueueToStorage();
  }, 850);
}

if (typeof window !== "undefined") {
  window.addEventListener("pagehide", flushPendingCloudSyncQueueToStorage, { passive: true });
  window.addEventListener("beforeunload", flushPendingCloudSyncQueueToStorage);
}
if (typeof document !== "undefined") {
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) flushPendingCloudSyncQueueToStorage();
  });
}

export function markPostsPendingCloudSync(posts, options = {}) {
  const list = Array.isArray(posts) ? posts : (posts ? [posts] : []);
  if (list.length === 0) return;
  const mapObj = ensureUnsyncedPostsMapLoaded();
  let changed = false;
  const nowMs = Date.now();
  list.forEach((p) => {
    if (!p || p.isArchived) return;
    const pid = String(p.id || "").trim();
    if (!pid) return;
    const normKey = pid.toLowerCase();
    const updatedIso = normalizeStoredTimestampIso(p.updatedAt) || new Date(nowMs).toISOString();
    mapObj[normKey] = {
      ...p,
      id: pid,
      updatedAt: updatedIso,
      _queuedAtMs: nowMs
    };
    changed = true;
  });
  if (changed) {
    scheduleFlushUnsyncedPostsMap(Boolean(options && options.immediate));
  }
}

export function removePostPendingCloudSync(postOrId) {
  if (!postOrId) return;
  const pid = typeof postOrId === "object" ? String(postOrId.id || "").trim() : String(postOrId || "").trim();
  if (!pid) return;
  const normKey = pid.toLowerCase();
  const mapObj = ensureUnsyncedPostsMapLoaded();
  if (Object.prototype.hasOwnProperty.call(mapObj, normKey)) {
    delete mapObj[normKey];
    scheduleFlushUnsyncedPostsMap(true);
  }
}

export function clearPostsPendingCloudSync(syncedPosts, syncedStartedAtMs = 0) {
  const mapObj = ensureUnsyncedPostsMapLoaded();
  const keys = Object.keys(mapObj);
  if (keys.length === 0) return;
  const syncedById = new Map();
  (Array.isArray(syncedPosts) ? syncedPosts : []).forEach((p) => {
    if (!p || !p.id) return;
    syncedById.set(String(p.id).trim().toLowerCase(), p);
  });
  let changed = false;
  keys.forEach((k) => {
    const queued = mapObj[k];
    if (!queued) {
      delete mapObj[k];
      changed = true;
      return;
    }
    if (syncedById.has(k)) {
      const syncedPost = syncedById.get(k);
      const qTime = getPostTimestampMs(queued.updatedAt);
      const sTime = getPostTimestampMs(syncedPost && syncedPost.updatedAt);
      const notEditedAfterSyncStart = !syncedStartedAtMs || !queued._queuedAtMs || queued._queuedAtMs <= (syncedStartedAtMs + 50);
      if (notEditedAfterSyncStart && (sTime >= qTime || computePostsQuickSignature([queued]) === computePostsQuickSignature([syncedPost]))) {
        delete mapObj[k];
        changed = true;
      }
    }
  });
  if (changed) {
    scheduleFlushUnsyncedPostsMap(true);
  }
}

export function clearAllPendingCloudSync() {
  if (unsyncedPostsFlushTimer) {
    clearTimeout(unsyncedPostsFlushTimer);
    unsyncedPostsFlushTimer = null;
  }
  unsyncedPostsMemCache = {};
  unsyncedSiteSigMemCache = "";
  unsyncedPostsDirty = false;
  try {
    localStorage.removeItem(UNSYNCED_POSTS_STORAGE_KEY);
    localStorage.removeItem(UNSYNCED_SITE_SIG_KEY);
  } catch (e) {}
}

export function getPendingCloudSyncPosts() {
  const mapObj = ensureUnsyncedPostsMapLoaded();
  const keys = Object.keys(mapObj);
  if (keys.length === 0) return [];
  const deletedSet = getDeletedPostIdsSet();
  const out = [];
  keys.forEach((k) => {
    const p = mapObj[k];
    if (!p || p.isArchived) return;
    if (deletedSet.has(k)) return;
    const cleanCopy = { ...p };
    delete cleanCopy._queuedAtMs;
    out.push(cleanCopy);
  });
  return out;
}

export function markSitePatchPendingCloudSync(sig) {
  const nextVal = String(sig || Date.now());
  if (ensureUnsyncedSiteSigLoaded() === nextVal) return;
  unsyncedSiteSigMemCache = nextVal;
  try {
    localStorage.setItem(UNSYNCED_SITE_SIG_KEY, nextVal);
  } catch (e) {}
}

export function clearSitePatchPendingCloudSync(expectedSig = null) {
  const cur = ensureUnsyncedSiteSigLoaded();
  if (!cur) return;
  if (!expectedSig || cur === String(expectedSig)) {
    unsyncedSiteSigMemCache = "";
    try {
      localStorage.removeItem(UNSYNCED_SITE_SIG_KEY);
    } catch (e) {}
  }
}

export function hasPendingCloudSyncChanges() {
  if (ensureUnsyncedSiteSigLoaded()) return true;
  const mapObj = ensureUnsyncedPostsMapLoaded();
  return Object.keys(mapObj).length > 0;
}

    /* BÓVEDA INDESTRUCTIBLE DE BLOGS (INDEXEDDB DELTA-EFICIENTE + LOCALSTORAGE RESILIENTE) */
    export const BlutuVault = {
      dbName: 'blutu_permanent_vault_v2',
      storeName: 'blogs_vault',
      _dbPromise: null,
      _savedPostSigByKey: new Map(),
      _lastPrunedDeletedCount: 0,

      getDb() {
        if (this._dbPromise) return this._dbPromise;
        this._dbPromise = new Promise((resolve) => {
          if (!window.indexedDB) {
            resolve(null);
            return;
          }
          try {
            const req = indexedDB.open(this.dbName, 1);
            req.onupgradeneeded = (e) => {
              const db = e.target.result;
              if (!db.objectStoreNames.contains(this.storeName)) {
                db.createObjectStore(this.storeName, { keyPath: 'id' });
              }
            };
            req.onsuccess = (e) => resolve(e.target.result);
            req.onerror = () => resolve(null);
          } catch(err) {
            resolve(null);
          }
        });
        return this._dbPromise;
      },

      _pendingSavePayload: null,
      _isSavingPosts: false,

      async savePosts(posts, options = {}) {
        if (!Array.isArray(posts)) return;
        const allowPrune = Boolean(options && options.allowPrune);
        if (posts.length === 0 && !allowPrune) return;
        if (this._pendingSavePayload) {
          this._pendingSavePayload = {
            posts,
            allowPrune: this._pendingSavePayload.allowPrune || allowPrune
          };
        } else {
          this._pendingSavePayload = { posts, allowPrune };
        }
        if (this._isSavingPosts) return;
        this._isSavingPosts = true;
        try {
          const db = await this.getDb();
          if (!db) return;
          while (this._pendingSavePayload) {
            const { posts: batch, allowPrune: shouldPrune } = this._pendingSavePayload;
            this._pendingSavePayload = null;
            const cleanPosts = (typeof deduplicatePosts === 'function') ? deduplicatePosts(batch) : batch;
            const deletedSet = getDeletedPostIdsSet();
            const activeKeys = new Set();
            const postsToPut = [];

            cleanPosts.forEach(post => {
              if (post && !post.isArchived) {
                const key = String(post.id || (post.title + '_' + (post.dateIso || ''))).trim();
                if (key && !deletedSet.has(key.toLowerCase())) {
                  activeKeys.add(key);
                  const normalizedPost = { ...post, id: key };
                  const postSig = computePostsQuickSignature([normalizedPost]);
                  if (this._savedPostSigByKey.get(key) !== postSig) {
                    postsToPut.push({ key, normalizedPost, postSig });
                  }
                }
              }
            });

            const needsKeyScan = shouldPrune || (deletedSet.size !== this._lastPrunedDeletedCount);
            if (postsToPut.length === 0 && !needsKeyScan) {
              continue;
            }

            await new Promise((resolve) => {
              try {
                const tx = db.transaction(this.storeName, 'readwrite');
                const store = tx.objectStore(this.storeName);

                postsToPut.forEach(({ normalizedPost }) => {
                  store.put(normalizedPost);
                });

                const keysToDeleteMem = [];
                if (needsKeyScan) {
                  const keysReq = store.getAllKeys();
                  keysReq.onsuccess = () => {
                    const existingKeys = Array.isArray(keysReq.result) ? keysReq.result : [];
                    existingKeys.forEach(existingKey => {
                      const normExisting = String(existingKey || '').trim().toLowerCase();
                      if (deletedSet.has(normExisting) || (shouldPrune && !activeKeys.has(existingKey))) {
                        store.delete(existingKey);
                        keysToDeleteMem.push(existingKey);
                      }
                    });
                  };
                }

                tx.oncomplete = () => {
                  postsToPut.forEach(({ key, postSig }) => {
                    this._savedPostSigByKey.set(key, postSig);
                  });
                  keysToDeleteMem.forEach(k => this._savedPostSigByKey.delete(k));
                  if (needsKeyScan) {
                    this._lastPrunedDeletedCount = deletedSet.size;
                  }
                  resolve();
                };
                tx.onerror = () => resolve();
                tx.onabort = () => resolve();
              } catch (txErr) {
                resolve();
              }
            });
          }
        } catch (e) {
          console.warn('BlutuVault save notice:', e);
        } finally {
          this._isSavingPosts = false;
        }
      },

      async getAllPosts() {
        try {
          const db = await this.getDb();
          if (!db) return [];
          return new Promise((resolve) => {
            const tx = db.transaction(this.storeName, 'readonly');
            const store = tx.objectStore(this.storeName);
            const req = store.getAll();
            req.onsuccess = () => {
              const res = req.result || [];
              const clean = (typeof deduplicatePosts === 'function') ? deduplicatePosts(res) : res;
              clean.forEach(p => {
                if (p && p.id) {
                  this._savedPostSigByKey.set(String(p.id).trim(), computePostsQuickSignature([p]));
                }
              });
              this._lastPrunedDeletedCount = getDeletedPostIdsSet().size;
              resolve(clean);
            };
            req.onerror = () => resolve([]);
          });
        } catch (e) {
          return [];
        }
      }
    };
    window.BlutuVault = BlutuVault;

    export function normalizePostStr(str) {
      if (!str) return '';
      return String(str)
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .replace(/[^a-z0-9]/g, '');
    }

    export function arePostsIdentical(a, b) {
      if (!a || !b) return false;
      const idA = String(a.id || '').trim().toLowerCase();
      const idB = String(b.id || '').trim().toLowerCase();
      // 1. Si ambos tienen ID explícito, SOLO son la misma publicación si comparten exactamente el mismo ID.
      // Esto impide que dos blogs distintos con el mismo título o "Sin Título" se fusionen o borren entre sí.
      if (idA && idB) {
        return idA === idB;
      }
      // 2. Respaldo únicamente para entradas heredadas sin ID: requiere mismo título real + misma fecha
      const titleA = String(a.title || '').trim();
      const titleB = String(b.title || '').trim();
      if (!titleA || !titleB) return false;
      const lowerA = titleA.toLowerCase();
      const lowerB = titleB.toLowerCase();
      if (lowerA === 'sin título' || lowerA === 'sin titulo' || lowerB === 'sin título' || lowerB === 'sin titulo') {
        return false;
      }
      const dateA = String(a.dateIso || '').trim();
      const dateB = String(b.dateIso || '').trim();
      if (dateA && dateB && dateA !== dateB) return false;
      if (lowerA === lowerB) return true;
      const slugA = normalizePostStr(titleA);
      const slugB = normalizePostStr(titleB);
      return Boolean(slugA && slugB && slugA === slugB && dateA === dateB);
    }

    let deletedPostIdsCacheSet = null;

    export function getDeletedPostIdsSet() {
      if (deletedPostIdsCacheSet) return deletedPostIdsCacheSet;
      deletedPostIdsCacheSet = new Set();
      try {
        const storedDel = localStorage.getItem('blutu_deleted_post_ids');
        if (storedDel) {
          const parsed = JSON.parse(storedDel);
          if (Array.isArray(parsed)) {
            parsed.forEach(item => {
              const norm = String(item || '').trim().toLowerCase();
              if (norm) deletedPostIdsCacheSet.add(norm);
            });
          }
        }
      } catch (e) {}
      return deletedPostIdsCacheSet;
    }

    export function setDeletedPostIds(ids) {
      deletedPostIdsCacheSet = new Set(
        (Array.isArray(ids) ? ids : [])
          .map(s => String(s || '').trim().toLowerCase())
          .filter(Boolean)
      );
      try {
        localStorage.setItem('blutu_deleted_post_ids', JSON.stringify(Array.from(deletedPostIdsCacheSet)));
      } catch (e) {}
      return deletedPostIdsCacheSet;
    }

    export function markPostIdsDeleted(ids) {
      const set = getDeletedPostIdsSet();
      let changed = false;
      (Array.isArray(ids) ? ids : [ids]).forEach(raw => {
        const norm = String(raw || '').trim().toLowerCase();
        if (norm && norm !== '_' && !set.has(norm)) {
          set.add(norm);
          changed = true;
        }
      });
      if (changed) {
        try {
          localStorage.setItem('blutu_deleted_post_ids', JSON.stringify(Array.from(set)));
        } catch (e) {}
      }
    }

    export function unmarkPostIdDeleted(id) {
      const norm = String(id || '').trim().toLowerCase();
      if (!norm) return;
      const set = getDeletedPostIdsSet();
      if (set.delete(norm)) {
        try {
          localStorage.setItem('blutu_deleted_post_ids', JSON.stringify(Array.from(set)));
        } catch (e) {}
      }
    }

    export function unmarkPostDeleted(postOrId) {
      if (!postOrId) return;
      if (typeof postOrId === 'string') {
        unmarkPostIdDeleted(postOrId);
        return;
      }
      const set = getDeletedPostIdsSet();
      let changed = false;
      const candidates = [
        postOrId.id,
        ((postOrId.title || '') + '_' + (postOrId.dateIso || ''))
      ];
      candidates.forEach(raw => {
        const norm = String(raw || '').trim().toLowerCase();
        if (norm && set.delete(norm)) {
          changed = true;
        }
      });
      if (changed) {
        try {
          localStorage.setItem('blutu_deleted_post_ids', JSON.stringify(Array.from(set)));
        } catch (e) {}
      }
    }

    export function isDeletedPost(p) {
      if (!p || p.isArchived) return true;
      const set = getDeletedPostIdsSet();
      if (set.size === 0) return false;
      const pid = String(p.id || '').trim().toLowerCase();
      if (pid) {
        return set.has(pid);
      }
      const compositeKey = String((p.title || '') + '_' + (p.dateIso || '')).trim().toLowerCase();
      return Boolean(compositeKey && compositeKey !== '_' && set.has(compositeKey));
    }

    export function deduplicatePosts(postsList) {
      if (!Array.isArray(postsList)) return [];
      const result = [];

      for (const p of postsList) {
        if (!p || p.isArchived || isDeletedPost(p)) continue;
        const existingIndex = result.findIndex(ex => arePostsIdentical(ex, p));

        if (existingIndex >= 0) {
          const ex = result[existingIndex];
          const exTime = getPostTimestampMs(ex.updatedAt || ex.createdAt);
          const pTime = getPostTimestampMs(p.updatedAt || p.createdAt);
          const strictlyNewer = pTime !== exTime;
          // Cuando los timestamps empatan (ej. 0 === 0), el primer elemento en la lista (ej. bóveda/nube entrante) tiene prioridad
          const preferP = pTime > exTime;
          const newer = preferP ? p : ex;
          const older = preferP ? ex : p;
          const bestUpdatedAt = normalizeStoredTimestampIso(newer.updatedAt) || normalizeStoredTimestampIso(older.updatedAt);
          const bestCreatedAt = normalizeStoredTimestampIso(older.createdAt) || normalizeStoredTimestampIso(newer.createdAt);

          const pickStr = (field) => {
            if (strictlyNewer && typeof newer[field] === 'string') return newer[field];
            if (typeof newer[field] === 'string' && newer[field].trim() !== '') return newer[field];
            if (typeof older[field] === 'string' && older[field].trim() !== '') return older[field];
            return typeof newer[field] === 'string' ? newer[field] : (older[field] || '');
          };

          const mergedEntry = {
            ...older,
            ...newer,
            id: String(newer.id || older.id || ('post_' + Date.now())).trim(),
            title: pickStr('title'),
            date: pickStr('date'),
            dateIso: pickStr('dateIso'),
            content: pickStr('content'),
            preview: pickStr('preview'),
            image: strictlyNewer && typeof newer.image === 'string' ? newer.image : (typeof newer.image === 'string' && newer.image !== '' ? newer.image : (older.image || '')),
            imageCaption: strictlyNewer && typeof newer.imageCaption === 'string' ? newer.imageCaption : (typeof newer.imageCaption === 'string' && newer.imageCaption !== '' ? newer.imageCaption : (older.imageCaption || '')),
            imageFit: newer.imageFit || older.imageFit || 'cover-center',
            imageAura: strictlyNewer && typeof newer.imageAura === 'string' ? newer.imageAura : (newer.imageAura || older.imageAura || ''),
            hidden: typeof newer.hidden === 'boolean' ? newer.hidden : (typeof older.hidden === 'boolean' ? older.hidden : false)
          };
          if (bestUpdatedAt) mergedEntry.updatedAt = bestUpdatedAt;
          if (bestCreatedAt) mergedEntry.createdAt = bestCreatedAt;
          result[existingIndex] = mergedEntry;
        } else {
          const entryCopy = {
            ...p,
            id: String(p.id || ('post_' + Date.now())).trim()
          };
          const normUpd = normalizeStoredTimestampIso(p.updatedAt);
          if (normUpd) entryCopy.updatedAt = normUpd;
          const normCre = normalizeStoredTimestampIso(p.createdAt);
          if (normCre) entryCopy.createdAt = normCre;
          result.push(entryCopy);
        }
      }
      return result;
    }
    window.deduplicatePosts = deduplicatePosts;

    export function computePostsQuickSignature(list) {
      if (!Array.isArray(list) || list.length === 0) return '';
      return list.map(p => [
        p.id || '',
        p.title || '',
        p.dateIso || '',
        p.hidden ? '1' : '0',
        p.imageFit || '',
        p.imageAura || '',
        (p.image || '').length,
        p.imageCaption || '',
        p.preview || '',
        (p.content || '').length,
        getPostTimestampMs(p.updatedAt)
      ].join(':')).join('|');
    }
