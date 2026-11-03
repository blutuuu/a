/* Blutu — Motores de Minijuegos Bajo Demanda (Memorama 4x5 y 6x6)
   Solo se importa cuando el usuario abre o juega un minijuego y se destruye por completo al salir */
import { buildDefaultGothicCardSvgDataUri, createDefaultGamesData } from "./data-defaults.js";
import {
  preloadSharedGameMusicApi,
  startSharedGameMusic,
  notifySharedGameUserGesture,
  isSharedGameMusicActive,
  isSharedGameMusicMuted,
  registerSharedMuteButton,
  stopAndDestroySharedGameMusic
} from "./game-audio.js";

// Pre-calentar la API de música sin reproducir ni crear reproductores aún cuando el módulo se importa al abrir el blog del juego
preloadSharedGameMusicApi();

let activeMiniGame = null;
window.activeMiniGame = null;

function setActiveMiniGame(val) {
  activeMiniGame = val;
  window.activeMiniGame = val;
}

function escapeAttr(str) {
  return typeof window.escapeHtmlAttr === "function" ? window.escapeHtmlAttr(str) : String(str || "");
}
function escapeTxt(str) {
  return typeof window.escapeHtmlText === "function" ? window.escapeHtmlText(str) : String(str || "");
}
function normHex(col) {
  return typeof window.normalizeCssColorToHex === "function" ? window.normalizeCssColorToHex(col) : String(col || "");
}
function btnStyleAttr(col) {
  return typeof window.computeGameButtonStyleAttr === "function" ? window.computeGameButtonStyleAttr(col) : "";
}

function buildMiniGameMuteButtonHTML(btnId) {
  const muted = isSharedGameMusicMuted();
  const label = muted ? "Activar música" : "Silenciar música";
  const icon = muted
    ? '<i class="fa-solid fa-volume-xmark" aria-hidden="true"></i>'
    : '<i class="fa-solid fa-volume-high" aria-hidden="true"></i>';
  return `<button type="button" id="${escapeAttr(btnId)}" class="minigame-mute-btn${muted ? ' is-muted' : ''}" aria-label="${escapeAttr(label)}" aria-pressed="${muted ? 'true' : 'false'}" title="${escapeAttr(label)}" onclick="event.stopPropagation(); toggleSharedGameMute();">${icon}</button>`;
}

const VSPC_TURN_CSS_VARS = [
  "--vspc-win-bg",
  "--vspc-win-border",
  "--vspc-win-glow",
  "--vspc-win-inner-glow",
  "--vspc-turn-hud-bg",
  "--vspc-turn-hud-border",
  "--vspc-turn-accent",
  "--vspc-card-back-border",
  "--vspc-card-emblem"
];

