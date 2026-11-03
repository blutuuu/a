/* Blutu — Núcleo de Interfaz, Secciones, Galerías, Pensamientos, Merch y Carrito */
import {
  BLUTU_BUILD_TIMESTAMP,
  DEFAULT_POSTS_DATA,
  DEFAULT_GALLERIES_DATA,
  DEFAULT_LIVE_BUTTONS_DATA,
  DEFAULT_MERCH_ITEMS_DATA,
  DEFAULT_MERCH_CATEGORIES,
  DEFAULT_CART_CONFIG,
  cloneSiteDefault,
  buildDefaultGothicCardSvgDataUri,
  collectDefaultMemoramaPairImages,
  createDefaultGamesData,
  normalizeGamesData
} from "./data-defaults.js";

import {
  initVisibilityLifecycle,
  purgeObsoleteLocalStorage,
  initFreshServerVersionCheck,
  safeSetStorage,
  safeGetStorage,
  initMobileAppDeepLinks,
  BlutuVault,
  normalizePostStr,
  arePostsIdentical,
  getDeletedPostIdsSet,
  setDeletedPostIds,
  markPostIdsDeleted,
  unmarkPostIdDeleted,
  unmarkPostDeleted,
  isDeletedPost,
  deduplicatePosts,
  computePostsQuickSignature,
  markPostsPendingCloudSync,
  removePostPendingCloudSync,
  clearAllPendingCloudSync,
  getPendingCloudSyncPosts,
  flushPendingCloudSyncQueueToStorage
} from "./vault.js";

var isAdminMode = false;
let currentBlogPage = 0;
let isInitialScriptReady = false;
let hasRevealedMoreSections = false;
let hasRevealedMuchMoreSections = false;
let isRevealingMoreSections = false;
let isRevealingMuchMoreSections = false;
let moreRevealTimers = [];
let blutuBuildTimestamp = BLUTU_BUILD_TIMESTAMP;

let postsData = cloneSiteDefault(DEFAULT_POSTS_DATA);
let galleriesData = cloneSiteDefault(DEFAULT_GALLERIES_DATA);
let liveButtonsData = cloneSiteDefault(DEFAULT_LIVE_BUTTONS_DATA);
let merchItemsData = cloneSiteDefault(DEFAULT_MERCH_ITEMS_DATA);
let merchCategories = cloneSiteDefault(DEFAULT_MERCH_CATEGORIES);
let cartConfig = cloneSiteDefault(DEFAULT_CART_CONFIG);

let isMerchSectionVisible = true;
let merchSectionDescription = "Con las tres B";
let currentMerchPage = 0;
let currentMerchCategory = "Todas";
let cartItems = [];
let appliedCouponCode = "";
let customerCartNote = "";
let fixedGalleryOrder = Object.keys(galleriesData || {});

let isLiveSectionVisible = false;
let liveSectionDescription = "Emisiones y transmisiones en directo";
let currentLivePage = 0;

let isGamesSectionVisible = true;
let isBuzonSectionVisible = true;
let hiddenCommentIds = [];
let currentGameBlogKey = null;
let gamesData = createDefaultGamesData();

// Enlaces reactivos bidireccionales en window para sincronización con Firebase y módulos bajo demanda
Object.defineProperties(window, {
  isAdminMode: { configurable: true, get: () => isAdminMode, set: (v) => { isAdminMode = Boolean(v); } },
  postsData: { configurable: true, get: () => postsData, set: (v) => { postsData = v; } },
  galleriesData: { configurable: true, get: () => galleriesData, set: (v) => { galleriesData = v; } },
  liveButtonsData: { configurable: true, get: () => liveButtonsData, set: (v) => { liveButtonsData = v; } },
  merchItemsData: { configurable: true, get: () => merchItemsData, set: (v) => { merchItemsData = v; } },
  merchCategories: { configurable: true, get: () => merchCategories, set: (v) => { merchCategories = v; } },
  cartConfig: { configurable: true, get: () => cartConfig, set: (v) => { cartConfig = v; } },
  isLiveSectionVisible: { configurable: true, get: () => isLiveSectionVisible, set: (v) => { isLiveSectionVisible = Boolean(v); } },
  liveSectionDescription: { configurable: true, get: () => liveSectionDescription, set: (v) => { liveSectionDescription = String(v ?? ""); } },
  isMerchSectionVisible: { configurable: true, get: () => isMerchSectionVisible, set: (v) => { isMerchSectionVisible = Boolean(v); } },
  merchSectionDescription: { configurable: true, get: () => merchSectionDescription, set: (v) => { merchSectionDescription = String(v ?? ""); } },
  isGamesSectionVisible: { configurable: true, get: () => isGamesSectionVisible, set: (v) => { isGamesSectionVisible = Boolean(v); } },
  isBuzonSectionVisible: { configurable: true, get: () => isBuzonSectionVisible, set: (v) => { isBuzonSectionVisible = Boolean(v); } },
  hiddenCommentIds: { configurable: true, get: () => hiddenCommentIds, set: (v) => { hiddenCommentIds = Array.isArray(v) ? v : []; } },
  gamesData: { configurable: true, get: () => gamesData, set: (v) => { gamesData = v; } },
  currentGameBlogKey: { configurable: true, get: () => currentGameBlogKey, set: (v) => { currentGameBlogKey = v; } },
  hasRevealedMoreSections: { configurable: true, get: () => hasRevealedMoreSections, set: (v) => { hasRevealedMoreSections = Boolean(v); } },
  hasRevealedMuchMoreSections: { configurable: true, get: () => hasRevealedMuchMoreSections, set: (v) => { hasRevealedMuchMoreSections = Boolean(v); } },
  blutuBuildTimestamp: { configurable: true, get: () => blutuBuildTimestamp, set: (v) => { blutuBuildTimestamp = Number(v) || BLUTU_BUILD_TIMESTAMP; } }
});

window.normalizeGamesData = normalizeGamesData;
window.buildDefaultGothicCardSvgDataUri = buildDefaultGothicCardSvgDataUri;
window.collectDefaultMemoramaPairImages = collectDefaultMemoramaPairImages;

initVisibilityLifecycle();
purgeObsoleteLocalStorage();
initFreshServerVersionCheck(() => blutuBuildTimestamp);
initMobileAppDeepLinks();

    function reconcileAndMergePosts(incomingPosts, skipRender = false) {
      if (!Array.isArray(incomingPosts) || incomingPosts.length === 0) return;

      const current = Array.isArray(window.postsData) && window.postsData.length > 0 
        ? window.postsData 
        : postsData;

      const pendingUnsynced = getPendingCloudSyncPosts();
      const cleanCurrent = deduplicatePosts(current);
      const cleanIncoming = deduplicatePosts(incomingPosts);
      const prevSig = computePostsQuickSignature(cleanCurrent);

      // Fusión priorizando primero cambios locales pendientes de nube, luego bóveda/cloud entrante, luego memoria
      const merged = deduplicatePosts([...pendingUnsynced, ...cleanIncoming, ...cleanCurrent])
        .sort((a, b) => new Date(b.dateIso || 0) - new Date(a.dateIso || 0));
      const nextSig = computePostsQuickSignature(merged);

      postsData = merged;
      window.postsData = merged;

      if (nextSig === prevSig) {
        if (isInitialScriptReady && typeof checkPendingSharedDeepLink === 'function') {
          checkPendingSharedDeepLink();
        }
        return;
      }

      // Actualizar bóvedas locales solo cuando realmente hubo cambios
      try {
        localStorage.setItem('blutu_permanent_posts_vault', JSON.stringify(merged));
        const liveRaw = localStorage.getItem('blutu_live_site_data');
        if (liveRaw) {
          const parsedLive = JSON.parse(liveRaw);
          parsedLive.posts = merged;
          localStorage.setItem('blutu_live_site_data', JSON.stringify(parsedLive));
        }
        if (typeof BlutuVault !== 'undefined' && BlutuVault.savePosts) {
          BlutuVault.savePosts(merged);
        }
      } catch(e) {}

      // Re-renderizar componentes de blog solo cuando la inicialización del script esté lista
      if (!skipRender && isInitialScriptReady) {
        if (typeof renderBlogPosts === 'function') renderBlogPosts();
        if (typeof populatePostSelect === 'function') populatePostSelect();
        if (typeof renderAdminPostsList === 'function') renderAdminPostsList();
        if (typeof checkPendingSharedDeepLink === 'function') checkPendingSharedDeepLink();
      }
    }
    window.reconcileAndMergePosts = reconcileAndMergePosts;

    try {
      const storedHidden = localStorage.getItem('blutu_hidden_comments');
      if (storedHidden) {
        const parsed = JSON.parse(storedHidden);
        if (Array.isArray(parsed)) {
          parsed.forEach(id => {
            if (!hiddenCommentIds.includes(id)) hiddenCommentIds.push(id);
          });
        }
      }
      const storedBuzonVis = localStorage.getItem('blutu_buzon_visible');
      if (storedBuzonVis !== null) {
        isBuzonSectionVisible = (storedBuzonVis === 'true');
      }
      const storedGamesVis = localStorage.getItem('blutu_games_visible');
      if (storedGamesVis !== null) {
        isGamesSectionVisible = (storedGamesVis === 'true');
      }
      const storedGamesLocal = localStorage.getItem('blutu_games_data');
      if (storedGamesLocal) {
        gamesData = normalizeGamesData(JSON.parse(storedGamesLocal));
      }
    } catch (e) {
      console.warn('Error reading buzon storage:', e);
    }

    /* CARGAR ESTADO EN TIEMPO REAL DESDE CACHÉ LOCAL SI EXISTE */
    try {
      const cachedSiteData = localStorage.getItem('blutu_live_site_data');
      if (cachedSiteData) {
        const parsed = JSON.parse(cachedSiteData);
        if (parsed.posts && Array.isArray(parsed.posts) && parsed.posts.length > 0) {
          postsData = deduplicatePosts(parsed.posts);
        }
        if (parsed.galleries && typeof parsed.galleries === 'object' && Object.keys(parsed.galleries).length > 0) {
          galleriesData = parsed.galleries;
        }
        if (parsed.galleryOrder && Array.isArray(parsed.galleryOrder) && parsed.galleryOrder.length > 0) {
          window.galleryOrder = parsed.galleryOrder;
          fixedGalleryOrder = [...parsed.galleryOrder];
        }
        if (parsed.live) {
          if (Array.isArray(parsed.live.buttons)) liveButtonsData = parsed.live.buttons;
          if (typeof parsed.live.isVisible === 'boolean') isLiveSectionVisible = parsed.live.isVisible;
          if (typeof parsed.live.description === 'string') liveSectionDescription = parsed.live.description;
        }
        if (parsed.merch) {
          if (Array.isArray(parsed.merch.items)) merchItemsData = parsed.merch.items;
          if (Array.isArray(parsed.merch.categories)) merchCategories = parsed.merch.categories;
          if (parsed.merch.cartConfig && typeof parsed.merch.cartConfig === 'object') cartConfig = { ...cartConfig, ...parsed.merch.cartConfig };
          if (typeof parsed.merch.isVisible === 'boolean') isMerchSectionVisible = parsed.merch.isVisible;
          if (typeof parsed.merch.description === 'string') merchSectionDescription = parsed.merch.description;
        }
        const buzonOrMuro = parsed.muro || parsed.buzon;
        if (buzonOrMuro) {
          if (typeof buzonOrMuro.isVisible === 'boolean') isBuzonSectionVisible = buzonOrMuro.isVisible;
          if (typeof buzonOrMuro.gamesVisible === 'boolean') isGamesSectionVisible = buzonOrMuro.gamesVisible;
          if (Array.isArray(buzonOrMuro.hiddenCommentIds)) hiddenCommentIds = buzonOrMuro.hiddenCommentIds;
          if (buzonOrMuro.gamesData && typeof buzonOrMuro.gamesData === 'object') {
            gamesData = normalizeGamesData(buzonOrMuro.gamesData);
          }
        }
      }

      // Cargar también desde la bóveda permanente de publicaciones sanitizada + cola pendiente de nube
      const permVault = localStorage.getItem('blutu_permanent_posts_vault');
      const pendingBootPosts = getPendingCloudSyncPosts();
      let vaultList = [];
      if (permVault) {
        const parsedVault = JSON.parse(permVault);
        if (Array.isArray(parsedVault) && parsedVault.length > 0) {
          vaultList = deduplicatePosts(parsedVault);
        }
      }
      if (pendingBootPosts.length > 0 || vaultList.length > 0) {
        postsData = deduplicatePosts([...pendingBootPosts, ...vaultList, ...postsData])
          .sort((a, b) => new Date(b.dateIso || 0) - new Date(a.dateIso || 0));
      }
    } catch (e) {
      console.warn('Error reading blutu_live_site_data cache:', e);
    }

    // Asegurar que postsData en memoria esté 100% libre de duplicados
    postsData = deduplicatePosts([...getPendingCloudSyncPosts(), ...postsData]);
    window.postsData = postsData;

    // Cargar de forma resiliente desde IndexedDB BlutuVault saneado
    if (typeof BlutuVault !== 'undefined') {
      BlutuVault.getAllPosts().then(dbPosts => {
        if (Array.isArray(dbPosts) && dbPosts.length > 0) {
          reconcileAndMergePosts(dbPosts);
        }
      }).catch(() => {});
    }

// ---------------------------------------------------------------------------
// PUENTES DE CARGA DIFERIDA BAJO DEMANDA (EASTER EGG, JUEGOS Y MODALES ADMIN)
// ---------------------------------------------------------------------------
let easterEggModulePromise = null;
let easterEggModuleRef = null;
let gestureUnlockAudioCtx = null;
let escalerasUrlWarmupStarted = false;
const FALLBACK_ESCALERAS_AUDIO_URL = "https://audio-ssl.itunes.apple.com/itunes-assets/AudioPreview221/v4/ec/fb/45/ecfb4526-93d2-03e7-c901-a297111f1458/mzaf_14659704648749163645.plus.aac.p.m4a";

function warmUpEscalerasStreamUrlOnce() {
  if (escalerasUrlWarmupStarted) return;
  escalerasUrlWarmupStarted = true;
  try {
    if (sessionStorage.getItem("blutu_escaleras_audio_url")) return;
  } catch (e) {}
  fetch("https://itunes.apple.com/lookup?id=6773560493&entity=song", { mode: "cors", credentials: "omit" })
    .then((r) => (r.ok ? r.json() : null))
    .then((data) => {
      const hit = data && Array.isArray(data.results) ? data.results.find((it) => it && it.previewUrl) : null;
      if (hit && hit.previewUrl) {
        try { sessionStorage.setItem("blutu_escaleras_audio_url", hit.previewUrl); } catch (e) {}
      }
    })
    .catch(() => {});
}

function preloadEasterEggModule() {
  warmUpEscalerasStreamUrlOnce();
  if (!easterEggModulePromise) {
    easterEggModulePromise = import("./easter-egg.js").then((mod) => {
      easterEggModuleRef = mod;
      return mod;
    }).catch((err) => {
      easterEggModulePromise = null;
      console.error("Error cargando Easter Egg:", err);
      return null;
    });
  }
  return easterEggModulePromise;
}

function primeSynchronousGestureAudio() {
  try {
    if (navigator.audioSession && navigator.audioSession.type !== "playback") {
      navigator.audioSession.type = "playback";
    }
  } catch (e) {}
  try {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (AudioCtx) {
      if (!gestureUnlockAudioCtx || gestureUnlockAudioCtx.state === "closed") {
        gestureUnlockAudioCtx = new AudioCtx();
      }
      if (gestureUnlockAudioCtx.state === "suspended") {
        gestureUnlockAudioCtx.resume().catch(() => {});
      }
      const buf = gestureUnlockAudioCtx.createBuffer(1, 1, 22050);
      const src = gestureUnlockAudioCtx.createBufferSource();
      src.buffer = buf;
      src.connect(gestureUnlockAudioCtx.destination);
      src.start(0);
    }
  } catch (e) {}
  try {
    if (!window.__blutuPrimedGestureAudio) {
      let streamUrl = FALLBACK_ESCALERAS_AUDIO_URL;
      try {
        const cached = sessionStorage.getItem("blutu_escaleras_audio_url");
        if (cached && /^https:\/\//i.test(cached)) streamUrl = cached;
      } catch (e) {}
      const a = document.createElement("audio");
      a.id = "blutu-shared-direct-audio";
      a.preload = "auto";
      a.loop = true;
      a.playsInline = true;
      a.setAttribute("playsinline", "");
      a.setAttribute("webkit-playsinline", "");
      a.style.display = "none";
      a.volume = 0.88;
      a.muted = Boolean(window.__blutuSharedMusicMuted);
      a.src = streamUrl;
      if (document.body) {
        document.body.appendChild(a);
      }
      if (!a.muted) {
        const p = a.play();
        if (p && typeof p.catch === "function") p.catch(() => {});
      }
      window.__blutuPrimedGestureAudio = a;
    }
  } catch (e) {}
}

const logoBtnEl = document.getElementById("logoBtn");
if (logoBtnEl) {
  logoBtnEl.addEventListener("pointerenter", preloadEasterEggModule, { passive: true, once: true });
  logoBtnEl.addEventListener("touchstart", preloadEasterEggModule, { passive: true, once: true });
  logoBtnEl.addEventListener("pointerdown", preloadEasterEggModule, { passive: true });
  logoBtnEl.addEventListener("click", (ev) => {
    ev.preventDefault();
    if (easterEggModuleRef && typeof easterEggModuleRef.initBlutuDinoEasterEgg === "function") {
      easterEggModuleRef.initBlutuDinoEasterEgg();
      return;
    }
    primeSynchronousGestureAudio();
    preloadEasterEggModule().then((mod) => {
      if (mod && typeof mod.initBlutuDinoEasterEgg === "function") {
        mod.initBlutuDinoEasterEgg();
      }
    });
  });
}

let gamesEngineModulePromise = null;
let gamesEngineModuleRef = null;

function ensureGamesEngineLoaded() {
  warmUpEscalerasStreamUrlOnce();
  if (!gamesEngineModulePromise) {
    gamesEngineModulePromise = import("./games-engine.js").then((mod) => {
      gamesEngineModuleRef = mod;
      return mod;
    }).catch((err) => {
      gamesEngineModulePromise = null;
      console.error("Error cargando motor de juegos:", err);
      return null;
    });
  }
  return gamesEngineModulePromise;
}

function destroyActiveMiniGame() {
  if (gamesEngineModuleRef && typeof gamesEngineModuleRef.destroyActiveMiniGame === "function") {
    gamesEngineModuleRef.destroyActiveMiniGame();
  }
}

function launchMiniGameFromBlog(gameType, mode) {
  window.__isMiniGameScreenOpen = true;
  if (typeof window.clearActiveBatParticles === "function") {
    window.clearActiveBatParticles();
  }
  const modalBodyEl = document.getElementById("blogModalBody");
  if (modalBodyEl && typeof resetBlogParagraphRevealState === "function") {
    resetBlogParagraphRevealState(modalBodyEl);
  }
  if (gamesEngineModuleRef && typeof gamesEngineModuleRef.launchMiniGameFromBlog === "function") {
    gamesEngineModuleRef.launchMiniGameFromBlog(gameType, mode);
    return;
  }
  primeSynchronousGestureAudio();
  ensureGamesEngineLoaded().then((mod) => {
    if (mod && typeof mod.launchMiniGameFromBlog === "function") {
      mod.launchMiniGameFromBlog(gameType, mode);
    } else {
      window.__isMiniGameScreenOpen = false;
    }
  });
}

function exitMiniGameVolver() {
  if (gamesEngineModuleRef && typeof gamesEngineModuleRef.exitMiniGameVolver === "function") {
    gamesEngineModuleRef.exitMiniGameVolver();
  } else {
    closeBlogModal(true);
  }
}

let adminModalsModulePromise = null;
let adminModalsModuleRef = null;

function ensureAdminModalsReady() {
  const adminCssLink = document.getElementById("blutuAdminStylesheet");
  if (adminCssLink && adminCssLink.media !== "all") adminCssLink.media = "all";
  if (adminModalsModuleRef) {
    adminModalsModuleRef.ensureAdminModalsMounted();
    return Promise.resolve(adminModalsModuleRef);
  }
  if (!adminModalsModulePromise) {
    adminModalsModulePromise = import("./admin-modals.js").then((mod) => {
      adminModalsModuleRef = mod;
      mod.ensureAdminModalsMounted();
      return mod;
    }).catch((err) => {
      adminModalsModulePromise = null;
      console.error("Error cargando modales de administración:", err);
      return null;
    });
  }
  return adminModalsModulePromise;
}
window.ensureAdminModalsReady = ensureAdminModalsReady;

function getAdminPanelHTML() {
  if (adminModalsModuleRef && typeof adminModalsModuleRef.getAdminPanelHTML === "function") {
    return adminModalsModuleRef.getAdminPanelHTML();
  }
  ensureAdminModalsReady();
  return "";
}

try {
  if (sessionStorage.getItem("blutu_admin_logged") === "true") {
    ensureAdminModalsReady();
  }
} catch (e) {}

    function escapeHtmlText(str) {
      if (str === null || str === undefined) return '';
      return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
    }

    function computeAutoPostPreview(contentStr) {
      if (!contentStr) return '';
      let previewText = String(contentStr)
        .replace(/\[img:\s*[^\]]+\]/gi, '')
        .replace(/\[\/?center\]/gi, '')
        .replace(/\[center:\s*([^\]]+)\]/gi, '$1')
        .replace(/^#\s+/gm, '')
        .replace(/\*\*(.*?)\*\*/g, '$1')
        .replace(/\[color:\s*[^|]+\|([^\]]+)\]/gi, '$1')
        .replace(/\[link:\s*[^|]+\|([^\]]+)\]/gi, '$2')
        .replace(/\[([^\]]+)\]\(([^\s\)]+)\)/gi, '$1')
        .trim();
      if (previewText.length > 120) previewText = previewText.substring(0, 120) + '...';
      return previewText;
    }

    /* RENDERIZADO DE BLOGS CON PAGINACIÓN HORIZONTAL (3 BLOGS POR PÁGINA EN UNA SOLA LÁPIDA) */
    function getBlogsPerPage() {
      return 3;
    }

    function getVisibleBlogPosts() {
      const source = deduplicatePosts(Array.isArray(window.postsData) ? window.postsData : postsData);
      return (typeof isAdminMode !== 'undefined' && isAdminMode) ? source : source.filter(post => !post.hidden);
    }

    function parsePostImageCrop(fitVal) {
      const raw = String(fitVal || '').trim();
      if (raw.startsWith('crop:')) {
        const parts = raw.slice(5).split(',');
        if (parts.length >= 4) {
          const axis = parts[0] === 'h' ? 'h' : 'w';
          const z = parseFloat(parts[1]);
          const x = parseFloat(parts[2]);
          const y = parseFloat(parts[3]);
          if (Number.isFinite(z) && z > 0.1 && Number.isFinite(x) && Number.isFinite(y)) {
            return { isCrop: true, axis, z, x, y };
          }
        }
      }
      return { isCrop: false, mode: raw || 'cover-center' };
    }

    function getFitCssForPost(fitVal) {
      const parsed = parsePostImageCrop(fitVal);
      if (parsed.isCrop) {
        const sizeRule = parsed.axis === 'h'
          ? 'width: auto; height: 100%;'
          : 'width: 100%; height: auto;';
        return `${sizeRule} max-width: none; max-height: none; position: absolute; left: 50%; top: 50%; transform-origin: center center; transform: translate3d(calc(-50% + ${parsed.x.toFixed(2)}%), calc(-50% + ${parsed.y.toFixed(2)}%), 0) scale(${parsed.z.toFixed(3)});`;
      }
      if (parsed.mode === 'contain') return 'object-fit: contain; object-position: center center; background: #050508;';
      if (parsed.mode === 'cover-top') return 'object-fit: cover; object-position: center top;';
      if (parsed.mode === 'cover-bottom') return 'object-fit: cover; object-position: center bottom;';
      return 'object-fit: cover; object-position: center center;';
    }

    function formatPreviewTitleUnbroken(titleStr) {
      const escaped = escapeHtmlText(String(titleStr || '').trim());
      return escaped.replace(/(\S)-(\S)/g, '$1\u2011$2');
    }

    function formatInlineHtmlUnbrokenHyphens(htmlStr) {
      if (!htmlStr) return '';
      return String(htmlStr)
        .split(/(<[^>]+>)/g)
        .map(chunk => chunk.startsWith('<') ? chunk : chunk.replace(/(\S)-(\S)/g, '$1\u2011$2'))
        .join('');
    }

    function syncBlogCroppedThumbCover(imgEl) {
      if (!imgEl || !imgEl.classList || !imgEl.classList.contains('blog-thumb-cropped')) return;
      const z = parseFloat(imgEl.getAttribute('data-crop-z') || '1');
      if (!(z >= 0.99)) return;
      const frame = imgEl.parentElement;
      if (!frame) return;
      const fw = frame.clientWidth;
      const fh = frame.clientHeight;
      const nw = imgEl.naturalWidth;
      const nh = imgEl.naturalHeight;
      if (fw > 0 && fh > 0 && nw > 0 && nh > 0) {
        const frameRatio = fw / fh;
        const imgRatio = nw / nh;
        if (imgRatio >= frameRatio) {
          imgEl.style.width = 'auto';
          imgEl.style.height = '100%';
        } else {
          imgEl.style.width = '100%';
          imgEl.style.height = 'auto';
        }
      }
    }
    window.syncBlogCroppedThumbCover = syncBlogCroppedThumbCover;

    window.addEventListener('resize', () => {
      document.querySelectorAll('#blogSliderTrack img.blog-thumb-cropped').forEach(syncBlogCroppedThumbCover);
    }, { passive: true });

    function buildBlogThumbFrameHTML(post, realIndex, editableMode) {
      if (!post || !post.image) return '';
      const parsed = parsePostImageCrop(post.imageFit || 'cover-center');
      const imgClasses = parsed.isCrop ? 'blog-thumb blog-thumb-cropped' : 'blog-thumb';
      const cropAttrs = parsed.isCrop ? ` data-crop-z="${parsed.z.toFixed(3)}" onload="syncBlogCroppedThumbCover(this)"` : '';
      const fitStyle = getFitCssForPost(post.imageFit || 'cover-center');
      const safeSrc = escapeHtmlAttr(post.image);
      const safeAlt = escapeHtmlAttr(post.title || '');

      if (editableMode) {
        return `
          <div class="blog-thumb-frame blog-thumb-admin-wrap" onclick="event.stopPropagation(); openBlogThumbCropModal(${realIndex})" title="Toca para recortar y acercar/alejar la miniatura">
            <img src="${safeSrc}" alt="${safeAlt}" class="${imgClasses}" loading="lazy" decoding="async" referrerpolicy="no-referrer"${cropAttrs} style="${fitStyle}">
            <span class="blog-thumb-crop-hint" aria-hidden="true">✂️</span>
          </div>
        `;
      }
      return `
        <div class="blog-thumb-frame">
          <img src="${safeSrc}" alt="${safeAlt}" class="${imgClasses}" loading="lazy" decoding="async" referrerpolicy="no-referrer"${cropAttrs} style="${fitStyle}">
        </div>
      `;
    }

    function renderBlogPosts() {
      const track = document.getElementById('blogSliderTrack');
      if (!track) return;
      track.innerHTML = '';
      
      const visiblePosts = getVisibleBlogPosts();
      const sortedPosts = [...visiblePosts].sort((a, b) => new Date(b.dateIso) - new Date(a.dateIso));

      const perPage = getBlogsPerPage();

      if (sortedPosts.length === 0) {
        track.innerHTML = '<p style="text-align: center; color: var(--text-muted); padding: 20px; width: 100%;">No hay pensamientos publicados por ahora.</p>';
        updateBlogNavControls(1);
        return;
      }

      const totalPages = Math.ceil(sortedPosts.length / perPage);
      if (currentBlogPage >= totalPages) currentBlogPage = totalPages - 1;
      if (currentBlogPage < 0) currentBlogPage = 0;

      for (let page = 0; page < totalPages; page++) {
        const slideDiv = document.createElement('div');
        slideDiv.className = 'blog-slide';

        const pagePosts = sortedPosts.slice(page * perPage, (page + 1) * perPage);

        pagePosts.forEach((post, postIdxInPage) => {
          const globalPostIndex = page * perPage + postIdxInPage;

          let realIndex = postsData.indexOf(post);
          if (realIndex === -1) {
            realIndex = postsData.findIndex(p => (post.id && p.id === post.id) || (p.title === post.title && p.dateIso === post.dateIso));
          }

          const thumbHTML = buildBlogThumbFrameHTML(post, realIndex, isAdminMode);
          const hasThumb = Boolean(thumbHTML);

          const article = document.createElement('article');
          const isEvenPreview = globalPostIndex % 2 === 1;
          const sideClass = hasThumb ? (isEvenPreview ? 'has-thumb img-right' : 'has-thumb img-left') : 'no-thumb';
          article.className = `blog-article ${isEvenPreview ? 'even-preview' : 'odd-preview'} ${sideClass}`;
          article.tabIndex = 0;
          article.setAttribute('role', 'button');
          article.onclick = function(e) {
            if (e.target.closest('button') || e.target.closest('input') || e.target.closest('[contenteditable="true"]') || e.target.closest('.blog-thumb-admin-wrap')) {
              return;
            }
            if (isAdminMode) {
              openBlogModal(realIndex);
            } else {
              triggerLeerAnimationAndOpen(realIndex);
            }
          };
          article.onkeydown = function(e) {
            if (e.target.closest('button') || e.target.closest('input') || e.target.closest('[contenteditable="true"]')) {
              return;
            }
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              if (isAdminMode) {
                openBlogModal(realIndex);
              } else {
                triggerLeerAnimationAndOpen(realIndex);
              }
            }
          };

          const isHidden = !!post.hidden;
          article.className = `blog-article ${isEvenPreview ? 'even-preview' : 'odd-preview'} ${sideClass}${isAdminMode && isHidden ? ' is-hidden-post' : ''}`;

          if (isAdminMode) {
            article.innerHTML = `
              ${thumbHTML}
              <div class="blog-card-admin-floating" onclick="event.stopPropagation()">
                <button type="button" class="blog-card-admin-btn ${isHidden ? 'is-vis-hidden' : 'is-vis-visible'}" onclick="event.stopPropagation(); toggleModalPostVisibility(${realIndex}, event)" title="${isHidden ? 'Oculto para visitantes — toca para mostrar' : 'Visible — toca para ocultar'}">${isHidden ? '👁️ Oculto' : '👁️‍🗨️'}</button>
                <button type="button" class="blog-card-admin-btn is-delete" onclick="event.stopPropagation(); deleteModalPost(${realIndex})" title="Eliminar publicación">🗑️</button>
              </div>
              <div class="blog-content">
                <div class="blog-card-top">
                  <h3 class="blog-card-editable-title" contenteditable="true" spellcheck="true" data-placeholder="Título..." title="Haz clic para editar el título directamente" onclick="event.stopPropagation()" oninput="handleCardInlineTitleInput(${realIndex}, this)" onpaste="handlePlainTextPaste(event)" onkeydown="if(event.key==='Enter'){event.preventDefault(); this.blur();}">${formatPreviewTitleUnbroken(post.title)}</h3>
                  <div class="blog-meta-row">
                    <span class="date modal-date-editable" title="Haz clic para cambiar la fecha" onclick="event.stopPropagation()">
                      <span>${escapeHtmlText(post.date || '')}</span>
                      <input type="date" class="modal-date-native-picker" value="${escapeHtmlAttr(post.dateIso || '')}" onchange="handleCardInlineDateChange(${realIndex}, this.value)" onclick="event.stopPropagation(); if(this.showPicker){try{this.showPicker();}catch(err){}}">
                    </span>
                    <span class="blog-preview-arrow" aria-hidden="true"><i class="fa-solid fa-arrow-right-long"></i></span>
                  </div>
                </div>
              </div>
            `;
          } else {
            article.innerHTML = `
              ${thumbHTML}
              <div class="blog-content">
                <div class="blog-card-top">
                  <h3>${formatPreviewTitleUnbroken(post.title)}</h3>
                  <div class="blog-meta-row">
                    <span class="date">${escapeHtmlText(post.date || '')}</span>
                    <span class="blog-preview-arrow" aria-hidden="true"><i class="fa-solid fa-arrow-right-long"></i></span>
                  </div>
                </div>
              </div>
            `;
          }

          slideDiv.appendChild(article);
        });

        track.appendChild(slideDiv);
      }

      requestAnimationFrame(() => {
        track.querySelectorAll('img.blog-thumb-cropped').forEach(syncBlogCroppedThumbCover);
      });
      updateBlogTrackPosition();
      updateBlogNavControls(totalPages);
    }

    function updateBlogTrackPosition() {
      const track = document.getElementById('blogSliderTrack');
      if (track) {
        track.style.transition = 'transform 0.5s cubic-bezier(0.34, 1.56, 0.64, 1)';
        track.style.transform = `translateX(-${currentBlogPage * 100}%)`;
      }
    }

    function updateBlogNavControls(totalPages) {
      const pageIndicator = document.getElementById('blogPageIndicator');
      const prevBtn = document.getElementById('blogPrevBtn');
      const nextBtn = document.getElementById('blogNextBtn');
      const dotsContainer = document.getElementById('blogDots');

      if (pageIndicator) pageIndicator.innerText = `${currentBlogPage + 1} / ${totalPages}`;
      if (prevBtn) prevBtn.disabled = currentBlogPage === 0;
      if (nextBtn) nextBtn.disabled = currentBlogPage >= totalPages - 1;

      if (dotsContainer) {
        dotsContainer.innerHTML = '';
        if (totalPages > 1) {
          for (let i = 0; i < totalPages; i++) {
            const dot = document.createElement('span');
            dot.className = `blog-dot ${i === currentBlogPage ? 'active' : ''}`;
            dot.title = `Página ${i + 1}`;
            dot.onclick = () => goToBlogPage(i);
            dotsContainer.appendChild(dot);
          }
          dotsContainer.style.display = 'flex';
        } else {
          dotsContainer.style.display = 'none';
        }
      }
    }

    function goToBlogPage(pageIndex) {
      const visiblePosts = getVisibleBlogPosts();
      const perPage = getBlogsPerPage();
      const totalPages = Math.ceil(visiblePosts.length / perPage) || 1;

      currentBlogPage = pageIndex;
      if (currentBlogPage < 0) currentBlogPage = 0;
      if (currentBlogPage >= totalPages) currentBlogPage = totalPages - 1;

      updateBlogTrackPosition();
      updateBlogNavControls(totalPages);
    }

    function moveBlogSlide(direction) {
      const visiblePosts = getVisibleBlogPosts();
      const perPage = getBlogsPerPage();
      const totalPages = Math.ceil(visiblePosts.length / perPage) || 1;
      
      currentBlogPage += direction;
      if (currentBlogPage < 0) currentBlogPage = 0;
      if (currentBlogPage >= totalPages) currentBlogPage = totalPages - 1;

      updateBlogTrackPosition();
      updateBlogNavControls(totalPages);
    }

    // Gestos táctiles y arrastre fluido con ratón/touchpad
    let blogTouchStartX = 0;
    let blogTouchCurrentX = 0;
    let isBlogDragging = false;
    let isBlogPointerDown = false;
    let blogPointerStartX = 0;
    let blogPointerCurrentX = 0;
    const blogSliderWrapper = document.getElementById('blogSliderWrapper');

    if (blogSliderWrapper) {
      const getTrack = () => document.getElementById('blogSliderTrack');

      // Gestos táctiles móviles
      blogSliderWrapper.addEventListener('touchstart', (e) => {
        if (e.touches.length > 1) return;
        if (e.target.closest('[contenteditable="true"]') || e.target.closest('button') || e.target.closest('input') || e.target.closest('select') || e.target.closest('.blog-thumb-admin-wrap')) return;
        const track = getTrack();
        blogTouchStartX = e.touches[0].clientX;
        blogTouchCurrentX = blogTouchStartX;
        isBlogDragging = true;
        if (track) {
          track.style.transition = 'none';
        }
      }, { passive: true });

      blogSliderWrapper.addEventListener('touchmove', (e) => {
        const track = getTrack();
        if (!isBlogDragging || !track) return;
        blogTouchCurrentX = e.touches[0].clientX;
        const diffX = blogTouchCurrentX - blogTouchStartX;
        const wrapperWidth = blogSliderWrapper.clientWidth || 300;
        const baseOffset = -currentBlogPage * 100;
        const dragPercentage = (diffX / wrapperWidth) * 100;

        track.style.transform = `translateX(${baseOffset + dragPercentage}%)`;
      }, { passive: true });

      blogSliderWrapper.addEventListener('touchend', (e) => {
        const track = getTrack();
        if (!isBlogDragging) return;
        isBlogDragging = false;
        const diffX = blogTouchStartX - blogTouchCurrentX;

        if (track) {
          track.style.transition = 'transform 0.25s cubic-bezier(0.25, 1, 0.5, 1)';
        }

        if (Math.abs(diffX) > 25) {
          if (diffX > 0) moveBlogSlide(1);
          else moveBlogSlide(-1);
        } else {
          updateBlogTrackPosition();
        }
      }, { passive: true });

      // Arrastre con ratón en PC / Escritorio
      blogSliderWrapper.addEventListener('mousedown', (e) => {
        if (e.button !== 0) return;
        if (e.target.closest('[contenteditable="true"]') || e.target.closest('button') || e.target.closest('a') || e.target.closest('input') || e.target.closest('select') || e.target.closest('textarea') || e.target.closest('.blog-thumb-admin-wrap')) return;
        const track = getTrack();
        isBlogPointerDown = true;
        blogPointerStartX = e.clientX;
        blogPointerCurrentX = blogPointerStartX;
        if (track) {
          track.style.transition = 'none';
          track.style.cursor = 'grabbing';
        }
      });

      window.addEventListener('mousemove', (e) => {
        if (!isBlogPointerDown) return;
        const track = getTrack();
        if (!track) return;
        blogPointerCurrentX = e.clientX;
        const diffX = blogPointerCurrentX - blogPointerStartX;
        const wrapperWidth = blogSliderWrapper.clientWidth || 300;
        const baseOffset = -currentBlogPage * 100;
        const dragPercentage = (diffX / wrapperWidth) * 100;
        track.style.transform = `translateX(${baseOffset + dragPercentage}%)`;
      }, { passive: true });

      window.addEventListener('mouseup', (e) => {
        if (!isBlogPointerDown) return;
        isBlogPointerDown = false;
        const track = getTrack();
        if (track) {
          track.style.cursor = '';
          track.style.transition = 'transform 0.25s cubic-bezier(0.25, 1, 0.5, 1)';
        }
        const diffX = blogPointerStartX - blogPointerCurrentX;
        if (Math.abs(diffX) > 35) {
          if (diffX > 0) moveBlogSlide(1);
          else moveBlogSlide(-1);
        } else {
          updateBlogTrackPosition();
        }
      }, { passive: true });

      // Desplazamiento horizontal con rueda / touchpad (con enfriamiento para evitar ráfagas en trackpads)
      let lastBlogWheelTime = 0;
      blogSliderWrapper.addEventListener('wheel', (e) => {
        if (Math.abs(e.deltaX) > Math.abs(e.deltaY) && Math.abs(e.deltaX) > 20) {
          const now = Date.now();
          if (now - lastBlogWheelTime < 420) return;
          lastBlogWheelTime = now;
          if (e.deltaX > 0) moveBlogSlide(1);
          else moveBlogSlide(-1);
        }
      }, { passive: true });
    }

    /* FUNCIONES PARA MODAL DE LECTURA Y EDICIÓN INTEGRADA DE BLOG */
    let currentBlogIndex = null;
    let isReadOverlayAnimating = false;

    function triggerLeerAnimationAndOpen(postIndex, forcePreview = false) {
      if (isReadOverlayAnimating) return;
      isReadOverlayAnimating = true;

      const overlay = document.getElementById('readOverlay');
      if (!overlay) {
        openBlogModal(postIndex, forcePreview);
        isReadOverlayAnimating = false;
        return;
      }

      overlay.classList.add('active');

      setTimeout(() => {
        openBlogModal(postIndex, forcePreview);
        overlay.classList.remove('active');
        isReadOverlayAnimating = false;
      }, 500);
    }

    /* GESTIÓN DE HISTORIAL DEL NAVEGADOR PARA MODALES (BOTÓN VOLVER EN CELULAR Y MOUSE DE PC) */
    let activeModalHistoryName = null;
    let isModalClosingProgrammatically = false;

    function pushModalState(modalName, customPath) {
      const targetUrl = customPath || (window.location.pathname + window.location.search + window.location.hash);
      if (activeModalHistoryName === modalName) {
        if (customPath) {
          try {
            window.history.replaceState({ blutuModal: modalName }, '', targetUrl);
          } catch (e) {}
        }
        return;
      }
      activeModalHistoryName = modalName;
      try {
        window.history.pushState({ blutuModal: modalName }, '', targetUrl);
      } catch (e) {}
    }

    function popModalState(modalName) {
      if (activeModalHistoryName === modalName) {
        activeModalHistoryName = null;
        if (window.history.state && window.history.state.blutuModal) {
          isModalClosingProgrammatically = true;
          try {
            window.history.back();
          } catch (e) {}
          return;
        }
      }
      if (typeof clearSharedQueryParamsFromUrl === 'function') {
        clearSharedQueryParamsFromUrl();
      }
    }

    window.addEventListener('popstate', function(event) {
      if (isModalClosingProgrammatically) {
        isModalClosingProgrammatically = false;
        return;
      }
      // 0. Cerrar modales superiores de recorte / imagen / pipeta antes de cerrar el blog subyacente
      const thumbCropModal = document.getElementById('blogThumbCropModal');
      if (thumbCropModal && thumbCropModal.style.display !== 'none') {
        if (typeof closeBlogThumbCropModal === 'function') closeBlogThumbCropModal(true);
        else thumbCropModal.style.display = 'none';
        return;
      }

      const pixelModal = document.getElementById('pixelCanvasModal');
      if (pixelModal && pixelModal.style.display !== 'none') {
        if (typeof closePixelCanvasModal === 'function') closePixelCanvasModal();
        else pixelModal.style.display = 'none';
        return;
      }

      const insertImgModal = document.getElementById('insertImageModal');
      if (insertImgModal && insertImgModal.style.display !== 'none') {
        if (typeof closeInsertImageModal === 'function') closeInsertImageModal();
        else insertImgModal.style.display = 'none';
        return;
      }

      activeModalHistoryName = null;

      // 1. Cerrar modal de lectura/edición de Pensamientos o volver al blog del juego si estaba en partida/resultado
      const blogModal = document.getElementById('blogReadModal');
      if (blogModal && blogModal.style.display !== 'none') {
        if (window.__isMiniGameScreenOpen && currentGameBlogKey && gamesData && gamesData.blogs && gamesData.blogs[currentGameBlogKey]) {
          const returnGameKey = currentGameBlogKey;
          if (typeof destroyActiveMiniGame === 'function') destroyActiveMiniGame();
          window.__isMiniGameScreenOpen = false;
          openGameBlogModal(returnGameKey);
          pushModalState('blog', '/' + getGameBlogShareSlug(returnGameKey));
          return;
        }
        if (typeof resetBlogParagraphRevealState === 'function') {
          resetBlogParagraphRevealState(document.getElementById('blogModalBody'));
        }
        if (isAdminMode && typeof syncLiveBlogModalToMemory === 'function') {
          syncLiveBlogModalToMemory(true);
          if (currentGameBlogKey) renderGamesSection();
          else renderBlogPosts();
        }
        currentBlogIndex = null;
        currentGameBlogKey = null;
        blogModal.style.display = 'none';
        document.body.style.overflow = '';
        if (typeof clearSharedQueryParamsFromUrl === 'function') clearSharedQueryParamsFromUrl();
      }

      // 2. Cerrar visor de imagen / video de Galería
      const imgModal = document.getElementById('imageModal');
      if (imgModal && imgModal.style.display !== 'none') {
        if (typeof resetModalZoom === 'function') resetModalZoom();
        const videoIframe = document.getElementById("modalVideoIframe");
        if (videoIframe) videoIframe.src = '';
        const videoWrapper = document.getElementById("modalVideoWrapper");
        if (videoWrapper) videoWrapper.style.display = 'none';
        imgModal.style.display = 'none';
        document.body.style.overflow = '';
      }

      // 3. Cerrar modal de detalle de producto de Merch
      const merchModal = document.getElementById('merchDetailModal');
      if (merchModal && merchModal.style.display !== 'none') {
        if (typeof clearModalSlideshowInterval === 'function') clearModalSlideshowInterval();
        merchModal.style.display = 'none';
        document.body.style.overflow = '';
        if (typeof clearSharedQueryParamsFromUrl === 'function') clearSharedQueryParamsFromUrl();
      }

      // 4. Cerrar modal de Carrito de compras
      const cartModal = document.getElementById('cartModal');
      if (cartModal && cartModal.style.display !== 'none') {
        cartModal.style.display = 'none';
        document.body.style.overflow = '';
      }
    });

    function buildEditableInlineFigureHTML(url, caption, auraColor) {
      const safeUrl = escapeHtmlAttr(url || '');
      const safeAura = escapeHtmlAttr(auraColor || '');
      const auraAttr = safeAura ? `data-aura="${safeAura}"` : '';
      return `<figure class="inline-img-figure blutu-editable-figure" contenteditable="false" data-img-url="${safeUrl}" data-aura="${safeAura}">
        <div class="figure-floating-actions" contenteditable="false">
          <button type="button" onmousedown="event.preventDefault()" onclick="openBlogImageModal('edit-inline', this.closest('.blutu-editable-figure'))" title="Editar imagen o color de aura">🖼️ Imagen / 🧪 Aura</button>
          <button type="button" onmousedown="event.preventDefault()" onclick="moveInlineFigureBlock(this, -1)" title="Mover arriba">⬆️</button>
          <button type="button" onmousedown="event.preventDefault()" onclick="moveInlineFigureBlock(this, 1)" title="Mover abajo">⬇️</button>
          <button type="button" class="is-remove" onmousedown="event.preventDefault()" onclick="removeInlineFigureBlock(this)" title="Quitar imagen">🗑️</button>
        </div>
        <img src="${safeUrl}" class="inline-img" ${auraAttr} alt="${escapeHtmlAttr(caption || 'Imagen en contenido')}">
        <figcaption class="inline-img-caption" contenteditable="true" spellcheck="true" data-placeholder="Pie de foto (opcional)..." oninput="scheduleLiveBlogModalSync()" onpaste="handlePlainTextPaste(event)" onkeydown="if(event.key==='Enter'){event.preventDefault(); this.blur();}">${escapeHtmlText(caption || '')}</figcaption>
      </figure>`;
    }

    function renderBlogArticleBodyHTML(rawContent, editableMode = false) {
      function parseImgToken(rawMatch) {
        const inner = rawMatch.replace(/^\[img:\s*/i, '').replace(/\]$/, '').trim();
        const parts = inner.split('|');
        const url = parts[0] ? parts[0].trim() : '';
        const caption = parts.length > 1 ? parts[1].trim() : '';
        const auraColor = parts.length > 2 ? parts[2].trim() : '';
        return { url, caption, auraColor };
      }

      function renderVisitorImageTag(rawMatch) {
        const { url, caption, auraColor } = parseImgToken(rawMatch);
        const auraAttr = auraColor ? `data-aura="${escapeHtmlAttr(auraColor)}"` : '';
        if (caption) {
          return `<figure class="inline-img-figure"><img src="${escapeHtmlAttr(url)}" class="inline-img" ${auraAttr} alt="${escapeHtmlAttr(caption)}"><figcaption class="inline-img-caption">${escapeHtmlText(caption)}</figcaption></figure>`;
        }
        return `<img src="${escapeHtmlAttr(url)}" class="inline-img" ${auraAttr} alt="Imagen en contenido">`;
      }

      const contentStr = String(rawContent || '');
      if (!contentStr.trim()) {
        return editableMode ? '<p><br></p>' : '';
      }

      const blocks = [];
      let lastEndedWithFigure = false;
      const paragraphs = contentStr.split('\n\n');

      paragraphs.forEach(p => {
        const trimmedPara = p.trim();
        if (!trimmedPara) return;

        // Dividir limpiamente alrededor de cualquier etiqueta [img:...]
        const segments = trimmedPara.split(/(\[img:\s*[^\]]+\])/gi);
        segments.forEach(seg => {
          const text = seg.trim();
          if (!text) return;

          if (/^\[img:\s*[^\]]+\]$/i.test(text)) {
            if (editableMode) {
              const { url, caption, auraColor } = parseImgToken(text);
              blocks.push(buildEditableInlineFigureHTML(url, caption, auraColor));
              lastEndedWithFigure = true;
            } else {
              blocks.push(renderVisitorImageTag(text));
            }
            return;
          }

          lastEndedWithFigure = false;

          if (text.startsWith('# ')) {
            let subRaw = text.substring(2).trim();
            const centerSubMatch = subRaw.match(/^\[center\]([\s\S]*)\[\/center\]$/i);
            if (centerSubMatch && !/\[\/center\]/i.test(centerSubMatch[1])) {
              const innerHeading = formatPostInlineText(centerSubMatch[1].trim());
              const finalHeading = editableMode ? innerHeading : formatInlineHtmlUnbrokenHyphens(innerHeading);
              blocks.push(`<h2 data-blutu-center="true" style="text-align: center;">${finalHeading}</h2>`);
            } else {
              const innerHeading = formatPostInlineText(subRaw);
              const finalHeading = editableMode ? innerHeading : formatInlineHtmlUnbrokenHyphens(innerHeading);
              blocks.push(`<h2>${finalHeading}</h2>`);
            }
            return;
          }

          const wholeCenterMatch = text.match(/^\[center\]([\s\S]*)\[\/center\]$/i);
          if (wholeCenterMatch && !/\[\/center\]/i.test(wholeCenterMatch[1])) {
            const innerCentered = wholeCenterMatch[1];
            blocks.push(`<p data-blutu-center="true">${formatPostInlineText(innerCentered).replace(/\n/g, '<br>')}</p>`);
            return;
          }

          blocks.push(`<p>${formatPostInlineText(text).replace(/\n/g, '<br>')}</p>`);
        });
      });

      if (editableMode) {
        if (blocks.length === 0) {
          blocks.push('<p><br></p>');
        } else if (lastEndedWithFigure) {
          blocks.push('<p data-trailing-guard="true"><br></p>');
        }
      }

      return blocks.join('');
    }

    function renderLiveCoverSectionHTML(post) {
      const hasImg = !!(post && post.image && post.image.trim());
      if (hasImg) {
        const auraAttr = post.imageAura ? `data-aura="${escapeHtmlAttr(post.imageAura)}"` : '';
        const cropTargetExpr = currentGameBlogKey ? `'game:${escapeHtmlAttr(currentGameBlogKey)}'` : 'currentBlogIndex';
        const showCropBtn = !currentGameBlogKey || currentGameBlogKey === 'memorama' || currentGameBlogKey === 'sixbysix';
        return `
          <figure class="main-img-figure" id="blogLiveCoverFigure">
            <div class="figure-floating-actions" contenteditable="false">
              <button type="button" onmousedown="event.preventDefault()" onclick="openBlogImageModal('cover')" title="Cambiar imagen de portada o aura">🖼️ Portada / 🧪 Aura</button>
              ${showCropBtn ? `<button type="button" onmousedown="event.preventDefault()" onclick="openBlogThumbCropModal(${cropTargetExpr})" title="Recortar y acercar/alejar la miniatura">✂️ Miniatura</button>` : ''}
              <button type="button" class="is-remove" onmousedown="event.preventDefault()" onclick="removeLiveCoverImage()" title="Quitar imagen de portada">🗑️ Quitar</button>
            </div>
            <img src="${escapeHtmlAttr(post.image)}" id="blogLiveMainImg" class="main-img" ${auraAttr} alt="${escapeHtmlAttr(post.title || 'Portada')}">
            <figcaption id="blogLiveMainCaption" class="main-img-caption" contenteditable="true" spellcheck="true" data-placeholder="Añadir pie de foto..." oninput="scheduleLiveBlogModalSync()" onpaste="handlePlainTextPaste(event)" onkeydown="if(event.key==='Enter'){event.preventDefault(); this.blur();}">${escapeHtmlText(post.imageCaption || '')}</figcaption>
          </figure>
        `;
      }
      return `
        <div id="blogLiveCoverPlaceholderWrap" style="text-align: center;">
          <button type="button" class="cover-img-placeholder-btn" onmousedown="event.preventDefault()" onclick="openBlogImageModal('cover')">
            🖼️ + Añadir imagen de portada
          </button>
        </div>
      `;
    }

    function applyLiveBlogImagesAura(containerEl, post) {
      if (!containerEl) return;
      const blogImgs = containerEl.querySelectorAll('img.main-img, img.inline-img');
      blogImgs.forEach(img => {
        img.style.transition = 'box-shadow 0.5s ease, border-color 0.5s ease, filter 0.5s ease';
        const rawAura = img.getAttribute('data-aura') || (img.classList.contains('main-img') && post && post.imageAura ? post.imageAura : '');
        const customAura = rawAura ? String(rawAura).trim() : '';

        if (customAura && customAura.toLowerCase() !== 'none') {
          const solidGlow = formatSavedAuraGlow(customAura, 0.88) || customAura;
          const softGlow = formatSavedAuraGlow(customAura, 0.35) || customAura;
          img.style.borderColor = solidGlow;
          img.style.boxShadow = `inset 0 0 12px rgba(0, 0, 0, 0.85), 0 0 20px ${solidGlow}, 0 0 42px ${softGlow}, 0 8px 30px rgba(0, 0, 0, 0.95)`;
        } else {
          img.style.borderColor = '';
          img.style.boxShadow = '';
        }
      });
    }

    let activeBlogParagraphRevealController = null;

    function detectFirstCharacterColorInParagraph(pEl) {
      if (!pEl) return '';
      const walker = document.createTreeWalker(pEl, NodeFilter.SHOW_TEXT, null);
      let firstNonEmptyNode = null;
      let targetNode = null;
      const letterOrDigitRe = /[A-Za-zÀ-ÖØ-öø-ÿĀ-ž0-9\u0370-\u03FF\u0400-\u04FF]/;

      let current = walker.nextNode();
      while (current) {
        const val = (current.nodeValue || '').replace(/[\u200B\uFEFF]/g, '');
        if (firstNonEmptyNode && /^\s/.test(val)) {
          break;
        }
        if (val.trim().length > 0) {
          if (!firstNonEmptyNode) firstNonEmptyNode = current;
          if (letterOrDigitRe.test(val)) {
            targetNode = current;
            break;
          }
          if (/\S\s/.test(val)) {
            break;
          }
        }
        current = walker.nextNode();
      }

      const chosenTextNode = targetNode || firstNonEmptyNode;
      if (!chosenTextNode) return '';

      let cur = chosenTextNode.parentElement;
      while (cur && cur !== pEl) {
        const explicitColor = (
          cur.getAttribute('data-blutu-color') ||
          (cur.style && cur.style.color ? cur.style.color : '') ||
          cur.getAttribute('color') ||
          ''
        ).trim();
        if (explicitColor && explicitColor !== 'transparent' && explicitColor !== 'inherit' && explicitColor !== 'initial') {
          return explicitColor;
        }
        cur = cur.parentElement;
      }

      const pOwnColor = (pEl.getAttribute('data-blutu-color') || '').trim();
      if (pOwnColor) return pOwnColor;

      return '';
    }

    function syncBlogParagraphFirstLetterColors(rootEl) {
      const scope = rootEl || document.getElementById('blogEditableBody') || document.getElementById('blogModalBody');
      if (!scope) return;
      const paragraphs = scope.tagName === 'P' ? [scope] : scope.querySelectorAll('p');
      paragraphs.forEach(p => {
        const detected = detectFirstCharacterColorInParagraph(p);
        if (detected) {
          p.style.setProperty('--p-first-letter-color', detected);
        } else {
          p.style.removeProperty('--p-first-letter-color');
        }
      });
    }
    window.syncBlogParagraphFirstLetterColors = syncBlogParagraphFirstLetterColors;

    function hasPendingBlogParagraphReveal(modalBodyEl) {
      const body = modalBodyEl || document.getElementById('blogModalBody');
      if (!body) return false;
      return !!body.querySelector('p.blog-para-hold, p.blog-para-unfolding');
    }
    window.hasPendingBlogParagraphReveal = hasPendingBlogParagraphReveal;

    function resetBlogParagraphRevealState(modalBodyEl) {
      if (activeBlogParagraphRevealController) {
        activeBlogParagraphRevealController.destroy();
        activeBlogParagraphRevealController = null;
      }
      const body = modalBodyEl || document.getElementById('blogModalBody');
      if (!body) return;
      body.querySelectorAll('p').forEach(p => {
        p.classList.remove('blog-para-hold', 'blog-para-unfolding');
        p.style.removeProperty('max-height');
        p.removeAttribute('data-empty-para');
      });
    }
    window.resetBlogParagraphRevealState = resetBlogParagraphRevealState;

    function triggerBlogParagraphsOpeningReveal(modalBody) {
      if (!modalBody) return;
      resetBlogParagraphRevealState(modalBody);

      const modalBox = modalBody.closest('.blog-modal-box');
      if (!modalBox) return;

      const editableRoot = modalBody.querySelector('#blogEditableBody');
      const allParas = Array.from((editableRoot || modalBody).querySelectorAll('p'));
      if (allParas.length === 0) return;

      const nonEmptyParas = [];
      allParas.forEach(p => {
        const cleanTxt = (p.textContent || '').replace(/[\u200B\uFEFF]/g, '').trim();
        if (cleanTxt) {
          nonEmptyParas.push(p);
        }
      });

      if (nonEmptyParas.length === 0) return;

      const allImgs = Array.from(modalBody.querySelectorAll('img'));
      const items = nonEmptyParas.map(p => {
        p.classList.add('blog-para-hold');
        const precedingImgs = allImgs.filter(img => Boolean(img.compareDocumentPosition(p) & Node.DOCUMENT_POSITION_FOLLOWING));
        return {
          p,
          state: 'hold', // 'hold' | 'scheduled' | 'unfolding' | 'done'
          holdTimer: null,
          cleanupTimer: null,
          precedingImgs
        };
      });

      let destroyed = false;
      let rafId = null;
      let imgWaitTimedOut = false;
      let observer = null;
      const imgListeners = [];

      function detachListenersOnly() {
        if (rafId !== null) {
          cancelAnimationFrame(rafId);
          rafId = null;
        }
        modalBox.removeEventListener('scroll', scheduleEvaluation);
        window.removeEventListener('resize', scheduleEvaluation);
        if (observer) {
          observer.disconnect();
          observer = null;
        }
        while (imgListeners.length > 0) {
          const entry = imgListeners.pop();
          entry.img.removeEventListener('load', entry.fn);
          entry.img.removeEventListener('error', entry.fn);
        }
      }

      const imgFallbackTimer = setTimeout(() => {
        imgWaitTimedOut = true;
        scheduleEvaluation();
      }, 380);

      function destroy() {
        if (destroyed) return;
        destroyed = true;
        clearTimeout(imgFallbackTimer);
        detachListenersOnly();
        items.forEach(it => {
          if (it.holdTimer) {
            clearTimeout(it.holdTimer);
            it.holdTimer = null;
          }
          if (it.cleanupTimer) {
            clearTimeout(it.cleanupTimer);
            it.cleanupTimer = null;
          }
        });
      }

      function computePendingDeltaAbove(targetIdx) {
        let sum = 0;
        for (let k = 0; k < targetIdx; k++) {
          const prev = items[k];
          if (prev.state === 'done' || !prev.p.isConnected) continue;
          const prevRect = prev.p.getBoundingClientRect();
          const prevNaturalH = Math.max(prev.p.scrollHeight, prevRect.height);
          sum += Math.max(0, prevNaturalH - prevRect.height);
        }
        return sum;
      }

      function unfoldItem(item) {
        if (destroyed || !item.p.isConnected || item.state !== 'scheduled') return;
        const p = item.p;
        item.state = 'unfolding';
        const startH = p.getBoundingClientRect().height;
        const endH = Math.max(p.scrollHeight + 24, startH + 8);
        p.style.maxHeight = `${startH}px`;
        p.classList.remove('blog-para-hold');
        p.classList.add('blog-para-unfolding');
        void p.offsetHeight;
        p.style.maxHeight = `${endH}px`;

        item.cleanupTimer = setTimeout(() => {
          item.cleanupTimer = null;
          item.state = 'done';
          if (p.isConnected) {
            p.classList.remove('blog-para-unfolding');
            p.style.removeProperty('max-height');
          }
          if (!destroyed) {
            if (items.every(it => it.state === 'done')) {
              detachListenersOnly();
            } else {
              scheduleEvaluation();
            }
          }
        }, 600);
      }

      function evaluateParagraphs() {
        rafId = null;
        if (destroyed || !modalBody.isConnected || !modalBox.isConnected) return;

        const boxRect = modalBox.getBoundingClientRect();
        if (boxRect.height <= 0) return;

        const reachMargin = Math.min(42, Math.max(22, boxRect.height * 0.065));
        const bottomThreshold = boxRect.bottom - reachMargin;
        const atScrollBottom = (modalBox.scrollTop + modalBox.clientHeight) >= (modalBox.scrollHeight - 10);
        const firstUndoneIdx = items.findIndex(it => it.state === 'hold' || it.state === 'scheduled');

        let pendingExpansionAbove = 0;

        for (let i = 0; i < items.length; i++) {
          const item = items[i];
          const p = item.p;
          if (!p.isConnected) {
            item.state = 'done';
            continue;
          }

          const pRect = p.getBoundingClientRect();
          const naturalH = Math.max(p.scrollHeight, pRect.height);
          const itemPendingDelta = (item.state === 'done') ? 0 : Math.max(0, naturalH - pRect.height);

          if (item.state === 'hold') {
            const waitingForImg = !imgWaitTimedOut && item.precedingImgs.some(img => !img.complete);
            if (!waitingForImg) {
              const effectiveTop = pRect.top + pendingExpansionAbove;
              const inReachableView = (effectiveTop <= bottomThreshold && pRect.bottom >= (boxRect.top + 8));
              const forceBottomUnlock = (atScrollBottom && i === firstUndoneIdx && pRect.top <= (boxRect.bottom - 10));

              if (inReachableView || forceBottomUnlock) {
                item.state = 'scheduled';
                const capturedIdx = i;
                item.holdTimer = setTimeout(() => {
                  item.holdTimer = null;
                  if (destroyed || !p.isConnected || item.state !== 'scheduled') return;

                  const freshBoxRect = modalBox.getBoundingClientRect();
                  const freshPRect = p.getBoundingClientRect();
                  const freshPendingAbove = computePendingDeltaAbove(capturedIdx);
                  const freshAtBottom = (modalBox.scrollTop + modalBox.clientHeight) >= (modalBox.scrollHeight - 10);
                  const freshFirstUndone = items.findIndex(it => it.state === 'hold' || it.state === 'scheduled');

                  const stillReached =
                    ((freshPRect.top + freshPendingAbove) <= (freshBoxRect.bottom - 18)) ||
                    (freshAtBottom && capturedIdx === freshFirstUndone);

                  if (!stillReached) {
                    item.state = 'hold';
                    scheduleEvaluation();
                    return;
                  }

                  unfoldItem(item);
                }, 500);
              }
            }
          }

          pendingExpansionAbove += itemPendingDelta;
        }
      }

      function scheduleEvaluation() {
        if (destroyed || rafId !== null) return;
        rafId = requestAnimationFrame(evaluateParagraphs);
      }

      modalBox.addEventListener('scroll', scheduleEvaluation, { passive: true });
      window.addEventListener('resize', scheduleEvaluation, { passive: true });

      if ('IntersectionObserver' in window) {
        observer = new IntersectionObserver(() => {
          scheduleEvaluation();
        }, {
          root: modalBox,
          threshold: [0, 0.1, 0.5, 1]
        });
        items.forEach(it => observer.observe(it.p));
      }

      allImgs.forEach(img => {
        if (!img.complete) {
          const fn = () => scheduleEvaluation();
          img.addEventListener('load', fn, { once: true });
          img.addEventListener('error', fn, { once: true });
          imgListeners.push({ img, fn });
        }
      });

      activeBlogParagraphRevealController = { destroy, scheduleEvaluation };
      scheduleEvaluation();
    }

    function parseCssColorToRgb(rawColor) {
      if (!rawColor || typeof rawColor !== 'string') return null;
      const str = rawColor.trim();
      if (!str) return null;

      if (str.startsWith('#')) {
        let hex = str.slice(1).trim();
        if (hex.length === 3 || hex.length === 4) {
          hex = hex.slice(0, 3).split('').map(ch => ch + ch).join('');
        } else if (hex.length === 8) {
          hex = hex.slice(0, 6);
        }
        if (/^[0-9a-fA-F]{6}$/.test(hex)) {
          return {
            r: parseInt(hex.slice(0, 2), 16),
            g: parseInt(hex.slice(2, 4), 16),
            b: parseInt(hex.slice(4, 6), 16)
          };
        }
        return null;
      }

      const rgbMatch = str.match(/rgba?\(\s*([0-9.]+)\s*,\s*([0-9.]+)\s*,\s*([0-9.]+)/i);
      if (rgbMatch) {
        return {
          r: Math.max(0, Math.min(255, Math.round(parseFloat(rgbMatch[1])))),
          g: Math.max(0, Math.min(255, Math.round(parseFloat(rgbMatch[2])))),
          b: Math.max(0, Math.min(255, Math.round(parseFloat(rgbMatch[3]))))
        };
      }
      return null;
    }

    function formatSavedAuraGlow(rawColor, alpha = 0.88) {
      if (!rawColor || typeof rawColor !== 'string') return '';
      const trimmed = rawColor.trim();
      if (!trimmed || trimmed.toLowerCase() === 'none') return '';
      const rgb = parseCssColorToRgb(trimmed);
      if (!rgb) return trimmed;
      return `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${alpha})`;
    }

    function rgbOrCssToHexUpper(rawColor) {
      const rgb = parseCssColorToRgb(rawColor);
      if (!rgb) return '';
      const toHex = (n) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, '0');
      return `#${toHex(rgb.r)}${toHex(rgb.g)}${toHex(rgb.b)}`.toUpperCase();
    }

    function rgbToHslObj(r, g, b) {
      const rn = r / 255;
      const gn = g / 255;
      const bn = b / 255;
      const max = Math.max(rn, gn, bn);
      const min = Math.min(rn, gn, bn);
      const l = (max + min) / 2;
      let h = 0;
      let s = 0;

      if (max !== min) {
        const d = max - min;
        s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
        if (max === rn) {
          h = ((gn - bn) / d + (gn < bn ? 6 : 0)) / 6;
        } else if (max === gn) {
          h = ((bn - rn) / d + 2) / 6;
        } else {
          h = ((rn - gn) / d + 4) / 6;
        }
      }
      return { h: h * 360, s, l };
    }

    function hslToRgbObj(h, s, l) {
      const hn = (((h % 360) + 360) % 360) / 360;
      if (s <= 0) {
        const v = Math.round(Math.max(0, Math.min(1, l)) * 255);
        return { r: v, g: v, b: v };
      }
      const hue2rgb = (p, q, t) => {
        let tt = t;
        if (tt < 0) tt += 1;
        if (tt > 1) tt -= 1;
        if (tt < 1 / 6) return p + (q - p) * 6 * tt;
        if (tt < 1 / 2) return q;
        if (tt < 2 / 3) return p + (q - p) * (2 / 3 - tt) * 6;
        return p;
      };
      const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
      const p = 2 * l - q;
      return {
        r: Math.round(hue2rgb(p, q, hn + 1 / 3) * 255),
        g: Math.round(hue2rgb(p, q, hn) * 255),
        b: Math.round(hue2rgb(p, q, hn - 1 / 3) * 255)
      };
    }

    function computeWcagRelLuminance(r, g, b) {
      const toLin = (c) => {
        const v = c / 255;
        return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
      };
      return 0.2126 * toLin(r) + 0.7152 * toLin(g) + 0.0722 * toLin(b);
    }

    function calibrateHslToLuminanceBand(h, s, initialL, minLum, maxLum) {
      let l = Math.max(0.08, Math.min(0.95, initialL));
      let rgb = hslToRgbObj(h, s, l);
      let lum = computeWcagRelLuminance(rgb.r, rgb.g, rgb.b);
      for (let step = 0; step < 28; step++) {
        if (lum < minLum && l < 0.94) {
          l = Math.min(0.94, l + 0.025);
        } else if (lum > maxLum && l > 0.14) {
          l = Math.max(0.14, l - 0.025);
        } else {
          break;
        }
        rgb = hslToRgbObj(h, s, l);
        lum = computeWcagRelLuminance(rgb.r, rgb.g, rgb.b);
      }
      return { ...rgb, lum };
    }

    function computeAccessibleBlogThemeFromColor(rawColor) {
      const parsed = parseCssColorToRgb(rawColor);
      if (!parsed) return null;
      const { h, s, l } = rgbToHslObj(parsed.r, parsed.g, parsed.b);

      // Si la imagen es monocromática / escala de grises, usar plata lunar de alto contraste
      if (s < 0.075) {
        return {
          accent: 'rgb(154, 164, 188)',
          titleColor: 'rgb(232, 236, 246)',
          dropcapColor: 'rgb(196, 205, 226)',
          glow: 'rgba(165, 176, 204, 0.38)',
          glowSoft: 'rgba(165, 176, 204, 0.16)',
          borderSubtle: 'rgba(165, 176, 204, 0.5)',
          btnHoverText: '#090b10'
        };
      }

      const sFrame = Math.max(0.4, Math.min(0.84, s * 1.12));
      const frameCol = calibrateHslToLuminanceBand(h, sFrame, Math.max(0.46, Math.min(0.68, l)), 0.17, 0.52);

      // Título, subtítulos y enlaces siempre con luminancia relativa >= 0.43 (contraste >= 8.7:1 sobre #0d0e12)
      const sTitle = Math.max(0.42, Math.min(0.88, s * 1.08));
      const titleCol = calibrateHslToLuminanceBand(h, sTitle, Math.max(0.74, Math.min(0.88, l)), 0.43, 0.82);

      // Capitular inicial con luminancia >= 0.28 (contraste >= 6:1 sobre #0d0e12)
      const sDrop = Math.max(0.45, Math.min(0.86, s * 1.1));
      const dropCol = calibrateHslToLuminanceBand(h, sDrop, Math.max(0.62, Math.min(0.78, l)), 0.28, 0.68);

      return {
        accent: `rgb(${frameCol.r}, ${frameCol.g}, ${frameCol.b})`,
        titleColor: `rgb(${titleCol.r}, ${titleCol.g}, ${titleCol.b})`,
        dropcapColor: `rgb(${dropCol.r}, ${dropCol.g}, ${dropCol.b})`,
        glow: `rgba(${frameCol.r}, ${frameCol.g}, ${frameCol.b}, 0.42)`,
        glowSoft: `rgba(${frameCol.r}, ${frameCol.g}, ${frameCol.b}, 0.16)`,
        borderSubtle: `rgba(${frameCol.r}, ${frameCol.g}, ${frameCol.b}, 0.52)`,
        btnHoverText: frameCol.lum > 0.34 ? '#090b10' : '#ffffff'
      };
    }

    function resetBlogModalAdaptiveTheme() {
      const box = document.querySelector('#blogReadModal .blog-modal-box');
      if (!box) return;
      [
        '--blog-accent',
        '--blog-title-color',
        '--blog-dropcap-color',
        '--blog-glow',
        '--blog-glow-soft',
        '--blog-border-subtle',
        '--blog-btn-hover-text'
      ].forEach(prop => box.style.removeProperty(prop));
    }

    function applyComputedThemeVarsToBlogModal(theme) {
      const box = document.querySelector('#blogReadModal .blog-modal-box');
      if (!box) return;
      if (!theme) {
        resetBlogModalAdaptiveTheme();
        return;
      }
      box.style.setProperty('--blog-accent', theme.accent);
      box.style.setProperty('--blog-title-color', theme.titleColor);
      box.style.setProperty('--blog-dropcap-color', theme.dropcapColor);
      box.style.setProperty('--blog-glow', theme.glow);
      box.style.setProperty('--blog-glow-soft', theme.glowSoft);
      box.style.setProperty('--blog-border-subtle', theme.borderSubtle);
      box.style.setProperty('--blog-btn-hover-text', theme.btnHoverText);
    }

    function getActiveEditableBlogPost() {
      if (currentGameBlogKey && gamesData && gamesData.blogs && gamesData.blogs[currentGameBlogKey]) {
        return gamesData.blogs[currentGameBlogKey];
      }
      if (currentBlogIndex !== null && currentBlogIndex !== undefined && postsData[currentBlogIndex]) {
        return postsData[currentBlogIndex];
      }
      return null;
    }
    window.getActiveEditableBlogPost = getActiveEditableBlogPost;

    function applyBlogModalAdaptiveTheme(post, _modalBody) {
      resetBlogModalAdaptiveTheme();
      if (!post) return;

      const explicitAura = (post.imageAura && String(post.imageAura).trim()) ? String(post.imageAura).trim() : '';
      if (explicitAura && explicitAura.toLowerCase() !== 'none') {
        const auraTheme = computeAccessibleBlogThemeFromColor(explicitAura);
        if (auraTheme) {
          applyComputedThemeVarsToBlogModal(auraTheme);
        }
      }
    }
    window.applyBlogModalAdaptiveTheme = applyBlogModalAdaptiveTheme;

    function openBlogModal(postIndex, forcePreview = false) {
      const post = postsData[postIndex];
      if (!post) return;

      if (typeof destroyActiveMiniGame === 'function') {
        destroyActiveMiniGame();
      }
      currentGameBlogKey = null;
      currentBlogIndex = postIndex;
      const modalBody = document.getElementById('blogModalBody');
      if (!modalBody) return;

      const modalBox = document.querySelector('#blogReadModal .blog-modal-box');
      if (modalBox) modalBox.classList.remove('is-minigame-active');

      resetBlogParagraphRevealState(modalBody);
      resetBlogModalAdaptiveTheme();

      if (isAdminMode && !forcePreview) {
        const isHidden = !!post.hidden;
        const bodyHTML = renderBlogArticleBodyHTML(post.content || '', true);
        const isEmptyBody = !(post.content && post.content.trim());

        modalBody.innerHTML = `
          <div class="wysiwyg-blog-toolbar" contenteditable="false">
            <div class="wysiwyg-tool-group">
              <button type="button" class="wysiwyg-tool-btn" onmousedown="event.preventDefault()" onclick="applyBlogInlineFormat('bold')" title="Negrita"><strong>B</strong></button>
              <button type="button" class="wysiwyg-tool-btn" onmousedown="event.preventDefault()" onclick="applyBlogInlineFormat('subtitle')" title="Subtítulo">H</button>
              <button type="button" class="wysiwyg-tool-btn" onmousedown="event.preventDefault()" onclick="applyBlogInlineFormat('center')" title="Centrar párrafo">↔</button>
              <button type="button" class="wysiwyg-tool-btn" onmousedown="event.preventDefault()" onclick="applyBlogInlineFormat('color')" title="Color de texto">🎨</button>
              <button type="button" class="wysiwyg-tool-btn" onmousedown="event.preventDefault()" onclick="applyBlogInlineFormat('link')" title="Insertar o editar enlace">🔗</button>
              <button type="button" class="wysiwyg-tool-btn" onmousedown="event.preventDefault()" onclick="applyBlogInlineFormat('img')" title="Insertar imagen en el texto">🖼️ Imagen</button>
            </div>
            <div class="wysiwyg-tool-group">
              <button type="button" class="wysiwyg-tool-btn" id="blogLiveVisBtn" onmousedown="event.preventDefault()" onclick="toggleModalPostVisibility(${postIndex}, event)" style="background: ${isHidden ? 'rgba(90,116,191,0.3)' : 'rgba(200,150,50,0.22)'}; color: ${isHidden ? 'var(--accent-light)' : '#ffd280'}; border-color: ${isHidden ? 'var(--accent-blue)' : '#cca333'};" title="Alternar visibilidad">
                ${isHidden ? '👁️ Oculto' : '👁️‍🗨️ Visible'}
              </button>
              <button type="button" class="wysiwyg-tool-btn is-danger" onmousedown="event.preventDefault()" onclick="deleteModalPost(${postIndex})" title="Eliminar publicación">🗑️</button>
              <button type="button" class="wysiwyg-tool-btn is-primary" onmousedown="event.preventDefault()" onclick="finishInlineBlogEdit()" title="Aplicar y volver">✓ Listo</button>
            </div>
          </div>

          <h1 id="blogLiveTitle" contenteditable="true" spellcheck="true" data-placeholder="Título del pensamiento..." oninput="scheduleLiveBlogModalSync()" onpaste="handlePlainTextPaste(event)" onkeydown="handleLiveBlogTitleKeydown(event)">${escapeHtmlText(post.title || '')}</h1>

          <div style="text-align: center; margin-bottom: 22px;">
            <span class="modal-date modal-date-editable" style="margin-bottom: 0;" title="Haz clic para cambiar la fecha">
              <span id="blogLiveDateText">${escapeHtmlText(post.date || formatIsoToSpanishDate(post.dateIso || ''))}</span>
              <input type="date" id="blogLiveDateIso" class="modal-date-native-picker" value="${escapeHtmlAttr(post.dateIso || '')}" onchange="handleLiveBlogDateChange(this.value)" onclick="if(this.showPicker){try{this.showPicker();}catch(err){}}">
            </span>
          </div>

          <div id="blogLiveCoverContainer">
            ${renderLiveCoverSectionHTML(post)}
          </div>

          <div id="blogEditableBody" class="blog-editable-body" contenteditable="true" spellcheck="true" data-is-empty="${isEmptyBody ? 'true' : 'false'}" data-placeholder="Escribe aquí...">
            ${bodyHTML}
          </div>

          <div class="blog-modal-bottom-actions" contenteditable="false">
            <button type="button" class="read-more-btn" onclick="finishInlineBlogEdit()">Volver</button>
            <button type="button" class="read-more-btn blog-share-btn" onclick="shareCurrentBlog()" title="Compartir este blog"><i class="fa-solid fa-share-nodes" aria-hidden="true"></i><span>Compartir</span></button>
          </div>
        `;

        setupLiveBlogEditableBodyEvents();
      } else {
        const formattedContentHTML = renderBlogArticleBodyHTML(post.content || '', false);

        modalBody.innerHTML = `
          <h1>${formatPreviewTitleUnbroken(post.title)}</h1>
          <span class="modal-date">${escapeHtmlText(post.date || '')}</span>
          ${post.image ? `
            <figure class="main-img-figure">
              <img src="${escapeHtmlAttr(post.image)}" class="main-img" ${post.imageAura ? `data-aura="${escapeHtmlAttr(post.imageAura)}"` : ''} alt="${escapeHtmlAttr(post.title || '')}">
              ${post.imageCaption ? `<figcaption class="main-img-caption">${escapeHtmlText(post.imageCaption)}</figcaption>` : ''}
            </figure>
          ` : ''}
          ${formattedContentHTML}
          <div class="blog-modal-bottom-actions">
            <button type="button" class="read-more-btn" onclick="closeBlogModal()">Volver</button>
            <button type="button" class="read-more-btn blog-share-btn" onclick="shareCurrentBlog()" title="Compartir este blog"><i class="fa-solid fa-share-nodes" aria-hidden="true"></i><span>Compartir</span></button>
          </div>
        `;
      }

      syncBlogParagraphFirstLetterColors(modalBody);

      document.getElementById('blogReadModal').style.display = 'flex';
      document.body.style.overflow = 'hidden';
      pushModalState('blog', '/' + getBlogPostShareSlug(post, postIndex));
      if (modalBox) modalBox.scrollTop = 0;

      applyBlogModalAdaptiveTheme(post, modalBody);
      triggerBlogParagraphsOpeningReveal(modalBody);

      requestAnimationFrame(() => applyLiveBlogImagesAura(modalBody, post));

      if (isAdminMode && !forcePreview && !(post.title && post.title.trim()) && !(post.content && post.content.trim())) {
        setTimeout(() => {
          const titleEl = document.getElementById('blogLiveTitle');
          if (titleEl) titleEl.focus();
        }, 80);
      }
    }

    const OFFICIAL_BLUTU_ORIGIN = 'https://blutu.org';

    function buildCleanShareSlug(rawText, fallbackPrefix = 'pensamiento') {
      const str = String(rawText || '').trim();
      if (!str) return fallbackPrefix;

      const ascii = str
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '');

      if (ascii) return ascii;

      const codeHex = Array.from(str)
        .filter((ch) => ch.trim() !== '')
        .slice(0, 4)
        .map((ch) => (ch.codePointAt(0) || 0).toString(16))
        .join('-');

      return codeHex ? `${fallbackPrefix}-${codeHex}` : fallbackPrefix;
    }

    function getBlogPostShareSlug(post, fallbackIndex = 0) {
      if (!post) return `pensamiento-${fallbackIndex}`;
      return buildCleanShareSlug(post.title || post.id || `pensamiento-${fallbackIndex}`, 'pensamiento');
    }

    function getGameBlogShareSlug(gameKey) {
      if (gameKey === 'why') return 'por-que';
      if (gameKey === 'memorama') return 'memorama';
      if (gameKey === 'sixbysix') return '6x6';
      const gPost = gamesData && gamesData.blogs && gamesData.blogs[gameKey];
      return buildCleanShareSlug((gPost && gPost.title) || gameKey, 'juego');
    }

    function getMerchItemShareSlug(item, realIdx = 0) {
      const inner = buildCleanShareSlug((item && (item.name || item.id)) || String(realIdx), 'item');
      return inner.startsWith('merch-') ? inner : `merch-${inner}`;
    }

    function clearSharedQueryParamsFromUrl() {
      try {
        if (!window.location) return;
        const params = new URLSearchParams(window.location.search || '');
        const hasShareQuery = params.has('s') || params.has('blog') || params.has('juego') || params.has('merch');
        const pathClean = String(window.location.pathname || '/').replace(/^\/+|\/+$/g, '');
        const hasSlugPath = Boolean(pathClean && pathClean !== 'index.html' && pathClean !== '404.html');
        if (!hasShareQuery && !hasSlugPath) return;

        params.delete('s');
        params.delete('blog');
        params.delete('juego');
        params.delete('merch');
        const nextQuery = params.toString();
        const nextUrl = '/' + (nextQuery ? `?${nextQuery}` : '') + (window.location.hash || '');
        window.history.replaceState(null, '', nextUrl);
      } catch (e) {}
    }

    function closeBlogModal(skipSync = false) {
      const modal = document.getElementById('blogReadModal');
      const body = document.getElementById('blogModalBody');
      const modalBox = document.querySelector('#blogReadModal .blog-modal-box');
      const wasGameBlog = Boolean(currentGameBlogKey);
      const wasInMiniGameScreen = Boolean(window.__isMiniGameScreenOpen || window.activeMiniGame);

      if (wasInMiniGameScreen && wasGameBlog && gamesData && gamesData.blogs && gamesData.blogs[currentGameBlogKey]) {
        const returnGameKey = currentGameBlogKey;
        if (typeof destroyActiveMiniGame === 'function') {
          destroyActiveMiniGame();
        }
        window.__isMiniGameScreenOpen = false;
        openGameBlogModal(returnGameKey);
        return;
      }

      if (typeof destroyActiveMiniGame === 'function') {
        destroyActiveMiniGame();
      }
      window.__isMiniGameScreenOpen = false;
      if (modalBox) {
        modalBox.classList.remove('is-minigame-active');
      }

      resetBlogParagraphRevealState(body);
      resetBlogModalAdaptiveTheme();
      const wasOpen = modal && modal.style.display !== 'none';
      if (!skipSync && wasOpen && isAdminMode && !wasInMiniGameScreen && typeof syncLiveBlogModalToMemory === 'function') {
        syncLiveBlogModalToMemory(true);
        if (wasGameBlog) {
          if (typeof renderGamesSection === 'function') renderGamesSection();
          if (typeof window.persistSiteDataInRealtime === 'function') window.persistSiteDataInRealtime(true);
        } else {
          if (typeof renderBlogPosts === 'function') renderBlogPosts();
          if (typeof renderAdminPostsList === 'function') renderAdminPostsList();
          if (typeof window.persistSiteDataInRealtime === 'function') window.persistSiteDataInRealtime(true);
        }
      }
      currentBlogIndex = null;
      currentGameBlogKey = null;
      popModalState('blog');
      if (modal) modal.style.display = 'none';
      if (body) body.innerHTML = '';
      document.body.style.overflow = '';
    }

    async function copyShareUrlFallback(urlToCopy, toastMsg) {
      let copied = false;
      if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
        try {
          await navigator.clipboard.writeText(urlToCopy);
          copied = true;
        } catch (e) {
          copied = false;
        }
      }
      if (!copied) {
        try {
          const ta = document.createElement('textarea');
          ta.value = urlToCopy;
          ta.setAttribute('readonly', '');
          ta.style.cssText = 'position:fixed;top:-9999px;left:-9999px;opacity:0;';
          document.body.appendChild(ta);
          ta.focus();
          ta.select();
          ta.setSelectionRange(0, urlToCopy.length);
          copied = document.execCommand('copy');
          ta.remove();
        } catch (e) {
          copied = false;
        }
      }
      if (copied && typeof showToastNotification === 'function') {
        showToastNotification(toastMsg || `🔗 Copiado: ${urlToCopy}`);
      }
    }

    async function shareCurrentBlog() {
      if (isAdminMode && typeof syncLiveBlogModalToMemory === 'function') {
        syncLiveBlogModalToMemory(false);
      }
      const post = getActiveEditableBlogPost();
      if (!post) return;

      const cleanTitle = String(post.title || 'Blutu').trim() || 'Blutu';
      const slug = currentGameBlogKey
        ? getGameBlogShareSlug(currentGameBlogKey)
        : getBlogPostShareSlug(post, currentBlogIndex ?? 0);
      const shareUrl = `${OFFICIAL_BLUTU_ORIGIN}/${slug}`;

      if (typeof navigator.share === 'function') {
        try {
          await navigator.share({
            title: cleanTitle,
            url: shareUrl
          });
          return;
        } catch (err) {
          if (err && err.name === 'AbortError') return;
        }
      }

      await copyShareUrlFallback(shareUrl, `🔗 Enlace copiado: blutu.org/${slug}`);
    }

    async function shareCurrentMerch(realIdx) {
      const item = merchItemsData && merchItemsData[realIdx];
      if (!item) return;

      const cleanName = String(item.name || 'Merch Blutu').trim() || 'Merch Blutu';
      const slug = getMerchItemShareSlug(item, realIdx);
      const shareUrl = `${OFFICIAL_BLUTU_ORIGIN}/${slug}`;

      if (typeof navigator.share === 'function') {
        try {
          await navigator.share({
            title: cleanName,
            url: shareUrl
          });
          return;
        } catch (err) {
          if (err && err.name === 'AbortError') return;
        }
      }

      await copyShareUrlFallback(shareUrl, `🔗 Enlace copiado: blutu.org/${slug}`);
    }

    let hasResolvedInitialSharedDeepLink = false;
    function consumeStoredDeepLinkMarkers() {
      try { sessionStorage.removeItem('blutu_spa_route'); } catch (e) {}
      try {
        if (typeof window.name === 'string' && window.name.indexOf('__blutu_spa__:') === 0) {
          window.name = '';
        }
      } catch (e) {}
    }

    const initialCapturedDeepLink = (function captureInitialDeepLinkOnce() {
      try {
        let routeFromStorage = '';
        try {
          routeFromStorage = (sessionStorage.getItem('blutu_spa_route') || '').trim();
        } catch (e) {}

        let routeFromWinName = '';
        try {
          if (typeof window.name === 'string' && window.name.indexOf('__blutu_spa__:') === 0) {
            routeFromWinName = window.name.slice('__blutu_spa__:'.length).trim();
          }
        } catch (e) {}

        const params = new URLSearchParams(window.location.search || '');
        const sParam = (params.get('s') || '').trim();
        const gameParam = (params.get('juego') || '').trim();
        const blogParam = (params.get('blog') || '').trim();
        const merchParam = (params.get('merch') || '').trim();

        let pathSlug = '';
        const rawPath = decodeURIComponent(window.location.pathname || '/').replace(/^\/+|\/+$/g, '');
        if (rawPath && rawPath !== 'index.html' && rawPath !== '404.html') {
          pathSlug = rawPath;
        }

        const slug = (sParam || routeFromStorage || routeFromWinName || pathSlug).replace(/^\/+|\/+$/g, '');

        // Limpiar de inmediato cualquier "?s=" o "?_v=" de la barra de direcciones para que nunca quede visible
        if (sParam || params.has('_v')) {
          try {
            params.delete('s');
            params.delete('_v');
            const rest = params.toString();
            const cleanBase = '/' + (rest ? `?${rest}` : '') + (window.location.hash || '');
            window.history.replaceState(null, '', cleanBase);
          } catch (e) {}
        }

        return { slug, gameParam, blogParam, merchParam };
      } catch (e) {
        return { slug: '', gameParam: '', blogParam: '', merchParam: '' };
      }
    })();

    function prepareBaseHomepageHistoryBeforeDeepLink() {
      consumeStoredDeepLinkMarkers();
      try {
        window.history.replaceState(null, '', '/');
      } catch (e) {}
    }

    function checkPendingSharedDeepLink() {
      if (hasResolvedInitialSharedDeepLink) return;
      const { slug, gameParam, blogParam, merchParam } = initialCapturedDeepLink;
      if (!slug && !gameParam && !blogParam && !merchParam) return;

      // 1. Verificar coincidencia con ruta limpia blutu.org/<slug>
      if (slug) {
        let decodedSlug = slug;
        try { decodedSlug = decodeURIComponent(slug); } catch (e) {}
        const cleanLower = decodedSlug.toLowerCase().trim();
        const slugNorm = buildCleanShareSlug(decodedSlug, 'pensamiento');

        // 1a. Blogs de Juegos (por-que, memorama, 6x6 o título personalizado)
        const gameAliases = {
          'por-que': 'why',
          'porque': 'why',
          'why': 'why',
          'memorama': 'memorama',
          '6x6': 'sixbysix',
          'sixbysix': 'sixbysix'
        };
        let matchedGameKey = gameAliases[cleanLower] || gameAliases[slugNorm] || null;
        if (!matchedGameKey && gamesData && gamesData.blogs) {
          matchedGameKey = ['why', 'memorama', 'sixbysix'].find((k) => {
            const gp = gamesData.blogs[k];
            return gp && buildCleanShareSlug(gp.title, 'juego') === slugNorm;
          }) || null;
        }
        if (matchedGameKey && gamesData && gamesData.blogs && gamesData.blogs[matchedGameKey]) {
          hasResolvedInitialSharedDeepLink = true;
          prepareBaseHomepageHistoryBeforeDeepLink();
          openGameBlogModal(matchedGameKey, true);
          return;
        }

        // 1b. Productos de Merch (blutu.org/merch-...)
        if (cleanLower.startsWith('merch-') || slugNorm.startsWith('merch-')) {
          const mList = Array.isArray(merchItemsData) ? merchItemsData : [];
          const mIdx = mList.findIndex((it, idx) => it && it.visible !== false && (
            getMerchItemShareSlug(it, idx) === cleanLower ||
            getMerchItemShareSlug(it, idx) === slugNorm
          ));
          if (mIdx !== -1) {
            hasResolvedInitialSharedDeepLink = true;
            prepareBaseHomepageHistoryBeforeDeepLink();
            openMerchDetailModal(mIdx);
            return;
          }
        }

        // 1c. Blogs de Pensamientos (blutu.org/<slug>)
        const list = (Array.isArray(window.postsData) && window.postsData.length > 0)
          ? window.postsData
          : (Array.isArray(postsData) ? postsData : []);
        if (list !== postsData && list.length > 0) {
          postsData = list;
        }
        const normRaw = normalizePostStr(decodedSlug);
        const foundIdx = list.findIndex((p, idx) => {
          if (!p || p.hidden) return false;
          const postSlug = getBlogPostShareSlug(p, idx);
          if (postSlug === cleanLower || postSlug === slugNorm) return true;
          if (buildCleanShareSlug(p.id || '', 'pensamiento') === slugNorm && p.id) return true;
          if (String(p.id || '').trim() === decodedSlug || String(p.title || '').trim() === decodedSlug) return true;
          return Boolean(normRaw && (normalizePostStr(p.id) === normRaw || normalizePostStr(p.title) === normRaw));
        });
        if (foundIdx !== -1) {
          hasResolvedInitialSharedDeepLink = true;
          prepareBaseHomepageHistoryBeforeDeepLink();
          openBlogModal(foundIdx, true);
          return;
        }
      }

      // 2. Compatibilidad con parámetros antiguos (?juego=..., ?blog=..., ?merch=...)
      if (gameParam) {
        const gLower = gameParam.toLowerCase();
        const mappedKey = (gLower === '6x6' || gLower === 'por-que')
          ? (gLower === '6x6' ? 'sixbysix' : 'why')
          : gLower;
        if (gamesData && gamesData.blogs && gamesData.blogs[mappedKey]) {
          hasResolvedInitialSharedDeepLink = true;
          prepareBaseHomepageHistoryBeforeDeepLink();
          openGameBlogModal(mappedKey, true);
          return;
        }
      }

      if (blogParam) {
        const normTarget = normalizePostStr(blogParam);
        const slugTarget = buildCleanShareSlug(blogParam, 'pensamiento');
        const list = Array.isArray(postsData) ? postsData : [];
        let foundIdx = list.findIndex((p, idx) => p && !p.hidden && (
          getBlogPostShareSlug(p, idx) === slugTarget ||
          String(p.id || '').trim() === blogParam ||
          String(p.title || '').trim() === blogParam ||
          (normTarget && (normalizePostStr(p.id) === normTarget || normalizePostStr(p.title) === normTarget))
        ));
        if (foundIdx === -1 && /^\d+$/.test(blogParam)) {
          const numIdx = parseInt(blogParam, 10);
          if (list[numIdx] && !list[numIdx].hidden) foundIdx = numIdx;
        }
        if (foundIdx !== -1) {
          hasResolvedInitialSharedDeepLink = true;
          prepareBaseHomepageHistoryBeforeDeepLink();
          openBlogModal(foundIdx, true);
          return;
        }
      }

      if (merchParam) {
        const normMerch = normalizePostStr(merchParam);
        const mList = Array.isArray(merchItemsData) ? merchItemsData : [];
        let mIdx = mList.findIndex((it) => it && it.visible !== false && (
          String(it.id || '').trim() === merchParam ||
          String(it.name || '').trim() === merchParam ||
          (normMerch && (normalizePostStr(it.id) === normMerch || normalizePostStr(it.name) === normMerch))
        ));
        if (mIdx === -1 && /^\d+$/.test(merchParam)) {
          const numIdx = parseInt(merchParam, 10);
          if (mList[numIdx] && mList[numIdx].visible !== false) mIdx = numIdx;
        }
        if (mIdx !== -1) {
          hasResolvedInitialSharedDeepLink = true;
          prepareBaseHomepageHistoryBeforeDeepLink();
          openMerchDetailModal(mIdx);
        }
      }
    }
    window.checkPendingSharedDeepLink = checkPendingSharedDeepLink;

    function blogModalBgClick(event) {
      if (event.target.id === 'blogReadModal') {
        closeBlogModal();
      }
    }

    /* ============================================================================
       SECCIÓN JUEGOS: "¿POR QUÉ?", CASILLAS MEMORAMA / 6X6, BLOGS EDITABLES Y MOTORES BAJO DEMANDA
       (Cero carga en apertura de página y limpieza completa al terminar/salir)
       ============================================================================ */
    // activeMiniGame managed via window getter/setter & lazy games-engine.js
    let pendingGamesLocalCacheTimer = null;

    function persistGamesLocalCache() {
      if (pendingGamesLocalCacheTimer) {
        clearTimeout(pendingGamesLocalCacheTimer);
        pendingGamesLocalCacheTimer = null;
      }
      window.gamesData = gamesData;
      try {
        localStorage.setItem('blutu_games_data', JSON.stringify(gamesData));
        const cachedRaw = localStorage.getItem('blutu_live_site_data');
        const parsed = cachedRaw ? JSON.parse(cachedRaw) : {};
        parsed.buzon = {
          isVisible: isBuzonSectionVisible,
          gamesVisible: isGamesSectionVisible
        };
        parsed.muro = {
          ...(parsed.muro || {}),
          isVisible: isBuzonSectionVisible,
          gamesVisible: isGamesSectionVisible,
          hiddenCommentIds: hiddenCommentIds,
          gamesData: gamesData
        };
        parsed.updatedAt = Date.now();
        localStorage.setItem('blutu_live_site_data', JSON.stringify(parsed));
      } catch (e) {
        console.warn('Error persisting games local cache:', e);
      }
    }
    window.persistGamesLocalCache = persistGamesLocalCache;

    function schedulePersistGamesLocalCache() {
      window.gamesData = gamesData;
      if (pendingGamesLocalCacheTimer) clearTimeout(pendingGamesLocalCacheTimer);
      pendingGamesLocalCacheTimer = setTimeout(() => {
        pendingGamesLocalCacheTimer = null;
        persistGamesLocalCache();
      }, 850);
    }

    function computeGameButtonStyleAttr(rawColor) {
      const hex = normalizeCssColorToHex(rawColor || '#5a74bf') || '#5a74bf';
      const parsed = parseCssColorToRgb(hex) || { r: 90, g: 116, b: 191 };
      const lum = (0.2126 * Math.pow(parsed.r / 255, 2.2)) +
                  (0.7152 * Math.pow(parsed.g / 255, 2.2)) +
                  (0.0722 * Math.pow(parsed.b / 255, 2.2));
      const textCol = lum > 0.36 ? '#07090f' : '#ffffff';
      const borderR = Math.min(255, Math.round(parsed.r + (255 - parsed.r) * 0.38));
      const borderG = Math.min(255, Math.round(parsed.g + (255 - parsed.g) * 0.38));
      const borderB = Math.min(255, Math.round(parsed.b + (255 - parsed.b) * 0.38));
      const borderCol = `rgb(${borderR}, ${borderG}, ${borderB})`;
      const glowCol = `rgba(${parsed.r}, ${parsed.g}, ${parsed.b}, 0.48)`;
      return `--game-btn-bg: ${hex}; --game-btn-text: ${textCol}; --game-btn-border: ${borderCol}; --game-btn-glow: ${glowCol};`;
    }

    function buildGameCardFallbackSvg(gameKey) {
      if (gameKey === 'memorama') {
        const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 360 240"><rect width="360" height="240" fill="#070910"/><g stroke="#8ca2e6" stroke-opacity="0.55" stroke-width="2" fill="#0f1526"><rect x="68" y="34" width="48" height="68" rx="8"/><rect x="126" y="34" width="48" height="68" rx="8"/><rect x="184" y="34" width="48" height="68" rx="8"/><rect x="242" y="34" width="48" height="68" rx="8"/><rect x="68" y="114" width="48" height="68" rx="8"/><rect x="126" y="114" width="48" height="68" rx="8" fill="#1e2a4a" stroke="#dbe5ff"/><rect x="184" y="114" width="48" height="68" rx="8" fill="#1e2a4a" stroke="#dbe5ff"/><rect x="242" y="114" width="48" height="68" rx="8"/></g><text x="150" y="157" text-anchor="middle" font-family="serif" font-size="26" fill="#eef3ff">✠</text><text x="210" y="157" text-anchor="middle" font-family="serif" font-size="26" fill="#eef3ff">✠</text></svg>`;
        return 'data:image/svg+xml;utf8,' + encodeURIComponent(svg);
      }
      const svg6 = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 360 240"><rect width="360" height="240" fill="#070910"/><g stroke="#8ca2e6" stroke-opacity="0.5" stroke-width="1.6" fill="#0f1526"><rect x="92" y="32" width="54" height="54" rx="7"/><rect x="153" y="32" width="54" height="54" rx="7"/><rect x="214" y="32" width="54" height="54" rx="7"/><rect x="92" y="93" width="54" height="54" rx="7"/><rect x="153" y="93" width="54" height="54" rx="7" fill="#1e2a4a" stroke="#dbe5ff"/><rect x="214" y="93" width="54" height="54" rx="7"/><rect x="92" y="154" width="54" height="54" rx="7"/><rect x="153" y="154" width="54" height="54" rx="7"/><rect x="214" y="154" width="54" height="54" rx="7"/></g><text x="119" y="67" text-anchor="middle" font-family="serif" font-size="22" fill="#9fb2eb">1</text><text x="180" y="128" text-anchor="middle" font-family="serif" font-size="23" font-weight="bold" fill="#ffffff">6×6</text><text x="241" y="189" text-anchor="middle" font-family="serif" font-size="22" fill="#9fb2eb">36</text></svg>`;
      return 'data:image/svg+xml;utf8,' + encodeURIComponent(svg6);
    }

    function renderGamesSection() {
      if (!gamesData || !gamesData.blogs) {
        gamesData = createDefaultGamesData();
      }
      const whyBtn = document.getElementById('gamesWhyLinkBtn');
      if (whyBtn) {
        const whyHex = normalizeCssColorToHex(gamesData.whyColor || '#8ca2e6') || '#8ca2e6';
        whyBtn.style.color = whyHex;
        whyBtn.style.textDecorationColor = whyHex;
        whyBtn.innerHTML = isAdminMode ? '¿Por qué? <span style="font-size:0.78rem;opacity:0.8;">✏️</span>' : '¿Por qué?';
        whyBtn.title = isAdminMode ? 'Haz clic para editar el blog de ¿Por qué?' : 'Abrir ¿Por qué?';
      }

      const container = document.getElementById('gamesCardsContainer');
      if (!container) return;

      const cardsSpec = [
        { key: 'memorama', defaultTitle: 'Memorama', isEven: false },
        { key: 'sixbysix', defaultTitle: '6x6', isEven: true }
      ];

      container.innerHTML = cardsSpec.map((spec) => {
        const blogObj = gamesData.blogs[spec.key] || {};
        const displayTitle = (blogObj.title && blogObj.title.trim()) ? blogObj.title.trim() : spec.defaultTitle;
        const imgSrc = (blogObj.image && blogObj.image.trim()) ? blogObj.image.trim() : buildGameCardFallbackSvg(spec.key);
        const parsedFit = parsePostImageCrop(blogObj.imageFit || 'cover-center');
        const fitStyle = getFitCssForPost(blogObj.imageFit || 'cover-center');
        const cropAttrs = parsedFit.isCrop ? `data-crop-z="${parsedFit.z.toFixed(3)}" onload="syncBlogCroppedThumbCover(this)"` : '';
        const thumbClasses = parsedFit.isCrop ? 'blog-thumb blog-thumb-cropped' : 'blog-thumb';
        const parityClass = spec.isEven ? 'even-preview has-thumb img-right' : 'odd-preview has-thumb img-left';
        const fallbackAttr = escapeHtmlAttr(buildGameCardFallbackSvg(spec.key));

        if (isAdminMode) {
          const hasRealCover = Boolean(blogObj.image && blogObj.image.trim());
          return `
            <article class="blog-article ${parityClass}" role="button" tabindex="0" onclick="openGameBlogModal('${spec.key}')" onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();openGameBlogModal('${spec.key}');}" title="Toca para editar el blog y opciones de ${escapeHtmlAttr(displayTitle)}">
              <div class="blog-thumb-frame blog-thumb-admin-wrap" onclick="event.stopPropagation(); ${hasRealCover ? `openBlogThumbCropModal('game:${spec.key}')` : `openGameBlogModal('${spec.key}')`}" title="${hasRealCover ? 'Recortar miniatura' : 'Abrir editor para elegir portada'}">
                <img src="${escapeHtmlAttr(imgSrc)}" alt="${escapeHtmlAttr(displayTitle)}" class="${thumbClasses}" loading="lazy" decoding="async" referrerpolicy="no-referrer" ${cropAttrs} style="${fitStyle}" onerror="if(this.dataset.fb!=='1'){this.dataset.fb='1';this.src='${fallbackAttr}';}">
                <span class="blog-thumb-crop-hint">${hasRealCover ? '✂️' : '🖼️'}</span>
              </div>
              <div class="blog-content">
                <div class="blog-card-top">
                  <h3>${formatPreviewTitleUnbroken(displayTitle)}</h3>
                  <div class="blog-meta-row" style="justify-content:flex-end;">
                    <span class="blog-preview-arrow" aria-hidden="true"><i class="fa-solid fa-pen-to-square" style="font-size:0.82rem;margin-right:4px;"></i><i class="fa-solid fa-arrow-right-long"></i></span>
                  </div>
                </div>
              </div>
            </article>
          `;
        }

        return `
          <article class="blog-article ${parityClass}" role="button" tabindex="0" onclick="triggerGameBlogOpen('${spec.key}', this)" onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();triggerGameBlogOpen('${spec.key}', this);}">
            <div class="blog-thumb-frame">
              <img src="${escapeHtmlAttr(imgSrc)}" alt="${escapeHtmlAttr(displayTitle)}" class="${thumbClasses}" loading="lazy" decoding="async" referrerpolicy="no-referrer" ${cropAttrs} style="${fitStyle}" onerror="if(this.dataset.fb!=='1'){this.dataset.fb='1';this.src='${fallbackAttr}';}">
            </div>
            <div class="blog-content">
              <div class="blog-card-top">
                <h3>${formatPreviewTitleUnbroken(displayTitle)}</h3>
                <div class="blog-meta-row" style="justify-content:flex-end;">
                  <span class="blog-preview-arrow" aria-hidden="true"><i class="fa-solid fa-arrow-right-long"></i></span>
                </div>
              </div>
            </div>
          </article>
        `;
      }).join('');

      requestAnimationFrame(() => {
        if (typeof syncBlogCroppedThumbCover === 'function') {
          container.querySelectorAll('img.blog-thumb-cropped').forEach(syncBlogCroppedThumbCover);
        }
      });
    }
    window.renderGamesSection = renderGamesSection;

    function triggerGameBlogOpen(gameKey, triggerEl) {
      if (isAdminMode) {
        openGameBlogModal(gameKey);
        return;
      }
      if (triggerEl && typeof triggerGreekCrossAnimation === 'function') {
        const animCol = getComputedStyle(document.documentElement).getPropertyValue('--accent-light').trim() || '#8ca2e6';
        triggerGreekCrossAnimation(triggerEl, animCol, 280);
      }
      openGameBlogModal(gameKey);
    }
    window.triggerGameBlogOpen = triggerGameBlogOpen;

    function collectAvailableSiteGalleryImagesForPicker() {
      const list = [];
      const seen = new Set();
      const addOpt = (url, label) => {
        const clean = String(url || '').trim();
        if (!clean || seen.has(clean) || /^data:image\/svg/i.test(clean)) return;
        seen.add(clean);
        list.push({ url: clean, label });
      };
      if (galleriesData && typeof galleriesData === 'object') {
        Object.keys(galleriesData).forEach(gKey => {
          const gal = galleriesData[gKey];
          const gTitle = (gal && gal.title) ? gal.title : gKey;
          const items = (gal && Array.isArray(gal.items)) ? gal.items : [];
          items.forEach((it, idx) => {
            if (!it || it.type === 'video') return;
            const s = it.src || it.url || '';
            if (s && !/\.(mp4|webm|ogg)(\?|$)/i.test(s)) {
              addOpt(s, `${gTitle} #${idx + 1}${it.caption ? ' — ' + it.caption.slice(0, 22) : ''}`);
            }
          });
        });
      }
      if (Array.isArray(postsData)) {
        postsData.forEach((p, idx) => {
          if (p && p.image) {
            addOpt(p.image, `Pensamiento: ${(p.title || ('#' + (idx + 1))).slice(0, 24)}`);
          }
        });
      }
      addOpt('blutu_logo.png', 'Logo Blutu');
      return list;
    }

    function renderGameBlogBottomControlsHTML(gameKey, inAdminEditor) {
      if (gameKey === 'why') {
        const backHex = normalizeCssColorToHex((gamesData.blogs.why && gamesData.blogs.why.backBtnColor) || '#25335c') || '#25335c';
        const whyHex = normalizeCssColorToHex(gamesData.whyColor || '#8ca2e6') || '#8ca2e6';
        const adminColorsHTML = inAdminEditor ? `
          <div class="game-admin-config-panel" contenteditable="false">
            <h4 class="game-admin-config-title">🎨 Colores de "¿Por qué?"</h4>
            <div class="game-admin-colors-grid">
              <label class="game-admin-color-item">
                <span>Texto "¿Por qué?"</span>
                <input type="color" value="${escapeHtmlAttr(whyHex)}" oninput="updateGameButtonColorLive('why', 'whyColor', this.value)">
              </label>
              <label class="game-admin-color-item">
                <span>Botón Volver</span>
                <input type="color" value="${escapeHtmlAttr(backHex)}" oninput="updateGameButtonColorLive('why', 'backBtnColor', this.value)">
              </label>
            </div>
          </div>
        ` : '';

        return `
          ${adminColorsHTML}
          <div class="game-blog-actions-stack" contenteditable="false">
            <div class="game-blog-modes-row">
              <button type="button" id="gameBlogBackActionBtn" class="game-custom-btn is-volver-btn" style="${computeGameButtonStyleAttr(backHex)}" onclick="${inAdminEditor ? 'finishInlineBlogEdit()' : 'closeBlogModal()'}">Volver</button>
              <button type="button" id="gameBlogShareActionBtn" class="game-custom-btn is-volver-btn blog-share-btn" style="${computeGameButtonStyleAttr(backHex)}" onclick="shareCurrentBlog()" title="Compartir este blog"><i class="fa-solid fa-share-nodes" aria-hidden="true"></i><span>Compartir</span></button>
            </div>
          </div>
        `;
      }

      if (gameKey === 'memorama') {
        const mem = gamesData.memorama;
        if (!Array.isArray(mem.pairCrops)) {
          mem.pairCrops = Array(10).fill('cover-center');
        }
        const soloHex = normalizeCssColorToHex(mem.soloBtnColor || '#5a74bf') || '#5a74bf';
        const vsPcHex = normalizeCssColorToHex(mem.vsPcBtnColor || '#364d8f') || '#364d8f';
        const vsPcEasyHex = normalizeCssColorToHex(mem.vsPcEasyBtnColor || '#4b67b3') || '#4b67b3';
        const vsPcHardHex = normalizeCssColorToHex(mem.vsPcHardBtnColor || '#2b3e78') || '#2b3e78';
        const retryHex = normalizeCssColorToHex(mem.retryBtnColor || '#4a63ab') || '#4a63ab';
        const backHex = normalizeCssColorToHex(mem.backBtnColor || '#1f2b4d') || '#1f2b4d';
        const userTurnHex = normalizeCssColorToHex(mem.userTurnColor || '#3b66d4') || '#3b66d4';
        const pcTurnHex = normalizeCssColorToHex(mem.pcTurnColor || '#b83252') || '#b83252';

        let adminPanelHTML = '';
        if (inAdminEditor) {
          const galleryOpts = collectAvailableSiteGalleryImagesForPicker();
          const selectOptionsHTML = `<option value="">🖼️ Elegir de galería...</option>` +
            galleryOpts.map(opt => `<option value="${escapeHtmlAttr(opt.url)}">${escapeHtmlText(opt.label)}</option>`).join('');

          const slotsHTML = mem.pairImages.slice(0, 10).map((imgUrl, idx) => {
            const fbSvg = escapeHtmlAttr(buildDefaultGothicCardSvgDataUri(String(idx + 1), '#8ca2e6'));
            const pairCropVal = (Array.isArray(mem.pairCrops) && mem.pairCrops[idx]) ? mem.pairCrops[idx] : 'cover-center';
            const parsedCrop = parsePostImageCrop(pairCropVal);
            const thumbFitStyle = getFitCssForPost(pairCropVal);
            const cropAttrs = parsedCrop.isCrop ? ` data-crop-z="${parsedCrop.z.toFixed(3)}" onload="syncBlogCroppedThumbCover(this)"` : '';
            const cropImgClass = parsedCrop.isCrop ? 'memorama-pair-slot-img blog-thumb-cropped' : 'memorama-pair-slot-img';
            return `
              <div class="memorama-pair-slot-card">
                <div class="memorama-pair-slot-thumb-frame" onclick="openBlogThumbCropModal('memorama-pair:${idx}')" title="Toca para ajustar encuadre y zoom de Pareja #${idx + 1}">
                  <img id="memoramaPairThumb_${idx}" src="${escapeHtmlAttr(imgUrl)}" alt="Pareja ${idx + 1}" class="${cropImgClass}" referrerpolicy="no-referrer"${cropAttrs} style="${thumbFitStyle}" onerror="if(this.dataset.fb!=='1'){this.dataset.fb='1';this.src='${fbSvg}';}">
                  <span class="memorama-pair-crop-badge" aria-hidden="true">✂️</span>
                </div>
                <div class="memorama-pair-slot-controls">
                  <div style="display:flex;justify-content:space-between;align-items:center;gap:4px;">
                    <span style="font-family:'Cinzel',serif;font-size:0.72rem;color:var(--accent-light);">Pareja #${idx + 1}</span>
                    <button type="button" class="memorama-pair-mini-btn" onclick="openBlogThumbCropModal('memorama-pair:${idx}')" title="Ajustar encuadre detallado">✂️ Encuadre</button>
                  </div>
                  <input type="text" id="memoramaPairInput_${idx}" value="${escapeHtmlAttr(imgUrl.startsWith('data:') ? '' : imgUrl)}" placeholder="${imgUrl.startsWith('data:') ? 'Imagen subida desde dispositivo (pega URL para cambiar)' : 'URL de imagen...'}" oninput="handleMemoramaPairUrlInput(${idx}, this.value)">
                  <div class="memorama-pair-slot-btn-row">
                    <label class="memorama-pair-mini-btn" style="cursor:pointer;">
                      📁 Subir foto
                      <input type="file" accept="image/*" style="display:none;" onchange="handleMemoramaPairFileUpload(${idx}, this)">
                    </label>
                    <select class="memorama-pair-mini-btn" style="max-width:142px;" onchange="if(this.value){handleMemoramaPairGalleryPick(${idx}, this.value); this.value='';}">
                      ${selectOptionsHTML}
                    </select>
                  </div>
                </div>
              </div>
            `;
          }).join('');

          adminPanelHTML = `
            <div class="game-admin-config-panel" contenteditable="false">
              <h4 class="game-admin-config-title">🃏 10 Imágenes de Parejas (Memorama 4×5)</h4>
              <p style="font-size:0.84rem;color:var(--text-muted);text-align:center;margin:0 0 10px 0;">Escoge las 10 imágenes y toca cada miniatura o <strong>✂️ Encuadre</strong> para acercar, alejar y mover el recorte exacto de la carta.</p>
              <div class="memorama-pairs-editor-grid">
                ${slotsHTML}
              </div>

              <h4 class="game-admin-config-title" style="margin-top:18px;">🎨 Colores de los Botones (Memorama)</h4>
              <div class="game-admin-colors-grid">
                <label class="game-admin-color-item">
                  <span>Solo</span>
                  <input type="color" value="${escapeHtmlAttr(soloHex)}" oninput="updateGameButtonColorLive('memorama', 'soloBtnColor', this.value)">
                </label>
                <label class="game-admin-color-item">
                  <span>Vs PC</span>
                  <input type="color" value="${escapeHtmlAttr(vsPcHex)}" oninput="updateGameButtonColorLive('memorama', 'vsPcBtnColor', this.value)">
                </label>
                <label class="game-admin-color-item">
                  <span>Vs PC Fácil</span>
                  <input type="color" value="${escapeHtmlAttr(vsPcEasyHex)}" oninput="updateGameButtonColorLive('memorama', 'vsPcEasyBtnColor', this.value)">
                </label>
                <label class="game-admin-color-item">
                  <span>Vs PC Difícil</span>
                  <input type="color" value="${escapeHtmlAttr(vsPcHardHex)}" oninput="updateGameButtonColorLive('memorama', 'vsPcHardBtnColor', this.value)">
                </label>
                <label class="game-admin-color-item">
                  <span>Reintentar</span>
                  <input type="color" value="${escapeHtmlAttr(retryHex)}" oninput="updateGameButtonColorLive('memorama', 'retryBtnColor', this.value)">
                </label>
                <label class="game-admin-color-item">
                  <span>Volver</span>
                  <input type="color" value="${escapeHtmlAttr(backHex)}" oninput="updateGameButtonColorLive('memorama', 'backBtnColor', this.value)">
                </label>
              </div>

              <h4 class="game-admin-config-title" style="margin-top:14px;">🪟 Color de Ventana por Turno (Vs PC)</h4>
              <div class="game-admin-colors-grid">
                <label class="game-admin-color-item">
                  <span>Tu turno</span>
                  <input type="color" value="${escapeHtmlAttr(userTurnHex)}" oninput="updateGameButtonColorLive('memorama', 'userTurnColor', this.value)">
                </label>
                <label class="game-admin-color-item">
                  <span>Turno PC</span>
                  <input type="color" value="${escapeHtmlAttr(pcTurnHex)}" oninput="updateGameButtonColorLive('memorama', 'pcTurnColor', this.value)">
                </label>
              </div>
            </div>
          `;
        }

        return `
          ${adminPanelHTML}
          <div class="game-blog-actions-stack" contenteditable="false">
            <div class="game-blog-modes-row">
              <button type="button" id="memoramaSoloLaunchBtn" class="game-custom-btn" style="${computeGameButtonStyleAttr(soloHex)}" onclick="launchMiniGameFromBlog('memorama', 'solo')">Solo</button>
              <button type="button" id="memoramaVsPcLaunchBtn" class="game-custom-btn" style="${computeGameButtonStyleAttr(vsPcHex)}" onclick="toggleMemoramaVsPcDifficultyRow('blogVsPcDiffRow')">Vs PC</button>
            </div>
            <div id="blogVsPcDiffRow" class="game-blog-vspc-subrow" style="display:none;">
              <button type="button" id="memoramaVsPcEasyLaunchBtn" class="game-custom-btn is-submode-btn" style="${computeGameButtonStyleAttr(vsPcEasyHex)}" onclick="launchMiniGameFromBlog('memorama', 'vspc-easy')">Fácil</button>
              <button type="button" id="memoramaVsPcHardLaunchBtn" class="game-custom-btn is-submode-btn" style="${computeGameButtonStyleAttr(vsPcHardHex)}" onclick="launchMiniGameFromBlog('memorama', 'vspc-hard')">Difícil</button>
            </div>
            <div class="game-blog-modes-row">
              <button type="button" id="gameBlogBackActionBtn" class="game-custom-btn is-volver-btn" style="${computeGameButtonStyleAttr(backHex)}" onclick="${inAdminEditor ? 'finishInlineBlogEdit()' : 'closeBlogModal()'}">Volver</button>
              <button type="button" id="gameBlogShareActionBtn" class="game-custom-btn is-volver-btn blog-share-btn" style="${computeGameButtonStyleAttr(backHex)}" onclick="shareCurrentBlog()" title="Compartir este blog"><i class="fa-solid fa-share-nodes" aria-hidden="true"></i><span>Compartir</span></button>
            </div>
          </div>
        `;
      }

      // 6x6
      const six = gamesData.sixBySix;
      const easyHex = normalizeCssColorToHex(six.easyBtnColor || '#5a74bf') || '#5a74bf';
      const hardHex = normalizeCssColorToHex(six.hardBtnColor || '#364d8f') || '#364d8f';
      const retryHex = normalizeCssColorToHex(six.retryBtnColor || '#4a63ab') || '#4a63ab';
      const finishHex = normalizeCssColorToHex(six.finishBtnColor || '#41599f') || '#41599f';
      const backHex = normalizeCssColorToHex(six.backBtnColor || '#1f2b4d') || '#1f2b4d';

      const adminSixHTML = inAdminEditor ? `
        <div class="game-admin-config-panel" contenteditable="false">
          <h4 class="game-admin-config-title">🎨 Colores de los Botones (6x6)</h4>
          <div class="game-admin-colors-grid">
            <label class="game-admin-color-item">
              <span>Fácil</span>
              <input type="color" value="${escapeHtmlAttr(easyHex)}" oninput="updateGameButtonColorLive('sixbysix', 'easyBtnColor', this.value)">
            </label>
            <label class="game-admin-color-item">
              <span>Difícil</span>
              <input type="color" value="${escapeHtmlAttr(hardHex)}" oninput="updateGameButtonColorLive('sixbysix', 'hardBtnColor', this.value)">
            </label>
            <label class="game-admin-color-item">
              <span>Reintentar</span>
              <input type="color" value="${escapeHtmlAttr(retryHex)}" oninput="updateGameButtonColorLive('sixbysix', 'retryBtnColor', this.value)">
            </label>
            <label class="game-admin-color-item">
              <span>Terminar</span>
              <input type="color" value="${escapeHtmlAttr(finishHex)}" oninput="updateGameButtonColorLive('sixbysix', 'finishBtnColor', this.value)">
            </label>
            <label class="game-admin-color-item">
              <span>Volver</span>
              <input type="color" value="${escapeHtmlAttr(backHex)}" oninput="updateGameButtonColorLive('sixbysix', 'backBtnColor', this.value)">
            </label>
          </div>
        </div>
      ` : '';

      return `
        ${adminSixHTML}
        <div class="game-blog-actions-stack" contenteditable="false">
          <div class="game-blog-modes-row">
            <button type="button" id="sixEasyLaunchBtn" class="game-custom-btn" style="${computeGameButtonStyleAttr(easyHex)}" onclick="launchMiniGameFromBlog('sixbysix', 'easy')">Fácil</button>
            <button type="button" id="sixHardLaunchBtn" class="game-custom-btn" style="${computeGameButtonStyleAttr(hardHex)}" onclick="launchMiniGameFromBlog('sixbysix', 'hard')">Difícil</button>
          </div>
          <div class="game-blog-modes-row">
            <button type="button" id="gameBlogBackActionBtn" class="game-custom-btn is-volver-btn" style="${computeGameButtonStyleAttr(backHex)}" onclick="${inAdminEditor ? 'finishInlineBlogEdit()' : 'closeBlogModal()'}">Volver</button>
            <button type="button" id="gameBlogShareActionBtn" class="game-custom-btn is-volver-btn blog-share-btn" style="${computeGameButtonStyleAttr(backHex)}" onclick="shareCurrentBlog()" title="Compartir este blog"><i class="fa-solid fa-share-nodes" aria-hidden="true"></i><span>Compartir</span></button>
          </div>
        </div>
      `;
    }

    function openGameBlogModal(gameKey, forcePreview = false) {
      if (!gamesData || !gamesData.blogs || !gamesData.blogs[gameKey]) return;
      if (gameKey === 'memorama' || gameKey === 'sixbysix') {
        ensureGamesEngineLoaded();
      }

      destroyActiveMiniGame();
      window.__isMiniGameScreenOpen = false;
      currentBlogIndex = null;
      currentGameBlogKey = gameKey;

      const post = gamesData.blogs[gameKey];
      const modalBody = document.getElementById('blogModalBody');
      const modalEl = document.getElementById('blogReadModal');
      const modalBox = document.querySelector('#blogReadModal .blog-modal-box');
      if (!modalBody || !modalEl) return;

      if (modalBox) modalBox.classList.remove('is-minigame-active');

      resetBlogParagraphRevealState(modalBody);
      resetBlogModalAdaptiveTheme();

      if (isAdminMode && !forcePreview) {
        const bodyHTML = renderBlogArticleBodyHTML(post.content || '', true);
        const isEmptyBody = !(post.content && post.content.trim());

        modalBody.innerHTML = `
          <div class="wysiwyg-blog-toolbar" contenteditable="false">
            <div class="wysiwyg-tool-group">
              <button type="button" class="wysiwyg-tool-btn" onmousedown="event.preventDefault()" onclick="applyBlogInlineFormat('bold')" title="Negrita"><strong>B</strong></button>
              <button type="button" class="wysiwyg-tool-btn" onmousedown="event.preventDefault()" onclick="applyBlogInlineFormat('subtitle')" title="Subtítulo">H</button>
              <button type="button" class="wysiwyg-tool-btn" onmousedown="event.preventDefault()" onclick="applyBlogInlineFormat('center')" title="Centrar párrafo">↔</button>
              <button type="button" class="wysiwyg-tool-btn" onmousedown="event.preventDefault()" onclick="applyBlogInlineFormat('color')" title="Color de texto">🎨</button>
              <button type="button" class="wysiwyg-tool-btn" onmousedown="event.preventDefault()" onclick="applyBlogInlineFormat('link')" title="Insertar o editar enlace">🔗</button>
              <button type="button" class="wysiwyg-tool-btn" onmousedown="event.preventDefault()" onclick="applyBlogInlineFormat('img')" title="Insertar imagen en el texto">🖼️ Imagen</button>
            </div>
            <div class="wysiwyg-tool-group">
              <button type="button" class="wysiwyg-tool-btn is-primary" onmousedown="event.preventDefault()" onclick="finishInlineBlogEdit()" title="Aplicar y volver">✓ Listo</button>
            </div>
          </div>

          <h1 id="blogLiveTitle" contenteditable="true" spellcheck="true" data-placeholder="Título del blog..." style="margin-bottom:18px;" oninput="scheduleLiveBlogModalSync()" onpaste="handlePlainTextPaste(event)" onkeydown="handleLiveBlogTitleKeydown(event)">${escapeHtmlText(post.title || '')}</h1>

          <div id="blogLiveCoverContainer">
            ${renderLiveCoverSectionHTML(post)}
          </div>

          <div id="blogEditableBody" class="blog-editable-body" contenteditable="true" spellcheck="true" data-is-empty="${isEmptyBody ? 'true' : 'false'}" data-placeholder="Escribe aquí el contenido del blog...">
            ${bodyHTML}
          </div>

          ${renderGameBlogBottomControlsHTML(gameKey, true)}
        `;

        setupLiveBlogEditableBodyEvents();
        requestAnimationFrame(() => {
          modalBody.querySelectorAll('img.blog-thumb-cropped').forEach(syncBlogCroppedThumbCover);
        });
      } else {
        const formattedContentHTML = renderBlogArticleBodyHTML(post.content || '', false);

        modalBody.innerHTML = `
          <h1 style="margin-bottom:18px;">${formatPreviewTitleUnbroken(post.title)}</h1>
          ${post.image ? `
            <figure class="main-img-figure">
              <img src="${escapeHtmlAttr(post.image)}" class="main-img" ${post.imageAura ? `data-aura="${escapeHtmlAttr(post.imageAura)}"` : ''} alt="${escapeHtmlAttr(post.title || '')}">
              ${post.imageCaption ? `<figcaption class="main-img-caption">${escapeHtmlText(post.imageCaption)}</figcaption>` : ''}
            </figure>
          ` : ''}
          ${formattedContentHTML}
          ${renderGameBlogBottomControlsHTML(gameKey, false)}
        `;
      }

      syncBlogParagraphFirstLetterColors(modalBody);

      modalEl.style.display = 'flex';
      document.body.style.overflow = 'hidden';
      pushModalState('blog', '/' + getGameBlogShareSlug(gameKey));
      if (modalBox) modalBox.scrollTop = 0;

      applyBlogModalAdaptiveTheme(post, modalBody);
      triggerBlogParagraphsOpeningReveal(modalBody);
      requestAnimationFrame(() => applyLiveBlogImagesAura(modalBody, post));
    }
    window.openGameBlogModal = openGameBlogModal;

    function updateGameButtonColorLive(sectionKey, propName, hexVal) {
      const cleanHex = normalizeCssColorToHex(hexVal);
      if (!cleanHex) return;

      if (sectionKey === 'why') {
        if (propName === 'whyColor') {
          gamesData.whyColor = cleanHex;
          renderGamesSection();
        } else if (propName === 'backBtnColor' && gamesData.blogs && gamesData.blogs.why) {
          gamesData.blogs.why.backBtnColor = cleanHex;
          const styleAttr = computeGameButtonStyleAttr(cleanHex);
          const btn = document.getElementById('gameBlogBackActionBtn');
          if (btn) btn.setAttribute('style', styleAttr);
          const shareBtn = document.getElementById('gameBlogShareActionBtn');
          if (shareBtn) shareBtn.setAttribute('style', styleAttr);
        }
      } else if (sectionKey === 'memorama') {
        gamesData.memorama[propName] = cleanHex;
        const mapIds = {
          soloBtnColor: 'memoramaSoloLaunchBtn',
          vsPcBtnColor: 'memoramaVsPcLaunchBtn',
          vsPcEasyBtnColor: 'memoramaVsPcEasyLaunchBtn',
          vsPcHardBtnColor: 'memoramaVsPcHardLaunchBtn',
          backBtnColor: 'gameBlogBackActionBtn'
        };
        const targetId = mapIds[propName];
        if (targetId) {
          const styleAttr = computeGameButtonStyleAttr(cleanHex);
          const el = document.getElementById(targetId);
          if (el) el.setAttribute('style', styleAttr);
          if (propName === 'backBtnColor') {
            const shareBtn = document.getElementById('gameBlogShareActionBtn');
            if (shareBtn) shareBtn.setAttribute('style', styleAttr);
          }
        }
      } else if (sectionKey === 'sixbysix') {
        gamesData.sixBySix[propName] = cleanHex;
        const mapIds = {
          easyBtnColor: 'sixEasyLaunchBtn',
          hardBtnColor: 'sixHardLaunchBtn',
          backBtnColor: 'gameBlogBackActionBtn'
        };
        const targetId = mapIds[propName];
        if (targetId) {
          const styleAttr = computeGameButtonStyleAttr(cleanHex);
          const el = document.getElementById(targetId);
          if (el) el.setAttribute('style', styleAttr);
          if (propName === 'backBtnColor') {
            const shareBtn = document.getElementById('gameBlogShareActionBtn');
            if (shareBtn) shareBtn.setAttribute('style', styleAttr);
          }
        }
      }

      schedulePersistGamesLocalCache();
    }
    window.updateGameButtonColorLive = updateGameButtonColorLive;

    function toggleMemoramaVsPcDifficultyRow(rowId) {
      const targetRow = document.getElementById(rowId || 'blogVsPcDiffRow');
      if (!targetRow) return;
      const isHidden = targetRow.style.display === 'none' || !targetRow.style.display;
      targetRow.style.display = isHidden ? 'flex' : 'none';
    }
    window.toggleMemoramaVsPcDifficultyRow = toggleMemoramaVsPcDifficultyRow;

    function applyMemoramaPairThumbCropInEditor(slotIndex) {
      const thumbEl = document.getElementById(`memoramaPairThumb_${slotIndex}`);
      if (!thumbEl || !gamesData || !gamesData.memorama) return;
      const cropVal = (Array.isArray(gamesData.memorama.pairCrops) && gamesData.memorama.pairCrops[slotIndex])
        ? gamesData.memorama.pairCrops[slotIndex]
        : 'cover-center';
      const parsed = parsePostImageCrop(cropVal);
      thumbEl.className = parsed.isCrop ? 'memorama-pair-slot-img blog-thumb-cropped' : 'memorama-pair-slot-img';
      thumbEl.setAttribute('style', getFitCssForPost(cropVal));
      if (parsed.isCrop) {
        thumbEl.setAttribute('data-crop-z', parsed.z.toFixed(3));
        syncBlogCroppedThumbCover(thumbEl);
      } else {
        thumbEl.removeAttribute('data-crop-z');
      }
    }

    function handleMemoramaPairUrlInput(slotIndex, rawVal) {
      if (slotIndex < 0 || slotIndex >= 10) return;
      const trimmed = String(rawVal || '').trim();
      if (!trimmed) return;
      gamesData.memorama.pairImages[slotIndex] = trimmed;
      if (!Array.isArray(gamesData.memorama.pairCrops)) gamesData.memorama.pairCrops = Array(10).fill('cover-center');
      gamesData.memorama.pairCrops[slotIndex] = 'cover-center';
      const thumbEl = document.getElementById(`memoramaPairThumb_${slotIndex}`);
      if (thumbEl) {
        thumbEl.dataset.fb = '0';
        thumbEl.src = trimmed;
        applyMemoramaPairThumbCropInEditor(slotIndex);
      }
      schedulePersistGamesLocalCache();
    }
    window.handleMemoramaPairUrlInput = handleMemoramaPairUrlInput;

    function handleMemoramaPairGalleryPick(slotIndex, urlVal) {
      if (slotIndex < 0 || slotIndex >= 10 || !urlVal) return;
      gamesData.memorama.pairImages[slotIndex] = urlVal;
      if (!Array.isArray(gamesData.memorama.pairCrops)) gamesData.memorama.pairCrops = Array(10).fill('cover-center');
      gamesData.memorama.pairCrops[slotIndex] = 'cover-center';
      const thumbEl = document.getElementById(`memoramaPairThumb_${slotIndex}`);
      if (thumbEl) {
        thumbEl.dataset.fb = '0';
        thumbEl.src = urlVal;
        applyMemoramaPairThumbCropInEditor(slotIndex);
      }
      const inputEl = document.getElementById(`memoramaPairInput_${slotIndex}`);
      if (inputEl) {
        inputEl.value = urlVal;
        inputEl.placeholder = 'URL de imagen...';
      }
      persistGamesLocalCache();
    }
    window.handleMemoramaPairGalleryPick = handleMemoramaPairGalleryPick;

    function compressPairImageFileToDataUrl(file, maxDim = 260, quality = 0.78) {
      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onerror = () => reject(new Error('File read error'));
        reader.onload = (ev) => {
          const img = new Image();
          img.onerror = () => reject(new Error('Invalid image'));
          img.onload = () => {
            const natW = img.naturalWidth || img.width || 260;
            const natH = img.naturalHeight || img.height || 260;
            const scale = Math.min(1, maxDim / Math.max(natW, natH));
            const w = Math.max(1, Math.round(natW * scale));
            const h = Math.max(1, Math.round(natH * scale));
            const canvas = document.createElement('canvas');
            canvas.width = w;
            canvas.height = h;
            const ctx = canvas.getContext('2d');
            if (!ctx) {
              canvas.width = 0;
              canvas.height = 0;
              img.src = '';
              resolve(ev.target.result);
              return;
            }
            ctx.fillStyle = '#06080f';
            ctx.fillRect(0, 0, w, h);
            ctx.drawImage(img, 0, 0, w, h);
            let out = '';
            try {
              out = canvas.toDataURL('image/webp', quality);
              if (!out || !out.startsWith('data:image/webp')) {
                out = canvas.toDataURL('image/jpeg', quality);
              }
            } catch (err) {
              out = canvas.toDataURL('image/jpeg', quality);
            }
            // Liberar inmediatamente textura GPU en navegadores móviles
            canvas.width = 0;
            canvas.height = 0;
            img.onload = null;
            img.onerror = null;
            img.src = '';
            resolve(out);
          };
          img.src = ev.target.result;
        };
        reader.readAsDataURL(file);
      });
    }

    function compressUploadedImageFileToDataUrl(file, maxDim = 1150, quality = 0.80) {
      return new Promise((resolve, reject) => {
        if (!file) {
          reject(new Error('No file'));
          return;
        }
        const reader = new FileReader();
        reader.onerror = () => reject(new Error('File read error'));
        reader.onload = (ev) => {
          const rawDataUrl = ev.target && ev.target.result ? String(ev.target.result) : '';
          if (!rawDataUrl) {
            reject(new Error('Empty file'));
            return;
          }
          // Conservar GIFs animados pequeños tal cual
          if (file.type === 'image/gif' && file.size <= 300 * 1024) {
            resolve(rawDataUrl);
            return;
          }
          const img = new Image();
          img.onerror = () => resolve(rawDataUrl);
          img.onload = () => {
            const natW = img.naturalWidth || img.width || maxDim;
            const natH = img.naturalHeight || img.height || maxDim;
            const renderScaled = (targetMaxDim, targetQual) => {
              const scale = Math.min(1, targetMaxDim / Math.max(natW, natH));
              const w = Math.max(1, Math.round(natW * scale));
              const h = Math.max(1, Math.round(natH * scale));
              const canvas = document.createElement('canvas');
              canvas.width = w;
              canvas.height = h;
              try {
                const ctx = canvas.getContext('2d');
                if (!ctx) return rawDataUrl;
                ctx.clearRect(0, 0, w, h);
                ctx.drawImage(img, 0, 0, w, h);
                try {
                  const webp = canvas.toDataURL('image/webp', targetQual);
                  if (webp && webp.startsWith('data:image/webp')) return webp;
                } catch (e) {}
                return canvas.toDataURL('image/jpeg', targetQual);
              } finally {
                canvas.width = 0;
                canvas.height = 0;
              }
            };

            let out = renderScaled(maxDim, quality);
            // Si aún supera ~160 KB en Base64, reducir un escalón para proteger la cuota de 1 MiB de Firestore
            if (out.length > 220000) {
              out = renderScaled(880, 0.70);
            }
            if (out.length > 220000) {
              out = renderScaled(680, 0.64);
            }
            img.onload = null;
            img.onerror = null;
            img.src = '';
            resolve(out);
          };
          img.src = rawDataUrl;
        };
        reader.readAsDataURL(file);
      });
    }

    async function handleMemoramaPairFileUpload(slotIndex, fileInput) {
      const file = fileInput && fileInput.files && fileInput.files[0];
      if (!file || slotIndex < 0 || slotIndex >= 10) return;
      try {
        const compressedDataUrl = await compressPairImageFileToDataUrl(file, 260, 0.78);
        gamesData.memorama.pairImages[slotIndex] = compressedDataUrl;
        if (!Array.isArray(gamesData.memorama.pairCrops)) gamesData.memorama.pairCrops = Array(10).fill('cover-center');
        gamesData.memorama.pairCrops[slotIndex] = 'cover-center';
        const thumbEl = document.getElementById(`memoramaPairThumb_${slotIndex}`);
        if (thumbEl) {
          thumbEl.dataset.fb = '0';
          thumbEl.src = compressedDataUrl;
          applyMemoramaPairThumbCropInEditor(slotIndex);
        }
        const urlInputEl = document.getElementById(`memoramaPairInput_${slotIndex}`);
        if (urlInputEl) {
          urlInputEl.value = '';
          urlInputEl.placeholder = 'Imagen subida desde dispositivo (pega URL para cambiar)';
        }
        persistGamesLocalCache();
        if (typeof showToastNotification === 'function') {
          showToastNotification(`🃏 Imagen de Pareja #${slotIndex + 1} actualizada`);
        }
      } catch (err) {
        if (typeof showToastNotification === 'function') {
          showToastNotification('No se pudo procesar la imagen seleccionada.', true);
        }
      } finally {
        fileInput.value = '';
      }
    }
    window.handleMemoramaPairFileUpload = handleMemoramaPairFileUpload;

    /* LÓGICA DE GALERÍAS Y CARRUSEL */
    const track = document.getElementById('carouselTrack');
    const dotsContainer = document.getElementById('carouselDots');
    let currentIndex = 0;
    let startX = 0;
    let isDragging = false;
    /* ORDEN DETERMINISTA DE GALERÍAS CONFIGURABLE POR EL ADMINISTRADOR */
    function getOrderedGalleryKeys() {
      if (!galleriesData || typeof galleriesData !== 'object') return [];
      const allKeys = Object.keys(galleriesData);
      const orderList = (window.galleryOrder && Array.isArray(window.galleryOrder) && window.galleryOrder.length > 0)
        ? window.galleryOrder
        : allKeys;

      const ordered = [];
      // Primero incluir las claves según el orden explícito configurado por el usuario
      orderList.forEach(k => {
        if (allKeys.includes(k) && !ordered.includes(k)) {
          ordered.push(k);
        }
      });
      // Añadir cualquier galería restante no listada al final
      allKeys.forEach(k => {
        if (!ordered.includes(k)) {
          ordered.push(k);
        }
      });
      return ordered;
    }

    let currentGalleryKey = '';
    let currentModalPhotoIndex = 0;
    let selectedAdminGalleryKey = '';
    let galleryMediaModalMode = 'add';
    let galleryMediaTargetIndex = null;
    let galleryMediaOriginalDataSrc = '';

    let pendingGalleryCacheTimer = null;

    function persistGalleryLocalCache() {
      if (pendingGalleryCacheTimer) {
        clearTimeout(pendingGalleryCacheTimer);
        pendingGalleryCacheTimer = null;
      }
      window.galleriesData = galleriesData;
      try {
        const cachedRaw = localStorage.getItem('blutu_live_site_data');
        if (cachedRaw) {
          const cached = JSON.parse(cachedRaw);
          cached.galleries = galleriesData;
          cached.galleryOrder = window.galleryOrder;
          cached.updatedAt = Date.now();
          localStorage.setItem('blutu_live_site_data', JSON.stringify(cached));
        }
      } catch (e) {}
    }

    function schedulePersistGalleryLocalCache() {
      window.galleriesData = galleriesData;
      if (pendingGalleryCacheTimer) clearTimeout(pendingGalleryCacheTimer);
      pendingGalleryCacheTimer = setTimeout(() => {
        pendingGalleryCacheTimer = null;
        persistGalleryLocalCache();
      }, 850);
    }

    function escapeHtmlAttr(str) {
      if (!str) return '';
      return String(str)
        .replace(/&/g, '&amp;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
    }

    function syncGalleryColorOrbsUI(galleryObj) {
      const c1 = (galleryObj && (galleryObj.color1 || galleryObj.color)) ? (galleryObj.color1 || galleryObj.color) : '#5A74BF';
      const c2 = (galleryObj && galleryObj.color2) ? galleryObj.color2 : c1;
      const orb1 = document.getElementById('adminGalleryColor1');
      const orb2 = document.getElementById('adminGalleryColor2');
      if (orb1 && document.activeElement !== orb1 && /^#[0-9A-F]{6}$/i.test(c1)) orb1.value = c1;
      if (orb2 && document.activeElement !== orb2 && /^#[0-9A-F]{6}$/i.test(c2)) orb2.value = c2;
    }

    function applyGalleryThemeVariables(galleryObj) {
      const c1 = (galleryObj && (galleryObj.color1 || galleryObj.color)) ? (galleryObj.color1 || galleryObj.color) : '#5A74BF';
      const c2 = (galleryObj && galleryObj.color2) ? galleryObj.color2 : c1;
      const activeGradient = `linear-gradient(135deg, ${c1}, ${c2})`;

      const btnTextColor = calculateReadableTextColor(c1, c2);
      const btnTextShadow = btnTextColor === '#06070a'
        ? '0 0 5px rgba(255, 255, 255, 0.9), 0 0 1px #ffffff'
        : '0 1px 3px rgba(0, 0, 0, 0.95), 0 0 6px rgba(0, 0, 0, 0.85)';

      document.documentElement.style.setProperty('--active-gallery-color', c1);
      document.documentElement.style.setProperty('--active-gallery-color2', c2);
      document.documentElement.style.setProperty('--active-gallery-gradient', activeGradient);
      document.documentElement.style.setProperty('--active-gallery-btn-text', btnTextColor);
      document.documentElement.style.setProperty('--active-gallery-text-shadow', btnTextShadow);

      const galSec = document.getElementById('gallerySection');
      if (galSec) galSec.style.setProperty('--anim-color', c1);
      document.querySelectorAll('#galleryNavControls .carousel-arrow').forEach(arrow => {
        arrow.style.setProperty('--anim-color', c1);
      });
    }

    function syncGalleryColorLive(which, val) {
      const key = currentGalleryKey || selectedAdminGalleryKey;
      if (!key || !galleriesData[key]) return;
      let hex = String(val || '').trim();
      if (!hex.startsWith('#')) hex = '#' + hex;
      if (!/^#[0-9A-F]{6}$/i.test(hex)) return;

      if (which === 1) {
        galleriesData[key].color1 = hex;
        galleriesData[key].color = hex;
      } else {
        galleriesData[key].color2 = hex;
      }
      applyGalleryThemeVariables(galleriesData[key]);
      const activeTabEl = document.querySelector(`#galleryTabsContainer .gallery-tab-btn[data-gallery-key="${CSS && CSS.escape ? CSS.escape(key) : key}"]`);
      if (activeTabEl) {
        activeTabEl.style.setProperty('--tab-color', galleriesData[key].color1 || galleriesData[key].color || '#5A74BF');
      }
      schedulePersistGalleryLocalCache();
    }
    window.syncGalleryColorLive = syncGalleryColorLive;

    function handleInlineGalleryTabTitleInput(key, el) {
      if (!key || !galleriesData[key] || !el) return;
      const clean = (el.innerText || '').replace(/\r?\n/g, ' ').trim();
      galleriesData[key].title = clean;
      window.galleriesData = galleriesData;
      const parentBtn = el.closest('.gallery-tab-btn');
      if (parentBtn && !(typeof isAdminMode !== 'undefined' && isAdminMode)) {
        parentBtn.title = clean || 'Galería';
      }
    }
    window.handleInlineGalleryTabTitleInput = handleInlineGalleryTabTitleInput;

    function handleInlineGalleryTabTitleBlur(key, el) {
      if (!key || !galleriesData[key] || !el) return;
      const clean = (el.innerText || '').replace(/\r?\n/g, ' ').trim();
      if (!clean) {
        galleriesData[key].title = 'Galería';
        el.textContent = 'Galería';
      } else {
        galleriesData[key].title = clean;
      }
      persistGalleryLocalCache();
      if (typeof populateAdminGallerySelect === 'function') populateAdminGallerySelect();
    }
    window.handleInlineGalleryTabTitleBlur = handleInlineGalleryTabTitleBlur;

    function createNewGalleryInline() {
      const newKey = 'galeria_' + Date.now();
      galleriesData[newKey] = {
        title: 'Nueva Galería',
        color1: '#5A74BF',
        color2: '#28386B',
        color: '#5A74BF',
        items: []
      };
      const keys = getOrderedGalleryKeys();
      if (!keys.includes(newKey)) keys.push(newKey);
      window.galleryOrder = [...keys];
      fixedGalleryOrder = [...keys];
      currentGalleryKey = newKey;
      selectedAdminGalleryKey = newKey;
      currentIndex = 0;

      persistGalleryLocalCache();
      if (typeof populateAdminGallerySelect === 'function') populateAdminGallerySelect();
      renderGalleryTabs(false);

      setTimeout(() => {
        const editable = document.querySelector('#galleryTabsContainer .gallery-tab-btn.active .gallery-tab-editable');
        if (editable) {
          editable.focus();
          if (window.getSelection && document.createRange) {
            const range = document.createRange();
            range.selectNodeContents(editable);
            const sel = window.getSelection();
            sel.removeAllRanges();
            sel.addRange(range);
          }
        }
      }, 40);
    }
    window.createNewGalleryInline = createNewGalleryInline;

    function getGalleryThumbPreviewUrl(item) {
      if (!item) return '';
      const rawThumb = (item.thumb || '').trim();
      if (rawThumb) return cleanOrTransformMediaUrl(rawThumb);
      const rawSrc = cleanOrTransformMediaUrl(item.src || item.url || '');
      const yt = parseYouTubeUrl(rawSrc);
      if (yt && yt.videoId) {
        return `https://i.ytimg.com/vi/${yt.videoId}/mqdefault.jpg`;
      }
      return rawSrc;
    }

    function buildGalleryTabStackHTML(galleryObj) {
      const items = (galleryObj && Array.isArray(galleryObj.items)) ? galleryObj.items : [];
      const thumbs = [];
      for (let i = 0; i < items.length && thumbs.length < 3; i++) {
        const u = getGalleryThumbPreviewUrl(items[i]);
        if (u) thumbs.push(u);
      }
      if (thumbs.length === 0) {
        return `<span class="gallery-tab-stack" aria-hidden="true"><span class="tab-stack-card back-2 is-empty"></span><span class="tab-stack-card back-1 is-empty"></span><span class="tab-stack-card front is-empty"><i class="fa-regular fa-images"></i></span></span>`;
      }
      const t0 = escapeHtmlAttr(thumbs[0]);
      const t1 = escapeHtmlAttr(thumbs[1] || thumbs[0]);
      const t2 = escapeHtmlAttr(thumbs[2] || thumbs[0]);
      const cards = [];
      if (thumbs.length >= 3) {
        cards.push(`<span class="tab-stack-card back-2"><img src="${t2}" alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer" onerror="this.style.display='none'"></span>`);
      } else {
        cards.push(`<span class="tab-stack-card back-2 is-empty"></span>`);
      }
      if (thumbs.length >= 2) {
        cards.push(`<span class="tab-stack-card back-1"><img src="${t1}" alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer" onerror="this.style.display='none'"></span>`);
      } else {
        cards.push(`<span class="tab-stack-card back-1 is-empty"></span>`);
      }
      cards.push(`<span class="tab-stack-card front"><img src="${t0}" alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer" onerror="this.style.display='none'"></span>`);
      return `<span class="gallery-tab-stack" aria-hidden="true">${cards.join('')}</span>`;
    }

    function refreshGalleryTabStacks() {
      const container = document.getElementById('galleryTabsContainer');
      if (!container) return;
      container.querySelectorAll('.gallery-tab-btn[data-gallery-key]').forEach(btn => {
        const k = btn.dataset.galleryKey;
        const g = k ? galleriesData[k] : null;
        if (!g) return;
        const c1 = g.color1 || g.color || '#5A74BF';
        btn.style.setProperty('--tab-color', c1);
        const oldStack = btn.querySelector('.gallery-tab-stack');
        const temp = document.createElement('span');
        temp.innerHTML = buildGalleryTabStackHTML(g);
        const newStack = temp.firstElementChild;
        if (newStack) {
          if (oldStack) oldStack.replaceWith(newStack);
          else btn.insertBefore(newStack, btn.firstChild);
        }
      });
    }

    function renderGalleryTabs(preserveSlide = false) {
      const container = document.getElementById('galleryTabsContainer');
      if (!container) return;
      container.innerHTML = '';

      const delBtn = document.getElementById('btnDeleteCurrentGallery');
      const keys = getOrderedGalleryKeys();
      const adminActive = (typeof isAdminMode !== 'undefined' && isAdminMode);

      if (keys.length === 0) {
        container.classList.remove('is-scrollable-tabs', 'is-compact-tabs', 'is-dense-tabs');
        delete container.dataset.tabCount;
        currentGalleryKey = '';
        selectedAdminGalleryKey = '';
        if (delBtn) delBtn.style.display = 'none';
        if (adminActive) {
          const addBtn = document.createElement('button');
          addBtn.type = 'button';
          addBtn.className = 'gallery-tab-btn gallery-tab-add-btn';
          addBtn.innerHTML = '<i class="fa-solid fa-plus"></i>';
          addBtn.title = 'Crear nueva galería';
          addBtn.onclick = () => createNewGalleryInline();
          container.appendChild(addBtn);

          track.innerHTML = `
            <div style="width: 100%; padding: 28px 18px; text-align: center; border: 1px dashed rgba(90, 116, 191, 0.55); border-radius: 10px; background: rgba(9, 11, 16, 0.55);">
              <p style="color: var(--text-muted); margin: 0 0 12px 0; font-style: italic;">No hay galerías creadas.</p>
              <button type="button" class="read-more-btn" onclick="createNewGalleryInline()" style="padding: 6px 16px; font-size: 0.85rem;">➕ Crear Primera Galería</button>
            </div>
          `;
        } else {
          track.innerHTML = '<p style="text-align: center; color: var(--text-muted); width: 100%;">No hay galerías disponibles.</p>';
        }
        dotsContainer.innerHTML = '';
        return;
      }

      if (!currentGalleryKey || !galleriesData[currentGalleryKey]) {
        currentGalleryKey = keys[0];
      }
      selectedAdminGalleryKey = currentGalleryKey;
      if (delBtn) {
        delBtn.style.display = adminActive ? 'inline-flex' : 'none';
      }
      syncGalleryColorOrbsUI(galleriesData[currentGalleryKey]);

      const totalVisibleTabs = keys.length + (adminActive ? 1 : 0);
      container.classList.remove('is-scrollable-tabs');
      container.classList.toggle('is-compact-tabs', totalVisibleTabs >= 4 && totalVisibleTabs <= 6);
      container.classList.toggle('is-dense-tabs', totalVisibleTabs >= 7);
      container.dataset.tabCount = String(totalVisibleTabs);

      let draggedGalleryKey = null;

      keys.forEach(key => {
        const isActive = key === currentGalleryKey;
        const gObj = galleriesData[key] || {};
        const tabColor = gObj.color1 || gObj.color || '#5A74BF';
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = `gallery-tab-btn ${isActive ? 'active' : ''}`;
        btn.dataset.galleryKey = key;
        btn.style.setProperty('--tab-color', tabColor);
        btn.title = gObj.title || 'Galería';

        const stackWrapper = document.createElement('span');
        stackWrapper.innerHTML = buildGalleryTabStackHTML(gObj);
        if (stackWrapper.firstElementChild) {
          btn.appendChild(stackWrapper.firstElementChild);
        }

        if (adminActive && isActive) {
          const span = document.createElement('span');
          span.className = 'gallery-tab-editable';
          span.contentEditable = 'true';
          span.spellcheck = false;
          span.setAttribute('data-placeholder', 'Nombre...');
          span.textContent = gObj.title || '';
          span.onclick = (ev) => { ev.stopPropagation(); };
          span.oninput = () => handleInlineGalleryTabTitleInput(key, span);
          span.onblur = () => handleInlineGalleryTabTitleBlur(key, span);
          span.onpaste = (ev) => {
            if (typeof handlePlainTextPaste === 'function') handlePlainTextPaste(ev);
          };
          span.onkeydown = (ev) => {
            if (ev.key === 'Enter') {
              ev.preventDefault();
              span.blur();
            }
          };
          btn.appendChild(span);
          btn.onclick = (ev) => {
            if (ev.target === span || span.contains(ev.target)) return;
            switchGallery(key, btn);
          };
        } else {
          const labelSpan = document.createElement('span');
          labelSpan.className = 'gallery-tab-label';
          labelSpan.textContent = gObj.title || 'Galería';
          btn.appendChild(labelSpan);
          btn.onclick = () => switchGallery(key, btn);
        }

        if (adminActive) {
          btn.draggable = true;
          btn.style.cursor = 'grab';
          btn.title = isActive
            ? 'Haz clic en el nombre para renombrar o arrastra la pestaña para reordenar'
            : 'Haz clic para ver esta galería o arrastra la pestaña para reordenar';

          btn.addEventListener('dragstart', (e) => {
            const activeEl = document.activeElement;
            if (activeEl && activeEl.classList && activeEl.classList.contains('gallery-tab-editable') && btn.contains(activeEl)) {
              e.preventDefault();
              return;
            }
            draggedGalleryKey = key;
            btn.style.opacity = '0.5';
          });

          btn.addEventListener('dragend', () => {
            btn.style.opacity = '1';
            draggedGalleryKey = null;
          });

          btn.addEventListener('dragover', (e) => {
            e.preventDefault();
          });

          btn.addEventListener('drop', (e) => {
            e.preventDefault();
            if (draggedGalleryKey && draggedGalleryKey !== key) {
              reorderGalleriesInAdmin(draggedGalleryKey, key);
            }
          });

          let touchGalleryStartKey = null;
          btn.addEventListener('touchstart', (e) => {
            if (e.target && e.target.closest && e.target.closest('[contenteditable="true"]')) return;
            touchGalleryStartKey = key;
          }, { passive: true });

          btn.addEventListener('touchend', (e) => {
            if (touchGalleryStartKey === null) return;
            const touch = e.changedTouches[0];
            const targetEl = document.elementFromPoint(touch.clientX, touch.clientY);
            if (targetEl) {
              const closestBtn = targetEl.closest('.gallery-tab-btn[data-gallery-key]');
              if (closestBtn) {
                const targetKey = closestBtn.dataset.galleryKey;
                if (targetKey && targetKey !== touchGalleryStartKey) {
                  reorderGalleriesInAdmin(touchGalleryStartKey, targetKey);
                }
              }
            }
            touchGalleryStartKey = null;
          });
        }

        container.appendChild(btn);
      });

      if (adminActive) {
        const addBtn = document.createElement('button');
        addBtn.type = 'button';
        addBtn.className = 'gallery-tab-btn gallery-tab-add-btn';
        addBtn.innerHTML = '<i class="fa-solid fa-plus"></i>';
        addBtn.title = 'Crear nueva galería';
        addBtn.onclick = () => createNewGalleryInline();
        container.appendChild(addBtn);
      }

      loadGallery(currentGalleryKey, preserveSlide);
    }

    function reorderGalleriesInAdmin(fromKey, targetKey) {
      const keys = getOrderedGalleryKeys();
      const fromIdx = keys.indexOf(fromKey);
      const toIdx = keys.indexOf(targetKey);
      if (fromIdx === -1 || toIdx === -1 || fromIdx === toIdx) return;

      const [moved] = keys.splice(fromIdx, 1);
      keys.splice(toIdx, 0, moved);

      window.galleryOrder = [...keys];
      fixedGalleryOrder = [...keys];

      const newGalleriesData = {};
      keys.forEach(k => {
        if (galleriesData[k]) newGalleriesData[k] = galleriesData[k];
      });
      galleriesData = newGalleriesData;
      window.galleriesData = galleriesData;

      populateAdminGallerySelect();
      renderGalleryTabs(true);

      if (typeof window.persistSiteDataInRealtime === 'function') {
        window.persistSiteDataInRealtime();
      }
    }

    /* AUTOPLAY DEL CARRUSEL DE GALERÍAS */
    let galleryAutoplayInterval = null;
    let isGalleryUserInteracting = false;
    let galleryInteractionResumeTimeout = null;

    function markGalleryUserInteraction() {
      isGalleryUserInteracting = true;
      if (galleryInteractionResumeTimeout) {
        clearTimeout(galleryInteractionResumeTimeout);
      }
      galleryInteractionResumeTimeout = setTimeout(() => {
        isGalleryUserInteracting = false;
      }, 7000);
    }

    function startGalleryAutoplay() {
      stopGalleryAutoplay();
    }

    function stopGalleryAutoplay() {
      if (galleryAutoplayInterval) {
        clearInterval(galleryAutoplayInterval);
        galleryAutoplayInterval = null;
      }
    }

    function getItemsCount() {
      if (!track || !track.children.length) return 0;
      if (track.children.length === 1 && !track.children[0].classList.contains('gallery-item')) return 0;
      return track.children.length;
    }
    function getItemsPerPage() {
      if (window.innerWidth <= 550) return 1;
      if (window.innerWidth <= 850) return 2;
      return 3;
    }
    function getMaxIndex() { return Math.max(0, getItemsCount() - getItemsPerPage()); }

    function updateCarousel() {
      const itemsCount = getItemsCount();
      const perPage = getItemsPerPage();
      const maxIndex = Math.max(0, itemsCount - perPage);
      if (currentIndex > maxIndex) currentIndex = maxIndex;
      if (currentIndex < 0) currentIndex = 0;

      if (itemsCount > 0 && itemsCount <= perPage) {
        track.style.justifyContent = 'center';
        track.style.transform = 'translateX(0px)';
      } else {
        track.style.justifyContent = 'flex-start';
        const items = track.children;
        if (currentIndex > 0 && items.length > 0 && items[0].classList && items[0].classList.contains('gallery-item')) {
          track.style.transform = `translateX(calc(-${currentIndex} * (100% + 15px) / ${perPage}))`;
        } else {
          track.style.transform = 'translateX(0px)';
        }
      }
      updateDots();
    }

    function moveSlide(direction, arrowBtn) {
      markGalleryUserInteraction();
      const maxIndex = getMaxIndex();
      if (maxIndex <= 0) return;
      currentIndex += direction;
      if (currentIndex > maxIndex) currentIndex = 0;
      if (currentIndex < 0) currentIndex = maxIndex;
      updateCarousel();
      if (arrowBtn) {
        const activeColor = (galleriesData[currentGalleryKey] && (galleriesData[currentGalleryKey].color1 || galleriesData[currentGalleryKey].color)) ? (galleriesData[currentGalleryKey].color1 || galleriesData[currentGalleryKey].color) : '#5A74BF';
        triggerGreekCrossAnimation(arrowBtn, activeColor, 500);
      }
    }

    function createDots() {
      const maxIndex = getMaxIndex();
      const totalPages = maxIndex + 1;
      const indicatorText = totalPages > 0 ? `${currentIndex + 1} / ${totalPages}` : '1 / 1';
      
      dotsContainer.innerHTML = '';
      dotsContainer.style.display = 'flex';
      dotsContainer.style.alignItems = 'center';
      dotsContainer.style.justifyContent = 'center';
      
      const textSpan = document.createElement('span');
      textSpan.className = 'gallery-page-indicator';
      textSpan.style.color = 'var(--text-muted)';
      textSpan.style.fontSize = '0.9rem';
      textSpan.style.fontFamily = "'Cinzel Decorative', 'Cinzel', serif";
      textSpan.style.minWidth = '45px';
      textSpan.style.textAlign = 'center';
      textSpan.innerText = indicatorText;
      
      dotsContainer.appendChild(textSpan);
    }

    function updateDots() {
      const maxIndex = getMaxIndex();
      const totalPages = maxIndex + 1;
      const indicatorText = totalPages > 0 ? `${currentIndex + 1} / ${totalPages}` : '1 / 1';
      
      const textSpan = dotsContainer.querySelector('.gallery-page-indicator');
      if (textSpan) {
        textSpan.innerText = indicatorText;
      } else {
        createDots();
      }
    }

    /* EXTRACCIÓN ÚNICA DE COLOR DE AURA EXCLUSIVA PARA MODO EDICIÓN (CERO ESCANEO EN VIVO PARA VISITANTES) */
    const adminSingleScanAuraCache = new Map();
    const adminPendingAuraScans = new Map();

    function sampleAverageAuraHexFromDrawable(drawable) {
      const canvas = document.createElement('canvas');
      canvas.width = 24;
      canvas.height = 24;
      try {
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        if (!ctx) return '';

        ctx.drawImage(drawable, 0, 0, 24, 24);
        const data = ctx.getImageData(0, 0, 24, 24).data;

        let r = 0, g = 0, b = 0, count = 0;
        for (let i = 0; i < data.length; i += 4) {
          const alpha = data[i + 3];
          if (alpha < 30) continue;
          const pr = data[i];
          const pg = data[i + 1];
          const pb = data[i + 2];

          const brightness = (pr + pg + pb) / 3;
          if (brightness < 12 && count > 5) continue;

          r += pr;
          g += pg;
          b += pb;
          count++;
        }

        if (count > 0) {
          r = Math.round(r / count);
          g = Math.round(g / count);
          b = Math.round(b / count);

          const max = Math.max(r, g, b);
          if (max < 110) {
            const boost = 110 - max;
            r = Math.min(255, r + boost);
            g = Math.min(255, g + boost);
            b = Math.min(255, b + boost);
          }

          const toHex = (n) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, '0');
          return `#${toHex(r)}${toHex(g)}${toHex(b)}`.toUpperCase();
        }
        return '';
      } finally {
        canvas.width = 0;
        canvas.height = 0;
      }
    }

    function isSameOriginOrLocalMedia(urlStr) {
      if (!urlStr) return false;
      if (/^(data:|blob:)/i.test(urlStr)) return true;
      if (urlStr.startsWith('/') && !urlStr.startsWith('//')) return true;
      try {
        const parsed = new URL(urlStr, window.location.href);
        return parsed.origin === window.location.origin;
      } catch (e) {
        return false;
      }
    }

    function sampleAuraHexViaCorsImage(targetUrl, timeoutMs = 4500) {
      return new Promise((resolve) => {
        const tempImg = new Image();
        let done = false;
        const timer = setTimeout(() => {
          if (done) return;
          done = true;
          tempImg.onload = null;
          tempImg.onerror = null;
          tempImg.src = '';
          resolve('');
        }, timeoutMs);

        if (!isSameOriginOrLocalMedia(targetUrl)) {
          tempImg.crossOrigin = 'anonymous';
          tempImg.referrerPolicy = 'no-referrer';
        }

        tempImg.onload = () => {
          if (done) return;
          done = true;
          clearTimeout(timer);
          let hex = '';
          try {
            hex = sampleAverageAuraHexFromDrawable(tempImg);
          } catch (e) {
            hex = '';
          }
          tempImg.onload = null;
          tempImg.onerror = null;
          tempImg.src = '';
          resolve(hex);
        };

        tempImg.onerror = () => {
          if (done) return;
          done = true;
          clearTimeout(timer);
          tempImg.onload = null;
          tempImg.onerror = null;
          tempImg.src = '';
          resolve('');
        };

        tempImg.src = targetUrl;
      });
    }

    async function computeUntaintedAuraHexOnce(src) {
      if (!src) return '';
      if (isSameOriginOrLocalMedia(src)) {
        return await sampleAuraHexViaCorsImage(src, 4000);
      }
      const directHex = await sampleAuraHexViaCorsImage(src, 3800);
      if (directHex) return directHex;

      const proxyThumbUrl = `https://wsrv.nl/?url=${encodeURIComponent(src)}&w=24&h=24&output=jpg`;
      return await sampleAuraHexViaCorsImage(proxyThumbUrl, 4500);
    }

    async function extractAuraHexOnceForAdmin(rawSrc, forceRefresh = false) {
      if (typeof isAdminMode === 'undefined' || !isAdminMode) return '';
      if (!rawSrc || typeof rawSrc !== 'string') return '';
      let trimmed = rawSrc.trim();
      if (!trimmed) return '';
      if (!/^(https?:\/\/|data:|blob:|\/)/i.test(trimmed)) {
        if (!trimmed.includes('.') || trimmed.length < 5) return '';
        trimmed = 'https://' + trimmed;
      }

      const cleaned = cleanOrTransformMediaUrl(trimmed);
      const ytInfo = parseYouTubeUrl(cleaned);
      const cacheKey = ytInfo ? `yt:${ytInfo.videoId}` : cleaned;

      if (!forceRefresh && adminSingleScanAuraCache.has(cacheKey)) {
        return adminSingleScanAuraCache.get(cacheKey) || '';
      }

      if (!forceRefresh && adminPendingAuraScans.has(cacheKey)) {
        return await adminPendingAuraScans.get(cacheKey);
      }

      const scanPromise = (async () => {
        try {
          let hex = '';
          if (ytInfo) {
            hex = await computeUntaintedAuraHexOnce(ytInfo.thumbnailUrl);
            if (!hex) {
              hex = await computeUntaintedAuraHexOnce(`https://i.ytimg.com/vi/${ytInfo.videoId}/hqdefault.jpg`);
            }
          } else {
            hex = await computeUntaintedAuraHexOnce(cleaned);
          }
          adminSingleScanAuraCache.set(cacheKey, hex || '');
          return hex || '';
        } catch (e) {
          adminSingleScanAuraCache.set(cacheKey, '');
          return '';
        } finally {
          adminPendingAuraScans.delete(cacheKey);
        }
      })();

      adminPendingAuraScans.set(cacheKey, scanPromise);
      return await scanPromise;
    }

    function calculateReadableTextColor(color1, color2) {
      function parseLuminance(hexStr) {
        if (!hexStr) return 0.5;
        let hex = hexStr.replace('#', '').trim();
        if (hex.length === 3) hex = hex.split('').map(c => c + c).join('');
        if (hex.length !== 6) return 0.5;
        const r = parseInt(hex.substring(0, 2), 16) / 255;
        const g = parseInt(hex.substring(2, 4), 16) / 255;
        const b = parseInt(hex.substring(4, 6), 16) / 255;
        return 0.2126 * r + 0.7152 * g + 0.0722 * b;
      }
      const lum1 = parseLuminance(color1);
      const lum2 = parseLuminance(color2);
      const avgLum = (lum1 + lum2) / 2;
      return avgLum > 0.55 ? '#06070a' : '#ffffff';
    }

    function parseYouTubeUrl(url) {
      if (!url || typeof url !== 'string') return null;
      const trimmed = url.trim();

      const shortsMatch = trimmed.match(/(?:youtube\.com\/shorts\/|youtube\.com\/embed\/shorts\/)([a-zA-Z0-9_-]{11})/i);
      if (shortsMatch && shortsMatch[1]) {
        const videoId = shortsMatch[1];
        return {
          videoId: videoId,
          isShorts: true,
          thumbnailUrl: `https://i.ytimg.com/vi/${videoId}/maxresdefault.jpg`,
          embedUrl: `https://www.youtube.com/embed/${videoId}?autoplay=1&playsinline=1&rel=0&controls=1&enablejsapi=1`
        };
      }

      const ytMatch = trimmed.match(/(?:youtube\.com\/(?:watch\?(?:.*&)?v=|embed\/|v\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/i);
      if (ytMatch && ytMatch[1]) {
        const videoId = ytMatch[1];
        const isShorts = trimmed.toLowerCase().includes('/shorts/');
        return {
          videoId: videoId,
          isShorts: isShorts,
          thumbnailUrl: `https://i.ytimg.com/vi/${videoId}/maxresdefault.jpg`,
          embedUrl: `https://www.youtube.com/embed/${videoId}?autoplay=1&playsinline=1&rel=0&controls=1&enablejsapi=1`
        };
      }

      return null;
    }

    function cleanOrTransformMediaUrl(rawUrl) {
      if (!rawUrl || typeof rawUrl !== 'string') return rawUrl;
      let url = rawUrl.trim();

      const gDriveMatch = url.match(/drive\.google\.com\/(?:file\/d\/|open\?id=)([a-zA-Z0-9_-]+)/);
      if (gDriveMatch && gDriveMatch[1]) {
        return `https://lh3.googleusercontent.com/d/${gDriveMatch[1]}=s0`;
      }

      return url;
    }

    function handleInlineGalleryCaptionInput(index, el) {
      if (!currentGalleryKey || !galleriesData[currentGalleryKey] || !galleriesData[currentGalleryKey].items[index] || !el) return;
      const val = (el.innerText || '').replace(/\r?\n/g, ' ').trim();
      galleriesData[currentGalleryKey].items[index].caption = val;
      schedulePersistGalleryLocalCache();
    }
    window.handleInlineGalleryCaptionInput = handleInlineGalleryCaptionInput;

    let draggedPhotoIndex = null;

    function loadGallery(galleryKey, preserveSlide = false) {
      currentGalleryKey = galleryKey;
      selectedAdminGalleryKey = galleryKey;
      track.innerHTML = '';
      const galleryObj = galleriesData[galleryKey];

      applyGalleryThemeVariables(galleryObj);
      syncGalleryColorOrbsUI(galleryObj);
      if (typeof refreshGalleryTabStacks === 'function') refreshGalleryTabStacks();

      const items = (galleryObj && Array.isArray(galleryObj.items)) ? galleryObj.items : [];
      const adminActive = (typeof isAdminMode !== 'undefined' && isAdminMode);

      if (items.length === 0) {
        if (adminActive) {
          track.innerHTML = `
            <div style="width: 100%; padding: 28px 18px; text-align: center; border: 1px dashed rgba(90, 116, 191, 0.55); border-radius: 10px; background: rgba(9, 11, 16, 0.55); display: flex; flex-direction: column; align-items: center; gap: 12px;">
              <p style="color: var(--text-muted); margin: 0; font-style: italic;">Esta galería aún no tiene fotos ni videos.</p>
              <div style="display: flex; gap: 10px; flex-wrap: wrap; justify-content: center;">
                <button type="button" class="wysiwyg-tool-btn" onclick="document.getElementById('galleryPhotoFileInput').click()" style="padding: 6px 14px; font-size: 0.85rem;">📤 Subir Fotos</button>
                <button type="button" class="read-more-btn" onclick="openGalleryMediaModal('add')" style="padding: 6px 14px; font-size: 0.85rem;">➕ Añadir URL / Video</button>
              </div>
            </div>
          `;
        } else {
          track.innerHTML = '<p style="text-align: center; color: var(--text-muted); width: 100%;">No hay fotos ni videos en esta galería.</p>';
        }
      } else {
        items.forEach((item, index) => {
          const itemDiv = document.createElement('div');
          const finalSrc = cleanOrTransformMediaUrl(item.src || item.url || '');
          const ytInfo = parseYouTubeUrl(finalSrc);
          const isVideo = !!ytInfo || item.type === 'video' || item.type === 'shorts';

          itemDiv.className = `gallery-item ${isVideo ? 'gallery-item-video' : ''}`;
          itemDiv.dataset.index = index;
          itemDiv.onclick = function(ev) {
            if (ev && ev.target && ev.target.closest && ev.target.closest('button, input, [contenteditable="true"], .gallery-item-admin-actions')) {
              return;
            }
            openModal(index);
          };

          if (adminActive) {
            itemDiv.draggable = true;
            itemDiv.addEventListener('dragstart', (e) => {
              const activeEl = document.activeElement;
              if (activeEl && activeEl.isContentEditable && itemDiv.contains(activeEl)) {
                e.preventDefault();
                return;
              }
              draggedPhotoIndex = index;
              itemDiv.style.opacity = '0.5';
              if (e.dataTransfer) {
                e.dataTransfer.effectAllowed = 'move';
                e.dataTransfer.setData('text/plain', String(index));
              }
            });
            itemDiv.addEventListener('dragend', () => {
              itemDiv.style.opacity = '1';
              draggedPhotoIndex = null;
            });
            itemDiv.addEventListener('dragover', (e) => {
              e.preventDefault();
              if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
            });
            itemDiv.addEventListener('drop', (e) => {
              e.preventDefault();
              if (draggedPhotoIndex !== null && draggedPhotoIndex !== index) {
                reorderPhotosInAdmin(draggedPhotoIndex, index);
              }
              draggedPhotoIndex = null;
            });

            const toolsDiv = document.createElement('div');
            toolsDiv.className = 'gallery-item-admin-actions';
            toolsDiv.onclick = (ev) => ev.stopPropagation();
            toolsDiv.innerHTML = `
              <button type="button" class="gallery-mini-tool-btn" onclick="event.stopPropagation(); movePhotoInAdminGallery(${index}, -1)" title="Mover antes" ${index === 0 ? 'disabled style="opacity:0.35;cursor:default;"' : ''}>◀</button>
              <button type="button" class="gallery-mini-tool-btn" onclick="event.stopPropagation(); movePhotoInAdminGallery(${index}, 1)" title="Mover después" ${index === items.length - 1 ? 'disabled style="opacity:0.35;cursor:default;"' : ''}>▶</button>
              <button type="button" class="gallery-mini-tool-btn" onclick="event.stopPropagation(); openGalleryMediaModal('edit', ${index})" title="Cambiar foto o enlace">🖼️</button>
              <button type="button" class="gallery-mini-tool-btn is-danger" onclick="event.stopPropagation(); confirmDeleteGalleryPhoto(${index})" title="Eliminar de la galería">🗑️</button>
            `;
            itemDiv.appendChild(toolsDiv);
          }

          const imgEl = document.createElement('img');
          const thumbSrc = (ytInfo ? ytInfo.thumbnailUrl : (item.thumb ? cleanOrTransformMediaUrl(item.thumb) : finalSrc));
          imgEl.src = thumbSrc;
          imgEl.alt = item.caption || (ytInfo ? (ytInfo.isShorts ? 'YouTube Shorts' : 'YouTube Video') : '');
          imgEl.loading = 'lazy';
          imgEl.decoding = 'async';
          imgEl.referrerPolicy = 'no-referrer';
          imgEl.setAttribute('referrerpolicy', 'no-referrer');

          if (ytInfo) {
            imgEl.onerror = function() {
              if (!this.dataset.fallbackLoaded) {
                this.dataset.fallbackLoaded = "true";
                this.src = (item.thumb && !item.thumb.includes('maxresdefault'))
                  ? cleanOrTransformMediaUrl(item.thumb)
                  : `https://i.ytimg.com/vi/${ytInfo.videoId}/hqdefault.jpg`;
                if (!ytInfo.isShorts) {
                  this.style.objectFit = 'cover';
                  this.style.transform = 'scale(1.35)';
                }
              }
            };
          }

          const thumbWrapper = document.createElement('div');
          thumbWrapper.style.width = '100%';
          thumbWrapper.style.aspectRatio = '4 / 3';
          thumbWrapper.style.display = 'flex';
          thumbWrapper.style.alignItems = 'center';
          thumbWrapper.style.justifyContent = 'center';
          
          if (ytInfo && !ytInfo.isShorts) {
            imgEl.className = 'cropped-yt-thumb';
            thumbWrapper.style.overflow = 'hidden';
            imgEl.style.objectFit = 'cover';
            imgEl.style.width = '100%';
            imgEl.style.height = '100%';
          }
          
          thumbWrapper.appendChild(imgEl);
          itemDiv.appendChild(thumbWrapper);

          if (isVideo) {
            const badge = document.createElement('div');
            badge.className = 'gallery-video-badge';
            badge.innerHTML = `
              <div class="gallery-play-icon"><span class="gallery-play-icon-inner">▶</span></div>
            `;
            itemDiv.appendChild(badge);
          }

          if (adminActive) {
            const captionDiv = document.createElement('div');
            captionDiv.className = 'gallery-caption';
            captionDiv.contentEditable = 'true';
            captionDiv.spellcheck = false;
            captionDiv.setAttribute('data-placeholder', isVideo ? 'Título del video...' : 'Pie de foto...');
            captionDiv.innerText = (item.caption || '').trim();
            captionDiv.onclick = (ev) => ev.stopPropagation();
            captionDiv.oninput = () => handleInlineGalleryCaptionInput(index, captionDiv);
            captionDiv.onpaste = (ev) => {
              if (typeof handlePlainTextPaste === 'function') handlePlainTextPaste(ev);
            };
            captionDiv.onkeydown = (ev) => {
              if (ev.key === 'Enter') {
                ev.preventDefault();
                captionDiv.blur();
              }
            };
            itemDiv.appendChild(captionDiv);
          } else if (item.caption && item.caption.trim() !== '') {
            const captionDiv = document.createElement('div');
            captionDiv.className = 'gallery-caption';
            captionDiv.innerText = item.caption.trim();
            itemDiv.appendChild(captionDiv);
          }
          track.appendChild(itemDiv);

          const savedItemAura = (item && item.aura && String(item.aura).trim() && String(item.aura).trim().toLowerCase() !== 'none')
            ? formatSavedAuraGlow(String(item.aura).trim(), 0.88)
            : '';
          if (savedItemAura) {
            imgEl.style.setProperty('--item-aura-color', savedItemAura);
          } else {
            imgEl.style.removeProperty('--item-aura-color');
          }
        });
      }

      if (!preserveSlide) {
        currentIndex = 0;
      }
      createDots();
      updateCarousel();
      startGalleryAutoplay();
    }

    function switchGallery(galleryKey, btnElement) {
      markGalleryUserInteraction();
      currentGalleryKey = galleryKey;
      selectedAdminGalleryKey = galleryKey;
      const activeColor = (galleriesData[galleryKey] && (galleriesData[galleryKey].color1 || galleriesData[galleryKey].color)) ? (galleriesData[galleryKey].color1 || galleriesData[galleryKey].color) : '#5A74BF';

      if (typeof isAdminMode !== 'undefined' && isAdminMode) {
        renderGalleryTabs(false);
        const newActiveBtn = document.querySelector('#galleryTabsContainer .gallery-tab-btn.active');
        if (newActiveBtn) {
          triggerGreekCrossAnimation(newActiveBtn, activeColor, 500);
        }
        return;
      }

      document.querySelectorAll('.gallery-tab-btn').forEach(btn => btn.classList.remove('active', 'music-btn-animating'));
      if (btnElement) {
        btnElement.classList.add('active');
        triggerGreekCrossAnimation(btnElement, activeColor, 500);
      }
      loadGallery(galleryKey, false);
    }

    track.addEventListener('mouseenter', () => { isGalleryUserInteracting = true; });
    track.addEventListener('mouseleave', () => { isGalleryUserInteracting = false; });
    
    if (track.parentElement) {
      track.parentElement.addEventListener('mouseenter', () => { isGalleryUserInteracting = true; });
      track.parentElement.addEventListener('mouseleave', () => { isGalleryUserInteracting = false; });
    }

    track.addEventListener('touchstart', (e) => { 
      markGalleryUserInteraction();
      if (e.target && e.target.closest && e.target.closest('button, input, [contenteditable="true"], .gallery-item-admin-actions')) {
        isDragging = false;
        return;
      }
      startX = e.touches[0].clientX; 
      isDragging = true; 
    }, { passive: true });

    track.addEventListener('touchmove', (e) => {
      markGalleryUserInteraction();
      if (!isDragging) return;
      const diffX = startX - e.touches[0].clientX;
      if (Math.abs(diffX) > 25) {
        if (diffX > 0) moveSlide(1); else moveSlide(-1);
        isDragging = false;
      }
    }, { passive: true });

    track.addEventListener('touchend', () => { 
      isDragging = false; 
      markGalleryUserInteraction();
    });
    let galleryResizeDebounceTimer = null;
    let lastGalleryViewportWidth = window.innerWidth;
    window.addEventListener('resize', () => {
      if (Math.abs(window.innerWidth - lastGalleryViewportWidth) < 2) return;
      lastGalleryViewportWidth = window.innerWidth;
      clearTimeout(galleryResizeDebounceTimer);
      galleryResizeDebounceTimer = setTimeout(() => {
        createDots();
        updateCarousel();
        updateBlogTrackPosition();
        if (typeof getMerchItemsPerPage === 'function' && typeof lastRenderedMerchPerPage === 'number') {
          const nextMerchPerPage = getMerchItemsPerPage();
          const activeEl = document.activeElement;
          const isEditingField = activeEl && activeEl.isContentEditable;
          if (nextMerchPerPage !== lastRenderedMerchPerPage && !isEditingField && typeof renderMerchSection === 'function') {
            renderMerchSection();
          }
        }
      }, 150);
    }, { passive: true });

    /* FUNCIONES Y VISOR MEJORADO DE MODAL DE FOTOS Y VIDEOS CON NAVEGACIÓN, SWIPE Y EDICIÓN EN VIVO */
    function openModal(photoIndex) {
      const currentGallery = galleriesData[currentGalleryKey];
      if (!currentGallery || !currentGallery.items || currentGallery.items.length === 0) return;

      currentModalPhotoIndex = photoIndex;
      updateModalPhoto();
      
      document.getElementById("imageModal").style.display = "flex";
      pushModalState('image');
    }

    function handleModalLiveCaptionInput(el) {
      if (!currentGalleryKey || !galleriesData[currentGalleryKey] || !el) return;
      const items = galleriesData[currentGalleryKey].items;
      if (!items || !items[currentModalPhotoIndex]) return;
      const val = (el.innerText || '').replace(/\r?\n/g, ' ').trim();
      items[currentModalPhotoIndex].caption = val;

      const cardEl = track.querySelector(`.gallery-item[data-index="${currentModalPhotoIndex}"] .gallery-caption`);
      if (cardEl && document.activeElement !== cardEl) {
        cardEl.innerText = val;
      }
      schedulePersistGalleryLocalCache();
    }
    window.handleModalLiveCaptionInput = handleModalLiveCaptionInput;

    function moveModalGalleryPhoto(direction) {
      if (!currentGalleryKey || !galleriesData[currentGalleryKey]) return;
      const items = galleriesData[currentGalleryKey].items;
      const targetIdx = currentModalPhotoIndex + direction;
      if (!items || targetIdx < 0 || targetIdx >= items.length) return;

      const temp = items[currentModalPhotoIndex];
      items[currentModalPhotoIndex] = items[targetIdx];
      items[targetIdx] = temp;
      currentModalPhotoIndex = targetIdx;

      persistGalleryLocalCache();
      loadGallery(currentGalleryKey, true);
      updateModalPhoto();
    }
    window.moveModalGalleryPhoto = moveModalGalleryPhoto;

    function updateModalPhoto() {
      if (typeof resetModalZoom === 'function') resetModalZoom();
      const currentGallery = galleriesData[currentGalleryKey];
      if (!currentGallery || !currentGallery.items || currentGallery.items.length === 0) {
        closeModal();
        return;
      }

      const items = currentGallery.items;
      if (currentModalPhotoIndex < 0) currentModalPhotoIndex = items.length - 1;
      if (currentModalPhotoIndex >= items.length) currentModalPhotoIndex = 0;

      const item = items[currentModalPhotoIndex];
      const modalImg = document.getElementById("modalImg");
      const videoWrapper = document.getElementById("modalVideoWrapper");
      const videoIframe = document.getElementById("modalVideoIframe");
      const captionEl = document.getElementById("modalCaption");

      const cleanSrc = cleanOrTransformMediaUrl(item.src || item.url || '');
      const ytInfo = parseYouTubeUrl(cleanSrc);
      const isVideo = !!ytInfo || item.type === 'video' || item.type === 'shorts';

      const ytDirectLink = ytInfo 
        ? `<div style="margin-top: 6px;"><a href="${escapeHtmlAttr(cleanSrc)}" target="_blank" rel="noopener noreferrer" style="color: var(--accent-light); font-size: 0.85rem; text-decoration: underline; display: inline-flex; align-items: center; gap: 4px;"><i class="fa-brands fa-youtube" style="color: #FF0000;"></i> Ver en YouTube ↗</a></div>`
        : '';

      if (typeof isAdminMode !== 'undefined' && isAdminMode) {
        const rawCaption = (item.caption || '').trim();
        captionEl.innerHTML = `
          <div id="modalLiveCaptionEdit" class="modal-live-caption-edit" contenteditable="true" spellcheck="false" data-placeholder="${isVideo ? 'Escribe el título del video...' : 'Escribe un pie de foto...'}" onclick="event.stopPropagation()" oninput="handleModalLiveCaptionInput(this)" onpaste="handlePlainTextPaste(event)" onkeydown="if(event.key==='Enter'){event.preventDefault();this.blur();}">${escapeHtmlAttr(rawCaption)}</div>
          ${ytDirectLink}
          <div style="margin-top: 10px; display: flex; justify-content: center; align-items: center; gap: 6px; flex-wrap: wrap;" onclick="event.stopPropagation()">
            <button type="button" class="wysiwyg-tool-btn" onclick="openGalleryMediaModal('edit', ${currentModalPhotoIndex})" style="font-size: 0.78rem; padding: 4px 10px;">🖼️ Cambiar</button>
            <button type="button" class="wysiwyg-tool-btn" onclick="moveModalGalleryPhoto(-1)" title="Mover antes en la galería" ${currentModalPhotoIndex === 0 ? 'disabled style="opacity:0.4;font-size:0.78rem;padding:4px 8px;"' : 'style="font-size:0.78rem;padding:4px 8px;"'}>◀ Orden</button>
            <button type="button" class="wysiwyg-tool-btn" onclick="moveModalGalleryPhoto(1)" title="Mover después en la galería" ${currentModalPhotoIndex === items.length - 1 ? 'disabled style="opacity:0.4;font-size:0.78rem;padding:4px 8px;"' : 'style="font-size:0.78rem;padding:4px 8px;"'}>Orden ▶</button>
            <button type="button" class="wysiwyg-tool-btn is-danger" onclick="confirmDeleteGalleryPhoto(${currentModalPhotoIndex})" style="font-size: 0.78rem; padding: 4px 10px;">🗑️ Eliminar</button>
          </div>
        `;
      } else {
        captionEl.innerHTML = escapeHtmlAttr(item.caption || (ytInfo ? (ytInfo.isShorts ? 'YouTube Shorts' : 'YouTube Video') : '')) + ytDirectLink;
      }

      const savedModalAura = (item && item.aura && String(item.aura).trim() && String(item.aura).trim().toLowerCase() !== 'none')
        ? formatSavedAuraGlow(String(item.aura).trim(), 0.88)
        : '';

      if (isVideo && ytInfo) {
        try {
          if (typeof window.pauseBlutuGameMusicTemporary === 'function') {
            window.pauseBlutuGameMusicTemporary();
          }
          if (window.player && typeof window.player.getPlayerState === 'function' && window.YT && window.YT.PlayerState) {
            if (window.player.getPlayerState() === window.YT.PlayerState.PLAYING) {
              window.player.pauseVideo();
            }
          }
        } catch (e) {}

        if (modalImg) modalImg.style.display = 'none';
        if (videoWrapper) {
          videoWrapper.style.display = 'block';
          if (savedModalAura) {
            videoWrapper.style.setProperty('--modal-aura-color', savedModalAura);
          } else {
            videoWrapper.style.removeProperty('--modal-aura-color');
          }
          if (ytInfo.isShorts) {
            videoWrapper.style.width = 'min(86vw, 380px)';
            videoWrapper.style.height = 'min(76vh, 675px)';
            videoWrapper.style.maxWidth = '380px';
            videoWrapper.style.aspectRatio = '9 / 16';
          } else {
            videoWrapper.style.width = 'min(92vw, 820px)';
            videoWrapper.style.height = 'auto';
            videoWrapper.style.maxWidth = '820px';
            videoWrapper.style.aspectRatio = '16 / 9';
          }
        }
        if (videoIframe) {
          videoIframe.style.width = '100%';
          videoIframe.style.height = '100%';
          videoIframe.style.minHeight = ytInfo.isShorts ? '480px' : '240px';
          videoIframe.style.border = 'none';
          videoIframe.style.display = 'block';
          videoIframe.setAttribute('allow', 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share');
          videoIframe.setAttribute('allowfullscreen', 'true');
          videoIframe.setAttribute('referrerpolicy', 'no-referrer-when-downgrade');
          videoIframe.src = ytInfo.embedUrl;
        }
      } else {
        if (videoIframe) {
          videoIframe.src = 'about:blank';
        }
        if (videoWrapper) {
          videoWrapper.style.display = 'none';
          videoWrapper.style.removeProperty('--modal-aura-color');
        }
        if (modalImg) {
          modalImg.style.display = 'block';
          if (savedModalAura) {
            modalImg.style.setProperty('--modal-aura-color', savedModalAura);
            modalImg.style.boxShadow = `0 0 52px ${savedModalAura}, 0 0 22px ${savedModalAura}`;
          } else {
            modalImg.style.removeProperty('--modal-aura-color');
            modalImg.style.boxShadow = '';
          }
          delete modalImg.dataset.fallbackTried;
          modalImg.referrerPolicy = 'no-referrer';
          modalImg.setAttribute('referrerpolicy', 'no-referrer');
          modalImg.removeAttribute('crossorigin');
          modalImg.src = cleanSrc;

          modalImg.onerror = function() {
            if (cleanSrc.includes('lh3.googleusercontent.com/d/') && !this.dataset.fallbackTried) {
              this.dataset.fallbackTried = '1';
              const fileIdMatch = cleanSrc.match(/\/d\/([a-zA-Z0-9_-]+)/);
              if (fileIdMatch && fileIdMatch[1]) {
                this.src = `https://drive.google.com/uc?export=view&id=${fileIdMatch[1]}`;
              }
            }
          };
        }
      }
    }

    let modalZoomScale = 1;
    let modalZoomTranslateX = 0;
    let modalZoomTranslateY = 0;
    let isModalPinching = false;
    let modalGestureHadMultiTouch = false;
    let modalInitialPinchDist = 0;
    let modalStartScale = 1;
    let modalPinchStartMidX = 0;
    let modalPinchStartMidY = 0;
    let modalPinchStartTx = 0;
    let modalPinchStartTy = 0;
    let modalBaseImgW = 0;
    let modalBaseImgH = 0;
    let modalBaseCenterX = 0;
    let modalBaseCenterY = 0;
    let modalLastTouchX = 0;
    let modalLastTouchY = 0;
    let modalStartX = 0;
    let modalStartY = 0;
    let modalTouchStartTime = 0;
    let modalLastPinchOrPanEndTime = 0;

    function captureModalImgBaseMetrics() {
      const img = document.getElementById("modalImg");
      if (!img || img.style.display === 'none') return false;
      const rect = img.getBoundingClientRect();
      if (!rect.width || !rect.height) return false;
      const curScale = modalZoomScale > 0 ? modalZoomScale : 1;
      modalBaseImgW = rect.width / curScale;
      modalBaseImgH = rect.height / curScale;
      modalBaseCenterX = (rect.left + rect.width / 2) - modalZoomTranslateX;
      modalBaseCenterY = (rect.top + rect.height / 2) - modalZoomTranslateY;
      return true;
    }

    function clampModalZoomPan(scale, tx, ty) {
      if (scale <= 1.001 || !modalBaseImgW || !modalBaseImgH) {
        return { x: 0, y: 0 };
      }
      const maxX = Math.max(0, ((scale - 1) * modalBaseImgW) / 2);
      const maxY = Math.max(0, ((scale - 1) * modalBaseImgH) / 2);
      return {
        x: Math.max(-maxX, Math.min(maxX, tx)),
        y: Math.max(-maxY, Math.min(maxY, ty))
      };
    }

    function resetModalZoom() {
      modalZoomScale = 1;
      modalZoomTranslateX = 0;
      modalZoomTranslateY = 0;
      isModalPinching = false;
      modalGestureHadMultiTouch = false;
      const img = document.getElementById("modalImg");
      if (img) {
        img.style.transition = 'transform 0.2s ease';
        img.style.transform = '';
      }
    }

    function applyModalZoomTransform() {
      const img = document.getElementById("modalImg");
      if (!img) return;
      img.style.transition = 'none';
      img.style.transform = `translate3d(${modalZoomTranslateX.toFixed(2)}px, ${modalZoomTranslateY.toFixed(2)}px, 0) scale(${modalZoomScale.toFixed(4)})`;
    }

    function navigateModal(direction) {
      resetModalZoom();
      currentModalPhotoIndex += direction;
      updateModalPhoto();
    }

    function closeModal() { 
      popModalState('image');
      resetModalZoom();
      const videoIframe = document.getElementById("modalVideoIframe");
      if (videoIframe) videoIframe.src = 'about:blank';
      const videoWrapper = document.getElementById("modalVideoWrapper");
      if (videoWrapper) videoWrapper.style.display = 'none';
      document.getElementById("imageModal").style.display = "none"; 
    }

    function modalBgClick(event) {
      if (Date.now() - modalLastPinchOrPanEndTime < 220) return;
      if (event.target.id === "imageModal") {
        closeModal();
      }
    }

    const modalElement = document.getElementById("imageModal");

    if (modalElement) {
      modalElement.addEventListener('gesturestart', (e) => {
        const img = document.getElementById("modalImg");
        if (img && img.style.display !== 'none') {
          e.preventDefault();
        }
      }, { passive: false });

      modalElement.addEventListener('gesturechange', (e) => {
        const img = document.getElementById("modalImg");
        if (img && img.style.display !== 'none') {
          e.preventDefault();
        }
      }, { passive: false });

      modalElement.addEventListener('touchstart', (e) => {
        const img = document.getElementById("modalImg");
        const isImgVisible = Boolean(img && img.style.display !== 'none');

        if (isImgVisible && e.touches.length >= 2) {
          if (e.cancelable) e.preventDefault();
          captureModalImgBaseMetrics();
          isModalPinching = true;
          modalGestureHadMultiTouch = true;
          const t0 = e.touches[0];
          const t1 = e.touches[1];
          modalInitialPinchDist = Math.hypot(t0.clientX - t1.clientX, t0.clientY - t1.clientY);
          modalStartScale = modalZoomScale;
          modalPinchStartMidX = (t0.clientX + t1.clientX) / 2;
          modalPinchStartMidY = (t0.clientY + t1.clientY) / 2;
          modalPinchStartTx = modalZoomTranslateX;
          modalPinchStartTy = modalZoomTranslateY;
          return;
        }

        if (e.target && (e.target.id === 'modalVideoWrapper' || e.target.id === 'modalVideoIframe' || (e.target.closest && e.target.closest('.close-modal, .modal-arrow, #modalVideoWrapper, #modalCaption, button, a, [contenteditable="true"]')))) {
          modalTouchStartTime = 0;
          return;
        }

        if (e.touches.length === 1) {
          captureModalImgBaseMetrics();
          modalGestureHadMultiTouch = false;
          modalStartX = e.touches[0].clientX;
          modalStartY = e.touches[0].clientY;
          modalLastTouchX = e.touches[0].clientX;
          modalLastTouchY = e.touches[0].clientY;
          modalTouchStartTime = Date.now();
        }
      }, { passive: false });

      modalElement.addEventListener('touchmove', (e) => {
        const img = document.getElementById("modalImg");
        const isImgVisible = Boolean(img && img.style.display !== 'none');
        if (!isImgVisible) return;

        if (e.touches.length >= 2) {
          if (e.cancelable) e.preventDefault();
          if (!isModalPinching) {
            captureModalImgBaseMetrics();
            isModalPinching = true;
            modalGestureHadMultiTouch = true;
            const t0 = e.touches[0];
            const t1 = e.touches[1];
            modalInitialPinchDist = Math.hypot(t0.clientX - t1.clientX, t0.clientY - t1.clientY);
            modalStartScale = modalZoomScale;
            modalPinchStartMidX = (t0.clientX + t1.clientX) / 2;
            modalPinchStartMidY = (t0.clientY + t1.clientY) / 2;
            modalPinchStartTx = modalZoomTranslateX;
            modalPinchStartTy = modalZoomTranslateY;
            return;
          }
          const t0 = e.touches[0];
          const t1 = e.touches[1];
          const currentDist = Math.hypot(t0.clientX - t1.clientX, t0.clientY - t1.clientY);
          const curMidX = (t0.clientX + t1.clientX) / 2;
          const curMidY = (t0.clientY + t1.clientY) / 2;
          if (modalInitialPinchDist > 4) {
            const factor = currentDist / modalInitialPinchDist;
            const nextScale = Math.min(Math.max(1, modalStartScale * factor), 5);
            const effRatio = nextScale / (modalStartScale || 1);
            const startRelX = modalPinchStartMidX - modalBaseCenterX;
            const startRelY = modalPinchStartMidY - modalBaseCenterY;
            const curRelX = curMidX - modalBaseCenterX;
            const curRelY = curMidY - modalBaseCenterY;
            const rawTx = curRelX - (startRelX - modalPinchStartTx) * effRatio;
            const rawTy = curRelY - (startRelY - modalPinchStartTy) * effRatio;
            const clamped = clampModalZoomPan(nextScale, rawTx, rawTy);
            modalZoomScale = nextScale;
            modalZoomTranslateX = clamped.x;
            modalZoomTranslateY = clamped.y;
            applyModalZoomTransform();
          }
          return;
        }

        if (e.touches.length === 1 && modalZoomScale > 1.02) {
          if (e.cancelable) e.preventDefault();
          const currentX = e.touches[0].clientX;
          const currentY = e.touches[0].clientY;
          const deltaX = currentX - modalLastTouchX;
          const deltaY = currentY - modalLastTouchY;
          const clamped = clampModalZoomPan(modalZoomScale, modalZoomTranslateX + deltaX, modalZoomTranslateY + deltaY);
          modalZoomTranslateX = clamped.x;
          modalZoomTranslateY = clamped.y;
          modalLastTouchX = currentX;
          modalLastTouchY = currentY;
          modalLastPinchOrPanEndTime = Date.now();
          applyModalZoomTransform();
        }
      }, { passive: false });

      const handleModalTouchEndOrCancel = (e) => {
        if (e.touches.length === 1) {
          isModalPinching = false;
          modalLastTouchX = e.touches[0].clientX;
          modalLastTouchY = e.touches[0].clientY;
          modalLastPinchOrPanEndTime = Date.now();
          return;
        }

        if (e.touches.length > 0) return;

        if (isModalPinching || modalGestureHadMultiTouch) {
          isModalPinching = false;
          modalGestureHadMultiTouch = false;
          modalLastPinchOrPanEndTime = Date.now();
          if (modalZoomScale <= 1.03) {
            resetModalZoom();
          }
          return;
        }

        if (!modalTouchStartTime) return;
        const startTime = modalTouchStartTime;
        modalTouchStartTime = 0;

        if (modalZoomScale > 1.03) {
          return;
        }

        if (!e.changedTouches || !e.changedTouches.length) return;
        const diffX = modalStartX - e.changedTouches[0].clientX;
        const diffY = modalStartY - e.changedTouches[0].clientY;
        const duration = Date.now() - startTime;

        if (duration < 650 && Math.abs(diffX) > 55 && Math.abs(diffX) > Math.abs(diffY) * 1.5) {
          if (diffX > 0) navigateModal(1);
          else navigateModal(-1);
        }
      };

      modalElement.addEventListener('touchend', handleModalTouchEndOrCancel, { passive: true });
      modalElement.addEventListener('touchcancel', handleModalTouchEndOrCancel, { passive: true });

      modalElement.addEventListener('wheel', (e) => {
        const img = document.getElementById("modalImg");
        if (!img || img.style.display === 'none') return;
        if (!e.ctrlKey && e.target !== img) return;
        e.preventDefault();
        captureModalImgBaseMetrics();
        const zoomStep = e.ctrlKey ? -e.deltaY * 0.01 : (e.deltaY < 0 ? 0.16 : -0.16);
        const nextScale = Math.min(Math.max(1, modalZoomScale * (1 + zoomStep)), 5);
        if (nextScale <= 1.01) {
          resetModalZoom();
          return;
        }
        const effRatio = nextScale / (modalZoomScale || 1);
        const relX = e.clientX - modalBaseCenterX;
        const relY = e.clientY - modalBaseCenterY;
        const rawTx = relX - (relX - modalZoomTranslateX) * effRatio;
        const rawTy = relY - (relY - modalZoomTranslateY) * effRatio;
        const clamped = clampModalZoomPan(nextScale, rawTx, rawTy);
        modalZoomScale = nextScale;
        modalZoomTranslateX = clamped.x;
        modalZoomTranslateY = clamped.y;
        applyModalZoomTransform();
      }, { passive: false });
    }

    /* GESTIÓN INTEGRADA DE GALERÍA Y MODAL LIGERO DE MULTIMEDIA */
    function ensureActiveGallery() {
      if (currentGalleryKey && galleriesData[currentGalleryKey]) {
        selectedAdminGalleryKey = currentGalleryKey;
        return currentGalleryKey;
      }
      const keys = getOrderedGalleryKeys();
      if (keys.length > 0 && galleriesData[keys[0]]) {
        currentGalleryKey = keys[0];
        selectedAdminGalleryKey = keys[0];
        return keys[0];
      }
      const newKey = 'galeria_' + Date.now();
      galleriesData[newKey] = {
        title: 'Nueva Galería',
        color1: '#5A74BF',
        color2: '#28386B',
        color: '#5A74BF',
        items: []
      };
      window.galleryOrder = [newKey];
      fixedGalleryOrder = [newKey];
      currentGalleryKey = newKey;
      selectedAdminGalleryKey = newKey;
      persistGalleryLocalCache();
      renderGalleryTabs(false);
      return newKey;
    }

    let galleryMediaUrlScanTimer = null;
    let galleryMediaScanToken = 0;
    let galleryMediaInitialNormalizedUrl = '';

    function syncGalleryMediaAuraControlsUI(enabled, statusMsg) {
      const cb = document.getElementById('galleryMediaUseAuraCheckbox');
      const wrap = document.getElementById('galleryMediaAuraControlsWrap');
      const statusEl = document.getElementById('galleryMediaAuraScanStatus');
      if (cb) cb.checked = Boolean(enabled);
      if (wrap) {
        wrap.style.opacity = enabled ? '1' : '0.42';
        wrap.style.pointerEvents = enabled ? 'auto' : 'none';
      }
      if (statusEl && typeof statusMsg === 'string') {
        statusEl.textContent = statusMsg;
      }
    }

    function toggleGalleryMediaUseAura(checked) {
      const enabled = Boolean(checked);
      const auraInput = document.getElementById('galleryMediaAuraInput');
      const urlInput = document.getElementById('galleryMediaUrlInput');
      const curHex = (auraInput ? auraInput.value.trim() : '');
      syncGalleryMediaAuraControlsUI(
        enabled,
        enabled ? (curHex ? `Aura activa (${curHex})` : 'Listo para extraer 1 vez') : 'Sin aura propia (usa color de galería)'
      );
      if (enabled && !curHex) {
        const candidateSrc = (urlInput && urlInput.value.trim()) ? urlInput.value.trim() : galleryMediaOriginalDataSrc;
        if (candidateSrc) {
          rescanGalleryMediaAuraFromUrl(false);
        }
      }
    }
    window.toggleGalleryMediaUseAura = toggleGalleryMediaUseAura;

    function handleGalleryMediaManualAuraColor(val) {
      const hex = String(val || '').trim().toUpperCase();
      const auraInput = document.getElementById('galleryMediaAuraInput');
      if (auraInput && hex) auraInput.value = hex;
      syncGalleryMediaAuraControlsUI(true, `Color personalizado (${hex})`);
    }
    window.handleGalleryMediaManualAuraColor = handleGalleryMediaManualAuraColor;

    function handleGalleryMediaManualAuraText(val) {
      const trimmed = String(val || '').trim();
      const picker = document.getElementById('galleryMediaAuraPicker');
      const hex = rgbOrCssToHexUpper(trimmed);
      if (picker && hex) picker.value = hex.toLowerCase();
      if (trimmed) {
        syncGalleryMediaAuraControlsUI(true, `Color definido (${hex || trimmed})`);
      }
    }
    window.handleGalleryMediaManualAuraText = handleGalleryMediaManualAuraText;

    async function rescanGalleryMediaAuraFromUrl(forceRefresh = false) {
      if (galleryMediaModalMode !== 'add' && galleryMediaModalMode !== 'edit') return '';
      const urlInput = document.getElementById('galleryMediaUrlInput');
      const auraInput = document.getElementById('galleryMediaAuraInput');
      const auraPicker = document.getElementById('galleryMediaAuraPicker');
      const cb = document.getElementById('galleryMediaUseAuraCheckbox');
      const statusEl = document.getElementById('galleryMediaAuraScanStatus');

      const candidateSrc = (urlInput && urlInput.value.trim()) ? urlInput.value.trim() : galleryMediaOriginalDataSrc;
      if (!candidateSrc) {
        if (forceRefresh) showToastNotification('Ingresa primero la URL de la imagen o video para extraer su color.', true);
        return '';
      }

      const token = ++galleryMediaScanToken;
      if (statusEl) statusEl.textContent = 'Escaneando color 1 vez...';

      const extractedHex = await extractAuraHexOnceForAdmin(candidateSrc, forceRefresh);
      if (token !== galleryMediaScanToken) return extractedHex;

      if (extractedHex) {
        if (auraInput) auraInput.value = extractedHex;
        if (auraPicker) auraPicker.value = extractedHex.toLowerCase();
        if (forceRefresh && cb && !cb.checked) {
          syncGalleryMediaAuraControlsUI(true, `✨ Extraído: ${extractedHex}`);
        } else {
          const isChecked = cb ? cb.checked : true;
          syncGalleryMediaAuraControlsUI(isChecked, isChecked ? `✨ Extraído: ${extractedHex}` : `Extraído (${extractedHex}) — desactivado`);
        }
      } else {
        if (statusEl) statusEl.textContent = 'No se pudo extraer (elige color manual o desactiva)';
      }
      return extractedHex;
    }
    window.rescanGalleryMediaAuraFromUrl = rescanGalleryMediaAuraFromUrl;

    function handleGalleryMediaUrlInputForAura(rawVal) {
      if (galleryMediaModalMode !== 'add' && galleryMediaModalMode !== 'edit') return;
      if (galleryMediaUrlScanTimer) {
        clearTimeout(galleryMediaUrlScanTimer);
        galleryMediaUrlScanTimer = null;
      }
      const trimmed = String(rawVal || '').trim();
      if (!trimmed) return;
      if (trimmed === galleryMediaInitialNormalizedUrl) return;

      galleryMediaUrlScanTimer = setTimeout(() => {
        galleryMediaUrlScanTimer = null;
        galleryMediaInitialNormalizedUrl = trimmed;
        rescanGalleryMediaAuraFromUrl(false);
      }, 340);
    }
    window.handleGalleryMediaUrlInputForAura = handleGalleryMediaUrlInputForAura;

    function openGalleryMediaModal(mode = 'add', targetIndex = null) {
      if (!window.__adminModalsMounted) { ensureAdminModalsReady().then(() => openGalleryMediaModal(mode, targetIndex)); return; }
      galleryMediaModalMode = mode;
      galleryMediaTargetIndex = targetIndex;
      galleryMediaOriginalDataSrc = '';
      if (galleryMediaUrlScanTimer) {
        clearTimeout(galleryMediaUrlScanTimer);
        galleryMediaUrlScanTimer = null;
      }
      galleryMediaScanToken++;
      galleryMediaInitialNormalizedUrl = '';

      const modal = document.getElementById('galleryMediaModal');
      const titleEl = document.getElementById('galleryMediaModalTitle');
      const urlLabel = document.getElementById('galleryMediaUrlLabel');
      const urlInput = document.getElementById('galleryMediaUrlInput');
      const capGroup = document.getElementById('galleryMediaCaptionGroup');
      const capInput = document.getElementById('galleryMediaCaptionInput');
      const auraGroup = document.getElementById('galleryMediaAuraGroup');
      const auraInput = document.getElementById('galleryMediaAuraInput');
      const auraPicker = document.getElementById('galleryMediaAuraPicker');
      const fileInput = document.getElementById('galleryMediaModalFileInput');
      const confirmBtn = document.getElementById('galleryMediaConfirmBtn');

      if (!modal || !urlInput) return;

      urlInput.value = '';
      urlInput.placeholder = 'https://...';
      if (capInput) capInput.value = '';
      if (fileInput) fileInput.value = '';
      if (auraInput) auraInput.value = '';
      if (auraPicker) auraPicker.value = '#5a74bf';

      if (mode === 'add') {
        if (titleEl) titleEl.textContent = '🖼️ Añadir Foto o Video';
        if (urlLabel) urlLabel.textContent = 'URL de Imagen, Google Drive o YouTube / Shorts:';
        if (capGroup) capGroup.style.display = 'block';
        if (auraGroup) auraGroup.style.display = 'block';
        if (fileInput) fileInput.multiple = true;
        if (confirmBtn) confirmBtn.textContent = 'Añadir';
        syncGalleryMediaAuraControlsUI(true, 'Se escaneará 1 vez al insertar');
      } else if (mode === 'edit') {
        if (titleEl) titleEl.textContent = '🖼️ Cambiar Foto o Video';
        if (urlLabel) urlLabel.textContent = 'URL de Imagen, Google Drive o YouTube / Shorts:';
        if (capGroup) capGroup.style.display = 'block';
        if (auraGroup) auraGroup.style.display = 'block';
        if (fileInput) fileInput.multiple = false;
        if (confirmBtn) confirmBtn.textContent = 'Guardar';

        const activeKey = ensureActiveGallery();
        const item = (galleriesData[activeKey] && galleriesData[activeKey].items) ? galleriesData[activeKey].items[targetIndex] : null;
        if (item) {
          const rawSrc = item.src || item.url || '';
          if (rawSrc.startsWith('data:')) {
            galleryMediaOriginalDataSrc = rawSrc;
            urlInput.value = '';
            urlInput.placeholder = 'Archivo local cargado (pega URL o sube otro para reemplazar)';
          } else {
            urlInput.value = rawSrc;
            galleryMediaInitialNormalizedUrl = rawSrc.trim();
          }
          if (capInput) capInput.value = item.caption || '';

          const existingAura = (item.aura && String(item.aura).trim() && String(item.aura).trim().toLowerCase() !== 'none')
            ? String(item.aura).trim()
            : '';
          if (existingAura) {
            const hex = rgbOrCssToHexUpper(existingAura) || existingAura;
            if (auraInput) auraInput.value = hex;
            if (auraPicker && /^#[0-9A-F]{6}$/i.test(hex)) auraPicker.value = hex.toLowerCase();
            syncGalleryMediaAuraControlsUI(true, `Color guardado (${hex})`);
          } else {
            syncGalleryMediaAuraControlsUI(false, 'Sin aura propia (usa color de galería)');
          }
        } else {
          syncGalleryMediaAuraControlsUI(false, 'Sin aura propia');
        }
      } else if (mode === 'merch-add') {
        if (titleEl) titleEl.textContent = '🛍️ Añadir Foto al Producto';
        if (urlLabel) urlLabel.textContent = 'URL de la Imagen o Google Drive:';
        if (capGroup) capGroup.style.display = 'none';
        if (auraGroup) auraGroup.style.display = 'none';
        if (fileInput) fileInput.multiple = true;
        if (confirmBtn) confirmBtn.textContent = 'Añadir Foto';
      } else if (mode === 'merch-edit') {
        if (titleEl) titleEl.textContent = '🛍️ Cambiar Foto del Producto';
        if (urlLabel) urlLabel.textContent = 'URL de la Imagen o Google Drive:';
        if (capGroup) capGroup.style.display = 'none';
        if (auraGroup) auraGroup.style.display = 'none';
        if (fileInput) fileInput.multiple = false;
        if (confirmBtn) confirmBtn.textContent = 'Guardar Foto';

        const item = merchItemsData[targetIndex];
        if (item) {
          const cleanImgs = (typeof getCleanMerchImages === 'function') ? getCleanMerchImages(item) : [];
          const isModalOpenForThis = document.getElementById('merchDetailModal')?.style.display === 'flex' && currentModalMerchIdx === targetIndex;
          const slotIdx = isModalOpenForThis ? Math.min(currentModalImageIdx, Math.max(0, cleanImgs.length - 1)) : 0;
          const curSrc = cleanImgs[slotIdx] || '';
          if (curSrc.startsWith('data:')) {
            galleryMediaOriginalDataSrc = curSrc;
            urlInput.value = '';
            urlInput.placeholder = 'Archivo local cargado (pega URL o sube otro para reemplazar)';
          } else {
            urlInput.value = curSrc;
          }
        }
      }

      modal.style.display = 'flex';
      setTimeout(() => { urlInput.focus(); }, 40);
    }
    window.openGalleryMediaModal = openGalleryMediaModal;

    function closeGalleryMediaModal() {
      if (galleryMediaUrlScanTimer) {
        clearTimeout(galleryMediaUrlScanTimer);
        galleryMediaUrlScanTimer = null;
      }
      galleryMediaScanToken++;
      const modal = document.getElementById('galleryMediaModal');
      if (modal) modal.style.display = 'none';
      const fileInput = document.getElementById('galleryMediaModalFileInput');
      if (fileInput) fileInput.value = '';
    }
    window.closeGalleryMediaModal = closeGalleryMediaModal;

    function buildGalleryItemFromUrl(rawUrl, captionText, auraHex = '') {
      const url = cleanOrTransformMediaUrl(rawUrl);
      const ytInfo = parseYouTubeUrl(url);
      const cleanAura = (auraHex && String(auraHex).trim() && String(auraHex).trim().toLowerCase() !== 'none')
        ? (rgbOrCssToHexUpper(auraHex) || String(auraHex).trim())
        : '';
      if (ytInfo) {
        const videoItem = {
          src: url,
          caption: captionText !== undefined && captionText !== '' ? captionText : (ytInfo.isShorts ? 'YouTube Shorts' : 'YouTube Video'),
          type: ytInfo.isShorts ? 'shorts' : 'video',
          thumb: ytInfo.thumbnailUrl
        };
        if (cleanAura) videoItem.aura = cleanAura;
        return videoItem;
      }
      const photoItem = {
        src: url,
        caption: captionText || ''
      };
      if (cleanAura) photoItem.aura = cleanAura;
      return photoItem;
    }

    async function confirmGalleryMediaModal() {
      const urlInput = document.getElementById('galleryMediaUrlInput');
      const capInput = document.getElementById('galleryMediaCaptionInput');
      const useAuraCb = document.getElementById('galleryMediaUseAuraCheckbox');
      const auraInput = document.getElementById('galleryMediaAuraInput');
      const confirmBtn = document.getElementById('galleryMediaConfirmBtn');
      const rawUrl = urlInput ? urlInput.value.trim() : '';
      const caption = capInput ? capInput.value.trim() : '';

      if (galleryMediaModalMode === 'add') {
        if (!rawUrl) {
          showToastNotification('Ingresa una URL o sube un archivo desde tu dispositivo.', true);
          return;
        }
        let chosenAura = '';
        if (!useAuraCb || useAuraCb.checked) {
          chosenAura = auraInput ? auraInput.value.trim() : '';
          if (!chosenAura) {
            if (confirmBtn) confirmBtn.disabled = true;
            try {
              chosenAura = await extractAuraHexOnceForAdmin(rawUrl, false);
            } finally {
              if (confirmBtn) confirmBtn.disabled = false;
            }
          }
        }
        const activeKey = ensureActiveGallery();
        galleriesData[activeKey].items.push(buildGalleryItemFromUrl(rawUrl, caption, chosenAura));
        persistGalleryLocalCache();
        closeGalleryMediaModal();
        loadGallery(activeKey, true);
        currentIndex = getMaxIndex();
        updateCarousel();
        showToastNotification('✨ Elemento añadido a la galería');
      } else if (galleryMediaModalMode === 'edit') {
        const finalUrl = rawUrl || galleryMediaOriginalDataSrc;
        if (!finalUrl) {
          showToastNotification('Ingresa una URL o sube un archivo desde tu dispositivo.', true);
          return;
        }
        let chosenAura = '';
        if (useAuraCb && useAuraCb.checked) {
          chosenAura = auraInput ? auraInput.value.trim() : '';
          if (!chosenAura) {
            if (confirmBtn) confirmBtn.disabled = true;
            try {
              chosenAura = await extractAuraHexOnceForAdmin(finalUrl, false);
            } finally {
              if (confirmBtn) confirmBtn.disabled = false;
            }
          }
        }
        const activeKey = ensureActiveGallery();
        if (galleriesData[activeKey] && galleriesData[activeKey].items[galleryMediaTargetIndex]) {
          galleriesData[activeKey].items[galleryMediaTargetIndex] = buildGalleryItemFromUrl(finalUrl, caption, chosenAura);
          persistGalleryLocalCache();
          closeGalleryMediaModal();
          loadGallery(activeKey, true);
          if (document.getElementById('imageModal')?.style.display === 'flex') {
            updateModalPhoto();
          }
          showToastNotification('✨ Elemento actualizado');
        }
      } else if (galleryMediaModalMode === 'merch-add') {
        if (!rawUrl) {
          showToastNotification('Ingresa la URL de la foto o súbela desde tu dispositivo.', true);
          return;
        }
        const idx = galleryMediaTargetIndex;
        if (merchItemsData[idx] && typeof appendPhotosToMerchItem === 'function') {
          appendPhotosToMerchItem(idx, [cleanOrTransformMediaUrl(rawUrl)]);
          closeGalleryMediaModal();
          showToastNotification('✨ Foto añadida al producto');
        }
      } else if (galleryMediaModalMode === 'merch-edit') {
        const finalUrl = rawUrl ? cleanOrTransformMediaUrl(rawUrl) : galleryMediaOriginalDataSrc;
        if (!finalUrl) {
          showToastNotification('Ingresa la URL de la foto o súbela desde tu dispositivo.', true);
          return;
        }
        const idx = galleryMediaTargetIndex;
        if (merchItemsData[idx] && typeof replacePhotoInMerchItem === 'function') {
          replacePhotoInMerchItem(idx, finalUrl);
          closeGalleryMediaModal();
          showToastNotification('✨ Foto del producto actualizada');
        }
      }
    }
    window.confirmGalleryMediaModal = confirmGalleryMediaModal;

    async function handleGalleryMediaModalFileChange(event) {
      const files = Array.from((event && event.target && event.target.files) || []);
      if (files.length === 0) return;
      const capInput = document.getElementById('galleryMediaCaptionInput');
      const typedCaption = capInput ? capInput.value.trim() : '';
      const useAuraCb = document.getElementById('galleryMediaUseAuraCheckbox');
      const shouldScanAuraOnce = (galleryMediaModalMode === 'add' || galleryMediaModalMode === 'edit') && (!useAuraCb || useAuraCb.checked);
      const total = files.length;

      try {
        const results = await Promise.all(files.map(async (file) => {
          const compressedSrc = await compressUploadedImageFileToDataUrl(file, 1150, 0.80);
          const scannedAura = shouldScanAuraOnce ? await extractAuraHexOnceForAdmin(compressedSrc, false) : '';
          return {
            src: compressedSrc,
            aura: scannedAura,
            defaultCaption: file.name.replace(/\.[^/.]+$/, '').replace(/[-_]/g, ' ').trim()
          };
        }));

        if (event && event.target) event.target.value = '';

        if (galleryMediaModalMode === 'add') {
          const activeKey = ensureActiveGallery();
          results.forEach((r) => {
            if (!r || !r.src) return;
            const entry = {
              src: r.src,
              caption: (total === 1 && typedCaption) ? typedCaption : r.defaultCaption
            };
            if (r.aura) entry.aura = r.aura;
            galleriesData[activeKey].items.push(entry);
          });
          persistGalleryLocalCache();
          closeGalleryMediaModal();
          loadGallery(activeKey, true);
          currentIndex = getMaxIndex();
          updateCarousel();
          showToastNotification(`✨ ${total > 1 ? total + ' fotos añadidas' : 'Foto añadida'} a la galería`);
        } else if (galleryMediaModalMode === 'edit') {
          const activeKey = ensureActiveGallery();
          if (results[0] && galleriesData[activeKey] && galleriesData[activeKey].items[galleryMediaTargetIndex]) {
            const updatedEntry = {
              src: results[0].src,
              caption: typedCaption || galleriesData[activeKey].items[galleryMediaTargetIndex].caption || results[0].defaultCaption
            };
            if (results[0].aura) updatedEntry.aura = results[0].aura;
            galleriesData[activeKey].items[galleryMediaTargetIndex] = updatedEntry;
            persistGalleryLocalCache();
            closeGalleryMediaModal();
            loadGallery(activeKey, true);
            if (document.getElementById('imageModal')?.style.display === 'flex') {
              updateModalPhoto();
            }
            showToastNotification('✨ Foto reemplazada');
          }
        } else if (galleryMediaModalMode === 'merch-add') {
          const idx = galleryMediaTargetIndex;
          if (merchItemsData[idx] && typeof appendPhotosToMerchItem === 'function') {
            appendPhotosToMerchItem(idx, results.filter(Boolean).map(r => r.src));
            closeGalleryMediaModal();
            showToastNotification(`✨ ${total > 1 ? total + ' fotos añadidas' : 'Foto añadida'} al producto`);
          }
        } else if (galleryMediaModalMode === 'merch-edit') {
          const idx = galleryMediaTargetIndex;
          if (results[0] && merchItemsData[idx] && typeof replacePhotoInMerchItem === 'function') {
            replacePhotoInMerchItem(idx, results[0].src);
            closeGalleryMediaModal();
            showToastNotification('✨ Foto del producto reemplazada');
          }
        }
      } catch (err) {
        if (event && event.target) event.target.value = '';
        showToastNotification('No se pudo procesar la imagen seleccionada.', true);
      }
    }
    window.handleGalleryMediaModalFileChange = handleGalleryMediaModalFileChange;

    async function handlePhotoFileUpload(event) {
      const files = Array.from((event && event.target && event.target.files) || []);
      if (files.length === 0) return;

      const activeKey = ensureActiveGallery();
      const totalFiles = files.length;
      const autoAuraCb = document.getElementById('inlineGalleryAutoAuraCheckbox');
      const shouldScanAuraOnce = !autoAuraCb || autoAuraCb.checked;

      try {
        const orderedUploads = await Promise.all(files.map(async (file) => {
          const compressedSrc = await compressUploadedImageFileToDataUrl(file, 1150, 0.80);
          const scannedAura = shouldScanAuraOnce ? await extractAuraHexOnceForAdmin(compressedSrc, false) : '';
          const entry = {
            src: compressedSrc,
            caption: file.name.replace(/\.[^/.]+$/, "").replace(/[-_]/g, " ").trim()
          };
          if (scannedAura) entry.aura = scannedAura;
          return entry;
        }));

        orderedUploads.forEach(u => {
          if (u && u.src) galleriesData[activeKey].items.push(u);
        });
        if (event && event.target) event.target.value = '';
        persistGalleryLocalCache();
        loadGallery(activeKey, true);
        currentIndex = getMaxIndex();
        updateCarousel();
        showToastNotification(`✨ ${totalFiles > 1 ? totalFiles + ' fotos subidas' : 'Foto subida'} a "${galleriesData[activeKey].title}"`);
      } catch (err) {
        if (event && event.target) event.target.value = '';
        showToastNotification('No se pudo procesar la foto seleccionada.', true);
      }
    }
    window.handlePhotoFileUpload = handlePhotoFileUpload;

    function reorderPhotosInAdmin(fromIndex, toIndex) {
      const key = currentGalleryKey || selectedAdminGalleryKey;
      if (!key || !galleriesData[key]) return;
      const itemsList = galleriesData[key].items;

      if (fromIndex < 0 || fromIndex >= itemsList.length || toIndex < 0 || toIndex >= itemsList.length) return;

      const [movedItem] = itemsList.splice(fromIndex, 1);
      itemsList.splice(toIndex, 0, movedItem);

      persistGalleryLocalCache();
      loadGallery(key, true);
    }

    function movePhotoInAdminGallery(index, direction) {
      const key = currentGalleryKey || selectedAdminGalleryKey;
      if (!key || !galleriesData[key]) return;
      const itemsList = galleriesData[key].items;

      const targetIndex = index + direction;
      if (targetIndex >= 0 && targetIndex < itemsList.length) {
        const temp = itemsList[index];
        itemsList[index] = itemsList[targetIndex];
        itemsList[targetIndex] = temp;

        persistGalleryLocalCache();
        loadGallery(key, true);
      }
    }
    window.movePhotoInAdminGallery = movePhotoInAdminGallery;

    function confirmDeleteGalleryPhoto(index) {
      const key = currentGalleryKey || selectedAdminGalleryKey;
      if (!key || !galleriesData[key] || !galleriesData[key].items[index]) return;
      const item = galleriesData[key].items[index];
      const label = (item.caption && item.caption.trim()) ? `"${item.caption.trim()}"` : 'este elemento';

      const executeRemoval = () => {
        if (!galleriesData[key] || !galleriesData[key].items[index]) return;
        galleriesData[key].items.splice(index, 1);
        persistGalleryLocalCache();
        loadGallery(key, true);

        const isImgModalOpen = document.getElementById('imageModal')?.style.display === 'flex';
        if (isImgModalOpen) {
          if (galleriesData[key].items.length === 0) {
            closeModal();
          } else {
            if (currentModalPhotoIndex >= galleriesData[key].items.length) {
              currentModalPhotoIndex = galleriesData[key].items.length - 1;
            }
            updateModalPhoto();
          }
        }
        showToastNotification('🗑️ Elemento eliminado de la galería');
      };

      if (typeof openGothicConfirmModal === 'function') {
        openGothicConfirmModal({
          icon: '🖼️',
          title: '¿Eliminar de la Galería?',
          message: `¿Estás seguro de que deseas eliminar ${label} de "${galleriesData[key].title}"?`,
          confirmText: '🗑️ Sí, Eliminar',
          onConfirm: executeRemoval
        });
      } else {
        executeRemoval();
      }
    }
    window.confirmDeleteGalleryPhoto = confirmDeleteGalleryPhoto;

    function deletePhotoFromAdmin(index) {
      confirmDeleteGalleryPhoto(index);
    }
    window.deletePhotoFromAdmin = deletePhotoFromAdmin;

    function moveGalleryOrder(direction) {
      const key = currentGalleryKey || selectedAdminGalleryKey;
      if (!key || !galleriesData[key]) return;
      const keys = (typeof getOrderedGalleryKeys === 'function') ? getOrderedGalleryKeys() : Object.keys(galleriesData);
      const currentIdx = keys.indexOf(key);

      if (currentIdx === -1) return;
      const targetIndex = currentIdx + direction;

      if (targetIndex < 0 || targetIndex >= keys.length) return;

      const [moved] = keys.splice(currentIdx, 1);
      keys.splice(targetIndex, 0, moved);

      window.galleryOrder = [...keys];
      fixedGalleryOrder = [...keys];

      const newGalleriesData = {};
      keys.forEach(k => {
        if (galleriesData[k]) newGalleriesData[k] = galleriesData[k];
      });
      galleriesData = newGalleriesData;
      window.galleriesData = galleriesData;

      currentGalleryKey = key;
      selectedAdminGalleryKey = key;

      populateAdminGallerySelect();
      renderGalleryTabs(true);

      if (typeof window.persistSiteDataInRealtime === 'function') {
        window.persistSiteDataInRealtime();
      }
      if (typeof showToastNotification === 'function') {
        const title = galleriesData[key]?.title || 'Galería';
        const msg = targetIndex === 0 ? `⭐ "${title}" es ahora la primera galería del sitio` : `"${title}" movida a la posición ${targetIndex + 1}`;
        showToastNotification(msg);
      }
    }
    window.moveGalleryOrder = moveGalleryOrder;

    function setAsFirstGallery(key) {
      const targetKey = key || currentGalleryKey || selectedAdminGalleryKey;
      if (!targetKey || !galleriesData[targetKey]) {
        showToastNotification('Por favor selecciona una galería para configurarla como primera.', true);
        return;
      }
      const keys = (typeof getOrderedGalleryKeys === 'function') ? getOrderedGalleryKeys() : Object.keys(galleriesData);
      const idx = keys.indexOf(targetKey);
      if (idx === -1) return;

      keys.splice(idx, 1);
      keys.unshift(targetKey);

      window.galleryOrder = [...keys];
      fixedGalleryOrder = [...keys];

      const newGalleriesData = {};
      keys.forEach(k => {
        if (galleriesData[k]) newGalleriesData[k] = galleriesData[k];
      });
      galleriesData = newGalleriesData;
      window.galleriesData = galleriesData;

      currentGalleryKey = targetKey;
      selectedAdminGalleryKey = targetKey;

      populateAdminGallerySelect();
      renderGalleryTabs(true);

      if (typeof window.persistSiteDataInRealtime === 'function') {
        window.persistSiteDataInRealtime();
      }
      if (typeof showToastNotification === 'function') {
        showToastNotification(`⭐ "${galleriesData[targetKey]?.title}" configurada como la primera galería del sitio`);
      }
    }
    window.setAsFirstGallery = setAsFirstGallery;

    function deleteCurrentGallery() {
      const key = currentGalleryKey || selectedAdminGalleryKey;
      if (!key || !galleriesData[key]) return;

      const title = galleriesData[key].title || 'esta galería';
      const executeGalleryDelete = () => {
        delete galleriesData[key];
        if (Array.isArray(window.galleryOrder)) {
          window.galleryOrder = window.galleryOrder.filter(k => k !== key);
        }
        if (Array.isArray(fixedGalleryOrder)) {
          fixedGalleryOrder = fixedGalleryOrder.filter(k => k !== key);
        }
        const remaining = getOrderedGalleryKeys();
        currentGalleryKey = remaining.length > 0 ? remaining[0] : '';
        selectedAdminGalleryKey = currentGalleryKey;
        persistGalleryLocalCache();
        populateAdminGallerySelect();
        renderGalleryTabs(false);
        showToastNotification(`🗑️ Galería "${title}" eliminada`);
      };

      if (typeof openGothicConfirmModal === 'function') {
        openGothicConfirmModal({
          icon: '🕯️',
          title: '¿Eliminar Galería?',
          message: `¿Estás seguro de que deseas eliminar completamente la galería "${title}" y todos sus elementos?`,
          confirmText: '🗑️ Sí, Eliminar Galería',
          onConfirm: executeGalleryDelete
        });
      } else {
        executeGalleryDelete();
      }
    }
    window.deleteCurrentGallery = deleteCurrentGallery;

    function populateAdminGallerySelect() {
      const select = document.getElementById('adminGallerySelect');
      if (!select) return;
      select.innerHTML = '';
      const keys = getOrderedGalleryKeys();
      keys.forEach(k => {
        const opt = document.createElement('option');
        opt.value = k;
        opt.textContent = galleriesData[k]?.title || k;
        if (k === currentGalleryKey) opt.selected = true;
        select.appendChild(opt);
      });
    }
    function loadGalleryToAdmin(key) {
      if (key && galleriesData[key]) {
        currentGalleryKey = key;
        selectedAdminGalleryKey = key;
        renderGalleryTabs(false);
      }
    }
    function saveGalleryChanges() {
      persistGalleryLocalCache();
      renderGalleryTabs(true);
      if (typeof window.persistSiteDataInRealtime === 'function') {
        window.persistSiteDataInRealtime();
      }
    }

    function closeAdminPanel() {
      document.querySelectorAll('.admin-section').forEach(sec => sec.removeAttribute('open'));
      const adminModal = document.getElementById('adminModal');
      if (adminModal) {
        adminModal.style.display = 'none';
      }
    }

    function closeAdminModal() {
      closeAdminPanel();
    }

    function toggleEditPostPanel() {
      const panel = document.getElementById('editPostPanel');
      if (!panel) return;
      panel.style.display = (panel.style.display === 'none' || !panel.style.display) ? 'block' : 'none';
      if (panel.style.display === 'block' && typeof window.populateEditPostSelect === 'function') {
        window.populateEditPostSelect();
      }
    }

    /* FUNCIONES UNIFICADAS DE PUBLICACIÓN Y EDICIÓN EN MODAL */
    let currentSelectedPostVal = '0';

    function renderAdminPostsList() {
      const list = document.getElementById('adminPostsList');
      if (!list) return;
      list.innerHTML = '';

      postsData = deduplicatePosts(Array.isArray(window.postsData) ? window.postsData : postsData);
      window.postsData = postsData;

      if (!postsData || postsData.length === 0) {
        list.innerHTML = '<p style="color: var(--text-muted); font-size: 0.82rem; font-style: italic; margin: 4px 0;">No hay publicaciones creadas.</p>';
        return;
      }

      postsData.forEach((post, index) => {
        const item = document.createElement('div');
        const isHidden = !!post.hidden;
        item.style.cssText = `
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 10px;
          padding: 8px 12px;
          background: rgba(10, 12, 18, 0.7);
          border: 1px solid rgba(90, 116, 191, 0.3);
          border-radius: 6px;
          flex-wrap: wrap;
        `;

        const titleDiv = document.createElement('div');
        titleDiv.style.cssText = 'overflow: hidden; text-overflow: ellipsis; white-space: nowrap; flex: 1; min-width: 180px; font-size: 0.88rem;';
        titleDiv.innerHTML = `<span style="font-weight: bold; color: var(--accent-light);">#${index + 1}: ${escapeHtmlAttr(post.title || 'Sin Título')}</span> <span style="font-size: 0.78rem; color: var(--text-muted);">(${post.date || ''}) ${isHidden ? '<span style="color: #ff6666; font-weight: bold;">[Oculto]</span>' : ''}</span>`;

        const actionsDiv = document.createElement('div');
        actionsDiv.style.cssText = 'display: flex; gap: 6px; align-items: center; flex-wrap: wrap;';

        const editBtn = document.createElement('button');
        editBtn.type = 'button';
        editBtn.className = 'admin-btn';
        editBtn.style.cssText = 'padding: 5px 12px; font-size: 0.82rem; background: var(--accent-blue); color: #fff; border: none; border-radius: 4px; cursor: pointer; font-weight: bold;';
        editBtn.innerHTML = '✏️ Editar';
        editBtn.onclick = (e) => {
          if (e && e.stopPropagation) e.stopPropagation();
          openBlogModal(index);
        };

        const toggleBtn = document.createElement('button');
        toggleBtn.type = 'button';
        toggleBtn.className = 'admin-btn';
        toggleBtn.style.cssText = `padding: 5px 10px; font-size: 0.82rem; background: ${isHidden ? 'rgba(90,116,191,0.3)' : 'rgba(200,150,50,0.3)'}; color: ${isHidden ? 'var(--accent-light)' : '#ffd280'}; border: 1px solid ${isHidden ? 'var(--accent-blue)' : '#cca333'}; border-radius: 4px; cursor: pointer;`;
        toggleBtn.innerHTML = isHidden ? '👁️ Mostrar' : '👁️‍🗨️ Ocultar';
        toggleBtn.onclick = (e) => {
          if (e && e.stopPropagation) e.stopPropagation();
          toggleModalPostVisibility(index, e);
        };

        const deleteBtn = document.createElement('button');
        deleteBtn.type = 'button';
        deleteBtn.className = 'admin-btn btn-delete-post';
        deleteBtn.style.cssText = 'padding: 5px 10px; font-size: 0.82rem; border-radius: 4px; cursor: pointer;';
        deleteBtn.innerHTML = '🗑️ Eliminar';
        deleteBtn.onclick = (e) => {
          if (e && e.stopPropagation) e.stopPropagation();
          deleteModalPost(index);
        };

        actionsDiv.appendChild(editBtn);
        actionsDiv.appendChild(toggleBtn);
        actionsDiv.appendChild(deleteBtn);

        item.appendChild(titleDiv);
        item.appendChild(actionsDiv);
        list.appendChild(item);
      });
    }

    function editPostFromCard(index) {
      openBlogModal(index);
    }
    window.editPostFromCard = editPostFromCard;

    function createNewBlogInModal() {
      if (document.getElementById('blogReadModal')?.style.display === 'flex') {
        syncLiveBlogModalToMemory(true);
      }
      const nowIso = new Date().toISOString();
      const todayIso = nowIso.split('T')[0];
      const uniqueId = 'post_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6);
      const newPost = {
        id: uniqueId,
        title: '',
        dateIso: todayIso,
        date: formatIsoToSpanishDate(todayIso),
        image: '',
        imageCaption: '',
        imageFit: 'cover-center',
        imageAura: '',
        hidden: false,
        preview: '',
        content: '',
        createdAt: nowIso,
        updatedAt: nowIso
      };
      unmarkPostDeleted(newPost);
      postsData.unshift(newPost);
      window.postsData = postsData;
      markPostsPendingCloudSync([newPost]);
      persistPostsToLocalVaults();
      currentBlogPage = 0;
      renderBlogPosts();
      renderAdminPostsList();
      if (typeof populatePostSelect === 'function') populatePostSelect();
      openBlogModal(0);
    }
    window.createNewBlogInModal = createNewBlogInModal;

    function normalizeCssColorToHex(colorStr) {
      if (!colorStr) return '';
      const trimmed = String(colorStr).trim();
      if (trimmed.startsWith('#')) return trimmed;
      const rgbMatch = trimmed.match(/^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i);
      if (rgbMatch) {
        const r = parseInt(rgbMatch[1], 10).toString(16).padStart(2, '0');
        const g = parseInt(rgbMatch[2], 10).toString(16).padStart(2, '0');
        const b = parseInt(rgbMatch[3], 10).toString(16).padStart(2, '0');
        return `#${r}${g}${b}`.toUpperCase();
      }
      return trimmed;
    }

    function serializeFigureElementToTag(figEl) {
      if (!figEl) return '';
      const imgEl = figEl.tagName === 'IMG' ? figEl : figEl.querySelector('img');
      const url = (figEl.getAttribute('data-img-url') || (imgEl ? imgEl.getAttribute('src') : '') || '').trim();
      if (!url) return '';
      const captionEl = figEl.tagName === 'IMG' ? null : figEl.querySelector('figcaption');
      const caption = captionEl ? (captionEl.innerText || '').replace(/\r?\n/g, ' ').trim() : '';
      const aura = (figEl.getAttribute('data-aura') || (imgEl ? imgEl.getAttribute('data-aura') : '') || '').trim();

      if (aura) {
        return `[img:${url} | ${caption} | ${aura}]`;
      }
      if (caption) {
        return `[img:${url} | ${caption}]`;
      }
      return `[img:${url}|]`;
    }

    function serializeInlineDomNodes(parentNode) {
      let out = '';
      if (!parentNode || !parentNode.childNodes) return out;

      parentNode.childNodes.forEach(node => {
        if (node.nodeType === 3) { // TEXT_NODE
          out += (node.nodeValue || '').replace(/\u00A0/g, ' ');
          return;
        }
        if (node.nodeType !== 1) return; // ELEMENT_NODE only

        const el = node;
        const tag = el.tagName.toUpperCase();

        if (el.classList && el.classList.contains('figure-floating-actions')) return;

        if (tag === 'BR') {
          out += '\n';
          return;
        }

        if (tag === 'FIGURE' || (tag === 'IMG' && el.classList.contains('inline-img'))) {
          const figTag = serializeFigureElementToTag(el);
          if (figTag) out += `\n\n${figTag}\n\n`;
          return;
        }

        if (tag === 'STRONG' || tag === 'B') {
          const inner = serializeInlineDomNodes(el);
          if (!inner.trim()) {
            out += inner;
          } else {
            const lead = (inner.match(/^\s*/) || [''])[0];
            const trail = (inner.match(/\s*$/) || [''])[0];
            out += `${lead}**${inner.trim()}**${trail}`;
          }
          return;
        }

        if (tag === 'A') {
          const href = (el.getAttribute('href') || '').trim();
          const inner = serializeInlineDomNodes(el).replace(/\r?\n/g, ' ').trim();
          if (href) {
            out += `[${inner || href}](${href})`;
          } else {
            out += inner;
          }
          return;
        }

        if (tag === 'SPAN' || tag === 'FONT') {
          const isCenter = el.getAttribute('data-blutu-center') === 'true' || (el.style && el.style.textAlign === 'center');
          const rawColor = el.getAttribute('data-blutu-color') || (el.style && el.style.color ? el.style.color : '') || el.getAttribute('color') || '';
          const inner = serializeInlineDomNodes(el);
          if (!inner) return;

          let res = inner;
          if (rawColor) {
            const hex = normalizeCssColorToHex(rawColor);
            if (hex) res = `[color:${hex}|${res}]`;
          }
          if (isCenter) {
            res = `[center]${res}[/center]`;
          }
          out += res;
          return;
        }

        out += serializeInlineDomNodes(el);
      });

      return out;
    }

    function serializeEditableBlogBodyToContent(containerEl) {
      if (!containerEl) return '';
      const blocks = [];

      const flushBlockText = (rawStr, isSubtitle, isCentered) => {
        // Eliminar el único salto final que contenteditable suele colocar con <br> al final del párrafo
        let cleaned = String(rawStr || '').replace(/\n$/, '');
        if (!cleaned.trim()) return;

        // Si el bloque contenía [img:...] incrustados, separarlos limpiamente
        const parts = cleaned.split(/(\[img:\s*[^\]]+\])/gi);
        parts.forEach(part => {
          const seg = part.replace(/^\n+|\n+$/g, '');
          if (!seg.trim()) return;
          if (/^\[img:\s*[^\]]+\]$/i.test(seg.trim())) {
            blocks.push(seg.trim());
            return;
          }
          if (isSubtitle) {
            const subLine = seg.replace(/\r?\n/g, ' ').trim();
            if (!subLine) return;
            blocks.push(isCentered ? `# [center]${subLine}[/center]` : `# ${subLine}`);
          } else {
            blocks.push(isCentered ? `[center]${seg}[/center]` : seg);
          }
        });
      };

      let inlineBuffer = '';
      const flushInlineBuffer = () => {
        if (inlineBuffer.trim()) {
          flushBlockText(inlineBuffer, false, false);
        }
        inlineBuffer = '';
      };

      Array.from(containerEl.childNodes).forEach(node => {
        if (node.nodeType === 3) {
          inlineBuffer += (node.nodeValue || '').replace(/\u00A0/g, ' ');
          return;
        }
        if (node.nodeType !== 1) return;

        const el = node;
        const tag = el.tagName.toUpperCase();

        if (tag === 'FIGURE' || (tag === 'IMG' && el.classList.contains('inline-img'))) {
          flushInlineBuffer();
          const figTag = serializeFigureElementToTag(el);
          if (figTag) blocks.push(figTag);
          return;
        }

        if (tag === 'P' || tag === 'DIV' || tag === 'H2' || tag === 'H1' || tag === 'H3' || tag === 'BLOCKQUOTE') {
          flushInlineBuffer();
          const isSubtitle = (tag === 'H2' || tag === 'H1' || tag === 'H3');
          const isCentered = el.getAttribute('data-blutu-center') === 'true' || (el.style && el.style.textAlign === 'center');
          const serializedInner = serializeInlineDomNodes(el);
          flushBlockText(serializedInner, isSubtitle, isCentered);
          return;
        }

        if (tag === 'BR') {
          inlineBuffer += '\n';
          return;
        }

        inlineBuffer += serializeInlineDomNodes({ childNodes: [el] });
      });

      flushInlineBuffer();
      return blocks.join('\n\n');
    }
    window.serializeEditableBlogBodyToContent = serializeEditableBlogBodyToContent;

    let pendingPostsVaultTimer = null;
    let pendingLiveBlogDomSyncTimer = null;

    function persistPostsToLocalVaults() {
      if (pendingPostsVaultTimer) {
        clearTimeout(pendingPostsVaultTimer);
        pendingPostsVaultTimer = null;
      }
      window.postsData = postsData;
      try {
        localStorage.setItem('blutu_permanent_posts_vault', JSON.stringify(postsData));
        const cachedRaw = localStorage.getItem('blutu_live_site_data');
        const cached = cachedRaw ? JSON.parse(cachedRaw) : {};
        cached.posts = postsData;
        cached.updatedAt = Date.now();
        localStorage.setItem('blutu_live_site_data', JSON.stringify(cached));
      } catch (e) {}
      if (typeof BlutuVault !== 'undefined' && BlutuVault.savePosts) {
        BlutuVault.savePosts(postsData);
      }
    }

    function schedulePersistPostsToLocalVaults() {
      window.postsData = postsData;
      if (pendingPostsVaultTimer) clearTimeout(pendingPostsVaultTimer);
      pendingPostsVaultTimer = setTimeout(() => {
        pendingPostsVaultTimer = null;
        persistPostsToLocalVaults();
      }, 850);
    }

    function scheduleLiveBlogModalSync() {
      if (pendingLiveBlogDomSyncTimer) clearTimeout(pendingLiveBlogDomSyncTimer);
      pendingLiveBlogDomSyncTimer = setTimeout(() => {
        pendingLiveBlogDomSyncTimer = null;
        syncLiveBlogModalToMemory(false);
      }, 420);
    }
    window.scheduleLiveBlogModalSync = scheduleLiveBlogModalSync;

    function syncLiveBlogModalToMemory(persistLocal = false) {
      if (pendingLiveBlogDomSyncTimer) {
        clearTimeout(pendingLiveBlogDomSyncTimer);
        pendingLiveBlogDomSyncTimer = null;
      }
      const post = getActiveEditableBlogPost();
      if (!post) return false;
      const modal = document.getElementById('blogReadModal');
      if (!modal || modal.style.display === 'none') return false;

      const titleEl = document.getElementById('blogLiveTitle');
      const bodyEl = document.getElementById('blogEditableBody');
      if (!titleEl || !bodyEl) return false;

      const isGameBlog = Boolean(currentGameBlogKey && gamesData && gamesData.blogs && gamesData.blogs[currentGameBlogKey]);
      if (!post.id) post.id = isGameBlog ? ('game_' + currentGameBlogKey) : ('post_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6));

      const rawTitle = (titleEl.innerText || '').replace(/\r?\n/g, ' ').trim();
      post.title = persistLocal ? (rawTitle || 'Sin Título') : rawTitle;

      const dateIsoInput = document.getElementById('blogLiveDateIso');
      if (dateIsoInput && dateIsoInput.value) {
        post.dateIso = dateIsoInput.value;
        post.date = formatIsoToSpanishDate(post.dateIso);
      } else if (!post.dateIso) {
        post.dateIso = new Date().toISOString().split('T')[0];
        post.date = formatIsoToSpanishDate(post.dateIso);
      }

      const mainCaptionEl = document.getElementById('blogLiveMainCaption');
      if (mainCaptionEl) {
        post.imageCaption = (mainCaptionEl.innerText || '').replace(/\r?\n/g, ' ').trim();
      }

      const serializedContent = serializeEditableBlogBodyToContent(bodyEl);
      post.content = serializedContent;
      post.updatedAt = new Date().toISOString();

      bodyEl.setAttribute('data-is-empty', serializedContent.trim() ? 'false' : 'true');

      if (isGameBlog) {
        window.gamesData = gamesData;
        if (persistLocal) {
          persistGamesLocalCache();
          renderGamesSection();
        } else {
          schedulePersistGamesLocalCache();
        }
      } else {
        window.postsData = postsData;
        unmarkPostDeleted(post);
        markPostsPendingCloudSync([post], { immediate: Boolean(persistLocal) });
        if (persistLocal) {
          persistPostsToLocalVaults();
        } else {
          schedulePersistPostsToLocalVaults();
        }
      }
      return true;
    }
    window.syncLiveBlogModalToMemory = syncLiveBlogModalToMemory;

    function finishInlineBlogEdit() {
      const idx = currentBlogIndex;
      const gKey = currentGameBlogKey;
      syncLiveBlogModalToMemory(true);
      if (gKey && gamesData && gamesData.blogs && gamesData.blogs[gKey]) {
        renderGamesSection();
        persistGamesLocalCache();
        closeBlogModal(true);
        if (typeof window.persistSiteDataInRealtime === 'function') {
          window.persistSiteDataInRealtime(false, {
            allowAuthPopup: true,
            customSuccessToast: '✨ Blog de juego guardado permanentemente'
          });
        }
        return;
      }
      renderBlogPosts();
      renderAdminPostsList();
      if (typeof populatePostSelect === 'function') populatePostSelect();
      closeBlogModal(true);
      if (idx !== null && postsData[idx]) {
        if (typeof window.persistSiteDataInRealtime === 'function') {
          window.persistSiteDataInRealtime(false, {
            allowAuthPopup: true,
            customSuccessToast: '✨ Publicación guardada permanentemente en la nube'
          });
        } else if (typeof window.persistSingleBlogPostToCloud === 'function') {
          window.persistSingleBlogPostToCloud(postsData[idx]);
        }
      }
    }
    window.finishInlineBlogEdit = finishInlineBlogEdit;
    window.saveModalPost = finishInlineBlogEdit;

    function handlePlainTextPaste(e) {
      if (!e || !e.clipboardData) return;
      e.preventDefault();
      const text = (e.clipboardData.getData('text/plain') || '').replace(/\r?\n/g, ' ');
      document.execCommand('insertText', false, text);
    }
    window.handlePlainTextPaste = handlePlainTextPaste;

    function handleLiveBlogTitleKeydown(e) {
      if (e.key === 'Enter') {
        e.preventDefault();
        const bodyEl = document.getElementById('blogEditableBody');
        if (bodyEl) {
          bodyEl.focus();
          const firstP = bodyEl.querySelector('p, h2');
          if (firstP && window.getSelection) {
            const range = document.createRange();
            range.selectNodeContents(firstP);
            range.collapse(true);
            const sel = window.getSelection();
            sel.removeAllRanges();
            sel.addRange(range);
          }
        }
      }
    }
    window.handleLiveBlogTitleKeydown = handleLiveBlogTitleKeydown;

    function handleLiveBlogDateChange(newIso) {
      const post = getActiveEditableBlogPost();
      if (!newIso || !post) return;
      post.dateIso = newIso;
      post.date = formatIsoToSpanishDate(newIso);
      post.updatedAt = new Date().toISOString();
      const dateTextEl = document.getElementById('blogLiveDateText');
      if (dateTextEl) dateTextEl.textContent = post.date;
      if (currentGameBlogKey && gamesData && gamesData.blogs && gamesData.blogs[currentGameBlogKey]) {
        persistGamesLocalCache();
        renderGamesSection();
      } else {
        persistPostsToLocalVaults();
      }
    }
    window.handleLiveBlogDateChange = handleLiveBlogDateChange;

    function handleCardInlineTitleInput(postIndex, el) {
      if (!postsData[postIndex] || !el) return;
      postsData[postIndex].title = (el.innerText || '').replace(/\u2011/g, '-').replace(/\r?\n/g, ' ').trim();
      postsData[postIndex].updatedAt = new Date().toISOString();
      markPostsPendingCloudSync([postsData[postIndex]]);
      schedulePersistPostsToLocalVaults();
    }
    window.handleCardInlineTitleInput = handleCardInlineTitleInput;

    function handleCardInlineDateChange(postIndex, newIso) {
      if (!postsData[postIndex] || !newIso) return;
      postsData[postIndex].dateIso = newIso;
      postsData[postIndex].date = formatIsoToSpanishDate(newIso);
      postsData[postIndex].updatedAt = new Date().toISOString();
      markPostsPendingCloudSync([postsData[postIndex]], { immediate: true });
      persistPostsToLocalVaults();
      renderBlogPosts();
      renderAdminPostsList();
    }
    window.handleCardInlineDateChange = handleCardInlineDateChange;

    function handleCardInlinePreviewInput(postIndex, el) {
      if (!postsData[postIndex] || !el) return;
      const val = (el.innerText || '').replace(/\r?\n/g, ' ').trim();
      const autoVal = computeAutoPostPreview(postsData[postIndex].content || '');
      postsData[postIndex].preview = (val === autoVal) ? '' : val;
      postsData[postIndex].updatedAt = new Date().toISOString();
      markPostsPendingCloudSync([postsData[postIndex]]);
      schedulePersistPostsToLocalVaults();
    }
    window.handleCardInlinePreviewInput = handleCardInlinePreviewInput;

    function handleCardInlinePreviewBlur(postIndex, el) {
      if (!postsData[postIndex] || !el) return;
      const val = (el.innerText || '').replace(/\r?\n/g, ' ').trim();
      if (!val) {
        postsData[postIndex].preview = '';
        el.textContent = computeAutoPostPreview(postsData[postIndex].content || '');
      }
      persistPostsToLocalVaults();
    }
    window.handleCardInlinePreviewBlur = handleCardInlinePreviewBlur;

    /* RECORTE INTERACTIVO DE MINIATURA CON FORMA SIMULADA IDÉNTICA A LA VISTA DEL USUARIO */
    const THUMB_FRAME_ASPECT = 3 / 2;
    let pendingModalCoverImageFit = 'cover-center';
    let pendingModalCoverOriginalUrl = '';
    let thumbCropEventsInitialized = false;
    const thumbCropState = {
      targetMode: 'post', // 'post' | 'modal-cover' | 'game'
      postIndex: null,
      gameKey: null,
      pushedOwnHistory: false,
      axis: 'w',
      natW: 1200,
      natH: 1000,
      fitZoom: 0.75,
      minZ: 0.65,
      maxZ: 4.0,
      z: 1.0,
      x: 0.0,
      y: 0.0,
      isDragging: false,
      isPinching: false,
      dragStartClientX: 0,
      dragStartClientY: 0,
      dragStartOffsetPxX: 0,
      dragStartOffsetPxY: 0,
      pinchStartDist: 1,
      pinchStartZ: 1,
      pinchStartMidX: 0,
      pinchStartMidY: 0,
      pinchStartOffsetPxX: 0,
      pinchStartOffsetPxY: 0,
      lastTapTime: 0
    };

    function computeExactUserBlogThumbSize() {
      let realW = 0;
      let realH = 0;
      const frames = document.querySelectorAll('#blogSliderTrack .blog-thumb-frame');
      for (let i = 0; i < frames.length; i++) {
        const r = frames[i].getBoundingClientRect();
        if (r && r.width > 30 && r.height > 30) {
          realW = r.width;
          realH = r.height;
          break;
        }
      }
      if (!(realW > 30 && realH > 30)) {
        const articles = document.querySelectorAll('#blogSliderTrack .blog-article');
        for (let i = 0; i < articles.length; i++) {
          const r = articles[i].getBoundingClientRect();
          if (r && r.width > 60 && r.height > 30) {
            realW = r.width * 0.52;
            realH = r.height;
            break;
          }
        }
      }
      if (!(realW > 30 && realH > 30)) {
        const wrapper = document.getElementById('blogSliderWrapper');
        const blogSec = document.getElementById('blogSection');
        const tombstone = document.getElementById('masterTombstone');
        let cardW = (wrapper && wrapper.clientWidth > 80) ? (wrapper.clientWidth - 3) : 0;
        if (!(cardW > 80) && blogSec && blogSec.clientWidth > 80) {
          cardW = blogSec.clientWidth - 3;
        }
        if (!(cardW > 80) && tombstone && tombstone.clientWidth > 80) {
          const cs = window.getComputedStyle(tombstone);
          const padX = (parseFloat(cs.paddingLeft) || 0) + (parseFloat(cs.paddingRight) || 0);
          cardW = Math.max(120, tombstone.clientWidth - padX - 3);
        }
        if (!(cardW > 80)) {
          const vw = window.innerWidth || 390;
          cardW = vw >= 850 ? 757 : Math.max(220, vw - 64);
        }
        const vw = window.innerWidth || 390;
        realW = cardW * 0.52;
        realH = vw >= 850 ? 162 : (vw <= 550 ? 118 : 140);
      }
      return { width: Math.round(realW), height: Math.round(realH) };
    }

    function syncThumbCropViewportToUserPreviewSize() {
      const vp = document.getElementById('thumbCropViewport');
      const stage = document.getElementById('thumbCropStage');
      if (!vp) return;
      const stageW = (stage && stage.clientWidth > 60) ? (stage.clientWidth - 20) : Math.max(180, (window.innerWidth || 390) - 72);
      const stageH = (stage && stage.clientHeight > 60) ? (stage.clientHeight - 20) : 204;

      if (thumbCropState.targetMode === 'memorama-pair') {
        const side = Math.max(110, Math.min(200, stageW, stageH));
        vp.style.aspectRatio = '1 / 1';
        vp.style.width = `${Math.round(side)}px`;
        vp.style.height = `${Math.round(side)}px`;
        return;
      }

      const target = computeExactUserBlogThumbSize();
      let w = target.width;
      let h = target.height;
      const scale = Math.min(1, stageW / Math.max(1, w), stageH / Math.max(1, h));
      w = Math.max(80, Math.round(w * scale));
      h = Math.max(60, Math.round(h * scale));
      vp.style.aspectRatio = 'auto';
      vp.style.width = `${w}px`;
      vp.style.height = `${h}px`;
    }

    function getThumbCropViewportMetrics() {
      const vp = document.getElementById('thumbCropViewport');
      const rect = vp ? vp.getBoundingClientRect() : null;
      const wf = (rect && rect.width > 10) ? rect.width : 228;
      const hf = (rect && rect.height > 10) ? rect.height : (wf / THUMB_FRAME_ASPECT);
      const frameAspect = hf > 0 ? (wf / hf) : THUMB_FRAME_ASPECT;
      const imgRatio = (thumbCropState.natW > 0 && thumbCropState.natH > 0)
        ? (thumbCropState.natW / thumbCropState.natH)
        : frameAspect;
      const axis = imgRatio >= frameAspect ? 'h' : 'w';
      const wi = axis === 'w' ? wf : (hf * imgRatio);
      const hi = axis === 'h' ? hf : (wf / imgRatio);
      return { wf, hf, wi, hi, axis, rect };
    }

    function clampThumbCropPosition() {
      const { wf, hf, wi, hi, axis } = getThumbCropViewportMetrics();
      thumbCropState.axis = axis;
      thumbCropState.z = Math.max(thumbCropState.minZ, Math.min(thumbCropState.maxZ, thumbCropState.z));

      const visW = wi * thumbCropState.z;
      const visH = hi * thumbCropState.z;

      const maxPxX = visW > wf ? (visW - wf) / 2 : 0;
      const maxPxY = visH > hf ? (visH - hf) / 2 : 0;

      const maxPctX = wi > 0 ? (maxPxX / wi) * 100 : 0;
      const maxPctY = hi > 0 ? (maxPxY / hi) * 100 : 0;

      thumbCropState.x = Math.max(-maxPctX, Math.min(maxPctX, thumbCropState.x));
      thumbCropState.y = Math.max(-maxPctY, Math.min(maxPctY, thumbCropState.y));
    }

    function renderThumbCropPreview() {
      const imgEl = document.getElementById('thumbCropImg');
      const sliderEl = document.getElementById('thumbCropZoomSlider');
      const labelEl = document.getElementById('thumbCropZoomLabel');
      if (!imgEl) return;

      clampThumbCropPosition();

      if (thumbCropState.axis === 'h') {
        imgEl.style.width = 'auto';
        imgEl.style.height = '100%';
      } else {
        imgEl.style.width = '100%';
        imgEl.style.height = 'auto';
      }

      imgEl.style.transform = `translate3d(calc(-50% + ${thumbCropState.x.toFixed(2)}%), calc(-50% + ${thumbCropState.y.toFixed(2)}%), 0) scale(${thumbCropState.z.toFixed(3)})`;

      if (sliderEl) {
        sliderEl.min = String(thumbCropState.minZ.toFixed(2));
        sliderEl.max = String(thumbCropState.maxZ.toFixed(2));
        sliderEl.value = String(thumbCropState.z);
      }
      if (labelEl) {
        labelEl.textContent = `${Math.round(thumbCropState.z * 100)}%`;
      }
    }

    function applyInitialFitToThumbCropState(fitStr) {
      const { wf, hf, wi, hi, axis } = getThumbCropViewportMetrics();
      thumbCropState.axis = axis;
      const fitZoom = axis === 'w' ? (hf / hi) : (wf / wi);
      thumbCropState.fitZoom = Math.min(1, Math.max(0.25, fitZoom));
      thumbCropState.minZ = Math.min(0.75, thumbCropState.fitZoom);
      thumbCropState.maxZ = 4.0;

      const parsed = parsePostImageCrop(fitStr || 'cover-center');
      if (parsed.isCrop) {
        thumbCropState.z = parsed.z;
        thumbCropState.x = parsed.axis === axis ? parsed.x : 0;
        thumbCropState.y = parsed.axis === axis ? parsed.y : 0;
      } else if (parsed.mode === 'contain') {
        thumbCropState.z = thumbCropState.fitZoom;
        thumbCropState.x = 0;
        thumbCropState.y = 0;
      } else if (parsed.mode === 'cover-top') {
        thumbCropState.z = 1.0;
        thumbCropState.x = 0;
        thumbCropState.y = hi > hf ? (50 * (1 - hf / hi)) : 0;
      } else if (parsed.mode === 'cover-bottom') {
        thumbCropState.z = 1.0;
        thumbCropState.x = 0;
        thumbCropState.y = hi > hf ? (-50 * (1 - hf / hi)) : 0;
      } else {
        thumbCropState.z = 1.0;
        thumbCropState.x = 0;
        thumbCropState.y = 0;
      }

      renderThumbCropPreview();
    }

    function serializeThumbCropState() {
      clampThumbCropPosition();
      const zStr = Number(thumbCropState.z.toFixed(2));
      const xStr = Number(thumbCropState.x.toFixed(1));
      const yStr = Number(thumbCropState.y.toFixed(1));
      return `crop:${thumbCropState.axis},${zStr},${xStr},${yStr}`.slice(0, 50);
    }

    function ensureThumbCropGestureListeners() {
      if (thumbCropEventsInitialized) return;
      const stage = document.getElementById('thumbCropStage');
      if (!stage) return;
      thumbCropEventsInitialized = true;

      const setInteracting = (active) => {
        stage.classList.toggle('is-interacting', Boolean(active));
      };

      const beginSingleDrag = (clientX, clientY) => {
        const { wi, hi } = getThumbCropViewportMetrics();
        thumbCropState.isDragging = true;
        thumbCropState.isPinching = false;
        thumbCropState.dragStartClientX = clientX;
        thumbCropState.dragStartClientY = clientY;
        thumbCropState.dragStartOffsetPxX = (thumbCropState.x / 100) * wi;
        thumbCropState.dragStartOffsetPxY = (thumbCropState.y / 100) * hi;
        setInteracting(true);
      };

      const moveSingleDrag = (clientX, clientY) => {
        if (!thumbCropState.isDragging) return;
        const { wi, hi } = getThumbCropViewportMetrics();
        const dx = clientX - thumbCropState.dragStartClientX;
        const dy = clientY - thumbCropState.dragStartClientY;
        thumbCropState.x = wi > 0 ? ((thumbCropState.dragStartOffsetPxX + dx) / wi) * 100 : 0;
        thumbCropState.y = hi > 0 ? ((thumbCropState.dragStartOffsetPxY + dy) / hi) * 100 : 0;
        renderThumbCropPreview();
      };

      stage.addEventListener('touchstart', (e) => {
        if (e.cancelable) e.preventDefault();
        if (e.touches.length >= 2) {
          const t1 = e.touches[0];
          const t2 = e.touches[1];
          const dist = Math.hypot(t2.clientX - t1.clientX, t2.clientY - t1.clientY) || 1;
          const { wi, hi } = getThumbCropViewportMetrics();
          thumbCropState.isPinching = true;
          thumbCropState.isDragging = false;
          thumbCropState.pinchStartDist = dist;
          thumbCropState.pinchStartZ = thumbCropState.z;
          thumbCropState.pinchStartMidX = (t1.clientX + t2.clientX) / 2;
          thumbCropState.pinchStartMidY = (t1.clientY + t2.clientY) / 2;
          thumbCropState.pinchStartOffsetPxX = (thumbCropState.x / 100) * wi;
          thumbCropState.pinchStartOffsetPxY = (thumbCropState.y / 100) * hi;
          setInteracting(true);
        } else if (e.touches.length === 1) {
          const now = Date.now();
          if (now - thumbCropState.lastTapTime < 280) {
            thumbCropState.z = Math.abs(thumbCropState.z - 1.0) < 0.08 ? 1.85 : 1.0;
            if (thumbCropState.z === 1.0) {
              thumbCropState.x = 0;
              thumbCropState.y = 0;
            }
            renderThumbCropPreview();
            thumbCropState.lastTapTime = 0;
            return;
          }
          thumbCropState.lastTapTime = now;
          beginSingleDrag(e.touches[0].clientX, e.touches[0].clientY);
        }
      }, { passive: false });

      stage.addEventListener('touchmove', (e) => {
        if (e.cancelable) e.preventDefault();
        if (e.touches.length >= 2 && thumbCropState.isPinching) {
          const t1 = e.touches[0];
          const t2 = e.touches[1];
          const dist = Math.hypot(t2.clientX - t1.clientX, t2.clientY - t1.clientY) || 1;
          const scaleFactor = dist / thumbCropState.pinchStartDist;
          const nextZ = Math.max(thumbCropState.minZ, Math.min(thumbCropState.maxZ, thumbCropState.pinchStartZ * scaleFactor));
          const effRatio = nextZ / (thumbCropState.pinchStartZ || 1);

          const { wi, hi, rect } = getThumbCropViewportMetrics();
          const vpCenterX = rect ? (rect.left + rect.width / 2) : thumbCropState.pinchStartMidX;
          const vpCenterY = rect ? (rect.top + rect.height / 2) : thumbCropState.pinchStartMidY;

          const curMidX = (t1.clientX + t2.clientX) / 2;
          const curMidY = (t1.clientY + t2.clientY) / 2;
          const startRelX = thumbCropState.pinchStartMidX - vpCenterX;
          const startRelY = thumbCropState.pinchStartMidY - vpCenterY;
          const curRelX = curMidX - vpCenterX;
          const curRelY = curMidY - vpCenterY;

          const nextOffsetPxX = curRelX - (startRelX - thumbCropState.pinchStartOffsetPxX) * effRatio;
          const nextOffsetPxY = curRelY - (startRelY - thumbCropState.pinchStartOffsetPxY) * effRatio;

          thumbCropState.z = nextZ;
          thumbCropState.x = wi > 0 ? (nextOffsetPxX / wi) * 100 : 0;
          thumbCropState.y = hi > 0 ? (nextOffsetPxY / hi) * 100 : 0;
          renderThumbCropPreview();
        } else if (e.touches.length === 1) {
          if (thumbCropState.isPinching) {
            beginSingleDrag(e.touches[0].clientX, e.touches[0].clientY);
          } else {
            moveSingleDrag(e.touches[0].clientX, e.touches[0].clientY);
          }
        }
      }, { passive: false });

      const finishTouch = (e) => {
        if (e.touches && e.touches.length === 1) {
          beginSingleDrag(e.touches[0].clientX, e.touches[0].clientY);
        } else {
          thumbCropState.isDragging = false;
          thumbCropState.isPinching = false;
          setInteracting(false);
        }
      };

      stage.addEventListener('touchend', finishTouch, { passive: true });
      stage.addEventListener('touchcancel', finishTouch, { passive: true });

      stage.addEventListener('mousedown', (e) => {
        if (e.button !== 0) return;
        e.preventDefault();
        beginSingleDrag(e.clientX, e.clientY);
      });

      window.addEventListener('mousemove', (e) => {
        if (!thumbCropState.isDragging || thumbCropState.isPinching) return;
        moveSingleDrag(e.clientX, e.clientY);
      }, { passive: true });

      window.addEventListener('mouseup', () => {
        if (thumbCropState.isDragging) {
          thumbCropState.isDragging = false;
          setInteracting(false);
        }
      }, { passive: true });

      stage.addEventListener('wheel', (e) => {
        if (e.cancelable) e.preventDefault();
        const delta = e.deltaY < 0 ? 0.12 : -0.12;
        stepBlogThumbCropZoom(delta);
      }, { passive: false });
    }

    function openBlogThumbCropModal(targetIndexOrMode) {
      if (!window.__adminModalsMounted) { ensureAdminModalsReady().then(() => openBlogThumbCropModal(targetIndexOrMode)); return; }
      let imgUrl = '';
      let initialFit = 'cover-center';

      if (targetIndexOrMode === 'modal-cover') {
        imgUrl = (document.getElementById('modalImgUrl')?.value || '').trim();
        if (!imgUrl) {
          showToastNotification('Primero ingresa la URL de la imagen de portada.', true);
          return;
        }
        thumbCropState.targetMode = 'modal-cover';
        thumbCropState.postIndex = currentBlogIndex;
        thumbCropState.gameKey = currentGameBlogKey || null;
        initialFit = (imgUrl === pendingModalCoverOriginalUrl) ? (pendingModalCoverImageFit || 'cover-center') : (pendingModalCoverImageFit.startsWith('crop:') ? pendingModalCoverImageFit : 'cover-center');
      } else if (typeof targetIndexOrMode === 'string' && targetIndexOrMode.startsWith('memorama-pair:')) {
        const slotIdx = parseInt(targetIndexOrMode.slice(14), 10);
        if (!Number.isFinite(slotIdx) || slotIdx < 0 || slotIdx >= 10 || !gamesData || !gamesData.memorama) return;
        imgUrl = String(gamesData.memorama.pairImages[slotIdx] || '').trim();
        if (!imgUrl) {
          showToastNotification('Primero selecciona o sube una imagen para esta pareja.', true);
          return;
        }
        if (!Array.isArray(gamesData.memorama.pairCrops)) {
          gamesData.memorama.pairCrops = Array(10).fill('cover-center');
        }
        thumbCropState.targetMode = 'memorama-pair';
        thumbCropState.postIndex = slotIdx;
        thumbCropState.gameKey = 'memorama';
        initialFit = gamesData.memorama.pairCrops[slotIdx] || 'cover-center';
      } else if (typeof targetIndexOrMode === 'string' && targetIndexOrMode.startsWith('game:')) {
        const gKey = targetIndexOrMode.slice(5);
        if (!gamesData || !gamesData.blogs || !gamesData.blogs[gKey]) return;
        const gPost = gamesData.blogs[gKey];
        imgUrl = (gPost.image || '').trim();
        if (!imgUrl) {
          openGameBlogModal(gKey);
          return;
        }
        thumbCropState.targetMode = 'game';
        thumbCropState.gameKey = gKey;
        thumbCropState.postIndex = null;
        initialFit = gPost.imageFit || 'cover-center';
      } else {
        const idx = typeof targetIndexOrMode === 'number' ? targetIndexOrMode : currentBlogIndex;
        if (idx === null || idx === undefined || !postsData[idx]) return;
        const post = postsData[idx];
        imgUrl = (post.image || '').trim();
        if (!imgUrl) {
          openBlogModal(idx);
          return;
        }
        thumbCropState.targetMode = 'post';
        thumbCropState.postIndex = idx;
        thumbCropState.gameKey = null;
        initialFit = post.imageFit || 'cover-center';
      }

      const modal = document.getElementById('blogThumbCropModal');
      const vpEl = document.getElementById('thumbCropViewport');
      const imgEl = document.getElementById('thumbCropImg');
      const loadingEl = document.getElementById('thumbCropLoading');
      if (!modal || !imgEl) return;

      if (vpEl) {
        let isRightThumb = false;
        const isSquareCard = (thumbCropState.targetMode === 'memorama-pair');
        if (!isSquareCard) {
          if (thumbCropState.targetMode === 'game' || (thumbCropState.targetMode === 'modal-cover' && thumbCropState.gameKey)) {
            isRightThumb = (thumbCropState.gameKey === 'sixbysix');
          } else {
            const targetPost = (thumbCropState.postIndex !== null && thumbCropState.postIndex !== undefined) ? postsData[thumbCropState.postIndex] : null;
            if (targetPost) {
              const sortedVis = [...getVisibleBlogPosts()].sort((a, b) => new Date(b.dateIso) - new Date(a.dateIso));
              const sortedIdx = sortedVis.indexOf(targetPost);
              if (sortedIdx !== -1) {
                isRightThumb = (sortedIdx % 2 === 1);
              }
            }
          }
        }
        vpEl.classList.toggle('is-fade-left', isRightThumb);
        vpEl.classList.toggle('is-square-card-crop', isSquareCard);
      }

      ensureThumbCropGestureListeners();

      thumbCropState.pushedOwnHistory = !activeModalHistoryName;
      if (thumbCropState.pushedOwnHistory) {
        pushModalState('thumbCrop');
      }

      modal.style.display = 'flex';
      syncThumbCropViewportToUserPreviewSize();
      if (loadingEl) loadingEl.style.display = 'flex';

      imgEl.onload = function() {
        thumbCropState.natW = imgEl.naturalWidth || 1200;
        thumbCropState.natH = imgEl.naturalHeight || 1000;
        if (loadingEl) loadingEl.style.display = 'none';
        requestAnimationFrame(() => {
          applyInitialFitToThumbCropState(initialFit);
        });
      };

      imgEl.onerror = function() {
        if (loadingEl) loadingEl.style.display = 'none';
        showToastNotification('No se pudo cargar la imagen para recortar.', true);
      };

      if (imgEl.getAttribute('src') === imgUrl && imgEl.complete && imgEl.naturalWidth > 0) {
        imgEl.onload();
      } else {
        imgEl.src = imgUrl;
      }
    }
    window.openBlogThumbCropModal = openBlogThumbCropModal;
    window.cycleCardImageFit = function(postIndex) {
      openBlogThumbCropModal(postIndex);
    };

    function handleBlogThumbCropSliderInput(val) {
      const nextZ = parseFloat(val);
      if (!Number.isFinite(nextZ)) return;
      thumbCropState.z = nextZ;
      renderThumbCropPreview();
    }
    window.handleBlogThumbCropSliderInput = handleBlogThumbCropSliderInput;

    function stepBlogThumbCropZoom(delta) {
      thumbCropState.z = Math.max(thumbCropState.minZ, Math.min(thumbCropState.maxZ, thumbCropState.z + delta));
      renderThumbCropPreview();
    }
    window.stepBlogThumbCropZoom = stepBlogThumbCropZoom;

    function resetBlogThumbCropState(mode) {
      if (mode === 'fit') {
        thumbCropState.z = thumbCropState.fitZoom;
      } else {
        thumbCropState.z = 1.0;
      }
      thumbCropState.x = 0;
      thumbCropState.y = 0;
      renderThumbCropPreview();
    }
    window.resetBlogThumbCropState = resetBlogThumbCropState;

    function closeBlogThumbCropModal(fromPopState = false) {
      const modal = document.getElementById('blogThumbCropModal');
      if (modal) modal.style.display = 'none';
      thumbCropState.isDragging = false;
      thumbCropState.isPinching = false;
      const stage = document.getElementById('thumbCropStage');
      if (stage) stage.classList.remove('is-interacting');
      if (!fromPopState && thumbCropState.pushedOwnHistory) {
        thumbCropState.pushedOwnHistory = false;
        popModalState('thumbCrop');
      } else {
        thumbCropState.pushedOwnHistory = false;
      }
    }
    window.closeBlogThumbCropModal = closeBlogThumbCropModal;

    function confirmBlogThumbCropModal() {
      const cropVal = serializeThumbCropState();

      if (thumbCropState.targetMode === 'modal-cover') {
        pendingModalCoverImageFit = cropVal;
        pendingModalCoverOriginalUrl = (document.getElementById('modalImgUrl')?.value || '').trim();
        closeBlogThumbCropModal();
        if (typeof showToastNotification === 'function') {
          showToastNotification('✂️ Recorte de miniatura listo');
        }
        return;
      }

      if (thumbCropState.targetMode === 'memorama-pair') {
        const slotIdx = thumbCropState.postIndex;
        if (Number.isFinite(slotIdx) && slotIdx >= 0 && slotIdx < 10 && gamesData && gamesData.memorama) {
          if (!Array.isArray(gamesData.memorama.pairCrops)) {
            gamesData.memorama.pairCrops = Array(10).fill('cover-center');
          }
          gamesData.memorama.pairCrops[slotIdx] = cropVal;
          applyMemoramaPairThumbCropInEditor(slotIdx);
          persistGamesLocalCache();
          if (typeof window.persistSiteDataInRealtime === 'function') {
            window.persistSiteDataInRealtime();
          }
          if (typeof showToastNotification === 'function') {
            showToastNotification(`✂️ Encuadre de Pareja #${slotIdx + 1} guardado`);
          }
        }
        closeBlogThumbCropModal();
        return;
      }

      if (thumbCropState.targetMode === 'game') {
        const gKey = thumbCropState.gameKey;
        if (gKey && gamesData && gamesData.blogs && gamesData.blogs[gKey]) {
          gamesData.blogs[gKey].imageFit = cropVal;
          gamesData.blogs[gKey].updatedAt = new Date().toISOString();
          renderGamesSection();
          persistGamesLocalCache();
          if (typeof window.persistSiteDataInRealtime === 'function') {
            window.persistSiteDataInRealtime();
          }
          if (typeof showToastNotification === 'function') {
            showToastNotification('✂️ Miniatura actualizada');
          }
        }
        closeBlogThumbCropModal();
        return;
      }

      const idx = thumbCropState.postIndex;
      if (idx !== null && idx !== undefined && postsData[idx]) {
        const post = postsData[idx];
        post.imageFit = cropVal;
        post.updatedAt = new Date().toISOString();
        markPostsPendingCloudSync([post], { immediate: true });
        renderBlogPosts();
        persistPostsToLocalVaults();
        if (typeof window.persistSiteDataInRealtime === 'function') {
          window.persistSiteDataInRealtime();
        } else if (typeof window.persistSingleBlogPostToCloud === 'function') {
          window.persistSingleBlogPostToCloud(post);
        }
        if (typeof showToastNotification === 'function') {
          showToastNotification('✂️ Miniatura actualizada');
        }
      }
      closeBlogThumbCropModal();
    }
    window.confirmBlogThumbCropModal = confirmBlogThumbCropModal;

    function setupLiveBlogEditableBodyEvents() {
      const bodyEl = document.getElementById('blogEditableBody');
      if (!bodyEl) return;

      try {
        document.execCommand('defaultParagraphSeparator', false, 'p');
      } catch (err) {}

      bodyEl.addEventListener('keydown', () => {
        const modalBody = document.getElementById('blogModalBody');
        if (modalBody && hasPendingBlogParagraphReveal(modalBody)) {
          resetBlogParagraphRevealState(modalBody);
        }
      });

      bodyEl.addEventListener('input', () => {
        const modalBody = document.getElementById('blogModalBody');
        if (modalBody && hasPendingBlogParagraphReveal(modalBody)) {
          resetBlogParagraphRevealState(modalBody);
        }
        const hasAnyText = Boolean((bodyEl.textContent || '').trim());
        if (!bodyEl.children.length && !hasAnyText) {
          bodyEl.innerHTML = '<p><br></p>';
        }
        const hasAnyFigure = Boolean(bodyEl.querySelector('figure, img.inline-img'));
        bodyEl.setAttribute('data-is-empty', (hasAnyText || hasAnyFigure) ? 'false' : 'true');

        // Solo recalcular capitular del párrafo activo en vez de recorrer todo el DOM en cada tecla
        const sel = window.getSelection ? window.getSelection() : null;
        const anchorNode = sel && sel.anchorNode ? (sel.anchorNode.nodeType === 1 ? sel.anchorNode : sel.anchorNode.parentElement) : null;
        const activeP = anchorNode && anchorNode.closest ? anchorNode.closest('p') : null;
        if (activeP && bodyEl.contains(activeP)) {
          syncBlogParagraphFirstLetterColors(activeP);
        }
        scheduleLiveBlogModalSync();
      });

      bodyEl.addEventListener('blur', () => {
        syncBlogParagraphFirstLetterColors(bodyEl);
        syncLiveBlogModalToMemory(true);
      });

      bodyEl.addEventListener('click', (e) => {
        const foldedP = e.target && e.target.closest ? e.target.closest('p.blog-para-hold, p.blog-para-unfolding') : null;
        if (foldedP && bodyEl.contains(foldedP)) {
          const modalBody = document.getElementById('blogModalBody');
          if (modalBody) resetBlogParagraphRevealState(modalBody);
        }
        const anchor = e.target && e.target.closest ? e.target.closest('a') : null;
        if (anchor && bodyEl.contains(anchor)) {
          e.preventDefault();
        }
      });

      bodyEl.addEventListener('paste', (e) => {
        if (!e.clipboardData) return;
        e.preventDefault();
        const modalBody = document.getElementById('blogModalBody');
        if (modalBody && hasPendingBlogParagraphReveal(modalBody)) {
          resetBlogParagraphRevealState(modalBody);
        }
        const plain = (e.clipboardData.getData('text/plain') || '').replace(/\r\n/g, '\n');
        if (!plain) return;

        const paras = plain.split(/\n{2,}/);
        if (paras.length === 1) {
          const htmlLines = escapeHtmlText(paras[0]).replace(/\n/g, '<br>');
          document.execCommand('insertHTML', false, htmlLines);
        } else {
          const htmlBlocks = paras
            .map(p => p.trim())
            .filter(Boolean)
            .map(p => `<p>${escapeHtmlText(p).replace(/\n/g, '<br>')}</p>`)
            .join('');
          document.execCommand('insertHTML', false, htmlBlocks);
        }
        syncBlogParagraphFirstLetterColors(bodyEl);
        syncLiveBlogModalToMemory(false);
      });
    }

    function removeLiveCoverImage() {
      const post = getActiveEditableBlogPost();
      if (!post) return;
      post.image = '';
      post.imageCaption = '';
      post.imageAura = '';
      post.updatedAt = new Date().toISOString();
      const coverContainer = document.getElementById('blogLiveCoverContainer');
      if (coverContainer) {
        coverContainer.innerHTML = renderLiveCoverSectionHTML(post);
      }
      const modalBody = document.getElementById('blogModalBody');
      applyBlogModalAdaptiveTheme(post, modalBody);
      if (currentGameBlogKey && gamesData && gamesData.blogs && gamesData.blogs[currentGameBlogKey]) {
        renderGamesSection();
        persistGamesLocalCache();
      } else {
        renderBlogPosts();
        persistPostsToLocalVaults();
      }
    }
    window.removeLiveCoverImage = removeLiveCoverImage;

    function moveInlineFigureBlock(btnEl, direction) {
      const fig = btnEl ? btnEl.closest('.blutu-editable-figure') : null;
      const bodyEl = document.getElementById('blogEditableBody');
      if (!fig || !bodyEl) return;

      if (direction < 0 && fig.previousElementSibling) {
        bodyEl.insertBefore(fig, fig.previousElementSibling);
      } else if (direction > 0 && fig.nextElementSibling) {
        bodyEl.insertBefore(fig.nextElementSibling, fig);
      }
      // Garantizar párrafo editable al final si una figura quedó de última
      if (bodyEl.lastElementChild && bodyEl.lastElementChild.classList.contains('blutu-editable-figure')) {
        const trailingP = document.createElement('p');
        trailingP.setAttribute('data-trailing-guard', 'true');
        trailingP.innerHTML = '<br>';
        bodyEl.appendChild(trailingP);
      }
      syncLiveBlogModalToMemory(true);
    }
    window.moveInlineFigureBlock = moveInlineFigureBlock;

    function removeInlineFigureBlock(btnEl) {
      const fig = btnEl ? btnEl.closest('.blutu-editable-figure') : null;
      const bodyEl = document.getElementById('blogEditableBody');
      if (!fig || !bodyEl) return;
      fig.remove();
      if (!bodyEl.children.length) {
        bodyEl.innerHTML = '<p><br></p>';
      }
      syncLiveBlogModalToMemory(true);
    }
    window.removeInlineFigureBlock = removeInlineFigureBlock;

    function toggleModalPostVisibility(postIndex, e) {
      if (e && e.stopPropagation) e.stopPropagation();
      const idx = Number(postIndex);
      if (isNaN(idx) || idx < 0 || !postsData[idx]) return;
      postsData[idx].hidden = !postsData[idx].hidden;
      postsData[idx].updatedAt = new Date().toISOString();

      window.postsData = postsData;
      markPostsPendingCloudSync([postsData[idx]]);
      persistPostsToLocalVaults();

      renderBlogPosts();
      renderAdminPostsList();
      if (typeof populatePostSelect === 'function') populatePostSelect();

      // Si el modal de edición de blogs ya estaba abierto con este post, actualizamos solo el botón sin reiniciar el formulario
      const modal = document.getElementById('blogReadModal');
      if (modal && modal.style.display !== 'none' && currentBlogIndex === idx) {
        const isHidden = !!postsData[idx].hidden;
        const btn = modal.querySelector('button[onclick*="toggleModalPostVisibility"]');
        if (btn) {
          btn.style.background = isHidden ? 'rgba(90,116,191,0.3)' : 'rgba(200,150,50,0.3)';
          btn.style.color = isHidden ? 'var(--accent-light)' : '#ffd280';
          btn.style.borderColor = isHidden ? 'var(--accent-blue)' : '#cca333';
          btn.innerHTML = isHidden ? '👁️ Oculto' : '👁️‍🗨️ Visible';
        }
      }

      if (typeof window.persistSiteDataInRealtime === 'function') {
        window.persistSiteDataInRealtime(true, { allowAuthPopup: true });
      }
    }
    window.toggleModalPostVisibility = toggleModalPostVisibility;

    let pendingDeletePostIndex = null;

    function resolvePostIndex(target) {
      if (typeof target === 'number') {
        if (!isNaN(target) && target >= 0 && target < postsData.length) return target;
      }
      if (typeof target === 'string') {
        const num = parseInt(target, 10);
        if (!isNaN(num) && String(num) === target && num >= 0 && num < postsData.length) {
          return num;
        }
        const byId = postsData.findIndex(p => p.id === target || p.title === target);
        if (byId !== -1) return byId;
      }
      if (target && typeof target === 'object') {
        const byRef = postsData.indexOf(target);
        if (byRef !== -1) return byRef;
        const byId = postsData.findIndex(p => (target.id && p.id === target.id) || (target.title && p.title === target.title && target.dateIso && p.dateIso === target.dateIso));
        if (byId !== -1) return byId;
      }
      return -1;
    }
    window.resolvePostIndex = resolvePostIndex;

    function openGothicConfirmModal(opts = {}) {
      if (!window.__adminModalsMounted) { ensureAdminModalsReady().then(() => openGothicConfirmModal(opts)); return; }
      const { icon = '🕯️', title = '¿Confirmar Acción?', message = '', confirmText = '🗑️ Sí, Eliminar', onConfirm } = opts;
      const iconEl = document.getElementById('deletePostConfirmIcon');
      const titleEl = document.getElementById('deletePostConfirmTitle');
      const msgEl = document.getElementById('deletePostConfirmMessage');
      const acceptBtn = document.getElementById('deletePostConfirmAcceptBtn');
      const modal = document.getElementById('deletePostConfirmModal');

      if (iconEl) iconEl.textContent = icon;
      if (titleEl) titleEl.textContent = title;
      if (msgEl) msgEl.textContent = message;
      if (acceptBtn) {
        acceptBtn.textContent = confirmText;
        acceptBtn.onclick = () => {
          closeDeletePostConfirmModal();
          if (typeof onConfirm === 'function') onConfirm();
        };
      }
      if (modal) {
        modal.style.display = 'flex';
        document.body.style.overflow = 'hidden';
      }
    }
    window.openGothicConfirmModal = openGothicConfirmModal;

    function openDeletePostConfirmModal(postIndex) {
      const idx = resolvePostIndex(postIndex);
      if (idx < 0 || idx >= postsData.length) return;
      pendingDeletePostIndex = idx;

      const postTitle = postsData[idx].title || 'esta publicación';
      openGothicConfirmModal({
        icon: '🕯️',
        title: '¿Eliminar Publicación?',
        message: `¿Estás seguro de que deseas eliminar la publicación "${postTitle}"? Esta acción borrará el artículo de la página y de la base de datos.`,
        confirmText: '🗑️ Sí, Eliminar',
        onConfirm: () => executeDeletePost(idx)
      });
    }
    window.openDeletePostConfirmModal = openDeletePostConfirmModal;

    function closeDeletePostConfirmModal() {
      pendingDeletePostIndex = null;
      const modal = document.getElementById('deletePostConfirmModal');
      if (modal) {
        modal.style.display = 'none';
        const anyParentModalOpen = ['blogReadModal', 'adminModal', 'merchDetailModal', 'cartModal', 'imageModal']
          .some(id => document.getElementById(id)?.style.display === 'flex');
        if (!anyParentModalOpen) {
          document.body.style.overflow = '';
        }
      }
    }
    window.closeDeletePostConfirmModal = closeDeletePostConfirmModal;

    function deleteModalPost(postIndex, skipConfirm = false) {
      const idx = resolvePostIndex(postIndex);
      if (idx < 0 || idx >= postsData.length) return;

      if (skipConfirm) {
        executeDeletePost(idx);
        return;
      }

      openDeletePostConfirmModal(idx);
    }
    window.deleteModalPost = deleteModalPost;

    async function executeDeletePost(postIndex) {
      const idx = resolvePostIndex(postIndex);
      if (idx < 0 || idx >= postsData.length) return;

      const deletedPost = postsData[idx];
      const deletedTitle = deletedPost.title || 'Publicación';
      const exactId = String(deletedPost.id || '').trim();
      const fallbackComposite = String((deletedPost.title || '') + '_' + (deletedPost.dateIso || '')).trim();

      // Registrar únicamente el ID exacto cuando existe (evita bloquear futuros blogs con el mismo título o "Sin Título")
      markPostIdsDeleted(exactId ? [exactId] : [fallbackComposite]);
      removePostPendingCloudSync(deletedPost);

      // 1. Eliminar del array postsData y alinear índice activo del modal
      const wasOpenDeletedPost = (currentBlogIndex === idx);
      if (wasOpenDeletedPost) {
        currentBlogIndex = null;
      } else if (typeof currentBlogIndex === 'number' && currentBlogIndex > idx) {
        currentBlogIndex--;
      }
      postsData.splice(idx, 1);

      // 2. Sincronizar referencia global de window
      window.postsData = postsData;

      // 3. Actualizar la caché local en localStorage e IndexedDB inmediatamente (permitiendo poda explícita)
      try {
        localStorage.setItem('blutu_permanent_posts_vault', JSON.stringify(postsData));
        const cachedRaw = localStorage.getItem('blutu_live_site_data');
        if (cachedRaw) {
          const cached = JSON.parse(cachedRaw);
          cached.posts = postsData;
          cached.updatedAt = Date.now();
          localStorage.setItem('blutu_live_site_data', JSON.stringify(cached));
        } else {
          localStorage.setItem('blutu_live_site_data', JSON.stringify({
            posts: postsData,
            updatedAt: Date.now()
          }));
        }
        if (typeof BlutuVault !== 'undefined' && BlutuVault.savePosts) {
          BlutuVault.savePosts(postsData, { allowPrune: true });
        }
      } catch (e) {
        console.warn('Error actualizando caché tras eliminar publicación:', e);
      }

      // 4. Re-renderizar todos los componentes visuales
      if (wasOpenDeletedPost && typeof closeBlogModal === 'function') closeBlogModal(true);
      if (typeof renderBlogPosts === 'function') renderBlogPosts();
      if (typeof renderAdminPostsList === 'function') renderAdminPostsList();
      if (typeof populatePostSelect === 'function') populatePostSelect();
      if (typeof closeDeletePostConfirmModal === 'function') closeDeletePostConfirmModal();

      // 5. Archivar en Firestore (soft-delete seguro, nunca borrado destructivo) y sincronizar sitio
      if (typeof window.archiveSingleBlogPostInCloud === 'function') {
        window.archiveSingleBlogPostInCloud(deletedPost);
      }
      if (typeof window.persistSiteDataInRealtime === 'function') {
        const saved = await window.persistSiteDataInRealtime(true, { allowAuthPopup: true });
        if (typeof window.showToastNotification === 'function') {
          if (saved) {
            window.showToastNotification(`🗑️ Publicación "${deletedTitle}" archivada con éxito.`);
          } else {
            window.showToastNotification(`🗑️ Publicación "${deletedTitle}" eliminada localmente.`);
          }
        }
      } else if (typeof window.showToastNotification === 'function') {
        window.showToastNotification(`🗑️ Publicación "${deletedTitle}" eliminada.`);
      }
    }
    window.executeDeletePost = executeDeletePost;

    function deleteCurrentPost() {
      if (typeof currentBlogIndex === 'number' && currentBlogIndex >= 0 && currentBlogIndex < postsData.length) {
        deleteModalPost(currentBlogIndex);
      } else {
        const sel = document.getElementById('postSelect');
        if (sel && sel.value !== '') {
          deleteModalPost(parseInt(sel.value, 10));
        }
      }
    }
    window.deleteCurrentPost = deleteCurrentPost;

    function toggleCurrentPostVisibility() {
      if (typeof currentBlogIndex === 'number' && currentBlogIndex >= 0 && currentBlogIndex < postsData.length) {
        toggleModalPostVisibility(currentBlogIndex);
      }
    }
    window.toggleCurrentPostVisibility = toggleCurrentPostVisibility;

    /* FUNCIONALIDAD DE PIPETA / CUENTAGOTAS DE PÍXEL PARA AURA DE IMÁGENES (MÓVIL Y ESCRITORIO) */
    let currentPixelTargetTextId = '';
    let currentPixelTargetPickerId = '';
    let selectedPixelHexColor = '#5A74BF';
    let pixelPickerLoadRequestId = 0;
    let isPixelCanvasLoaded = false;
    let pixelCanvasBindingsInitialized = false;
    let lastPixelTouchTimestamp = 0;

    function resolveImageSourceUrlForPixelPicker(imgSourceIdOrUrl) {
      let raw = '';
      if (typeof imgSourceIdOrUrl === 'string' && imgSourceIdOrUrl.trim()) {
        const trimmedKey = imgSourceIdOrUrl.trim();
        const el = document.getElementById(trimmedKey);
        if (el) {
          if (el.tagName === 'IMG' && (el.currentSrc || el.src)) {
            raw = (el.currentSrc || el.src).trim();
          } else if (typeof el.value === 'string') {
            raw = el.value.trim();
          }
          if (!raw && trimmedKey === 'galleryMediaUrlInput' && galleryMediaOriginalDataSrc) {
            raw = galleryMediaOriginalDataSrc;
          }
        } else {
          raw = trimmedKey;
        }
      }

      if (!raw) return '';

      const ytInfo = parseYouTubeUrl(raw);
      if (ytInfo && ytInfo.thumbnailUrl) {
        return ytInfo.thumbnailUrl;
      }

      // Convertir enlaces de visor de Google Drive a imagen directa si aplica
      const driveMatch = raw.match(/drive\.google\.com\/(?:file\/d\/|open\?id=|uc\?(?:export=view&)?id=)([a-zA-Z0-9_-]+)/i);
      if (driveMatch && driveMatch[1]) {
        return `https://lh3.googleusercontent.com/d/${driveMatch[1]}`;
      }

      if (!/^(https?:\/\/|data:|blob:|\/)/i.test(raw)) {
        raw = 'https://' + raw;
      }
      return raw;
    }

    async function pickPixelColorForAura(targetTextId, targetPickerId, imgSourceIdOrUrl) {
      currentPixelTargetTextId = targetTextId;
      currentPixelTargetPickerId = targetPickerId;

      const resolvedUrl = resolveImageSourceUrlForPixelPicker(imgSourceIdOrUrl);
      if (resolvedUrl) {
        openCanvasPixelPickerModal(resolvedUrl);
        return;
      }

      const isCoarsePointer = Boolean(
        (window.matchMedia && window.matchMedia('(pointer: coarse)').matches) ||
        ('ontouchstart' in window)
      );

      if (!isCoarsePointer && 'EyeDropper' in window) {
        try {
          const eyeDropper = new EyeDropper();
          const result = await eyeDropper.open();
          if (result && result.sRGBHex) {
            applyAuraPixelColor(result.sRGBHex.toUpperCase());
            return;
          }
        } catch (e) {
          return;
        }
      }

      showToastNotification('Por favor ingresa primero la URL de la imagen para poder escoger un color con la pipeta.', true);
    }
    window.pickPixelColorForAura = pickPixelColorForAura;

    function applyAuraPixelColor(hexColor) {
      if (!hexColor) return;
      const upperHex = hexColor.toUpperCase();
      if (currentPixelTargetTextId === 'modalImgAura') {
        syncModalImgAuraControlsUI(true, `Color capturado (${upperHex})`);
      } else if (currentPixelTargetTextId === 'galleryMediaAuraInput') {
        syncGalleryMediaAuraControlsUI(true, `Color capturado (${upperHex})`);
      }
      if (currentPixelTargetTextId) {
        const txtEl = document.getElementById(currentPixelTargetTextId);
        if (txtEl) {
          txtEl.value = upperHex;
          txtEl.dispatchEvent(new Event('input', { bubbles: true }));
        }
      }
      if (currentPixelTargetPickerId) {
        const pickEl = document.getElementById(currentPixelTargetPickerId);
        if (pickEl && /^#[0-9A-F]{6}$/i.test(upperHex)) {
          pickEl.value = upperHex;
          pickEl.dispatchEvent(new Event('input', { bubbles: true }));
        }
      }
      if (typeof showCartToast === 'function') {
        showCartToast('Color aura capturado: ' + upperHex);
      } else if (typeof showToastNotification === 'function') {
        showToastNotification('Color aura capturado: ' + upperHex);
      }
    }

    function verifyImageIsUntainted(img) {
      try {
        const testCanvas = document.createElement('canvas');
        testCanvas.width = 1;
        testCanvas.height = 1;
        const tCtx = testCanvas.getContext('2d');
        if (!tCtx) return false;
        tCtx.drawImage(img, 0, 0, 1, 1);
        tCtx.getImageData(0, 0, 1, 1);
        return true;
      } catch (e) {
        return false;
      }
    }

    function loadImageElementPromise(src, useCorsAnonymous, timeoutMs = 8500) {
      return new Promise((resolve, reject) => {
        const img = new Image();
        let settled = false;
        const timer = setTimeout(() => {
          if (settled) return;
          settled = true;
          img.onload = null;
          img.onerror = null;
          reject(new Error('Image load timeout'));
        }, timeoutMs);

        if (useCorsAnonymous) {
          img.crossOrigin = 'anonymous';
        }

        img.onload = () => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          if ((img.naturalWidth || img.width) > 0 && verifyImageIsUntainted(img)) {
            resolve(img);
          } else {
            reject(new Error('Tainted or empty image'));
          }
        };

        img.onerror = () => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          reject(new Error('Image load error'));
        };

        img.src = src;
      });
    }

    async function fetchImageViaCleanBlob(fetchUrl, timeoutMs = 9000) {
      const controller = ('AbortController' in window) ? new AbortController() : null;
      const timer = setTimeout(() => {
        if (controller) controller.abort();
      }, timeoutMs);

      try {
        const resp = await fetch(fetchUrl, {
          mode: 'cors',
          credentials: 'omit',
          cache: 'no-store',
          signal: controller ? controller.signal : undefined
        });
        if (!resp.ok) throw new Error('HTTP ' + resp.status);
        const blob = await resp.blob();
        if (!blob || blob.size === 0) throw new Error('Empty blob');
        if (blob.type && /^text\/html/i.test(blob.type)) throw new Error('Invalid image MIME');

        const objectUrl = URL.createObjectURL(blob);
        try {
          const img = await loadImageElementPromise(objectUrl, false, 6000);
          return { img, objectUrl };
        } catch (imgErr) {
          URL.revokeObjectURL(objectUrl);
          throw imgErr;
        }
      } finally {
        clearTimeout(timer);
      }
    }

    async function loadUntaintedImageForPixelPicker(imgUrl) {
      if (/^(data:|blob:|\/)/i.test(imgUrl) || imgUrl.startsWith(window.location.origin)) {
        const img = await loadImageElementPromise(imgUrl, false, 7000);
        return { img, objectUrl: '' };
      }

      // 1. Fetch CORS directo sin usar caché no-CORS de <img> (evita bloqueo en Safari iOS y Chrome Android)
      try {
        return await fetchImageViaCleanBlob(imgUrl, 6500);
      } catch (e1) {}

      // 2. Carga con atributo crossOrigin="anonymous" y parámetro anticaché si no es URL firmada
      const isSignedUrl = /(?:token=|Signature=|X-Amz-Signature=|GoogleAccessId=)/i.test(imgUrl);
      if (!isSignedUrl) {
        try {
          const sep = imgUrl.includes('?') ? '&' : '?';
          const bustUrl = `${imgUrl}${sep}_blutupx=${Date.now()}`;
          const img = await loadImageElementPromise(bustUrl, true, 5500);
          return { img, objectUrl: '' };
        } catch (e2) {}
      }

      // 3. Proxies CORS de imágenes para servidores externos sin cabecera Access-Control-Allow-Origin
      const cleanNoProto = imgUrl.replace(/^https?:\/\//i, '');
      const proxyCandidates = [
        `https://wsrv.nl/?url=${encodeURIComponent(imgUrl)}&output=png`,
        `https://wsrv.nl/?url=${encodeURIComponent(cleanNoProto)}&output=png`,
        `https://corsproxy.io/?${encodeURIComponent(imgUrl)}`,
        `https://api.allorigins.win/raw?url=${encodeURIComponent(imgUrl)}`
      ];

      for (const proxyUrl of proxyCandidates) {
        try {
          return await fetchImageViaCleanBlob(proxyUrl, 8500);
        } catch (proxyErr) {
          try {
            const img = await loadImageElementPromise(proxyUrl, true, 6500);
            return { img, objectUrl: '' };
          } catch (fallbackErr) {}
        }
      }

      throw new Error('Could not load untainted image');
    }

    function ensurePixelCanvasInteractiveBindings() {
      if (pixelCanvasBindingsInitialized) return;
      const canvas = document.getElementById('pixelPickerCanvas');
      if (!canvas) return;
      pixelCanvasBindingsInitialized = true;

      let activeMouseDrag = false;

      function sampleFromClientCoords(clientX, clientY, showLoupe) {
        if (!isPixelCanvasLoaded) return;
        const rect = canvas.getBoundingClientRect();
        if (rect.width <= 0 || rect.height <= 0) return;

        const clampedClientX = Math.max(rect.left, Math.min(rect.right - 0.5, clientX));
        const clampedClientY = Math.max(rect.top, Math.min(rect.bottom - 0.5, clientY));

        const relX = clampedClientX - rect.left;
        const relY = clampedClientY - rect.top;

        const scaleX = canvas.width / rect.width;
        const scaleY = canvas.height / rect.height;

        const px = Math.max(0, Math.min(canvas.width - 1, Math.floor(relX * scaleX)));
        const py = Math.max(0, Math.min(canvas.height - 1, Math.floor(relY * scaleY)));

        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        if (!ctx) return;

        try {
          const pixelData = ctx.getImageData(px, py, 1, 1).data;
          updatePixelSwatch(pixelData[0], pixelData[1], pixelData[2]);
        } catch (err) {
          return;
        }

        const crosshair = document.getElementById('pixelCrosshair');
        if (crosshair) {
          crosshair.style.display = 'block';
          crosshair.style.left = `${relX}px`;
          crosshair.style.top = `${relY}px`;
          crosshair.style.borderColor = '#ffffff';
        }

        const loupeWrap = document.getElementById('pixelLoupeWrap');
        const loupeCanvas = document.getElementById('pixelLoupeCanvas');
        if (loupeWrap && loupeCanvas) {
          if (showLoupe) {
            const lCtx = loupeCanvas.getContext('2d');
            if (lCtx) {
              const gridRadius = 5; // 11x11 píxeles ampliados
              const gridSize = gridRadius * 2 + 1;
              const lW = loupeCanvas.width;
              const lH = loupeCanvas.height;
              lCtx.clearRect(0, 0, lW, lH);
              lCtx.fillStyle = '#050508';
              lCtx.fillRect(0, 0, lW, lH);
              lCtx.imageSmoothingEnabled = false;

              const sx = px - gridRadius;
              const sy = py - gridRadius;
              const cellW = lW / gridSize;
              const cellH = lH / gridSize;

              const validSx = Math.max(0, sx);
              const validSy = Math.max(0, sy);
              const validEx = Math.min(canvas.width, sx + gridSize);
              const validEy = Math.min(canvas.height, sy + gridSize);
              const validSw = validEx - validSx;
              const validSh = validEy - validSy;

              if (validSw > 0 && validSh > 0) {
                const dx = (validSx - sx) * cellW;
                const dy = (validSy - sy) * cellH;
                const dw = validSw * cellW;
                const dh = validSh * cellH;
                lCtx.drawImage(canvas, validSx, validSy, validSw, validSh, dx, dy, dw, dh);
              }

              // Retícula central del píxel exacto
              const centerLeft = gridRadius * cellW;
              const centerTop = gridRadius * cellH;
              lCtx.strokeStyle = 'rgba(0, 0, 0, 0.9)';
              lCtx.lineWidth = 2;
              lCtx.strokeRect(centerLeft - 1, centerTop - 1, cellW + 2, cellH + 2);
              lCtx.strokeStyle = '#ffffff';
              lCtx.lineWidth = 1.5;
              lCtx.strokeRect(centerLeft, centerTop, cellW, cellH);
            }

            const offsetY = (relY < 86) ? 66 : -66;
            const loupeLeft = Math.max(44, Math.min(rect.width - 44, relX));
            const loupeTop = Math.max(44, Math.min(rect.height - 44, relY + offsetY));
            loupeWrap.style.left = `${loupeLeft}px`;
            loupeWrap.style.top = `${loupeTop}px`;
            loupeWrap.style.borderColor = selectedPixelHexColor;
            loupeWrap.style.display = 'block';
          } else {
            loupeWrap.style.display = 'none';
          }
        }
      }

      function hideLoupeOnly() {
        const loupeWrap = document.getElementById('pixelLoupeWrap');
        if (loupeWrap) loupeWrap.style.display = 'none';
      }

      // Eventos táctiles nativos (garantiza bloqueo de scroll en iOS Safari y Android)
      canvas.addEventListener('touchstart', (e) => {
        if (!e.touches || e.touches.length === 0) return;
        lastPixelTouchTimestamp = Date.now();
        if (e.cancelable) e.preventDefault();
        sampleFromClientCoords(e.touches[0].clientX, e.touches[0].clientY, true);
      }, { passive: false });

      canvas.addEventListener('touchmove', (e) => {
        if (!e.touches || e.touches.length === 0) return;
        lastPixelTouchTimestamp = Date.now();
        if (e.cancelable) e.preventDefault();
        sampleFromClientCoords(e.touches[0].clientX, e.touches[0].clientY, true);
      }, { passive: false });

      canvas.addEventListener('touchend', (e) => {
        lastPixelTouchTimestamp = Date.now();
        if (e.changedTouches && e.changedTouches.length > 0) {
          sampleFromClientCoords(e.changedTouches[0].clientX, e.changedTouches[0].clientY, false);
        } else {
          hideLoupeOnly();
        }
      }, { passive: true });

      canvas.addEventListener('touchcancel', () => {
        hideLoupeOnly();
      }, { passive: true });

      // Eventos de mouse en escritorio
      canvas.addEventListener('mousedown', (e) => {
        if (Date.now() - lastPixelTouchTimestamp < 800) return;
        activeMouseDrag = true;
        sampleFromClientCoords(e.clientX, e.clientY, true);
      });

      canvas.addEventListener('mousemove', (e) => {
        if (Date.now() - lastPixelTouchTimestamp < 800) return;
        sampleFromClientCoords(e.clientX, e.clientY, activeMouseDrag);
      });

      window.addEventListener('mouseup', () => {
        if (activeMouseDrag) {
          activeMouseDrag = false;
          hideLoupeOnly();
        }
      }, { passive: true });

      canvas.addEventListener('mouseleave', () => {
        if (!activeMouseDrag) hideLoupeOnly();
      });

      canvas.addEventListener('click', (e) => {
        // En celular el toque solo previsualiza el píxel; se confirma con "Usar Este Color"
        if (Date.now() - lastPixelTouchTimestamp < 800) return;
        sampleFromClientCoords(e.clientX, e.clientY, false);
      });
    }

    async function openCanvasPixelPickerModal(imgSourceIdOrUrl) {
      if (!window.__adminModalsMounted) { await ensureAdminModalsReady(); }
      const imgUrl = resolveImageSourceUrlForPixelPicker(imgSourceIdOrUrl);
      if (!imgUrl) {
        showToastNotification('Por favor ingresa primero la URL de la imagen para poder seleccionar sus píxeles.', true);
        return;
      }

      const modal = document.getElementById('pixelCanvasModal');
      const canvas = document.getElementById('pixelPickerCanvas');
      const loadingEl = document.getElementById('pixelCanvasLoading');
      const crosshair = document.getElementById('pixelCrosshair');
      const loupeWrap = document.getElementById('pixelLoupeWrap');
      const confirmBtn = document.getElementById('pixelConfirmBtn');
      if (!modal || !canvas) return;

      ensurePixelCanvasInteractiveBindings();

      const reqId = ++pixelPickerLoadRequestId;
      isPixelCanvasLoaded = false;

      if (crosshair) crosshair.style.display = 'none';
      if (loupeWrap) loupeWrap.style.display = 'none';
      if (loadingEl) loadingEl.style.display = 'flex';
      if (confirmBtn) {
        confirmBtn.disabled = true;
        confirmBtn.style.opacity = '0.55';
      }
      canvas.style.opacity = '0.18';
      modal.style.display = 'flex';

      let loadedResult = null;
      try {
        loadedResult = await loadUntaintedImageForPixelPicker(imgUrl);
      } catch (err) {
        if (reqId !== pixelPickerLoadRequestId) return;
        if (loadingEl) loadingEl.style.display = 'none';
        closePixelCanvasModal();
        showToastNotification('No se pudo cargar la imagen para leer sus píxeles. Verifica que la URL sea pública y válida.', true);
        return;
      }

      if (reqId !== pixelPickerLoadRequestId) {
        if (loadedResult && loadedResult.objectUrl) URL.revokeObjectURL(loadedResult.objectUrl);
        return;
      }

      const img = loadedResult.img;
      const natW = img.naturalWidth || img.width || 600;
      const natH = img.naturalHeight || img.height || 400;
      const MAX_CANVAS_DIM = 1200;
      const downScale = Math.min(1, MAX_CANVAS_DIM / Math.max(natW, natH));
      const targetW = Math.max(1, Math.round(natW * downScale));
      const targetH = Math.max(1, Math.round(natH * downScale));

      canvas.width = targetW;
      canvas.height = targetH;

      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      ctx.clearRect(0, 0, targetW, targetH);
      ctx.drawImage(img, 0, 0, targetW, targetH);

      if (loadedResult.objectUrl) {
        URL.revokeObjectURL(loadedResult.objectUrl);
      }

      isPixelCanvasLoaded = true;
      canvas.style.opacity = '1';
      if (loadingEl) loadingEl.style.display = 'none';
      if (confirmBtn) {
        confirmBtn.disabled = false;
        confirmBtn.style.opacity = '1';
      }

      try {
        const cx = Math.floor(targetW / 2);
        const cy = Math.floor(targetH / 2);
        const pData = ctx.getImageData(cx, cy, 1, 1).data;
        updatePixelSwatch(pData[0], pData[1], pData[2]);

        requestAnimationFrame(() => {
          if (reqId !== pixelPickerLoadRequestId || !crosshair) return;
          const cRect = canvas.getBoundingClientRect();
          if (cRect.width > 0 && cRect.height > 0) {
            crosshair.style.left = `${cRect.width / 2}px`;
            crosshair.style.top = `${cRect.height / 2}px`;
            crosshair.style.display = 'block';
          }
        });
      } catch (e) {}
    }

    function updatePixelSwatch(r, g, b) {
      const hexR = r.toString(16).padStart(2, '0');
      const hexG = g.toString(16).padStart(2, '0');
      const hexB = b.toString(16).padStart(2, '0');
      selectedPixelHexColor = `#${hexR}${hexG}${hexB}`.toUpperCase();

      const swatch = document.getElementById('pixelColorSwatch');
      const hexVal = document.getElementById('pixelColorHexVal');
      const rgbVal = document.getElementById('pixelColorRgbVal');

      if (swatch) swatch.style.background = selectedPixelHexColor;
      if (hexVal) hexVal.innerText = selectedPixelHexColor;
      if (rgbVal) rgbVal.innerText = `rgb(${r}, ${g}, ${b})`;
    }

    function confirmPixelColorSelection() {
      if (!isPixelCanvasLoaded) return;
      applyAuraPixelColor(selectedPixelHexColor);
      closePixelCanvasModal();
    }
    window.confirmPixelColorSelection = confirmPixelColorSelection;

    function closePixelCanvasModal() {
      pixelPickerLoadRequestId++;
      isPixelCanvasLoaded = false;
      const modal = document.getElementById('pixelCanvasModal');
      const loadingEl = document.getElementById('pixelCanvasLoading');
      const loupeWrap = document.getElementById('pixelLoupeWrap');
      if (loadingEl) loadingEl.style.display = 'none';
      if (loupeWrap) loupeWrap.style.display = 'none';
      if (modal) modal.style.display = 'none';
    }
    window.closePixelCanvasModal = closePixelCanvasModal;

    // Funciones de compatibilidad
    function populatePostSelect() {
      postsData = deduplicatePosts(Array.isArray(window.postsData) ? window.postsData : postsData);
      window.postsData = postsData;
      const sel = document.getElementById('postSelect');
      if (sel) {
        sel.innerHTML = '<option value="" disabled selected>-- Seleccionar publicación para editar --</option>';
        postsData.forEach((post, index) => {
          const opt = document.createElement('option');
          opt.value = index;
          opt.textContent = `#${index + 1}: ${post.title || 'Sin Título'} (${post.date || ''}) ${post.hidden ? '[Oculto]' : ''}`;
          sel.appendChild(opt);
        });
      }
    }
    function applyCurrentPostToMemory() {
      if (typeof syncLiveBlogModalToMemory === 'function') {
        syncLiveBlogModalToMemory(true);
      }
      return true;
    }
    function saveUnifiedPost() {
      renderAdminPostsList();
      populatePostSelect();
    }
    function handlePostSelectChange(val) {
      if (val === "" || val === null || val === undefined) return;
      const idx = parseInt(val, 10);
      if (!isNaN(idx) && postsData[idx]) {
        openBlogModal(idx);
        const sel = document.getElementById('postSelect');
        if (sel) sel.value = "";
      }
    }

    /* EVENTOS Y NAVEGACIÓN CON TECLADO */
    document.addEventListener('keydown', (e) => {
      const imgModal = document.getElementById("imageModal");
      const isModalOpen = imgModal && imgModal.style.display === "flex";
      const activeEl = document.activeElement;
      const isEditingText = activeEl && (activeEl.isContentEditable || activeEl.tagName === 'INPUT' || activeEl.tagName === 'TEXTAREA' || activeEl.tagName === 'SELECT');

      if (isModalOpen && !isEditingText) {
        if (e.key === "ArrowLeft") navigateModal(-1);
        if (e.key === "ArrowRight") navigateModal(1);
      }

      if (e.key === "Escape") {
        const subModals = [
          { id: 'pixelCanvasModal', close: closePixelCanvasModal },
          { id: 'insertImageModal', close: closeInsertImageModal },
          { id: 'insertLinkModal', close: closeInsertLinkModal },
          { id: 'insertColorModal', close: closeInsertColorModal },
          { id: 'galleryMediaModal', close: typeof closeGalleryMediaModal === 'function' ? closeGalleryMediaModal : null },
          { id: 'cartConfigModal', close: typeof closeCartConfigModal === 'function' ? closeCartConfigModal : null },
          { id: 'deletePostConfirmModal', close: closeDeletePostConfirmModal }
        ];
        for (const sub of subModals) {
          const el = document.getElementById(sub.id);
          if (el && el.style.display && el.style.display !== 'none') {
            if (typeof sub.close === 'function') sub.close();
            return;
          }
        }
        if (document.getElementById('merchDetailModal')?.style.display === 'flex' && typeof closeMerchModal === 'function') {
          closeMerchModal();
          return;
        }
        if (document.getElementById('cartModal')?.style.display === 'flex' && typeof closeCartModal === 'function') {
          closeCartModal();
          return;
        }
        closeModal();
        closeBlogModal();
        document.getElementById('passwordModal').style.display = 'none';
        closeAdminModal();
      }
    });

    let clickCount = 0;
    let clickTimer = null;
    document.getElementById('adminTrigger')?.addEventListener('click', () => {
      ensureAdminModalsReady();
      clickCount++;
      clearTimeout(clickTimer);
      clickTimer = setTimeout(() => { clickCount = 0; }, 600);

      if (clickCount === 3) {
        clickCount = 0;
        clearTimeout(clickTimer);

        if (window.isUserAdmin) {
          openAdminPanel();
        } else {
          document.getElementById('passwordModal').style.display = 'flex';
        }
      }
    });

    /* FUNCIONES DE GESTIÓN DEL APARTADO EN VIVO Y SU PANEL */
    function initLiveSection() {
      renderLiveSection();
    }

    function renderLiveSection() {
      if (typeof renderAdminLiveList === 'function') {
        renderAdminLiveList();
      }
      const liveSec = document.getElementById('liveSection');
      const container = document.getElementById('liveButtonsContainer');
      const controls = document.getElementById('livePaginationControls');
      const prevBtn = document.getElementById('livePrevBtn');
      const nextBtn = document.getElementById('liveNextBtn');
      const indicator = document.getElementById('livePageIndicator');
      const descEl = document.getElementById('liveSectionDesc');

      if (descEl) {
        if (isAdminMode) {
          descEl.style.display = 'block';
          descEl.contentEditable = 'true';
          descEl.style.border = '1px dashed var(--accent-blue)';
          descEl.style.padding = '8px 10px';
          descEl.style.borderRadius = '6px';
          descEl.style.background = 'rgba(5, 5, 8, 0.7)';
          descEl.style.color = 'var(--accent-light)';
          descEl.style.outline = 'none';
          descEl.style.cursor = 'text';
          descEl.style.marginBottom = '15px';
          descEl.style.fontSize = '0.85rem';
          descEl.style.textAlign = 'center';
          descEl.setAttribute('title', 'Haz clic aquí para editar la descripción en tiempo real');

          if (!liveSectionDescription || liveSectionDescription.trim() === '') {
            descEl.innerText = '📝 [Haz clic aquí para escribir la descripción del apartado Conciertos]';
            descEl.style.color = 'var(--text-muted)';
            descEl.style.fontStyle = 'italic';
          } else {
            descEl.innerText = liveSectionDescription;
            descEl.style.color = 'var(--accent-light)';
            descEl.style.fontStyle = 'normal';
          }

          descEl.onfocus = function() {
            if (this.innerText.includes('[Haz clic aquí para escribir')) {
              this.innerText = '';
              this.style.color = 'var(--accent-light)';
              this.style.fontStyle = 'normal';
            }
          };

          descEl.onblur = function() {
            let val = this.innerText.trim();
            if (!val) {
              liveSectionDescription = '';
              descEl.innerText = '📝 [Haz clic aquí para escribir la descripción del apartado Conciertos]';
              this.style.color = 'var(--text-muted)';
              this.style.fontStyle = 'italic';
            } else {
              liveSectionDescription = val;
            }
          };

          descEl.oninput = function() {
            let val = this.innerText;
            if (!val.includes('[Haz clic aquí')) {
              liveSectionDescription = val;
            }
          };
        } else {
          descEl.contentEditable = 'false';
          descEl.style.border = 'none';
          descEl.style.padding = '0';
          descEl.style.background = 'transparent';
          descEl.style.color = 'var(--text-muted)';
          descEl.style.cursor = 'default';
          descEl.style.marginBottom = '15px';
          descEl.style.fontSize = '0.8rem';
          descEl.style.textAlign = 'center';

          if (liveSectionDescription && liveSectionDescription.trim() !== '') {
            descEl.innerText = liveSectionDescription;
            descEl.style.display = 'block';
          } else {
            descEl.innerText = '';
            descEl.style.display = 'none';
          }
        }
      }

      if (!liveSec || !container) return;

      if (!isAdminMode) {
        // MODO VISITANTE
        const activeButtons = liveButtonsData.filter(b => b.visible !== false);

        if (activeButtons.length === 0) {
          liveSec.style.display = 'none';
          return;
        }

        liveSec.style.display = 'block';

        const perPage = 3;
        const totalPages = Math.ceil(activeButtons.length / perPage);

        if (currentLivePage >= totalPages) currentLivePage = Math.max(0, totalPages - 1);
        if (currentLivePage < 0) currentLivePage = 0;

        const pageItems = activeButtons.slice(currentLivePage * perPage, (currentLivePage + 1) * perPage);

        container.innerHTML = '';
        pageItems.forEach((btn) => {
          const c1 = btn.color1 || '#ff0055';
          const c2 = btn.color2 || '#7a00ff';
          const a = document.createElement('a');
          a.href = btn.url || '#';
          a.target = '_blank';
          a.rel = 'noopener';
          a.className = 'live-button-item';
          a.style.setProperty('--live-c1', c1);
          a.style.setProperty('--live-c2', c2);
          a.style.background = `linear-gradient(135deg, ${c1}, ${c2})`;
          a.innerHTML = `<span><span class="live-dot"></span>${escapeHtmlAttr(btn.name || 'Transmisión')}</span>`;
          a.setAttribute('data-anim-color', c1);

          a.addEventListener('click', function() {
            triggerGreekCrossAnimation(a, c1, 500);
          });

          container.appendChild(a);
        });

        if (indicator) indicator.textContent = `${currentLivePage + 1} / ${totalPages || 1}`;

        if (prevBtn) prevBtn.disabled = currentLivePage === 0;
        if (nextBtn) nextBtn.disabled = currentLivePage >= totalPages - 1;

        if (controls) {
          controls.style.display = totalPages > 1 ? 'flex' : 'none';
        }
      } else {
        // MODO EDICIÓN EN TIEMPO REAL
        liveSec.style.display = 'block';
        if (controls) controls.style.display = 'none';

        container.innerHTML = '';

        if (liveButtonsData.length === 0) {
          const emptyMsg = document.createElement('p');
          emptyMsg.style.cssText = 'color: var(--text-muted); font-style: italic; text-align: center; padding: 10px; font-size: 0.82rem;';
          emptyMsg.textContent = 'No hay botones en vivo creados. Presiona "Agregar Nuevo Botón" abajo.';
          container.appendChild(emptyMsg);
        }

        liveButtonsData.forEach((btn, index) => {
          const wrapper = document.createElement('div');
          wrapper.className = 'live-button-wrapper';
          wrapper.style.marginBottom = '16px';
          wrapper.draggable = true;
          wrapper.dataset.index = index;

          const color1 = btn.color1 || '#ff0055';
          const color2 = btn.color2 || '#7a00ff';
          const name = btn.name || '';
          const url = btn.url || '';
          const isVisible = btn.visible !== false;

          // El botón tal como se ve
          const a = document.createElement('a');
          a.href = url || '#';
          a.target = '_blank';
          a.rel = 'noopener';
          a.className = 'live-button-item';
          a.style.setProperty('--live-c1', color1);
          a.style.setProperty('--live-c2', color2);
          a.style.background = `linear-gradient(135deg, ${color1}, ${color2})`;
          a.style.cursor = 'pointer';
          a.title = 'Haz clic para desplegar u ocultar el menú de edición de este botón';
          if (!isVisible) {
            a.style.opacity = '0.45';
            a.style.filter = 'grayscale(50%)';
          }
          a.innerHTML = `<span><span class="live-dot"></span>${escapeHtmlAttr(name || 'Transmisión')}</span> <span style="font-size: 0.82rem; opacity: 0.85;">⚙️ ➔</span>`;
          a.setAttribute('data-anim-color', color1);

          a.addEventListener('click', function(e) {
            e.preventDefault();
            toggleLiveBtnEditorBox(index);
          });

          wrapper.appendChild(a);

          // Caja de parámetros debajo de cada botón (oculta por defecto, se despliega al hacer clic en el botón)
          const editorBox = document.createElement('div');
          editorBox.className = 'live-btn-editor-box';
          editorBox.id = `liveBtnEditorBox_${index}`;
          editorBox.style.cssText = 'display: none; background: rgba(10, 12, 18, 0.95); border: 1px solid var(--accent-blue); border-radius: 6px; padding: 10px; margin-top: 5px; font-size: 0.82rem; flex-direction: column; gap: 8px; box-shadow: 0 4px 15px rgba(0,0,0,0.5);';

          editorBox.innerHTML = `
            <div style="display: flex; justify-content: space-between; align-items: center; gap: 6px; border-bottom: 1px solid rgba(90,116,191,0.2); padding-bottom: 6px;">
              <span style="font-weight: bold; color: var(--accent-light); display: inline-flex; align-items: center; gap: 6px;">
                <span class="live-drag-handle" title="Arrastra para reordenar" style="cursor: grab; font-size: 1.1rem; color: var(--accent-light); user-select: none;">☰</span>
                ⚙️ Parámetros Botón #${index + 1} ${!isVisible ? '<span style="color: #ff6666; font-size: 0.75rem;">(Oculto)</span>' : ''}
              </span>
              <div style="display: flex; gap: 4px; align-items: center;">
                <button type="button" class="btn-live-toggle ${!isVisible ? 'off' : ''}" onclick="toggleLiveButtonVisibilityAdmin(${index})" title="${isVisible ? 'Ocultar' : 'Mostrar'}" style="padding: 2px 6px; font-size: 0.78rem;">
                  ${isVisible ? '👁️' : '🙈'}
                </button>
                <button type="button" class="btn-live-delete" onclick="deleteLiveButtonAdmin(${index})" title="Eliminar botón" style="padding: 2px 6px; font-size: 0.78rem;">🗑️</button>
                <button type="button" class="admin-btn" onclick="toggleLiveBtnEditorBox(${index})" title="Cerrar edición" style="padding: 2px 6px; font-size: 0.78rem; background: rgba(255,255,255,0.1); color: #fff;">✕</button>
              </div>
            </div>

            <div>
              <label style="display: block; font-size: 0.75rem; color: var(--accent-light); margin-bottom: 2px; font-weight: bold;">Nombre del Botón:</label>
              <input type="text" value="${escapeHtmlAttr(name)}" placeholder="Ej: Transmisión en YouTube" oninput="updateLiveBtnProp(${index}, 'name', this.value)" style="width: 100%; background: #050508; border: 1px solid var(--border-color); color: #fff; padding: 5px 8px; border-radius: 4px; font-size: 0.82rem;">
            </div>

            <div>
              <label style="display: block; font-size: 0.75rem; color: var(--accent-light); margin-bottom: 2px; font-weight: bold;">Enlace / URL de Redirección:</label>
              <input type="text" value="${escapeHtmlAttr(url)}" placeholder="https://..." oninput="updateLiveBtnProp(${index}, 'url', this.value)" style="width: 100%; background: #050508; border: 1px solid var(--border-color); color: #fff; padding: 5px 8px; border-radius: 4px; font-size: 0.82rem;">
            </div>

            <div style="display: flex; gap: 8px;">
              <div style="flex: 1;">
                <label style="display: block; font-size: 0.75rem; color: var(--accent-light); margin-bottom: 2px; font-weight: bold;">Color Inicio:</label>
                <input type="color" value="${color1}" oninput="updateLiveBtnProp(${index}, 'color1', this.value)" style="width: 100%; height: 28px; padding: 1px; cursor: pointer; background: transparent; border: 1px solid var(--border-color); border-radius: 4px;">
              </div>
              <div style="flex: 1;">
                <label style="display: block; font-size: 0.75rem; color: var(--accent-light); margin-bottom: 2px; font-weight: bold;">Color Fin:</label>
                <input type="color" value="${color2}" oninput="updateLiveBtnProp(${index}, 'color2', this.value)" style="width: 100%; height: 28px; padding: 1px; cursor: pointer; background: transparent; border: 1px solid var(--border-color); border-radius: 4px;">
              </div>
            </div>
          `;

          // Eventos Drag and Drop para Botones en Vivo
          wrapper.addEventListener('dragstart', (e) => {
            if (e.target.tagName === 'INPUT' || e.target.tagName === 'BUTTON' || e.target.tagName === 'SELECT') {
              e.preventDefault();
              return;
            }
            e.dataTransfer.setData('text/plain', index);
            wrapper.style.opacity = '0.5';
          });

          wrapper.addEventListener('dragend', () => {
            wrapper.style.opacity = '1';
          });

          wrapper.addEventListener('dragover', (e) => e.preventDefault());

          wrapper.addEventListener('drop', (e) => {
            e.preventDefault();
            const fromIdx = parseInt(e.dataTransfer.getData('text/plain'), 10);
            if (!isNaN(fromIdx) && fromIdx !== index) {
              moveLiveButtonOrder(fromIdx, index - fromIdx);
            }
          });

          let touchLiveStartIdx = null;
          wrapper.addEventListener('touchstart', (e) => {
            if (e.target.tagName === 'INPUT' || e.target.tagName === 'BUTTON' || e.target.tagName === 'SELECT') return;
            touchLiveStartIdx = index;
          }, { passive: true });

          wrapper.addEventListener('touchend', (e) => {
            if (touchLiveStartIdx === null) return;
            const touch = e.changedTouches[0];
            const targetEl = document.elementFromPoint(touch.clientX, touch.clientY);
            if (targetEl) {
              const closestWrapper = targetEl.closest('.live-button-wrapper');
              if (closestWrapper) {
                const dropIndex = parseInt(closestWrapper.dataset.index, 10);
                if (!isNaN(dropIndex) && dropIndex !== touchLiveStartIdx) {
                  moveLiveButtonOrder(touchLiveStartIdx, dropIndex - touchLiveStartIdx);
                }
              }
            }
            touchLiveStartIdx = null;
          });

          wrapper.appendChild(editorBox);
          container.appendChild(wrapper);
        });

        const addBtn = document.createElement('button');
        addBtn.type = 'button';
        addBtn.className = 'admin-btn';
        addBtn.onclick = addLiveButtonAdmin;
        addBtn.style.cssText = 'width: 100%; margin-top: 10px; background: rgba(90, 116, 191, 0.2); border: 1px dashed var(--accent-blue); color: var(--accent-light); padding: 8px; font-size: 0.85rem; border-radius: 6px; cursor: pointer;';
        addBtn.innerHTML = '➕ Agregar Nuevo Botón En Vivo';
        container.appendChild(addBtn);
      }
    }

    function moveLivePage(dir) {
      currentLivePage += dir;
      renderLiveSection();
    }

    function reorderLiveButtonsInAdmin(fromIndex, toIndex) {
      if (fromIndex === toIndex || fromIndex < 0 || toIndex < 0 || fromIndex >= liveButtonsData.length || toIndex >= liveButtonsData.length) return;
      const item = liveButtonsData.splice(fromIndex, 1)[0];
      liveButtonsData.splice(toIndex, 0, item);
      renderLiveSection();
    }

    function moveLiveButtonOrder(index, dir) {
      const targetIndex = index + dir;
      if (targetIndex >= 0 && targetIndex < liveButtonsData.length) {
        reorderLiveButtonsInAdmin(index, targetIndex);
      }
    }

    function renderAdminLiveList() {
      const toggleBtns = document.querySelectorAll('#toggleLiveSectionVisibilityBtn');

      toggleBtns.forEach(btn => {
        if (isAdminMode) {
          btn.style.display = 'inline-block';
          if (isLiveSectionVisible) {
            btn.innerHTML = '👁️ Visible (Ocultar)';
            btn.style.background = 'rgba(50, 180, 80, 0.2)';
            btn.style.borderColor = '#32b450';
            btn.style.color = '#80ff9f';
          } else {
            btn.innerHTML = '🔴 Oculto para visitantes (Mostrar)';
            btn.style.background = 'rgba(220, 50, 50, 0.2)';
            btn.style.borderColor = '#ff6666';
            btn.style.color = '#ff9999';
          }
        } else {
          btn.style.display = 'none';
        }
      });
    }

    function addLiveButtonAdmin() {
      liveButtonsData.push({
        id: Date.now(),
        name: "Nueva Transmisión",
        url: "https://",
        color1: "#8C1A1A",
        color2: "#2A0000",
        visible: true
      });
      renderLiveSection();
    }

    function deleteLiveButtonAdmin(index) {
      if (index >= 0 && index < liveButtonsData.length) {
        liveButtonsData.splice(index, 1);
        renderLiveSection();
      }
    }

    function toggleLiveBtnEditorBox(index) {
      const box = document.getElementById(`liveBtnEditorBox_${index}`);
      if (!box) return;
      const isHidden = box.style.display === 'none' || !box.style.display;
      box.style.display = isHidden ? 'flex' : 'none';
    }
    window.toggleLiveBtnEditorBox = toggleLiveBtnEditorBox;

    function toggleAllLiveCards(collapse) {
      const targetDisplay = collapse ? 'none' : 'flex';
      document.querySelectorAll('[id^="liveBtnEditorBox_"]').forEach(box => {
        box.style.display = targetDisplay;
      });
      document.querySelectorAll('#adminLiveButtonsList details').forEach(det => {
        if (collapse) det.removeAttribute('open');
        else det.setAttribute('open', '');
      });
    }
    window.toggleAllLiveCards = toggleAllLiveCards;

    function toggleLiveButtonVisibilityAdmin(index) {
      if (liveButtonsData[index]) {
        liveButtonsData[index].visible = !(liveButtonsData[index].visible !== false);
        renderLiveSection();
      }
    }

    function updateLiveBtnProp(index, prop, value) {
      if (liveButtonsData[index]) {
        liveButtonsData[index][prop] = value;

        if (isAdminMode) {
          const container = document.getElementById('liveButtonsContainer');
          if (container) {
            const wrappers = container.querySelectorAll('.live-button-wrapper');
            if (wrappers[index]) {
              const a = wrappers[index].querySelector('a.live-button-item');
              const color1 = liveButtonsData[index].color1 || '#ff0055';
              const color2 = liveButtonsData[index].color2 || '#7a00ff';
              const name = liveButtonsData[index].name || 'Transmisión';
              const url = liveButtonsData[index].url || '#';
              const isVisible = liveButtonsData[index].visible !== false;

              if (a) {
                a.href = url;
                a.style.background = `linear-gradient(135deg, ${color1}, ${color2})`;
                if (!isVisible) {
                  a.style.opacity = '0.45';
                  a.style.filter = 'grayscale(50%)';
                } else {
                  a.style.opacity = '1';
                  a.style.filter = 'none';
                }
                a.innerHTML = `<span><span class="live-dot"></span>${escapeHtmlAttr(name)}</span>`;
                a.setAttribute('data-anim-color', color1);
              }
            }
          }
        } else {
          renderLiveSection();
        }
      }
    }

    function updateLiveDescriptionFromAdmin(val) {
      liveSectionDescription = val;
      renderLiveSection();
    }

    function toggleLiveSectionGlobalVisibility() {
      isLiveSectionVisible = !isLiveSectionVisible;
      renderAdminLiveList();
      renderLiveSection();
    }

    function saveLiveButtonsChanges() {
      renderLiveSection();
      window.liveButtonsData = liveButtonsData;
      window.isLiveSectionVisible = isLiveSectionVisible;
      window.liveSectionDescription = liveSectionDescription;
      if (typeof window.persistSiteDataInRealtime === 'function') {
        window.persistSiteDataInRealtime();
      }
      if (typeof showToastNotification === 'function') {
        showToastNotification('¡Cambios guardados y aplicados en tiempo real en Conciertos!');
      } else {
        console.log('Cambios guardados en Conciertos');
      }
    }

    window.deleteLiveButtonAdmin = deleteLiveButtonAdmin;
    window.toggleLiveButtonVisibilityAdmin = toggleLiveButtonVisibilityAdmin;
    window.moveLiveButtonOrder = moveLiveButtonOrder;
    window.reorderLiveButtonsInAdmin = reorderLiveButtonsInAdmin;
    window.addLiveButtonAdmin = addLiveButtonAdmin;
    window.updateLiveBtnProp = updateLiveBtnProp;
    window.updateLiveDescriptionFromAdmin = updateLiveDescriptionFromAdmin;
    window.toggleLiveSectionGlobalVisibility = toggleLiveSectionGlobalVisibility;
    window.saveLiveButtonsChanges = saveLiveButtonsChanges;
    window.moveLivePage = moveLivePage;
    if (typeof handlePostImageAutoCaption === 'function') {
      window.handlePostImageAutoCaption = handlePostImageAutoCaption;
    }
    window.createNewGalleryInline = createNewGalleryInline;
    window.syncGalleryColorLive = syncGalleryColorLive;
    window.openGalleryMediaModal = openGalleryMediaModal;
    window.closeGalleryMediaModal = closeGalleryMediaModal;
    window.confirmGalleryMediaModal = confirmGalleryMediaModal;
    window.handleGalleryMediaModalFileChange = handleGalleryMediaModalFileChange;
    window.confirmDeleteGalleryPhoto = confirmDeleteGalleryPhoto;
    window.handleModalLiveCaptionInput = handleModalLiveCaptionInput;
    window.moveModalGalleryPhoto = moveModalGalleryPhoto;
    window.openInsertLinkModal = openInsertLinkModal;
    window.closeInsertLinkModal = closeInsertLinkModal;
    window.confirmInsertLinkModal = confirmInsertLinkModal;
    window.openInsertColorModal = openInsertColorModal;
    window.closeInsertColorModal = closeInsertColorModal;
    window.confirmInsertColorModal = confirmInsertColorModal;
    window.selectColorPreset = selectColorPreset;
    window.syncTextColorFromPicker = syncTextColorFromPicker;
    window.syncTextColorFromInput = syncTextColorFromInput;
    window.updateColorPreview = updateColorPreview;
    window.insertFormat = insertFormat;

    /* FUNCIONALIDAD DEL APARTADO DE MERCH Y CARRITO DE COMPRAS */
    function initMerchSection() {
      // Asegurar categoría por defecto en items existentes
      merchItemsData.forEach(item => {
        if (!item.category || item.category.trim() === '') {
          item.category = 'Camisetas';
        }
      });

      initCart();
      renderMerchSection();
    }

    function getMerchItemsPerPage() {
      if (window.innerWidth <= 550) return 1;
      if (window.innerWidth <= 850) return 2;
      return 3;
    }

    function setMerchCategory(cat) {
      currentMerchCategory = cat;
      currentMerchPage = 0;
      renderMerchSection();
    }

    var merchCardSlideshowIntervals = [];
    var lastRenderedMerchPerPage = null;
    let pendingMerchCacheTimer = null;

    function clearMerchCardIntervals() {
      if (Array.isArray(merchCardSlideshowIntervals)) {
        merchCardSlideshowIntervals.forEach(id => clearInterval(id));
      }
      merchCardSlideshowIntervals = [];
    }

    function getItemImages(item) {
      if (!item) return [''];
      let list = [];
      if (item.image && typeof item.image === 'string' && item.image.trim()) {
        list.push(item.image.trim());
      }
      if (Array.isArray(item.images)) {
        item.images.forEach(img => {
          if (img && typeof img === 'string' && img.trim() && !list.includes(img.trim())) {
            list.push(img.trim());
          }
        });
      } else if (typeof item.images === 'string' && item.images.trim()) {
        let split = item.images.split(/[\n,]+/);
        split.forEach(img => {
          let trimmed = img.trim();
          if (trimmed && !list.includes(trimmed)) {
            list.push(trimmed);
          }
        });
      }
      return list.length > 0 ? list : [''];
    }

    function persistMerchLocalCache() {
      if (pendingMerchCacheTimer) {
        clearTimeout(pendingMerchCacheTimer);
        pendingMerchCacheTimer = null;
      }
      window.merchItemsData = merchItemsData;
      window.merchCategories = merchCategories;
      window.cartConfig = cartConfig;
      window.isMerchSectionVisible = isMerchSectionVisible;
      window.merchSectionDescription = merchSectionDescription;
      try {
        const cachedRaw = localStorage.getItem('blutu_live_site_data');
        const parsed = cachedRaw ? JSON.parse(cachedRaw) : {};
        parsed.merch = {
          items: merchItemsData,
          categories: merchCategories,
          cartConfig: cartConfig,
          isVisible: isMerchSectionVisible,
          description: merchSectionDescription
        };
        parsed.updatedAt = Date.now();
        localStorage.setItem('blutu_live_site_data', JSON.stringify(parsed));
      } catch (e) {}
    }

    function schedulePersistMerchLocalCache() {
      window.merchItemsData = merchItemsData;
      window.merchCategories = merchCategories;
      window.cartConfig = cartConfig;
      window.isMerchSectionVisible = isMerchSectionVisible;
      window.merchSectionDescription = merchSectionDescription;
      if (pendingMerchCacheTimer) clearTimeout(pendingMerchCacheTimer);
      pendingMerchCacheTimer = setTimeout(() => {
        pendingMerchCacheTimer = null;
        persistMerchLocalCache();
      }, 850);
    }

    function flushAllPendingLocalCaches() {
      if (typeof pendingLiveBlogDomSyncTimer !== 'undefined' && pendingLiveBlogDomSyncTimer) {
        syncLiveBlogModalToMemory(true);
      }
      if (pendingGalleryCacheTimer) persistGalleryLocalCache();
      if (pendingPostsVaultTimer) persistPostsToLocalVaults();
      if (pendingMerchCacheTimer) persistMerchLocalCache();
      if (typeof pendingGamesLocalCacheTimer !== 'undefined' && pendingGamesLocalCacheTimer) persistGamesLocalCache();
      flushPendingCloudSyncQueueToStorage();
    }
    window.flushAllPendingLocalCaches = flushAllPendingLocalCaches;

    window.addEventListener('pagehide', flushAllPendingLocalCaches, { passive: true });
    window.addEventListener('beforeunload', flushAllPendingLocalCaches);
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) flushAllPendingLocalCaches();
    });

    function getCleanMerchImages(item) {
      if (!item) return [];
      const list = [];
      if (item.image && typeof item.image === 'string' && item.image.trim()) {
        list.push(item.image.trim());
      }
      if (Array.isArray(item.images)) {
        item.images.forEach(img => {
          if (img && typeof img === 'string' && img.trim() && !list.includes(img.trim())) {
            list.push(img.trim());
          }
        });
      } else if (typeof item.images === 'string' && item.images.trim()) {
        item.images.split(/[\n,]+/).forEach(img => {
          const trimmed = img.trim();
          if (trimmed && !list.includes(trimmed)) {
            list.push(trimmed);
          }
        });
      }
      return list;
    }

    function updateMerchVisibilityToggleButtons() {
      const hiddenBadge = document.getElementById('merchSectionHiddenBadge');
      if (hiddenBadge) {
        hiddenBadge.style.display = (isAdminMode && !isMerchSectionVisible) ? 'inline-block' : 'none';
      }
      document.querySelectorAll('.toggle-merch-section-btn').forEach(btn => {
        if (isAdminMode) {
          btn.style.display = 'inline-flex';
          if (isMerchSectionVisible) {
            btn.innerHTML = '👁️‍🗨️ Visible';
            btn.style.background = 'rgba(50, 180, 80, 0.2)';
            btn.style.borderColor = '#32b450';
            btn.style.color = '#80ff9f';
          } else {
            btn.innerHTML = '🙈 Oculto';
            btn.style.background = 'rgba(200, 150, 50, 0.25)';
            btn.style.borderColor = '#ffd280';
            btn.style.color = '#ffd280';
          }
        } else {
          btn.style.display = 'none';
        }
      });
    }

    function isItemAgotado(item) {
      if (!item) return false;
      const b = (item.badge || '').toString().trim().toLowerCase();
      return b.includes('agotad') || b.includes('sold out') || b.includes('sin stock');
    }

    function getMerchBadgesHTML(item) {
      if (!item) return '';
      const isAgotado = isItemAgotado(item);

      if (isAgotado) {
        const badgeText = (item.badge && item.badge.trim()) ? escapeHtmlAttr(item.badge.trim()) : 'Agotado';
        return `<span class="merch-badge agotado">${badgeText}</span>`;
      }

      if (item.badge && item.badge.trim() !== '' && item.badge.trim().toLowerCase() !== 'disponible') {
        return `<span class="merch-badge">${escapeHtmlAttr(item.badge.trim())}</span>`;
      }

      return '';
    }

    function toggleMerchItemAgotado(index) {
      const item = merchItemsData[index];
      if (!item) return;
      const isCurrentlyAgotado = isItemAgotado(item);
      item.badge = isCurrentlyAgotado ? '' : 'Agotado';
      persistMerchLocalCache();
      renderMerchSection();
      const merchModal = document.getElementById('merchDetailModal');
      if (merchModal && merchModal.style.display === 'flex' && currentModalMerchIdx === index) {
        renderMerchDetailModalContent(index, currentModalImageIdx);
      }
    }

    function handleInlineMerchSectionDescInput(el) {
      merchSectionDescription = (el.textContent || '').replace(/\r?\n/g, ' ').trim();
      schedulePersistMerchLocalCache();
    }

    function handleInlineMerchPropInput(realIdx, prop, el) {
      const item = merchItemsData[realIdx];
      if (!item || !el) return;
      const rawVal = (el.textContent || '').replace(/\r?\n/g, ' ').trim();
      item[prop] = rawVal;
      schedulePersistMerchLocalCache();

      if (prop === 'badge') {
        const agotado = isItemAgotado(item);
        el.classList.toggle('agotado', agotado);
        const cardEl = document.getElementById(`merchCard_${realIdx}`);
        if (cardEl) cardEl.classList.toggle('agotado-card', agotado);
        const stockBtn = document.getElementById(`merchCardStockBtn_${realIdx}`);
        if (stockBtn) {
          stockBtn.innerHTML = agotado ? '✅ Poner Stock' : '🚫 Agotar';
        }
        const modalStockBtn = document.getElementById(`merchModalStockBtn_${realIdx}`);
        if (modalStockBtn) {
          modalStockBtn.innerHTML = agotado ? '✅ Poner en Stock' : '🚫 Marcar Agotado';
        }
      }

      // Si se edita dentro del modal abierto, reflejar también en la tarjeta de fondo sin robar el foco
      const modalOpen = document.getElementById('merchDetailModal')?.style.display === 'flex' && currentModalMerchIdx === realIdx;
      if (modalOpen && el.closest('#merchDetailModal')) {
        const titleEl = document.getElementById(`merchCardTitle_${realIdx}`);
        if (titleEl && prop === 'name') titleEl.textContent = item.name || '';
        const descEl = document.getElementById(`merchCardDesc_${realIdx}`);
        if (descEl && prop === 'description') descEl.textContent = item.description || '';
        const origEl = document.getElementById(`merchCardOrigPrice_${realIdx}`);
        if (origEl && prop === 'originalPrice') origEl.textContent = item.originalPrice || '';
        const currEl = document.getElementById(`merchCardCurrPrice_${realIdx}`);
        if (currEl && prop === 'price') currEl.textContent = item.price || '';
        const badgeEl = document.getElementById(`merchCardLiveBadge_${realIdx}`);
        if (badgeEl && prop === 'badge') {
          badgeEl.textContent = (item.badge && item.badge.trim().toLowerCase() !== 'disponible') ? item.badge.trim() : '';
          badgeEl.classList.toggle('agotado', isItemAgotado(item));
        }
      }
    }

    function handleInlineMerchCategorySelect(realIdx, newCat) {
      if (!merchItemsData[realIdx]) return;
      merchItemsData[realIdx].category = newCat;
      if (newCat && !merchCategories.includes(newCat)) {
        merchCategories.push(newCat);
      }
      persistMerchLocalCache();
      renderMerchSection();
      const merchModal = document.getElementById('merchDetailModal');
      if (merchModal && merchModal.style.display === 'flex' && currentModalMerchIdx === realIdx) {
        renderMerchDetailModalContent(realIdx, currentModalImageIdx);
      }
    }

    function addNewCategoryInline() {
      let baseName = 'Nueva Categoría';
      let candidate = baseName;
      let counter = 2;
      while (merchCategories.includes(candidate)) {
        candidate = `${baseName} ${counter++}`;
      }
      merchCategories.push(candidate);
      currentMerchCategory = candidate;
      currentMerchPage = 0;
      persistMerchLocalCache();
      renderMerchSection();
      setTimeout(() => {
        const editableTab = document.querySelector('#merchCategoryTabs .merch-category-btn.active .merch-cat-tab-editable');
        if (editableTab) {
          editableTab.focus();
          const range = document.createRange();
          range.selectNodeContents(editableTab);
          const sel = window.getSelection();
          if (sel) {
            sel.removeAllRanges();
            sel.addRange(range);
          }
        }
      }, 40);
    }

    function renderMerchSection() {
      clearMerchCardIntervals();

      const merchSec = document.getElementById('merchSection');
      const container = document.getElementById('merchContainer');
      const tabsContainer = document.getElementById('merchCategoryTabs');
      const controls = document.getElementById('merchPaginationControls');
      const prevBtn = document.getElementById('merchPrevBtn');
      const nextBtn = document.getElementById('merchNextBtn');
      const indicator = document.getElementById('merchPageIndicator');
      const descEl = document.getElementById('merchSectionDesc');

      updateMerchVisibilityToggleButtons();

      const legacyMobileBar = document.getElementById('mobileMerchAdminBar');
      if (legacyMobileBar) legacyMobileBar.remove();

      if (descEl) {
        if (isAdminMode) {
          descEl.style.display = 'block';
          descEl.contentEditable = 'true';
          descEl.spellcheck = false;
          descEl.classList.add('merch-editable-field');
          descEl.setAttribute('data-placeholder', 'Subtítulo de Merch (deja vacío para ocultarlo a visitantes)...');
          if (document.activeElement !== descEl) {
            descEl.textContent = merchSectionDescription || '';
          }
          descEl.oninput = function() { handleInlineMerchSectionDescInput(descEl); };
          descEl.onkeydown = function(ev) {
            if (ev.key === 'Enter') {
              ev.preventDefault();
              descEl.blur();
            }
          };
        } else {
          descEl.contentEditable = 'false';
          descEl.classList.remove('merch-editable-field');
          descEl.removeAttribute('data-placeholder');
          descEl.oninput = null;
          descEl.onkeydown = null;
          descEl.textContent = merchSectionDescription || '';
          descEl.style.display = (merchSectionDescription && merchSectionDescription.trim() !== '') ? 'block' : 'none';
        }
      }

      if (!merchSec || !container) return;

      const activeItems = merchItemsData.filter(item => item.visible !== false);

      if (!isAdminMode) {
        if (!isMerchSectionVisible || activeItems.length === 0) {
          merchSec.style.display = 'none';
          return;
        }
      }

      merchSec.style.display = 'block';

      // Sincronizar categorías usadas en productos hacia merchCategories cuando está en modo edición
      if (isAdminMode) {
        merchItemsData.forEach(item => {
          const c = (item.category || '').trim();
          if (c && c !== 'Todas' && !merchCategories.includes(c)) {
            merchCategories.push(c);
          }
        });
      }

      let categoriesList = ['Todas'];
      if (isAdminMode) {
        categoriesList = ['Todas', ...merchCategories];
      } else {
        const categoriesSet = new Set();
        // Respetar el orden configurado en merchCategories primero
        merchCategories.forEach(cat => {
          const trimmed = (cat || '').trim();
          if (trimmed && activeItems.some(it => (it.category || '').trim() === trimmed)) {
            categoriesSet.add(trimmed);
          }
        });
        activeItems.forEach(item => {
          if (item.category && item.category.trim() !== '') {
            categoriesSet.add(item.category.trim());
          }
        });
        categoriesList = ['Todas', ...Array.from(categoriesSet)];
      }

      if (!categoriesList.includes(currentMerchCategory)) {
        currentMerchCategory = 'Todas';
      }

      if (tabsContainer) {
        tabsContainer.innerHTML = '';
        if (isAdminMode) {
          categoriesList.forEach(cat => {
            const isAct = cat === currentMerchCategory;
            const catIdx = merchCategories.indexOf(cat);
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = `merch-category-btn ${isAct ? 'active' : ''}`;

            if (cat !== 'Todas' && catIdx >= 0) {
              btn.draggable = true;
              btn.dataset.catIndex = catIdx;
              btn.addEventListener('dragstart', (e) => {
                if (e.target && e.target.isContentEditable) {
                  e.preventDefault();
                  return;
                }
                e.dataTransfer.setData('text/plain', String(catIdx));
                btn.style.opacity = '0.5';
              });
              btn.addEventListener('dragend', () => { btn.style.opacity = '1'; });
              btn.addEventListener('dragover', (e) => e.preventDefault());
              btn.addEventListener('drop', (e) => {
                e.preventDefault();
                const fromIdx = parseInt(e.dataTransfer.getData('text/plain'), 10);
                if (!isNaN(fromIdx) && fromIdx !== catIdx) {
                  moveCategoryOrder(fromIdx, catIdx - fromIdx);
                }
              });
            }

            if (isAct && cat !== 'Todas' && catIdx >= 0) {
              const span = document.createElement('span');
              span.className = 'merch-cat-tab-editable';
              span.contentEditable = 'true';
              span.spellcheck = false;
              span.title = 'Haz clic para renombrar esta categoría';
              span.textContent = cat;
              span.addEventListener('click', (ev) => ev.stopPropagation());
              span.addEventListener('keydown', (ev) => {
                ev.stopPropagation();
                if (ev.key === 'Enter') {
                  ev.preventDefault();
                  span.blur();
                }
              });
              span.addEventListener('blur', () => {
                const nextName = (span.textContent || '').replace(/\r?\n/g, ' ').trim();
                if (nextName && nextName !== cat) {
                  updateCategoryName(catIdx, nextName);
                } else {
                  span.textContent = cat;
                }
              });
              btn.appendChild(span);

              const delSpan = document.createElement('span');
              delSpan.textContent = '×';
              delSpan.title = 'Eliminar categoría';
              delSpan.style.cssText = 'margin-left: 7px; color: #ff8a8a; font-weight: bold; font-size: 1rem; line-height: 1; cursor: pointer; opacity: 0.85;';
              delSpan.onclick = (ev) => {
                ev.stopPropagation();
                deleteCategoryFromAdmin(catIdx);
              };
              btn.appendChild(delSpan);
            } else {
              btn.textContent = cat;
              btn.onclick = () => setMerchCategory(cat);
            }

            tabsContainer.appendChild(btn);
          });

          const addCatBtn = document.createElement('button');
          addCatBtn.type = 'button';
          addCatBtn.className = 'merch-category-btn merch-cat-add-btn';
          addCatBtn.title = 'Crear nueva categoría de Merch';
          addCatBtn.textContent = '+ Categoría';
          addCatBtn.onclick = () => addNewCategoryInline();
          tabsContainer.appendChild(addCatBtn);
          tabsContainer.style.display = 'flex';
        } else if (categoriesList.length > 1) {
          categoriesList.forEach(cat => {
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = `merch-category-btn ${cat === currentMerchCategory ? 'active' : ''}`;
            btn.textContent = cat;
            btn.onclick = () => setMerchCategory(cat);
            tabsContainer.appendChild(btn);
          });
          tabsContainer.style.display = 'flex';
        } else {
          tabsContainer.style.display = 'none';
        }
      }

      const sourceItems = isAdminMode ? merchItemsData : activeItems;
      let filteredItems = sourceItems;
      if (currentMerchCategory && currentMerchCategory !== 'Todas') {
        filteredItems = sourceItems.filter(item => (item.category || (merchCategories[0] || 'Camisetas')) === currentMerchCategory);
      }

      const perPage = getMerchItemsPerPage();
      lastRenderedMerchPerPage = perPage;
      const totalPages = Math.ceil(filteredItems.length / perPage);

      if (currentMerchPage >= totalPages) currentMerchPage = Math.max(0, totalPages - 1);
      if (currentMerchPage < 0) currentMerchPage = 0;

      const pageItems = filteredItems.slice(currentMerchPage * perPage, (currentMerchPage + 1) * perPage);

      container.innerHTML = '';

      if (filteredItems.length === 0) {
        if (isAdminMode) {
          container.innerHTML = `
            <div style="grid-column: 1/-1; text-align: center; padding: 28px 16px; border: 1px dashed rgba(90, 116, 191, 0.45); border-radius: 10px; background: rgba(5, 5, 8, 0.45);">
              <p style="color: var(--text-muted); font-style: italic; margin-bottom: 12px;">No hay productos en "${escapeHtmlAttr(currentMerchCategory)}".</p>
              <button type="button" class="read-more-btn" onclick="createNewMerchInModal()" style="padding: 6px 16px; font-size: 0.85rem;">➕ Crear Producto aquí</button>
            </div>
          `;
        } else {
          container.innerHTML = `<p style="grid-column: 1/-1; text-align: center; color: var(--text-muted); font-style: italic; padding: 25px;">No hay productos en la categoría "${escapeHtmlAttr(currentMerchCategory)}".</p>`;
        }
      } else {
        pageItems.forEach((item) => {
          const realIdx = merchItemsData.indexOf(item);
          const isAgotado = isItemAgotado(item);
          const isHiddenItem = item.visible === false;
          const card = document.createElement('div');
          card.id = `merchCard_${realIdx}`;
          card.className = `merch-card ${isAgotado ? 'agotado-card' : ''} ${(isAdminMode && isHiddenItem) ? 'admin-hidden-merch-card' : ''}`;
          card.style.position = 'relative';

          const cleanImages = getCleanMerchImages(item);
          const images = getItemImages(item);
          const firstImg = cleanImages[0] || '';

          if (!isAdminMode) {
            const categoryBadge = item.category ? `<span id="merchCardCategoryBadge_${realIdx}" class="merch-category-badge">${escapeHtmlAttr(item.category)}</span>` : `<span id="merchCardCategoryBadge_${realIdx}" class="merch-category-badge" style="display:none;"></span>`;

            let priceDisplayHTML = escapeHtmlAttr(item.price || '');
            if (item.originalPrice && item.originalPrice.trim() !== '' && item.originalPrice !== item.price) {
              priceDisplayHTML = `<span style="text-decoration: line-through; color: var(--text-muted); font-size: 0.85em; margin-right: 6px;">${escapeHtmlAttr(item.originalPrice)}</span> <span style="color: var(--accent-light); font-weight: bold;">${escapeHtmlAttr(item.price)}</span>`;
            }

            const imgHTML = firstImg ? `<img id="merchCardImg_${realIdx}" src="${firstImg}" alt="${escapeHtmlAttr(item.name)}" style="transition: opacity 0.3s ease;">` : `<div style="color:var(--text-muted); padding:30px 0; font-size:2rem; display:flex; align-items:center; justify-content:center;"><span class="blutu-cart-icon" style="width:40px; height:40px;"></span></div>`;

            card.innerHTML = `
              <div class="merch-img-wrapper" onclick="openMerchDetailModal(${realIdx})" title="Ver detalle del producto">
                ${imgHTML}
                ${cleanImages.length > 1 ? `
                  <div class="merch-img-dots" id="merchCardDots_${realIdx}">
                    ${cleanImages.map((_, i) => `<span class="merch-img-dot ${i===0?'active':''}"></span>`).join('')}
                  </div>
                ` : ''}
                <div id="merchCardBadgeContainer_${realIdx}" class="merch-badge-container">${getMerchBadgesHTML(item)}</div>
              </div>
              <div class="merch-card-body">
                <div class="merch-card-info">
                  <div>${categoryBadge}</div>
                  <h3 id="merchCardTitle_${realIdx}" class="merch-title" onclick="openMerchDetailModal(${realIdx})" style="cursor:pointer;" title="Ver detalle">${escapeHtmlAttr(item.name)}</h3>
                  <div id="merchCardPrice_${realIdx}" class="merch-price">${priceDisplayHTML}</div>
                  <p id="merchCardDesc_${realIdx}" class="merch-desc">${escapeHtmlAttr(item.description || '')}</p>
                </div>
                <div id="merchCardActions_${realIdx}" class="merch-actions-row">
                  ${isAgotado ? `
                    <button type="button" class="merch-add-cart-btn disabled" disabled title="Producto Agotado">
                      <span>🚫 Agotado</span>
                    </button>
                  ` : `
                    <button type="button" class="merch-add-cart-btn" onclick="addToCart(event, ${realIdx}, 1, false)" title="Añadir este producto al carrito">
                      <span class="blutu-cart-icon"></span>
                      <span>Añadir al Carrito</span>
                    </button>
                  `}
                </div>
              </div>
            `;

            container.appendChild(card);

            if (cleanImages.length > 1) {
              let imgCurrentIdx = 0;
              const intervalId = setInterval(() => {
                if (document.hidden || isAdminMode) return;
                const merchSecEl = document.getElementById('merchSection');
                if (!merchSecEl || merchSecEl.classList.contains('is-collapsed') || merchSecEl.style.display === 'none') return;
                const imgEl = document.getElementById(`merchCardImg_${realIdx}`);
                if (!imgEl || !imgEl.isConnected) return;
                imgCurrentIdx = (imgCurrentIdx + 1) % cleanImages.length;
                const nextSrc = cleanImages[imgCurrentIdx];
                const dotsEl = document.getElementById(`merchCardDots_${realIdx}`);
                imgEl.style.opacity = '0.3';
                setTimeout(() => {
                  if (!imgEl.isConnected) return;
                  imgEl.src = nextSrc;
                  imgEl.style.opacity = '1';
                }, 150);
                if (dotsEl) {
                  const dots = dotsEl.querySelectorAll('.merch-img-dot');
                  dots.forEach((dot, dIdx) => dot.classList.toggle('active', dIdx === imgCurrentIdx));
                }
              }, 5000);
              merchCardSlideshowIntervals.push(intervalId);
            }
          } else {
            // MODO EDICIÓN INTEGRADO: misma tarjeta del usuario con edición directa en sus propios elementos
            const currentCatLabel = (item.category && item.category.trim()) ? item.category.trim() : (merchCategories[0] || 'Categoría');
            let catOptionsHTML = merchCategories.map(cat =>
              `<option value="${escapeHtmlAttr(cat)}" ${cat === currentCatLabel ? 'selected' : ''}>${escapeHtmlAttr(cat)}</option>`
            ).join('');
            if (currentCatLabel && !merchCategories.includes(currentCatLabel)) {
              catOptionsHTML += `<option value="${escapeHtmlAttr(currentCatLabel)}" selected>${escapeHtmlAttr(currentCatLabel)}</option>`;
            }

            const rawBadgeText = (item.badge && item.badge.trim().toLowerCase() !== 'disponible') ? item.badge.trim() : '';
            const imgAdminHTML = firstImg
              ? `<img id="merchCardImg_${realIdx}" src="${firstImg}" alt="${escapeHtmlAttr(item.name)}" style="transition: opacity 0.3s ease;">`
              : `<div style="color:var(--accent-light); padding:32px 10px; font-size:0.85rem; display:flex; flex-direction:column; align-items:center; justify-content:center; gap:6px; opacity:0.85;"><span class="blutu-cart-icon" style="width:34px; height:34px;"></span><span>Haz clic para subir fotos</span></div>`;

            card.innerHTML = `
              <div class="merch-card-floating-tools" onclick="event.stopPropagation()">
                <button type="button" class="gallery-mini-tool-btn" onclick="openGalleryMediaModal('merch-edit', ${realIdx})" title="Cambiar o subir foto principal">🖼️</button>
                <button type="button" class="gallery-mini-tool-btn" onclick="moveMerchItemOrder(${realIdx}, -1)" title="Mover antes" ${realIdx === 0 ? 'disabled style="opacity:0.35;cursor:default;"' : ''}>◀</button>
                <button type="button" class="gallery-mini-tool-btn" onclick="moveMerchItemOrder(${realIdx}, 1)" title="Mover después" ${realIdx === merchItemsData.length - 1 ? 'disabled style="opacity:0.35;cursor:default;"' : ''}>▶</button>
                <button type="button" class="gallery-mini-tool-btn" onclick="toggleMerchItemVisibilityAdmin(${realIdx})" title="${isHiddenItem ? 'Oculto a visitantes (clic para mostrar)' : 'Visible a visitantes (clic para ocultar)'}">${isHiddenItem ? '🙈' : '👁️'}</button>
                <button type="button" class="gallery-mini-tool-btn is-danger" onclick="confirmDeleteMerchItem(${realIdx})" title="Eliminar producto">🗑️</button>
              </div>

              <div class="merch-img-wrapper" onclick="openMerchDetailModal(${realIdx})" title="Abrir vista completa del producto para gestionar carrusel de fotos">
                ${imgAdminHTML}
                ${cleanImages.length > 1 ? `
                  <div class="merch-img-dots" id="merchCardDots_${realIdx}">
                    ${cleanImages.map((_, i) => `<span class="merch-img-dot ${i===0?'active':''}"></span>`).join('')}
                  </div>
                ` : ''}
                <div id="merchCardBadgeContainer_${realIdx}" class="merch-badge-container" style="left: 10px; right: auto; align-items: flex-start;" onclick="event.stopPropagation()">
                  <span id="merchCardLiveBadge_${realIdx}" class="merch-badge ${isAgotado ? 'agotado' : ''} merch-editable-field" contenteditable="true" spellcheck="false" data-placeholder="+ Etiqueta" title="Edita la etiqueta (ej: Nuevo, Oferta, Agotado)" oninput="handleInlineMerchPropInput(${realIdx}, 'badge', this)" onkeydown="if(event.key==='Enter'){event.preventDefault();this.blur();}">${escapeHtmlAttr(rawBadgeText)}</span>
                </div>
              </div>

              <div class="merch-card-body">
                <div class="merch-card-info">
                  <div style="display: flex; justify-content: center; align-items: center; gap: 6px; flex-wrap: wrap;">
                    <span class="merch-cat-select-wrap" title="Cambiar categoría del producto">
                      <span id="merchCardCategoryBadge_${realIdx}" class="merch-category-badge" style="cursor: pointer;">${escapeHtmlAttr(currentCatLabel)} ▾</span>
                      <select onchange="handleInlineMerchCategorySelect(${realIdx}, this.value)" aria-label="Categoría del producto">
                        ${catOptionsHTML}
                      </select>
                    </span>
                    ${isHiddenItem ? `<span style="font-size: 0.7rem; color: #ffd280; border: 1px dashed rgba(255,210,128,0.6); border-radius: 4px; padding: 1px 6px;">Oculto</span>` : ''}
                  </div>

                  <h3 id="merchCardTitle_${realIdx}" class="merch-title merch-editable-field" contenteditable="true" spellcheck="false" data-placeholder="Nombre del producto..." oninput="handleInlineMerchPropInput(${realIdx}, 'name', this)" onkeydown="if(event.key==='Enter'){event.preventDefault();this.blur();}">${escapeHtmlAttr(item.name || '')}</h3>

                  <div id="merchCardPrice_${realIdx}" class="merch-price" style="display: flex; align-items: center; justify-content: center; gap: 8px; flex-wrap: wrap;">
                    <span id="merchCardOrigPrice_${realIdx}" class="merch-editable-field" contenteditable="true" spellcheck="false" data-placeholder="Antes" title="Precio anterior (opcional, aparecerá tachado)" style="text-decoration: line-through; color: var(--text-muted); font-size: 0.85em; min-width: 28px;" oninput="handleInlineMerchPropInput(${realIdx}, 'originalPrice', this)" onkeydown="if(event.key==='Enter'){event.preventDefault();this.blur();}">${escapeHtmlAttr(item.originalPrice || '')}</span>
                    <span id="merchCardCurrPrice_${realIdx}" class="merch-editable-field" contenteditable="true" spellcheck="false" data-placeholder="$0" title="Precio actual" style="color: var(--accent-light); font-weight: bold; min-width: 32px;" oninput="handleInlineMerchPropInput(${realIdx}, 'price', this)" onkeydown="if(event.key==='Enter'){event.preventDefault();this.blur();}">${escapeHtmlAttr(item.price || '')}</span>
                  </div>

                  <p id="merchCardDesc_${realIdx}" class="merch-desc merch-editable-field" contenteditable="true" spellcheck="false" data-placeholder="Descripción breve..." oninput="handleInlineMerchPropInput(${realIdx}, 'description', this)">${escapeHtmlAttr(item.description || '')}</p>
                </div>

                <div id="merchCardActions_${realIdx}" class="merch-actions-row" style="display: flex; gap: 6px; justify-content: center; flex-wrap: wrap;">
                  <button type="button" id="merchCardStockBtn_${realIdx}" class="wysiwyg-tool-btn" onclick="toggleMerchItemAgotado(${realIdx})" title="Alternar disponibilidad (En Stock / Agotado)" style="padding: 5px 10px; font-size: 0.76rem;">
                    ${isAgotado ? '✅ Poner Stock' : '🚫 Agotar'}
                  </button>
                  <button type="button" class="read-more-btn" onclick="openMerchDetailModal(${realIdx})" title="Abrir ficha completa y carrusel de fotos (${cleanImages.length})" style="padding: 5px 12px; font-size: 0.78rem;">
                    Abrir (${cleanImages.length} 📷) ➔
                  </button>
                </div>
              </div>
            `;

            container.appendChild(card);
          }
        });
      }

      if (indicator) indicator.textContent = `${currentMerchPage + 1} / ${totalPages || 1}`;
      if (prevBtn) prevBtn.disabled = currentMerchPage === 0;
      if (nextBtn) nextBtn.disabled = currentMerchPage >= totalPages - 1;

      if (controls) {
        controls.style.display = totalPages > 1 ? 'flex' : 'none';
      }

      initMerchSwipe();
    }

    let isMerchSwiping = false;

    function moveMerchPage(dir) {
      const sourceItems = isAdminMode ? merchItemsData : merchItemsData.filter(item => item.visible !== false);
      let filteredItems = sourceItems;
      if (currentMerchCategory && currentMerchCategory !== 'Todas') {
        filteredItems = sourceItems.filter(item => (item.category || (merchCategories[0] || 'Camisetas')) === currentMerchCategory);
      }
      const perPage = getMerchItemsPerPage();
      const totalPages = Math.ceil(filteredItems.length / perPage);
      if (totalPages <= 1) return;

      currentMerchPage += dir;
      if (currentMerchPage >= totalPages) currentMerchPage = 0;
      if (currentMerchPage < 0) currentMerchPage = totalPages - 1;
      renderMerchSection();
    }

    function initMerchSwipe() {
      const container = document.getElementById('merchContainer');
      if (!container || container.dataset.swipeBound === 'true') return;
      container.dataset.swipeBound = 'true';

      let merchTouchStartX = 0;
      let merchTouchStartY = 0;
      let merchTouchStartTime = 0;

      container.addEventListener('touchstart', (e) => {
        if (e.touches.length > 1) return;
        const t = e.target;
        if (t && t.closest('[contenteditable="true"], .merch-card-floating-tools, .merch-cat-select-wrap, select, input, textarea, button')) {
          merchTouchStartX = 0;
          merchTouchStartY = 0;
          return;
        }
        isMerchSwiping = false;
        merchTouchStartX = e.touches[0].clientX;
        merchTouchStartY = e.touches[0].clientY;
        merchTouchStartTime = Date.now();
      }, { passive: true });

      container.addEventListener('touchmove', (e) => {
        if (e.touches.length !== 1 || !merchTouchStartX) return;
        const diffX = Math.abs(e.touches[0].clientX - merchTouchStartX);
        const diffY = Math.abs(e.touches[0].clientY - merchTouchStartY);
        if (diffX > 14 && diffX > diffY) {
          isMerchSwiping = true;
        }
      }, { passive: true });

      container.addEventListener('touchend', (e) => {
        if (!merchTouchStartX || !merchTouchStartY) return;
        const target = e.target;
        if (target.closest('[contenteditable="true"], .merch-card-floating-tools, .merch-cat-select-wrap, button, input, textarea, select, a, .merch-add-cart-btn, .admin-btn, .merch-img-dot')) {
          merchTouchStartX = 0;
          merchTouchStartY = 0;
          setTimeout(() => { isMerchSwiping = false; }, 80);
          return;
        }

        const touchEndX = e.changedTouches[0].clientX;
        const touchEndY = e.changedTouches[0].clientY;
        const diffX = merchTouchStartX - touchEndX;
        const diffY = merchTouchStartY - touchEndY;
        const duration = Date.now() - merchTouchStartTime;

        if (duration < 650 && Math.abs(diffX) > 42 && Math.abs(diffX) > Math.abs(diffY) * 1.25) {
          if (diffX > 0) {
            moveMerchPage(1);
          } else {
            moveMerchPage(-1);
          }
        }

        merchTouchStartX = 0;
        merchTouchStartY = 0;
        setTimeout(() => { isMerchSwiping = false; }, 120);
      }, { passive: true });
    }

    /* LÓGICA DEL CARRITO DE COMPRAS & DESCUENTOS */
    function initCart() {
      cartItems = [];
      appliedCouponCode = '';
      try {
        localStorage.removeItem('blutu_cart');
      } catch(e) {}
      updateCartUI();
    }

    function saveCart() {
      localStorage.setItem('blutu_cart', JSON.stringify(cartItems));
      updateCartUI();
    }

    function updateCartUI() {
      const floatingBtn = document.getElementById('floatingCartBtn');
      const badgeCount = document.getElementById('cartBadgeCount');

      const totalQty = cartItems.reduce((acc, item) => acc + (item.quantity || 1), 0);

      if (badgeCount) {
        badgeCount.textContent = totalQty;
        badgeCount.classList.remove('bump');
        void badgeCount.offsetWidth;
        if (totalQty > 0) badgeCount.classList.add('bump');
      }

      if (floatingBtn) {
        floatingBtn.style.display = (isMerchSectionVisible && totalQty > 0) ? 'flex' : 'none';
      }

      renderCartModal();
    }

    function addToCart(event, realIdx, qty = 1, openModalAfter = false) {
      const item = merchItemsData[realIdx];
      if (!item) return;

      const isAgotado = isItemAgotado(item);
      if (isAgotado) {
        showToastNotification('Este producto está agotado y no se puede añadir al carrito.', true);
        return;
      }

      if (event && event.currentTarget) {
        event.preventDefault();
        triggerGreekCrossAnimation(event.currentTarget, '#5A74BF', 500);
      }

      const existingIndex = cartItems.findIndex(c => c.realIdx === realIdx || (c.name === item.name && c.price === item.price));

      if (existingIndex > -1) {
        cartItems[existingIndex].quantity += qty;
      } else {
        cartItems.push({
          realIdx: realIdx,
          name: item.name,
          price: item.price || '$0',
          originalPrice: item.originalPrice || '',
          image: item.image || '',
          category: item.category || 'Merch',
          quantity: qty
        });
      }

      saveCart();
      showCartToast(`"${item.name}" añadido al carrito`);

      if (openModalAfter) {
        setTimeout(() => { openCartModal(); }, 300);
      }
    }

    function buyNowInstagram(event, realIdx) {
      if (event && event.currentTarget) {
        event.preventDefault();
        triggerGreekCrossAnimation(event.currentTarget, '#5A74BF', 500);
      }

      const item = merchItemsData[realIdx];
      if (!item) return;

      addToCart(null, realIdx, 1, false);

      const orderText = generateOrderText();
      const targetUrl = cartConfig.instagramUrl || 'https://www.instagram.com/blutuuuuuu';

      navigator.clipboard.writeText(orderText).then(() => {
        showCartToast('¡Resumen de pedido copiado! Redirigiendo a Instagram...');
      }).catch(() => {
        showCartToast('Redirigiendo a Instagram...');
      });

      setTimeout(() => {
        window.open(targetUrl, '_blank', 'noopener,noreferrer');
      }, 1000);
    }

    function updateCartItemQty(cartIdx, delta) {
      if (cartItems[cartIdx]) {
        cartItems[cartIdx].quantity += delta;
        if (cartItems[cartIdx].quantity <= 0) {
          cartItems.splice(cartIdx, 1);
        }
        saveCart();
      }
    }

    function removeFromCart(cartIdx) {
      if (cartItems[cartIdx]) {
        cartItems.splice(cartIdx, 1);
        saveCart();
      }
    }

    function clearCart() {
      if (!cartItems || cartItems.length === 0) return;
      cartItems = [];
      customerCartNote = '';
      saveCart();
      showCartToast('Carrito vaciado');
    }

    function updateCustomerCartNote(val) {
      customerCartNote = val || '';
    }
    window.updateCustomerCartNote = updateCustomerCartNote;
    function applyCartCouponCode() {}
    window.applyCartCouponCode = applyCartCouponCode;

    function parsePriceToNumber(priceStr) {
      if (!priceStr) return 0;
      const clean = priceStr.replace(/[^0-9.,]/g, '').replace(',', '.');
      const num = parseFloat(clean);
      return isNaN(num) ? 0 : num;
    }

    function getCartTotals() {
      let totalQty = 0;
      let subtotalNum = 0;
      let currencySymbol = '$';

      cartItems.forEach(item => {
        const qty = item.quantity || 1;
        subtotalNum += parsePriceToNumber(item.price) * qty;
        totalQty += qty;

        if (item.price && item.price.includes('€')) currencySymbol = '€';
        else if (item.price && item.price.includes('MXN')) currencySymbol = '$ MXN';
      });

      let discountPct = cartConfig.discountPercentage || 0;
      let discountAmountNum = subtotalNum * (discountPct / 100);
      let finalTotalNum = Math.max(0, subtotalNum - discountAmountNum);

      return { totalQty, subtotalNum, discountPct, discountAmountNum, finalTotalNum, currencySymbol };
    }

    function renderCartModal() {
      const container = document.getElementById('cartItemsContainer');
      const footer = document.getElementById('cartFooter');
      const adminConfigWrap = document.getElementById('cartModalAdminConfigWrap');
      if (adminConfigWrap) {
        adminConfigWrap.style.display = isAdminMode ? 'block' : 'none';
      }

      if (!container) return;

      const { totalQty, subtotalNum, discountPct, discountAmountNum, finalTotalNum, currencySymbol } = getCartTotals();

      if (cartItems.length === 0) {
        container.innerHTML = `
          <div style="text-align: center; padding: 40px 10px; color: var(--text-muted);">
            <div class="blutu-cart-icon" style="width: 48px; height: 48px; margin-bottom: 12px; opacity: 0.6;"></div>
            <p style="font-size: 1rem; font-family: 'Cinzel Decorative', 'Cinzel', serif; color: var(--white); margin-bottom: 6px;">Tu carrito está vacío</p>
            <p style="font-size: 0.85rem;">Explora el merch oficial de Blutu y añade tus productos favoritos.</p>
          </div>
        `;
        if (footer) footer.style.display = 'none';
        return;
      }

      if (footer) {
        footer.style.display = 'block';

        const breakdownEl = document.getElementById('cartSummaryBreakdown');
        if (breakdownEl) {
          let breakdownHTML = '';
          const currSuffix = currencySymbol.replace('$', '').trim() ? (' ' + currencySymbol.replace('$', '').trim()) : '';
          if (discountAmountNum > 0) {
            breakdownHTML += `
              <div class="cart-summary-row">
                <span>Subtotal (${totalQty} ${totalQty === 1 ? 'producto' : 'productos'}):</span>
                <span>${currencySymbol.startsWith('$') ? '$' : ''}${subtotalNum.toFixed(2)}${currSuffix}</span>
              </div>
              <div class="cart-summary-row" style="color: #ff6b81; font-weight: bold;">
                <span>Descuento (${discountPct}% OFF):</span>
                <span>-${currencySymbol.startsWith('$') ? '$' : ''}${discountAmountNum.toFixed(2)}${currSuffix}</span>
              </div>
            `;
          }
          breakdownHTML += `
            <div class="cart-total-row">
              <span>Total a pagar:</span>
              <span id="cartTotalPrice" class="cart-total-price">${currencySymbol.startsWith('$') ? '$' : ''}${finalTotalNum.toFixed(2)}${currSuffix}</span>
            </div>
          `;

          breakdownHTML += `
            <div class="cart-note-box" style="margin-top: 10px; text-align: left;">
              <label style="font-size: 0.82rem; color: var(--accent-light); font-weight: bold; display: block; margin-bottom: 4px;">
                📝 Nota / Instrucción para el Pedido (Opcional):
              </label>
              <textarea id="cartCustomerNoteInput" rows="2" placeholder="Escribe aquí cualquier indicación sobre tu pedido (talla, dirección, comentarios, etc.)..." oninput="updateCustomerCartNote(this.value)" style="width: 100%; background: #050508; border: 1px solid var(--accent-blue); color: var(--white); padding: 8px 10px; font-size: 0.85rem; border-radius: 6px; resize: vertical; box-sizing: border-box; font-family: sans-serif;">${escapeHtmlAttr(customerCartNote)}</textarea>
            </div>
          `;

          breakdownEl.innerHTML = breakdownHTML;
        }

        const checkoutOptsContainer = footer.querySelector('.cart-checkout-options');
        if (checkoutOptsContainer) {
          let html = '';
          if (cartConfig.showWhatsappBtn !== false) {
            const waLabel = escapeHtmlAttr(cartConfig.whatsappBtnText || 'Realizar Pedido por WhatsApp');
            html += `
              <button type="button" class="cart-checkout-btn whatsapp" onclick="checkoutViaWhatsApp()">
                <i class="fa-brands fa-whatsapp" style="font-size: 1.15rem;"></i> ${waLabel}
              </button>
            `;
          }
          if (cartConfig.showInstagramBtn !== false) {
            const igLabel = escapeHtmlAttr(cartConfig.instagramBtnText || 'Pedir por Mensaje Directo (Instagram)');
            html += `
              <button type="button" class="cart-checkout-btn instagram" onclick="checkoutViaInstagram()">
                <span class="checkout-btn-title"><i class="fa-brands fa-instagram" style="font-size: 1.15rem;"></i> ${igLabel}</span>
                <span class="checkout-btn-subnote">📋 Copia tu pedido y te lleva al perfil para que lo pegues en el chat</span>
              </button>
            `;
          }
          if (cartConfig.showCopyBtn !== false) {
            const copyLabel = escapeHtmlAttr(cartConfig.copyBtnText || 'Copiar Resumen de Pedido');
            html += `
              <button type="button" class="cart-checkout-btn copy" onclick="copyOrderDetailsToClipboard()">
                📋 ${copyLabel}
              </button>
            `;
          }
          checkoutOptsContainer.innerHTML = html;
        }

        const clearBtn = footer.querySelector('.cart-item-del-btn');
        if (clearBtn) {
          clearBtn.style.display = cartConfig.showClearCartBtn !== false ? 'block' : 'none';
          const clearLabel = escapeHtmlAttr(cartConfig.clearCartBtnText || 'Vaciar Carrito');
          clearBtn.innerHTML = `🗑️ ${clearLabel}`;
        }
      }

      container.innerHTML = '';
      cartItems.forEach((item, idx) => {
        const row = document.createElement('div');
        row.className = 'cart-item-row';

        const imgHTML = item.image ? `<img src="${item.image}" alt="${escapeHtmlAttr(item.name)}" class="cart-item-img">` : `<div class="cart-item-img" style="display:flex;align-items:center;justify-content:center;font-size:1.2rem;"><span class="blutu-cart-icon"></span></div>`;
        const priceDisplay = (item.originalPrice && item.originalPrice !== item.price) ?
          `<span style="text-decoration:line-through; font-size:0.8em; color:var(--text-muted); margin-right:4px;">${escapeHtmlAttr(item.originalPrice)}</span> <strong>${escapeHtmlAttr(item.price)}</strong>` :
          `<strong>${escapeHtmlAttr(item.price || '')}</strong>`;

        row.innerHTML = `
          ${imgHTML}
          <div class="cart-item-info">
            <div class="cart-item-title" title="${escapeHtmlAttr(item.name)}">${escapeHtmlAttr(item.name)}</div>
            <div class="cart-item-price">${priceDisplay} x ${item.quantity}</div>
          </div>
          <div class="cart-item-qty-controls">
            <button type="button" class="cart-qty-btn" onclick="updateCartItemQty(${idx}, -1)" title="Disminuir cantidad">-</button>
            <span class="cart-qty-num">${item.quantity}</span>
            <button type="button" class="cart-qty-btn" onclick="updateCartItemQty(${idx}, 1)" title="Aumentar cantidad">+</button>
          </div>
          <button type="button" class="cart-item-del-btn" onclick="removeFromCart(${idx})" title="Eliminar del carrito">✕</button>
        `;

        container.appendChild(row);
      });
    }

    function openCartModal() {
      pushModalState('cart');
      renderCartModal();
      const modal = document.getElementById('cartModal');
      if (modal) modal.style.display = 'flex';
      document.body.style.overflow = 'hidden';
    }

    function closeCartModal() {
      popModalState('cart');
      const modal = document.getElementById('cartModal');
      if (modal) modal.style.display = 'none';
      document.body.style.overflow = '';
    }

    function showCartToast(msg) {
      const toast = document.getElementById('cartToast');
      const msgEl = document.getElementById('cartToastMsg');
      if (!toast) return;

      if (msgEl) msgEl.textContent = msg;
      toast.classList.add('show');

      clearTimeout(window.cartToastTimer);
      window.cartToastTimer = setTimeout(() => {
        toast.classList.remove('show');
      }, 2500);
    }

    function generateOrderText() {
      const { totalQty, subtotalNum, discountPct, discountAmountNum, finalTotalNum, currencySymbol } = getCartTotals();
      let text = `Hola! Quisiera realizar la compra de los siguientes productos:\n\n`;

      cartItems.forEach((item, i) => {
        text += `${i + 1}. *${item.name}* (${item.category || 'Merch'})\n`;
        text += `   • Cantidad: ${item.quantity}\n`;
        if (item.originalPrice && item.originalPrice !== item.price) {
          text += `   • Precio: ${item.price} (Antes: ${item.originalPrice})\n\n`;
        } else {
          text += `   • Precio: ${item.price}\n\n`;
        }
      });

      text += `---------------------------\n`;
      text += `*Total de artículos:* ${totalQty}\n`;
      const currSuffix = currencySymbol.replace('$', '').trim() ? (' ' + currencySymbol.replace('$', '').trim()) : '';
      if (discountAmountNum > 0) {
        text += `*Subtotal:* ${currencySymbol.startsWith('$') ? '$' : ''}${subtotalNum.toFixed(2)}${currSuffix}\n`;
        text += `*Descuento (${discountPct}% OFF):* -${currencySymbol.startsWith('$') ? '$' : ''}${discountAmountNum.toFixed(2)}${currSuffix}\n`;
      }
      text += `*TOTAL A PAGAR:* ${currencySymbol.startsWith('$') ? '$' : ''}${finalTotalNum.toFixed(2)}${currSuffix}\n\n`;
      
      if (customerCartNote && customerCartNote.trim() !== '') {
        text += `*Nota / Instrucción para el Pedido:* ${customerCartNote.trim()}\n\n`;
      }

      text += `Por favor confírmenme disponibilidad y forma de pago. ¡Gracias!`;

      return text;
    }

    function checkoutViaWhatsApp() {
      if (cartItems.length === 0) return;
      const orderText = generateOrderText();
      const phone = (cartConfig.whatsappNumber || '').replace(/[^0-9]/g, '');
      const encodedMsg = encodeURIComponent(orderText);
      const url = phone ? `https://wa.me/${phone}?text=${encodedMsg}` : `https://wa.me/?text=${encodedMsg}`;
      window.open(url, '_blank', 'noopener,noreferrer');
    }

    function checkoutViaInstagram() {
      if (cartItems.length === 0) return;
      const orderText = generateOrderText();
      const targetUrl = cartConfig.instagramUrl || 'https://www.instagram.com/blutuuuuuu';
      navigator.clipboard.writeText(orderText).then(() => {
        showCartToast('📋 ¡Pedido copiado! Abriendo Instagram para que lo pegues en el chat...');
        setTimeout(() => {
          window.open(targetUrl, '_blank', 'noopener,noreferrer');
        }, 1000);
      }).catch(() => {
        showCartToast('Abriendo el perfil de Instagram...');
        window.open(targetUrl, '_blank', 'noopener,noreferrer');
      });
    }

    function copyOrderDetailsToClipboard() {
      if (cartItems.length === 0) return;
      const orderText = generateOrderText();
      navigator.clipboard.writeText(orderText).then(() => {
        showCartToast('¡Resumen de pedido copiado!');
      }).catch(err => {
        showToastNotification('No se pudo copiar automáticamente el resumen del pedido.', true);
      });
    }

    let currentModalMerchIdx = null;
    let currentModalImageIdx = 0;
    let modalSlideshowInterval = null;
    let merchModalUploadTarget = { realIdx: null, mode: 'append' };

    function clearModalSlideshowInterval() {
      if (modalSlideshowInterval) {
        clearInterval(modalSlideshowInterval);
        modalSlideshowInterval = null;
      }
    }

    function setMerchItemImagesList(realIdx, cleanList) {
      const item = merchItemsData[realIdx];
      if (!item) return;
      const sanitized = (Array.isArray(cleanList) ? cleanList : []).map(u => (u || '').trim()).filter(Boolean);
      item.images = sanitized;
      item.image = sanitized[0] || '';
      persistMerchLocalCache();
    }

    function appendPhotosToMerchItem(realIdx, newUrls) {
      const item = merchItemsData[realIdx];
      if (!item) return;
      const clean = getCleanMerchImages(item);
      const startLen = clean.length;
      (Array.isArray(newUrls) ? newUrls : [newUrls]).forEach(u => {
        const trimmed = (u || '').trim();
        if (trimmed && !clean.includes(trimmed)) {
          clean.push(trimmed);
        }
      });
      setMerchItemImagesList(realIdx, clean);
      renderMerchSection();
      const merchModal = document.getElementById('merchDetailModal');
      if (merchModal && merchModal.style.display === 'flex' && currentModalMerchIdx === realIdx) {
        currentModalImageIdx = clean.length > startLen ? startLen : Math.max(0, clean.length - 1);
        renderMerchDetailModalContent(realIdx, currentModalImageIdx);
      }
    }

    function replacePhotoInMerchItem(realIdx, newUrl) {
      const item = merchItemsData[realIdx];
      const trimmed = (newUrl || '').trim();
      if (!item || !trimmed) return;
      const clean = getCleanMerchImages(item);
      const merchModal = document.getElementById('merchDetailModal');
      const isModalOpenForItem = merchModal && merchModal.style.display === 'flex' && currentModalMerchIdx === realIdx;
      const targetIdx = isModalOpenForItem ? Math.min(currentModalImageIdx, Math.max(0, clean.length - 1)) : 0;

      if (clean.length === 0) {
        clean.push(trimmed);
      } else {
        clean[targetIdx] = trimmed;
      }
      setMerchItemImagesList(realIdx, clean);
      renderMerchSection();
      if (isModalOpenForItem) {
        currentModalImageIdx = targetIdx;
        renderMerchDetailModalContent(realIdx, currentModalImageIdx);
      }
    }

    function triggerMerchModalFileUpload(realIdx, mode = 'append') {
      merchModalUploadTarget = { realIdx: realIdx, mode: mode };
      const fileInput = document.getElementById('merchModalFileInput');
      if (fileInput) {
        fileInput.value = '';
        fileInput.multiple = (mode !== 'replace');
        fileInput.click();
      }
    }

    async function handleMerchModalMultiFileUpload(event) {
      const files = Array.from((event && event.target && event.target.files) || []);
      if (files.length === 0) return;
      const targetIdx = merchModalUploadTarget.realIdx !== null ? merchModalUploadTarget.realIdx : currentModalMerchIdx;
      const mode = merchModalUploadTarget.mode || 'append';
      if (targetIdx === null || !merchItemsData[targetIdx]) return;

      if (event && event.target) event.target.value = '';

      try {
        const results = (await Promise.all(
          files.map(file => compressUploadedImageFileToDataUrl(file, 1100, 0.80))
        )).filter(Boolean);

        if (mode === 'replace' && results[0]) {
          replacePhotoInMerchItem(targetIdx, results[0]);
          if (typeof showToastNotification === 'function') showToastNotification('Foto del producto actualizada.');
        } else if (results.length > 0) {
          appendPhotosToMerchItem(targetIdx, results);
          if (typeof showToastNotification === 'function') {
            showToastNotification(results.length === 1 ? 'Foto añadida al producto.' : `${results.length} fotos añadidas al producto.`);
          }
        }
      } catch (err) {
        if (typeof showToastNotification === 'function') {
          showToastNotification('No se pudo procesar la foto del producto.', true);
        }
      }
    }

    function moveMerchModalPhoto(realIdx, imgIdx, dir) {
      const item = merchItemsData[realIdx];
      if (!item) return;
      const clean = getCleanMerchImages(item);
      const nextIdx = imgIdx + dir;
      if (nextIdx < 0 || nextIdx >= clean.length) return;
      const moved = clean.splice(imgIdx, 1)[0];
      clean.splice(nextIdx, 0, moved);
      setMerchItemImagesList(realIdx, clean);
      currentModalImageIdx = nextIdx;
      renderMerchSection();
      renderMerchDetailModalContent(realIdx, currentModalImageIdx);
    }

    function setMerchPrimaryPhoto(realIdx, imgIdx) {
      const item = merchItemsData[realIdx];
      if (!item) return;
      const clean = getCleanMerchImages(item);
      if (imgIdx <= 0 || imgIdx >= clean.length) return;
      const chosen = clean.splice(imgIdx, 1)[0];
      clean.unshift(chosen);
      setMerchItemImagesList(realIdx, clean);
      currentModalImageIdx = 0;
      renderMerchSection();
      renderMerchDetailModalContent(realIdx, 0);
      if (typeof showToastNotification === 'function') {
        showToastNotification('Foto fijada como portada principal del producto.');
      }
    }

    function removeMerchModalPhoto(realIdx, imgIdx) {
      const item = merchItemsData[realIdx];
      if (!item) return;
      const clean = getCleanMerchImages(item);
      if (imgIdx < 0 || imgIdx >= clean.length) return;
      openGothicConfirmModal({
        icon: '🖼️',
        title: '¿Quitar foto del producto?',
        message: 'Esta imagen se quitará del carrusel de este producto.',
        confirmText: 'Sí, quitar',
        onConfirm: () => {
          clean.splice(imgIdx, 1);
          setMerchItemImagesList(realIdx, clean);
          currentModalImageIdx = Math.max(0, Math.min(currentModalImageIdx, clean.length - 1));
          renderMerchSection();
          renderMerchDetailModalContent(realIdx, currentModalImageIdx);
        }
      });
    }

    function createNewMerchInModal() {
      const defaultCat = (currentMerchCategory && currentMerchCategory !== 'Todas')
        ? currentMerchCategory
        : (merchCategories[0] || 'Camisetas');

      if (defaultCat && !merchCategories.includes(defaultCat)) {
        merchCategories.push(defaultCat);
      }

      const newItem = {
        id: Date.now(),
        name: 'Nuevo Producto',
        price: '$20',
        originalPrice: '',
        category: defaultCat,
        image: '',
        images: [],
        description: 'Escribe aquí los detalles, tallas o materiales del producto.',
        url: '',
        badge: '',
        visible: true
      };
      merchItemsData.push(newItem);
      const newIdx = merchItemsData.length - 1;

      // Asegurar que la sección Merch esté desplegada para ver el contexto
      const merchSec = document.getElementById('merchSection');
      if (merchSec) {
        merchSec.style.display = 'block';
        merchSec.classList.remove('is-collapsed');
      }

      // Situar la paginación donde quedó el nuevo producto
      const filtered = (currentMerchCategory && currentMerchCategory !== 'Todas')
        ? merchItemsData.filter(it => (it.category || defaultCat) === currentMerchCategory)
        : merchItemsData;
      const perPage = getMerchItemsPerPage();
      currentMerchPage = Math.max(0, Math.ceil(filtered.length / perPage) - 1);

      persistMerchLocalCache();
      renderMerchSection();
      openMerchDetailModal(newIdx);
    }

    function finishInlineMerchModalEdit() {
      persistMerchLocalCache();
      renderMerchSection();
      closeMerchModal();
      if (typeof showToastNotification === 'function') {
        showToastNotification('Producto actualizado en vista previa. Recuerda pulsar Guardar Todo al terminar.');
      }
    }

    function openMerchDetailModal(realIdx) {
      if (typeof isMerchSwiping !== 'undefined' && isMerchSwiping) {
        isMerchSwiping = false;
        return;
      }
      clearModalSlideshowInterval();
      currentModalMerchIdx = realIdx;
      currentModalImageIdx = 0;

      const item = merchItemsData[realIdx];
      if (!item) return;

      const cleanImages = getCleanMerchImages(item);
      renderMerchDetailModalContent(realIdx, 0);

      if (!isAdminMode && cleanImages.length > 1) {
        modalSlideshowInterval = setInterval(() => {
          if (document.hidden) return;
          currentModalImageIdx = (currentModalImageIdx + 1) % cleanImages.length;
          updateMerchModalImageDisplay(cleanImages);
        }, 5000);
      }

      const modal = document.getElementById('merchDetailModal');
      if (modal) modal.style.display = 'flex';
      document.body.style.overflow = 'hidden';
      pushModalState('merch', '/' + getMerchItemShareSlug(item, realIdx));
    }

    function renderMerchDetailModalContent(realIdx, imgIdx) {
      const item = merchItemsData[realIdx];
      if (!item) return;
      const body = document.getElementById('merchModalBody');
      if (!body) return;

      const cleanImages = getCleanMerchImages(item);
      const images = getItemImages(item);
      const safeIdx = cleanImages.length > 0 ? Math.max(0, Math.min(imgIdx || 0, cleanImages.length - 1)) : 0;
      currentModalImageIdx = safeIdx;
      const isAgotado = isItemAgotado(item);

      if (!isAdminMode) {
        const categoryBadge = item.category ? `<span class="merch-category-badge" style="position:static; display:inline-block; margin-right:8px;">${escapeHtmlAttr(item.category)}</span>` : '';
        const badgesHTML = getMerchBadgesHTML(item);

        let priceDisplay = escapeHtmlAttr(item.price || '');
        if (item.originalPrice && item.originalPrice !== item.price) {
          priceDisplay = `<span style="text-decoration:line-through; font-size:0.85em; color:var(--text-muted); margin-right:8px;">${escapeHtmlAttr(item.originalPrice)}</span> ${escapeHtmlAttr(item.price)}`;
        }

        body.innerHTML = `
          <div style="margin-bottom: 6px;">${categoryBadge}</div>
          <h1 style="font-size: 2rem; margin-bottom: 8px; color: var(--white); display: flex; align-items: center; justify-content: center; flex-wrap: wrap; gap: 8px;">
            <span>${escapeHtmlAttr(item.name)}</span>
            ${badgesHTML}
          </h1>
          <div style="font-size: 1.3rem; color: var(--accent-light); text-align: center; font-weight: bold; margin-bottom: 15px;">
            ${priceDisplay}
          </div>
          
          <div style="position: relative; text-align: center; background: #050508; border: 1px solid var(--border-color); border-radius: 12px; padding: 10px;">
            <img id="merchModalMainImg" src="${images[safeIdx] || images[0]}" class="main-img" alt="${escapeHtmlAttr(item.name)}" style="max-height: 360px; object-fit: contain; transition: opacity 0.3s ease;">
            ${cleanImages.length > 1 ? `
              <button type="button" onclick="prevMerchModalImage(${realIdx})" style="position:absolute; left:12px; top:50%; transform:translateY(-50%); background:rgba(0,0,0,0.7); border:1px solid var(--accent-blue); color:#fff; border-radius:50%; width:38px; height:38px; cursor:pointer; font-size:1.2rem; display:flex; align-items:center; justify-content:center; z-index:5;">‹</button>
              <button type="button" onclick="nextMerchModalImage(${realIdx})" style="position:absolute; right:12px; top:50%; transform:translateY(-50%); background:rgba(0,0,0,0.7); border:1px solid var(--accent-blue); color:#fff; border-radius:50%; width:38px; height:38px; cursor:pointer; font-size:1.2rem; display:flex; align-items:center; justify-content:center; z-index:5;">›</button>
            ` : ''}
          </div>

          ${cleanImages.length > 1 ? `
            <div style="display:flex; justify-content:center; gap:8px; margin-top:12px; flex-wrap:wrap;">
              ${cleanImages.map((imgUrl, i) => `
                <img src="${imgUrl}" class="merch-modal-thumb" onclick="setMerchModalImage(${realIdx}, ${i})" style="width:52px; height:52px; object-fit:cover; border-radius:8px; cursor:pointer; border:2px solid ${i===safeIdx?'var(--accent-light)':'transparent'}; opacity:${i===safeIdx?1:0.5}; transition:all 0.2s ease;">
              `).join('')}
            </div>
          ` : ''}

          <p style="font-size: 1.05rem; text-align: justify; margin-top: 18px; color: var(--white); line-height: 1.6;">${escapeHtmlAttr(item.description || '')}</p>
          
          <div style="display: flex; justify-content: center; gap: 12px; flex-wrap: wrap; margin-top: 25px;">
            <button type="button" class="read-more-btn" onclick="closeMerchModal()">Volver</button>
            <button type="button" class="read-more-btn blog-share-btn" onclick="shareCurrentMerch(${realIdx})" title="Compartir este producto"><i class="fa-solid fa-share-nodes" aria-hidden="true"></i><span>Compartir</span></button>
            ${isAgotado ? `
              <button class="read-more-btn" disabled style="background: rgba(60, 15, 15, 0.85); border: 1px solid #ff4d4d; color: #ff9999; cursor: not-allowed; opacity: 0.88; box-shadow: none;">
                🚫 Agotado
              </button>
            ` : `
              <button class="read-more-btn" style="background: rgba(90, 116, 191, 0.3); border: 1px solid var(--accent-blue); color: #fff; display: flex; align-items: center; gap: 8px;" onclick="addToCart(event, ${realIdx}, 1, false); closeMerchModal();">
                <span class="blutu-cart-icon"></span> <span>Añadir al Carrito</span>
              </button>
            `}
          </div>
        `;
        return;
      }

      // MODO EDICIÓN INTEGRADO EN EL MODAL DEL PRODUCTO (ESTILO PENSAMIENTOS)
      const isVisible = item.visible !== false;
      const currentCatLabel = (item.category && item.category.trim()) ? item.category.trim() : (merchCategories[0] || 'Categoría');
      let catOptionsHTML = merchCategories.map(cat =>
        `<option value="${escapeHtmlAttr(cat)}" ${cat === currentCatLabel ? 'selected' : ''}>${escapeHtmlAttr(cat)}</option>`
      ).join('');
      if (currentCatLabel && !merchCategories.includes(currentCatLabel)) {
        catOptionsHTML += `<option value="${escapeHtmlAttr(currentCatLabel)}" selected>${escapeHtmlAttr(currentCatLabel)}</option>`;
      }
      const rawBadgeText = (item.badge && item.badge.trim().toLowerCase() !== 'disponible') ? item.badge.trim() : '';

      body.innerHTML = `
        <div class="wysiwyg-blog-toolbar" style="margin-bottom: 14px;">
          <div class="wysiwyg-toolbar-group">
            <button type="button" class="wysiwyg-tool-btn" onclick="triggerMerchModalFileUpload(${realIdx}, 'append')" title="Subir una o varias fotos desde tu dispositivo">📤 Subir Fotos</button>
            <button type="button" class="wysiwyg-tool-btn" onclick="openGalleryMediaModal('merch-add', ${realIdx})" title="Añadir foto mediante enlace URL">➕ Foto URL</button>
            <button type="button" id="merchModalStockBtn_${realIdx}" class="wysiwyg-tool-btn" onclick="toggleMerchItemAgotado(${realIdx})" title="Alternar entre En Stock y Agotado">
              ${isAgotado ? '✅ Poner en Stock' : '🚫 Marcar Agotado'}
            </button>
          </div>
          <div class="wysiwyg-toolbar-group">
            <button type="button" class="wysiwyg-tool-btn" onclick="toggleMerchItemVisibilityAdmin(${realIdx})" title="Mostrar u ocultar este producto a los visitantes">
              ${isVisible ? '👁️‍🗨️ Visible' : '🙈 Oculto'}
            </button>
            <button type="button" class="wysiwyg-tool-btn is-danger" onclick="confirmDeleteMerchItem(${realIdx})" title="Eliminar producto">🗑️</button>
            <button type="button" class="wysiwyg-tool-btn is-done" onclick="finishInlineMerchModalEdit()" title="Cerrar vista detallada">✓ Listo</button>
          </div>
        </div>

        <div style="text-align: center; margin-bottom: 8px;">
          <span class="merch-cat-select-wrap" title="Cambiar categoría">
            <span class="merch-category-badge" style="position: static; display: inline-block; cursor: pointer;">${escapeHtmlAttr(currentCatLabel)} ▾</span>
            <select onchange="handleInlineMerchCategorySelect(${realIdx}, this.value)" aria-label="Categoría del producto">
              ${catOptionsHTML}
            </select>
          </span>
        </div>

        <h1 style="font-size: 1.95rem; margin-bottom: 8px; color: var(--white); display: flex; align-items: center; justify-content: center; flex-wrap: wrap; gap: 10px;">
          <span class="merch-editable-field" contenteditable="true" spellcheck="false" data-placeholder="Nombre del producto..." oninput="handleInlineMerchPropInput(${realIdx}, 'name', this)" onkeydown="if(event.key==='Enter'){event.preventDefault();this.blur();}">${escapeHtmlAttr(item.name || '')}</span>
          <span class="merch-badge ${isAgotado ? 'agotado' : ''} merch-editable-field" contenteditable="true" spellcheck="false" data-placeholder="+ Etiqueta" title="Etiqueta (ej: Nuevo, Edición Limitada, Agotado)" oninput="handleInlineMerchPropInput(${realIdx}, 'badge', this)" onkeydown="if(event.key==='Enter'){event.preventDefault();this.blur();}">${escapeHtmlAttr(rawBadgeText)}</span>
        </h1>

        <div style="font-size: 1.3rem; color: var(--accent-light); text-align: center; font-weight: bold; margin-bottom: 15px; display: flex; align-items: center; justify-content: center; gap: 12px; flex-wrap: wrap;">
          <span class="merch-editable-field" contenteditable="true" spellcheck="false" data-placeholder="Precio anterior" title="Precio anterior (opcional, se verá tachado)" style="text-decoration: line-through; font-size: 0.85em; color: var(--text-muted); font-weight: normal; min-width: 50px;" oninput="handleInlineMerchPropInput(${realIdx}, 'originalPrice', this)" onkeydown="if(event.key==='Enter'){event.preventDefault();this.blur();}">${escapeHtmlAttr(item.originalPrice || '')}</span>
          <span class="merch-editable-field" contenteditable="true" spellcheck="false" data-placeholder="$0" title="Precio actual" style="min-width: 50px;" oninput="handleInlineMerchPropInput(${realIdx}, 'price', this)" onkeydown="if(event.key==='Enter'){event.preventDefault();this.blur();}">${escapeHtmlAttr(item.price || '')}</span>
        </div>

        ${cleanImages.length > 0 ? `
          <div class="editable-blog-figure" style="position: relative; text-align: center; background: #050508; border: 1px solid var(--border-color); border-radius: 12px; padding: 10px;">
            <div class="figure-floating-actions" style="opacity: 1;">
              <button type="button" onclick="triggerMerchModalFileUpload(${realIdx}, 'replace')" title="Reemplazar esta foto desde archivo">📁 Archivo</button>
              <button type="button" onclick="openGalleryMediaModal('merch-edit', ${realIdx})" title="Reemplazar esta foto por URL">🔗 URL</button>
              ${cleanImages.length > 1 ? `
                <button type="button" onclick="moveMerchModalPhoto(${realIdx}, ${safeIdx}, -1)" title="Mover foto antes" ${safeIdx === 0 ? 'disabled style="opacity:0.35;cursor:default;"' : ''}>◀</button>
                <button type="button" onclick="moveMerchModalPhoto(${realIdx}, ${safeIdx}, 1)" title="Mover foto después" ${safeIdx === cleanImages.length - 1 ? 'disabled style="opacity:0.35;cursor:default;"' : ''}>▶</button>
              ` : ''}
              ${safeIdx > 0 ? `
                <button type="button" onclick="setMerchPrimaryPhoto(${realIdx}, ${safeIdx})" title="Usar como portada principal del producto">⭐ Portada</button>
              ` : ''}
              <button type="button" class="fig-del" onclick="removeMerchModalPhoto(${realIdx}, ${safeIdx})" title="Quitar esta foto">🗑️</button>
            </div>

            <img id="merchModalMainImg" src="${cleanImages[safeIdx]}" class="main-img" alt="${escapeHtmlAttr(item.name)}" style="max-height: 360px; object-fit: contain; transition: opacity 0.3s ease;">
            ${cleanImages.length > 1 ? `
              <button type="button" onclick="prevMerchModalImage(${realIdx})" style="position:absolute; left:12px; top:50%; transform:translateY(-50%); background:rgba(0,0,0,0.7); border:1px solid var(--accent-blue); color:#fff; border-radius:50%; width:38px; height:38px; cursor:pointer; font-size:1.2rem; display:flex; align-items:center; justify-content:center; z-index:5;">‹</button>
              <button type="button" onclick="nextMerchModalImage(${realIdx})" style="position:absolute; right:12px; top:50%; transform:translateY(-50%); background:rgba(0,0,0,0.7); border:1px solid var(--accent-blue); color:#fff; border-radius:50%; width:38px; height:38px; cursor:pointer; font-size:1.2rem; display:flex; align-items:center; justify-content:center; z-index:5;">›</button>
            ` : ''}
          </div>
        ` : `
          <div style="text-align: center; background: rgba(5, 5, 8, 0.7); border: 1px dashed var(--accent-blue); border-radius: 12px; padding: 34px 16px;">
            <p style="color: var(--accent-light); margin-bottom: 12px; font-style: italic;">Este producto aún no tiene fotografías.</p>
            <div style="display: flex; justify-content: center; gap: 10px; flex-wrap: wrap;">
              <button type="button" class="wysiwyg-tool-btn" onclick="triggerMerchModalFileUpload(${realIdx}, 'append')" style="padding: 7px 14px;">📤 Subir Fotos</button>
              <button type="button" class="wysiwyg-tool-btn" onclick="openGalleryMediaModal('merch-add', ${realIdx})" style="padding: 7px 14px;">➕ Pegar URL</button>
            </div>
          </div>
        `}

        <div style="display:flex; justify-content:center; align-items:center; gap:8px; margin-top:12px; flex-wrap:wrap;">
          ${cleanImages.map((imgUrl, i) => `
            <img src="${imgUrl}" class="merch-modal-thumb" onclick="setMerchModalImage(${realIdx}, ${i})" title="Foto ${i + 1}${i === 0 ? ' (Portada)' : ''}" style="width:52px; height:52px; object-fit:cover; border-radius:8px; cursor:pointer; border:2px solid ${i===safeIdx?'var(--accent-light)':'rgba(90,116,191,0.28)'}; opacity:${i===safeIdx?1:0.6}; transition:all 0.2s ease;">
          `).join('')}
          <button type="button" onclick="triggerMerchModalFileUpload(${realIdx}, 'append')" title="Añadir más fotos al carrusel" style="width:52px; height:52px; border-radius:8px; border:1px dashed var(--accent-blue); background:rgba(90,116,191,0.12); color:var(--accent-light); font-size:1.25rem; cursor:pointer; display:flex; align-items:center; justify-content:center;">+</button>
        </div>

        <p class="merch-editable-field" contenteditable="true" spellcheck="false" data-placeholder="Escribe aquí la descripción completa del producto..." style="font-size: 1.05rem; text-align: justify; margin-top: 18px; color: var(--white); line-height: 1.6; min-height: 2.4em; padding: 6px 8px;" oninput="handleInlineMerchPropInput(${realIdx}, 'description', this)">${escapeHtmlAttr(item.description || '')}</p>

        <div style="display: flex; justify-content: center; gap: 12px; flex-wrap: wrap; margin-top: 22px;">
          <button type="button" class="read-more-btn" onclick="finishInlineMerchModalEdit()">✓ Listo</button>
          <button type="button" class="read-more-btn blog-share-btn" onclick="shareCurrentMerch(${realIdx})" title="Compartir este producto"><i class="fa-solid fa-share-nodes" aria-hidden="true"></i><span>Compartir</span></button>
        </div>
      `;
    }

    function setMerchModalImage(realIdx, imgIdx) {
      const item = merchItemsData[realIdx];
      if (!item) return;
      currentModalImageIdx = imgIdx;
      if (isAdminMode) {
        renderMerchDetailModalContent(realIdx, imgIdx);
        return;
      }
      const images = getCleanMerchImages(item);
      updateMerchModalImageDisplay(images.length ? images : getItemImages(item));
    }

    function nextMerchModalImage(realIdx) {
      const item = merchItemsData[realIdx];
      if (!item) return;
      const clean = getCleanMerchImages(item);
      const images = clean.length ? clean : getItemImages(item);
      currentModalImageIdx = (currentModalImageIdx + 1) % images.length;
      if (isAdminMode) {
        renderMerchDetailModalContent(realIdx, currentModalImageIdx);
        return;
      }
      updateMerchModalImageDisplay(images);
    }

    function prevMerchModalImage(realIdx) {
      const item = merchItemsData[realIdx];
      if (!item) return;
      const clean = getCleanMerchImages(item);
      const images = clean.length ? clean : getItemImages(item);
      currentModalImageIdx = (currentModalImageIdx - 1 + images.length) % images.length;
      if (isAdminMode) {
        renderMerchDetailModalContent(realIdx, currentModalImageIdx);
        return;
      }
      updateMerchModalImageDisplay(images);
    }

    function updateMerchModalImageDisplay(images) {
      const mainImg = document.getElementById('merchModalMainImg');
      const nextSrc = images[currentModalImageIdx];
      if (mainImg && nextSrc) {
        mainImg.style.opacity = '0.2';
        setTimeout(() => {
          if (!mainImg.isConnected) return;
          mainImg.src = nextSrc;
          mainImg.style.opacity = '1';
        }, 150);
      }

      const thumbs = document.querySelectorAll('.merch-modal-thumb');
      thumbs.forEach((thumb, idx) => {
        const isActive = idx === currentModalImageIdx;
        thumb.style.borderColor = isActive ? 'var(--accent-light)' : 'transparent';
        thumb.style.opacity = isActive ? '1' : '0.5';
      });
    }

    function closeMerchModal() {
      popModalState('merch');
      clearModalSlideshowInterval();
      const modal = document.getElementById('merchDetailModal');
      if (modal) modal.style.display = 'none';
      document.body.style.overflow = '';
    }

    function syncCartConfigInputsUI() {
      const igInput = document.getElementById('adminCartInstagramInput');
      const waInput = document.getElementById('adminCartWhatsappInput');
      const noteInput = document.getElementById('adminCartNoteInput');

      const showWaInput = document.getElementById('adminCartShowWhatsapp');
      const showIgInput = document.getElementById('adminCartShowInstagram');
      const showCopyInput = document.getElementById('adminCartShowCopy');
      const showClearInput = document.getElementById('adminCartShowClear');

      const waText = document.getElementById('adminCartWhatsappText');
      const igText = document.getElementById('adminCartInstagramText');
      const copyText = document.getElementById('adminCartCopyText');
      const clearText = document.getElementById('adminCartClearText');

      if (igInput && document.activeElement !== igInput) igInput.value = cartConfig.instagramUrl || '';
      if (waInput && document.activeElement !== waInput) waInput.value = cartConfig.whatsappNumber || '';
      if (noteInput && document.activeElement !== noteInput) noteInput.value = cartConfig.noteText || '';

      if (showWaInput) showWaInput.checked = cartConfig.showWhatsappBtn !== false;
      if (showIgInput) showIgInput.checked = cartConfig.showInstagramBtn !== false;
      if (showCopyInput) showCopyInput.checked = cartConfig.showCopyBtn !== false;
      if (showClearInput) showClearInput.checked = cartConfig.showClearCartBtn !== false;

      if (waText && document.activeElement !== waText) waText.value = cartConfig.whatsappBtnText || 'Realizar Pedido por WhatsApp';
      if (igText && document.activeElement !== igText) igText.value = cartConfig.instagramBtnText || 'Pedir por Mensaje Directo (Instagram)';
      if (copyText && document.activeElement !== copyText) copyText.value = cartConfig.copyBtnText || 'Copiar Resumen de Pedido';
      if (clearText && document.activeElement !== clearText) clearText.value = cartConfig.clearCartBtnText || 'Vaciar Carrito';
    }

    function openCartConfigModal() {
      if (!window.__adminModalsMounted) { ensureAdminModalsReady().then(() => openCartConfigModal()); return; }
      syncCartConfigInputsUI();
      const modal = document.getElementById('cartConfigModal');
      if (modal) {
        modal.style.display = 'flex';
        document.body.style.overflow = 'hidden';
      }
    }

    function closeCartConfigModal() {
      const modal = document.getElementById('cartConfigModal');
      if (modal) modal.style.display = 'none';
      const anyOtherOpen = ['cartModal', 'merchDetailModal', 'blogReadModal', 'imageModal'].some(id => {
        const el = document.getElementById(id);
        return el && el.style.display && el.style.display !== 'none';
      });
      if (!anyOtherOpen) document.body.style.overflow = '';
    }

    /* GESTIÓN DE CATEGORÍAS Y PRODUCTOS */
    function renderAdminCategoriesList() {}

    function addNewCategoryFromAdmin() {
      addNewCategoryInline();
    }

    function deleteCategoryFromAdmin(index) {
      if (index >= 0 && index < merchCategories.length) {
        const deletedCat = merchCategories[index];
        openGothicConfirmModal({
          icon: '🏷️',
          title: '¿Eliminar categoría?',
          message: `Se quitará la pestaña "${deletedCat}" de las categorías de Merch.`,
          confirmText: 'Sí, eliminar',
          onConfirm: () => {
            merchCategories.splice(index, 1);
            const fallbackCat = merchCategories[0] || '';
            merchItemsData.forEach(item => {
              if (item.category === deletedCat) item.category = fallbackCat;
            });
            if (currentMerchCategory === deletedCat) currentMerchCategory = 'Todas';
            persistMerchLocalCache();
            renderMerchSection();
          }
        });
      }
    }

    function moveCategoryOrder(index, dir) {
      const targetIndex = index + dir;
      if (targetIndex >= 0 && targetIndex < merchCategories.length) {
        const cat = merchCategories.splice(index, 1)[0];
        merchCategories.splice(targetIndex, 0, cat);
        persistMerchLocalCache();
        renderMerchSection();
      }
    }

    function updateCategoryName(index, val) {
      val = (val || '').trim();
      if (val && merchCategories[index]) {
        const oldCat = merchCategories[index];
        if (val !== oldCat && merchCategories.includes(val)) {
          if (typeof showToastNotification === 'function') {
            showToastNotification('Ya existe otra categoría con ese nombre.', true);
          }
          renderMerchSection();
          return;
        }
        merchCategories[index] = val;
        merchItemsData.forEach(item => {
          if (item.category === oldCat) item.category = val;
        });
        if (currentMerchCategory === oldCat) currentMerchCategory = val;
        persistMerchLocalCache();
        renderMerchSection();
      }
    }

    function updateCartConfigProp(prop, val) {
      cartConfig[prop] = val;
      persistMerchLocalCache();
      renderCartModal();
    }

    function updateMerchItemImages(index, val) {
      if (merchItemsData[index]) {
        const urls = val.split(/[\n,]+/).map(s => s.trim()).filter(Boolean);
        setMerchItemImagesList(index, urls);
        renderMerchSection();
      }
    }

    function renderAdminMerchList() {
      syncCartConfigInputsUI();
      updateMerchVisibilityToggleButtons();
    }

    function addMerchItemAdmin() {
      createNewMerchInModal();
    }

    function confirmDeleteMerchItem(index) {
      if (index < 0 || index >= merchItemsData.length) return;
      const item = merchItemsData[index];
      const label = (item && item.name) ? `"${item.name}"` : 'este producto';
      openGothicConfirmModal({
        icon: '🛍️',
        title: '¿Eliminar producto?',
        message: `Se eliminará permanentemente ${label} del catálogo de Merch.`,
        confirmText: 'Sí, eliminar',
        onConfirm: () => {
          const merchModal = document.getElementById('merchDetailModal');
          if (merchModal && merchModal.style.display === 'flex' && currentModalMerchIdx === index) {
            closeMerchModal();
          }
          merchItemsData.splice(index, 1);
          persistMerchLocalCache();
          renderMerchSection();
          if (typeof showToastNotification === 'function') {
            showToastNotification('Producto eliminado.');
          }
        }
      });
    }

    function deleteMerchItemAdmin(index) {
      confirmDeleteMerchItem(index);
    }

    function toggleMerchItemVisibilityAdmin(index) {
      if (merchItemsData[index]) {
        merchItemsData[index].visible = !(merchItemsData[index].visible !== false);
        persistMerchLocalCache();
        renderMerchSection();
        const merchModal = document.getElementById('merchDetailModal');
        if (merchModal && merchModal.style.display === 'flex' && currentModalMerchIdx === index) {
          renderMerchDetailModalContent(index, currentModalImageIdx);
        }
      }
    }

    function updateMerchItemProp(index, prop, value) {
      if (merchItemsData[index]) {
        merchItemsData[index][prop] = value;
        persistMerchLocalCache();
        renderMerchSection();
      }
    }

    function toggleMerchCardEditDrawer(index) {
      openMerchDetailModal(index);
    }

    function updateMerchItemPropRealtime(index, prop, value) {
      if (merchItemsData[index] === undefined) return;
      merchItemsData[index][prop] = value;
      persistMerchLocalCache();
      renderMerchSection();
    }

    async function handleMerchPhotoFileUploadGrid(event, index) {
      const file = event && event.target && event.target.files && event.target.files[0];
      if (!file) return;
      try {
        const compressedSrc = await compressUploadedImageFileToDataUrl(file, 1100, 0.80);
        if (event && event.target) event.target.value = '';
        replacePhotoInMerchItem(index, compressedSrc);
      } catch (err) {
        if (event && event.target) event.target.value = '';
        if (typeof showToastNotification === 'function') {
          showToastNotification('No se pudo procesar la imagen del producto.', true);
        }
      }
    }

    function moveMerchItemOrder(index, dir) {
      const targetIndex = index + dir;
      if (targetIndex >= 0 && targetIndex < merchItemsData.length) {
        const item = merchItemsData.splice(index, 1)[0];
        merchItemsData.splice(targetIndex, 0, item);
        persistMerchLocalCache();
        renderMerchSection();
      }
    }

    function handleMerchPhotoFileUpload(event, index) {
      handleMerchPhotoFileUploadGrid(event, index);
    }

    function updateMerchDescriptionFromAdmin(val) {
      merchSectionDescription = val;
      persistMerchLocalCache();
      renderMerchSection();
    }

    function toggleMerchSectionGlobalVisibility() {
      isMerchSectionVisible = !isMerchSectionVisible;
      persistMerchLocalCache();
      renderMerchSection();
    }

    function saveMerchChanges() {
      persistMerchLocalCache();
      renderMerchSection();
      if (typeof window.persistSiteDataInRealtime === 'function') {
        window.persistSiteDataInRealtime();
      }
      if (typeof showToastNotification === 'function') {
        showToastNotification('¡Cambios guardados y aplicados en tiempo real en la sección de Merch!');
      }
    }

    window.getCleanMerchImages = getCleanMerchImages;
    window.appendPhotosToMerchItem = appendPhotosToMerchItem;
    window.replacePhotoInMerchItem = replacePhotoInMerchItem;
    window.triggerMerchModalFileUpload = triggerMerchModalFileUpload;
    window.handleMerchModalMultiFileUpload = handleMerchModalMultiFileUpload;
    window.moveMerchModalPhoto = moveMerchModalPhoto;
    window.setMerchPrimaryPhoto = setMerchPrimaryPhoto;
    window.removeMerchModalPhoto = removeMerchModalPhoto;
    window.createNewMerchInModal = createNewMerchInModal;
    window.finishInlineMerchModalEdit = finishInlineMerchModalEdit;
    window.confirmDeleteMerchItem = confirmDeleteMerchItem;
    window.openCartConfigModal = openCartConfigModal;
    window.closeCartConfigModal = closeCartConfigModal;
    window.addNewCategoryInline = addNewCategoryInline;
    window.handleInlineMerchPropInput = handleInlineMerchPropInput;
    window.handleInlineMerchCategorySelect = handleInlineMerchCategorySelect;
    window.handleInlineMerchSectionDescInput = handleInlineMerchSectionDescInput;
    window.deleteMerchItemAdmin = deleteMerchItemAdmin;
    window.toggleMerchItemVisibilityAdmin = toggleMerchItemVisibilityAdmin;
    window.moveMerchItemOrder = moveMerchItemOrder;
    window.addMerchItemAdmin = addMerchItemAdmin;
    window.updateMerchItemProp = updateMerchItemProp;
    window.handleMerchPhotoFileUpload = handleMerchPhotoFileUpload;
    window.toggleMerchCardEditDrawer = toggleMerchCardEditDrawer;
    window.updateMerchItemPropRealtime = updateMerchItemPropRealtime;
    window.handleMerchPhotoFileUploadGrid = handleMerchPhotoFileUploadGrid;
    window.updateMerchDescriptionFromAdmin = updateMerchDescriptionFromAdmin;
    window.toggleMerchSectionGlobalVisibility = toggleMerchSectionGlobalVisibility;
    window.saveMerchChanges = saveMerchChanges;
    window.moveMerchPage = moveMerchPage;
    window.openMerchDetailModal = openMerchDetailModal;
    window.closeMerchModal = closeMerchModal;
    window.setMerchCategory = setMerchCategory;
    window.addToCart = addToCart;
    window.buyNowInstagram = buyNowInstagram;
    window.updateCartItemQty = updateCartItemQty;
    window.removeFromCart = removeFromCart;
    window.clearCart = clearCart;
    window.openCartModal = openCartModal;
    window.closeCartModal = closeCartModal;
    window.checkoutViaWhatsApp = checkoutViaWhatsApp;
    window.checkoutViaInstagram = checkoutViaInstagram;
    window.copyOrderDetailsToClipboard = copyOrderDetailsToClipboard;
    window.renderAdminCategoriesList = renderAdminCategoriesList;
    window.addNewCategoryFromAdmin = addNewCategoryFromAdmin;
    window.deleteCategoryFromAdmin = deleteCategoryFromAdmin;
    window.moveCategoryOrder = moveCategoryOrder;
    window.updateCategoryName = updateCategoryName;
    window.updateCartConfigProp = updateCartConfigProp;
    window.applyCartCouponCode = applyCartCouponCode;

    function applyAllSectionsChangesToDOM() {
      if (window.postsData) {
        postsData = deduplicatePosts(window.postsData);
        window.postsData = postsData;
      } else {
        postsData = deduplicatePosts(postsData);
        window.postsData = postsData;
      }
      if (window.galleriesData) {
        galleriesData = window.galleriesData;
        if (typeof getOrderedGalleryKeys === 'function') {
          const orderedKeys = getOrderedGalleryKeys();
          const reordered = {};
          orderedKeys.forEach(k => {
            if (galleriesData[k]) reordered[k] = galleriesData[k];
          });
          galleriesData = reordered;
          window.galleriesData = galleriesData;
        }
      }
      if (window.liveButtonsData) liveButtonsData = window.liveButtonsData;
      if (window.merchItemsData) merchItemsData = window.merchItemsData;
      if (window.merchCategories) merchCategories = window.merchCategories;
      if (window.cartConfig) cartConfig = window.cartConfig;
      if (typeof window.isLiveSectionVisible === 'boolean') isLiveSectionVisible = window.isLiveSectionVisible;
      if (typeof window.liveSectionDescription === 'string') liveSectionDescription = window.liveSectionDescription;
      if (typeof window.isMerchSectionVisible === 'boolean') isMerchSectionVisible = window.isMerchSectionVisible;
      if (typeof window.merchSectionDescription === 'string') merchSectionDescription = window.merchSectionDescription;
      if (typeof window.isGamesSectionVisible === 'boolean') isGamesSectionVisible = window.isGamesSectionVisible;
      if (window.gamesData && typeof window.gamesData === 'object') {
        gamesData = normalizeGamesData(window.gamesData);
        window.gamesData = gamesData;
      }
      if (typeof window.isBuzonSectionVisible === 'boolean') isBuzonSectionVisible = window.isBuzonSectionVisible;
      if (window.hiddenCommentIds) hiddenCommentIds = window.hiddenCommentIds;

      if (typeof renderBlogPosts === 'function') renderBlogPosts();
      if (typeof populatePostSelect === 'function') populatePostSelect();
      if (typeof renderAdminPostsList === 'function') renderAdminPostsList();
      if (typeof populateAdminGallerySelect === 'function') populateAdminGallerySelect();
      if (typeof renderGalleryTabs === 'function') renderGalleryTabs();
      if (typeof renderLiveSection === 'function') renderLiveSection();
      if (typeof renderMerchSection === 'function') renderMerchSection();
      if (typeof renderGamesSection === 'function') renderGamesSection();
      if (typeof updateGamesVisibilityUI === 'function') updateGamesVisibilityUI();
      if (typeof window.toggleBuzonVisibility === 'function') window.toggleBuzonVisibility(isBuzonSectionVisible);
      if (typeof window.renderCommentsListFromMemory === 'function') window.renderCommentsListFromMemory();
      if (typeof window.refreshAdminCommentsList === 'function') window.refreshAdminCommentsList();
      if (typeof checkPendingSharedDeepLink === 'function') checkPendingSharedDeepLink();
    }
    window.applyAllSectionsChangesToDOM = applyAllSectionsChangesToDOM;

    let adminEditSessionBaseline = null;
    window.__adminCloudTouchedDuringSession = false;
    window.__adminSessionTouchedCloudPosts = new Map();
    window.__isRevertingAdminSession = false;

    function deepCloneAdminValue(val) {
      try {
        return JSON.parse(JSON.stringify(val));
      } catch (e) {
        return val;
      }
    }

    function normalizePostsForBaselineCompare(list) {
      if (!Array.isArray(list)) return [];
      return list.map(p => ({
        id: p.id || '',
        title: p.title || '',
        date: p.date || '',
        dateIso: p.dateIso || '',
        image: p.image || '',
        imageCaption: p.imageCaption || '',
        imageFit: p.imageFit || 'cover-center',
        imageAura: p.imageAura || '',
        hidden: Boolean(p.hidden),
        preview: p.preview || '',
        content: p.content || ''
      }));
    }

    function buildComparableAdminSessionState(sourceOverride = null) {
      if (sourceOverride) {
        return JSON.stringify({
          posts: normalizePostsForBaselineCompare(sourceOverride.posts),
          deletedPostIds: [...(sourceOverride.deletedPostIds || [])].sort(),
          galleries: sourceOverride.galleries || {},
          galleryOrder: sourceOverride.galleryOrder || [],
          liveButtons: sourceOverride.liveButtons || [],
          isLiveVisible: Boolean(sourceOverride.isLiveVisible),
          liveDesc: String(sourceOverride.liveDesc || ''),
          merchItems: sourceOverride.merchItems || [],
          merchCats: sourceOverride.merchCats || [],
          cartCfg: sourceOverride.cartCfg || {},
          isMerchVisible: Boolean(sourceOverride.isMerchVisible),
          merchDesc: String(sourceOverride.merchDesc || ''),
          isGamesVisible: sourceOverride.isGamesVisible !== undefined ? Boolean(sourceOverride.isGamesVisible) : true,
          gamesData: normalizeGamesData(sourceOverride.gamesData),
          isBuzonVisible: Boolean(sourceOverride.isBuzonVisible),
          hiddenComments: [...(sourceOverride.hiddenComments || [])].sort()
        });
      }

      const currentPostsClone = deepCloneAdminValue(Array.isArray(postsData) ? postsData : []);
      const currentGamesClone = normalizeGamesData(deepCloneAdminValue(gamesData));
      const openBlogModalEl = document.getElementById('blogReadModal');
      if (openBlogModalEl && openBlogModalEl.style.display !== 'none') {
        const titleEl = document.getElementById('blogLiveTitle');
        const bodyEl = document.getElementById('blogEditableBody');
        const dateIsoEl = document.getElementById('blogLiveDateIso');
        const mainCapEl = document.getElementById('blogLiveMainCaption');
        if (currentGameBlogKey && currentGamesClone.blogs && currentGamesClone.blogs[currentGameBlogKey]) {
          const targetGameBlog = currentGamesClone.blogs[currentGameBlogKey];
          if (titleEl) {
            targetGameBlog.title = (titleEl.innerText || '').replace(/\r?\n/g, ' ').trim();
          }
          if (dateIsoEl && dateIsoEl.value) {
            targetGameBlog.dateIso = dateIsoEl.value;
            targetGameBlog.date = formatIsoToSpanishDate(dateIsoEl.value);
          }
          if (mainCapEl) {
            targetGameBlog.imageCaption = (mainCapEl.innerText || '').replace(/\r?\n/g, ' ').trim();
          }
          if (bodyEl && typeof serializeEditableBlogBodyToContent === 'function') {
            targetGameBlog.content = serializeEditableBlogBodyToContent(bodyEl);
          }
        } else if (typeof currentBlogIndex === 'number' && currentPostsClone[currentBlogIndex]) {
          if (titleEl) {
            currentPostsClone[currentBlogIndex].title = (titleEl.innerText || '').replace(/\r?\n/g, ' ').trim();
          }
          if (dateIsoEl && dateIsoEl.value) {
            currentPostsClone[currentBlogIndex].dateIso = dateIsoEl.value;
            currentPostsClone[currentBlogIndex].date = formatIsoToSpanishDate(dateIsoEl.value);
          }
          if (mainCapEl) {
            currentPostsClone[currentBlogIndex].imageCaption = (mainCapEl.innerText || '').replace(/\r?\n/g, ' ').trim();
          }
          if (bodyEl && typeof serializeEditableBlogBodyToContent === 'function') {
            currentPostsClone[currentBlogIndex].content = serializeEditableBlogBodyToContent(bodyEl);
          }
        }
      }

      const orderedKeys = (typeof getOrderedGalleryKeys === 'function') ? getOrderedGalleryKeys() : Object.keys(galleriesData || {});
      return JSON.stringify({
        posts: normalizePostsForBaselineCompare(currentPostsClone),
        deletedPostIds: Array.from(getDeletedPostIdsSet()).sort(),
        galleries: galleriesData || {},
        galleryOrder: orderedKeys,
        liveButtons: Array.isArray(liveButtonsData) ? liveButtonsData : [],
        isLiveVisible: Boolean(isLiveSectionVisible),
        liveDesc: String(liveSectionDescription || ''),
        merchItems: Array.isArray(merchItemsData) ? merchItemsData : [],
        merchCats: Array.isArray(merchCategories) ? merchCategories : [],
        cartCfg: cartConfig || {},
        isMerchVisible: Boolean(isMerchSectionVisible),
        merchDesc: String(merchSectionDescription || ''),
        isGamesVisible: Boolean(isGamesSectionVisible),
        gamesData: currentGamesClone,
        isBuzonVisible: Boolean(isBuzonSectionVisible),
        hiddenComments: [...(Array.isArray(hiddenCommentIds) ? hiddenCommentIds : [])].sort()
      });
    }

    function captureAdminEditSessionBaseline() {
      const orderedKeys = (typeof getOrderedGalleryKeys === 'function') ? getOrderedGalleryKeys() : Object.keys(galleriesData || {});
      adminEditSessionBaseline = {
        posts: deepCloneAdminValue(deduplicatePosts(Array.isArray(postsData) ? postsData : [])),
        deletedPostIds: Array.from(getDeletedPostIdsSet()),
        galleries: deepCloneAdminValue(galleriesData || {}),
        galleryOrder: [...orderedKeys],
        currentGalleryKey: typeof currentGalleryKey === 'string' ? currentGalleryKey : (orderedKeys[0] || 'fotos'),
        liveButtons: deepCloneAdminValue(Array.isArray(liveButtonsData) ? liveButtonsData : []),
        isLiveVisible: Boolean(isLiveSectionVisible),
        liveDesc: String(liveSectionDescription || ''),
        merchItems: deepCloneAdminValue(Array.isArray(merchItemsData) ? merchItemsData : []),
        merchCats: deepCloneAdminValue(Array.isArray(merchCategories) ? merchCategories : []),
        cartCfg: deepCloneAdminValue(cartConfig || {}),
        isMerchVisible: Boolean(isMerchSectionVisible),
        merchDesc: String(merchSectionDescription || ''),
        isGamesVisible: Boolean(isGamesSectionVisible),
        gamesData: deepCloneAdminValue(gamesData),
        isBuzonVisible: Boolean(isBuzonSectionVisible),
        hiddenComments: deepCloneAdminValue(Array.isArray(hiddenCommentIds) ? hiddenCommentIds : [])
      };
      adminEditSessionBaseline.comparableSig = buildComparableAdminSessionState(adminEditSessionBaseline);
      window.__adminCloudTouchedDuringSession = false;
      if (window.__adminSessionTouchedCloudPosts) {
        window.__adminSessionTouchedCloudPosts.clear();
      }
    }

    function hasUnsavedAdminSessionChanges() {
      if (!adminEditSessionBaseline) return false;
      if (window.__adminCloudTouchedDuringSession) return true;
      return buildComparableAdminSessionState() !== adminEditSessionBaseline.comparableSig;
    }

    async function executeDiscardMasterAdminData() {
      // Drenar y limpiar timers locales pendientes antes de sobrescribir con la instantánea inicial
      if (typeof flushAllPendingLocalCaches === 'function') {
        flushAllPendingLocalCaches();
      }
      if (typeof pendingPostsVaultTimer !== 'undefined' && pendingPostsVaultTimer) {
        clearTimeout(pendingPostsVaultTimer);
        pendingPostsVaultTimer = null;
      }
      if (typeof pendingGamesLocalCacheTimer !== 'undefined' && pendingGamesLocalCacheTimer) {
        clearTimeout(pendingGamesLocalCacheTimer);
        pendingGamesLocalCacheTimer = null;
      }

      // Cerrar submodales abiertos sin sincronizar cambios no guardados
      if (typeof closeInsertImageModal === 'function') closeInsertImageModal();
      if (typeof closeInsertLinkModal === 'function') closeInsertLinkModal();
      if (typeof closeInsertColorModal === 'function') closeInsertColorModal();
      if (typeof closeBlogThumbCropModal === 'function') closeBlogThumbCropModal();
      if (typeof closeGalleryMediaModal === 'function') closeGalleryMediaModal();
      if (typeof closeCartConfigModal === 'function') closeCartConfigModal();

      const openBlogModalEl = document.getElementById('blogReadModal');
      if (openBlogModalEl && openBlogModalEl.style.display !== 'none') {
        closeBlogModal(true);
      }
      const openMerchModalEl = document.getElementById('merchDetailModal');
      if (openMerchModalEl && openMerchModalEl.style.display !== 'none') {
        closeMerchModal();
      }
      const openImageModalEl = document.getElementById('imageModal');
      if (openImageModalEl && openImageModalEl.classList.contains('show')) {
        closeModal();
      }

      const baseline = adminEditSessionBaseline;
      const needCloudRevert = Boolean(window.__adminCloudTouchedDuringSession);
      const touchedCloudMap = new Map(window.__adminSessionTouchedCloudPosts || []);

      if (baseline) {
        setDeletedPostIds(baseline.deletedPostIds || []);

        postsData = deepCloneAdminValue(baseline.posts);
        galleriesData = deepCloneAdminValue(baseline.galleries);
        window.galleryOrder = [...(baseline.galleryOrder || [])];
        if (typeof fixedGalleryOrder !== 'undefined' && Array.isArray(fixedGalleryOrder)) {
          fixedGalleryOrder.splice(0, fixedGalleryOrder.length, ...(baseline.galleryOrder || []));
        }
        if (baseline.currentGalleryKey && galleriesData[baseline.currentGalleryKey]) {
          currentGalleryKey = baseline.currentGalleryKey;
        } else {
          const fallbackKeys = Object.keys(galleriesData);
          if (fallbackKeys.length > 0) currentGalleryKey = fallbackKeys[0];
        }

        liveButtonsData = deepCloneAdminValue(baseline.liveButtons);
        isLiveSectionVisible = Boolean(baseline.isLiveVisible);
        liveSectionDescription = String(baseline.liveDesc || '');

        merchItemsData = deepCloneAdminValue(baseline.merchItems);
        merchCategories = deepCloneAdminValue(baseline.merchCats);
        cartConfig = deepCloneAdminValue(baseline.cartCfg);
        isMerchSectionVisible = Boolean(baseline.isMerchVisible);
        merchSectionDescription = String(baseline.merchDesc || '');

        isGamesSectionVisible = baseline.isGamesVisible !== undefined ? Boolean(baseline.isGamesVisible) : true;
        gamesData = normalizeGamesData(deepCloneAdminValue(baseline.gamesData));
        isBuzonSectionVisible = Boolean(baseline.isBuzonVisible);
        hiddenCommentIds = deepCloneAdminValue(baseline.hiddenComments);

        window.postsData = postsData;
        window.galleriesData = galleriesData;
        window.liveButtonsData = liveButtonsData;
        window.isLiveSectionVisible = isLiveSectionVisible;
        window.liveSectionDescription = liveSectionDescription;
        window.merchItemsData = merchItemsData;
        window.merchCategories = merchCategories;
        window.cartConfig = cartConfig;
        window.isMerchSectionVisible = isMerchSectionVisible;
        window.merchSectionDescription = merchSectionDescription;
        window.isGamesSectionVisible = isGamesSectionVisible;
        window.gamesData = gamesData;
        window.isBuzonSectionVisible = isBuzonSectionVisible;
        window.hiddenCommentIds = hiddenCommentIds;

        const liveDescEl = document.getElementById('liveSectionDesc');
        if (liveDescEl) liveDescEl.textContent = liveSectionDescription;
        const merchDescEl = document.getElementById('merchSectionDesc');
        if (merchDescEl) merchDescEl.textContent = merchSectionDescription;

        try {
          clearAllPendingCloudSync();
          localStorage.setItem('blutu_hidden_comments', JSON.stringify(hiddenCommentIds));
          localStorage.setItem('blutu_buzon_visible', String(isBuzonSectionVisible));
          localStorage.setItem('blutu_games_visible', String(isGamesSectionVisible));
          localStorage.setItem('blutu_games_data', JSON.stringify(gamesData));
          localStorage.setItem('blutu_permanent_posts_vault', JSON.stringify(postsData));
          localStorage.setItem('blutu_live_site_data', JSON.stringify({
            posts: postsData,
            galleries: galleriesData,
            galleryOrder: window.galleryOrder,
            live: {
              buttons: liveButtonsData,
              isVisible: isLiveSectionVisible,
              description: liveSectionDescription
            },
            merch: {
              items: merchItemsData,
              categories: merchCategories,
              cartConfig: cartConfig,
              isVisible: isMerchSectionVisible,
              description: merchSectionDescription
            },
            buzon: {
              isVisible: isBuzonSectionVisible,
              gamesVisible: isGamesSectionVisible
            },
            muro: {
              isVisible: isBuzonSectionVisible,
              gamesVisible: isGamesSectionVisible,
              hiddenCommentIds: hiddenCommentIds,
              deletedPostIds: Array.from(getDeletedPostIdsSet()).slice(0, 500),
              gamesData: gamesData
            },
            updatedAt: Date.now()
          }));
          if (typeof BlutuVault !== 'undefined' && BlutuVault.savePosts) {
            BlutuVault.savePosts(postsData, { allowPrune: true });
          }
        } catch (err) {}
      }

      const restoredPostsForCloud = deepCloneAdminValue(postsData);
      adminEditSessionBaseline = null;
      window.__adminCloudTouchedDuringSession = false;
      if (window.__adminSessionTouchedCloudPosts) {
        window.__adminSessionTouchedCloudPosts.clear();
      }

      if (typeof closeAdminModal === 'function') {
        closeAdminModal();
      }
      if (typeof toggleAdminMode === 'function') {
        toggleAdminMode(false);
      } else {
        applyAllSectionsChangesToDOM();
      }

      if (needCloudRevert && typeof window.revertAdminCloudChangesToBaseline === 'function') {
        await window.revertAdminCloudChangesToBaseline(restoredPostsForCloud, touchedCloudMap);
      }

      if (typeof showToastNotification === 'function') {
        showToastNotification('↩️ Saliste del modo edición sin guardar cambios.');
      }
    }

    function discardMasterAdminData() {
      if (!hasUnsavedAdminSessionChanges()) {
        executeDiscardMasterAdminData();
        return;
      }
      const baselinePostsSig = adminEditSessionBaseline
        ? JSON.stringify(normalizePostsForBaselineCompare(adminEditSessionBaseline.posts))
        : '';
      const currentPostsSig = JSON.stringify(normalizePostsForBaselineCompare(Array.isArray(postsData) ? postsData : []));
      const hasPostsDiff = Boolean(adminEditSessionBaseline && baselinePostsSig !== currentPostsSig);

      if (typeof openGothicConfirmModal === 'function') {
        openGothicConfirmModal({
          icon: hasPostsDiff ? '⚠️' : '↩️',
          title: hasPostsDiff ? '¿Descartar también tus publicaciones?' : '¿No guardar cambios?',
          message: hasPostsDiff
            ? 'En esta sesión creaste o editaste publicaciones de Pensamientos. Si eliges "No guardar cambios", esas publicaciones también se desharán. Para conservarlas permanentemente, pulsa "Cancelar" y luego "Guardar cambios".'
            : 'Se descartarán todas las modificaciones hechas en esta sesión de edición y la página volverá a su estado anterior.',
          confirmText: '↩️ Descartar todo',
          onConfirm: () => {
            executeDiscardMasterAdminData();
          }
        });
      } else {
        executeDiscardMasterAdminData();
      }
    }
    window.discardMasterAdminData = discardMasterAdminData;

    async function saveMasterAdminData() {
      if (typeof applyCurrentPostToMemory === 'function') {
        applyCurrentPostToMemory(true);
      }
      if (typeof flushAllPendingLocalCaches === 'function') {
        flushAllPendingLocalCaches();
      }
      // Si había algún modal de edición directa abierto, cerrarlo limpiamente sincronizando su contenido
      const openBlogModalEl = document.getElementById('blogReadModal');
      if (openBlogModalEl && openBlogModalEl.style.display !== 'none') {
        syncLiveBlogModalToMemory(true);
        closeBlogModal(true);
      }
      const openMerchModalEl = document.getElementById('merchDetailModal');
      if (openMerchModalEl && openMerchModalEl.style.display !== 'none') {
        closeMerchModal();
      }
      const openImageModalEl = document.getElementById('imageModal');
      if (openImageModalEl && openImageModalEl.classList.contains('show')) {
        closeModal();
      }
      if (typeof closeGalleryMediaModal === 'function') closeGalleryMediaModal();
      if (typeof closeCartConfigModal === 'function') closeCartConfigModal();

      // Normalizar orden de galerías y deduplicar publicaciones antes de cerrar modo edición
      postsData = deduplicatePosts(postsData);
      gamesData = normalizeGamesData(gamesData);
      if (galleriesData && typeof getOrderedGalleryKeys === 'function') {
        const orderedKeys = getOrderedGalleryKeys();
        const reordered = {};
        orderedKeys.forEach(k => {
          if (galleriesData[k]) reordered[k] = galleriesData[k];
        });
        galleriesData = reordered;
      }

      // Sincronizar hacia window y bóveda permanente antes de cerrar modo edición
      window.postsData = postsData;
      window.galleriesData = galleriesData;
      window.liveButtonsData = liveButtonsData;
      window.merchItemsData = merchItemsData;
      window.merchCategories = merchCategories;
      window.cartConfig = cartConfig;
      window.isLiveSectionVisible = isLiveSectionVisible;
      window.liveSectionDescription = liveSectionDescription;
      window.isMerchSectionVisible = isMerchSectionVisible;
      window.merchSectionDescription = merchSectionDescription;
      window.isGamesSectionVisible = isGamesSectionVisible;
      window.gamesData = gamesData;
      window.isBuzonSectionVisible = isBuzonSectionVisible;
      window.hiddenCommentIds = hiddenCommentIds;
      persistPostsToLocalVaults();
      persistGamesLocalCache();

      // Limpiar instantánea de sesión al confirmar el guardado maestro
      adminEditSessionBaseline = null;
      window.__adminCloudTouchedDuringSession = false;
      if (window.__adminSessionTouchedCloudPosts) {
        window.__adminSessionTouchedCloudPosts.clear();
      }

      // 1. Cerrar el Modo Edición y aplicar los cambios en vista visitante en una sola pasada DOM
      if (typeof closeAdminModal === 'function') {
        closeAdminModal();
      }
      if (typeof toggleAdminMode === 'function') {
        toggleAdminMode(false);
      } else {
        applyAllSectionsChangesToDOM();
      }

      // 2. Persistir en Firestore en tiempo real permitiendo popup de Google Auth si aún no había sesión activa
      if (typeof window.persistSiteDataInRealtime === 'function') {
        await window.persistSiteDataInRealtime(false, { allowAuthPopup: true });
      } else if (typeof showToastNotification === 'function') {
        showToastNotification('¡Todos los cambios han sido aplicados en tiempo real a la página!');
      }
    }

    function toggleAdminMode(enable) {
      const adminCssLink = document.getElementById("blutuAdminStylesheet");
      if (adminCssLink && adminCssLink.media !== "all") adminCssLink.media = "all";
      if ((enable === true || (enable === undefined && !isAdminMode)) && !window.__adminModalsMounted) {
        ensureAdminModalsReady().then(() => {
          if (typeof syncCartConfigInputsUI === "function") syncCartConfigInputsUI();
        });
      }
      const wasAdminBefore = Boolean(isAdminMode);
      if (enable === undefined) {
        isAdminMode = !isAdminMode;
      } else {
        isAdminMode = Boolean(enable);
      }

      if (isAdminMode && (!wasAdminBefore || !adminEditSessionBaseline)) {
        captureAdminEditSessionBaseline();
      }

      const banner = document.getElementById('adminModeBanner');
      const liveAdmin = document.getElementById('inlineLiveAdmin');
      const blogAdmin = document.getElementById('inlineBlogAdmin');
      const merchAdmin = document.getElementById('inlineMerchAdmin');
      const galleryAdmin = document.getElementById('inlineGalleryAdmin');
      const gamesAdmin = document.getElementById('inlineGamesAdmin');
      const commentsAdmin = document.getElementById('inlineCommentsAdmin');
      const liveSection = document.getElementById('liveSection');
      const merchSection = document.getElementById('merchSection');
      const gamesSection = document.getElementById('gamesSection');
      const commentsSection = document.getElementById('commentsSection');
      const liveBadge = document.getElementById('liveSectionHiddenBadge');
      const merchBadge = document.getElementById('merchSectionHiddenBadge');
      const gamesBadge = document.getElementById('gamesSectionHiddenBadge');
      const buzonBadge = document.getElementById('buzonSectionHiddenBadge');

      if (isAdminMode) {
        sessionStorage.setItem('blutu_admin_logged', 'true');
        if (banner) banner.style.display = 'flex';
        if (liveAdmin) liveAdmin.style.display = 'block';
        if (blogAdmin) blogAdmin.style.display = 'block';
        if (merchAdmin) merchAdmin.style.display = 'block';
        if (galleryAdmin) galleryAdmin.style.display = 'block';
        if (gamesAdmin) gamesAdmin.style.display = 'block';
        if (commentsAdmin) commentsAdmin.style.display = 'block';

        if (liveSection) liveSection.style.display = 'block';
        if (merchSection) merchSection.style.display = 'block';
        if (typeof showAllMoreSectionsForAdmin === 'function') {
          showAllMoreSectionsForAdmin();
        } else {
          if (gamesSection) gamesSection.style.display = 'block';
          if (commentsSection) commentsSection.style.display = 'block';
        }

        // Al entrar al modo edición, todas las secciones permanecen plegadas
        const allSectionIds = ['liveSection', 'musicSection', 'contactSection', 'merchSection', 'gallerySection', 'blogSection', 'gamesSection', 'commentsSection'];
        allSectionIds.forEach(id => {
          const panel = document.getElementById(id);
          if (panel) {
            panel.classList.add('is-collapsed');
            delete panel.dataset.animatingCollapse;
          }
        });
        if (typeof syncLastVisibleTombstoneSection === 'function') syncLastVisibleTombstoneSection();

        document.querySelectorAll('.admin-section, .inline-admin-panel details').forEach(sec => sec.removeAttribute('open'));

        if (liveBadge) liveBadge.style.display = (isLiveSectionVisible === false) ? 'inline-block' : 'none';
        if (merchBadge) merchBadge.style.display = (isMerchSectionVisible === false) ? 'inline-block' : 'none';
        if (gamesBadge) gamesBadge.style.display = (isGamesSectionVisible === false) ? 'inline-block' : 'none';
        if (buzonBadge) buzonBadge.style.display = (isBuzonSectionVisible === false) ? 'inline-block' : 'none';
        if (typeof updateGamesVisibilityUI === 'function') updateGamesVisibilityUI();

        const inlineBuzonCheck = document.getElementById('inlineBuzonVisibleCheckbox');
        if (inlineBuzonCheck) inlineBuzonCheck.checked = (isBuzonSectionVisible !== false);
        const adminBuzonInput = document.getElementById('adminBuzonVisibleInput');
        if (adminBuzonInput) adminBuzonInput.checked = (isBuzonSectionVisible !== false);

        currentSelectedPostVal = 'new';
        if (typeof populatePostSelect === 'function') populatePostSelect();
        if (typeof renderGalleryTabs === 'function') renderGalleryTabs(true);
        if (typeof renderAdminLiveList === 'function') renderAdminLiveList();
        if (typeof renderLiveSection === 'function') renderLiveSection();
        if (typeof renderAdminMerchList === 'function') renderAdminMerchList();
        if (typeof renderMerchSection === 'function') renderMerchSection();
        if (typeof renderAdminPostsList === 'function') renderAdminPostsList();
        if (typeof renderBlogPosts === 'function') renderBlogPosts();
        if (typeof renderGamesSection === 'function') renderGamesSection();
        if (typeof window.renderCommentsListFromMemory === 'function') window.renderCommentsListFromMemory();
        if (typeof window.refreshAdminCommentsList === 'function') window.refreshAdminCommentsList();
        if (typeof renderCartModal === 'function') renderCartModal();
      } else {
        try { sessionStorage.removeItem('blutu_admin_logged'); } catch (e) {}
        if (banner) banner.style.display = 'none';
        if (liveAdmin) liveAdmin.style.display = 'none';
        if (blogAdmin) blogAdmin.style.display = 'none';
        if (merchAdmin) merchAdmin.style.display = 'none';
        if (galleryAdmin) galleryAdmin.style.display = 'none';
        if (gamesAdmin) gamesAdmin.style.display = 'none';
        if (commentsAdmin) commentsAdmin.style.display = 'none';

        if (typeof closeGalleryMediaModal === 'function') closeGalleryMediaModal();
        if (typeof closeCartConfigModal === 'function') closeCartConfigModal();
        const openMerchModalEl = document.getElementById('merchDetailModal');
        if (openMerchModalEl && openMerchModalEl.style.display !== 'none') closeMerchModal();
        const openBlogModalEl = document.getElementById('blogReadModal');
        if (openBlogModalEl && openBlogModalEl.style.display !== 'none') closeBlogModal();

        ['liveSection', 'musicSection', 'contactSection', 'merchSection'].forEach(id => {
          const panel = document.getElementById(id);
          if (panel) {
            panel.classList.add('is-collapsed');
            delete panel.dataset.animatingCollapse;
          }
        });

        const activeButtons = Array.isArray(liveButtonsData) ? liveButtonsData.filter(b => b.visible !== false) : [];
        if (liveSection) liveSection.style.display = (isLiveSectionVisible !== false && activeButtons.length > 0) ? 'block' : 'none';

        const activeMerch = Array.isArray(merchItemsData) ? merchItemsData.filter(item => item.visible !== false) : [];
        if (merchSection) merchSection.style.display = (isMerchSectionVisible !== false && activeMerch.length > 0) ? 'block' : 'none';

        if (typeof resetMoreSectionsForVisitor === 'function') {
          resetMoreSectionsForVisitor();
        } else {
          if (gamesSection) gamesSection.style.display = (isGamesSectionVisible !== false) ? 'block' : 'none';
          if (commentsSection) commentsSection.style.display = (isBuzonSectionVisible !== false) ? 'block' : 'none';
        }

        if (liveBadge) liveBadge.style.display = 'none';
        if (merchBadge) merchBadge.style.display = 'none';
        if (gamesBadge) gamesBadge.style.display = 'none';
        if (buzonBadge) buzonBadge.style.display = 'none';
        if (typeof updateGamesVisibilityUI === 'function') updateGamesVisibilityUI();

        if (typeof renderGalleryTabs === 'function') renderGalleryTabs(true);
        if (typeof renderLiveSection === 'function') renderLiveSection();
        if (typeof renderMerchSection === 'function') renderMerchSection();
        if (typeof renderBlogPosts === 'function') renderBlogPosts();
        if (typeof renderGamesSection === 'function') renderGamesSection();
        if (typeof window.renderCommentsListFromMemory === 'function') window.renderCommentsListFromMemory();
        if (typeof renderCartModal === 'function') renderCartModal();
        if (typeof syncLastVisibleTombstoneSection === 'function') syncLastVisibleTombstoneSection();
      }
    }

    window.toggleAdminMode = toggleAdminMode;
    window.saveMasterAdminData = saveMasterAdminData;
    window.discardMasterAdminData = discardMasterAdminData;
    window.openAdminPanel = openAdminPanel;
    window.closeAdminPanel = closeAdminPanel;
    window.closeAdminModal = closeAdminModal;
    window.getAdminPanelHTML = getAdminPanelHTML;
    window.openAdminModal = openAdminModal;

    function openAdminPanel() {
      toggleAdminMode(true);
    }

    function openAdminModal() {
      toggleAdminMode(true);
    }

    function verifyPassword() {
      if (typeof window.handleGoogleSignIn === 'function') {
        window.handleGoogleSignIn();
      }
    }

    function downloadFile(filename, text) {
      const element = document.createElement('a');
      element.setAttribute('href', 'data:text/html;charset=utf-8,' + encodeURIComponent(text));
      element.setAttribute('download', filename);
      element.style.display = 'none';
      document.body.appendChild(element);
      element.click();
      document.body.removeChild(element);
    }

    function showToastNotification(message, isError = false) {
      let toast = document.getElementById('realtimeSaveToast');
      let icon = document.getElementById('realtimeSaveToastIcon');
      let text = document.getElementById('realtimeSaveToastText');
      if (!toast) {
        toast = document.createElement('div');
        toast.id = 'realtimeSaveToast';
        toast.style.cssText = 'display: none; position: fixed; bottom: 32px; left: 50%; transform: translateX(-50%) translateY(20px); background: rgba(9, 11, 16, 0.96); border: 2px solid var(--accent-light); color: var(--white); padding: 14px 26px; border-radius: 30px; font-family: Cinzel, serif; font-size: 0.98rem; z-index: 100000; box-shadow: 0 0 25px rgba(90, 116, 191, 0.7); backdrop-filter: blur(10px); align-items: center; gap: 10px; pointer-events: none; transition: all 0.35s cubic-bezier(0.16, 1, 0.3, 1); opacity: 0;';
        toast.innerHTML = `<span id="realtimeSaveToastIcon" style="font-size: 1.25rem;">${isError ? '⚠️' : '✨'}</span><span id="realtimeSaveToastText">${message}</span>`;
        document.body.appendChild(toast);
        icon = document.getElementById('realtimeSaveToastIcon');
        text = document.getElementById('realtimeSaveToastText');
      }
      if (icon) icon.textContent = isError ? '⚠️' : '✨';
      if (text) text.textContent = message;
      toast.style.borderColor = isError ? '#ff6b6b' : 'var(--accent-light)';
      toast.style.boxShadow = isError ? '0 0 25px rgba(255, 107, 107, 0.6)' : '0 0 25px rgba(90, 116, 191, 0.7)';
      toast.style.display = 'flex';
      setTimeout(() => {
        toast.style.opacity = '1';
        toast.style.transform = 'translateX(-50%) translateY(0)';
      }, 10);

      clearTimeout(window.__saveToastTimer);
      window.__saveToastTimer = setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transform = 'translateX(-50%) translateY(20px)';
        setTimeout(() => { toast.style.display = 'none'; }, 400);
      }, 3500);
    }
    window.showToastNotification = showToastNotification;


    async function downloadBackupIndexHtml() {
      const wasAdminMode = Boolean(isAdminMode);
      if (wasAdminMode) {
        toggleAdminMode(false);
      }

      if (typeof window.unmountAdminModals === "function") {
        window.unmountAdminModals();
      } else {
        const dynModals = document.getElementById("blutuAdminModalsRoot");
        if (dynModals) dynModals.remove();
      }

      const modalElement = document.getElementById("adminModal");
      const previousModalDisplay = modalElement ? modalElement.style.display : "none";
      const previousInnerHTML = modalElement ? modalElement.innerHTML : "";
      if (modalElement) {
        modalElement.style.display = "none";
        modalElement.innerHTML = "";
      }

      const wasRevealedBeforeExport = hasRevealedMoreSections;
      const wasMuchMoreRevealedBeforeExport = hasRevealedMuchMoreSections;
      if (!wasAdminMode && typeof resetMoreSectionsForVisitor === "function") {
        resetMoreSectionsForVisitor();
      }

      if (typeof window.destroyBlutuDinoEasterEgg === "function") {
        window.destroyBlutuDinoEasterEgg();
      }
      if (typeof destroyActiveMiniGame === "function") {
        destroyActiveMiniGame();
      }

      // Vaciar temporalmente contenedores renderizados dinámicamente para mantener index.html entre 15 y 50 KB
      const transientContainers = [
        "liveButtonsContainer",
        "merchCategoryTabs",
        "merchContainer",
        "galleryTabsContainer",
        "carouselTrack",
        "carouselDots",
        "blogSliderTrack",
        "blogDots",
        "gamesCardsContainer",
        "blogModalBody",
        "merchModalBody"
      ];
      const savedHtmlMap = new Map();
      transientContainers.forEach((id) => {
        const el = document.getElementById(id);
        if (el) {
          savedHtmlMap.set(id, el.innerHTML);
          el.innerHTML = "";
        }
      });

      const commentsFeedEl = document.getElementById("commentsFeed");
      const savedCommentsHtml = commentsFeedEl ? commentsFeedEl.innerHTML : null;
      if (commentsFeedEl) {
        commentsFeedEl.innerHTML = `<div class="comments-loading"><span class="comments-spinner"></span><p>Conectando con las sombras...</p></div>`;
      }

      document.querySelectorAll(".bat-sparkle-particle, .greek-cross-particle").forEach((node) => node.remove());
      const toastEl = document.getElementById("realtimeSaveToast");
      if (toastEl) toastEl.remove();

      const newBuildTimestamp = Date.now();
      blutuBuildTimestamp = newBuildTimestamp;
      const buildMeta = document.querySelector('meta[name="blutu-build-timestamp"]');
      if (buildMeta) buildMeta.setAttribute("content", String(newBuildTimestamp));

      let currentDocumentHTML = "<!DOCTYPE html>\n" + document.documentElement.outerHTML;

      // Restaurar contenedores en vivo inmediatamente
      savedHtmlMap.forEach((html, id) => {
        const el = document.getElementById(id);
        if (el) el.innerHTML = html;
      });
      if (commentsFeedEl && savedCommentsHtml !== null) {
        commentsFeedEl.innerHTML = savedCommentsHtml;
      }

      if (!wasAdminMode && wasRevealedBeforeExport) {
        hasRevealedMoreSections = true;
        window.hasRevealedMoreSections = true;
        const moreSection = document.getElementById("moreSection");
        if (moreSection) moreSection.classList.add("more-hidden-section");
        ["gallerySection", "blogSection", "muchMoreSection"].forEach((id) => {
          const sec = document.getElementById(id);
          if (sec) sec.classList.remove("more-hidden-section");
        });
        if (wasMuchMoreRevealedBeforeExport) {
          hasRevealedMuchMoreSections = true;
          window.hasRevealedMuchMoreSections = true;
          const muchMoreSection = document.getElementById("muchMoreSection");
          if (muchMoreSection) muchMoreSection.classList.add("more-hidden-section");
          ["gamesSection", "commentsSection"].forEach((id) => {
            const sec = document.getElementById(id);
            if (!sec) return;
            if (id === "gamesSection" && isGamesSectionVisible === false) return;
            if (id === "commentsSection" && isBuzonSectionVisible === false) return;
            sec.classList.remove("more-hidden-section");
          });
        }
        if (typeof syncLastVisibleTombstoneSection === "function") syncLastVisibleTombstoneSection();
      }

      if (modalElement) {
        modalElement.style.display = previousModalDisplay;
        modalElement.innerHTML = previousInnerHTML;
      }

      if (wasAdminMode) {
        await ensureAdminModalsReady();
        toggleAdminMode(true);
      }

      // Limpiar scripts transitorios de Vite o YouTube
      const viteClientRe = new RegExp("<" + 'script[^>]*src="/@vite/client"[^>]*><' + "/script>\\s*", "gi");
      currentDocumentHTML = currentDocumentHTML.replace(viteClientRe, "");
      currentDocumentHTML = currentDocumentHTML.replace(/<script[^>]*src="https:\/\/www\.youtube\.com\/(iframe_api|s\/player\/[^"]*)"[^>]*><\/script>/gi, "");
      currentDocumentHTML = currentDocumentHTML.replace(/<div id="yt-player-container"[^>]*>[\s\S]*?<\/div>/gi, "");
      currentDocumentHTML = currentDocumentHTML.replace(/<audio id="blutu-direct-audio"[^>]*>[\s\S]*?<\/audio>/gi, "");

      downloadFile("index.html", currentDocumentHTML);
    }

    function downloadBackupSiteDataJson() {
      const snapshot = {
        exportedAt: new Date().toISOString(),
        buildTimestamp: blutuBuildTimestamp,
        posts: postsData,
        galleries: galleriesData,
        galleryOrder: typeof getOrderedGalleryKeys === "function" ? getOrderedGalleryKeys() : Object.keys(galleriesData),
        live: {
          buttons: liveButtonsData,
          isVisible: isLiveSectionVisible,
          description: liveSectionDescription
        },
        merch: {
          items: merchItemsData,
          categories: merchCategories,
          cartConfig: cartConfig,
          isVisible: isMerchSectionVisible,
          description: merchSectionDescription
        },
        muro: {
          isVisible: isBuzonSectionVisible,
          gamesVisible: isGamesSectionVisible,
          hiddenCommentIds: hiddenCommentIds,
          gamesData: gamesData
        }
      };
      const element = document.createElement("a");
      element.setAttribute("href", "data:application/json;charset=utf-8," + encodeURIComponent(JSON.stringify(snapshot, null, 2)));
      element.setAttribute("download", "blutu-respaldo-datos.json");
      element.style.display = "none";
      document.body.appendChild(element);
      element.click();
      document.body.removeChild(element);
    }


    function formatIsoToSpanishDate(isoString) {
      if (!isoString) return '';
      const parts = isoString.split('-');
      if (parts.length !== 3) return isoString;
      const months = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
      return `${parseInt(parts[2], 10)} de ${months[parseInt(parts[1], 10) - 1]}, ${parts[0]}`;
    }

    function handlePostImageAutoCaption(urlVal) {}
    function handleNewGalleryPhotoUrlAutoCaption(urlVal) {}

    function formatPostInlineText(str) {
      if (!str) return '';
      let formatted = str;
      // Convert Markdown links [Text](URL)
      formatted = formatted.replace(/\[([^\]]+)\]\(([^\s\)]+)\)/gi, (match, txt, url) => {
        let href = url.trim();
        if (!href.match(/^(https?:\/\/|mailto:|\/)/i)) {
          href = 'https://' + href;
        }
        return `<a href="${escapeHtmlAttr(href)}" target="_blank" rel="noopener noreferrer" class="blog-inline-link">${txt}</a>`;
      });
      // Convert [link:URL|Text]
      formatted = formatted.replace(/\[link:\s*([^|]+)\|([^\]]+)\]/gi, (match, url, txt) => {
        let href = url.trim();
        if (!href.match(/^(https?:\/\/|mailto:|\/)/i)) {
          href = 'https://' + href;
        }
        return `<a href="${escapeHtmlAttr(href)}" target="_blank" rel="noopener noreferrer" class="blog-inline-link">${txt.trim()}</a>`;
      });
      // Convert [color:COLOR|Text] (soporta anidación limpia)
      for (let pass = 0; pass < 4 && /\[color:\s*[^|\[\]]+\|[^\[\]]+\]/i.test(formatted); pass++) {
        formatted = formatted.replace(/\[color:\s*([^|\[\]]+)\|([^\[\]]+)\]/gi, (match, color, txt) => {
          const safeColor = escapeHtmlAttr(color.trim());
          return `<span data-blutu-color="${safeColor}" style="color: ${safeColor};">${txt}</span>`;
        });
      }
      // Convert [center]Text[/center]
      formatted = formatted.replace(/\[center\]([\s\S]*?)\[\/center\]/gi, (match, txt) => {
        return `<span data-blutu-center="true" style="display: block; text-align: center; text-align-last: center;">${txt}</span>`;
      });
      // Convert [center:Text]
      formatted = formatted.replace(/\[center:\s*([^\]]+)\]/gi, (match, txt) => {
        return `<span data-blutu-center="true" style="display: block; text-align: center; text-align-last: center;">${txt}</span>`;
      });
      // Convert Bold **text**
      formatted = formatted.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
      return formatted;
    }

    /* GESTIÓN DE SELECCIÓN Y FORMATO DIRECTO EN EL ARTÍCULO (WYSIWYG) */
    let savedBlogSelectionRange = null;
    let savedBlogActiveBlock = null;
    let activeBlogImageModalMode = 'insert-inline'; // 'insert-inline' | 'edit-inline' | 'cover'
    let activeEditingInlineFigure = null;
    let activeEditingLinkAnchor = null;
    let activeEditingColorSpan = null;

    function getClosestEditableBlockInBody(node) {
      const bodyEl = document.getElementById('blogEditableBody');
      if (!bodyEl || !node) return null;
      let cur = node.nodeType === 1 ? node : node.parentElement;
      while (cur && cur !== bodyEl) {
        if (cur.parentElement === bodyEl) return cur;
        cur = cur.parentElement;
      }
      return null;
    }

    function saveCurrentBlogSelection() {
      const bodyEl = document.getElementById('blogEditableBody');
      if (!bodyEl || !window.getSelection) return;
      const sel = window.getSelection();
      if (sel && sel.rangeCount > 0) {
        const range = sel.getRangeAt(0);
        if (bodyEl.contains(range.commonAncestorContainer)) {
          savedBlogSelectionRange = range.cloneRange();
          savedBlogActiveBlock = getClosestEditableBlockInBody(range.commonAncestorContainer);
        }
      }
    }

    function restoreSavedBlogSelection() {
      const bodyEl = document.getElementById('blogEditableBody');
      if (!bodyEl || !window.getSelection) return false;
      bodyEl.focus();
      if (savedBlogSelectionRange) {
        try {
          const sel = window.getSelection();
          sel.removeAllRanges();
          sel.addRange(savedBlogSelectionRange);
          return true;
        } catch (e) {}
      }
      return false;
    }

    function applyBlogInlineFormat(type) {
      const bodyEl = document.getElementById('blogEditableBody');
      if (!bodyEl) return;

      const modalBody = document.getElementById('blogModalBody');
      if (modalBody && hasPendingBlogParagraphReveal(modalBody)) {
        resetBlogParagraphRevealState(modalBody);
      }

      saveCurrentBlogSelection();

      if (type === 'img') {
        openBlogImageModal('insert-inline');
        return;
      }
      if (type === 'link') {
        openInsertLinkModal();
        return;
      }
      if (type === 'color') {
        openInsertColorModal();
        return;
      }

      bodyEl.focus();
      const sel = window.getSelection ? window.getSelection() : null;
      if (!sel || sel.rangeCount === 0 || !bodyEl.contains(sel.anchorNode)) {
        if (savedBlogSelectionRange) {
          restoreSavedBlogSelection();
        } else {
          const firstBlock = bodyEl.querySelector('p, h2') || bodyEl;
          const r = document.createRange();
          r.selectNodeContents(firstBlock);
          r.collapse(false);
          if (sel) {
            sel.removeAllRanges();
            sel.addRange(r);
          }
        }
      }

      if (type === 'bold') {
        document.execCommand('bold', false, null);
        syncBlogParagraphFirstLetterColors(bodyEl);
        syncLiveBlogModalToMemory(false);
        return;
      }

      const activeRange = (sel && sel.rangeCount > 0) ? sel.getRangeAt(0) : null;
      let block = activeRange ? getClosestEditableBlockInBody(activeRange.commonAncestorContainer) : savedBlogActiveBlock;
      if (!block || block.classList.contains('blutu-editable-figure')) {
        block = bodyEl.querySelector('p, h2');
      }
      if (!block) return;

      if (type === 'subtitle') {
        const isCurrentlyH2 = block.tagName.toUpperCase() === 'H2';
        const replacement = document.createElement(isCurrentlyH2 ? 'p' : 'h2');
        if (block.getAttribute('data-blutu-center') === 'true') {
          replacement.setAttribute('data-blutu-center', 'true');
          replacement.style.textAlign = 'center';
        }
        replacement.innerHTML = block.innerHTML || '<br>';
        bodyEl.replaceChild(replacement, block);
        if (sel) {
          const nr = document.createRange();
          nr.selectNodeContents(replacement);
          nr.collapse(false);
          sel.removeAllRanges();
          sel.addRange(nr);
        }
        syncBlogParagraphFirstLetterColors(bodyEl);
        syncLiveBlogModalToMemory(false);
        return;
      }

      if (type === 'center') {
        const nowCentered = block.getAttribute('data-blutu-center') !== 'true';
        if (nowCentered) {
          block.setAttribute('data-blutu-center', 'true');
          block.style.textAlign = 'center';
          block.style.textAlignLast = 'center';
        } else {
          block.removeAttribute('data-blutu-center');
          block.style.textAlign = '';
          block.style.textAlignLast = '';
        }
        syncBlogParagraphFirstLetterColors(bodyEl);
        syncLiveBlogModalToMemory(false);
      }
    }
    window.applyBlogInlineFormat = applyBlogInlineFormat;
    function insertFormat(targetOrType, maybeType) {
      applyBlogInlineFormat(maybeType || targetOrType);
    }
    window.insertFormat = insertFormat;

    let modalImgUrlScanTimer = null;
    let modalImgAuraScanToken = 0;
    let modalImgInitialNormalizedUrl = '';

    function syncModalImgAuraControlsUI(enabled, statusMsg) {
      const cb = document.getElementById('modalImgUseAuraCheckbox');
      const wrap = document.getElementById('modalImgAuraControlsWrap');
      const statusEl = document.getElementById('modalImgAuraScanStatus');
      if (cb) cb.checked = Boolean(enabled);
      if (wrap) {
        wrap.style.opacity = enabled ? '1' : '0.42';
        wrap.style.pointerEvents = enabled ? 'auto' : 'none';
      }
      if (statusEl && typeof statusMsg === 'string') {
        statusEl.textContent = statusMsg;
      }
    }

    function toggleModalImgUseAura(checked) {
      const enabled = Boolean(checked);
      const auraInput = document.getElementById('modalImgAura');
      const urlInput = document.getElementById('modalImgUrl');
      const curHex = auraInput ? auraInput.value.trim() : '';
      syncModalImgAuraControlsUI(
        enabled,
        enabled ? (curHex ? `Aura activa (${curHex})` : 'Listo para extraer 1 vez') : 'Sin aura (desactivado)'
      );
      if (enabled && !curHex && urlInput && urlInput.value.trim()) {
        rescanModalImgAuraFromUrl(false);
      }
    }
    window.toggleModalImgUseAura = toggleModalImgUseAura;

    function handleModalImgManualAuraColor(val) {
      const hex = String(val || '').trim().toUpperCase();
      const auraInput = document.getElementById('modalImgAura');
      if (auraInput && hex) auraInput.value = hex;
      syncModalImgAuraControlsUI(true, `Color personalizado (${hex})`);
    }
    window.handleModalImgManualAuraColor = handleModalImgManualAuraColor;

    function handleModalImgManualAuraText(val) {
      const trimmed = String(val || '').trim();
      const picker = document.getElementById('modalImgAuraPicker');
      const hex = rgbOrCssToHexUpper(trimmed);
      if (picker && hex) picker.value = hex.toLowerCase();
      if (trimmed) {
        syncModalImgAuraControlsUI(true, `Color definido (${hex || trimmed})`);
      }
    }
    window.handleModalImgManualAuraText = handleModalImgManualAuraText;

    async function rescanModalImgAuraFromUrl(forceRefresh = false) {
      const urlInput = document.getElementById('modalImgUrl');
      const auraInput = document.getElementById('modalImgAura');
      const auraPicker = document.getElementById('modalImgAuraPicker');
      const cb = document.getElementById('modalImgUseAuraCheckbox');
      const statusEl = document.getElementById('modalImgAuraScanStatus');

      const rawUrl = urlInput ? urlInput.value.trim() : '';
      if (!rawUrl) {
        if (forceRefresh) showToastNotification('Ingresa primero la URL de la imagen para extraer su color.', true);
        return '';
      }

      const token = ++modalImgAuraScanToken;
      if (statusEl) statusEl.textContent = 'Escaneando color 1 vez...';

      const extractedHex = await extractAuraHexOnceForAdmin(rawUrl, forceRefresh);
      if (token !== modalImgAuraScanToken) return extractedHex;

      if (extractedHex) {
        if (auraInput) auraInput.value = extractedHex;
        if (auraPicker) auraPicker.value = extractedHex.toLowerCase();
        if (forceRefresh && cb && !cb.checked) {
          syncModalImgAuraControlsUI(true, `✨ Extraído: ${extractedHex}`);
        } else {
          const isChecked = cb ? cb.checked : true;
          syncModalImgAuraControlsUI(isChecked, isChecked ? `✨ Extraído: ${extractedHex}` : `Extraído (${extractedHex}) — desactivado`);
        }
      } else {
        if (statusEl) statusEl.textContent = 'No se pudo extraer (elige color manual o desactiva)';
      }
      return extractedHex;
    }
    window.rescanModalImgAuraFromUrl = rescanModalImgAuraFromUrl;

    function handleModalImgUrlInputForAura(rawVal) {
      if (modalImgUrlScanTimer) {
        clearTimeout(modalImgUrlScanTimer);
        modalImgUrlScanTimer = null;
      }
      const trimmed = String(rawVal || '').trim();
      if (!trimmed) return;
      if (trimmed === modalImgInitialNormalizedUrl) return;

      modalImgUrlScanTimer = setTimeout(() => {
        modalImgUrlScanTimer = null;
        modalImgInitialNormalizedUrl = trimmed;
        rescanModalImgAuraFromUrl(false);
      }, 340);
    }
    window.handleModalImgUrlInputForAura = handleModalImgUrlInputForAura;

    function openBlogImageModal(mode = 'insert-inline', targetFigure = null) {
      if (!window.__adminModalsMounted) {
        saveCurrentBlogSelection();
        ensureAdminModalsReady().then(() => openBlogImageModal(mode, targetFigure));
        return;
      }
      activeBlogImageModalMode = mode;
      activeEditingInlineFigure = targetFigure || null;
      saveCurrentBlogSelection();

      if (modalImgUrlScanTimer) {
        clearTimeout(modalImgUrlScanTimer);
        modalImgUrlScanTimer = null;
      }
      modalImgAuraScanToken++;
      modalImgInitialNormalizedUrl = '';

      const titleEl = document.getElementById('insertImageModalTitle');
      const urlInput = document.getElementById('modalImgUrl');
      const captionInput = document.getElementById('modalImgCaption');
      const auraInput = document.getElementById('modalImgAura');
      const auraPicker = document.getElementById('modalImgAuraPicker');
      const fitGroup = document.getElementById('modalImgFitGroup');
      const removeBtn = document.getElementById('modalImgRemoveBtn');
      const confirmBtn = document.getElementById('modalImgConfirmBtn');

      if (mode === 'cover') {
        const post = getActiveEditableBlogPost() || {};
        const existingUrl = (post.image || '').trim();
        const existingAura = (post.imageAura && String(post.imageAura).trim() && String(post.imageAura).trim().toLowerCase() !== 'none')
          ? String(post.imageAura).trim()
          : '';
        pendingModalCoverOriginalUrl = existingUrl;
        pendingModalCoverImageFit = post.imageFit || 'cover-center';
        modalImgInitialNormalizedUrl = existingUrl;

        if (titleEl) titleEl.textContent = '🖼️ Imagen de Portada';
        if (urlInput) urlInput.value = existingUrl;
        if (captionInput) captionInput.value = post.imageCaption || '';
        const normHex = normalizeCssColorToHex(existingAura) || rgbOrCssToHexUpper(existingAura) || '';
        if (auraInput) auraInput.value = normHex || existingAura;
        if (auraPicker) auraPicker.value = normHex ? normHex.toLowerCase() : '#5a74bf';
        if (fitGroup) fitGroup.style.display = 'block';
        if (removeBtn) removeBtn.style.display = existingUrl ? 'inline-flex' : 'none';
        if (confirmBtn) confirmBtn.textContent = 'Aplicar Portada';

        if (!existingUrl) {
          syncModalImgAuraControlsUI(true, 'Se escaneará 1 vez al insertar');
        } else if (existingAura) {
          syncModalImgAuraControlsUI(true, `Color guardado (${normHex || existingAura})`);
        } else {
          syncModalImgAuraControlsUI(false, 'Sin aura (desactivado)');
        }
      } else if (mode === 'edit-inline' && targetFigure) {
        const imgEl = targetFigure.querySelector('img');
        const capEl = targetFigure.querySelector('figcaption');
        const curUrl = (targetFigure.getAttribute('data-img-url') || (imgEl ? imgEl.getAttribute('src') : '') || '').trim();
        const curCap = capEl ? (capEl.innerText || '').trim() : '';
        const rawCurAura = (targetFigure.getAttribute('data-aura') || (imgEl ? imgEl.getAttribute('data-aura') : '') || '').trim();
        const curAura = rawCurAura.toLowerCase() === 'none' ? '' : rawCurAura;
        modalImgInitialNormalizedUrl = curUrl;

        if (titleEl) titleEl.textContent = '🖼️ Editar Imagen del Artículo';
        if (urlInput) urlInput.value = curUrl;
        if (captionInput) captionInput.value = curCap;
        const normHex = normalizeCssColorToHex(curAura) || rgbOrCssToHexUpper(curAura) || '';
        if (auraInput) auraInput.value = normHex || curAura;
        if (auraPicker) auraPicker.value = normHex ? normHex.toLowerCase() : '#5a74bf';
        if (fitGroup) fitGroup.style.display = 'none';
        if (removeBtn) removeBtn.style.display = 'inline-flex';
        if (confirmBtn) confirmBtn.textContent = 'Aplicar Cambios';

        if (curAura) {
          syncModalImgAuraControlsUI(true, `Color guardado (${normHex || curAura})`);
        } else {
          syncModalImgAuraControlsUI(false, 'Sin aura (desactivado)');
        }
      } else {
        let initialUrl = '';
        if (savedBlogSelectionRange) {
          const selText = savedBlogSelectionRange.toString().trim();
          if (/^https?:\/\//i.test(selText)) initialUrl = selText;
        }
        if (titleEl) titleEl.textContent = '🖼️ Insertar Imagen en el Artículo';
        if (urlInput) urlInput.value = initialUrl;
        if (captionInput) captionInput.value = '';
        if (auraInput) auraInput.value = '';
        if (auraPicker) auraPicker.value = '#5a74bf';
        if (fitGroup) fitGroup.style.display = 'none';
        if (removeBtn) removeBtn.style.display = 'none';
        if (confirmBtn) confirmBtn.textContent = 'Insertar Imagen';

        syncModalImgAuraControlsUI(true, 'Se escaneará 1 vez al insertar');
        if (initialUrl) {
          modalImgInitialNormalizedUrl = initialUrl;
          rescanModalImgAuraFromUrl(false);
        }
      }

      const modal = document.getElementById('insertImageModal');
      if (modal) modal.style.display = 'flex';
      setTimeout(() => {
        if (urlInput) urlInput.focus();
      }, 80);
    }
    window.openBlogImageModal = openBlogImageModal;

    function openInsertImageModal() {
      openBlogImageModal('insert-inline');
    }

    function closeInsertImageModal() {
      if (modalImgUrlScanTimer) {
        clearTimeout(modalImgUrlScanTimer);
        modalImgUrlScanTimer = null;
      }
      modalImgAuraScanToken++;
      const modal = document.getElementById('insertImageModal');
      if (modal) modal.style.display = 'none';
    }

    function removeImageFromInsertModal() {
      if (activeBlogImageModalMode === 'cover') {
        removeLiveCoverImage();
      } else if (activeBlogImageModalMode === 'edit-inline' && activeEditingInlineFigure) {
        const bodyEl = document.getElementById('blogEditableBody');
        activeEditingInlineFigure.remove();
        activeEditingInlineFigure = null;
        if (bodyEl && !bodyEl.children.length) {
          bodyEl.innerHTML = '<p><br></p>';
        }
        syncLiveBlogModalToMemory(true);
      }
      closeInsertImageModal();
    }
    window.removeImageFromInsertModal = removeImageFromInsertModal;

    async function confirmInsertImageModal() {
      const url = (document.getElementById('modalImgUrl')?.value || '').trim();
      const caption = (document.getElementById('modalImgCaption')?.value || '').trim();
      const useAuraCb = document.getElementById('modalImgUseAuraCheckbox');
      const auraInput = document.getElementById('modalImgAura');
      const confirmBtn = document.getElementById('modalImgConfirmBtn');

      if (!url) {
        showToastNotification('Por favor ingresa la URL de la imagen.', true);
        return;
      }

      let aura = '';
      if (!useAuraCb || useAuraCb.checked) {
        aura = auraInput ? auraInput.value.trim() : '';
        if (!aura) {
          if (confirmBtn) confirmBtn.disabled = true;
          try {
            aura = await extractAuraHexOnceForAdmin(url, false);
          } finally {
            if (confirmBtn) confirmBtn.disabled = false;
          }
        }
        const normalizedHex = rgbOrCssToHexUpper(aura);
        if (normalizedHex) aura = normalizedHex;
      }

      const modalBody = document.getElementById('blogModalBody');
      const post = getActiveEditableBlogPost();

      if (activeBlogImageModalMode === 'cover' && post) {
        const urlChanged = url !== pendingModalCoverOriginalUrl;
        post.image = url;
        post.imageCaption = caption;
        post.imageAura = aura;
        post.imageFit = urlChanged ? 'cover-center' : (pendingModalCoverImageFit || post.imageFit || 'cover-center');
        post.updatedAt = new Date().toISOString();
        const coverContainer = document.getElementById('blogLiveCoverContainer');
        if (coverContainer) {
          coverContainer.innerHTML = renderLiveCoverSectionHTML(post);
        }
        applyBlogModalAdaptiveTheme(post, modalBody);
        if (modalBody) {
          setTimeout(() => applyLiveBlogImagesAura(modalBody, post), 30);
        }
        if (currentGameBlogKey && gamesData && gamesData.blogs && gamesData.blogs[currentGameBlogKey]) {
          renderGamesSection();
          persistGamesLocalCache();
        } else {
          renderBlogPosts();
          persistPostsToLocalVaults();
        }
        closeInsertImageModal();
        return;
      }

      if (activeBlogImageModalMode === 'edit-inline' && activeEditingInlineFigure) {
        activeEditingInlineFigure.setAttribute('data-img-url', url);
        activeEditingInlineFigure.setAttribute('data-aura', aura);
        const imgEl = activeEditingInlineFigure.querySelector('img');
        if (imgEl) {
          imgEl.src = url;
          if (aura) imgEl.setAttribute('data-aura', aura);
          else imgEl.removeAttribute('data-aura');
        }
        const capEl = activeEditingInlineFigure.querySelector('figcaption');
        if (capEl) capEl.textContent = caption;
        if (modalBody) {
          setTimeout(() => applyLiveBlogImagesAura(modalBody, post), 30);
        }
        syncLiveBlogModalToMemory(true);
        closeInsertImageModal();
        return;
      }

      // Modo 'insert-inline': insertar figura directamente en el cuerpo editable
      const bodyEl = document.getElementById('blogEditableBody');
      if (bodyEl) {
        const temp = document.createElement('div');
        temp.innerHTML = buildEditableInlineFigureHTML(url, caption, aura).trim();
        const newFig = temp.firstElementChild;

        if (newFig) {
          const targetBlock = (savedBlogActiveBlock && bodyEl.contains(savedBlogActiveBlock))
            ? savedBlogActiveBlock
            : bodyEl.lastElementChild;

          if (targetBlock && !(targetBlock.innerText || '').trim() && targetBlock.tagName !== 'FIGURE') {
            bodyEl.replaceChild(newFig, targetBlock);
          } else if (targetBlock && targetBlock.nextSibling) {
            bodyEl.insertBefore(newFig, targetBlock.nextSibling);
          } else {
            bodyEl.appendChild(newFig);
          }

          if (!newFig.nextElementSibling || newFig.nextElementSibling.classList.contains('blutu-editable-figure')) {
            const nextP = document.createElement('p');
            nextP.innerHTML = '<br>';
            if (newFig.nextSibling) bodyEl.insertBefore(nextP, newFig.nextSibling);
            else bodyEl.appendChild(nextP);
          }

          if (modalBody) {
            setTimeout(() => applyLiveBlogImagesAura(modalBody, post), 30);
          }
          syncLiveBlogModalToMemory(true);
        }
      }

      closeInsertImageModal();
    }

    function openInsertLinkModal() {
      if (!window.__adminModalsMounted) {
        saveCurrentBlogSelection();
        ensureAdminModalsReady().then(() => openInsertLinkModal());
        return;
      }
      saveCurrentBlogSelection();
      activeEditingLinkAnchor = null;
      let initialText = '';
      let initialUrl = '';

      if (savedBlogSelectionRange) {
        const node = savedBlogSelectionRange.commonAncestorContainer;
        const el = node.nodeType === 1 ? node : node.parentElement;
        const existingA = el ? el.closest('a') : null;
        if (existingA && document.getElementById('blogEditableBody')?.contains(existingA)) {
          activeEditingLinkAnchor = existingA;
          initialText = (existingA.innerText || '').trim();
          initialUrl = (existingA.getAttribute('href') || '').trim();
        } else {
          const selectedText = savedBlogSelectionRange.toString().trim();
          if (/^https?:\/\//i.test(selectedText) || selectedText.startsWith('www.')) {
            initialUrl = selectedText;
          } else {
            initialText = selectedText;
          }
        }
      }

      const textInput = document.getElementById('modalLinkText');
      const urlInput = document.getElementById('modalLinkUrl');
      const removeBtn = document.getElementById('modalLinkRemoveBtn');
      if (textInput) textInput.value = initialText;
      if (urlInput) urlInput.value = initialUrl;
      if (removeBtn) removeBtn.style.display = activeEditingLinkAnchor ? 'inline-flex' : 'none';

      const modal = document.getElementById('insertLinkModal');
      if (modal) modal.style.display = 'flex';

      setTimeout(() => {
        const targetFocus = initialText ? urlInput : textInput;
        if (targetFocus) targetFocus.focus();
      }, 80);
    }

    function closeInsertLinkModal() {
      const modal = document.getElementById('insertLinkModal');
      if (modal) modal.style.display = 'none';
    }

    function removeLinkFromInsertModal() {
      if (activeEditingLinkAnchor && activeEditingLinkAnchor.parentNode) {
        const textNode = document.createTextNode(activeEditingLinkAnchor.innerText || '');
        activeEditingLinkAnchor.parentNode.replaceChild(textNode, activeEditingLinkAnchor);
        activeEditingLinkAnchor = null;
        syncLiveBlogModalToMemory(true);
      }
      closeInsertLinkModal();
    }
    window.removeLinkFromInsertModal = removeLinkFromInsertModal;

    function confirmInsertLinkModal() {
      const textVal = (document.getElementById('modalLinkText')?.value || '').trim();
      let urlVal = (document.getElementById('modalLinkUrl')?.value || '').trim();

      if (!urlVal) {
        showToastNotification('Por favor ingresa la dirección URL del enlace.', true);
        return;
      }

      if (!urlVal.match(/^(https?:\/\/|mailto:|\/)/i)) {
        urlVal = 'https://' + urlVal;
      }
      const linkLabel = textVal || urlVal;

      if (activeEditingLinkAnchor && document.getElementById('blogEditableBody')?.contains(activeEditingLinkAnchor)) {
        activeEditingLinkAnchor.setAttribute('href', urlVal);
        activeEditingLinkAnchor.textContent = linkLabel;
        activeEditingLinkAnchor = null;
        syncLiveBlogModalToMemory(true);
        closeInsertLinkModal();
        return;
      }

      const bodyEl = document.getElementById('blogEditableBody');
      if (bodyEl) {
        const aEl = document.createElement('a');
        aEl.setAttribute('href', urlVal);
        aEl.setAttribute('target', '_blank');
        aEl.setAttribute('rel', 'noopener noreferrer');
        aEl.className = 'blog-inline-link';
        aEl.textContent = linkLabel;

        if (restoreSavedBlogSelection() && window.getSelection) {
          const sel = window.getSelection();
          if (sel && sel.rangeCount > 0) {
            const range = sel.getRangeAt(0);
            range.deleteContents();
            range.insertNode(aEl);
            range.setStartAfter(aEl);
            range.collapse(true);
            sel.removeAllRanges();
            sel.addRange(range);
          }
        } else {
          const lastP = bodyEl.querySelector('p:last-of-type, h2:last-of-type') || bodyEl;
          lastP.appendChild(aEl);
        }
        syncLiveBlogModalToMemory(true);
      }

      closeInsertLinkModal();
    }

    function expandCollapsedRangeToWordIfTouching(range) {
      if (!range || !range.collapsed || range.startContainer.nodeType !== 3) return range;
      const text = range.startContainer.nodeValue || '';
      const offset = range.startOffset;
      const wordCharRe = /[^\s]/;
      const hasBefore = offset > 0 && wordCharRe.test(text[offset - 1]);
      const hasAfter = offset < text.length && wordCharRe.test(text[offset]);
      if (!hasBefore && !hasAfter) return range;

      let start = offset;
      let end = offset;
      while (start > 0 && wordCharRe.test(text[start - 1])) start--;
      while (end < text.length && wordCharRe.test(text[end])) end++;
      if (end > start) {
        const wordRange = range.cloneRange();
        wordRange.setStart(range.startContainer, start);
        wordRange.setEnd(range.startContainer, end);
        return wordRange;
      }
      return range;
    }

    function openInsertColorModal() {
      if (!window.__adminModalsMounted) {
        saveCurrentBlogSelection();
        ensureAdminModalsReady().then(() => openInsertColorModal());
        return;
      }
      const modalBody = document.getElementById('blogModalBody');
      if (modalBody && hasPendingBlogParagraphReveal(modalBody)) {
        resetBlogParagraphRevealState(modalBody);
      }

      saveCurrentBlogSelection();
      activeEditingColorSpan = null;
      let selectedText = '';
      let initialHex = '#8CA2E6';
      const bodyEl = document.getElementById('blogEditableBody');

      if (savedBlogSelectionRange && bodyEl) {
        const node = savedBlogSelectionRange.commonAncestorContainer;
        const el = node.nodeType === 1 ? node : node.parentElement;
        let existingSpan = el ? el.closest('span[data-blutu-color]') : null;

        if (!existingSpan && !savedBlogSelectionRange.collapsed && node.nodeType === 1) {
          const candidateSpans = Array.from(node.querySelectorAll('span[data-blutu-color]')).filter(sp => savedBlogSelectionRange.intersectsNode(sp));
          if (candidateSpans.length === 1 && (candidateSpans[0].innerText || '').trim() === savedBlogSelectionRange.toString().trim()) {
            existingSpan = candidateSpans[0];
          }
        }

        if (existingSpan && bodyEl.contains(existingSpan) && savedBlogSelectionRange.collapsed) {
          activeEditingColorSpan = existingSpan;
          selectedText = (existingSpan.innerText || '').trim();
          initialHex = normalizeCssColorToHex(existingSpan.getAttribute('data-blutu-color') || '#8CA2E6') || '#8CA2E6';
        } else if (savedBlogSelectionRange.collapsed) {
          savedBlogSelectionRange = expandCollapsedRangeToWordIfTouching(savedBlogSelectionRange);
          selectedText = savedBlogSelectionRange.toString().trim();
        } else {
          selectedText = savedBlogSelectionRange.toString().trim();
          if (existingSpan && bodyEl.contains(existingSpan)) {
            activeEditingColorSpan = existingSpan;
            initialHex = normalizeCssColorToHex(existingSpan.getAttribute('data-blutu-color') || '#8CA2E6') || '#8CA2E6';
          }
        }
      }

      const textInput = document.getElementById('modalColorText');
      const removeBtn = document.getElementById('modalColorRemoveBtn');
      if (textInput) textInput.value = selectedText;
      if (removeBtn) removeBtn.style.display = activeEditingColorSpan ? 'inline-flex' : 'none';
      selectColorPreset(initialHex);

      const modal = document.getElementById('insertColorModal');
      if (modal) modal.style.display = 'flex';

      setTimeout(() => {
        if (textInput) textInput.focus();
      }, 80);
    }

    function closeInsertColorModal() {
      const modal = document.getElementById('insertColorModal');
      if (modal) modal.style.display = 'none';
    }

    function removeColorFromInsertModal() {
      const bodyEl = document.getElementById('blogEditableBody');
      if (activeEditingColorSpan && activeEditingColorSpan.parentNode) {
        const frag = document.createDocumentFragment();
        while (activeEditingColorSpan.firstChild) {
          frag.appendChild(activeEditingColorSpan.firstChild);
        }
        activeEditingColorSpan.parentNode.replaceChild(frag, activeEditingColorSpan);
        activeEditingColorSpan = null;
        syncBlogParagraphFirstLetterColors(bodyEl);
        syncLiveBlogModalToMemory(true);
      }
      closeInsertColorModal();
    }
    window.removeColorFromInsertModal = removeColorFromInsertModal;

    function selectColorPreset(hexColor) {
      const picker = document.getElementById('modalColorPicker');
      const hexInput = document.getElementById('modalColorHex');
      if (picker && /^#[0-9A-Fa-f]{6}$/.test(hexColor)) picker.value = hexColor;
      if (hexInput) hexInput.value = hexColor;
      updateColorPreview();
    }

    function syncTextColorFromPicker(val) {
      const hexInput = document.getElementById('modalColorHex');
      if (hexInput) hexInput.value = val;
      updateColorPreview();
    }

    function syncTextColorFromInput(val) {
      const picker = document.getElementById('modalColorPicker');
      if (picker && val.match(/^#[0-9A-Fa-f]{6}$/)) {
        picker.value = val;
      }
      updateColorPreview();
    }

    function updateColorPreview() {
      const textVal = (document.getElementById('modalColorText')?.value || '').trim() || 'Ejemplo de texto con color';
      const colorVal = (document.getElementById('modalColorHex')?.value || '#8CA2E6').trim();
      const previewEl = document.getElementById('modalColorPreviewText');
      if (previewEl) {
        previewEl.textContent = textVal;
        previewEl.style.color = colorVal;
      }
    }

    function confirmInsertColorModal() {
      const textVal = (document.getElementById('modalColorText')?.value || '').trim() || 'Texto con color';
      const colorVal = (document.getElementById('modalColorHex')?.value || '#8CA2E6').trim();
      const bodyEl = document.getElementById('blogEditableBody');

      if (activeEditingColorSpan && bodyEl && bodyEl.contains(activeEditingColorSpan)) {
        const origSpanText = (activeEditingColorSpan.innerText || '').trim();
        const isWholeSpanEdit = (savedBlogSelectionRange && savedBlogSelectionRange.collapsed) ||
          (savedBlogSelectionRange && savedBlogSelectionRange.toString().trim() === origSpanText);

        if (isWholeSpanEdit) {
          activeEditingColorSpan.setAttribute('data-blutu-color', colorVal);
          activeEditingColorSpan.style.color = colorVal;
          activeEditingColorSpan.querySelectorAll('span[data-blutu-color]').forEach(nested => {
            while (nested.firstChild) nested.parentNode.insertBefore(nested.firstChild, nested);
            nested.remove();
          });
          if (textVal !== origSpanText) {
            activeEditingColorSpan.textContent = textVal;
          }
          activeEditingColorSpan = null;
          syncBlogParagraphFirstLetterColors(bodyEl);
          syncLiveBlogModalToMemory(true);
          closeInsertColorModal();
          return;
        }
      }

      if (bodyEl) {
        const spanEl = document.createElement('span');
        spanEl.setAttribute('data-blutu-color', colorVal);
        spanEl.style.color = colorVal;
        spanEl.textContent = textVal;

        if (restoreSavedBlogSelection() && window.getSelection) {
          const sel = window.getSelection();
          if (sel && sel.rangeCount > 0) {
            const range = sel.getRangeAt(0);
            const rawSelStr = range.toString();
            const leadSpaces = (rawSelStr.match(/^\s+/) || [''])[0];
            const trailSpaces = (rawSelStr.match(/\s+$/) || [''])[0];

            range.deleteContents();
            const frag = document.createDocumentFragment();
            if (leadSpaces) frag.appendChild(document.createTextNode(leadSpaces));
            frag.appendChild(spanEl);
            let afterNode = spanEl;
            if (trailSpaces) {
              const trailNode = document.createTextNode(trailSpaces);
              frag.appendChild(trailNode);
              afterNode = trailNode;
            }
            range.insertNode(frag);
            range.setStartAfter(afterNode);
            range.collapse(true);
            sel.removeAllRanges();
            sel.addRange(range);
          }
        } else {
          const lastP = bodyEl.querySelector('p:last-of-type, h2:last-of-type') || bodyEl;
          lastP.appendChild(spanEl);
        }
        activeEditingColorSpan = null;
        syncBlogParagraphFirstLetterColors(bodyEl);
        syncLiveBlogModalToMemory(true);
      }

      closeInsertColorModal();
    }

    // DESTELLO DE MURCIÉLAGOS TRAIL (ACTIVO EN ESCRITORIO Y CELULAR, DESACTIVADO EN LOS JUEGOS)
    (function initBatSparkles() {
      let lastBatTime = 0;
      let lastX = 0;
      let lastY = 0;
      let activeBatsCount = 0;
      const MAX_ACTIVE_BATS = 5;
      const batPool = [];
      let pendingCoord = null;
      let rafScheduled = false;

      function isAnyGameRunning() {
        if (window.__isMiniGameScreenOpen || window.activeMiniGame) return true;
        if (document.body && document.body.classList.contains('blutu-egg-active')) return true;
        const modalBox = document.querySelector('#blogReadModal .blog-modal-box');
        if (modalBox && modalBox.classList.contains('is-minigame-active')) return true;
        return false;
      }

      window.clearActiveBatParticles = function clearActiveBatParticles() {
        pendingCoord = null;
        document.querySelectorAll('.bat-sparkle-particle').forEach((node) => {
          node.remove();
          node.className = '';
          if (batPool.length < MAX_ACTIVE_BATS) batPool.push(node);
        });
        activeBatsCount = 0;
      };

      function acquireBatNode() {
        if (batPool.length > 0) return batPool.pop();
        const bat = document.createElement('div');
        bat.textContent = '🦇';
        return bat;
      }

      function spawnBat(x, y, isTouch = false, isTapStart = false) {
        if (document.hidden || isAnyGameRunning()) return;
        const now = performance.now();
        const isMobileScreen = isTouch || (window.innerWidth <= 768);
        const minInterval = isTouch ? 165 : 140;
        if (now - lastBatTime < minInterval) return;
        if (activeBatsCount >= MAX_ACTIVE_BATS) return;

        const dist = Math.hypot(x - lastX, y - lastY);
        if (!isTapStart) {
          if (!isTouch && dist < 35) return;
          if (isTouch && dist < 26) return;
        }

        lastBatTime = now;
        lastX = x;
        lastY = y;

        activeBatsCount++;
        const bat = acquireBatNode();
        bat.className = 'bat-sparkle-particle';

        const dx = (Math.random() - 0.5) * 68;
        const dy = isMobileScreen ? (26 + Math.random() * 28) : (24 + Math.random() * 28);
        const rot = (Math.random() - 0.5) * 36;
        const size = isMobileScreen ? (46 + Math.floor(Math.random() * 20)) : (38 + Math.floor(Math.random() * 18));

        bat.style.left = x + 'px';
        bat.style.top = y + 'px';
        bat.style.fontSize = size + 'px';
        bat.style.setProperty('--dx', dx + 'px');
        bat.style.setProperty('--dy', dy + 'px');
        bat.style.setProperty('--rot', rot + 'deg');

        document.body.appendChild(bat);

        let cleaned = false;
        const cleanup = () => {
          if (cleaned) return;
          cleaned = true;
          if (bat.parentNode) bat.remove();
          bat.className = '';
          if (batPool.length < MAX_ACTIVE_BATS) batPool.push(bat);
          activeBatsCount = Math.max(0, activeBatsCount - 1);
        };

        bat.addEventListener('animationend', cleanup, { once: true });
        setTimeout(cleanup, 760);
      }

      function processPointer() {
        rafScheduled = false;
        if (pendingCoord) {
          const next = pendingCoord;
          pendingCoord = null;
          spawnBat(next.x, next.y, next.isTouch, next.isTapStart);
        }
      }

      function queuePointer(x, y, isTouch = false, isTapStart = false) {
        if (document.hidden || isAnyGameRunning()) return;
        if (activeBatsCount >= MAX_ACTIVE_BATS) return;
        const now = performance.now();
        const minInterval = isTouch ? 165 : 140;
        if (now - lastBatTime < minInterval) return;
        const pixelModal = document.getElementById('pixelCanvasModal');
        if (pixelModal && pixelModal.style.display === 'flex') return;
        pendingCoord = { x, y, isTouch, isTapStart: Boolean(isTapStart || (pendingCoord && pendingCoord.isTapStart)) };
        if (!rafScheduled) {
          rafScheduled = true;
          requestAnimationFrame(processPointer);
        }
      }

      // Mouse en Escritorio (solo dispositivos con puntero real)
      if (window.matchMedia && window.matchMedia('(pointer: fine)').matches) {
        window.addEventListener('mousemove', function(e) {
          queuePointer(e.clientX, e.clientY, false, false);
        }, { passive: true });
      }

      // Generación de partículas en Celular (toque y deslizamiento, desactivada en los juegos)
      window.addEventListener('touchstart', function(e) {
        if (e.touches && e.touches.length === 1) {
          const touch = e.touches[0];
          queuePointer(touch.clientX, touch.clientY, true, true);
        }
      }, { passive: true });

      window.addEventListener('touchmove', function(e) {
        if (e.touches && e.touches.length === 1) {
          const touch = e.touches[0];
          queuePointer(touch.clientX, touch.clientY, true, false);
        }
      }, { passive: true });
    })();

    let activeGreekCrossCount = 0;
    const MAX_ACTIVE_GREEK_CROSSES = 24;

    // FUNCIÓN DE ANIMACIÓN RÁPIDA CON CRUCES GRIEGAS Y LUZ (0.5s SIN RETARDO)
    function triggerGreekCrossAnimation(element, animColor, durationMs = 500) {
      if (!element || document.hidden) return;
      const color = animColor || getComputedStyle(document.documentElement).getPropertyValue('--active-gallery-color').trim() || '#5A74BF';

      if (element.__greekCrossInterval) {
        clearInterval(element.__greekCrossInterval);
        element.__greekCrossInterval = null;
      }
      if (element.__greekCrossTimeout) {
        clearTimeout(element.__greekCrossTimeout);
        element.__greekCrossTimeout = null;
      }

      element.style.setProperty('--anim-color', color);
      element.classList.add('music-btn-animating');

      const startTime = Date.now();
      const interval = setInterval(() => {
        if (document.hidden || Date.now() - startTime >= durationMs - 50) {
          clearInterval(interval);
          if (element.__greekCrossInterval === interval) element.__greekCrossInterval = null;
          return;
        }
        if (activeGreekCrossCount >= MAX_ACTIVE_GREEK_CROSSES) return;

        const rect = element.getBoundingClientRect();
        if (!rect || rect.width === 0) return;

        for (let i = 0; i < 3; i++) {
          if (activeGreekCrossCount >= MAX_ACTIVE_GREEK_CROSSES) break;
          activeGreekCrossCount++;
          const cross = document.createElement('div');
          cross.className = 'greek-cross-particle';

          // Reducir la proporción del logo de Blutu (25% logo, 75% cruces)
          const isBlutuLogo = Math.random() > 0.75;
          let fontSize;
          if (isBlutuLogo) {
            cross.innerHTML = `<span style="display:inline-block; width:1.1em; height:1.1em; background-color:${color}; -webkit-mask: url('blutu_logo.png') no-repeat center / contain; mask: url('blutu_logo.png') no-repeat center / contain; filter: drop-shadow(0 0 6px ${color}); vertical-align: middle;"></span>`;
            fontSize = 18 + Math.floor(Math.random() * 10);
          } else {
            cross.textContent = '✚';
            fontSize = 14 + Math.floor(Math.random() * 14);
          }

          const startX = rect.left + Math.random() * rect.width;
          const startY = rect.top + Math.random() * rect.height;

          const angle = Math.random() * Math.PI * 2;
          const dist = 30 + Math.random() * 50;
          const gx = Math.cos(angle) * dist;
          const gy = Math.sin(angle) * dist - 12;
          const grot = (Math.random() - 0.5) * 160;

          cross.style.left = startX + 'px';
          cross.style.top = startY + 'px';
          cross.style.fontSize = fontSize + 'px';
          cross.style.setProperty('--anim-color', color);
          cross.style.setProperty('--gx', gx + 'px');
          cross.style.setProperty('--gy', gy + 'px');
          cross.style.setProperty('--grot', grot + 'deg');

          document.body.appendChild(cross);

          setTimeout(() => {
            if (cross && cross.parentNode) {
              cross.parentNode.removeChild(cross);
            }
            activeGreekCrossCount = Math.max(0, activeGreekCrossCount - 1);
          }, 800);
        }
      }, 70);
      element.__greekCrossInterval = interval;

      element.__greekCrossTimeout = setTimeout(() => {
        element.classList.remove('music-btn-animating');
        element.__greekCrossTimeout = null;
      }, durationMs);
    }

    function copyEmailBtnAction(link) {
      const email = "bbblutu@gmail.com";
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(email).catch(() => {
          fallbackCopyText(email);
        });
      } else {
        fallbackCopyText(email);
      }

      if (typeof triggerGreekCrossAnimation === 'function') {
        triggerGreekCrossAnimation(link, '#00A2FF', 600);
      }

      const span = link.querySelector('#emailBtnContent') || link.querySelector('span');
      if (span) {
        const originalHTML = span.innerHTML;
        span.innerHTML = '<i class="fa-solid fa-check" style="color: #00FF88;"></i> ¡Correo Copiado!';
        setTimeout(() => {
          span.innerHTML = originalHTML;
        }, 2200);
      }
    }

    function fallbackCopyText(text) {
      const textArea = document.createElement("textarea");
      textArea.value = text;
      textArea.style.position = "fixed";
      textArea.style.left = "-9999px";
      document.body.appendChild(textArea);
      textArea.focus();
      textArea.select();
      try {
        document.execCommand('copy');
      } catch (err) {}
      document.body.removeChild(textArea);
    }

    // ANIMACIÓN DE REDIRECCIÓN MÚSICA CON CRUCES GRIEGAS Y LUZ
    (function initMusicButtonsAnimation() {
      const links = document.querySelectorAll('.streaming-list .streaming-link, .ig-btn-single, .lastfm-btn-single, .letterboxd-btn-single');

      links.forEach(link => {
        link.addEventListener('click', function(e) {
          e.preventDefault();

          if (link.dataset.animating === 'true') return;
          link.dataset.animating = 'true';

          // Determinar el color según la red o botón
          let animColor = '#8CA2E6';
          if (link.classList.contains('youtube')) animColor = '#FF0000';
          else if (link.classList.contains('spotify')) animColor = '#1DB954';
          else if (link.classList.contains('ytmusic')) animColor = '#FF0033';
          else if (link.classList.contains('soundcloud')) animColor = '#FF5500';
          else if (link.classList.contains('amazon')) animColor = '#00A8E1';
          else if (link.classList.contains('apple')) animColor = '#FA243C';
          else if (link.classList.contains('tidal')) animColor = '#00FFFF';
          else if (link.classList.contains('deezer')) animColor = '#A238FF';
          else if (link.classList.contains('ig-btn-single')) animColor = '#E1306C';
          else if (link.classList.contains('email-btn-single')) animColor = '#00A2FF';
          else if (link.classList.contains('lastfm-btn-single')) animColor = '#D51007';
          else if (link.classList.contains('letterboxd-btn-single')) animColor = '#00E054';

          link.style.setProperty('--anim-color', animColor);
          link.classList.add('music-btn-animating');

          const target = link.getAttribute('target');
          const startTime = Date.now();
          const duration = 2500; // 2.5 segundos

          // Ráfagas continuas de cruces griegas (✚) y el logo de Blutu (blutu_logo.png)
          const interval = setInterval(() => {
            if (document.hidden || Date.now() - startTime >= duration - 200) {
              clearInterval(interval);
              return;
            }
            if (activeGreekCrossCount >= MAX_ACTIVE_GREEK_CROSSES) return;

            const rect = link.getBoundingClientRect();
            if (!rect || rect.width === 0) return;

            // Emitir 3 partículas por ráfaga (combinando cruces griegas y el logo blutu_logo.png)
            for (let i = 0; i < 3; i++) {
              if (activeGreekCrossCount >= MAX_ACTIVE_GREEK_CROSSES) break;
              activeGreekCrossCount++;
              const cross = document.createElement('div');
              cross.className = 'greek-cross-particle';

              // Alternar aleatoriamente entre Cruz Griega y el logo Blutu (25% logo, 75% cruz)
              const isBlutuLogo = Math.random() > 0.75;
              let fontSize;
              if (isBlutuLogo) {
                cross.innerHTML = `<span style="display:inline-block; width:1.1em; height:1.1em; background-color:${animColor}; -webkit-mask: url('blutu_logo.png') no-repeat center / contain; mask: url('blutu_logo.png') no-repeat center / contain; filter: drop-shadow(0 0 6px ${animColor}); vertical-align: middle;"></span>`;
                fontSize = 18 + Math.floor(Math.random() * 10);
              } else {
                cross.textContent = '✚'; // Cruz Griega de brazos iguales
                fontSize = 16 + Math.floor(Math.random() * 16);
              }

              const startX = rect.left + Math.random() * rect.width;
              const startY = rect.top + Math.random() * rect.height;

              const angle = Math.random() * Math.PI * 2;
              const dist = 35 + Math.random() * 65;
              const gx = Math.cos(angle) * dist;
              const gy = Math.sin(angle) * dist - 15;
              const grot = (Math.random() - 0.5) * 160;

              cross.style.left = startX + 'px';
              cross.style.top = startY + 'px';
              cross.style.fontSize = fontSize + 'px';
              cross.style.setProperty('--anim-color', animColor);
              cross.style.setProperty('--gx', gx + 'px');
              cross.style.setProperty('--gy', gy + 'px');
              cross.style.setProperty('--grot', grot + 'deg');

              document.body.appendChild(cross);

              setTimeout(() => {
                if (cross && cross.parentNode) {
                  cross.parentNode.removeChild(cross);
                }
                activeGreekCrossCount = Math.max(0, activeGreekCrossCount - 1);
              }, 1100);
            }
          }, 90);

          const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) || (window.innerWidth <= 768 && ('ontouchstart' in window || navigator.maxTouchPoints > 0));
          const isInstagram = /Instagram|FBAN|FBAV/i.test(navigator.userAgent);
          const redirectDelay = (isInstagram || isMobile) ? 450 : 650;

          // Redirigir de forma fluida y rápida para no bloquear la navegación en WebViews móviles (Instagram)
          setTimeout(() => {
            clearInterval(interval);
            link.classList.remove('music-btn-animating');
            delete link.dataset.animating;

            const webUrl = link.dataset.web || link.getAttribute('href');
            const appUrl = link.dataset.app;

            if (isMobile) {
              if (isInstagram && link.classList.contains('ig-btn-single')) {
                if (webUrl) window.location.href = webUrl;
                return;
              }

              if (appUrl && !appUrl.startsWith('http') && !isInstagram) {
                // Esquema de app nativa personalizado (spotify://, etc.)
                let appOpened = false;
                const handleVisibilityChange = () => { if (document.hidden) appOpened = true; };
                const handleBlur = () => { appOpened = true; };

                document.addEventListener('visibilitychange', handleVisibilityChange, { once: true });
                window.addEventListener('blur', handleBlur, { once: true });

                try { window.location.href = appUrl; } catch(err) {}

                setTimeout(() => {
                  document.removeEventListener('visibilitychange', handleVisibilityChange);
                  window.removeEventListener('blur', handleBlur);
                  if (!document.hidden && !appOpened && webUrl) {
                    window.location.href = webUrl;
                  }
                }, 800);
              } else if (webUrl) {
                window.location.href = webUrl;
              }
            } else {
              // En PC / escritorio: Abrir enlace web
              if (webUrl) {
                if (target === '_blank' && !webUrl.startsWith('mailto:')) {
                  window.open(webUrl, '_blank', 'noopener,noreferrer');
                } else {
                  window.location.href = webUrl;
                }
              }
            }
          }, redirectDelay);
        });
      });
    })();

    // CONTROL DE SECCIONES DESPLEGABLES (En Vivo, Música, Contacto, Merch, 👁️, Pensamientos)
    function toggleSectionCollapse(sectionId) {
      const panel = document.getElementById(sectionId);
      if (!panel) return;

      // Si ya está ejecutándose la animación de apertura en esta sección, ignorar clicks repetidos
      if (panel.dataset.animatingCollapse === 'true') return;

      const isCurrentlyCollapsed = panel.classList.contains('is-collapsed');

      if (isCurrentlyCollapsed) {
        // Al desplegar: no se abre inmediatamente, reproduce la animación de cruces y resplandor con la forma y color de la sección por 0.5 segundos
        panel.dataset.animatingCollapse = 'true';

        let animColor = '#8CA2E6';
        if (sectionId === 'gallerySection') {
          animColor = (typeof currentGalleryKey !== 'undefined' && typeof galleriesData !== 'undefined' && galleriesData[currentGalleryKey] && galleriesData[currentGalleryKey].color)
            ? galleriesData[currentGalleryKey].color
            : (getComputedStyle(document.documentElement).getPropertyValue('--active-gallery-color').trim() || '#5A74BF');
        } else {
          animColor = getComputedStyle(document.documentElement).getPropertyValue('--accent-light').trim() || '#8CA2E6';
        }

        if (typeof triggerGreekCrossAnimation === 'function') {
          triggerGreekCrossAnimation(panel, animColor, 500);
        }

        setTimeout(() => {
          panel.classList.remove('is-collapsed');
          delete panel.dataset.animatingCollapse;

          if (sectionId === 'gallerySection' && typeof updateCarousel === 'function') {
            setTimeout(() => updateCarousel(), 80);
          }
          if (sectionId === 'blogSection') {
            setTimeout(() => {
              if (typeof updateBlogTrackPosition === 'function') {
                updateBlogTrackPosition();
              }
              document.querySelectorAll('#blogSliderTrack img.blog-thumb-cropped').forEach(syncBlogCroppedThumbCover);
            }, 80);
          }
          if (sectionId === 'merchSection' && typeof renderMerchSection === 'function') {
            const mContainer = document.getElementById('merchContainer');
            const needsMerchRender = !mContainer || !mContainer.children.length || lastRenderedMerchPerPage !== getMerchItemsPerPage();
            if (needsMerchRender) {
              setTimeout(() => renderMerchSection(), 80);
            }
          }
          if (sectionId === 'gamesSection') {
            setTimeout(() => {
              document.querySelectorAll('#gamesCardsContainer img.blog-thumb-cropped').forEach(syncBlogCroppedThumbCover);
            }, 80);
          }
        }, 500);
      } else {
        // Al plegar: se contrae
        panel.classList.add('is-collapsed');
      }
    }
    window.toggleSectionCollapse = toggleSectionCollapse;

    function clearMoreRevealTimers() {
      if (Array.isArray(moreRevealTimers)) {
        moreRevealTimers.forEach(t => clearTimeout(t));
      }
      moreRevealTimers = [];
    }

    function syncLastVisibleTombstoneSection() {
      const tombstone = document.getElementById('masterTombstone');
      if (!tombstone) return;
      const sections = Array.from(tombstone.querySelectorAll('.tombstone-section'));
      let lastVisible = null;
      sections.forEach(sec => {
        sec.classList.remove('is-last-visible-section');
        const isHiddenByMore = sec.classList.contains('more-hidden-section');
        const isHiddenInline = sec.style.display === 'none';
        if (!isHiddenByMore && !isHiddenInline) {
          lastVisible = sec;
        }
      });
      if (lastVisible) {
        lastVisible.classList.add('is-last-visible-section');
      }
    }
    window.syncLastVisibleTombstoneSection = syncLastVisibleTombstoneSection;

    function resetMoreSectionsForVisitor() {
      clearMoreRevealTimers();
      isRevealingMoreSections = false;
      isRevealingMuchMoreSections = false;
      hasRevealedMoreSections = false;
      window.hasRevealedMoreSections = false;
      hasRevealedMuchMoreSections = false;
      window.hasRevealedMuchMoreSections = false;

      const moreSection = document.getElementById('moreSection');
      if (moreSection) {
        moreSection.classList.remove('more-hidden-section', 'more-section-vanishing');
        moreSection.classList.add('is-collapsed');
        moreSection.style.display = '';
      }

      ['gallerySection', 'blogSection', 'muchMoreSection', 'gamesSection', 'commentsSection'].forEach(id => {
        const panel = document.getElementById(id);
        if (!panel) return;
        panel.classList.add('is-collapsed', 'more-hidden-section');
        panel.classList.remove('more-sequential-reveal', 'more-section-vanishing');
        panel.style.display = '';
        delete panel.dataset.animatingCollapse;
      });

      syncLastVisibleTombstoneSection();
    }
    window.resetMoreSectionsForVisitor = resetMoreSectionsForVisitor;

    function showAllMoreSectionsForAdmin() {
      clearMoreRevealTimers();
      isRevealingMoreSections = false;
      isRevealingMuchMoreSections = false;

      ['moreSection', 'muchMoreSection'].forEach(id => {
        const triggerEl = document.getElementById(id);
        if (triggerEl) {
          triggerEl.classList.add('more-hidden-section');
          triggerEl.classList.remove('more-section-vanishing');
        }
      });

      ['gallerySection', 'blogSection', 'gamesSection', 'commentsSection'].forEach(id => {
        const panel = document.getElementById(id);
        if (!panel) return;
        panel.classList.remove('more-hidden-section', 'more-sequential-reveal');
        panel.style.display = 'block';
      });

      syncLastVisibleTombstoneSection();
    }
    window.showAllMoreSectionsForAdmin = showAllMoreSectionsForAdmin;

    function revealMoreSections() {
      if (isAdminMode) {
        showAllMoreSectionsForAdmin();
        return;
      }
      if (isRevealingMoreSections || hasRevealedMoreSections) return;

      const moreSection = document.getElementById('moreSection');
      isRevealingMoreSections = true;
      clearMoreRevealTimers();

      const animColor = getComputedStyle(document.documentElement).getPropertyValue('--accent-light').trim() || '#8CA2E6';
      if (moreSection) {
        if (typeof triggerGreekCrossAnimation === 'function') {
          triggerGreekCrossAnimation(moreSection, animColor, 240);
        }
        moreSection.classList.add('more-section-vanishing');
      }

      const vanishTimer = setTimeout(() => {
        if (moreSection) {
          moreSection.classList.add('more-hidden-section');
          moreSection.classList.remove('more-section-vanishing', 'is-last-visible-section');
        }
        hasRevealedMoreSections = true;
        window.hasRevealedMoreSections = true;
        isRevealingMoreSections = false;

        const targetIds = ['gallerySection', 'blogSection'];
        const hasAnyMuchMoreVisible = (typeof isGamesSectionVisible === 'undefined' || isGamesSectionVisible !== false) ||
          (typeof isBuzonSectionVisible === 'undefined' || isBuzonSectionVisible !== false);
        if (hasAnyMuchMoreVisible) {
          targetIds.push('muchMoreSection');
        }
        const stepDelayMs = 280;
        targetIds.forEach((id, idx) => {
          const stepTimer = setTimeout(() => {
            const panel = document.getElementById(id);
            if (!panel) return;
            panel.classList.add('is-collapsed');
            panel.classList.remove('more-hidden-section', 'more-section-vanishing');
            panel.style.display = '';
            panel.classList.remove('more-sequential-reveal');
            void panel.offsetWidth;
            panel.classList.add('more-sequential-reveal');
            syncLastVisibleTombstoneSection();

            const cleanupTimer = setTimeout(() => {
              panel.classList.remove('more-sequential-reveal');
            }, 460);
            moreRevealTimers.push(cleanupTimer);
          }, idx * stepDelayMs);
          moreRevealTimers.push(stepTimer);
        });
      }, 220);

      moreRevealTimers.push(vanishTimer);
    }
    window.revealMoreSections = revealMoreSections;

    function revealMuchMoreSections() {
      if (isAdminMode) {
        showAllMoreSectionsForAdmin();
        return;
      }
      if (isRevealingMuchMoreSections || hasRevealedMuchMoreSections) return;

      const muchMoreSection = document.getElementById('muchMoreSection');
      isRevealingMuchMoreSections = true;
      clearMoreRevealTimers();

      const animColor = getComputedStyle(document.documentElement).getPropertyValue('--accent-light').trim() || '#8CA2E6';
      if (muchMoreSection) {
        if (typeof triggerGreekCrossAnimation === 'function') {
          triggerGreekCrossAnimation(muchMoreSection, animColor, 240);
        }
        muchMoreSection.classList.add('more-section-vanishing');
      }

      const vanishTimer = setTimeout(() => {
        if (muchMoreSection) {
          muchMoreSection.classList.add('more-hidden-section');
          muchMoreSection.classList.remove('more-section-vanishing', 'is-last-visible-section');
        }
        hasRevealedMuchMoreSections = true;
        window.hasRevealedMuchMoreSections = true;
        isRevealingMuchMoreSections = false;

        const targetIds = [];
        if (typeof isGamesSectionVisible === 'undefined' || isGamesSectionVisible !== false) {
          targetIds.push('gamesSection');
        }
        if (typeof isBuzonSectionVisible === 'undefined' || isBuzonSectionVisible !== false) {
          targetIds.push('commentsSection');
        }

        const stepDelayMs = 280;
        targetIds.forEach((id, idx) => {
          const stepTimer = setTimeout(() => {
            const panel = document.getElementById(id);
            if (!panel) return;
            panel.classList.add('is-collapsed');
            panel.classList.remove('more-hidden-section');
            if (id === 'commentsSection' || id === 'gamesSection') {
              panel.style.display = 'block';
            } else {
              panel.style.display = '';
            }
            panel.classList.remove('more-sequential-reveal');
            void panel.offsetWidth;
            panel.classList.add('more-sequential-reveal');
            syncLastVisibleTombstoneSection();

            const cleanupTimer = setTimeout(() => {
              panel.classList.remove('more-sequential-reveal');
            }, 460);
            moreRevealTimers.push(cleanupTimer);
          }, idx * stepDelayMs);
          moreRevealTimers.push(stepTimer);
        });
      }, 220);

      moreRevealTimers.push(vanishTimer);
    }
    window.revealMuchMoreSections = revealMuchMoreSections;

    function syncMuchMoreTriggerForVisitor() {
      if (isAdminMode) return;
      if (!hasRevealedMoreSections || hasRevealedMuchMoreSections) return;
      const muchMoreEl = document.getElementById('muchMoreSection');
      if (!muchMoreEl) return;
      const hasAnyChild = (isGamesSectionVisible !== false) || (isBuzonSectionVisible !== false);
      if (hasAnyChild) {
        muchMoreEl.classList.remove('more-hidden-section');
        muchMoreEl.style.display = '';
      } else {
        muchMoreEl.classList.add('more-hidden-section');
        muchMoreEl.style.display = 'none';
      }
    }
    window.syncMuchMoreTriggerForVisitor = syncMuchMoreTriggerForVisitor;

    function updateGamesVisibilityUI() {
      const isCurrentAdmin = Boolean(isAdminMode);
      const gamesBadge = document.getElementById('gamesSectionHiddenBadge');
      if (gamesBadge) {
        gamesBadge.style.display = (isCurrentAdmin && !isGamesSectionVisible) ? 'inline-block' : 'none';
      }

      const quickBtn = document.getElementById('headerQuickToggleGamesBtn');
      document.querySelectorAll('.toggle-games-section-btn').forEach(btn => {
        const isHeaderQuick = btn === quickBtn;
        if (isCurrentAdmin) {
          btn.style.display = 'inline-flex';
          if (isGamesSectionVisible) {
            btn.innerHTML = isHeaderQuick ? '🙈 Ocultar' : '🙈 Ocultar sección';
            btn.style.background = 'rgba(50, 180, 80, 0.2)';
            btn.style.borderColor = '#32b450';
            btn.style.color = '#80ff9f';
            btn.title = 'Visible para visitantes — haz clic para ocultar la sección Juegos';
          } else {
            btn.innerHTML = isHeaderQuick ? '👁️ Mostrar' : '👁️ Mostrar sección';
            btn.style.background = 'rgba(200, 150, 50, 0.25)';
            btn.style.borderColor = '#ffd280';
            btn.style.color = '#ffd280';
            btn.title = 'Oculta para visitantes — haz clic para mostrar la sección Juegos';
          }
        } else {
          btn.style.display = 'none';
        }
      });

      const gamesSection = document.getElementById('gamesSection');
      if (gamesSection) {
        if (isCurrentAdmin) {
          gamesSection.classList.remove('more-hidden-section');
          gamesSection.style.display = 'block';
        } else if (hasRevealedMuchMoreSections) {
          if (isGamesSectionVisible) {
            gamesSection.classList.remove('more-hidden-section');
            gamesSection.style.display = 'block';
          } else {
            gamesSection.style.display = 'none';
          }
        } else {
          gamesSection.classList.add('more-hidden-section');
          gamesSection.style.display = isGamesSectionVisible ? '' : 'none';
        }
      }

      syncMuchMoreTriggerForVisitor();
      if (typeof syncLastVisibleTombstoneSection === 'function') {
        syncLastVisibleTombstoneSection();
      }
    }
    window.updateGamesVisibilityUI = updateGamesVisibilityUI;

    function toggleGamesSectionVisibility(forceVisible) {
      if (typeof forceVisible === 'boolean') {
        isGamesSectionVisible = forceVisible;
      } else {
        isGamesSectionVisible = !isGamesSectionVisible;
      }
      window.isGamesSectionVisible = isGamesSectionVisible;

      try {
        localStorage.setItem('blutu_games_visible', String(isGamesSectionVisible));
        const cachedRaw = localStorage.getItem('blutu_live_site_data');
        const parsed = cachedRaw ? JSON.parse(cachedRaw) : {};
        parsed.buzon = {
          ...(parsed.buzon || {}),
          isVisible: isBuzonSectionVisible,
          gamesVisible: isGamesSectionVisible,
          hiddenCommentIds: hiddenCommentIds,
          gamesData: gamesData
        };
        parsed.muro = {
          ...(parsed.muro || {}),
          isVisible: isBuzonSectionVisible,
          gamesVisible: isGamesSectionVisible,
          hiddenCommentIds: hiddenCommentIds,
          gamesData: gamesData
        };
        parsed.updatedAt = Date.now();
        localStorage.setItem('blutu_live_site_data', JSON.stringify(parsed));
      } catch (e) {}

      updateGamesVisibilityUI();
    }
    window.toggleGamesSectionVisibility = toggleGamesSectionVisibility;

    function initCollapsibleSections() {
      const sectionIds = ['liveSection', 'musicSection', 'contactSection', 'merchSection', 'moreSection', 'gallerySection', 'blogSection', 'muchMoreSection', 'gamesSection', 'commentsSection'];
      sectionIds.forEach(id => {
        const panel = document.getElementById(id);
        if (!panel) return;
        panel.classList.add('is-collapsed');
      });
      if (isAdminMode) {
        showAllMoreSectionsForAdmin();
      } else if (!hasRevealedMoreSections) {
        resetMoreSectionsForVisitor();
      } else {
        syncLastVisibleTombstoneSection();
      }
    }
    window.initCollapsibleSections = initCollapsibleSections;

    // COMPORTAMIENTO DE ACORDEÓN PARA PANEL ADMIN (Solo 1 sección abierta a la vez)
    function initAdminAccordion() {
      const adminSections = document.querySelectorAll('.admin-section');
      adminSections.forEach(sec => {
        sec.addEventListener('toggle', function() {
          if (this.open) {
            adminSections.forEach(other => {
              if (other !== this && other.open) {
                other.removeAttribute('open');
              }
            });
          }
        });
      });
    }

    function bootstrapInitialPageRender() {
      merchItemsData.forEach(item => {
        if (!item.category || item.category.trim() === '') {
          item.category = 'Camisetas';
        }
      });
      initCart();
      initCollapsibleSections();
      initAdminAccordion();
      toggleAdminMode(false);
      checkPendingSharedDeepLink();
    }

// Exponer controladores globales en window ANTES del arranque inicial para atributos inline y sincronización en vivo
Object.assign(window, {
  reconcileAndMergePosts,
  preloadEasterEggModule,
  primeSynchronousGestureAudio,
  ensureGamesEngineLoaded,
  destroyActiveMiniGame,
  launchMiniGameFromBlog,
  exitMiniGameVolver,
  ensureAdminModalsReady,
  getAdminPanelHTML,
  escapeHtmlText,
  computeAutoPostPreview,
  getBlogsPerPage,
  getVisibleBlogPosts,
  parsePostImageCrop,
  getFitCssForPost,
  formatPreviewTitleUnbroken,
  formatInlineHtmlUnbrokenHyphens,
  syncBlogCroppedThumbCover,
  buildBlogThumbFrameHTML,
  renderBlogPosts,
  updateBlogTrackPosition,
  updateBlogNavControls,
  goToBlogPage,
  moveBlogSlide,
  triggerLeerAnimationAndOpen,
  pushModalState,
  popModalState,
  buildEditableInlineFigureHTML,
  renderBlogArticleBodyHTML,
  renderLiveCoverSectionHTML,
  applyLiveBlogImagesAura,
  detectFirstCharacterColorInParagraph,
  syncBlogParagraphFirstLetterColors,
  hasPendingBlogParagraphReveal,
  resetBlogParagraphRevealState,
  triggerBlogParagraphsOpeningReveal,
  parseCssColorToRgb,
  rgbToHslObj,
  hslToRgbObj,
  computeWcagRelLuminance,
  calibrateHslToLuminanceBand,
  computeAccessibleBlogThemeFromColor,
  resetBlogModalAdaptiveTheme,
  applyComputedThemeVarsToBlogModal,
  getActiveEditableBlogPost,
  applyBlogModalAdaptiveTheme,
  openBlogModal,
  closeBlogModal,
  shareCurrentBlog,
  shareCurrentMerch,
  checkPendingSharedDeepLink,
  blogModalBgClick,
  persistGamesLocalCache,
  schedulePersistGamesLocalCache,
  computeGameButtonStyleAttr,
  buildGameCardFallbackSvg,
  renderGamesSection,
  triggerGameBlogOpen,
  collectAvailableSiteGalleryImagesForPicker,
  renderGameBlogBottomControlsHTML,
  toggleMemoramaVsPcDifficultyRow,
  openGameBlogModal,
  updateGameButtonColorLive,
  applyMemoramaPairThumbCropInEditor,
  handleMemoramaPairUrlInput,
  handleMemoramaPairGalleryPick,
  compressPairImageFileToDataUrl,
  handleMemoramaPairFileUpload,
  getOrderedGalleryKeys,
  persistGalleryLocalCache,
  schedulePersistGalleryLocalCache,
  escapeHtmlAttr,
  syncGalleryColorOrbsUI,
  applyGalleryThemeVariables,
  syncGalleryColorLive,
  handleInlineGalleryTabTitleInput,
  handleInlineGalleryTabTitleBlur,
  createNewGalleryInline,
  getGalleryThumbPreviewUrl,
  buildGalleryTabStackHTML,
  refreshGalleryTabStacks,
  renderGalleryTabs,
  reorderGalleriesInAdmin,
  markGalleryUserInteraction,
  startGalleryAutoplay,
  stopGalleryAutoplay,
  getItemsCount,
  getItemsPerPage,
  getMaxIndex,
  updateCarousel,
  moveSlide,
  createDots,
  updateDots,
  isSameOriginOrLocalMedia,
  extractAuraHexOnceForAdmin,
  formatSavedAuraGlow,
  calculateReadableTextColor,
  parseYouTubeUrl,
  cleanOrTransformMediaUrl,
  handleInlineGalleryCaptionInput,
  loadGallery,
  switchGallery,
  openModal,
  handleModalLiveCaptionInput,
  moveModalGalleryPhoto,
  updateModalPhoto,
  captureModalImgBaseMetrics,
  clampModalZoomPan,
  resetModalZoom,
  applyModalZoomTransform,
  navigateModal,
  closeModal,
  modalBgClick,
  ensureActiveGallery,
  openGalleryMediaModal,
  closeGalleryMediaModal,
  buildGalleryItemFromUrl,
  confirmGalleryMediaModal,
  handleGalleryMediaModalFileChange,
  handlePhotoFileUpload,
  reorderPhotosInAdmin,
  movePhotoInAdminGallery,
  confirmDeleteGalleryPhoto,
  deletePhotoFromAdmin,
  moveGalleryOrder,
  setAsFirstGallery,
  deleteCurrentGallery,
  populateAdminGallerySelect,
  loadGalleryToAdmin,
  saveGalleryChanges,
  closeAdminPanel,
  closeAdminModal,
  toggleEditPostPanel,
  renderAdminPostsList,
  editPostFromCard,
  createNewBlogInModal,
  normalizeCssColorToHex,
  serializeFigureElementToTag,
  serializeInlineDomNodes,
  serializeEditableBlogBodyToContent,
  persistPostsToLocalVaults,
  schedulePersistPostsToLocalVaults,
  scheduleLiveBlogModalSync,
  syncLiveBlogModalToMemory,
  finishInlineBlogEdit,
  handlePlainTextPaste,
  handleLiveBlogTitleKeydown,
  handleLiveBlogDateChange,
  handleCardInlineTitleInput,
  handleCardInlineDateChange,
  handleCardInlinePreviewInput,
  handleCardInlinePreviewBlur,
  computeExactUserBlogThumbSize,
  syncThumbCropViewportToUserPreviewSize,
  getThumbCropViewportMetrics,
  clampThumbCropPosition,
  renderThumbCropPreview,
  applyInitialFitToThumbCropState,
  serializeThumbCropState,
  ensureThumbCropGestureListeners,
  openBlogThumbCropModal,
  handleBlogThumbCropSliderInput,
  stepBlogThumbCropZoom,
  resetBlogThumbCropState,
  closeBlogThumbCropModal,
  confirmBlogThumbCropModal,
  setupLiveBlogEditableBodyEvents,
  removeLiveCoverImage,
  moveInlineFigureBlock,
  removeInlineFigureBlock,
  toggleModalPostVisibility,
  resolvePostIndex,
  openGothicConfirmModal,
  openDeletePostConfirmModal,
  closeDeletePostConfirmModal,
  deleteModalPost,
  executeDeletePost,
  deleteCurrentPost,
  toggleCurrentPostVisibility,
  resolveImageSourceUrlForPixelPicker,
  pickPixelColorForAura,
  applyAuraPixelColor,
  verifyImageIsUntainted,
  loadImageElementPromise,
  fetchImageViaCleanBlob,
  loadUntaintedImageForPixelPicker,
  ensurePixelCanvasInteractiveBindings,
  openCanvasPixelPickerModal,
  updatePixelSwatch,
  confirmPixelColorSelection,
  closePixelCanvasModal,
  populatePostSelect,
  applyCurrentPostToMemory,
  saveUnifiedPost,
  handlePostSelectChange,
  initLiveSection,
  renderLiveSection,
  moveLivePage,
  reorderLiveButtonsInAdmin,
  moveLiveButtonOrder,
  renderAdminLiveList,
  addLiveButtonAdmin,
  deleteLiveButtonAdmin,
  toggleLiveBtnEditorBox,
  toggleAllLiveCards,
  toggleLiveButtonVisibilityAdmin,
  updateLiveBtnProp,
  updateLiveDescriptionFromAdmin,
  toggleLiveSectionGlobalVisibility,
  saveLiveButtonsChanges,
  initMerchSection,
  getMerchItemsPerPage,
  setMerchCategory,
  clearMerchCardIntervals,
  getItemImages,
  persistMerchLocalCache,
  schedulePersistMerchLocalCache,
  flushAllPendingLocalCaches,
  getCleanMerchImages,
  updateMerchVisibilityToggleButtons,
  isItemAgotado,
  getMerchBadgesHTML,
  toggleMerchItemAgotado,
  handleInlineMerchSectionDescInput,
  handleInlineMerchPropInput,
  handleInlineMerchCategorySelect,
  addNewCategoryInline,
  renderMerchSection,
  moveMerchPage,
  initMerchSwipe,
  initCart,
  saveCart,
  updateCartUI,
  addToCart,
  buyNowInstagram,
  updateCartItemQty,
  removeFromCart,
  clearCart,
  updateCustomerCartNote,
  applyCartCouponCode,
  parsePriceToNumber,
  getCartTotals,
  renderCartModal,
  openCartModal,
  closeCartModal,
  showCartToast,
  generateOrderText,
  checkoutViaWhatsApp,
  checkoutViaInstagram,
  copyOrderDetailsToClipboard,
  clearModalSlideshowInterval,
  setMerchItemImagesList,
  appendPhotosToMerchItem,
  replacePhotoInMerchItem,
  triggerMerchModalFileUpload,
  handleMerchModalMultiFileUpload,
  moveMerchModalPhoto,
  setMerchPrimaryPhoto,
  removeMerchModalPhoto,
  createNewMerchInModal,
  finishInlineMerchModalEdit,
  openMerchDetailModal,
  renderMerchDetailModalContent,
  setMerchModalImage,
  nextMerchModalImage,
  prevMerchModalImage,
  updateMerchModalImageDisplay,
  closeMerchModal,
  syncCartConfigInputsUI,
  openCartConfigModal,
  closeCartConfigModal,
  renderAdminCategoriesList,
  addNewCategoryFromAdmin,
  deleteCategoryFromAdmin,
  moveCategoryOrder,
  updateCategoryName,
  updateCartConfigProp,
  updateMerchItemImages,
  renderAdminMerchList,
  addMerchItemAdmin,
  confirmDeleteMerchItem,
  deleteMerchItemAdmin,
  toggleMerchItemVisibilityAdmin,
  updateMerchItemProp,
  toggleMerchCardEditDrawer,
  updateMerchItemPropRealtime,
  handleMerchPhotoFileUploadGrid,
  moveMerchItemOrder,
  handleMerchPhotoFileUpload,
  updateMerchDescriptionFromAdmin,
  toggleMerchSectionGlobalVisibility,
  saveMerchChanges,
  applyAllSectionsChangesToDOM,
  deepCloneAdminValue,
  normalizePostsForBaselineCompare,
  buildComparableAdminSessionState,
  captureAdminEditSessionBaseline,
  hasUnsavedAdminSessionChanges,
  executeDiscardMasterAdminData,
  discardMasterAdminData,
  saveMasterAdminData,
  toggleAdminMode,
  openAdminPanel,
  openAdminModal,
  verifyPassword,
  downloadFile,
  showToastNotification,
  downloadBackupIndexHtml,
  downloadBackupSiteDataJson,
  formatIsoToSpanishDate,
  handlePostImageAutoCaption,
  handleNewGalleryPhotoUrlAutoCaption,
  formatPostInlineText,
  getClosestEditableBlockInBody,
  saveCurrentBlogSelection,
  restoreSavedBlogSelection,
  applyBlogInlineFormat,
  insertFormat,
  openBlogImageModal,
  openInsertImageModal,
  closeInsertImageModal,
  removeImageFromInsertModal,
  confirmInsertImageModal,
  toggleModalImgUseAura,
  handleModalImgManualAuraColor,
  handleModalImgManualAuraText,
  rescanModalImgAuraFromUrl,
  handleModalImgUrlInputForAura,
  toggleGalleryMediaUseAura,
  handleGalleryMediaManualAuraColor,
  handleGalleryMediaManualAuraText,
  rescanGalleryMediaAuraFromUrl,
  handleGalleryMediaUrlInputForAura,
  openInsertLinkModal,
  closeInsertLinkModal,
  removeLinkFromInsertModal,
  confirmInsertLinkModal,
  expandCollapsedRangeToWordIfTouching,
  openInsertColorModal,
  closeInsertColorModal,
  removeColorFromInsertModal,
  selectColorPreset,
  syncTextColorFromPicker,
  syncTextColorFromInput,
  updateColorPreview,
  confirmInsertColorModal,
  triggerGreekCrossAnimation,
  copyEmailBtnAction,
  fallbackCopyText,
  toggleSectionCollapse,
  clearMoreRevealTimers,
  syncLastVisibleTombstoneSection,
  resetMoreSectionsForVisitor,
  showAllMoreSectionsForAdmin,
  revealMoreSections,
  revealMuchMoreSections,
  syncMuchMoreTriggerForVisitor,
  updateGamesVisibilityUI,
  toggleGamesSectionVisibility,
  initCollapsibleSections,
  initAdminAccordion,
  bootstrapInitialPageRender,
  updateIndexHtmlFile: downloadBackupIndexHtml
});

    isInitialScriptReady = true;

    // INICIALIZAR TODAS LAS SECCIONES EN UNA SOLA PASADA AL CARGAR LA PÁGINA
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', bootstrapInitialPageRender, { once: true });
    } else {
      bootstrapInitialPageRender();
    }

