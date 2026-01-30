/* ===========================
   LocalDB Fallback
============================ */
const LocalDB = {
    load() {
        try {
            return JSON.parse(localStorage.getItem("acia-kanban-v2") || '{"cards":[]}');
        } catch {
            return { cards: [] };
        }
    },

    save(data) {
        localStorage.setItem("acia-kanban-v2", JSON.stringify(data));
    },

    list() {
        return this.load().cards;
    },

    upsert(card) {
        const all = this.load();
        const i = all.cards.findIndex(c => String(c.id) === String(card.id));

        if (i >= 0) {
            // atualiza mantendo o que já tinha e sobrescrevendo com o novo
            all.cards[i] = { ...all.cards[i], ...card };
        } else {
            // novo card
            all.cards.push(card);
        }

        this.save(all);
    },

    remove(id) {
        const all = this.load();
        const i = all.cards.findIndex(c => String(c.id) === String(id));
        if (i >= 0) {
            all.cards.splice(i, 1);
            this.save(all);
        }
    }
};


// ==============================
// CHAT GLOBAL – DEBUG MODE 😈
// ==============================

function getFallbackAvatar(name) {
    const first = (name || "U")[0].toUpperCase();
    return `https://ui-avatars.com/api/?name=${first}&background=4f46e5&color=fff&size=64`;
}

async function openUserProfile(uid) {
    const { doc, getDoc } = await import(
        "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js"
    );

    const ref = doc(db, "presence", uid);
    const snap = await getDoc(ref);

    if (!snap.exists()) {
        alert("Usuário não possui perfil configurado.");
        return;
    }

    const data = snap.data();

    // Preencher o modal do perfil
    const modal = document.getElementById("profile-modal");
    modal.style.display = "flex";

    document.getElementById("profile-avatar-preview").src =
        data.photoURL || getGravatar(data.email, data.name);

    document.getElementById("profile-name").value = data.name || "";
    // preenche possíveis ids (compatibilidade: profile-role / profile-cargo)
    const roleEl = document.getElementById("profile-role") || document.getElementById("profile-cargo");
    if (roleEl) roleEl.value = data.role || data.cargo || "";

    // telefone: aceita profile-phone ou profile-tel
    const phoneEl = document.getElementById("profile-phone") || document.getElementById("profile-tel");
    if (phoneEl) phoneEl.value = data.phone || "";
    document.getElementById("profile-bio").value = data.bio || ""

    console.log(uid);
    // trava edição — estamos vendo o perfil de OUTRA PESSOA
    try { lockProfileModal(); } catch (e) { /* silent */ }
}

function lockProfileModal() {
    const modal = document.getElementById("profile-modal");

    modal.classList.add("readonly");

    // Desabilita todos os inputs
    modal.querySelectorAll("input, textarea, select").forEach(el => {
        el.setAttribute("disabled", "disabled");
    });

    // Esconde botões
    const saveBtn = document.getElementById("profile-save");
    const uploadBtn = document.getElementById("profile-change-photo");
    if (saveBtn) saveBtn.style.display = "none";
    if (uploadBtn) uploadBtn.style.display = "none";
}

function unlockProfileModal() {
    const modal = document.getElementById("profile-modal");

    modal.classList.remove("readonly");

    // Reativa inputs
    modal.querySelectorAll("input, textarea, select").forEach(el => {
        el.removeAttribute("disabled");
    });

    // Mostra botões
    const saveBtn = document.getElementById("profile-save");
    const uploadBtn = document.getElementById("profile-change-photo");
    if (saveBtn) saveBtn.style.display = "flex";
    if (uploadBtn) uploadBtn.style.display = "inline-block";
}


