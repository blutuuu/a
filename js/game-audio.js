/* Blutu — Motor Compartido de Música de Partida ("Escaleras" Completa - Blutu)
   100% Bajo Demanda y Exclusividad Estricta de Fuente Única (Mutex):
   Cero carga al abrir la página, jamás reproduce dos motores simultáneamente y se destruye por completo al salir */

const GAME_SONG_VIDEO_ID = '3Ea5h9Xqe3E';
const GAME_SC_TRACK_ID = '2328169097'; // "Escaleras" completa (1:44) en el perfil oficial de SoundCloud de Blutu
const GAME_ITUNES_TRACK_ID = '6773560493';
const GAME_ITUNES_ARTIST_ID = '1223269133';
const GAME_AUDIO_SESSION_CACHE_KEY = 'blutu_escaleras_audio_url';
const GAME_MUTE_SESSION_KEY = 'blutu_shared_music_muted';
export const GAME_DIRECT_PREVIEW_URL = 'https://audio-ssl.itunes.apple.com/itunes-assets/AudioPreview221/v4/ec/fb/45/ecfb4526-93d2-03e7-c901-a297111f1458/mzaf_14659704648749163645.plus.aac.p.m4a';

let sharedAudioCtx = null;

try {
  if (typeof sessionStorage !== 'undefined') {
    sessionStorage.removeItem(GAME_MUTE_SESSION_KEY);
  }
} catch (e) {}

function readInitialMutedState() {
  if (typeof window !== 'undefined' && typeof window.__blutuSharedMusicMuted === 'boolean') {
    return window.__blutuSharedMusicMuted;
  }
  return false;
}

function persistMutedState(muted) {
  const val = Boolean(muted);
  if (typeof window !== 'undefined') {
    window.__blutuSharedMusicMuted = val;
  }
}

let sharedMusicMuted = readInitialMutedState();

