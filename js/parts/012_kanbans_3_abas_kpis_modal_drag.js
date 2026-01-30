/* ===========================
   Kanbans (3 abas), KPIs, Modal, Drag
============================ */
; (function initKanbans() {
    const tabs = $('#kb-tabs');
    const columnsEl = $('#columns');
    const kpiWrap = $('#kpis');
    const riskPanel = $('#risk-panel');
    const kResp = $('#k-resp');
    const kQ = $('#k-q');
    const kRefresh = $('#k-refresh');

    // diretório global de usuários: uid -> label
    let userDir = new Map();
    let unsubUsersDir = null;

    async function bindUsersToKanbanFilter() {
        if (unsubUsersDir) { try { unsubUsersDir(); } catch { } }
        userDir.clear();

        // If Firestore not ready, paint minimal “Todos” option and bail
        if (!cloudOk || !db) {
            kResp.innerHTML = '<option value="ALL" selected>Todos</option>';
            return;
        }

        const { collection, onSnapshot, orderBy, query } =
            await import("https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js");

        const qRef = query(collection(db, 'users'), orderBy('name', 'asc'));
        unsubUsersDir = onSnapshot(qRef, (snap) => {
            userDir.clear();
            const opts = ['<option value="ALL" selected>Todos</option>'];
            snap.forEach(d => {
                const u = d.data();
                if (u.placeholder) return;
                const uid = u.uid || d.id;
                const label = u.name || u.email || uid;
                userDir.set(uid, label);
                opts.push(`<option value="${uid}">${label}</option>`);
            });
            kResp.innerHTML = opts.join('');
        });
    }

    document.addEventListener('auth:changed', bindUsersToKanbanFilter);
    bindUsersToKanbanFilter();

    // ===== Chat por card =====
    const btnChatOpen = $('#m-open-chat');
    const chatModal = $('#chatModal');
    const chatClose = $('#chat-close');
    const chatTitle = $('#chat-title');
    const chatList = $('#chat-list');
    const chatText = $('#chat-text');
    const chatSend = $('#chat-send');

    let chatCardId = null;
    let unsubChat = null;

    function renderChat(arr) {
        chatList.innerHTML = (arr || []).map(m => `
      <div class="comment">
        <div>${m.text}</div>
        <div class="meta">${new Date(m.createdAt || Date.now()).toLocaleString('pt-BR')} · ${m.authorName || m.author || '—'}</div>
      </div>
    `).join('') || '<div class="muted">Sem mensagens</div>';
        chatList.scrollTop = chatList.scrollHeight;
    }
    function openChat(card) {
        chatCardId = card.id;
        chatTitle.textContent = `Chat — ${card.title}`;
        if (unsubChat) { try { unsubChat(); } catch { } unsubChat = null; }
        const u = Chat.listen(chatCardId, renderChat);
        unsubChat = typeof u === 'function' ? u : u?.then?.(fn => (unsubChat = fn));
        chatModal.classList.add('show');
        $('#modalBack').classList.add('show');
        chatText.value = '';
        chatText.focus();
    }
    function closeChat() {
        if (unsubChat) { try { unsubChat(); } catch { } unsubChat = null; }
        chatCardId = null;
        chatModal.classList.remove('show');
        if (!$('#cardModal').classList.contains('show')) $('#modalBack').classList.remove('show');
    }
    chatClose.onclick = closeChat;
    chatSend.onclick = async () => {
        const t = (chatText.value || '').trim();
        if (!chatCardId || !t) return;
        await Chat.addMessage(chatCardId, t);
        chatText.value = '';
        chatText.focus();
    };
    chatText.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); chatSend.click(); }
    });

    // ===== Modal Editar (refs) =====
    const modal = $('#cardModal'), back = $('#modalBack');
    const mTitle = $('#m-title-in'), mResp = $('#m-resp'), mStatus = $('#m-status'), mDue = $('#m-due'), mDesc = $('#m-desc');
    const mSolic = $('#m-solic');
    const mMembers = $('#m-members');
    const mParent = $('#m-parent');
    const mG = $('#m-g'), mU = $('#m-u'), mT = $('#m-t'), mGUT = $('#m-gut');
    const mBadgeGut = $('#m-badge-gut'), mBadgePri = $('#m-badge-pri');
    const mRtEnabled = $('#m-rt-enabled'), mRtKind = $('#m-rt-kind');

    const mAttach = $('#m-attachments'), mANew = $('#m-new-attach'), mASend = $('#m-send-attach');
    const mChecklist = $('#m-checklist'), mChkNew = $('#m-new-check'), mChkAdd = $('#m-add-check');
    const btnClose = $('#m-close'), btnSave = $('#m-save'), btnDelete = $('#m-delete');

    // Botão copiar link
    const btnCopy = $('#m-copy-link');

    // Deep link (id do card vindo na hash: #/kanban?card=ID)
    let deepLinkCardId = null;

    function getHashParam(name) {
        const h = location.hash || '';
        const m = h.match(new RegExp('[?&]' + name + '=([^&]+)'));
        return m ? decodeURIComponent(m[1]) : null;
    }
    function readDeepLink() {
        deepLinkCardId = getHashParam('card');
    }

    function buildCardLink(id) {
        const base = location.href.split('#')[0];
        return `${base}#/kanban?card=${encodeURIComponent(id)}`;
    }

    // —— Modelo rápido (EDITAR) ——
    // refs dos inputs do modelo
    const mMdObj = $('#m-md-objetivo');
    const mMdAco = $('#m-md-acoes');
    const mMdInf = $('#m-md-info');

    // monta o texto completo a partir dos 3 campos (igual ao Criar)
    function mBuildDescFromModel() {
        const obj = (mMdObj?.value || '').trim();
        const aco = (mMdAco?.value || '').trim();
        const inf = (mMdInf?.value || '').trim();
        return `TAREFA QUE DEVE SER FEITA
${aco || 'Descrever todas as ações que devem ser aplicadas para a execução e entrega da tarefa, com excelência.'}

OBJETIVO DA TAREFA
${obj || 'Descrever qual é a razão da execução desta tarefa e qual o resultado esperado.'}

INFORMAÇÕES ADICIONAIS
${inf || 'Listar todas as informações pertinentes que contribuam para a ação mais efetiva e assertiva em sua execução.'}`;
    }

    // extrai Objetivo da Tarefa / Descrever a Tarefa / Info da descrição já salva
    function parseDescSections(descText) {
        const text = (descText || '').replace(/\r/g, '').trim();
        const H1 = /TAREFA QUE DEVE SER FEITA/i;
        const H2 = /OBJETIVO DA TAREFA/i;
        const H3 = /INFORMAÇÕES ADICIONAIS/i;

        const sections = { acoes: '', objetivo: '', info: '' };
        if (!text) return sections;

        const i1 = text.search(H1);
        const i2 = text.search(H2);
        const i3 = text.search(H3);

        function sliceAfterHeader(hIdx, nextIdx) {
            if (hIdx < 0) return '';
            // pega a linha seguinte ao header
            const nl = text.indexOf('\n', hIdx);
            const start = nl >= 0 ? nl + 1 : hIdx;
            const end = nextIdx >= 0 ? nextIdx : text.length;
            return text.slice(start, end).trim();
        }

        if (i1 >= 0 && i2 >= 0) sections.acoes = sliceAfterHeader(i1, i2);
        else if (i1 >= 0) sections.acoes = sliceAfterHeader(i1, -1);

        if (i2 >= 0 && i3 >= 0) sections.objetivo = sliceAfterHeader(i2, i3);
        else if (i2 >= 0) sections.objetivo = sliceAfterHeader(i2, -1);

        if (i3 >= 0) sections.info = sliceAfterHeader(i3, -1);

        // normaliza quebras de linha em lista separada por vírgulas para o campo "Descrever a Tarefa"
        if (sections.acoes) {
            sections.acoes = sections.acoes.split(/\n+/).map(s => s.trim()).filter(Boolean).join(', ');
        }
        return sections;
    }

    // sincronização bi-direcional (evita loop)
    let mModelUpdating = false;
    function syncModelToDesc() {
        if (mModelUpdating) return;
        mModelUpdating = true;
        if (mDesc) mDesc.value = mBuildDescFromModel();
        mModelUpdating = false;
    }
    function syncDescToModel() {
        if (mModelUpdating) return;
        mModelUpdating = true;
        const parts = parseDescSections(mDesc?.value || '');
        if (mMdObj) mMdObj.value = parts.objetivo || '';
        if (mMdAco) mMdAco.value = parts.acoes || '';
        if (mMdInf) mMdInf.value = parts.info || '';
        mModelUpdating = false;
    }

    // listeners
    ['input', 'change'].forEach(ev => {
        mMdObj?.addEventListener(ev, syncModelToDesc);
        mMdAco?.addEventListener(ev, syncModelToDesc);
        mMdInf?.addEventListener(ev, syncModelToDesc);
    });
    // Se o usuário editar o texto bruto, re-preenche os 3 campos
    mDesc?.addEventListener('input', syncDescToModel);


    // popula responsável+membros no modal
    // ==== cache global p/ modal ====
    let usersCache = []; // [{uid, label}]
    let pendingModalSelection = null;
    // { respUid: string|null, respLabel: string|null, memberUids: string[], memberLabels: string[] }

    // cache already declared above in your code:
    // let usersCache = []; 
    // let pendingModalSelection = null;

    let unsubUsersForEdit = null;
    async function bindUsersToEdit() {
        document.getElementById("m-members").onclick = () => {
            const current = getMembersSelectedFor("m-members");
            openMembersModal("m-members", current);
        };

        // limpa listener anterior
        try { unsubUsersForEdit && unsubUsersForEdit(); } catch { }
        unsubUsersForEdit = null;

        // helper para pintar as opções
        const paint = (rows) => {
            mResp.innerHTML = '<option value="">—</option>' + rows
                .map(u => `<option value="${u.uid}" data-label="${u.label}">${u.label}</option>`)
                .join('');

            // Agora sim — aplica a seleção pendente
            setTimeout(() => {
                if (mMembers && mMembers.options) {
                    applyPendingSelection();
                }
            }, 25);

        };


        // Fallback local (ou Firestore ainda não pronto)
        if (!cloudOk || !db) {
            try {
                const arr = (await Members.list()) || []; // [{id,displayName,email,role}]
                const rows = arr
                    .filter(m => (m.role || 'editor') !== 'viewer')
                    .map(m => ({ uid: m.id, label: m.displayName || m.email || m.id }));
                paint(rows);
            } catch {
                paint([]);
            }
            return;
        }

        // Cloud path: primeiro tentamos /users; se vier vazio, tentamos /members
        const { collection, onSnapshot, orderBy, query, getDocs } =
            await import("https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js");

        const qUsers = query(collection(db, 'users'), orderBy('name', 'asc'));

        unsubUsersForEdit = onSnapshot(qUsers, async (snap) => {
            let rows = [];
            snap.forEach(d => {
                const u = d.data();
                const uid = u.uid || d.id;
                // inclui placeholders, mas marca no rótulo
                if (u.placeholder) return; // pula pré-cadastro
                const lab = u.name || u.email || uid;

                rows.push({ uid, label: lab });
            });

            // Se /users vier vazio, tenta /members como fallback
            if (rows.length === 0) {
                try {
                    const mSnap = await getDocs(collection(db, 'members'));
                    rows = [];
                    mSnap.forEach(d => {
                        const m = d.data();
                        rows.push({ uid: d.id, label: m.displayName || m.email || d.id });
                    });
                } catch { }
            }

            // pinta selects (com opção "—" no responsável)
            paint(rows);
        });
    }



    // aplica seleção pendente no modal (responsável e membros)
    function applyPendingSelection() {
        if (!pendingModalSelection) return;
        const { respUid, respLabel } = pendingModalSelection;

        // ========= RESPONSÁVEL =========
        let appliedResp = false;
        if (respUid && mResp && mResp.querySelector(`option[value="${respUid}"]`)) {
            mResp.value = respUid;
            appliedResp = true;
        } else if (respLabel && mResp) {
            const opt = Array.from(mResp.options).find(
                o => (o.dataset.label || o.textContent) === respLabel
            );
            if (opt) {
                mResp.value = opt.value;
                appliedResp = true;
            }
        }

        if (!appliedResp && (respUid || respLabel) && mResp) {
            const val = respUid || `legacy_${Date.now()}`;
            const lab = respLabel || respUid || "—";
            const ghost = document.createElement("option");
            ghost.value = val;
            ghost.dataset.label = lab;
            ghost.textContent = `${lab} (não cadastrado)`;
            mResp.appendChild(ghost);
            mResp.value = val;
        }

        // nada de mexer em membros aqui — isso agora é responsabilidade do modal global
        pendingModalSelection = null;
    }



    bindUsersToEdit();

    // ===== Estado/Kanban =====
    let currentBoard = 'PROJETOS';
    let cache = new Map();
    let unsubCards = null, unsubA = null, unsubCL = null;
    let lastAll = [];

    document.addEventListener('auth:changed', () => {
        try { unsubCards && unsubCards(); } catch { }
        unsubCards = null;
        cache?.clear?.();
        startLive();
    });

    // ——— ROTINAS: volta sempre para PENDENTE e calcula próximo prazo ———
    const routineSeen = new Set();
    async function routineTick() {
        const all = lastAll || [];
        const now = Date.now();

        for (const c of all) {
            const r = c.routine;
            if (!r || !r.enabled || !c.due) continue;

            const key = `${c.id}|${c.due}`;
            if (routineSeen.has(key)) continue;

            const dueTs = Date.parse(c.due);
            if (!Number.isFinite(dueTs)) continue;

            if (now >= dueTs) {
                const flow = boardFlow(c.board);
                const startStatus = flow.includes('PENDENTE') ? 'PENDENTE' : flow[0];
                const next = computeNextDue(c.due, r.kind);
                const patch = { status: startStatus };
                if (next) patch.due = next;
                await Cards.update(c.id, patch);
                routineSeen.add(key);
            }
        }

        if (routineSeen.size > 500) {
            const keep = new Set(all.filter(c => c.due).map(c => `${c.id}|${c.due}`));
            for (const k of Array.from(routineSeen)) if (!keep.has(k)) routineSeen.delete(k);
        }
    }
    setInterval(routineTick, 60_000);

    function addDays(d, n) { const dt = new Date(d); dt.setDate(dt.getDate() + n); return dt; }
    function addMonths(d, n) { const dt = new Date(d); dt.setMonth(dt.getMonth() + n); return dt; }
    function nextWeekday(from, targetWeekday) {
        const dt = new Date(from);
        const cur = dt.getDay();
        let add = (targetWeekday - cur + 7) % 7;
        if (add === 0) add = 7;
        dt.setDate(dt.getDate() + add);
        return dt;
    }
    function computeNextDue(prevDueISO, kind) {
        const base = prevDueISO ? new Date(prevDueISO) : new Date();
        switch (kind) {
            case 'DAILY': return addDays(base, 1).toISOString();
            case 'WEEKLY': return addDays(base, 7).toISOString();
            case 'BIWEEKLY': return addDays(base, 14).toISOString();
            case 'MONTHLY': return addMonths(base, 1).toISOString();
            case 'MON': return nextWeekday(base, 1).toISOString();
            case 'TUE': return nextWeekday(base, 2).toISOString();
            case 'WED': return nextWeekday(base, 3).toISOString();
            case 'THU': return nextWeekday(base, 4).toISOString();
            case 'FRI': return nextWeekday(base, 5).toISOString();
            default: return null;
        }
    }

    function boardFlow(b) { return FLOWS[b] || FLOWS.PROJETOS; }


    function buildCols(flow) {
        columnsEl.innerHTML = flow.map(s => `
      <div class="col" data-col="${s}">
        <h4><span class="pill">${s}</span></h4>
        <div class="col-body" data-drop="1"></div>
      </div>`).join('');

        $$('#columns [data-drop="1"]').forEach(zone => {
            zone.addEventListener('dragover', (e) => { e.preventDefault(); zone.classList.add('drag-over'); });
            zone.addEventListener('dragleave', () => zone.classList.remove('drag-over'));
            zone.addEventListener('drop', async (e) => {
                e.preventDefault(); zone.classList.remove('drag-over');
                const cardId = e.dataTransfer.getData('text/plain');
                const newStatus = zone.closest('.col')?.getAttribute('data-col');
                if (cardId && newStatus) {
                    const all = lastAll || [];
                    const card = all.find(c => String(c.id) === String(cardId));
                    if (!card) return;
                    const flow = boardFlow(card.board);
                    const oldIdx = flow.indexOf(card.status);
                    const newIdx = flow.indexOf(newStatus);
                    const patch = { status: newStatus };
                    try {
                        if (newStatus === 'EXECUÇÃO' && !card.startAt) patch.startAt = new Date().toISOString();
                        if (newStatus === 'CONCLUÍDO' && !card.finishAt) patch.finishAt = new Date().toISOString();
                        if (card.status === 'CONCLUÍDO' && newStatus !== 'CONCLUÍDO') patch.reopened = (card.reopened || 0) + 1;
                    } catch { }
                    await Cards.update(cardId, patch);
                    // 🔹 Fluxo especial: APROVAR → CORRIGIR / FINALIZAR
                }
            });
        });
    }

    function renderKPIs(list) {
        const total = list.length;
        const overdue = list.filter(c =>
            c.due &&
            c.status !== 'CONCLUÍDO' &&
            new Date(c.due) < new Date()
        ).length;
        const exec = list.filter(c => c.status === 'EXECUÇÃO').length;
        const pend = list.filter(c => ['PENDENTE', 'BACKLOG'].includes(c.status)).length;
        const concl = list.filter(c => c.status === 'CONCLUÍDO').length;
        const card = (t, v) => `<div class="kpi-card"><div class="kpi-title">${t}</div><div class="kpi-val">${v}</div></div>`;
        kpiWrap.innerHTML = card('Total', total) + card('Vencidos', overdue) + card('Em execução', exec) + card('Pendentes', pend) + card('Concluídos', concl);
    }
    function renderRisks(allCards) {
        if (!riskPanel) return;

        if (!allCards || !allCards.length) {
            riskPanel.innerHTML = '';
            return;
        }

        const now = Date.now();
        const byResp = new Map();
        const overdueHigh = [];
        const reopened = [];

        for (const c of allCards) {
            const uid = c.respUid || null;
            const name = (uid && userDir.get(uid)) || c.resp || '—';
            const key = name;

            byResp.set(key, (byResp.get(key) || 0) + 1);

            if (c.due) {
                const d = Date.parse(c.due);
                const gut = Number(c.gut) || 0;
                if (Number.isFinite(d) && d < now && gut >= 60 && c.status !== 'CONCLUÍDO') {
                    overdueHigh.push(c);
                }
            }

            if ((c.reopened || 0) > 0) {
                reopened.push(c);
            }
        }

        const overloaded = [];
        for (const [key, count] of byResp.entries()) {
            if (count > 7 && key !== '—') {
                overloaded.push({ resp: key, count });
            }
        }

        const cards = [];

        if (overdueHigh.length) {
            cards.push(`
      <div class="risk-card risk-danger">
        <div class="risk-title">⚠️ Tarefas críticas atrasadas</div>
        <div class="risk-value">${overdueHigh.length}</div>
        <ul class="risk-list">
          ${overdueHigh.slice(0, 3).map(c => `<li>${c.title}</li>`).join('')}
          ${overdueHigh.length > 3 ? '<li>…</li>' : ''}
        </ul>
      </div>
    `);
        }

        if (overloaded.length) {
            cards.push(`
      <div class="risk-card risk-warn">
        <div class="risk-title">📌 Sobrecarga por responsável</div>
        <div class="risk-value">${overloaded.length}</div>
        <ul class="risk-list">
          ${overloaded.map(o => `
            <li>${o.resp}: ${o.count} tarefas</li>
          `).join('')}
        </ul>
      </div>
    `);
        }

        if (reopened.length) {
            cards.push(`
      <div class="risk-card risk-warn">
        <div class="risk-title">🔁 Cards reabertos</div>
        <div class="risk-value">${reopened.length}</div>
        <ul class="risk-list">
          ${reopened.slice(0, 3).map(c => `<li>${c.title}</li>`).join('')}
          ${reopened.length > 3 ? '<li>…</li>' : ''}
        </ul>
      </div>
    `);
        }

        if (!cards.length) {
            cards.push(`
      <div class="risk-card risk-ok">
        <div class="risk-title">🟢 Nenhum risco detectado</div>
        <div class="risk-value">OK</div>
        <div style="font-size:13px;color:var(--muted);margin-top:4px">
          Nenhuma anomalia significativa nas tarefas filtradas.
        </div>
      </div>
    `);
        }

        riskPanel.innerHTML = cards.join('');
    }


    function ensureCardEl(card) {
        let el = cache.get(String(card.id));
        if (!el) {
            el = document.createElement('div');
            el.className = 'card-item';
            el.draggable = true;
            el.dataset.id = card.id;
            el.style.opacity = '0';
            el.style.transform = 'translateY(6px)';
            requestAnimationFrame(() => {
                el.style.transition = 'opacity .2s, transform .2s';
                el.style.opacity = '1';
                el.style.transform = 'translateY(0)';
            });
            el.addEventListener('dragstart', (e) => e.dataTransfer.setData('text/plain', String(card.id)));
            cache.set(String(card.id), el);
        }

        // --- calc de prazos (declare antes de usar) ---
        const nowMs = Date.now();
        const dueMs = card.due ? new Date(card.due).getTime() : NaN;
        const dStr = card.due ? new Date(card.due).toLocaleString('pt-BR') : '—';
        const isOver = Number.isFinite(dueMs) && (dueMs < nowMs);
        const diffH = Number.isFinite(dueMs) ? (dueMs - nowMs) / 36e5 : Infinity;
        const isWarn = !isOver && diffH <= 3;

        const gutGrade = card.gutGrade || 'C';
        const gutCls = gutGrade === 'A' ? 'gut-a' : gutGrade === 'B' ? 'gut-b' : 'gut-c';
        const titleTxt = card.title || '(sem título)';

        el.classList.remove('border-ok', 'border-warn', 'border-danger');
        if (isOver) el.classList.add('border-danger');
        else if (isWarn) el.classList.add('border-warn');
        else el.classList.add('border-ok');

        // nomes dos membros (online)
        const membersHtml = (cloudOk && Array.isArray(card.members) && card.members.length)
            ? `<div class="meta">${card.members.map(uid => `<span class="pill">👤 ${userDir.get(uid) || uid}</span>`).join(' ')}</div>`
            : '';

        el.innerHTML = `
      <div class="title ${gutCls}" style="display:flex;justify-content:space-between;align-items:center;gap:8px">
        <span class="title-text" style="font-weight:800;line-height:1.2;max-width:65%;word-break:break-word">${titleTxt}</span>
        <div class="title-badges" style="display:flex;gap:6px;flex-wrap:wrap;justify-content:flex-end">
          <span class="badge">GUT: ${card.gut ?? 0} (${gutGrade})</span>
          <span class="badge">PRI: ${card.priority ?? 0}</span>
        ${card.parentId ? `<span class=\"badge\" data-parent-id=\"${card.parentId}\" title=\"Subtarefa de\">↪ ${card.parentTitle || 'tarefa‑mãe'}</span>` : ''}
        </div>
      </div>
      <div class="meta">
        <span class="pill">${card.board}</span>
        <span class="pill">${card.resp || '—'}</span>
        <span class="due ${isOver ? 'over' : ''}">⏰ ${dStr}</span>
        
      </div>
      ${membersHtml}
    `;

        // parent badge click → abre tarefa-mãe
        el.querySelector('[data-parent-id]')?.addEventListener('click', (ev) => {
            ev.stopPropagation();
            const pid = ev.currentTarget.getAttribute('data-parent-id');
            const p = (lastAll || []).find(c => String(c.id) == String(pid));
            if (p) openModal(p);
        });

        // chat badge + click
        Chat.count(card.id).then(n => {
            const badge = el.querySelector(`[data-chat-count="${card.id}"]`);
            if (badge) badge.textContent = `💬 ${n}`;
        });
        el.querySelector(`[data-chat-count="${card.id}"]`)?.addEventListener('click', (ev) => {
            ev.stopPropagation();
            openChat(card);
        });

        el.onclick = () => openModal(card);
        return el;
    }

    function mount(el, status) {
        const col = columnsEl.querySelector(`.col[data-col="${status}"] .col-body`);
        if (col && el.parentElement !== col) col.appendChild(el);
    }

    function applyFilters(all) {
        const q = (kQ.value || '').toLowerCase();
        const sel = kResp.value;
        const isAll = !sel || sel === 'ALL';
        return all
            .filter(c => c.board === currentBoard)
            .filter(c => {
                if (isAll) return true;
                if (cloudOk) {
                    const byResp = (c.respUid && c.respUid === sel);
                    const isMember = Array.isArray(c.members) && c.members.includes(sel);
                    return byResp || isMember;
                } else {
                    return (c.resp || '').toLowerCase() === sel.toLowerCase();
                }
            })
            .filter(c => !q || String(c.title || '').toLowerCase().includes(q))
            // ordena por prioridade DESC, depois prazo ASC
            .sort((a, b) => {
                const pa = Number(a.priority) || 0;
                const pb = Number(b.priority) || 0;
                if (pb !== pa) return pb - pa;
                const da = a.due ? new Date(a.due).getTime() : Infinity;
                const db = b.due ? new Date(b.due).getTime() : Infinity;
                return da - db;
            });
    }

    function renderActivityHeatmap(list) {
        const heatmap = document.getElementById("heatmap");
        if (!heatmap) return;

        // matriz [7 dias][24 horas]
        const matrix = Array.from({ length: 7 }, () =>
            Array.from({ length: 24 }, () => 0)
        );

        list.forEach(c => {
            if (!c.finishAt) return;
            const d = new Date(c.finishAt);
            const dow = d.getDay(); // 0 dom – 6 sab
            const hour = d.getHours();
            matrix[dow][hour]++;
        });

        // encontra máximo
        const max = Math.max(...matrix.flat(), 1);

        // render
        let html = "";

        // linha de cabeçalho
        html += `<div class="h-label"></div>`;
        for (let h = 0; h < 24; h++) html += `<div class="h-label">${h}</div>`;

        const dias = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sab"];

        matrix.forEach((row, dow) => {
            html += `<div class="h-label">${dias[dow]}</div>`;
            row.forEach(val => {
                const lvl = Math.min(5, Math.ceil((val / max) * 5));
                html += `<div class="heat-block heat-level-${lvl}">${val || ""}</div>`;
            });
        });

        heatmap.innerHTML = html;
    }



    function renderProdCharts(list) {
        const byHour = Array(24).fill(0);
        const byDay = Array(7).fill(0);

        list.forEach(c => {
            if (!c.finishAt) return;
            const d = new Date(c.finishAt);
            byHour[d.getHours()]++;
            byDay[d.getDay()]++;
        });

        // Gráfico por hora
        new Chart(document.getElementById("prodHourChart"), {
            type: "bar",
            data: {
                labels: [...Array(24).keys()],
                datasets: [{
                    label: "Concluídos",
                    data: byHour
                }]
            },
            options: { responsive: true, color: "#fff" }
        });

        // Gráfico por dia
        new Chart(document.getElementById("prodDayChart"), {
            type: "bar",
            data: {
                labels: ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sab"],
                datasets: [{
                    label: "Concluídos",
                    data: byDay
                }]
            },
            options: { responsive: true, color: "#fff" }
        });
    }

    async function renderRanking(allCards) {
        const wrap = document.getElementById("ranking-list");
        if (!wrap) return;

        // MENSAL — início do mês
        const now = new Date();
        const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

        const finished = allCards.filter(c =>
            c.finishAt && new Date(c.finishAt) >= monthStart
        );

        // agrupar por responsável
        const ranking = new Map();

        finished.forEach(c => {

            const envolvidos = c.members || [];

            if (!Array.isArray(envolvidos)) return;

            const gut = Number(c.gut) || 0;
            const points = 10 + Math.round(gut / 10);

            // cada envolvido recebe a mesma pontuação
            envolvidos.forEach(uid => {
                ranking.set(uid, (ranking.get(uid) || 0) + points);
            });

        });


        // buscar nomes do userDir
        const rows = [];
        for (const [uid, pts] of ranking.entries()) {
            const name = userDir.get(uid) || uid;
            rows.push({ uid, name, pts });
        }

        // ordenar
        rows.sort((a, b) => b.pts - a.pts);

        if (!rows.length) {
            wrap.innerHTML = `<div class="muted">Nenhuma tarefa concluída neste mês.</div>`;
            return;
        }

        const medals = ["🥇", "🥈", "🥉"];
        const maxPts = rows[0].pts;

        let html = "";

        rows.forEach((r, i) => {
            const medal = medals[i] || "⚪";
            const pct = Math.round((r.pts / maxPts) * 100);

            html += `
      <div class="ranking-row">
        <div class="rank-medal">${medal}</div>
        <div class="rank-avatar">${r.name.charAt(0)}</div>
        <div class="rank-name">${r.name}</div>
        <div class="rank-bar-wrap"><div class="rank-bar" style="width:${pct}%"></div></div>
        <div class="rank-points">${r.pts} pts</div>
      </div>
    `;
        });

        wrap.innerHTML = html;
    }

    function paint(all) {
        lastAll = all;
        const flow = boardFlow(currentBoard);
        buildCols(flow);
        const rows = applyFilters(all);
        renderKPIs(rows);
        renderRisks(rows);
        renderActivityHeatmap(rows);
        //renderProdCharts(rows);
        renderRanking(all);
        const seen = new Set();
        rows.forEach(c => { const el = ensureCardEl(c); mount(el, c.status); seen.add(String(c.id)); });
        for (const [id, el] of cache.entries()) {
            if (!seen.has(id)) { if (el.parentElement) el.parentElement.removeChild(el); cache.delete(id); }
        }

        // Abrir automaticamente se veio via deep link (#/kanban?card=ID)
        if (deepLinkCardId) {
            const tgt = all.find(c => String(c.id) === String(deepLinkCardId));
            if (tgt) {
                openModal(tgt);
                deepLinkCardId = null; // consome o deep link
            }
        }

    }

    function startLive() {
        if (unsubCards) unsubCards();
        unsubCards = Cards.listen(paint);
    }

    // Abas
    tabs.addEventListener('click', (e) => {
        const t = e.target.closest('.tab'); if (!t) return;
        $$('.tab', tabs).forEach(x => x.classList.remove('active'));
        t.classList.add('active');
        currentBoard = t.getAttribute('data-b');
        startLive();
    });
    kRefresh.addEventListener('click', startLive);
    kResp.addEventListener('change', startLive);
    kQ.addEventListener('input', startLive);

    // ===== Modal logic =====
    let modalId = null;

    function refreshEditGUT() {
        const g = computeGut(mG.value, mU.value, mT.value);
        mGUT.value = g;
        const gutGrade = gutClass(g);
        const dueIso = mDue.value ? new Date(mDue.value).toISOString() : null;
        const pri = computePriority(dueIso, g);
        if (mBadgeGut) mBadgeGut.textContent = `GUT: ${g} (${gutGrade})`;
        if (mBadgePri) mBadgePri.textContent = `PRI: ${pri}`;
    }
    [mG, mU, mT, mDue].forEach(el => el?.addEventListener('input', refreshEditGUT));

    function openModal(card) {
        modalId = card.id;
        $('#m-title').textContent = `Editar: ${card.title}`;
        // garante que os selects tenham opções quando o modal abrir
        const hasResp = mResp && mResp.options && mResp.options.length > 0;
        const hasMembers = mMembers && mMembers.querySelectorAll('input[type="checkbox"]').length > 0;
        if (!hasResp || !hasMembers) {
            try { bindUsersToEdit(); } catch { }
        }

        pendingModalSelection = {
            respUid: card.respUid || null,
            respLabel: card.resp || null,
            memberUids: Array.isArray(card.members) ? card.members : [],
            memberLabels: Array.isArray(card.members)
                ? card.members.map(x => String(x))
                : []
        };


        mG.value = (card.gutG ?? 5);
        mU.value = (card.gutU ?? 5);
        mT.value = (card.gutT ?? 5);

        mGUT.value = computeGut(mG.value, mU.value, mT.value);
        refreshEditGUT();

        mTitle.value = card.title || '';
        mDesc.value = card.desc || '';
        document.getElementById("m-solic").value =
            card.solicitante ||
            card.solic ||
            "";

        // dentro de openModal(card)
        window.currentEditingCardId = card.id;

        // ===== Envolvidos (novo sistema — modal global) =====
        MEMBER_SELECTED["m-members"] = new Set(card.members || []);
        setTimeout(() => applyPendingSelection(), 50);


        // === ATIVIDADE DO CARD ===
        loadCardActivity(card.id);

        if (window.unsubActivity) window.unsubActivity();

        window.unsubActivity = Sub.listenActivity(card.id, (arr) => {
            renderActivityList(arr);
        });

        // pré-preenche os 3 campos do modelo a partir da descrição existente
        syncDescToModel();
        document.getElementById("activity-send").onclick = async () => {
            const msg = document.getElementById("activity-msg").value.trim();
            if (!msg) return;

            await Sub.addActivity(window.currentEditingCardId, {
                type: "comment",
                text: msg,
                authorUid: currentUser?.uid || null,
                authorName: currentUser?.name || "—",
                date: Date.now()
            });

            document.getElementById("activity-msg").value = "";
        };


        if (card.due) {
            const d = new Date(card.due);
            const iso = new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
            mDue.value = iso;
        } else mDue.value = '';

        mStatus.innerHTML = boardFlow(card.board).map(s => `<option ${s === card.status ? 'selected' : ''}>${s}</option>`).join('');


        // ---- Tarefa linkada (parent) ----
        if (typeof mParent !== 'undefined' && mParent) {
            const opts = ['<option value="">—Nenhuma—</option>'];
            (lastAll || []).forEach(c => {
                if (!c || !c.id) return;
                if (String(c.id) === String(card.id)) return; // evita auto-vínculo
                const title = String(c.title || '(sem título)').replace(/</g, '&lt;').replace(/>/g, '&gt;');
                const board = c.board || '—';
                opts.push(`<option value="${c.id}" data-label="${title}">[${board}] ${title}</option>`);
            });
            mParent.innerHTML = opts.join('');
            mParent.value = card.parentId || '';
        }


        const r = card.routine || { enabled: false };
        if (mRtEnabled) mRtEnabled.value = r.enabled ? 'on' : 'off';
        if (mRtKind) mRtKind.value = r.kind || 'DAILY';

        // GUT/PRI (se não guarda G/U/T individualmente, inicia em 5/5/5)
        // mG.value = 5; mU.value = 5; mT.value = 5;
        // mGUT.value = Number(card.gut) || 125;
        // refreshEditGUT();

        const canEdit = (currentRole !== 'viewer') && !!currentUser;
        [mTitle, mResp, mStatus, mDue, mDesc, mASend, btnSave, mChkAdd,
            mG, mU, mT, mMembers, mRtEnabled, mRtKind, btnChatOpen,
            mMdObj, mMdAco, mMdInf].forEach(el => el && (el.disabled = !canEdit));
        btnDelete.disabled = (currentRole !== 'admin');
        btnDelete.classList.toggle('hidden', currentRole !== 'admin');

        // anexos
        if (unsubA) unsubA(); if (unsubCL) unsubCL();
        unsubA = Sub.listenAttachments(card.id, (arr) => {
            mAttach.innerHTML = (arr || []).map(a => `
      <div class="comment">
        <a href="${a.url}" target="_blank">${a.url}</a>
        <div class="meta">${new Date(a.createdAt || Date.now()).toLocaleString('pt-BR')} · ${a.authorName || a.author || '—'}</div>
      </div>
    `).join('') || '<div class="muted">Sem anexos</div>';
        });

        unsubCL = Sub.listenChecklist(card.id, (arr) => {
            mChecklist.innerHTML = (arr || []).map((it, i) => `
      <div class="chk-row" data-id="${it.id || i}">
        <input class="chk-toggle" type="checkbox" ${it.done ? 'checked' : ''}/>
        <input class="chk-text" type="text" value="${(it.text || '').replace(/"/g, '&quot;')}" ${it.done ? 'style="text-decoration:line-through;opacity:.85"' : ''}/>
        <button class="icon-btn btn-save" title="Salvar edição" aria-label="Salvar">
          <!-- Ícone lápis (editar) -->
          <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" aria-hidden="true">
            <path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zm14.71-9.04c.39-.39.39-1.02 0-1.41L15.2 3.29a.9959.9959 0 0 0-1.41 0l-1.83 1.83 3.75 3.75 1.8-1.66z"/>
          </svg>
        </button>
        <button class="icon-btn btn-del" title="Excluir item" aria-label="Excluir">
          <!-- Ícone lixeira (delete) -->
          <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" aria-hidden="true">
            <path d="M6 19c0 1.1.9 2 2 2h8a2 2 0 0 0 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/>
          </svg>
        </button>
      </div>
    `).join('') || '<div class="muted">Sem itens</div>';

            // liga os eventos
            mChecklist.querySelectorAll('.chk-row').forEach((row, idx) => {
                const id = row.getAttribute('data-id');
                const ch = row.querySelector('.chk-toggle');
                const txt = row.querySelector('.chk-text');
                const btnS = row.querySelector('.btn-save');
                const btnD = row.querySelector('.btn-del');

                // marcar/desmarcar
                ch.onchange = async () => {
                    await Sub.setChecklistDone(modalId, id, ch.checked);
                    if (ch.checked) txt.style.textDecoration = 'line-through', txt.style.opacity = '.85';
                    else txt.style.textDecoration = '', txt.style.opacity = '';
                };

                // salvar edição
                btnS.onclick = async () => {
                    const val = (txt.value || '').trim();
                    if (!val) { alert('Escreva algo antes de salvar.'); return; }
                    await updateChecklistItem(modalId, id, val);
                };

                // excluir
                btnD.onclick = async () => {
                    if (confirm('Remover este item da checklist?')) {
                        await removeChecklistItem(modalId, id);
                    }
                };
            });
        });


        btnChatOpen.onclick = () => openChat(card);

        back.classList.add('show');
        modal.classList.add('show');
    }


    function closeModal() {
        modalId = null;
        if (unsubA) unsubA(); if (unsubCL) unsubCL();
        modal.classList.remove('show');
        if (!$('#chatModal').classList.contains('show')) back.classList.remove('show');
        // dentro de closeModal()
        window.currentEditingCardId = null;

    }
    btnClose.onclick = closeModal;
    back.onclick = closeModal;

    mASend.onclick = async () => {
        if (!modalId) return;
        const u = (mANew.value || '').trim(); if (!u) return;
        await Sub.addAttachment(modalId, u); mANew.value = '';
    };

    mChkAdd.onclick = async () => {
        if (!modalId) return;
        const t = (mChkNew.value || '').trim();
        if (!t) return;
        await Sub.addChecklistItem(modalId, t);
        mChkNew.value = '';
        mChkNew.focus();
    };


    btnSave.onclick = async () => {
        if (!modalId) return;
        const dueIso = mDue.value ? new Date(mDue.value).toISOString() : null;
        const solicitante = mSolic.value.trim();

        const all = lastAll || [];
        const card = all.find(c => String(c.id) === String(modalId));
        const nextStatus = mStatus.value;

        let respUid = null, respLabel = '';
        if (cloudOk) {
            respUid = mResp.value || null;
            respLabel = mResp.selectedOptions[0]?.dataset?.label
                || mResp.selectedOptions[0]?.textContent
                || '';
        } else {
            respLabel = mResp.value || '';
        }


        const members = getMembersSelectedFor("m-members");
        const routine = (mRtEnabled?.value === 'on')
            ? { enabled: true, kind: mRtKind?.value || 'DAILY' }
            : { enabled: false };

        const gut = computeGut(mG.value, mU.value, mT.value);
        const gutGrade = gutClass(gut);
        const priority = computePriority(dueIso, gut);
        const extra = {};
        try {
            if (card && nextStatus !== card.status) {
                if (nextStatus === 'EXECUÇÃO' && !card.startAt) extra.startAt = new Date().toISOString();
                if (nextStatus === 'CONCLUÍDO' && !card.finishAt) extra.finishAt = new Date().toISOString();
                if (card.status === 'CONCLUÍDO' && nextStatus !== 'CONCLUÍDO') extra.reopened = (card.reopened || 0) + 1;
            }
        } catch { }


        await Cards.update(modalId, {
            title: (mTitle.value || '').trim() || '(sem título)',
            resp: respLabel || card?.resp || '',
            respUid,
            status: nextStatus,
            due: dueIso,
            desc: mDesc.value,
            members,
            routine,
            gut,
            gutGrade: gutClass(gut),
            priority: computePriority(dueIso, gut),
            solicitante,
            gutG: Number(mG.value),
            gutU: Number(mU.value),
            gutT: Number(mT.value),
            parentId: (mParent?.value || '').trim() || null,
            parentTitle: (mParent && mParent.value ? (mParent.selectedOptions[0]?.dataset?.label || mParent.selectedOptions[0]?.textContent || '') : '')
        });
        closeModal();
    };

    btnDelete.onclick = async () => {
        if (!modalId) return;
        if (!confirm('Excluir este card permanentemente?')) return;
        try {
            btnDelete.disabled = true;
            await Cards.remove(modalId);
            closeModal();
        } finally {
            btnDelete.disabled = false;
        }
    };

    // start
    window.addEventListener('hashchange', () => {
        if (location.hash.startsWith('#/kanban')) {
            readDeepLink();
            startLive();
        }
    });
    function waitForAuth(cb) {
        const ok = cloudOk && !!currentUser;
        if (ok) return cb();
        setTimeout(() => waitForAuth(cb), 120);
    }
    waitForAuth(startLive);

    window.selectBoardTab = (b) => {
        $$('.tab', tabs).forEach(x => x.classList.toggle('active', x.getAttribute('data-b') === b));
        currentBoard = b; startLive();
    };

    btnCopy?.addEventListener('click', async () => {
        if (!modalId) return;
        const url = buildCardLink(modalId);
        try {
            await navigator.clipboard.writeText(url);
            const old = btnCopy.textContent;
            btnCopy.textContent = 'Copiado! ✅';
            setTimeout(() => btnCopy.textContent = old, 1500);
        } catch {
            // Fallback tosco mas eficaz
            const tmp = document.createElement('input');
            tmp.value = url;
            document.body.appendChild(tmp);
            tmp.select();
            document.execCommand('copy');
            document.body.removeChild(tmp);
            const old = btnCopy.textContent;
            btnCopy.textContent = 'Copiado! ✅';
            setTimeout(() => btnCopy.textContent = old, 1500);
        }
    });

    readDeepLink();
    startLive();

})();


; (function initMural() {
    const list = document.querySelector('#mural-list');
    const btnOpen = document.querySelector('#mu-open');
    const btnMem = document.querySelector('#members-open');
    const modal = document.querySelector('#muralModal');
    const back = document.querySelector('#modalBack');
    const btnClose = document.querySelector('#mu-close');
    const btnPub = document.querySelector('#mu-publish');
    const msg = document.querySelector('#mu-msg');
    const inTitle = document.querySelector('#mu-title');
    const inCat = document.querySelector('#mu-cat');
    const inText = document.querySelector('#mu-text');
    if (!list) return;

    const showMsg = (type, text) => { if (!msg) return; msg.className = `msg ${type} show`; msg.textContent = text; };

    function paint(arr) {
        list.innerHTML = (arr || []).slice().reverse().map(m => `
      <div class="comment">
        <div style="font-weight:600">${m.title} · <span class="pill">${m.category}</span></div>
        <div style="margin-top:4px">${m.text}</div>
        <div class="meta" style="margin-top:4px">
          ${new Date(m.createdAt).toLocaleString('pt-BR')} · ${m.authorName || '—'}
        </div>
      </div>
    `).join('') || '<div class="muted">Sem comunicados.</div>';
    }

    // ---- Persistência (Firestore com fallback) ----
    function localList() { return (LocalDB.load().mural || []); }
    function localAdd(item) {
        const all = LocalDB.load();
        all.mural = all.mural || [];
        all.mural.push(item);
        LocalDB.save(all);
    }

    async function addMural({ title, category, text }) {
        if (currentRole !== 'admin') { showMsg('err', 'Somente admin pode publicar.'); return; }
        const createdAt = new Date().toISOString();
        const author = currentUser?.uid || 'anon';
        const authorName = currentUser?.displayName || currentUser?.email || '—';

        if (cloudOk) {
            try {
                const { collection, addDoc } = await import("https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js");
                await addDoc(collection(db, 'mural'), { title, category, text, createdAt, author, authorName });
                return;
            } catch (e) {
                console.warn('Mural Firestore add falhou, usando LocalDB:', e);
            }
        }
        localAdd({ title, category, text, createdAt, author, authorName });
    }

    async function listenMural(cb) {
        if (cloudOk) {
            try {
                const { collection, onSnapshot, orderBy, query } =
                    await import("https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js");
                const qRef = query(collection(db, 'mural'), orderBy('createdAt', 'asc'));
                return onSnapshot(
                    qRef,
                    snap => { const arr = []; snap.forEach(d => arr.push({ id: d.id, ...d.data() })); cb(arr); },
                    err => { console.warn('Mural listen erro, fallback local:', err); cb(localList()); }
                );
            } catch (e) {
                console.warn('Mural listen falhou, fallback local:', e);
            }
        }
        cb(localList());
        const t = setInterval(() => cb(localList()), 1200);
        return () => clearInterval(t);
    }

    // ---- Permissões (apenas admin vê o botão) ----
    function paintPermissions() {
        // Tickets visível para todos
        const btnTkt = document.querySelector('#nav-tickets');
        if (btnTkt) btnTkt.classList.remove('hidden');

        // Botões de publicar mural e gerenciar membros continuam só para admin
        if (btnOpen) btnOpen.classList.toggle('hidden', currentRole !== 'admin');
        if (btnMem) btnMem.classList.toggle('hidden', currentRole !== 'admin');
    }

    document.addEventListener('auth:changed', paintPermissions);
    paintPermissions();

    // ---- Modal open/close ----
    function openModal() {
        if (currentRole !== 'admin') return;
        msg?.classList.remove('show');
        inTitle.value = ''; inText.value = ''; inCat.value = 'Geral';
        modal.classList.add('show'); back.classList.add('show');
    }
    function closeModal() {
        modal.classList.remove('show');
        // mantém o backdrop se outros modais estiverem abertos
        if (!document.querySelector('#cardModal.show') &&
            !document.querySelector('#chatModal.show')) {
            back.classList.remove('show');
        }
    }
    btnOpen?.addEventListener('click', openModal);
    btnClose?.addEventListener('click', closeModal);

    // impedir que clique no backdrop feche todos (só o mural)
    back?.addEventListener('click', () => {
        if (modal.classList.contains('show')) closeModal();
    });

    // ---- Publicar (apenas admin) ----
    btnPub?.addEventListener('click', async () => {
        msg?.classList.remove('show');
        const title = (inTitle?.value || '').trim();
        const category = (inCat?.value || 'Geral');
        const text = (inText?.value || '').trim();
        if (!title || !text) { showMsg('err', 'Informe título e mensagem.'); return; }

        try {
            await addMural({ title, category, text });
            showMsg('ok', 'Publicado no mural.');
            setTimeout(closeModal, 300);
        } catch (e) {
            console.error(e);
            showMsg('err', 'Não foi possível publicar agora.');
        }
    });

    // ---- Live list ----
    let stop = null;
    (async () => { stop = await listenMural(paint); })();
    document.addEventListener('auth:changed', async () => {
        try { stop && stop(); } catch { }
        stop = await listenMural(paint);
    });
})();