(function () {
    console.log("[ChatGlobal] Script carregado");

    const $id = (id) => {
        const el = document.getElementById(id);
        if (!el) console.warn(`[ChatGlobal] Elemento #${id} NÃO encontrado`);
        return el;
    };

    // ------------------------------
    // OBJETO PRINCIPAL DO CHAT
    // ------------------------------
    const ChatGlobal = {
        async send(text) {
            console.log("[ChatGlobal] send() chamado com:", text);
            try {
                if (!cloudOk) {
                    console.warn("[ChatGlobal] cloudOk = false");
                    alert("Firebase offline");
                    return;
                }
                if (!db) {
                    console.error("[ChatGlobal] db ainda não foi inicializado");
                    alert("DB não disponível");
                    return;
                }
                if (!currentUser) {
                    console.warn("[ChatGlobal] currentUser = null");
                    alert("Você precisa estar logado para enviar mensagens.");
                    return;
                }

                const { collection, addDoc } = await import(
                    "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js"
                );

                const reply = window.chatReplyTarget || null;

                const payload = {
                    text,
                    author: currentUser.uid,
                    authorName:
                        currentUser.displayName || currentUser.email || "Usuário",
                    createdAt: new Date().toISOString(),
                    pinned: false,
                    reactions: {},
                    replyTo: reply ? reply.id : null,
                    replyPreview: reply ? {
                        authorName: reply.authorName,
                        text: reply.text.slice(0, 120)
                    } : null,
                    mentions: window._pendingMentions || []
                };

                console.log("[ChatGlobal] Enviando payload para Firestore:", payload);

                const ref = await addDoc(collection(db, "chatGlobal"), payload);
                // limpar reply após enviar
                window.chatReplyTarget = null;
                document.getElementById("reply-preview")?.remove();
                console.log("[ChatGlobal] Mensagem salva com ID:", ref.id);
                givePoints(currentUser.uid, 1, "Mensagem no chat global");

            } catch (e) {
                console.error("[ChatGlobal] Erro em send():", e);
                alert("Erro ao enviar mensagem: " + (e.message || e));
            }
        },

        async react(msgId, emoji) {
            console.log("[ChatGlobal] react() msgId:", msgId, "emoji:", emoji);
            if (!cloudOk || !db || !currentUser) {
                console.warn(
                    "[ChatGlobal] react() abortado: cloudOk/db/currentUser inválidos"
                );
                return;
            }

            try {
                const { doc, updateDoc, getDoc } = await import(
                    "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js"
                );
                const ref = doc(db, "chatGlobal", msgId);
                const snap = await getDoc(ref);
                if (!snap.exists()) {
                    console.warn("[ChatGlobal] Documento de mensagem não existe:", msgId);
                    return;
                }

                const data = snap.data() || {};
                const reactions = data.reactions || {};
                reactions[currentUser.uid] = emoji;

                console.log("[ChatGlobal] Salvando reactions:", reactions);
                await updateDoc(ref, { reactions });
            } catch (e) {
                console.error("[ChatGlobal] Erro em react():", e);
            }
        },

        async togglePin(msgId, value) {
            console.log("[ChatGlobal] togglePin()", msgId, value);
            if (!cloudOk || !db) return;

            try {
                const { doc, updateDoc } = await import(
                    "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js"
                );
                await updateDoc(doc(db, "chatGlobal", msgId), { pinned: value });
            } catch (e) {
                console.error("[ChatGlobal] Erro em togglePin():", e);
            }
        },
    };

    window.ChatGlobal = ChatGlobal; // pra debugar no console

    // ------------------------------
    // PRESENÇA / ONLINE
    // ------------------------------
    async function initPresence() {
        console.log("[ChatGlobal] initPresence iniciado");

        if (!cloudOk || !currentUser || !db) {
            console.warn("[ChatGlobal] sem cloudOk/db/user — presença abortada");
            return;
        }

        const {
            doc,
            setDoc,
            onSnapshot,
            collection,
            updateDoc
        } = await import("https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js");

        const ref = doc(db, "presence", currentUser.uid);

        // marcar online
        await setDoc(ref, {
            online: true,
            typing: false,
            name: currentUser.displayName || currentUser.email,
            email: currentUser.email || null,
            lastSeen: Date.now()
        }, { merge: true });




        console.log("[ChatGlobal] marcado como online.");
        unlockBadge(currentUser.uid, "presenca-diaria");


        // HEARTBEAT a cada 15s — mantém o usuário online
        setInterval(async () => {
            try {
                await updateDoc(ref, {
                    online: true,
                    lastSeen: Date.now(),
                    email: currentUser.email || null
                });

            } catch (e) {
                console.warn("[ChatGlobal] heartbeat falhou", e);
            }
        }, 15000);

        // marcar offline ao fechar aba
        window.addEventListener("beforeunload", async () => {
            try {
                await updateDoc(ref, {
                    online: false,
                    lastSeen: Date.now()
                });
            } catch (e) { }
        });

        // LISTENER -> atualiza a UL com usuários online
        // LISTENER -> atualiza a UL com usuários online
        // LISTENER -> atualiza a UL com usuários online
        const onlineList = document.getElementById("online-list");

        onSnapshot(collection(db, "presence"), snap => {

            if (!onlineList) return;
            onlineList.innerHTML = "";

            snap.forEach(d => {
                const data = d.data();

                // considerar online apenas se lastSeen < 20s
                const isOnline = data.online && (Date.now() - data.lastSeen) < 20000;
                if (!isOnline) return;

                // PRIORIDADE DE AVATAR:
                // 1. foto customizada (base64)
                // 2. gravatar
                // 3. fallback
                const avatarURL =
                    data.photoURL ||
                    getGravatar(data.email, data.name) ||
                    getFallbackAvatar(data.name);

                const li = document.createElement("li");
                li.className = "online-user";
                li.style.listStyle = "none";

                li.dataset.uid = d.id; // UID

                li.innerHTML = `
    <div class="online-avatar">
        <img src="${avatarURL}" class="online-avatar-img">
        <span class="online-dot"></span>
    </div>
    <span class="online-name">${data.name}</span>
    ${data.typing ? `<span class="online-typing">digitando...</span>` : ""}
`;

                li.onclick = () => openDM(d.id);


                onlineList.appendChild(li);
            });
        });

    }


    // ------------------------------
    // TYPING INDICATOR
    // ------------------------------
    let typingTimeout;

    async function setTyping(isTyping) {
        console.log("[ChatGlobal] setTyping(", isTyping, ")");
        if (!cloudOk || !currentUser || !db) {
            console.warn("[ChatGlobal] setTyping() abortado – cloudOk/db/user faltando");
            return;
        }

        const { doc, updateDoc } = await import(
            "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js"
        );

        try {
            await updateDoc(doc(db, "presence", currentUser.uid), { typing: isTyping, lastSeen: new Date().toISOString() });
        } catch (e) {
            console.warn("[ChatGlobal] setTyping() falhou:", e.message || e);
        }
    }

    async function initTypingIndicator() {
        console.log("[ChatGlobal] initTypingIndicator() chamado");
        if (!db) {
            console.warn("[ChatGlobal] initTypingIndicator() abortado – db inexistente");
            return;
        }

        const typingEl = $id("typing-indicator");
        if (!typingEl) return;

        const { collection, onSnapshot } = await import(
            "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js"
        );

        onSnapshot(collection(db, "presence"), (snap) => {
            let someoneTyping = false;

            snap.forEach((d) => {
                const uid = d.id;
                if (uid !== currentUser?.uid && d.data().typing) {
                    someoneTyping = true;
                }
            });

            if (someoneTyping) {
                typingEl.innerHTML = `
        <div class="typing-dot"></div>
        <div class="typing-dot"></div>
        <div class="typing-dot"></div>
      `;
                typingEl.style.display = "flex";
            } else {
                typingEl.style.display = "none";
            }

        });
    }

    // ------------------------------
    // RECEBER MENSAGENS
    // ------------------------------
    async function initChatGlobal() {
        console.log("[ChatGlobal] initChatGlobal() chamado. cloudOk:", cloudOk, "db:", !!db);
        const chatBox = $id("chat-box");
        if (!chatBox) {
            console.warn("[ChatGlobal] #chat-box não encontrado");
            return;
        }

        if (!cloudOk || !db) {
            console.warn("[ChatGlobal] initChatGlobal() abortado – cloudOk/db faltando");
            return;
        }

        const { collection, onSnapshot, orderBy, query } = await import(
            "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js"
        );

        const q = query(collection(db, "chatGlobal"), orderBy("createdAt", "asc"));

        onSnapshot(
            q,
            (snap) => {
                console.log("[ChatGlobal] Snapshot chatGlobal, docs:", snap.size);
                chatBox.innerHTML = "";

                snap.forEach((d) => {
                    const msg = d.data();
                    const id = d.id;

                    const div = document.createElement("div");
                    div.className = "chat-msg" + (msg.pinned ? " chat-pinned" : "");
                    if (msg.mentions && msg.mentions.includes(currentUser.uid)) {
                        div.classList.add("mention-highlight");
                    }

                    // botão de responder
                    const replyBtn = document.createElement("button");
                    replyBtn.textContent = "↩️";
                    replyBtn.className = "reply-btn";
                    replyBtn.onclick = () => startReplyMode(msg);

                    div.appendChild(replyBtn);

                    // hora
                    const when = msg.createdAt ? new Date(msg.createdAt) : new Date();
                    const timeStr = when.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

                    // contador de reações
                    const reactions = msg.reactions || {};
                    const reactionCounts = {};
                    Object.values(reactions).forEach((emoji) => {
                        reactionCounts[emoji] = (reactionCounts[emoji] || 0) + 1;
                    });

                    // conteúdo: texto ou GIF
                    let contentHtml = msg.text || "";
                    if (contentHtml.startsWith("[GIF]")) {
                        const url = contentHtml.replace("[GIF]", "");
                        contentHtml = `<img src="${url}" class="chat-gif" />`;
                    }

                    // HTML profissional
                    div.innerHTML = `
      <div class="chat-header-top">
        <div>
          <strong>${msg.authorName || "Usuário"}</strong>
          <span class="chat-time">${timeStr}</span>
        </div>
      </div>

      <div class="chat-text">${contentHtml}</div>

      <div class="reactions-wrapper">
        ${Object.entries(reactionCounts)
                            .map(([emoji, count]) => `
            <div class="reaction-bubble">${emoji} ${count}</div>
        `)
                            .join("")}
      </div>

      <div class="chat-actions">
      <br>
          <button class="chat-action-btn react-btn">😊</button>
          <button class="chat-action-btn pin-btn">${msg.pinned ? "📌" : "📍"}</button>
          <button class="chat-action-btn more-btn">⋮</button>
      </div>
    `;

                    // (AQUI ONDE VOCÊ COLE!)
                    if (msg.replyTo && msg.replyPreview) {
                        const rep = document.createElement("div");
                        rep.className = "reply-to-block";
                        rep.innerHTML = `
        <strong>${msg.replyPreview.authorName}</strong><br>
        <span>${msg.replyPreview.text}</span>
    `;
                        div.prepend(rep);  // aparece acima da mensagem
                    }


                    // MENU FLUTUANTE DE REAÇÕES
                    const reactBtn = div.querySelector(".react-btn");
                    if (reactBtn) {
                        reactBtn.onclick = () => {
                            // se já existir um menu nesse card, remove
                            const existing = div.querySelector(".reaction-menu");
                            if (existing) existing.remove();

                            const menu = document.createElement("div");
                            menu.className = "reaction-menu";
                            menu.innerHTML = `
          <button>👍</button>
          <button>❤️</button>
          <button>😂</button>
          <button>😮</button>
          <button>👀</button>
        `;

                            div.appendChild(menu);

                            menu.querySelectorAll("button").forEach((b) => {
                                b.onclick = () => {
                                    ChatGlobal.react(id, b.textContent);
                                    menu.remove();
                                };
                            });
                        };
                    }

                    // FIXAR
                    const pinBtn = div.querySelector(".pin-btn");
                    if (pinBtn) {
                        pinBtn.onclick = () => {
                            ChatGlobal.togglePin(id, !msg.pinned);
                        };
                    }

                    chatBox.appendChild(div);
                });

                chatBox.scrollTop = chatBox.scrollHeight;
            },
            (err) => {
                console.error("[ChatGlobal] Erro no onSnapshot chatGlobal:", err);
            }
        );
    }

    // === GRUPOS: abrir modal ===
    function openGroupModal() {
        const modal = document.getElementById("groupModal");
        const list = document.getElementById("group-members-list");
        const nameInput = document.getElementById("group-name");

        modal.style.display = "flex";
        list.innerHTML = "";
        nameInput.value = "";

        loadGroupMemberList();
    }

    // carrega usuários para seleção
    async function loadGroupMemberList() {
        const listEl = document.getElementById("group-members-list");
        if (!listEl) return;

        const { collection, getDocs } =
            await import("https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js");

        const snap = await getDocs(collection(db, "users"));
        listEl.innerHTML = "";

        snap.forEach(docSnap => {
            const u = docSnap.data();
            const uid = docSnap.id;

            if (uid === currentUser.uid) return; // sempre adicionado automaticamente

            const div = document.createElement("div");
            div.className = "group-user-item";
            div.style = "padding:4px;cursor:pointer;border-bottom:1px solid #333";

            div.innerHTML = `
          <label style="display:flex;align-items:center;gap:8px">
            <input type="checkbox" value="${uid}">
            <span>${u.name || u.email}</span>
          </label>
        `;

            listEl.appendChild(div);
        });
    }

    document.getElementById("group-create")?.addEventListener("click", async () => {
        const name = document.getElementById("group-name").value.trim();
        const modal = document.getElementById("groupModal");

        if (!name) {
            alert("Dê um nome ao grupo!");
            return;
        }

        const checkboxes = document.querySelectorAll("#group-members-list input[type=checkbox]:checked");
        const members = [currentUser.uid];

        checkboxes.forEach(c => members.push(c.value));

        if (members.length < 2) {
            alert("Selecione pelo menos 1 membro além de você.");
            return;
        }

        const { collection, addDoc } =
            await import("https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js");

        await addDoc(collection(db, "groupChats"), {
            name,
            members,
            admins: [currentUser.uid], // criador é admin
            createdAt: new Date().toISOString(),
            lastAt: new Date().toISOString(),
            lastText: "Grupo criado",
        });

        alert("Grupo criado com sucesso!");
        modal.style.display = "none";
    });



    document.getElementById("create-group-btn")?.addEventListener("click", openGroupModal);
    document.getElementById("group-close")?.addEventListener("click", () => {
        document.getElementById("groupModal").style.display = "none";
    });


    // === NOTIFICAÇÃO DO CHAT GLOBAL ===
    async function initGlobalChatBadge() {
        if (!cloudOk || !db || !currentUser) return;

        const badge = document.getElementById("chat-badge-global");

        const { collection, onSnapshot, where, orderBy, query } =
            await import("https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js");

        const q = query(
            collection(db, "chatGlobal"),
            orderBy("createdAt", "desc")
        );

        onSnapshot(q, (snap) => {
            let count = 0;

            snap.forEach(d => {
                const msg = d.data();
                if (!msg.seenBy || !msg.seenBy[currentUser.uid]) {
                    count++;
                }
            });

            if (count > 0) {
                badge.textContent = count;
                badge.hidden = false;
            } else {
                badge.hidden = true;
            }
        });
    }

    // === NOTIFICAÇÃO DO CHAT PRIVADO (DM) ===
    async function initDMChatBadge() {
        if (!cloudOk || !db || !currentUser) return;

        const badge = document.getElementById("chat-badge-dm");

        const { collection, onSnapshot } =
            await import("https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js");

        const convRef = collection(db, "privateChats", currentUser.uid, "convs");

        onSnapshot(convRef, (snap) => {
            let totalNew = 0;

            snap.forEach(docSnap => {
                const convId = docSnap.id;
                const meta = docSnap.data();

                const lastAt = meta.lastAt ? new Date(meta.lastAt).getTime() : 0;

                // última leitura salva no navegador
                const localKey = `dm:lastRead:${convId}`;
                const lastRead = Number(localStorage.getItem(localKey) || 0);

                // mensagem é nova se o timestamp do servidor for maior que o visto localmente
                if (lastAt > lastRead) {
                    totalNew++;
                }
            });

            if (totalNew > 0) {
                badge.textContent = totalNew;
                badge.hidden = false;
            } else {
                badge.hidden = true;
            }
        });
    }

    // ------------------------------
    // GIF PICKER (Tenor)
    // ------------------------------
    async function openGifPicker() {
        console.log("[ChatGlobal] openGifPicker() chamado");

        // 1 — Buscar termo com SweetAlert
        const { value: searchTerm } = await Swal.fire({
            title: "Buscar GIF",
            input: "text",
            inputPlaceholder: "Pesquisar (ex: cat, dance, meme)…",
            showCancelButton: true,
            confirmButtonText: "Buscar",
            background: "var(--chat-bg)",
            color: "var(--chat-text)",
            confirmButtonColor: "#3b82f6",
            cancelButtonColor: "#555",
        });

        if (!searchTerm) return;

        Swal.fire({
            title: "Carregando…",
            didOpen: () => Swal.showLoading(),
            background: "var(--chat-bg)",
            color: "var(--chat-text)",
        });

        try {
            // 2 — Buscar no Tenor
            const res = await fetch(
                `https://g.tenor.com/v1/search?q=${encodeURIComponent(
                    searchTerm
                )}&key=LIVDSRZULELA&limit=24`
            );
            const data = await res.json();

            const urls = data.results.map((r) => r.media[0].gif.url);

            if (!urls.length) {
                Swal.fire({
                    icon: "error",
                    title: "Nenhum GIF encontrado",
                    background: "var(--chat-bg)",
                    color: "var(--chat-text)",
                });
                return;
            }

            // 3 — HTML da grid
            const gifHTML = `
            <div class="gif-grid">
                ${urls.map((url) => `<img class="gif-item" src="${url}" data-url="${url}"/>`).join("")}
            </div>
        `;

            // 4 — Abrir modal com GIFs
            await Swal.fire({
                title: "Escolha um GIF",
                html: gifHTML,
                width: 650,
                background: "var(--chat-bg)",
                color: "var(--chat-text)",
                showConfirmButton: false,
                showCloseButton: true,

                // ⭐⭐ AQUI É A PARTE IMPORTANTE ⭐⭐
                didOpen: () => {
                    document.querySelectorAll(".gif-item").forEach((img) => {
                        img.addEventListener("click", () => {
                            console.log("[ChatGlobal] GIF clicado:", img.dataset.url);

                            // Envia a mensagem
                            ChatGlobal.send(`[GIF]${img.dataset.url}`);

                            // Fecha o modal
                            Swal.close();
                        });
                    });
                }
            });

        } catch (err) {
            console.error("[ChatGlobal] Erro ao carregar GIF:", err);

            Swal.fire({
                icon: "error",
                title: "Erro ao carregar GIFs",
                background: "var(--chat-bg)",
                color: "var(--chat-text)",
            });
        }
    }



    // ------------------------------
    // INPUT / ENVIO
    // ------------------------------
    function initChatInput() {
        console.log("[ChatGlobal] initChatInput() chamado");
        const input = $id("chat-input");
        const sendBtn = $id("chat-send");
        const gifBtn = $id("gif-btn"); // opcional, se você criar no HTML

        if (!input || !sendBtn) {
            console.warn("[ChatGlobal] input ou botão de envio não encontrados");
            return;
        }

        sendBtn.addEventListener("click", async () => {
            const txt = input.value.trim();
            console.log("[ChatGlobal] Clique em ENVIAR. Texto:", txt);
            if (!txt) return;
            await ChatGlobal.send(txt);
            input.value = "";
            setTyping(false);
        });

        input.addEventListener("keydown", async (ev) => {
            if (ev.key === "Enter" && !ev.shiftKey) {
                ev.preventDefault();
                const txt = input.value.trim();
                console.log("[ChatGlobal] Enter pressionado. Texto:", txt);
                if (!txt) return;
                await ChatGlobal.send(txt);
                input.value = "";
                setTyping(false);
            }
        });

        input.addEventListener("input", async (ev) => {
            clearTimeout(typingTimeout);
            setTyping(true);
            typingTimeout = setTimeout(() => setTyping(false), 1200);

            const input = ev.target;
            const cursorPos = input.selectionStart;
            const text = input.value;
            const beforeCursor = text.substring(0, cursorPos);

            const atIndex = beforeCursor.lastIndexOf("@");
            if (atIndex === -1) {
                if (mentionPopup) mentionPopup.remove();
                mentionActive = false;
                return;
            }

            mentionActive = true;

            const query = beforeCursor.substring(atIndex + 1).toLowerCase();

            if (!mentionUsers.length) await loadMentionUsers();

            const matches = mentionUsers.filter(u =>
                u.name.toLowerCase().includes(query) ||
                u.email.toLowerCase().includes(query)
            );

            const rect = input.getBoundingClientRect();
            const x = rect.left + 10;
            const y = rect.top - 5;

            showMentionPopup(matches.slice(0, 6), x, y);
        });


        if (gifBtn) {
            gifBtn.addEventListener("click", openGifPicker);
        }
    }

    // ------------------------------
    // BOTÃO FLUTUANTE / ABRIR / FECHAR
    // ------------------------------
    function initChatToggle() {
        console.log("[ChatGlobal] initChatToggle() chamado");
        const chatBtn = $id("chat-toggle-btn");
        const chatPanel = $id("chat-panel");
        const chatClose = $id("chat-close");
        const icon = document.getElementById("chat-fab-icon");

        if (!chatBtn || !chatPanel) {
            console.warn(
                "[ChatGlobal] Botão flutuante ou painel não encontrados, toggle não inicializado"
            );
            return;
        }

        let isOpen = false;

        const openChat = () => {
            console.log("[ChatGlobal] Abrindo painel do chat");
            chatPanel.style.display = "flex";
            if (icon) icon.textContent = "✖";
            isOpen = true;

            // marcou o chat global como lido ao abrir o painel
            markChatGlobalRead();
        };

        const closeChat = () => {
            console.log("[ChatGlobal] Fechando painel do chat");
            chatPanel.style.display = "none";
            if (icon) icon.textContent = "💬";
            isOpen = false;
        };

        chatBtn.onclick = () => {
            isOpen ? closeChat() : openChat();
        };

        if (chatClose) {
            chatClose.onclick = () => closeChat();
        }
    }


    function openEmojiPicker() {
        const existing = document.querySelector(".emoji-modal");
        if (existing) existing.remove();

        const picker = document.createElement("div");
        picker.className = "emoji-modal";

        picker.onclick = (e) => e.stopPropagation(); // impede fechar ao clicar dentro

        const tabs = document.createElement("div");
        tabs.className = "emoji-tabs";

        const list = document.createElement("div");
        list.className = "emoji-list";

        picker.appendChild(tabs);
        picker.appendChild(list);

        document.body.appendChild(picker);

        Object.keys(emojiCategories).forEach((cat, index) => {
            const tab = document.createElement("div");
            tab.className = "emoji-tab" + (index === 0 ? " active" : "");
            tab.textContent = emojiCategories[cat][0];

            tab.onclick = (e) => {
                e.stopPropagation(); // não fecha modal

                document.querySelectorAll(".emoji-tab").forEach(t =>
                    t.classList.remove("active")
                );
                tab.classList.add("active");

                renderEmojiList(cat);
            };

            tabs.appendChild(tab);
        });

        renderEmojiList(Object.keys(emojiCategories)[0]); // primeiro grupo

        function renderEmojiList(cat) {
            list.innerHTML = "";
            emojiCategories[cat].forEach((emoji) => {
                const item = document.createElement("div");
                item.className = "emoji-item";
                item.textContent = emoji;

                item.onclick = () => {
                    const input = document.getElementById("chat-input");
                    input.value += emoji;
                    picker.remove();
                };

                list.appendChild(item);
            });
        }
    }



    // ------------------------------
    // EMOJI PICKER SIMPLES (OPCIONAL)
    // ------------------------------
    function initEmojiPicker() {
        console.log("[ChatGlobal] initEmojiPicker iniciado");

        const inputArea = document.querySelector(".chat-input");
        if (!inputArea) return;

        let emojiBtn = document.getElementById("emoji-btn");
        if (!emojiBtn) {
            emojiBtn = document.createElement("button");
            emojiBtn.id = "emoji-btn";
            emojiBtn.className = "btn emoji-btn";
            emojiBtn.textContent = "😊";
            emojiBtn.style.marginRight = "6px";
            inputArea.insertBefore(emojiBtn, inputArea.firstChild);
        }

        emojiBtn.onclick = (e) => {
            e.stopPropagation();
            openEmojiPicker();
        };

        // fechar ao clicar fora
        document.addEventListener("click", (e) => {
            const picker = document.querySelector(".emoji-modal");
            if (picker && !picker.contains(e.target) && e.target.id !== "emoji-btn") {
                picker.remove();
            }
        });
    }



    // ------------------------------
    // HOOKS GLOBAIS
    // ------------------------------
    document.addEventListener("DOMContentLoaded", () => {
        console.log("[ChatGlobal] DOMContentLoaded");
        initChatInput();
        initChatToggle();
        initEmojiPicker();
    });

    document.addEventListener("auth:changed", () => {
        console.log("[ChatGlobal] auth:changed. currentUser:", currentUser?.email);
        if (currentUser && cloudOk) {
            initPresence();
            initTypingIndicator();
            initChatGlobal();
            ensureUserProfile();
            initGlobalChatBadge();
            initDMChatBadge();

        } else {
            console.warn("[ChatGlobal] Usuário deslogado ou cloudOk = false");
        }
    });
})();