function readCachedPreviewUrl() {
  try {
    const cached = sessionStorage.getItem(GAME_AUDIO_SESSION_CACHE_KEY);
    if (cached && /^https:\/\//i.test(cached)) return cached;
  } catch (e) {}
  return GAME_DIRECT_PREVIEW_URL;
}

function saveCachedPreviewUrl(url) {
  if (!url || !/^https:\/\//i.test(url)) return;
  try {
    sessionStorage.setItem(GAME_AUDIO_SESSION_CACHE_KEY, url);
  } catch (e) {}
}

export function isRestrictedInAppWebView() {
  if (typeof navigator === 'undefined') return false;
  const ua = String(navigator.userAgent || '');
  return /Instagram|FBAN|FBAV|FB_IAB|FBIOS|Barcelona|BytedanceWebview|Musical_ly|TikTok|Line\/|Snapchat/i.test(ua);
}

const audioState = {
  isActive: false,
  runToken: 0,
  activeEngine: 'none', // 'none' | 'sc' | 'yt' | 'bridge' — a lo sumo UN motor montado/activo a la vez
  hostEl: null,
  muteBtnIds: new Set(),
  // Motor primario de canción completa (SoundCloud HTML5 Audio Widget — sin decodificación de video ni sobrecalentamiento)
  scContainerEl: null,
  scIframeEl: null,
  scWidget: null,
  isScReady: false,
  isScPlayingFull: false,
  isScScriptLoading: false,
  scFallbackTimer: null,
  // Motor secundario de canción completa (YouTube IFrame API, montado SOLO tras destruir SoundCloud si SC falla)
  ytContainerEl: null,
  ytPlayer: null,
  isYtReady: false,
  isYtPlayingUnmuted: false,
  isYtScriptLoaded: false,
  ytVerifyTimer: null,
  // Respaldo de emergencia HTML5 <audio> (activado SOLO tras destruir SC y YT si ambos fallan)
  bridgeAudio: null,
  bridgeBlobUrl: null,
  usingBridgeAudio: false,
  bridgeBlobTried: false,
  bridgeLookupTried: false,
  preResolveStarted: false,
  resolvedBridgeUrl: readCachedPreviewUrl()
};

const ytReadyWaiters = [];
const scScriptWaiters = [];

function isFullSongPlayingNow() {
  return Boolean(
    (audioState.activeEngine === 'sc' && audioState.isScPlayingFull) ||
    (audioState.activeEngine === 'yt' && audioState.isYtPlayingUnmuted)
  );
}

function notifyYtApiReady() {
  audioState.isYtScriptLoaded = true;
  while (ytReadyWaiters.length > 0) {
    const fn = ytReadyWaiters.shift();
    try { fn(); } catch (e) {}
  }
}

function ensureScWidgetApiLoaded(cb) {
  if (typeof window === 'undefined' || typeof document === 'undefined') return;
  if (window.SC && typeof window.SC.Widget === 'function') {
    if (typeof cb === 'function') cb();
    return;
  }
  if (typeof cb === 'function') {
    scScriptWaiters.push(cb);
  }
  if (audioState.isScScriptLoading) return;
  const existing = document.querySelector('script[src*="w.soundcloud.com/player/api.js"]');
  if (existing) {
    audioState.isScScriptLoading = true;
    existing.addEventListener('load', () => {
      audioState.isScScriptLoading = false;
      while (scScriptWaiters.length > 0) {
        const fn = scScriptWaiters.shift();
        try { fn(); } catch (e) {}
      }
    }, { once: true });
    return;
  }
  audioState.isScScriptLoading = true;
  const tag = document.createElement('script');
  tag.src = 'https://w.soundcloud.com/player/api.js';
  tag.async = true;
  tag.onload = () => {
    audioState.isScScriptLoading = false;
    while (scScriptWaiters.length > 0) {
      const fn = scScriptWaiters.shift();
      try { fn(); } catch (e) {}
    }
  };
  tag.onerror = () => {
    audioState.isScScriptLoading = false;
    scScriptWaiters.length = 0;
  };
  document.head.appendChild(tag);
}

function ensureYtIframeApiLoaded() {
  if (typeof window === 'undefined' || typeof document === 'undefined') return;
  if (window.YT && window.YT.Player) {
    audioState.isYtScriptLoaded = true;
    return;
  }
  const prevCb = window.onYouTubeIframeAPIReady;
  if (!window.__blutuSharedYtCallbackWrapped) {
    window.__blutuSharedYtCallbackWrapped = true;
    window.onYouTubeIframeAPIReady = function () {
      if (typeof prevCb === 'function') {
        try { prevCb(); } catch (e) {}
      }
      notifyYtApiReady();
    };
  }
  if (!document.querySelector('script[src*="youtube.com/iframe_api"]')) {
    const tag = document.createElement('script');
    tag.src = 'https://www.youtube.com/iframe_api';
    tag.async = true;
    document.head.appendChild(tag);
  }
}

async function resolveFreshItunesPreviewUrl() {
  try {
    const res1 = await fetch('https://itunes.apple.com/lookup?id=' + GAME_ITUNES_TRACK_ID + '&entity=song', {
      mode: 'cors',
      credentials: 'omit'
    });
    if (res1 && res1.ok) {
      const data1 = await res1.json();
      const hit1 = data1 && Array.isArray(data1.results)
        ? data1.results.find((it) => it && it.previewUrl)
        : null;
      if (hit1 && hit1.previewUrl) {
        audioState.resolvedBridgeUrl = hit1.previewUrl;
        saveCachedPreviewUrl(hit1.previewUrl);
        return hit1.previewUrl;
      }
    }
  } catch (e) {}

  try {
    const res2 = await fetch('https://itunes.apple.com/lookup?id=' + GAME_ITUNES_ARTIST_ID + '&entity=song&limit=50', {
      mode: 'cors',
      credentials: 'omit'
    });
    if (res2 && res2.ok) {
      const data2 = await res2.json();
      const results = (data2 && Array.isArray(data2.results)) ? data2.results : [];
      const escalerasHit = results.find((it) => it && it.previewUrl && /escaleras/i.test(String(it.trackName || '')))
        || results.find((it) => it && it.previewUrl);
      if (escalerasHit && escalerasHit.previewUrl) {
        audioState.resolvedBridgeUrl = escalerasHit.previewUrl;
        saveCachedPreviewUrl(escalerasHit.previewUrl);
        return escalerasHit.previewUrl;
      }
    }
  } catch (e) {}

  return null;
}

export function preloadSharedGameMusicApi() {
  if (typeof window === 'undefined' || typeof document === 'undefined') return;

  audioState.resolvedBridgeUrl = readCachedPreviewUrl();
  if (!audioState.preResolveStarted) {
    audioState.preResolveStarted = true;
    resolveFreshItunesPreviewUrl().catch(() => {});
  }

  ensureScWidgetApiLoaded();
}

export function unlockSharedWebViewAudioSession() {
  try {
    if (navigator.audioSession && navigator.audioSession.type !== 'playback') {
      navigator.audioSession.type = 'playback';
    }
  } catch (e) {}
  try {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return;
    if (!sharedAudioCtx || sharedAudioCtx.state === 'closed') {
      sharedAudioCtx = new AudioCtx();
    }
    if (sharedAudioCtx.state === 'suspended') {
      sharedAudioCtx.resume().catch(() => {});
    }
    const buf = sharedAudioCtx.createBuffer(1, 1, 22050);
    const src = sharedAudioCtx.createBufferSource();
    src.buffer = buf;
    src.connect(sharedAudioCtx.destination);
    src.start(0);
  } catch (e) {}
}

export function isSharedGameMusicActive() {
  return Boolean(audioState.isActive);
}

export function isSharedGameMusicMuted() {
  if (typeof window !== 'undefined' && typeof window.__blutuSharedMusicMuted === 'boolean') {
    sharedMusicMuted = window.__blutuSharedMusicMuted;
  }
  return sharedMusicMuted;
}

export function registerSharedMuteButton(btnId) {
  if (!btnId) return;
  audioState.muteBtnIds.add(btnId);
  syncAllMuteButtonsUI();
}

export function syncAllMuteButtonsUI() {
  if (typeof window !== 'undefined' && typeof window.__blutuSharedMusicMuted === 'boolean') {
    sharedMusicMuted = window.__blutuSharedMusicMuted;
  }
  const iconClass = sharedMusicMuted ? 'fa-volume-xmark' : 'fa-volume-high';
  const iconHtml = `<i class="fa-solid ${iconClass}" aria-hidden="true"></i>`;
  const label = sharedMusicMuted ? 'Activar música' : 'Silenciar música';

  audioState.muteBtnIds.forEach((id) => {
    const btn = typeof document !== 'undefined' ? document.getElementById(id) : null;
    if (!btn) return;
    btn.classList.toggle('is-muted', sharedMusicMuted);
    btn.setAttribute('aria-label', label);
    btn.setAttribute('aria-pressed', sharedMusicMuted ? 'true' : 'false');
    btn.title = label;
    btn.innerHTML = iconHtml;
  });
}

function sendScPostMessage(method, value) {
  const iframe = audioState.scIframeEl || (typeof document !== 'undefined' ? document.getElementById('blutu-shared-sc-iframe') : null);
  if (!iframe || !iframe.contentWindow) return;
  try {
    const payload = value === undefined ? { method } : { method, value };
    iframe.contentWindow.postMessage(JSON.stringify(payload), 'https://w.soundcloud.com');
  } catch (e) {}
}

function sendYtPostMessage(funcName, args) {
  const iframe = typeof document !== 'undefined' ? document.getElementById('blutu-shared-yt-iframe') : null;
  if (!iframe || !iframe.contentWindow) return;
  try {
    iframe.contentWindow.postMessage(
      JSON.stringify({ event: 'command', func: funcName, args: args || [] }),
      '*'
    );
  } catch (e) {}
}

function pauseBridgeAudioSilently() {
  audioState.usingBridgeAudio = false;
  if (audioState.bridgeAudio) {
    try {
      audioState.bridgeAudio.muted = true;
      audioState.bridgeAudio.pause();
    } catch (e) {}
  }
}

function stopAndCleanBridgeAudio() {
  audioState.usingBridgeAudio = false;
  if (audioState.activeEngine === 'bridge') {
    audioState.activeEngine = 'none';
  }
  if (audioState.bridgeAudio) {
    try {
      audioState.bridgeAudio.muted = true;
      audioState.bridgeAudio.pause();
      audioState.bridgeAudio.removeAttribute('src');
      audioState.bridgeAudio.load();
      if (audioState.bridgeAudio.parentNode) {
        audioState.bridgeAudio.parentNode.removeChild(audioState.bridgeAudio);
      }
    } catch (e) {}
    audioState.bridgeAudio = null;
  }
  if (typeof document !== 'undefined') {
    document.querySelectorAll('#blutu-shared-direct-audio').forEach((strayEl) => {
      try {
        strayEl.muted = true;
        strayEl.pause();
        strayEl.removeAttribute('src');
        strayEl.load();
        strayEl.remove();
      } catch (e) {}
    });
  }
  if (typeof window !== 'undefined' && window.__blutuPrimedGestureAudio) {
    try {
      window.__blutuPrimedGestureAudio.muted = true;
      window.__blutuPrimedGestureAudio.pause();
      if (window.__blutuPrimedGestureAudio.parentNode) {
        window.__blutuPrimedGestureAudio.parentNode.removeChild(window.__blutuPrimedGestureAudio);
      }
    } catch (e) {}
    window.__blutuPrimedGestureAudio = null;
  }
  if (audioState.bridgeBlobUrl) {
    try { URL.revokeObjectURL(audioState.bridgeBlobUrl); } catch (e) {}
    audioState.bridgeBlobUrl = null;
  }
}

function stopAndDestroyYouTubeEngine() {
  audioState.isYtReady = false;
  audioState.isYtPlayingUnmuted = false;
  if (audioState.activeEngine === 'yt') {
    audioState.activeEngine = 'none';
  }
  if (audioState.ytVerifyTimer) {
    clearTimeout(audioState.ytVerifyTimer);
    audioState.ytVerifyTimer = null;
  }
  if (audioState.ytPlayer) {
    try {
      if (typeof audioState.ytPlayer.stopVideo === 'function') audioState.ytPlayer.stopVideo();
      if (typeof audioState.ytPlayer.destroy === 'function') audioState.ytPlayer.destroy();
    } catch (e) {}
    audioState.ytPlayer = null;
  } else {
    sendYtPostMessage('stopVideo');
  }
  if (typeof document !== 'undefined') {
    document.querySelectorAll('#blutu-shared-yt-container').forEach((ytCont) => {
      try {
        const ifr = ytCont.querySelector('iframe');
        if (ifr) ifr.src = 'about:blank';
        ytCont.remove();
      } catch (e) {}
    });
  }
  audioState.ytContainerEl = null;
}

function stopAndDestroySoundCloudEngine() {
  audioState.isScReady = false;
  audioState.isScPlayingFull = false;
  if (audioState.activeEngine === 'sc') {
    audioState.activeEngine = 'none';
  }
  if (audioState.scFallbackTimer) {
    clearTimeout(audioState.scFallbackTimer);
    audioState.scFallbackTimer = null;
  }
  if (audioState.scWidget) {
    try {
      audioState.scWidget.setVolume(0);
      audioState.scWidget.pause();
    } catch (e) {}
    audioState.scWidget = null;
  } else {
    sendScPostMessage('setVolume', 0);
    sendScPostMessage('pause');
  }
  if (typeof document !== 'undefined') {
    document.querySelectorAll('#blutu-shared-sc-container').forEach((scCont) => {
      try {
        const ifr = scCont.querySelector('iframe');
        if (ifr) ifr.src = 'about:blank';
        scCont.remove();
      } catch (e) {}
    });
  }
  audioState.scContainerEl = null;
  audioState.scIframeEl = null;
}

function attachBridgeAudioGuardsAndRecovery(audioEl) {
  if (!audioEl || audioEl._blutuRecoveryBound) return;
  audioEl._blutuRecoveryBound = true;

  // Guardián estricto: jamás permite que el <audio> de respaldo suene si otro motor está activo o si está silenciado
  audioEl.addEventListener('playing', () => {
    if (!audioState.isActive || audioState.activeEngine !== 'bridge' || !audioState.usingBridgeAudio || sharedMusicMuted) {
      try {
        audioEl.muted = true;
        audioEl.pause();
      } catch (e) {}
    }
  });

  audioEl.addEventListener('error', () => {
    const token = audioState.runToken;
    if (!audioState.isActive || audioState.activeEngine !== 'bridge' || !audioState.usingBridgeAudio) return;

    if (!audioState.bridgeLookupTried) {
      triggerItunesBridgeLookup(token);
      return;
    }

    if (!audioState.bridgeBlobTried) {
      audioState.bridgeBlobTried = true;
      fetch(audioState.resolvedBridgeUrl || GAME_DIRECT_PREVIEW_URL, { mode: 'cors', credentials: 'omit' })
        .then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(new Error('HTTP ' + r.status))))
        .then((buf) => {
          if (
            !audioState.isActive ||
            token !== audioState.runToken ||
            audioState.activeEngine !== 'bridge' ||
            !audioState.usingBridgeAudio ||
            !audioState.bridgeAudio
          ) {
            return;
          }
          if (audioState.bridgeBlobUrl) {
            try { URL.revokeObjectURL(audioState.bridgeBlobUrl); } catch (e) {}
          }
          const blob = new Blob([buf], { type: 'audio/mp4' });
          const blobUrl = URL.createObjectURL(blob);
          audioState.bridgeBlobUrl = blobUrl;
          audioState.bridgeAudio.src = blobUrl;
          audioState.bridgeAudio.loop = true;
          audioState.bridgeAudio.volume = 0.88;
          audioState.bridgeAudio.muted = sharedMusicMuted;
          if (!sharedMusicMuted) {
            const p = audioState.bridgeAudio.play();
            if (p && typeof p.catch === 'function') p.catch(() => {});
          }
        })
        .catch(() => {});
    }
  });
}

