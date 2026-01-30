/* ============================================================
   DAILY MANUAL – abre pelo menu, carrega o dia e permite excluir
   ============================================================ */
(function initDailyManual() {
    const modal = document.getElementById("dailyModal");
    const body = document.getElementById("dailyBody");
    const btnAdd = document.getElementById("addMore");
    const btnSave = document.getElementById("saveDaily");
    const btnClose = document.getElementById("dailyClose");

    // se não existir no DOM, não faz nada
    if (!modal || !body || !btnAdd || !btnSave) return;

    let currentDocId = null;

    function todayKey() {
        return new Date().toISOString().slice(0, 10);
    }

    function createRow(start = "", end = "", desc = "") {
        const wrap = document.createElement("div");
        wrap.className = "daily-row";
        wrap.innerHTML = `
      <div class="row" style="display:flex;gap:8px;align-items:flex-end;margin-bottom:8px">
        <div class="field" style="flex:1">
          <label>Início</label>
          <input type="time" class="start" value="${start}">
        </div>
        <div class="field" style="flex:1">
          <label>Fim</label>
          <input type="time" class="end" value="${end}">
        </div>
        <button type="button" class="btn secondary remove-row">Excluir</button>
      </div>
      <div class="field">
        <label>O que fez nesse intervalo?</label>
        <textarea class="desc">${desc}</textarea>
      </div>
    `;

        wrap.querySelector(".remove-row").addEventListener("click", () => {
            wrap.remove();
            if (!body.querySelector(".daily-row")) createRow();
        });

        body.insertBefore(wrap, btnAdd);
    }

    async function loadDaily(period = "manual") {
        const today = todayKey();
        currentDocId = null;

        if (cloudOk && currentUser?.uid && db) {
            try {
                const { collection, getDocs, query, where } =
                    await import("https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js");

                const colRef = collection(db, "users", currentUser.uid, "dailyReports");
                const q = query(
                    colRef,
                    where("date", "==", today),
                    where("period", "==", period)
                );

                const snap = await getDocs(q);
                if (!snap.empty) {
                    const docSnap = snap.docs[0];
                    currentDocId = docSnap.id;
                    return docSnap.data().entries || [];
                }
            } catch (e) {
                console.warn("loadDaily Firebase:", e);
            }
        }

        // localStorage
        const list = JSON.parse(localStorage.getItem("dailyReports") || "[]");
        const found = list.find(r => r.date === today && r.period === period);
        return found ? found.entries : [];
    }

    async function openDaily() {
        body.querySelectorAll(".daily-row").forEach(r => r.remove());

        const entries = await loadDaily("manual");

        if (entries.length) {
            entries.forEach(e => createRow(e.start, e.end, e.desc));
        } else {
            createRow();
        }

        modal.dataset.period = "manual";
        modal.style.display = "flex";
    }

    async function saveDaily() {
        const rows = [...body.querySelectorAll(".daily-row")];
        const period = modal.dataset.period || "manual";
        const today = todayKey();

        const entries = rows
            .map(r => ({
                start: r.querySelector(".start").value.trim(),
                end: r.querySelector(".end").value.trim(),
                desc: r.querySelector(".desc").value.trim()
            }))
            .filter(e => e.start && e.end && e.desc);

        if (!entries.length) {
            alert("Preencha pelo menos um intervalo.");
            return;
        }

        // FIREBASE
        if (cloudOk && currentUser?.uid && db) {
            try {
                const { collection, addDoc, updateDoc, doc } =
                    await import("https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js");

                if (currentDocId) {
                    const ref = doc(db, "users", currentUser.uid, "dailyReports", currentDocId);
                    await updateDoc(ref, { entries: structuredClone(entries) });
                } else {
                    const colRef = collection(db, "users", currentUser.uid, "dailyReports");
                    const newRef = await addDoc(colRef, {
                        date: today,
                        period,
                        entries: structuredClone(entries),
                        createdAt: new Date().toISOString()
                    });
                    currentDocId = newRef.id;
                }
            } catch (e) {
                console.warn("saveDaily Firebase:", e);
            }
        }

        // LOCAL STORAGE
        const list = JSON.parse(localStorage.getItem("dailyReports") || "[]");
        const idx = list.findIndex(r => r.date === today && r.period === period);

        if (idx >= 0) {
            list[idx].entries = entries;
        } else {
            list.push({ date: today, period, entries });
        }

        localStorage.setItem("dailyReports", JSON.stringify(list));

        alert("Relatório salvo!");
        modal.style.display = "none";
    }

    // EVENTS
    btnAdd.addEventListener("click", () => createRow());
    btnSave.addEventListener("click", saveDaily);
    btnClose.addEventListener("click", () => (modal.style.display = "none"));

    document
        .getElementById("openDailyReport")
        ?.addEventListener("click", openDaily);
})();


// === POPUP DE POLÍTICA DE PRIVACIDADE ===
(function initPrivacyPopup() {
    const popup = document.getElementById("privacyPopup");
    const btn = document.getElementById("acceptPrivacy");
    const key = "privacyAccepted";

    // se já aceitou, não mostra mais
    const accepted = localStorage.getItem(key);
    if (accepted === "true") {
        popup.classList.add("hidden");
        return;
    }

    // mostra o popup
    popup.classList.remove("hidden");

    // ao clicar em aceitar
    btn.addEventListener("click", () => {
        localStorage.setItem(key, "true");
        popup.classList.add("hidden");
    });
})();


