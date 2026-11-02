/* Blutu — Easter Egg Dino + Música Escaleras (100% Carga Bajo Demanda) */
    const getLogoBtn = () => document.getElementById('logoBtn');
    let logoBtn = getLogoBtn();
    const GAME_YOUTUBE_MUSIC_URL = 'https://music.youtube.com/watch?v=3Ea5h9Xqe3E';
    const GAME_YOUTUBE_VIDEO_ID = '3Ea5h9Xqe3E';
    const GAME_ITUNES_TRACK_ID = '6773560493';
    const GAME_DIRECT_AUDIO_URL = 'https://audio-ssl.itunes.apple.com/itunes-assets/AudioPreview221/v4/ec/fb/45/ecfb4526-93d2-03e7-c901-a297111f1458/mzaf_14659704648749163645.plus.aac.p.m4a';
    const GAME_SILENT_WAV_URI = 'data:audio/wav;base64,UklGRigAAABXQVZFZm10IBIAAAABAAEARKwAAIhYAQACABAAAABkYXRhAgAAAAEA';
    let blutuEgg = null;
    let blutuWebAudioUnlockCtx = null;

    function isRestrictedInAppWebView() {
      const ua = (navigator && navigator.userAgent) ? navigator.userAgent : '';
      if (!ua) return false;
      if (/Instagram|Barcelona|FBAN|FBAV|FB_IAB|FBIOS|FBSS|Musical_ly|BytedanceWebview|TikTok|Snapchat|Line\/|LinkedInApp|WhatsApp|Twitter/i.test(ua)) {
        return true;
      }
      if (/;\s*wv\)/i.test(ua)) {
        return true;
      }
      if (/(iPhone|iPod|iPad).*AppleWebKit(?!.*Safari)/i.test(ua)) {
        return true;
      }
      return false;
    }

    function unlockBlutuWebViewAudioSession() {
      try {
        if (navigator && navigator.audioSession && navigator.audioSession.type !== 'playback') {
          navigator.audioSession.type = 'playback';
        }
      } catch (e) {}
      try {
        const AudioCtx = window.AudioContext || window.webkitAudioContext;
        if (!AudioCtx) return;
        if (!blutuWebAudioUnlockCtx) {
          blutuWebAudioUnlockCtx = new AudioCtx();
        }
        if (blutuWebAudioUnlockCtx.state === 'suspended') {
          blutuWebAudioUnlockCtx.resume().catch(() => {});
        }
        if (!blutuWebAudioUnlockCtx._blutuPrimed) {
          const buf = blutuWebAudioUnlockCtx.createBuffer(1, 1, 22050);
          const src = blutuWebAudioUnlockCtx.createBufferSource();
          src.buffer = buf;
          src.connect(blutuWebAudioUnlockCtx.destination);
          if (typeof src.start === 'function') src.start(0);
          blutuWebAudioUnlockCtx._blutuPrimed = true;
        }
      } catch (e) {}
    }

    function sendYouTubeCommandFallback(funcName, argsArr) {
      const iframeEl = document.getElementById('yt-player');
      if (iframeEl && iframeEl.contentWindow) {
        try {
          iframeEl.contentWindow.postMessage(JSON.stringify({
            event: 'listening',
            id: 'yt-player',
            channel: 'widget'
          }), '*');
          iframeEl.contentWindow.postMessage(JSON.stringify({
            event: 'command',
            func: funcName,
            args: argsArr || []
          }), '*');
        } catch (e) {}
      }
    }

    function activateBlutuDirectAudioFallback() {
      if (!blutuEgg || !blutuEgg.isOpen) return;
      blutuEgg.usingDirectAudio = true;

      if (blutuEgg.ytFallbackTimer) {
        clearTimeout(blutuEgg.ytFallbackTimer);
        blutuEgg.ytFallbackTimer = null;
      }

      if (blutuEgg.ytPlayer) {
        try {
          if (typeof blutuEgg.ytPlayer.mute === 'function') blutuEgg.ytPlayer.mute();
          if (typeof blutuEgg.ytPlayer.pauseVideo === 'function') blutuEgg.ytPlayer.pauseVideo();
          if (typeof blutuEgg.ytPlayer.destroy === 'function') blutuEgg.ytPlayer.destroy();
        } catch (e) {}
        blutuEgg.ytPlayer = null;
        blutuEgg.isYtReady = false;
      }
      const ytContainer = document.getElementById('yt-player-container');
      if (ytContainer) ytContainer.remove();

      let audioEl = blutuEgg.directAudio;
      if (!audioEl) {
        audioEl = window.__blutuPrimedGestureAudio || new Audio();
        window.__blutuPrimedGestureAudio = null;
        audioEl.id = 'blutu-direct-audio';
        audioEl.loop = true;
        audioEl.preload = 'auto';
        audioEl.playsInline = true;
        audioEl.setAttribute('playsinline', '');
        audioEl.setAttribute('webkit-playsinline', '');
        blutuEgg.directAudio = audioEl;
      }

      attachBlutuDirectAudioRecovery(audioEl);

      const targetSrc = blutuEgg.resolvedDirectAudioUrl || GAME_DIRECT_AUDIO_URL;
      if (!audioEl.src || audioEl.src === GAME_SILENT_WAV_URI || audioEl.src.indexOf('data:audio/') === 0) {
        audioEl.src = targetSrc;
      }
      audioEl.loop = true;
      audioEl.volume = 0.85;
      audioEl.muted = !!blutuEgg.isMuted;

      if (!blutuEgg.isMuted) {
        const playPromise = audioEl.play();
        if (playPromise && typeof playPromise.catch === 'function') {
          playPromise.catch(() => {});
        }
      }
    }

    function attachBlutuDirectAudioRecovery(audioEl) {
      if (!audioEl || audioEl._blutuRecoveryBound) return;
      audioEl._blutuRecoveryBound = true;

      audioEl.addEventListener('error', () => {
        if (!blutuEgg || !blutuEgg.isOpen || !blutuEgg.usingDirectAudio) return;

        if (!blutuEgg.blobFallbackTried) {
          blutuEgg.blobFallbackTried = true;
          const srcToFetch = blutuEgg.resolvedDirectAudioUrl || GAME_DIRECT_AUDIO_URL;
          fetch(srcToFetch, { mode: 'cors', credentials: 'omit' })
            .then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(new Error('HTTP ' + r.status))))
            .then((buf) => {
              if (!blutuEgg || !blutuEgg.isOpen || !blutuEgg.directAudio) return;
              if (blutuEgg.directAudioBlobUrl) {
                try { URL.revokeObjectURL(blutuEgg.directAudioBlobUrl); } catch (e) {}
              }
              const blob = new Blob([buf], { type: 'audio/mp4' });
              const blobUrl = URL.createObjectURL(blob);
              blutuEgg.directAudioBlobUrl = blobUrl;
              blutuEgg.directAudio.src = blobUrl;
              blutuEgg.directAudio.loop = true;
              blutuEgg.directAudio.volume = 0.85;
              blutuEgg.directAudio.muted = !!blutuEgg.isMuted;
              if (!blutuEgg.isMuted) {
                const p = blutuEgg.directAudio.play();
                if (p && typeof p.catch === 'function') p.catch(() => {});
              }
            })
            .catch(() => {
              triggerItunesLookupAudioRecovery();
            });
          return;
        }

        triggerItunesLookupAudioRecovery();
      });
    }

    function triggerItunesLookupAudioRecovery() {
      if (!blutuEgg || blutuEgg.lookupFallbackTried) return;
      blutuEgg.lookupFallbackTried = true;
      fetch('https://itunes.apple.com/lookup?id=' + GAME_ITUNES_TRACK_ID + '&entity=song', { mode: 'cors', credentials: 'omit' })
        .then((r) => (r.ok ? r.json() : null))
        .then((data) => {
          if (!blutuEgg || !blutuEgg.isOpen || !blutuEgg.directAudio || !data || !Array.isArray(data.results)) return;
          const match = data.results.find((item) => item && item.previewUrl);
          if (match && match.previewUrl) {
            blutuEgg.resolvedDirectAudioUrl = match.previewUrl;
            blutuEgg.directAudio.src = match.previewUrl;
            blutuEgg.directAudio.loop = true;
            blutuEgg.directAudio.volume = 0.85;
            blutuEgg.directAudio.muted = !!blutuEgg.isMuted;
            if (!blutuEgg.isMuted) {
              const p = blutuEgg.directAudio.play();
              if (p && typeof p.catch === 'function') p.catch(() => {});
            }
          }
        })
        .catch(() => {});
    }

    function pauseBlutuGameMusicTemporary() {
      if (!blutuEgg || !blutuEgg.isOpen) return;
      if (blutuEgg.directAudio) {
        try { blutuEgg.directAudio.pause(); } catch (e) {}
      }
      if (blutuEgg.ytPlayer && blutuEgg.isYtReady) {
        try {
          if (typeof blutuEgg.ytPlayer.pauseVideo === 'function') {
            blutuEgg.ytPlayer.pauseVideo();
          }
        } catch (e) {}
      }
    }

    function ensureBlutuGameMusicPlaying() {
      if (!blutuEgg || !blutuEgg.isOpen || blutuEgg.isMuted) return;
      unlockBlutuWebViewAudioSession();

      if (blutuEgg.usingDirectAudio && blutuEgg.directAudio) {
        try {
          blutuEgg.directAudio.muted = false;
          blutuEgg.directAudio.volume = 0.85;
          if (blutuEgg.directAudio.paused) {
            const p = blutuEgg.directAudio.play();
            if (p && typeof p.catch === 'function') p.catch(() => {});
          }
        } catch (e) {}
        return;
      }

      if (blutuEgg.ytPlayer && blutuEgg.isYtReady) {
        try {
          const isPlayerMuted = typeof blutuEgg.ytPlayer.isMuted === 'function' ? blutuEgg.ytPlayer.isMuted() : true;
          if (isPlayerMuted && typeof blutuEgg.ytPlayer.unMute === 'function') {
            blutuEgg.ytPlayer.unMute();
          }
          if (typeof blutuEgg.ytPlayer.setVolume === 'function') {
            blutuEgg.ytPlayer.setVolume(85);
          }
          const st = typeof blutuEgg.ytPlayer.getPlayerState === 'function' ? blutuEgg.ytPlayer.getPlayerState() : -1;
          if (st !== 1 && st !== 3) {
            blutuEgg.ytPlayer.playVideo();
          }
        } catch (e) {}
      } else if (document.getElementById('yt-player')) {
        sendYouTubeCommandFallback('unMute');
        sendYouTubeCommandFallback('setVolume', [85]);
        sendYouTubeCommandFallback('playVideo');
      }
    }

    export function initBlutuDinoEasterEgg() {
      logoBtn = getLogoBtn();
      if (blutuEgg && blutuEgg.isOpen) return;
      if (!logoBtn) return;

      const headerEl = logoBtn.closest('header');
      if (!headerEl) return;

      try {
        if (window.getSelection) {
          const sel = window.getSelection();
          if (sel && sel.removeAllRanges) sel.removeAllRanges();
        }
      } catch (e) {}
      document.body.classList.add('blutu-egg-active');

      // Medir posición exacta del logo antes de ocultarlo para que caiga rodando desde ahí
      const logoRect = logoBtn.getBoundingClientRect();

      if (!blutuEgg) {
        blutuEgg = {
          isOpen: false,
          isMuted: false,
          usingDirectAudio: false,
          directAudio: null,
          directAudioBlobUrl: null,
          resolvedDirectAudioUrl: GAME_DIRECT_AUDIO_URL,
          blobFallbackTried: false,
          lookupFallbackTried: false,
          ytFallbackTimer: null,
          ytPlayer: null,
          isYtReady: false,
          isYtScriptLoaded: false,
          stageEl: null,
          canvas: null,
          ctx: null,
          muteBtn: null,
          closeBtn: null,
          retryBtn: null,
          scoreEl: null,
          gameOverEl: null,
          gameOverTitleEl: null,
          rafId: null,
          resizeHandler: null,
          keyDownHandler: null,
          keyUpHandler: null,
          visibilityHandler: null,
          intersectionObserver: null,
          isInViewport: true,
          dpr: 1,
          width: 600,
          height: 186,
          groundY: 162,
          state: 'IDLE', // 'IDLE' | 'INTRO_ROLL' | 'PLAYING' | 'GAME_OVER' | 'EXIT_RETURN'
          lastTime: 0,
          origHeaderY: 48,
          origHeaderSize: 78,
          introElapsed: 0,
          introDuration: 0.78,
          introStartX: 300,
          introStartY: 54,
          introStartSize: 78,
          playerRestX: 56,
          playerX: 56,
          playerSize: 40,
          playerY: 0,
          playerVy: 0,
          playerAngle: 0,
          isFastFalling: false,
          jumpBuffer: 0,
          runTime: 0,
          distance: 0,
          displayedScore: -1,
          difficultyTier: 0,
          lastSpawnedCoinTier: 0,
          coinsCollected: 0,
          roadCoins: [],
          milestoneActive: false,
          milestoneIsThousand: false,
          milestoneCoinCount: 1,
          milestoneLabel: '+200',
          milestoneOriginX: 300,
          milestoneOriginY: 90,
          milestoneElapsed: 0,
          milestoneDuration: 1.85,
          milestoneBats: [],
          gameOverElapsed: 0,
          returnDuration: 0.86,
          returnStartX: 56,
          returnStartY: 140,
          returnStartAngle: 0,
          returnCurrX: 300,
          returnCurrY: 44,
          returnCurrSize: 62,
          returnCurrAngle: 0,
          exitElapsed: 0,
          exitDuration: 0.56,
          exitStartX: 56,
          exitStartY: 140,
          exitStartSize: 40,
          exitStartAngle: 0,
          hasActiveBouncingCoins: false,
          bouncingCoins: [],
          speed: 250,
          spawnTimer: 0,
          obstacleCount: 0,
          sameTypeStreak: 0,
          lastObstacleType: '',
          lastBatArchetype: '',
          obstacles: [],
          dustPool: [],
          stars: [],
          sprites: null
        };

        for (let i = 0; i < 8; i++) {
          blutuEgg.dustPool.push({ active: false, x: 0, y: 0, vx: 0, vy: 0, life: 0, maxLife: 0.35, r: 1.5 });
        }
        for (let i = 0; i < 12; i++) {
          blutuEgg.stars.push({
            u: (i * 0.087 + 0.04) % 1,
            v: 0.12 + ((i * 37) % 55) / 100,
            size: (i % 3 === 0) ? 1.6 : 1.1,
            isCross: (i % 5 === 1)
          });
        }
      }

      // Construir sprites en memoria solo una vez al abrir el juego (cero peticiones extra de red)
      if (!blutuEgg.sprites) {
        blutuEgg.sprites = buildBlutuDinoSprites(logoBtn);
      }

      // Crear DOM del juego bajo demanda
      const stageEl = document.createElement('div');
      stageEl.id = 'blutuDinoStage';
      stageEl.className = 'blutu-dino-stage';

      const canvas = document.createElement('canvas');
      canvas.className = 'blutu-dino-canvas';

      const hudEl = document.createElement('div');
      hudEl.className = 'blutu-dino-hud';

      const controlsEl = document.createElement('div');
      controlsEl.className = 'blutu-dino-controls';

      const muteBtn = document.createElement('button');
      muteBtn.type = 'button';
      muteBtn.id = 'blutuDinoMuteBtn';
      muteBtn.className = 'blutu-dino-btn' + (blutuEgg.isMuted ? ' is-muted' : '');
      muteBtn.setAttribute('aria-label', blutuEgg.isMuted ? 'Activar música' : 'Silenciar música');
      muteBtn.setAttribute('aria-pressed', blutuEgg.isMuted ? 'true' : 'false');
      muteBtn.title = blutuEgg.isMuted ? 'Activar música' : 'Silenciar música';
      muteBtn.innerHTML = blutuEgg.isMuted
        ? '<i class="fa-solid fa-volume-xmark"></i>'
        : '<i class="fa-solid fa-volume-high"></i>';

      const closeBtn = document.createElement('button');
      closeBtn.type = 'button';
      closeBtn.id = 'blutuDinoCloseBtn';
      closeBtn.className = 'blutu-dino-btn';
      closeBtn.setAttribute('aria-label', 'Salir del juego');
      closeBtn.title = 'Cerrar';
      closeBtn.innerHTML = '<i class="fa-solid fa-xmark"></i>';

      controlsEl.appendChild(muteBtn);
      controlsEl.appendChild(closeBtn);

      const scoreEl = document.createElement('div');
      scoreEl.className = 'blutu-dino-score';
      scoreEl.textContent = '00000';

      hudEl.appendChild(controlsEl);
      hudEl.appendChild(scoreEl);

      const gameOverEl = document.createElement('div');
      gameOverEl.className = 'blutu-dino-gameover';
      const gameOverTitleEl = document.createElement('div');
      gameOverTitleEl.className = 'blutu-dino-gameover-title';
      gameOverTitleEl.textContent = 'Ganaste 0 pesos';
      const retryBtn = document.createElement('button');
      retryBtn.type = 'button';
      retryBtn.id = 'blutuDinoRetryBtn';
      retryBtn.className = 'blutu-dino-retry-btn';
      retryBtn.setAttribute('aria-label', 'Reintentar');
      retryBtn.title = 'Reintentar';
      retryBtn.innerHTML = '<i class="fa-solid fa-rotate-right" aria-hidden="true"></i>';
      gameOverEl.appendChild(gameOverTitleEl);
      gameOverEl.appendChild(retryBtn);

      stageEl.appendChild(canvas);
      stageEl.appendChild(hudEl);
      stageEl.appendChild(gameOverEl);

      logoBtn.style.display = 'none';
      headerEl.appendChild(stageEl);

      blutuEgg.isOpen = true;
      blutuEgg.stageEl = stageEl;
      blutuEgg.canvas = canvas;
      blutuEgg.ctx = canvas.getContext('2d', { alpha: true });
      blutuEgg.muteBtn = muteBtn;
      blutuEgg.closeBtn = closeBtn;
      blutuEgg.retryBtn = retryBtn;
      blutuEgg.scoreEl = scoreEl;
      blutuEgg.gameOverEl = gameOverEl;
      blutuEgg.gameOverTitleEl = gameOverTitleEl;

      // Iniciar y reproducir la canción del Easter Egg ("Escaleras" - 3Ea5h9Xqe3E) dentro del gesto sincrónico del usuario
      startBlutuGameMusic();

      // Eventos de botones HUD (aislados del toque de salto)
      const stopJumpPropagation = (ev) => {
        ev.stopPropagation();
      };
      muteBtn.addEventListener('pointerdown', stopJumpPropagation);
      muteBtn.addEventListener('touchstart', stopJumpPropagation, { passive: true });
      muteBtn.addEventListener('touchend', stopJumpPropagation, { passive: true });
      muteBtn.addEventListener('click', (ev) => {
        ev.preventDefault();
        ev.stopPropagation();
        toggleBlutuGameMute();
      });

      closeBtn.addEventListener('pointerdown', stopJumpPropagation);
      closeBtn.addEventListener('touchstart', stopJumpPropagation, { passive: true });
      closeBtn.addEventListener('touchend', stopJumpPropagation, { passive: true });
      closeBtn.addEventListener('click', (ev) => {
        ev.preventDefault();
        ev.stopPropagation();
        closeBlutuDinoWithAnimation();
      });

      retryBtn.addEventListener('pointerdown', (ev) => {
        ev.stopPropagation();
        if (ev.cancelable) ev.preventDefault();
        triggerBlutuPlayerAction(true);
      });
      retryBtn.addEventListener('touchend', (ev) => {
        ev.stopPropagation();
        ensureBlutuGameMusicPlaying();
      }, { passive: true });
      retryBtn.addEventListener('click', (ev) => {
        ev.preventDefault();
        ev.stopPropagation();
        ensureBlutuGameMusicPlaying();
        triggerBlutuPlayerAction(true);
      });

      // Evitar cualquier selección azul o resaltado táctil en móvil/escritorio al oprimir la pantalla
      stageEl.addEventListener('selectstart', (ev) => {
        if (ev.cancelable) ev.preventDefault();
      });
      stageEl.addEventListener('dragstart', (ev) => {
        if (ev.cancelable) ev.preventDefault();
      });
      stageEl.addEventListener('contextmenu', (ev) => {
        if (ev.cancelable) ev.preventDefault();
      });

      const isHudControlTarget = (target) => {
        return !!(target && (target.closest('#blutuDinoMuteBtn') || target.closest('#blutuDinoCloseBtn') || target.closest('#blutuDinoRetryBtn')));
      };

      // Entrada táctil / click en el escenario para saltar al instante y desbloquear audio en touchend/pointerup/click (requerido por WKWebView / Instagram)
      const handleStageAction = (ev) => {
        if (isHudControlTarget(ev.target)) return;
        if (ev.cancelable) ev.preventDefault();
        ensureBlutuGameMusicPlaying();
        triggerBlutuPlayerAction(false);
      };
      const handleStageGestureUnlock = (ev) => {
        if (isHudControlTarget(ev.target)) return;
        ensureBlutuGameMusicPlaying();
      };
      if (window.PointerEvent) {
        stageEl.addEventListener('pointerdown', handleStageAction);
        stageEl.addEventListener('pointerup', handleStageGestureUnlock);
        stageEl.addEventListener('touchstart', (ev) => {
          if (isHudControlTarget(ev.target)) return;
          if (ev.cancelable) ev.preventDefault();
        }, { passive: false });
        stageEl.addEventListener('touchend', handleStageGestureUnlock, { passive: true });
        stageEl.addEventListener('click', handleStageGestureUnlock);
      } else {
        stageEl.addEventListener('touchstart', handleStageAction, { passive: false });
        stageEl.addEventListener('touchend', handleStageGestureUnlock, { passive: true });
        stageEl.addEventListener('mousedown', handleStageAction);
        stageEl.addEventListener('mouseup', handleStageGestureUnlock);
        stageEl.addEventListener('click', handleStageGestureUnlock);
      }

      // Dimensionar canvas y mapear posición original exacta del logo en el encabezado
      syncBlutuCanvasSize();
      const stageRect = stageEl.getBoundingClientRect();
      const mappedCenterX = (logoRect.width > 0)
        ? (logoRect.left + logoRect.width * 0.5 - stageRect.left)
        : (blutuEgg.width * 0.5);
      const mappedCenterY = (logoRect.height > 0)
        ? (logoRect.top + logoRect.height * 0.5 - stageRect.top)
        : 48;

      blutuEgg.origHeaderY = Math.max(24, Math.min(blutuEgg.groundY - 46, mappedCenterY));
      blutuEgg.origHeaderSize = Math.max(blutuEgg.playerSize + 14, Math.min(88, logoRect.width * 0.80 || 78));
      blutuEgg.introStartX = Math.max(blutuEgg.playerRestX + 60, Math.min(blutuEgg.width - 40, mappedCenterX));
      blutuEgg.introStartY = blutuEgg.origHeaderY;
      blutuEgg.introStartSize = blutuEgg.origHeaderSize;

      // Listeners globales limpios (solo mientras el juego está abierto)
      blutuEgg.resizeHandler = () => {
        if (!blutuEgg || !blutuEgg.isOpen) return;
        syncBlutuCanvasSize();
        if (blutuEgg.state === 'GAME_OVER') {
          renderBlutuDinoFrame();
        }
      };
      window.addEventListener('resize', blutuEgg.resizeHandler, { passive: true });

      blutuEgg.keyDownHandler = (ev) => {
        if (!blutuEgg || !blutuEgg.isOpen || !blutuEgg.isInViewport) return;
        const tgt = ev.target;
        if (tgt && (tgt.tagName === 'INPUT' || tgt.tagName === 'TEXTAREA' || tgt.tagName === 'SELECT' || tgt.isContentEditable)) {
          return;
        }
        const blogModal = document.getElementById('blogModal');
        const lightbox = document.getElementById('lightbox');
        if ((blogModal && blogModal.style.display === 'flex') || (lightbox && lightbox.classList.contains('active'))) {
          return;
        }
        if (ev.code === 'Space' || ev.code === 'ArrowUp' || ev.code === 'KeyW') {
          ev.preventDefault();
          if (!ev.repeat) {
            ensureBlutuGameMusicPlaying();
            triggerBlutuPlayerAction(false);
          }
        } else if (ev.code === 'ArrowDown' || ev.code === 'KeyS') {
          if (blutuEgg.state === 'PLAYING') {
            ev.preventDefault();
            blutuEgg.isFastFalling = true;
          }
        }
      };

      blutuEgg.keyUpHandler = (ev) => {
        if (!blutuEgg) return;
        if (ev.code === 'ArrowDown' || ev.code === 'KeyS') {
          blutuEgg.isFastFalling = false;
        }
      };

      blutuEgg.visibilityHandler = () => {
        if (!blutuEgg || !blutuEgg.isOpen) return;
        if (document.hidden) {
          stopBlutuLoop();
        } else if (
          blutuEgg.isInViewport &&
          (blutuEgg.state === 'INTRO_ROLL' ||
            blutuEgg.state === 'PLAYING' ||
            blutuEgg.state === 'EXIT_RETURN' ||
            (blutuEgg.state === 'GAME_OVER' && (blutuEgg.hasActiveBouncingCoins || blutuEgg.gameOverElapsed < blutuEgg.returnDuration)))
        ) {
          startBlutuLoop();
        }
      };

      window.addEventListener('keydown', blutuEgg.keyDownHandler);
      window.addEventListener('keyup', blutuEgg.keyUpHandler);
      document.addEventListener('visibilitychange', blutuEgg.visibilityHandler);

      if ('IntersectionObserver' in window) {
        blutuEgg.intersectionObserver = new IntersectionObserver((entries) => {
          if (!blutuEgg || !blutuEgg.isOpen) return;
          const entry = entries[0];
          blutuEgg.isInViewport = !!(entry && entry.isIntersecting);
          if (!blutuEgg.isInViewport) {
            stopBlutuLoop();
          } else if (
            !document.hidden &&
            (blutuEgg.state === 'INTRO_ROLL' ||
              blutuEgg.state === 'PLAYING' ||
              blutuEgg.state === 'EXIT_RETURN' ||
              (blutuEgg.state === 'GAME_OVER' && (blutuEgg.hasActiveBouncingCoins || blutuEgg.gameOverElapsed < blutuEgg.returnDuration)))
          ) {
            startBlutuLoop();
          }
        }, { threshold: 0.05 });
        blutuEgg.intersectionObserver.observe(stageEl);
      }

      // Arrancar con la animación de caída rodando hacia la izquierda
      resetBlutuRunState(true);
      startBlutuLoop();
    }

    function startBlutuGameMusic() {
      if (!blutuEgg) return;
      unlockBlutuWebViewAudioSession();

      blutuEgg.blobFallbackTried = false;
      blutuEgg.lookupFallbackTried = false;
      if (blutuEgg.ytFallbackTimer) {
        clearTimeout(blutuEgg.ytFallbackTimer);
        blutuEgg.ytFallbackTimer = null;
      }

      // En el navegador integrado de Instagram / WebViews restringidos: reproducir audio HTML5 nativo directamente en el gesto sincrónico del toque
      if (isRestrictedInAppWebView()) {
        activateBlutuDirectAudioFallback();
        return;
      }

      // En navegadores estándar: desbloquear instancia <audio> de respaldo con WAV silencioso inline (0 peticiones de red) por si YouTube devuelve error 152 o bloquea autoplay
      blutuEgg.usingDirectAudio = false;
      if (!blutuEgg.directAudio) {
        const backupAudio = window.__blutuPrimedGestureAudio || new Audio();
        window.__blutuPrimedGestureAudio = null;
        backupAudio.id = 'blutu-direct-audio';
        backupAudio.preload = 'none';
        backupAudio.loop = true;
        backupAudio.playsInline = true;
        backupAudio.setAttribute('playsinline', '');
        backupAudio.setAttribute('webkit-playsinline', '');
        blutuEgg.directAudio = backupAudio;
      }
      try {
        blutuEgg.directAudio.src = GAME_SILENT_WAV_URI;
        blutuEgg.directAudio.muted = true;
        const unlockPromise = blutuEgg.directAudio.play();
        if (unlockPromise && typeof unlockPromise.then === 'function') {
          unlockPromise.then(() => {
            if (blutuEgg && blutuEgg.directAudio && !blutuEgg.usingDirectAudio) {
              blutuEgg.directAudio.pause();
            }
          }).catch(() => {});
        } else {
          blutuEgg.directAudio.pause();
        }
      } catch (e) {}

      let ytContainer = document.getElementById('yt-player-container');
      const hostParent = (blutuEgg && blutuEgg.stageEl) ? blutuEgg.stageEl : document.body;
      if (!ytContainer) {
        ytContainer = document.createElement('div');
        ytContainer.id = 'yt-player-container';
        ytContainer.setAttribute('data-music-url', GAME_YOUTUBE_MUSIC_URL);
        ytContainer.setAttribute('aria-hidden', 'true');
        ytContainer.style.cssText = 'position:absolute;left:0;top:0;width:200px;height:200px;overflow:hidden;opacity:0.0001;filter:brightness(0);z-index:0;pointer-events:none;';
        hostParent.insertBefore(ytContainer, hostParent.firstChild);
      } else {
        ytContainer.style.cssText = 'position:absolute;left:0;top:0;width:200px;height:200px;overflow:hidden;opacity:0.0001;filter:brightness(0);z-index:0;pointer-events:none;';
        if (ytContainer.parentNode !== hostParent) {
          hostParent.insertBefore(ytContainer, hostParent.firstChild);
        }
      }

      let ytSlot = document.getElementById('yt-player');
      if (blutuEgg.ytPlayer && blutuEgg.isYtReady && ytSlot) {
        try {
          if (blutuEgg.isMuted) {
            blutuEgg.ytPlayer.mute();
          } else {
            blutuEgg.ytPlayer.unMute();
            blutuEgg.ytPlayer.setVolume(85);
          }
          blutuEgg.ytPlayer.playVideo();
        } catch (e) {}
      } else {
        if (!ytSlot) {
          ytSlot = document.createElement('div');
          ytSlot.id = 'yt-player';
          ytContainer.appendChild(ytSlot);
        }
        if (typeof YT !== 'undefined' && YT.Player) {
          bindBlutuYouTubePlayer();
        } else if (!blutuEgg.isYtScriptLoaded) {
          blutuEgg.isYtScriptLoaded = true;
          const tag = document.createElement('script');
          tag.src = 'https://www.youtube.com/iframe_api';
          tag.async = true;
          tag.onerror = () => {
            activateBlutuDirectAudioFallback();
          };
          document.head.appendChild(tag);
        }
      }

      // Guardián automático: si YouTube no logra reproducir en 2.5s (ej. error 152-18 sin sesión o bloqueo de iframe en móvil), activar audio nativo desbloqueado
      blutuEgg.ytFallbackTimer = setTimeout(() => {
        if (!blutuEgg || !blutuEgg.isOpen || blutuEgg.usingDirectAudio) return;
        let isPlayingOk = false;
        if (blutuEgg.ytPlayer && blutuEgg.isYtReady && typeof blutuEgg.ytPlayer.getPlayerState === 'function') {
          try {
            const st = blutuEgg.ytPlayer.getPlayerState();
            const isPlayerMuted = typeof blutuEgg.ytPlayer.isMuted === 'function' ? blutuEgg.ytPlayer.isMuted() : false;
            if (st === 1 && (blutuEgg.isMuted || !isPlayerMuted)) {
              isPlayingOk = true;
            }
          } catch (e) {}
        }
        if (!isPlayingOk) {
          activateBlutuDirectAudioFallback();
        }
      }, 2500);
    }

    function bindBlutuYouTubePlayer() {
      if (!blutuEgg || blutuEgg.ytPlayer || blutuEgg.usingDirectAudio) return;
      if (typeof YT === 'undefined' || !YT.Player || !document.getElementById('yt-player')) return;
      try {
        const validOrigin = (window.location && window.location.origin && window.location.origin !== 'null' && /^https?:\/\//i.test(window.location.origin))
          ? window.location.origin
          : undefined;
        const playerVars = {
          autoplay: 1,
          playsinline: 1,
          controls: 0,
          disablekb: 1,
          fs: 0,
          rel: 0,
          loop: 1,
          playlist: GAME_YOUTUBE_VIDEO_ID,
          mute: blutuEgg.isMuted ? 1 : 0,
          widget_referrer: (window.location && window.location.href) ? window.location.href : 'https://blutu.org/'
        };
        if (validOrigin) {
          playerVars.origin = validOrigin;
        }

        blutuEgg.ytPlayer = new YT.Player('yt-player', {
          width: '200',
          height: '200',
          videoId: GAME_YOUTUBE_VIDEO_ID,
          playerVars: playerVars,
          events: {
            onReady: (ev) => {
              if (!blutuEgg || blutuEgg.usingDirectAudio) return;
              blutuEgg.isYtReady = true;
              try {
                const iframeEl = typeof ev.target.getIframe === 'function' ? ev.target.getIframe() : document.getElementById('yt-player');
                if (iframeEl) {
                  iframeEl.setAttribute('allow', 'autoplay; encrypted-media; picture-in-picture');
                  iframeEl.setAttribute('referrerpolicy', 'strict-origin-when-cross-origin');
                  iframeEl.setAttribute('tabindex', '-1');
                  iframeEl.setAttribute('aria-hidden', 'true');
                  iframeEl.style.opacity = '0.0001';
                  iframeEl.style.filter = 'brightness(0)';
                  iframeEl.style.pointerEvents = 'none';
                }
                if (blutuEgg.isMuted) {
                  ev.target.mute();
                } else {
                  ev.target.unMute();
                  ev.target.setVolume(85);
                }
                if (blutuEgg.isOpen) {
                  ev.target.playVideo();
                } else {
                  ev.target.pauseVideo();
                }
              } catch (err) {}
            },
            onStateChange: (ev) => {
              if (!blutuEgg || !blutuEgg.isOpen || blutuEgg.usingDirectAudio) return;
              if (ev.data === 1) {
                if (!blutuEgg.isMuted) {
                  try {
                    if (typeof ev.target.isMuted === 'function' && ev.target.isMuted()) {
                      ev.target.unMute();
                      ev.target.setVolume(85);
                    }
                  } catch (e) {}
                }
                if (blutuEgg.ytFallbackTimer) {
                  const stillMuted = (!blutuEgg.isMuted && typeof ev.target.isMuted === 'function') ? ev.target.isMuted() : false;
                  if (!stillMuted) {
                    clearTimeout(blutuEgg.ytFallbackTimer);
                    blutuEgg.ytFallbackTimer = null;
                  }
                }
              } else if (typeof YT !== 'undefined' && YT.PlayerState && ev.data === YT.PlayerState.ENDED) {
                try {
                  ev.target.seekTo(0);
                  ev.target.playVideo();
                } catch (err) {}
              }
            },
            onError: () => {
              activateBlutuDirectAudioFallback();
            }
          }
        });
      } catch (e) {
        activateBlutuDirectAudioFallback();
      }
    }

    window.onYouTubeIframeAPIReady = function() {
      bindBlutuYouTubePlayer();
    };

    function toggleBlutuGameMute() {
      if (!blutuEgg) return;
      unlockBlutuWebViewAudioSession();
      blutuEgg.isMuted = !blutuEgg.isMuted;

      if (blutuEgg.muteBtn) {
        blutuEgg.muteBtn.classList.toggle('is-muted', blutuEgg.isMuted);
        blutuEgg.muteBtn.setAttribute('aria-label', blutuEgg.isMuted ? 'Activar música' : 'Silenciar música');
        blutuEgg.muteBtn.setAttribute('aria-pressed', blutuEgg.isMuted ? 'true' : 'false');
        blutuEgg.muteBtn.title = blutuEgg.isMuted ? 'Activar música' : 'Silenciar música';
        blutuEgg.muteBtn.innerHTML = blutuEgg.isMuted
          ? '<i class="fa-solid fa-volume-xmark"></i>'
          : '<i class="fa-solid fa-volume-high"></i>';
      }

      if (blutuEgg.usingDirectAudio && blutuEgg.directAudio) {
        try {
          blutuEgg.directAudio.muted = blutuEgg.isMuted;
          if (blutuEgg.isMuted) {
            blutuEgg.directAudio.pause();
          } else {
            blutuEgg.directAudio.volume = 0.85;
            if (blutuEgg.isOpen) {
              const p = blutuEgg.directAudio.play();
              if (p && typeof p.catch === 'function') p.catch(() => {});
            }
          }
        } catch (e) {}
        return;
      }

      if (blutuEgg.ytPlayer && blutuEgg.isYtReady) {
        try {
          if (blutuEgg.isMuted) {
            blutuEgg.ytPlayer.mute();
          } else {
            blutuEgg.ytPlayer.unMute();
            blutuEgg.ytPlayer.setVolume(85);
            if (blutuEgg.isOpen && blutuEgg.ytPlayer.getPlayerState && blutuEgg.ytPlayer.getPlayerState() !== 1) {
              blutuEgg.ytPlayer.playVideo();
            }
          }
        } catch (e) {}
      } else {
        sendYouTubeCommandFallback(blutuEgg.isMuted ? 'mute' : 'unMute');
        if (!blutuEgg.isMuted && blutuEgg.isOpen) {
          sendYouTubeCommandFallback('setVolume', [85]);
          sendYouTubeCommandFallback('playVideo');
        }
      }
    }

    function stopBlutuLoop() {
      if (blutuEgg && blutuEgg.rafId !== null) {
        cancelAnimationFrame(blutuEgg.rafId);
        blutuEgg.rafId = null;
      }
    }

    function startBlutuLoop() {
      if (!blutuEgg || !blutuEgg.isOpen) return;
      stopBlutuLoop();
      blutuEgg.lastTime = performance.now();
      blutuEgg.rafId = requestAnimationFrame(stepBlutuDinoLoop);
    }

    export function destroyBlutuDinoEasterEgg() {
      if (!blutuEgg) return;
      stopBlutuLoop();
      blutuEgg.isOpen = false;
      blutuEgg.state = 'IDLE';

      if (blutuEgg.resizeHandler) {
        window.removeEventListener('resize', blutuEgg.resizeHandler);
        blutuEgg.resizeHandler = null;
      }
      if (blutuEgg.keyDownHandler) {
        window.removeEventListener('keydown', blutuEgg.keyDownHandler);
        blutuEgg.keyDownHandler = null;
      }
      if (blutuEgg.keyUpHandler) {
        window.removeEventListener('keyup', blutuEgg.keyUpHandler);
        blutuEgg.keyUpHandler = null;
      }
      if (blutuEgg.visibilityHandler) {
        document.removeEventListener('visibilitychange', blutuEgg.visibilityHandler);
        blutuEgg.visibilityHandler = null;
      }
      if (blutuEgg.intersectionObserver) {
        blutuEgg.intersectionObserver.disconnect();
        blutuEgg.intersectionObserver = null;
      }

      if (blutuEgg.ytFallbackTimer) {
        clearTimeout(blutuEgg.ytFallbackTimer);
        blutuEgg.ytFallbackTimer = null;
      }
      if (blutuEgg.directAudio) {
        try {
          blutuEgg.directAudio.pause();
          blutuEgg.directAudio.removeAttribute('src');
          blutuEgg.directAudio.load();
        } catch (e) {}
        blutuEgg.directAudio = null;
      }
      if (blutuEgg.directAudioBlobUrl) {
        try { URL.revokeObjectURL(blutuEgg.directAudioBlobUrl); } catch (e) {}
        blutuEgg.directAudioBlobUrl = null;
      }
      blutuEgg.usingDirectAudio = false;

      if (blutuEgg.ytPlayer) {
        try {
          if (typeof blutuEgg.ytPlayer.destroy === 'function') {
            blutuEgg.ytPlayer.destroy();
          }
        } catch (e) {}
        blutuEgg.ytPlayer = null;
        blutuEgg.isYtReady = false;
      }
      const ytContainer = document.getElementById('yt-player-container');
      if (ytContainer) ytContainer.remove();

      if (blutuEgg.stageEl) {
        blutuEgg.stageEl.remove();
        blutuEgg.stageEl = null;
      }
      blutuEgg.canvas = null;
      blutuEgg.ctx = null;
      blutuEgg.muteBtn = null;
      blutuEgg.closeBtn = null;
      blutuEgg.retryBtn = null;
      blutuEgg.scoreEl = null;
      blutuEgg.gameOverEl = null;
      blutuEgg.gameOverTitleEl = null;
      blutuEgg.roadCoins.length = 0;
      blutuEgg.bouncingCoins.length = 0;
      blutuEgg.milestoneBats.length = 0;
      blutuEgg.hasActiveBouncingCoins = false;
      document.body.classList.remove('blutu-egg-active');

      if (logoBtn) {
        logoBtn.style.removeProperty('display');
      }
    }
    window.destroyBlutuDinoEasterEgg = destroyBlutuDinoEasterEgg;

    function getBlutuOriginalPerch() {
      const isCompact = blutuEgg.width < 520;
      return {
        x: blutuEgg.width * 0.5,
        y: isCompact ? 34 : 42,
        size: isCompact ? 48 : 60
      };
    }

    function computeBlutuGameOverLogoPose() {
      const perch = getBlutuOriginalPerch();
      const groundRestY = blutuEgg.groundY - blutuEgg.playerSize * 0.5;
      const u = Math.min(1, blutuEgg.gameOverElapsed / blutuEgg.returnDuration);

      let x = perch.x;
      let y = perch.y;
      let size = perch.size;
      let angle = 0;

      if (u <= 0.56) {
        // Fase 1: cae al suelo si estaba en el aire y rueda de regreso hacia el centro
        const t1 = u / 0.56;
        const e1 = 1 - Math.pow(1 - t1, 1.85);
        x = blutuEgg.returnStartX + (perch.x - blutuEgg.returnStartX) * (0.82 * e1);
        const dropEase = Math.min(1, t1 / 0.35);
        y = blutuEgg.returnStartY + (groundRestY - blutuEgg.returnStartY) * (dropEase * dropEase);
        size = blutuEgg.playerSize + (perch.size - blutuEgg.playerSize) * (0.28 * e1);
        angle = blutuEgg.returnStartAngle + (Math.PI * 3.1 - blutuEgg.returnStartAngle) * e1;
      } else {
        // Fase 2: se eleva suavemente desde el centro hasta su posición original superior quedando derecho
        const t2 = (u - 0.56) / 0.44;
        const e2 = 1 - Math.pow(1 - t2, 2.35);
        const midX = blutuEgg.returnStartX + (perch.x - blutuEgg.returnStartX) * 0.82;
        const midSize = blutuEgg.playerSize + (perch.size - blutuEgg.playerSize) * 0.28;
        x = midX + (perch.x - midX) * e2;
        y = groundRestY + (perch.y - groundRestY) * e2;
        size = midSize + (perch.size - midSize) * e2;
        angle = Math.PI * 3.1 + (Math.PI * 4 - Math.PI * 3.1) * e2;
        if (u >= 0.999) {
          angle = 0;
        }
      }

      blutuEgg.returnCurrX = x;
      blutuEgg.returnCurrY = y;
      blutuEgg.returnCurrSize = size;
      blutuEgg.returnCurrAngle = angle;
      return { x: x, y: y, size: size, angle: angle };
    }

    function closeBlutuDinoWithAnimation() {
      if (!blutuEgg || !blutuEgg.isOpen) return;
      if (blutuEgg.state === 'EXIT_RETURN') return;

      let startX = blutuEgg.playerRestX;
      let startY = blutuEgg.playerY;
      let startSize = blutuEgg.playerSize;
      let startAngle = blutuEgg.playerAngle || 0;

      if (blutuEgg.state === 'INTRO_ROLL') {
        const u = Math.min(1, blutuEgg.introElapsed / blutuEgg.introDuration);
        const horizRatio = computeBlutuIntroHorizontalRatio(u);
        const sizeEase = Math.min(1, u / 0.55);
        startX = blutuEgg.introStartX + (blutuEgg.playerRestX - blutuEgg.introStartX) * horizRatio;
        startSize = blutuEgg.introStartSize + (blutuEgg.playerSize - blutuEgg.introStartSize) * (1 - Math.pow(1 - sizeEase, 2));
      } else if (blutuEgg.state === 'GAME_OVER') {
        const pose = computeBlutuGameOverLogoPose();
        startX = pose.x;
        startY = pose.y;
        startSize = pose.size;
        startAngle = pose.angle;
      }

      const wasAtCenter = (blutuEgg.state === 'GAME_OVER' && blutuEgg.gameOverElapsed >= blutuEgg.returnDuration * 0.85);
      blutuEgg.exitStartX = startX;
      blutuEgg.exitStartY = startY;
      blutuEgg.exitStartSize = startSize;
      blutuEgg.exitStartAngle = startAngle % (Math.PI * 2);
      blutuEgg.exitElapsed = 0;
      blutuEgg.exitDuration = wasAtCenter ? 0.34 : 0.62;
      blutuEgg.state = 'EXIT_RETURN';

      if (blutuEgg.stageEl) {
        blutuEgg.stageEl.classList.add('is-closing');
      }
      startBlutuLoop();
    }

    function syncBlutuCanvasSize() {
      if (!blutuEgg || !blutuEgg.stageEl || !blutuEgg.canvas || !blutuEgg.ctx) return;
      const rect = blutuEgg.stageEl.getBoundingClientRect();
      const cssW = Math.max(260, Math.round(rect.width || 600));
      const cssH = Math.max(140, Math.round(rect.height || 180));
      const dpr = Math.min(window.devicePixelRatio || 1, 2);

      blutuEgg.dpr = dpr;
      blutuEgg.width = cssW;
      blutuEgg.height = cssH;
      blutuEgg.groundY = cssH - 22;
      blutuEgg.playerSize = cssW < 520 ? 36 : 40;
      blutuEgg.playerRestX = cssW < 520 ? 42 : 60;
      blutuEgg.playerX = blutuEgg.playerRestX;

      if (blutuEgg.canvas.width !== Math.round(cssW * dpr) || blutuEgg.canvas.height !== Math.round(cssH * dpr)) {
        blutuEgg.canvas.width = Math.round(cssW * dpr);
        blutuEgg.canvas.height = Math.round(cssH * dpr);
      }
      blutuEgg.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      const groundRestY = blutuEgg.groundY - blutuEgg.playerSize * 0.5;
      if (blutuEgg.state !== 'INTRO_ROLL' && blutuEgg.playerY > groundRestY) {
        blutuEgg.playerY = groundRestY;
      }

      if (blutuEgg.obstacles && blutuEgg.obstacles.length > 0) {
        for (let i = 0; i < blutuEgg.obstacles.length; i++) {
          const obs = blutuEgg.obstacles[i];
          if (obs.type === 'BAT') {
            if (obs.canHitGrounded) {
              const lowFloorY = blutuEgg.groundY - obs.h - (cssW < 520 ? 5 : 7);
              obs.baseY = Math.max(14, Math.min(blutuEgg.groundY - obs.h - 3, lowFloorY));
              obs.y = Math.min(blutuEgg.groundY - obs.h - 2, obs.y);
            } else {
              const safeMaxY = blutuEgg.groundY - blutuEgg.playerSize - obs.h - 9;
              obs.baseY = Math.max(11, Math.min(safeMaxY, obs.baseY));
              obs.y = (obs.descendsFromSky && (obs.skyEmerge === undefined || obs.skyEmerge < 0.99))
                ? Math.min(safeMaxY, obs.y)
                : Math.max(8, Math.min(safeMaxY, obs.y));
            }
          }
        }
      }

      if (blutuEgg.roadCoins && blutuEgg.roadCoins.length > 0) {
        for (let i = 0; i < blutuEgg.roadCoins.length; i++) {
          const rc = blutuEgg.roadCoins[i];
          rc.baseY = blutuEgg.groundY - rc.r - (cssW < 520 ? 7 : 9);
          rc.y = Math.min(blutuEgg.groundY - rc.r - 2, rc.y);
        }
      }

      if (blutuEgg.bouncingCoins && blutuEgg.bouncingCoins.length > 0) {
        for (let i = 0; i < blutuEgg.bouncingCoins.length; i++) {
          const c = blutuEgg.bouncingCoins[i];
          c.x = Math.max(c.r + 8, Math.min(cssW - c.r - 8, c.x));
          if (c.settled || c.y > blutuEgg.groundY - c.r) {
            c.y = blutuEgg.groundY - c.r;
          }
        }
      }
    }

    function resetBlutuRunState(withIntroRoll) {
      if (!blutuEgg) return;
      const groundRestY = blutuEgg.groundY - blutuEgg.playerSize * 0.5;
      blutuEgg.obstacles.length = 0;
      blutuEgg.roadCoins.length = 0;
      blutuEgg.bouncingCoins.length = 0;
      blutuEgg.milestoneBats.length = 0;
      blutuEgg.hasActiveBouncingCoins = false;
      blutuEgg.gameOverElapsed = 0;
      for (let i = 0; i < blutuEgg.dustPool.length; i++) {
        blutuEgg.dustPool[i].active = false;
      }
      blutuEgg.playerX = blutuEgg.playerRestX;
      blutuEgg.playerVy = 0;
      blutuEgg.isFastFalling = false;
      blutuEgg.jumpBuffer = 0;
      blutuEgg.runTime = 0;
      blutuEgg.distance = 0;
      blutuEgg.displayedScore = -1;
      blutuEgg.difficultyTier = 0;
      blutuEgg.lastSpawnedCoinTier = 0;
      blutuEgg.coinsCollected = 0;
      blutuEgg.milestoneActive = false;
      blutuEgg.milestoneIsThousand = false;
      blutuEgg.milestoneCoinCount = 1;
      blutuEgg.milestoneLabel = '+200';
      blutuEgg.milestoneElapsed = 0;
      blutuEgg.obstacleCount = 0;
      blutuEgg.sameTypeStreak = 0;
      blutuEgg.lastObstacleType = '';
      blutuEgg.lastBatArchetype = '';
      blutuEgg.speed = blutuEgg.width < 520 ? 228 : 258;
      blutuEgg.spawnTimer = 0.55;

      if (blutuEgg.scoreEl) {
        blutuEgg.scoreEl.textContent = '00000';
        blutuEgg.scoreEl.classList.remove('is-milestone');
      }
      if (blutuEgg.gameOverEl) {
        blutuEgg.gameOverEl.classList.remove('is-visible');
      }

      if (withIntroRoll) {
        blutuEgg.state = 'INTRO_ROLL';
        blutuEgg.introElapsed = 0;
        blutuEgg.playerY = blutuEgg.introStartY;
        blutuEgg.playerAngle = 0;
      } else {
        blutuEgg.state = 'PLAYING';
        blutuEgg.playerY = groundRestY;
        blutuEgg.playerAngle = 0;
      }
    }

    function triggerBlutuPlayerAction(forceImmediateRestart) {
      if (!blutuEgg || !blutuEgg.isOpen) return;
      if (blutuEgg.state === 'EXIT_RETURN') return;

      if (blutuEgg.state === 'GAME_OVER') {
        if (!forceImmediateRestart && blutuEgg.gameOverElapsed < 0.28) return;
        const pose = computeBlutuGameOverLogoPose();
        blutuEgg.introStartX = pose.x;
        blutuEgg.introStartY = pose.y;
        blutuEgg.introStartSize = pose.size;
        resetBlutuRunState(true);
        startBlutuLoop();
        return;
      }

      if (blutuEgg.state === 'INTRO_ROLL') {
        if (blutuEgg.introElapsed > blutuEgg.introDuration * 0.55) {
          blutuEgg.jumpBuffer = 0.25;
        }
        return;
      }

      if (blutuEgg.state === 'PLAYING') {
        const groundRestY = blutuEgg.groundY - blutuEgg.playerSize * 0.5;
        if (blutuEgg.playerY >= groundRestY - 2.5) {
          executeBlutuJump();
        } else {
          blutuEgg.jumpBuffer = 0.14;
        }
      }
    }

    function getBlutuJumpScale() {
      const tier = blutuEgg ? (blutuEgg.difficultyTier || 0) : 0;
      return 1 + Math.min(0.32, tier * 0.065);
    }

    function executeBlutuJump() {
      if (!blutuEgg) return;
      const groundRestY = blutuEgg.groundY - blutuEgg.playerSize * 0.5;
      const jumpScale = getBlutuJumpScale();
      blutuEgg.playerY = groundRestY;
      blutuEgg.playerVy = (blutuEgg.width < 520 ? -525 : -555) * jumpScale;
      blutuEgg.isFastFalling = false;
      blutuEgg.jumpBuffer = 0;
      spawnBlutuDustBurst(blutuEgg.playerX, blutuEgg.groundY - 2, 4);
    }

    function spawnBlutuDustBurst(x, y, count) {
      if (!blutuEgg) return;
      let spawned = 0;
      for (let i = 0; i < blutuEgg.dustPool.length && spawned < count; i++) {
        const p = blutuEgg.dustPool[i];
        if (!p.active) {
          p.active = true;
          p.x = x + (Math.random() * 12 - 6);
          p.y = y - Math.random() * 3;
          p.vx = -40 - Math.random() * 65;
          p.vy = -18 - Math.random() * 38;
          p.maxLife = 0.26 + Math.random() * 0.16;
          p.life = p.maxLife;
          p.r = 1.3 + Math.random() * 1.4;
          spawned++;
        }
      }
    }

    function spawnBlutuWingMote(x, y) {
      if (!blutuEgg) return;
      for (let i = 0; i < blutuEgg.dustPool.length; i++) {
        const p = blutuEgg.dustPool[i];
        if (!p.active) {
          p.active = true;
          p.x = x + (Math.random() * 6 - 3);
          p.y = y + (Math.random() * 4 - 2);
          p.vx = -22 - Math.random() * 32;
          p.vy = 10 + Math.random() * 20;
          p.maxLife = 0.20 + Math.random() * 0.10;
          p.life = p.maxLife;
          p.r = 0.9 + Math.random() * 0.8;
          return;
        }
      }
    }

    function spawnBlutuObstacle() {
      if (!blutuEgg) return;
      blutuEgg.obstacleCount++;
      const tier = blutuEgg.difficultyTier || 0;

      // Garantizar ver lápidas abajo y murciélagos arriba desde los primeros segundos y subir intensidad por nivel
      let type = 'TOMBSTONE';
      if (blutuEgg.obstacleCount === 1) {
        type = 'TOMBSTONE';
      } else if (blutuEgg.obstacleCount === 2) {
        type = 'BAT';
      } else {
        const batChance = Math.min(0.48, 0.37 + tier * 0.03);
        type = Math.random() < batChance ? 'BAT' : 'TOMBSTONE';
        if (type === blutuEgg.lastObstacleType && blutuEgg.sameTypeStreak >= 2) {
          type = (type === 'TOMBSTONE') ? 'BAT' : 'TOMBSTONE';
        }
      }

      if (type === blutuEgg.lastObstacleType) {
        blutuEgg.sameTypeStreak++;
      } else {
        blutuEgg.lastObstacleType = type;
        blutuEgg.sameTypeStreak = 1;
      }

      const spawnX = blutuEgg.width + 36;
      const isCompact = blutuEgg.width < 520;

      if (type === 'TOMBSTONE') {
        const variantIdx = (blutuEgg.obstacleCount === 1) ? 0 : Math.floor(Math.random() * 3);
        const defs = isCompact
          ? [
              { w: 25, h: 38, variant: 0 },
              { w: 22, h: 46, variant: 1 },
              { w: 42, h: 33, variant: 2 }
            ]
          : [
              { w: 28, h: 42, variant: 0 },
              { w: 24, h: 51, variant: 1 },
              { w: 48, h: 36, variant: 2 }
            ];
        const d = defs[variantIdx];
        const risesFromGround = (tier >= 3 || blutuEgg.distance >= 600);
        const extraTension = Math.min(0.08, Math.max(0, tier - 3) * 0.02);
        const riseStartRatio = (isCompact ? 0.84 : 0.78) - extraTension;
        const riseSpanPx = isCompact ? 102 : 152;
        const minSafeRiseEndX = blutuEgg.playerRestX + (isCompact ? 126 : 182);
        const jitter = (Math.random() - 0.5) * (isCompact ? 26 : 46);
        const riseStartX = Math.max(
          minSafeRiseEndX + riseSpanPx,
          Math.min(blutuEgg.width - 26, blutuEgg.width * riseStartRatio + jitter)
        );
        const riseEndX = Math.max(minSafeRiseEndX, riseStartX - riseSpanPx);

        blutuEgg.obstacles.push({
          type: 'TOMBSTONE',
          variant: d.variant,
          x: spawnX,
          y: risesFromGround ? blutuEgg.groundY : (blutuEgg.groundY - d.h),
          baseY: blutuEgg.groundY - d.h,
          w: d.w,
          h: d.h,
          risesFromGround: risesFromGround,
          riseStartX: riseStartX,
          riseEndX: riseEndX,
          emerge: risesFromGround ? 0 : 1,
          phase: Math.random() * Math.PI * 2
        });
      } else {
        // Murciélagos con posiciones variadas y capacidad de bajar en picada a ras del suelo para exigir salto o esquiva
        const batScale = 0.90 + Math.random() * 0.20;
        const w = Math.round((isCompact ? 38 : 42) * batScale);
        const h = Math.round((isCompact ? 20 : 22) * batScale);
        const safeUpperMaxY = Math.max(16, blutuEgg.groundY - blutuEgg.playerSize - h - (isCompact ? 8 : 10));
        const lowSkimY = blutuEgg.groundY - h - (isCompact ? (4 + Math.random() * 5) : (5 + Math.random() * 7));

        // 4 arquetipos distintos nunca repetidos seguidos: picada baja, vuelo rasante, ascenso a media altura y onda alta
        let batArchetype = 'DIVE_LOW';
        if (blutuEgg.obstacleCount === 2) {
          batArchetype = 'DIVE_LOW';
        } else {
          const candidates = [
            { id: 'DIVE_LOW', weight: 0.35 },
            { id: 'LOW_PROWL', weight: 0.23 },
            { id: 'CLIMB_MID', weight: 0.22 },
            { id: 'HIGH_WAVE', weight: 0.20 }
          ].filter((c) => c.id !== blutuEgg.lastBatArchetype);
          let totalW = 0;
          for (let cIdx = 0; cIdx < candidates.length; cIdx++) totalW += candidates[cIdx].weight;
          let roll = Math.random() * totalW;
          batArchetype = candidates[candidates.length - 1].id;
          for (let cIdx = 0; cIdx < candidates.length; cIdx++) {
            roll -= candidates[cIdx].weight;
            if (roll <= 0) {
              batArchetype = candidates[cIdx].id;
              break;
            }
          }
        }
        blutuEgg.lastBatArchetype = batArchetype;

        const canHitGrounded = (batArchetype === 'DIVE_LOW' || batArchetype === 'LOW_PROWL');
        let entryY = 20;
        let baseY = 24;
        if (batArchetype === 'DIVE_LOW') {
          entryY = 12 + Math.random() * Math.max(8, (safeUpperMaxY - 12) * 0.42);
          baseY = lowSkimY;
        } else if (batArchetype === 'LOW_PROWL') {
          entryY = lowSkimY - (8 + Math.random() * 14);
          baseY = lowSkimY;
        } else if (batArchetype === 'CLIMB_MID') {
          entryY = Math.min(blutuEgg.groundY - h - 14, safeUpperMaxY + (isCompact ? 16 : 22));
          baseY = Math.max(15, safeUpperMaxY - (1 + Math.random() * 9));
        } else {
          // HIGH_WAVE
          const highBand = 11 + Math.random() * Math.max(6, (safeUpperMaxY - 14) * 0.45);
          entryY = highBand;
          baseY = highBand;
        }

        const vertSpanPx = isCompact ? 114 : 168;
        const minSafeVertEndX = blutuEgg.playerRestX + (isCompact ? 120 : 174);
        const vertJitter = (Math.random() - 0.5) * (isCompact ? 22 : 38);
        const vertStartX = Math.max(
          minSafeVertEndX + vertSpanPx,
          Math.min(blutuEgg.width - 18, blutuEgg.width * (isCompact ? 0.85 : 0.80) + vertJitter)
        );
        const vertEndX = Math.max(minSafeVertEndX, vertStartX - vertSpanPx);

        const descendsFromSky = (tier >= 5 || blutuEgg.distance >= 1000);
        const skySpanPx = isCompact ? 118 : 176;
        const minSafeSkyEndX = blutuEgg.playerRestX + (isCompact ? 136 : 196);
        const skyJitter = (Math.random() - 0.5) * (isCompact ? 24 : 42);
        const skyStartX = Math.max(
          minSafeSkyEndX + skySpanPx,
          Math.min(blutuEgg.width - 22, blutuEgg.width * (isCompact ? 0.86 : 0.81) + skyJitter)
        );
        const skyEndX = Math.max(minSafeSkyEndX, skyStartX - skySpanPx);

        blutuEgg.obstacles.push({
          type: 'BAT',
          variant: 0,
          batArchetype: batArchetype,
          canHitGrounded: canHitGrounded,
          x: spawnX,
          anchorX: spawnX,
          y: descendsFromSky ? (-h - 14) : entryY,
          entryY: entryY,
          baseY: baseY,
          vertStartX: vertStartX,
          vertEndX: vertEndX,
          w: w,
          h: h,
          descendsFromSky: descendsFromSky,
          skyStartX: skyStartX,
          skyEndX: skyEndX,
          skyEmerge: descendsFromSky ? 0 : 1,
          lateralMover: descendsFromSky,
          phase: Math.random() * Math.PI * 2,
          flapPhase: Math.random() * 8,
          flapSpeed: (14.4 + Math.random() * 3.8) * (1.06 - (batScale - 0.90) * 0.45),
          swoopFreq: descendsFromSky ? (3.5 + Math.random() * 1.4) : (3.9 + Math.random() * 2.0),
          swoopScale: batArchetype === 'HIGH_WAVE' ? 1.45 : (canHitGrounded ? 0.72 : 1.05),
          weaveFreq: descendsFromSky ? (2.85 + Math.random() * 0.85) : (2.6 + Math.random() * 1.5),
          weaveAmp: descendsFromSky ? (isCompact ? 15.5 : 22.0) : (isCompact ? 4.2 : 6.0),
          glideCycle: 0.92 + Math.random() * 0.44,
          glideDip: 0,
          isGliding: false,
          flightClock: Math.random() * 0.6,
          tilt: 0,
          blinkOffset: Math.random() * 2.8,
          chirped: false,
          chirpAge: -1
        });
      }

      // Espaciado progresivo pero equilibrado: desde 1000 puntos mantiene aire suficiente para leer el vaivén sin ser injusto
      const cappedTier = tier <= 5 ? tier : (5 + (tier - 5) * 0.35);
      const minFloor = tier >= 5 ? 0.56 : 0.50;
      const minSafeTime = Math.max(minFloor, 0.78 - cappedTier * 0.048);
      const randomWindow = Math.max(0.24, 0.46 - cappedTier * 0.038);
      blutuEgg.spawnTimer = minSafeTime + Math.random() * randomWindow;
    }

    function spawnBlutuGameOverCoins(coinsWon) {
      if (!blutuEgg) return;
      blutuEgg.bouncingCoins.length = 0;
      const count = Math.max(0, Math.min(35, coinsWon | 0));
      if (count === 0) {
        blutuEgg.hasActiveBouncingCoins = false;
        return;
      }

      const isCompact = blutuEgg.width < 520;
      const diam = isCompact ? 30 : 36;
      const r = diam * 0.5;
      const w = blutuEgg.width;
      const center = w * 0.5;
      const spreadSpan = Math.min(w * 0.62, Math.max(36, count * 28));

      for (let i = 0; i < count; i++) {
        const ratio = count === 1 ? 0 : (i / (count - 1)) - 0.5;
        const jitterX = (Math.random() - 0.5) * 22;
        const startX = Math.max(r + 12, Math.min(w - r - 12, center + ratio * spreadSpan * 0.45 + jitterX));
        const startY = 18 + (i % 4) * 7 + Math.random() * 6;
        const vxBase = count === 1
          ? ((Math.random() < 0.5 ? -1 : 1) * (55 + Math.random() * 45))
          : (ratio * 190 + (Math.random() - 0.5) * 75);
        const vyBase = -75 - (i % 3) * 32 - Math.random() * 25;
        const spinDir = (i % 2 === 0) ? 1 : -1;

        blutuEgg.bouncingCoins.push({
          x: startX,
          y: startY,
          vx: vxBase,
          vy: vyBase,
          r: r,
          diam: diam,
          restitution: 0.62 + (i % 3) * 0.035,
          theta: (i % 2 === 0 ? 0.18 : Math.PI + 0.18) + Math.random() * 0.35,
          omega: spinDir * (2.3 + (i % 4) * 0.42),
          delay: Math.min(0.42, i * 0.042),
          settled: false
        });
      }
      blutuEgg.hasActiveBouncingCoins = true;
    }

    function updateBlutuGameOverCoins(dt) {
      if (!blutuEgg) return false;
      blutuEgg.gameOverElapsed += dt;
      updateBlutuDust(dt);

      const coins = blutuEgg.bouncingCoins;
      if (!coins || coins.length === 0) {
        blutuEgg.hasActiveBouncingCoins = false;
        return false;
      }

      const gravity = 980;
      const leftWall = 10;
      const rightWall = blutuEgg.width - 10;
      let anyActive = false;

      // Tope de seguridad absoluto para evitar cualquier bucle infinito
      const forceSettle = blutuEgg.gameOverElapsed > 4.2;

      for (let i = 0; i < coins.length; i++) {
        const c = coins[i];
        if (c.settled) continue;

        if (forceSettle) {
          c.y = blutuEgg.groundY - c.r;
          c.vx = 0;
          c.vy = 0;
          c.omega = 0;
          c.theta = Math.round(c.theta / Math.PI) * Math.PI;
          c.settled = true;
          continue;
        }

        if (c.delay > 0) {
          c.delay = Math.max(0, c.delay - dt);
          anyActive = true;
          continue;
        }

        c.vy += gravity * dt;
        c.x += c.vx * dt;
        c.y += c.vy * dt;
        c.theta += c.omega * dt;

        if (c.x - c.r < leftWall) {
          c.x = leftWall + c.r;
          c.vx = Math.abs(c.vx) * 0.72;
        } else if (c.x + c.r > rightWall) {
          c.x = rightWall - c.r;
          c.vx = -Math.abs(c.vx) * 0.72;
        }

        const floorY = blutuEgg.groundY - c.r;
        if (c.y >= floorY) {
          c.y = floorY;
          if (Math.abs(c.vy) > 44) {
            if (Math.abs(c.vy) > 105) {
              spawnBlutuDustBurst(c.x, blutuEgg.groundY - 1, 1);
            }
            c.vy = -Math.abs(c.vy) * c.restitution;
            c.vx *= 0.86;
            c.omega *= 0.84;
            anyActive = true;
          } else {
            c.vy = 0;
            c.vx *= Math.pow(0.05, dt);
            const nearestFace = Math.round(c.theta / Math.PI) * Math.PI;
            const angleDiff = nearestFace - c.theta;
            c.omega = c.omega * Math.pow(0.03, dt) + angleDiff * 7.5 * dt;

            if (Math.abs(c.vx) < 2.2 && Math.abs(c.omega) < 0.08 && Math.abs(angleDiff) < 0.12) {
              c.vx = 0;
              c.omega = 0;
              c.theta = nearestFace;
              c.settled = true;
            } else {
              anyActive = true;
            }
          }
        } else {
          anyActive = true;
        }
      }

      if (!anyActive) {
        for (let i = 0; i < blutuEgg.dustPool.length; i++) {
          if (blutuEgg.dustPool[i].active) {
            anyActive = true;
            break;
          }
        }
      }

      blutuEgg.hasActiveBouncingCoins = anyActive;
      return anyActive;
    }

    function stepBlutuDinoLoop(now) {
      if (!blutuEgg || !blutuEgg.isOpen) {
        if (blutuEgg) blutuEgg.rafId = null;
        return;
      }

      const dt = Math.min(0.033, Math.max(0.001, (now - blutuEgg.lastTime) / 1000));
      blutuEgg.lastTime = now;

      if (blutuEgg.state === 'EXIT_RETURN') {
        blutuEgg.exitElapsed += dt;
        renderBlutuDinoFrame();
        if (blutuEgg.exitElapsed >= blutuEgg.exitDuration) {
          destroyBlutuDinoEasterEgg();
          return;
        }
        blutuEgg.rafId = requestAnimationFrame(stepBlutuDinoLoop);
        return;
      }

      if (blutuEgg.state === 'INTRO_ROLL') {
        updateBlutuIntroRoll(dt);
        renderBlutuDinoFrame();
        blutuEgg.rafId = requestAnimationFrame(stepBlutuDinoLoop);
        return;
      }

      if (blutuEgg.state === 'PLAYING') {
        const hitOccurred = updateBlutuPlaying(dt);
        if (hitOccurred) {
          const finalScore = Math.max(0, Math.floor(blutuEgg.distance));
          const coinsWon = blutuEgg.coinsCollected || 0;
          blutuEgg.milestoneActive = false;
          blutuEgg.milestoneBats.length = 0;
          blutuEgg.roadCoins.length = 0;
          blutuEgg.returnStartX = blutuEgg.playerX;
          blutuEgg.returnStartY = blutuEgg.playerY;
          blutuEgg.returnStartAngle = blutuEgg.playerAngle || 0;
          blutuEgg.state = 'GAME_OVER';
          blutuEgg.gameOverElapsed = 0;
          if (blutuEgg.scoreEl) {
            blutuEgg.scoreEl.textContent = String(Math.min(99999, finalScore)).padStart(5, '0');
            blutuEgg.scoreEl.classList.remove('is-milestone');
          }
          if (blutuEgg.gameOverTitleEl) {
            blutuEgg.gameOverTitleEl.textContent = 'Ganaste ' + finalScore + ' pesos';
          }
          if (blutuEgg.gameOverEl) {
            blutuEgg.gameOverEl.classList.add('is-visible');
          }
          spawnBlutuGameOverCoins(coinsWon);
          renderBlutuDinoFrame();
          blutuEgg.rafId = requestAnimationFrame(stepBlutuDinoLoop);
          return;
        }
        renderBlutuDinoFrame();
        blutuEgg.rafId = requestAnimationFrame(stepBlutuDinoLoop);
        return;
      }

      if (blutuEgg.state === 'GAME_OVER') {
        const prevElapsed = blutuEgg.gameOverElapsed;
        const stillBouncing = updateBlutuGameOverCoins(dt);
        // Pequeñas motas de polvo mientras el logo rueda de regreso por el suelo hacia el centro
        if (blutuEgg.gameOverElapsed < blutuEgg.returnDuration * 0.52 && Math.floor(prevElapsed * 14) !== Math.floor(blutuEgg.gameOverElapsed * 14)) {
          const pose = computeBlutuGameOverLogoPose();
          spawnBlutuDustBurst(pose.x - 4, blutuEgg.groundY - 2, 1);
        }
        renderBlutuDinoFrame();
        if (stillBouncing || blutuEgg.gameOverElapsed < blutuEgg.returnDuration) {
          blutuEgg.rafId = requestAnimationFrame(stepBlutuDinoLoop);
        } else {
          blutuEgg.rafId = null;
        }
        return;
      }

      blutuEgg.rafId = null;
    }

    function spawnBlutuMilestoneBats() {
      if (!blutuEgg) return;
      blutuEgg.milestoneBats.length = 0;
      const isCompact = blutuEgg.width < 520;
      // 12 murciélagos vivaces emergiendo en oleadas orgánicas desde detrás de la moneda hacia izquierda, arriba y derecha
      const angles = [-2.02, -1.12, -2.38, -0.76, -2.72, -0.42, -3.02, -0.12, 2.86, 0.26, -1.62, -1.52];
      for (let i = 0; i < angles.length; i++) {
        const ang = angles[i] + (Math.random() - 0.5) * 0.12;
        const speed = (isCompact ? 116 : 156) + (i % 4) * 22 + Math.random() * 16;
        const waveDelay = (i < 6) ? (i * 0.026) : (0.16 + (i - 6) * 0.036);
        const curveSign = Math.cos(ang) >= 0 ? -1 : 1;
        blutuEgg.milestoneBats.push({
          dx: Math.cos(ang) * 5,
          dy: Math.sin(ang) * 5,
          vx: Math.cos(ang) * speed,
          vy: Math.sin(ang) * speed,
          angle: ang,
          curve: curveSign * (0.42 + (i % 3) * 0.16),
          scale: 0.72 + (i % 4) * 0.10,
          phase: Math.random() * Math.PI * 2,
          flapPhase: Math.random() * 8,
          flapSpeed: 16.5 + (i % 3) * 2.1 + Math.random() * 1.5,
          blinkOffset: Math.random() * 2.2,
          delay: waveDelay,
          age: 0
        });
      }
    }

    function upgradeFarObstaclesForTier(tier) {
      if (!blutuEgg || tier < 3) return;
      const isCompact = blutuEgg.width < 520;
      const riseSpanPx = isCompact ? 102 : 152;
      const minSafeRiseEndX = blutuEgg.playerRestX + (isCompact ? 126 : 182);
      const skySpanPx = isCompact ? 116 : 172;
      const minSafeSkyEndX = blutuEgg.playerRestX + (isCompact ? 138 : 198);
      for (let i = 0; i < blutuEgg.obstacles.length; i++) {
        const obs = blutuEgg.obstacles[i];
        if (obs.type === 'TOMBSTONE' && !obs.risesFromGround && obs.x > blutuEgg.width * 0.72) {
          obs.risesFromGround = true;
          obs.riseStartX = Math.max(minSafeRiseEndX + riseSpanPx, Math.min(blutuEgg.width - 24, obs.x - 18));
          obs.riseEndX = Math.max(minSafeRiseEndX, obs.riseStartX - riseSpanPx);
          obs.emerge = 0;
          obs.y = blutuEgg.groundY;
        } else if (tier >= 5 && obs.type === 'BAT' && !obs.descendsFromSky) {
          const bAnchor = obs.anchorX !== undefined ? obs.anchorX : obs.x;
          if (bAnchor > blutuEgg.width * 0.70) {
            obs.descendsFromSky = true;
            obs.lateralMover = true;
            obs.skyStartX = Math.max(minSafeSkyEndX + skySpanPx, Math.min(blutuEgg.width - 20, bAnchor - 14));
            obs.skyEndX = Math.max(minSafeSkyEndX, obs.skyStartX - skySpanPx);
            obs.skyEmerge = 0;
            obs.weaveAmp = isCompact ? 15.5 : 22.0;
            obs.weaveFreq = 2.85 + Math.random() * 0.85;
            obs.y = -obs.h - 14;
          }
        }
      }
    }

    function spawnBlutuRoadCoin(coinTier) {
      if (!blutuEgg) return;
      const isCompact = blutuEgg.width < 520;
      const diam = isCompact ? 34 : 40;
      const r = diam * 0.5;
      const safeBeforePx = isCompact ? 98 : 128;
      let maxRightObstacleX = 0;
      for (let i = 0; i < blutuEgg.obstacles.length; i++) {
        const obs = blutuEgg.obstacles[i];
        const ox = (obs.anchorX !== undefined ? obs.anchorX : obs.x) + obs.w;
        if (ox > maxRightObstacleX) maxRightObstacleX = ox;
      }
      for (let i = 0; i < blutuEgg.roadCoins.length; i++) {
        const rcRight = blutuEgg.roadCoins[i].x + blutuEgg.roadCoins[i].r;
        if (rcRight > maxRightObstacleX) maxRightObstacleX = rcRight;
      }
      const spawnX = Math.max(blutuEgg.width + 32, maxRightObstacleX + safeBeforePx);
      const baseY = blutuEgg.groundY - r - (isCompact ? 7 : 9);

      blutuEgg.roadCoins.push({
        tier: coinTier,
        x: spawnX,
        y: baseY,
        baseY: baseY,
        r: r,
        diam: diam,
        theta: 0.25,
        bobPhase: Math.random() * Math.PI * 2
      });

      // Dejar aire limpio detrás de la moneda para recogerla con total comodidad
      blutuEgg.spawnTimer = Math.max(blutuEgg.spawnTimer, isCompact ? 0.72 : 0.66);
    }

    function triggerBlutuMilestoneCelebration(coin) {
      if (!blutuEgg || !coin) return;
      blutuEgg.coinsCollected = (blutuEgg.coinsCollected || 0) + 1;
      const tier = coin.tier || blutuEgg.coinsCollected;
      const isThousand = (tier > 0 && tier % 5 === 0);

      blutuEgg.milestoneActive = true;
      blutuEgg.milestoneIsThousand = isThousand;
      blutuEgg.milestoneCoinCount = isThousand ? Math.max(5, tier) : 1;
      blutuEgg.milestoneLabel = isThousand ? ('200x' + tier) : '+200';
      blutuEgg.milestoneOriginX = coin.x;
      blutuEgg.milestoneOriginY = coin.y;
      blutuEgg.milestoneElapsed = 0;

      spawnBlutuDustBurst(coin.x, coin.y + coin.r * 0.4, 5);

      if (isThousand) {
        spawnBlutuMilestoneBats();
      } else {
        blutuEgg.milestoneBats.length = 0;
      }

      if (blutuEgg.scoreEl) {
        blutuEgg.scoreEl.classList.add('is-milestone');
      }
    }

    function updateBlutuMilestoneCelebration(dt) {
      if (!blutuEgg || !blutuEgg.milestoneActive) return;
      blutuEgg.milestoneElapsed += dt;

      if (blutuEgg.milestoneIsThousand && blutuEgg.milestoneBats.length > 0) {
        for (let i = 0; i < blutuEgg.milestoneBats.length; i++) {
          const mb = blutuEgg.milestoneBats[i];
          if (mb.delay > 0) {
            mb.delay = Math.max(0, mb.delay - dt);
            continue;
          }
          mb.age += dt;
          mb.flapPhase += mb.flapSpeed * dt;
          const cosC = Math.cos(mb.curve * dt);
          const sinC = Math.sin(mb.curve * dt);
          const nvx = mb.vx * cosC - mb.vy * sinC;
          const nvy = mb.vx * sinC + mb.vy * cosC - 22 * dt;
          mb.vx = nvx;
          mb.vy = nvy;
          const flapLift = -Math.sin((mb.flapPhase / 8) * Math.PI * 2) * 26;
          mb.dx += mb.vx * dt + Math.cos(mb.age * 9 + mb.phase) * 10 * dt;
          mb.dy += (mb.vy + flapLift) * dt + Math.sin(mb.age * 13 + mb.phase) * 16 * dt;
        }
      }

      if (blutuEgg.milestoneElapsed >= blutuEgg.milestoneDuration) {
        blutuEgg.milestoneActive = false;
        blutuEgg.milestoneIsThousand = false;
        blutuEgg.milestoneBats.length = 0;
        blutuEgg.milestoneElapsed = 0;
        if (blutuEgg.scoreEl) {
          blutuEgg.scoreEl.classList.remove('is-milestone');
        }
      }
    }

    function computeBlutuIntroHorizontalRatio(u) {
      if (u <= 0.32) {
        const fallT = u / 0.32;
        return 0.14 * fallT * fallT;
      }
      const rollT = (u - 0.32) / 0.68;
      const rollEase = 1 - Math.pow(1 - rollT, 2.15);
      return 0.14 + 0.86 * rollEase;
    }

    function updateBlutuIntroRoll(dt) {
      blutuEgg.introElapsed += dt;
      const u = Math.min(1, blutuEgg.introElapsed / blutuEgg.introDuration);
      const groundRestY = blutuEgg.groundY - blutuEgg.playerSize * 0.5;
      const horizRatio = computeBlutuIntroHorizontalRatio(u);

      // Fase 1 (0..0.32): cae por gravedad hasta golpear el suelo; Fase 2 (0.32..1): rebota y rueda por el suelo hacia la izquierda
      if (u <= 0.32) {
        const fallT = u / 0.32;
        blutuEgg.playerY = blutuEgg.introStartY + (groundRestY - blutuEgg.introStartY) * (fallT * fallT);
        blutuEgg.playerAngle = -0.58 * fallT * fallT;
      } else {
        const rollT = (u - 0.32) / 0.68;
        const rollEase = 1 - Math.pow(1 - rollT, 2.15);
        if (rollT < 0.36) {
          blutuEgg.playerY = groundRestY - Math.sin((rollT / 0.36) * Math.PI) * 15;
        } else {
          blutuEgg.playerY = groundRestY;
        }
        blutuEgg.playerAngle = -0.58 - (Math.PI * 4 - 0.58) * rollEase;

        if (Math.random() < dt * 16) {
          const currX = blutuEgg.introStartX + (blutuEgg.playerRestX - blutuEgg.introStartX) * horizRatio;
          spawnBlutuDustBurst(currX + 4, blutuEgg.groundY - 2, 1);
        }
      }

      if (u >= 0.31 && u <= 0.36) {
        const currX = blutuEgg.introStartX + (blutuEgg.playerRestX - blutuEgg.introStartX) * horizRatio;
        spawnBlutuDustBurst(currX, blutuEgg.groundY - 2, 3);
      }

      updateBlutuDust(dt);

      if (u >= 1) {
        blutuEgg.state = 'PLAYING';
        blutuEgg.playerY = groundRestY;
        blutuEgg.playerAngle = 0;
        if (blutuEgg.jumpBuffer > 0) {
          executeBlutuJump();
        }
      }
    }

    function updateBlutuPlaying(dt) {
      blutuEgg.runTime += dt;
      const isCompact = blutuEgg.width < 520;
      const baseSpeed = isCompact ? 226 : 256;
      const tierStep = isCompact ? 34 : 42;
      const post1000Step = isCompact ? 13 : 16;
      const maxSpeed = isCompact ? 450 : 535;
      const intraRamp = (blutuEgg.distance % 200) * 0.05;
      const tierSpeedBonus = blutuEgg.difficultyTier <= 5
        ? (blutuEgg.difficultyTier * tierStep)
        : (5 * tierStep + (blutuEgg.difficultyTier - 5) * post1000Step);
      blutuEgg.speed = Math.min(maxSpeed, baseSpeed + tierSpeedBonus + intraRamp);

      blutuEgg.distance += (blutuEgg.speed * dt) * 0.055;
      const scoreInt = Math.floor(blutuEgg.distance);
      if (scoreInt !== blutuEgg.displayedScore) {
        blutuEgg.displayedScore = scoreInt;
        if (blutuEgg.scoreEl) {
          blutuEgg.scoreEl.textContent = String(Math.min(99999, scoreInt)).padStart(5, '0');
        }
      }

      // Cada 200 puntos: subir nivel sin pausar el juego y hacer aparecer la moneda en el camino lista para recoger
      blutuEgg.playerX = blutuEgg.playerRestX;
      const targetTier = Math.floor(scoreInt / 200);
      if (targetTier > blutuEgg.difficultyTier) {
        blutuEgg.difficultyTier = targetTier;
        upgradeFarObstaclesForTier(targetTier);
      }
      if (targetTier > blutuEgg.lastSpawnedCoinTier) {
        blutuEgg.lastSpawnedCoinTier = targetTier;
        spawnBlutuRoadCoin(targetTier);
      }

      // Despejar la aparición de obstáculos justo antes de cada múltiplo de 200 para que la moneda salga libre y fácil de recoger
      const mod200 = blutuEgg.distance % 200;
      if (mod200 >= 182 && Math.floor(blutuEgg.distance / 200) === blutuEgg.lastSpawnedCoinTier) {
        blutuEgg.spawnTimer = Math.max(blutuEgg.spawnTimer, 0.42);
      }

      if (blutuEgg.milestoneActive) {
        updateBlutuMilestoneCelebration(dt);
      }

      // Física vertical del jugador (Blutu logo) escalada proporcionalmente al nivel para saltos ágiles
      const groundRestY = blutuEgg.groundY - blutuEgg.playerSize * 0.5;
      const jumpScale = getBlutuJumpScale();
      const baseGravity = 1620 * jumpScale * jumpScale;
      const gravity = blutuEgg.isFastFalling ? baseGravity * 2.3 : baseGravity;

      if (blutuEgg.jumpBuffer > 0) {
        blutuEgg.jumpBuffer = Math.max(0, blutuEgg.jumpBuffer - dt);
      }

      if (blutuEgg.playerY < groundRestY || blutuEgg.playerVy < 0) {
        blutuEgg.playerVy += gravity * dt;
        blutuEgg.playerY += blutuEgg.playerVy * dt;
        const pitch = Math.max(-0.28, Math.min(0.24, (blutuEgg.playerVy / jumpScale) * 0.00045));
        blutuEgg.playerAngle = pitch;

        if (blutuEgg.playerY >= groundRestY) {
          blutuEgg.playerY = groundRestY;
          blutuEgg.playerVy = 0;
          blutuEgg.playerAngle = 0;
          blutuEgg.isFastFalling = false;
          spawnBlutuDustBurst(blutuEgg.playerX, blutuEgg.groundY - 2, 3);
          if (blutuEgg.jumpBuffer > 0) {
            executeBlutuJump();
          }
        }
      } else {
        blutuEgg.playerY = groundRestY;
        blutuEgg.playerAngle = Math.sin(blutuEgg.runTime * (14 + blutuEgg.difficultyTier * 1.4)) * 0.045;
        if (Math.random() < dt * 7) {
          spawnBlutuDustBurst(blutuEgg.playerX - 8, blutuEgg.groundY - 2, 1);
        }
        if (blutuEgg.jumpBuffer > 0) {
          executeBlutuJump();
        }
      }

      updateBlutuDust(dt);

      // Movimiento y recolección generosa de monedas en el camino (con ligera imantación al acercarse para que nunca sea difícil recogerlas)
      for (let i = blutuEgg.roadCoins.length - 1; i >= 0; i--) {
        const rc = blutuEgg.roadCoins[i];
        rc.x -= blutuEgg.speed * dt;
        rc.theta += dt * 3.1;
        const naturalY = rc.baseY + Math.sin(blutuEgg.runTime * 5.2 + rc.bobPhase) * 3.2;

        const dx = blutuEgg.playerX - rc.x;
        const dy = blutuEgg.playerY - rc.y;
        const absDx = Math.abs(dx);
        const absDy = Math.abs(dy);
        const magnetRangeX = isCompact ? 78 : 94;
        const magnetRangeY = isCompact ? 76 : 90;

        if (absDx < magnetRangeX && absDy < magnetRangeY) {
          const pull = Math.min(1, dt * 13);
          rc.x += dx * pull * 0.55;
          rc.y += (blutuEgg.playerY - rc.y) * pull * 0.85;
        } else {
          rc.y += (naturalY - rc.y) * Math.min(1, dt * 10);
        }

        const pickupRadius = blutuEgg.playerSize * 0.68 + rc.r * 1.35;
        if (Math.hypot(blutuEgg.playerX - rc.x, blutuEgg.playerY - rc.y) <= pickupRadius) {
          blutuEgg.roadCoins.splice(i, 1);
          triggerBlutuMilestoneCelebration(rc);
          continue;
        }

        if (rc.x + rc.r < -48) {
          blutuEgg.roadCoins.splice(i, 1);
        }
      }

      // Spawner de lápidas y murciélagos garantizando espacio suficiente respecto a obstáculos y monedas en el camino
      blutuEgg.spawnTimer -= dt;
      if (blutuEgg.spawnTimer <= 0) {
        const lastObs = blutuEgg.obstacles[blutuEgg.obstacles.length - 1];
        const jumpAirTime = (2 * (isCompact ? 525 : 555)) / (1620 * jumpScale);
        const tier5FairMargin = (blutuEgg.difficultyTier >= 5 || blutuEgg.distance >= 1000) ? (isCompact ? 34 : 48) : 0;
        const minPixelGap = blutuEgg.speed * (jumpAirTime * 0.98) + (isCompact ? 56 : 72) + tier5FairMargin;
        const lastBaseX = lastObs ? ((lastObs.anchorX !== undefined ? lastObs.anchorX : lastObs.x) + lastObs.w) : 0;
        let lastCoinRight = 0;
        for (let cIdx = 0; cIdx < blutuEgg.roadCoins.length; cIdx++) {
          const cr = blutuEgg.roadCoins[cIdx].x + blutuEgg.roadCoins[cIdx].r + (isCompact ? 52 : 68);
          if (cr > lastCoinRight) lastCoinRight = cr;
        }
        const furthestRight = Math.max(lastBaseX, lastCoinRight);
        if (furthestRight === 0 || (blutuEgg.width + 36 - furthestRight) >= minPixelGap) {
          spawnBlutuObstacle();
        } else {
          blutuEgg.spawnTimer = 0.06;
        }
      }

      // Hitbox permisivo centrado en la posición izquierda del logo Blutu
      const pInset = blutuEgg.playerSize * 0.22;
      const px1 = blutuEgg.playerX - blutuEgg.playerSize * 0.5 + pInset;
      const px2 = blutuEgg.playerX + blutuEgg.playerSize * 0.5 - pInset;
      const py1 = blutuEgg.playerY - blutuEgg.playerSize * 0.5 + pInset;
      const py2 = blutuEgg.playerY + blutuEgg.playerSize * 0.5 - pInset * 0.85;

      const isPlayerGrounded = (blutuEgg.playerY >= groundRestY - 1.5) && (blutuEgg.playerVy >= 0);
      const batSwoopAmp = 3.2 + Math.min(3.4, blutuEgg.difficultyTier * 0.5);

      for (let i = blutuEgg.obstacles.length - 1; i >= 0; i--) {
        const obs = blutuEgg.obstacles[i];
        if (obs.type === 'BAT') {
          if (obs.anchorX === undefined) obs.anchorX = obs.x;
          obs.anchorX -= blutuEgg.speed * dt;

          // Descenso desde el cielo nocturno a partir de los 1000 puntos
          let skyEmerge = 1;
          if (obs.descendsFromSky) {
            const prevSkyEmerge = (obs.skyEmerge !== undefined) ? obs.skyEmerge : 0;
            const skySpan = Math.max(50, obs.skyStartX - obs.skyEndX);
            const rawSkyT = Math.max(0, Math.min(1, (obs.skyStartX - obs.anchorX) / skySpan));
            skyEmerge = 1 - Math.pow(1 - rawSkyT, 2.15);
            obs.skyEmerge = skyEmerge;
            if (prevSkyEmerge <= 0.08 && skyEmerge > 0.08) {
              spawnBlutuWingMote(obs.anchorX + obs.w * 0.5, 5);
              spawnBlutuWingMote(obs.anchorX + obs.w * 0.35, 7);
            }
          } else {
            obs.skyEmerge = 1;
          }

          // Progreso de maniobra vertical (bajar en picada a ras del suelo o subir a media altura)
          let vertProg = 1;
          if (!obs.descendsFromSky && obs.vertStartX !== undefined && obs.vertEndX !== undefined) {
            const vSpan = Math.max(45, obs.vertStartX - obs.vertEndX);
            const rawV = Math.max(0, Math.min(1, (obs.vertStartX - obs.anchorX) / vSpan));
            vertProg = rawV * rawV * (3 - 2 * rawV);
          }

          // Ecolocalización al iniciar picada baja o aproximarse al jugador
          const alertDist = isCompact ? 205 : 275;
          const distToPlayer = obs.anchorX - blutuEgg.playerX;
          const diveTrigger = (obs.batArchetype === 'DIVE_LOW' && vertProg > 0.16 && vertProg < 0.85);
          if (!obs.chirped && skyEmerge > 0.55 && ((distToPlayer > 22 && distToPlayer < alertDist) || diveTrigger)) {
            obs.chirped = true;
            obs.chirpAge = 0;
          }
          if (obs.chirpAge >= 0) {
            obs.chirpAge += dt;
            if (obs.chirpAge > 0.46) obs.chirpAge = -1;
          }

          // Vaivén horizontal ("se mueven a los lados" desde 1000 pts) calibrado para que saltar sobre murciélagos bajos sea limpio
          const wFreq = obs.weaveFreq || 3.0;
          const baseWeaveAmp = obs.weaveAmp || 4.8;
          let swayEnvelope = 1;
          if (obs.lateralMover) {
            const nearFloor = obs.canHitGrounded ? 0.42 : 0.58;
            const nearT = Math.max(0, Math.min(1, (distToPlayer - 38) / 100));
            swayEnvelope = (nearFloor + (1 - nearFloor) * nearT) * Math.min(1, 0.35 + skyEmerge * 0.85);
          }
          const effectiveWeaveAmp = baseWeaveAmp * swayEnvelope;
          const weavePhase = blutuEgg.runTime * wFreq + obs.phase;
          const weaveX = Math.sin(weavePhase) * effectiveWeaveAmp;
          const weaveVx = Math.cos(weavePhase) * wFreq * effectiveWeaveAmp;
          obs.x = obs.anchorX + weaveX;

          // Ritmo vivo de ráfagas de aleteo alternadas con planeos en picada
          obs.flightClock = (obs.flightClock || 0) + dt;
          const gCycle = obs.glideCycle || 1.1;
          const cyclePos = (obs.flightClock + obs.phase * 0.15) % gCycle;
          const isAlert = (obs.chirpAge >= 0) || (!isPlayerGrounded && distToPlayer > -18 && distToPlayer < 190);
          const isActivelyDiving = (obs.batArchetype === 'DIVE_LOW' && !obs.descendsFromSky && vertProg > 0.08 && vertProg < 0.72) ||
            (obs.descendsFromSky && skyEmerge > 0.05 && skyEmerge < 0.45);
          const isGliding = isActivelyDiving || (!isAlert && (cyclePos > gCycle - 0.21));
          obs.isGliding = isGliding;

          if (isGliding) {
            obs.glideDip = Math.min(2.6, (obs.glideDip || 0) + dt * 13);
          } else {
            obs.glideDip = Math.max(0, (obs.glideDip || 0) - dt * 18);
            const prevFrame = Math.floor(obs.flapPhase || 0) % 8;
            const hoverBoost = (obs.lateralMover && weaveVx > 8) ? 1.14 : 1.0;
            const alertCadence = (isAlert ? 1.16 : 1.0) * hoverBoost;
            obs.flapPhase = (obs.flapPhase || 0) + dt * ((obs.flapSpeed || 15) + Math.min(3.2, blutuEgg.difficultyTier * 0.45)) * alertCadence;
            const nextFrame = Math.floor(obs.flapPhase) % 8;
            if (skyEmerge > 0.25 && prevFrame !== 3 && nextFrame === 3 && Math.random() < 0.34) {
              spawnBlutuWingMote(obs.x + obs.w * 0.58, obs.y + obs.h * 0.46);
            }
          }

          const prevY = obs.y;
          const swoopFreq = (obs.swoopFreq || 4.4) + Math.min(1.8, blutuEgg.difficultyTier * 0.26);
          const ampScale = obs.swoopScale || 1.0;
          const primaryWave = Math.sin(blutuEgg.runTime * swoopFreq + obs.phase) * (batSwoopAmp * ampScale);
          const secondaryFlutter = Math.cos(blutuEgg.runTime * (swoopFreq * 1.82) + obs.phase * 1.6) * 1.3;
          const flapRad = ((obs.flapPhase || 0) / 8) * Math.PI * 2;
          const wingbeatLift = isGliding ? 0 : (-Math.sin(flapRad) * 1.8);

          const startLaneY = (obs.entryY !== undefined) ? obs.entryY : obs.baseY;
          const activeBaseY = obs.descendsFromSky
            ? obs.baseY
            : (startLaneY + (obs.baseY - startLaneY) * vertProg);

          // Límite inferior según si el murciélago baja a ras del suelo (obliga a saltar) o patrulla por arriba
          const maxAllowedY = obs.canHitGrounded
            ? (blutuEgg.groundY - obs.h - 3)
            : Math.max(14, blutuEgg.groundY - blutuEgg.playerSize - obs.h - (isCompact ? 8 : 10));
          const cruiseY = Math.max(8, Math.min(maxAllowedY, activeBaseY + primaryWave + secondaryFlutter + wingbeatLift + (obs.glideDip || 0)));

          if (obs.descendsFromSky && skyEmerge < 0.999) {
            const skyHiddenY = -obs.h - 14;
            obs.y = Math.min(maxAllowedY, skyHiddenY + (cruiseY - skyHiddenY) * skyEmerge);
          } else {
            obs.y = cruiseY;
          }

          // Cabeceo / inclinación orgánica combinando picada descendente y vaivén lateral
          const vy = (obs.y - prevY) / Math.max(0.008, dt);
          const lateralBank = obs.lateralMover ? (weaveVx * 0.0018) : 0;
          const targetTilt = Math.max(-0.28, Math.min(0.24, -vy * 0.0022 + lateralBank + (isGliding ? -0.075 : Math.cos(flapRad) * 0.055)));
          obs.tilt = (obs.tilt || 0) + (targetTilt - (obs.tilt || 0)) * Math.min(1, dt * 14);
        } else {
          obs.x -= blutuEgg.speed * dt;
          obs.baseY = blutuEgg.groundY - obs.h;
          if (obs.risesFromGround) {
            const prevEmerge = obs.emerge || 0;
            const span = Math.max(40, obs.riseStartX - obs.riseEndX);
            const rawT = Math.max(0, Math.min(1, (obs.riseStartX - obs.x) / span));
            const emerge = 1 - Math.pow(1 - rawT, 2.35);
            obs.emerge = emerge;
            obs.y = blutuEgg.groundY - obs.h * emerge;
            if (prevEmerge <= 0.06 && emerge > 0.06) {
              spawnBlutuDustBurst(obs.x + obs.w * 0.5, blutuEgg.groundY - 1, 3);
            }
          } else {
            obs.emerge = 1;
            obs.y = obs.baseY;
          }
        }

        if ((obs.anchorX !== undefined ? obs.anchorX : obs.x) + obs.w < -68) {
          blutuEgg.obstacles.splice(i, 1);
          continue;
        }

        // Solo los murciélagos altos/medios pasan por encima del jugador en suelo; los que bajan a ras del suelo exigen saltar
        if (obs.type === 'BAT' && !obs.canHitGrounded && isPlayerGrounded) {
          continue;
        }

        // Si el murciélago desde 1000 pts apenas está asomando en lo alto del cielo, aún no colisiona
        if (obs.type === 'BAT' && obs.descendsFromSky && (obs.skyEmerge || 0) < 0.20) {
          continue;
        }

        // Si la lápida desde los 600 pts apenas está bajo tierra asomando, aún no colisiona
        if (obs.type === 'TOMBSTONE' && obs.risesFromGround && obs.emerge < 0.14) {
          continue;
        }

        // Colisión AABB ajustada a la silueta expuesta real de cada obstáculo
        const oxPad = obs.type === 'BAT' ? 7 : 4;
        const oyPad = obs.type === 'BAT' ? 5 : 3;
        const ox1 = obs.x + oxPad;
        const ox2 = obs.x + obs.w - oxPad;
        const oy1 = obs.y + oyPad;
        const oy2 = obs.type === 'BAT' ? (obs.y + obs.h - oyPad) : blutuEgg.groundY;

        if (px2 > ox1 && px1 < ox2 && py2 > oy1 && py1 < oy2) {
          return true;
        }
      }

      return false;
    }

    function updateBlutuDust(dt) {
      for (let i = 0; i < blutuEgg.dustPool.length; i++) {
        const p = blutuEgg.dustPool[i];
        if (!p.active) continue;
        p.life -= dt;
        if (p.life <= 0) {
          p.active = false;
          continue;
        }
        p.x += p.vx * dt;
        p.y += p.vy * dt;
      }
    }

    function renderBlutuDinoFrame() {
      if (!blutuEgg || !blutuEgg.ctx) return;
      const ctx = blutuEgg.ctx;
      const w = blutuEgg.width;
      const h = blutuEgg.height;
      const groundY = blutuEgg.groundY;

      ctx.clearRect(0, 0, w, h);

      const isExitReturn = (blutuEgg.state === 'EXIT_RETURN');
      const exitFade = isExitReturn ? Math.max(0, 1 - blutuEgg.exitElapsed / (blutuEgg.exitDuration * 0.75)) : 1;

      if (exitFade > 0.01) {
        ctx.save();
        if (isExitReturn) ctx.globalAlpha = exitFade;

        // Cielo nocturno gótico: estrellas tenues y pequeñas cruces lejanas en paralaje
        const skyOffset = (blutuEgg.distance * 3.2) % w;
        ctx.fillStyle = 'rgba(140, 162, 230, 0.22)';
        ctx.strokeStyle = 'rgba(90, 116, 191, 0.22)';
        ctx.lineWidth = 1;
        for (let i = 0; i < blutuEgg.stars.length; i++) {
          const st = blutuEgg.stars[i];
          let sx = (st.u * w - skyOffset + w) % w;
          const sy = st.v * (groundY - 30);
          if (st.isCross) {
            ctx.beginPath();
            ctx.moveTo(sx, sy - 3.5);
            ctx.lineTo(sx, sy + 3.5);
            ctx.moveTo(sx - 2.5, sy - 1);
            ctx.lineTo(sx + 2.5, sy - 1);
            ctx.stroke();
          } else {
            ctx.fillRect(sx, sy, st.size, st.size);
          }
        }

        // Línea de suelo gótico con resplandor azul y marcas de piedra en movimiento
        ctx.strokeStyle = '#5A74BF';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(0, groundY);
        ctx.lineTo(w, groundY);
        ctx.stroke();

        ctx.strokeStyle = 'rgba(140, 162, 230, 0.28)';
        ctx.lineWidth = 1;
        const groundScroll = (blutuEgg.distance * 18.18) % 48;
        ctx.beginPath();
        for (let gx = -groundScroll; gx < w + 48; gx += 48) {
          ctx.moveTo(gx, groundY + 6);
          ctx.lineTo(gx + 10, groundY + 6);
          ctx.moveTo(gx + 24, groundY + 11);
          ctx.lineTo(gx + 29, groundY + 11);
        }
        ctx.stroke();

        // Partículas de polvo azul
        for (let i = 0; i < blutuEgg.dustPool.length; i++) {
          const p = blutuEgg.dustPool[i];
          if (!p.active) continue;
          const alpha = Math.max(0, p.life / p.maxLife) * 0.55;
          ctx.fillStyle = 'rgba(140, 162, 230, ' + alpha.toFixed(2) + ')';
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.restore();
      }

      // Obstáculos: lápidas abajo y murciélagos arriba con vuelo biomecánico vivo (se disuelven suavemente al acabar la partida)
      const sprites = blutuEgg.sprites;
      const batFrameCount = (sprites && sprites.bats) ? sprites.bats.length : 8;
      let obsAlpha = 1;
      if (blutuEgg.state === 'GAME_OVER') {
        obsAlpha = Math.max(0, 1 - blutuEgg.gameOverElapsed / 0.44);
      } else if (isExitReturn) {
        obsAlpha = exitFade;
      }

      if (obsAlpha > 0.01 && blutuEgg.obstacles.length > 0) {
        ctx.save();
        if (obsAlpha < 0.999) ctx.globalAlpha = obsAlpha;
        for (let i = 0; i < blutuEgg.obstacles.length; i++) {
          const obs = blutuEgg.obstacles[i];
          if (obs.type === 'TOMBSTONE') {
            const tombCanvas = sprites.tombstones[obs.variant] || sprites.tombstones[0];
            const pad = sprites.tombPad;
            const emerge = (obs.emerge !== undefined) ? obs.emerge : 1;

            if (obs.risesFromGround && obs.x < obs.riseStartX + 36 && emerge < 0.995) {
              // Grieta luminosa en el suelo anunciando y acompañando la salida de la lápida
              const crackAlpha = emerge < 0.01
                ? Math.max(0, 1 - (obs.x - obs.riseStartX) / 36) * 0.75
                : Math.min(1, (1 - emerge) * 1.6);
              if (crackAlpha > 0.03) {
                ctx.save();
                ctx.strokeStyle = 'rgba(168, 188, 245, ' + (crackAlpha * obsAlpha).toFixed(3) + ')';
                ctx.lineWidth = 2.2;
                ctx.beginPath();
                ctx.moveTo(obs.x - 4, groundY);
                ctx.lineTo(obs.x + obs.w + 4, groundY);
                ctx.stroke();
                ctx.restore();
              }
            }

            if (emerge <= 0.008) {
              continue;
            }

            if (emerge < 0.998) {
              const shudderX = Math.sin(blutuEgg.runTime * 52 + obs.phase) * 0.9 * (1 - emerge);
              ctx.save();
              ctx.beginPath();
              ctx.rect(0, 0, w, groundY + 0.5);
              ctx.clip();
              ctx.drawImage(tombCanvas, obs.x - pad + shudderX, obs.y - pad, obs.w + pad * 2, obs.h + pad * 2);
              ctx.restore();
            } else {
              ctx.drawImage(tombCanvas, obs.x - pad, obs.y - pad, obs.w + pad * 2, obs.h + pad * 2);
            }
          } else {
            const skyEmerge = (obs.skyEmerge !== undefined) ? obs.skyEmerge : 1;
            const batAnchor = (obs.anchorX !== undefined) ? obs.anchorX : obs.x;

            if (obs.descendsFromSky && batAnchor < obs.skyStartX + 34 && skyEmerge < 0.96) {
              // Sutil bruma/halo nocturno en lo alto del cielo anunciando el descenso del murciélago
              const mistAlpha = skyEmerge < 0.01
                ? Math.max(0, 1 - (batAnchor - obs.skyStartX) / 34) * 0.65
                : Math.min(0.85, (1 - skyEmerge) * 1.35);
              if (mistAlpha > 0.03) {
                const mistCx = obs.x + obs.w * 0.5;
                ctx.save();
                ctx.strokeStyle = 'rgba(168, 188, 245, ' + (mistAlpha * obsAlpha).toFixed(3) + ')';
                ctx.lineWidth = 2.0;
                ctx.beginPath();
                ctx.moveTo(mistCx - obs.w * 0.55, 1.2);
                ctx.lineTo(mistCx + obs.w * 0.55, 1.2);
                ctx.stroke();
                ctx.restore();
              }
            }

            if (obs.descendsFromSky && skyEmerge <= 0.008) {
              continue;
            }

            const rawFlap = obs.flapPhase !== undefined ? obs.flapPhase : (blutuEgg.runTime * 15 + obs.phase * 2);
            const frameIdx = obs.isGliding ? 2 : (Math.floor(rawFlap) % batFrameCount);
            const blinkClock = (blutuEgg.runTime + (obs.blinkOffset || 0)) % 2.65;
            const isBlinking = (blinkClock > 2.53) && (obs.chirpAge === undefined || obs.chirpAge < 0);
            const batList = (isBlinking && sprites.batsBlink) ? sprites.batsBlink : sprites.bats;
            const batCanvas = batList[frameIdx] || sprites.bats[0];
            const pad = sprites.batPad;
            const drawW = obs.w + pad * 2;
            const drawH = obs.h + pad * 2;
            const cxBat = obs.x + obs.w * 0.5;
            const cyBat = obs.y + obs.h * 0.5;
            const flapRad = (rawFlap / batFrameCount) * Math.PI * 2;
            const stretchX = obs.isGliding ? 1.03 : (1 + Math.sin(flapRad) * 0.036);
            const stretchY = obs.isGliding ? 0.97 : (1 - Math.sin(flapRad) * 0.036);
            const skyFade = obs.descendsFromSky ? Math.min(1, 0.25 + skyEmerge * 1.15) : 1;

            ctx.save();
            if (skyFade < 0.999) {
              ctx.globalAlpha = obsAlpha * skyFade;
            }
            ctx.translate(cxBat, cyBat);
            if (obs.tilt) {
              ctx.rotate(obs.tilt);
            }
            ctx.scale(stretchX, stretchY);
            ctx.drawImage(batCanvas, -drawW * 0.5, -drawH * 0.5, drawW, drawH);
            ctx.restore();

            // Ondas sutiles de ecolocalización nocturna al detectar al jugador
            if (obs.chirpAge !== undefined && obs.chirpAge >= 0 && obs.chirpAge <= 0.46) {
              for (let wIdx = 0; wIdx < 2; wIdx++) {
                const localAge = obs.chirpAge - wIdx * 0.11;
                if (localAge <= 0 || localAge > 0.35) continue;
                const prog = localAge / 0.35;
                const waveAlpha = (1 - prog) * 0.62 * obsAlpha;
                const radius = 5 + prog * 19;
                ctx.save();
                ctx.strokeStyle = 'rgba(184, 204, 255, ' + waveAlpha.toFixed(3) + ')';
                ctx.lineWidth = 1.25 - prog * 0.4;
                ctx.beginPath();
                ctx.arc(cxBat - obs.w * 0.14, cyBat + 1, radius, Math.PI * 0.77, Math.PI * 1.19);
                ctx.stroke();
                ctx.restore();
              }
            }
          }
        }
        ctx.restore();
      }

      // Monedas coleccionables en el camino (cada 200 puntos)
      if (blutuEgg.state === 'PLAYING' && blutuEgg.roadCoins.length > 0 && sprites.coinCruz && sprites.coinCara) {
        const coinPadRatio = sprites.coinPad / sprites.coinInner;
        for (let i = 0; i < blutuEgg.roadCoins.length; i++) {
          const rc = blutuEgg.roadCoins[i];
          const pulse = 0.72 + Math.sin(blutuEgg.runTime * 6.5 + rc.bobPhase) * 0.22;
          const cosT = Math.cos(rc.theta);
          const sinT = Math.sin(rc.theta);
          const absCos = Math.abs(cosT);
          const activeFace = cosT >= 0 ? sprites.coinCruz : sprites.coinCara;
          const rcDrawH = rc.diam * (1 + coinPadRatio * 2);

          // Halo invitante alrededor de la moneda en el camino
          ctx.save();
          const auraGrad = ctx.createRadialGradient(rc.x, rc.y, rc.r * 0.15, rc.x, rc.y, rc.r * 1.65);
          auraGrad.addColorStop(0, 'rgba(140, 162, 230, ' + (0.28 * pulse).toFixed(3) + ')');
          auraGrad.addColorStop(1, 'rgba(140, 162, 230, 0)');
          ctx.fillStyle = auraGrad;
          ctx.beginPath();
          ctx.arc(rc.x, rc.y, rc.r * 1.65, 0, Math.PI * 2);
          ctx.fill();
          ctx.restore();

          if (absCos < 0.95) {
            ctx.save();
            ctx.translate(rc.x + sinT * 1.4, rc.y);
            ctx.strokeStyle = 'rgba(168, 188, 245, 0.72)';
            ctx.lineWidth = 1.25;
            ctx.beginPath();
            ctx.ellipse(0, 0, Math.max(1.0, rc.r * absCos), rc.r, 0, 0, Math.PI * 2);
            ctx.stroke();
            ctx.restore();
          }

          ctx.save();
          ctx.translate(rc.x, rc.y);
          ctx.scale(Math.max(0.04, absCos), 1);
          ctx.drawImage(activeFace, -rcDrawH * 0.5, -rcDrawH * 0.5, rcDrawH, rcDrawH);
          ctx.restore();
        }
      }

      // Jugador: Logo Blutu (cae rodando al iniciar, permanece a la izquierda al jugar y vuelve en animación a su posición original al acabar)
      let drawX = blutuEgg.playerRestX;
      let drawY = blutuEgg.playerY;
      let drawSize = blutuEgg.playerSize;
      let drawAngle = blutuEgg.playerAngle;

      if (blutuEgg.state === 'INTRO_ROLL') {
        const u = Math.min(1, blutuEgg.introElapsed / blutuEgg.introDuration);
        const horizRatio = computeBlutuIntroHorizontalRatio(u);
        const sizeEase = Math.min(1, u / 0.55);
        drawX = blutuEgg.introStartX + (blutuEgg.playerRestX - blutuEgg.introStartX) * horizRatio;
        drawSize = blutuEgg.introStartSize + (blutuEgg.playerSize - blutuEgg.introStartSize) * (1 - Math.pow(1 - sizeEase, 2));
      } else if (blutuEgg.state === 'PLAYING') {
        const groundRestY = groundY - blutuEgg.playerSize * 0.5;
        if (blutuEgg.playerY >= groundRestY - 0.5) {
          drawY += Math.sin(blutuEgg.runTime * 18) * 1.4;
        }
      } else if (blutuEgg.state === 'GAME_OVER') {
        const pose = computeBlutuGameOverLogoPose();
        drawX = pose.x;
        drawY = pose.y;
        drawSize = pose.size;
        drawAngle = pose.angle;
      } else if (isExitReturn) {
        const u = Math.min(1, blutuEgg.exitElapsed / blutuEgg.exitDuration);
        const ease = 1 - Math.pow(1 - u, 2.3);
        const targetX = w * 0.5;
        const targetY = blutuEgg.origHeaderY || 48;
        const targetSize = blutuEgg.origHeaderSize || 76;
        drawX = blutuEgg.exitStartX + (targetX - blutuEgg.exitStartX) * ease;
        drawY = blutuEgg.exitStartY + (targetY - blutuEgg.exitStartY) * ease;
        drawSize = blutuEgg.exitStartSize + (targetSize - blutuEgg.exitStartSize) * ease;
        drawAngle = blutuEgg.exitStartAngle * (1 - ease);
      }

      const spritePadRatio = sprites.logoPad / sprites.logoInner;
      const totalDrawSize = drawSize * (1 + spritePadRatio * 2);

      ctx.save();
      ctx.translate(drawX, drawY);
      if (drawAngle !== 0) {
        ctx.rotate(drawAngle);
      }
      ctx.drawImage(sprites.logo, -totalDrawSize * 0.5, -totalDrawSize * 0.5, totalDrawSize, totalDrawSize);
      ctx.restore();

      // Animación al recoger la moneda en el camino (sin pausar el juego): sube desde el punto recogido y despliega moneda(s) girando + "+200" o "200xN" + murciélagos
      if (blutuEgg.state === 'PLAYING' && blutuEgg.milestoneActive && sprites.coinCruz && sprites.coinCara) {
        const u = Math.min(1, blutuEgg.milestoneElapsed / blutuEgg.milestoneDuration);
        const fadeAlpha = u < 0.08 ? (u / 0.08) : (u > 0.84 ? Math.max(0, (1 - u) / 0.16) : 1);
        const flightEase = u < 0.18 ? (1 - Math.pow(1 - u / 0.18, 2.4)) : 1;
        const popScale = u < 0.16
          ? (0.68 + 0.32 * (1 - Math.pow(1 - u / 0.16, 2)))
          : (u > 0.88 ? (1 - 0.10 * ((u - 0.88) / 0.12)) : 1);

        const isCompact = w < 520;
        const coinPadRatio = sprites.coinPad / sprites.coinInner;
        const targetCx = w * 0.5;
        const spinProgress = 0.88 * u + 0.12 * (0.5 - 0.5 * Math.cos(u * Math.PI));
        const baseTheta = spinProgress * Math.PI * 2;
        const coinCount = blutuEgg.milestoneIsThousand ? Math.max(5, blutuEgg.milestoneCoinCount || 5) : 1;

        let targetCy = (isCompact ? h * 0.30 : h * 0.31) - Math.sin(u * Math.PI) * 2.5;
        const origX = blutuEgg.milestoneOriginX !== undefined ? blutuEgg.milestoneOriginX : blutuEgg.playerX;
        const origY = blutuEgg.milestoneOriginY !== undefined ? blutuEgg.milestoneOriginY : (groundY - 26);

        let cx = origX + (targetCx - origX) * flightEase;
        let cy = origY + (targetCy - origY) * flightEase;
        let labelY = 0;
        let veilRx = 0;
        let veilRy = 0;
        let batRefDiam = (isCompact ? 54 : 62) * popScale;
        const coinPlacements = [];

        if (!blutuEgg.milestoneIsThousand) {
          const coinDiam = (isCompact ? 54 : 62) * popScale;
          veilRx = coinDiam * 0.86;
          veilRy = veilRx;
          labelY = cy + coinDiam * 0.5 + (isCompact ? 13 : 15);
          coinPlacements.push({
            x: cx,
            y: cy,
            diam: coinDiam,
            theta: baseTheta
          });
        } else {
          const rows = coinCount <= 5 ? 1 : (coinCount <= 10 ? 2 : (coinCount <= 15 ? 3 : Math.min(4, Math.ceil(coinCount / (isCompact ? 7 : 10)))));
          const maxCols = Math.ceil(coinCount / rows);
          const availW = Math.max(180, w - (isCompact ? 52 : 96));
          const topSafeY = 18;
          const bottomSafeY = Math.max(topSafeY + 52, blutuEgg.groundY - (isCompact ? 54 : 62));
          const availH = Math.max(46, bottomSafeY - topSafeY);
          const idealDiam = rows === 1
            ? (isCompact ? 36 : 44)
            : (rows === 2 ? (isCompact ? 27 : 33) : (rows === 3 ? (isCompact ? 21 : 26) : (isCompact ? 18 : 22)));
          const singleDiam = Math.max(
            13,
            Math.min(idealDiam, availW / Math.max(1, maxCols * 1.12), availH / Math.max(1, rows * 1.02))
          ) * popScale;

          const stepY = rows > 1 ? Math.min(singleDiam * 0.92, Math.max(singleDiam * 0.70, (availH - singleDiam) / (rows - 1))) : 0;
          const totalClusterH = (rows - 1) * stepY + singleDiam;
          targetCy = Math.max(
            topSafeY + totalClusterH * 0.5,
            Math.min(bottomSafeY - totalClusterH * 0.5, isCompact ? h * 0.29 : h * 0.30)
          ) - Math.sin(u * Math.PI) * 2;
          cy = origY + (targetCy - origY) * flightEase;

          const spread = u < 0.22 ? (1 - Math.pow(1 - u / 0.22, 2.35)) : 1;
          let maxHalfSpanX = singleDiam * 0.6;
          let idxCounter = 0;

          for (let r = 0; r < rows; r++) {
            const remaining = coinCount - idxCounter;
            const rowsLeft = rows - r;
            const rowLen = Math.ceil(remaining / rowsLeft);
            const stepX = rowLen > 1 ? Math.min(singleDiam * 1.16, (availW - singleDiam) / (rowLen - 1)) : 0;
            const rowHalfSpan = (rowLen - 1) * 0.5 * stepX + singleDiam * 0.5;
            if (rowHalfSpan > maxHalfSpanX) maxHalfSpanX = rowHalfSpan;
            const rowBaseY = cy + (r - (rows - 1) * 0.5) * stepY;

            for (let c = 0; c < rowLen; c++) {
              const normCol = rowLen > 1 ? ((c - (rowLen - 1) * 0.5) / ((rowLen - 1) * 0.5)) : 0;
              const arcDy = rows === 1 ? (normCol * normCol * 4.0 - 2.0) : (normCol * normCol * 2.0 - 1.0);
              const targetX = cx + (c - (rowLen - 1) * 0.5) * stepX;
              const targetY = rowBaseY + arcDy;
              coinPlacements.push({
                x: cx + (targetX - cx) * spread,
                y: cy + (targetY - cy) * spread,
                diam: singleDiam,
                theta: baseTheta + normCol * 0.28 - r * 0.14
              });
              idxCounter++;
            }
          }

          const clusterBottomY = cy + (rows - 1) * 0.5 * stepY + singleDiam * 0.5 + (rows === 1 ? 2.0 : 1.0);
          labelY = Math.min(blutuEgg.groundY - 26, clusterBottomY + (isCompact ? 13 : 15));
          veilRx = Math.max(batRefDiam * 1.05, maxHalfSpanX + 18);
          veilRy = Math.max(batRefDiam * 0.92, (labelY - cy) + 16);
        }

        ctx.save();

        // Velo sutil en la parte superior para resaltar las monedas sin tapar los obstáculos del suelo
        ctx.save();
        ctx.translate(cx, cy + 5);
        ctx.scale(veilRx / Math.max(1, veilRy), 1);
        const veilGrad = ctx.createRadialGradient(0, 0, veilRy * 0.12, 0, 0, veilRy);
        veilGrad.addColorStop(0, 'rgba(5, 7, 13, ' + (0.28 * fadeAlpha).toFixed(3) + ')');
        veilGrad.addColorStop(1, 'rgba(5, 7, 13, 0)');
        ctx.fillStyle = veilGrad;
        ctx.beginPath();
        ctx.arc(0, 0, veilRy, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();

        // Cada 1000 puntos: bandada viva de murciélagos saliendo desde DETRÁS de las monedas
        if (blutuEgg.milestoneIsThousand && blutuEgg.milestoneBats.length > 0 && sprites.bats) {
          const baseBatW = isCompact ? 32 : 38;
          const baseBatH = isCompact ? 17 : 20;
          const batPad = sprites.batPad;

          for (let i = 0; i < blutuEgg.milestoneBats.length; i++) {
            const mb = blutuEgg.milestoneBats[i];
            if (mb.delay > 0) continue;

            const dist = Math.hypot(mb.dx, mb.dy);
            const emergeScale = Math.min(1, 0.30 + (dist / (batRefDiam * 0.54)) * 0.70);
            const batAlpha = fadeAlpha * Math.min(1, mb.age / 0.11) * Math.max(0, 1 - Math.max(0, mb.age - 1.32) / 0.42);
            if (batAlpha <= 0.02) continue;

            const rawMbFlap = mb.flapPhase !== undefined ? mb.flapPhase : (mb.age * 17 + mb.phase * 2);
            const frameIdx = Math.floor(rawMbFlap) % batFrameCount;
            const isMbBlink = ((mb.age + (mb.blinkOffset || 0)) % 1.9) > 1.78;
            const mbList = (isMbBlink && sprites.batsBlink) ? sprites.batsBlink : sprites.bats;
            const batSprite = mbList[frameIdx] || sprites.bats[0];
            const bw = (baseBatW + batPad * 2) * mb.scale * emergeScale;
            const bh = (baseBatH + batPad * 2) * mb.scale * emergeScale;
            const flapRad = (rawMbFlap / batFrameCount) * Math.PI * 2;
            const bankAngle = Math.atan2(mb.vy, Math.abs(mb.vx) + 40) * (mb.vx >= 0 ? 0.55 : -0.55) + Math.sin(mb.age * 11 + mb.phase) * 0.09;

            ctx.save();
            ctx.globalAlpha = batAlpha;
            ctx.translate(cx + mb.dx, cy + mb.dy);
            ctx.rotate(bankAngle);
            ctx.scale(1 + Math.sin(flapRad) * 0.04, 1 - Math.sin(flapRad) * 0.04);
            ctx.drawImage(batSprite, -bw * 0.5, -bh * 0.5, bw, bh);
            ctx.restore();
          }
        }

        ctx.globalAlpha = fadeAlpha;

        for (let i = 0; i < coinPlacements.length; i++) {
          const cp = coinPlacements[i];
          const cosT = Math.cos(cp.theta);
          const sinT = Math.sin(cp.theta);
          const absCos = Math.abs(cosT);
          const activeFace = cosT >= 0 ? sprites.coinCruz : sprites.coinCara;
          const cpDrawH = cp.diam * (1 + coinPadRatio * 2);
          const edgeShift = sinT * Math.max(1.2, cp.diam * 0.035);

          if (absCos < 0.96) {
            ctx.save();
            ctx.translate(cp.x + edgeShift, cp.y);
            ctx.strokeStyle = 'rgba(140, 162, 230, 0.65)';
            ctx.lineWidth = Math.max(1.0, (1 - absCos) * (cp.diam > 50 ? 2.2 : 1.6));
            ctx.beginPath();
            ctx.ellipse(0, 0, Math.max(1.0, cp.diam * 0.5 * absCos), cp.diam * 0.5, 0, 0, Math.PI * 2);
            ctx.stroke();
            ctx.restore();
          }

          ctx.save();
          ctx.translate(cp.x, cp.y);
          ctx.scale(Math.max(0.035, absCos), 1);
          ctx.drawImage(activeFace, -cpDrawH * 0.5, -cpDrawH * 0.5, cpDrawH, cpDrawH);
          ctx.restore();
        }

        const milestoneLabel = blutuEgg.milestoneLabel || '+200';
        const labelFontPx = blutuEgg.milestoneIsThousand
          ? (isCompact ? 15 : 17)
          : (isCompact ? 14 : 16);
        ctx.font = '700 ' + labelFontPx + "px 'Cinzel', Georgia, serif";
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.shadowColor = blutuEgg.milestoneIsThousand ? 'rgba(140, 162, 230, 0.95)' : 'rgba(90, 116, 191, 0.9)';
        ctx.shadowBlur = blutuEgg.milestoneIsThousand ? 12 : 9;
        ctx.strokeStyle = 'rgba(90, 116, 191, 0.88)';
        ctx.lineWidth = 2.4;
        ctx.lineJoin = 'round';
        ctx.strokeText(milestoneLabel, cx, labelY);
        ctx.fillStyle = '#eef3ff';
        ctx.fillText(milestoneLabel, cx, labelY);

        ctx.restore();
      }

      // Al terminar la partida: monedas en trazos rebotando en el suelo según cuántas monedas ganó el jugador
      if (blutuEgg.state === 'GAME_OVER' && blutuEgg.bouncingCoins.length > 0 && sprites.coinCruz && sprites.coinCara) {
        const coinPadRatio = sprites.coinPad / sprites.coinInner;
        for (let i = 0; i < blutuEgg.bouncingCoins.length; i++) {
          const c = blutuEgg.bouncingCoins[i];
          if (c.delay > 0) continue;

          const cosT = Math.cos(c.theta);
          const sinT = Math.sin(c.theta);
          const absCos = Math.abs(cosT);
          const faceSprite = cosT >= 0 ? sprites.coinCruz : sprites.coinCara;
          const drawH = c.diam * (1 + coinPadRatio * 2);

          if (absCos < 0.95) {
            ctx.save();
            ctx.translate(c.x + sinT * 1.6, c.y);
            ctx.strokeStyle = 'rgba(140, 162, 230, 0.6)';
            ctx.lineWidth = 1.2;
            ctx.beginPath();
            ctx.ellipse(0, 0, Math.max(1.0, c.r * absCos), c.r, 0, 0, Math.PI * 2);
            ctx.stroke();
            ctx.restore();
          }

          ctx.save();
          ctx.translate(c.x, c.y);
          ctx.scale(Math.max(0.04, absCos), 1);
          ctx.drawImage(faceSprite, -drawH * 0.5, -drawH * 0.5, drawH, drawH);
          ctx.restore();
        }
      }
    }

    function buildBlutuDinoSprites(logoImgEl) {
      // 1. Sprite del Logo Blutu con aura azul pre-renderizada (cero blur por fotograma)
      const logoInner = 64;
      const logoPad = 14;
      const logoTotal = logoInner + logoPad * 2;
      const logoCanvas = document.createElement('canvas');
      logoCanvas.width = logoTotal;
      logoCanvas.height = logoTotal;
      const lctx = logoCanvas.getContext('2d');

      lctx.save();
      lctx.shadowColor = 'rgba(140, 162, 230, 0.85)';
      lctx.shadowBlur = 11;
      if (logoImgEl && logoImgEl.complete && logoImgEl.naturalWidth > 0) {
        const aspect = logoImgEl.naturalWidth / logoImgEl.naturalHeight;
        let dw = logoInner;
        let dh = logoInner;
        if (aspect > 1) {
          dh = logoInner / aspect;
        } else {
          dw = logoInner * aspect;
        }
        lctx.drawImage(logoImgEl, logoPad + (logoInner - dw) * 0.5, logoPad + (logoInner - dh) * 0.5, dw, dh);
      } else {
        if (logoImgEl && !logoImgEl.complete) {
          logoImgEl.addEventListener('load', () => {
            if (blutuEgg) blutuEgg.sprites = buildBlutuDinoSprites(logoImgEl);
          }, { once: true });
        }
        if (typeof Path2D !== 'undefined') {
          lctx.translate(logoTotal * 0.5, logoTotal * 0.5);
          lctx.scale(0.62, 0.62);
          lctx.fillStyle = '#ffffff';
          const fallbackPath = new Path2D('M19.9 -41Q23.5 -41.5 26 -41.5Q28.5 -41.4 31.1 -39.9Q33.7 -38.4 35.3 -36.8Q36.8 -35.3 38.9 -31.3Q41 -27.2 43 -19.9Q44.9 -12.6 46.6 -2.9Q48.4 6.7 48.6 11.8Q48.9 17 48.5 18.1Q48.1 19.3 36.4 25Q24.6 30.7 20.5 31.6Q16.4 32.5 6.6 35.5Q-3.1 38.6 -6 39Q-9 39.4 -13.1 40.6Q-17.2 41.9 -18.4 41.9Q-19.6 41.9 -21.5 41Q-23.3 40.1 -24.1 39.3Q-24.9 38.5 -25.1 37.1Q-25.4 35.8 -25.4 34Q-25.4 32.3 -24.6 31Q-23.8 29.8 -11.5 26Q0.9 22.1 6 20Q11.2 17.9 18.9 13.9Q26.5 10 29.8 8.9Q33 7.8 33.5 7Q34.1 6.2 34 5Q33.8 3.7 31.8 2.3Q29.8 0.9 27.3 0.9Q24.8 0.9 19.4 2.5Q14 4.1 5.3 5Q-3.3 6 -7.4 7.3Q-11.5 8.5 -20.9 9.3Q-30.2 10 -35.8 12Q-41.4 14 -43.6 13.5Q-45.8 13 -47.2 11.4Q-48.6 9.9 -48.6 7.2Q-48.6 4.4 -47.5 2.4Q-46.5 0.4 -45.3 -0.3Q-44.1 -0.9 -37.6 -2.5Q-31.2 -4.1 -26.5 -5.9Q-21.9 -7.8 -16.7 -8.8Q-11.5 -9.8 -7.5 -11.3Q-3.6 -12.7 6.5 -13.9Q16.7 -15.2 17.6 -15.8Q18.5 -16.5 19.3 -18.5Q20 -20.5 19.6 -21.1Q19.1 -21.6 11.7 -21.6Q4.3 -21.6 -1.8 -22.6Q-7.8 -23.6 -22.8 -24Q-37.9 -24.3 -39.9 -25.1Q-41.9 -25.8 -42.8 -26.9Q-43.7 -27.9 -44 -29Q-44.4 -30.1 -44 -31.9Q-43.7 -33.8 -40.3 -35.8Q-36.9 -37.9 -28.8 -38.6Q-20.6 -39.4 -12.9 -39.4Q-5.1 -39.4 -3.5 -39.9Q-1.9 -40.4 7.1 -40.4Q16.2 -40.4 19.9 -41ZM-27 -20.9Q-27.2 -23 -21.9 -22.6Q-16.7 -22.1 -14.9 -19.1Q-13.1 -16 -12.3 -13.7Q-11.4 -11.4 -17.5 -9.9Q-23.6 -8.5 -25.3 -13.7Q-26.9 -18.8 -27 -20.9ZM-8.3 8.9Q-5.4 7.9 -5.1 7.9Q-4.7 7.9 -0.8 13.9Q3.2 19.8 -5.5 22.5Q-14.2 25.1 -16.9 17.8Q-19.5 10.4 -15.3 10.1Q-11.2 9.8 -8.3 8.9Z');
          lctx.fill(fallbackPath, 'evenodd');
        }
      }
      lctx.restore();

      // 2. Tres variantes de Lápidas Góticas con la estética exacta de la página (.master-tombstone)
      const tombPad = 8;
      const tombSpecs = [
        { w: 56, h: 84, double: false },
        { w: 48, h: 102, double: false },
        { w: 96, h: 72, double: true }
      ];
      const tombstones = tombSpecs.map((spec) => {
        const c = document.createElement('canvas');
        c.width = spec.w + tombPad * 2;
        c.height = spec.h + tombPad * 2;
        const tctx = c.getContext('2d');

        const drawSingleTomb = (ox, oy, tw, th) => {
          const r = tw * 0.5;
          const baseH = 6;
          tctx.save();
          tctx.shadowColor = 'rgba(90, 116, 191, 0.55)';
          tctx.shadowBlur = 7;

          const grad = tctx.createLinearGradient(ox, oy, ox, oy + th);
          grad.addColorStop(0, '#101423');
          grad.addColorStop(1, '#07090f');
          tctx.fillStyle = grad;
          tctx.strokeStyle = '#6d87d6';
          tctx.lineWidth = 2;

          tctx.beginPath();
          tctx.moveTo(ox + 2, oy + th - baseH);
          tctx.lineTo(ox + 2, oy + r);
          tctx.arc(ox + r, oy + r, r - 2, Math.PI, 0, false);
          tctx.lineTo(ox + tw - 2, oy + th - baseH);
          tctx.closePath();
          tctx.fill();
          tctx.stroke();

          // Zócalo inferior de piedra
          tctx.fillStyle = '#0c101c';
          tctx.fillRect(ox, oy + th - baseH, tw, baseH);
          tctx.strokeRect(ox, oy + th - baseH, tw, baseH);
          tctx.restore();

          // Borde interior gótico sutil
          tctx.strokeStyle = 'rgba(140, 162, 230, 0.24)';
          tctx.lineWidth = 1;
          tctx.beginPath();
          tctx.moveTo(ox + 6, oy + th - baseH - 3);
          tctx.lineTo(ox + 6, oy + r);
          tctx.arc(ox + r, oy + r, Math.max(4, r - 6), Math.PI, 0, false);
          tctx.lineTo(ox + tw - 6, oy + th - baseH - 3);
          tctx.stroke();

          // Cruz gótica ✚ en la corona de la lápida
          const cx = ox + r;
          const cy = oy + Math.max(15, r * 0.72);
          tctx.strokeStyle = '#9bb0f0';
          tctx.lineWidth = 2.2;
          tctx.beginPath();
          tctx.moveTo(cx, cy - 6);
          tctx.lineTo(cx, cy + 6);
          tctx.moveTo(cx - 5, cy - 1);
          tctx.lineTo(cx + 5, cy - 1);
          tctx.stroke();

          // Líneas de epitafio
          tctx.strokeStyle = 'rgba(140, 162, 230, 0.28)';
          tctx.lineWidth = 1.4;
          const lineY1 = cy + 14;
          if (lineY1 < oy + th - baseH - 8) {
            tctx.beginPath();
            tctx.moveTo(cx - tw * 0.24, lineY1);
            tctx.lineTo(cx + tw * 0.24, lineY1);
            if (lineY1 + 7 < oy + th - baseH - 6) {
              tctx.moveTo(cx - tw * 0.17, lineY1 + 7);
              tctx.lineTo(cx + tw * 0.17, lineY1 + 7);
            }
            tctx.stroke();
          }
        };

        if (spec.double) {
          const halfW = Math.floor(spec.w * 0.53);
          drawSingleTomb(tombPad, tombPad + 8, halfW, spec.h - 8);
          drawSingleTomb(tombPad + spec.w - halfW, tombPad, halfW, spec.h);
        } else {
          drawSingleTomb(tombPad, tombPad, spec.w, spec.h);
        }
        return c;
      });

      // 3. Ocho poses biomecánicas de Murciélagos Góticos (aleteo asimétrico con muñeca/pulgar, falanges, orejas vivas y parpadeo; cero blur en tiempo real)
      const batPad = 8;
      const bw = 84;
      const bh = 44;
      const batPoses = [
        // 0: Cumbre de subida (arco gótico alto, cuerpo en punto bajo antes del impulso)
        { wx: 19, wy: -15, tx: 35, ty: -20, s1x: 30, s1y: -3, s2x: 17, s2y: 2, bodyDy: 2.0, earX: 6.2, earY: -12.6 },
        // 1: Inicio de batida potente (extensión máxima, membrana arqueándose)
        { wx: 23, wy: -12, tx: 43, ty: -11, s1x: 33, s1y: 2, s2x: 19, s2y: 5, bodyDy: 0.7, earX: 6.4, earY: -12.2 },
        // 2: Media batida / Planeo extendido (alas desplegadas con comba aerodinámica)
        { wx: 24, wy: -6, tx: 44, ty: -1, s1x: 34, s1y: 7, s2x: 19, s2y: 8, bodyDy: -0.8, earX: 6.5, earY: -11.9 },
        // 3: Golpe profundo hacia abajo (empuje de aire y ascenso del cuerpo)
        { wx: 22, wy: -1, tx: 40, ty: 11, s1x: 30, s1y: 13, s2x: 17, s2y: 10, bodyDy: -2.1, earX: 6.8, earY: -11.5 },
        // 4: Cierre envolvente inferior (alas bajas abrazando el impulso)
        { wx: 18, wy: 4, tx: 31, ty: 18, s1x: 23, s1y: 15, s2x: 14, s2y: 11, bodyDy: -2.5, earX: 7.0, earY: -11.2 },
        // 5: Inicio de recuperación (las muñecas suben mientras las puntas aún arrastran con latigazo)
        { wx: 15, wy: -3, tx: 27, ty: 13, s1x: 21, s1y: 11, s2x: 13, s2y: 8, bodyDy: -1.1, earX: 6.6, earY: -11.7 },
        // 6: Pliegue de subida (codos altos recogidos como capa gótica para no frenar el vuelo)
        { wx: 14, wy: -10, tx: 26, ty: 2, s1x: 21, s1y: 5, s2x: 13, s2y: 6, bodyDy: 0.5, earX: 6.3, earY: -12.1 },
        // 7: Despliegue ascendente final hacia la cumbre
        { wx: 17, wy: -14, tx: 31, ty: -12, s1x: 26, s1y: -1, s2x: 15, s2y: 3, bodyDy: 1.6, earX: 6.2, earY: -12.4 }
      ];

      const renderBatFrame = (pose, isBlink) => {
        const c = document.createElement('canvas');
        c.width = bw + batPad * 2;
        c.height = bh + batPad * 2;
        const bctx = c.getContext('2d');
        const cx = batPad + bw * 0.5;
        const cy = batPad + bh * 0.52 + pose.bodyDy;

        bctx.save();
        bctx.lineJoin = 'round';
        bctx.lineCap = 'round';
        bctx.shadowColor = 'rgba(90, 116, 191, 0.65)';
        bctx.shadowBlur = 6;

        const wingGrad = bctx.createLinearGradient(cx, cy - 18, cx, cy + 18);
        wingGrad.addColorStop(0, '#141c36');
        wingGrad.addColorStop(1, '#070a14');

        // Membranas alares articuladas (hombro -> muñeca con pulgar -> punta -> 3 arcos festoneados)
        for (const dir of [-1, 1]) {
          bctx.fillStyle = wingGrad;
          bctx.strokeStyle = '#839ce8';
          bctx.lineWidth = 1.75;

          bctx.beginPath();
          bctx.moveTo(cx + dir * 4.5, cy - 3.2);
          bctx.quadraticCurveTo(cx + dir * (pose.wx * 0.55), cy + pose.wy - 2.5, cx + dir * pose.wx, cy + pose.wy);
          bctx.quadraticCurveTo(cx + dir * ((pose.wx + pose.tx) * 0.52), cy + (pose.wy + pose.tx * 0.02 + pose.ty) * 0.5 - 2.2, cx + dir * pose.tx, cy + pose.ty);
          bctx.quadraticCurveTo(cx + dir * ((pose.tx + pose.s1x) * 0.48), cy + (pose.ty + pose.s1y) * 0.5 - 2.4, cx + dir * pose.s1x, cy + pose.s1y);
          bctx.quadraticCurveTo(cx + dir * ((pose.s1x + pose.s2x) * 0.50), cy + Math.min(pose.s1y, pose.s2y) - 2.6, cx + dir * pose.s2x, cy + pose.s2y);
          bctx.quadraticCurveTo(cx + dir * ((pose.s2x + 5) * 0.50), cy + 3.2, cx + dir * 4.8, cy + 4.8);
          bctx.closePath();
          bctx.fill();
          bctx.stroke();

          // Pequeña garra del pulgar en la articulación superior del ala
          bctx.beginPath();
          bctx.moveTo(cx + dir * pose.wx, cy + pose.wy);
          bctx.lineTo(cx + dir * (pose.wx + 1.4), cy + pose.wy - 2.7);
          bctx.stroke();
        }
        bctx.restore();

        // Falanges / nervaduras internas traslúcidas de la membrana
        bctx.save();
        bctx.strokeStyle = 'rgba(155, 178, 244, 0.36)';
        bctx.lineWidth = 1.05;
        for (const dir of [-1, 1]) {
          bctx.beginPath();
          bctx.moveTo(cx + dir * pose.wx, cy + pose.wy);
          bctx.quadraticCurveTo(cx + dir * ((pose.wx + pose.s1x) * 0.52), cy + (pose.wy + pose.s1y) * 0.5, cx + dir * pose.s1x, cy + pose.s1y);
          bctx.moveTo(cx + dir * pose.wx, cy + pose.wy);
          bctx.quadraticCurveTo(cx + dir * ((pose.wx + pose.s2x) * 0.50), cy + (pose.wy + pose.s2y) * 0.5, cx + dir * pose.s2x, cy + pose.s2y);
          bctx.stroke();
        }
        bctx.restore();

        // Cola membranosa en V, cuerpo aterciopelado y orejas puntiagudas expresivas
        bctx.save();
        bctx.lineJoin = 'round';
        bctx.fillStyle = '#0a0e1c';
        bctx.strokeStyle = '#8fa6f0';
        bctx.lineWidth = 1.65;

        // Cola / uropatagio inferior
        const tailSway = -pose.bodyDy * 0.35;
        bctx.beginPath();
        bctx.moveTo(cx - 4.2, cy + 5.2);
        bctx.lineTo(cx - 2.4 + tailSway, cy + 9.8);
        bctx.lineTo(cx + tailSway * 0.5, cy + 7.4);
        bctx.lineTo(cx + 2.4 + tailSway, cy + 9.8);
        bctx.lineTo(cx + 4.2, cy + 5.2);
        bctx.closePath();
        bctx.fill();
        bctx.stroke();

        // Torso peludo y cabeza
        bctx.beginPath();
        bctx.ellipse(cx, cy + 0.8, 6.4, 7.4, 0, 0, Math.PI * 2);
        bctx.fill();
        bctx.stroke();

        // Mechón de pecho gótico sutil
        bctx.strokeStyle = 'rgba(168, 188, 245, 0.35)';
        bctx.lineWidth = 1.0;
        bctx.beginPath();
        bctx.moveTo(cx - 2.3, cy + 2.2);
        bctx.quadraticCurveTo(cx, cy + 4.2, cx + 2.3, cy + 2.2);
        bctx.stroke();

        // Orejas curvadas alertas
        bctx.fillStyle = '#0b1020';
        bctx.strokeStyle = '#9bb0f0';
        bctx.lineWidth = 1.55;
        for (const dir of [-1, 1]) {
          bctx.beginPath();
          bctx.moveTo(cx + dir * 4.6, cy - 3.8);
          bctx.quadraticCurveTo(cx + dir * (pose.earX + 0.8), cy - 8.2, cx + dir * pose.earX, cy + pose.earY);
          bctx.quadraticCurveTo(cx + dir * 2.8, cy - 8.6, cx + dir * 1.1, cy - 5.8);
          bctx.closePath();
          bctx.fill();
          bctx.stroke();

          // Pliegue interior de la oreja
          bctx.save();
          bctx.strokeStyle = 'rgba(155, 176, 240, 0.32)';
          bctx.lineWidth = 0.9;
          bctx.beginPath();
          bctx.moveTo(cx + dir * 3.4, cy - 5.2);
          bctx.lineTo(cx + dir * (pose.earX * 0.78), cy + pose.earY * 0.78);
          bctx.stroke();
          bctx.restore();
        }
        bctx.restore();

        // Mirada viva orientada ligeramente hacia el jugador (-0.5px) o parpadeo natural + diminutos colmillos
        const eyeCenterX = cx - 0.5;
        if (isBlink) {
          bctx.strokeStyle = '#9bb0f0';
          bctx.lineWidth = 1.25;
          bctx.beginPath();
          bctx.moveTo(eyeCenterX - 3.6, cy - 1.9);
          bctx.lineTo(eyeCenterX - 1.2, cy - 1.7);
          bctx.moveTo(eyeCenterX + 1.2, cy - 1.7);
          bctx.lineTo(eyeCenterX + 3.6, cy - 1.9);
          bctx.stroke();
        } else {
          bctx.fillStyle = 'rgba(126, 151, 230, 0.45)';
          bctx.beginPath();
          bctx.arc(eyeCenterX - 2.4, cy - 2.1, 2.2, 0, Math.PI * 2);
          bctx.arc(eyeCenterX + 2.4, cy - 2.1, 2.2, 0, Math.PI * 2);
          bctx.fill();

          bctx.fillStyle = '#e4eeff';
          bctx.beginPath();
          bctx.arc(eyeCenterX - 2.4, cy - 2.1, 1.35, 0, Math.PI * 2);
          bctx.arc(eyeCenterX + 2.4, cy - 2.1, 1.35, 0, Math.PI * 2);
          bctx.fill();
        }

        // Diminutos colmillos blancos góticos
        bctx.fillStyle = 'rgba(232, 240, 255, 0.88)';
        bctx.beginPath();
        bctx.moveTo(eyeCenterX - 2.0, cy + 0.6);
        bctx.lineTo(eyeCenterX - 1.4, cy + 2.3);
        bctx.lineTo(eyeCenterX - 0.8, cy + 0.6);
        bctx.moveTo(eyeCenterX + 0.8, cy + 0.6);
        bctx.lineTo(eyeCenterX + 1.4, cy + 2.3);
        bctx.lineTo(eyeCenterX + 2.0, cy + 0.6);
        bctx.fill();

        return c;
      };

      const bats = batPoses.map((pose) => renderBatFrame(pose, false));
      const batsBlink = batPoses.map((pose) => renderBatFrame(pose, true));

      // 4. Trazos transparentes de la Moneda de 200 Pesos (Cruz "200 PESOS" y Cara Quimbaya)
      const coinInner = 164;
      const coinPad = 16;
      const coinTotal = coinInner + coinPad * 2;
      const coinCenter = coinTotal * 0.5;
      const rOuter = coinInner * 0.5; // 82
      const rInnerRim = 76.5;

      const drawCurvedCoinLegend = (cctx, str, radius, startAng, endAng, uprightBottom) => {
        if (!str || str.length === 0) return;
        const step = str.length > 1 ? (endAng - startAng) / (str.length - 1) : 0;
        for (let i = 0; i < str.length; i++) {
          const ch = str[i];
          if (ch === ' ') continue;
          const ang = startAng + step * i;
          cctx.save();
          cctx.translate(coinCenter + Math.cos(ang) * radius, coinCenter + Math.sin(ang) * radius);
          cctx.rotate(uprightBottom ? (ang - Math.PI * 0.5) : (ang + Math.PI * 0.5));
          cctx.fillText(ch, 0, 0);
          cctx.restore();
        }
      };

      // 4A. Cruz / Sello: "REPUBLICA DE COLOMBIA · 2005" + estrías verticales + "200 PESOS" en trazos
      const coinCruz = document.createElement('canvas');
      coinCruz.width = coinTotal;
      coinCruz.height = coinTotal;
      const xctx = coinCruz.getContext('2d');

      // Anillos exteriores e interior en trazos luminosos sobre fondo 100% transparente
      xctx.save();
      xctx.shadowColor = 'rgba(90, 116, 191, 0.78)';
      xctx.shadowBlur = 8;
      xctx.strokeStyle = '#a8bcf5';
      xctx.lineWidth = 2.4;
      xctx.beginPath();
      xctx.arc(coinCenter, coinCenter, rOuter, 0, Math.PI * 2);
      xctx.stroke();

      xctx.strokeStyle = 'rgba(155, 176, 240, 0.75)';
      xctx.lineWidth = 1.4;
      xctx.beginPath();
      xctx.arc(coinCenter, coinCenter, rInnerRim, 0, Math.PI * 2);
      xctx.stroke();

      xctx.strokeStyle = '#9bb0f0';
      xctx.lineWidth = 1.8;
      xctx.beginPath();
      xctx.arc(coinCenter, coinCenter, 49.5, 0, Math.PI * 2);
      xctx.stroke();
      xctx.restore();

      // Líneas verticales paralelas del círculo central recortando limpiamente la reserva transparente de "200" y "PESOS"
      const striaLayer = document.createElement('canvas');
      striaLayer.width = coinTotal;
      striaLayer.height = coinTotal;
      const sctx = striaLayer.getContext('2d');
      sctx.save();
      sctx.beginPath();
      sctx.arc(coinCenter, coinCenter, 47.8, 0, Math.PI * 2);
      sctx.clip();
      sctx.strokeStyle = 'rgba(140, 162, 230, 0.36)';
      sctx.lineWidth = 1.1;
      sctx.beginPath();
      for (let dx = -46; dx <= 46; dx += 3.8) {
        sctx.moveTo(coinCenter + dx, coinCenter - 48);
        sctx.lineTo(coinCenter + dx, coinCenter + 48);
      }
      sctx.stroke();

      // Despejar en transparente el área exacta bajo los trazos de "200" y "PESOS"
      sctx.globalCompositeOperation = 'destination-out';
      sctx.textAlign = 'center';
      sctx.textBaseline = 'middle';
      sctx.lineJoin = 'round';
      sctx.font = "700 37px 'Cinzel', Georgia, serif";
      sctx.lineWidth = 6.5;
      sctx.strokeText('200', coinCenter, coinCenter - 9);
      sctx.fillText('200', coinCenter, coinCenter - 9);
      sctx.font = "700 15.5px 'Cinzel', Georgia, serif";
      sctx.lineWidth = 5.5;
      sctx.strokeText('PESOS', coinCenter, coinCenter + 19.5);
      sctx.fillText('PESOS', coinCenter, coinCenter + 19.5);
      sctx.restore();

      xctx.drawImage(striaLayer, 0, 0);

      // Trazos centrales "200" y "PESOS"
      xctx.save();
      xctx.textAlign = 'center';
      xctx.textBaseline = 'middle';
      xctx.lineJoin = 'round';
      xctx.shadowColor = 'rgba(140, 162, 230, 0.72)';
      xctx.shadowBlur = 5;

      xctx.font = "700 37px 'Cinzel', Georgia, serif";
      xctx.fillStyle = 'rgba(140, 162, 230, 0.10)';
      xctx.fillText('200', coinCenter, coinCenter - 9);
      xctx.strokeStyle = '#eef3ff';
      xctx.lineWidth = 2.1;
      xctx.strokeText('200', coinCenter, coinCenter - 9);

      xctx.font = "700 15.5px 'Cinzel', Georgia, serif";
      xctx.strokeStyle = '#dce6ff';
      xctx.lineWidth = 1.35;
      xctx.strokeText('PESOS', coinCenter, coinCenter + 19.5);
      xctx.fillStyle = 'rgba(238, 243, 255, 0.35)';
      xctx.fillText('PESOS', coinCenter, coinCenter + 19.5);
      xctx.restore();

      // Leyenda perimetral "REPUBLICA DE COLOMBIA" arriba y "2005" abajo
      xctx.save();
      xctx.textAlign = 'center';
      xctx.textBaseline = 'middle';
      xctx.fillStyle = '#cfdcfb';
      xctx.shadowColor = 'rgba(90, 116, 191, 0.65)';
      xctx.shadowBlur = 3;
      xctx.font = "700 11px 'Cinzel', Georgia, serif";
      drawCurvedCoinLegend(
        xctx,
        'REPUBLICA  DE  COLOMBIA',
        63,
        -Math.PI * 0.5 - 2.08,
        -Math.PI * 0.5 + 2.08,
        false
      );
      xctx.font = "700 11.5px 'Cinzel', Georgia, serif";
      drawCurvedCoinLegend(
        xctx,
        '2005',
        63.5,
        Math.PI * 0.5 + 0.32,
        Math.PI * 0.5 - 0.32,
        true
      );
      xctx.restore();

      // 4B. Cara: Volante de huso Quimbaya (anillo punteado, cruz de 4 brazos estriados y 4 cabezas/aletas con ojos ◎)
      const coinCara = document.createElement('canvas');
      coinCara.width = coinTotal;
      coinCara.height = coinTotal;
      const qctx = coinCara.getContext('2d');

      qctx.save();
      qctx.shadowColor = 'rgba(90, 116, 191, 0.78)';
      qctx.shadowBlur = 8;
      qctx.strokeStyle = '#a8bcf5';
      qctx.lineWidth = 2.4;
      qctx.beginPath();
      qctx.arc(coinCenter, coinCenter, rOuter, 0, Math.PI * 2);
      qctx.stroke();

      qctx.strokeStyle = 'rgba(155, 176, 240, 0.75)';
      qctx.lineWidth = 1.4;
      qctx.beginPath();
      qctx.arc(coinCenter, coinCenter, rInnerRim, 0, Math.PI * 2);
      qctx.stroke();
      qctx.restore();

      // Corona interior de 48 puntos labrados
      qctx.save();
      qctx.strokeStyle = '#9bb0f0';
      qctx.fillStyle = 'rgba(220, 230, 255, 0.28)';
      qctx.lineWidth = 1.15;
      for (let i = 0; i < 48; i++) {
        const a = (i / 48) * Math.PI * 2;
        const bx = coinCenter + Math.cos(a) * 70.5;
        const by = coinCenter + Math.sin(a) * 70.5;
        qctx.beginPath();
        qctx.arc(bx, by, 1.55, 0, Math.PI * 2);
        qctx.fill();
        qctx.stroke();
      }
      qctx.restore();

      // Geometría rotacional exacta de 4 cuadrantes del motivo Quimbaya
      const rotQ = (x, y, k) => {
        if (k === 1) return { x: -y, y: x };
        if (k === 2) return { x: -x, y: -y };
        if (k === 3) return { x: y, y: -x };
        return { x: x, y: y };
      };

      qctx.save();
      qctx.translate(coinCenter, coinCenter);
      qctx.lineJoin = 'round';
      qctx.lineCap = 'round';
      qctx.shadowColor = 'rgba(140, 162, 230, 0.75)';
      qctx.shadowBlur = 5;

      qctx.beginPath();
      const startPt = rotQ(-16, -48, 0);
      qctx.moveTo(startPt.x, startPt.y);

      for (let k = 0; k < 4; k++) {
        const p1 = rotQ(-16, -59.2, k);
        const c1 = rotQ(-12.2, -61.0, k);
        const p2 = rotQ(-8.6, -61.3, k);
        const p3 = rotQ(-8.6, -20.5, k);
        const p4 = rotQ(-4.4, -20.5, k);
        const p5 = rotQ(-4.4, -61.8, k);
        const c2 = rotQ(0, -62.2, k);
        const p6 = rotQ(4.4, -61.8, k);
        const p7 = rotQ(4.4, -20.5, k);
        const p8 = rotQ(8.6, -20.5, k);
        const p9 = rotQ(8.6, -61.3, k);
        const c3 = rotQ(12.2, -61.0, k);
        const p10 = rotQ(16, -59.2, k);
        const p11 = rotQ(16, -23.5, k);
        const c4 = rotQ(21.5, -26.5, k);
        const p12 = rotQ(27.2, -35.5, k);
        const p13 = rotQ(24.5, -53.0, k);
        const c5 = rotQ(43.8, -43.8, k);
        const p14 = rotQ(54.2, -21.5, k);
        const p15 = rotQ(48, -16, k);

        qctx.lineTo(p1.x, p1.y);
        qctx.quadraticCurveTo(c1.x, c1.y, p2.x, p2.y);
        qctx.lineTo(p3.x, p3.y);
        qctx.lineTo(p4.x, p4.y);
        qctx.lineTo(p5.x, p5.y);
        qctx.quadraticCurveTo(c2.x, c2.y, p6.x, p6.y);
        qctx.lineTo(p7.x, p7.y);
        qctx.lineTo(p8.x, p8.y);
        qctx.lineTo(p9.x, p9.y);
        qctx.quadraticCurveTo(c3.x, c3.y, p10.x, p10.y);
        qctx.lineTo(p11.x, p11.y);
        qctx.quadraticCurveTo(c4.x, c4.y, p12.x, p12.y);
        qctx.lineTo(p13.x, p13.y);
        qctx.quadraticCurveTo(c5.x, c5.y, p14.x, p14.y);
        qctx.lineTo(p15.x, p15.y);
      }
      qctx.closePath();

      qctx.fillStyle = 'rgba(140, 162, 230, 0.08)';
      qctx.fill();
      qctx.strokeStyle = '#eef3ff';
      qctx.lineWidth = 2.15;
      qctx.stroke();

      // Escalón interior grabado y los 4 ojos circulares Quimbaya (◎)
      for (let k = 0; k < 4; k++) {
        const sA = rotQ(51.5, -21.5, k);
        const sB = rotQ(32.5, -21.5, k);
        qctx.strokeStyle = 'rgba(155, 176, 240, 0.62)';
        qctx.lineWidth = 1.35;
        qctx.beginPath();
        qctx.moveTo(sA.x, sA.y);
        qctx.lineTo(sB.x, sB.y);
        qctx.stroke();

        const eye = rotQ(38.5, -31.0, k);
        qctx.strokeStyle = '#eef3ff';
        qctx.lineWidth = 1.85;
        qctx.beginPath();
        qctx.arc(eye.x, eye.y, 5.8, 0, Math.PI * 2);
        qctx.stroke();

        qctx.fillStyle = '#eef3ff';
        qctx.beginPath();
        qctx.arc(eye.x, eye.y, 1.85, 0, Math.PI * 2);
        qctx.fill();
      }

      // Orificio central del volante de huso
      qctx.strokeStyle = 'rgba(155, 176, 240, 0.55)';
      qctx.lineWidth = 1.2;
      qctx.beginPath();
      qctx.arc(0, 0, 11, 0, Math.PI * 2);
      qctx.stroke();

      qctx.strokeStyle = '#eef3ff';
      qctx.lineWidth = 2.2;
      qctx.beginPath();
      qctx.arc(0, 0, 8.2, 0, Math.PI * 2);
      qctx.stroke();
      qctx.restore();

      return {
        logo: logoCanvas,
        logoInner: logoInner,
        logoPad: logoPad,
        tombstones: tombstones,
        tombPad: 4,
        bats: bats,
        batsBlink: batsBlink,
        batPad: 4,
        coinCruz: coinCruz,
        coinCara: coinCara,
        coinInner: coinInner,
        coinPad: coinPad
      };
    }

window.initBlutuDinoEasterEgg = initBlutuDinoEasterEgg;
window.destroyBlutuDinoEasterEgg = destroyBlutuDinoEasterEgg;
window.pauseBlutuGameMusicTemporary = pauseBlutuGameMusicTemporary;

