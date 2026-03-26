/* ================================================================
   NEXUS — Dashboard Module
   Exibe resumo operacional: tarefas, chamados, eventos, analytics.
   ================================================================ */

import { requireAuth } from '/services/auth.service.js';
import { db } from '/services/firebase-config.js';
import {
    collection, query, where, orderBy, limit, getDocs, onSnapshot, Timestamp
} from 'firebase/firestore';
import { renderSidebar } from '/components/sidebar.js';
import { renderHeader } from '/components/header.js';
import { toast } from '/components/toast.js';
import { formatDate, formatRelative, tsToDate, isOverdue, isToday, todayString } from '/utils/date-utils.js';
import { getInitials, stringToColor, TASK_STATUS_LABELS, TICKET_STATUS_LABELS, escapeHtml, getStoredTheme, setTheme, canPerformAction } from '/utils/helpers.js';
import { AUDIT_ACTIONS, logAudit } from '/services/audit.service.js';
import { sanitizeText } from '/utils/sanitizer.js';
import { renderGutBadge } from '/utils/gut-calculator.js';

let _profile = null;
let _unsubscribers = [];

// ================================================================
// INIT
// ================================================================
async function init() {
    setTheme(getStoredTheme());

    _profile = await requireAuth('viewer');
    if (!_profile) return;

    renderSidebar('dashboard', _profile);
    renderHeader(_profile, 'Dashboard', `Bom dia, ${_profile.name?.split(' ')[0] || 'usuário'}!`);

    document.getElementById('page-content').innerHTML = buildPageLayout();

    window.renderIcons?.();

    await Promise.all([
        loadTaskStats(),
        loadTicketStats(),
        loadTodayEvents(),
        loadRecentTasks(),
        loadRecentTickets(),
        loadRecentAnnouncements(),
    ]);

    document.getElementById('app-loading').style.display = 'none';
    document.getElementById('app').style.display = 'flex';
}