function triggerItunesBridgeLookup(token) {
  if (audioState.bridgeLookupTried || !audioState.isActive || audioState.activeEngine !== 'bridge') return;
  audioState.bridgeLookupTried = true;
  resolveFreshItunesPreviewUrl()
    .then((freshUrl) => {
      if (
        !freshUrl ||
        !audioState.isActive ||
        token !== audioState.runToken ||
        audioState.activeEngine !== 'bridge' ||
        !audioState.usingBridgeAudio ||
        !audioState.bridgeAudio
      ) {
        return;
      }
      audioState.bridgeAudio.src = freshUrl;
      audioState.bridgeAudio.loop = true;
      audioState.bridgeAudio.volume = 0.88;
      audioState.bridgeAudio.muted = sharedMusicMuted;
      if (!sharedMusicMuted) {
        const p = audioState.bridgeAudio.play();
        if (p && typeof p.catch === 'function') p.catch(() => {});
      }
    })
    .catch(() => {});
}

function ensureBridgeAudioMountedSynchronously(playImmediately) {
  const targetUrl = audioState.resolvedBridgeUrl || readCachedPreviewUrl();

  if (typeof window !== 'undefined' && window.__blutuPrimedGestureAudio) {
    const pre = window.__blutuPrimedGestureAudio;
    window.__blutuPrimedGestureAudio = null;
    pre.id = 'blutu-shared-direct-audio';
    pre.loop = true;
    pre.playsInline = true;
    pre.setAttribute('playsinline', '');
    pre.setAttribute('webkit-playsinline', '');
    pre.style.display = 'none';
    if (!pre.parentNode && document.body) {
      document.body.appendChild(pre);
    }
    if (!pre.src || pre.src.startsWith('data:')) {
      pre.src = targetUrl;
    }
    pre.volume = 0.88;
    attachBridgeAudioGuardsAndRecovery(pre);
    audioState.bridgeAudio = pre;

    if (playImmediately && audioState.activeEngine === 'bridge') {
      audioState.usingBridgeAudio = true;
      pre.muted = sharedMusicMuted;
      if (!sharedMusicMuted && pre.paused) {
        try {
          const p = pre.play();
          if (p && typeof p.catch === 'function') p.catch(() => {});
        } catch (e) {}
      }
    } else {
      try {
        pre.muted = true;
        pre.pause();
        pre.currentTime = 0;
      } catch (e) {}
    }
    return pre;
  }

  if (audioState.bridgeAudio) {
    const existing = audioState.bridgeAudio;
    if (!existing.parentNode && document.body) {
      document.body.appendChild(existing);
    }
    if (!existing.src || existing.src.startsWith('data:')) {
      existing.src = targetUrl;
    }
    existing.loop = true;
    existing.volume = 0.88;
    attachBridgeAudioGuardsAndRecovery(existing);
    if (playImmediately && audioState.activeEngine === 'bridge') {
      audioState.usingBridgeAudio = true;
      existing.muted = sharedMusicMuted;
      if (!sharedMusicMuted && existing.paused) {
        try {
          const p = existing.play();
          if (p && typeof p.catch === 'function') p.catch(() => {});
        } catch (e) {}
      }
    } else {
      try {
        existing.muted = true;
        existing.pause();
      } catch (e) {}
    }
    return existing;
  }

  try {
    const audioEl = document.createElement('audio');
    audioEl.id = 'blutu-shared-direct-audio';
    audioEl.preload = 'none';
    audioEl.loop = true;
    audioEl.playsInline = true;
    audioEl.setAttribute('playsinline', '');
    audioEl.setAttribute('webkit-playsinline', '');
    audioEl.style.display = 'none';
    audioEl.volume = 0.88;
    audioEl.src = targetUrl;
    if (document.body) {
      document.body.appendChild(audioEl);
    }
    attachBridgeAudioGuardsAndRecovery(audioEl);
    audioState.bridgeAudio = audioEl;

    if (playImmediately && audioState.activeEngine === 'bridge') {
      audioState.usingBridgeAudio = true;
      audioEl.muted = sharedMusicMuted;
      if (!sharedMusicMuted) {
        const p = audioEl.play();
        if (p && typeof p.catch === 'function') p.catch(() => {});
      }
    } else {
      // Desbloquear la sesión de audio dentro del gesto sincrónico en silencio absoluto
      audioEl.muted = true;
      const p = audioEl.play();
      if (p && typeof p.then === 'function') {
        p.then(() => {
          if (audioState.bridgeAudio === audioEl && (audioState.activeEngine !== 'bridge' || !audioState.usingBridgeAudio)) {
            audioEl.muted = true;
            audioEl.pause();
            audioEl.currentTime = 0;
          }
        }).catch(() => {});
      }
    }
    return audioEl;
  } catch (e) {
    return null;
  }
}

