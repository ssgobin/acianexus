/* ===========================
  Checklist UI helpers
=========================== */
function renderChecklistUI(container, items = [], { readonly = false, onToggle = null } = {}) {
    if (!container) return;
    if (!items.length) {
        container.innerHTML = '<div class="muted">Sem itens</div>';
        return;
    }
    container.innerHTML = items.map((it, i) => `
        <label style="display:flex;gap:8px;align-items:center;margin:6px 0">
          <input type="checkbox" ${it.done ? 'checked' : ''} data-idx="${i}" ${readonly ? 'disabled' : ''}/>
          <span ${it.done ? 'style="text-decoration:line-through;opacity:.8"' : ''}>${it.text}</span>
        </label>
      `).join('');
    if (!readonly && typeof onToggle === 'function') {
        container.querySelectorAll('input[type="checkbox"]').forEach(ch => {
            ch.onchange = () => onToggle(+ch.getAttribute('data-idx'));
        });
    }
}

async function isChecklistComplete(cardId) {
    const list = await fetchChecklist(cardId);
    return list.length === 0 ? true : list.every(it => !!it.done);
}

; (function showReloadNoticeIfAny() {
    try {
        const raw = localStorage.getItem('nexus:pendingReloadNotice');
        if (!raw) return;
        const data = JSON.parse(raw);
        // só mostra se for relativamente recente (ex.: 5 minutos)
        const fresh = Date.now() - (Number(data.ts) || 0) < 5 * 60 * 1000;
        if (!fresh) { localStorage.removeItem('nexus:pendingReloadNotice'); return; }

        const html =
            `<div style="text-align:left">
        <div><strong>Categoria:</strong> ${data.category}</div>
        ${data.ref ? `<div><strong>Referência:</strong> ${escapeHtml(data.ref)}</div>` : ''}
        ${data.message ? `<div style="margin-top:8px">${escapeHtml(data.message)}</div>` : ''}
        <div style="margin-top:8px;color:#64748b;font-size:12px">
          ${new Date(data.ts).toLocaleString('pt-BR')} · ${escapeHtml(data.by || 'Admin')}
        </div>
      </div>`;

        // dispara o alerta
        if (window.Swal) {
            Swal.fire({
                title: 'Nexus atualizado 🚀',
                html,
                icon: 'success',
                confirmButtonText: 'Ok, obrigado!',
            });
        } else {
            // fallback: alert simples
            alert(`Nexus atualizado: ${data.category}\n${data.ref || ''}\n${data.message || ''}`);
        }
    } catch { /* ignore */ }
    finally {
        // consome a mensagem
        localStorage.removeItem('nexus:pendingReloadNotice');
    }

    // util: evita XSS na mensagem do admin
    function escapeHtml(s) {
        return String(s).replace(/[&<>"']/g, c => (
            { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[c]
        ));
    }
})();

; (function initProspection() {
    const view = document.querySelector('#view-prospec');
    if (!view) return;

    const btnAll = document.querySelector('#pros-filter-all');
    const btnNew = document.querySelector('#pros-filter-new');
    const inputQ = document.querySelector('#pros-q');
    const selActivity = document.querySelector('#pros-activity');
    const selStatus = document.querySelector('#pros-situacao');
    const tbody = document.querySelector('#pros-tbody');
    const lblCount = document.querySelector('#pros-count');
    const lblSync = document.querySelector('#pros-last-sync');
    const btnSync = document.querySelector('#pros-sync');
    const msg = document.querySelector('#pros-msg');

    // 🔹 PASTA LOCAL/REMOTA ONDE VOCÊ VAI COLOCAR OS JSONs
    // Ex.: /prospeccao/cnpjs-americana-2025-11.json
    const BASE_PROS_URL = "https://raw.githubusercontent.com/ssgobin/acianexus/main/prospeccao";

    const CITY = 'AMERICANA';
    const UF = 'SP';

    let currentYm = null; // "2025-11"
    let rows = [];
    let filterMode = 'ALL';

    const setMsg = (type, text) => {
        if (!msg) return;
        msg.className = 'msg';
        if (type) msg.classList.add(type);
        if (text) msg.classList.add('show');
        else msg.classList.remove('show');
        msg.textContent = text || '';
    };

    function ymNow() {
        const d = new Date();
        const z = n => String(n).padStart(2, '0');
        return `${d.getFullYear()}-${z(d.getMonth() + 1)}`;
    }

    function formatDate(d) {
        if (!d) return '';
        const s = String(d);
        if (/^\d{4}-\d{2}-\d{2}/.test(s)) {
            const [y, m, dd] = s.split('T')[0].split('-');
            return `${dd}/${m}/${y}`;
        }
        const dt = new Date(s);
        return Number.isNaN(dt.getTime()) ? '' : dt.toLocaleDateString('pt-BR');
    }

    function formatCnpj(c) {
        let s = String(c || '').replace(/\D+/g, '');
        if (s.length !== 14) return c || '';
        return s.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5');
    }

    function normalize(raw, ym) {
        const city = (raw.municipio || raw.cidade || '').toString().trim().toUpperCase();
        const uf = (raw.uf || raw.estado || '').toString().trim().toUpperCase();

        if (city && city !== CITY) return null;
        if (uf && uf !== UF) return null;

        const abertura = raw.data_abertura || raw.abertura || raw.aberturaData || '';
        const aberturaYm = abertura ? String(abertura).slice(0, 7) : null;
        const isNew = aberturaYm === ym;

        return {
            cnpj: raw.cnpj || raw.CNPJ || '',
            razao: raw.razao_social || raw.razao || raw.nome || '',
            fantasia: raw.nome_fantasia || raw.fantasia || '',
            situacao: (raw.situacao || raw.sit || '').toString().toUpperCase() || 'ATIVA',
            abertura,
            cnae: raw.cnae_principal || raw.cnae || '',
            cnae_desc: raw.cnae_principal_descricao || raw.cnae_descricao || '',
            cidade: city || CITY,
            uf: uf || UF,
            telefone: raw.telefone || raw.telefones || '',
            email: raw.email || (Array.isArray(raw.emails) ? raw.emails.join(', ') : ''),
            _isNew: !!isNew
        };
    }

    // 🔹 ESCAPE BÁSICO PRA EVITAR BUG VISUAL / XSS
    function escapeHtml(s) {
        return String(s || '').replace(/[&<>"']/g, c => ({
            '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;'
        }[c] || c));
    }

    function renderTable(list) {
        if (!tbody) return;
        if (!Array.isArray(list) || !list.length) {
            tbody.innerHTML =
                '<tr><td colspan="7" class="muted">Nenhum CNPJ encontrado com os filtros atuais.</td></tr>';
            if (lblCount) lblCount.textContent = '0 registros';
            return;
        }

        const html = list.map(r => `
      <tr>
        <td>${formatCnpj(r.cnpj)}</td>
        <td>${escapeHtml(r.fantasia || '—')}</td>
        <td>${escapeHtml(r.razao || '—')}</td>
        <td>${formatDate(r.abertura)}</td>
        <td>${escapeHtml(r.cnae || r.cnae_desc || '—')}</td>
        <td>${escapeHtml(r.situacao || '—')}</td>
        <td>
          ${escapeHtml(r.telefone || '')}
          ${r.telefone && r.email ? ' · ' : ''}
          ${escapeHtml(r.email || '')}
        </td>
      </tr>
    `).join('');
        tbody.innerHTML = html;

        if (lblCount) {
            const newCount = list.filter(r => r._isNew).length;
            lblCount.textContent = `${list.length} registros (${newCount} novos no mês)`;
        }
    }

    function buildFilters() {
        if (!selActivity) return;
        const set = new Set();
        rows.forEach(r => {
            if (r.cnae) set.add(r.cnae);
            else if (r.cnae_desc) set.add(r.cnae_desc);
        });
        const opts = ['<option value="">Todas as atividades</option>']
            .concat(Array.from(set).sort().map(v =>
                `<option value="${escapeHtml(v)}">${escapeHtml(v)}</option>`));
        selActivity.innerHTML = opts.join('');
    }

    function applyFilters() {
        let list = rows.slice();
        const term = (inputQ?.value || '').trim().toLowerCase();
        const act = selActivity?.value || '';
        const sit = selStatus?.value || '';

        if (filterMode === 'NEW') list = list.filter(r => r._isNew);

        if (term) {
            list = list.filter(r =>
                (r.cnpj && r.cnpj.toLowerCase().includes(term)) ||
                (r.razao && r.razao.toLowerCase().includes(term)) ||
                (r.fantasia && r.fantasia.toLowerCase().includes(term))
            );
        }

        if (act) {
            const a = act.toLowerCase();
            list = list.filter(r =>
                (r.cnae || '').toLowerCase() === a ||
                (r.cnae_desc || '').toLowerCase() === a
            );
        }

        if (sit) {
            const s = sit.toUpperCase();
            list = list.filter(r => (r.situacao || '').toUpperCase() === s);
        }

        renderTable(list);
    }

    // 🔹 Agora NÃO usa Storage. Busca direto de um arquivo estático.
    async function fetchMonthFile(ym) {
        const [year, month] = ym.split('-');
        const url = `${BASE_PROS_URL}/cnpjs-americana-${year}-${month}.json`;
        const res = await fetch(url, { cache: 'no-cache' });
        if (!res.ok) {
            throw new Error(`HTTP ${res.status} ao buscar ${url}`);
        }
        const data = await res.json();
        return Array.isArray(data) ? data : (data.items || []);
    }

    function updateSyncLabel(iso, total) {
        if (!lblSync) return;
        if (!iso) {
            lblSync.textContent = 'Última atualização: —';
            return;
        }
        const dt = new Date(iso);
        const when = Number.isNaN(dt.getTime()) ? iso : dt.toLocaleString('pt-BR');
        lblSync.textContent = `Última atualização: ${when} (${total ?? rows.length} registros)`;
    }

    async function loadForCurrentMonth(force) {
        currentYm = ymNow();
        const localKey = `prospec-cnpjs-${currentYm}`;
        const metaKey = `prospec-meta-${currentYm}`;
        const lastYm = localStorage.getItem('prospec-last-month-sync') || '';

        const canUseCache = !force && lastYm === currentYm;

        setMsg('', '');

        if (canUseCache) {
            const cached = localStorage.getItem(localKey);
            if (cached) {
                try {
                    rows = JSON.parse(cached) || [];
                    const meta = JSON.parse(localStorage.getItem(metaKey) || 'null');
                    updateSyncLabel(meta?.syncedAt, meta?.total || rows.length);
                    buildFilters();
                    applyFilters();
                    return;
                } catch {
                    // se cache quebrar, ignora e baixa de novo
                }
            }
        }

        try {
            setMsg('ok', 'Carregando base de CNPJs de Americana deste mês…');
            const raw = await fetchMonthFile(currentYm);
            rows = raw.map(r => normalize(r, currentYm)).filter(Boolean);

            const meta = {
                ym: currentYm,
                syncedAt: new Date().toISOString(),
                total: rows.length
            };

            localStorage.setItem(localKey, JSON.stringify(rows));
            localStorage.setItem(metaKey, JSON.stringify(meta));
            localStorage.setItem('prospec-last-month-sync', currentYm);

            updateSyncLabel(meta.syncedAt, meta.total);
            buildFilters();
            applyFilters();
            setMsg('ok', `Base carregada com sucesso (${rows.length} registros).`);
        } catch (e) {
            console.error('Erro ao carregar base de prospecção', e);
            const cached = localStorage.getItem(localKey);
            if (cached) {
                try {
                    rows = JSON.parse(cached) || [];
                    const meta = JSON.parse(localStorage.getItem(metaKey) || 'null');
                    updateSyncLabel(meta?.syncedAt, meta?.total || rows.length);
                    buildFilters();
                    applyFilters();
                    setMsg('err', 'Não foi possível atualizar, usando a base em cache.');
                    return;
                } catch { }
            }
            rows = [];
            updateSyncLabel(null, 0);
            renderTable([]);
            setMsg('err', 'Não foi possível carregar a base deste mês. Verifique se o JSON existe na pasta /prospeccao.');
        }
    }

    // Eventos UI
    btnAll?.addEventListener('click', () => {
        filterMode = 'ALL';
        btnAll.classList.add('active');
        btnNew?.classList.remove('active');
        applyFilters();
    });

    btnNew?.addEventListener('click', () => {
        filterMode = 'NEW';
        btnNew.classList.add('active');
        btnAll?.classList.remove('active');
        applyFilters();
    });

    inputQ?.addEventListener('input', applyFilters);
    selActivity?.addEventListener('change', applyFilters);
    selStatus?.addEventListener('change', applyFilters);
    btnSync?.addEventListener('click', () => loadForCurrentMonth(true));

    function maybeBoot() {
        if (location.hash.startsWith('#/prospeccao')) {
            if (!rows.length) loadForCurrentMonth(false);
        }
    }

    window.addEventListener('hashchange', maybeBoot);
    // Se abriu direto na rota
    maybeBoot();
})();



