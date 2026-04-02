/* ================================================================
   NEXUS — Tickets Module
   Chamados de suporte interno com SLA e comentários.
   ================================================================ */

import { requireAuth } from '/services/auth.service.js';
import { db } from '/services/firebase-config.js';
import {
    collection, doc, query, where, orderBy, onSnapshot, getDocs,
    addDoc, updateDoc, serverTimestamp, Timestamp, getDoc
} from 'firebase/firestore';
import { renderSidebar } from '/components/sidebar.js';
import { renderHeader } from '/components/header.js';
import { createModal, openModal, closeModal, confirmDialog } from '/components/modal.js';
import { toast } from '/components/toast.js';
import { sanitizeText } from '/utils/sanitizer.js';
import { formatDate, formatRelative, slaDeadline, getSlaStatus } from '/utils/date-utils.js';
import {
    escapeHtml, getInitials, stringToColor, uid as genUid,
    getStoredTheme, setTheme, canPerformAction, TICKET_STATUS_LABELS, SEVERITY_LABELS
} from '/utils/helpers.js';
import { logAudit, AUDIT_ACTIONS } from '/services/audit.service.js';
import { notifyTicketReplied, notifyTicketStatusChanged } from '/services/notifications.service.js';

let _profile = null;
let _tickets = [];
let _allUsers = [];
let _editingId = null;
let _filterStatus = 'open';
let _unsubTickets = null;

const SLA_HOURS = { critical: 4, high: 12, medium: 48, low: 120 };

const SEVERITY_CONFIG = {
    critical: { label: 'Crítica', class: 'badge-purple', icon: 'alert-octagon' },
    high: { label: 'Alta', class: 'badge-danger', icon: 'alert-triangle' },
    medium: { label: 'Média', class: 'badge-warning', icon: 'alert-circle' },
    low: { label: 'Baixa', class: 'badge-info', icon: 'info' },
};