function activateTemporaryBridgeAudio(token) {
  if (!audioState.isActive || token !== audioState.runToken || sharedMusicMuted) return;

  // EXCLUSIVIDAD ESTRICTA: Destruir por completo SoundCloud y YouTube antes de activar el respaldo <audio>
  stopAndDestroySoundCloudEngine();
  stopAndDestroyYouTubeEngine();

  audioState.activeEngine = 'bridge';
  audioState.usingBridgeAudio = true;

  const a = ensureBridgeAudioMountedSynchronously(true);
  if (!a) return;

  a.loop = true;
  a.volume = 0.88;
  a.muted = sharedMusicMuted;
  if (!sharedMusicMuted && a.paused) {
    try {
      const p = a.play();
      if (p && typeof p.catch === 'function') p.catch(() => {});
    } catch (e) {}
  }
}

function onFullSongConfirmedPlaying(source, token) {
  if (!audioState.isActive || token !== audioState.runToken) return;
  if (source === 'sc') {
    if (audioState.activeEngine !== 'sc') return;
    audioState.isScPlayingFull = true;
    if (audioState.scFallbackTimer) {
      clearTimeout(audioState.scFallbackTimer);
      audioState.scFallbackTimer = null;
    }
    stopAndDestroyYouTubeEngine();
    stopAndCleanBridgeAudio();
  } else if (source === 'yt') {
    if (audioState.activeEngine !== 'yt') return;
    audioState.isYtPlayingUnmuted = true;
    if (audioState.ytVerifyTimer) {
      clearTimeout(audioState.ytVerifyTimer);
      audioState.ytVerifyTimer = null;
    }
    stopAndDestroySoundCloudEngine();
    stopAndCleanBridgeAudio();
  }
}