const Cards = {

    async add(card) {
        const base = {
            title: card.title || '(sem título)',
            desc: card.desc || '',
            board: card.board || 'PROJETOS',
            status: (card.status || FLOWS[card.board || 'PROJETOS'][0]),
            resp: card.resp,
            autoChecklist: card.autoChecklist !== false,
            respUid: card.respUid || null,                 // NOVO
            solicitante: card.solicitante,
            due: card.due || null,
            createdAt: new Date().toISOString(),
            routine: card.routine || { enabled: false },
            members: Array.isArray(card.members) ? card.members : [],
            gut: Number(card.gut) || 0,                      // NOVO
            gutGrade: card.gutGrade || 'C',                // NOVO
            priority: Number(card.priority) || 0,
            gutG: Number(card.gutG) || 5,
            gutU: Number(card.gutU) || 5,
            gutT: Number(card.gutT) || 5,
            // NOVO,
            parentId: card.parentId || null,
            parentTitle: card.parentTitle || ''
        };
        if (cloudOk) {
            const { collection, addDoc } = await import("https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js");
            const ref = collection(db, 'cards');
            const docRef = await addDoc(ref, base);
            const rec = { id, ...base };
            LocalDB.upsert(rec);
            return rec;

        } else {
            const id = String(Date.now() + Math.random());
            const rec = { id, ...base };
            LocalDB.upsert(rec); return rec;
        }


    },
    async update(id, patch) {
        if (cloudOk) {

            // 1) Buscar o card completo para poder comparar due, status anterior etc
            const { doc, updateDoc, getDoc } = await import(
                "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js"
            );

            const ref = doc(db, 'cards', id);
            const snap = await getDoc(ref);
            const card = snap.exists() ? snap.data() : {};

            // -------------------------------------------
            // GAMIFICAÇÃO (CORRETO E SEGURO)
            // -------------------------------------------

            // START -> executando pela primeira vez
            if (patch.status === "EXECUÇÃO" && !card.startAt) {
                patch.startAt = new Date().toISOString();
                // (NÃO GANHA PONTOS AQUI)
            }

            // CONCLUÍDO
            if (patch.status === "CONCLUÍDO") {

                // Garantir finishAt
                if (!patch.finishAt) {
                    patch.finishAt = new Date().toISOString();
                }

                // Card concluído → +10 pontos
                givePoints(currentUser.uid, 10, "Card concluído");
                applyLevelUp(currentUser.uid);

                // Concluído NO PRAZO → +15 pontos
                if (card?.due && new Date() <= new Date(card.due)) {
                    givePoints(currentUser.uid, 15, "Card concluído no prazo");
                    unlockBadge(currentUser.uid, "pontual");
                }
            }

            // -------------------------------------------
            // SALVAR patch com tudo ajustado
            // -------------------------------------------
            await updateDoc(ref, patch);

        } else {
            // LocalDB fallback
            const all = LocalDB.load();
            const i = all.cards.findIndex(c => String(c.id) === String(id));
            if (i >= 0) {
                all.cards[i] = { ...all.cards[i], ...patch };
                LocalDB.save(all);
            }
        }
    },

    listen(cb) {
        if (cloudOk) {
            import("https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js").then(({ collection, onSnapshot, orderBy, query }) => {
                const qRef = query(collection(db, 'cards'), orderBy('createdAt', 'asc'));
                const unsub = onSnapshot(qRef, (snap) => {
                    const arr = []; snap.forEach(d => arr.push({ id: d.id, ...d.data() })); cb(arr);
                });
                Cards._unsub = unsub;
            });
            return () => Cards._unsub && Cards._unsub();
        } else {
            cb(LocalDB.list());
            // pooling leve (700ms) para evitar “piscar”
            const t = setInterval(() => cb(LocalDB.list()), 700);
            return () => clearInterval(t);
        }
    },
    seed() {
        const sample = [
            { title: 'Brief campanha X', board: 'PROJETOS', status: 'PENDENTE', resp: 'BRUNA', due: new Date(Date.now() + 864e5).toISOString() },
            { title: 'Rotinas: fechar caixa', board: 'ROTINAS', status: 'EXECUÇÃO', resp: 'DANI' },
            { title: 'Evento: checklist palco', board: 'EVENTOS', status: 'PROJETOS', resp: 'JOÃO VITOR' },
            { title: 'Aprovar peças', board: 'PROJETOS', status: 'APROVAR', resp: 'VIVIAN' },
            { title: 'Divulgação imprensa', board: 'EVENTOS', status: 'DIVULGAÇÃO', resp: 'TATI' }
        ];
        sample.forEach(c => LocalDB.upsert({ id: String(Date.now() + Math.random()), createdAt: new Date().toISOString(), desc: '', ...c }));
        return sample.length;
    },
    async remove(id) {
        if (cloudOk) {
            const { doc, deleteDoc, collection, getDocs } =
                await import("https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js");

            // apaga subcoleções conhecidas
            const subs = ['comments', 'attachments', 'checklist', 'chat'];
            for (const sc of subs) {
                const snap = await getDocs(collection(db, 'cards', id, sc));
                await Promise.all(snap.docs.map(d => deleteDoc(d.ref)));
            }

            // apaga o doc do card
            await deleteDoc(doc(db, 'cards', id));
        } else {
            LocalDB.remove(id);
        }
    }

};



