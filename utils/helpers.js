/* ================================================================
   NEXUS — Helpers / Utilities
   Funções auxiliares reutilizáveis em toda a aplicação.
   ================================================================ */

// ================================================================
// GERAR UID SIMPLES (para IDs de checklist, atividades locais, etc.)
// ================================================================
export function uid() {
    return Date.now().toString(36) + Math.random().toString(36).substring(2, 8);
}

// ================================================================
// INICIAIS DE NOME (para avatares)
// ================================================================
export function getInitials(name = '') {
    const parts = name.trim().split(/\s+/);
    if (parts.length === 0 || !parts[0]) return '?';
    if (parts.length === 1) return parts[0][0].toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

// ================================================================
// PLURALIZAR
// ================================================================
export function pluralize(n, singular, plural) {
    return n === 1 ? singular : (plural || singular + 's');
}

// ================================================================
// CLONAR OBJETO SIMPLES (sem referências circulares)
// ================================================================
export function deepClone(obj) {
    return JSON.parse(JSON.stringify(obj));
}

// ================================================================
// DEBOUNCE
// ================================================================
export function debounce(fn, delay = 300) {
    let timer;
    return (...args) => {
        clearTimeout(timer);
        timer = setTimeout(() => fn(...args), delay);
    };
}

// ================================================================
// LIMITAR TEXTO (truncate)
// ================================================================
export function truncateText(text = '', maxLength = 80) {
    if (text.length <= maxLength) return text;
    return text.substring(0, maxLength).trimEnd() + '…';
}

// ================================================================
// GERAR COR DETERMINÍSTICA A PARTIR DE STRING
// (Para avatares e tags coloridas)
// ================================================================
const AVATAR_COLORS = [
    '#4F46E5', '#7C3AED', '#DB2777', '#DC2626',
    '#EA580C', '#D97706', '#059669', '#0284C7',
    '#0891B2', '#4338CA', '#7E22CE', '#BE185D'
];
export function stringToColor(str = '') {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        hash = str.charCodeAt(i) + ((hash << 5) - hash);
    }
    return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

// ================================================================
// ESCAPE HTML (prevenção XSS básica sem DOMPurify)
// Use sanitize() de sanitizer.js para conteúdo HTML rico
// ================================================================
export function escapeHtml(str = '') {
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#x27;');
}

// ================================================================
// FORMATAR BYTES
// ================================================================
export function formatBytes(bytes) {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

// ================================================================
// ORDENAÇÃO SEGURA DE ARRAY
// ================================================================
export function sortBy(arr, key, order = 'asc') {
    return [...arr].sort((a, b) => {
        let valA = a[key], valB = b[key];
        if (typeof valA === 'string') valA = valA.toLowerCase();
        if (typeof valB === 'string') valB = valB.toLowerCase();
        if (valA < valB) return order === 'asc' ? -1 : 1;
        if (valA > valB) return order === 'asc' ? 1 : -1;
        return 0;
    });
}

// ================================================================
// AGRUPAR ARRAY POR CHAVE
// ================================================================
export function groupBy(arr, key) {
    return arr.reduce((acc, item) => {
        const k = item[key] ?? 'undefined';
        if (!acc[k]) acc[k] = [];
        acc[k].push(item);
        return acc;
    }, {});
}

// ================================================================
// STATUS LABELS
// ================================================================
export const TASK_STATUS_LABELS = {
    todo: 'A Fazer',
    in_progress: 'Em andamento',
    review: 'Em revisão',
    done: 'Concluída',
    backlog: 'Backlog'
};
export const TICKET_STATUS_LABELS = {
    open: 'Aberto',
    in_progress: 'Em andamento',
    resolved: 'Resolvido',
    closed: 'Fechado'
};
export const EVENT_STATUS_LABELS = {
    scheduled: 'Agendado',
    confirmed: 'Confirmado',
    cancelled: 'Cancelado',
    completed: 'Realizado'
};
export const ROLE_LABELS = {
    admin: 'Administrador',
    editor: 'Editor',
    viewer: 'Visualizador'
};
export const SEVERITY_LABELS = {
    critical: 'Crítica',
    high: 'Alta',
    medium: 'Média',
    low: 'Baixa'
};
export const BOARD_LABELS = {
    default: 'Tarefas'
};
export const FREQUENCY_LABELS = {
    daily: 'Diária',
    weekly: 'Semanal',
    biweekly: 'Quinzenal',
    monthly: 'Mensal',
    specific_days: 'Dias específicos'
};
export const DAY_NAMES = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

// ================================================================
// LOADING STATE HELPERS
// ================================================================
export function showLoading(containerId) {
    const el = document.getElementById(containerId);
    if (!el) return;
    el.innerHTML = `
    <div class="page-loader">
      <div class="spinner spinner-lg"></div>
      <p>Carregando…</p>
    </div>`;
}

export function showEmpty(containerId, message = 'Nenhum item encontrado', subtext = '', action = '') {
    const el = document.getElementById(containerId);
    if (!el) return;
    el.innerHTML = `
    <div class="empty-state">
      <div class="empty-state-icon">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
          <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
        </svg>
      </div>
      <h3>${escapeHtml(message)}</h3>
      ${subtext ? `<p>${escapeHtml(subtext)}</p>` : ''}
      ${action}
    </div>`;
}

// ================================================================
// DETECTAR TEMA SALVO
// ================================================================
export function getStoredTheme() {
    return localStorage.getItem('nexus_theme') || 'light';
}
export function setTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('nexus_theme', theme);
}

// ================================================================
// PERMISSÃO DE LEITURA PARA CAMPO SENSÍVEL
// ================================================================
export function canPerformAction(profile, action) {
    const rules = {
        create_task: ['editor', 'admin'],
        edit_task: ['editor', 'admin'],
        delete_task: ['admin'],
        manage_members: ['admin'],
        view_audit: ['admin'],
        create_announcement: ['editor', 'admin'],
        publish_announcement: ['editor', 'admin'],
        assign_ticket: ['editor', 'admin'],
        close_ticket: ['editor', 'admin'],
        view_all_reports: ['editor', 'admin'],
        change_roles: ['admin'],
    };
    const allowed = rules[action] || [];
    return allowed.includes(profile?.role);
}