// ================================================================
// INIT
// ================================================================
async function init() {
    setTheme(getStoredTheme());

    _profile = await requireAuth('viewer');
    if (!_profile) return;

    renderSidebar('tickets', _profile);
    renderHeader(_profile, 'Chamados', 'Suporte e atendimento interno');

    document.getElementById('page-content').innerHTML = buildLayout();

    await loadUsers();
    subscribeToTickets();
    setupListeners();
    createTicketModal();
    createDetailModal();

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
        <h2>Chamados</h2>
        <p>Acompanhe e gerencie solicitações de suporte</p>
      </div>
    </div>

    <!-- Status Filter -->
    <div class="filter-tabs" id="ticket-tabs">
      <button class="filter-tab active" data-filter="open">
        Abertos <span class="badge badge-primary ml-1" id="cnt-open">0</span>
      </button>
      <button class="filter-tab" data-filter="in_progress">Em Atendimento</button>
      <button class="filter-tab" data-filter="resolved">Resolvidos</button>
      <button class="filter-tab" data-filter="closed">Fechados</button>
      <button class="filter-tab" data-filter="all">Todos</button>
    </div>

    <!-- Search -->
    <div class="toolbar mb-4">
      <div class="search-box">
        <i data-fa-icon="search" class="search-icon"></i>
        <input type="text" id="search-tickets" class="search-input" placeholder="Buscar chamados...">
      </div>
      <div class="toolbar-right">
        <select id="filter-severity" class="form-select form-select-sm" style="width:auto">
          <option value="">Todas as severidades</option>
          ${Object.entries(SEVERITY_LABELS).map(([k, v]) => `<option value="${k}">${v}</option>`).join('')}
        </select>
      </div>
    </div>

    <!-- Tickets List -->
    <div id="tickets-container">
      <div class="page-loader"><div class="spinner"></div></div>
    </div>

    <!-- FAB -->
    <div class="fab-container">
      <button class="fab-btn" onclick="window._openCreateTicket()" title="Abrir Chamado">
        <i data-fa-icon="plus"></i>
      </button>
    </div>`;
}

function setupListeners() {
    document.getElementById('ticket-tabs')?.addEventListener('click', e => {
        const btn = e.target.closest('[data-filter]');
        if (!btn) return;
        _filterStatus = btn.dataset.filter;
        document.querySelectorAll('#ticket-tabs .filter-tab').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        renderTickets();
    });

    let debounce;
    document.getElementById('search-tickets')?.addEventListener('input', () => {
        clearTimeout(debounce); debounce = setTimeout(renderTickets, 300);
    });
    document.getElementById('filter-severity')?.addEventListener('change', renderTickets);
}

// ================================================================
// CARREGAR USUÁRIOS
// ================================================================
async function loadUsers() {
    try {
        const snap = await getDocs(collection(db, 'users'));
        const usersById = new Map();

        snap.docs.forEach((d) => {
            const data = d.data() || {};
            const id = data.uid || d.id;
            const email = String(data.email || '').trim().toLowerCase();
            const fallbackName = email ? email.split('@')[0] : '';
            const name = String(data.name || data.displayName || data.fullName || fallbackName).trim();

            if (data.active === false) return;
            if (!name && !email) return;

            usersById.set(id, {
                id,
                name: name || email,
                email,
                active: true,
            });
        });

        if (_profile?.uid && !usersById.has(_profile.uid)) {
            usersById.set(_profile.uid, {
                id: _profile.uid,
                name: _profile.name || _profile.email || 'Você',
                email: (_profile.email || '').toLowerCase(),
                active: true,
            });
        }

        _allUsers = Array.from(usersById.values())
            .sort((a, b) => (a.name || a.email || '').localeCompare(b.name || b.email || '', 'pt-BR'));
    } catch (e) {
        _allUsers = _profile?.uid ? [{
            id: _profile.uid,
            name: _profile.name || _profile.email || 'Você',
            email: (_profile.email || '').toLowerCase(),
            active: true,
        }] : [];
    }
}

// ================================================================
// SUBSCRIPTION
// ================================================================
function subscribeToTickets() {
    if (_unsubTickets) _unsubTickets();
    _unsubTickets = onSnapshot(
        query(collection(db, 'tickets'), orderBy('createdAt', 'desc')),
        snap => {
            _tickets = snap.docs.map(d => ({ id: d.id, ...d.data() }));
            // Update open count badge
            const openCount = _tickets.filter(t => t.status === 'open').length;
            const cntEl = document.getElementById('cnt-open');
            if (cntEl) cntEl.textContent = openCount;
            renderTickets();
        },
        err => { console.error('[Tickets] Sub error:', err); }
    );
}

// ================================================================
// RENDER
// ================================================================
function renderTickets() {
    const container = document.getElementById('tickets-container');
    if (!container) return;

    const search = (document.getElementById('search-tickets')?.value || '').toLowerCase();
    const sevFilter = document.getElementById('filter-severity')?.value || '';

    let filtered = _filterStatus === 'all'
        ? [..._tickets]
        : _tickets.filter(t => t.status === _filterStatus);

    if (search) {
        filtered = filtered.filter(t =>
            (t.title || '').toLowerCase().includes(search) ||
            (t.description || '').toLowerCase().includes(search) ||
            (t.createdByName || '').toLowerCase().includes(search) ||
            (t.department || '').toLowerCase().includes(search)
        );
    }
    if (sevFilter) filtered = filtered.filter(t => t.severity === sevFilter);

    if (filtered.length === 0) {
        container.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon"><i data-fa-icon="inbox"></i></div>
        <h3>Nenhum chamado encontrado</h3>
        <p>Não há chamados com os filtros selecionados.</p>
        <button class="btn btn-primary" onclick="window._openCreateTicket()">
          <i data-fa-icon="plus"></i> Abrir Chamado
        </button>
      </div>`;
        window.renderIcons?.(); return;
    }

    container.innerHTML = `
    <div class="table-wrapper">
      <table class="table">
        <thead>
          <tr>
            <th>Chamado</th>
            <th>Severidade</th>
            <th>Departamento</th>
            <th>Solicitante</th>
            <th>Responsável</th>
            <th>SLA</th>
            <th>Status</th>
            <th style="width:80px"></th>
          </tr>
        </thead>
        <tbody>
          ${filtered.map(t => buildTicketRow(t)).join('')}
        </tbody>
      </table>
    </div>`;
    window.renderIcons?.();
}

