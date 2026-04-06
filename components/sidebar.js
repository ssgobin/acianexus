/* ================================================================
   NEXUS — Sidebar Component
   Renderiza a barra lateral de navegação em todas as páginas
   internas. Importar e chamar renderSidebar(activePage, profile).
   ================================================================ */

import { getInitials, stringToColor } from '../utils/helpers.js';
import { ROLE_LABELS } from '../utils/helpers.js';

// ================================================================
// Definição dos itens de navegação
// ================================================================
const SIDEBAR_KEY = 'nexus_sidebar_collapsed';

function getSidebarCollapsed() {
    try {
        return localStorage.getItem(SIDEBAR_KEY) === 'true';
    } catch { return false; }
}

function setSidebarCollapsed(collapsed) {
    try {
        localStorage.setItem(SIDEBAR_KEY, collapsed);
    } catch {}
}

const NAV_ITEMS = [
    {
        section: 'Principal',
        items: [
            { id: 'dashboard', label: 'Dashboard', href: '/dashboard.html', icon: 'layout-dashboard' },
            { id: 'tasks', label: 'Tarefas', href: '/pages/tasks.html', icon: 'kanban' },
            { id: 'routines', label: 'Rotinas', href: '/pages/routines.html', icon: 'repeat' },
            { id: 'agenda', label: 'Agenda', href: '/pages/agenda.html', icon: 'calendar-days' },
        ]
    },
    {
        section: 'Operação',
        items: [
            { id: 'tickets', label: 'Chamados', href: '/pages/tickets.html', icon: 'ticket' },
            { id: 'reports', label: 'Relatório Diário', href: '/pages/reports.html', icon: 'file-text' },
            { id: 'announcements', label: 'Comunicados', href: '/pages/announcements.html', icon: 'megaphone' },
            { id: 'chat', label: 'Chat', href: '/pages/chat.html', icon: 'message-square' },
        ]
    },
    {
        section: 'Análise',
        items: [
            { id: 'analytics', label: 'Analytics', href: '/pages/analytics.html', icon: 'bar-chart-2' },
        ]
    },
    {
        section: 'Administração',
        items: [
            { id: 'members', label: 'Membros', href: '/pages/members.html', icon: 'users', roles: ['admin'] },
            { id: 'audit', label: 'Auditoria', href: '/pages/audit.html', icon: 'shield-check', roles: ['admin'] },
        ]
    }
];

