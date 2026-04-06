/* ================================================================
   NEXUS — Analytics Module
   Indicadores de desempenho operacional com Chart.js.
   ================================================================ */

import { requireAuth } from '/services/auth.service.js';
import { db } from '/services/firebase-config.js';
import {
    collection, query, where, orderBy, getDocs, Timestamp
} from 'firebase/firestore';
import { renderSidebar } from '/components/sidebar.js';
import { renderHeader } from '/components/header.js';
import { toast } from '/components/toast.js';
import { formatDate, tsToDate } from '/utils/date-utils.js';
import {
    escapeHtml, TASK_STATUS_LABELS, TICKET_STATUS_LABELS, SEVERITY_LABELS,
    getStoredTheme, setTheme, BOARD_LABELS
} from '/utils/helpers.js';

let _profile = null;
let _charts = {};

// ================================================================
// INIT
// ================================================================
async function init() {
    setTheme(getStoredTheme());

    _profile = await requireAuth('viewer');
    if (!_profile) return;

    renderSidebar('analytics', _profile);
    renderHeader(_profile, 'Analytics', 'Indicadores e desempenho operacional');

    document.getElementById('page-content').innerHTML = buildLayout();

    await loadAllData();

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
        <h2>Analytics</h2>
        <p>Visão consolidada de métricas operacionais</p>
      </div>
      <div class="page-header-actions">
        <select id="analytics-period" class="form-select form-select-sm" onchange="window._refreshAnalytics()">
          <option value="30">Últimos 30 dias</option>
          <option value="90">Últimos 90 dias</option>
          <option value="180">Últimos 6 meses</option>
          <option value="365">Último ano</option>
        </select>
        <button class="btn btn-secondary btn-sm" onclick="window._refreshAnalytics()">
          <i data-fa-icon="refresh-cw"></i>
        </button>
      </div>
    </div>

    <!-- KPI Cards -->
    <div class="stats-grid" id="kpi-cards">
      ${Array(6).fill(0).map(() => `<div class="stat-card skeleton" style="height:110px"></div>`).join('')}
    </div>

    <!-- Charts Grid -->
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:20px;margin-top:4px">
      <!-- Tasks by Status -->
      <div class="card">
        <div class="card-header"><h3>Tarefas por Status</h3></div>
        <div class="card-body" style="height:260px;display:flex;align-items:center;justify-content:center">
          <canvas id="chart-tasks-status"></canvas>
        </div>
      </div>

      <!-- Tasks by Board -->
      <div class="card">
        <div class="card-header"><h3>Tarefas por Board</h3></div>
        <div class="card-body" style="height:260px">
          <canvas id="chart-tasks-board"></canvas>
        </div>
      </div>

      <!-- Tickets by Severity -->
      <div class="card">
        <div class="card-header"><h3>Chamados por Severidade</h3></div>
        <div class="card-body" style="height:260px;display:flex;align-items:center;justify-content:center">
          <canvas id="chart-tickets-severity"></canvas>
        </div>
      </div>

      <!-- Tickets Over Time -->
      <div class="card">
        <div class="card-header"><h3>Chamados Abertos por Mês</h3></div>
        <div class="card-body" style="height:260px">
          <canvas id="chart-tickets-time"></canvas>
        </div>
      </div>
    </div>

    <!-- Full-width: Task completion rate -->
    <div class="card mt-5">
      <div class="card-header"><h3>Taxa de Conclusão de Tarefas – Últimas 8 Semanas</h3></div>
      <div class="card-body" style="height:240px">
        <canvas id="chart-completion-rate"></canvas>
      </div>
    </div>

    <!-- Members productivity table -->
    <div class="card mt-5">
      <div class="card-header"><h3>Produtividade por Membro</h3></div>
      <div class="table-wrapper" id="productivity-table">
        <div class="page-loader"><div class="spinner"></div></div>
      </div>
    </div>`;
}

// ================================================================
// CARREGAR DADOS E RENDERIZAR
// ================================================================
async function loadAllData() {
    try {
        const periodDays = parseInt(document.getElementById('analytics-period')?.value || 30);
        const fromDate = new Date();
        fromDate.setDate(fromDate.getDate() - periodDays);
        fromDate.setHours(0, 0, 0, 0);
        const fromTs = Timestamp.fromDate(fromDate);

        const [tasksSnap, ticketsSnap, reportsSnap] = await Promise.all([
            getDocs(collection(db, 'tasks')),
            getDocs(collection(db, 'tickets')),
            getDocs(query(collection(db, 'dailyReports'), where('createdAt', '>=', fromTs))),
        ]);

        const tasks = tasksSnap.docs.map(d => ({ id: d.id, ...d.data() }));
        const tickets = ticketsSnap.docs.map(d => ({ id: d.id, ...d.data() }));
        const reports = reportsSnap.docs.map(d => ({ id: d.id, ...d.data() }));

        renderKpis(tasks, tickets);
        renderCharts(tasks, tickets);
        renderProductivityTable(reports);
    } catch (e) {
        console.error('[Analytics] Load error:', e);
        toast.error('Erro', 'Não foi possível carregar os dados.');
    }
}

window._refreshAnalytics = function () { loadAllData(); };

// ================================================================
// KPIs
// ================================================================
function renderKpis(tasks, tickets) {
    const total = tasks.length;
    const done = tasks.filter(t => t.status === 'done').length;
    const overdue = tasks.filter(t => {
        if (!t.dueDate) return false;
        const due = tsToDate(t.dueDate);
        return due && due < new Date() && t.status !== 'done' && t.status !== 'cancelled';
    }).length;
    const inProgress = tasks.filter(t => t.status === 'in_progress').length;
    const openTickets = tickets.filter(t => t.status === 'open').length;
    const slaBreached = tickets.filter(t => {
        if (!t.slaDeadline || t.status === 'resolved' || t.status === 'closed') return false;
        const sla = tsToDate(t.slaDeadline);
        return sla && sla < new Date();
    }).length;
    const completionRate = total > 0 ? Math.round((done / total) * 100) : 0;

    document.getElementById('kpi-cards').innerHTML = `
    ${kpiCard('Tarefas Totais', total, 'clipboard-list', 'var(--color-primary)', 'var(--color-primary-light)')}
    ${kpiCard('Concluídas', done, 'check-circle-2', 'var(--color-success)', 'var(--color-success-light)', `${completionRate}% de conclusão`)}
    ${kpiCard('Em Andamento', inProgress, 'loader-2', 'var(--color-info)', 'var(--color-info-light)')}
    ${kpiCard('Vencidas', overdue, 'alert-triangle', 'var(--color-danger)', 'var(--color-danger-light)', overdue > 0 ? 'Ação necessária' : 'Tudo em dia')}
    ${kpiCard('Chamados Abertos', openTickets, 'ticket', 'var(--color-warning)', 'var(--color-warning-light)')}
    ${kpiCard('SLA Vencido', slaBreached, 'clock', 'var(--clr-purple-500)', 'var(--clr-purple-50)', slaBreached > 0 ? 'Chamados em atraso' : 'SLA dentro do prazo')}`;
    window.renderIcons?.();
}

function kpiCard(label, value, icon, color, bg, trend = '') {
    return `
    <div class="stat-card">
      <div class="stat-card-icon" style="background:${bg};color:${color}">
        <i data-fa-icon="${icon}"></i>
      </div>
      <div class="stat-card-content">
        <div class="stat-card-label">${label}</div>
        <div class="stat-card-value">${value}</div>
        ${trend ? `<div class="stat-card-trend" style="color:${color}">${trend}</div>` : ''}
      </div>
    </div>`;
}

// ================================================================
// GRÁFICOS
// ================================================================
function renderCharts(tasks, tickets) {
    const isDark = document.documentElement.dataset.theme === 'dark';
    const textColor = isDark ? '#94A3B8' : '#475569';
    const gridColor = isDark ? '#1E2D45' : '#F1F5F9';

    const Chart = window.Chart;
    if (!Chart) {
        console.warn('[Analytics] Chart.js não carregado');
        return;
    }

    // Destroy existing charts
    Object.values(_charts).forEach(c => { try { c.destroy(); } catch (e) { } });
    _charts = {};

    // ---- Tarefas por Status (Doughnut) ----
    const statusCounts = {};
    Object.keys(TASK_STATUS_LABELS).forEach(k => { statusCounts[k] = 0; });
    tasks.forEach(t => { if (statusCounts[t.status] !== undefined) statusCounts[t.status]++; else statusCounts[t.status] = 1; });

    const statusColors = {
        todo: '#94A3B8', in_progress: '#4F46E5', review: '#F59E0B', done: '#10B981', cancelled: '#EF4444'
    };

    const ctx1 = document.getElementById('chart-tasks-status')?.getContext('2d');
    if (ctx1) {
        _charts.tasksStatus = new Chart(ctx1, {
            type: 'doughnut',
            data: {
                labels: Object.keys(statusCounts).map(k => TASK_STATUS_LABELS[k] || k),
                datasets: [{
                    data: Object.values(statusCounts),
                    backgroundColor: Object.keys(statusCounts).map(k => statusColors[k] || '#CBD5E1'),
                    borderWidth: 2, borderColor: isDark ? '#111827' : '#FFFFFF',
                }]
            },
            options: {
                responsive: true, maintainAspectRatio: false,
                plugins: { legend: { position: 'right', labels: { color: textColor, font: { size: 12 }, padding: 12 } } }
            }
        });
    }

    // ---- Tarefas por Board (Bar) ----
    const boardCounts = {};
    tasks.forEach(t => { boardCounts[t.board || 'kanban'] = (boardCounts[t.board || 'kanban'] || 0) + 1; });

    const ctx2 = document.getElementById('chart-tasks-board')?.getContext('2d');
    if (ctx2) {
        _charts.tasksBoard = new Chart(ctx2, {
            type: 'bar',
            data: {
                labels: Object.keys(boardCounts).map(k => BOARD_LABELS[k] || k),
                datasets: [{
                    label: 'Tarefas',
                    data: Object.values(boardCounts),
                    backgroundColor: '#4F46E5CC',
                    borderColor: '#4F46E5',
                    borderWidth: 1, borderRadius: 6,
                }]
            },
            options: {
                responsive: true, maintainAspectRatio: false,
                plugins: { legend: { display: false } },
                scales: {
                    y: { ticks: { color: textColor, stepSize: 1 }, grid: { color: gridColor } },
                    x: { ticks: { color: textColor }, grid: { display: false } }
                }
            }
        });
    }

    // ---- Chamados por Severidade (Doughnut) ----
    const sevColors = { critical: '#9333EA', high: '#EF4444', medium: '#F59E0B', low: '#3B82F6' };
    const sevCounts = { critical: 0, high: 0, medium: 0, low: 0 };
    tickets.forEach(t => { if (sevCounts[t.severity] !== undefined) sevCounts[t.severity]++; });

    const ctx3 = document.getElementById('chart-tickets-severity')?.getContext('2d');
    if (ctx3) {
        _charts.ticketsSev = new Chart(ctx3, {
            type: 'doughnut',
            data: {
                labels: Object.keys(SEVERITY_LABELS).map(k => SEVERITY_LABELS[k]),
                datasets: [{
                    data: Object.values(sevCounts),
                    backgroundColor: Object.keys(sevCounts).map(k => sevColors[k]),
                    borderWidth: 2, borderColor: isDark ? '#111827' : '#FFFFFF',
                }]
            },
            options: {
                responsive: true, maintainAspectRatio: false,
                plugins: { legend: { position: 'right', labels: { color: textColor, font: { size: 12 }, padding: 12 } } }
            }
        });
    }

    // ---- Chamados por Mês (Line/Bar) ----
    const last6Months = [];
    for (let i = 5; i >= 0; i--) {
        const d = new Date();
        d.setDate(1);
        d.setMonth(d.getMonth() - i);
        last6Months.push({ year: d.getFullYear(), month: d.getMonth(), label: d.toLocaleDateString('pt-BR', { month: 'short', year: '2-digit' }) });
    }
    const monthCounts = last6Months.map(m => {
        return tickets.filter(t => {
            const d = tsToDate(t.createdAt);
            return d && d.getFullYear() === m.year && d.getMonth() === m.month;
        }).length;
    });

    const ctx4 = document.getElementById('chart-tickets-time')?.getContext('2d');
    if (ctx4) {
        _charts.ticketsTime = new Chart(ctx4, {
            type: 'bar',
            data: {
                labels: last6Months.map(m => m.label),
                datasets: [{
                    label: 'Chamados',
                    data: monthCounts,
                    backgroundColor: '#10B981AA',
                    borderColor: '#10B981',
                    borderWidth: 1, borderRadius: 6,
                }]
            },
            options: {
                responsive: true, maintainAspectRatio: false,
                plugins: { legend: { display: false } },
                scales: {
                    y: { ticks: { color: textColor, stepSize: 1 }, grid: { color: gridColor } },
                    x: { ticks: { color: textColor }, grid: { display: false } }
                }
            }
        });
    }

    // ---- Completion Rate (Line) ----
    const weeks = [];
    for (let i = 7; i >= 0; i--) {
        const weekStart = new Date();
        weekStart.setDate(weekStart.getDate() - i * 7);
        weekStart.setHours(0, 0, 0, 0);
        const weekEnd = new Date(weekStart);
        weekEnd.setDate(weekEnd.getDate() + 7);
        const weekTasks = tasks.filter(t => { const d = tsToDate(t.createdAt); return d >= weekStart && d < weekEnd; });
        const weekDone = weekTasks.filter(t => t.status === 'done').length;
        const rate = weekTasks.length > 0 ? Math.round((weekDone / weekTasks.length) * 100) : 0;
        weeks.push({ label: `S${8 - i}`, rate });
    }

    const ctx5 = document.getElementById('chart-completion-rate')?.getContext('2d');
    if (ctx5) {
        _charts.completionRate = new Chart(ctx5, {
            type: 'line',
            data: {
                labels: weeks.map(w => w.label),
                datasets: [{
                    label: 'Taxa de Conclusão (%)',
                    data: weeks.map(w => w.rate),
                    borderColor: '#4F46E5',
                    backgroundColor: '#4F46E522',
                    fill: true, tension: 0.4, pointRadius: 5,
                    pointBackgroundColor: '#4F46E5',
                }]
            },
            options: {
                responsive: true, maintainAspectRatio: false,
                plugins: {
                    legend: { labels: { color: textColor, font: { size: 12 } } },
                    tooltip: { callbacks: { label: ctx => `${ctx.parsed.y}%` } }
                },
                scales: {
                    y: { min: 0, max: 100, ticks: { color: textColor, callback: v => v + '%' }, grid: { color: gridColor } },
                    x: { ticks: { color: textColor }, grid: { display: false } }
                }
            }
        });
    }
}

// ================================================================
// TABELA DE PRODUTIVIDADE
// ================================================================
function renderProductivityTable(reports) {
    const container = document.getElementById('productivity-table');
    if (!container) return;

    // Agregar minutos por usuário
    const byUser = {};
    reports.forEach(r => {
        if (!byUser[r.userId]) byUser[r.userId] = { name: r.userName, totalMins: 0, days: 0 };
        byUser[r.userId].totalMins += (r.totalMinutes || 0);
        byUser[r.userId].days++;
    });

    const users = Object.entries(byUser).sort((a, b) => b[1].totalMins - a[1].totalMins);

    if (users.length === 0) {
        container.innerHTML = `<div style="padding:32px;text-align:center;color:var(--text-muted);font-size:13px">
      Nenhum relatório no período selecionado.
    </div>`; return;
    }

    container.innerHTML = `
    <table class="table">
      <thead>
        <tr>
          <th>Colaborador</th>
          <th>Dias com Relatório</th>
          <th>Total de Horas</th>
          <th>Média Diária</th>
        </tr>
      </thead>
      <tbody>
        ${users.map(([uid, u]) => {
        const h = Math.floor(u.totalMins / 60);
        const m = u.totalMins % 60;
        const avgMins = u.days > 0 ? Math.round(u.totalMins / u.days) : 0;
        const avgH = Math.floor(avgMins / 60);
        const avgM = avgMins % 60;
        return `
            <tr>
              <td style="display:flex;align-items:center;gap:8px">
                <div class="assignee-avatar-sm" style="background:${stringToColor(u.name || '')}" >${getInitials2(u.name)}</div>
                <span>${escapeHtml(u.name)}</span>
              </td>
              <td><strong>${u.days}</strong> dias</td>
              <td><strong>${h}h ${m.toString().padStart(2, '0')}min</strong></td>
              <td>${avgH}h ${avgM.toString().padStart(2, '0')}min</td>
            </tr>`;
    }).join('')}
      </tbody>
    </table>`;
}

function getInitials2(name) {
    if (!name) return '?';
    const parts = name.trim().split(' ');
    if (parts.length === 1) return parts[0][0].toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

init().catch(e => { console.error(e); toast.error('Erro', 'Falha ao carregar módulo de analytics.'); });

if (document.getElementById('page-content')) {
    init().catch(e => { console.error(e); toast.error('Erro', 'Falha ao carregar módulo de analytics.'); });
}