function parseHexToRgb(hexStr, fallback) {
  const clean = String(hexStr || "").trim().replace(/^#/, "");
  if (/^[0-9a-fA-F]{6}$/.test(clean)) {
    return {
      r: parseInt(clean.slice(0, 2), 16),
      g: parseInt(clean.slice(2, 4), 16),
      b: parseInt(clean.slice(4, 6), 16)
    };
  }
  if (/^[0-9a-fA-F]{3}$/.test(clean)) {
    return {
      r: parseInt(clean[0] + clean[0], 16),
      g: parseInt(clean[1] + clean[1], 16),
      b: parseInt(clean[2] + clean[2], 16)
    };
  }
  return fallback;
}

function buildVsPcTurnThemeVars(hexColor, fallbackRgb) {
  const { r, g, b } = parseHexToRgb(hexColor, fallbackRgb);
  const bgR = Math.round(8 * 0.68 + r * 0.32);
  const bgG = Math.round(10 * 0.68 + g * 0.32);
  const bgB = Math.round(16 * 0.68 + b * 0.32);

  const hudR = Math.round(5 * 0.74 + r * 0.26);
  const hudG = Math.round(7 * 0.74 + g * 0.26);
  const hudB = Math.round(12 * 0.74 + b * 0.26);

  const borderR = Math.min(255, Math.round(r + (255 - r) * 0.42));
  const borderG = Math.min(255, Math.round(g + (255 - g) * 0.42));
  const borderB = Math.min(255, Math.round(b + (255 - b) * 0.42));

  const accentR = Math.min(255, Math.round(r + (255 - r) * 0.62));
  const accentG = Math.min(255, Math.round(g + (255 - g) * 0.62));
  const accentB = Math.min(255, Math.round(b + (255 - b) * 0.62));

  return {
    "--vspc-win-bg": `rgb(${bgR}, ${bgG}, ${bgB})`,
    "--vspc-win-border": `rgb(${borderR}, ${borderG}, ${borderB})`,
    "--vspc-win-glow": `rgba(${r}, ${g}, ${b}, 0.54)`,
    "--vspc-win-inner-glow": `rgba(${r}, ${g}, ${b}, 0.24)`,
    "--vspc-turn-hud-bg": `rgba(${hudR}, ${hudG}, ${hudB}, 0.92)`,
    "--vspc-turn-hud-border": `rgba(${borderR}, ${borderG}, ${borderB}, 0.66)`,
    "--vspc-turn-accent": `rgb(${accentR}, ${accentG}, ${accentB})`,
    "--vspc-card-back-border": `rgba(${borderR}, ${borderG}, ${borderB}, 0.5)`,
    "--vspc-card-emblem": `rgba(${accentR}, ${accentG}, ${accentB}, 0.74)`
  };
}

function clearMemoramaTurnWindowTheme() {
  const modalBox = document.querySelector("#blogReadModal .blog-modal-box");
  if (!modalBox) return;
  modalBox.classList.remove("is-vspc-turn-active", "is-vspc-turn-user", "is-vspc-turn-pc");
  for (let i = 0; i < VSPC_TURN_CSS_VARS.length; i++) {
    modalBox.style.removeProperty(VSPC_TURN_CSS_VARS[i]);
  }
}

function syncMemoramaTurnWindowTheme(game) {
  const modalBox = document.querySelector("#blogReadModal .blog-modal-box");
  if (!modalBox) return;
  if (!game || game.destroyed || game.type !== "memorama" || game.mode === "solo") {
    clearMemoramaTurnWindowTheme();
    return;
  }
  const isUserTurn = game.turn === "user";
  const vars = isUserTurn ? game.userTurnVars : game.pcTurnVars;
  modalBox.classList.add("is-vspc-turn-active");
  modalBox.classList.toggle("is-vspc-turn-user", isUserTurn);
  modalBox.classList.toggle("is-vspc-turn-pc", !isUserTurn);
  if (vars) {
    for (let i = 0; i < VSPC_TURN_CSS_VARS.length; i++) {
      const k = VSPC_TURN_CSS_VARS[i];
      if (vars[k]) modalBox.style.setProperty(k, vars[k]);
    }
  }
}

export function destroyActiveMiniGame(keepAudioAlive = false) {
  if (activeMiniGame) {
    activeMiniGame.destroyed = true;
    if (activeMiniGame.rafId) {
      cancelAnimationFrame(activeMiniGame.rafId);
      activeMiniGame.rafId = null;
    }
    if (activeMiniGame.aiTimeout) {
      clearTimeout(activeMiniGame.aiTimeout);
      activeMiniGame.aiTimeout = null;
    }
    if (activeMiniGame.mismatchTimeout) {
      clearTimeout(activeMiniGame.mismatchTimeout);
      activeMiniGame.mismatchTimeout = null;
    }
    if (activeMiniGame.wrongTapTimeout) {
      clearTimeout(activeMiniGame.wrongTapTimeout);
      activeMiniGame.wrongTapTimeout = null;
    }
    if (activeMiniGame.finishTimer) {
      clearTimeout(activeMiniGame.finishTimer);
      activeMiniGame.finishTimer = null;
    }
    setActiveMiniGame(null);
  }
  clearMemoramaTurnWindowTheme();
  if (!keepAudioAlive) {
    stopAndDestroySharedGameMusic(false);
  }
}

export function launchMiniGameFromBlog(gameType, mode) {
  if (window.isAdminMode && document.getElementById("blogEditableBody") && typeof window.syncLiveBlogModalToMemory === "function") {
    window.syncLiveBlogModalToMemory(true);
  }

  const alreadyPlayingMusic = isSharedGameMusicActive();
  destroyActiveMiniGame(alreadyPlayingMusic);
  window.__isMiniGameScreenOpen = true;
  if (typeof window.clearActiveBatParticles === "function") {
    window.clearActiveBatParticles();
  }

  const modalEl = document.getElementById("blogReadModal");
  const modalBox = document.querySelector("#blogReadModal .blog-modal-box");
  if (modalEl && modalEl.style.display !== "flex") {
    modalEl.style.display = "flex";
    document.body.style.overflow = "hidden";
    if (typeof window.pushModalState === "function") window.pushModalState("blog");
  }
  if (modalBox) {
    modalBox.classList.add("is-minigame-active");
    modalBox.scrollTop = 0;
  }

  // Asegurar que la canción del Easter Egg esté activa durante la partida (sin reiniciarla bruscamente al pulsar Reintentar)
  if (!alreadyPlayingMusic) {
    startSharedGameMusic(modalBox || document.body, "minigameHudMuteBtn");
  } else {
    notifySharedGameUserGesture();
  }

  if (gameType === "memorama") {
    window.currentGameBlogKey = "memorama";
    const resolvedMode = mode === "vspc" ? "vspc-hard" : mode;
    startMemoramaRuntime(resolvedMode);
  } else if (gameType === "sixbysix") {
    window.currentGameBlogKey = "sixbysix";
    startSixBySixRuntime(mode);
  }
}

export function exitMiniGameVolver() {
  const returnKey = window.currentGameBlogKey;
  destroyActiveMiniGame(false);
  window.__isMiniGameScreenOpen = false;
  if (returnKey && window.gamesData && window.gamesData.blogs && window.gamesData.blogs[returnKey] && typeof window.openGameBlogModal === "function") {
    window.openGameBlogModal(returnKey);
  } else if (typeof window.closeBlogModal === "function") {
    window.closeBlogModal(true);
  }
}

function shuffleArrayInPlace(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const tmp = arr[i];
    arr[i] = arr[j];
    arr[j] = tmp;
  }
  return arr;
}

function formatMemoramaTime(ms) {
  const totalTenths = Math.max(0, Math.floor(ms / 100));
  const tenths = totalTenths % 10;
  const totalSecs = Math.floor(totalTenths / 10);
  const mins = Math.floor(totalSecs / 60);
  const secs = totalSecs % 60;
  if (mins > 0) {
    return `${mins}:${String(secs).padStart(2, "0")}.${tenths} s`;
  }
  return `${secs}.${tenths} s`;
}

function resolvePairCropAttrsAndStyle(cropVal) {
  const cleanCrop = String(cropVal || "cover-center").trim() || "cover-center";
  const parsed = typeof window.parsePostImageCrop === "function"
    ? window.parsePostImageCrop(cleanCrop)
    : { isCrop: false };
  const styleStr = typeof window.getFitCssForPost === "function"
    ? window.getFitCssForPost(cleanCrop)
    : "object-fit: cover; object-position: center center;";
  const cls = parsed && parsed.isCrop ? "memorama-card-img blog-thumb-cropped" : "memorama-card-img";
  const extraAttrs = parsed && parsed.isCrop
    ? ` data-crop-z="${Number(parsed.z || 1).toFixed(3)}" onload="if(window.syncBlogCroppedThumbCover){window.syncBlogCroppedThumbCover(this);}"`
    : "";
  return { cls, styleStr, extraAttrs };
}

