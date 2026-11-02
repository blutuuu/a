import { initializeApp } from 'firebase/app';
import {
  initializeFirestore,
  collection,
  addDoc,
  deleteDoc,
  updateDoc,
  deleteField,
  onSnapshot,
  query,
  orderBy,
  limit,
  serverTimestamp,
  getDocFromServer,
  doc,
  Timestamp,
} from 'firebase/firestore';
import { getAuth } from 'firebase/auth';
import firebaseConfig from '../firebase-applet-config.json';

// Inicializar Firebase
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = initializeFirestore(app, {
  experimentalForceLongPolling: true,
}, firebaseConfig.firestoreDatabaseId || undefined);

enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null): never {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo: auth.currentUser?.providerData?.map(provider => ({
        providerId: provider.providerId,
        email: provider.email,
      })) || [],
    },
    operationType,
    path,
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

// Validación de conexión según directrices de Firebase
async function testConnection() {
  try {
    await getDocFromServer(doc(db, 'site_data', 'main'));
  } catch (error) {
    if (error instanceof Error && error.message.includes('the client is offline')) {
      console.warn('Verificando conexión con Firebase Firestore...');
    }
  }
}
testConnection();

interface CommentItem {
  id: string;
  name: string;
  content: string;
  symbol?: string;
  createdAt?: Timestamp | null;
  reply?: string;
  replyAuthor?: string;
  replyCreatedAt?: Timestamp | null;
  replyUpdatedAt?: Timestamp | null;
}

let selectedSymbol = '🦇';
let isSubmitting = false;
let lastSubmitTime = 0;
let activeAdminReplyId: string | null = null;
let activeFeedReplyId: string | null = null;

// Configurar selector de símbolos
export function setupSymbolPicker() {
  const container = document.getElementById('commentSymbolPicker');
  if (!container) return;

  const buttons = container.querySelectorAll<HTMLButtonElement>('.comment-symbol-btn');
  buttons.forEach(btn => {
    btn.addEventListener('click', () => {
      buttons.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      selectedSymbol = btn.getAttribute('data-symbol') || '🦇';
    });
  });
}

// Contador de caracteres
export function setupCharCounter() {
  const textarea = document.getElementById('commentTextInput') as HTMLTextAreaElement | null;
  const counter = document.getElementById('commentCharCount');
  if (!textarea || !counter) return;

  textarea.addEventListener('input', () => {
    counter.textContent = String(textarea.value.length);
  });
}

// Formatear fecha amigable
function formatCommentDate(timestamp?: Timestamp | null): string {
  if (!timestamp) return 'Hace un instante';
  try {
    const date = timestamp.toDate();
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
      minute: '2-digit',
    });
  } catch {
    return 'Recientemente';
  }
}

let hiddenCommentIds: string[] = [];
let isBuzonSectionVisible = true;
let latestLoadedComments: CommentItem[] = [];

try {
  const storedHidden = localStorage.getItem('blutu_hidden_comments');
  if (storedHidden) {
    const parsed = JSON.parse(storedHidden);
    if (Array.isArray(parsed)) {
      hiddenCommentIds = parsed;
    }
  }
  const storedBuzonVis = localStorage.getItem('blutu_buzon_visible');
  if (storedBuzonVis !== null) {
    isBuzonSectionVisible = storedBuzonVis === 'true';
  }
} catch (e) {
  console.warn('Error reading buzon storage in ts:', e);
}

// Renderizar lista de comentarios en tiempo real
export function renderComments(comments: CommentItem[]) {
  if (Array.isArray(comments)) {
    latestLoadedComments = comments;
  }
  renderCommentsListFromMemory();
  refreshAdminCommentsList();
}

