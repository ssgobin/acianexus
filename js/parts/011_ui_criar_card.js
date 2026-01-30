/* ===========================
   UI: Criar card
============================ */
; (function initCreate() {
    const cTitle = $('#c-title');
    const cBoard = $('#c-board');
    const cResp = $('#c-resp');
    const cDue = $('#c-due');
    const cDesc = $('#c-desc');                // permanece oculto (compat)
    const cChecklistWrap = $('#c-checklist');
    const btnAI = $('#c-ai');                   // IA permanece!
    const btnCreate = $('#c-create');
    const msg = $('#c-msg');
    const cMembers = $('#c-members');
    const cParent = $('#c-parent');
    const cSolic = $('#c-solic');
    const mSolic = $('#m-solic');

    document.getElementById("c-members").onclick = () => {
        openMembersModal("c-members", getMembersSelectedFor("c-members"));
    };

    cSolic.value = currentUser?.displayName || currentUser?.email || currentUser?.uid || "";
    mSolic.value = currentUser?.displayName || currentUser?.email || currentUser?.uid || "";

    document.addEventListener("auth:changed", () => {
        cSolic.value = currentUser?.displayName || currentUser?.email || currentUser?.uid || "";
    });

    // Inputs do "Descritivo da Tarefa"
    const mdObj = $('#md-objetivo');
    const mdAco = $('#md-acoes');
    const mdInf = $('#md-info');
    try {
        const dt = new Date(Date.now() + 3600_000);
        const localISO = new Date(dt.getTime() - dt.getTimezoneOffset() * 60000)
            .toISOString().slice(0, 16);
        cDue.value = localISO;
    } catch { }


    // GUT
    const cG = $('#c-g'), cU = $('#c-u'), cT = $('#c-t'), cGUT = $('#c-gut');
    function refreshGUT() {
        const g = computeGut(cG.value, cU.value, cT.value);
        cGUT.value = g;
    }
    [cG, cU, cT].forEach(el => el.addEventListener('input', refreshGUT));
    refreshGUT();

    // Permissões
    function paintCreatePermissions() {
        const canEdit = (currentRole !== 'viewer') && !!currentUser;
        [
            cTitle, cBoard, cResp, cDue, btnCreate, cMembers, cParent,
            mdObj, mdAco, mdInf, cG, cU, cT, btnAI
        ].forEach(el => el && (el.disabled = !canEdit));
        msg.textContent = canEdit ? '' : 'Entre com sua conta para criar cards.';
    }
    paintCreatePermissions();
    document.addEventListener('auth:changed', paintCreatePermissions);

    // ===== Usuários para Responsável/Membros =====
    let unsubUsersForCreate = null;

    // Lista local de anexos (arquivos que o usuário escolheu)
    let cAttachments = [];

    // Abrir seletor de arquivo
    document.getElementById("c-send-attach").onclick = () => {
        document.getElementById("c-file-input").click();
    };

    document.getElementById("c-file-input").onchange = async (e) => {
        const files = Array.from(e.target.files || []);
        const container = document.querySelector("#c-attachments");

        for (const file of files) {
            try {
                const url = await uploadSimple(file);

                // SALVA LOCALMENTE →
                cAttachments.push({ name: file.name, url });

                // MOSTRA NA TELA →
                renderFileButton(container, file.name, url);

            } catch (err) {
                alert("Erro ao anexar: " + err.message);
            }
        }
    };


    // Renderização dos anexos selecionados
    function renderCreateAttachments() {
        const wrap = document.getElementById("c-attachments");
        wrap.innerHTML = "";

        if (!cAttachments.length) {
            wrap.innerHTML = `<div class="muted">Nenhum arquivo anexado</div>`;
            return;
        }

        cAttachments.forEach(att => {
            const div = document.createElement("div");
            div.className = "attach-item";

            div.innerHTML = `
            <span>${att.name}</span>
            <span class="attach-remove" data-id="${att.id}">✖</span>
        `;

            div.querySelector(".attach-remove").onclick = (ev) => {
                const id = ev.target.dataset.id;
                cAttachments = cAttachments.filter(a => a.id !== id);
                renderCreateAttachments();
            };

            wrap.appendChild(div);
        });
    }


    async function startUsersLiveForCreate() {
        // Prioriza Firestore "members"; se offline, cai em fallback simples.
        if (unsubUsersForCreate) { try { unsubUsersForCreate(); } catch { } unsubUsersForCreate = null; }

        if (cloudOk) {
            const { collection, onSnapshot, orderBy, query } = await import("https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js");
            const qRef = query(collection(db, 'members'), orderBy('createdAt', 'asc'));
            unsubUsersForCreate = onSnapshot(qRef, (snap) => {
                const rows = [];
                snap.forEach(d => rows.push({ id: d.id, ...d.data() }));
                // Preenche SELECT de responsável
                cResp.innerHTML = `<option value="">— Selecione —</option>` + rows.map(u => {
                    const label = u.displayName || u.email || u.id;
                    return `<option value="${u.id}" data-label="${label}">${label}</option>`;
                }).join('');
                // Preenche CHECKBOXES de membros

            });
        } else {
            // Fallback local (sem Firestore): usa nomes coletados de cards existentes ou uma lista mínima
            const localNames = Array.from(new Set(LocalDB.list().map(c => c.resp).filter(Boolean)));
            const rows = localNames.length ? localNames.map((n, i) => ({ id: String(i), displayName: n })) : [{ id: 'local-1', displayName: 'Colaborador' }];
            cResp.innerHTML = `<option value="">— Selecione —</option>` + rows.map(u =>
                `<option value="${u.id}" data-label="${u.displayName}">${u.displayName}</option>`
            ).join('');
        }
    }

    document.addEventListener('auth:changed', startUsersLiveForCreate);
    startUsersLiveForCreate();

    let unsubParentsForCreate = null;
    async function bindUsersToCreate() {
        try { unsubUsersForCreate && unsubUsersForCreate(); } catch { }
        unsubUsersForCreate = null;

        document.getElementById("c-members").onclick = () => {
            openMembersModal("c-members", getMembersSelectedFor("c-members"));
        };


        // Fallback (no cloud or db not ready yet)
        if (!cloudOk || !db) {
            try {
                const arr = (await Members.list()).filter(m => (m.role || 'editor') !== 'viewer');

                // Build options safely (no undefined var in ternary)
                const respOpts = arr.length
                    ? arr.map(u => `<option value="${u.id}">${u.displayName || u.email || u.id}</option>`).join('')
                    : '<option value="">—</option>';

                cResp.innerHTML = respOpts;



            } catch {
                cResp.innerHTML = '<option value="">—</option>';
                cMembers.innerHTML = '';
            }
            return;
        }

        // Cloud path
        const { collection, onSnapshot, orderBy, query } =
            await import("https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js");

        const qRef = query(collection(db, 'users'), orderBy('name', 'asc'));
        unsubUsersForCreate = onSnapshot(qRef, (snap) => {
            const users = [];
            snap.forEach(d => {
                const u = d.data();
                if (u.placeholder) return;
                const uid = u.uid || d.id;
                const label = u.name || u.email || uid;
                users.push({ uid, label });
            });

            cResp.innerHTML = users.map(u =>
                `<option value="${u.uid}" data-label="${u.label}">${u.label}</option>`
            ).join('');

        });
    }

    document.addEventListener('auth:changed', bindUsersToCreate);
    bindUsersToCreate();


    async function bindParentsToCreate() {
        try { unsubParentsForCreate && unsubParentsForCreate(); } catch { }
        unsubParentsForCreate = null;
        const renderOpts = (arr) => {
            if (!cParent) return;
            const opts = ['<option value="">—Nenhuma—</option>'];
            (arr || []).forEach(c => {
                if (!c || !c.id) return;
                const title = String(c.title || '(sem título)').replace(/</g, '&lt;').replace(/>/g, '&gt;');
                const board = c.board || '—';
                opts.push(`<option value="${c.id}" data-label="${title}">[${board}] ${title}</option>`);
            });
            cParent.innerHTML = opts.join('');
        };
        try {
            const u = Cards.listen(renderOpts);
            unsubParentsForCreate = (typeof u === 'function') ? u : (u?.then?.(fn => (unsubParentsForCreate = fn)));
        } catch { /* fallback local (já coberto pelo listen) */ }
    }
    document.addEventListener('auth:changed', bindParentsToCreate);
    bindParentsToCreate();
    // Rotinas: mostra bloco só no board ROTINAS
    const rtBlock = $('#rt-block');
    // Posiciona o bloco de Rotinas logo após o GUT
    const gutBlock = $('#c-gut-block');
    try { if (gutBlock && rtBlock) gutBlock.insertAdjacentElement('afterend', rtBlock); } catch { }

    // Checklist manual (create view)
    const cChkNew = $('#c-new-check');
    const cChkAdd = $('#c-add-check');
    if (cChkAdd) {
        cChkAdd.addEventListener('click', () => {
            const t = (cChkNew?.value || '').trim();
            if (!t) return;
            const buf = (setDescAndPreview._buffer || []).slice();
            buf.push({ text: t, done: false, createdAt: new Date().toISOString() });
            setDescAndPreview(buf);
            cChkNew.value = '';
        });
    }



    function toggleRtBlock() {
        rtBlock.classList.toggle('hidden', cBoard.value !== 'ROTINAS');
    }
    toggleRtBlock();
    cBoard.addEventListener('change', toggleRtBlock);

    // ======= Modelo → Descrição + Checklist =======
    function buildDescFromModel() {
        const obj = (mdObj.value || '').trim();
        const aco = (mdAco.value || '').trim();
        const inf = (mdInf.value || '').trim();

        return `TAREFA QUE DEVE SER FEITA
${aco || 'Descrever todas as ações que devem ser aplicadas para a execução e entrega da tarefa, com excelência.'}

OBJETIVO DA TAREFA
${obj || 'Descrever qual é a razão da execução desta tarefa e qual o resultado esperado.'}

INFORMAÇÕES ADICIONAIS
${inf || 'Listar todas as informações pertinentes que contribuam para a ação mais efetiva e assertiva em sua execução.'}`;
    }

    function basicChecklistFromModel() {
        const base = (mdAco.value || '')
            .split(/[,;|\n]+/)        // vírgulas, ponto-e-vírgula, | ou quebras de linha
            .map(s => s.trim())
            .filter(Boolean);

        const extras = [];
        if (mdObj.value?.trim()) extras.push('Validar objetivo com o solicitante');
        if (mdInf.value?.trim()) extras.push('Revisar informações adicionais e links');

        const defaults = [
            'Definir escopo e entregáveis',
            'Estabelecer prazo e responsável',
        ];

        // junta tudo sem duplicar (case-insensitive) e limita a 10
        const seen = new Set();
        const all = [...base, ...extras, ...defaults]
            .filter(t => { const k = t.toLowerCase(); if (seen.has(k)) return false; seen.add(k); return true; })
            .slice(0, 10);

        return all.map(t => ({ text: t, done: false, createdAt: new Date().toISOString() }));
    }

    function setDescAndPreview(items) {
        // Preenche descrição oculta
        cDesc.value = buildDescFromModel();

        // Render preview checklist
        const buf = items.slice(); // cópia
        renderChecklistUI(cChecklistWrap, buf, {
            readonly: false,
            onToggle: (idx) => {
                buf[idx].done = !buf[idx].done;
                setDescAndPreview(buf);
            }
        });
        setDescAndPreview._buffer = buf;
    }

    // Atualiza preview/descrição ao digitar
    function renderModelPreview() {
        setDescAndPreview(basicChecklistFromModel());
    }
    ['input', 'change'].forEach(ev => {
        mdObj.addEventListener(ev, renderModelPreview);
        mdAco.addEventListener(ev, renderModelPreview);
        mdInf.addEventListener(ev, renderModelPreview);
    });
    // primeira renderização
    renderModelPreview();

    // ======= IA: gerar checklist com Groq =======
    btnAI?.addEventListener('click', async () => {

        const isAutoChecklistEnabled =
            document.getElementById("autoChecklist")?.checked ?? true;

        if (!isAutoChecklistEnabled) {
            setMsg(msg, 'err', 'Ative a criação automática para usar a checklist por IA.');
            return;
        }

        const title = (cTitle.value || '').trim();
        if (!title) { setMsg(msg, 'err', 'Informe o título antes de gerar a checklist.'); return; }

        const board = cBoard.value;
        const desc = buildDescFromModel(); // usa os 3 campos do modelo
        setMsg(msg, 'ok', 'Gerando checklist com IA…');

        // chame o gerador Groq padrão (já presente no seu código)
        const aiItems = await generateChecklistGroq({ title, desc, board });


        // mescla IA + básicos, sem duplicar
        const basic = basicChecklistFromModel().map(i => i.text);
        const merged = [];
        const seen = new Set();

        [...aiItems, ...basic].forEach(t => {
            const k = String(t).trim();
            if (!k) return;
            const l = k.toLowerCase().replace(/\s+/g, ' ');
            if (seen.has(l)) return;
            seen.add(l);
            merged.push({ text: k, done: false, createdAt: new Date().toISOString() });
        });

        // limita a 10 itens
        setDescAndPreview(merged.slice(0, 10));
        setMsg(msg, 'ok', 'Checklist gerada pela IA.');
    });

    // ===============================
    // VALIDAÇÕES DE CARD (obrigatórios e conflitos)
    // ===============================
    async function validarCardAntesDeCriar({ title, desc, board, dueIso, respUid, gut, mdObj, mdAco, mdInf }) {
        // 1️⃣ Campos obrigatórios
        if (!title.trim()) throw new Error("Preencha o título da tarefa.");
        if (!mdObj.trim()) throw new Error("Preencha o objetivo da tarefa.");
        if (!mdAco.trim()) throw new Error("Preencha o descritivo da tarefa.");
        if (!mdInf.trim()) throw new Error("Preencha as informações adicionais.");
        if (!dueIso) throw new Error("Preencha a data e a hora do prazo.");

        // 2️⃣ Verificação de conflitos de GUT e horário
        const all = await (cloudOk ? getAllCardsFirestore() : LocalDB.list());

        // pega só tarefas ativas do mesmo responsável
        const conflitos = all.filter(c => (
            c.respUid === respUid &&
            c.status !== 'CONCLUÍDO' &&
            c.status !== 'FINALIZADO'
        ));

        // 🔹 Conflito de GUT
        const gutConflict = conflitos.find(c =>
            Number(c.gut) === Number(gut) &&
            (c.author === currentUser?.uid || c.authorEmail === currentUser?.email)
        );
        if (gutConflict) {
            throw new Error(`⚠️ Você já atribuiu uma tarefa com esse mesmo grau de GUT (${gut}) para este responsável. Finalize-a antes de criar outra semelhante.`);
        }

        // 🔹 Conflito de data/hora
        if (dueIso) {
            const dueTs = new Date(dueIso).getTime();
            const dateConflict = conflitos.find(c => {
                if (!c.due) return false;
                const cTs = new Date(c.due).getTime();
                const diff = Math.abs(cTs - dueTs);
                return diff < (15 * 60 * 1000); // intervalo de 15 minutos
            });
            if (dateConflict) {
                throw new Error(`⚠️ Já existe uma tarefa para este responsável com prazo próximo (${new Date(dateConflict.due).toLocaleString('pt-BR')}).`);
            }
        }
        return true;
    }

    // 🔹 Auxiliar para coletar todos os cards do Firestore
    async function getAllCardsFirestore() {
        const { collection, getDocs } = await import("https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js");
        const snap = await getDocs(collection(db, 'cards'));
        const arr = [];
        snap.forEach(d => arr.push({ id: d.id, ...d.data() }));
        return arr;
    }


    // ===== Criar card =====
    btnCreate.addEventListener('click', async () => {
        const title = (cTitle.value || '').trim();
        if (!title) { setMsg(msg, 'err', 'Informe o título.'); return; }

        const dueIso = cDue.value ? new Date(cDue.value).toISOString() : null;
        givePoints(currentUser.uid, 3, "Criou card");

        // rotina só vale quando o board for ROTINAS
        const isRotinaBoard = (cBoard.value === 'ROTINAS');
        const rtEnabledSel = $('#c-rt-enabled');
        const rtKindSel = $('#c-rt-kind');
        const isRotinaOn = isRotinaBoard && rtEnabledSel && (rtEnabledSel.value === 'on');

        if (isRotinaOn && !dueIso) {
            setMsg(msg, 'err', 'Para rotina, defina um prazo inicial (data/hora).');
            return;
        }

        // membros (uma vez só)
        const memberUids = getMembersSelectedFor("c-members");

        // rótulo do responsável (usa no rec.resp)
        const respUid = $('#c-resp')?.value || null;
        const respLabel = $('#c-resp option:checked')?.dataset?.label || '';

        // rotina (se quiser persistir)
        const routine = isRotinaOn
            ? { enabled: true, kind: rtKindSel?.value }
            : { enabled: false };

        // GUT e prioridade (usa os valores já na tela)
        const gutVal = Number($('#c-gut')?.value) || 0;
        const gutGrade = gutClass(gutVal);
        const priority = computePriority(dueIso, gutVal);

        // descrição + checklist do buffer atual (IA ou básica)
        const desc = cDesc.value || buildDescFromModel();
        const autoChecklist = document.getElementById("autoChecklist")?.checked ?? true;
        const checklistItems = autoChecklist
            ? (setDescAndPreview._buffer || basicChecklistFromModel())
            : [];


        try {
            await validarCardAntesDeCriar({
                title,
                desc: cDesc.value,
                board: cBoard.value,
                dueIso,
                respUid,
                gut: gutVal,
                mdObj: mdObj.value,
                mdAco: mdAco.value,
                mdInf: mdInf.value
            });
        } catch (err) {
            setMsg(msg, 'err', err.message || 'Erro ao validar card');
            return; // interrompe o fluxo
        }

        // === SOLICITANTE ===
        const solicitante =
            currentUser?.displayName ||
            currentUser?.name ||
            currentUser?.email ||
            "Desconhecido";



        // cria o card
        const rec = await Cards.add({
            title,                              // usa o normalizado
            desc,
            board: cBoard.value,
            status: FLOWS[cBoard.value][0],
            resp: respLabel,                    // usa o label calculado
            respUid,
            solicitante,
            due: dueIso,                        // usa o due já calculado
            members: memberUids,
            gut: gutVal,
            gutGrade,
            priority,
            autoChecklist,
            gutG: Number($('#c-g')?.value) || 5,
            gutU: Number($('#c-u')?.value) || 5,
            gutT: Number($('#c-t')?.value) || 5,
            routine                             // se não quiser salvar, remova esta linha
        });

        // ===== Salvar anexos enviados na criação =====
        // Salvar anexos da criação
        for (const att of cAttachments) {
            await Sub.addAttachment(rec.id, att.url);
        }


        // limpar anexos locais
        cAttachments = [];
        renderCreateAttachments();


        // checklist (em paralelo)
        if (autoChecklist && checklistItems.length) {
            await Promise.all(
                checklistItems.map(it => Sub.addChecklistItem(rec.id, it.text, it.done))
            );
        }


        setMsg(msg, 'ok', '✅ Card criado!');
        // reset mínimos
        cTitle.value = '';
        cDue.value = '';
        mdObj.value = ''; mdAco.value = ''; mdInf.value = '';
        setDescAndPreview._buffer = null;
        renderModelPreview();
        selectBoardTab?.(rec.board);
        sessionStorage.setItem('openCardId', rec.id);

        // redireciona com o id correto do card
        location.hash = `#/kanban?card=${encodeURIComponent(rec.id)}`;
    });

})();

