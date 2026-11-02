/* Blutu — Motor Compartido de Música de Partida ("Escaleras" - 3Ea5h9Xqe3E)
   100% Bajo Demanda: Cero carga al abrir la página y destrucción completa al salir de partida */

const GAME_SONG_VIDEO_ID = '3Ea5h9Xqe3E';
const GAME_ITUNES_TRACK_ID = '1831489965';
const GAME_DIRECT_PREVIEW_URL = 'https://audio-ssl.itunes.apple.com/itunes-assets/AudioPreview221/v4/fa/33/6c/fa336cf9-c36c-2046-32e7-810e3bd90c87/mzaf_17863700894514780044.plus.aac.p.m4a';

let sharedAudioCtx = null;
let sharedMusicMuted = false;

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
  resolvedBridgeUrl: GAME_DIRECT_PREVIEW_URL
};

const ytReadyWaiters = [];

function notifyYtApiReady() {
  audioState.isYtScriptLoaded = true;
  while (ytReadyWaiters.length > 0) {
    const fn = ytReadyWaiters.shift();
    try { fn(); } catch (e) {}
  }
}

export function preloadSharedGameMusicApi() {
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
          audioState.bridgeAudio.volume = 0.85;
          audioState.bridgeAudio.muted = sharedMusicMuted;
          if (!sharedMusicMuted) {
            const p = audioState.bridgeAudio.play();
            if (p && typeof p.catch === 'function') p.catch(() => {});
          }
        })
        .catch(() => triggerItunesBridgeLookup());
      return;
    }

    triggerItunesBridgeLookup();
  });
}

function triggerItunesBridgeLookup() {
  if (audioState.bridgeLookupTried || !audioState.isActive || audioState.isYtPlayingUnmuted) return;
  audioState.bridgeLookupTried = true;
  fetch('https://itunes.apple.com/lookup?id=' + GAME_ITUNES_TRACK_ID + '&entity=song', { mode: 'cors', credentials: 'omit' })
    .then((r) => (r.ok ? r.json() : null))
    .then((data) => {
      if (!audioState.isActive || !audioState.usingBridgeAudio || !audioState.bridgeAudio || audioState.isYtPlayingUnmuted) return;
      const match = data && Array.isArray(data.results) ? data.results.find((it) => it && it.previewUrl) : null;
      if (match && match.previewUrl) {
        audioState.resolvedBridgeUrl = match.previewUrl;
        audioState.bridgeAudio.src = match.previewUrl;
        audioState.bridgeAudio.loop = true;
        audioState.bridgeAudio.volume = 0.85;
        audioState.bridgeAudio.muted = sharedMusicMuted;
        if (!sharedMusicMuted) {
          const p = audioState.bridgeAudio.play();
          if (p && typeof p.catch === 'function') p.catch(() => {});
        }
      }
    })
    .catch(() => {});
}

function primeBridgeAudioSynchronously() {
  if (window.__blutuPrimedGestureAudio) {
    const pre = window.__blutuPrimedGestureAudio;
    window.__blutuPrimedGestureAudio = null;
    audioState.bridgeAudio = pre;
    audioState.bridgeAudio.src = audioState.resolvedBridgeUrl || GAME_DIRECT_PREVIEW_URL;
    audioState.bridgeAudio.loop = true;
    audioState.bridgeAudio.volume = 0.85;
    attachBridgeAudioRecovery(audioState.bridgeAudio);
    return;
  }

  try {
    const audioEl = new Audio();
    audioEl.preload = 'none';
    audioEl.loop = true;
    audioEl.playsInline = true;
    audioEl.setAttribute('playsinline', '');
    audioEl.setAttribute('webkit-playsinline', '');
    audioEl.volume = 0.85;
    audioEl.muted = true;
    attachBridgeAudioRecovery(audioEl);
    audioState.bridgeAudio = audioEl;
  } catch (e) {}
}

function activateTemporaryBridgeAudio() {
  if (!audioState.isActive || audioState.isYtPlayingUnmuted) return;
  audioState.usingBridgeAudio = true;

  if (!audioState.bridgeAudio) {
    primeBridgeAudioSynchronously();
  }
  const a = audioState.bridgeAudio;
  if (!a) return;

  if (!a.src) {
    a.src = audioState.resolvedBridgeUrl || GAME_DIRECT_PREVIEW_URL;
  }
  a.loop = true;
  a.volume = 0.85;
  a.muted = sharedMusicMuted;
  if (!sharedMusicMuted) {
    try {
      const p = a.play();
      if (p && typeof p.catch === 'function') p.catch(() => {});
    } catch (e) {}
  }
}