function buildTicketRow(t) {
    const sev = SEVERITY_CONFIG[t.severity] || SEVERITY_CONFIG.medium;
    const sla = getSlaStatus(t.slaDeadline);
    const slaClass = sla === 'breach' ? 'text-danger' : sla === 'warn' ? 'text-warning' : 'text-success';
    const slaLabel = t.slaDeadline ? formatDate(t.slaDeadline, 'short') : '—';
    const canAssign = canPerformAction(_profile, 'assign_ticket');

    return `
    <tr style="cursor:pointer" onclick="window._openTicketDetail('${t.id}')">
      <td>
        <div style="font-weight:600;font-size:13px;color:var(--text-primary)">${escapeHtml(t.title)}</div>
        <div style="font-size:11px;color:var(--text-muted)">${formatRelative(t.createdAt)}</div>
      </td>
      <td><span class="badge ${sev.class}">${sev.label}</span></td>
      <td style="font-size:13px;color:var(--text-secondary)">${escapeHtml(t.department || '—')}</td>
      <td>
        <div style="display:flex;align-items:center;gap:6px">
          <div class="assignee-avatar-sm" style="background:${stringToColor(t.createdByName || '')}">${getInitials(t.createdByName || '?')}</div>
          <span style="font-size:12px">${escapeHtml(t.createdByName || '—')}</span>
        </div>
      </td>
      <td style="font-size:13px;color:var(--text-secondary)">${escapeHtml(t.assigneeName || 'Não atribuído')}</td>
      <td class="${slaClass}" style="font-size:12px;font-weight:500">${slaLabel}</td>
      <td>
        <span class="status-chip status-${t.status}">
          <span class="status-dot"></span>${TICKET_STATUS_LABELS[t.status] || t.status}
        </span>
      </td>
      <td onclick="event.stopPropagation()">
        ${canAssign ? `
          <button class="btn btn-ghost btn-xs" title="Editar" onclick="window._openTicketDetail('${t.id}')">
            <i data-fa-icon="edit-2" style="width:13px;height:13px"></i>
          </button>` : ''}
      </td>
    </tr>`;
}

// ================================================================
// MODAL CRIAR CHAMADO
// ================================================================
function createTicketModal() {
    createModal({
        id: 'modal-ticket',
        title: 'Abrir Chamado',
        size: 'md',
        body: `
      <form id="form-ticket" class="form-grid" novalidate>
        <div class="form-group form-col-full">
          <label class="form-label">Título *</label>
          <input type="text" id="ticket-title" class="form-input" maxlength="200" required placeholder="Descreva o problema resumidamente">
        </div>
        <div class="form-group">
          <label class="form-label">Severidade *</label>
          <select id="ticket-severity" class="form-select">
            ${Object.entries(SEVERITY_LABELS).map(([k, v]) => `<option value="${k}">${v}</option>`).join('')}
          </select>
        </div>
        <div class="form-group">
          <label class="form-label">Departamento</label>
          <input type="text" id="ticket-dept" class="form-input" maxlength="100" placeholder="Ex: TI, RH, Financeiro">
        </div>
        <div class="form-group form-col-full">
          <label class="form-label">Descrição detalhada *</label>
          <textarea id="ticket-description" class="form-textarea" rows="4" required placeholder="Descreva o problema com o máximo de detalhes..."></textarea>
        </div>
      </form>`,
        footer: `
      <button class="btn btn-secondary" onclick="closeModal('modal-ticket')">Cancelar</button>
      <button class="btn btn-primary" id="btn-save-ticket" onclick="window._saveTicket()">
        <i data-fa-icon="send"></i> Enviar Chamado
      </button>`,
    });
}

window._openCreateTicket = function () {
    _editingId = null;
    document.getElementById('form-ticket')?.reset();
    document.getElementById('ticket-severity').value = 'medium';
    const titleEl = document.getElementById('modal-ticket-title');
    if (titleEl) titleEl.textContent = 'Abrir Chamado';
    openModal('modal-ticket');
    window.renderIcons?.();
};

window._saveTicket = async function () {
    const title = sanitizeText(document.getElementById('ticket-title')?.value?.trim() || '');
    const severity = document.getElementById('ticket-severity')?.value || 'medium';
    const dept = sanitizeText(document.getElementById('ticket-dept')?.value?.trim() || '');
    const desc = sanitizeText(document.getElementById('ticket-description')?.value?.trim() || '');

    if (!title) { toast.warning('Obrigatório', 'Informe o título.'); return; }
    if (!desc) { toast.warning('Obrigatório', 'Informe a descrição.'); return; }

    const slaHrs = SLA_HOURS[severity] || 48;
    const slaDate = slaDeadline(new Date(), slaHrs);

    const btn = document.getElementById('btn-save-ticket');
    if (btn) btn.disabled = true;

    try {
        const ndoc = await addDoc(collection(db, 'tickets'), {
            title, severity, department: dept, description: desc,
            status: 'open',
            assigneeId: null, assigneeName: null,
            slaHours: slaHrs,
            slaDeadline: Timestamp.fromDate(slaDate),
            feedback: '',
            resolvedAt: null,
            createdBy: _profile.uid, createdByName: _profile.name,
            createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
        });
        await logAudit(AUDIT_ACTIONS.TICKET_CREATED, ndoc.id, 'ticket', { title, severity });
        toast.success('Enviado', 'Chamado aberto com sucesso.');
        closeModal('modal-ticket');
    } catch (e) {
        console.error('[Tickets] Save error:', e);
        toast.error('Erro', 'Não foi possível abrir o chamado.');
    } finally {
        if (btn) btn.disabled = false;
    }
};

