/* Blutu — Motores de Memorama (4x5) y 6x6 (Carga Bajo Demanda) */
import { buildDefaultGothicCardSvgDataUri, collectDefaultMemoramaPairImages } from "./data-defaults.js";

let activeMiniGame = null;
Object.defineProperty(window, "activeMiniGame", {
  configurable: true,
  get: () => activeMiniGame,
  set: (v) => { activeMiniGame = v; }
});

const getIsAdminMode = () => Boolean(window.isAdminMode);
const getGamesData = () => window.gamesData;
const setCurrentGameBlogKey = (k) => { window.currentGameBlogKey = k; };
const syncLiveBlogModalToMemory = (...a) => window.syncLiveBlogModalToMemory && window.syncLiveBlogModalToMemory(...a);
const renderGamesSection = (...a) => window.renderGamesSection && window.renderGamesSection(...a);
const resetBlogParagraphRevealState = (...a) => window.resetBlogParagraphRevealState && window.resetBlogParagraphRevealState(...a);
const closeBlogModal = (...a) => window.closeBlogModal && window.closeBlogModal(...a);
const applyBlogModalAdaptiveTheme = (...a) => window.applyBlogModalAdaptiveTheme && window.applyBlogModalAdaptiveTheme(...a);
const escapeHtmlAttr = (s) => (window.escapeHtmlAttr ? window.escapeHtmlAttr(s) : String(s || ""));
const escapeHtmlText = (s) => (window.escapeHtmlText ? window.escapeHtmlText(s) : String(s ?? ""));
const computeGameButtonStyleAttr = (c) => (window.computeGameButtonStyleAttr ? window.computeGameButtonStyleAttr(c) : "");

    /* GESTIÓN ESTRICTA DE CICLO DE VIDA DE JUEGOS (CERO CARGA EN REPOSO Y AL TERMINAR) */
    export function teardownActiveMiniGameRuntime() {
      if (!activeMiniGame) return;
      if (activeMiniGame.timerInterval) {
        clearInterval(activeMiniGame.timerInterval);
        activeMiniGame.timerInterval = null;
      }
      if (activeMiniGame.mismatchTimeout) {
        clearTimeout(activeMiniGame.mismatchTimeout);
        activeMiniGame.mismatchTimeout = null;
      }
      if (Array.isArray(activeMiniGame.aiTimeouts)) {
        activeMiniGame.aiTimeouts.forEach(t => clearTimeout(t));
        activeMiniGame.aiTimeouts = [];
      }
    }

    export function destroyActiveMiniGame() {
      teardownActiveMiniGameRuntime();
      activeMiniGame = null;
    }
    window.destroyActiveMiniGame = destroyActiveMiniGame;

    function shuffleGameArray(arr) {
      const copy = [...arr];
      for (let i = copy.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        const tmp = copy[i];
        copy[i] = copy[j];
        copy[j] = tmp;
      }
      return copy;
    }

    function formatElapsedSecondsSpanish(totalMs) {
      const totalSec = Math.max(0, totalMs / 1000);
      const mins = Math.floor(totalSec / 60);
      const secs = totalSec - (mins * 60);
      if (mins > 0) {
        const wholeSecs = Math.floor(secs).toString().padStart(2, '0');
        const tenths = Math.floor((secs - Math.floor(secs)) * 10);
        return `${mins}:${wholeSecs}.${tenths}`;
      }
      return `${secs.toFixed(1)} s`;
    }

    export function launchMiniGameFromBlog(gameType, mode) {
      if (getIsAdminMode() && document.getElementById('blogEditableBody')) {
        syncLiveBlogModalToMemory(true);
        renderGamesSection();
      }
      const modalBody = document.getElementById('blogModalBody');
      if (modalBody) {
        resetBlogParagraphRevealState(modalBody);
      }
      if (gameType === 'memorama') {
        startMemoramaGame(mode);
      } else if (gameType === 'sixbysix') {
        startSixBySixGame(mode);
      }
    }
    window.launchMiniGameFromBlog = launchMiniGameFromBlog;

    export function exitMiniGameVolver() {
      destroyActiveMiniGame();
      closeBlogModal(true);
    }
    window.exitMiniGameVolver = exitMiniGameVolver;

    /* ============================================================================
       MOTOR 1: MEMORAMA (REJILLA 4x5 = 20 CARTAS / 10 PAREJAS — MODOS SOLO Y VS PC)
       ============================================================================ */
    export function startMemoramaGame(mode) {
      destroyActiveMiniGame();

      const modalEl = document.getElementById('blogReadModal');
      const modalBody = document.getElementById('blogModalBody');
      const modalBox = document.querySelector('#blogReadModal .blog-modal-box');
      if (!modalEl || !modalBody) return;

      setCurrentGameBlogKey('memorama');
      if (modalBox) {
        modalBox.classList.add('is-minigame-active');
        modalBox.scrollTop = 0;
      }
      applyBlogModalAdaptiveTheme(getGamesData().blogs.memorama, null);

      const rawPairs = (getGamesData().memorama && Array.isArray(getGamesData().memorama.pairImages))
        ? getGamesData().memorama.pairImages.slice(0, 10)
        : collectDefaultMemoramaPairImages();
      const fallbacks = collectDefaultMemoramaPairImages();
      const pairUrls = [];
      for (let i = 0; i < 10; i++) {
        pairUrls.push((rawPairs[i] && String(rawPairs[i]).trim()) ? String(rawPairs[i]).trim() : fallbacks[i]);
      }

      const deck = [];
      for (let pid = 0; pid < 10; pid++) {
        deck.push({ pairId: pid, img: pairUrls[pid], matched: false, owner: null });
        deck.push({ pairId: pid, img: pairUrls[pid], matched: false, owner: null });
      }
      const shuffledDeck = shuffleGameArray(deck);

      const isVsPc = (mode === 'vspc');
      activeMiniGame = {
        type: 'memorama',
        mode: isVsPc ? 'vspc' : 'solo',
        deck: shuffledDeck,
        flippedIndices: [],
        locked: false,
        turn: 'user',
        userPairs: 0,
        pcPairs: 0,
        matchedTotal: 0,
        seenHistory: [], // [{ index, pairId }] memoria reciente de cartas vistas por la PC
        startTimeMs: performance.now(),
        elapsedMs: 0,
        timerInterval: null,
        mismatchTimeout: null,
        aiTimeouts: []
      };

      const cardsHTML = shuffledDeck.map((card, idx) => {
        const fbUri = escapeHtmlAttr(buildDefaultGothicCardSvgDataUri(String(card.pairId + 1), '#8ca2e6'));
        return `
          <button type="button" class="memorama-card" data-card-idx="${idx}" onclick="handleMemoramaCardTap(${idx})" aria-label="Carta ${idx + 1}">
            <div class="memorama-card-inner">
              <div class="memorama-card-face memorama-card-back">
                <span class="memorama-card-back-emblem">✠</span>
              </div>
              <div class="memorama-card-face memorama-card-front">
                <img src="${escapeHtmlAttr(card.img)}" alt="" decoding="async" referrerpolicy="no-referrer" onerror="if(this.dataset.fb!=='1'){this.dataset.fb='1';this.src='${fbUri}';}">
              </div>
            </div>
          </button>
        `;
      }).join('');

      if (isVsPc) {
        modalBody.innerHTML = `
          <div class="blutu-minigame-stage">
            <div class="minigame-hud-bar">
              <div class="minigame-hud-stat">
                <span class="minigame-hud-label">Tú</span>
                <span id="memHudUserScore" class="minigame-hud-value is-active-turn">0</span>
              </div>
              <div class="minigame-hud-stat is-center">
                <span id="memHudTurnLabel" class="minigame-turn-pill">Tu turno</span>
              </div>
              <div class="minigame-hud-stat is-right">
                <span class="minigame-hud-label">PC</span>
                <span id="memHudPcScore" class="minigame-hud-value">0</span>
              </div>
            </div>
            <div id="memoramaGridEl" class="memorama-grid-4x5">
              ${cardsHTML}
            </div>
          </div>
        `;
      } else {
        modalBody.innerHTML = `
          <div class="blutu-minigame-stage">
            <div class="minigame-hud-bar">
              <div class="minigame-hud-stat">
                <span class="minigame-hud-label">Tiempo</span>
                <span id="memHudTimer" class="minigame-hud-value">0.0 s</span>
              </div>
              <div class="minigame-hud-stat is-right">
                <span class="minigame-hud-label">Parejas</span>
                <span id="memHudPairs" class="minigame-hud-value">0 / 10</span>
              </div>
            </div>
            <div id="memoramaGridEl" class="memorama-grid-4x5">
              ${cardsHTML}
            </div>
          </div>
        `;

        activeMiniGame.timerInterval = setInterval(() => {
          if (!activeMiniGame || activeMiniGame.type !== 'memorama' || activeMiniGame.mode !== 'solo') return;
          activeMiniGame.elapsedMs = performance.now() - activeMiniGame.startTimeMs;
          const tEl = document.getElementById('memHudTimer');
          if (tEl) tEl.textContent = formatElapsedSecondsSpanish(activeMiniGame.elapsedMs);
        }, 100);
      }
    }
    window.startMemoramaGame = startMemoramaGame;

    function recordCardInPcMemory(game, cardIdx) {
      if (!game || !game.deck[cardIdx]) return;
      const pairId = game.deck[cardIdx].pairId;
      game.seenHistory = game.seenHistory.filter(entry => entry.index !== cardIdx && !game.deck[entry.index].matched);
      game.seenHistory.push({ index: cardIdx, pairId });
      // Mantener memoria reciente natural para que arme parejas vistas sin ser imposible
      if (game.seenHistory.length > 9) {
        game.seenHistory.shift();
      }
    }

    function setMemoramaCardDomState(idx, flipped, matched, owner) {
      const btn = document.querySelector(`#memoramaGridEl .memorama-card[data-card-idx="${idx}"]`);
      if (!btn) return;
      btn.classList.toggle('is-flipped', Boolean(flipped));
      btn.classList.toggle('is-matched', Boolean(matched));
      btn.classList.toggle('is-matched-pc', Boolean(matched && owner === 'pc'));
      btn.disabled = Boolean(flipped || matched);
    }

    function updateMemoramaVsPcHud(game) {
      const uEl = document.getElementById('memHudUserScore');
      const pEl = document.getElementById('memHudPcScore');
      const tEl = document.getElementById('memHudTurnLabel');
      if (uEl) {
        uEl.textContent = String(game.userPairs);
        uEl.classList.toggle('is-active-turn', game.turn === 'user');
      }
      if (pEl) {
        pEl.textContent = String(game.pcPairs);
        pEl.classList.toggle('is-active-turn', game.turn === 'pc');
      }
      if (tEl) {
        tEl.textContent = game.turn === 'user' ? 'Tu turno' : 'Turno de PC';
      }
    }

    function finishMemoramaGame(game) {
      if (!game) return;
      const finalElapsed = performance.now() - game.startTimeMs;
      const mode = game.mode;
      const userPairs = game.userPairs;
      const pcPairs = game.pcPairs;

      // Desmontar inmediatamente timers y rejilla de imágenes para liberar memoria al terminar
      teardownActiveMiniGameRuntime();
      activeMiniGame = null;

      const modalBody = document.getElementById('blogModalBody');
      if (!modalBody) return;

      const memCfg = getGamesData().memorama || {};
      const retryStyle = computeGameButtonStyleAttr(memCfg.retryBtnColor || '#4a63ab');
      const soloStyle = computeGameButtonStyleAttr(memCfg.soloBtnColor || '#5a74bf');
      const vsPcStyle = computeGameButtonStyleAttr(memCfg.vsPcBtnColor || '#364d8f');
      const backStyle = computeGameButtonStyleAttr(memCfg.backBtnColor || '#1f2b4d');

      if (mode === 'solo') {
        const timeStr = formatElapsedSecondsSpanish(finalElapsed);
        modalBody.innerHTML = `
          <div class="minigame-result-panel">
            <h2 class="minigame-result-title">${escapeHtmlText(timeStr)}</h2>
            <p class="minigame-result-subtitle">10 parejas encontradas</p>
            <div class="minigame-result-buttons">
              <div class="minigame-result-primary-row">
                <button type="button" class="game-custom-btn" style="${retryStyle}" onclick="startMemoramaGame('solo')">Reintentar</button>
                <button type="button" class="game-custom-btn" style="${vsPcStyle}" onclick="startMemoramaGame('vspc')">Vs PC</button>
              </div>
              <button type="button" class="game-custom-btn is-volver-btn" style="${backStyle}" onclick="exitMiniGameVolver()">Volver</button>
            </div>
          </div>
        `;
      } else {
        let outcomeTitle = 'Empate';
        if (userPairs > pcPairs) outcomeTitle = 'Tú ganas';
        else if (pcPairs > userPairs) outcomeTitle = 'PC gana';

        modalBody.innerHTML = `
          <div class="minigame-result-panel">
            <h2 class="minigame-result-title">${outcomeTitle}</h2>
            <p class="minigame-result-subtitle">Tú: ${userPairs} — PC: ${pcPairs}</p>
            <div class="minigame-result-buttons">
              <div class="minigame-result-primary-row">
                <button type="button" class="game-custom-btn" style="${retryStyle}" onclick="startMemoramaGame('vspc')">Reintentar</button>
                <button type="button" class="game-custom-btn" style="${soloStyle}" onclick="startMemoramaGame('solo')">Solo</button>
              </div>
              <button type="button" class="game-custom-btn is-volver-btn" style="${backStyle}" onclick="exitMiniGameVolver()">Volver</button>
            </div>
          </div>
        `;
      }
    }

    function resolveMemoramaFlippedPair(actor) {
      const game = activeMiniGame;
      if (!game || game.type !== 'memorama' || game.flippedIndices.length !== 2) return;

      const [i1, i2] = game.flippedIndices;
      const c1 = game.deck[i1];
      const c2 = game.deck[i2];

      if (c1.pairId === c2.pairId) {
        c1.matched = true;
        c2.matched = true;
        c1.owner = actor;
        c2.owner = actor;
        game.matchedTotal += 1;
        game.seenHistory = game.seenHistory.filter(e => e.index !== i1 && e.index !== i2);

        if (actor === 'pc') game.pcPairs += 1;
        else game.userPairs += 1;

        setMemoramaCardDomState(i1, true, true, actor);
        setMemoramaCardDomState(i2, true, true, actor);
        game.flippedIndices = [];

        if (game.mode === 'solo') {
          const pairsEl = document.getElementById('memHudPairs');
          if (pairsEl) pairsEl.textContent = `${game.matchedTotal} / 10`;
        } else {
          updateMemoramaVsPcHud(game);
        }

        if (game.matchedTotal >= 10) {
          const finishTimer = setTimeout(() => {
            if (activeMiniGame === game) finishMemoramaGame(game);
          }, 420);
          game.aiTimeouts.push(finishTimer);
          return;
        }

        if (game.mode === 'vspc' && actor === 'pc') {
          const nextPcTimer = setTimeout(() => {
            if (activeMiniGame === game) runMemoramaPcTurn();
          }, 620);
          game.aiTimeouts.push(nextPcTimer);
        } else {
          game.locked = false;
        }
      } else {
        game.mismatchTimeout = setTimeout(() => {
          if (activeMiniGame !== game) return;
          game.mismatchTimeout = null;
          setMemoramaCardDomState(i1, false, false, null);
          setMemoramaCardDomState(i2, false, false, null);
          game.flippedIndices = [];

          if (game.mode === 'vspc') {
            game.turn = (actor === 'user') ? 'pc' : 'user';
            updateMemoramaVsPcHud(game);
            if (game.turn === 'pc') {
              runMemoramaPcTurn();
            } else {
              game.locked = false;
            }
          } else {
            game.locked = false;
          }
        }, 720);
      }
    }

    export function handleMemoramaCardTap(cardIdx) {
      const game = activeMiniGame;
      if (!game || game.type !== 'memorama' || game.locked) return;
      if (game.mode === 'vspc' && game.turn !== 'user') return;

      const card = game.deck[cardIdx];
      if (!card || card.matched || game.flippedIndices.includes(cardIdx)) return;

      game.flippedIndices.push(cardIdx);
      setMemoramaCardDomState(cardIdx, true, false, null);
      recordCardInPcMemory(game, cardIdx);

      if (game.flippedIndices.length === 2) {
        game.locked = true;
        resolveMemoramaFlippedPair('user');
      }
    }
    window.handleMemoramaCardTap = handleMemoramaCardTap;

    function findKnownPairInPcMemory(game) {
      const byPair = new Map();
      for (const item of game.seenHistory) {
        if (game.deck[item.index] && !game.deck[item.index].matched) {
          if (byPair.has(item.pairId)) {
            const firstIdx = byPair.get(item.pairId);
            if (firstIdx !== item.index) {
              return [firstIdx, item.index];
            }
          } else {
            byPair.set(item.pairId, item.index);
          }
        }
      }
      return null;
    }

    function runMemoramaPcTurn() {
      const game = activeMiniGame;
      if (!game || game.type !== 'memorama' || game.mode !== 'vspc' || game.matchedTotal >= 10) return;

      game.locked = true;
      game.turn = 'pc';
      updateMemoramaVsPcHud(game);

      const unmatchedIndices = [];
      game.deck.forEach((c, idx) => {
        if (!c.matched) unmatchedIndices.push(idx);
      });
      if (unmatchedIndices.length < 2) return;

      const knownPair = findKnownPairInPcMemory(game);
      let firstPick = -1;
      let plannedSecondPick = -1;

      if (knownPair) {
        firstPick = knownPair[0];
        plannedSecondPick = knownPair[1];
      } else {
        const seenSet = new Set(game.seenHistory.map(e => e.index));
        const unseenPool = unmatchedIndices.filter(idx => !seenSet.has(idx));
        const pool = unseenPool.length > 0 ? unseenPool : unmatchedIndices;
        firstPick = pool[Math.floor(Math.random() * pool.length)];
      }

      const t1 = setTimeout(() => {
        if (activeMiniGame !== game) return;
        game.flippedIndices.push(firstPick);
        setMemoramaCardDomState(firstPick, true, false, null);
        recordCardInPcMemory(game, firstPick);

        let secondPick = plannedSecondPick;
        if (secondPick === -1 || secondPick === firstPick || game.deck[secondPick].matched) {
          const firstPairId = game.deck[firstPick].pairId;
          const matchingKnown = game.seenHistory.find(
            e => e.pairId === firstPairId && e.index !== firstPick && !game.deck[e.index].matched
          );
          if (matchingKnown) {
            secondPick = matchingKnown.index;
          } else {
            const seenSetNow = new Set(game.seenHistory.map(e => e.index));
            const remainingUnseen = unmatchedIndices.filter(idx => idx !== firstPick && !seenSetNow.has(idx));
            const remainingAny = unmatchedIndices.filter(idx => idx !== firstPick);
            const secondPool = remainingUnseen.length > 0 ? remainingUnseen : remainingAny;
            secondPick = secondPool[Math.floor(Math.random() * secondPool.length)];
          }
        }

        const t2 = setTimeout(() => {
          if (activeMiniGame !== game) return;
          game.flippedIndices.push(secondPick);
          setMemoramaCardDomState(secondPick, true, false, null);
          recordCardInPcMemory(game, secondPick);
          resolveMemoramaFlippedPair('pc');
        }, 520);
        game.aiTimeouts.push(t2);
      }, 480);

      game.aiTimeouts.push(t1);
    }

    /* ============================================================================
       MOTOR 2: 6X6 (REJILLA 6x6 NÚMEROS 1..36, LÍMITE DE 40 SEGUNDOS — FÁCIL Y DIFÍCIL)
       ============================================================================ */
    const SIX_BY_SIX_DURATION_MS = 40000;

    export function startSixBySixGame(mode) {
      destroyActiveMiniGame();

      const modalEl = document.getElementById('blogReadModal');
      const modalBody = document.getElementById('blogModalBody');
      const modalBox = document.querySelector('#blogReadModal .blog-modal-box');
      if (!modalEl || !modalBody) return;

      setCurrentGameBlogKey('sixbysix');
      if (modalBox) {
        modalBox.classList.add('is-minigame-active');
        modalBox.scrollTop = 0;
      }
      applyBlogModalAdaptiveTheme(getGamesData().blogs.sixbysix, null);

      const nums = [];
      for (let n = 1; n <= 36; n++) nums.push(n);
      const shuffledNums = shuffleGameArray(nums);
      const isHard = (mode === 'hard');

      activeMiniGame = {
        type: 'sixbysix',
        mode: isHard ? 'hard' : 'easy',
        numbers: shuffledNums,
        nextExpected: 1,
        deadlineMs: performance.now() + SIX_BY_SIX_DURATION_MS,
        timerInterval: null,
        mismatchTimeout: null,
        aiTimeouts: []
      };

      const sixCfg = getGamesData().sixBySix || {};
      const finishBtnStyle = computeGameButtonStyleAttr(sixCfg.finishBtnColor || sixCfg.retryBtnColor || '#41599f');

      const cellsHTML = shuffledNums.map((num, idx) => {
        if (isHard) {
          return `<div class="sixbysix-cell is-non-interactive">${num}</div>`;
        }
        return `<button type="button" class="sixbysix-cell" data-cell-idx="${idx}" data-num="${num}" onclick="handleSixBySixCellTap(this, ${num})">${num}</button>`;
      }).join('');

      modalBody.innerHTML = `
        <div class="blutu-minigame-stage">
          <div class="minigame-hud-bar">
            <div class="minigame-hud-stat">
              <span class="minigame-hud-label">Tiempo</span>
              <span id="sixHudCountdown" class="minigame-hud-value">40.0 s</span>
            </div>
            ${isHard ? `
              <div class="minigame-hud-stat is-right">
                <span class="minigame-hud-label">Modo</span>
                <span class="minigame-hud-value">Difícil</span>
              </div>
            ` : `
              <div class="minigame-hud-stat is-right">
                <span class="minigame-hud-label">Siguiente</span>
                <span id="sixHudNextNum" class="minigame-hud-value is-active-turn">1</span>
              </div>
            `}
          </div>

          <div id="sixBySixGridEl" class="sixbysix-grid">
            ${cellsHTML}
          </div>

          ${isHard ? `
            <div style="margin-top: 6px;">
              <button type="button" class="game-custom-btn" style="${finishBtnStyle}" onclick="finishSixBySixHardMode()">Terminar</button>
            </div>
          ` : ''}
        </div>
      `;

      activeMiniGame.timerInterval = setInterval(() => {
        if (!activeMiniGame || activeMiniGame.type !== 'sixbysix') return;
        const remainingMs = activeMiniGame.deadlineMs - performance.now();
        if (remainingMs <= 0) {
          if (activeMiniGame.mode === 'hard') {
            finishSixBySixHardMode();
          } else {
            finishSixBySixEasyMode(false);
          }
          return;
        }
        const secLeft = (remainingMs / 1000).toFixed(1);
        const timerEl = document.getElementById('sixHudCountdown');
        if (timerEl) {
          timerEl.textContent = `${secLeft} s`;
          timerEl.classList.toggle('is-danger-time', remainingMs <= 8000);
        }
      }, 100);
    }
    window.startSixBySixGame = startSixBySixGame;

    export function handleSixBySixCellTap(btnEl, tappedNum) {
      const game = activeMiniGame;
      if (!game || game.type !== 'sixbysix' || game.mode !== 'easy' || !btnEl) return;

      if (tappedNum === game.nextExpected) {
        btnEl.classList.add('is-disappeared');
        btnEl.disabled = true;
        game.nextExpected += 1;

        if (game.nextExpected > 36) {
          finishSixBySixEasyMode(true);
          return;
        }

        const nextEl = document.getElementById('sixHudNextNum');
        if (nextEl) nextEl.textContent = String(game.nextExpected);
      } else {
        btnEl.classList.remove('is-wrong-tap');
        void btnEl.offsetWidth;
        btnEl.classList.add('is-wrong-tap');
        setTimeout(() => {
          if (btnEl && btnEl.isConnected) btnEl.classList.remove('is-wrong-tap');
        }, 220);
      }
    }
    window.handleSixBySixCellTap = handleSixBySixCellTap;

    function finishSixBySixEasyMode(completedAll) {
      const game = activeMiniGame;
      const reachedNum = game ? Math.max(0, game.nextExpected - 1) : 0;

      // Desmontar inmediatamente cronómetro y rejilla 6x6
      teardownActiveMiniGameRuntime();
      activeMiniGame = null;

      const modalBody = document.getElementById('blogModalBody');
      if (!modalBody) return;

      const sixCfg = getGamesData().sixBySix || {};
      const retryStyle = computeGameButtonStyleAttr(sixCfg.retryBtnColor || '#4a63ab');
      const hardStyle = computeGameButtonStyleAttr(sixCfg.hardBtnColor || '#364d8f');
      const backStyle = computeGameButtonStyleAttr(sixCfg.backBtnColor || '#1f2b4d');

      const titleHTML = completedAll ? 'Lo lograste' : `Llegaste hasta el número ${reachedNum}`;
      const subHTML = completedAll
        ? 'Completaste los 36 números antes de los 40 segundos'
        : 'Tiempo agotado (40 s)';

      modalBody.innerHTML = `
        <div class="minigame-result-panel">
          <h2 class="minigame-result-title">${escapeHtmlText(titleHTML)}</h2>
          <p class="minigame-result-subtitle">${escapeHtmlText(subHTML)}</p>
          <div class="minigame-result-buttons">
            <div class="minigame-result-primary-row">
              <button type="button" class="game-custom-btn" style="${retryStyle}" onclick="startSixBySixGame('easy')">Reintentar</button>
              <button type="button" class="game-custom-btn" style="${hardStyle}" onclick="startSixBySixGame('hard')">Difícil</button>
            </div>
            <button type="button" class="game-custom-btn is-volver-btn" style="${backStyle}" onclick="exitMiniGameVolver()">Volver</button>
          </div>
        </div>
      `;
    }

    export function finishSixBySixHardMode() {
      // Desmontar inmediatamente cronómetro y rejilla 6x6
      teardownActiveMiniGameRuntime();
      activeMiniGame = null;

      const modalBody = document.getElementById('blogModalBody');
      if (!modalBody) return;

      const sixCfg = getGamesData().sixBySix || {};
      const retryStyle = computeGameButtonStyleAttr(sixCfg.retryBtnColor || '#4a63ab');
      const easyStyle = computeGameButtonStyleAttr(sixCfg.easyBtnColor || '#5a74bf');
      const backStyle = computeGameButtonStyleAttr(sixCfg.backBtnColor || '#1f2b4d');

      modalBody.innerHTML = `
        <div class="minigame-result-panel">
          <h2 class="minigame-result-title">¿Hasta qué número llegaste?</h2>
          <div class="minigame-result-buttons">
            <div class="minigame-result-primary-row">
              <button type="button" class="game-custom-btn" style="${retryStyle}" onclick="startSixBySixGame('hard')">Reintentar</button>
              <button type="button" class="game-custom-btn" style="${easyStyle}" onclick="startSixBySixGame('easy')">Fácil</button>
            </div>
            <button type="button" class="game-custom-btn is-volver-btn" style="${backStyle}" onclick="exitMiniGameVolver()">Volver</button>
          </div>
        </div>
      `;
    }
    window.finishSixBySixHardMode = finishSixBySixHardMode;

window.teardownActiveMiniGameRuntime = teardownActiveMiniGameRuntime;
window.destroyActiveMiniGame = destroyActiveMiniGame;
window.launchMiniGameFromBlog = launchMiniGameFromBlog;
window.exitMiniGameVolver = exitMiniGameVolver;
window.startMemoramaGame = startMemoramaGame;
window.handleMemoramaCardTap = handleMemoramaCardTap;
window.startSixBySixGame = startSixBySixGame;
window.handleSixBySixCellTap = handleSixBySixCellTap;
window.finishSixBySixHardMode = finishSixBySixHardMode;
