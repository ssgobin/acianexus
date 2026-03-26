/* ================================================================
   NEXUS — Toast Notification Component
   Sistema de notificações de feedback ao usuário.
   
   Uso:
     import { showToast } from '../components/toast.js';
     showToast('success', 'Saved!', 'Task updated.');
     showToast('error',   'Error!', 'Something went wrong.');
     showToast('warning', 'Heads up', 'Draft saved.');
     showToast('info',    'Info',    'Loading data…');
   ================================================================ */

// Garante que o container existe
function getContainer() {
    let container = document.getElementById('toast-container');
    if (!container) {
        container = document.createElement('div');
        container.id = 'toast-container';
        container.className = 'toast-container';
        document.body.appendChild(container);
    }
    return container;
}

const ICONS = {
    success: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
    <path d="M20 6 9 17l-5-5"/></svg>`,
    error: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
    <circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/>
    <line x1="9" y1="9" x2="15" y2="15"/></svg>`,
    warning: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
    <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/>
    <line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>`,
    info: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
    <circle cx="12" cy="12" r="10"/>
    <line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>`,
};

// ================================================================
// showToast — principal função de notificação
// ================================================================
export function showToast(type = 'info', title = '', message = '', duration = 4000) {
    const container = getContainer();

    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.setAttribute('role', 'alert');
    toast.setAttribute('aria-live', 'polite');

    toast.innerHTML = `
    <div class="toast-icon">${ICONS[type] || ICONS.info}</div>
    <div class="toast-content">
      ${title ? `<div class="toast-title">${_escapeHtml(title)}</div>` : ''}
      ${message ? `<div class="toast-msg">${_escapeHtml(message)}</div>` : ''}
    </div>
    <button class="toast-close" aria-label="Fechar">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
        <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
      </svg>
    </button>
    <div class="toast-progress" style="width:100%;transition:width ${duration}ms linear"></div>`;

    container.appendChild(toast);

    // Animate in
    requestAnimationFrame(() => {
        requestAnimationFrame(() => {
            toast.classList.add('show');
            // Start progress bar
            const bar = toast.querySelector('.toast-progress');
            if (bar) {
                requestAnimationFrame(() => { bar.style.width = '0%'; });
            }
        });
    });

    // Auto dismiss
    const timer = setTimeout(() => dismiss(toast), duration);

    // Manual close
    toast.querySelector('.toast-close')?.addEventListener('click', () => {
        clearTimeout(timer);
        dismiss(toast);
    });

    // Max 5 toasts
    const toasts = container.querySelectorAll('.toast');
    if (toasts.length > 5) dismiss(toasts[0]);

    return toast;
}

function dismiss(toast) {
    toast.classList.remove('show');
    toast.classList.add('hiding');
    setTimeout(() => toast.remove(), 350);
}

function _escapeHtml(str = '') {
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

// Shorthands
export const toast = {
    success: (title, msg, dur) => showToast('success', title, msg, dur),
    error: (title, msg, dur) => showToast('error', title, msg, dur),
    warning: (title, msg, dur) => showToast('warning', title, msg, dur),
    info: (title, msg, dur) => showToast('info', title, msg, dur),
};
