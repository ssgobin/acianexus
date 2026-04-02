/* ================================================================
   NEXUS — Tasks Module (Kanban)
   Gestão de tarefas com boards, drag-and-drop e GUT.
   ================================================================ */

import { requireAuth } from '/services/auth.service.js';
import { db } from '/services/firebase-config.js';
import {
    collection, doc, query, where, orderBy, onSnapshot, addDoc,
    updateDoc, deleteDoc, getDocs, serverTimestamp, Timestamp, getDoc
} from 'firebase/firestore';
import { renderSidebar } from '/components/sidebar.js';
import { renderHeader } from '/components/header.js';
import { createModal, openModal, closeModal, confirmDialog } from '/components/modal.js';
import { toast } from '/components/toast.js';
import { sanitizeText } from '/utils/sanitizer.js';
import { formatDate, todayString } from '/utils/date-utils.js';
import {
    getInitials, stringToColor, escapeHtml, uid as genUid, TASK_STATUS_LABELS,
    getStoredTheme, setTheme, canPerformAction
} from '/utils/helpers.js';
import { validateTask } from '/utils/validators.js';
import { calcGutScore, gutPriorityLevel, gutPriorityLabel, gutPriorityClass, buildGutObject, renderGutBadge } from '/utils/gut-calculator.js';
import { logAudit, AUDIT_ACTIONS } from '/services/audit.service.js';
import { notifyTaskAssigned, notifyTaskMoved, notifyTaskUpdated, notifyTaskDeleted, notifyTaskInvolved } from '/services/notifications.service.js';

let _profile = null;
let _unsubTasks = null;
let _editingTaskId = null;
let _currentBoard = 'projects';
let _allTasks = [];
let _allUsers = [];
let _dragSourceId = null;
let _isDragging = false;
let _dropGhostEl = null;

const BOARDS = [
    { id: 'default', label: 'Tarefas' },
];

function normalizeBoard(board) {
    return 'default';
}

function boardLabel(board) {
    return 'Tarefas';
}

function isTaskOwner(task) {
    return !!task && !!_profile?.uid && task.createdBy === _profile.uid;
}

function canManageTask(task) {
    return canPerformAction(_profile, 'edit_task') || canPerformAction(_profile, 'delete_task') || isTaskOwner(task);
}

function canDeleteTask(task) {
    return canPerformAction(_profile, 'delete_task') || isTaskOwner(task);
}

const COLUMNS = [
    { id: 'todo', label: 'A Fazer', icon: 'circle', color: 'var(--text-muted)' },
    { id: 'in_progress', label: 'Em Andamento', icon: 'loader-2', color: 'var(--color-primary)' },
    { id: 'review', label: 'Revisão', icon: 'clock', color: 'var(--color-warning)' },
    { id: 'done', label: 'Concluído', icon: 'check-circle-2', color: 'var(--color-success)' },
    { id: 'cancelled', label: 'Cancelado', icon: 'x-circle', color: 'var(--color-danger)' },
];

// ================================================================
// INIT
// ================================================================
async function init() {
    setTheme(getStoredTheme());

    _profile = await requireAuth('viewer');
    if (!_profile) return;

    renderSidebar('tasks', _profile);
    renderHeader(_profile, 'Tarefas', 'Gestão de tarefas e projetos');

    document.getElementById('page-content').innerHTML = buildPageLayout();
    setupSearchFilter();
    await loadUsers();
    createTaskModal();
    subscribeToTasks();
    
    if ('Notification' in window && Notification.permission === 'default') {
        Notification.requestPermission();
    }
    
    startDeadlineNotifier();

    document.getElementById('app-loading').style.display = 'none';
    document.getElementById('app').style.display = 'flex';
}

// ================================================================
// LAYOUT
// ================================================================
function buildPageLayout() {
    const canCreate = canPerformAction(_profile, 'create_task');
    return `
    <div class="page-header">
      <div class="page-header-left">
        <h2>Tarefas</h2>
        <p>Gerencie e acompanhe todas as tarefas</p>
      </div>
    </div>

    <!-- Search + Sort Bar -->
    <div class="toolbar mb-4">
      <div class="search-box">
        <i data-fa-icon="search" class="search-icon"></i>
        <input type="text" id="search-tasks" class="search-input" placeholder="Buscar tarefas...">
      </div>
      <div class="toolbar-right">
        <select id="sort-tasks" class="form-select form-select-sm" style="width:auto">
          <option value="updatedAt">Mais recentes</option>
          <option value="dueDate">Por vencimento</option>
          <option value="gut.score">Por prioridade GUT</option>
          <option value="title">Alfabética</option>
        </select>
      </div>
    </div>

    <!-- Kanban columns -->
    <div class="kanban-scroll" id="kanban-scroll">
      <div class="kanban-board" id="kanban-board">
        ${COLUMNS.map(col => `
          <div class="kanban-col" data-status="${col.id}">
            <div class="kanban-col-header">
              <div style="display:flex;align-items:center;gap:8px">
                <i data-fa-icon="${col.icon}" style="width:14px;height:14px;color:${col.color}"></i>
                <span class="kanban-col-label">${col.label}</span>
                <span class="kanban-col-count badge badge-gray" id="count-${col.id}">0</span>
              </div>
              ${col.id === 'todo' && canPerformAction(_profile, 'create_task') ? `
                <button class="btn btn-ghost btn-xs" onclick="window._openCreateTask('${col.id}')">
                  <i data-fa-icon="plus" style="width:14px;height:14px"></i>
                </button>` : ''}
            </div>
            <div class="kanban-cards" id="col-${col.id}"
                 data-status="${col.id}"
                ondragover="window._onDragOverColumn(event,'${col.id}')"
                 ondragleave="event.currentTarget.classList.remove('drag-over')"
                 ondrop="window._onDropColumn(event,'${col.id}')">
              <!-- cards injetados aqui -->
            </div>
          </div>
        `).join('')}
      </div>
    </div>

    <!-- FAB -->
    ${canCreate ? `<div class="fab-container"><button class="fab-btn" onclick="window._openCreateTask()" title="Nova Tarefa"><i data-fa-icon="plus"></i></button></div>` : ''}`;
}