// Listener de inbox (idempotente)
let __inboxUnsub = null;
async function listenUserInbox() {
    try {
        if (typeof cloudOk === 'undefined' || !cloudOk) return;
        if (typeof currentUser === 'undefined' || !currentUser || !currentUser.uid) return;
        if (__inboxUnsub) { try { __inboxUnsub(); } catch { } __inboxUnsub = null; }
        const { collection, onSnapshot, orderBy, query, where } = await import("https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js");
        const qRef = query(
            collection(db, 'users', currentUser.uid, 'inbox'),
            where('read', '==', false),
            orderBy('createdAt', 'desc')
        );
        __inboxUnsub = onSnapshot(qRef, snap => {
            try {
                const unread = [];
                snap.forEach(d => unread.push({ id: d.id, ...d.data() }));
                window._inboxItems = unread;
                if (typeof renderMuralCombined === 'function') renderMuralCombined(window._lastMuralItems || []);
            } catch { }
        });
    } catch (e) { console.warn('[listenUserInbox]', e); }
}
if (typeof document !== 'undefined') {
    document.addEventListener('auth:changed', listenUserInbox);
}

function openMembersModal(targetId, preselected = []) {
    console.log("---------------------------------------------------");
    console.log("[OPEN MODAL] Abrindo modal de membros...");
    console.log("[OPEN MODAL] targetId =", targetId);
    console.log("[OPEN MODAL] preselected =", preselected);

    MEMBER_TARGET = targetId;

    if (!MEMBER_SELECTED[targetId]) {
        console.warn("[OPEN MODAL] MEMBER_SELECTED[targetId] inexistente. Criando Set vazio.");
        MEMBER_SELECTED[targetId] = new Set();
    }

    MEMBER_SELECTED[targetId] = new Set(preselected || []);
    console.log("[OPEN MODAL] MEMBER_SELECTED[targetId] =", MEMBER_SELECTED[targetId]);

    const modal = document.getElementById("members-modal");
    if (!modal) console.error("[OPEN MODAL] ERRO: #members-modal não encontrado!");

    modal.classList.remove("hidden");
    console.log("[OPEN MODAL] Modal exibido.");

    const search = document.getElementById("members-search");
    if (search) search.value = "";

    loadMembersForModal();
}


// === CARREGAR MEMBROS ===
async function loadMembersForModal() {
    console.log("[LOAD] Carregando membros...");

    const listEl = document.getElementById("members-list");
    if (!listEl) {
        console.error("[LOAD] ERRO: #members-list não encontrado");
        return;
    }

    listEl.innerHTML = "Carregando...";

    let members = [];

    try {
        if (cloudOk) {
            const { collection, getDocs } = await import(
                "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js"
            );

            console.log("[LOAD] Lendo coleção 'presence' do Firestore...");
            const snap = await getDocs(collection(db, "presence"));

            snap.forEach(doc => {
                const u = doc.data();
                members.push({
                    id: doc.id,
                    name: u.name,
                    email: u.email,
                    photo: u.photoURL
                });
            });

            console.log("[LOAD] Quantidade de membros encontrados =", members.length);
        }
    } catch (err) {
        console.error("[LOAD] ERRO ao carregar membros:", err);
    }

    renderMembersModalList(members);
}


// === RENDER ===
function renderMembersModalList(arr) {
    const listEl = document.getElementById("members-list");
    listEl.innerHTML = "";

    // Garante que sempre exista um Set para o TARGET atual
    let selectedSet = MEMBER_SELECTED[MEMBER_TARGET];
    if (!(selectedSet instanceof Set)) {
        selectedSet = new Set();
        MEMBER_SELECTED[MEMBER_TARGET] = selectedSet;
    }

    arr.forEach(m => {
        const item = document.createElement("div");
        item.className = "member-item";

        const checked = selectedSet.has(m.id) ? "checked" : "";

        item.innerHTML = `
            <input type="checkbox" class="member-check" value="${m.id}" ${checked}>
            <img src="${m.photo}">
            <span>${m.name}</span>
        `;

        item.onclick = e => {
            if (e.target.tagName !== "INPUT") {
                const chk = item.querySelector(".member-check");
                chk.checked = !chk.checked;
            }
        };

        listEl.appendChild(item);
    });
}

function onMembersApply(e) {
    console.log("[APPLY] rodou!");
    const checks = [...document.querySelectorAll(".member-check:checked")];
    const ids = checks.map(c => c.value);
    MEMBER_SELECTED[MEMBER_TARGET] = new Set(ids);
    updateMembersDisplay(MEMBER_TARGET);
    document.getElementById("members-modal").classList.add("hidden");
}

function onMembersClose() {
    console.log("[CLOSE] rodou!");
    document.getElementById("members-modal").classList.add("hidden");
}


// BUSCA – filtro em tempo real na lista de membros
(() => {
    const searchInput = document.getElementById("members-search");
    if (!searchInput) {
        console.warn("[members] #members-search não encontrado");
        return;
    }

    searchInput.oninput = e => {
        const term = (e.target.value || "").toLowerCase();
        console.log("[members] buscando por:", term);

        document.querySelectorAll(".member-item").forEach(row => {
            const txt = row.innerText.toLowerCase();
            row.style.display = txt.includes(term) ? "flex" : "none";
        });
    };
})();

// HANDLERS DO MODAL (Aplicar / Fechar)
document.getElementById("members-apply")
    .addEventListener("click", onMembersApply);

document.getElementById("members-close")
    .addEventListener("click", onMembersClose);


