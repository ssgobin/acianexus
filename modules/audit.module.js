/* ================================================================
   NEXUS — Audit Module (Admin Only)
   Visualização do log de auditoria da plataforma.
   ================================================================ */

import { requireAuth } from '/services/auth.service.js';
import { db } from '/services/firebase-config.js';
import {
    collection, query, where, orderBy, limit, getDocs,
    startAfter, Timestamp
} from 'firebase/firestore';
import { renderSidebar } from '/components/sidebar.js';
import { renderHeader } from '/components/header.js';
import { toast } from '/components/toast.js';
import { formatDate, formatRelative } from '/utils/date-utils.js';
import { escapeHtml, getInitials, stringToColor, getStoredTheme, setTheme } from '/utils/helpers.js';

let _profile = null;
let _logs = [];
let _lastDoc = null;
let _hasMore = true;
let _filterAction = '';
let _filterUser = '';
const PAGE_SIZE = 50;

// ================================================================
// INIT
// ================================================================
async function init() {
    setTheme(getStoredTheme());

    _profile = await requireAuth('admin');
    if (!_profile) return;

    renderSidebar('audit', _profile);
    renderHeader(_profile, 'Auditoria', 'Registro completo de ações na plataforma');

    document.getElementById('page-content').innerHTML = buildLayout();

    await loadLogs(true);
    renderLogs();
    setupListeners();

    document.getElementById('app-loading').style.display = 'none';
    document.getElementById('app').style.display = 'flex';
    window.renderIcons?.();
}

// ================================================================
// LAYOUT
// ================================================================
function buildLayout() {
    const actionGroups = {
        'Tarefas': ['TASK_CREATED', 'TASK_UPDATED', 'TASK_STATUS_CHANGED', 'TASK_DELETED'],
        'Chamados': ['TICKET_CREATED', 'TICKET_STATUS_CHANGED', 'TICKET_UPDATED'],
        'Eventos': ['EVENT_CREATED', 'EVENT_UPDATED', 'EVENT_DELETED'],
        'Rotinas': ['ROUTINE_CREATED', 'ROUTINE_UPDATED'],
        'Comunicados': ['ANNOUNCEMENT_CREATED', 'ANNOUNCEMENT_UPDATED'],
        'Membros': ['USER_CREATED', 'USER_UPDATED', 'USER_DEACTIVATED'],
        'Autenticação': ['USER_LOGIN', 'USER_LOGOUT', 'USER_LOGIN_FAILED'],
        'Relatórios': ['REPORT_SUBMITTED'],
    };

    return `
    <div class="page-header">
      <div class="page-header-left">
        <h2>Log de Auditoria</h2>
        <p>Registro completo e imutável de todas as ações</p>
      </div>
      <div class="page-header-actions">
        <button class="btn btn-secondary btn-sm" onclick="window._exportLogs()">
          <i data-fa-icon="download"></i> Exportar CSV
        </button>
      </div>
    </div>

    <!-- Filtros -->
    <div class="card mb-4" style="padding:16px 20px">
      <div style="display:flex;flex-wrap:wrap;gap:12px;align-items:flex-end">
        <div>
          <label class="form-label">Ação</label>
          <select id="audit-filter-action" class="form-select" style="width:220px" onchange="window._applyFilters()">
            <option value="">Todas as ações</option>
            ${Object.entries(actionGroups).map(([group, actions]) => `
              <optgroup label="${group}">
                ${actions.map(a => `<option value="${a}">${a.replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, c => c.toUpperCase())}</option>`).join('')}
              </optgroup>`).join('')}
          </select>
        </div>
        <div>
          <label class="form-label">Data inicial</label>
          <input type="date" id="audit-date-from" class="form-input" onchange="window._applyFilters()">
        </div>
        <div>
          <label class="form-label">Data final</label>
          <input type="date" id="audit-date-to" class="form-input" onchange="window._applyFilters()">
        </div>
        <button class="btn btn-ghost btn-sm" onclick="window._clearFilters()">
          <i data-fa-icon="x"></i> Limpar
        </button>
      </div>
    </div>

    <!-- Stats bar -->
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px">
      <span id="audit-count" style="font-size:13px;color:var(--text-muted)">Carregando...</span>
    </div>

    <!-- Logs Table -->
    <div id="audit-container">
      <div class="page-loader"><div class="spinner"></div></div>
    </div>

    <div id="load-more-wrapper" style="text-align:center;padding:20px;display:none">
      <button class="btn btn-secondary" id="btn-load-more" onclick="window._loadMore()">
        <i data-fa-icon="refresh-cw"></i> Carregar mais
      </button>
    </div>`;
}

