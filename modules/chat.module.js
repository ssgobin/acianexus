/* ================================================================
   NEXUS — Chat Module
   Chat interno por salas com tempo real (Firestore onSnapshot).
   ================================================================ */

import { requireAuth } from '/services/auth.service.js';
import { db } from '/services/firebase-config.js';
import {
    collection, doc, query, where, orderBy, limit, onSnapshot,
    getDocs, addDoc, updateDoc, writeBatch,
    serverTimestamp, deleteDoc
} from 'firebase/firestore';
import { renderSidebar } from '/components/sidebar.js';
import { renderHeader } from '/components/header.js';
import { createModal, openModal, closeModal, confirmDialog } from '/components/modal.js';
import { toast } from '/components/toast.js';
import { sanitizeText } from '/utils/sanitizer.js';
import { formatRelative } from '/utils/date-utils.js';
import {
    escapeHtml, getInitials, stringToColor,
    getStoredTheme, setTheme
} from '/utils/helpers.js';

let _profile = null;
let _rooms = [];
let _activeRoomId = null;
let _unsubMessages = null;
let _unsubRooms = null;
let _mobileRoomsOpen = true;
let _emojiPickerOpen = false;

const EMOJI_CATEGORIES = {
    'Sorrisos': ['😀', '😃', '😄', '😁', '😆', '😅', '🤣', '😂', '🙂', '😉', '😊', '😇', '🥰', '😍', '🤩', '😘', '😗', '😚', '😙', '🥲', '😋', '😛', '😜', '🤪', '😝', '🤑', '🤗', '🤭', '🤫', '🤔', '🤐', '🤨', '😐', '😑', '😶', '😏', '😒', '🙄', '😬', '🤥', '😌', '😔', '😪', '🤤', '😴', '😷', '🤒', '🤕', '🤢', '🤮', '🤧', '🥵', '🥶', '🥴', '😵', '🤯', '🤠', '🥳', '🥸', '😎', '🤓', '🧐', '😕', '😟', '🙁', '😮', '😯', '😲', '😳', '🥺', '😦', '😧', '😨', '😰', '😥', '😢', '😭', '😱', '😖', '😣', '😞', '😓', '😩', '😫', '🥱', '😤', '😡', '😠', '🤬', '😈', '👿', '💀', '☠️', '💩', '🤡', '👹', '👺', '👻', '👽', '👾', '🤖'],
    'Gestos': ['👋', '🤚', '🖐️', '✋', '🖖', '👌', '🤌', '🤏', '✌️', '🤞', '🤟', '🤘', '🤙', '👈', '👉', '👆', '🖕', '👇', '☝️', '👍', '👎', '✊', '👊', '🤛', '🤜', '👏', '🙌', '👐', '🤲', '🤝', '🙏', '✍️', '💪', '🦾', '🦿', '🦵', '🦶', '👂', '🦻', '👃', '🧠', '🫀', '🫁', '🦷', '🦴', '👀', '👁️', '👅', '👄'],
    'Coração': ['❤️', '🧡', '💛', '💚', '💙', '💜', '🖤', '🤍', '🤎', '💔', '❣️', '💕', '💞', '💓', '💗', '💖', '💘', '💝', '💟', '♥️', '😘', '😍', '🥰', '😻', '💋'],
    'Objetos': ['⌚', '📱', '💻', '⌨️', '🖥️', '🖨️', '🖱️', '💽', '💾', '💿', '📀', '📷', '📸', '📹', '🎥', '📞', '☎️', '📟', '📠', '📺', '📻', '🎙️', '🧭', '⏱️', '⏲️', '⏰', '🕰️', '💵', '💴', '💶', '💷', '💰', '💳', '💎', '⚖️', '🔧', '🔨', '⚒️', '🛠️', '🔩', '⚙️', '🔫', '💣', '🪓', '🔪', '🗡️', '⚔️', '🛡️', '🚬', '⚰️', '🏺', '🔮', '📿', '🧿', '💈', '⚗️', '🔭', '🔬', '💊', '💉', '🩸', '🩹', '🩺'],
    'Símbolos': ['☮️', '✝️', '☪️', '🕉️', '☸️', '✡️', '☯️', '☦️', '🛐', '⛎', '♈', '♉', '♊', '♋', '♌', '♍', '♎', '♏', '♐', '♑', '♒', '♓', '🆔', '⚛️', '☢️', '☣️', '🈶', '🈚', '🈸', '🈺', '🈷️', '✴️', '🆚', '💮', '🉐', '㊙️', '㊗️', '🅰️', '🅱️', '🆎', '🆑', '🅾️', '🆘', '❌', '⭕', '🛑', '⛔', '📛', '🚫', '💯', '💢', '♨️', '🚷', '🚯', '🚳', '🚱', '🔞', '📵', '🚭', '❗', '❕', '❓', '❔', '‼️', '⁉️', '🔅', '🔆', '⚠️', '🚸', '🔱', '⚜️', '🔰', '♻️', '✅', '💹', '❇️', '✳️', '❎', '🌐', '💠', 'Ⓜ️', '🌀', '💤', '🏧', '🚾', '♿', '🅿️', '🛗', '🈳', '🈂️', '🛂', '🛃', '🛄', '🛅', '🚹', '🚺', '🚼', '⚧️', '🚻', '🚮', '🎦', '📶', 'ℹ️', '🔣', '🔤', '🔡', '🔠', '🆖', '🆗', '🆙', '🆒', '🆕', '🆓', '0️⃣', '1️⃣', '2️⃣', '3️⃣', '4️⃣', '5️⃣', '6️⃣', '7️⃣', '8️⃣', '9️⃣', '🔟', '🔢', '#️⃣', '*️⃣', '⏏️', '▶️', '⏸️', '⏯️', '⏹️', '⏺️', '⏭️', '⏮️', '⏩', '⏪', '⏫', '⏬', '◀️', '🔼', '🔽', '➡️', '⬅️', '⬆️', '⬇️', '↗️', '↘️', '↙️', '↖️', '↕️', '↔️', '↪️', '↩️', '⤴️', '⤵️', '🔀', '🔁', '🔂', '🔄', '🔃', '🎵', '🎶', '➕', '➖', '➗', '✖️', '🟰', '♾️', '💲', '💱', '™️', '©️', '®️', '🔚', '🔙', '🔛', '🔝', '🔜', '〰️', '➰', '➿', '✔️', '☑️', '🔘', '🔴', '🟠', '🟡', '🟢', '🔵', '🟣', '⚫', '⚪', '🟤', '🔺', '🔻', '🔸', '🔹', '🔶', '🔷', '🔳', '🔲', '▪️', '▫️', '◾', '◽', '◼️', '◻️', '🟥', '🟧', '🟨', '🟩', '🟦', '🟪', '⬛', '⬜', '🟫', '🔈', '🔇', '🔉', '🔊', '🔔', '🔕', '📣', '📢', '💬', '💭', '🗯️', '♠️', '♣️', '♥️', '♦️', '🃏', '🎴', '🀄', '🕐', '🕑', '🕒', '🕓', '🕔', '🕕', '🕖', '🕗', '🕘', '🕙', '🕚', '🕛'],
    'Bandeira': ['🏳️', '🏴', '🏁', '🚩', '🎌', '🏳️‍🌈']
};

