/* ================================================================
   NEXUS — Reports Module
   Relatório diário de atividades por usuário.
   ================================================================ */

import { requireAuth } from '/services/auth.service.js';
import { db } from '/services/firebase-config.js';
import {
    collection, doc, query, where, orderBy, getDocs,
    addDoc, updateDoc, serverTimestamp, Timestamp
} from 'firebase/firestore';
import { renderSidebar } from '/components/sidebar.js';
import { renderHeader } from '/components/header.js';
import { toast } from '/components/toast.js';
import { sanitizeText } from '/utils/sanitizer.js';
import { formatDate, todayString } from '/utils/date-utils.js';
import {
    escapeHtml, uid as genUid, getInitials, stringToColor,
    getStoredTheme, setTheme, canPerformAction
} from '/utils/helpers.js';
import { logAudit, AUDIT_ACTIONS } from '/services/audit.service.js';

let _profile = null;
let _activities = [];   // atividades do dia/usuário selecionado
let _reportId = null; // ID do documento do relatório se já existir
let _selectedDate = todayString();
let _selectedUser = null; // uid do usuário sendo visualizado
let _allUsers = [];

// ================================================================
// INIT
// ================================================================
async function init() {
    setTheme(getStoredTheme());

    _profile = await requireAuth('viewer');
    if (!_profile) return;

    _selectedUser = _profile.uid;

    renderSidebar('reports', _profile);
    renderHeader(_profile, 'Relatório Diário', 'Registro de atividades');

    document.getElementById('page-content').innerHTML = buildLayout();

    if (canPerformAction(_profile, 'view_all_reports')) {
        await loadUsers();
        renderUserSelector();
    }

    await loadReport();

    document.getElementById('app-loading').style.display = 'none';
    document.getElementById('app').style.display = 'flex';
    window.renderIcons?.();
}

// ================================================================
// LAYOUT
// ================================================================
function buildLayout() {
    const isAdmin = canPerformAction(_profile, 'view_all_reports');
    return `
    <div class="page-header">
      <div class="page-header-left">
        <h2>Relatório Diário</h2>
        <p>Registre as atividades do dia</p>
      </div>
    </div>

    <!-- Filtros -->
    <div class="card mb-6" style="padding:16px 20px">
      <div style="display:flex;flex-wrap:wrap;gap:12px;align-items:flex-end">
        <div>
          <label class="form-label">Data</label>
          <input type="date" id="report-date" class="form-input" value="${todayString()}" max="${todayString()}"
                 style="width:180px" onchange="window._onDateChange()">
        </div>
        ${isAdmin ? `
          <div>
            <label class="form-label">Usuário</label>
            <select id="report-user" class="form-select" style="width:220px" onchange="window._onUserChange()">
              <option value="${_profile.uid}">${escapeHtml(_profile.name)} (você)</option>
            </select>
          </div>` : ''}
        <button class="btn btn-secondary btn-sm" onclick="window._loadReport()">
          <i data-fa-icon="refresh-cw"></i> Atualizar
        </button>
      </div>
    </div>

    <!-- Resumo do dia -->
    <div style="display:grid;grid-template-columns:2fr 1fr;gap:20px;align-items:start" id="report-main">
      <!-- Atividades -->
      <div>
        <div class="card">
          <div class="card-header">
            <div>
              <h3>Atividades</h3>
              <p id="report-total-time" style="font-size:12px;color:var(--text-muted)">Carregando...</p>
            </div>
            <button class="btn btn-primary btn-sm" id="btn-add-activity" onclick="window._addActivity()" style="display:none">
              <i data-fa-icon="plus"></i> Adicionar
            </button>
          </div>
          <div id="activities-list">
            <div class="page-loader"><div class="spinner"></div></div>
          </div>
          <div id="report-save-bar" style="display:none;padding:16px 20px;border-top:1px solid var(--border-light);display:flex;justify-content:flex-end;gap:8px">
            <button class="btn btn-primary" id="btn-save-report" onclick="window._saveReport()">
              <i data-fa-icon="save"></i> Salvar Relatório
            </button>
          </div>
        </div>
      </div>

      <!-- Resumo / Estatísticas -->
      <div>
        <div class="card">
          <div class="card-header"><h3>Resumo</h3></div>
          <div class="card-body" id="report-summary">
            <div class="page-loader"><div class="spinner"></div></div>
          </div>
        </div>
      </div>
    </div>`;
}

// ================================================================
// USUÁRIOS (para admins/editors)
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