// ================================================================
// FILTRO DE BOARD
// ================================================================
function setActiveBoard(boardId) {
    _currentBoard = normalizeBoard(boardId);
}

function setupSearchFilter() {
    let debounceTimer;
    document.getElementById('search-tasks')?.addEventListener('input', e => {
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(renderKanban, 300);
    });
    document.getElementById('sort-tasks')?.addEventListener('change', renderKanban);
}

// ================================================================
// LOAD USERS (for assignee dropdown)
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
// REALTIME SUBSCRIPTION
// ================================================================
function subscribeToTasks() {
    if (_unsubTasks) _unsubTasks();

    _unsubTasks = onSnapshot(
        query(collection(db, 'tasks'), orderBy('updatedAt', 'desc')),
        snap => {
            _allTasks = snap.docs.map(d => ({ id: d.id, ...d.data() }));
            renderKanban();
        },
        err => {
            console.error('[Tasks] Subscription error:', err);
            toast.error('Erro', 'Falha na conexão com o servidor.');
        }
    );
}

// ================================================================
// RENDER KANBAN
// ================================================================
function renderKanban() {
    const search = (document.getElementById('search-tasks')?.value || '').toLowerCase().trim();
    const sort = document.getElementById('sort-tasks')?.value || 'updatedAt';

    let filtered = _allTasks;

    if (search) {
        filtered = filtered.filter(t =>
            (t.title || '').toLowerCase().includes(search) ||
            (t.assigneeName || '').toLowerCase().includes(search) ||
            (t.objective || '').toLowerCase().includes(search)
        );
    }

    // Sort
    if (sort === 'gut.score') {
        filtered.sort((a, b) => (b.gut?.score || 0) - (a.gut?.score || 0));
    } else if (sort === 'dueDate') {
        filtered.sort((a, b) => {
            const da = a.dueDate?.toDate?.()?.getTime() || Infinity;
            const db2 = b.dueDate?.toDate?.()?.getTime() || Infinity;
            return da - db2;
        });
    } else if (sort === 'title') {
        filtered.sort((a, b) => (a.title || '').localeCompare(b.title || ''));
    } else {
        filtered.sort((a, b) => {
            const da = a.updatedAt?.toDate?.()?.getTime() || 0;
            const db2 = b.updatedAt?.toDate?.()?.getTime() || 0;
            return db2 - da;
        });
    }

    COLUMNS.forEach(col => {
        const cards = filtered.filter(t => t.status === col.id);
        const el = document.getElementById(`col-${col.id}`);
        const countEl = document.getElementById(`count-${col.id}`);
        if (!el) return;
        if (countEl) countEl.textContent = cards.length;

        if (cards.length === 0) {
            el.innerHTML = `<div class="kanban-empty">
        <i data-fa-icon="inbox" style="width:28px;height:28px;opacity:0.3;display:block;margin:0 auto 8px"></i>
        <span style="font-size:12px;color:var(--text-muted)">Sem tarefas</span>
      </div>`;
        } else {
            el.innerHTML = cards.map(t => buildTaskCard(t)).join('');
        }
    });

    window.renderIcons?.();
}

// ================================================================
// TASK CARD
// ================================================================
function buildTaskCard(task) {
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const due = task.dueDate?.toDate?.();
    const isOverdue = due && due < today && task.status !== 'done' && task.status !== 'cancelled';
    const initials = getInitials(task.assigneeName || '?');
    const avatarColor = stringToColor(task.assigneeName || '');
    const dueFmt = due ? formatDate(task.dueDate, 'short') : '';
    const gutBadge = renderGutBadge(task.gut);
    const checklistTotal = task.checklist?.length || 0;
    const checklistDone = task.checklist?.filter(c => c.done).length || 0;
    const canEdit = canManageTask(task);
    const isAssignee = _profile?.uid === task.assigneeId;
    const needsDeadline = task.status === 'todo' && isAssignee && !task.deadlineSet;
    const createdAt = task.createdAt?.toDate?.() || new Date();
    const hoursSinceCreated = (Date.now() - createdAt.getTime()) / (1000 * 60 * 60);
    const showDeadlineWarning = needsDeadline && hoursSinceCreated >= 2;

    return `
    <div class="kanban-card${showDeadlineWarning ? ' deadline-warning' : ''}" data-id="${task.id}"
         draggable="${canEdit}"
         ondragstart="window._onDragStart(event,'${task.id}')"
         ondragend="window._onDragEnd(event)"
         onclick="window._openTaskDetail('${task.id}')">
      <div class="kanban-card-title">${escapeHtml(task.title)}</div>
      ${task.objective ? `<div class="kanban-card-subtitle">${escapeHtml(task.objective)}</div>` : ''}

      <div class="kanban-card-meta">
        ${gutBadge}
        ${checklistTotal > 0 ? `<span style="font-size:10px;color:var(--text-muted)">
          <i data-fa-icon="check-square" style="width:10px;height:10px;display:inline-block;vertical-align:middle"></i>
          ${checklistDone}/${checklistTotal}
        </span>` : ''}
      </div>

      <div class="kanban-card-footer">
        ${due ? `<span class="kanban-card-due${isOverdue ? ' overdue' : ''}">
          <i data-fa-icon="calendar" style="width:10px;height:10px;display:inline-block;vertical-align:middle;margin-right:2px"></i>
          ${isOverdue ? '⚠ ' : ''}${dueFmt}
        </span>` : '<span></span>'}

        <div class="kanban-card-actions">
          ${needsDeadline ? `
            <button class="deadline-check" onclick="window._openSetDeadline(event, '${task.id}')" title="Definir prazo">
              <i data-fa-icon="check-circle"></i>
            </button>
          ` : ''}
          <div class="assignee-avatar-sm" style="background:${avatarColor}" title="${escapeHtml(task.assigneeName || '')}">${initials}</div>
        </div>
      </div>
    </div>`;
}