// ================================================================
// MODAL DETALHE DO CHAMADO
// ================================================================
function createDetailModal() {
    createModal({
        id: 'modal-ticket-detail',
        title: 'Detalhes do Chamado',
        size: 'lg',
        body: `<div id="ticket-detail-body"><div class="page-loader"><div class="spinner"></div></div></div>`,
        footer: `
      <button class="btn btn-secondary" onclick="closeModal('modal-ticket-detail')">Fechar</button>
      <div id="ticket-detail-actions" style="display:flex;gap:8px"></div>`,
    });
}

window._openTicketDetail = async function (id) {
    _editingId = id;
    openModal('modal-ticket-detail');

    try {
        const snap = await getDoc(doc(db, 'tickets', id));
        if (!snap.exists()) { toast.error('Erro', 'Chamado não encontrado.'); closeModal('modal-ticket-detail'); return; }
        const t = { id: snap.id, ...snap.data() };

        // Load comments
        const commSnap = await getDocs(query(
            collection(db, 'ticketComments'),
            where('ticketId', '==', id),
            orderBy('createdAt', 'asc')
        ));
        const comments = commSnap.docs.map(d => ({ id: d.id, ...d.data() }));

        const sev = SEVERITY_CONFIG[t.severity] || SEVERITY_CONFIG.medium;
        const canEdit = canPerformAction(_profile, 'assign_ticket');
        const isOwner = t.createdBy === _profile.uid;

        document.getElementById('ticket-detail-body').innerHTML = `
      <div>
        <!-- Header info -->
        <div style="display:flex;flex-wrap:wrap;gap:8px;margin-bottom:16px">
          <span class="badge ${sev.class}">${sev.label}</span>
          <span class="status-chip status-${t.status}"><span class="status-dot"></span>${TICKET_STATUS_LABELS[t.status] || t.status}</span>
          ${t.slaDeadline ? `<span class="badge ${getSlaStatus(t.slaDeadline) === 'breach' ? 'badge-danger' : getSlaStatus(t.slaDeadline) === 'warn' ? 'badge-warning' : 'badge-success'}">
            SLA: ${formatDate(t.slaDeadline, 'short')}
          </span>` : ''}
        </div>

        <div class="detail-grid">
          <div class="detail-row"><strong>Solicitante:</strong> ${escapeHtml(t.createdByName || '—')}</div>
          <div class="detail-row"><strong>Departamento:</strong> ${escapeHtml(t.department || '—')}</div>
          <div class="detail-row"><strong>Responsável:</strong> ${escapeHtml(t.assigneeName || 'Não atribuído')}</div>
          <div class="detail-row"><strong>Aberto em:</strong> ${formatDate(t.createdAt, 'long')}</div>
        </div>

        <div style="margin-top:16px;padding:16px;background:var(--n-50);border-radius:10px;border:1px solid var(--border-light)">
          <strong style="font-size:13px">Descrição:</strong>
          <p style="margin-top:8px;font-size:13px;color:var(--text-secondary);line-height:1.6">
            ${escapeHtml(t.description || '').replace(/\n/g, '<br>')}
          </p>
        </div>

        ${canEdit ? `
          <div style="margin-top:16px;display:grid;grid-template-columns:1fr 1fr;gap:12px">
            <div>
              <label class="form-label">Status</label>
              <select id="td-status" class="form-select form-select-sm">
                ${Object.entries(TICKET_STATUS_LABELS).map(([k, v]) => `<option value="${k}" ${t.status === k ? 'selected' : ''}>${v}</option>`).join('')}
              </select>
            </div>
            <div>
              <label class="form-label">Atribuir a</label>
              <select id="td-assignee" class="form-select form-select-sm">
                <option value="">Ninguém</option>
                ${_allUsers.map(u => `<option value="${u.id}" data-name="${escapeHtml(u.name)}" ${t.assigneeId === u.id ? 'selected' : ''}>${escapeHtml(u.name)}</option>`).join('')}
              </select>
            </div>
          </div>
          <button class="btn btn-primary btn-sm mt-3" onclick="window._updateTicketStatus()">
            <i data-fa-icon="save"></i> Atualizar Chamado
          </button>` : ''}

        <!-- Comentários -->
        <div style="margin-top:24px">
          <h4 style="font-size:14px;font-weight:700;margin-bottom:12px">
            Comentários (${comments.length})
          </h4>
          <div id="ticket-comments">
            ${comments.length === 0 ? '<p style="color:var(--text-muted);font-size:13px">Nenhum comentário ainda.</p>' :
                comments.map(c => `
                <div style="display:flex;gap:10px;margin-bottom:12px">
                  <div class="assignee-avatar-sm" style="background:${stringToColor(c.authorName || '')};flex-shrink:0">${getInitials(c.authorName || '?')}</div>
                  <div style="flex:1">
                    <div style="display:flex;align-items:center;gap:8px;margin-bottom:4px">
                      <strong style="font-size:13px">${escapeHtml(c.authorName || '')}</strong>
                      <span style="font-size:11px;color:var(--text-muted)">${formatRelative(c.createdAt)}</span>
                    </div>
                    <div style="font-size:13px;color:var(--text-secondary);line-height:1.5">${escapeHtml(c.content || '').replace(/\n/g, '<br>')}</div>
                  </div>
                </div>`).join('')}
          </div>

          <!-- Add comment -->
          <div style="margin-top:16px">
            <textarea id="new-ticket-comment" class="form-textarea" rows="2" placeholder="Adicionar comentário..." maxlength="2000"></textarea>
            <button class="btn btn-secondary btn-sm mt-2" onclick="window._addTicketComment('${id}')">
              <i data-fa-icon="send"></i> Comentar
            </button>
          </div>
        </div>
      </div>`;

        window.renderIcons?.();
    } catch (e) {
        console.error('[Tickets] Detail error:', e);
        toast.error('Erro', 'Não foi possível carregar o chamado.');
    }
};