const Sub = {
    async addComment(cardId, text) {
        const createdAt = new Date().toISOString();
        const author = currentUser?.uid || 'anon';
        const authorName = currentUser?.displayName || currentUser?.email || '—';

        if (cloudOk) {
            const { collection, addDoc } = await import("https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js");
            await addDoc(collection(db, 'cards', cardId, 'comments'), { text, createdAt, author, authorName });
        } else {
            const all = LocalDB.load(); const i = all.cards.findIndex(c => String(c.id) === String(cardId));
            if (i >= 0) {
                all.cards[i].comments = (all.cards[i].comments || []).concat({ text, createdAt, author, authorName });
                LocalDB.save(all);
            }
        }
    },
    listenComments(cardId, cb) {
        if (cloudOk) {
            const listen = async () => {
                const { collection, onSnapshot, orderBy, query } = await import("https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js");
                const qRef = query(collection(db, 'cards', cardId, 'comments'), orderBy('createdAt', 'asc'));
                return onSnapshot(qRef, (snap) => { const arr = []; snap.forEach(d => arr.push({ id: d.id, ...d.data() })); cb(arr); });
            };
            listen().then(u => Sub._unsubC = u); return () => Sub._unsubC && Sub._unsubC();
        } else {
            const emit = () => cb((LocalDB.list().find(c => String(c.id) === String(cardId))?.comments) || []);
            emit(); const t = setInterval(emit, 700); return () => clearInterval(t);
        }
    },
    async addAttachment(cardId, url) {
        const createdAt = new Date().toISOString();
        const author = currentUser?.uid || 'anon';
        const authorName = currentUser?.displayName || currentUser?.email || '—';

        if (cloudOk) {
            const { collection, addDoc } = await import("https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js");
            await addDoc(collection(db, 'cards', cardId, 'attachments'), { url, createdAt, author, authorName });
        } else {
            const all = LocalDB.load(); const i = all.cards.findIndex(c => String(c.id) === String(cardId));
            if (i >= 0) {
                all.cards[i].attachments = (all.cards[i].attachments || []).concat({ url, createdAt, author, authorName });
                LocalDB.save(all);
            }
        }
    },
    listenAttachments(cardId, cb) {
        if (cloudOk) {
            const listen = async () => {
                const { collection, onSnapshot, orderBy, query } = await import("https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js");
                const qRef = query(collection(db, 'cards', cardId, 'attachments'), orderBy('createdAt', 'asc'));
                return onSnapshot(qRef, (snap) => { const arr = []; snap.forEach(d => arr.push({ id: d.id, ...d.data() })); cb(arr); });
            };
            listen().then(u => Sub._unsubA = u); return () => Sub._unsubA && Sub._unsubA();
        } else {
            const emit = () => cb((LocalDB.list().find(c => String(c.id) === String(cardId))?.attachments) || []);
            emit(); const t = setInterval(emit, 700); return () => clearInterval(t);
        }
    },
    async addChecklistItem(cardId, text, done = false) {
        const createdAt = new Date().toISOString();
        if (cloudOk) {
            const { collection, addDoc } = await import("https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js");
            await addDoc(collection(db, 'cards', cardId, 'checklist'), { text, done: !!done, createdAt });
        } else {
            const all = LocalDB.load(); const i = all.cards.findIndex(c => String(c.id) === String(cardId));
            if (i >= 0) {
                const l = (all.cards[i].checklist || []);
                l.push({ id: String(Date.now() + Math.random()), text, done: !!done, createdAt });
                all.cards[i].checklist = l; LocalDB.save(all);
            }
        }
    },
    async setChecklistDone(cardId, docId, done) {
        if (cloudOk) {
            const { doc, updateDoc } = await import("https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js");
            await updateDoc(doc(db, 'cards', cardId, 'checklist', docId), { done: !!done });
        } else {
            const all = LocalDB.load();
            const i = all.cards.findIndex(c => String(c.id) === String(cardId));
            if (i >= 0) {
                const l = (all.cards[i].checklist || []);
                const it = l.find(x => x.id === docId) || l[docId]; // compat: id ou idx
                if (it) { it.done = !!done; }
                LocalDB.save(all);
            }
        }
    },
    async toggleChecklistItem(cardId, idx) {
        if (cloudOk) {
            const list = await fetchChecklist(cardId);
            const newList = list.map((it, i) => i === idx ? { ...it, done: !it.done } : it);
            await saveChecklist(cardId, newList);
        } else {
            const all = LocalDB.load(); const i = all.cards.findIndex(c => String(c.id) === String(cardId));
            if (i >= 0) { const l = (all.cards[i].checklist || []); if (l[idx]) l[idx].done = !l[idx].done; LocalDB.save(all); }
        }
    },

    listenChecklist(cardId, cb) {
        if (cloudOk) {
            const listen = async () => {
                const { collection, onSnapshot, orderBy, query } = await import("https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js");
                const qRef = query(collection(db, 'cards', cardId, 'checklist'), orderBy('createdAt', 'asc'));
                const unsub = onSnapshot(qRef, (snap) => {
                    const arr = []; snap.forEach(d => arr.push({ id: d.id, ...d.data() }));
                    cb(arr);
                });
                return unsub;
            };
            listen().then(u => Sub._unsubCL = u);
            return () => Sub._unsubCL && Sub._unsubCL();
        } else {
            const emit = () => cb((LocalDB.list().find(c => String(c.id) === String(cardId))?.checklist) || []);
            emit(); const t = setInterval(emit, 700); return () => clearInterval(t);
        }
    },



};

