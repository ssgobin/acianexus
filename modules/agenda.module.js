/* ================================================================
   NEXUS — Agenda Module
   Calendário de eventos com visão mensal e lista.
   ================================================================ */

import { requireAuth } from '/services/auth.service.js';
import { db } from '/services/firebase-config.js';
import {
    collection, doc, query, where, orderBy, getDocs, addDoc,
    updateDoc, deleteDoc, serverTimestamp, Timestamp
} from 'firebase/firestore';
import { renderSidebar } from '/components/sidebar.js';
import { renderHeader } from '/components/header.js';
import { createModal, openModal, closeModal, confirmDialog } from '/components/modal.js';
import { toast } from '/components/toast.js';
import { sanitizeText } from '/utils/sanitizer.js';
import { formatDate, tsToDate, todayString } from '/utils/date-utils.js';
import {
    escapeHtml, getInitials, stringToColor, getStoredTheme, setTheme,
    canPerformAction, EVENT_STATUS_LABELS
} from '/utils/helpers.js';
import { logAudit, AUDIT_ACTIONS } from '/services/audit.service.js';

let _profile = null;
let _events = [];
let _allUsers = [];
let _editingId = null;
let _viewMode = 'calendar';   // 'calendar' | 'list'
let _calMonth = new Date();   // mês atual exibido

_calMonth.setDate(1);
_calMonth.setHours(0, 0, 0, 0);

// ================================================================
// INIT
// ================================================================
async function init() {
    setTheme(getStoredTheme());

    _profile = await requireAuth('viewer');
    if (!_profile) return;

    renderSidebar('agenda', _profile);
    renderHeader(_profile, 'Agenda', 'Eventos e compromissos');

    document.getElementById('page-content').innerHTML = buildLayout();

    await Promise.all([loadUsers(), loadEvents()]);
    renderView();
    setupListeners();
    createEventModal();
    maybeOpenCreateEventFromQuery();

    document.getElementById('app-loading').style.display = 'none';
    document.getElementById('app').style.display = 'flex';
    window.renderIcons?.();
}

// ================================================================
// LAYOUT
// ================================================================
function buildLayout() {
    const canEdit = canPerformAction(_profile, 'edit_task');
    return `
    <div class="page-header">
      <div class="page-header-left">
        <h2>Agenda</h2>
        <p>Eventos, reuniões e compromissos</p>
      </div>
      <div class="page-header-actions" style="display:flex;gap:8px">
        <div class="btn-group">
          <button class="btn btn-secondary btn-sm active" id="btn-cal-view" onclick="window._setView('calendar')">
            <i data-fa-icon="calendar"></i>
          </button>
          <button class="btn btn-secondary btn-sm" id="btn-list-view" onclick="window._setView('list')">
            <i data-fa-icon="list"></i>
          </button>
        </div>
        ${canEdit ? `<button class="btn btn-primary" onclick="window._openCreateEvent()">
          <i data-fa-icon="plus"></i> Novo Evento
        </button>` : ''}
      </div>
    </div>

    <!-- Calendar nav -->
    <div id="calendar-nav" style="display:flex;align-items:center;gap:12px;margin-bottom:20px">
      <button class="btn btn-ghost btn-sm" onclick="window._prevMonth()">
        <i data-fa-icon="chevron-left"></i>
      </button>
      <h3 id="cal-month-label" style="font-size:16px;font-weight:700;min-width:160px;text-align:center"></h3>
      <button class="btn btn-ghost btn-sm" onclick="window._nextMonth()">
        <i data-fa-icon="chevron-right"></i>
      </button>
      <button class="btn btn-ghost btn-sm" onclick="window._goToday()">Hoje</button>
    </div>

    <!-- View Container -->
    <div id="view-container"></div>`;
}

function setupListeners() { }

function maybeOpenCreateEventFromQuery() {
    const params = new URLSearchParams(window.location.search);
    if (params.get('create') !== '1') return;
    if (!canPerformAction(_profile, 'edit_task')) return;
    window._openCreateEvent();
}

