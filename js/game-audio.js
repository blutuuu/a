/* Blutu — Motor Compartido de Música de Partida ("Escaleras" - 3Ea5h9Xqe3E)
   100% Bajo Demanda: Cero carga al abrir la página y destrucción completa al salir de partida */

const GAME_SONG_VIDEO_ID = '3Ea5h9Xqe3E';
const GAME_ITUNES_TRACK_ID = '6773560493';
const GAME_ITUNES_ARTIST_ID = '1223269133';
const GAME_AUDIO_SESSION_CACHE_KEY = 'blutu_escaleras_audio_url';
export const GAME_DIRECT_PREVIEW_URL = 'https://audio-ssl.itunes.apple.com/itunes-assets/AudioPreview221/v4/ec/fb/45/ecfb4526-93d2-03e7-c901-a297111f1458/mzaf_14659704648749163645.plus.aac.p.m4a';

let sharedAudioCtx = null;
let sharedMusicMuted = false;

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
  hostEl: null,
  muteBtnIds: new Set(),
  ytContainerEl: null,
  ytPlayer: null,
  isYtReady: false,
  isYtPlayingUnmuted: false,
  isYtScriptLoaded: false,
  ytVerifyTimer: null,
  bridgeAudio: null,
  bridgeBlobUrl: null,
  usingBridgeAudio: false,
  bridgeBlobTried: false,
  bridgeLookupTried: false,
  preResolveStarted: false,
  resolvedBridgeUrl: readCachedPreviewUrl()
};

const ytReadyWaiters = [];