// ================================================================
// PAGE LAYOUT HTML
// ================================================================
function buildPageLayout() {
    const today = new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' });
    const canCreateTask = canPerformAction(_profile, 'create_task');
    const canCreateRoutine = canPerformAction(_profile, 'edit_task');
    const canCreateEvent = canPerformAction(_profile, 'edit_task');
    const canCreateAnnouncement = canPerformAction(_profile, 'create_announcement');
    return `
    <div class="page-header">
      <div class="page-header-left">
        <h2>Dashboard Operacional</h2>
        <p>${today} · Visão geral de produtividade e operação</p>
      </div>
      <div class="page-header-actions">
        ${canCreateTask ? `<a href="/pages/tasks.html" class="btn btn-primary btn-sm"><i data-fa-icon="plus"></i> Nova Tarefa</a>` : ''}
        ${canCreateRoutine ? `<a href="/pages/routines.html?create=1" class="btn btn-secondary btn-sm"><i data-fa-icon="repeat"></i> Nova Rotina</a>` : ''}
        ${canCreateEvent ? `<a href="/pages/agenda.html?create=1" class="btn btn-secondary btn-sm"><i data-fa-icon="calendar-days"></i> Novo Evento</a>` : ''}
        ${canCreateAnnouncement ? `<a href="/pages/announcements.html?create=1" class="btn btn-secondary btn-sm"><i data-fa-icon="megaphone"></i> Novo Comunicado</a>` : ''}
      </div>
    </div>

    <!-- Stats Cards -->
    <div class="stats-grid" id="stats-grid">
      <!-- carregando... -->
      ${Array(6).fill(0).map(() => `<div class="stat-card skeleton" style="height:120px"></div>`).join('')}
    </div>

    <!-- Main Content Grid -->
    <div class="content-grid">
      <!-- Left Column -->
      <div>
        <!-- Tarefas Recentes -->
        <div class="card mb-6">
          <div class="card-header">
            <div>
              <h3>Tarefas Recentes</h3>
              <p>Últimas atualizações</p>
            </div>
            <a href="/pages/tasks.html" class="btn btn-ghost btn-sm">
              Ver todas <i data-fa-icon="arrow-right"></i>
            </a>
          </div>
          <div id="recent-tasks-list">
            <div class="page-loader"><div class="spinner"></div></div>
          </div>
        </div>

        <!-- Chamados Recentes -->
        <div class="card">
          <div class="card-header">
            <div>
              <h3>Chamados Abertos</h3>
              <p>Prioridade e SLA</p>
            </div>
            <a href="/pages/tickets.html" class="btn btn-ghost btn-sm">
              Ver todos <i data-fa-icon="arrow-right"></i>
            </a>
          </div>
          <div id="recent-tickets-list">
            <div class="page-loader"><div class="spinner"></div></div>
          </div>
        </div>
      </div>

      <!-- Right Column -->
      <div>
        <!-- Eventos de Hoje -->
        <div class="card mb-6">
          <div class="card-header">
            <div><h3>Agenda de Hoje</h3><p>Compromissos do dia</p></div>
            <a href="/pages/agenda.html" class="btn btn-ghost btn-sm">
              <i data-fa-icon="calendar"></i>
            </a>
          </div>
          <div id="today-events-list">
            <div class="page-loader"><div class="spinner"></div></div>
          </div>
        </div>

        <!-- Comunicados Recentes -->
        <div class="card">
          <div class="card-header">
            <div><h3>Comunicados</h3><p>Mais recentes</p></div>
            <a href="/pages/announcements.html" class="btn btn-ghost btn-sm">
              <i data-fa-icon="megaphone"></i>
            </a>
          </div>
          <div id="recent-announcements-list">
            <div class="page-loader"><div class="spinner"></div></div>
          </div>
        </div>

        <!-- Atalhos Rápidos -->
        <div class="card mt-6">
          <div class="card-header"><h3>Atalhos Rápidos</h3></div>
          <div class="card-body">
            <div class="grid grid-cols-2 gap-3">
              ${[
            { href: '/pages/tasks.html', icon: 'kanban', label: 'Kanban' },
            { href: '/pages/tickets.html', icon: 'ticket', label: 'Chamado' },
            { href: '/pages/reports.html', icon: 'file-text', label: 'Relatório' },
            { href: '/pages/agenda.html', icon: 'calendar-days', label: 'Evento' },
            { href: '/pages/chat.html', icon: 'message-square', label: 'Chat' },
            { href: '/pages/announcements.html', icon: 'megaphone', label: 'Comunicado' },
        ].map(s => `
                <a href="${s.href}" class="btn btn-secondary" style="justify-content:flex-start;gap:8px">
                  <i data-fa-icon="${s.icon}" style="width:14px;height:14px"></i>
                  ${s.label}
                </a>`).join('')}
            </div>
          </div>
        </div>
      </div>
    </div>`;
}