function renderUserSelector() {
    const sel = document.getElementById('report-user');
    if (!sel) return;
    sel.innerHTML = `<option value="${_profile.uid}">${escapeHtml(_profile.name)} (você)</option>` +
        _allUsers.filter(u => u.id !== _profile.uid).map(u =>
            `<option value="${u.id}">${escapeHtml(u.name)}</option>`
        ).join('');
}

window._onUserChange = function () {
    _selectedUser = document.getElementById('report-user')?.value || _profile.uid;
    loadReport();
};

window._onDateChange = function () {
    _selectedDate = document.getElementById('report-date')?.value || todayString();
    loadReport();
};

window._loadReport = function () { loadReport(); };

// ================================================================
// CARREGAR RELATÓRIO
// ================================================================
async function loadReport() {
    _activities = [];
    _reportId = null;

    try {
        const snap = await getDocs(query(
            collection(db, 'dailyReports'),
            where('userId', '==', _selectedUser),
            where('date', '==', _selectedDate)
        ));

        if (!snap.empty) {
            const report = snap.docs[0];
            _reportId = report.id;
            _activities = (report.data().activities || []).map(a => ({ ...a, _isNew: false }));
        }
    } catch (e) {
        console.error('[Reports] Load error:', e);
    }

    renderActivities();
    renderSummary();

    const isOwnReport = _selectedUser === _profile.uid;
    const canEdit = isOwnReport || canPerformAction(_profile, 'edit_all_reports');
    const addBtn = document.getElementById('btn-add-activity');
    if (addBtn) addBtn.style.display = canEdit ? 'inline-flex' : 'none';
    const saveBar = document.getElementById('report-save-bar');
    if (saveBar) saveBar.style.display = canEdit ? 'flex' : 'none';
}

// ================================================================
// RENDER ACTIVITIES
// ================================================================
function renderActivities() {
    const container = document.getElementById('activities-list');
    if (!container) return;

    const isOwnReport = _selectedUser === _profile.uid;
    const canEdit = isOwnReport || canPerformAction(_profile, 'edit_all_reports');

    if (_activities.length === 0) {
        container.innerHTML = `
      <div style="padding:32px;text-align:center">
        <i data-fa-icon="clipboard" style="width:32px;height:32px;opacity:0.3;display:block;margin:0 auto 12px"></i>
        <p style="color:var(--text-muted);font-size:13px">Nenhuma atividade registrada para este dia.</p>
        ${canEdit ? `<button class="btn btn-primary btn-sm mt-3" onclick="window._addActivity()">
          <i data-fa-icon="plus"></i> Adicionar primeira atividade
        </button>` : ''}
      </div>`;
        window.renderIcons?.(); return;
    }

    container.innerHTML = `
    <div>
      ${_activities.map((act, idx) => buildActivityRow(act, idx, canEdit)).join('')}
    </div>`;
    window.renderIcons?.();
}

function buildActivityRow(act, idx, canEdit) {
    const duration = calcDuration(act.startTime, act.endTime);
    return `
    <div class="activity-row" data-idx="${idx}" style="display:grid;grid-template-columns:90px 90px 1fr auto;gap:12px;padding:12px 20px;border-bottom:1px solid var(--border-light);align-items:center">
      ${canEdit ? `
        <input type="time" class="form-input form-input-sm act-start" value="${act.startTime || ''}"
               onchange="window._actChange(${idx},'startTime',this.value)">
        <input type="time" class="form-input form-input-sm act-end" value="${act.endTime || ''}"
               onchange="window._actChange(${idx},'endTime',this.value)">
        <input type="text" class="form-input form-input-sm act-desc" value="${escapeHtml(act.description || '')}"
               placeholder="Descrição da atividade..." maxlength="500"
               onchange="window._actChange(${idx},'description',this.value)">
        <div style="display:flex;align-items:center;gap:8px">
          <span style="font-size:11px;color:var(--text-muted);white-space:nowrap">${duration}</span>
          <button class="btn btn-ghost btn-xs danger" onclick="window._removeActivity(${idx})">
            <i data-fa-icon="trash-2" style="width:12px;height:12px"></i>
          </button>
        </div>` : `
        <span style="font-size:13px;color:var(--text-secondary)">${act.startTime || '—'}</span>
        <span style="font-size:13px;color:var(--text-secondary)">${act.endTime || '—'}</span>
        <span style="font-size:13px;color:var(--text-primary)">${escapeHtml(act.description || '')}</span>
        <span style="font-size:12px;color:var(--text-muted)">${duration}</span>`}
    </div>`;
}

function calcDuration(start, end) {
    if (!start || !end) return '—';
    const [sh, sm] = start.split(':').map(Number);
    const [eh, em] = end.split(':').map(Number);
    const mins = (eh * 60 + em) - (sh * 60 + sm);
    if (mins <= 0) return '—';
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    return h > 0 ? `${h}h${m.toString().padStart(2, '0')}` : `${m}min`;
}