// === ACTIVITY SYSTEM ===
// grava atividade (comentário ou evento)
// === ACTIVITY SYSTEM (compatível com Firebase e LocalDB) ===

// adicionar atividade
Sub.addActivity = async function (cardId, data) {
    const createdAt = new Date().toISOString();
    const author = currentUser?.uid || "anon";
    const authorName = currentUser?.displayName || currentUser?.email || "—";

    const payload = {
        text: data.text,
        type: data.type || "event",
        createdAt,
        author,
        authorName
    };

    if (cloudOk) {
        const { collection, addDoc } = await import("https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js");
        await addDoc(collection(db, "cards", cardId, "activity"), payload);
    } else {
        const all = LocalDB.load();
        const idx = all.cards.findIndex(c => String(c.id) === String(cardId));
        if (idx >= 0) {
            const arr = all.cards[idx].activity || [];
            arr.push(payload);
            all.cards[idx].activity = arr;
            LocalDB.save(all);
        }
    }
};

// pegar histórico inicial
Sub.getActivity = async function (cardId) {
    if (cloudOk) {
        const { collection, getDocs, orderBy, query } = await import("https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js");
        const qRef = query(collection(db, "cards", cardId, "activity"), orderBy("createdAt", "asc"));
        const snap = await getDocs(qRef);

        const arr = [];
        snap.forEach(doc => arr.push({ id: doc.id, ...doc.data() }));
        return arr;
    } else {
        const card = LocalDB.list().find(c => String(c.id) === String(cardId));
        return (card?.activity || []).sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
    }
};