// ================================================================
// DRAG & DROP
// ================================================================
window._onDragStart = (event, id) => {
    const task = _allTasks.find(t => t.id === id);
    if (!canManageTask(task)) {
        event.preventDefault();
        return;
    }
    _dragSourceId = id;
    _isDragging = true;
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', id);
    event.currentTarget?.classList.add('dragging');
};

window._onDragEnd = (event) => {
    event.currentTarget?.classList.remove('dragging');
    document.querySelectorAll('.filter-tab.drop-target').forEach(el => el.classList.remove('drop-target'));
    document.querySelectorAll('.kanban-cards.drag-over').forEach(el => el.classList.remove('drag-over'));
    _dropGhostEl?.remove();
    _dropGhostEl = null;
    setTimeout(() => {
        _dragSourceId = null;
        _isDragging = false;
    }, 80);
};

function getDragAfterElement(container, y) {
    const draggableElements = [...container.querySelectorAll('.kanban-card:not(.dragging)')];

    return draggableElements.reduce((closest, child) => {
        const box = child.getBoundingClientRect();
        const offset = y - box.top - box.height / 2;
        if (offset < 0 && offset > closest.offset) {
            return { offset, element: child };
        }
        return closest;
    }, { offset: Number.NEGATIVE_INFINITY, element: null }).element;
}

function ensureDropGhost() {
    if (_dropGhostEl) return _dropGhostEl;
    _dropGhostEl = document.createElement('div');
    _dropGhostEl.className = 'kanban-drop-ghost';
    _dropGhostEl.setAttribute('aria-hidden', 'true');
    return _dropGhostEl;
}

window._onDragOverColumn = (event) => {
    if (!_dragSourceId) return;
    const task = _allTasks.find(t => t.id === _dragSourceId);
    if (!canManageTask(task)) return;

    event.preventDefault();
    const container = event.currentTarget;
    container.classList.add('drag-over');

    const ghost = ensureDropGhost();
    const afterElement = getDragAfterElement(container, event.clientY);
    if (afterElement) {
        container.insertBefore(ghost, afterElement);
    } else {
        container.appendChild(ghost);
    }
};

window._onDropColumn = async (event, newStatus) => {
    event.currentTarget.classList.remove('drag-over');
    event.preventDefault();
    const droppedId = _dragSourceId || event.dataTransfer.getData('text/plain');
    if (!droppedId) return;

    const task = _allTasks.find(t => t.id === droppedId);
    if (!canManageTask(task)) {
        _dropGhostEl?.remove();
        _dropGhostEl = null;
        return;
    }

    if (!task || task.status === newStatus) {
        _dropGhostEl?.remove();
        _dropGhostEl = null;
        _dragSourceId = null;
        _isDragging = false;
        return;
    }

    try {
        const oldStatus = task.status;
        await updateDoc(doc(db, 'tasks', droppedId), {
            status: newStatus,
            updatedAt: serverTimestamp()
        });
        await logAudit(AUDIT_ACTIONS.TASK_STATUS_CHANGED, droppedId, 'task', { from: oldStatus, to: newStatus, title: task.title });
        await notifyTaskMoved({ ...task, status: newStatus }, oldStatus, newStatus);
    } catch (e) {
        toast.error('Erro', 'Não foi possível mover a tarefa.');
    } finally {
        _dropGhostEl?.remove();
        _dropGhostEl = null;
        _dragSourceId = null;
        _isDragging = false;
    }
};

window._onBoardTabDragOver = (event) => {
    const task = _allTasks.find(t => t.id === _dragSourceId);
    if (!_dragSourceId || !canManageTask(task)) return;
    event.preventDefault();
    event.currentTarget.classList.add('drop-target');
};

window._onBoardTabDragLeave = (event) => {
    event.currentTarget.classList.remove('drop-target');
};

window._onDropBoard = async (event, newBoard) => {
    event.preventDefault();
    event.currentTarget.classList.remove('drop-target');
    const droppedId = _dragSourceId || event.dataTransfer.getData('text/plain');
    if (!droppedId) return;

    const task = _allTasks.find(t => t.id === droppedId);
    const normalizedBoard = normalizeBoard(newBoard);
    if (!canManageTask(task)) {
        _dropGhostEl?.remove();
        _dropGhostEl = null;
        return;
    }
    if (!task || normalizeBoard(task.board) === normalizedBoard) {
        _dropGhostEl?.remove();
        _dropGhostEl = null;
        _dragSourceId = null;
        _isDragging = false;
        return;
    }

    try {
        await updateDoc(doc(db, 'tasks', droppedId), {
            board: normalizedBoard,
            updatedAt: serverTimestamp()
        });
        await logAudit(AUDIT_ACTIONS.TASK_UPDATED, droppedId, 'task', {
            title: task.title,
            boardFrom: normalizeBoard(task.board),
            boardTo: normalizedBoard,
        });
        setActiveBoard(normalizedBoard);
        renderKanban();
    } catch (e) {
        toast.error('Erro', 'Não foi possível mover para outro funil.');
    } finally {
        _dropGhostEl?.remove();
        _dropGhostEl = null;
        _dragSourceId = null;
        _isDragging = false;
    }
};