(function tuneKanbanColHeight() {
    function setColMax() {
        const header = document.querySelector('header');
        const headerH = header ? header.getBoundingClientRect().height : 0;
        // 100vh menos header e um respiro
        const target = Math.max(320, Math.floor(window.innerHeight - headerH - 110));
        document.documentElement.style.setProperty('--kanban-col-max-h', `${target}px`);
    }
    setColMax();
    window.addEventListener('resize', setColMax);
    document.addEventListener('auth:changed', setColMax); // se tua UI mexe com layout após login
})();

// Atualiza automaticamente o ano no rodapé
(function updateFooterYear() {
    const el = document.getElementById("current-year");
    if (el) el.textContent = new Date().getFullYear();
})();



function renderActivityList(arr) {
    const list = document.getElementById("activity-list");

    if (!arr || arr.length === 0) {
        list.innerHTML = `<div class="muted">Nenhuma atividade ainda.</div>`;
        return;
    }

    list.innerHTML = arr.map(a => `
        <div class="activity-item">
            <div>${escapeHtml(a.text)}</div>
            <div class="meta">${a.authorName || a.author}</div>
        </div>
    `).join('');
}

function loadCardActivity(cardId) {
    Sub.getActivity(cardId).then(arr => {
        renderActivityList(arr || []);
    });
}
async function addActivityEvent(cardId, text) {
    await Sub.addActivity(cardId, {
        type: "event",
        text,
        authorUid: currentUser?.uid || null,
        authorName: currentUser?.name || "Sistema",
        date: Date.now()
    });
}


