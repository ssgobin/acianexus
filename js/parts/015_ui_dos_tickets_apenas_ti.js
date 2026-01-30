/* ===========================
   UI dos Tickets (apenas TI)
=========================== */
; (function initTicketsUI() {
    const view = document.querySelector('#view-tickets');
    if (!view) return;

    const list = view.querySelector('#tickets-list');
    const filterEl = view.querySelector('#tkt-filter');
    const qEl = view.querySelector('#tkt-q');
    const counter = view.querySelector('#tkt-counter');

    // modal refs
    const modal = document.querySelector('#ticketModal');
    const mClose = document.querySelector('#ticket-close');
    const mTitle = document.querySelector('#ticket-title');
    const mAuthor = document.querySelector('#ticket-author');
    const mEmail = document.querySelector('#ticket-email');
    const mDesc = document.querySelector('#ticket-desc');
    const mSev = document.querySelector('#ticket-severity');
    const mStatus = document.querySelector('#ticket-status');
    const mFeedback = document.querySelector('#ticket-feedback');
    const mMsg = document.querySelector('#tkt-msg');
    const mSave = document.querySelector('#ticket-save');

    // Fechar ao clicar fora (overlay) ou na borda do modal
    const back = document.querySelector('#modalBack');

    // clique no overlay
    back?.addEventListener('click', () => {
        if (modal.classList.contains('show')) closeModal();
    });

    // clique na área vazia do próprio modal (fora do painel)
    modal?.addEventListener('mousedown', (e) => {
        // fecha apenas se o clique for no contêiner (não dentro do painel)
        if (e.target === modal) closeModal();
    });

    // tecla ESC
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && modal.classList.contains('show')) {
            closeModal();
        }
    });


    let __all = [];
    let __currentId = null;

    function paint(arr) {
        __all = arr || [];
        const term = (qEl.value || '').toLowerCase();
        const f = (filterEl.value || 'ALL');

        const filtered = __all.filter(t => {
            const okStatus = (f === 'ALL' || t.status === f);
            const okQ = !term || (String(t.title || '').toLowerCase().includes(term) || String(t.author || '').toLowerCase().includes(term));
            return okStatus && okQ;
        });

        counter.textContent = `${filtered.length} tickets`;
        list.innerHTML = filtered.map(t => {
            const when = new Date(t.createdAt || Date.now()).toLocaleString('pt-BR');
            return `
        <div class="card" style="padding:10px">
          <div class="title" data-open="${t.id}" role="button" tabindex="0" style="cursor:pointer">
            <div class="title-text">${escapeHtml(t.title || '(sem título)')}</div>
            <div class="title-badges">
              <span class="badge">${escapeHtml(t.status || 'Aberto')}</span>
              <span class="badge">${escapeHtml(t.severity || 'Baixa')}</span>
            </div>
          </div>
          <div class="meta muted" style="margin:6px 0">${escapeHtml(t.author || '—')} • ${escapeHtml(t.authorEmail || '—')} • ${when}</div>
          <div class="desc" style="margin:6px 0">${escapeHtml(t.desc || '')}</div>
          <div style="display:flex;gap:8px;justify-content:flex-end">
            <button class="btn" data-open="${t.id}">Abrir</button>
          </div>
        </div>
      `;
        }).join('');

        // delegação: qualquer clique/Enter/Espaço em algo com [data-open] abre o modal
        list.onclick = (e) => {
            const el = e.target.closest('[data-open]');
            if (el) openModal(el.getAttribute('data-open'));
        };
        list.onkeydown = (e) => {
            if (e.key === 'Enter' || e.code === 'Space') {
                const el = e.target.closest('[data-open]');
                if (el) { e.preventDefault(); openModal(el.getAttribute('data-open')); }
            }
        };
    }

    function openModal(id) {
        const t = __all.find(x => String(x.id) === String(id));
        __currentId = t?.id || null;
        if (!t) return;
        mTitle.textContent = `Ticket — ${t.title || '(sem título)'}`;
        mAuthor.value = t.author || '';
        mEmail.value = t.authorEmail || '';
        mDesc.value = t.desc || '';
        mSev.value = t.severity || '';
        mStatus.value = t.status || 'Aberto';
        mFeedback.value = t.feedback || '';
        mMsg.textContent = '';
        modal.classList.add('show');
        document.querySelector('#modalBack')?.classList.add('show');
        applyTicketPermissions();
    }

    function closeModal() {
        modal.classList.remove('show');
        // respeita outros modais
        if (!document.querySelector('#cardModal.show') && !document.querySelector('#chatModal.show')) {
            document.querySelector('#modalBack')?.classList.remove('show');
        }
    }

    mClose?.addEventListener('click', closeModal);
    mSave?.addEventListener('click', async () => {
        if (currentRole !== 'admin') {
            mMsg.classList.remove('ok');
            mMsg.classList.add('err');
            mMsg.textContent = 'Somente o TI pode editar.';
            return;
        }
        if (!__currentId) return;
        mMsg.classList.remove('ok', 'err');
        try {
            await Tickets.update(__currentId, { status: mStatus.value, feedback: mFeedback.value });
            mMsg.classList.add('ok'); mMsg.textContent = 'Salvo.';
            setTimeout(closeModal, 300);
        } catch (e) {
            console.error(e);
            mMsg.classList.add('err'); mMsg.textContent = 'Falha ao salvar.';
        }
    });

    filterEl?.addEventListener('change', () => paint(__all));
    qEl?.addEventListener('input', () => paint(__all));

    // live listen
    let stop = null;
    (async () => { stop = await Tickets.listen(paint); })();
    document.addEventListener('auth:changed', async () => { try { stop && stop(); } catch { }; stop = await Tickets.listen(paint); });

    function applyTicketPermissions() {
        const canEdit = (currentRole === 'admin') && !!currentUser;
        [mSev, mStatus, mFeedback].forEach(el => el && (el.disabled = !canEdit));
        [mAuthor, mEmail, mDesc].forEach(el => el && (el.disabled = true));
        if (mSave) mSave.classList.toggle('hidden', !canEdit);
    }
    document.addEventListener('auth:changed', applyTicketPermissions);

    applyTicketPermissions();


})();


