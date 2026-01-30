/* ===========================
   Router + Boot
============================ */
function renderRoute() {
    const hash = location.hash || '#/';

    if (cloudOk && !currentUser && !hash.startsWith('#/entrar')) {
        location.hash = '#/entrar';
        return;
    }


    // esconda TODOS os views sempre
    const views = [
        '#view-home', '#view-create', '#view-kanban', '#view-members',
        '#view-metrics', '#view-auth', '#view-calendar',
        '#view-report', '#view-tickets', '#view-prospec', '#view-ranking', '#view-report-history'
    ];
    views.forEach(id => { const el = document.querySelector(id); el && el.classList.add('hidden'); });

    // mostre só o view da rota atual
    if (hash.startsWith('#/criar')) {
        document.querySelector('#view-create')?.classList.remove('hidden');
    } else if (hash.startsWith('#/kanban')) {
        document.querySelector('#view-kanban')?.classList.remove('hidden');
    } else if (hash.startsWith('#/reportar')) {
        document.querySelector('#view-report')?.classList.remove('hidden');
    } else if (hash.startsWith('#/tickets')) {
        document.querySelector('#view-tickets')?.classList.remove('hidden');
    } else if (hash.startsWith('#/membros')) {
        document.querySelector('#view-members')?.classList.remove('hidden');
    } else if (hash.startsWith('#/indicadores')) {
        document.querySelector('#view-metrics')?.classList.remove('hidden');
    } else if (hash.startsWith('#/entrar')) {
        document.querySelector('#view-auth')?.classList.remove('hidden');
    } else if (hash.startsWith('#/view-prospec')) {
        document.querySelector('#view-prospec')?.classList.remove('hidden');
    } else if (hash.startsWith('#/agenda')) {
        document.querySelector('#view-calendar')?.classList.remove('hidden');
        try { loadAndRenderCalendar(); } catch { }
    } else if (hash.startsWith('#/ranking')) {
        document.querySelector('#view-ranking')?.classList.remove('hidden');
    } else if (hash.startsWith('#/report-history')) {
        document.querySelector('#view-report-history')?.classList.remove('hidden');
    } else {
        document.querySelector('#view-home')?.classList.remove('hidden');
    }
}

window.addEventListener('hashchange', renderRoute);