/* ==================== MOTOR MEMORAMA (4×5 — 10 PAREJAS) ==================== */
function startMemoramaRuntime(mode) {
  const modalBody = document.getElementById("blogModalBody");
  if (!modalBody) return;

  if (!window.gamesData || !window.gamesData.memorama) {
    window.gamesData = createDefaultGamesData();
  }
  const memCfg = window.gamesData.memorama;
  const pairUrls = Array.isArray(memCfg.pairImages) ? memCfg.pairImages.slice(0, 10) : [];
  const pairCrops = Array.isArray(memCfg.pairCrops) ? memCfg.pairCrops.slice(0, 10) : [];
  while (pairUrls.length < 10) {
    pairUrls.push(buildDefaultGothicCardSvgDataUri(String(pairUrls.length + 1), "#8ca2e6"));
  }
  while (pairCrops.length < 10) {
    pairCrops.push("cover-center");
  }

  const deck = [];
  for (let p = 0; p < 10; p++) {
    const fallbackUri = buildDefaultGothicCardSvgDataUri(String(p + 1), "#8ca2e6");
    const url = pairUrls[p] || fallbackUri;
    const cropVal = pairCrops[p] || "cover-center";
    deck.push({ uid: p * 2, pairId: p, imgUrl: url, fallbackUri, cropVal, matched: false, matchedBy: null });
    deck.push({ uid: p * 2 + 1, pairId: p, imgUrl: url, fallbackUri, cropVal, matched: false, matchedBy: null });
  }
  shuffleArrayInPlace(deck);

  const isVsPc = (mode === "vspc-easy" || mode === "vspc-hard" || mode === "vspc");
  const isVsPcEasy = (mode === "vspc-easy");

  const userTurnHex = normHex(memCfg.userTurnColor || "#3b66d4") || "#3b66d4";
  const pcTurnHex = normHex(memCfg.pcTurnColor || "#b83252") || "#b83252";

  const game = {
    type: "memorama",
    mode: isVsPc ? (isVsPcEasy ? "vspc-easy" : "vspc-hard") : "solo",
    isVsPcEasy,
    destroyed: false,
    deck,
    flippedIndices: [],
    pendingMismatchPair: null,
    locked: false,
    turn: "user",
    userPairs: 0,
    pcPairs: 0,
    userTurnVars: isVsPc ? buildVsPcTurnThemeVars(userTurnHex, { r: 59, g: 102, b: 212 }) : null,
    pcTurnVars: isVsPc ? buildVsPcTurnThemeVars(pcTurnHex, { r: 184, g: 50, b: 82 }) : null,
    seenMemory: new Map(),
    startTime: performance.now(),
    rafId: null,
    aiTimeout: null,
    mismatchTimeout: null
  };
  setActiveMiniGame(game);

  const cardsHTML = deck.map((card, idx) => {
    const fbAttr = escapeAttr(card.fallbackUri);
    const { cls, styleStr, extraAttrs } = resolvePairCropAttrsAndStyle(card.cropVal);
    return `
      <button type="button" class="memorama-card" id="memCard_${idx}" data-card-idx="${idx}" aria-label="Carta ${idx + 1}">
        <div class="memorama-card-inner">
          <div class="memorama-card-face memorama-card-back">
            <span class="memorama-card-back-emblem" aria-hidden="true">✠</span>
          </div>
          <div class="memorama-card-face memorama-card-front">
            <img src="${escapeAttr(card.imgUrl)}" alt="" class="${cls}" decoding="async" referrerpolicy="no-referrer"${extraAttrs} style="${styleStr}" onerror="if(this.dataset.fb!=='1'){this.dataset.fb='1';this.src='${fbAttr}';}">
          </div>
        </div>
      </button>
    `;
  }).join("");

  const muteBtnHTML = buildMiniGameMuteButtonHTML("minigameHudMuteBtn");

  if (!isVsPc) {
    // Modo Solo: Botón de silenciar arriba a la izquierda (opuesto a la X de cerrar) + Tiempo centrado abajo (sin contador de parejas)
    modalBody.innerHTML = `
      <div class="minigame-top-mute-wrap">${muteBtnHTML}</div>
      <div class="blutu-minigame-stage">
        <div class="minigame-hud-bar is-solo-memorama">
          <div class="minigame-hud-stat is-center">
            <span class="minigame-hud-label">Tiempo</span>
            <span class="minigame-hud-value" id="memHudTimer">0.0 s</span>
          </div>
        </div>
        <div class="memorama-grid-4x5" id="memoramaGridEl">
          ${cardsHTML}
        </div>
      </div>
    `;

    const tickSolo = (now) => {
      if (!activeMiniGame || activeMiniGame !== game || game.destroyed) return;
      const elapsed = now - game.startTime;
      const timerEl = document.getElementById("memHudTimer");
      if (timerEl) timerEl.textContent = formatMemoramaTime(elapsed);
      game.rafId = requestAnimationFrame(tickSolo);
    };
    game.rafId = requestAnimationFrame(tickSolo);
  } else {
    const diffBadge = isVsPcEasy ? "Fácil" : "Difícil";
    modalBody.innerHTML = `
      <div class="minigame-top-mute-wrap">${muteBtnHTML}</div>
      <div class="blutu-minigame-stage">
        <div class="minigame-hud-bar is-vspc-memorama">
          <div class="minigame-hud-stat">
            <span class="minigame-hud-label">Tú</span>
            <span class="minigame-hud-value is-active-turn" id="memHudUserScore">0</span>
          </div>
          <div class="minigame-hud-stat is-center">
            <span class="minigame-hud-label">Vs PC · ${diffBadge}</span>
            <span class="minigame-turn-pill" id="memHudTurnText">Tu turno</span>
          </div>
          <div class="minigame-hud-stat is-right">
            <span class="minigame-hud-label">PC</span>
            <span class="minigame-hud-value" id="memHudPcScore">0</span>
          </div>
        </div>
        <div class="memorama-grid-4x5" id="memoramaGridEl">
          ${cardsHTML}
        </div>
      </div>
    `;
    syncMemoramaTurnWindowTheme(game);
  }

  registerSharedMuteButton("minigameHudMuteBtn");

  // Ajustar miniaturas recortadas al montar la rejilla
  requestAnimationFrame(() => {
    if (typeof window.syncBlogCroppedThumbCover === "function") {
      modalBody.querySelectorAll("img.blog-thumb-cropped").forEach(window.syncBlogCroppedThumbCover);
    }
  });

  // Delegación táctil ultrarrápida (pointerdown) para que cada toque con el dedo responda a la primera sin fallos
  const gridEl = document.getElementById("memoramaGridEl");
  if (gridEl) {
    let lastHandledTouchTs = 0;
    const onFastCardInput = (ev) => {
      if (ev.type === "pointerdown" && ev.button !== undefined && ev.button > 0) return;
      const cardBtn = ev.target && ev.target.closest ? ev.target.closest(".memorama-card") : null;
      if (!cardBtn) return;
      const idx = parseInt(cardBtn.getAttribute("data-card-idx") || "-1", 10);
      if (!Number.isFinite(idx) || idx < 0) return;

      const nowTs = performance.now();
      if (ev.type === "click" && (nowTs - lastHandledTouchTs) < 450) return;
      if (ev.type !== "click") {
        lastHandledTouchTs = nowTs;
        if (ev.cancelable) ev.preventDefault();
      }

      notifySharedGameUserGesture();
      handleMemoramaCardTap(idx);
    };

    if (window.PointerEvent) {
      gridEl.addEventListener("pointerdown", onFastCardInput);
    } else {
      gridEl.addEventListener("touchstart", onFastCardInput, { passive: false });
      gridEl.addEventListener("mousedown", onFastCardInput);
    }
    gridEl.addEventListener("click", onFastCardInput);
  }
}

