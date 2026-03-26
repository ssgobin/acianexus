/* ================================================================
   NEXUS — Header Component
   Renderiza o header de cada página interna.
   ================================================================ */

import { signOut } from '../services/auth.service.js';
import { logLogout } from '../services/audit.service.js';
import {
    subscribeToUserNotifications, markAsRead, markAllAsRead, clearAllNotifications,
    NOTIFICATION_TYPES
} from '../services/notifications.service.js';
import { confirmDialog } from './modal.js';
import { ROLE_LABELS, getStoredTheme, setTheme, escapeHtml } from '../utils/helpers.js';
import { formatRelative } from '../utils/date-utils.js';
import { openMobileSidebar } from './sidebar.js';

let _profile = null;
let _unsubNotifs = null;

// ================================================================
// Renderizar Header
// ================================================================
export function renderHeader(profile, pageTitle = '', pageSubtitle = '') {
    _profile = profile;
    const headerEl = document.getElementById('main-header');
    if (!headerEl) return;

    const name = profile?.name || profile?.email || 'Usuário';
    const role = profile?.role || 'viewer';
    const roleLabel = ROLE_LABELS[role] || role;

    headerEl.innerHTML = `
    <!-- Mobile sidebar toggle -->
    <button class="header-btn" id="mobile-menu-btn" aria-label="Menu" style="display:none">
      <i data-fa-icon="menu"></i>
    </button>

    <!-- Page Title -->
    <div class="header-title" id="header-page-title">
      ${pageTitle ? `
        <h1>${pageTitle}</h1>
        ${pageSubtitle ? `<p>${pageSubtitle}</p>` : ''}
      ` : ''}
    </div>

    <div class="header-actions">
      <!-- Dark mode toggle -->
      <button class="header-btn" id="theme-toggle-btn" aria-label="Alternar tema" title="Alternar tema">
        <i data-fa-icon="${getStoredTheme() === 'dark' ? 'sun' : 'moon'}"></i>
      </button>

      <!-- Notifications -->
      <div class="dropdown" id="notif-dropdown-wrapper">
        <button class="header-btn" id="notifications-btn" aria-label="Notificações" title="Notificações">
          <i data-fa-icon="bell"></i>
          <span class="notification-dot" id="notif-dot" style="display:none"></span>
        </button>
        <div class="dropdown-menu notif-dropdown" id="notif-dropdown">
          <div class="notif-header">
            <span>Notificações</span>
            <div style="display:flex;gap:4px">
              <button class="btn btn-ghost btn-xs" onclick="window._clearAllNotifs()">Limpar</button>
              <button class="btn btn-ghost btn-xs" onclick="window._markAllNotifsRead()">Marcar todas como lidas</button>
            </div>
          </div>
          <div id="notif-dropdown-content">
            <div style="padding:20px;text-align:center;color:var(--text-muted)">
                <div class="spinner-sm"></div>
            </div>
          </div>
        </div>
      </div>

      <!-- User menu -->
      <div class="dropdown" id="user-dropdown-wrapper">
        <button class="header-user-btn" id="user-menu-btn">
          <span class="header-user-name">${_escapeHtml(name)}</span>
          <span class="header-user-role-tag">${_escapeHtml(roleLabel)}</span>
          <i data-fa-icon="chevron-down" style="width:13px;height:13px;color:var(--text-muted)"></i>
        </button>
        <div class="dropdown-menu" id="user-dropdown-menu">
          <div class="dropdown-item" style="cursor:default;pointer-events:none;opacity:0.6">
            <i data-fa-icon="user" style="width:14px;height:14px"></i>
            <div>
              <div style="font-size:12px;font-weight:700;color:var(--text-primary)">${_escapeHtml(name)}</div>
              <div style="font-size:11px;color:var(--text-muted)">${_escapeHtml(profile?.email || '')}</div>
            </div>
          </div>
          <div class="dropdown-divider"></div>
          <a href="/pages/profile.html" class="dropdown-item">
            <i data-fa-icon="settings" style="width:14px;height:14px"></i>
            Configurações
          </a>
          <div class="dropdown-divider"></div>
          <div class="dropdown-item danger" id="logout-btn">
            <i data-fa-icon="log-out" style="width:14px;height:14px"></i>
            Sair
          </div>
        </div>
      </div>
    </div>`;

    // Reinicializa ícones
    window.renderIcons?.();

    // === Event Listeners ===

    // Dark mode toggle
    document.getElementById('theme-toggle-btn')?.addEventListener('click', () => {
        const current = getStoredTheme();
        const next = current === 'dark' ? 'light' : 'dark';
        setTheme(next);
        // Atualiza ícone
        const icon = document.querySelector('#theme-toggle-btn i');
        if (icon) {
            icon.setAttribute('data-fa-icon', next === 'dark' ? 'sun' : 'moon');
            window.renderIcons?.();
        }
    });

    // User dropdown toggle
    document.getElementById('user-menu-btn')?.addEventListener('click', (e) => {
        e.stopPropagation();
        const menu = document.getElementById('user-dropdown-menu');
        menu?.classList.toggle('open');
    });

    // Close dropdown on outside click
    document.addEventListener('click', () => {
        document.getElementById('user-dropdown-menu')?.classList.remove('open');
    });

    // Logout
    document.getElementById('logout-btn')?.addEventListener('click', async () => {
        try {
            if (_profile) await logLogout(_profile);
        } catch (e) { /* ignore */ }
        await signOut();
    });

    // Mobile menu
    const mobileBtn = document.getElementById('mobile-menu-btn');
    if (window.innerWidth <= 1024 && mobileBtn) {
        mobileBtn.style.display = 'flex';
        mobileBtn.addEventListener('click', openMobileSidebar);
    }

    // Notifications dropdown
    document.getElementById('notifications-btn')?.addEventListener('click', (e) => {
        e.stopPropagation();
        const menu = document.getElementById('notif-dropdown');
        if (menu) {
            menu.classList.toggle('open');
            if (menu.classList.contains('open')) {
                const notifs = window._cachedNotifs || [];
                renderNotificationDropdown(notifs);
            }
        }
        document.getElementById('user-dropdown-menu')?.classList.remove('open');
    });

    // Setup real-time notifications
    if (_profile?.uid) {
        _unsubNotifs?.();
        _unsubNotifs = subscribeToUserNotifications(_profile.uid, (notifs) => {
            window._cachedNotifs = notifs;
            updateNotificationBadge(notifs);
        });
    }
}