// ================================================================
// MODAIS — CRIAR / EDITAR TAREFA
// ================================================================
function createTaskModal() {
    const gutOptions = [1, 2, 3, 4, 5].map(n => `<option value="${n}">${n}</option>`).join('');

    createModal({
        id: 'modal-task',
        title: 'Nova Tarefa',
        size: 'lg',
        body: `
      <form id="form-task" class="form-grid" novalidate>
        <div class="form-group form-col-full">
          <label class="form-label">Título *</label>
          <input type="text" id="task-title" class="form-input" placeholder="Título claro e objetivo" maxlength="200" required>
        </div>
        <div class="form-group">
          <label class="form-label">Status</label>
          <select id="task-status" class="form-select">
            ${COLUMNS.map(c => `<option value="${c.id}">${c.label}</option>`).join('')}
          </select>
        </div>
        <div class="form-group">
          <label class="form-label">Responsável</label>
          <div id="task-assignee-container" class="involved-container" onclick="window._openAssigneePicker()">
            <span class="involved-placeholder">Clique para selecionar...</span>
          </div>
          <input type="hidden" id="task-assignee" value="">
        </div>
        <div class="form-group">
          <label class="form-label">Envolvidos</label>
          <div id="task-involved-container" class="involved-container" onclick="window._openInvolvedPicker()">
            <span class="involved-placeholder">Clique para selecionar...</span>
          </div>
          <input type="hidden" id="task-involved" value="">
        </div>
        <div class="form-group form-col-full">
          <label class="form-label">Objetivo</label>
          <input type="text" id="task-objective" class="form-input" maxlength="200" placeholder="Objetivo principal">
        </div>
        <div class="form-group form-col-full">
          <label class="form-label">Descrição</label>
          <textarea id="task-description" class="form-textarea" rows="3" placeholder="Detalhes..."></textarea>
        </div>

        <!-- GUT Matrix -->
        <div class="form-group form-col-full">
          <label class="form-label" style="margin-bottom:8px">
            Matriz GUT <span class="badge badge-gray" id="gut-preview">Score: —</span>
          </label>
          <div class="gut-grid">
            <div class="gut-item">
              <label>G — Gravidade</label>
              <select id="gut-g" class="form-select form-select-sm">${gutOptions}</select>
            </div>
            <div class="gut-item">
              <label>U — Urgência</label>
              <select id="gut-u" class="form-select form-select-sm">${gutOptions}</select>
            </div>
            <div class="gut-item">
              <label>T — Tendência</label>
              <select id="gut-t" class="form-select form-select-sm">${gutOptions}</select>
            </div>
          </div>
        </div>

        <!-- Checklist -->
        <div class="form-group form-col-full">
          <label class="form-label">Checklist</label>
          <div id="checklist-items"></div>
          <button type="button" class="btn btn-ghost btn-sm mt-2" onclick="window._addChecklistItem()">
            <i data-fa-icon="plus" style="width:14px;height:14px"></i> Adicionar item
          </button>
        </div>

        <div class="form-group form-col-full">
          <label class="form-label">Informações Adicionais</label>
          <textarea id="task-additional" class="form-textarea" rows="2"></textarea>
        </div>
      </form>`,
        footer: `
      <button class="btn btn-danger" id="btn-delete-task" style="display:none;margin-right:auto" onclick="window._deleteCurrentTask()">
        <i data-fa-icon="trash-2"></i> Excluir
      </button>
      <button class="btn btn-secondary" onclick="closeModal('modal-task')">Cancelar</button>
      <button class="btn btn-primary" id="btn-save-task" onclick="window._saveTask()">
        <i data-fa-icon="save"></i> Salvar
      </button>`,
    });

    // GUT score preview
    ['gut-g', 'gut-u', 'gut-t'].forEach(id => {
        document.getElementById(id)?.addEventListener('change', updateGutPreview);
    });

    createDeadlineModal();
}

function createDeadlineModal() {
    createModal({
        id: 'modal-deadline',
        title: 'Definir Prazo',
        size: 'sm',
        body: `
      <p style="margin-bottom:16px;color:var(--text-secondary);font-size:14px">
        Você está definindo o prazo real para esta tarefa. Após definido, o sistemairá lembrá-lo(a) do vencimento.
      </p>
      <div class="form-group">
        <label class="form-label">Prazo *</label>
        <input type="date" id="deadline-date" class="form-input" min="${todayString()}">
      </div>
      <div class="form-group">
        <label class="form-label">Horário (opcional)</label>
        <input type="time" id="deadline-time" class="form-input">
      </div>`,
        footer: `
      <button class="btn btn-secondary" onclick="closeModal('modal-deadline')">Cancelar</button>
      <button class="btn btn-primary" onclick="window._saveDeadline()">
        <i data-fa-icon="check"></i> Confirmar
      </button>`,
    });
}

let _currentDeadlineTaskId = null;

window._openSetDeadline = function(event, taskId) {
    event.stopPropagation();
    _currentDeadlineTaskId = taskId;
    document.getElementById('deadline-date').value = '';
    document.getElementById('deadline-time').value = '';
    openModal('modal-deadline');
};

