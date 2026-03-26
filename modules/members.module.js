/* ================================================================
   NEXUS — Members Module (Admin Only)
   Gestão de perfis de usuários e papéis.
   ================================================================ */

import { requireAuth } from '/services/auth.service.js';
import { db } from '/services/firebase-config.js';
import {
    collection, doc, query, where, orderBy, getDocs,
    addDoc, updateDoc, serverTimestamp, Timestamp
} from 'firebase/firestore';
import { renderSidebar } from '/components/sidebar.js';
import { renderHeader } from '/components/header.js';
import { createModal, openModal, closeModal, confirmDialog } from '/components/modal.js';
import { toast } from '/components/toast.js';
import { sanitizeText } from '/utils/sanitizer.js';
import { formatDate, formatRelative } from '/utils/date-utils.js';
import {
    escapeHtml, getInitials, stringToColor, uid as genUid,
    getStoredTheme, setTheme, ROLE_LABELS
} from '/utils/helpers.js';
import { logAudit, AUDIT_ACTIONS } from '/services/audit.service.js';

let _profile = null;
let _members = [];
let _editingId = null;

// ================================================================
// INIT
// ================================================================
async function init() {
    setTheme(getStoredTheme());

    _profile = await requireAuth('admin');
    if (!_profile) return;

    renderSidebar('members', _profile);
    renderHeader(_profile, 'Membros', 'Gestão de usuários e permissões');

    document.getElementById('page-content').innerHTML = buildLayout();

    await loadMembers();
    renderMembers();
    createMemberModal();
    setupListeners();

    document.getElementById('app-loading').style.display = 'none';
    document.getElementById('app').style.display = 'flex';
    window.renderIcons?.();
}

// ================================================================
// LAYOUT
// ================================================================
function buildLayout() {
    return `
    <div class="page-header">
      <div class="page-header-left">
        <h2>Membros</h2>
        <p>Usuários da plataforma Nexus</p>
      </div>
      <div class="page-header-actions">
        <button class="btn btn-primary" onclick="window._openCreateMember()">
          <i data-fa-icon="user-plus"></i> Convidar Membro
        </button>
      </div>
    </div>

    <!-- Info -->
    <div class="alert alert-info mb-4" style="border-radius:10px;padding:12px 16px;display:flex;gap:10px;align-items:flex-start;background:var(--color-info-light);border:1px solid var(--color-info-border)">
      <i data-fa-icon="info" style="width:16px;height:16px;color:var(--color-info);flex-shrink:0;margin-top:1px"></i>
      <span style="font-size:13px;color:var(--text-secondary)">
        Criar um perfil aqui não cria automaticamente a conta de autenticação Firebase.
        O novo membro deve fazer login com o e-mail configurado e depois redefinir sua senha via link.
        O perfil ficará ativo assim que o usuário fizer login pela primeira vez.
      </span>
    </div>

    <!-- Filters -->
    <div class="toolbar mb-4">
      <div class="search-box">
        <i data-fa-icon="search" class="search-icon"></i>
        <input type="text" id="search-members" class="search-input" placeholder="Buscar por nome, e-mail ou departamento...">
      </div>
      <div class="toolbar-right">
        <select id="filter-role" class="form-select form-select-sm" style="width:auto">
          <option value="">Todos os papéis</option>
          ${Object.entries(ROLE_LABELS).map(([k, v]) => `<option value="${k}">${v}</option>`).join('')}
        </select>
        <select id="filter-active" class="form-select form-select-sm" style="width:auto">
          <option value="">Todos os status</option>
          <option value="true">Ativos</option>
          <option value="false">Inativos</option>
        </select>
      </div>
    </div>

    <!-- Members Table -->
    <div id="members-container">
      <div class="page-loader"><div class="spinner"></div></div>
    </div>`;
}

function setupListeners() {
    let debounce;
    document.getElementById('search-members')?.addEventListener('input', () => {
        clearTimeout(debounce); debounce = setTimeout(renderMembers, 300);
    });
    document.getElementById('filter-role')?.addEventListener('change', renderMembers);
    document.getElementById('filter-active')?.addEventListener('change', renderMembers);
}

// ================================================================
// CARREGAR
// ================================================================
async function loadMembers() {
    try {
        const snap = await getDocs(query(collection(db, 'users'), orderBy('name', 'asc')));
        _members = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    } catch (e) {
        console.error('[Members] Load error:', e);
        _members = [];
    }
}