function recordMemoramaSeenCard(game, cardIndex) {
  if (!game || !game.deck[cardIndex]) return;
  const pairId = game.deck[cardIndex].pairId;
  if (game.seenMemory.has(cardIndex)) {
    game.seenMemory.delete(cardIndex);
  }
  game.seenMemory.set(cardIndex, pairId);

  // En Fácil la PC recuerda hasta 7 cartas recientes (desafiante pero humano); en Difícil tiene memoria aguda de 11 cartas
  const maxMemory = game.isVsPcEasy ? 7 : 11;
  while (game.seenMemory.size > maxMemory) {
    const oldestKey = game.seenMemory.keys().next().value;
    game.seenMemory.delete(oldestKey);
  }
}

function setMemoramaCardFlippedDOM(idx, flipped, matchedBy) {
  const el = document.getElementById(`memCard_${idx}`);
  if (!el) return;
  el.classList.toggle("is-flipped", Boolean(flipped));
  if (matchedBy) {
    el.classList.add("is-matched");
    if (matchedBy === "pc") el.classList.add("is-matched-pc");
    el.disabled = true;
  }
}

function updateMemoramaVsPcHud(game) {
  const uEl = document.getElementById("memHudUserScore");
  const pEl = document.getElementById("memHudPcScore");
  const tEl = document.getElementById("memHudTurnText");
  if (uEl) {
    uEl.textContent = String(game.userPairs);
    uEl.classList.toggle("is-active-turn", game.turn === "user");
  }
  if (pEl) {
    pEl.textContent = String(game.pcPairs);
    pEl.classList.toggle("is-active-turn", game.turn === "pc");
  }
  if (tEl) {
    tEl.textContent = game.turn === "user" ? "Tu turno" : "Turno de PC...";
  }
  syncMemoramaTurnWindowTheme(game);
}

export function handleMemoramaCardTap(idx) {
  const game = activeMiniGame;
  if (!game || game.destroyed || game.type !== "memorama") return;
  if (game.mode !== "solo" && game.turn !== "user") return;

  // Si en modo Solo había 2 cartas fallidas cerrándose y el jugador ya toca la siguiente carta, cerrar de inmediato sin bloquear el toque
  if (game.locked && game.mode === "solo" && game.pendingMismatchPair) {
    const [mA, mB] = game.pendingMismatchPair;
    if (game.mismatchTimeout) {
      clearTimeout(game.mismatchTimeout);
      game.mismatchTimeout = null;
    }
    game.pendingMismatchPair = null;
    setMemoramaCardFlippedDOM(mA, false, null);
    setMemoramaCardFlippedDOM(mB, false, null);
    game.flippedIndices = [];
    game.locked = false;
  }

  if (game.locked) return;
  const card = game.deck[idx];
  if (!card || card.matched) return;
  if (game.flippedIndices.includes(idx)) return;

  flipMemoramaCardInternal(game, idx);
}

function flipMemoramaCardInternal(game, idx) {
  if (!game || game.destroyed) return;
  const card = game.deck[idx];
  if (!card || card.matched || game.flippedIndices.includes(idx)) return;

  game.flippedIndices.push(idx);
  setMemoramaCardFlippedDOM(idx, true, null);
  recordMemoramaSeenCard(game, idx);

  if (game.flippedIndices.length === 2) {
    game.locked = true;
    const [firstIdx, secondIdx] = game.flippedIndices;
    const firstCard = game.deck[firstIdx];
    const secondCard = game.deck[secondIdx];

    if (firstCard.pairId === secondCard.pairId) {
      const winner = game.mode === "solo" ? "user" : game.turn;
      firstCard.matched = true;
      secondCard.matched = true;
      firstCard.matchedBy = winner;
      secondCard.matchedBy = winner;
      game.seenMemory.delete(firstIdx);
      game.seenMemory.delete(secondIdx);

      setMemoramaCardFlippedDOM(firstIdx, true, winner);
      setMemoramaCardFlippedDOM(secondIdx, true, winner);

      if (winner === "user") game.userPairs++;
      else game.pcPairs++;

      game.flippedIndices = [];
      game.pendingMismatchPair = null;

      if (game.mode !== "solo") {
        updateMemoramaVsPcHud(game);
      }

      const totalMatched = game.userPairs + game.pcPairs;
      if (totalMatched >= 10) {
        const finalElapsed = performance.now() - game.startTime;
        if (game.rafId) {
          cancelAnimationFrame(game.rafId);
          game.rafId = null;
        }
        const timerEl = document.getElementById("memHudTimer");
        if (timerEl) timerEl.textContent = formatMemoramaTime(finalElapsed);
        const gridDoneEl = document.getElementById("memoramaGridEl");
        if (gridDoneEl) gridDoneEl.classList.add("is-board-complete");

        game.finishTimer = setTimeout(() => {
          if (!activeMiniGame || activeMiniGame !== game || game.destroyed) return;
          finishMemoramaMatch(game, finalElapsed);
        }, 1150);
        return;
      }

      if (game.mode === "solo" || game.turn === "user") {
        game.locked = false;
      } else {
        schedulePcMemoramaTurn(game, 540);
      }
    } else {
      game.pendingMismatchPair = [firstIdx, secondIdx];
      game.mismatchTimeout = setTimeout(() => {
        if (!activeMiniGame || activeMiniGame !== game || game.destroyed) return;
        game.pendingMismatchPair = null;
        setMemoramaCardFlippedDOM(firstIdx, false, null);
        setMemoramaCardFlippedDOM(secondIdx, false, null);
        game.flippedIndices = [];

        if (game.mode === "solo") {
          game.locked = false;
        } else {
          game.turn = game.turn === "user" ? "pc" : "user";
          updateMemoramaVsPcHud(game);
          if (game.turn === "pc") {
            schedulePcMemoramaTurn(game, 440);
          } else {
            game.locked = false;
          }
        }
      }, 680);
    }
  }
}