window._saveDeadline = async function() {
    const dateVal = document.getElementById('deadline-date')?.value;
    const timeVal = document.getElementById('deadline-time')?.value || '23:59';
    
    if (!dateVal) {
        toast.warning('Campo obrigatório', 'Informe o prazo.');
        return;
    }
    
    if (!_currentDeadlineTaskId) return;
    
    const deadlineDateTime = new Date(`${dateVal}T${timeVal}`);
    const deadlineTimestamp = Timestamp.fromDate(deadlineDateTime);
    
    try {
        await updateDoc(doc(db, 'tasks', _currentDeadlineTaskId), {
            dueDate: deadlineTimestamp,
            deadlineSet: true,
            deadlineSetAt: serverTimestamp(),
            deadlineSetBy: _profile?.uid
        });
        
        toast.success('Prazo definido', 'O prazo foi definido com sucesso.');
        closeModal('modal-deadline');
        _currentDeadlineTaskId = null;
    } catch (e) {
        console.error('[Tasks] Erro ao definir prazo:', e);
        toast.error('Erro', 'Não foi possível definir o prazo.');
    }
};

function populateTaskAssigneeOptions(selectedId = '') {
    const select = document.getElementById('task-assignee');
    if (!select) return;

    const options = _allUsers.length
        ? _allUsers.map(u => {
            const label = escapeHtml(u.name || u.email || 'Sem nome');
            const isSelected = selectedId && String(selectedId) === String(u.id) ? ' selected' : '';
            return `<option value="${u.id}" data-name="${label}"${isSelected}>${label}</option>`;
        }).join('')
        : '<option value="" disabled>Nenhum usuário disponível</option>';

    select.innerHTML = `<option value="">Selecionar...</option>${options}`;
}

function updateGutPreview() {
    const g = parseInt(document.getElementById('gut-g')?.value || 1);
    const u = parseInt(document.getElementById('gut-u')?.value || 1);
    const t = parseInt(document.getElementById('gut-t')?.value || 1);
    const score = calcGutScore(g, u, t);
    const label = gutPriorityLabel(score);
    const el = document.getElementById('gut-preview');
    if (el) el.textContent = `Score: ${score} — ${label}`;
}

function renderAssigneeContainer(user) {
    const container = document.getElementById('task-assignee-container');
    if (!container) return;
    
    if (!user) {
        container.innerHTML = '<span class="involved-placeholder">Clique para selecionar...</span>';
        return;
    }
    
    container.innerHTML = `
        <div class="involved-chip" data-id="${user.id}">
            <div class="involved-avatar" style="background:${stringToColor(user.name)}">${getInitials(user.name)}</div>
            <span>${escapeHtml(user.name)}</span>
            <i data-fa-icon="x" onclick="window._clearAssignee(event)"></i>
        </div>`;
    window.renderIcons?.();
}

window._openAssigneePicker = function() {
    createModal({
        id: 'modal-assignee',
        title: 'Selecionar Responsável',
        size: 'sm',
        body: `
            <div style="max-height:400px;overflow-y:auto">
                <div class="search-box mb-3">
                    <i data-fa-icon="search" class="search-icon"></i>
                    <input type="text" id="search-assignee" class="search-input" placeholder="Buscar usuários..." oninput="window._filterAssigneePicker()">
                </div>
                <div id="assignee-picker-list">${buildAssigneePickerList(_allUsers)}</div>
            </div>`,
        footer: `<button class="btn btn-primary" onclick="closeModal('modal-assignee')">Concluído</button>`,
    });
    
    openModal('modal-assignee');
    window.renderIcons?.();
};

function buildAssigneePickerList(users) {
    const selectedId = document.getElementById('task-assignee')?.value || '';
    
    return users.map(u => `
        <div class="involved-picker-item${selectedId === u.id ? ' selected' : ''}" data-id="${u.id}" data-name="${escapeHtml(u.name)}" onclick="window._selectAssignee('${u.id}', '${escapeHtml(u.name).replace(/'/g, "\\'")}')">
            <div class="involved-avatar" style="background:${stringToColor(u.name)}">${getInitials(u.name)}</div>
            <div class="involved-info">
                <div class="involved-name">${escapeHtml(u.name)}</div>
                <div class="involved-email">${escapeHtml(u.email)}</div>
            </div>
            <i data-fa-icon="check" class="check-icon"></i>
        </div>
    `).join('');
}

window._selectAssignee = function(userId, userName) {
    document.getElementById('task-assignee').value = userId;
    renderAssigneeContainer({ id: userId, name: userName });
    closeModal('modal-assignee');
};

window._clearAssignee = function(event) {
    event.stopPropagation();
    document.getElementById('task-assignee').value = '';
    renderAssigneeContainer(null);
};

window._filterAssigneePicker = function() {
    const search = document.getElementById('search-assignee')?.value?.toLowerCase() || '';
    const filtered = _allUsers.filter(u => 
        (u.name || '').toLowerCase().includes(search) || 
        (u.email || '').toLowerCase().includes(search)
    );
    document.getElementById('assignee-picker-list').innerHTML = buildAssigneePickerList(filtered);
    window.renderIcons?.();
};