// ================================================================
// CARREGAR ESTATÍSTICAS DE TAREFAS
// ================================================================
async function loadTaskStats() {
    try {
        const today = new Date(); today.setHours(0, 0, 0, 0);
        const todayTs = Timestamp.fromDate(today);

        const tasksSnap = await getDocs(collection(db, 'tasks'));
        const tasks = tasksSnap.docs.map(d => ({ id: d.id, ...d.data() }));

        const total = tasks.length;
        const inProgress = tasks.filter(t => t.status === 'in_progress').length;
        const done = tasks.filter(t => t.status === 'done').length;
        const overdue = tasks.filter(t => {
            if (!t.dueDate) return false;
            const due = tsToDate(t.dueDate);
            return due && due < today && t.status !== 'done' && t.status !== 'cancelled';
        }).length;

        const ticketsSnap = await getDocs(query(
            collection(db, 'tickets'),
            where('status', 'in', ['open', 'in_progress'])
        ));
        const openTickets = ticketsSnap.size;

        const eventsSnap = await getDocs(query(
            collection(db, 'events'),
            where('eventDate', '>=', todayTs),
            orderBy('eventDate', 'asc'),
            limit(20)
        ));
        const todayEvents = eventsSnap.docs.filter(d => {
            return isToday(d.data().eventDate);
        }).length;

        document.getElementById('stats-grid').innerHTML = `
      <div class="stat-card primary">
        <div class="stat-card-icon" style="background:var(--color-primary-light);color:var(--color-primary)">
          <i data-fa-icon="clipboard-list"></i>
        </div>
        <div class="stat-card-content">
          <div class="stat-card-label">Total de Tarefas</div>
          <div class="stat-card-value">${total}</div>
          <div class="stat-card-trend" style="color:var(--text-muted);font-size:11px">
            ${inProgress} em andamento
          </div>
        </div>
      </div>
      <div class="stat-card success">
        <div class="stat-card-icon" style="background:var(--color-success-light);color:var(--color-success)">
          <i data-fa-icon="check-circle-2"></i>
        </div>
        <div class="stat-card-content">
          <div class="stat-card-label">Concluídas</div>
          <div class="stat-card-value">${done}</div>
          <div class="stat-card-trend" style="color:var(--color-success)">
            ${total ? Math.round((done / total) * 100) : 0}% do total
          </div>
        </div>
      </div>
      <div class="stat-card${overdue > 0 ? ' danger' : ' warning'}">
        <div class="stat-card-icon" style="background:${overdue > 0 ? 'var(--color-danger-light);color:var(--color-danger)' : 'var(--color-warning-light);color:var(--color-warning)'}">
          <i data-fa-icon="alert-triangle"></i>
        </div>
        <div class="stat-card-content">
          <div class="stat-card-label">Vencidas</div>
          <div class="stat-card-value">${overdue}</div>
          <div class="stat-card-trend" style="color:${overdue > 0 ? 'var(--color-danger)' : 'var(--text-muted)'}">
            ${overdue > 0 ? 'Ação necessária' : 'Tudo em dia!'}
          </div>
        </div>
      </div>
      <div class="stat-card info">
        <div class="stat-card-icon" style="background:var(--color-info-light);color:var(--color-info)">
          <i data-fa-icon="ticket"></i>
        </div>
        <div class="stat-card-content">
          <div class="stat-card-label">Chamados Abertos</div>
          <div class="stat-card-value">${openTickets}</div>
          <div class="stat-card-trend" style="color:var(--text-muted);font-size:11px">
            aguardando atendimento
          </div>
        </div>
      </div>
      <div class="stat-card purple">
        <div class="stat-card-icon" style="background:var(--clr-purple-50);color:var(--clr-purple-500)">
          <i data-fa-icon="calendar-check"></i>
        </div>
        <div class="stat-card-content">
          <div class="stat-card-label">Eventos Hoje</div>
          <div class="stat-card-value">${todayEvents}</div>
          <div class="stat-card-trend" style="color:var(--text-muted);font-size:11px">
            compromissos do dia
          </div>
        </div>
      </div>
      <div class="stat-card warning">
        <div class="stat-card-icon" style="background:var(--color-warning-light);color:var(--color-warning)">
          <i data-fa-icon="activity"></i>
        </div>
        <div class="stat-card-content">
          <div class="stat-card-label">Em Andamento</div>
          <div class="stat-card-value">${inProgress}</div>
          <div class="stat-card-trend" style="color:var(--text-muted);font-size:11px">
            tarefas ativas
          </div>
        </div>
      </div>`;

        window.renderIcons?.();
    } catch (e) {
        console.error('[Dashboard] Erro ao carregar stats:', e);
    }
}

async function loadTicketStats() { /* já incluso acima */ }