/* ==================== MOTOR 1: SOUNDCLOUD WIDGET OFICIAL ("ESCALERAS" COMPLETA 1:44, SOLO AUDIO) ==================== */
function mountSoundCloudFullSongEngine(token) {
  if (!audioState.isActive || token !== audioState.runToken || sharedMusicMuted) return;
  if (audioState.activeEngine === 'sc' && audioState.scContainerEl) return;

  // EXCLUSIVIDAD ESTRICTA: Asegurar que ningún otro reproductor exista antes de montar SoundCloud
  stopAndDestroyYouTubeEngine();
  stopAndDestroySoundCloudEngine();
  pauseBridgeAudioSilently();

  audioState.activeEngine = 'sc';

  // Contenedor 4x4 no recortado y con opacidad > 1/255 para que WKWebView (Instagram iOS) y Android WebView no bloqueen el audio
  const scContainer = document.createElement('div');
  scContainer.id = 'blutu-shared-sc-container';
  scContainer.setAttribute('aria-hidden', 'true');
  scContainer.style.cssText = 'position:fixed;bottom:2px;left:2px;width:4px;height:4px;opacity:0.02;pointer-events:none;z-index:2;overflow:hidden;';

  const iframe = document.createElement('iframe');
  iframe.id = 'blutu-shared-sc-iframe';
  iframe.width = '180';
  iframe.height = '120';
  iframe.allow = 'autoplay; encrypted-media';
  iframe.setAttribute('tabindex', '-1');
  iframe.setAttribute('aria-hidden', 'true');
  iframe.style.cssText = 'border:0;width:180px;height:120px;pointer-events:none;';
  iframe.src = `https://w.soundcloud.com/player/?url=https%3A//api.soundcloud.com/tracks/${GAME_SC_TRACK_ID}&auto_play=true&buying=false&liking=false&download=false&sharing=false&show_artwork=false&show_comments=false&show_playcount=false&show_user=false&hide_related=true&visual=false`;

  scContainer.appendChild(iframe);
  (audioState.hostEl || document.body).appendChild(scContainer);
  audioState.scContainerEl = scContainer;
  audioState.scIframeEl = iframe;

  ensureScWidgetApiLoaded(() => {
    if (
      !audioState.isActive ||
      token !== audioState.runToken ||
      audioState.activeEngine !== 'sc' ||
      !audioState.scIframeEl ||
      !(window.SC && typeof window.SC.Widget === 'function')
    ) {
      return;
    }
    try {
      const widget = window.SC.Widget(audioState.scIframeEl);
      audioState.scWidget = widget;
      const Events = window.SC.Widget.Events || {
        READY: 'ready',
        PLAY: 'play',
        PLAY_PROGRESS: 'playProgress',
        FINISH: 'finish',
        ERROR: 'error'
      };

      widget.bind(Events.READY, () => {
        if (!audioState.isActive || token !== audioState.runToken || audioState.activeEngine !== 'sc') return;
        audioState.isScReady = true;
        try {
          if (sharedMusicMuted) {
            widget.setVolume(0);
            widget.pause();
            return;
          }
          widget.setVolume(88);
          widget.isPaused((paused) => {
            if (paused && audioState.isActive && token === audioState.runToken && audioState.activeEngine === 'sc' && !sharedMusicMuted) {
              try { widget.play(); } catch (e) {}
            }
          });
        } catch (e) {}
      });

      widget.bind(Events.PLAY, () => {
        if (!audioState.isActive || token !== audioState.runToken || audioState.activeEngine !== 'sc') return;
        if (sharedMusicMuted) {
          try {
            widget.setVolume(0);
            widget.pause();
          } catch (e) {}
          return;
        }
        try { widget.setVolume(88); } catch (e) {}
        onFullSongConfirmedPlaying('sc', token);
      });

      widget.bind(Events.PLAY_PROGRESS, (ev) => {
        if (!audioState.isActive || token !== audioState.runToken || audioState.activeEngine !== 'sc') return;
        if (sharedMusicMuted) {
          try {
            widget.setVolume(0);
            widget.pause();
          } catch (e) {}
          return;
        }
        if (ev && typeof ev.currentPosition === 'number' && ev.currentPosition >= 0 && !audioState.isScPlayingFull) {
          try { widget.setVolume(88); } catch (e) {}
          onFullSongConfirmedPlaying('sc', token);
        }
      });

      widget.bind(Events.FINISH, () => {
        if (!audioState.isActive || token !== audioState.runToken || audioState.activeEngine !== 'sc') return;
        try {
          widget.seekTo(0);
          if (!sharedMusicMuted) widget.play();
        } catch (e) {}
      });

      widget.bind(Events.ERROR, () => {
        if (!audioState.isActive || token !== audioState.runToken || audioState.isScPlayingFull) return;
        stopAndDestroySoundCloudEngine();
        mountYouTubeFullSongFallback(token);
      });
    } catch (e) {
      if (audioState.isActive && token === audioState.runToken) {
        stopAndDestroySoundCloudEngine();
        mountYouTubeFullSongFallback(token);
      }
    }
  });

  // Si SoundCloud es bloqueado o no logra reproducir tras 5.2s, DESTRUIR SoundCloud primero y montar YouTube como único motor
  audioState.scFallbackTimer = setTimeout(() => {
    audioState.scFallbackTimer = null;
    if (!audioState.isActive || token !== audioState.runToken || sharedMusicMuted || audioState.isScPlayingFull) return;
    stopAndDestroySoundCloudEngine();
    mountYouTubeFullSongFallback(token);
  }, 5200);
}

