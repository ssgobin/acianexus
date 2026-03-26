/* ================================================================
   NEXUS — Announcements Module
   Mural de comunicados por papel e destaque.
   ================================================================ */

import { requireAuth } from '/services/auth.service.js';
import { db } from '/services/firebase-config.js';
import {
    collection, doc, query, where, orderBy, getDocs,
    addDoc, updateDoc, deleteDoc, serverTimestamp, Timestamp
} from 'firebase/firestore';
import { renderSidebar } from '/components/sidebar.js';
import { renderHeader } from '/components/header.js';
import { createModal, openModal, closeModal, confirmDialog } from '/components/modal.js';
import { toast } from '/components/toast.js';
import { sanitize, sanitizeText } from '/utils/sanitizer.js';
import { formatDate, formatRelative } from '/utils/date-utils.js';
import {
    escapeHtml, getInitials, stringToColor,
    getStoredTheme, setTheme, canPerformAction, ROLE_LABELS
} from '/utils/helpers.js';
import { logAudit, AUDIT_ACTIONS } from '/services/audit.service.js';
import { notifyNewAnnouncement } from '/services/notifications.service.js';

let _profile = null;
let _announcements = [];
let _editingId = null;

// ================================================================
// INIT
// ================================================================
async function init() {
    setTheme(getStoredTheme());

    _profile = await requireAuth('viewer');
    if (!_profile) return;

    renderSidebar('announcements', _profile);
    renderHeader(_profile, 'Comunicados', 'Mural de avisos e comunicações');

    document.getElementById('page-content').innerHTML = buildLayout();

    await loadAnnouncements();
    renderAnnouncements();
    createAnnouncementModal();
    maybeOpenCreateAnnouncementFromQuery();

    document.getElementById('app-loading').style.display = 'none';
    document.getElementById('app').style.display = 'flex';
    window.renderIcons?.();
}

// ================================================================
// LAYOUT
// ================================================================
function buildLayout() {
    const canCreate = canPerformAction(_profile, 'create_announcement');
    return `
    <div class="page-header">
      <div class="page-header-left">
        <h2>Comunicados</h2>
        <p>Avisos, novidades e comunicações internas</p>
      </div>
      <div class="page-header-actions">
        ${canCreate ? `<button class="btn btn-primary" onclick="window._openCreateAnnouncement()">
          <i data-fa-icon="plus"></i> Novo Comunicado
        </button>` : ''}
      </div>
    </div>

    <!-- Busca -->
    <div class="toolbar mb-6">
      <div class="search-box">
        <i data-fa-icon="search" class="search-icon"></i>
        <input type="text" id="search-ann" class="search-input" placeholder="Buscar comunicados..." oninput="window._filterAnn()">
      </div>
    </div>

    <div id="ann-highlighted" style="margin-bottom:24px"></div>
    <div id="ann-regular"></div>`;
}

function maybeOpenCreateAnnouncementFromQuery() {
    const params = new URLSearchParams(window.location.search);
    if (params.get('create') !== '1') return;
    if (!canPerformAction(_profile, 'create_announcement')) return;
    window._openCreateAnnouncement();
}

// ================================================================
// CARREGAR & FILTRAR
// ================================================================
async function loadAnnouncements() {
    try {
        const snap = await getDocs(query(
            collection(db, 'announcements'),
            where('active', '==', true),
            orderBy('publishedAt', 'desc')
        ));

        const now = new Date();
        _announcements = snap.docs.map(d => ({ id: d.id, ...d.data() })).filter(a => {
            // Filtrar por expiração
            if (a.expiresAt) {
                const exp = a.expiresAt.toDate?.() || new Date(a.expiresAt);
                if (exp < now) return false;
            }
            // Filtrar por papel
            if (!a.targetRoles || a.targetRoles.includes('all')) return true;
            return a.targetRoles.includes(_profile.role);
        });
    } catch (e) {
        console.error('[Announcements] Load error:', e);
        _announcements = [];
    }
}