// Atualiza o texto do botão/alvo (ex: "c-members")
function updateMembersDisplay(targetId) {
    const el = document.getElementById(targetId);
    if (!el) {
        console.warn("[members] elemento alvo não encontrado:", targetId);
        return;
    }

    const set = MEMBER_SELECTED[targetId];
    const count = set ? set.size : 0;

    el.textContent =
        count === 0 ? "Selecione..." : `${count} membro(s) selecionado(s)`;

    console.log("[members] updateMembersDisplay:", targetId, "→", count, "membro(s)");
}

// Exportar para salvar card
function getMembersSelectedFor(targetId) {
    const set = MEMBER_SELECTED[targetId];
    const arr = Array.from(set || []);
    console.log("[members] getMembersSelectedFor:", targetId, "→", arr);
    return arr;
}



// === NEVE ===
function startSnow() {
    const snowInterval = setInterval(() => {
        const flake = document.createElement("div");
        flake.classList.add("snowflake");
        flake.textContent = "❄";

        flake.style.left = `${Math.random() * window.innerWidth}px`;
        flake.style.fontSize = `${Math.random() * 10 + 10}px`;
        flake.style.animationDuration = `${Math.random() * 3 + 4}s`;

        document.body.appendChild(flake);

        setTimeout(() => flake.remove(), 8000);
    }, 150);

    window._snowInterval = snowInterval;
}



// ========================================
// CHAT 2.0 — Threads (Responder Mensagem)
// ========================================
function startReplyMode(msg) {
    window.chatReplyTarget = {
        id: msg.id,
        text: msg.text || "",
        author: msg.author,
        authorName: msg.authorName || "Usuário"
    };

    // remover preview antigo
    document.getElementById("reply-preview")?.remove();

    // criar preview
    const inputArea = document.getElementById("chat-input-area");
    if (!inputArea) return;

    const box = document.createElement("div");
    box.id = "reply-preview";
    box.className = "reply-preview-box";
    box.innerHTML = `
        <strong>${msg.authorName}</strong><br>
        <span>${(msg.text || "").slice(0, 110)}</span>
        <button id="cancel-reply" class="btn small">✕</button>
    `;

    inputArea.prepend(box);

    // cancelar reply
    document.getElementById("cancel-reply").onclick = () => {
        window.chatReplyTarget = null;
        box.remove();
    };
}

// ======================================
// MENÇÕES (@usuario)
// ======================================
let mentionPopup = null;
let mentionUsers = [];
let mentionActive = false;

async function loadMentionUsers() {
    if (!cloudOk || !db) return [];

    const { collection, getDocs } = await import(
        "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js"
    );

    const snap = await getDocs(collection(db, "users"));
    const arr = [];

    snap.forEach(d => {
        const u = d.data();
        arr.push({
            uid: d.id,
            name: u.name || u.email || "Usuário",
            email: u.email || "",
        });
    });

    mentionUsers = arr;
    return arr;
}

function showMentionPopup(matches, x, y) {
    if (mentionPopup) mentionPopup.remove();

    mentionPopup = document.createElement("div");
    mentionPopup.className = "mention-popup";
    mentionPopup.style.left = x + "px";
    mentionPopup.style.top = y + "px";

    mentionPopup.innerHTML = matches
        .map(u => `<div class="mention-item" data-uid="${u.uid}" data-name="${u.name}">@${u.name}</div>`)
        .join("");

    document.body.appendChild(mentionPopup);

    mentionPopup.querySelectorAll(".mention-item").forEach(el => {
        el.onclick = () => {
            insertMention(el.dataset.name, el.dataset.uid);
        };
    });
}

function insertMention(name, uid) {
    const input = document.getElementById("chat-input");
    if (!input) return;

    const cursorPos = input.selectionStart;
    const text = input.value;

    const before = text.substring(0, cursorPos);
    const after = text.substring(cursorPos);

    const lastAt = before.lastIndexOf("@");
    if (lastAt === -1) return;

    const newText = before.substring(0, lastAt) + `@${name} ` + after;

    input.value = newText;
    input.focus();

    input.setSelectionRange(lastAt + name.length + 2, lastAt + name.length + 2);

    window._pendingMentions = window._pendingMentions || [];
    window._pendingMentions.push(uid);

    if (mentionPopup) mentionPopup.remove();
    mentionActive = false;
}


// ====================================================
//  DMs — Chat privado 1:1
// ====================================================
// ====================================================
//  DMs — Chat privado 1:1 (com avatar, online, lista, typing, edição)
// ====================================================


// chatId determinístico
function getDMChatId(uid1, uid2) {
    return [uid1, uid2].sort().join("_");
}

// Atualiza meta do chat (última mensagem, horário, usuários)
async function updateChatMeta(chatId, lastText) {
    if (!cloudOk || !db || !currentUser || !currentDMOtherUid) return;

    const { doc, setDoc } = await import(
        "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js"
    );

    const ref = doc(db, "privateChats", chatId);
    await setDoc(ref, {
        users: [currentUser.uid, currentDMOtherUid],
        lastText: lastText.slice(0, 100),
        lastAt: new Date().toISOString()
    }, { merge: true });
}

// Typing em DM
async function setDMTyping(isTyping) {
    if (!currentDM || !cloudOk || !db || !currentUser) return;

    try {
        const { doc, setDoc, updateDoc } = await import(
            "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js"
        );
        const ref = doc(db, "privateChats", currentDM);

        if (isTyping) {
            await setDoc(ref, {
                users: [currentUser.uid, currentDMOtherUid],
                typingUid: currentUser.uid
            }, { merge: true });

            clearTimeout(dmTypingTimeout);
            dmTypingTimeout = setTimeout(() => setDMTyping(false), 1500);
        } else {
            await updateDoc(ref, { typingUid: null });
        }
    } catch (e) {
        console.warn("[DM] setDMTyping falhou:", e.message || e);
    }
}

