/* ===========================
   GAMIFICAÇÃO – Ranking
=========================== */
; (function initRankingView() {
    const view = document.querySelector('#view-ranking');
    if (!view) return;

    const listEl = view.querySelector('#rk-list');
    const summaryEl = view.querySelector('#rk-summary');
    const btnRefresh = view.querySelector('#btn-ranking-refresh');

    function levelBounds(level) {
        const idx = Math.max(0, (level || 1) - 1);
        const cur = GAMIF_LEVEL_REQS[idx] || 0;
        const next = GAMIF_LEVEL_REQS[idx + 1];
        return { cur, next };
    }

    async function fetchRanking() {
        if (!cloudOk || !db || !currentUser) {
            summaryEl.textContent = 'Faça login para ver o ranking.';
            listEl.innerHTML = '';
            return;
        }

        try {
            summaryEl.textContent = 'Carregando...';

            const { collection, getDocs, doc, getDoc } = await import(
                "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js"
            );

            const snap = await getDocs(collection(db, 'gamification'));
            const rows = [];
            snap.forEach(d => rows.push({ uid: d.id, ...(d.data() || {}) }));

            // Enriquecer com nome/e-mail da coleção users (se existir)
            await Promise.all(rows.map(async r => {
                try {
                    const uRef = doc(db, 'users', r.uid);
                    const uSnap = await getDoc(uRef);
                    if (uSnap.exists()) {
                        const u = uSnap.data();
                        r.name = u.name || '';
                        r.email = u.email || '';
                    }
                } catch { }
            }));

            // ordenar por pontos do mês
            rows.sort((a, b) => (b.monthPoints || 0) - (a.monthPoints || 0));

            if (!rows.length) {
                summaryEl.textContent = 'Ainda não há pontuações registradas.';
                listEl.innerHTML = '';
                return;
            }

            const meIndex = rows.findIndex(r => r.uid === currentUser.uid);
            const me = meIndex >= 0 ? rows[meIndex] : null;

            // Summary
            if (me) {
                const pts = me.monthPoints || 0;
                const lvl = me.level || 1;
                const { cur, next } = levelBounds(lvl);
                const span = (next ?? (cur + 200)) - cur;
                const done = pts - cur;
                summaryEl.innerHTML = `
                    <div><strong>Você está em #${meIndex + 1}</strong> no ranking deste mês.</div>
                    <div>Pontos no mês: <strong>${pts}</strong> • Nível <strong>${lvl}</strong></div>
                    <div>${done}/${span} XP para o próximo nível.</div>
                `;
            } else {
                summaryEl.innerHTML = `
                    <div>Você ainda não ganhou pontos este mês.</div>
                    <div>Conclua cards, resolva tickets ou participe do chat para entrar no ranking.</div>
                `;
            }

            // Lista
            listEl.innerHTML = rows.map((r, idx) => {
                const name = r.name || r.email || r.uid || 'Usuário';
                const pts = r.monthPoints || 0;
                const lvl = r.level || 1;
                const { cur, next } = levelBounds(lvl);
                const span = (next ?? (cur + 200)) - cur;
                const done = pts - cur;
                const pct = Math.max(0, Math.min(100, Math.round((done / (span || 1)) * 100)));
                const badges = (r.badges || []).map(b => `<span class="gamif-badge-pill">${b}</span>`).join('') || '<span class="muted">Sem conquistas ainda</span>';

                return `
                  <div class="rk-card">
                    <div class="rk-rank">#${idx + 1}</div>
                    <div class="rk-main">
                      <div class="rk-name">${name}</div>
                      <div class="rk-level">Nível ${lvl}</div>
                      <div class="rk-points">Pontos no mês: <strong>${pts}</strong></div>
                      <div class="gamif-xp-bar">
                        <div class="gamif-xp-fill" style="width:${pct}%"></div>
                      </div>
                      <div class="gamif-xp-label">${done}/${span} XP para o próximo nível</div>
                      <div class="rk-badges">${badges}</div>
                    </div>
                  </div>
                `;
            }).join('');

        } catch (e) {
            console.error('[Ranking] Erro ao carregar ranking:', e);
            summaryEl.textContent = 'Erro ao carregar ranking.';
            listEl.innerHTML = '';
        }
    }

    btnRefresh?.addEventListener('click', fetchRanking);

    document.addEventListener('auth:changed', () => {
        if (location.hash.startsWith('#/ranking')) fetchRanking();
    });
    document.addEventListener('gamification:updated', () => {
        if (location.hash.startsWith('#/ranking')) fetchRanking();
    });
    window.addEventListener('hashchange', () => {
        if (location.hash.startsWith('#/ranking')) fetchRanking();
    });
})();

async function listenUserForceReload(db, user) {
    if (!db || !user) return;

    const { doc, onSnapshot } =
        await import("https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js");

    const ref = doc(db, "users", user.uid, "control", "reload");

    const KEY_LAST = "last_user_reload";
    const KEY_NOTICE = "nexus:pendingReloadNotice";

    let last = Number(localStorage.getItem(KEY_LAST) || 0);

    onSnapshot(ref, async (snap) => {
        if (!snap.exists()) return;

        const data = snap.data() || {};
        const ts = Number(data.forceReloadAt || 0);

        if (!ts || ts <= last) return;

        // atualiza "last" local (evita repetir se o snapshot disparar mais de uma vez)
        last = ts;
        localStorage.setItem(KEY_LAST, String(ts));

        // 👇 mensagem personalizada (com fallback)
        const category = (data.category || "🔄 Atualização disponível").trim();
        const message = (data.message || "Liberamos uma atualização rápida no sistema 🚀").trim();
        const refTxt = (data.ref || "").trim();
        const byTxt = (data.by || "").trim();

        // (opcional) salva aviso pra mostrar pós-reload também
        try {
            localStorage.setItem(
                KEY_NOTICE,
                JSON.stringify({ ts, category, message, ref: refTxt, by: byTxt })
            );
        } catch { }

        // 🧠 CONFIRMAÇÃO COM OK (agora com texto custom)
        await Swal.fire({
            title: category,
            html: `
        <p style="margin-bottom:8px">${escapeHtml(message)}</p>
        ${refTxt ? `<small class="muted">Referência: <b>${escapeHtml(refTxt)}</b></small><br>` : ""}
        ${byTxt ? `<small class="muted">Enviado por: ${escapeHtml(byTxt)}</small><br>` : ""}
        <small class="muted">Clique em <b>OK</b> para aplicar agora.</small>
      `,
            icon: "info",
            confirmButtonText: "OK, atualizar",
            allowOutsideClick: false,
            allowEscapeKey: false
        });

        // reload normal
        location.reload();
    });

    // helper simples pra não permitir HTML injection
    function escapeHtml(str) {
        return String(str || "").replace(/[&<>"']/g, (c) => ({
            "&": "&amp;",
            "<": "&lt;",
            ">": "&gt;",
            '"': "&quot;",
            "'": "&#39;"
        }[c]));
    }
}