function tryPromoteToFullYouTubeOnGesture() {
  if (!audioState.isActive || sharedMusicMuted) return false;
  if (audioState.ytPlayer && audioState.isYtReady) {
    try {
      const syncTime = (audioState.usingBridgeAudio && audioState.bridgeAudio && audioState.bridgeAudio.currentTime > 0.4)
        ? Math.min(28, audioState.bridgeAudio.currentTime)
        : -1;

      if (typeof audioState.ytPlayer.unMute === 'function') {
        audioState.ytPlayer.unMute();
      }
      if (typeof audioState.ytPlayer.setVolume === 'function') {
        audioState.ytPlayer.setVolume(85);
      }
      const st = typeof audioState.ytPlayer.getPlayerState === 'function' ? audioState.ytPlayer.getPlayerState() : -1;
      if (syncTime > 0 && st !== 1) {
        try { audioState.ytPlayer.seekTo(syncTime, true); } catch (e) {}
      }
      if (st !== 1 && typeof audioState.ytPlayer.playVideo === 'function') {
        audioState.ytPlayer.playVideo();
      }
      return true;
    } catch (e) {}
  } else if (document.getElementById('blutu-shared-yt-iframe')) {
    sendYtPostMessage('unMute');
    sendYtPostMessage('setVolume', [85]);
    sendYtPostMessage('playVideo');
  }
  return false;
}

function bindFullSongYouTubePlayer() {
  if (!audioState.isActive) return;
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
              ev.target.setVolume(85);
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
                ev.target.setVolume(85);
              }
              currentlyMuted = typeof ev.target.isMuted === 'function' ? ev.target.isMuted() : false;
            } catch (e) {}

            if (!sharedMusicMuted && !currentlyMuted) {
              audioState.isYtPlayingUnmuted = true;
              if (audioState.ytVerifyTimer) {
                clearTimeout(audioState.ytVerifyTimer);
                audioState.ytVerifyTimer = null;
              }
              if (audioState.usingBridgeAudio) {
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
  stopAndDestroySharedGameMusic(true);

  audioState.isActive = true;
  audioState.hostEl = hostEl || document.body;
  audioState.isYtReady = false;
  audioState.isYtPlayingUnmuted = false;
  audioState.usingBridgeAudio = false;
  audioState.bridgeBlobTried = false;
  audioState.bridgeLookupTried = false;

  if (muteBtnId) {
    audioState.muteBtnIds.add(muteBtnId);
  }
  syncAllMuteButtonsUI();

  unlockSharedWebViewAudioSession();
  primeBridgeAudioSynchronously();
  preloadSharedGameMusicApi();

  // Crear iframe de la canción completa SINCRÓNICAMENTE dentro del gesto del usuario (clave para Instagram / WKWebView / Android WebView)
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

  // Si un WebView restringido bloquea el arranque automático de YouTube, sonar de inmediato con el puente de audio
  // mientras YouTube queda listo para tomar el relevo con la canción COMPLETA al primer toque de juego (salto / carta / casilla)
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
  }, 1500);
}

export function notifySharedGameUserGesture() {
  if (!audioState.isActive || sharedMusicMuted) return;
  unlockSharedWebViewAudioSession();

  // En cada toque de juego (saltar, voltear carta, pulsar número), promover a la canción completa de YouTube si ya cargó
  if (!audioState.isYtPlayingUnmuted && audioState.ytPlayer && audioState.isYtReady) {
    tryPromoteToFullYouTubeOnGesture();
    return;
  }

  if (audioState.isYtPlayingUnmuted && audioState.ytPlayer && audioState.isYtReady) {
    try {
      const st = typeof audioState.ytPlayer.getPlayerState === 'function' ? audioState.ytPlayer.getPlayerState() : 1;
      if (st !== 1 && st !== 3) {
        audioState.ytPlayer.unMute();
        audioState.ytPlayer.setVolume(85);
        audioState.ytPlayer.playVideo();
      }
    } catch (e) {}
    return;
  }

  if (audioState.usingBridgeAudio && audioState.bridgeAudio && audioState.bridgeAudio.paused) {
    try {
      audioState.bridgeAudio.muted = false;
      audioState.bridgeAudio.volume = 0.85;
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
  } else {
    sendYtPostMessage('pauseVideo');
  }
}

export function toggleSharedGameMute() {
  unlockSharedWebViewAudioSession();
  sharedMusicMuted = !sharedMusicMuted;
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
    } else {
      sendYtPostMessage('mute');
    }
  } else {
    // El clic en desmutear es un gesto directo del usuario: priorizar la canción completa de YouTube
    const promoted = tryPromoteToFullYouTubeOnGesture();
    if (!promoted && audioState.usingBridgeAudio && audioState.bridgeAudio) {
      try {
        audioState.bridgeAudio.muted = false;
        audioState.bridgeAudio.volume = 0.85;
        const p = audioState.bridgeAudio.play();
        if (p && typeof p.catch === 'function') p.catch(() => {});
      } catch (e) {}
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

  const ytCont = audioState.ytContainerEl || document.getElementById('blutu-shared-yt-container');
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