function renderAnnouncements(search = '') {
    let items = _announcements;
    if (search) {
        const s = search.toLowerCase();
        items = items.filter(a =>
            (a.title || '').toLowerCase().includes(s) ||
            (a.content || '').toLowerCase().includes(s) ||
            (a.authorName || '').toLowerCase().includes(s)
        );
    }

    const highlighted = items.filter(a => a.highlighted);
    const regular = items.filter(a => !a.highlighted);

    // Destaques
    const hlEl = document.getElementById('ann-highlighted');
    if (hlEl) {
        if (highlighted.length === 0) {
            hlEl.innerHTML = '';
        } else {
            hlEl.innerHTML = `
        <h3 style="font-size:14px;font-weight:700;color:var(--text-secondary);margin-bottom:12px;text-transform:uppercase;letter-spacing:.5px">
          <i data-fa-icon="star" style="width:14px;height:14px;display:inline-block;vertical-align:middle;margin-right:6px;color:var(--color-warning)"></i>
          Destaques
        </h3>
        <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(340px,1fr));gap:16px;margin-bottom:16px">
          ${highlighted.map(a => buildCard(a, true)).join('')}
        </div>`;
        }
    }

    // Regulares
    const regEl = document.getElementById('ann-regular');
    if (regEl) {
        if (regular.length === 0 && highlighted.length === 0) {
            regEl.innerHTML = `
        <div class="empty-state">
          <div class="empty-state-icon"><i data-fa-icon="megaphone"></i></div>
          <h3>Nenhum comunicado</h3>
          <p>Não há comunicados ativos no momento.</p>
        </div>`;
        } else if (regular.length > 0) {
            regEl.innerHTML = `
        ${highlighted.length === 0 ? '' : `<h3 style="font-size:14px;font-weight:700;color:var(--text-secondary);margin-bottom:12px;text-transform:uppercase;letter-spacing:.5px">Todos os Comunicados</h3>`}
        <div style="display:flex;flex-direction:column;gap:12px">
          ${regular.map(a => buildCard(a, false)).join('')}
        </div>`;
        } else {
            regEl.innerHTML = '';
        }
    }

    window.renderIcons?.();
}

function buildCard(a, highlight) {
    const canEdit = canPerformAction(_profile, 'create_announcement');
    const expiry = a.expiresAt ? ` · Expira: ${formatDate(a.expiresAt, 'short')}` : '';
    const roles = a.targetRoles?.includes('all') ? 'Todos' : a.targetRoles?.map(r => ROLE_LABELS[r] || r).join(', ');

    if (highlight) {
        return `
      <div class="card" style="border:2px solid var(--color-primary);background:var(--color-primary-light);transition:transform 0.2s"
           onmouseover="this.style.transform='translateY(-2px)'" onmouseout="this.style.transform=''">
        <div class="card-body" style="padding:20px">
          <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:12px">
            <div style="flex:1">
              <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px">
                <i data-fa-icon="star" style="width:16px;height:16px;color:var(--color-warning);fill:var(--color-warning)"></i>
                <span class="badge badge-primary">Destaque</span>
                ${roles ? `<span class="badge badge-gray">${roles}</span>` : ''}
              </div>
              <h3 style="font-size:15px;font-weight:700;color:var(--text-primary);margin-bottom:8px">${escapeHtml(a.title)}</h3>
              <div style="font-size:13px;color:var(--text-secondary);line-height:1.6">
                ${sanitize(a.content || '').replace(/\n/g, '<br>')}
              </div>
            </div>
            ${canEdit ? `<div style="display:flex;gap:4px;flex-shrink:0">
              <button class="btn btn-ghost btn-xs" onclick="window._editAnnouncement('${a.id}')">
                <i data-fa-icon="edit-2" style="width:13px;height:13px"></i>
              </button>
              <button class="btn btn-ghost btn-xs danger" onclick="window._deleteAnnouncement('${a.id}')">
                <i data-fa-icon="trash-2" style="width:13px;height:13px"></i>
              </button>
            </div>` : ''}
          </div>
          <div style="display:flex;align-items:center;gap:8px;margin-top:12px;font-size:12px;color:var(--text-muted)">
            <div class="assignee-avatar-sm" style="background:${stringToColor(a.authorName || '')}">${getInitials(a.authorName || '?')}</div>
            ${escapeHtml(a.authorName || '')} · ${formatRelative(a.publishedAt)}${expiry}
          </div>
        </div>
      </div>`;
    }

    return `
    <div class="card" style="transition:box-shadow 0.2s"
         onmouseover="this.style.boxShadow='var(--shadow-md)'" onmouseout="this.style.boxShadow=''">
      <div class="card-body" style="padding:16px 20px">
        <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:12px">
          <div style="flex:1">
            <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px">
              ${roles ? `<span class="badge badge-gray">${roles}</span>` : ''}
              ${a.expiresAt ? `<span class="badge badge-warning" style="font-size:10px">Expira ${formatDate(a.expiresAt, 'short')}</span>` : ''}
            </div>
            <h4 style="font-size:14px;font-weight:700;color:var(--text-primary);margin-bottom:6px">${escapeHtml(a.title)}</h4>
            <div style="font-size:13px;color:var(--text-secondary);line-height:1.5">
              ${sanitize(a.content || '').replace(/\n/g, '<br>')}
            </div>
          </div>
          ${canEdit ? `<div style="display:flex;gap:4px;flex-shrink:0">
            <button class="btn btn-ghost btn-xs" onclick="window._editAnnouncement('${a.id}')">
              <i data-fa-icon="edit-2" style="width:13px;height:13px"></i>
            </button>
            <button class="btn btn-ghost btn-xs danger" onclick="window._deleteAnnouncement('${a.id}')">
              <i data-fa-icon="trash-2" style="width:13px;height:13px"></i>
            </button>
          </div>` : ''}
        </div>
        <div style="display:flex;align-items:center;gap:8px;margin-top:12px;font-size:12px;color:var(--text-muted)">
          <div class="assignee-avatar-sm" style="background:${stringToColor(a.authorName || '')}">${getInitials(a.authorName || '?')}</div>
          ${escapeHtml(a.authorName || '')} · ${formatRelative(a.publishedAt)}${expiry}
        </div>
      </div>
    </div>`;
}