function setupListeners() { }

// ================================================================
// CARREGAR LOGS
// ================================================================
async function loadLogs(reset = false) {
    if (reset) {
        _logs = [];
        _lastDoc = null;
        _hasMore = true;
    }
    if (!_hasMore) return;

    try {
        const constraints = [orderBy('createdAt', 'desc'), limit(PAGE_SIZE)];

        const actionFilter = document.getElementById('audit-filter-action')?.value || '';
        const dateFrom = document.getElementById('audit-date-from')?.value || '';
        const dateTo = document.getElementById('audit-date-to')?.value || '';

        if (actionFilter) constraints.unshift(where('action', '==', actionFilter));
        if (dateFrom) constraints.unshift(where('createdAt', '>=', Timestamp.fromDate(new Date(dateFrom + 'T00:00:00'))));
        if (dateTo) constraints.unshift(where('createdAt', '<=', Timestamp.fromDate(new Date(dateTo + 'T23:59:59'))));

        if (_lastDoc) constraints.push(startAfter(_lastDoc));

        const snap = await getDocs(query(collection(db, 'auditLogs'), ...constraints));
        const docs = snap.docs;

        if (docs.length < PAGE_SIZE) _hasMore = false;
        _lastDoc = docs[docs.length - 1] || _lastDoc;

        const newLogs = docs.map(d => ({ id: d.id, ...d.data() }));
        _logs = reset ? newLogs : [..._logs, ...newLogs];
    } catch (e) {
        console.error('[Audit] Load error:', e);
        toast.error('Erro', 'Não foi possível carregar os logs.');
    }
}

window._applyFilters = function () {
    loadLogs(true).then(() => renderLogs());
};

window._clearFilters = function () {
    document.getElementById('audit-filter-action').value = '';
    document.getElementById('audit-date-from').value = '';
    document.getElementById('audit-date-to').value = '';
    window._applyFilters();
};

window._loadMore = async function () {
    const btn = document.getElementById('btn-load-more');
    if (btn) { btn.disabled = true; btn.textContent = 'Carregando...'; }
    await loadLogs(false);
    renderLogs();
    if (btn) { btn.disabled = false; btn.innerHTML = '<i data-fa-icon="refresh-cw"></i> Carregar mais'; window.renderIcons?.(); }
};