window._updateTicketStatus = async function () {
    if (!_editingId) return;
    const status = document.getElementById('td-status')?.value;
    const assigneeEl = document.getElementById('td-assignee');
    const assigneeId = assigneeEl?.value || null;
    const assigneeName = assigneeEl ? (assigneeEl.options[assigneeEl.selectedIndex]?.dataset?.name || null) : null;

    try {
        const update = {
            status, assigneeId, assigneeName, updatedAt: serverTimestamp(),
            ...(status === 'resolved' ? { resolvedAt: serverTimestamp() } : {}),
        };
        await updateDoc(doc(db, 'tickets', _editingId), update);
        await logAudit(AUDIT_ACTIONS.TICKET_STATUS_CHANGED, _editingId, 'ticket', { status });
        const currentTicket = _tickets.find(t => t.id === _editingId);
        await notifyTicketStatusChanged(currentTicket, status, _profile.uid);
        toast.success('Atualizado', 'Chamado atualizado.');
        closeModal('modal-ticket-detail');
    } catch (e) {
        toast.error('Erro', 'Não foi possível atualizar o chamado.');
    }
};

window._addTicketComment = async function (ticketId) {
    const content = sanitizeText(document.getElementById('new-ticket-comment')?.value?.trim() || '');
    if (!content) { toast.warning('Vazio', 'Escreva um comentário.'); return; }
    if (content.length > 2000) { toast.warning('Muito longo', 'Máximo 2000 caracteres.'); return; }

    try {
        await addDoc(collection(db, 'ticketComments'), {
            ticketId, content,
            authorId: _profile.uid, authorName: _profile.name,
            createdAt: serverTimestamp(),
        });
        await updateDoc(doc(db, 'tickets', ticketId), { updatedAt: serverTimestamp() });
        
        const ticketSnap = await getDoc(doc(db, 'tickets', ticketId));
        if (ticketSnap.exists()) {
            const ticket = { id: ticketSnap.id, ...ticketSnap.data() };
            await notifyTicketReplied(ticket, _profile.name);
        }
        
        toast.success('Enviado', 'Comentário adicionado.');
        window._openTicketDetail(ticketId);
    } catch (e) {
        toast.error('Erro', 'Não foi possível comentar.');
    }
};

init().catch(e => { console.error(e); toast.error('Erro', 'Falha ao carregar módulo de chamados.'); });