function findKnownPairInMemory(game) {
  if (game.isVsPcEasy && Math.random() > 0.68) {
    return null;
  }
  const byPair = new Map();
  for (const [cardIdx, pairId] of game.seenMemory.entries()) {
    const c = game.deck[cardIdx];
    if (!c || c.matched) continue;
    if (byPair.has(pairId)) {
      return [byPair.get(pairId), cardIdx];
    }
    byPair.set(pairId, cardIdx);
  }
  return null;
}

function findMatchingCardInMemory(game, targetPairId, excludeIdx) {
  if (game.isVsPcEasy && Math.random() > 0.78) {
    return -1;
  }
  for (const [cardIdx, pairId] of game.seenMemory.entries()) {
    if (cardIdx !== excludeIdx && pairId === targetPairId && game.deck[cardIdx] && !game.deck[cardIdx].matched) {
      return cardIdx;
    }
  }
  return -1;
}

function schedulePcMemoramaTurn(game, delayMs) {
  if (!game || game.destroyed) return;
  game.locked = true;
  if (game.aiTimeout) clearTimeout(game.aiTimeout);

  game.aiTimeout = setTimeout(() => {
    if (!activeMiniGame || activeMiniGame !== game || game.destroyed || game.turn !== "pc") return;

    const unmatchedIndices = [];
    for (let i = 0; i < game.deck.length; i++) {
      if (!game.deck[i].matched) unmatchedIndices.push(i);
    }
    if (unmatchedIndices.length < 2) return;

    const knownPair = findKnownPairInMemory(game);
    let firstPick = -1;
    let plannedSecondPick = -1;

    if (knownPair) {
      firstPick = knownPair[0];
      plannedSecondPick = knownPair[1];
    } else {
      const unknownIndices = unmatchedIndices.filter(idx => !game.seenMemory.has(idx));
      const preferUnknown = !game.isVsPcEasy || Math.random() < 0.75;
      const pool = (preferUnknown && unknownIndices.length > 0) ? unknownIndices : unmatchedIndices;
      firstPick = pool[Math.floor(Math.random() * pool.length)];
    }

    flipMemoramaCardInternal(game, firstPick);

    game.aiTimeout = setTimeout(() => {
      if (!activeMiniGame || activeMiniGame !== game || game.destroyed || game.turn !== "pc") return;
      let secondPick = plannedSecondPick;
      if (secondPick === -1 || secondPick === firstPick || game.deck[secondPick].matched) {
        const matchFromMem = findMatchingCardInMemory(game, game.deck[firstPick].pairId, firstPick);
        if (matchFromMem !== -1) {
          secondPick = matchFromMem;
        } else {
          const remaining = unmatchedIndices.filter(idx => idx !== firstPick && !game.deck[idx].matched);
          const remainingUnknown = remaining.filter(idx => !game.seenMemory.has(idx));
          const preferUnknown2 = !game.isVsPcEasy || Math.random() < 0.75;
          const pool2 = (preferUnknown2 && remainingUnknown.length > 0) ? remainingUnknown : remaining;
          secondPick = pool2[Math.floor(Math.random() * pool2.length)];
        }
      }
      if (secondPick !== undefined && secondPick !== -1) {
        flipMemoramaCardInternal(game, secondPick);
      }
    }, 520);
  }, delayMs);
}

function buildGothicBatSvgHTML() {
  return `<svg class="minigame-win-bat-svg" viewBox="0 0 64 36" aria-hidden="true" focusable="false">
    <g class="minigame-bat-wing-l"><path d="M30 19 C23 9, 11 4, 1 11 C7 13, 10 17, 9 22 C15 19, 19 21, 21 25 C25 22, 28 22, 30 23 Z"/></g>
    <g class="minigame-bat-wing-r"><path d="M34 19 C41 9, 53 4, 63 11 C57 13, 54 17, 55 22 C49 19, 45 21, 43 25 C39 22, 36 22, 34 23 Z"/></g>
    <path class="minigame-bat-body" d="M29.5 14 L28 9 L31 12.5 L33 12.5 L36 9 L34.5 14 C35.5 18, 35 23, 32 27 C29 23, 28.5 18, 29.5 14 Z"/>
  </svg>`;
}

function buildVictoryBatsBackdropHTML() {
  const specs = [
    { dir: "ltr", top: "14%", size: "38px", dur: "4.4s", delay: "0s", drift: "-26px", flap: "0.26s" },
    { dir: "rtl", top: "24%", size: "30px", dur: "3.9s", delay: "0.35s", drift: "-18px", flap: "0.22s" },
    { dir: "ltr", top: "38%", size: "44px", dur: "4.9s", delay: "0.75s", drift: "-34px", flap: "0.28s" },
    { dir: "rtl", top: "52%", size: "34px", dur: "4.2s", delay: "0.18s", drift: "-22px", flap: "0.24s" },
    { dir: "ltr", top: "66%", size: "28px", dur: "3.7s", delay: "1.1s", drift: "-30px", flap: "0.21s" },
    { dir: "rtl", top: "76%", size: "42px", dur: "4.7s", delay: "0.6s", drift: "-28px", flap: "0.27s" },
    { dir: "ltr", top: "28%", size: "26px", dur: "3.6s", delay: "1.55s", drift: "-20px", flap: "0.2s" },
    { dir: "rtl", top: "44%", size: "40px", dur: "4.6s", delay: "1.35s", drift: "-32px", flap: "0.25s" },
    { dir: "ltr", top: "82%", size: "32px", dur: "4.1s", delay: "1.85s", drift: "-24px", flap: "0.23s" },
    { dir: "rtl", top: "18%", size: "35px", dur: "4.5s", delay: "2.15s", drift: "-26px", flap: "0.25s" }
  ];
  const svg = buildGothicBatSvgHTML();
  const batsHTML = specs.map((s) => (
    `<span class="minigame-win-bat is-${s.dir}" style="--bat-top:${s.top};--bat-size:${s.size};--bat-dur:${s.dur};--bat-delay:${s.delay};--bat-drift:${s.drift};--bat-flap:${s.flap};">${svg}</span>`
  )).join("");
  return `<div class="minigame-win-bats-layer" aria-hidden="true">${batsHTML}</div>`;
}