export function renderCommentsListFromMemory() {
  const feed = document.getElementById('commentsFeed');
  const countBadge = document.getElementById('commentsCountBadge');
  if (!feed) return;

  const isCurrentAdmin = typeof window !== 'undefined' && Boolean((window as unknown as { isAdminMode?: boolean }).isAdminMode);
  const comments = latestLoadedComments;

  const filteredComments = comments.filter(c => {
    if (isCurrentAdmin) return true;
    return !hiddenCommentIds.includes(c.id);
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
    const isHidden = hiddenCommentIds.includes(c.id);
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

    if (isCurrentAdmin) {
      const replyBtn = document.createElement('button');
      replyBtn.type = 'button';
      replyBtn.className = 'comment-admin-reply-btn' + (c.reply ? ' has-reply-btn' : '');
      replyBtn.innerHTML = c.reply ? '✏️ Rta Blutu' : '💬 Responder';
      replyBtn.title = c.reply ? 'Editar respuesta oficial de Blutu' : 'Responder como Blutu a este mensaje';
      replyBtn.onclick = (e) => {
        e.stopPropagation();
        openInlineFeedReply(c.id);
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
          deleteReplyFromAdmin(c.id);
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
        toggleCommentVisibility(c.id);
      };
      dateGroup.appendChild(toggleBtn);

      const delBtn = document.createElement('button');
      delBtn.type = 'button';
      delBtn.className = 'comment-admin-delete-btn';
      delBtn.innerHTML = '🗑️ Eliminar';
      delBtn.title = 'Eliminar permanentemente este comentario';
      delBtn.onclick = (e) => {
        e.stopPropagation();
        deleteCommentFromAdmin(c.id);
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

    // Respuesta oficial de Blutu con logo en el lado izquierdo
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
      cancelBtn.onclick = () => cancelFeedReply(c.id);

      const saveBtn = document.createElement('button');
      saveBtn.type = 'button';
      saveBtn.id = `feedReplySaveBtn_${c.id}`;
      saveBtn.style.cssText = 'background: #2b3a6b; border: 1px solid #5a74bf; color: #fff; padding: 5px 14px; font-size: 0.82rem; font-weight: bold; border-radius: 4px; cursor: pointer;';
      saveBtn.textContent = '💾 Publicar Respuesta';
      saveBtn.onclick = () => saveAdminReply(c.id, textarea.value);

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

export function toggleCommentVisibility(commentId: string) {
  if (!commentId) return;
  const idx = hiddenCommentIds.indexOf(commentId);
  if (idx > -1) {
    hiddenCommentIds.splice(idx, 1);
  } else {
    hiddenCommentIds.push(commentId);
  }
  try {
    localStorage.setItem('blutu_hidden_comments', JSON.stringify(hiddenCommentIds));
  } catch (e) {
    console.warn('Error saving hidden comments:', e);
  }
  renderCommentsListFromMemory();
  refreshAdminCommentsList();
}

export function toggleBuzonVisibility(visible: boolean) {
  isBuzonSectionVisible = Boolean(visible);
  try {
    localStorage.setItem('blutu_buzon_visible', String(isBuzonSectionVisible));
  } catch (e) {}

  const isCurrentAdmin = typeof window !== 'undefined' && Boolean((window as unknown as { isAdminMode?: boolean }).isAdminMode);
  const commentsSection = document.getElementById('commentsSection');
  if (commentsSection) {
    commentsSection.style.display = (isBuzonSectionVisible || isCurrentAdmin) ? 'block' : 'none';
  }
  const inlineBuzonCheck = document.getElementById('inlineBuzonVisibleCheckbox') as HTMLInputElement | null;
  if (inlineBuzonCheck) inlineBuzonCheck.checked = isBuzonSectionVisible;
  const adminBuzonInput = document.getElementById('adminBuzonVisibleInput') as HTMLInputElement | null;
  if (adminBuzonInput) adminBuzonInput.checked = isBuzonSectionVisible;
  const buzonBadge = document.getElementById('buzonSectionHiddenBadge');
  if (buzonBadge) {
    buzonBadge.style.display = (isCurrentAdmin && !isBuzonSectionVisible) ? 'inline-block' : 'none';
  }
}

export function refreshAdminCommentsList() {
  const container = document.getElementById('adminCommentsListContainer');
  if (!container) return;
  container.innerHTML = '';

  if (!latestLoadedComments || latestLoadedComments.length === 0) {
    container.innerHTML = '<p style="color: var(--text-muted); font-size: 0.85rem; font-style: italic; margin: 6px 0;">No se han recibido mensajes en el muro aún.</p>';
    return;
  }

  latestLoadedComments.forEach(c => {
    const isHidden = hiddenCommentIds.includes(c.id);
    const item = document.createElement('div');
    item.style.cssText = 'background: rgba(5,5,8,0.85); border: 1px solid ' + (isHidden ? 'rgba(255,107,107,0.45)' : (c.reply ? 'rgba(140,162,230,0.45)' : 'rgba(90,116,191,0.3)')) + '; border-radius: 8px; padding: 12px 14px; display: flex; flex-direction: column; gap: 8px;';

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

    const replyBtn = document.createElement('button');
    replyBtn.type = 'button';
    replyBtn.className = 'comment-admin-reply-btn' + (c.reply ? ' has-reply-btn' : '');
    replyBtn.innerHTML = c.reply ? '✏️ Editar Respuesta' : '💬 Responder';
    replyBtn.title = c.reply ? 'Editar respuesta oficial de Blutu' : 'Responder como Blutu a este mensaje';
    replyBtn.style.cssText = 'padding: 5px 10px; font-size: 0.82rem; font-weight: bold; cursor: pointer;';
    replyBtn.onclick = () => openAdminReplyForm(c.id);
    actions.appendChild(replyBtn);

    if (c.reply) {
      const delReplyBtn = document.createElement('button');
      delReplyBtn.type = 'button';
      delReplyBtn.className = 'comment-admin-delete-btn';
      delReplyBtn.innerHTML = '↩️ Quitar Rta';
      delReplyBtn.title = 'Eliminar la respuesta de Blutu a este comentario';
      delReplyBtn.style.cssText = 'padding: 5px 10px; font-size: 0.82rem; font-weight: bold; cursor: pointer;';
      delReplyBtn.onclick = () => deleteReplyFromAdmin(c.id);
      actions.appendChild(delReplyBtn);
    }

    const toggleBtn = document.createElement('button');
    toggleBtn.type = 'button';
    toggleBtn.className = 'comment-admin-toggle-btn' + (isHidden ? ' is-hidden-btn' : '');
    toggleBtn.innerHTML = isHidden ? '👁️ Mostrar' : '🚫 Ocultar';
    toggleBtn.title = isHidden ? 'Mostrar este comentario al público' : 'Ocultar este comentario al público';
    toggleBtn.style.cssText = 'padding: 5px 10px; font-size: 0.82rem; font-weight: bold; cursor: pointer;';
    toggleBtn.onclick = () => toggleCommentVisibility(c.id);
    actions.appendChild(toggleBtn);

    const delBtn = document.createElement('button');
    delBtn.type = 'button';
    delBtn.className = 'comment-admin-delete-btn';
    delBtn.innerHTML = '🗑️ Eliminar';
    delBtn.title = 'Eliminar permanentemente este comentario de la base de datos';
    delBtn.style.cssText = 'padding: 5px 10px; font-size: 0.82rem; font-weight: bold; cursor: pointer;';
    delBtn.onclick = () => deleteCommentFromAdmin(c.id);
    actions.appendChild(delBtn);

    topRow.appendChild(infoHead);
    topRow.appendChild(actions);
    item.appendChild(topRow);

    const excerpt = document.createElement('p');
    excerpt.style.cssText = 'margin: 2px 0 0 0; color: #cdd4e5; font-size: 0.95rem; font-family: Cormorant Garamond, serif; line-height: 1.4; word-break: break-word;';
    excerpt.textContent = c.content;
    item.appendChild(excerpt);

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
      cancelBtn.onclick = () => cancelAdminReply(c.id);

      const saveBtn = document.createElement('button');
      saveBtn.type = 'button';
      saveBtn.id = `adminReplySaveBtn_${c.id}`;
      saveBtn.style.cssText = 'background: #2b3a6b; border: 1px solid #5a74bf; color: #fff; padding: 5px 14px; font-size: 0.82rem; font-weight: bold; border-radius: 4px; cursor: pointer; display: flex; align-items: center; gap: 4px;';
      saveBtn.textContent = '💾 Publicar Respuesta';
      saveBtn.onclick = () => saveAdminReply(c.id, textarea.value);

      replyActions.appendChild(cancelBtn);
      replyActions.appendChild(saveBtn);
      replyBoxFoot.appendChild(charCounter);
      replyBoxFoot.appendChild(replyActions);

      replyBox.appendChild(replyBoxHead);
      replyBox.appendChild(textarea);
      replyBox.appendChild(replyBoxFoot);

      item.appendChild(replyBox);
    } else if (c.reply) {
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

export function openAdminReplyForm(commentId: string) {
  activeAdminReplyId = (activeAdminReplyId === commentId) ? null : commentId;
  refreshAdminCommentsList();
  if (activeAdminReplyId) {
    setTimeout(() => {
      const textarea = document.getElementById(`adminReplyText_${commentId}`) as HTMLTextAreaElement | null;
      if (textarea) {
        textarea.focus();
        textarea.setSelectionRange(textarea.value.length, textarea.value.length);
      }
    }, 50);
  }
}

export function cancelAdminReply(commentId: string) {
  if (activeAdminReplyId === commentId) {
    activeAdminReplyId = null;
    refreshAdminCommentsList();
  }
}

export function openInlineFeedReply(commentId: string) {
  activeFeedReplyId = (activeFeedReplyId === commentId) ? null : commentId;
  renderCommentsListFromMemory();
  if (activeFeedReplyId) {
    setTimeout(() => {
      const textarea = document.getElementById(`feedReplyText_${commentId}`) as HTMLTextAreaElement | null;
      if (textarea) {
        textarea.focus();
        textarea.setSelectionRange(textarea.value.length, textarea.value.length);
      }
    }, 50);
  }
}

export function cancelFeedReply(commentId: string) {
  if (activeFeedReplyId === commentId) {
    activeFeedReplyId = null;
    renderCommentsListFromMemory();
  }
}

export async function saveAdminReply(commentId: string, customText?: string) {
  if (!commentId) return;
  const textarea = (document.getElementById(`adminReplyText_${commentId}`) || document.getElementById(`feedReplyText_${commentId}`)) as HTMLTextAreaElement | null;
  const replyContent = (typeof customText === 'string' ? customText : (textarea ? textarea.value : '')).trim();

  const winNotify = window as unknown as { showToastNotification?: (msg: string, isErr?: boolean) => void };

  if (!replyContent) {
    if (typeof winNotify.showToastNotification === 'function') {
      winNotify.showToastNotification('Por favor escribe una respuesta antes de publicar.', true);
    }
    if (textarea) textarea.focus();
    return;
  }

  if (replyContent.length > 1000) {
    if (typeof winNotify.showToastNotification === 'function') {
      winNotify.showToastNotification('La respuesta no debe superar los 1000 caracteres.', true);
    }
    return;
  }

  const saveBtn = (document.getElementById(`adminReplySaveBtn_${commentId}`) || document.getElementById(`feedReplySaveBtn_${commentId}`)) as HTMLButtonElement | null;
  if (saveBtn) {
    saveBtn.disabled = true;
    saveBtn.textContent = 'Publicando...';
  }

  try {
    const commentRef = doc(db, 'comments', commentId);
    const existing = latestLoadedComments.find(c => c.id === commentId);
    const now = serverTimestamp();
    const replyCreatedAt = (existing && existing.replyCreatedAt) ? existing.replyCreatedAt : now;

    await updateDoc(commentRef, {
      reply: replyContent,
      replyAuthor: 'Blutu',
      replyCreatedAt,
      replyUpdatedAt: now,
    });

    if (existing) {
      existing.reply = replyContent;
      existing.replyAuthor = 'Blutu';
      if (!existing.replyCreatedAt) existing.replyCreatedAt = Timestamp.now();
      existing.replyUpdatedAt = Timestamp.now();
    }

    activeAdminReplyId = null;
    activeFeedReplyId = null;

    renderCommentsListFromMemory();
    refreshAdminCommentsList();

    if (typeof winNotify.showToastNotification === 'function') {
      winNotify.showToastNotification('💬 Respuesta de Blutu publicada con éxito.');
    }
  } catch (err) {
    if (err instanceof Error && err.message.includes('Missing or insufficient permissions')) {
      try {
        handleFirestoreError(err, OperationType.UPDATE, `comments/${commentId}`);
      } catch {
        // Logged structured FirestoreErrorInfo
      }
    } else {
      console.error('Error al guardar respuesta de Blutu:', err);
    }
    if (typeof winNotify.showToastNotification === 'function') {
      winNotify.showToastNotification('Error al publicar la respuesta en Firestore.', true);
    }
  } finally {
    if (saveBtn) {
      saveBtn.disabled = false;
      saveBtn.textContent = '💾 Publicar Respuesta';
    }
  }
}

export async function deleteReplyFromAdmin(commentId: string) {
  if (!commentId) return;
  const confirmed = window.confirm('¿Estás seguro de que deseas eliminar la respuesta de Blutu a este comentario?');
  if (!confirmed) return;

  const winNotify = window as unknown as { showToastNotification?: (msg: string, isErr?: boolean) => void };

  try {
    const commentRef = doc(db, 'comments', commentId);
    await updateDoc(commentRef, {
      reply: deleteField(),
      replyAuthor: deleteField(),
      replyCreatedAt: deleteField(),
      replyUpdatedAt: deleteField(),
    });

    const existing = latestLoadedComments.find(c => c.id === commentId);
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

    if (typeof winNotify.showToastNotification === 'function') {
      winNotify.showToastNotification('🗑️ Respuesta de Blutu eliminada.');
    }
  } catch (err) {
    console.error('Error al eliminar respuesta de Blutu:', err);
    if (typeof winNotify.showToastNotification === 'function') {
      winNotify.showToastNotification('Error al eliminar la respuesta en Firestore.', true);
    }
  }
}

// Eliminar comentario permanentemente de Firestore
export async function deleteCommentFromAdmin(commentId: string) {
  if (!commentId) return;
  const confirmed = window.confirm('¿Estás seguro de que deseas eliminar permanentemente este comentario del muro? Esta acción no se puede deshacer.');
  if (!confirmed) return;

  try {
    await deleteDoc(doc(db, 'comments', commentId));

    if (hiddenCommentIds.includes(commentId)) {
      hiddenCommentIds = hiddenCommentIds.filter(id => id !== commentId);
      try {
        localStorage.setItem('blutu_hidden_comments', JSON.stringify(hiddenCommentIds));
      } catch (e) {
        console.warn('Error updating hidden comments cache:', e);
      }
    }

    latestLoadedComments = latestLoadedComments.filter(c => c.id !== commentId);
    renderCommentsListFromMemory();
    refreshAdminCommentsList();

    const winNotify = window as unknown as { showToastNotification?: (msg: string, isErr?: boolean) => void };
    if (typeof winNotify.showToastNotification === 'function') {
      winNotify.showToastNotification('🗑️ Comentario eliminado de forma permanente.');
    }
  } catch (err) {
    console.error('Error al eliminar comentario:', err);
    const winNotify = window as unknown as { showToastNotification?: (msg: string, isErr?: boolean) => void };
    if (typeof winNotify.showToastNotification === 'function') {
      winNotify.showToastNotification('Error al eliminar el comentario en Firestore.', true);
    }
  }
}

const win = window as unknown as Record<string, unknown>;
win.toggleCommentVisibility = toggleCommentVisibility;
win.toggleBuzonVisibility = toggleBuzonVisibility;
win.refreshAdminCommentsList = refreshAdminCommentsList;
win.renderCommentsListFromMemory = renderCommentsListFromMemory;
win.deleteCommentFromAdmin = deleteCommentFromAdmin;
win.openAdminReplyForm = openAdminReplyForm;
win.cancelAdminReply = cancelAdminReply;
win.openInlineFeedReply = openInlineFeedReply;
win.cancelFeedReply = cancelFeedReply;
win.saveAdminReply = saveAdminReply;
win.deleteReplyFromAdmin = deleteReplyFromAdmin;

// Escuchar cambios en tiempo real desde Firestore
export function initCommentsRealtimeListener() {
  const commentsCol = collection(db, 'comments');
  const commentsQuery = query(commentsCol, orderBy('createdAt', 'desc'), limit(100));

  onSnapshot(
    commentsQuery,
    snapshot => {
      const comments: CommentItem[] = [];
      snapshot.forEach(docSnap => {
        const data = docSnap.data();
        const isTest = data.name && (data.name === 'Test' || data.name === 'TimingTest' || data.name === 'LongPollingTest');
        if (isTest) return;
        comments.push({
          id: docSnap.id,
          name: data.name || 'Anónimo',
          content: data.content || '',
          symbol: data.symbol || '🦇',
          createdAt: data.createdAt instanceof Timestamp ? data.createdAt : null,
          reply: data.reply || undefined,
          replyAuthor: data.replyAuthor || 'Blutu',
          replyCreatedAt: data.replyCreatedAt instanceof Timestamp ? data.replyCreatedAt : null,
          replyUpdatedAt: data.replyUpdatedAt instanceof Timestamp ? data.replyUpdatedAt : null,
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
            <p class="empty-state-text">No se pudieron cargar los comentarios en este momento. Intenta de nuevo más tarde.</p>
          </div>
        `;
      }
    }
  );
}

// Enviar nuevo comentario
export async function submitVisitorComment() {
  if (isSubmitting) return;

  const now = Date.now();
  if (now - lastSubmitTime < 3500) {
    showFeedback('Espera unos segundos antes de publicar otro comentario.', true);
    return;
  }

  const nameInput = document.getElementById('commentAuthorInput') as HTMLInputElement | null;
  const textInput = document.getElementById('commentTextInput') as HTMLTextAreaElement | null;
  const submitBtn = document.getElementById('submitCommentBtn') as HTMLButtonElement | null;
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

  isSubmitting = true;
  lastSubmitTime = now;
  if (submitBtn) submitBtn.disabled = true;
  if (btnText) btnText.textContent = 'Publicando...';
  showFeedback('', false);

  try {
    const commentsCol = collection(db, 'comments');
    await addDoc(commentsCol, {
      name: name.slice(0, 50),
      content: content.slice(0, 1000),
      symbol: (selectedSymbol || '🦇').slice(0, 10),
      createdAt: serverTimestamp(),
    });

    // Éxito: limpiar campo de contenido manteniendo el nombre del usuario
    textInput.value = '';
    const charCounter = document.getElementById('commentCharCount');
    if (charCounter) charCounter.textContent = '0';

    showFeedback('Mensaje publicado con éxito.', false);
    setTimeout(() => showFeedback('', false), 3500);
  } catch (err) {
    if (err instanceof Error && err.message.includes('Missing or insufficient permissions')) {
      try {
        handleFirestoreError(err, OperationType.CREATE, 'comments');
      } catch {
        // Logged structured FirestoreErrorInfo
      }
    } else {
      console.error('Error al guardar comentario en Firestore:', err);
    }
    showFeedback('Error al publicar comentario. Inténtalo de nuevo.', true);
  } finally {
    isSubmitting = false;
    if (submitBtn) submitBtn.disabled = false;
    if (btnText) btnText.textContent = 'Publicar';
  }
}

function showFeedback(msg: string, isError: boolean) {
  const el = document.getElementById('commentFormFeedback');
  if (!el) return;
  el.textContent = msg;
  el.style.color = isError ? '#ff6b6b' : '#8ca2e6';
}

// Exponer a window para interactuar desde el HTML
(window as unknown as Record<string, unknown>).submitVisitorComment = submitVisitorComment;

// Inicializar listeners al cargar el script
document.addEventListener('DOMContentLoaded', () => {
  setupSymbolPicker();
  setupCharCounter();
  initCommentsRealtimeListener();
});
if (document.readyState === 'interactive' || document.readyState === 'complete') {
  setupSymbolPicker();
  setupCharCounter();
  initCommentsRealtimeListener();
}