// ================================================================
// RENDER
// ================================================================
function renderLogs() {
    const container = document.getElementById('audit-container');
    if (!container) return;

    const countEl = document.getElementById('audit-count');
    if (countEl) countEl.textContent = `${_logs.length} registro(s) exibido(s)${_hasMore ? ' (há mais)' : ''}`;

    const lmWrapper = document.getElementById('load-more-wrapper');
    if (lmWrapper) lmWrapper.style.display = _hasMore ? 'block' : 'none';

    if (_logs.length === 0) {
        container.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon"><i data-fa-icon="shield-check"></i></div>
        <h3>Nenhum log encontrado</h3>
        <p>Não há registros de auditoria com os filtros aplicados.</p>
      </div>`;
        window.renderIcons?.(); return;
    }

    const ACTION_ICONS = {
        TASK_CREATED: 'plus', TASK_UPDATED: 'edit-2', TASK_STATUS_CHANGED: 'move-right',
        TASK_DELETED: 'trash-2', TICKET_CREATED: 'ticket', TICKET_STATUS_CHANGED: 'arrow-right',
        EVENT_CREATED: 'calendar-plus', EVENT_DELETED: 'calendar-x',
        ROUTINE_CREATED: 'repeat', ANNOUNCEMENT_CREATED: 'megaphone',
        USER_CREATED: 'user-plus', USER_UPDATED: 'user-cog', USER_DEACTIVATED: 'user-x',
        USER_LOGIN: 'log-in', USER_LOGOUT: 'log-out', USER_LOGIN_FAILED: 'shield-x',
        REPORT_SUBMITTED: 'file-check',
    };

    const ACTION_STYLES = {
        TASK_DELETED: 'color:var(--color-danger)', USER_DEACTIVATED: 'color:var(--color-danger)',
        USER_LOGIN: 'color:var(--color-success)', USER_LOGOUT: 'color:var(--text-muted)',
        USER_LOGIN_FAILED: 'color:var(--color-danger)',
        TASK_STATUS_CHANGED: 'color:var(--color-primary)', TICKET_STATUS_CHANGED: 'color:var(--color-primary)',
    };

    container.innerHTML = `
    <div class="table-wrapper">
      <table class="table">
        <thead>
          <tr>
            <th>Ação</th>
            <th>Usuário</th>
            <th>Alvo</th>
            <th>Detalhes</th>
            <th>Data/Hora</th>
          </tr>
        </thead>
        <tbody>
          ${_logs.map(log => {
        const icon = ACTION_ICONS[log.action] || 'activity';
        const style = ACTION_STYLES[log.action] || 'color:var(--text-secondary)';
        const actionLabel = (log.action || '').replace(/_/g, ' ');
        const details = formatDetails(log.details);

        return `
              <tr>
                <td>
                  <div style="display:flex;align-items:center;gap:8px;${style}">
                    <i data-fa-icon="${icon}" style="width:14px;height:14px;flex-shrink:0"></i>
                    <span style="font-size:12px;font-weight:600;text-transform:lowercase">${actionLabel.toLowerCase().replace(/\b\w/g, c => c.toUpperCase())}</span>
                  </div>
                </td>
                <td>
                  <div style="display:flex;align-items:center;gap:8px">
                    <div class="assignee-avatar-sm" style="background:${stringToColor(log.userName || '')};flex-shrink:0">${getInitials(log.userName || '?')}</div>
                    <div>
                      <div style="font-size:12px;font-weight:600">${escapeHtml(log.userName || 'Sistema')}</div>
                    </div>
                  </div>
                </td>
                <td>
                  <div style="font-size:12px;color:var(--text-secondary)">
                    ${log.targetType ? `<span class="badge badge-gray">${log.targetType}</span>` : '—'}
                  </div>
                </td>
                <td>
                  <div style="font-size:12px;color:var(--text-secondary);max-width:250px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${escapeHtml(details)}">
                    ${details || '—'}
                  </div>
                </td>
                <td>
                  <div style="font-size:12px;color:var(--text-muted)" title="${formatDate(log.createdAt, 'long')}">
                    ${formatRelative(log.createdAt)}
                  </div>
                </td>
              </tr>`;
    }).join('')}
        </tbody>
      </table>
    </div>`;
    window.renderIcons?.();
}

function formatDetails(details) {
    if (!details) return '';
    if (typeof details === 'string') return escapeHtml(details);
    const parts = [];
    Object.entries(details).forEach(([k, v]) => {
        if (v !== undefined && v !== null && v !== '') {
            parts.push(`${k}: ${String(v)}`);
        }
    });
    return escapeHtml(parts.join(' · '));
}

// ================================================================
// EXPORT CSV
// ================================================================
window._exportLogs = function () {
    if (_logs.length === 0) { toast.warning('Vazio', 'Não há logs para exportar.'); return; }

    const headers = ['Data/Hora', 'Ação', 'Usuário', 'Tipo Alvo', 'ID Alvo', 'Detalhes'];
    const rows = _logs.map(log => [
        formatDate(log.createdAt, 'timeline'),
        log.action || '',
        log.userName || '',
        log.targetType || '',
        log.targetId || '',
        formatDetails(log.details) || '',
    ].map(v => `"${String(v).replace(/"/g, '""')}"`));

    const csv = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `nexus-audit-${new Date().toISOString().split('T')[0]}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    toast.success('Exportado', 'Log de auditoria exportado em CSV.');
};

init().catch(e => { console.error(e); toast.error('Erro', 'Falha ao carregar módulo de auditoria.'); });