// ================================================================
// Atualizar título da página no header
// ================================================================
export function setHeaderTitle(title, subtitle = '') {
    const el = document.getElementById('header-page-title');
    if (!el) return;
    el.innerHTML = `
    <h1>${_escapeHtml(title)}</h1>
    ${subtitle ? `<p>${_escapeHtml(subtitle)}</p>` : ''}`;
}

// ================================================================
// Mostrar/ocultar dot de notificação
// ================================================================
export function setNotificationDot(visible) {
    const dot = document.getElementById('notif-dot');
    if (dot) dot.style.display = visible ? 'block' : 'none';
}

function _escapeHtml(str = '') {
    return escapeHtml(str);
}

// ================================================================
// Notifications
// ================================================================
function setupNotifications() {
    if (!_profile?.uid) return;
    
    _unsubNotifs?.();
    _unsubNotifs = subscribeToUserNotifications(_profile.uid, (notifs) => {
        updateNotificationBadge(notifs);
    });
}

function updateNotificationBadge(notifs) {
    const unread = notifs.filter(n => !n.read).length;
    const dot = document.getElementById('notif-dot');
    if (dot) dot.style.display = unread > 0 ? 'block' : 'none';
    
    const badge = document.getElementById('notif-count');
    if (badge) badge.textContent = unread > 0 ? unread : '';
    if (badge) badge.style.display = unread > 0 ? 'flex' : 'none';
}

function renderNotificationDropdown(notifs) {
    const container = document.getElementById('notif-dropdown-content');
    if (!container) return;
    
    if (notifs.length === 0) {
        container.innerHTML = `
            <div style="padding:20px;text-align:center;color:var(--text-muted)">
                <i data-fa-icon="bell" style="width:24px;height:24px;opacity:0.3"></i>
                <p style="margin-top:8px;font-size:13px">Nenhuma notificação</p>
            </div>`;
        window.renderIcons?.();
        return;
    }
    
    container.innerHTML = notifs.slice(0, 10).map(n => {
        const icon = getNotificationIcon(n.type);
        const time = formatRelative(n.createdAt);
        return `
            <div class="notif-item${n.read ? '' : ' unread'}" data-id="${n.id}" onclick="window._handleNotificationClick('${n.id}', '${n.entityType}', '${n.entityId}')">
                <div class="notif-icon"><i data-fa-icon="${icon}"></i></div>
                <div class="notif-content">
                    <div class="notif-title">${escapeHtml(n.title)}</div>
                    <div class="notif-message">${escapeHtml(n.message)}</div>
                    <div class="notif-time">${time}</div>
                </div>
            </div>`;
    }).join('');
    
    window.renderIcons?.();
}

function getNotificationIcon(type) {
    const icons = {
        [NOTIFICATION_TYPES.TASK_ASSIGNED]: 'user-check',
        [NOTIFICATION_TYPES.TASK_MOVED]: 'arrow-right',
        [NOTIFICATION_TYPES.TASK_UPDATED]: 'edit',
        [NOTIFICATION_TYPES.TASK_DELETED]: 'trash-2',
        [NOTIFICATION_TYPES.TASK_NEAR_DUE]: 'alert-circle',
        [NOTIFICATION_TYPES.TASK_OVERDUE]: 'alert-octagon',
        [NOTIFICATION_TYPES.TICKET_REPLIED]: 'message-square',
        [NOTIFICATION_TYPES.TICKET_STATUS_CHANGED]: 'refresh-cw',
        [NOTIFICATION_TYPES.ANNOUNCEMENT_NEW]: 'megaphone',
    };
    return icons[type] || 'bell';
}

window._handleNotificationClick = async function(notifId, entityType, entityId) {
    await markAsRead(notifId);
    if (entityType === 'task') {
        window.navigateTo?.('tasks');
    } else if (entityType === 'ticket') {
        window.navigateTo?.('tickets');
    } else if (entityType === 'announcement') {
        window.navigateTo?.('announcements');
    }
    document.getElementById('notif-dropdown')?.classList.remove('open');
};

window._markAllNotifsRead = async function() {
    if (!_profile?.uid) return;
    await markAllAsRead(_profile.uid);
    window._cachedNotifs = window._cachedNotifs.map(n => ({ ...n, read: true }));
    renderNotificationDropdown(window._cachedNotifs);
    updateNotificationBadge(window._cachedNotifs);
};

window._clearAllNotifs = async function() {
    if (!_profile?.uid) return;
    const confirmed = await confirmDialog('Limpar Notificações', 'Tem certeza que deseja remover todas as notificações?', 'Limpar', true);
    if (!confirmed) return;
    await clearAllNotifications(_profile.uid);
    window._cachedNotifs = [];
    renderNotificationDropdown(window._cachedNotifs);
    updateNotificationBadge(window._cachedNotifs);
};