// ================================================================
// CARREGAR DADOS
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

async function loadEvents() {
    try {
        const snap = await getDocs(query(collection(db, 'events'), orderBy('eventDate', 'asc')));
        _events = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    } catch (e) {
        console.error('[Agenda] Load events error:', e);
        _events = [];
    }
}

// ================================================================
// VIEW SWITCHING
// ================================================================
window._setView = function (mode) {
    _viewMode = mode;
    document.getElementById('btn-cal-view')?.classList.toggle('active', mode === 'calendar');
    document.getElementById('btn-list-view')?.classList.toggle('active', mode === 'list');
    renderView();
};

window._prevMonth = function () {
    _calMonth = new Date(_calMonth.getFullYear(), _calMonth.getMonth() - 1, 1);
    renderView();
};
window._nextMonth = function () {
    _calMonth = new Date(_calMonth.getFullYear(), _calMonth.getMonth() + 1, 1);
    renderView();
};
window._goToday = function () {
    _calMonth = new Date();
    _calMonth.setDate(1);
    _calMonth.setHours(0, 0, 0, 0);
    renderView();
};

function renderView() {
    updateCalLabel();
    if (_viewMode === 'calendar') renderCalendar();
    else renderList();
    window.renderIcons?.();
}

function updateCalLabel() {
    const label = _calMonth.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
    const el = document.getElementById('cal-month-label');
    if (el) el.textContent = label[0].toUpperCase() + label.slice(1);
}

// ================================================================
// CALENDAR VIEW
// ================================================================
function renderCalendar() {
    const container = document.getElementById('view-container');
    if (!container) return;

    const year = _calMonth.getFullYear();
    const month = _calMonth.getMonth();
    const firstDay = new Date(year, month, 1).getDay(); // 0=sun
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const today = new Date(); today.setHours(0, 0, 0, 0);

    // Group events by date string YYYY-MM-DD
    const byDay = {};
    _events.forEach(ev => {
        if (!ev.eventDate) return;
        const d = tsToDate(ev.eventDate);
        if (!d) return;
        const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
        if (!byDay[key]) byDay[key] = [];
        byDay[key].push(ev);
    });

    const DAY_LABELS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

    let html = `
    <div class="calendar-grid-wrap" style="overflow:auto;-webkit-overflow-scrolling:touch">
    <div class="calendar-grid" style="display:grid;grid-template-columns:repeat(7,minmax(100px,1fr));gap:2px;min-width:700px">
      ${DAY_LABELS.map(d => `<div class="cal-header-cell">${d}</div>`).join('')}`;

    // Empty cells before first day
    for (let i = 0; i < firstDay; i++) html += `<div class="cal-cell empty"></div>`;

    for (let day = 1; day <= daysInMonth; day++) {
        const dateKey = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
        const dayEvents = byDay[dateKey] || [];
        const isToday = new Date(year, month, day).getTime() === today.getTime();
        const isPast = new Date(year, month, day) < today;

        html += `
      <div class="cal-cell${isToday ? ' today' : ''}${isPast ? ' past' : ''}" onclick="window._onDayClick('${dateKey}')">
        <div class="cal-cell-num">${day}</div>
        <div class="cal-cell-events">
          ${dayEvents.slice(0, 3).map(ev => `
            <div class="cal-event-chip" title="${escapeHtml(ev.title)}" onclick="event.stopPropagation();window._openEventDetail('${ev.id}')">
              ${escapeHtml(ev.title.length > 18 ? ev.title.slice(0, 18) + '…' : ev.title)}
            </div>`).join('')}
          ${dayEvents.length > 3 ? `<div class="cal-event-more">+${dayEvents.length - 3} mais</div>` : ''}
        </div>
      </div>`;
    }

    html += `</div></div>`;
    container.innerHTML = html;
}

window._onDayClick = function (dateKey) {
    if (canPerformAction(_profile, 'edit_task')) {
        window._openCreateEvent(dateKey);
    }
};

