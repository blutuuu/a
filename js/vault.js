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
  const runVersionCheck = function () {
    if (document.hidden) return;
    try {
      const checkTarget = window.location.pathname + "?_chk=" + Date.now();
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
          const metaMatch = htmlText.match(/<meta[^>]*name=["']blutu-build-timestamp["'][^>]*content=["'](\d+)["']/i);
          const legacyMatch = htmlText.match(/blutuBuildTimestamp\s*=\s*(\d+)/);
          const rawTs = (metaMatch && metaMatch[1]) || (legacyMatch && legacyMatch[1]);
          if (rawTs) {
            const serverTimestamp = parseInt(rawTs, 10);
            const localTimestamp = Number(getCurrentBuildTimestamp()) || 0;
            if (serverTimestamp > localTimestamp) {
              const tsStr = String(serverTimestamp);
              const reloadUrl = new URL(window.location.href);
              if (reloadUrl.searchParams.get("_v") === tsStr) return;
              try {
                if (sessionStorage.getItem("blutu_reloaded_build_ts") === tsStr) return;
                sessionStorage.setItem("blutu_reloaded_build_ts", tsStr);
              } catch (e) {}
              reloadUrl.searchParams.set("_v", tsStr);
              window.location.replace(reloadUrl.toString());
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

    /* BÓVEDA INDESTRUCTIBLE DE BLOGS (INDEXEDDB + LOCALSTORAGE RESILIENTE) */
    export const BlutuVault = {
      dbName: 'blutu_permanent_vault_v2',
      storeName: 'blogs_vault',
      _dbPromise: null,

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

      _pendingSavePosts: null,
      _isSavingPosts: false,

      async savePosts(posts) {
        if (!Array.isArray(posts) || posts.length === 0) return;
        this._pendingSavePosts = posts;
        if (this._isSavingPosts) return;
        this._isSavingPosts = true;
        try {
          const db = await this.getDb();
          if (!db) return;
          while (this._pendingSavePosts) {
            const batch = this._pendingSavePosts;
            this._pendingSavePosts = null;
            const cleanPosts = (typeof deduplicatePosts === 'function') ? deduplicatePosts(batch) : batch;
            await new Promise((resolve) => {
              try {
                const tx = db.transaction(this.storeName, 'readwrite');
                const store = tx.objectStore(this.storeName);
                store.clear();
                cleanPosts.forEach(post => {
                  if (post) {
                    const key = String(post.id || (post.title + '_' + (post.dateIso || ''))).trim();
                    if (key) {
                      store.put({ ...post, id: key });
                    }
                  }
                });
                tx.oncomplete = () => resolve();
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
      // 1. Coincidencia directa de ID
      if (idA && idB) {
        if (idA === idB) return true;
        // Dos publicaciones distintas con IDs generados (post_...) no deben colisionar si aún están vacías
        if (idA.startsWith('post_') && idB.startsWith('post_')) return false;
      }
      const titleA = String(a.title || '').trim();
      const titleB = String(b.title || '').trim();
      if (!titleA || !titleB) return false;
      // 2. Coincidencia exacta de Título (insensible a mayúsculas/espacios)
      if (titleA.toLowerCase() === titleB.toLowerCase()) return true;
      // 3. Coincidencia por slug normalizado sin acentos ni puntuación
      const slugA = normalizePostStr(titleA);
      const slugB = normalizePostStr(titleB);
      if (slugA && slugB && slugA === slugB) return true;
      // 4. Coincidencia por combinación de título + fecha (solo cuando ambos tienen título)
      const tdA = normalizePostStr(titleA + (a.dateIso || ''));
      const tdB = normalizePostStr(titleB + (b.dateIso || ''));
      if (tdA && tdB && tdA === tdB) return true;
      return false;
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
        if (norm && !set.has(norm)) {
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

    export function isDeletedPost(p) {
      if (!p || p.isArchived) return true;
      const set = getDeletedPostIdsSet();
      if (set.size === 0) return false;
      const pid = String(p.id || '').trim().toLowerCase();
      if (pid && set.has(pid)) return true;
      const compositeKey = String((p.title || '') + '_' + (p.dateIso || '')).trim().toLowerCase();
      return !!(compositeKey && compositeKey !== '_' && set.has(compositeKey));
    }

    export function deduplicatePosts(postsList) {
      if (!Array.isArray(postsList)) return [];
      const result = [];

      for (const p of postsList) {
        if (!p || p.isArchived || isDeletedPost(p)) continue;
        const existingIndex = result.findIndex(ex => arePostsIdentical(ex, p));

        if (existingIndex >= 0) {
          const ex = result[existingIndex];
          const exTime = ex.updatedAt ? new Date(ex.updatedAt).getTime() : 0;
          const pTime = p.updatedAt ? new Date(p.updatedAt).getTime() : 0;
          const preferP = pTime >= exTime;
          const newer = preferP ? p : ex;
          const older = preferP ? ex : p;

          result[existingIndex] = {
            ...older,
            ...newer,
            id: newer.id || older.id || ('post_' + Date.now()),
            title: (newer.title && newer.title.trim()) || older.title || '',
            date: (newer.date && newer.date.trim()) || older.date || '',
            dateIso: (newer.dateIso && newer.dateIso.trim()) || older.dateIso || '',
            content: (typeof newer.content === 'string' && newer.content.trim()) ? newer.content : (older.content || ''),
            preview: (typeof newer.preview === 'string' && newer.preview.trim()) ? newer.preview : (older.preview || ''),
            image: (typeof newer.image === 'string') ? newer.image : (older.image || ''),
            imageCaption: (typeof newer.imageCaption === 'string') ? newer.imageCaption : (older.imageCaption || ''),
            imageFit: newer.imageFit || older.imageFit || 'cover-center',
            imageAura: newer.imageAura || older.imageAura || '',
            hidden: typeof newer.hidden === 'boolean' ? newer.hidden : (typeof older.hidden === 'boolean' ? older.hidden : false)
          };
        } else {
          result.push({
            ...p,
            id: p.id || ('post_' + Date.now())
          });
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
        p.updatedAt || ''
      ].join(':')).join('|');
    }