// ================================================================
// INIT
// ================================================================
async function init() {
    setTheme(getStoredTheme());

    _profile = await requireAuth('viewer');
    if (!_profile) return;

    renderSidebar('chat', _profile);
    renderHeader(_profile, 'Chat', 'Comunicação interna em tempo real');

    document.getElementById('page-content').innerHTML = buildLayout();
    document.getElementById('page-content').style.padding = '0';
    document.getElementById('page-content').style.overflow = 'hidden';
    document.getElementById('page-content').style.display = 'flex';
    document.getElementById('page-content').style.height = '100%';

    setupRooms();
    setupInput();
    window.addEventListener('resize', applyMobileLayout);

    document.getElementById('app-loading').style.display = 'none';
    document.getElementById('app').style.display = 'flex';
    applyMobileLayout();
    window.renderIcons?.();
}

// ================================================================
// LAYOUT
// ================================================================
function buildLayout() {
    return `
    <div class="chat-layout">

      <!-- Sidebar de salas -->
      <div class="chat-rooms-panel">
        <div class="chat-rooms-header">
          <h3>Salas</h3>
          <button class="btn btn-ghost btn-xs" title="Nova sala" onclick="window._openCreateRoom()">
            <i data-fa-icon="plus" style="width:16px;height:16px"></i>
          </button>
        </div>
        <div class="chat-rooms-list" id="rooms-list">
          <div class="page-loader"><div class="spinner spinner-sm"></div></div>
        </div>
      </div>

      <!-- Área de mensagens -->
      <div class="chat-main">
        <div id="chat-welcome" style="flex:1;display:flex;align-items:center;justify-content:center;flex-direction:column;gap:12px;color:var(--text-muted)">
          <i data-fa-icon="message-square" style="width:48px;height:48px;opacity:0.3"></i>
          <p style="font-size:14px">Selecione uma sala para iniciar o chat</p>
        </div>
        <div id="chat-active" style="display:none;flex-direction:column;flex:1;height:100%">
          <div class="chat-messages-header" id="chat-room-header"></div>
          <div class="chat-messages-container" id="chat-messages" style="flex:1;overflow-y:auto;padding:16px">
            <!-- mensagens -->
          </div>
          <div class="chat-input-area" id="chat-input-wrapper">
            <div class="chat-input-box">
              <span class="emoji-trigger" onclick="window._toggleEmojiPicker()">😀</span>
              <textarea id="chat-input" class="chat-textarea" rows="1" placeholder="Digite uma mensagem... (Enter para enviar)"
                        maxlength="2000" onkeydown="window._onChatKeydown(event)"></textarea>
              <button class="btn btn-primary chat-send-btn" id="btn-send" onclick="window._sendMessage()">
                <i data-fa-icon="send" style="width:18px;height:18px"></i>
              </button>
            </div>
            <div class="emoji-picker-dropdown" id="emoji-picker">
              <div class="emoji-picker-header">
                <input type="text" id="emoji-search" class="emoji-search" placeholder="Buscar emoji..." oninput="window._filterEmojis()">
              </div>
              <div class="emoji-picker-grid" id="emoji-grid"></div>
            </div>
            <div style="font-size:11px;color:var(--text-muted);padding:4px 8px">
              Enter para enviar · Shift+Enter para quebra de linha · Máx. 2000 caracteres
            </div>
          </div>
        </div>
      </div>
    </div>`;
}