function buildResultCardCrestHTML() {
  return `
    <div class="minigame-card-crest" aria-hidden="true">
      <span class="minigame-crest-line"></span>
      <img src="blutu_logo.png" alt="" class="minigame-crest-logo" decoding="async">
      <span class="minigame-crest-line"></span>
    </div>
  `;
}

function finishMemoramaMatch(game, elapsedMs) {
  const mode = game.mode;
  const userPairs = game.userPairs;
  const pcPairs = game.pcPairs;

  // Liberar memoria de la partida terminada, manteniendo el indicador de pantalla de resultado y la música hasta que salga o reintente
  destroyActiveMiniGame(true);
  window.__isMiniGameScreenOpen = true;

  const modalBody = document.getElementById("blogModalBody");
  if (!modalBody) return;

  const mem = window.gamesData.memorama;
  const soloStyle = btnStyleAttr(normHex(mem.soloBtnColor || "#5a74bf"));
  const vsPcStyle = btnStyleAttr(normHex(mem.vsPcBtnColor || "#364d8f"));
  const vsPcEasyStyle = btnStyleAttr(normHex(mem.vsPcEasyBtnColor || "#4b67b3"));
  const vsPcHardStyle = btnStyleAttr(normHex(mem.vsPcHardBtnColor || "#2b3e78"));
  const retryStyle = btnStyleAttr(normHex(mem.retryBtnColor || "#4a63ab"));
  const backStyle = btnStyleAttr(normHex(mem.backBtnColor || "#1f2b4d"));

  const muteBtnHTML = buildMiniGameMuteButtonHTML("minigameHudMuteBtn");
  const crestHTML = buildResultCardCrestHTML();

  if (mode === "solo") {
    const timeStr = formatMemoramaTime(elapsedMs);
    const batsHTML = buildVictoryBatsBackdropHTML();
    modalBody.innerHTML = `
      <div class="minigame-top-mute-wrap">${muteBtnHTML}</div>
      <div class="minigame-result-stage is-win-stage">
        ${batsHTML}
        <div class="minigame-result-card is-victory">
          ${crestHTML}
          <span class="minigame-result-kicker">Memorama · Solo</span>
          <h2 class="minigame-result-title is-time-score">${escapeTxt(timeStr)}</h2>
          <div class="minigame-card-divider" aria-hidden="true"><span>✠</span></div>
          <div class="minigame-result-buttons">
            <div class="minigame-result-primary-row">
              <button type="button" class="game-custom-btn" style="${retryStyle}" onclick="launchMiniGameFromBlog('memorama', 'solo')">Reintentar</button>
              <button type="button" class="game-custom-btn" style="${vsPcStyle}" onclick="toggleMemoramaVsPcDifficultyRow('soloResultVsPcDiffRow')">Vs PC</button>
            </div>
            <div id="soloResultVsPcDiffRow" class="game-blog-vspc-subrow" style="display:none;">
              <button type="button" class="game-custom-btn is-submode-btn" style="${vsPcEasyStyle}" onclick="launchMiniGameFromBlog('memorama', 'vspc-easy')">Fácil</button>
              <button type="button" class="game-custom-btn is-submode-btn" style="${vsPcHardStyle}" onclick="launchMiniGameFromBlog('memorama', 'vspc-hard')">Difícil</button>
            </div>
            <button type="button" class="game-custom-btn is-volver-btn" style="${backStyle}" onclick="exitMiniGameVolver()">Volver</button>
          </div>
        </div>
      </div>
    `;
  } else {
    let outcomeTitle = "Empate";
    let cardTone = "is-neutral";
    const didUserWin = userPairs > pcPairs;
    if (didUserWin) {
      outcomeTitle = "Tú ganas";
      cardTone = "is-victory";
    } else if (pcPairs > userPairs) {
      outcomeTitle = "PC gana";
      cardTone = "is-defeat";
    }

    const currentDiffLabel = mode === "vspc-easy" ? "Fácil" : "Difícil";
    const otherVsMode = mode === "vspc-easy" ? "vspc-hard" : "vspc-easy";
    const otherVsLabel = mode === "vspc-easy" ? "Difícil" : "Fácil";
    const otherVsStyle = mode === "vspc-easy" ? vsPcHardStyle : vsPcEasyStyle;
    const batsHTML = didUserWin ? buildVictoryBatsBackdropHTML() : "";

    modalBody.innerHTML = `
      <div class="minigame-top-mute-wrap">${muteBtnHTML}</div>
      <div class="minigame-result-stage${didUserWin ? " is-win-stage" : ""}">
        ${batsHTML}
        <div class="minigame-result-card ${cardTone}">
          ${crestHTML}
          <span class="minigame-result-kicker">Memorama · Vs PC ${currentDiffLabel}</span>
          <h2 class="minigame-result-title">${outcomeTitle}</h2>
          <div class="minigame-duel-scoreboard">
            <div class="minigame-duel-side${userPairs >= pcPairs ? " is-winner" : ""}">
              <span class="minigame-duel-label">Tú</span>
              <span class="minigame-duel-score">${userPairs}</span>
            </div>
            <span class="minigame-duel-sep" aria-hidden="true">✠</span>
            <div class="minigame-duel-side${pcPairs >= userPairs ? " is-winner" : ""}">
              <span class="minigame-duel-label">PC</span>
              <span class="minigame-duel-score">${pcPairs}</span>
            </div>
          </div>
          <div class="minigame-card-divider" aria-hidden="true"><span>✠</span></div>
          <div class="minigame-result-buttons">
            <div class="minigame-result-primary-row">
              <button type="button" class="game-custom-btn" style="${retryStyle}" onclick="launchMiniGameFromBlog('memorama', '${mode}')">Reintentar</button>
              <button type="button" class="game-custom-btn" style="${otherVsStyle}" onclick="launchMiniGameFromBlog('memorama', '${otherVsMode}')">Vs PC ${otherVsLabel}</button>
              <button type="button" class="game-custom-btn" style="${soloStyle}" onclick="launchMiniGameFromBlog('memorama', 'solo')">Solo</button>
            </div>
            <button type="button" class="game-custom-btn is-volver-btn" style="${backStyle}" onclick="exitMiniGameVolver()">Volver</button>
          </div>
        </div>
      </div>
    `;
  }
  registerSharedMuteButton("minigameHudMuteBtn");
}

