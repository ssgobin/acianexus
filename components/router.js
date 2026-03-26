// ================================================================
// NEXUS — Client-Side Router
// Navegação rápida sem recarregamento completo
// ================================================================

const MODULE_CACHE = new Map();
const PREFETCH_TIMEOUT = null;

const PAGE_MODULES = {
    'dashboard': '/modules/dashboard.module.js',
    'tasks': '/modules/tasks.module.js',
    'routines': '/modules/routines.module.js',
    'agenda': '/modules/agenda.module.js',
    'tickets': '/modules/tickets.module.js',
    'reports': '/modules/reports.module.js',
    'announcements': '/modules/announcements.module.js',
    'chat': '/modules/chat.module.js',
    'analytics': '/modules/analytics.module.js',
    'members': '/modules/members.module.js',
    'audit': '/modules/audit.module.js',
};

export async function navigateTo(page, pushState = true) {
    const modulePath = PAGE_MODULES[page];
    if (!modulePath) {
        window.location.href = `/pages/${page}.html`;
        return;
    }

    if (pushState && history.pushState) {
        history.pushState({ page }, '', `/pages/${page}.html`);
    }

    const contentEl = document.getElementById('page-content');
    if (!contentEl) {
        window.location.href = `/pages/${page}.html`;
        return;
    }

    contentEl.innerHTML = '<div class="flex-center" style="padding:60px"><div class="spinner spinner-lg"></div></div>';

    try {
        let module = MODULE_CACHE.get(page);
        
        if (!module) {
            const moduleFn = await import(modulePath);
            module = moduleFn;
            MODULE_CACHE.set(page, module);
        }

        if (module.initModule) {
            contentEl.innerHTML = '';
            await module.initModule();
        } else {
            contentEl.innerHTML = '<div class="p-md"><p>Módulo não encontrado.</p></div>';
        }
    } catch (err) {
        console.error('Erro ao carregar módulo:', err);
        contentEl.innerHTML = `<div class="p-md"><div class="toast-error">Erro ao carregar ${page}</div></div>`;
    }
}

export function initRouter() {
    document.body.addEventListener('click', async e => {
        const link = e.target.closest('a[href^="/pages/"]');
        if (!link) return;

        const href = link.getAttribute('href');
        const pageMatch = href.match(/\/pages\/(\w+)\.html/);
        
        if (pageMatch && PAGE_MODULES[pageMatch[1]]) {
            e.preventDefault();
            const page = pageMatch[1];
            await navigateTo(page);
            
            document.querySelectorAll('.sidebar-link').forEach(el => {
                el.classList.toggle('active', el.dataset.page === page);
            });
        }
    });

    window.addEventListener('popstate', async e => {
        if (e.state?.page) {
            await navigateTo(e.state.page, false);
        }
    });
}

export function prefetchPage(page) {
    if (!MODULE_CACHE.has(page) && PAGE_MODULES[page]) {
        import(PAGE_MODULES[page]).then(module => {
            MODULE_CACHE.set(page, module);
        }).catch(() => {});
    }
}

export function prefetchAllPages() {
    Object.keys(PAGE_MODULES).forEach(page => {
        setTimeout(() => prefetchPage(page), 100);
    });
}