window._addChecklistItem = function () {
    const container = document.getElementById('checklist-items');
    if (!container) return;
    const id = genUid();
    const item = document.createElement('div');
    item.className = 'checklist-input-row';
    item.dataset.id = id;
    item.innerHTML = `
    <input type="checkbox" class="form-checkbox" id="cli-${id}">
    <input type="text" class="form-input" placeholder="Item do checklist..." maxlength="200">
    <button type="button" class="btn btn-ghost btn-xs danger" onclick="this.closest('.checklist-input-row').remove()">
      <i data-fa-icon="x" style="width:12px;height:12px"></i>
    </button>`;
    container.appendChild(item);
    window.renderIcons?.();
    item.querySelector('input[type=text]')?.focus();
};

function renderInvolvedContainer(users) {
    const container = document.getElementById('task-involved-container');
    if (!container) return;
    
    if (!users || users.length === 0) {
        container.innerHTML = '<span class="involved-placeholder">Clique para selecionar...</span>';
        return;
    }
    
    container.innerHTML = users.map(u => `
        <div class="involved-chip" data-id="${u.id}">
            <div class="involved-avatar" style="background:${stringToColor(u.name)}">${getInitials(u.name)}</div>
            <span>${escapeHtml(u.name)}</span>
            <i data-fa-icon="x" onclick="window._removeInvolved('${u.id}', event)"></i>
        </div>
    `).join('');
    
    container.innerHTML += '<span class="involved-add-btn">+ Adicionar</span>';
    window.renderIcons?.();
}

window._openInvolvedPicker = function() {
    createModal({
        id: 'modal-involved',
        title: 'Selecionar Envolvidos',
        size: 'sm',
        body: `
            <div style="max-height:400px;overflow-y:auto">
                <div class="search-box mb-3">
                    <i data-fa-icon="search" class="search-icon"></i>
                    <input type="text" id="search-involved" class="search-input" placeholder="Buscar usuários..." oninput="window._filterInvolvedPicker()">
                </div>
                <div id="involved-picker-list">${buildInvolvedPickerList(_allUsers)}</div>
            </div>`,
        footer: `<button class="btn btn-primary" onclick="closeModal('modal-involved')">Concluído</button>`,
    });
    
    openModal('modal-involved');
    window.renderIcons?.();
};

function buildInvolvedPickerList(users) {
    const selectedIds = getSelectedInvolvedIds();
    
    return users.map(u => `
        <div class="involved-picker-item${selectedIds.includes(u.id) ? ' selected' : ''}" data-id="${u.id}" onclick="window._toggleInvolved('${u.id}')">
            <div class="involved-avatar" style="background:${stringToColor(u.name)}">${getInitials(u.name)}</div>
            <div class="involved-info">
                <div class="involved-name">${escapeHtml(u.name)}</div>
                <div class="involved-email">${escapeHtml(u.email)}</div>
            </div>
            <i data-fa-icon="check" class="check-icon"></i>
        </div>
    `).join('');
}

window._toggleInvolved = function(userId) {
    const user = _allUsers.find(u => u.id === userId);
    if (!user) return;
    
    let selected = getSelectedInvolvedIds();
    if (selected.includes(userId)) {
        selected = selected.filter(id => id !== userId);
    } else {
        selected.push(userId);
    }
    
    document.getElementById('task-involved').value = JSON.stringify(selected);
    
    const selectedUsers = _allUsers.filter(u => selected.includes(u.id));
    renderInvolvedContainer(selectedUsers);
    
    document.querySelectorAll('.involved-picker-item').forEach(el => {
        el.classList.toggle('selected', selected.includes(el.dataset.id));
    });
};

window._removeInvolved = function(userId, event) {
    event.stopPropagation();
    let selected = getSelectedInvolvedIds();
    selected = selected.filter(id => id !== userId);
    document.getElementById('task-involved').value = JSON.stringify(selected);
    
    const selectedUsers = _allUsers.filter(u => selected.includes(u.id));
    renderInvolvedContainer(selectedUsers);
    
    document.querySelectorAll('.involved-picker-item')?.forEach(el => {
        el.classList.toggle('selected', selected.includes(el.dataset.id));
    });
};

window._filterInvolvedPicker = function() {
    const search = document.getElementById('search-involved')?.value?.toLowerCase() || '';
    const filtered = _allUsers.filter(u => 
        (u.name || '').toLowerCase().includes(search) || 
        (u.email || '').toLowerCase().includes(search)
    );
    document.getElementById('involved-picker-list').innerHTML = buildInvolvedPickerList(filtered);
    window.renderIcons?.();
};

function getSelectedInvolvedIds() {
    try {
        const val = document.getElementById('task-involved')?.value;
        return val ? JSON.parse(val) : [];
    } catch { return []; }
}

window._openCreateTask = function (defaultStatus = 'todo') {
    if (!canPerformAction(_profile, 'create_task')) {
        toast.warning('Sem permissão', 'Você precisa ser editor ou admin.');
        return;
    }
    _editingTaskId = null;
    document.getElementById('form-task')?.reset();
    document.getElementById('checklist-items').innerHTML = '';
    document.getElementById('task-involved').value = '';
    document.getElementById('task-assignee').value = '';
    renderInvolvedContainer([]);
    renderAssigneeContainer(null);
    const deleteBtn = document.getElementById('btn-delete-task');
    if (deleteBtn) deleteBtn.style.display = 'none';
    document.getElementById('task-status').value = defaultStatus;
    const titleEl = document.getElementById('modal-task-title');
    if (titleEl) titleEl.textContent = 'Nova Tarefa';
    updateGutPreview();
    openModal('modal-task');
    window.renderIcons?.();
};