/* ==================== MOTOR 6X6 (1 AL 36 — 40 SEGUNDOS) ==================== */
function startSixBySixRuntime(mode) {
  const modalBody = document.getElementById("blogModalBody");
  if (!modalBody) return;

  if (!window.gamesData || !window.gamesData.sixBySix) {
    window.gamesData = createDefaultGamesData();
  }

  const numbers = [];
  for (let n = 1; n <= 36; n++) numbers.push(n);
  shuffleArrayInPlace(numbers);

  const isHard = mode === "hard";
  const durationMs = 40000;

  const game = {
    type: "sixbysix",
    mode: isHard ? "hard" : "easy",
    destroyed: false,
    numbers,
    nextExpected: 1,
    highestReached: 0,
    startTime: performance.now(),
    durationMs,
    rafId: null,
    wrongTapTimeout: null
  };
  setActiveMiniGame(game);

  const cellsHTML = numbers.map((num, idx) => {
    if (isHard) {
      return `<div class="sixbysix-cell is-non-interactive" aria-label="${num}"><span class="sixbysix-cell-num">${num}</span></div>`;
    }
    return `<button type="button" class="sixbysix-cell" id="sixCell_${idx}" data-six-idx="${idx}" data-six-num="${num}"><span class="sixbysix-cell-num">${num}</span></button>`;
  }).join("");

  const sixCfg = window.gamesData.sixBySix;
  const finishStyle = btnStyleAttr(normHex(sixCfg.finishBtnColor || "#41599f"));
  const muteBtnHTML = buildMiniGameMuteButtonHTML("minigameHudMuteBtn");

  modalBody.innerHTML = `
    <div class="minigame-top-mute-wrap">${muteBtnHTML}</div>
    <div class="blutu-minigame-stage">
      <div class="minigame-hud-bar is-sixbysix-hud">
        <div class="minigame-hud-stat is-six-side">
          <span class="minigame-hud-label">Tiempo</span>
          <span class="minigame-hud-value" id="sixHudTimer">40.0 s</span>
        </div>
        ${isHard ? `
          <div class="minigame-hud-stat is-center is-six-center">
            <span class="minigame-hud-label">Modo</span>
            <span class="minigame-hud-value">Difícil</span>
          </div>
          <div class="minigame-hud-spacer" aria-hidden="true"></div>
        ` : `
          <div class="minigame-hud-stat is-center is-six-center">
            <span class="six-hud-big-target" id="sixHudNextNum">1</span>
          </div>
          <div class="minigame-hud-spacer" aria-hidden="true"></div>
        `}
      </div>

      <div class="sixbysix-grid" id="sixBySixGridEl">
        ${cellsHTML}
      </div>

      ${isHard ? `
        <div style="margin-top:6px;">
          <button type="button" class="game-custom-btn" style="${finishStyle}" onclick="finishSixBySixHardManual()">Terminar</button>
        </div>
      ` : ""}
    </div>
  `;

  registerSharedMuteButton("minigameHudMuteBtn");

  if (!isHard) {
    const gridEl = document.getElementById("sixBySixGridEl");
    if (gridEl) {
      let lastHandledTouchTs = 0;
      const onFastSixInput = (ev) => {
        if (ev.type === "pointerdown" && ev.button !== undefined && ev.button > 0) return;
        const cellBtn = ev.target && ev.target.closest ? ev.target.closest(".sixbysix-cell") : null;
        if (!cellBtn || cellBtn.classList.contains("is-disappeared")) return;
        const idx = parseInt(cellBtn.getAttribute("data-six-idx") || "-1", 10);
        const num = parseInt(cellBtn.getAttribute("data-six-num") || "-1", 10);
        if (!Number.isFinite(idx) || idx < 0 || !Number.isFinite(num) || num < 1) return;

        const nowTs = performance.now();
        if (ev.type === "click" && (nowTs - lastHandledTouchTs) < 450) return;
        if (ev.type !== "click") {
          lastHandledTouchTs = nowTs;
          if (ev.cancelable) ev.preventDefault();
        }

        notifySharedGameUserGesture();
        handleSixBySixCellTap(idx, num);
      };

      if (window.PointerEvent) {
        gridEl.addEventListener("pointerdown", onFastSixInput);
      } else {
        gridEl.addEventListener("touchstart", onFastSixInput, { passive: false });
        gridEl.addEventListener("mousedown", onFastSixInput);
      }
      gridEl.addEventListener("click", onFastSixInput);
    }
  }

  const tickSix = (now) => {
    if (!activeMiniGame || activeMiniGame !== game || game.destroyed || game.finishing) return;
    const remainingMs = Math.max(0, game.durationMs - (now - game.startTime));
    const timerEl = document.getElementById("sixHudTimer");
    if (timerEl) {
      const secs = (remainingMs / 1000).toFixed(1);
      timerEl.textContent = `${secs} s`;
      timerEl.classList.toggle("is-danger-time", remainingMs <= 10000);
    }

    if (remainingMs <= 0) {
      game.finishing = true;
      game.rafId = null;
      const gridDoneEl = document.getElementById("sixBySixGridEl");
      if (gridDoneEl) gridDoneEl.classList.add("is-board-complete");
      game.finishTimer = setTimeout(() => {
        if (!activeMiniGame || activeMiniGame !== game || game.destroyed) return;
        finishSixBySixMatch(game, false);
      }, 850);
      return;
    }
    game.rafId = requestAnimationFrame(tickSix);
  };
  game.rafId = requestAnimationFrame(tickSix);
}