function isMobileViewport() {
    return window.matchMedia('(max-width: 768px)').matches;
}

function applyMobileLayout() {
    const roomsPanel = document.querySelector('.chat-rooms-panel');
    const chatMain = document.querySelector('.chat-main');
    if (!roomsPanel || !chatMain) return;

    if (!isMobileViewport()) {
        roomsPanel.classList.remove('mobile-show');
        chatMain.classList.remove('mobile-hide');
        return;
    }

    if (_mobileRoomsOpen || !_activeRoomId) {
        roomsPanel.classList.add('mobile-show');
        chatMain.classList.add('mobile-hide');
    } else {
        roomsPanel.classList.remove('mobile-show');
        chatMain.classList.remove('mobile-hide');
    }
}

window._toggleRoomsPanel = function (open = null) {
    _mobileRoomsOpen = open === null ? !_mobileRoomsOpen : !!open;
    applyMobileLayout();
};

// ================================================================
// SALAS
// ================================================================
function setupRooms() {
    if (_unsubRooms) _unsubRooms();
    _unsubRooms = onSnapshot(
        query(collection(db, 'chatRooms'), orderBy('lastMessageAt', 'desc')),
        async snap => {
            _rooms = snap.docs.map(d => ({ id: d.id, ...d.data() }));
            if (_rooms.length === 0) {
                await ensureDefaultRoom();
                return;
            }
            renderRoomsList();
            // Auto-select first room on first load
            if (!_activeRoomId && _rooms.length > 0) {
                selectRoom(_rooms[0].id);
            }
        },
        err => console.error('[Chat] Rooms error:', err)
    );
}

async function ensureDefaultRoom() {
    try {
        const snap = await getDocs(query(collection(db, 'chatRooms'), where('name', '==', 'Geral')));
        if (snap.empty) {
            await addDoc(collection(db, 'chatRooms'), {
                name: 'Geral',
                type: 'global',
                members: [],
                createdBy: _profile.uid,
                createdAt: serverTimestamp(),
                lastMessage: '',
                lastMessageAt: serverTimestamp(),
            });
        }
    } catch (e) { console.error('[Chat] Create default room error:', e); }
}

function renderRoomsList() {
    const container = document.getElementById('rooms-list');
    if (!container) return;

    container.innerHTML = _rooms.map(r => `
    <div class="chat-room-item${r.id === _activeRoomId ? ' active' : ''}"
         data-id="${r.id}" onclick="selectRoom('${r.id}')">
      <div class="chat-room-avatar">
        ${r.type === 'global' ? '<i data-fa-icon="hash" style="width:16px;height:16px"></i>' :
            '<i data-fa-icon="users" style="width:16px;height:16px"></i>'}
      </div>
      <div class="chat-room-info">
        <div class="chat-room-name">${escapeHtml(r.name)}</div>
        <div class="chat-room-preview">${escapeHtml(r.lastMessage || 'Sem mensagens')}</div>
      </div>
    </div>`).join('');
    window.renderIcons?.();
}