// LISTA LATERAL FINAL — DMs + GRUPOS
async function initDMConversations() {
    if (!cloudOk || !db || !currentUser) return;

    const listEl = document.getElementById("dm-conv-list");
    if (!listEl) return;

    // garantir que não tenham dois snapshots rodando
    if (dmConvsUnsub) {
        dmConvsUnsub();
        dmConvsUnsub = null;
    }

    const {
        collection,
        onSnapshot,
        query,
        where,
        orderBy,
        doc,
        getDoc
    } = await import("https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js");

    let dmList = [];
    let groupList = [];

    function renderList() {
        listEl.innerHTML = "";

        const combined = [...dmList, ...groupList];
        combined.sort((a, b) => b.lastAt - a.lastAt);

        for (const chat of combined) {
            const li = document.createElement("li");
            li.className = "dm-conv-item";

            if (currentDM === chat.id) li.classList.add("active");

            li.innerHTML = `
                <strong>${chat.name}</strong>
                <div class="dm-conv-last">${chat.lastText || ""}</div>
            `;

            li.onclick = () => {
                if (chat.isGroup) openGroupChat(chat.id);
                else openDM(chat.otherUid);
            };

            listEl.appendChild(li);
        }
    }


    const dmClose = document.getElementById("dm-close");
    if (dmClose) {
        dmClose.onclick = () => {
            document.getElementById("dmModal").style.display = "none";

            if (dmUnsubMessages) dmUnsubMessages();
            if (dmUnsubMeta) dmUnsubMeta();

            currentDM = null;
            currentDMOtherUid = null;
        };
    }


    // SNAPSHOT DMs
    const qDM = query(
        collection(db, "privateChats"),
        where("users", "array-contains", currentUser.uid),
        orderBy("lastAt", "desc")
    );

    const unsubDM = onSnapshot(qDM, async (snap) => {
        dmList = [];

        for (const d of snap.docs) {
            const data = d.data();
            const users = data.users || [];
            const otherUid = users.find(u => u !== currentUser.uid);
            if (!otherUid) continue;

            let otherName = "Usuário";
            try {
                const snapU = await getDoc(doc(db, "users", otherUid));
                if (snapU.exists()) {
                    const u = snapU.data();
                    otherName = u.name || u.email || "Usuário";
                }
            } catch { }

            dmList.push({
                id: d.id,
                isGroup: false,
                name: otherName,
                otherUid,
                lastText: data.lastText || "",
                lastAt: data.lastAt ? new Date(data.lastAt).getTime() : 0
            });
        }

        renderList();
    });

    // SNAPSHOT GRUPOS
    const qGroups = query(
        collection(db, "groupChats"),
        where("members", "array-contains", currentUser.uid),
        orderBy("lastAt", "desc")
    );

    const unsubGroups = onSnapshot(qGroups, (snap) => {
        groupList = [];

        snap.forEach(d => {
            const data = d.data();
            groupList.push({
                id: d.id,
                isGroup: true,
                name: data.name || "Grupo",
                lastText: data.lastText || "",
                lastAt: data.lastAt ? new Date(data.lastAt).getTime() : 0
            });
        });

        renderList();
    });

    // armazena função de parar listeners
    dmConvsUnsub = () => {
        unsubDM();
        unsubGroups();
        dmConvsUnsub = null;
    };
}