; (function initMural() {
    // liga UI imediatamente
    initMuralUI();

    // (re)liga a escuta sempre que o auth mudar
    document.addEventListener('auth:changed', () => {
        startMuralLive();
    });

    // primeira carga (antes de logar) para mostrar dados locais
    startMuralLive();
})();
// THEME (fonte única da verdade)
(function () {
    const root = document.documentElement;
    const btn = document.getElementById('themeToggle');

    // aplica estado inicial: confia no que o <head> já colocou na <html>
    const initial = root.classList.contains('light') ? 'light' : (localStorage.getItem('theme') || 'dark');
    const apply = (mode) => {
        root.classList.toggle('light', mode === 'light');
        try { localStorage.setItem('theme', mode); } catch { }
        if (btn) btn.textContent = (mode === 'light') ? '🌙' : '☀️';
    };
    apply(initial);

    // toggle no clique
    btn?.addEventListener('click', () => {
        apply(root.classList.contains('light') ? 'dark' : 'light');
    });

    // sincroniza entre abas (opcional)
    window.addEventListener('storage', (e) => {
        if (e.key === 'theme' && e.newValue) apply(e.newValue);
    });
})();



// ===============================
// GAMIFICAÇÃO – helpers globais
// ===============================
const GAMIF_LEVEL_REQS = [0, 200, 500, 1000, 2000];

let _gamifToastTimer = null;
function showGamificationToast(msg, subtitle = '') {
    const el = document.getElementById('gamification-toast');
    if (!el) return;
    el.innerHTML = msg + (subtitle ? `<small>${subtitle}</small>` : '');
    el.classList.add('show');
    clearTimeout(_gamifToastTimer);
    _gamifToastTimer = setTimeout(() => el.classList.remove('show'), 4000);
}