// ================================================================
// RENDER
// ================================================================
function renderMembers() {
    const container = document.getElementById('members-container');
    if (!container) return;

    const search = (document.getElementById('search-members')?.value || '').toLowerCase();
    const role = document.getElementById('filter-role')?.value || '';
    const active = document.getElementById('filter-active')?.value || '';

    let filtered = _members;
    if (search) {
        filtered = filtered.filter(m =>
            (m.name || '').toLowerCase().includes(search) ||
            (m.email || '').toLowerCase().includes(search) ||
            (m.department || '').toLowerCase().includes(search)
        );
    }
    if (role) filtered = filtered.filter(m => m.role === role);
    if (active !== '') filtered = filtered.filter(m => String(m.active !== false) === active);

    if (filtered.length === 0) {
        container.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon"><i data-fa-icon="users"></i></div>
        <h3>Nenhum membro encontrado</h3>
        <button class="btn btn-primary" onclick="window._openCreateMember()">
          <i data-fa-icon="user-plus"></i> Convidar Membro
        </button>
      </div>`;
        window.renderIcons?.(); return;
    }

    const ROLE_CLASS = { admin: 'badge-purple', editor: 'badge-primary', viewer: 'badge-gray' };

    container.innerHTML = `
    <div class="table-wrapper">
      <table class="table">
        <thead>
          <tr>
            <th>Membro</th>
            <th>Papel</th>
            <th>Departamento</th>
            <th>Cargo</th>
            <th>Último Acesso</th>
            <th>Status</th>
            <th style="width:80px"></th>
          </tr>
        </thead>
        <tbody>
          ${filtered.map(m => `
            <tr>
              <td>
                <div style="display:flex;align-items:center;gap:10px">
                  <div class="member-avatar" style="background:${stringToColor(m.name || '')}">
                    ${getInitials(m.name || '?')}
                  </div>
                  <div>
                    <div style="font-weight:600;font-size:13px">${escapeHtml(m.name || '—')}</div>
                    <div style="font-size:12px;color:var(--text-muted)">${escapeHtml(m.email || '')}</div>
                  </div>
                </div>
              </td>
              <td>
                <span class="badge ${ROLE_CLASS[m.role] || 'badge-gray'}">${ROLE_LABELS[m.role] || m.role || '—'}</span>
              </td>
              <td style="font-size:13px;color:var(--text-secondary)">${escapeHtml(m.department || '—')}</td>
              <td style="font-size:13px;color:var(--text-secondary)">${escapeHtml(m.position || '—')}</td>
              <td style="font-size:12px;color:var(--text-muted)">${m.lastLogin ? formatRelative(m.lastLogin) : 'Nunca'}</td>
              <td>
                <span class="status-chip ${m.active !== false ? 'status-done' : 'status-cancelled'}">
                  <span class="status-dot"></span>${m.active !== false ? 'Ativo' : 'Inativo'}
                </span>
              </td>
              <td>
                <div style="display:flex;gap:4px">
                  <button class="btn btn-ghost btn-xs" title="Editar" onclick="window._editMember('${m.id}')">
                    <i data-fa-icon="edit-2" style="width:13px;height:13px"></i>
                  </button>
                  ${m.id !== _profile.uid ? `
                    <button class="btn btn-ghost btn-xs danger" title="${m.active !== false ? 'Desativar' : 'Ativar'}"
                            onclick="window._toggleMember('${m.id}',${m.active !== false})">
                      <i data-fa-icon="${m.active !== false ? 'user-x' : 'user-check'}" style="width:13px;height:13px"></i>
                    </button>` : ''}
                </div>
              </td>
            </tr>`).join('')}
        </tbody>
      </table>
    </div>`;
    window.renderIcons?.();
}

// ================================================================
// MODAL
// ================================================================
function createMemberModal() {
    createModal({
        id: 'modal-member',
        title: 'Convidar Membro',
        size: 'md',
        body: `
      <form id="form-member" class="form-grid" novalidate>
        <div class="form-group">
          <label class="form-label">Nome Completo *</label>
          <input type="text" id="mb-name" class="form-input" maxlength="100" required>
        </div>
        <div class="form-group">
          <label class="form-label">E-mail *</label>
          <input type="email" id="mb-email" class="form-input" required placeholder="email@empresa.com">
        </div>
        <div class="form-group">
          <label class="form-label">Papel *</label>
          <select id="mb-role" class="form-select">
            ${Object.entries(ROLE_LABELS).map(([k, v]) => `<option value="${k}">${v}</option>`).join('')}
          </select>
        </div>
        <div class="form-group">
          <label class="form-label">Departamento</label>
          <input type="text" id="mb-dept" class="form-input" maxlength="100">
        </div>
        <div class="form-group">
          <label class="form-label">Cargo / Posição</label>
          <input type="text" id="mb-position" class="form-input" maxlength="100">
        </div>
        <div class="form-group">
          <label class="form-label">Status</label>
          <select id="mb-active" class="form-select">
            <option value="true">Ativo</option>
            <option value="false">Inativo</option>
          </select>
        </div>
        <div class="form-group form-col-full" id="mb-email-note" style="display:none">
          <div style="background:var(--color-warning-light);border:1px solid var(--color-warning-border);border-radius:8px;padding:12px;font-size:12px;color:var(--text-secondary)">
            <strong>⚠ Atenção:</strong> Alterar o e-mail aqui não altera a conta Firebase Auth. 
            Use o Console Firebase para gerenciar autenticação.
          </div>
        </div>
      </form>`,
        footer: `
      <button class="btn btn-secondary" onclick="closeModal('modal-member')">Cancelar</button>
      <button class="btn btn-primary" id="btn-save-member" onclick="window._saveMember()">
        <i data-fa-icon="save"></i> Salvar
      </button>`,
    });
}

window._openCreateMember = function () {
    _editingId = null;
    document.getElementById('form-member')?.reset();
    document.getElementById('mb-role').value = 'viewer';
    document.getElementById('mb-active').value = 'true';
    document.getElementById('mb-email-note').style.display = 'none';
    document.getElementById('mb-email').disabled = false;
    document.querySelector('#modal-member .modal-title').textContent = 'Convidar Membro';
    openModal('modal-member');
    window.renderIcons?.();
};

window._editMember = function (id) {
    const m = _members.find(x => x.id === id);
    if (!m) return;
    _editingId = id;

    setTimeout(() => {
        const set = (k, v) => { const el = document.getElementById(k); if (el) el.value = v || ''; };
        set('mb-name', m.name);
        set('mb-email', m.email);
        set('mb-role', m.role || 'viewer');
        set('mb-dept', m.department);
        set('mb-position', m.position);
        set('mb-active', String(m.active !== false));
        document.getElementById('mb-email').disabled = true; // Can't change email
        document.getElementById('mb-email-note').style.display = 'block';
        document.querySelector('#modal-member .modal-title').textContent = 'Editar Membro';
    }, 50);

    openModal('modal-member');
    window.renderIcons?.();
};

window._toggleMember = async function (id, currentlyActive) {
    if (id === _profile.uid) { toast.warning('Ação', 'Você não pode desativar sua própria conta.'); return; }
    const action = currentlyActive ? 'desativar' : 'ativar';
    const confirmed = await confirmDialog(
        `${currentlyActive ? 'Desativar' : 'Ativar'} Membro`,
        `Deseja ${action} este membro?`,
        currentlyActive ? 'Desativar' : 'Ativar',
        currentlyActive
    );
    if (!confirmed) return;
    try {
        await updateDoc(doc(db, 'users', id), { active: !currentlyActive, updatedAt: serverTimestamp() });
        await logAudit(AUDIT_ACTIONS.USER_UPDATED, id, 'user', { active: !currentlyActive });
        toast.success('Atualizado', `Membro ${!currentlyActive ? 'ativado' : 'desativado'}.`);
        await loadMembers();
        renderMembers();
    } catch (e) {
        toast.error('Erro', 'Não foi possível atualizar o membro.');
    }
};

window._saveMember = async function () {
    const name = sanitizeText(document.getElementById('mb-name')?.value?.trim() || '');
    const email = document.getElementById('mb-email')?.value?.trim().toLowerCase() || '';
    const role = document.getElementById('mb-role')?.value || 'viewer';
    const dept = sanitizeText(document.getElementById('mb-dept')?.value?.trim() || '');
    const position = sanitizeText(document.getElementById('mb-position')?.value?.trim() || '');
    const active = document.getElementById('mb-active')?.value === 'true';

    if (!name) { toast.warning('Obrigatório', 'Informe o nome.'); return; }
    if (!_editingId && !email) { toast.warning('Obrigatório', 'Informe o e-mail.'); return; }
    if (!_editingId && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        toast.warning('E-mail inválido', 'Informe um e-mail válido.'); return;
    }

    const payload = { name, role, department: dept, position, active, updatedAt: serverTimestamp() };
    if (!_editingId) payload.email = email;

    const btn = document.getElementById('btn-save-member');
    if (btn) btn.disabled = true;

    try {
        if (_editingId) {
            await updateDoc(doc(db, 'users', _editingId), payload);
            await logAudit(AUDIT_ACTIONS.USER_UPDATED, _editingId, 'user', { name, role });
            toast.success('Atualizado', 'Membro atualizado.');
        } else {
            // Criar perfil pre-existente (o usuário deve criar a conta via Firebase Auth separadamente)
            const ndoc = await addDoc(collection(db, 'users'), {
                ...payload, uid: '', // será preenchido no primeiro login
                createdAt: serverTimestamp(), lastLogin: null,
            });
            await logAudit(AUDIT_ACTIONS.USER_CREATED, ndoc.id, 'user', { name, email, role });
            toast.success('Criado', `Perfil de ${name} criado. O usuário deve criar a conta Firebase com o e-mail ${email}.`);
        }
        closeModal('modal-member');
        await loadMembers();
        renderMembers();
    } catch (e) {
        console.error('[Members] Save error:', e);
        toast.error('Erro', 'Não foi possível salvar o membro.');
    } finally {
        if (btn) btn.disabled = false;
    }
};

init().catch(e => { console.error(e); toast.error('Erro', 'Falha ao carregar módulo de membros.'); });

if (document.getElementById('page-content')) {
    init().catch(e => { console.error(e); toast.error('Erro', 'Falha ao carregar módulo de membros.'); });
}