// Abrir DM
async function openDM(otherUid) {
    if (!currentUser || !cloudOk || !db) return;

    const chatId = getDMChatId(currentUser.uid, otherUid);
    currentDM = chatId;
    currentDMOtherUid = otherUid;

    console.log("[DM] Abrindo DM com:", otherUid, "chatId:", chatId);

    // limpa listeners antigos
    if (dmUnsubMessages) dmUnsubMessages();
    if (dmUnsubMeta) dmUnsubMeta();

    // mostra view de DM
    document.getElementById("dmModal").style.display = "block";
    const view = document.querySelector("#view-dm");
    if (view) view.classList.remove("hidden");

    // pode deixar essa chamada, porque initDMConversations tem o guard dmConvsUnsub
    initDMConversations(); // só inicializa uma vez


    const titleEl = document.getElementById("dm-title");
    const statusEl = document.getElementById("dm-status");
    const typingEl = document.getElementById("dm-typing");
    const avatarEl = document.getElementById("dm-avatar");
    const avatarStatusEl = document.getElementById("dm-avatar-status");
    const dmBox = document.getElementById("dm-box");

    if (dmBox) dmBox.innerHTML = "Carregando mensagens...";
    if (typingEl) typingEl.textContent = "";
    if (statusEl) statusEl.textContent = "Carregando...";
    if (avatarStatusEl) avatarStatusEl.classList.remove("online", "offline");

    const {
        doc,
        getDoc,
        collection,
        onSnapshot,
        query,
        orderBy
    } = await import("https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js");

    // ==== DADOS DO OUTRO USUÁRIO ====
    try {
        const uSnap = await getDoc(doc(db, "users", otherUid));
        const u = uSnap.data() || {};
        if (titleEl) titleEl.textContent = u.name || u.email || "Usuário";

        if (avatarEl) avatarEl.src = u.photoURL || "";
    } catch (e) {
        if (titleEl) titleEl.textContent = "Chat";
    }

    // ==== PRESENÇA ====
    try {
        const { onSnapshot: onSnapPresence, collection: collPres } =
            await import("https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js");

        onSnapPresence(collPres(db, "presence"), (snap) => {
            snap.forEach(d => {
                if (d.id !== otherUid) return;
                const data = d.data() || {};
                const online = !!data.online && (Date.now() - data.lastSeen) < 20000;

                if (statusEl) statusEl.textContent = online ? "Online" : "Offline";

                if (avatarStatusEl) {
                    avatarStatusEl.classList.remove("online", "offline");
                    avatarStatusEl.classList.add(online ? "online" : "offline");
                }

                if (avatarEl && data.photoURL) {
                    avatarEl.src = data.photoURL;
                }
            });
        });
    } catch (e) {
        console.warn("[DM] Presence falhou:", e.message || e);
    }

    // ==== LISTENER DE MENSAGENS (DM) ====
    const messagesRef = query(
        collection(db, "privateChats", chatId, "messages"),
        orderBy("createdAt")
    );

    dmUnsubMessages = onSnapshot(messagesRef, (snap) => {
        if (!dmBox) return;
        dmBox.innerHTML = "";

        snap.forEach((d) => {
            const msg = d.data();
            const id = d.id;
            const div = document.createElement("div");

            const mine = msg.author === currentUser.uid;
            div.className = "dm-msg " + (mine ? "dm-me" : "dm-other");

            const when = msg.createdAt
                ? new Date(msg.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
                : "";

            let contentHtml = "";
            if (msg.deleted) {
                contentHtml = `<span class="dm-msg-deleted">Mensagem apagada</span>`;
            } else {
                contentHtml = msg.text || "";
                if (msg.edited) contentHtml += ` <small>(editada)</small>`;
            }

            const avatar = mine
                ? (currentUser.photoURL || "")
                : (msg.authorPhoto || "");

            div.innerHTML = `
                <img class="dm-avatar-bubble" src="${avatar}">
                <div class="dm-content">
                    <div>${contentHtml}</div>
                    <small class="dm-time">${when}</small>
                </div>
            `;

            if (mine && !msg.deleted) {
                const actions = document.createElement("div");
                actions.className = "dm-msg-actions";
                actions.innerHTML = `
                    <button class="dm-edit">editar</button>
                    <button class="dm-del">apagar</button>
                `;
                const editBtn = actions.querySelector(".dm-edit");
                const delBtn = actions.querySelector(".dm-del");

                editBtn.onclick = () => editDMMessage(chatId, id, msg.text || "");
                delBtn.onclick = () => deleteDMMessage(chatId, id);

                div.appendChild(actions);
            }

            dmBox.appendChild(div);
        });

        dmBox.scrollTop = dmBox.scrollHeight;
    });

    // ==== TYPING ====
    const metaRef = doc(db, "privateChats", chatId);
    dmUnsubMeta = onSnapshot(metaRef, (snap) => {
        const data = snap.data() || {};
        if (!typingEl) return;

        if (data.typingUid && data.typingUid !== currentUser.uid) {
            typingEl.textContent = "digitando...";
        } else {
            typingEl.textContent = "";
        }
    });
}


async function openGroupChat(groupId) {
    console.log("[GROUP] Abrindo grupo:", groupId);

    currentDM = groupId;
    currentDMOtherUid = null; // grupos não têm "outro uid"

    // Abrir modal
    document.getElementById("dmModal").style.display = "block";

    const titleEl = document.getElementById("dm-title");
    const statusEl = document.getElementById("dm-status");
    const typingEl = document.getElementById("dm-typing");
    const avatarEl = document.getElementById("dm-avatar");
    const avatarStatusEl = document.getElementById("dm-avatar-status");
    const dmBox = document.getElementById("dm-box");

    if (dmBox) dmBox.innerHTML = "Carregando mensagens...";

    const {
        doc,
        getDoc,
        collection,
        onSnapshot,
        query,
        orderBy
    } = await import("https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js");

    const gSnap = await getDoc(doc(db, "groupChats", groupId));
    const group = gSnap.data();

    // TÍTULO DO MODAL
    if (titleEl) titleEl.textContent = group.name;

    // foto do grupo (futuramente adicionamos suporte total)
    if (avatarEl) avatarEl.src = "img/group.png";

    // grupo não tem “status”
    if (statusEl) statusEl.textContent = `${group.members.length} membros`;

    // limpar indicadores
    if (typingEl) typingEl.textContent = "";
    if (avatarStatusEl) avatarStatusEl.classList.remove("online", "offline");

    // ============== LISTENER DE MENSAGENS ==============
    const messagesRef = query(
        collection(db, "groupChats", groupId, "messages"),
        orderBy("createdAt")
    );

    if (dmUnsubMessages) dmUnsubMessages();
    dmUnsubMessages = onSnapshot(messagesRef, (snap) => {
        dmBox.innerHTML = "";

        snap.forEach((d) => {
            const msg = d.data();
            const mine = msg.author === currentUser.uid;

            const div = document.createElement("div");
            div.className = "dm-msg " + (mine ? "dm-me" : "dm-other");

            const when = msg.createdAt
                ? new Date(msg.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
                : "";

            const userLabel = mine ? "Você" : (msg.authorName || msg.author);

            const avatar = msg.authorPhoto;


            div.innerHTML = `
    <img class="dm-avatar-bubble" src="${avatar}">
    <div class="dm-content">
        <div><strong>${userLabel}</strong><br>${msg.text}</div>
        <small class="dm-time">${when}</small>
    </div>
`;



            dmBox.appendChild(div);
        });

        dmBox.scrollTop = dmBox.scrollHeight;
    });

    // AO ABRIR → marca grupo como lido
    markDMRead();

    // CARREGAR MENU DE MEMBROS + BOTÕES DE ADMIN
    loadGroupManagementUI(groupId);
}

async function loadGroupManagementUI(groupId) {
    const panel = document.getElementById("dm-header"); // mesma área do topo
    if (!panel) return;

    // evita duplicar UI
    const existing = document.getElementById("group-manage-ui");
    if (existing) existing.remove();

    const { doc, getDoc } =
        await import("https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js");

    const snap = await getDoc(doc(db, "groupChats", groupId));
    const data = snap.data();
    const isAdmin = data.admins.includes(currentUser.uid);

    const box = document.createElement("div");
    box.id = "group-manage-ui";
    box.style = "padding:6px;margin-top:6px;border-top:1px solid #444;font-size:12px";

    // LISTA DE MEMBROS
    let membersHTML = `<strong>Membros:</strong><br>`;
    for (const uid of data.members) {
        const userSnap = await getDoc(doc(db, "users", uid));
        const u = userSnap.data() || {};

        const isAdm = data.admins.includes(uid);
        const label = isAdm ? " (admin)" : "";

        membersHTML += `• ${u.name || u.email}${label}<br>`;
    }

    // BOTÕES DE ADMIN
    let adminButtons = "";
    if (isAdmin) {
        adminButtons = `
            <button id="group-add-user" class="btn small secondary" style="margin-top:6px">Adicionar membro</button>
            <button id="group-remove-user" class="btn small secondary" style="margin-top:6px">Remover membro</button>
            <button id="group-promote-user" class="btn small secondary" style="margin-top:6px">Promover a admin</button>
        `;
    }

    box.innerHTML = membersHTML + adminButtons;
    panel.appendChild(box);

    if (isAdmin) {
        setupGroupAdminButtons(groupId, data);
    }
}

function setupGroupAdminButtons(groupId, group) {
    const addBtn = document.getElementById("group-add-user");
    const remBtn = document.getElementById("group-remove-user");
    const promBtn = document.getElementById("group-promote-user");

    if (addBtn) addBtn.onclick = () => manageGroupMembers(groupId, group, "add");
    if (remBtn) remBtn.onclick = () => manageGroupMembers(groupId, group, "remove");
    if (promBtn) promBtn.onclick = () => manageGroupMembers(groupId, group, "promote");
}

async function manageGroupMembers(groupId, group, mode) {
    const { doc, updateDoc, getDoc } =
        await import("https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js");

    const snap = await getDoc(doc(db, "groupChats", groupId));
    const data = snap.data();

    let list = [...data.members];
    let admins = [...data.admins];

    let userId = prompt("Digite o UID do usuário:");

    if (!userId) return;

    if (mode === "add") {
        if (!list.includes(userId)) list.push(userId);
    }

    if (mode === "remove") {
        list = list.filter(u => u !== userId);
        admins = admins.filter(a => a !== userId);
    }

    if (mode === "promote") {
        if (!admins.includes(userId)) admins.push(userId);
        if (!list.includes(userId)) list.push(userId);
    }

    await updateDoc(doc(db, "groupChats", groupId), {
        members: list,
        admins: admins
    });

    alert("Alterações atualizadas!");
    loadGroupManagementUI(groupId);
}



// Enviar DM
async function sendDM() {
    if (!currentDM || !currentUser || !cloudOk || !db) return;

    const input = document.getElementById("dm-input");
    if (!input) return;
    const text = input.value.trim();
    if (!text) return;

    input.value = "";

    const { collection, addDoc } =
        await import("https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js");

    // FOTO REAL DO FIRESTORE
    const authorPhoto = await getUserPhoto(currentUser.uid);

    await addDoc(collection(db, "privateChats", currentDM, "messages"), {
        text,
        author: currentUser.uid,
        authorName: currentUser.displayName || currentUser.email || "Você",
        authorPhoto,        // ← AQUI
        createdAt: new Date().toISOString()
    });

    await updateChatMeta(currentDM, text);
    await setDMTyping(false);
}



// ========================================
// ENVIAR MENSAGEM EM GRUPO
// ========================================
async function sendGroupMessage() {
    if (!currentDM || !currentUser || !cloudOk || !db) return;

    const input = document.getElementById("dm-input");
    if (!input) return;

    const text = input.value.trim();
    if (!text) return;

    input.value = "";

    const { collection, addDoc, doc, updateDoc } =
        await import("https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js");

    const authorPhoto = await getUserPhoto(currentUser.uid);

    await addDoc(collection(db, "groupChats", currentDM, "messages"), {
        text,
        author: currentUser.uid,
        authorName: currentUser.displayName || currentUser.email || "Usuário",
        authorPhoto,       // ← AQUI
        createdAt: new Date().toISOString()
    });

    await updateDoc(doc(db, "groupChats", currentDM), {
        lastText: text.slice(0, 100),
        lastAt: new Date().toISOString()
    });
}




// Editar mensagem
async function editDMMessage(chatId, msgId, oldText) {
    const novo = prompt("Editar mensagem:", oldText);
    if (novo === null) return; // cancel
    const t = novo.trim();
    if (!t || t === oldText) return;

    const { doc, updateDoc } = await import(
        "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js"
    );

    await updateDoc(doc(db, "privateChats", chatId, "messages", msgId), {
        text: t,
        edited: true
    });
}

// Apagar mensagem
async function deleteDMMessage(chatId, msgId) {
    if (!confirm("Apagar esta mensagem?")) return;

    const { doc, updateDoc } = await import(
        "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js"
    );

    await updateDoc(doc(db, "privateChats", chatId, "messages", msgId), {
        text: "Mensagem apagada",
        deleted: true,
        edited: false
    });
}

// Bind de botões e eventos de input
(function initDMUI() {
    const sendBtn = document.getElementById("dm-send");
    const input = document.getElementById("dm-input");
    const backBtn = document.getElementById("dm-back");

    if (sendBtn) {
        sendBtn.onclick = () => {
            if (currentDMOtherUid) {
                sendDM();
            } else {
                sendGroupMessage();
            }
        };

    }

    if (input) {
        input.addEventListener("keydown", (ev) => {
            if (ev.key === "Enter" && !ev.shiftKey) {
                ev.preventDefault();
                if (currentDMOtherUid) {
                    // DM normal
                    sendDM();
                } else {
                    // grupo
                    sendGroupMessage();
                }
            }
        });

        input.addEventListener("input", () => {
            setDMTyping(true);
        });
    }

    if (backBtn) {
        backBtn.onclick = () => {
            location.hash = "#/";
        };
    }
})();

const dmBack = document.getElementById("dm-back");
if (dmBack) {
    dmBack.onclick = () => {
        location.hash = "#/"; // ou voltar pro chat global
    };
}


function initReportHistory() {

    const inpDate = document.getElementById("rh-date");
    const view = document.getElementById("view-report-history");
    if (!view) return;

    window.addEventListener("nexus:auth-ready", () => {
        const today = new Date().toISOString().split("T")[0];
        inpDate.value = today;
        currentDay = today;
        btnLoad.click();
    });

    const btnLoad = document.getElementById("rh-load");
    const btnNew = document.getElementById("rh-new-interval");
    const list = document.getElementById("rh-list");

    const modal = document.getElementById("reportHistoryModal");
    const btnClose = document.getElementById("rh-modal-close");
    const btnSave = document.getElementById("rh-save");
    const btnDelete = document.getElementById("rh-delete");

    const inputStart = document.getElementById("rh-start");
    const inputEnd = document.getElementById("rh-end");
    const inputDesc = document.getElementById("rh-desc");
    const msgBox = document.getElementById("rh-msg");

    let editingIndex = null;
    let currentDay = null;
    let entries = [];
    let currentDocId = null;


    // 👉 Preencher com data de hoje automaticamente
    const today = new Date().toISOString().split("T")[0];
    inpDate.value = today;
    currentDay = today;

    // 👉 Carregar automaticamente ao abrir
    setTimeout(() => btnLoad.click(), 150);


    function setMsg(text, type = "info") {
        if (!msgBox) return;
        if (!text) {
            msgBox.textContent = "";
            msgBox.style.display = "none";
            return;
        }
        msgBox.style.display = "block";
        msgBox.textContent = text;
        msgBox.className = "msg " + type;
    }

    // =========== MODAL ===========
    function openModal(index) {
        editingIndex = (index === undefined ? null : index);
        setMsg("");

        const data = (editingIndex === null ? {} : entries[editingIndex]) || {};

        inputStart.value = (data.start || "").slice(0, 5);
        inputEnd.value = (data.end || "").slice(0, 5);
        inputDesc.value = data.desc || "";

        btnDelete.style.display =
            editingIndex === null ? "none" : "inline-block";

        modal.classList.add("show");
        modal.style.display = "flex";
    }

    function closeModal() {
        modal.classList.remove("show");
        modal.style.display = "none";
    }

    btnClose.onclick = closeModal;
    modal.onclick = (e) => {
        if (e.target === modal) closeModal();
    };

    // =========== LISTA ===========
    function formatTime(t) {
        return t || "--:--";
    }

    function renderList() {
        if (!entries.length) {
            list.innerHTML = `<div class="muted">Nenhum intervalo neste dia.</div>`;
            return;
        }

        entries.sort((a, b) => (a.start || "").localeCompare(b.start || ""));

        list.innerHTML = entries
            .map(
                (i, idx) => `
        <div class="card" style="padding:10px;cursor:pointer" data-i="${idx}">
          <strong>${formatTime(i.start)} – ${formatTime(i.end)}</strong><br>
          <span class="muted">${i.desc || ""}</span>
        </div>
      `
            )
            .join("");

        list.querySelectorAll(".card").forEach((c) => {
            c.onclick = () => {
                const index = Number(c.getAttribute("data-i"));
                openModal(index);
            };
        });
    }

    function printDailyReport() {
        if (!currentDay || !entries.length) {
            alert("Abrindo impressão...");
            return;
        }

        const win = window.open("", "_blank");

        const rowsHtml = entries
            .map(
                e => `
        <tr>
          <td>${e.start || "--:--"}</td>
          <td>${e.end || "--:--"}</td>
          <td>${e.desc || ""}</td>
        </tr>
      `
            )
            .join("");

        win.document.write(`
    <html>
      <head>
        <title>Relatório Diário - ${currentDay}</title>
        <style>
          body {
            font-family: Arial, sans-serif;
            padding: 40px;
            color: #000;
          }
          h1 {
            margin-bottom: 10px;
          }
          .date {
            margin-bottom: 20px;
            font-size: 14px;
            color: #555;
          }
          table {
            width: 100%;
            border-collapse: collapse;
          }
          th, td {
            border: 1px solid #ccc;
            padding: 8px;
            vertical-align: top;
          }
          th {
            background: #f0f0f0;
          }
        </style>
      </head>
      <body>
        <h1>Relatório Diário</h1>
        <div class="date">Data: ${currentDay}</div>

        <table>
          <thead>
            <tr>
              <th>Início</th>
              <th>Fim</th>
              <th>Descrição</th>
            </tr>
          </thead>
          <tbody>
            ${rowsHtml}
          </tbody>
        </table>

        <script>
          window.onload = () => {
            window.print();
            window.onafterprint = () => window.close();
          };
        </script>
      </body>
    </html>
  `);

        win.document.close();
    }

    document.getElementById("rh-print")?.addEventListener("click", printDailyReport);


    // =========== CARREGAR ===========
    // =========== CARREGAR ===========
    btnLoad.onclick = async () => {
        // limpa mensagem, se estiver usando rh-msg
        setMsg && setMsg("");

        if (!db || !currentUser || !currentUser.uid) {
            console.log("Firestore ou usuário não disponível.");
            return;
        }

        currentDay = inpDate.value;
        if (!currentDay) {
            alert("Escolha a data");
            return;
        }

        list.innerHTML = `<div class="muted">Carregando…</div>`;

        const { collection, query, where, getDocs } = await import(
            "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js"
        );

        const col = collection(db, "users", currentUser.uid, "dailyReports");
        const q = query(col, where("date", "==", currentDay));

        const snap = await getDocs(q);

        // sempre pega o registro MAIS RECENTE desse dia
        let latestDoc = null;

        snap.forEach((d) => {
            const data = d.data() || {};
            const ts = Date.parse(data.updatedAt || data.createdAt || 0) || 0;

            if (!latestDoc || ts > latestDoc.ts) {
                latestDoc = {
                    id: d.id,
                    data,
                    ts,
                };
            }
        });

        entries = structuredClone(latestDoc?.data?.entries || []);
        currentDocId = latestDoc?.id || null;

        renderList();
    };


    // =========== NOVO INTERVALO ===========
    btnNew.onclick = () => {
        if (!inpDate.value) {
            alert("Escolha a data antes de criar um intervalo.");
            return;
        }
        currentDay = inpDate.value; // garante que currentDay esteja setado
        openModal(null);
    };

    // =========== SALVAR ===========
    btnSave.onclick = async () => {
        setMsg("");

        if (!currentUser) {
            setMsg("Você precisa estar logado para salvar.", "error");
            return;
        }

        if (!currentDay) {
            setMsg("Selecione um dia e clique em Carregar ou Novo intervalo.", "error");
            return;
        }

        const start = inputStart.value.trim();
        const end = inputEnd.value.trim();
        const desc = inputDesc.value.trim();

        if (!start || !end) {
            setMsg("Preencha Início e Fim.", "error");
            return;
        }

        if (editingIndex === null || editingIndex === undefined) {
            entries.push({ start, end, desc });
        } else {
            entries[editingIndex] = { start, end, desc };
        }

        try {
            const { doc, setDoc } = await import(
                "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js"
            );

            const realId =
                currentDocId ||
                (window.crypto && crypto.randomUUID
                    ? crypto.randomUUID()
                    : String(Date.now()));

            const ref = doc(
                db,
                "users",
                currentUser.uid,
                "dailyReports",
                realId
            );

            await setDoc(ref, {
                date: currentDay,
                entries: structuredClone(entries),
                updatedAt: new Date().toISOString(),
            });

            currentDocId = realId;
            closeModal();
            renderList();
        } catch (err) {
            console.error("Erro ao salvar histórico:", err);
            setMsg("Erro ao salvar. Veja o console para detalhes.", "error");
        }
    };

    // =========== EXCLUIR ===========
    btnDelete.onclick = async () => {
        if (editingIndex === null || editingIndex === undefined) return;
        if (!confirm("Excluir este intervalo?")) return;

        entries.splice(editingIndex, 1);

        try {
            const { doc, setDoc } = await import(
                "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js"
            );

            const realId =
                currentDocId ||
                (window.crypto && crypto.randomUUID
                    ? crypto.randomUUID()
                    : String(Date.now()));

            const ref = doc(
                db,
                "users",
                currentUser.uid,
                "dailyReports",
                realId
            );

            await setDoc(ref, {
                date: currentDay,
                entries: structuredClone(entries),
                updatedAt: new Date().toISOString(),
            });

            closeModal();
            renderList();
        } catch (err) {
            console.error("Erro ao excluir intervalo:", err);
            setMsg("Erro ao excluir. Veja o console para detalhes.", "error");
        }
    };
}

document.addEventListener("DOMContentLoaded", () => {
    initReportHistory();
});


function initMembersModalHandlers() {
    const apply = document.getElementById("members-apply");
    const close = document.getElementById("members-close");

    if (apply) {
        apply.removeEventListener("click", onMembersApply);
        apply.addEventListener("click", onMembersApply);
    }

    if (close) {
        close.removeEventListener("click", onMembersClose);
        close.addEventListener("click", onMembersClose);
    }

    console.log("%c[Members] Handlers reinstalados", "color: #4CAF50");
}

document.addEventListener("DOMContentLoaded", initMembersModalHandlers);
window.addEventListener("hashchange", initMembersModalHandlers);

(async function () {
    await initFirebase();
    initReportHistory();   // <<< ADICIONE AQUI
    renderRoute();

})();