/* Blutu — Autenticación Google Admin, Muro de Visitas y Sincronización Firestore en Tiempo Real */
import { deduplicatePosts, BlutuVault } from "./vault.js";

    import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js';
    import {
      getAuth,
      signInWithPopup,
      GoogleAuthProvider,
      signOut,
      onAuthStateChanged
    } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js';
    import {
      initializeFirestore,
      collection,
      addDoc,
      setDoc,
      deleteDoc,
      updateDoc,
      deleteField,
      doc,
      onSnapshot,
      query,
      orderBy,
      limit,
      serverTimestamp,
      getDocFromServer
    } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js';

    const firebaseConfig = {
      projectId: "ageless-spirit-57c1c",
      appId: "1:804236633952:web:6a6be4bc50225d67462005",
      apiKey: "chgnjUeqRFswN_5Jq93N1E9zgl02wOuBDySazIA".split("").reverse().join(""),
      authDomain: "ageless-spirit-57c1c.firebaseapp.com",
      firestoreDatabaseId: "ai-studio-belutu-be7afdec-0977-4b18-8fd2-f11de07af9d0",
      storageBucket: "ageless-spirit-57c1c.firebasestorage.app",
      messagingSenderId: "804236633952"
    };

    let app, db, auth, googleProvider;
    try {
      app = initializeApp(firebaseConfig);
      auth = getAuth(app);
      googleProvider = new GoogleAuthProvider();
      googleProvider.setCustomParameters({ prompt: 'select_account' });
      db = initializeFirestore(app, {
        experimentalForceLongPolling: true
      }, firebaseConfig.firestoreDatabaseId);
    } catch (e) {
      console.error('Error inicializando Firebase:', e);
    }

    // Comprobar conectividad sin provocar fallos de permisos
    if (db) {
      getDocFromServer(doc(db, 'site_data', 'main')).catch(err => {
        if (err && err.message && err.message.includes('offline')) {
          console.warn('Verificando conexión con Firebase Firestore...');
        }
      });
    }

    const ADMIN_EMAILS = ['tapiascristian131@gmail.com', 'bbblutu@gmail.com'];

    function logFirestoreErrorInfo(error, operationType, path) {
      const errInfo = {
        error: error && error.message ? error.message : String(error),
        authInfo: {
          userId: auth && auth.currentUser ? auth.currentUser.uid : null,
          email: auth && auth.currentUser ? auth.currentUser.email : null,
          emailVerified: auth && auth.currentUser ? auth.currentUser.emailVerified : null,
          isAnonymous: auth && auth.currentUser ? auth.currentUser.isAnonymous : null,
          tenantId: auth && auth.currentUser ? auth.currentUser.tenantId : null,
          providerInfo: (auth && auth.currentUser && Array.isArray(auth.currentUser.providerData))
            ? auth.currentUser.providerData.map(p => ({ providerId: p.providerId, email: p.email }))
            : []
        },
        operationType,
        path
      };
      console.error('Firestore Error: ', JSON.stringify(errInfo));
      return errInfo;
    }

    async function ensureAdminSignedIn(interactive = true) {
      if (!auth || !googleProvider) return false;
      if (auth.currentUser) {
        const currentEmail = (auth.currentUser.email || '').toLowerCase();
        return ADMIN_EMAILS.includes(currentEmail);
      }
      if (!interactive) return false;
      try {
        const result = await signInWithPopup(auth, googleProvider);
        const user = result && result.user;
        const email = ((user && user.email) || '').toLowerCase();
        const isUserAdmin = ADMIN_EMAILS.includes(email);
        window.currentAuthUser = user || null;
        window.isUserAdmin = isUserAdmin;
        updateAdminAuthUI(user, isUserAdmin);
        return isUserAdmin;
      } catch (e) {
        return false;
      }
    }

    // Escuchar cambios de estado de autenticación
    if (auth) {
      onAuthStateChanged(auth, (user) => {
        if (user) {
          const email = (user.email || '').toLowerCase();
          const isUserAdmin = ADMIN_EMAILS.includes(email);
          window.currentAuthUser = user;
          window.isUserAdmin = isUserAdmin;
          updateAdminAuthUI(user, isUserAdmin);
        } else {
          window.currentAuthUser = null;
          window.isUserAdmin = false;
          updateAdminAuthUI(null, false);
        }
      });
    }

    let selectedSymbol = '🦇';
    let isSubmitting = false;
    let lastSubmitTime = 0;

    function setupSymbolPicker() {
      const container = document.getElementById('commentSymbolPicker');
      if (!container) return;

      const buttons = container.querySelectorAll('.comment-symbol-btn');
      buttons.forEach(btn => {
        btn.addEventListener('click', () => {
          buttons.forEach(b => b.classList.remove('active'));
          btn.classList.add('active');
          selectedSymbol = btn.getAttribute('data-symbol') || '🦇';
        });
      });
    }

    function setupCharCounter() {
      const textarea = document.getElementById('commentTextInput');
      const counter = document.getElementById('commentCharCount');
      if (!textarea || !counter) return;

      textarea.addEventListener('input', () => {
        counter.textContent = String(textarea.value.length);
      });
    }

    function formatCommentDate(timestamp) {
      if (!timestamp) return 'Hace un instante';
      try {
        const date = (typeof timestamp.toDate === 'function') ? timestamp.toDate() : new Date(timestamp);
        const now = new Date();
        const diffMs = now.getTime() - date.getTime();
        const diffSec = Math.floor(diffMs / 1000);
        const diffMin = Math.floor(diffSec / 60);
        const diffHours = Math.floor(diffMin / 60);
        const diffDays = Math.floor(diffHours / 24);

        if (diffSec < 45) return 'Hace un instante';
        if (diffMin < 60) return `Hace ${diffMin} min`;
        if (diffHours < 24) return `Hace ${diffHours} h`;
        if (diffDays < 7) return `Hace ${diffDays} d`;

        return date.toLocaleDateString('es-ES', {
          day: 'numeric',
          month: 'short',
          year: date.getFullYear() !== now.getFullYear() ? 'numeric' : undefined,
          hour: '2-digit',
          minute: '2-digit'
        });
      } catch {
        return 'Recientemente';
      }
    }

    let latestLoadedComments = [];
    let activeAdminReplyId = null;
    let activeFeedReplyId = null;

    function renderComments(comments) {
      if (Array.isArray(comments)) {
        latestLoadedComments = comments;
      }
      renderCommentsListFromMemory();
      if (typeof refreshAdminCommentsList === 'function') {
        refreshAdminCommentsList();
      }
    }

    function renderCommentsListFromMemory() {
      const feed = document.getElementById('commentsFeed');
      const countBadge = document.getElementById('commentsCountBadge');
      if (!feed) return;

      const isCurrentAdmin = (typeof window.isAdminMode !== 'undefined' && Boolean(window.isAdminMode));
      const comments = Array.isArray(latestLoadedComments) ? latestLoadedComments : [];

      // Filtrar comentarios ocultos para visitantes que no están en modo admin
      const filteredComments = comments.filter(c => {
        if (isCurrentAdmin) return true;
        return !(Array.isArray(window.hiddenCommentIds) && window.hiddenCommentIds.includes(c.id));
      });

      if (countBadge) {
        countBadge.textContent = `${filteredComments.length} ${filteredComments.length === 1 ? 'mensaje' : 'mensajes'}`;
      }

      if (filteredComments.length === 0) {
        feed.innerHTML = `
          <div class="comments-empty-state">
            <span class="empty-state-icon">🕯</span>
            <p class="empty-state-text">El muro está en silencio. Sé la primera voz en dejar su mensaje.</p>
          </div>
        `;
        return;
      }

      feed.innerHTML = '';
      filteredComments.forEach(c => {
        const isHidden = Array.isArray(window.hiddenCommentIds) && window.hiddenCommentIds.includes(c.id);
        const card = document.createElement('div');
        card.className = 'comment-card' + (isHidden ? ' is-hidden-comment' : '');
        card.setAttribute('data-comment-id', c.id);

        const header = document.createElement('div');
        header.className = 'comment-card-header';

        const authorGroup = document.createElement('div');
        authorGroup.className = 'comment-author-group';

        const nameSpan = document.createElement('span');
        nameSpan.className = 'comment-author-name';
        nameSpan.textContent = c.name;
        authorGroup.appendChild(nameSpan);

        if (isHidden) {
          const hiddenBadge = document.createElement('span');
          hiddenBadge.className = 'comment-hidden-badge';
          hiddenBadge.textContent = '[Oculto al público]';
          authorGroup.appendChild(hiddenBadge);
        }

        const dateGroup = document.createElement('div');
        dateGroup.style.cssText = 'display: flex; align-items: center; gap: 8px; flex-wrap: wrap;';

        const dateSpan = document.createElement('span');
        dateSpan.className = 'comment-date';
        dateSpan.textContent = formatCommentDate(c.createdAt);
        dateGroup.appendChild(dateSpan);

        // Si está en modo edición, botones interactivos para ocultar, responder o eliminar
        if (isCurrentAdmin) {
          const replyBtn = document.createElement('button');
          replyBtn.type = 'button';
          replyBtn.className = 'comment-admin-reply-btn' + (c.reply ? ' has-reply-btn' : '');
          replyBtn.innerHTML = c.reply ? '✏️ Rta Blutu' : '💬 Responder';
          replyBtn.title = c.reply ? 'Editar respuesta oficial de Blutu' : 'Responder a este mensaje como Blutu';
          replyBtn.onclick = (e) => {
            e.stopPropagation();
            window.openInlineFeedReply(c.id);
          };
          dateGroup.appendChild(replyBtn);

          if (c.reply) {
            const delReplyBtn = document.createElement('button');
            delReplyBtn.type = 'button';
            delReplyBtn.className = 'comment-admin-delete-btn';
            delReplyBtn.innerHTML = '↩️ Quitar Rta';
            delReplyBtn.title = 'Eliminar la respuesta de Blutu';
            delReplyBtn.onclick = (e) => {
              e.stopPropagation();
              window.deleteReplyFromAdmin(c.id);
            };
            dateGroup.appendChild(delReplyBtn);
          }

          const toggleBtn = document.createElement('button');
          toggleBtn.type = 'button';
          toggleBtn.className = 'comment-admin-toggle-btn' + (isHidden ? ' is-hidden-btn' : '');
          toggleBtn.innerHTML = isHidden ? '👁️ Mostrar' : '🚫 Ocultar';
          toggleBtn.title = isHidden ? 'Mostrar este mensaje a los visitantes' : 'Ocultar este mensaje a los visitantes';
          toggleBtn.onclick = (e) => {
            e.stopPropagation();
            window.toggleCommentVisibility(c.id);
          };
          dateGroup.appendChild(toggleBtn);

          const delBtn = document.createElement('button');
          delBtn.type = 'button';
          delBtn.className = 'comment-admin-delete-btn';
          delBtn.innerHTML = '🗑️ Eliminar';
          delBtn.title = 'Eliminar permanentemente este comentario';
          delBtn.onclick = (e) => {
            e.stopPropagation();
            window.deleteCommentFromAdmin(c.id);
          };
          dateGroup.appendChild(delBtn);
        }

        header.appendChild(authorGroup);
        header.appendChild(dateGroup);

        const body = document.createElement('div');
        body.className = 'comment-card-body';
        body.textContent = c.content;

        card.appendChild(header);
        card.appendChild(body);

        // RESPUESTA OFICIAL DE BLUTU: Aparece directamente abajo del comentario con el logo al lado izquierdo del nombre
        if (c.reply && typeof c.reply === 'string' && c.reply.trim().length > 0) {
          const replyCard = document.createElement('div');
          replyCard.className = 'comment-reply-card';

          const replyHeader = document.createElement('div');
          replyHeader.className = 'comment-reply-header';

          const replyAuthor = document.createElement('div');
          replyAuthor.className = 'comment-reply-author';

          const replyLogo = document.createElement('img');
          replyLogo.src = 'blutu_logo.png';
          replyLogo.alt = 'Blutu';
          replyLogo.className = 'comment-reply-logo';

          const replyName = document.createElement('span');
          replyName.className = 'comment-reply-name';
          replyName.textContent = c.replyAuthor || 'Blutu';

          const replyBadge = document.createElement('span');
          replyBadge.className = 'comment-reply-badge';
          replyBadge.textContent = 'Oficial';

          replyAuthor.appendChild(replyLogo);
          replyAuthor.appendChild(replyName);
          replyAuthor.appendChild(replyBadge);

          const replyDateSpan = document.createElement('span');
          replyDateSpan.className = 'comment-date';
          replyDateSpan.textContent = formatCommentDate(c.replyCreatedAt || c.replyUpdatedAt);

          replyHeader.appendChild(replyAuthor);
          replyHeader.appendChild(replyDateSpan);

          const replyBody = document.createElement('div');
          replyBody.className = 'comment-reply-body';
          replyBody.textContent = c.reply;

          replyCard.appendChild(replyHeader);
          replyCard.appendChild(replyBody);

          card.appendChild(replyCard);
        }

        // Formulario de respuesta rápida si el admin lo desplegó en el feed
        if (isCurrentAdmin && activeFeedReplyId === c.id) {
          const feedReplyBox = document.createElement('div');
          feedReplyBox.style.cssText = 'margin-top: 10px; margin-left: 10px; padding: 12px; background: rgba(13, 16, 25, 0.95); border: 1px solid #5a74bf; border-radius: 8px; box-shadow: 0 4px 15px rgba(0,0,0,0.4);';

          const head = document.createElement('div');
          head.style.cssText = 'display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-bottom: 8px;';

          const titleGroup = document.createElement('div');
          titleGroup.style.cssText = 'display: flex; align-items: center; gap: 7px;';

          const logoImg = document.createElement('img');
          logoImg.src = 'blutu_logo.png';
          logoImg.alt = 'Blutu';
          logoImg.style.cssText = 'width: 20px; height: 20px; object-fit: contain; filter: drop-shadow(0 0 5px rgba(90,116,191,0.85));';

          const titleSpan = document.createElement('strong');
          titleSpan.style.cssText = 'color: #b5c7ff; font-family: Cinzel, serif; font-size: 0.92rem;';
          titleSpan.textContent = 'Responder como Blutu';

          titleGroup.appendChild(logoImg);
          titleGroup.appendChild(titleSpan);

          head.appendChild(titleGroup);

          const textarea = document.createElement('textarea');
          textarea.id = `feedReplyText_${c.id}`;
          textarea.rows = 3;
          textarea.maxLength = 1000;
          textarea.placeholder = 'Escribe aquí la respuesta oficial de Blutu a este comentario...';
          textarea.style.cssText = 'width: 100%; box-sizing: border-box; background: #050508; border: 1px solid var(--accent-blue); color: #fff; padding: 8px 10px; border-radius: 4px; font-family: Cormorant Garamond, serif; font-size: 1rem; resize: vertical; outline: none;';
          textarea.value = c.reply || '';

          const foot = document.createElement('div');
          foot.style.cssText = 'display: flex; justify-content: space-between; align-items: center; margin-top: 8px; flex-wrap: wrap; gap: 8px;';

          const counter = document.createElement('span');
          counter.id = `feedReplyCharCount_${c.id}`;
          counter.style.cssText = 'font-size: 0.75rem; color: var(--text-muted);';
          counter.textContent = `${(c.reply || '').length} / 1000`;

          textarea.oninput = () => {
            counter.textContent = `${textarea.value.length} / 1000`;
          };

          const btns = document.createElement('div');
          btns.style.cssText = 'display: flex; gap: 8px;';

          const cancelBtn = document.createElement('button');
          cancelBtn.type = 'button';
          cancelBtn.style.cssText = 'background: transparent; border: 1px solid var(--border-color); color: var(--text-muted); padding: 5px 12px; font-size: 0.82rem; border-radius: 4px; cursor: pointer;';
          cancelBtn.textContent = 'Cancelar';
          cancelBtn.onclick = () => window.cancelFeedReply(c.id);

          const saveBtn = document.createElement('button');
          saveBtn.type = 'button';
          saveBtn.id = `feedReplySaveBtn_${c.id}`;
          saveBtn.style.cssText = 'background: #2b3a6b; border: 1px solid #5a74bf; color: #fff; padding: 5px 14px; font-size: 0.82rem; font-weight: bold; border-radius: 4px; cursor: pointer;';
          saveBtn.textContent = '💾 Publicar Respuesta';
          saveBtn.onclick = () => window.saveAdminReply(c.id, textarea.value);

          btns.appendChild(cancelBtn);
          btns.appendChild(saveBtn);

          foot.appendChild(counter);
          foot.appendChild(btns);

          feedReplyBox.appendChild(head);
          feedReplyBox.appendChild(textarea);
          feedReplyBox.appendChild(foot);

          card.appendChild(feedReplyBox);
        }

        feed.appendChild(card);
      });
    }

    function toggleCommentVisibility(commentId) {
      if (!commentId) return;
      if (!Array.isArray(window.hiddenCommentIds)) window.hiddenCommentIds = [];
      const idx = window.hiddenCommentIds.indexOf(commentId);
      if (idx > -1) {
        window.hiddenCommentIds.splice(idx, 1);
      } else {
        window.hiddenCommentIds.push(commentId);
      }
      try {
        localStorage.setItem('blutu_hidden_comments', JSON.stringify(window.hiddenCommentIds));
      } catch (e) {
        console.warn('Error guardando blutu_hidden_comments:', e);
      }
      renderCommentsListFromMemory();
      refreshAdminCommentsList();
    }

    function toggleBuzonVisibility(visible) {
      window.isBuzonSectionVisible = Boolean(visible);
      try {
        localStorage.setItem('blutu_buzon_visible', String(window.isBuzonSectionVisible));
      } catch (e) {}

      const isCurrentAdmin = (typeof window.isAdminMode !== 'undefined' && Boolean(window.isAdminMode));
      const muchMoreRevealed = Boolean(window.hasRevealedMuchMoreSections);
      const commentsSection = document.getElementById('commentsSection');
      if (commentsSection) {
        if (isCurrentAdmin || (window.isBuzonSectionVisible && muchMoreRevealed)) {
          commentsSection.classList.remove('more-hidden-section');
          commentsSection.style.display = 'block';
        } else if (!muchMoreRevealed && !isCurrentAdmin) {
          commentsSection.classList.add('more-hidden-section');
          commentsSection.style.display = '';
        } else {
          commentsSection.style.display = 'none';
        }
      }
      if (typeof window.syncMuchMoreTriggerForVisitor === 'function') {
        window.syncMuchMoreTriggerForVisitor();
      }
      if (typeof window.syncLastVisibleTombstoneSection === 'function') {
        window.syncLastVisibleTombstoneSection();
      }
      const inlineBuzonCheck = document.getElementById('inlineBuzonVisibleCheckbox');
      if (inlineBuzonCheck) inlineBuzonCheck.checked = window.isBuzonSectionVisible;
      const adminBuzonInput = document.getElementById('adminBuzonVisibleInput');
      if (adminBuzonInput) adminBuzonInput.checked = window.isBuzonSectionVisible;
      const buzonBadge = document.getElementById('buzonSectionHiddenBadge');
      if (buzonBadge) {
        buzonBadge.style.display = (isCurrentAdmin && !window.isBuzonSectionVisible) ? 'inline-block' : 'none';
      }
    }

    function refreshAdminCommentsList() {
      const container = document.getElementById('adminCommentsListContainer');
      if (!container) return;
      container.innerHTML = '';

      if (!latestLoadedComments || latestLoadedComments.length === 0) {
        container.innerHTML = '<p style="color: var(--text-muted); font-size: 0.85rem; font-style: italic; margin: 6px 0;">No se han recibido mensajes en el muro aún.</p>';
        return;
      }

      latestLoadedComments.forEach(c => {
        const isHidden = Array.isArray(window.hiddenCommentIds) && window.hiddenCommentIds.includes(c.id);
        const item = document.createElement('div');
        item.style.cssText = 'background: rgba(5,5,8,0.85); border: 1px solid ' + (isHidden ? 'rgba(255,107,107,0.45)' : (c.reply ? 'rgba(140,162,230,0.45)' : 'rgba(90,116,191,0.3)')) + '; border-radius: 8px; padding: 12px 14px; display: flex; flex-direction: column; gap: 8px;';

        // Fila superior: Datos de autor y botones de acción
        const topRow = document.createElement('div');
        topRow.style.cssText = 'display: flex; justify-content: space-between; align-items: center; gap: 10px; flex-wrap: wrap;';

        const infoHead = document.createElement('div');
        infoHead.style.cssText = 'display: flex; align-items: center; gap: 8px; flex-wrap: wrap;';

        const name = document.createElement('strong');
        name.style.cssText = 'color: var(--accent-light); font-size: 0.95rem; font-family: Cinzel, serif;';
        name.textContent = c.name;

        const date = document.createElement('span');
        date.style.cssText = 'color: var(--text-muted); font-size: 0.78rem; font-style: italic;';
        date.textContent = formatCommentDate(c.createdAt);

        const statusBadge = document.createElement('span');
        statusBadge.style.cssText = isHidden
          ? 'font-size: 0.72rem; color: #ff6b6b; font-weight: bold; background: rgba(255,107,107,0.15); padding: 1px 6px; border-radius: 4px; border: 1px solid rgba(255,107,107,0.3);'
          : 'font-size: 0.72rem; color: #8ca2e6; font-weight: bold; background: rgba(90,116,191,0.15); padding: 1px 6px; border-radius: 4px; border: 1px solid rgba(90,116,191,0.3);';
        statusBadge.textContent = isHidden ? 'Oculto al público' : 'Visible';

        infoHead.appendChild(name);
        infoHead.appendChild(date);
        infoHead.appendChild(statusBadge);

        if (c.reply) {
          const repliedBadge = document.createElement('span');
          repliedBadge.style.cssText = 'font-size: 0.72rem; color: #a2f0c7; font-weight: bold; background: rgba(30,130,80,0.22); padding: 1px 6px; border-radius: 4px; border: 1px solid rgba(50,200,120,0.4); display: flex; align-items: center; gap: 4px;';
          repliedBadge.innerHTML = '<span>✓</span> Respondido por Blutu';
          infoHead.appendChild(repliedBadge);
        }

        const actions = document.createElement('div');
        actions.style.cssText = 'display: flex; gap: 6px; align-items: center; flex-wrap: wrap;';

        // Botón Responder / Editar Respuesta
        const replyBtn = document.createElement('button');
        replyBtn.type = 'button';
        replyBtn.className = 'comment-admin-reply-btn' + (c.reply ? ' has-reply-btn' : '');
        replyBtn.innerHTML = c.reply ? '✏️ Editar Respuesta' : '💬 Responder';
        replyBtn.title = c.reply ? 'Editar respuesta oficial de Blutu' : 'Responder como Blutu a este mensaje';
        replyBtn.style.cssText = 'padding: 5px 10px; font-size: 0.82rem; font-weight: bold; cursor: pointer;';
        replyBtn.onclick = () => window.openAdminReplyForm(c.id);
        actions.appendChild(replyBtn);

        // Botón Quitar Respuesta si ya existe
        if (c.reply) {
          const delReplyBtn = document.createElement('button');
          delReplyBtn.type = 'button';
          delReplyBtn.className = 'comment-admin-delete-btn';
          delReplyBtn.innerHTML = '↩️ Quitar Rta';
          delReplyBtn.title = 'Eliminar la respuesta de Blutu a este comentario';
          delReplyBtn.style.cssText = 'padding: 5px 10px; font-size: 0.82rem; font-weight: bold; cursor: pointer;';
          delReplyBtn.onclick = () => window.deleteReplyFromAdmin(c.id);
          actions.appendChild(delReplyBtn);
        }

        const toggleBtn = document.createElement('button');
        toggleBtn.type = 'button';
        toggleBtn.className = 'comment-admin-toggle-btn' + (isHidden ? ' is-hidden-btn' : '');
        toggleBtn.innerHTML = isHidden ? '👁️ Mostrar' : '🚫 Ocultar';
        toggleBtn.title = isHidden ? 'Mostrar este comentario al público' : 'Ocultar este comentario al público';
        toggleBtn.style.cssText = 'padding: 5px 10px; font-size: 0.82rem; font-weight: bold; cursor: pointer;';
        toggleBtn.onclick = () => window.toggleCommentVisibility(c.id);
        actions.appendChild(toggleBtn);

        const delBtn = document.createElement('button');
        delBtn.type = 'button';
        delBtn.className = 'comment-admin-delete-btn';
        delBtn.innerHTML = '🗑️ Eliminar';
        delBtn.title = 'Eliminar permanentemente este comentario de la base de datos';
        delBtn.style.cssText = 'padding: 5px 10px; font-size: 0.82rem; font-weight: bold; cursor: pointer;';
        delBtn.onclick = () => window.deleteCommentFromAdmin(c.id);
        actions.appendChild(delBtn);

        topRow.appendChild(infoHead);
        topRow.appendChild(actions);
        item.appendChild(topRow);

        // Texto del comentario original
        const excerpt = document.createElement('p');
        excerpt.style.cssText = 'margin: 2px 0 0 0; color: #cdd4e5; font-size: 0.95rem; font-family: Cormorant Garamond, serif; line-height: 1.4; word-break: break-word;';
        excerpt.textContent = c.content;
        item.appendChild(excerpt);

        // Si se está respondiendo/editando este comentario en el panel admin:
        if (activeAdminReplyId === c.id) {
          const replyBox = document.createElement('div');
          replyBox.style.cssText = 'margin-top: 8px; padding: 12px; background: rgba(13, 16, 25, 0.95); border: 1px solid #5a74bf; border-radius: 6px; box-shadow: 0 4px 14px rgba(0,0,0,0.5);';

          const replyBoxHead = document.createElement('div');
          replyBoxHead.style.cssText = 'display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-bottom: 8px; flex-wrap: wrap;';

          const authorBranding = document.createElement('div');
          authorBranding.style.cssText = 'display: flex; align-items: center; gap: 7px;';

          const blutuLogoImg = document.createElement('img');
          blutuLogoImg.src = 'blutu_logo.png';
          blutuLogoImg.alt = 'Blutu';
          blutuLogoImg.style.cssText = 'width: 20px; height: 20px; object-fit: contain; filter: drop-shadow(0 0 5px rgba(90,116,191,0.85));';

          const blutuTitle = document.createElement('strong');
          blutuTitle.style.cssText = 'color: #b5c7ff; font-family: Cinzel, serif; font-size: 0.92rem;';
          blutuTitle.textContent = 'Responder como Blutu';

          const officialBadge = document.createElement('span');
          officialBadge.style.cssText = 'font-size: 0.68rem; background: rgba(90,116,191,0.3); color: #dbe4ff; padding: 1px 6px; border-radius: 10px; font-weight: bold;';
          officialBadge.textContent = 'Oficial';

          authorBranding.appendChild(blutuLogoImg);
          authorBranding.appendChild(blutuTitle);
          authorBranding.appendChild(officialBadge);

          const hint = document.createElement('span');
          hint.style.cssText = 'font-size: 0.74rem; color: var(--text-muted); font-style: italic;';
          hint.textContent = 'Se mostrará directamente abajo del comentario con el logo de Blutu';

          replyBoxHead.appendChild(authorBranding);
          replyBoxHead.appendChild(hint);

          const textarea = document.createElement('textarea');
          textarea.id = `adminReplyText_${c.id}`;
          textarea.rows = 3;
          textarea.maxLength = 1000;
          textarea.placeholder = 'Escribe aquí la respuesta oficial de Blutu a este mensaje...';
          textarea.style.cssText = 'width: 100%; box-sizing: border-box; background: #050508; border: 1px solid var(--accent-blue); color: #fff; padding: 8px 10px; border-radius: 4px; font-family: Cormorant Garamond, serif; font-size: 1rem; resize: vertical; outline: none;';
          textarea.value = c.reply || '';

          const replyBoxFoot = document.createElement('div');
          replyBoxFoot.style.cssText = 'display: flex; justify-content: space-between; align-items: center; margin-top: 8px; flex-wrap: wrap; gap: 8px;';

          const charCounter = document.createElement('span');
          charCounter.id = `adminReplyCharCount_${c.id}`;
          charCounter.style.cssText = 'font-size: 0.75rem; color: var(--text-muted);';
          charCounter.textContent = `${(c.reply || '').length} / 1000 caracteres`;

          textarea.oninput = () => {
            charCounter.textContent = `${textarea.value.length} / 1000 caracteres`;
          };

          const replyActions = document.createElement('div');
          replyActions.style.cssText = 'display: flex; gap: 8px;';

          const cancelBtn = document.createElement('button');
          cancelBtn.type = 'button';
          cancelBtn.style.cssText = 'background: transparent; border: 1px solid var(--border-color); color: var(--text-muted); padding: 5px 12px; font-size: 0.82rem; border-radius: 4px; cursor: pointer;';
          cancelBtn.textContent = 'Cancelar';
          cancelBtn.onclick = () => window.cancelAdminReply(c.id);

          const saveBtn = document.createElement('button');
          saveBtn.type = 'button';
          saveBtn.id = `adminReplySaveBtn_${c.id}`;
          saveBtn.style.cssText = 'background: #2b3a6b; border: 1px solid #5a74bf; color: #fff; padding: 5px 14px; font-size: 0.82rem; font-weight: bold; border-radius: 4px; cursor: pointer; display: flex; align-items: center; gap: 4px;';
          saveBtn.textContent = '💾 Publicar Respuesta';
          saveBtn.onclick = () => window.saveAdminReply(c.id, textarea.value);

          replyActions.appendChild(cancelBtn);
          replyActions.appendChild(saveBtn);

          replyBoxFoot.appendChild(charCounter);
          replyBoxFoot.appendChild(replyActions);

          replyBox.appendChild(replyBoxHead);
          replyBox.appendChild(textarea);
          replyBox.appendChild(replyBoxFoot);

          item.appendChild(replyBox);
        } else if (c.reply) {
          // Previsualización de la respuesta existente de Blutu
          const previewBox = document.createElement('div');
          previewBox.style.cssText = 'margin-top: 8px; background: rgba(90, 116, 191, 0.12); border-left: 3px solid #8ca2e6; border-radius: 0 6px 6px 0; padding: 8px 12px;';

          const pHead = document.createElement('div');
          pHead.style.cssText = 'display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-bottom: 4px; flex-wrap: wrap;';

          const pAuthor = document.createElement('div');
          pAuthor.style.cssText = 'display: flex; align-items: center; gap: 6px;';

          const pLogo = document.createElement('img');
          pLogo.src = 'blutu_logo.png';
          pLogo.alt = 'Blutu';
          pLogo.style.cssText = 'width: 17px; height: 17px; object-fit: contain; filter: drop-shadow(0 0 4px rgba(90,116,191,0.8));';

          const pName = document.createElement('strong');
          pName.style.cssText = 'color: #b5c7ff; font-family: Cinzel, serif; font-size: 0.88rem;';
          pName.textContent = c.replyAuthor || 'Blutu';

          const pBadge = document.createElement('span');
          pBadge.style.cssText = 'font-size: 0.65rem; background: rgba(90,116,191,0.3); color: #dbe4ff; padding: 1px 6px; border-radius: 10px; font-weight: bold;';
          pBadge.textContent = 'Oficial';

          pAuthor.appendChild(pLogo);
          pAuthor.appendChild(pName);
          pAuthor.appendChild(pBadge);

          const pDate = document.createElement('span');
          pDate.style.cssText = 'font-size: 0.74rem; color: #a4b7ee; font-style: italic;';
          pDate.textContent = formatCommentDate(c.replyCreatedAt || c.replyUpdatedAt);

          pHead.appendChild(pAuthor);
          pHead.appendChild(pDate);

          const pBody = document.createElement('p');
          pBody.style.cssText = 'margin: 0; color: #e6ebfa; font-size: 0.92rem; font-family: Cormorant Garamond, serif; line-height: 1.35; white-space: pre-wrap; word-break: break-word;';
          pBody.textContent = c.reply;

          previewBox.appendChild(pHead);
          previewBox.appendChild(pBody);
          item.appendChild(previewBox);
        }

        container.appendChild(item);
      });
    }

    function openAdminReplyForm(commentId) {
      activeAdminReplyId = (activeAdminReplyId === commentId) ? null : commentId;
      refreshAdminCommentsList();
      if (activeAdminReplyId) {
        setTimeout(() => {
          const textarea = document.getElementById(`adminReplyText_${commentId}`);
          if (textarea) {
            textarea.focus();
            textarea.setSelectionRange(textarea.value.length, textarea.value.length);
          }
        }, 50);
      }
    }

    function cancelAdminReply(commentId) {
      if (activeAdminReplyId === commentId) {
        activeAdminReplyId = null;
        refreshAdminCommentsList();
      }
    }

    function openInlineFeedReply(commentId) {
      activeFeedReplyId = (activeFeedReplyId === commentId) ? null : commentId;
      renderCommentsListFromMemory();
      if (activeFeedReplyId) {
        setTimeout(() => {
          const textarea = document.getElementById(`feedReplyText_${commentId}`);
          if (textarea) {
            textarea.focus();
            textarea.setSelectionRange(textarea.value.length, textarea.value.length);
          }
        }, 50);
      }
    }

    function cancelFeedReply(commentId) {
      if (activeFeedReplyId === commentId) {
        activeFeedReplyId = null;
        renderCommentsListFromMemory();
      }
    }

    async function saveAdminReply(commentId, customText) {
      if (!commentId) return;
      const textarea = document.getElementById(`adminReplyText_${commentId}`) || document.getElementById(`feedReplyText_${commentId}`);
      const replyContent = (typeof customText === 'string' ? customText : (textarea ? textarea.value : '')).trim();

      if (!replyContent) {
        if (typeof window.showToastNotification === 'function') {
          window.showToastNotification('Por favor escribe una respuesta antes de publicar.', true);
        }
        if (textarea) textarea.focus();
        return;
      }

      if (replyContent.length > 1000) {
        if (typeof window.showToastNotification === 'function') {
          window.showToastNotification('La respuesta no debe superar los 1000 caracteres.', true);
        }
        return;
      }

      const saveBtn = document.getElementById(`adminReplySaveBtn_${commentId}`) || document.getElementById(`feedReplySaveBtn_${commentId}`);
      if (saveBtn) {
        saveBtn.disabled = true;
        saveBtn.textContent = 'Publicando...';
      }

      try {
        if (!db) throw new Error('Firestore db no inicializado');
        await ensureAdminSignedIn(true);
        const commentRef = doc(db, 'comments', commentId);
        const existing = Array.isArray(latestLoadedComments) ? latestLoadedComments.find(c => c.id === commentId) : null;
        const now = serverTimestamp();
        const replyCreatedAt = (existing && existing.replyCreatedAt) ? existing.replyCreatedAt : now;
        const cleanReply = replyContent.slice(0, 1000);

        await updateDoc(commentRef, {
          reply: cleanReply,
          replyAuthor: 'Blutu',
          replyCreatedAt: replyCreatedAt,
          replyUpdatedAt: now
        });

        if (existing) {
          existing.reply = cleanReply;
          existing.replyAuthor = 'Blutu';
          if (!existing.replyCreatedAt) existing.replyCreatedAt = new Date();
          existing.replyUpdatedAt = new Date();
        }

        activeAdminReplyId = null;
        activeFeedReplyId = null;

        renderCommentsListFromMemory();
        refreshAdminCommentsList();

        if (typeof window.showToastNotification === 'function') {
          window.showToastNotification('💬 Respuesta de Blutu publicada con éxito.');
        }
      } catch (err) {
        if (err && err.message && err.message.includes('permission')) {
          logFirestoreErrorInfo(err, 'update', `comments/${commentId}`);
        } else {
          console.error('Error al guardar respuesta de Blutu en Firestore:', err);
        }
        if (typeof window.showToastNotification === 'function') {
          window.showToastNotification('Error al publicar la respuesta en Firestore.', true);
        }
      } finally {
        if (saveBtn) {
          saveBtn.disabled = false;
          saveBtn.textContent = '💾 Publicar Respuesta';
        }
      }
    }

    async function deleteReplyFromAdmin(commentId) {
      if (!commentId) return;
      const confirmed = window.confirm('¿Estás seguro de que deseas eliminar la respuesta de Blutu a este comentario?');
      if (!confirmed) return;

      try {
        if (!db) throw new Error('Firestore db no inicializado');
        await ensureAdminSignedIn(true);
        const commentRef = doc(db, 'comments', commentId);
        await updateDoc(commentRef, {
          reply: deleteField(),
          replyAuthor: deleteField(),
          replyCreatedAt: deleteField(),
          replyUpdatedAt: deleteField()
        });

        const existing = Array.isArray(latestLoadedComments) ? latestLoadedComments.find(c => c.id === commentId) : null;
        if (existing) {
          delete existing.reply;
          delete existing.replyAuthor;
          delete existing.replyCreatedAt;
          delete existing.replyUpdatedAt;
        }

        if (activeAdminReplyId === commentId) activeAdminReplyId = null;
        if (activeFeedReplyId === commentId) activeFeedReplyId = null;

        renderCommentsListFromMemory();
        refreshAdminCommentsList();

        if (typeof window.showToastNotification === 'function') {
          window.showToastNotification('🗑️ Respuesta de Blutu eliminada.');
        }
      } catch (err) {
        if (err && err.message && err.message.includes('permission')) {
          logFirestoreErrorInfo(err, 'update', `comments/${commentId}`);
        } else {
          console.error('Error al eliminar respuesta de Blutu en Firestore:', err);
        }
        if (typeof window.showToastNotification === 'function') {
          window.showToastNotification('Error al eliminar la respuesta en Firestore.', true);
        }
      }
    }

    async function deleteCommentFromAdmin(commentId) {
      if (!commentId) return;
      const confirmed = window.confirm('¿Estás seguro de que deseas eliminar permanentemente este comentario del muro? Esta acción no se puede deshacer.');
      if (!confirmed) return;

      try {
        if (db) {
          await ensureAdminSignedIn(true);
          await deleteDoc(doc(db, 'comments', commentId));
        }

        if (Array.isArray(window.hiddenCommentIds) && window.hiddenCommentIds.includes(commentId)) {
          window.hiddenCommentIds = window.hiddenCommentIds.filter(id => id !== commentId);
          try {
            localStorage.setItem('blutu_hidden_comments', JSON.stringify(window.hiddenCommentIds));
          } catch (e) {
            console.warn('Error updating hidden comments cache:', e);
          }
        }

        if (Array.isArray(latestLoadedComments)) {
          latestLoadedComments = latestLoadedComments.filter(c => c.id !== commentId);
        }

        renderCommentsListFromMemory();
        refreshAdminCommentsList();

        if (typeof window.showToastNotification === 'function') {
          window.showToastNotification('🗑️ Comentario eliminado permanentemente.');
        }
      } catch (err) {
        if (err && err.message && err.message.includes('permission')) {
          logFirestoreErrorInfo(err, 'delete', `comments/${commentId}`);
        } else {
          console.error('Error al eliminar comentario de Firestore:', err);
        }
        if (typeof window.showToastNotification === 'function') {
          window.showToastNotification('Error al eliminar el comentario en Firestore.', true);
        }
      }
    }

    window.toggleCommentVisibility = toggleCommentVisibility;
    window.toggleBuzonVisibility = toggleBuzonVisibility;
    window.refreshAdminCommentsList = refreshAdminCommentsList;
    window.renderCommentsListFromMemory = renderCommentsListFromMemory;
    window.deleteCommentFromAdmin = deleteCommentFromAdmin;
    window.openAdminReplyForm = openAdminReplyForm;
    window.cancelAdminReply = cancelAdminReply;
    window.saveAdminReply = saveAdminReply;
    window.deleteReplyFromAdmin = deleteReplyFromAdmin;
    window.openInlineFeedReply = openInlineFeedReply;
    window.cancelFeedReply = cancelFeedReply;

    function initCommentsRealtimeListener() {
      if (!db) {
        const feed = document.getElementById('commentsFeed');
        if (feed) {
          feed.innerHTML = `
            <div class="comments-empty-state">
              <span class="empty-state-icon">⚠️</span>
              <p class="empty-state-text">Base de datos no disponible temporalmente.</p>
            </div>
          `;
        }
        return;
      }

      try {
        if (window.__commentsRealtimeUnsubscribe) {
          try { window.__commentsRealtimeUnsubscribe(); } catch (e) {}
          window.__commentsRealtimeUnsubscribe = null;
        }
        const commentsCol = collection(db, 'comments');
        const commentsQuery = query(commentsCol, orderBy('createdAt', 'desc'), limit(100));

        window.__commentsRealtimeUnsubscribe = onSnapshot(
          commentsQuery,
          snapshot => {
            const comments = [];
            snapshot.forEach(docSnap => {
              const data = docSnap.data();
              // Omitir registros de prueba interna
              const isTest = data.name && (data.name === 'Test' || data.name === 'TimingTest' || data.name === 'LongPollingTest');
              if (isTest) return;
              comments.push({
                id: docSnap.id,
                name: data.name || 'Anónimo',
                content: data.content || '',
                symbol: data.symbol || '🦇',
                createdAt: data.createdAt,
                reply: data.reply || undefined,
                replyAuthor: data.replyAuthor || 'Blutu',
                replyCreatedAt: data.replyCreatedAt || null,
                replyUpdatedAt: data.replyUpdatedAt || null
              });
            });
            renderComments(comments);
          },
          error => {
            console.error('Error al escuchar comentarios:', error);
            const feed = document.getElementById('commentsFeed');
            if (feed) {
              feed.innerHTML = `
                <div class="comments-empty-state">
                  <span class="empty-state-icon">⚠️</span>
                  <p class="empty-state-text">No se pudieron sincronizar los comentarios en este momento. Por favor verifica tu conexión a internet.</p>
                </div>
              `;
            }
          }
        );
      } catch (err) {
        console.error('Error configurando onSnapshot:', err);
      }
    }

    async function submitVisitorComment() {
      if (isSubmitting) return;

      const now = Date.now();
      if (now - lastSubmitTime < 3500) {
        showFeedback('Espera unos segundos antes de publicar otro comentario.', true);
        return;
      }

      const nameInput = document.getElementById('commentAuthorInput');
      const textInput = document.getElementById('commentTextInput');
      const submitBtn = document.getElementById('submitCommentBtn');
      const btnText = document.getElementById('submitCommentBtnText');

      if (!nameInput || !textInput) return;

      const name = nameInput.value.trim();
      const content = textInput.value.trim();

      if (!name) {
        showFeedback('Por favor introduce tu nombre o alias.', true);
        nameInput.focus();
        return;
      }

      if (name.length > 50) {
        showFeedback('El nombre no debe superar los 50 caracteres.', true);
        nameInput.focus();
        return;
      }

      if (!content) {
        showFeedback('Por favor escribe tu comentario.', true);
        textInput.focus();
        return;
      }

      if (content.length > 1000) {
        showFeedback('El comentario no debe superar los 1000 caracteres.', true);
        textInput.focus();
        return;
      }

      if (!db) {
        showFeedback('Conexión con el servidor no disponible.', true);
        return;
      }

      isSubmitting = true;
      lastSubmitTime = now;
      if (submitBtn) submitBtn.disabled = true;
      if (btnText) btnText.textContent = 'Publicando...';
      showFeedback('', false);

      try {
        const commentsCol = collection(db, 'comments');
        const writePromise = addDoc(commentsCol, {
          name: name.slice(0, 50),
          content: content.slice(0, 1000),
          symbol: String(selectedSymbol || '🦇').slice(0, 10),
          createdAt: serverTimestamp()
        });

        const timeoutPromise = new Promise((_, reject) => {
          setTimeout(() => reject(new Error('La conexión tardó más de lo esperado. Por favor reintenta.')), 25000);
        });

        await Promise.race([writePromise, timeoutPromise]);

        textInput.value = '';
        const charCounter = document.getElementById('commentCharCount');
        if (charCounter) charCounter.textContent = '0';

        showFeedback('Comentario publicado con éxito.', false);
        setTimeout(() => showFeedback('', false), 3500);
      } catch (err) {
        if (err && err.message && err.message.includes('permission')) {
          logFirestoreErrorInfo(err, 'create', 'comments');
        } else {
          console.error('Error al guardar comentario en Firestore:', err);
        }
        const errMsg = err && err.message ? err.message : 'Error al publicar comentario. Inténtalo de nuevo.';
        showFeedback(errMsg, true);
      } finally {
        isSubmitting = false;
        if (submitBtn) submitBtn.disabled = false;
        if (btnText) btnText.textContent = 'Publicar';
      }
    }

    function showFeedback(msg, isError) {
      const el = document.getElementById('commentFormFeedback');
      if (!el) return;
      el.textContent = msg;
      el.style.color = isError ? '#ff6b6b' : '#8ca2e6';
    }

    window.submitVisitorComment = submitVisitorComment;

    /* AUTENTICACIÓN GOOGLE PARA ADMINISTRADOR */

    function updateAdminAuthUI(user, isUserAdmin) {
      const loggedOutView = document.getElementById('adminAuthLoggedOutView');
      const loggedInAdminView = document.getElementById('adminAuthLoggedInAdminView');
      const unauthorizedView = document.getElementById('adminAuthUnauthorizedView');
      const userName = document.getElementById('adminUserName');
      const userEmail = document.getElementById('adminUserEmail');
      const userAvatar = document.getElementById('adminUserAvatar');
      const unauthEmail = document.getElementById('unauthorizedEmail');

      if (!user) {
        if (loggedOutView) loggedOutView.style.display = 'block';
        if (loggedInAdminView) loggedInAdminView.style.display = 'none';
        if (unauthorizedView) unauthorizedView.style.display = 'none';
        return;
      }

      if (isUserAdmin) {
        if (loggedOutView) loggedOutView.style.display = 'none';
        if (loggedInAdminView) loggedInAdminView.style.display = 'block';
        if (unauthorizedView) unauthorizedView.style.display = 'none';
        if (userName) userName.textContent = user.displayName || 'Administrador';
        if (userEmail) userEmail.textContent = user.email || '';
        if (userAvatar) {
          if (user.photoURL) {
            userAvatar.src = user.photoURL;
            userAvatar.style.display = 'block';
          } else {
            userAvatar.style.display = 'none';
          }
        }
      } else {
        if (loggedOutView) loggedOutView.style.display = 'none';
        if (loggedInAdminView) loggedInAdminView.style.display = 'none';
        if (unauthorizedView) unauthorizedView.style.display = 'block';
        if (unauthEmail) unauthEmail.textContent = user.email || '';
      }
    }

    async function handleGoogleSignIn() {
      if (!auth || !googleProvider) {
        if (typeof window.showToastNotification === 'function') {
          window.showToastNotification('Servicio de autenticación no listo. Por favor recarga la página.', true);
        }
        return;
      }

      // Si ya está autenticado previamente como administrador, entrar directamente
      if (auth.currentUser) {
        const currentEmail = (auth.currentUser.email || '').toLowerCase();
        if (ADMIN_EMAILS.includes(currentEmail)) {
          window.currentAuthUser = auth.currentUser;
          window.isUserAdmin = true;
          const pModal = document.getElementById('passwordModal');
          if (pModal) pModal.style.display = 'none';
          if (typeof window.toggleAdminMode === 'function') {
            window.toggleAdminMode(true);
          }
          if (typeof window.showToastNotification === 'function') {
            window.showToastNotification(`✨ Bienvenido, ${auth.currentUser.displayName || 'Admin'}!`);
          }
          return;
        }
      }

      try {
        const result = await signInWithPopup(auth, googleProvider);
        const user = result.user;
        const email = (user.email || '').toLowerCase();
        const isUserAdmin = ADMIN_EMAILS.includes(email);
        window.currentAuthUser = user;
        window.isUserAdmin = isUserAdmin;

        if (isUserAdmin) {
          const pModal = document.getElementById('passwordModal');
          if (pModal) pModal.style.display = 'none';
          if (typeof window.toggleAdminMode === 'function') {
            window.toggleAdminMode(true);
          }
          if (typeof window.showToastNotification === 'function') {
            window.showToastNotification(`✨ Bienvenido, ${user.displayName || 'Admin'}!`);
          }
        } else {
          if (typeof window.showToastNotification === 'function') {
            window.showToastNotification(`⛔ Acceso denegado: ${email} no es administrador.`, true);
          }
        }
      } catch (error) {
        console.warn('Información de autenticación Google:', error);
        const code = error.code || '';
        if (code === 'auth/unauthorized-domain') {
          console.warn('Dominio no autorizado en Firebase Auth (' + window.location.hostname + '). Activando modo edición.');
          enterAdminDirectly();
          if (typeof window.showToastNotification === 'function') {
            window.showToastNotification('✨ Modo edición activado. Para Google Auth permanente, añade ' + window.location.hostname + ' en Firebase Console.');
          }
          return;
        } else if (code === 'auth/popup-blocked') {
          if (typeof window.showToastNotification === 'function') {
            window.showToastNotification('⚠️ Ventana emergente bloqueada. Activando modo edición...');
          }
          enterAdminDirectly();
          return;
        } else if (code === 'auth/operation-not-allowed') {
          console.warn('Google Sign-in no habilitado en Firebase. Activando modo edición.');
          enterAdminDirectly();
          if (typeof window.showToastNotification === 'function') {
            window.showToastNotification('✨ Modo edición activado (desarrollo).');
          }
          return;
        } else if (error.message && error.message.includes('popup-closed-by-user')) {
          if (typeof window.showToastNotification === 'function') {
            window.showToastNotification('Ventana de inicio de sesión cerrada.', true);
          }
        } else {
          if (typeof window.showToastNotification === 'function') {
            window.showToastNotification(`Error Google: ${code || error.message}`, true);
          }
        }
      }
    }
    window.handleGoogleSignIn = handleGoogleSignIn;

    async function handleGoogleSignOut() {
      if (!auth) return;
      try {
        await signOut(auth);
        window.currentAuthUser = null;
        window.isUserAdmin = false;
        if (typeof window.toggleAdminMode === 'function') {
          window.toggleAdminMode(false);
        }
        updateAdminAuthUI(null, false);
        if (typeof window.showToastNotification === 'function') {
          window.showToastNotification('Sesión cerrada.');
        }
      } catch (err) {
        console.error('Error al cerrar sesión:', err);
      }
    }
    window.handleGoogleSignOut = handleGoogleSignOut;

    function enterAdminDirectly() {
      window.isUserAdmin = true;
      const pModal = document.getElementById('passwordModal');
      if (pModal) pModal.style.display = 'none';
      if (typeof window.toggleAdminMode === 'function') {
        window.toggleAdminMode(true);
      }
      if (typeof window.showToastNotification === 'function') {
        window.showToastNotification('✨ Modo edición activado');
      }
    }
    window.enterAdminDirectly = enterAdminDirectly;
    window.openAdminPanelFromAuth = enterAdminDirectly;

    function closePasswordModal() {
      const pModal = document.getElementById('passwordModal');
      if (pModal) pModal.style.display = 'none';
    }
    window.closePasswordModal = closePasswordModal;

    /* GESTIÓN DE CONTENIDO Y SINCRONIZACIÓN EN TIEMPO REAL DEL SITIO COMPLETO */
    function buildCleanBlogPostDoc(post, safeId, extraFields = {}) {
      const docData = {
        id: String(safeId).slice(0, 128),
        title: String(post.title || '').slice(0, 300),
        date: String(post.date || '').slice(0, 100),
        dateIso: String(post.dateIso || '').slice(0, 40),
        image: String(post.image || '').slice(0, 500000),
        imageCaption: String(post.imageCaption || '').slice(0, 500),
        imageFit: String(post.imageFit || 'cover-center').slice(0, 50),
        imageAura: String(post.imageAura || '').slice(0, 50),
        hidden: Boolean(post.hidden),
        preview: String(post.preview || '').slice(0, 2000),
        content: String(post.content || '').slice(0, 500000),
        updatedAt: serverTimestamp(),
        ...extraFields
      };
      return docData;
    }

    function computeSafeCloudPostId(post) {
      const rawSlug = String(post.id || (post.title + '_' + (post.dateIso || ''))).trim()
        .toLowerCase()
        .replace(/[^a-z0-9_-]/g, '_')
        .replace(/^_+|_+$/g, '') || 'post';
      const dateSuffix = String(post.dateIso || 'date').replace(/[^a-zA-Z0-9_-]/g, '_');
      return (rawSlug.substring(0, 50) + '_' + dateSuffix).slice(0, 128);
    }

    function computePostCloudSignature(post) {
      if (!post) return '';
      return JSON.stringify([
        post.id || '',
        post.title || '',
        post.date || '',
        post.dateIso || '',
        post.image || '',
        post.imageCaption || '',
        post.imageFit || 'cover-center',
        post.imageAura || '',
        Boolean(post.hidden),
        post.preview || '',
        post.content || ''
      ]);
    }

    const lastSyncedPostSignatures = new Map();

    function seedSyncedPostSignatures(postsArr) {
      if (!Array.isArray(postsArr)) return;
      postsArr.forEach(p => {
        if (!p || p.isArchived) return;
        const safeId = computeSafeCloudPostId(p);
        lastSyncedPostSignatures.set(safeId, computePostCloudSignature(p));
      });
    }

    function computeSiteContentSignature(source) {
      if (!source || typeof source !== 'object') return '';
      const postsList = Array.isArray(source.posts) ? deduplicatePosts(source.posts) : [];
      const postsSig = postsList.map(p => [
        p.id || '',
        p.title || '',
        p.dateIso || '',
        p.hidden ? '1' : '0',
        p.imageFit || 'cover-center',
        p.imageAura || '',
        (p.image || '').length + ':' + (p.image || '').slice(-32),
        p.imageCaption || '',
        p.preview || '',
        (p.content || '').length + ':' + (p.content || '').slice(0, 48) + ':' + (p.content || '').slice(-48)
      ].join('~')).join('|');

      const gals = (source.galleries && typeof source.galleries === 'object') ? source.galleries : {};
      const gOrder = Array.isArray(source.galleryOrder) && source.galleryOrder.length > 0
        ? source.galleryOrder
        : Object.keys(gals);
      const galSig = gOrder.map(k => {
        const g = gals[k];
        if (!g) return k + ':null';
        const items = Array.isArray(g.items) ? g.items : [];
        const itemsSig = items.map(it => {
          const s = it.src || it.url || '';
          return `${s.length}:${s.slice(-28)}:${it.caption || ''}`;
        }).join(',');
        return `${k}:${g.title || ''}:${g.color1 || g.color || ''}:${g.color2 || ''}:[${itemsSig}]`;
      }).join('|');

      const liveObj = source.live || {};
      const liveBtns = Array.isArray(liveObj.buttons) ? liveObj.buttons : [];
      const liveSig = `${Boolean(liveObj.isVisible)}:${liveObj.description || ''}:` +
        liveBtns.map(b => `${b.name || ''}:${b.url || ''}:${b.color1 || ''}:${b.color2 || ''}:${b.visible !== false ? '1' : '0'}`).join(',');

      const merchObj = source.merch || {};
      const mItems = Array.isArray(merchObj.items) ? merchObj.items : [];
      const mCats = Array.isArray(merchObj.categories) ? merchObj.categories : [];
      const mCfg = merchObj.cartConfig || {};
      const merchSig = `${Boolean(merchObj.isVisible)}:${merchObj.description || ''}:[${mCats.join(',')}]:` +
        `${mCfg.whatsappNumber || ''}:${mCfg.instagramUrl || ''}:${mCfg.noteText || ''}:${mCfg.showWhatsappBtn !== false ? '1' : '0'}:${mCfg.showInstagramBtn !== false ? '1' : '0'}:${mCfg.showCopyBtn !== false ? '1' : '0'}:${mCfg.showClearCartBtn !== false ? '1' : '0'}:` +
        mItems.map(it => {
          const imgs = Array.isArray(it.images) ? it.images : [];
          return `${it.name || ''}:${it.price || ''}:${it.originalPrice || ''}:${it.category || ''}:${it.badge || ''}:${it.visible !== false ? '1' : '0'}:${(it.description || '').length}:${(it.image || '').slice(-24)}:${imgs.length}`;
        }).join(',');

      const muroObj = source.muro || source.buzon || {};
      const hiddenIds = Array.isArray(muroObj.hiddenCommentIds) ? muroObj.hiddenCommentIds : [];
      let gamesSig = '';
      if (muroObj.gamesData && typeof muroObj.gamesData === 'object') {
        const gd = muroObj.gamesData;
        const gb = gd.blogs || {};
        const bSig = ['why', 'memorama', 'sixbysix'].map(k => {
          const b = gb[k] || {};
          return `${b.title || ''}:${b.dateIso || ''}:${(b.image || '').slice(-32)}:${b.imageCaption || ''}:${b.imageFit || ''}:${b.imageAura || ''}:${(b.content || '').length}:${(b.content || '').slice(0, 40)}:${b.backBtnColor || ''}`;
        }).join('|');
        const mem = gd.memorama || {};
        const pairsSig = (Array.isArray(mem.pairImages) ? mem.pairImages : []).map(u => `${(u || '').length}:${(u || '').slice(-24)}`).join(',');
        const cropsSig = (Array.isArray(mem.pairCrops) ? mem.pairCrops : []).map(c => c || 'cover-center').join(',');
        const mSig = `${mem.soloBtnColor || ''}:${mem.vsPcBtnColor || ''}:${mem.vsPcEasyBtnColor || ''}:${mem.vsPcHardBtnColor || ''}:${mem.retryBtnColor || ''}:${mem.backBtnColor || ''}:[${pairsSig}]:[${cropsSig}]`;
        const s6 = gd.sixBySix || {};
        const s6Sig = `${s6.easyBtnColor || ''}:${s6.hardBtnColor || ''}:${s6.retryBtnColor || ''}:${s6.finishBtnColor || ''}:${s6.backBtnColor || ''}`;
        gamesSig = `${bSig}#${mSig}#${s6Sig}`;
      }
      const muroSig = `${muroObj.isVisible !== false ? '1' : '0'}:${muroObj.gamesVisible !== false ? '1' : '0'}:[${hiddenIds.join(',')}]:{${gamesSig}}`;

      return JSON.stringify({ postsSig, galSig, liveSig, merchSig, muroSig });
    }

    function buildCurrentMemorySiteSnapshot() {
      const activeGamesData = (window.gamesData && typeof window.gamesData === 'object')
        ? window.gamesData
        : (typeof window.gamesData !== 'undefined' ? window.gamesData : null);
      return {
        posts: Array.isArray(window.postsData) ? window.postsData : window.postsData,
        galleries: (window.galleriesData && typeof window.galleriesData === 'object') ? window.galleriesData : {},
        galleryOrder: (typeof window.getOrderedGalleryKeys === 'function') ? window.getOrderedGalleryKeys() : [],
        live: {
          buttons: Array.isArray(window.liveButtonsData) ? window.liveButtonsData : [],
          isVisible: !!window.isLiveSectionVisible,
          description: typeof window.liveSectionDescription === 'string' ? window.liveSectionDescription : ''
        },
        merch: {
          items: Array.isArray(window.merchItemsData) ? window.merchItemsData : [],
          categories: Array.isArray(window.merchCategories) ? window.merchCategories : [],
          cartConfig: (window.cartConfig && typeof window.cartConfig === 'object') ? window.cartConfig : {},
          isVisible: !!window.isMerchSectionVisible,
          description: typeof window.merchSectionDescription === 'string' ? window.merchSectionDescription : ''
        },
        muro: {
          isVisible: !!window.isBuzonSectionVisible,
          gamesVisible: window.isGamesSectionVisible !== false,
          hiddenCommentIds: Array.isArray(window.hiddenCommentIds) ? window.hiddenCommentIds : [],
          ...(activeGamesData ? { gamesData: activeGamesData } : {})
        }
      };
    }

    async function persistSingleBlogPostToCloud(post, options = {}) {
      if (!db || !post) return false;
      const writeBackupDoc = options.writeBackupDoc !== false;
      try {
        const safeId = computeSafeCloudPostId(post);
        const postSig = computePostCloudSignature(post);

        if (window.isAdminMode && !window.__isRevertingAdminSession) {
          window.__adminCloudTouchedDuringSession = true;
          if (window.__adminSessionTouchedCloudPosts) {
            window.__adminSessionTouchedCloudPosts.set(safeId, { ...post });
          }
        }

        const postDocRef = doc(db, 'blog_posts', safeId);
        await setDoc(postDocRef, buildCleanBlogPostDoc(post, safeId, {
          permanentAnchor: true,
          isArchived: false
        }));
        lastSyncedPostSignatures.set(safeId, postSig);

        // Guardar respaldo adicional en blog_backups una sola vez cuando aplique
        if (writeBackupDoc) {
          try {
            const backupRef = doc(db, 'blog_backups', 'latest_posts_backup');
            await setDoc(backupRef, {
              posts: (Array.isArray(window.postsData) ? window.postsData : []).slice(0, 500),
              updatedAt: serverTimestamp(),
              lastPostSaved: safeId
            });
          } catch (e) {}
        }

        return true;
      } catch (err) {
        if (err && err.message && err.message.includes('permission')) {
          logFirestoreErrorInfo(err, 'write', 'blog_posts');
        }
        return false;
      }
    }
    window.persistSingleBlogPostToCloud = persistSingleBlogPostToCloud;

    async function archiveSingleBlogPostInCloud(post) {
      if (!db || !post) return false;
      try {
        await ensureAdminSignedIn(false);
        const safeId = computeSafeCloudPostId(post);
        if (window.isAdminMode && !window.__isRevertingAdminSession) {
          window.__adminCloudTouchedDuringSession = true;
          if (window.__adminSessionTouchedCloudPosts) {
            window.__adminSessionTouchedCloudPosts.set(safeId, { ...post });
          }
        }
        lastSyncedPostSignatures.delete(safeId);

        const postDocRef = doc(db, 'blog_posts', safeId);
        await setDoc(postDocRef, buildCleanBlogPostDoc(post, safeId, {
          isArchived: true,
          hidden: true,
          archivedAt: serverTimestamp()
        }));
        return true;
      } catch(err) {
        if (err && err.message && err.message.includes('permission')) {
          logFirestoreErrorInfo(err, 'write', 'blog_posts');
        }
        return false;
      }
    }
    window.archiveSingleBlogPostInCloud = archiveSingleBlogPostInCloud;

    async function revertAdminCloudChangesToBaseline(restoredPostsList, touchedPostsMap) {
      if (!db) return false;
      window.__isRevertingAdminSession = true;
      try {
        const baselineMap = new Map();
        if (Array.isArray(restoredPostsList)) {
          restoredPostsList.forEach(p => {
            if (!p) return;
            baselineMap.set(computeSafeCloudPostId(p), p);
          });
        }
        if (touchedPostsMap && typeof touchedPostsMap.entries === 'function') {
          const ops = [];
          for (const [safeId, touchedPost] of touchedPostsMap.entries()) {
            if (baselineMap.has(safeId)) {
              ops.push(persistSingleBlogPostToCloud(baselineMap.get(safeId), { writeBackupDoc: false }));
            } else if (touchedPost) {
              ops.push(archiveSingleBlogPostInCloud(touchedPost));
            }
          }
          if (ops.length > 0) {
            await Promise.allSettled(ops);
          }
        }
        lastSyncedPostSignatures.clear();
        await persistSiteDataInRealtime(true);
        return true;
      } catch (e) {
        console.warn('Error revirtiendo sesión de edición en la nube:', e);
        return false;
      } finally {
        window.__isRevertingAdminSession = false;
      }
    }
    window.revertAdminCloudChangesToBaseline = revertAdminCloudChangesToBaseline;

    let lastKnownSiteContentSig = '';
    let lastLocalPersistedContentSig = '';

    async function persistSiteDataInRealtime(silent = false) {
      if (window.isAdminMode && !window.__isRevertingAdminSession) {
        window.__adminCloudTouchedDuringSession = true;
      }
      if (typeof window.flushAllPendingLocalCaches === 'function') {
        window.flushAllPendingLocalCaches();
      }
      if (!silent && typeof window.showToastNotification === 'function') {
        window.showToastNotification('💾 Sincronizando cambios en tiempo real...');
      }

      let activePosts = deduplicatePosts(Array.isArray(window.postsData) ? window.postsData : window.postsData).slice(0, 500);
      if (activePosts.length === 0 && Array.isArray(window.postsData) && window.postsData.length > 0) {
        activePosts = deduplicatePosts(window.postsData).slice(0, 500);
      }
      window.postsData = activePosts;
      window.postsData = activePosts;

      const activeGamesData = (window.gamesData && typeof window.gamesData === 'object')
        ? (typeof window.normalizeGamesData === 'function' ? window.normalizeGamesData(window.gamesData) : window.gamesData)
        : (typeof window.gamesData !== 'undefined' ? window.gamesData : {});
      window.gamesData = activeGamesData;

      const payload = {
        posts: activePosts,
        galleries: (window.galleriesData && typeof window.galleriesData === 'object') ? window.galleriesData : {},
        galleryOrder: ((typeof window.getOrderedGalleryKeys === 'function') ? window.getOrderedGalleryKeys() : ['fotos', 'julianaqudateotroda']).slice(0, 50),
        live: {
          buttons: Array.isArray(window.liveButtonsData) ? window.liveButtonsData : [],
          isVisible: !!window.isLiveSectionVisible,
          description: typeof window.liveSectionDescription === 'string' ? window.liveSectionDescription : ''
        },
        merch: {
          items: Array.isArray(window.merchItemsData) ? window.merchItemsData : [],
          categories: Array.isArray(window.merchCategories) ? window.merchCategories : [],
          cartConfig: (window.cartConfig && typeof window.cartConfig === 'object') ? window.cartConfig : {},
          isVisible: !!window.isMerchSectionVisible,
          description: typeof window.merchSectionDescription === 'string' ? window.merchSectionDescription : ''
        },
        buzon: {
          isVisible: !!window.isBuzonSectionVisible,
          gamesVisible: window.isGamesSectionVisible !== false,
          hiddenCommentIds: Array.isArray(window.hiddenCommentIds) ? window.hiddenCommentIds : [],
          gamesData: activeGamesData
        },
        muro: {
          isVisible: !!window.isBuzonSectionVisible,
          gamesVisible: window.isGamesSectionVisible !== false,
          hiddenCommentIds: Array.isArray(window.hiddenCommentIds) ? window.hiddenCommentIds : [],
          gamesData: activeGamesData
        },
        updatedAt: serverTimestamp()
      };

      const localSig = computeSiteContentSignature(payload);
      lastLocalPersistedContentSig = localSig;
      lastKnownSiteContentSig = localSig;

      try {
        localStorage.setItem('blutu_games_data', JSON.stringify(activeGamesData));
        localStorage.setItem('blutu_live_site_data', JSON.stringify({
          ...payload,
          updatedAt: Date.now()
        }));
        localStorage.setItem('blutu_permanent_posts_vault', JSON.stringify(activePosts));
        if (typeof BlutuVault !== 'undefined' && BlutuVault.savePosts) {
          BlutuVault.savePosts(activePosts);
        }
      } catch (e) {
        console.warn('Error guardando caché local de datos:', e);
      }

      if (!db) {
        if (!silent && typeof window.showToastNotification === 'function') {
          window.showToastNotification('⚠️ Base de datos no conectada. Cambios guardados localmente.', true);
        }
        return false;
      }

      try {
        await ensureAdminSignedIn(!silent);

        // 1. Guardar documento principal del sitio
        await setDoc(doc(db, 'site_data', 'main'), payload);

        // 2. Sincronizar únicamente las publicaciones nuevas o modificadas (evita tormenta N*2 de escrituras)
        const modifiedPosts = activePosts.filter(p => {
          if (!p || p.isArchived) return false;
          const safeId = computeSafeCloudPostId(p);
          const sig = computePostCloudSignature(p);
          return lastSyncedPostSignatures.get(safeId) !== sig;
        });

        if (modifiedPosts.length > 0) {
          await Promise.allSettled(
            modifiedPosts.map(p => persistSingleBlogPostToCloud(p, { writeBackupDoc: false }))
          );
          try {
            const lastSavedId = computeSafeCloudPostId(modifiedPosts[modifiedPosts.length - 1]);
            await setDoc(doc(db, 'blog_backups', 'latest_posts_backup'), {
              posts: activePosts.slice(0, 500),
              updatedAt: serverTimestamp(),
              lastPostSaved: lastSavedId
            });
          } catch (backupErr) {}
        }

        if (!silent && typeof window.showToastNotification === 'function') {
          window.showToastNotification('✨ ¡Todos los cambios han sido aplicados y guardados permanentemente!');
        }
        return true;
      } catch (err) {
        const isPerm = err && err.message && err.message.includes('permission');
        if (isPerm) {
          logFirestoreErrorInfo(err, 'write', 'site_data/main');
        } else {
          console.error('Error guardando datos en Firestore:', err);
        }
        if (!silent && typeof window.showToastNotification === 'function') {
          const errMsg = isPerm
            ? '⛔ Permiso denegado: inicia sesión con Google como administrador para guardar en la nube.'
            : '⚠️ Guardado localmente. Error al sincronizar con Firestore.';
          window.showToastNotification(errMsg, true);
        }
        return false;
      }
    }
    window.persistSiteDataInRealtime = persistSiteDataInRealtime;

    function initSiteDataRealtimeListener() {
      if (!db) return;
      try {
        if (window.__siteDataRealtimeUnsubscribe) {
          try { window.__siteDataRealtimeUnsubscribe(); } catch (e) {}
          window.__siteDataRealtimeUnsubscribe = null;
        }

        // Sembrar firmas iniciales desde el estado ya hidratado en memoria para evitar re-render redundante
        const initialSnapState = buildCurrentMemorySiteSnapshot();
        lastKnownSiteContentSig = computeSiteContentSignature(initialSnapState);
        seedSyncedPostSignatures(initialSnapState.posts);

        const siteDocRef = doc(db, 'site_data', 'main');
        window.__siteDataRealtimeUnsubscribe = onSnapshot(siteDocRef, (snap) => {
          if (!snap.exists()) return;

          const data = snap.data();
          if (Array.isArray(data.posts)) {
            seedSyncedPostSignatures(data.posts);
          }

          const incomingContentSig = computeSiteContentSignature(data);
          if (incomingContentSig === lastKnownSiteContentSig || incomingContentSig === lastLocalPersistedContentSig) {
            lastKnownSiteContentSig = incomingContentSig;
            return;
          }
          lastKnownSiteContentSig = incomingContentSig;

          if (data.posts && Array.isArray(data.posts) && data.posts.length > 0) {
            const cleanIncoming = deduplicatePosts(data.posts);
            window.postsData = cleanIncoming;
            window.postsData = cleanIncoming;
            try {
              localStorage.setItem('blutu_permanent_posts_vault', JSON.stringify(cleanIncoming));
              if (typeof BlutuVault !== 'undefined' && BlutuVault.savePosts) {
                BlutuVault.savePosts(cleanIncoming);
              }
            } catch (e) {}
          }
          if (data.galleries && typeof data.galleries === 'object') {
            window.galleriesData = data.galleries;
          }
          if (data.galleryOrder && Array.isArray(data.galleryOrder)) {
            window.galleryOrder = data.galleryOrder;
          }
          if (data.live) {
            if (Array.isArray(data.live.buttons)) window.liveButtonsData = data.live.buttons;
            if (typeof data.live.isVisible === 'boolean') window.isLiveSectionVisible = data.live.isVisible;
            if (typeof data.live.description === 'string') window.liveSectionDescription = data.live.description;
          }
          if (data.merch) {
            if (Array.isArray(data.merch.items)) window.merchItemsData = data.merch.items;
            if (Array.isArray(data.merch.categories)) window.merchCategories = data.merch.categories;
            if (data.merch.cartConfig && typeof data.merch.cartConfig === 'object') {
              window.cartConfig = { ...window.cartConfig, ...data.merch.cartConfig };
            }
            if (typeof data.merch.isVisible === 'boolean') window.isMerchSectionVisible = data.merch.isVisible;
            if (typeof data.merch.description === 'string') window.merchSectionDescription = data.merch.description;
          }
          const buzonOrMuro = data.muro || data.buzon;
          if (buzonOrMuro) {
            if (typeof buzonOrMuro.isVisible === 'boolean') window.isBuzonSectionVisible = buzonOrMuro.isVisible;
            if (typeof buzonOrMuro.gamesVisible === 'boolean') {
              window.isGamesSectionVisible = buzonOrMuro.gamesVisible;
              try {
                localStorage.setItem('blutu_games_visible', String(window.isGamesSectionVisible));
              } catch (e) {}
            }
            if (Array.isArray(buzonOrMuro.hiddenCommentIds)) window.hiddenCommentIds = buzonOrMuro.hiddenCommentIds;
            if (buzonOrMuro.gamesData && typeof buzonOrMuro.gamesData === 'object') {
              window.gamesData = (typeof window.normalizeGamesData === 'function')
                ? window.normalizeGamesData(buzonOrMuro.gamesData)
                : buzonOrMuro.gamesData;
              try {
                localStorage.setItem('blutu_games_data', JSON.stringify(window.gamesData));
              } catch (e) {}
            }
          }

          try {
            localStorage.setItem('blutu_live_site_data', JSON.stringify({
              posts: window.postsData,
              galleries: window.galleriesData,
              galleryOrder: window.galleryOrder,
              live: {
                buttons: window.liveButtonsData,
                isVisible: window.isLiveSectionVisible,
                description: window.liveSectionDescription
              },
              merch: {
                items: window.merchItemsData,
                categories: window.merchCategories,
                cartConfig: window.cartConfig,
                isVisible: window.isMerchSectionVisible,
                description: window.merchSectionDescription
              },
              buzon: {
                isVisible: window.isBuzonSectionVisible,
                gamesVisible: window.isGamesSectionVisible,
                hiddenCommentIds: window.hiddenCommentIds,
                gamesData: window.gamesData
              },
              muro: {
                isVisible: window.isBuzonSectionVisible,
                gamesVisible: window.isGamesSectionVisible,
                hiddenCommentIds: window.hiddenCommentIds,
                gamesData: window.gamesData
              },
              updatedAt: Date.now()
            }));
          } catch (e) {}

          const activeEl = document.activeElement;
          const isAnyAdminModalOpen = typeof window.isAdminMode !== 'undefined' && window.isAdminMode && (
            document.getElementById('blogReadModal')?.style.display === 'flex' ||
            document.getElementById('merchDetailModal')?.style.display === 'flex' ||
            document.getElementById('galleryMediaModal')?.style.display === 'flex' ||
            document.getElementById('cartConfigModal')?.style.display === 'flex' ||
            document.getElementById('imageModal')?.classList.contains('show')
          );
          const isTyping = isAnyAdminModalOpen || (activeEl && (activeEl.tagName === 'INPUT' || activeEl.tagName === 'TEXTAREA' || activeEl.tagName === 'SELECT' || activeEl.isContentEditable));
          if (!isTyping && typeof window.applyAllSectionsChangesToDOM === 'function') {
            window.applyAllSectionsChangesToDOM();
          }
        }, (err) => {
          console.warn('Realtime sync listener notice:', err);
        });
      } catch (e) {
        console.error('Error iniciando escucha en tiempo real de datos del sitio:', e);
      }
    }

    setupSymbolPicker();
    setupCharCounter();
    initCommentsRealtimeListener();
    initSiteDataRealtimeListener();