export function handleSixBySixCellTap(cellIdx, num) {
  const game = activeMiniGame;
  if (!game || game.destroyed || game.finishing || game.type !== "sixbysix" || game.mode !== "easy") return;

  const cellEl = document.getElementById(`sixCell_${cellIdx}`);
  if (!cellEl || cellEl.classList.contains("is-disappeared")) return;

  if (num === game.nextExpected) {
    game.highestReached = num;
    game.nextExpected = num + 1;
    cellEl.classList.add("is-disappeared");
    cellEl.disabled = true;
    cellEl.setAttribute("aria-hidden", "true");
    cellEl.innerHTML = `<img src="blutu_logo.png" alt="" class="sixbysix-cleared-logo" decoding="async">`;

    if (game.highestReached >= 36) {
      game.finishing = true;
      if (game.rafId) {
        cancelAnimationFrame(game.rafId);
        game.rafId = null;
      }
      const nextElDone = document.getElementById("sixHudNextNum");
      if (nextElDone) nextElDone.textContent = "36";
      const gridDoneEl = document.getElementById("sixBySixGridEl");
      if (gridDoneEl) gridDoneEl.classList.add("is-board-complete");

      game.finishTimer = setTimeout(() => {
        if (!activeMiniGame || activeMiniGame !== game || game.destroyed) return;
        finishSixBySixMatch(game, true);
      }, 1100);
      return;
    }

    const nextEl = document.getElementById("sixHudNextNum");
    if (nextEl) nextEl.textContent = String(game.nextExpected);
  } else {
    cellEl.classList.remove("is-wrong-tap");
    void cellEl.offsetWidth;
    cellEl.classList.add("is-wrong-tap");
    if (game.wrongTapTimeout) clearTimeout(game.wrongTapTimeout);
    game.wrongTapTimeout = setTimeout(() => {
      if (cellEl) cellEl.classList.remove("is-wrong-tap");
    }, 220);
  }
}

export function finishSixBySixHardManual() {
  const game = activeMiniGame;
  if (!game || game.destroyed || game.finishing || game.type !== "sixbysix") return;
  notifySharedGameUserGesture();
  game.finishing = true;
  if (game.rafId) {
    cancelAnimationFrame(game.rafId);
    game.rafId = null;
  }
  game.finishTimer = setTimeout(() => {
    if (!activeMiniGame || activeMiniGame !== game || game.destroyed) return;
    finishSixBySixMatch(game, false);
  }, 420);
}

function finishSixBySixMatch(game, completedAll) {
  const mode = game.mode;
  const reachedNum = game.highestReached;

  destroyActiveMiniGame(true);
  window.__isMiniGameScreenOpen = true;

  const modalBody = document.getElementById("blogModalBody");
  if (!modalBody) return;

  const six = window.gamesData.sixBySix;
  const easyStyle = btnStyleAttr(normHex(six.easyBtnColor || "#5a74bf"));
  const hardStyle = btnStyleAttr(normHex(six.hardBtnColor || "#364d8f"));
  const retryStyle = btnStyleAttr(normHex(six.retryBtnColor || "#4a63ab"));
  const backStyle = btnStyleAttr(normHex(six.backBtnColor || "#1f2b4d"));

  const muteBtnHTML = buildMiniGameMuteButtonHTML("minigameHudMuteBtn");
  const crestHTML = buildResultCardCrestHTML();

  if (mode === "easy") {
    const isWin = Boolean(completedAll);
    const batsHTML = isWin ? buildVictoryBatsBackdropHTML() : "";
    const cardTone = isWin ? "is-victory" : "is-neutral";
    const titleHTML = isWin
      ? `
        <h2 class="minigame-result-title">Lo lograste</h2>
        <div class="minigame-six-complete-badge">36</div>
      `
      : `<h2 class="minigame-result-title is-big-score-num">${reachedNum}</h2>`;

    modalBody.innerHTML = `
      <div class="minigame-top-mute-wrap">${muteBtnHTML}</div>
      <div class="minigame-result-stage${isWin ? " is-win-stage" : ""}">
        ${batsHTML}
        <div class="minigame-result-card ${cardTone}">
          ${crestHTML}
          ${titleHTML}
          <div class="minigame-card-divider" aria-hidden="true"><span>✠</span></div>
          <div class="minigame-result-buttons">
            <div class="minigame-result-primary-row">
              <button type="button" class="game-custom-btn" style="${retryStyle}" onclick="launchMiniGameFromBlog('sixbysix', 'easy')">Reintentar</button>
              <button type="button" class="game-custom-btn" style="${hardStyle}" onclick="launchMiniGameFromBlog('sixbysix', 'hard')">Difícil</button>
            </div>
            <button type="button" class="game-custom-btn is-volver-btn" style="${backStyle}" onclick="exitMiniGameVolver()">Volver</button>
          </div>
        </div>
      </div>
    `;
  } else {
    modalBody.innerHTML = `
      <div class="minigame-top-mute-wrap">${muteBtnHTML}</div>
      <div class="minigame-result-stage">
        <div class="minigame-result-card is-neutral">
          ${crestHTML}
          <h2 class="minigame-result-title is-question-title">¿Hasta qué número llegaste?</h2>
          <div class="minigame-card-divider" aria-hidden="true"><span>✠</span></div>
          <div class="minigame-result-buttons">
            <div class="minigame-result-primary-row">
              <button type="button" class="game-custom-btn" style="${retryStyle}" onclick="launchMiniGameFromBlog('sixbysix', 'hard')">Reintentar</button>
              <button type="button" class="game-custom-btn" style="${easyStyle}" onclick="launchMiniGameFromBlog('sixbysix', 'easy')">Fácil</button>
            </div>
            <button type="button" class="game-custom-btn is-volver-btn" style="${backStyle}" onclick="exitMiniGameVolver()">Volver</button>
          </div>
        </div>
      </div>
    `;
  }
  registerSharedMuteButton("minigameHudMuteBtn");
}

Object.assign(window, {
  destroyActiveMiniGame,
  launchMiniGameFromBlog,
  exitMiniGameVolver,
  handleMemoramaCardTap,
  handleSixBySixCellTap,
  finishSixBySixHardManual
});
