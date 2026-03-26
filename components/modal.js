/* ================================================================
   NEXUS — Modal Component
   Modal genérico reutilizável em toda a aplicação.
   
   Uso:
     import { openModal, closeModal, createModal } from '../components/modal.js';
     
     // Criar e abrir modal customizado:
     const modal = createModal({
       id: 'task-modal',
       title: 'Nova Tarefa',
       subtitle: 'Preencha os dados abaixo',
       size: 'lg',        // sm | md | lg | xl | full
       body: '<p>HTML do conteúdo</p>',
       footer: `<button class="btn btn-secondary" onclick="closeModal('task-modal')">Cancelar</button>
                <button class="btn btn-primary" id="save-btn">Salvar</button>`
     });
     
     // Abrir modal existente:
     openModal('task-modal');
     
     // Fechar modal:
     closeModal('task-modal');
   ================================================================ */

// ================================================================
// Criar e injetar um modal no DOM
// Retorna: elemento do modal
// ================================================================
export function createModal({ id, title, subtitle = '', size = 'md', body = '', footer = '', onClose = null }) {
    // Remove modal existente com mesmo id
    document.getElementById(id)?.remove();
    document.getElementById(`${id}-overlay`)?.remove();

    const overlay = document.createElement('div');
    overlay.id = `${id}-overlay`;
    overlay.className = 'modal-overlay';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-labelledby', `${id}-title`);

    overlay.innerHTML = `
    <div class="modal modal-${size}" id="${id}" role="document">
      <div class="modal-header">
        <div>
          <h2 id="${id}-title">${title}</h2>
          ${subtitle ? `<p>${subtitle}</p>` : ''}
        </div>
        <button class="modal-close-btn" aria-label="Fechar modal" data-modal-close="${id}">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
            <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
          </svg>
        </button>
      </div>
      <div class="modal-body" id="${id}-body">
        ${body}
      </div>
      ${footer ? `<div class="modal-footer" id="${id}-footer">${footer}</div>` : ''}
    </div>`;

    document.body.appendChild(overlay);

    // Reinicializar ícones Lucide no modal
    window.renderIcons?.();

    // Fechar ao clicar no overlay (fora do modal)
    overlay.addEventListener('click', e => {
        if (e.target === overlay) {
            closeModal(id);
            onClose?.();
        }
    });

    // Fechar via botão [X]
    overlay.querySelectorAll('[data-modal-close]').forEach(btn => {
        btn.addEventListener('click', () => {
            closeModal(id);
            onClose?.();
        });
    });

    // Fechar via ESC
    const keyHandler = (e) => {
        if (e.key === 'Escape') {
            closeModal(id);
            onClose?.();
            document.removeEventListener('keydown', keyHandler);
        }
    };
    document.addEventListener('keydown', keyHandler);

    return overlay;
}

// ================================================================
// Abrir modal (por id)
// ================================================================
export function openModal(id) {
    const overlay = document.getElementById(`${id}-overlay`);
    if (overlay) {
        overlay.classList.add('open');
        document.body.style.overflow = 'hidden';
        // Focus trap — focar primeiro input
        setTimeout(() => {
            const firstFocusable = overlay.querySelector('input:not([disabled]), select:not([disabled]), textarea:not([disabled]), button:not([disabled])');
            firstFocusable?.focus();
        }, 100);
    }
}

// ================================================================
// Fechar modal (por id)
// ================================================================
export function closeModal(id) {
    const overlay = document.getElementById(`${id}-overlay`);
    if (overlay) {
        overlay.classList.remove('open');
        document.body.style.overflow = '';
    }
}

// ================================================================
// Atualizar conteúdo do body de um modal aberto
// ================================================================
export function setModalBody(id, html) {
    const body = document.getElementById(`${id}-body`);
    if (body) {
        body.innerHTML = html;
        window.renderIcons?.();
    }
}

// ================================================================
// Mostrar confirm dialog (simplificado)
// Retorna: Promise<boolean>
// ================================================================
export function confirmDialog(title, message, confirmText = 'Confirmar', danger = false) {
    return new Promise(resolve => {
        const id = 'confirm-dialog';

        createModal({
            id,
            title,
            size: 'sm',
            body: `<p style="font-size:14px;color:var(--text-secondary);line-height:1.7">${message}</p>`,
            footer: `
        <button class="btn btn-secondary" data-modal-close="${id}" id="confirm-cancel">Cancelar</button>
        <button class="btn ${danger ? 'btn-danger' : 'btn-primary'}" id="confirm-ok">${confirmText}</button>`,
            onClose: () => resolve(false)
        });

        openModal(id);

        document.getElementById('confirm-cancel')?.addEventListener('click', () => {
            closeModal(id);
            resolve(false);
        });

        document.getElementById('confirm-ok')?.addEventListener('click', () => {
            closeModal(id);
            resolve(true);
        });
    });
}

// ================================================================
// Loading state no footer do modal
// ================================================================
export function setModalLoading(id, loading, btnId = 'modal-submit-btn') {
    const btn = document.getElementById(btnId);
    if (!btn) return;
    btn.disabled = loading;
    if (loading) {
        btn._originalText = btn.innerHTML;
        btn.innerHTML = `<span class="spinner spinner-sm"></span> Aguarde…`;
    } else {
        btn.innerHTML = btn._originalText || 'Salvar';
    }
}

// Bridge global para handlers inline (onclick="closeModal('...')")
if (typeof window !== 'undefined') {
    window.openModal = openModal;
    window.closeModal = closeModal;
}