function notifyYtApiReady() {
  audioState.isYtScriptLoaded = true;
  while (ytReadyWaiters.length > 0) {
    const fn = ytReadyWaiters.shift();
    try { fn(); } catch (e) {}
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

  // En WebViews restringidos (Instagram, Facebook, TikTok) usamos HTML5 <audio> directo sin iframe cruzado
  if (isRestrictedInAppWebView()) {
    return;
  }

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
  return sharedMusicMuted;
}

export function registerSharedMuteButton(btnId) {
  if (!btnId) return;
  audioState.muteBtnIds.add(btnId);
  syncAllMuteButtonsUI();
}

export function syncAllMuteButtonsUI() {
  const iconHtml = sharedMusicMuted
    ? '<i class="fa-solid fa-volume-xmark" aria-hidden="true"></i>'
    : '<i class="fa-solid fa-volume-high" aria-hidden="true"></i>';
  const label = sharedMusicMuted ? 'Activar música' : 'Silenciar música';

  audioState.muteBtnIds.forEach((id) => {
    const btn = document.getElementById(id);
    if (!btn) return;
    btn.classList.toggle('is-muted', sharedMusicMuted);
    btn.setAttribute('aria-label', label);
    btn.setAttribute('aria-pressed', sharedMusicMuted ? 'true' : 'false');
    btn.title = label;
    btn.innerHTML = iconHtml;
  });
}

function sendYtPostMessage(funcName, args) {
  const iframe = document.getElementById('blutu-shared-yt-iframe');
  if (!iframe || !iframe.contentWindow) return;
  try {
    iframe.contentWindow.postMessage(
      JSON.stringify({ event: 'command', func: funcName, args: args || [] }),
      '*'
    );
  } catch (e) {}
}

function stopAndCleanBridgeAudio() {
  audioState.usingBridgeAudio = false;
  if (audioState.bridgeAudio) {
    try {
      audioState.bridgeAudio.pause();
      audioState.bridgeAudio.removeAttribute('src');
      audioState.bridgeAudio.load();
      if (audioState.bridgeAudio.parentNode) {
        audioState.bridgeAudio.parentNode.removeChild(audioState.bridgeAudio);
      }
    } catch (e) {}
    audioState.bridgeAudio = null;
  }
  const strayEl = typeof document !== 'undefined' ? document.getElementById('blutu-shared-direct-audio') : null;
  if (strayEl) {
    try {
      strayEl.pause();
      strayEl.removeAttribute('src');
      strayEl.load();
      strayEl.remove();
    } catch (e) {}
  }
  if (typeof window !== 'undefined' && window.__blutuPrimedGestureAudio) {
    try {
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

function attachBridgeAudioRecovery(audioEl) {
  if (!audioEl || audioEl._blutuRecoveryBound) return;
  audioEl._blutuRecoveryBound = true;

  audioEl.addEventListener('error', () => {
    if (!audioState.isActive || !audioState.usingBridgeAudio || audioState.isYtPlayingUnmuted) return;

    // Primero actualizar URL fresca desde iTunes API por si el hash de CDN rotó
    if (!audioState.bridgeLookupTried) {
      triggerItunesBridgeLookup();
      return;
    }

    if (!audioState.bridgeBlobTried) {
      audioState.bridgeBlobTried = true;
      fetch(audioState.resolvedBridgeUrl || GAME_DIRECT_PREVIEW_URL, { mode: 'cors', credentials: 'omit' })
        .then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(new Error('HTTP ' + r.status))))
        .then((buf) => {
          if (!audioState.isActive || !audioState.usingBridgeAudio || !audioState.bridgeAudio || audioState.isYtPlayingUnmuted) return;
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

function triggerItunesBridgeLookup() {
  if (audioState.bridgeLookupTried || !audioState.isActive || audioState.isYtPlayingUnmuted) return;
  audioState.bridgeLookupTried = true;
  resolveFreshItunesPreviewUrl()
    .then((freshUrl) => {
      if (!freshUrl || !audioState.isActive || !audioState.usingBridgeAudio || !audioState.bridgeAudio || audioState.isYtPlayingUnmuted) return;
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
    attachBridgeAudioRecovery(pre);
    audioState.bridgeAudio = pre;

    if (playImmediately) {
      audioState.usingBridgeAudio = true;
      pre.muted = sharedMusicMuted;
      if (!sharedMusicMuted && pre.paused) {
        try {
          const p = pre.play();
          if (p && typeof p.catch === 'function') p.catch(() => {});
        } catch (e) {}
      }
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
    if (playImmediately) {
      audioState.usingBridgeAudio = true;
      existing.muted = sharedMusicMuted;
      if (!sharedMusicMuted && existing.paused) {
        try {
          const p = existing.play();
          if (p && typeof p.catch === 'function') p.catch(() => {});
        } catch (e) {}
      }
    }
    return existing;
  }

  try {
    const audioEl = document.createElement('audio');
    audioEl.id = 'blutu-shared-direct-audio';
    audioEl.preload = 'auto';
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
    attachBridgeAudioRecovery(audioEl);
    audioState.bridgeAudio = audioEl;

    if (playImmediately) {
      audioState.usingBridgeAudio = true;
      audioEl.muted = sharedMusicMuted;
      if (!sharedMusicMuted) {
        const p = audioEl.play();
        if (p && typeof p.catch === 'function') p.catch(() => {});
      }
    } else {
      // Desbloquear el elemento dentro del gesto del usuario para navegadores estándar por si YouTube tarda o se bloquea
      audioEl.muted = true;
      const p = audioEl.play();
      if (p && typeof p.then === 'function') {
        p.then(() => {
          if (audioState.bridgeAudio === audioEl && !audioState.usingBridgeAudio) {
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

function activateTemporaryBridgeAudio() {
  if (!audioState.isActive || audioState.isYtPlayingUnmuted) return;
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

function tryPromoteToFullYouTubeOnGesture() {
  if (!audioState.isActive || sharedMusicMuted || isRestrictedInAppWebView()) return false;
  if (audioState.ytPlayer && audioState.isYtReady) {
    try {
      const syncTime = (audioState.usingBridgeAudio && audioState.bridgeAudio && audioState.bridgeAudio.currentTime > 0.4)
        ? Math.min(28, audioState.bridgeAudio.currentTime)
        : -1;

      if (typeof audioState.ytPlayer.unMute === 'function') {
        audioState.ytPlayer.unMute();
      }
      if (typeof audioState.ytPlayer.setVolume === 'function') {
        audioState.ytPlayer.setVolume(88);
      }
      const st = typeof audioState.ytPlayer.getPlayerState === 'function' ? audioState.ytPlayer.getPlayerState() : -1;
      if (syncTime > 0 && st !== 1) {
        try { audioState.ytPlayer.seekTo(syncTime, true); } catch (e) {}
      }
      if (st !== 1 && typeof audioState.ytPlayer.playVideo === 'function') {
        audioState.ytPlayer.playVideo();
      }
      return st === 1;
    } catch (e) {}
  } else if (document.getElementById('blutu-shared-yt-iframe')) {
    sendYtPostMessage('unMute');
    sendYtPostMessage('setVolume', [88]);
    sendYtPostMessage('playVideo');
  }
  return false;
}

function bindFullSongYouTubePlayer() {
  if (!audioState.isActive || isRestrictedInAppWebView()) return;
  const iframeEl = document.getElementById('blutu-shared-yt-iframe');
  if (!iframeEl || !(window.YT && window.YT.Player)) return;
  if (audioState.ytPlayer) return;

  try {
    audioState.ytPlayer = new window.YT.Player('blutu-shared-yt-iframe', {
      events: {
        onReady: (ev) => {
          if (!audioState.isActive) return;
          audioState.isYtReady = true;
          try {
            if (sharedMusicMuted) {
              ev.target.mute();
            } else {
              ev.target.unMute();
              ev.target.setVolume(88);
            }
            ev.target.playVideo();
          } catch (err) {}
        },
        onStateChange: (ev) => {
          if (!audioState.isActive) return;
          if (ev.data === 1) {
            let currentlyMuted = false;
            try {
              if (!sharedMusicMuted && typeof ev.target.isMuted === 'function' && ev.target.isMuted()) {
                ev.target.unMute();
                ev.target.setVolume(88);
              }
              currentlyMuted = typeof ev.target.isMuted === 'function' ? ev.target.isMuted() : false;
            } catch (e) {}

            if (!sharedMusicMuted && !currentlyMuted) {
              audioState.isYtPlayingUnmuted = true;
              if (audioState.ytVerifyTimer) {
                clearTimeout(audioState.ytVerifyTimer);
                audioState.ytVerifyTimer = null;
              }
              if (audioState.usingBridgeAudio || audioState.bridgeAudio) {
                stopAndCleanBridgeAudio();
              }
            }
          } else if (ev.data === 0) {
            try {
              ev.target.seekTo(0, true);
              ev.target.playVideo();
            } catch (err) {}
          }
        },
        onError: () => {
          if (!audioState.isActive) return;
          activateTemporaryBridgeAudio();
        }
      }
    });
  } catch (e) {
    activateTemporaryBridgeAudio();
  }
}

export function startSharedGameMusic(hostEl, muteBtnId) {
  // Conservar cualquier elemento de audio ya desbloqueado por el clic sincrónico inicial
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

  audioState.isActive = true;
  audioState.hostEl = hostEl || document.body;
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
  preloadSharedGameMusicApi();

  // En el navegador interno de Instagram / Facebook / TikTok (WKWebView y Android WebView),
  // reproducir <audio> HTML5 directamente DENTRO del toque del usuario sin iframes cruzados que bloqueen AVAudioSession
  if (isRestrictedInAppWebView()) {
    ensureBridgeAudioMountedSynchronously(true);
    return;
  }

  const hadPrimedPlaying = Boolean(preservedPrimed && !preservedPrimed.paused && !sharedMusicMuted);
  ensureBridgeAudioMountedSynchronously(hadPrimedPlaying);

  // En navegadores estándar, montar el reproductor de YouTube oculto para la canción completa
  const ytContainer = document.createElement('div');
  ytContainer.id = 'blutu-shared-yt-container';
  ytContainer.setAttribute('aria-hidden', 'true');
  ytContainer.style.cssText = 'position:fixed;bottom:0;left:0;width:200px;height:200px;opacity:0.0001;pointer-events:none;z-index:-1;overflow:hidden;clip-path:inset(100%);';

  const originVal = (window.location && window.location.origin && window.location.origin !== 'null' && window.location.protocol.startsWith('http'))
    ? encodeURIComponent(window.location.origin)
    : '';
  const originParam = originVal ? `&origin=${originVal}&widget_referrer=${originVal}` : '';
  const muteParam = sharedMusicMuted ? '1' : '0';

  const iframe = document.createElement('iframe');
  iframe.id = 'blutu-shared-yt-iframe';
  iframe.width = '200';
  iframe.height = '200';
  iframe.allow = 'autoplay; encrypted-media; picture-in-picture';
  iframe.setAttribute('playsinline', '1');
  iframe.setAttribute('webkit-playsinline', '1');
  iframe.setAttribute('tabindex', '-1');
  iframe.setAttribute('aria-hidden', 'true');
  iframe.style.cssText = 'border:0;width:200px;height:200px;pointer-events:none;opacity:0.0001;';
  iframe.src = `https://www.youtube.com/embed/${GAME_SONG_VIDEO_ID}?autoplay=1&mute=${muteParam}&controls=0&disablekb=1&fs=0&loop=1&playlist=${GAME_SONG_VIDEO_ID}&modestbranding=1&playsinline=1&rel=0&enablejsapi=1${originParam}`;

  ytContainer.appendChild(iframe);
  (audioState.hostEl || document.body).appendChild(ytContainer);
  audioState.ytContainerEl = ytContainer;

  if (window.YT && window.YT.Player) {
    bindFullSongYouTubePlayer();
  } else {
    ytReadyWaiters.push(() => {
      if (audioState.isActive) bindFullSongYouTubePlayer();
    });
  }

  audioState.ytVerifyTimer = setTimeout(() => {
    audioState.ytVerifyTimer = null;
    if (!audioState.isActive || sharedMusicMuted || audioState.isYtPlayingUnmuted) return;
    let ytOk = false;
    if (audioState.ytPlayer && audioState.isYtReady) {
      try {
        const st = typeof audioState.ytPlayer.getPlayerState === 'function' ? audioState.ytPlayer.getPlayerState() : -1;
        const muted = typeof audioState.ytPlayer.isMuted === 'function' ? audioState.ytPlayer.isMuted() : true;
        ytOk = (st === 1 && !muted);
      } catch (e) {
        ytOk = false;
      }
    }
    if (!ytOk) {
      activateTemporaryBridgeAudio();
    }
  }, 1200);
}

export function notifySharedGameUserGesture() {
  if (!audioState.isActive || sharedMusicMuted) return;
  unlockSharedWebViewAudioSession();

  if (isRestrictedInAppWebView()) {
    const a = ensureBridgeAudioMountedSynchronously(true);
    if (a && a.paused) {
      try {
        a.muted = false;
        a.volume = 0.88;
        const p = a.play();
        if (p && typeof p.catch === 'function') p.catch(() => {});
      } catch (e) {}
    }
    return;
  }

  if (audioState.isYtPlayingUnmuted && audioState.ytPlayer && audioState.isYtReady) {
    try {
      const st = typeof audioState.ytPlayer.getPlayerState === 'function' ? audioState.ytPlayer.getPlayerState() : 1;
      if (st !== 1 && st !== 3) {
        audioState.ytPlayer.unMute();
        audioState.ytPlayer.setVolume(88);
        audioState.ytPlayer.playVideo();
      }
    } catch (e) {}
    return;
  }

  // Intentar promover a canción completa de YouTube sin bloquear nunca el respaldo <audio>
  if (!audioState.isYtPlayingUnmuted && audioState.ytPlayer && audioState.isYtReady) {
    tryPromoteToFullYouTubeOnGesture();
  }

  if (audioState.usingBridgeAudio && audioState.bridgeAudio && audioState.bridgeAudio.paused) {
    try {
      audioState.bridgeAudio.muted = false;
      audioState.bridgeAudio.volume = 0.88;
      const p = audioState.bridgeAudio.play();
      if (p && typeof p.catch === 'function') p.catch(() => {});
    } catch (e) {}
  }
}

export function pauseSharedGameMusicTemporary() {
  if (!audioState.isActive) return;
  if (audioState.bridgeAudio) {
    try { audioState.bridgeAudio.pause(); } catch (e) {}
  }
  if (audioState.ytPlayer && audioState.isYtReady) {
    try { audioState.ytPlayer.pauseVideo(); } catch (e) {}
  } else if (!isRestrictedInAppWebView()) {
    sendYtPostMessage('pauseVideo');
  }
}

export function toggleSharedGameMute() {
  unlockSharedWebViewAudioSession();
  sharedMusicMuted = !sharedMusicMuted;
  if (typeof window !== 'undefined') {
    window.__blutuSharedMusicMuted = sharedMusicMuted;
  }
  syncAllMuteButtonsUI();

  if (!audioState.isActive) return sharedMusicMuted;

  if (sharedMusicMuted) {
    if (audioState.bridgeAudio) {
      try {
        audioState.bridgeAudio.muted = true;
        audioState.bridgeAudio.pause();
      } catch (e) {}
    }
    if (audioState.ytPlayer && audioState.isYtReady) {
      try { audioState.ytPlayer.mute(); } catch (e) {}
    } else if (!isRestrictedInAppWebView()) {
      sendYtPostMessage('mute');
    }
  } else {
    if (isRestrictedInAppWebView()) {
      ensureBridgeAudioMountedSynchronously(true);
      return sharedMusicMuted;
    }

    const promoted = tryPromoteToFullYouTubeOnGesture();
    if (!promoted && !audioState.isYtPlayingUnmuted) {
      activateTemporaryBridgeAudio();
    }
  }
  return sharedMusicMuted;
}

export function stopAndDestroySharedGameMusic(keepMuteBtns = false) {
  audioState.isActive = false;
  audioState.isYtReady = false;
  audioState.isYtPlayingUnmuted = false;
  audioState.hostEl = null;

  if (!keepMuteBtns) {
    audioState.muteBtnIds.clear();
  }

  if (audioState.ytVerifyTimer) {
    clearTimeout(audioState.ytVerifyTimer);
    audioState.ytVerifyTimer = null;
  }

  stopAndCleanBridgeAudio();

  if (audioState.ytPlayer) {
    try {
      if (typeof audioState.ytPlayer.stopVideo === 'function') audioState.ytPlayer.stopVideo();
      if (typeof audioState.ytPlayer.destroy === 'function') audioState.ytPlayer.destroy();
    } catch (e) {}
    audioState.ytPlayer = null;
  } else {
    sendYtPostMessage('stopVideo');
  }

  const ytCont = audioState.ytContainerEl || (typeof document !== 'undefined' ? document.getElementById('blutu-shared-yt-container') : null);
  if (ytCont) {
    try {
      const ifr = ytCont.querySelector('iframe');
      if (ifr) ifr.src = 'about:blank';
      ytCont.remove();
    } catch (e) {}
  }
  audioState.ytContainerEl = null;
}

if (typeof window !== 'undefined') {
  window.__blutuSharedMusicMuted = sharedMusicMuted;
  window.toggleSharedGameMute = toggleSharedGameMute;
  document.addEventListener('visibilitychange', () => {
    if (!audioState.isActive) return;
    if (document.hidden) {
      pauseSharedGameMusicTemporary();
    } else if (!sharedMusicMuted) {
      if (audioState.isYtPlayingUnmuted && audioState.ytPlayer && audioState.isYtReady) {
        try { audioState.ytPlayer.playVideo(); } catch (e) {}
      } else if (audioState.usingBridgeAudio && audioState.bridgeAudio) {
        try {
          const p = audioState.bridgeAudio.play();
          if (p && typeof p.catch === 'function') p.catch(() => {});
        } catch (e) {}
      }
    }
  });
}
