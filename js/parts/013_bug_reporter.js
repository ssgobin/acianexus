/* ===========================
   Bug Reporter
============================ */
; (function initBug() {
    const HOOK = "https://discord.com/api/webhooks/1424818840596123812/PF5kyp0ctjPeBeUHkqI46y2iUPKM_23cWUypBUOel73sKtafOD7if3uqEAKi_h9fWiIM";
    const view = $('#view-report'); if (!view) return;
    const nameEl = view.querySelector('#name');
    const emailEl = view.querySelector('#email');
    const sevEl = view.querySelector('#severity');
    const titleEl = view.querySelector('#title');
    const descEl = view.querySelector('#desc');
    const form = view.querySelector('#bugForm');
    const btn = view.querySelector('#sendBtn');
    const okMsg = view.querySelector('#msg-ok');
    const errMsg = view.querySelector('#msg-err');

    function setBusy(b) { btn.disabled = b; btn.textContent = b ? 'Enviando…' : 'Enviar'; }
    function sevColor(sev) { return sev === 'Alta' ? 0xEF4444 : (sev === 'Baixa' ? 0x22C55E : 0xF59E0B); }

    form?.addEventListener('submit', async (e) => {
        e.preventDefault(); okMsg.classList.remove('show'); errMsg.classList.remove('show');
        if (!titleEl.value.trim() || !descEl.value.trim()) { setMsg(errMsg, 'err', '⚠️ Preencha o título e a descrição.'); return; }

        setBusy(true);
        try {
            await Tickets.add({
                title: titleEl.value.trim(),
                desc: descEl.value.trim(),
                severity: sevEl.value,
                author: (nameEl.value || '').trim(),
                authorEmail: (emailEl.value || '').trim()
            });
            form.reset();
            setMsg(okMsg, 'ok', '✅ Ticket criado! O TI foi notificado.');
        } catch (err) {
            console.error(err);
            setMsg(errMsg, 'err', '⚠️ Não foi possível criar o ticket agora.');
        } finally {
            setBusy(false);
        }
    });

})();