window.selectRoom = function (roomId) {
    _activeRoomId = roomId;
    _mobileRoomsOpen = false;
    renderRoomsList();
    loadMessages(roomId);

    const room = _rooms.find(r => r.id === roomId);
    const header = document.getElementById('chat-room-header');
    if (header && room) {
        header.innerHTML = `
      <div style="display:flex;align-items:center;gap:10px">
        <button class="btn btn-ghost btn-xs" style="display:${isMobileViewport() ? 'inline-flex' : 'none'}"
                onclick="window._toggleRoomsPanel(true)" aria-label="Voltar para salas">
          <i data-fa-icon="chevron-left" style="width:16px;height:16px"></i>
        </button>
        <div class="chat-room-avatar-lg">
          ${room.type === 'global'
                ? '<i data-fa-icon="hash" style="width:18px;height:18px"></i>'
                : '<i data-fa-icon="users" style="width:18px;height:18px"></i>'}
        </div>
        <div>
          <div style="font-weight:700;font-size:14px">${escapeHtml(room.name)}</div>
          <div style="font-size:12px;color:var(--text-muted)">${room.type === 'global' ? 'Sala global' : 'Grupo'}</div>
        </div>
      </div>`;
        window.renderIcons?.();
    }

    document.getElementById('chat-welcome').style.display = 'none';
    document.getElementById('chat-active').style.display = 'flex';
    applyMobileLayout();
};

// ================================================================
// MENSAGENS (REALTIME)
// ================================================================
function loadMessages(roomId) {
    if (_unsubMessages) _unsubMessages();

    const container = document.getElementById('chat-messages');
    if (container) container.innerHTML = `<div class="page-loader"><div class="spinner"></div></div>`;

    _unsubMessages = onSnapshot(
        query(
            collection(db, 'chatMessages'),
            where('roomId', '==', roomId),
            where('deleted', '==', false),
            orderBy('createdAt', 'asc'),
            limit(100)
        ),
        snap => {
            const messages = snap.docs.map(d => ({ id: d.id, ...d.data() }));
            renderMessages(messages);
        },
        err => { console.error('[Chat] Messages error:', err); }
    );
}

function renderMessages(messages) {
    const container = document.getElementById('chat-messages');
    if (!container) return;

    if (messages.length === 0) {
        container.innerHTML = `
      <div style="text-align:center;color:var(--text-muted);font-size:13px;padding:32px">
        <i data-fa-icon="message-square" style="width:32px;height:32px;opacity:0.3;display:block;margin:0 auto 12px"></i>
        Nenhuma mensagem ainda. Seja o primeiro a falar!
      </div>`;
        window.renderIcons?.();
        return;
    }

    const isAdmin = _profile?.role === 'admin';
    let lastDate = null;
    container.innerHTML = messages.map((msg, i) => {
        const isOwn = msg.authorId === _profile.uid;
        const canEdit = isOwn;
        const canDelete = isOwn || isAdmin;
        
        const msgDate = msg.createdAt?.toDate?.() || new Date();
        const dateStr = msgDate.toLocaleDateString('pt-BR');
        const showDateDivider = dateStr !== lastDate;
        lastDate = dateStr;

        const prevMsg = i > 0 ? messages[i - 1] : null;
        const groupWithPrev = prevMsg && prevMsg.authorId === msg.authorId && !showDateDivider;

        return `
      ${showDateDivider ? `
        <div style="text-align:center;margin:16px 0;font-size:12px;color:var(--text-muted);
                    display:flex;align-items:center;gap:12px">
          <div style="flex:1;height:1px;background:var(--border-color)"></div>
          ${dateStr === new Date().toLocaleDateString('pt-BR') ? 'Hoje' : dateStr}
          <div style="flex:1;height:1px;background:var(--border-color)"></div>
        </div>` : ''}

      <div class="chat-message${isOwn ? ' own' : ''}${groupWithPrev ? ' grouped' : ''}" data-id="${msg.id}">
        ${!isOwn && !groupWithPrev ? `
          <div class="chat-msg-avatar" style="background:${stringToColor(msg.authorName || '')}">${getInitials(msg.authorName || '?')}</div>` :
                `<div style="width:32px;flex-shrink:0"></div>`}
        <div class="chat-msg-bubble">
          ${!isOwn && !groupWithPrev ? `<div class="chat-msg-author">${escapeHtml(msg.authorName || '')}</div>` : ''}
          <div class="chat-msg-text" id="msg-text-${msg.id}">${escapeHtml(msg.content || '').replace(/\n/g, '<br>')}</div>
          <div class="chat-msg-time">${formatRelative(msg.createdAt)}</div>
          ${(canEdit || canDelete) ? `
          <div class="chat-msg-actions">
            ${canEdit ? `<button class="btn btn-ghost btn-xs" onclick="window._editMessage('${msg.id}')" title="Editar"><i data-fa-icon="edit-2" style="width:12px;height:12px"></i></button>` : ''}
            ${canDelete ? `<button class="btn btn-ghost btn-xs" onclick="window._deleteMessage('${msg.id}')" title="Excluir"><i data-fa-icon="trash-2" style="width:12px;height:12px;color:var(--color-danger)"></i></button>` : ''}
          </div>` : ''}
        </div>
      </div>`;
    }).join('');

    window.renderIcons?.();
    container.scrollTop = container.scrollHeight;
}