// ================================================================
// Renderizar Sidebar
// ================================================================
export function renderSidebar(activePage, profile) {
    const sidebarEl = document.getElementById('sidebar');
    if (!sidebarEl) return;

    const role = profile?.role || 'viewer';
    const name = profile?.name || profile?.email || 'Usuário';
    const color = stringToColor(name);
    const initials = getInitials(name);
    const roleLabel = ROLE_LABELS[role] || role;

    // Gerar HTML dos itens de navegação
    let navHtml = '';
    for (const section of NAV_ITEMS) {
        const visibleItems = section.items.filter(item =>
            !item.roles || item.roles.includes(role)
        );
        if (visibleItems.length === 0) continue;

        navHtml += `<div class="sidebar-section-label">${section.section}</div>`;
        for (const item of visibleItems) {
            const isActive = item.id === activePage ? 'active' : '';
            navHtml += `
        <a class="sidebar-link ${isActive}" href="${item.href}" data-page="${item.id}">
          <span class="link-icon">
            <i data-fa-icon="${item.icon}"></i>
          </span>
          <span class="link-text">${item.label}</span>
        </a>`;
        }
    }

    sidebarEl.innerHTML = `
    <div class="sidebar-brand">
      <img src="/img/logoacianexus_wbg.png" alt="Nexus" class="sidebar-logo-img">
      <div class="sidebar-brand-text">
        <div class="sidebar-brand-name">Nexus</div>
        <div class="sidebar-brand-tagline">Management Platform</div>
      </div>
    </div>

    <button class="sidebar-toggle-btn" id="sidebar-toggle-btn" title="Colapsar sidebar">
        <i data-fa-icon="chevron-left"></i>
    </button>

    <nav class="sidebar-nav" id="sidebar-nav">
      ${navHtml}
    </nav>

    <div class="sidebar-footer">
      <div class="sidebar-user-card" id="sidebar-user-card" title="${name}">
        <div class="sidebar-avatar" style="background: linear-gradient(135deg, ${color}, ${color}cc)">
          ${initials}
        </div>
        <div class="sidebar-user-info">
          <div class="sidebar-user-name">${name}</div>
          <div class="sidebar-user-role">${roleLabel}</div>
        </div>
      </div>
    </div>`;

    // Aplica estado de collapse
    const collapsed = getSidebarCollapsed();
    if (collapsed) {
        sidebarEl.classList.add('collapsed');
    }

    // Toggle button event
    const toggleBtn = document.getElementById('sidebar-toggle-btn');
    toggleBtn?.addEventListener('click', (e) => {
        e.stopPropagation();
        const sidebar = document.getElementById('sidebar');
        const mainWrapper = document.getElementById('main-wrapper');
        const isCollapsed = sidebar.classList.toggle('collapsed');
        setSidebarCollapsed(isCollapsed);
        if (mainWrapper) {
            mainWrapper.classList.toggle('collapsed', isCollapsed);
        }
        setTimeout(() => window.renderIcons?.(), 100);
    });

    // Aplica also ao main-wrapper na inicialização
    if (collapsed) {
        const mainWrapper = document.getElementById('main-wrapper');
        if (mainWrapper) mainWrapper.classList.add('collapsed');
    }

    // Inicializa ícones Lucide
    window.renderIcons?.();

    // Prefetch on hover - pré-carrega a página ao passar o mouse
    sidebarEl.addEventListener('mouseenter', e => {
        const link = e.target.closest('.sidebar-link');
        if (link && !link.dataset.prefetched) {
            link.dataset.prefetched = 'true';
            const href = link.getAttribute('href');
            if (href) {
                const linkEl = document.createElement('link');
                linkEl.rel = 'prefetch';
                linkEl.href = href;
                document.head.appendChild(linkEl);
            }
        }
    }, true);

    // Evento: colapsar/expandir sidebar
    sidebarEl.addEventListener('click', e => {
        const link = e.target.closest('.sidebar-link');
        if (link) return; // deixa navegação normal
    });

    // Handle colapso via toggle button (se existir)
    setupSidebarToggle(sidebarEl);

    // Card do usuário — futuramente pode abrir menu de perfil
    document.getElementById('sidebar-user-card')?.addEventListener('click', () => {
        window.location.href = '/pages/profile.html';
    });
}

// ================================================================
// Lógica de colapso da sidebar
// ================================================================
function setupSidebarToggle(sidebarEl) {
    const mainWrapper = document.querySelector('.main-wrapper');
    const isCollapsed = localStorage.getItem('nexus_sidebar_collapsed') === 'true';

    if (isCollapsed) {
        sidebarEl.classList.add('collapsed');
        mainWrapper?.classList.add('collapsed');
    }

    // Botão de toggle no header (se houver)
    window._toggleSidebar = () => {
        const collapsed = sidebarEl.classList.toggle('collapsed');
        mainWrapper?.classList.toggle('collapsed', collapsed);
        localStorage.setItem('nexus_sidebar_collapsed', String(collapsed));
    };

    // Backdrop mobile
    document.addEventListener('click', e => {
        if (window.innerWidth <= 1024) {
            const backdrop = document.getElementById('sidebar-backdrop');
            if (backdrop && e.target === backdrop) {
                sidebarEl.classList.remove('mobile-open');
                backdrop.classList.remove('visible');
            }
        }
    });
}

// ================================================================
// Abrir sidebar em mobile
// ================================================================
export function openMobileSidebar() {
    const sidebarEl = document.getElementById('sidebar');
    let backdrop = document.getElementById('sidebar-backdrop');

    if (!backdrop) {
        backdrop = document.createElement('div');
        backdrop.id = 'sidebar-backdrop';
        backdrop.className = 'sidebar-backdrop';
        document.body.appendChild(backdrop);
    }

    sidebarEl.classList.add('mobile-open');
    backdrop.classList.add('visible');
}