function calcTotalMinutes() {
    return _activities.reduce((acc, act) => {
        if (!act.startTime || !act.endTime) return acc;
        const [sh, sm] = act.startTime.split(':').map(Number);
        const [eh, em] = act.endTime.split(':').map(Number);
        const mins = (eh * 60 + em) - (sh * 60 + sm);
        return acc + Math.max(0, mins);
    }, 0);
}

function renderSummary() {
    const container = document.getElementById('report-summary');
    if (!container) return;

    const total = calcTotalMinutes();
    const h = Math.floor(total / 60);
    const m = total % 60;
    const formatted = total > 0 ? `${h}h ${m.toString().padStart(2, '0')}min` : '—';

    // Update total time label
    const totalEl = document.getElementById('report-total-time');
    if (totalEl) totalEl.textContent = `${_activities.length} atividade(s) · ${formatted} total`;

    const userName = _allUsers.find(u => u.id === _selectedUser)?.name || _profile.name;

    container.innerHTML = `
    <div style="display:flex;flex-direction:column;gap:12px">
      <div class="stat-card" style="padding:16px;background:var(--color-primary-light);border:1px solid var(--color-primary-border)">
        <div style="font-size:28px;font-weight:800;color:var(--color-primary)">${formatted}</div>
        <div style="font-size:12px;color:var(--text-secondary);margin-top:4px">Total trabalhado</div>
      </div>
      <div style="font-size:13px;color:var(--text-secondary);background:var(--n-50);border-radius:10px;padding:12px;border:1px solid var(--border-light)">
        <div><strong>Data:</strong> ${_selectedDate ? formatDate(Timestamp.fromDate(new Date(_selectedDate + 'T12:00:00')), 'long') : '—'}</div>
        <div style="margin-top:4px"><strong>Colaborador:</strong> ${escapeHtml(userName)}</div>
        <div style="margin-top:4px"><strong>Atividades:</strong> ${_activities.length}</div>
        ${_reportId ? `<div style="margin-top:8px">
          <span class="badge badge-success"><i data-fa-icon="check" style="width:10px;height:10px;display:inline-block;vertical-align:middle"></i> Salvo</span>
        </div>` : ''}
      </div>
    </div>`;
    window.renderIcons?.();
}

// ================================================================
// EDIÇÃO DE ATIVIDADES
// ================================================================
window._addActivity = function () {
    _activities.push({ id: genUid(), startTime: '', endTime: '', description: '', _isNew: true });
    renderActivities();
    renderSummary();
};

window._removeActivity = function (idx) {
    _activities.splice(idx, 1);
    renderActivities();
    renderSummary();
};

window._actChange = function (idx, field, value) {
    if (!_activities[idx]) return;
    _activities[idx][field] = field === 'description' ? sanitizeText(value) : value;
    renderSummary(); // refresh totals
};

// ================================================================
// SALVAR RELATÓRIO
// ================================================================
window._saveReport = async function () {
    // Validate activities
    const validActs = _activities.filter(a => a.description?.trim());
    if (validActs.length === 0) {
        toast.warning('Vazio', 'Adicione pelo menos uma atividade com descrição.');
        return;
    }

    const clean = validActs.map(({ id, startTime, endTime, description }) => ({
        id: id || genUid(), startTime, endTime, description: sanitizeText(description)
    }));

    const totalMinutes = calcTotalMinutes();
    const btn = document.getElementById('btn-save-report');
    if (btn) btn.disabled = true;

    try {
        if (_reportId) {
            await updateDoc(doc(db, 'dailyReports', _reportId), {
                activities: clean, totalMinutes, updatedAt: serverTimestamp()
            });
        } else {
            const ndoc = await addDoc(collection(db, 'dailyReports'), {
                userId: _selectedUser,
                userName: _allUsers.find(u => u.id === _selectedUser)?.name || _profile.name,
                date: _selectedDate,
                activities: clean, totalMinutes,
                createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
            });
            _reportId = ndoc.id;
            await logAudit(AUDIT_ACTIONS.REPORT_SUBMITTED, ndoc.id, 'dailyReport', { date: _selectedDate });
        }
        _activities = clean;
        toast.success('Salvo', 'Relatório salvo com sucesso.');
        renderSummary();
    } catch (e) {
        console.error('[Reports] Save error:', e);
        toast.error('Erro', 'Não foi possível salvar o relatório.');
    } finally {
        if (btn) btn.disabled = false;
    }
};

init().catch(e => { console.error(e); toast.error('Erro', 'Falha ao carregar módulo de relatórios.'); });