window._openTaskDetail = async function (taskId) {
    if (_isDragging) return;
    const task = _allTasks.find(t => t.id === taskId);
    if (!task) return;

    if (canManageTask(task)) {
        // Preenche o form com os dados da tarefa para edição
        _editingTaskId = taskId;
        const titleEl = document.getElementById('modal-task-title');
        if (titleEl) titleEl.textContent = 'Editar Tarefa';
        const deleteBtn = document.getElementById('btn-delete-task');
        if (deleteBtn) deleteBtn.style.display = canDeleteTask(task) ? 'inline-flex' : 'none';

        setTimeout(() => {
            populateTaskAssigneeOptions(task.assigneeId || '');
            setFieldValue('task-title', task.title);
            setFieldValue('task-status', task.status || 'todo');
            setFieldValue('task-objective', task.objective || '');
            setFieldValue('task-description', task.description || '');
            setFieldValue('task-additional', task.additionalInfo || '');
            setFieldValue('gut-g', task.gut?.gravity || 1);
            setFieldValue('gut-u', task.gut?.urgency || 1);
            setFieldValue('gut-t', task.gut?.trend || 1);

            if (task.assigneeId) {
                const sel = document.getElementById('task-assignee');
                if (sel) sel.value = task.assigneeId;
                renderAssigneeContainer({ id: task.assigneeId, name: task.assigneeName || '' });
            } else {
                renderAssigneeContainer(null);
            }
            if (task.dueDate) {
                const d = task.dueDate.toDate?.() || new Date(task.dueDate);
                const iso = d.toISOString().split('T')[0];
                setFieldValue('task-duedate', iso);
            }

            // Envolvidos
            const involvedIds = task.involvedIds || [];
            document.getElementById('task-involved').value = JSON.stringify(involvedIds);
            const involvedUsers = _allUsers.filter(u => involvedIds.includes(u.id));
            renderInvolvedContainer(involvedUsers);

            // Checklist
            const container = document.getElementById('checklist-items');
            container.innerHTML = '';
            (task.checklist || []).forEach(ci => {
                const item = document.createElement('div');
                item.className = 'checklist-input-row';
                item.dataset.id = ci.id;
                item.innerHTML = `
          <input type="checkbox" class="form-checkbox" id="cli-${ci.id}" ${ci.done ? 'checked' : ''}>
          <input type="text" class="form-input" value="${escapeHtml(ci.text)}" maxlength="200">
          <button type="button" class="btn btn-ghost btn-xs danger" onclick="this.closest('.checklist-input-row').remove()">
            <i data-fa-icon="x" style="width:12px;height:12px"></i>
          </button>`;
                container.appendChild(item);
            });

            updateGutPreview();
            openModal('modal-task');
            window.renderIcons?.();
        }, 50);
    } else {
        // Modo leitura
        await showTaskReadOnly(task);
    }
};

window._deleteCurrentTask = async function () {
    if (!_editingTaskId) return;
    const task = _allTasks.find(t => t.id === _editingTaskId);
    if (!task || !canDeleteTask(task)) {
        toast.warning('Sem permissão', 'Você não pode excluir esta tarefa.');
        return;
    }

    const ok = await confirmDialog(
        'Excluir tarefa',
        `Tem certeza que deseja excluir a tarefa "${escapeHtml(task.title || 'Sem título')}"? Esta ação não pode ser desfeita.`,
        'Excluir',
        true
    );
    if (!ok) return;

    try {
        await deleteDoc(doc(db, 'tasks', task.id));
        await logAudit(AUDIT_ACTIONS.TASK_DELETED, task.id, 'task', { title: task.title });
        await notifyTaskDeleted(task.title, task.assigneeId);
        closeModal('modal-task');
        toast.success('Excluída', 'Tarefa removida com sucesso.');
    } catch (e) {
        console.error('[Tasks] Delete error:', e);
        toast.error('Erro', 'Não foi possível excluir a tarefa.');
    }
};

function setFieldValue(id, val) {
    const el = document.getElementById(id);
    if (el) el.value = val;
}

async function showTaskReadOnly(task) {
    const gutBadge = renderGutBadge(task.gut);
    const due = task.dueDate ? formatDate(task.dueDate, 'medium') : '—';

    createModal({
        id: 'modal-task-view',
        title: escapeHtml(task.title),
        size: 'md',
        body: `
      <div style="space-y:16px">
        <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:16px">
          <span class="status-chip status-${task.status}"><span class="status-dot"></span>${TASK_STATUS_LABELS[task.status] || task.status}</span>
          ${gutBadge}
          <span class="badge badge-gray">${task.board || '—'}</span>
        </div>
        <div class="detail-row"><strong>Responsável:</strong> ${escapeHtml(task.assigneeName || '—')}</div>
        <div class="detail-row"><strong>Prazo:</strong> ${due}</div>
        ${task.objective ? `<div class="detail-row"><strong>Objetivo:</strong> ${escapeHtml(task.objective)}</div>` : ''}
        ${task.description ? `<div class="detail-row"><strong>Descrição:</strong><br>${escapeHtml(task.description).replace(/\n/g, '<br>')}</div>` : ''}
        ${task.checklist?.length ? `
          <div class="detail-row"><strong>Checklist:</strong>
            ${task.checklist.map(c => `<div style="display:flex;align-items:center;gap:8px;padding:4px 0">
              <input type="checkbox" disabled ${c.done ? 'checked' : ''}> ${escapeHtml(c.text)}
            </div>`).join('')}
          </div>` : ''}
      </div>`,
        footer: `<button class="btn btn-secondary" onclick="closeModal('modal-task-view')">Fechar</button>`,
    });
    openModal('modal-task-view');
}