// ================================================================
// ENVIAR MENSAGEM
// ================================================================
function setupInput() {
    // Auto-resize textarea
    document.addEventListener('input', e => {
        if (e.target.id === 'chat-input') {
            e.target.style.height = 'auto';
            e.target.style.height = Math.min(e.target.scrollHeight, 120) + 'px';
        }
    });
}

window._onChatKeydown = function (event) {
    if (event.key === 'Enter' && !event.shiftKey) {
        event.preventDefault();
        window._sendMessage();
    }
};

window._sendMessage = async function () {
    if (!_activeRoomId) return;

    const input = document.getElementById('chat-input');
    const content = sanitizeText(input?.value?.trim() || '');

    if (!content) return;
    if (content.length > 2000) {
        toast.warning('Muito longo', 'Mensagem tem limite de 2000 caracteres.'); return;
    }

    const btn = document.getElementById('btn-send');
    if (btn) btn.disabled = true;
    if (input) { input.value = ''; input.style.height = 'auto'; }

    try {
        const batch = writeBatch(db);
        const msgRef = doc(collection(db, 'chatMessages'));
        batch.set(msgRef, {
            roomId: _activeRoomId,
            authorId: _profile.uid,
            authorName: _profile.name,
            content,
            createdAt: serverTimestamp(),
            readBy: [_profile.uid],
            deleted: false,
        });
        batch.update(doc(db, 'chatRooms', _activeRoomId), {
            lastMessage: content.length > 80 ? content.slice(0, 80) + '…' : content,
            lastMessageAt: serverTimestamp(),
        });
        await batch.commit();
    } catch (e) {
        console.error('[Chat] Send error:', e);
        toast.error('Erro', 'Mensagem não enviada.');
        if (input) input.value = content; // Restore
    } finally {
        if (btn) btn.disabled = false;
        input?.focus();
    }
};

// ================================================================
// CRIAR SALA
// ================================================================
let _roomMembers = [];

window._openCreateRoom = function () {
    _roomMembers = [];
    createModal({
        id: 'modal-new-room',
        title: 'Nova Sala',
        size: 'md',
        body: `
      <form class="form-grid" novalidate>
        <div class="form-group form-col-full">
          <label class="form-label">Nome da Sala *</label>
          <input type="text" id="room-name" class="form-input" maxlength="100" placeholder="Ex: Projeto X, Equipe Comercial..." required>
        </div>
        <div class="form-group form-col-full">
          <label class="form-label">Descrição (opcional)</label>
          <input type="text" id="room-desc" class="form-input" maxlength="200" placeholder="Sobre o que é esta sala?">
        </div>
        <div class="form-group">
          <label class="form-label">Tipo</label>
          <select id="room-type" class="form-select" onchange="window._onRoomTypeChange()">
            <option value="global">Global (todos os membros)</option>
            <option value="group" selected>Grupo</option>
            <option value="private">Privada</option>
          </select>
        </div>
        <div class="form-group">
          <label class="form-label">
            <input type="checkbox" id="room-create-chat" class="form-checkbox">
            Criar chat automaticamente
          </label>
        </div>
        <div class="form-group form-col-full" id="members-section">
          <label class="form-label">Membros</label>
          <div id="room-members-container" class="involved-container" onclick="window._openMembersPicker()">
            <span class="involved-placeholder">Clique para selecionar membros...</span>
          </div>
          <input type="hidden" id="room-members" value="">
        </div>
      </form>`,
        footer: `
      <button class="btn btn-secondary" onclick="closeModal('modal-new-room')">Cancelar</button>
      <button class="btn btn-primary" onclick="window._createRoom()">
        <i data-fa-icon="plus"></i> Criar Sala
      </button>`,
    });
    
    document.getElementById('room-type').value = 'group';
    document.getElementById('room-create-chat').checked = true;
    openModal('modal-new-room');
    window.renderIcons?.();
};