// ================================================================
// TAREFAS RECENTES
// ================================================================
async function loadRecentTasks() {
    try {
        const snap = await getDocs(query(
            collection(db, 'tasks'),
            where('status', 'in', ['todo', 'in_progress', 'review']),
            orderBy('updatedAt', 'desc'),
            limit(6)
        ));
        const tasks = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        const el = document.getElementById('recent-tasks-list');
        if (!el) return;

        if (tasks.length === 0) {
            el.innerHTML = `<div class="empty-state" style="padding:32px">
        <div class="empty-state-icon"><i data-fa-icon="check-square"></i></div>
        <h3>Sem tarefas pendentes</h3>
        <p>Todas as tarefas estão concluídas.</p>
      </div>`;
            window.renderIcons?.();
            return;
        }

        el.innerHTML = tasks.map(task => {
            const overdue = task.dueDate && isOverdue(task.dueDate) && task.status !== 'done';
            const statusClass = `status-${task.status}`;
            const statusLabel = TASK_STATUS_LABELS[task.status] || task.status;
            const gutBadge = renderGutBadge(task.gut);
            const initials = getInitials(task.assigneeName || '?');
            const color = stringToColor(task.assigneeName || '');
            const dueTxt = task.dueDate ? formatDate(task.dueDate, 'short') : '—';

            return `
        <div style="display:flex;align-items:center;gap:12px;padding:14px 20px;border-bottom:1px solid var(--border-light);cursor:pointer;transition:background 0.12s"
             onclick="window.location.href='/pages/tasks.html'"
             onmouseover="this.style.background='var(--n-50)'" onmouseout="this.style.background=''">
          <div style="flex:1;min-width:0">
            <div style="font-size:13px;font-weight:600;color:var(--text-primary);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">
              ${escapeHtml(task.title)}
            </div>
            <div style="display:flex;align-items:center;gap:8px;margin-top:4px;flex-wrap:wrap">
              <span class="status-chip ${statusClass}">
                <span class="status-dot"></span>${statusLabel}
              </span>
              ${gutBadge}
              <span style="font-size:11px;color:${overdue ? 'var(--color-danger)' : 'var(--text-muted)'};">
                <i data-fa-icon="calendar" style="width:11px;height:11px;display:inline-block;vertical-align:middle;margin-right:2px"></i>
                ${overdue ? '⚠ ' : ''}${dueTxt}
              </span>
            </div>
          </div>
          <div class="assignee-avatar" style="background:${color}" title="${escapeHtml(task.assigneeName || '')}">${initials}</div>
        </div>`;
        }).join('');
        window.renderIcons?.();
    } catch (e) {
        console.error('[Dashboard] Erro ao carregar tarefas recentes:', e);
    }
}

// ================================================================
// CHAMADOS RECENTES
// ================================================================
async function loadRecentTickets() {
    try {
        const snap = await getDocs(query(
            collection(db, 'tickets'),
            where('status', 'in', ['open', 'in_progress']),
            orderBy('createdAt', 'desc'),
            limit(5)
        ));
        const tickets = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        const el = document.getElementById('recent-tickets-list');
        if (!el) return;

        if (tickets.length === 0) {
            el.innerHTML = `<div class="empty-state" style="padding:32px">
        <div class="empty-state-icon"><i data-fa-icon="inbox"></i></div>
        <h3>Nenhum chamado aberto</h3>
      </div>`;
            window.renderIcons?.();
            return;
        }

        const SCLASSES = { critical: 'badge-purple', high: 'badge-danger', medium: 'badge-warning', low: 'badge-info' };
        const SLABELS = { critical: 'Crítica', high: 'Alta', medium: 'Média', low: 'Baixa' };

        el.innerHTML = tickets.map(t => `
      <div style="display:flex;align-items:center;gap:12px;padding:14px 20px;border-bottom:1px solid var(--border-light);
                  cursor:pointer;transition:background 0.12s"
           onclick="window.location.href='/pages/tickets.html'"
           onmouseover="this.style.background='var(--n-50)'" onmouseout="this.style.background=''">
        <div style="flex:1;min-width:0">
          <div style="font-size:13px;font-weight:600;color:var(--text-primary);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">
            ${escapeHtml(t.title)}
          </div>
          <div style="display:flex;align-items:center;gap:8px;margin-top:4px">
            <span class="badge ${SCLASSES[t.severity] || 'badge-gray'}">${SLABELS[t.severity] || t.severity}</span>
            <span style="font-size:11px;color:var(--text-muted)">${escapeHtml(t.department || '')}</span>
            <span style="font-size:11px;color:var(--text-muted)">${formatRelative(t.createdAt)}</span>
          </div>
        </div>
        <span class="status-chip status-${t.status}">
          <span class="status-dot"></span>
          ${TICKET_STATUS_LABELS[t.status] || t.status}
        </span>
      </div>`).join('');
        window.renderIcons?.();
    } catch (e) {
        console.error('[Dashboard] Erro ao carregar chamados:', e);
    }
}