// escutar tempo real (igual attachments/comments/checklist)
Sub.listenActivity = function (cardId, cb) {
    if (cloudOk) {
        const listen = async () => {
            const { collection, onSnapshot, orderBy, query } = await import(
                "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js"
            );
            const qRef = query(collection(db, "cards", cardId, "activity"), orderBy("createdAt", "asc"));

            return onSnapshot(qRef, (snap) => {
                const arr = [];
                snap.forEach(d => arr.push({ id: d.id, ...d.data() }));
                cb(arr);
            });
        };

        listen().then(u => Sub._unsubACT = u);
        return () => Sub._unsubACT && Sub._unsubACT();
    } else {
        const emit = () => {
            const card = LocalDB.list().find(c => String(c.id) === String(cardId));
            cb((card?.activity || []).sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt)));
        };

        emit();
        const t = setInterval(emit, 700);
        return () => clearInterval(t);
    }
};



// Atualiza o texto de um item da checklist (por docId)
async function updateChecklistItem(cardId, docId, newText) {
    if (cloudOk) {
        const { doc, updateDoc } = await import("https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js");
        await updateDoc(doc(db, 'cards', cardId, 'checklist', docId), { text: String(newText || '').trim() });
    } else {
        const all = LocalDB.load();
        const i = all.cards.findIndex(c => String(c.id) === String(cardId));
        if (i >= 0) {
            const l = (all.cards[i].checklist || []);
            const it = l.find(x => x.id === docId) || l[docId];
            if (it) it.text = String(newText || '').trim();
            LocalDB.save(all);
        }
    }
}

