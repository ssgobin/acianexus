/* ===========================
Indicadores (KPIs/Gráficos/XLSX)
============================ */
; (function initMetrics() {
    const view = $('#view-metrics');
    if (!view) return;

    const kpisEl = $('#m-kpis');
    const selBoard = $('#m-board');
    const selPeriod = $('#m-period');
    const btnRefresh = $('#m-refresh');
    const btnExport = $('#m-export');

    const ctxStatus = $('#chartStatus');
    const ctxResp = $('#chartResp');
    const ctxBoard = $('#chartBoard');

    let charts = { status: null, resp: null, board: null };

    function cssVar(name, fallback) {
        const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
        return v || fallback;
    }
    const colorText = cssVar('--text', '#e6eefc');
    const colorGrid = 'rgba(148,163,184,.18)';

    async function fetchAllCardsOnce() {
        if (cloudOk) {
            const { collection, getDocs, orderBy, query } =
                await import("https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js");
            const qRef = query(collection(db, 'cards'), orderBy('createdAt', 'asc'));
            const snap = await getDocs(qRef);
            const arr = []; snap.forEach(d => arr.push({ id: d.id, ...d.data() }));
            return arr;
        } else {
            return LocalDB.list();
        }
    }

    function filterCards(all) {
        const b = selBoard.value || 'ALL';
        const days = parseInt(selPeriod.value || '30', 10);
        let rows = all.slice();

        if (b !== 'ALL') rows = rows.filter(c => c.board === b);

        if (Number.isFinite(days) && days > 0) {
            const since = Date.now() - days * 864e5;
            rows = rows.filter(c => {
                const ts = Date.parse(c.createdAt || c.due || '');
                return Number.isFinite(ts) ? (ts >= since) : true;
            });
        }
        return rows;
    }

    function computeKPIs(list) {
        const total = list.length;
        const overdue = list.filter(c => c.due && new Date(c.due) < new Date()).length;
        const exec = list.filter(c => c.status === 'EXECUÇÃO').length;
        const pend = list.filter(c => ['PENDENTE', 'BACKLOG'].includes(c.status)).length;
        const concl = list.filter(c => c.status === 'CONCLUÍDO').length;
        return { total, overdue, exec, pend, concl };
    }

    function renderKPIs(list) {
        const { total, overdue, exec, pend, concl } = computeKPIs(list);
        const card = (t, v) => `<div class="kpi-card"><div class="kpi-title">${t}</div><div class="kpi-val">${v}</div></div>`;
        kpisEl.innerHTML = [
            card('Total', total),
            card('Vencidos', overdue),
            card('Em execução', exec),
            card('Pendentes', pend),
            card('Concluídos', concl),
        ].join('');
    }

    function groupCount(list, key) {
        const m = new Map();
        for (const it of list) {
            const k = (typeof key === 'function') ? key(it) : it[key];
            if (!k) continue;
            m.set(k, (m.get(k) || 0) + 1);
        }
        return m;
    }

    function destroyCharts() {
        for (const k of Object.keys(charts)) {
            try { charts[k]?.destroy?.(); } catch { }
            charts[k] = null;
        }
    }

    function drawCharts(list) {
        destroyCharts();

        // STATUS (doughnut)
        const statusMap = groupCount(list, 'status');
        const stLabels = Array.from(statusMap.keys());
        const stValues = stLabels.map(k => statusMap.get(k));

        charts.status = new Chart(ctxStatus, {
            type: 'doughnut',
            data: { labels: stLabels, datasets: [{ data: stValues }] },
            options: {
                plugins: {
                    legend: { labels: { color: colorText } }
                }
            }
        });

        // RESPONSÁVEL (bar) – top 12
        const respMap = groupCount(list, c => c.resp || '—');
        const respPairs = Array.from(respMap.entries()).sort((a, b) => b[1] - a[1]).slice(0, 12);
        const respLabels = respPairs.map(p => p[0]);
        const respValues = respPairs.map(p => p[1]);

        charts.resp = new Chart(ctxResp, {
            type: 'bar',
            data: { labels: respLabels, datasets: [{ label: 'Cards', data: respValues }] },
            options: {
                plugins: { legend: { labels: { color: colorText } } },
                scales: {
                    x: { ticks: { color: colorText }, grid: { color: colorGrid } },
                    y: { ticks: { color: colorText }, grid: { color: colorGrid }, beginAtZero: true, precision: 0 }
                }
            }
        });

        // BOARD (bar)
        const boardMap = groupCount(list, 'board');
        const bLabels = Array.from(boardMap.keys());
        const bValues = bLabels.map(k => boardMap.get(k));

        charts.board = new Chart(ctxBoard, {
            type: 'bar',
            data: { labels: bLabels, datasets: [{ label: 'Cards', data: bValues }] },
            options: {
                plugins: { legend: { labels: { color: colorText } } },
                scales: {
                    x: { ticks: { color: colorText }, grid: { color: colorGrid } },
                    y: { ticks: { color: colorText }, grid: { color: colorGrid }, beginAtZero: true, precision: 0 }
                }
            }
        });
    }

    function rowsToSheets(rows) {
        const raw = rows.map(r => ({
            id: r.id,
            titulo: r.title || '',
            board: r.board || '',
            status: r.status || '',
            responsavel: r.resp || '',
            prazo: r.due ? new Date(r.due).toLocaleString('pt-BR') : '',
            criadoEm: r.createdAt ? new Date(r.createdAt).toLocaleString('pt-BR') : '',
            membros: Array.isArray(r.members) ? r.members.length : 0
        }));

        const kpis = computeKPIs(rows);
        const resumo = Object.entries(kpis).map(([k, v]) => ({ metrica: k, valor: v }));

        return { raw, resumo };
    }

    function exportXLSX(rows) {
        const wb = XLSX.utils.book_new();
        const { raw, resumo } = rowsToSheets(rows);

        const ws1 = XLSX.utils.json_to_sheet(raw);
        XLSX.utils.book_append_sheet(wb, ws1, 'Cards');

        const ws2 = XLSX.utils.json_to_sheet(resumo);
        XLSX.utils.book_append_sheet(wb, ws2, 'Resumo');

        const now = new Date().toISOString().slice(0, 10);
        XLSX.writeFile(wb, `acia-indicadores-${now}.xlsx`);
    }

    async function refresh() {
        const all = await fetchAllCardsOnce();
        const filtered = filterCards(all);
        renderKPIs(filtered);
        drawCharts(filtered);
    }

    btnRefresh?.addEventListener('click', refresh);
    btnExport?.addEventListener('click', async () => {
        const all = await fetchAllCardsOnce();
        const filtered = filterCards(all);
        exportXLSX(filtered);
    });

    // atualiza quando logar/deslogar ou ao entrar na rota
    document.addEventListener('auth:changed', () => {
        if (location.hash.startsWith('#/indicadores')) refresh();
    });
    window.addEventListener('hashchange', () => {
        if (location.hash.startsWith('#/indicadores')) refresh();
    });
})();