/* ==================== MOTOR 2: YOUTUBE IFRAME ("ESCALERAS" COMPLETA 3Ea5h9Xqe3E) ==================== */
function mountYouTubeFullSongFallback(token) {
  if (!audioState.isActive || token !== audioState.runToken || sharedMusicMuted) return;
  if (audioState.activeEngine === 'yt' && audioState.ytContainerEl) return;

  // EXCLUSIVIDAD ESTRICTA: Destruir SoundCloud y silenciar bridge antes de montar YouTube
  stopAndDestroySoundCloudEngine();
  stopAndDestroyYouTubeEngine();
  pauseBridgeAudioSilently();

  audioState.activeEngine = 'yt';
  ensureYtIframeApiLoaded();

  const ytContainer = document.createElement('div');
  ytContainer.id = 'blutu-shared-yt-container';
  ytContainer.setAttribute('aria-hidden', 'true');
  ytContainer.style.cssText = 'position:fixed;bottom:2px;left:8px;width:4px;height:4px;opacity:0.02;pointer-events:none;z-index:2;overflow:hidden;';

  const originVal = (window.location && window.location.origin && window.location.origin !== 'null' && window.location.protocol.startsWith('http'))
    ? encodeURIComponent(window.location.origin)
    : '';
  const originParam = originVal ? `&origin=${originVal}&widget_referrer=${originVal}` : '';

  const iframe = document.createElement('iframe');
  iframe.id = 'blutu-shared-yt-iframe';
  iframe.width = '200';
  iframe.height = '200';
  iframe.allow = 'autoplay; encrypted-media; picture-in-picture';
  iframe.setAttribute('playsinline', '1');
  iframe.setAttribute('webkit-playsinline', '1');
  iframe.setAttribute('tabindex', '-1');
  iframe.setAttribute('aria-hidden', 'true');
  iframe.style.cssText = 'border:0;width:200px;height:200px;pointer-events:none;';
  iframe.src = `https://www.youtube.com/embed/${GAME_SONG_VIDEO_ID}?autoplay=1&mute=0&controls=0&disablekb=1&fs=0&loop=1&playlist=${GAME_SONG_VIDEO_ID}&modestbranding=1&playsinline=1&rel=0&enablejsapi=1${originParam}`;

  ytContainer.appendChild(iframe);
  (audioState.hostEl || document.body).appendChild(ytContainer);
  audioState.ytContainerEl = ytContainer;

  if (window.YT && window.YT.Player) {
    bindFullSongYouTubePlayer(token);
  } else {
    ytReadyWaiters.push(() => {
      if (audioState.isActive && token === audioState.runToken && audioState.activeEngine === 'yt') {
        bindFullSongYouTubePlayer(token);
      }
    });
  }

  // Si YouTube tampoco logra reproducir tras 4.5s, DESTRUIR YouTube primero y pasar al respaldo directo
  audioState.ytVerifyTimer = setTimeout(() => {
    audioState.ytVerifyTimer = null;
    if (!audioState.isActive || token !== audioState.runToken || sharedMusicMuted || audioState.isYtPlayingUnmuted) return;
    stopAndDestroyYouTubeEngine();
    activateTemporaryBridgeAudio(token);
  }, 4500);
}