window._onRoomTypeChange = function() {
    const type = document.getElementById('room-type')?.value;
    const membersSection = document.getElementById('members-section');
    if (membersSection) {
        membersSection.style.display = (type === 'global') ? 'none' : 'block';
    }
};

window._openMembersPicker = async function() {
    try {
        const snap = await getDocs(collection(db, 'users'));
        const users = [];
        snap.docs.forEach(d => {
            const data = d.data();
            if (data.uid && data.uid !== _profile.uid) {
                users.push({ id: data.uid, name: data.name || data.email || 'Usuário', email: data.email || '' });
            }
        });
        
        if (users.length === 0) {
            toast.warning('Aviso', 'Nenhum outro usuário encontrado no sistema.');
            return;
        }
        
        createModal({
            id: 'modal-room-members',
            title: 'Selecionar Membros',
            size: 'sm',
            body: `
                <div style="max-height:400px;overflow-y:auto">
                    <div class="search-box mb-3">
                        <i data-fa-icon="search" class="search-icon"></i>
                        <input type="text" id="search-room-members" class="search-input" placeholder="Buscar..." oninput="window._filterMembersPicker()">
                    </div>
                    <div id="members-picker-list">${buildMembersPickerList(users)}</div>
                </div>`,
            footer: `<button class="btn btn-primary" onclick="closeModal('modal-room-members')">Concluído</button>`,
        });
        
        openModal('modal-room-members');
        window.renderIcons?.();
    } catch(e) {
        toast.error('Erro', 'Não foi possível carregar usuários.');
    }
};

function buildMembersPickerList(users) {
    const selectedIds = getSelectedMemberIds();
    return users.map(u => `
        <div class="involved-picker-item${selectedIds.includes(u.id) ? ' selected' : ''}" data-id="${u.id}" data-name="${escapeHtml(u.name)}" onclick="window._toggleRoomMember('${u.id}', '${escapeHtml(u.name).replace(/'/g, "\\'")}')">
            <div class="involved-avatar" style="background:${stringToColor(u.name)}">${getInitials(u.name)}</div>
            <div class="involved-info">
                <div class="involved-name">${escapeHtml(u.name)}</div>
                <div class="involved-email">${escapeHtml(u.email)}</div>
            </div>
            <i data-fa-icon="check" class="check-icon"></i>
        </div>
    `).join('');
}

window._toggleRoomMember = function(userId, userName) {
    let selected = getSelectedMemberIds();
    if (selected.includes(userId)) {
        selected = selected.filter(id => id !== userId);
    } else {
        selected.push(userId);
    }
    
    document.getElementById('room-members').value = JSON.stringify(selected);
    renderRoomMembersContainer(selected);
    
    document.querySelectorAll('#members-picker-list .involved-picker-item').forEach(el => {
        el.classList.toggle('selected', selected.includes(el.dataset.id));
    });
};

window._filterMembersPicker = async function() {
    const search = document.getElementById('search-room-members')?.value?.toLowerCase() || '';
    const snap = await getDocs(collection(db, 'users'));
    const users = [];
    snap.docs.forEach(d => {
        const data = d.data();
        if (data.active !== false && data.uid !== _profile.uid) {
            const name = data.name || data.email || '';
            const email = data.email || '';
            if (name.toLowerCase().includes(search) || email.toLowerCase().includes(search)) {
                users.push({ id: data.uid, name, email });
            }
        }
    });
    document.getElementById('members-picker-list').innerHTML = buildMembersPickerList(users);
    window.renderIcons?.();
};

function getSelectedMemberIds() {
    try {
        const val = document.getElementById('room-members')?.value;
        return val ? JSON.parse(val) : [];
    } catch { return []; }
}