window._filterAnn = function () {
    const search = document.getElementById('search-ann')?.value || '';
    renderAnnouncements(search);
};

// ================================================================
// MODAL
// ================================================================
function createAnnouncementModal() {
    createModal({
        id: 'modal-ann',
        title: 'Novo Comunicado',
        size: 'md',
        body: `
      <form id="form-ann" class="form-grid" novalidate>
        <div class="form-group form-col-full">
          <label class="form-label">Título *</label>
          <input type="text" id="ann-title" class="form-input" maxlength="200" required>
        </div>
        <div class="form-group form-col-full">
          <label class="form-label">Conteúdo *</label>
          <textarea id="ann-content" class="form-textarea" rows="5" required></textarea>
        </div>
        <div class="form-group">
          <label class="form-label">Público-Alvo</label>
          <select id="ann-roles" class="form-select">
            <option value="all">Todos</option>
            <option value="admin">Somente Admins</option>
            <option value="editor">Editors e Admins</option>
            <option value="viewer">Somente Viewers</option>
          </select>
        </div>
        <div class="form-group">
          <label class="form-label">Expiração (opcional)</label>
          <input type="date" id="ann-expires" class="form-input">
        </div>
        <div class="form-group form-col-full">
          <label style="display:flex;align-items:center;gap:8px;cursor:pointer;font-size:13px">
            <input type="checkbox" id="ann-highlighted" class="form-checkbox">
            <strong>Destacar comunicado</strong> (aparece no topo em destaque)
          </label>
        </div>
      </form>`,
        footer: `
      <button class="btn btn-secondary" onclick="closeModal('modal-ann')">Cancelar</button>
      <button class="btn btn-primary" id="btn-save-ann" onclick="window._saveAnnouncement()">
        <i data-fa-icon="send"></i> Publicar
      </button>`,
    });
}

function setAnnouncementModalTitle(text) {
    const titleEl = document.getElementById('modal-ann-title') || document.querySelector('#modal-ann .modal-title');
    if (titleEl) titleEl.textContent = text;
}

window._openCreateAnnouncement = function () {
    if (!canPerformAction(_profile, 'create_announcement')) {
        toast.warning('Sem permissão', 'Você precisa ser editor ou admin.'); return;
    }
    _editingId = null;
    document.getElementById('form-ann')?.reset();
    setAnnouncementModalTitle('Novo Comunicado');
    openModal('modal-ann');
    window.renderIcons?.();
};