// ================================================================
// EVENTOS DE HOJE
// ================================================================
async function loadTodayEvents() {
    try {
        const today = new Date(); today.setHours(0, 0, 0, 0);
        const tomorrow = new Date(today); tomorrow.setDate(today.getDate() + 1);

        const snap = await getDocs(query(
            collection(db, 'events'),
            where('eventDate', '>=', Timestamp.fromDate(today)),
            where('eventDate', '<', Timestamp.fromDate(tomorrow)),
            orderBy('eventDate', 'asc')
        ));
        const events = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        const el = document.getElementById('today-events-list');
        if (!el) return;

        if (events.length === 0) {
            el.innerHTML = `<div style="padding:24px;text-align:center;color:var(--text-muted);font-size:13px">
        <i data-fa-icon="calendar" style="display:block;margin:0 auto 8px;width:22px;height:22px"></i>
        Sem compromissos hoje
      </div>`;
            window.renderIcons?.();
            return;
        }

        el.innerHTML = `<div style="padding:8px">` + events.map(ev => `
      <div style="display:flex;gap:12px;padding:12px;border-radius:10px;margin-bottom:4px;
                  background:var(--n-50);border:1px solid var(--border-light)">
        <div style="width:4px;border-radius:4px;background:var(--color-primary);flex-shrink:0"></div>
        <div style="flex:1;min-width:0">
          <div style="font-size:13px;font-weight:600;color:var(--text-primary)">${escapeHtml(ev.title)}</div>
          <div style="font-size:11px;color:var(--text-muted);margin-top:2px">
            ${ev.startTime ? `${ev.startTime}${ev.endTime ? ' – ' + ev.endTime : ''}` : ''}
            ${ev.location ? ` · ${escapeHtml(ev.location)}` : ''}
          </div>
        </div>
      </div>`).join('') + '</div>';
        window.renderIcons?.();
    } catch (e) {
        console.error('[Dashboard] Erro ao carregar eventos:', e);
    }
}

// ================================================================
// COMUNICADOS RECENTES
// ================================================================
async function loadRecentAnnouncements() {
    try {
        const snap = await getDocs(query(
            collection(db, 'announcements'),
            where('active', '==', true),
            orderBy('publishedAt', 'desc'),
            limit(3)
        ));
        const items = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        const el = document.getElementById('recent-announcements-list');
        if (!el) return;

        if (items.length === 0) {
            el.innerHTML = `<div style="padding:24px;text-align:center;color:var(--text-muted);font-size:13px">
        Nenhum comunicado recente.
      </div>`;
            return;
        }

        el.innerHTML = `<div style="padding:8px">` + items.map(a => `
      <div style="padding:12px;border-radius:10px;margin-bottom:4px;
                  ${a.highlighted ? 'background:var(--color-primary-light);border:1px solid var(--color-primary-border)' : 'background:var(--n-50);border:1px solid var(--border-light)'}">
        ${a.highlighted ? `<span class="badge badge-primary" style="margin-bottom:4px">Destaque</span>` : ''}
        <div style="font-size:13px;font-weight:600;color:var(--text-primary)">${escapeHtml(a.title)}</div>
        <div style="font-size:11px;color:var(--text-muted);margin-top:3px">
          ${escapeHtml(a.authorName || '')} · ${formatRelative(a.publishedAt)}
        </div>
      </div>`).join('') + '</div>';
    } catch (e) {
        console.error('[Dashboard] Erro ao carregar comunicados:', e);
    }
}

init().catch(e => { console.error(e); toast.error('Erro', 'Falha ao carregar o dashboard.'); });