// Remove um item da checklist (por docId)
async function removeChecklistItem(cardId, docId) {
    if (cloudOk) {
        const { doc, deleteDoc } = await import("https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js");
        await deleteDoc(doc(db, 'cards', cardId, 'checklist', docId));
    } else {
        const all = LocalDB.load();
        const i = all.cards.findIndex(c => String(c.id) === String(cardId));
        if (i >= 0) {
            const l = (all.cards[i].checklist || []);
            const idx = l.findIndex(x => x.id === docId);
            if (idx >= 0) l.splice(idx, 1);
            all.cards[i].checklist = l;
            LocalDB.save(all);
        }
    }
}


async function fetchChecklist(cardId) {
    if (!cloudOk) {
        return (LocalDB.list().find(c => String(c.id) === String(cardId))?.checklist) || [];
    }
    const { collection, getDocs, orderBy, query } = await import("https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js");
    const qRef = query(collection(db, 'cards', cardId, 'checklist'), orderBy('createdAt', 'asc'));
    const snap = await getDocs(qRef);
    const arr = []; snap.forEach(d => arr.push({ id: d.id, ...d.data() }));
    return arr;
}


async function saveChecklist(cardId, list) {
    if (!cloudOk) {
        const all = LocalDB.load(); const i = all.cards.findIndex(c => String(c.id) === String(cardId));
        if (i >= 0) { all.cards[i].checklist = list; LocalDB.save(all); }
        return;
    }
    const { collection, getDocs, deleteDoc, doc, addDoc } = await import("https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js");
    const col = collection(db, 'cards', cardId, 'checklist');
    const cur = await getDocs(col);
    await Promise.all(cur.docs.map(d => deleteDoc(d.ref)));
    for (const it of list) { await addDoc(col, it); }
}