window._editAnnouncement = function (id) {
    const a = _announcements.find(x => x.id === id);
    if (!a) return;
    _editingId = id;
    setTimeout(() => {
        document.getElementById('ann-title').value = a.title || '';
        document.getElementById('ann-content').value = a.content || '';
        document.getElementById('ann-highlighted').checked = !!a.highlighted;
        if (a.expiresAt) {
            const d = a.expiresAt.toDate?.() || new Date(a.expiresAt);
            document.getElementById('ann-expires').value = d.toISOString().split('T')[0];
        }
        // roles
        const rolesEl = document.getElementById('ann-roles');
        if (rolesEl) {
            if (!a.targetRoles || a.targetRoles.includes('all')) rolesEl.value = 'all';
            else if (a.targetRoles.includes('admin') && a.targetRoles.length === 1) rolesEl.value = 'admin';
            else if (a.targetRoles.includes('editor')) rolesEl.value = 'editor';
            else rolesEl.value = 'viewer';
        }
        setAnnouncementModalTitle('Editar Comunicado');
    }, 50);
    openModal('modal-ann');
};

window._deleteAnnouncement = async function (id) {
    const a = _announcements.find(x => x.id === id);
    const confirmed = await confirmDialog('Excluir Comunicado', `Excluir "${a?.title}"?`, 'Excluir', true);
    if (!confirmed) return;
    try {
        await updateDoc(doc(db, 'announcements', id), { active: false, updatedAt: serverTimestamp() });
        toast.success('Removido', 'Comunicado removido.');
        await loadAnnouncements();
        renderAnnouncements();
    } catch (e) {
        toast.error('Erro', 'Não foi possível remover o comunicado.');
    }
};

window._saveAnnouncement = async function () {
    const title = sanitizeText(document.getElementById('ann-title')?.value?.trim() || '');
    const content = sanitizeText(document.getElementById('ann-content')?.value?.trim() || '');
    const rolesVal = document.getElementById('ann-roles')?.value || 'all';
    const expireStr = document.getElementById('ann-expires')?.value || '';
    const highlighted = document.getElementById('ann-highlighted')?.checked || false;

    if (!title) { toast.warning('Obrigatório', 'Informe o título.'); return; }
    if (!content) { toast.warning('Obrigatório', 'Informe o conteúdo.'); return; }

    let targetRoles = ['all'];
    if (rolesVal === 'admin') targetRoles = ['admin'];
    else if (rolesVal === 'editor') targetRoles = ['editor', 'admin'];
    else if (rolesVal === 'viewer') targetRoles = ['viewer'];

    const expiresAt = expireStr ? Timestamp.fromDate(new Date(expireStr + 'T23:59:00')) : null;

    const payload = {
        title, content, highlighted, targetRoles,
        expiresAt, active: true, updatedAt: serverTimestamp(),
    };

    const btn = document.getElementById('btn-save-ann');
    if (btn) btn.disabled = true;

    try {
        if (_editingId) {
            await updateDoc(doc(db, 'announcements', _editingId), payload);
            toast.success('Atualizado', 'Comunicado atualizado.');
        } else {
            const ndoc = await addDoc(collection(db, 'announcements'), {
                ...payload,
                authorId: _profile.uid, authorName: _profile.name,
                publishedAt: serverTimestamp(), createdAt: serverTimestamp(),
            });
            await logAudit(AUDIT_ACTIONS.ANNOUNCEMENT_CREATED, ndoc.id, 'announcement', { title });
            await notifyNewAnnouncement({ id: ndoc.id, ...payload }, _profile.uid);
            toast.success('Publicado', 'Comunicado publicado com sucesso.');
        }
        closeModal('modal-ann');
        await loadAnnouncements();
        renderAnnouncements();
    } catch (e) {
        console.error('[Announcements] Save error:', e);
        toast.error('Erro', 'Não foi possível publicar o comunicado.');
    } finally {
        if (btn) btn.disabled = false;
    }
};

init().catch(e => { console.error(e); toast.error('Erro', 'Falha ao carregar módulo de comunicados.'); });