function bindFullSongYouTubePlayer(token) {
  if (!audioState.isActive || token !== audioState.runToken || audioState.activeEngine !== 'yt') return;
  const iframeEl = document.getElementById('blutu-shared-yt-iframe');
  if (!iframeEl || !(window.YT && window.YT.Player)) return;
  if (audioState.ytPlayer) return;

  try {
    audioState.ytPlayer = new window.YT.Player('blutu-shared-yt-iframe', {
      events: {
        onReady: (ev) => {
          if (!audioState.isActive || token !== audioState.runToken || audioState.activeEngine !== 'yt') return;
          audioState.isYtReady = true;
          try {
            if (sharedMusicMuted) {
              ev.target.mute();
              ev.target.pauseVideo();
            } else {
              ev.target.unMute();
              ev.target.setVolume(88);
              ev.target.playVideo();
            }
          } catch (err) {}
        },
        onStateChange: (ev) => {
          if (!audioState.isActive || token !== audioState.runToken || audioState.activeEngine !== 'yt') return;
          if (ev.data === 1) {
            if (sharedMusicMuted) {
              try {
                ev.target.mute();
                ev.target.pauseVideo();
              } catch (e) {}
              return;
            }
            let currentlyMuted = false;
            try {
              if (typeof ev.target.isMuted === 'function' && ev.target.isMuted()) {
                ev.target.unMute();
                ev.target.setVolume(88);
              }
              currentlyMuted = typeof ev.target.isMuted === 'function' ? ev.target.isMuted() : false;
            } catch (e) {}

            if (!currentlyMuted) {
              onFullSongConfirmedPlaying('yt', token);
            }
          } else if (ev.data === 0) {
            try {
              ev.target.seekTo(0, true);
              if (!sharedMusicMuted) ev.target.playVideo();
            } catch (err) {}
          }
        },
        onError: () => {
          if (!audioState.isActive || token !== audioState.runToken || audioState.isYtPlayingUnmuted) return;
          stopAndDestroyYouTubeEngine();
          activateTemporaryBridgeAudio(token);
        }
      }
    });
  } catch (e) {
    if (audioState.isActive && token === audioState.runToken && !audioState.isYtPlayingUnmuted) {
      stopAndDestroyYouTubeEngine();
      activateTemporaryBridgeAudio(token);
    }
  }
}

function promoteCurrentSingleEngineOnGesture() {
  if (!audioState.isActive || sharedMusicMuted) return false;

  if (audioState.activeEngine === 'sc') {
    if (audioState.scWidget && audioState.isScReady) {
      try {
        audioState.scWidget.setVolume(88);
        audioState.scWidget.isPaused((paused) => {
          if (paused && audioState.isActive && audioState.activeEngine === 'sc' && !sharedMusicMuted) {
            try { audioState.scWidget.play(); } catch (e) {}
          }
        });
      } catch (e) {}
    } else if (audioState.scIframeEl && !audioState.isScPlayingFull) {
      sendScPostMessage('setVolume', 88);
      sendScPostMessage('play');
    }
    return audioState.isScPlayingFull;
  }

  if (audioState.activeEngine === 'yt') {
    if (audioState.ytPlayer && audioState.isYtReady) {
      try {
        if (typeof audioState.ytPlayer.unMute === 'function') audioState.ytPlayer.unMute();
        if (typeof audioState.ytPlayer.setVolume === 'function') audioState.ytPlayer.setVolume(88);
        const st = typeof audioState.ytPlayer.getPlayerState === 'function' ? audioState.ytPlayer.getPlayerState() : -1;
        if (st !== 1 && st !== 3 && typeof audioState.ytPlayer.playVideo === 'function') {
          audioState.ytPlayer.playVideo();
        }
        return st === 1;
      } catch (e) {}
    } else if (document.getElementById('blutu-shared-yt-iframe')) {
      sendYtPostMessage('unMute');
      sendYtPostMessage('setVolume', [88]);
      sendYtPostMessage('playVideo');
    }
    return audioState.isYtPlayingUnmuted;
  }

  if (audioState.activeEngine === 'bridge' && audioState.usingBridgeAudio && audioState.bridgeAudio) {
    try {
      audioState.bridgeAudio.muted = false;
      audioState.bridgeAudio.volume = 0.88;
      if (audioState.bridgeAudio.paused) {
        const p = audioState.bridgeAudio.play();
        if (p && typeof p.catch === 'function') p.catch(() => {});
      }
      return true;
    } catch (e) {}
  }

  return false;
}