async function renderRoomMembersContainer(selectedIds) {
    const container = document.getElementById('room-members-container');
    if (!container) return;
    
    if (!selectedIds || selectedIds.length === 0) {
        container.innerHTML = '<span class="involved-placeholder">Clique para selecionar membros...</span>';
        window.renderIcons?.();
        return;
    }
    
    const allUsersSnap = await getDocs(collection(db, 'users'));
    const members = [];
    allUsersSnap.docs.forEach(d => {
        const data = d.data();
        if (selectedIds.includes(data.uid)) {
            members.push({ id: data.uid, name: data.name || data.email });
        }
    });
    
    container.innerHTML = members.map(u => `
        <div class="involved-chip" data-id="${u.id}">
            <div class="involved-avatar" style="background:${stringToColor(u.name)}">${getInitials(u.name)}</div>
            <span>${escapeHtml(u.name)}</span>
            <i data-fa-icon="x" onclick="window._removeRoomMember('${u.id}', event)"></i>
        </div>
    `).join('');
    
    container.innerHTML += '<span class="involved-add-btn">+ Adicionar</span>';
    window.renderIcons?.();
}

window._removeRoomMember = function(userId, event) {
    event.stopPropagation();
    let selected = getSelectedMemberIds();
    selected = selected.filter(id => id !== userId);
    document.getElementById('room-members').value = JSON.stringify(selected);
    renderRoomMembersContainer(selected);
};

window._createRoom = async function () {
    const name = sanitizeText(document.getElementById('room-name')?.value?.trim() || '');
    const description = sanitizeText(document.getElementById('room-desc')?.value?.trim() || '');
    const type = document.getElementById('room-type')?.value || 'group';
    const memberIds = getSelectedMemberIds();
    
    if (!name) { toast.warning('Obrigatório', 'Informe o nome da sala.'); return; }
    
    if (type !== 'global' && memberIds.length === 0) {
        toast.warning('Membros', 'Selecione pelo menos um membro.');
        return;
    }

    try {
        const members = type === 'global' ? [] : memberIds;
        
        await addDoc(collection(db, 'chatRooms'), {
            name,
            description,
            type,
            members,
            createdBy: _profile.uid,
            createdAt: serverTimestamp(),
            lastMessage: '',
            lastMessageAt: serverTimestamp(),
        });
        
        toast.success('Criado', `Sala "${name}" criada.`);
        closeModal('modal-new-room');
    } catch (e) {
        console.error('[Chat] Create room error:', e);
        toast.error('Erro', 'Não foi possível criar a sala.');
    }
};

init().catch(e => { console.error(e); toast.error('Erro', 'Falha ao carregar o chat.'); });

// ================================================================
// EMOJI PICKER
// ================================================================
let _currentEmojiCategory = '常用';

window._toggleEmojiPicker = function () {
    const picker = document.getElementById('emoji-picker');
    if (!picker) return;
    
    _emojiPickerOpen = !_emojiPickerOpen;
    picker.style.display = _emojiPickerOpen ? 'block' : 'none';
    
    if (_emojiPickerOpen) {
        renderEmojiPicker();
    }
};

function renderEmojiPicker() {
    const grid = document.getElementById('emoji-grid');
    if (!grid) return;
    
    let html = '';
    for (const [cat, emojis] of Object.entries(EMOJI_CATEGORIES)) {
        html += `<div class="emoji-category-label">${cat}</div>`;
        html += `<div class="emoji-category-row">`;
        for (const emoji of emojis.slice(0, 30)) {
            html += `<button class="emoji-btn" onclick="window._insertEmoji('${emoji}')">${emoji}</button>`;
        }
        html += `</div>`;
    }
    
    grid.innerHTML = html;
}

window._insertEmoji = function (emoji) {
    const input = document.getElementById('chat-input');
    if (!input) return;
    
    const start = input.selectionStart;
    const end = input.selectionEnd;
    const text = input.value;
    
    input.value = text.substring(0, start) + emoji + text.substring(end);
    input.selectionStart = input.selectionEnd = start + emoji.length;
    input.focus();
    
    input.style.height = 'auto';
    input.style.height = Math.min(input.scrollHeight, 120) + 'px';
    
    window._toggleEmojiPicker();
};