// ================================================================
// LIST VIEW
// ================================================================
function renderList() {
    const container = document.getElementById('view-container');
    if (!container) return;

    const year = _calMonth.getFullYear();
    const month = _calMonth.getMonth();

    const monthEvents = _events.filter(ev => {
        const d = tsToDate(ev.eventDate);
        return d && d.getFullYear() === year && d.getMonth() === month;
    }).sort((a, b) => tsToDate(a.eventDate) - tsToDate(b.eventDate));

    if (monthEvents.length === 0) {
        container.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon"><i data-fa-icon="calendar"></i></div>
        <h3>Nenhum evento neste mês</h3>
        ${canPerformAction(_profile, 'edit_task') ? `<button class="btn btn-primary" onclick="window._openCreateEvent()">
          <i data-fa-icon="plus"></i> Novo Evento
        </button>` : ''}
      </div>`;
        window.renderIcons?.();
        return;
    }

    const STATUS_COLOR = { scheduled: 'var(--color-info)', confirmed: 'var(--color-success)', cancelled: 'var(--color-danger)', completed: 'var(--text-muted)' };

    container.innerHTML = `
    <div style="display:flex;flex-direction:column;gap:8px">
      ${monthEvents.map(ev => {
        const d = tsToDate(ev.eventDate);
        const dateFmt = d ? d.toLocaleDateString('pt-BR', { weekday: 'short', day: 'numeric', month: 'short' }) : '—';
        const sColor = STATUS_COLOR[ev.status] || 'var(--text-muted)';
        const canEdit = canPerformAction(_profile, 'edit_task');

        return `
          <div class="card" style="padding:16px;display:flex;align-items:center;gap:16px;cursor:pointer"
               onclick="window._openEventDetail('${ev.id}')">
            <div style="width:4px;height:48px;background:${sColor};border-radius:4px;flex-shrink:0"></div>
            <div style="flex:1;min-width:0">
              <div style="font-weight:600;color:var(--text-primary)">${escapeHtml(ev.title)}</div>
              <div style="font-size:12px;color:var(--text-muted);margin-top:4px;display:flex;gap:12px;flex-wrap:wrap">
                <span><i data-fa-icon="calendar" style="width:12px;height:12px;display:inline-block;vertical-align:middle;margin-right:2px"></i>${dateFmt}</span>
                ${ev.startTime ? `<span><i data-fa-icon="clock" style="width:12px;height:12px;display:inline-block;vertical-align:middle;margin-right:2px"></i>${ev.startTime}${ev.endTime ? ' – ' + ev.endTime : ''}</span>` : ''}
                ${ev.location ? `<span><i data-fa-icon="map-pin" style="width:12px;height:12px;display:inline-block;vertical-align:middle;margin-right:2px"></i>${escapeHtml(ev.location)}</span>` : ''}
              </div>
            </div>
            <div style="display:flex;align-items:center;gap:8px">
              <span class="status-chip status-${ev.status}"><span class="status-dot"></span>${EVENT_STATUS_LABELS[ev.status] || ev.status}</span>
              ${canEdit ? `<button class="btn btn-ghost btn-xs" onclick="event.stopPropagation();window._editEvent('${ev.id}')">
                <i data-fa-icon="edit-2" style="width:13px;height:13px"></i>
              </button>` : ''}
            </div>
          </div>`;
    }).join('')}
    </div>`;
    window.renderIcons?.();
}

// ================================================================
// MODAL EVENTO
// ================================================================
function createEventModal() {
    createModal({
        id: 'modal-event',
        title: 'Novo Evento',
        size: 'lg',
        body: `
      <form id="form-event" class="form-grid" novalidate>
        <div class="form-group form-col-full">
          <label class="form-label">Título *</label>
          <input type="text" id="ev-title" class="form-input" maxlength="200" required>
        </div>
        <div class="form-group">
          <label class="form-label">Data *</label>
          <input type="date" id="ev-date" class="form-input" required>
        </div>
        <div class="form-group">
          <label class="form-label">Status</label>
          <select id="ev-status" class="form-select">
            ${Object.entries(EVENT_STATUS_LABELS).map(([k, v]) => `<option value="${k}">${v}</option>`).join('')}
          </select>
        </div>
        <div class="form-group">
          <label class="form-label">Hora Início</label>
          <input type="time" id="ev-start" class="form-input">
        </div>
        <div class="form-group">
          <label class="form-label">Hora Fim</label>
          <input type="time" id="ev-end" class="form-input">
        </div>
        <div class="form-group form-col-full">
          <label class="form-label">Local</label>
          <input type="text" id="ev-location" class="form-input" maxlength="200" placeholder="Sala, endereço...">
        </div>
        <div class="form-group">
          <label class="form-label">Empresa / Associado</label>
          <input type="text" id="ev-company" class="form-input" maxlength="200">
        </div>
        <div class="form-group">
          <label class="form-label">Código do Associado</label>
          <input type="text" id="ev-assoc-code" class="form-input" maxlength="50">
        </div>
        <div class="form-group">
          <label class="form-label">Sala</label>
          <input type="text" id="ev-room" class="form-input" maxlength="100">
        </div>
        <div class="form-group">
          <label class="form-label">Nº de Pessoas</label>
          <input type="number" id="ev-people" class="form-input" min="0" value="0">
        </div>
        <div class="form-group form-col-full">
          <label style="display:flex;align-items:center;gap:8px;cursor:pointer;font-size:13px">
            <input type="checkbox" id="ev-coffee" class="form-checkbox"> Necessita coffee break / coffe service
          </label>
        </div>
        <div class="form-group form-col-full">
          <label class="form-label">Responsável</label>
          <input type="hidden" id="ev-responsible" value="">
          <div id="ev-responsible-container" class="involved-container" onclick="window._openResponsiblePicker()">
            <span class="involved-placeholder">Clique para selecionar responsável...</span>
          </div>
        </div>
        <div class="form-group form-col-full">
          <label class="form-label">Descrição / Observações</label>
          <textarea id="ev-notes" class="form-textarea" rows="3"></textarea>
        </div>
      </form>`,
        footer: `
      <button class="btn btn-secondary" onclick="closeModal('modal-event')">Cancelar</button>
      <button class="btn btn-danger btn-sm" id="btn-del-event" style="margin-right:auto;display:none" onclick="window._deleteEvent()">
        <i data-fa-icon="trash-2"></i>
      </button>
      <button class="btn btn-primary" id="btn-save-event" onclick="window._saveEvent()">
        <i data-fa-icon="save"></i> Salvar
      </button>`,
    });
}

window._openCreateEvent = function (dateKey = null) {
    if (!canPerformAction(_profile, 'edit_task')) {
        toast.warning('Sem permissão', 'Você precisa ser editor ou admin.'); return;
    }
    if (!document.getElementById('modal-event')) createEventModal();
    _editingId = null;
    document.getElementById('form-event')?.reset();
    if (dateKey) document.getElementById('ev-date').value = dateKey;
    document.getElementById('ev-status').value = 'scheduled';
    const titleEl = document.querySelector('#modal-event .modal-title');
    if (titleEl) titleEl.textContent = 'Novo Evento';
    document.getElementById('btn-del-event').style.display = 'none';
    openModal('modal-event');
    window.renderIcons?.();
};
// Ensure modal exists before any DOM access
if (!document.getElementById('modal-event')) createEventModal();

window._openEventDetail = function (id) {
    window._editEvent(id);
};

window._editEvent = function (id) {
    const ev = _events.find(e => e.id === id);
    if (!ev) return;
    if (!canPerformAction(_profile, 'edit_task')) {
        // View only
        return;
    }
    _editingId = id;

    const d = tsToDate(ev.eventDate);
    const dateStr = d ? d.toISOString().split('T')[0] : '';

    setTimeout(() => {
        const set = (k, v) => { const el = document.getElementById(k); if (el && v !== undefined && v !== null) el.value = v; };
        set('ev-title', ev.title);
        set('ev-date', dateStr);
        set('ev-status', ev.status || 'scheduled');
        set('ev-start', ev.startTime || '');
        set('ev-end', ev.endTime || '');
        set('ev-location', ev.location || '');
        set('ev-company', ev.company || '');
        set('ev-assoc-code', ev.associateCode || '');
        set('ev-room', ev.room || '');
        set('ev-people', ev.peopleCount || 0);
        set('ev-notes', ev.notes || '');
        const coffeeEl = document.getElementById('ev-coffee');
        if (coffeeEl) coffeeEl.checked = !!ev.needsCoffee;
        const respEl = document.getElementById('ev-responsible');
        if (respEl && ev.responsibleId) {
            respEl.value = ev.responsibleId;
            renderResponsibleContainer(ev.responsibleId, ev.responsibleName || '');
        }
        document.querySelector('#modal-event .modal-title').textContent = 'Editar Evento';
        document.getElementById('btn-del-event').style.display = 'inline-flex';
    }, 50);

    openModal('modal-event');
    window.renderIcons?.();
};

window._deleteEvent = async function () {
    if (!_editingId) return;
    const ev = _events.find(e => e.id === _editingId);
    const confirmed = await confirmDialog('Excluir Evento', `Tem certeza que deseja excluir "${ev?.title}"?`, 'Excluir', true);
    if (!confirmed) return;
    try {
        await deleteDoc(doc(db, 'events', _editingId));
        await logAudit(AUDIT_ACTIONS.EVENT_DELETED, _editingId, 'event', { title: ev?.title });
        toast.success('Excluído', 'Evento excluído com sucesso.');
        closeModal('modal-event');
        await loadEvents();
        renderView();
    } catch (e) {
        toast.error('Erro', 'Não foi possível excluir o evento.');
    }
};

window._saveEvent = async function () {
    const title = sanitizeText(document.getElementById('ev-title')?.value?.trim() || '');
    const dateStr = document.getElementById('ev-date')?.value || '';
    const status = document.getElementById('ev-status')?.value || 'scheduled';
    const startTime = document.getElementById('ev-start')?.value || '';
    const endTime = document.getElementById('ev-end')?.value || '';
    const location = sanitizeText(document.getElementById('ev-location')?.value?.trim() || '');
    const company = sanitizeText(document.getElementById('ev-company')?.value?.trim() || '');
    const assocCode = sanitizeText(document.getElementById('ev-assoc-code')?.value?.trim() || '');
    const room = sanitizeText(document.getElementById('ev-room')?.value?.trim() || '');
    const people = parseInt(document.getElementById('ev-people')?.value || 0);
    const notes = sanitizeText(document.getElementById('ev-notes')?.value?.trim() || '');
    const needsCoffee = document.getElementById('ev-coffee')?.checked || false;
    const responsibleId = document.getElementById('ev-responsible')?.value || '';
    const responsibleName = getUserName(responsibleId);

    if (!title) { toast.warning('Obrigatório', 'Informe o título.'); return; }
    if (!dateStr) { toast.warning('Obrigatório', 'Informe a data.'); return; }

    const eventDate = Timestamp.fromDate(new Date(dateStr + 'T12:00:00'));
    const payload = {
        title, status, startTime, endTime, location, company, associateCode: assocCode,
        room, peopleCount: people, notes, needsCoffee,
        responsibleId, responsibleName,
        eventDate, updatedAt: serverTimestamp(),
    };

    const btn = document.getElementById('btn-save-event');
    if (btn) btn.disabled = true;

    try {
        if (_editingId) {
            await updateDoc(doc(db, 'events', _editingId), payload);
            toast.success('Atualizado', 'Evento atualizado.');
        } else {
            const ndoc = await addDoc(collection(db, 'events'), {
                ...payload, createdBy: _profile.uid, createdAt: serverTimestamp()
            });
            await logAudit(AUDIT_ACTIONS.EVENT_CREATED, ndoc.id, 'event', { title });
            toast.success('Criado', 'Evento criado com sucesso.');
        }
        closeModal('modal-event');
        await loadEvents();
        renderView();
    } catch (e) {
        console.error('[Agenda] Save error:', e);
        toast.error('Erro', 'Não foi possível salvar o evento.');
    } finally {
        if (btn) btn.disabled = false;
    }
};

init().catch(e => { console.error(e); toast.error('Erro', 'Falha ao carregar módulo de agenda.'); });

// ================================================================
// RESPONSIBLE PICKER
// ================================================================
function getUserName(userId) {
    const user = _allUsers.find(u => u.id === userId);
    return user ? user.name : '';
}

window._openResponsiblePicker = function() {
    createModal({
        id: 'modal-responsible',
        title: 'Selecionar Responsável',
        size: 'sm',
        body: `
            <div style="max-height:400px;overflow-y:auto">
                <div class="search-box mb-3">
                    <i data-fa-icon="search" class="search-icon"></i>
                    <input type="text" id="search-responsible" class="search-input" placeholder="Buscar..." oninput="window._filterResponsiblePicker()">
                </div>
                <div id="responsible-picker-list">${buildResponsiblePickerList(_allUsers)}</div>
            </div>`,
        footer: `<button class="btn btn-primary" onclick="closeModal('modal-responsible')">Concluído</button>`,
    });
    
    openModal('modal-responsible');
    window.renderIcons?.();
};

function buildResponsiblePickerList(users) {
    const selectedId = document.getElementById('ev-responsible')?.value || '';
    return users.map(u => `
        <div class="involved-picker-item${selectedId === u.id ? ' selected' : ''}" data-id="${u.id}" data-name="${escapeHtml(u.name)}" onclick="window._selectResponsible('${u.id}', '${escapeHtml(u.name).replace(/'/g, "\\'")}')">
            <div class="involved-avatar" style="background:${stringToColor(u.name)}">${getInitials(u.name)}</div>
            <div class="involved-info">
                <div class="involved-name">${escapeHtml(u.name)}</div>
                <div class="involved-email">${escapeHtml(u.email)}</div>
            </div>
            <i data-fa-icon="check" class="check-icon"></i>
        </div>
    `).join('');
}

window._selectResponsible = function(userId, userName) {
    document.getElementById('ev-responsible').value = userId;
    renderResponsibleContainer(userId, userName);
    document.querySelectorAll('#responsible-picker-list .involved-picker-item').forEach(el => {
        el.classList.toggle('selected', el.dataset.id === userId);
    });
};

function renderResponsibleContainer(userId, userName) {
    const container = document.getElementById('ev-responsible-container');
    if (!container) return;
    
    if (!userId) {
        container.innerHTML = '<span class="involved-placeholder">Clique para selecionar responsável...</span>';
        window.renderIcons?.();
        return;
    }
    
    container.innerHTML = `
        <div class="involved-chip" data-id="${userId}">
            <div class="involved-avatar" style="background:${stringToColor(userName)}">${getInitials(userName)}</div>
            <span>${escapeHtml(userName)}</span>
            <i data-fa-icon="x" onclick="window._removeResponsible(event)"></i>
        </div>`;
    container.innerHTML += '<span class="involved-add-btn">+ Alterar</span>';
    window.renderIcons?.();
}

window._removeResponsible = function(event) {
    event.stopPropagation();
    document.getElementById('ev-responsible').value = '';
    renderResponsibleContainer('', '');
};

window._filterResponsiblePicker = function() {
    const search = document.getElementById('search-responsible')?.value?.toLowerCase() || '';
    const filtered = _allUsers.filter(u => 
        (u.name || '').toLowerCase().includes(search) || 
        (u.email || '').toLowerCase().includes(search)
    );
    document.getElementById('responsible-picker-list').innerHTML = buildResponsiblePickerList(filtered);
    window.renderIcons?.();
};