export function startSharedGameMusic(hostEl, muteBtnId) {
  if (typeof window !== 'undefined' && typeof window.__blutuSharedMusicMuted === 'boolean') {
    sharedMusicMuted = window.__blutuSharedMusicMuted;
  }

  const preservedPrimed = (typeof window !== 'undefined' && window.__blutuPrimedGestureAudio)
    ? window.__blutuPrimedGestureAudio
    : null;
  if (preservedPrimed) {
    window.__blutuPrimedGestureAudio = null;
  }

  stopAndDestroySharedGameMusic(true);

  if (preservedPrimed) {
    window.__blutuPrimedGestureAudio = preservedPrimed;
  }

  const token = ++audioState.runToken;
  audioState.isActive = true;
  audioState.activeEngine = 'none';
  audioState.hostEl = hostEl || document.body;
  audioState.isScReady = false;
  audioState.isScPlayingFull = false;
  audioState.isYtReady = false;
  audioState.isYtPlayingUnmuted = false;
  audioState.usingBridgeAudio = false;
  audioState.bridgeBlobTried = false;
  audioState.bridgeLookupTried = false;
  audioState.resolvedBridgeUrl = readCachedPreviewUrl();

  if (muteBtnId) {
    audioState.muteBtnIds.add(muteBtnId);
  }
  syncAllMuteButtonsUI();

  unlockSharedWebViewAudioSession();

  // Preparar el elemento <audio> desbloqueado en silencio absoluto como respaldo futuro sin sonar jamás encima
  ensureBridgeAudioMountedSynchronously(false);

  // Si el usuario silenció la música antes de entrar al juego, no montar ni reproducir ningún motor hasta que reactive el sonido
  if (sharedMusicMuted) {
    return;
  }

  mountSoundCloudFullSongEngine(token);
}

export function notifySharedGameUserGesture() {
  if (!audioState.isActive || sharedMusicMuted) return;
  unlockSharedWebViewAudioSession();

  if (audioState.activeEngine === 'none') {
    mountSoundCloudFullSongEngine(audioState.runToken);
    return;
  }

  promoteCurrentSingleEngineOnGesture();
}

export function pauseSharedGameMusicTemporary() {
  if (!audioState.isActive) return;
  if (audioState.bridgeAudio) {
    try { audioState.bridgeAudio.pause(); } catch (e) {}
  }
  if (audioState.scWidget && audioState.isScReady) {
    try { audioState.scWidget.pause(); } catch (e) {}
  } else if (audioState.scIframeEl) {
    sendScPostMessage('pause');
  }
  if (audioState.ytPlayer && audioState.isYtReady) {
    try { audioState.ytPlayer.pauseVideo(); } catch (e) {}
  } else if (audioState.ytContainerEl) {
    sendYtPostMessage('pauseVideo');
  }
}

export function toggleSharedGameMute() {
  unlockSharedWebViewAudioSession();
  if (typeof window !== 'undefined' && typeof window.__blutuSharedMusicMuted === 'boolean') {
    sharedMusicMuted = window.__blutuSharedMusicMuted;
  }
  sharedMusicMuted = !sharedMusicMuted;
  persistMutedState(sharedMusicMuted);
  syncAllMuteButtonsUI();

  if (!audioState.isActive) return sharedMusicMuted;

  if (sharedMusicMuted) {
    if (audioState.scFallbackTimer) {
      clearTimeout(audioState.scFallbackTimer);
      audioState.scFallbackTimer = null;
    }
    if (audioState.ytVerifyTimer) {
      clearTimeout(audioState.ytVerifyTimer);
      audioState.ytVerifyTimer = null;
    }
    if (audioState.bridgeAudio) {
      try {
        audioState.bridgeAudio.muted = true;
        audioState.bridgeAudio.pause();
      } catch (e) {}
    }
    if (audioState.scWidget && audioState.isScReady) {
      try {
        audioState.scWidget.setVolume(0);
        audioState.scWidget.pause();
      } catch (e) {}
    } else if (audioState.scIframeEl) {
      sendScPostMessage('setVolume', 0);
      sendScPostMessage('pause');
    }
    if (audioState.ytPlayer && audioState.isYtReady) {
      try {
        audioState.ytPlayer.mute();
        audioState.ytPlayer.pauseVideo();
      } catch (e) {}
    } else if (audioState.ytContainerEl) {
      sendYtPostMessage('mute');
      sendYtPostMessage('pauseVideo');
    }
  } else {
    if (audioState.activeEngine === 'none') {
      mountSoundCloudFullSongEngine(audioState.runToken);
    } else {
      promoteCurrentSingleEngineOnGesture();
    }
  }
  return sharedMusicMuted;
}

export function stopAndDestroySharedGameMusic(keepMuteBtns = false) {
  audioState.runToken++;
  audioState.isActive = false;
  audioState.activeEngine = 'none';
  audioState.hostEl = null;

  if (!keepMuteBtns) {
    audioState.muteBtnIds.clear();
  }

  stopAndCleanBridgeAudio();
  stopAndDestroySoundCloudEngine();
  stopAndDestroyYouTubeEngine();
}

if (typeof window !== 'undefined') {
  persistMutedState(sharedMusicMuted);
  window.toggleSharedGameMute = toggleSharedGameMute;
  window.isSharedGameMusicMuted = isSharedGameMusicMuted;
  window.registerSharedMuteButton = registerSharedMuteButton;
  window.syncAllMuteButtonsUI = syncAllMuteButtonsUI;

  document.addEventListener('visibilitychange', () => {
    if (!audioState.isActive) return;
    if (document.hidden) {
      pauseSharedGameMusicTemporary();
    } else if (!sharedMusicMuted) {
      promoteCurrentSingleEngineOnGesture();
    }
  });
}