window._filterEmojis = function () {
    const search = document.getElementById('emoji-search')?.value?.toLowerCase() || '';
    const grid = document.getElementById('emoji-grid');
    if (!grid) return;
    
    if (!search) {
        renderEmojiPicker();
        return;
    }
    
    let allEmojis = [];
    for (const emojis of Object.values(EMOJI_CATEGORIES)) {
        allEmojis = allEmojis.concat(emojis);
    }
    
    const filtered = allEmojis.slice(0, 60);
    grid.innerHTML = `<div class="emoji-category-row">${filtered.map(e => 
        `<button class="emoji-btn" onclick="window._insertEmoji('${e}')">${e}</button>`
    ).join('')}</div>`;
};

document.addEventListener('click', e => {
    const picker = document.getElementById('emoji-picker');
    const toggleBtn = document.querySelector('[onclick*="_toggleEmojiPicker"]');
    if (picker && _emojiPickerOpen && !picker.contains(e.target) && !toggleBtn?.contains(e.target)) {
        _emojiPickerOpen = false;
        picker.style.display = 'none';
    }
});

// ================================================================
// EDITAR/EXCLUIR MENSAGEM
// ================================================================

let _editingMessageId = null;
let _originalContent = null;

window._editMessage = function(msgId) {
    const textEl = document.getElementById(`msg-text-${msgId}`);
    if (!textEl) return;
    
    _editingMessageId = msgId;
    _originalContent = textEl.innerText;
    
    const currentText = textEl.innerText;
    textEl.innerHTML = `<textarea id="edit-msg-input" class="chat-textarea" style="width:100%;min-height:60px;max-height:120px">${escapeHtml(currentText)}</textarea>
        <div style="display:flex;gap:4px;margin-top:4px">
            <button class="btn btn-primary btn-sm" onclick="window._saveEdit('${msgId}')">Salvar</button>
            <button class="btn btn-secondary btn-sm" onclick="window._cancelEdit('${msgId}')">Cancelar</button>
        </div>`;
    
    const textarea = document.getElementById('edit-msg-input');
    textarea?.focus();
};

window._saveEdit = async function(msgId) {
    const textarea = document.getElementById('edit-msg-input');
    if (!textarea) return;
    
    const newContent = sanitizeText(textarea.value?.trim() || '');
    if (!newContent) {
        toast.warning('Aviso', 'Mensagem não pode estar vazia.');
        return;
    }
    
    if (newContent === _originalContent) {
        window._cancelEdit(msgId);
        return;
    }
    
    try {
        await updateDoc(doc(db, 'chatMessages', msgId), {
            content: newContent,
            editedAt: serverTimestamp(),
        });
        await updateDoc(doc(db, 'chatRooms', _activeRoomId), {
            lastMessage: newContent.length > 80 ? newContent.slice(0, 80) + '…' : newContent,
            lastMessageAt: serverTimestamp(),
        });
        toast.success('Editado', 'Mensagem atualizada.');
    } catch (e) {
        console.error('[Chat] Edit error:', e);
        toast.error('Erro', 'Não foi possível editar a mensagem.');
    }
    
    _editingMessageId = null;
    _originalContent = null;
};

window._cancelEdit = function(msgId) {
    const textEl = document.getElementById(`msg-text-${msgId}`);
    if (textEl) {
        textEl.innerHTML = escapeHtml(_originalContent || '').replace(/\n/g, '<br>');
    }
    _editingMessageId = null;
    _originalContent = null;
};

window._deleteMessage = async function(msgId) {
    const confirmed = await confirmDialog('Excluir Mensagem', 'Tem certeza que deseja excluir esta mensagem?', 'Excluir', true);
    if (!confirmed) return;
    
    try {
        await updateDoc(doc(db, 'chatMessages', msgId), {
            deleted: true,
            deletedAt: serverTimestamp(),
            deletedBy: _profile.uid,
        });
        
        const remainingSnap = await getDocs(query(
            collection(db, 'chatMessages'),
            where('roomId', '==', _activeRoomId),
            where('deleted', '==', false),
            orderBy('createdAt', 'desc'),
            limit(1)
        ));
        
        let lastMsg = '';
        if (!remainingSnap.empty) {
            const lastMsgData = remainingSnap.docs[0].data();
            lastMsg = lastMsgData.content?.length > 80 ? lastMsgData.content.slice(0, 80) + '…' : (lastMsgData.content || '');
        }
        
        await updateDoc(doc(db, 'chatRooms', _activeRoomId), {
            lastMessage: lastMsg,
            lastMessageAt: serverTimestamp(),
        });
        
        toast.success('Excluído', 'Mensagem removida.');
    } catch (e) {
        console.error('[Chat] Delete error:', e);
        toast.error('Erro', 'Não foi possível excluir a mensagem.');
    }
};