// ================================================================
// SALVAR TAREFA
// ================================================================
window._saveTask = async function () {
    const title = sanitizeText(document.getElementById('task-title')?.value?.trim() || '');
    const board = 'default';
    const status = document.getElementById('task-status')?.value || 'todo';
    const assigneeId = document.getElementById('task-assignee')?.value || '';
    const assigneeUser = _allUsers.find(u => u.id === assigneeId);
    const assigneeName = assigneeUser?.name || '';
    const objective = sanitizeText(document.getElementById('task-objective')?.value?.trim() || '');
    const description = sanitizeText(document.getElementById('task-description')?.value?.trim() || '');
    const additional = sanitizeText(document.getElementById('task-additional')?.value?.trim() || '');
    const dueDateStr = document.getElementById('task-duedate')?.value || '';
    const g = parseInt(document.getElementById('gut-g')?.value || 1);
    const u = parseInt(document.getElementById('gut-u')?.value || 1);
    const t = parseInt(document.getElementById('gut-t')?.value || 1);

    if (!title) { toast.warning('Campo obrigatório', 'Informe o título da tarefa.'); return; }

    // Build checklist
    const checklist = [];
    document.querySelectorAll('#checklist-items .checklist-input-row').forEach(row => {
        const text = row.querySelector('input[type=text]')?.value?.trim() || '';
        const done = row.querySelector('input[type=checkbox]')?.checked || false;
        const id = row.dataset.id || genUid();
        if (text) checklist.push({ id, text: sanitizeText(text), done });
    });

    const gut = buildGutObject(g, u, t);
    const dueDate = dueDateStr ? Timestamp.fromDate(new Date(dueDateStr + 'T23:59:00')) : null;
    const involvedIds = getSelectedInvolvedIds();

    const payload = {
        title, board, status, assigneeId, assigneeName,
        objective, description, additionalInfo: additional,
        gut, checklist, involvedIds, updatedAt: serverTimestamp(),
        ...(dueDate ? { dueDate } : { dueDate: null }),
    };

    const btn = document.getElementById('btn-save-task');
    if (btn) { btn.disabled = true; btn.innerHTML = '<div class="spinner-sm"></div>'; }

    try {
        if (_editingTaskId) {
            const existingTask = _allTasks.find(t => t.id === _editingTaskId);
            await updateDoc(doc(db, 'tasks', _editingTaskId), payload);
            await logAudit(AUDIT_ACTIONS.TASK_UPDATED, _editingTaskId, 'task', { title });
            
            if (assigneeId && assigneeId !== existingTask?.assigneeId) {
                await notifyTaskAssigned({ ...payload, id: _editingTaskId }, existingTask?.assigneeId);
            } else if (assigneeId) {
                await notifyTaskUpdated(_editingTaskId, title, _profile.name);
            }
            
            const previousInvolved = existingTask?.involvedIds || [];
            if (JSON.stringify(involvedIds.sort()) !== JSON.stringify(previousInvolved.sort())) {
                await notifyTaskInvolved({ ...payload, id: _editingTaskId }, previousInvolved);
            }
            toast.success('Atualizado', 'Tarefa atualizada com sucesso.');
        } else {
            const newDoc = await addDoc(collection(db, 'tasks'), {
                ...payload,
                createdBy: _profile.uid,
                requesterName: _profile.name,
                requesterId: _profile.uid,
                createdAt: serverTimestamp(),
            });
            await logAudit(AUDIT_ACTIONS.TASK_CREATED, newDoc.id, 'task', { title });
            
            if (assigneeId) {
                await notifyTaskAssigned({ ...payload, id: newDoc.id }, null);
            }
            if (involvedIds.length > 0) {
                await notifyTaskInvolved({ ...payload, id: newDoc.id }, []);
            }
            toast.success('Criado', 'Tarefa criada com sucesso.');
        }
        closeModal('modal-task');
    } catch (e) {
        console.error('[Tasks] Save error:', e);
        toast.error('Erro', 'Não foi possível salvar a tarefa.');
    } finally {
        if (btn) { btn.disabled = false; btn.innerHTML = '<i data-fa-icon="save"></i> Salvar'; window.renderIcons?.(); }
    }
};

let _deadlineNotifierInterval = null;

function startDeadlineNotifier() {
    if (_deadlineNotifierInterval) return;
    
    checkDeadlines();
    _deadlineNotifierInterval = setInterval(checkDeadlines, 15 * 60 * 1000);
}

function checkDeadlines() {
    if (!_profile?.uid) return;
    
    const now = new Date();
    const twoHoursAgo = new Date(now.getTime() - 2 * 60 * 60 * 1000);
    
    const tasksNeedingDeadline = _allTasks.filter(t => {
        if (t.status !== 'todo') return false;
        if (t.assigneeId !== _profile.uid) return false;
        if (t.deadlineSet) return false;
        
        const created = t.createdAt?.toDate?.();
        return created && created <= twoHoursAgo;
    });
    
    if (tasksNeedingDeadline.length > 0) {
        const taskList = tasksNeedingDeadline.map(t => `• ${t.title}`).join('\n');
        if (Notification.permission === 'granted') {
            new Notification('Atenção: Tarefas sem prazo', {
                body: `${tasksNeedingDeadline.length} tarefa(s) aguardando definição de prazo há mais de 2 horas:\n${taskList}`,
                icon: '/assets/img/logo.png'
            });
        }
        
        toast.info('Lembrete', `${tasksNeedingDeadline.length} tarefa(s) sem prazo definido. Clique no ✓ para definir.`);
    }
}

init().catch(e => { console.error(e); toast.error('Erro', 'Falha ao carregar módulo de tarefas.'); });
