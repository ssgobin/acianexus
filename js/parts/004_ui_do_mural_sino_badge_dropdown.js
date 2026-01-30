/* ===========================
   UI do Mural (sino, badge, dropdown)
=========================== */
const muralUI = {
    bell: null,
    badge: null,
    dd: null,
    list: null,
    btnAllRead: null,
    btnSeeAll: null,
    unsub: null,
    open: false
};

// rastreador de IDs do mural já vistos
let _muralSeen = new Set();

function renderMuralCombined(muralItemsRaw) {
    const uid = currentUser?.uid || 'anon';
    const muralItems = Array.isArray(muralItemsRaw) ? muralItemsRaw : (window._lastMuralItems || []);

    const eph = Ephemeral.list();
    const unreadEph = eph.filter(x => !x.lido).length;
    const unreadMural = muralItems.filter(x => !(x.lidoBy || {})[uid]).length;
    const inbox = Array.isArray(window._inboxItems) ? window._inboxItems : [];
    const unreadInbox = inbox.length; // já filtramos read==false no listener

    const unread = unreadEph + unreadMural + unreadInbox;



    // badge
    if (muralUI.badge) {
        if (unread > 0) {
            muralUI.badge.textContent = unread;
            muralUI.badge.hidden = false;
        } else {
            muralUI.badge.hidden = true;
        }
    }

    if (!muralUI.list) return;

    const ephHtml = eph.length
        ? [
            '<li class="muted" style="font-size:11px;margin:4px 0 6px">Atividades recentes</li>',
            ...eph.map(x => `
          <li class="${x.lido ? 'lido' : ''}">
            <div style="font-weight:700">${x.titulo || '(sem título)'}</div>
            ${x.corpo ? `<div class="muted" style="font-size:12px;margin-top:4px">${x.corpo}</div>` : ''}
          </li>
        `)
        ].join('')
        : '';


    const muralHtml = muralItems.length
        ? [
            '<li class="muted" style="font-size:11px;margin:8px 0 6px">Comunicados</li>',
            ...muralItems.map(x => {
                const lido = !!(x.lidoBy || {})[uid];
                return `
            <li class="${lido ? 'lido' : ''}">
              <div style="font-weight:700">${x.titulo || x.title || '(sem título)'}</div>
              ${x.corpo ? `<div class="muted" style="font-size:12px;margin-top:4px">${x.corpo}</div>` : ''}
            </li>`;
            })
        ].join('')
        : (!eph.length ? '<li class="muted">Sem comunicados</li>' : '');

    muralUI.list.innerHTML = ephHtml + muralHtml;
}


async function startMuralLive() {
    stopMuralLive(); // evita múltiplos listeners
    // ainda não logado? escuta local
    muralUI.unsub = await MuralService.listen((items) => {
        const currIds = new Set(items.map(x => x.id));
        _muralSeen = currIds;
        window._lastMuralItems = items;
        renderMuralCombined(items);
    });


}

function stopMuralLive() {
    try { muralUI.unsub && muralUI.unsub(); } catch { }
    muralUI.unsub = null;
}

function initMuralUI() {
    muralUI.bell = document.getElementById('mural-bell');
    muralUI.badge = document.getElementById('mural-badge');
    muralUI.dd = document.getElementById('mural-dropdown');
    muralUI.list = document.getElementById('mural-dropdown-list');
    muralUI.btnAllRead = document.getElementById('mural-marcar-lido');
    muralUI.btnSeeAll = document.getElementById('mural-ver-tudo');
    muralUI.btnClear = document.getElementById('mural-limpar');


    // toggle do dropdown
    muralUI.bell?.addEventListener('click', () => {
        muralUI.open = !muralUI.open;
        muralUI.dd.hidden = !muralUI.open;
    });

    // fechar se clicar fora
    document.addEventListener('click', (ev) => {
        if (!muralUI.open) return;
        const within = muralUI.dd?.contains(ev.target) || muralUI.bell?.contains(ev.target);
        if (!within) {
            muralUI.open = false;
            if (muralUI.dd) muralUI.dd.hidden = true;
        }
    });

    async function markAllInboxRead() {
        if (!cloudOk || !currentUser?.uid) return;
        const { collection, getDocs, doc, updateDoc, where, query } =
            await import("https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js");
        const qRef = query(collection(db, 'users', currentUser.uid, 'inbox'), where('read', '==', false));
        const snap = await getDocs(qRef);
        await Promise.all(snap.docs.map(d => updateDoc(doc(db, 'users', currentUser.uid, 'inbox', d.id), { read: true })));
    }


    // marcar tudo como lido
    muralUI.btnAllRead?.addEventListener('click', async () => {
        const uid = currentUser?.uid || 'anon';

        await MuralService.markAllRead(uid);        // marca no Firestore/local
        await markAllInboxRead();
        if (typeof Ephemeral?.markAllRead === 'function') Ephemeral.markAllRead(); // efêmero

        // atualiza cache para refletir lidos
        if (Array.isArray(window._lastMuralItems)) {
            window._lastMuralItems = window._lastMuralItems.map(x => ({
                ...x,
                lidoBy: { ...(x.lidoBy || {}), [uid]: true }
            }));
        }

        // re-render imediato
        if (typeof renderMuralCombined === 'function') {
            renderMuralCombined(window._lastMuralItems);
        } else if (typeof renderMural === 'function') {
            renderMural(window._lastMuralItems || []);
        }
    });

}

const ALL_RESP = ["João Vitor Sgobin", "ssgobin"];
const FLOWS = {
    PROJETOS: ["PENDENTE", "EXECUÇÃO", "APROVAR", "CORRIGIR", "FINALIZAR", "CONCLUÍDO"],
    ROTINAS: ["PENDENTE", "EXECUÇÃO", "APROVAR", "CORRIGIR", "FINALIZAR", "CONCLUÍDO"],
    EVENTOS: ["PENDENTE", "PROJETOS", "CRIAÇÃO", "DIVULGAÇÃO", "ORGANIZAÇÃO", "EXECUÇÃO", "PÓS-EVENTO", "CONCLUÍDO"],
    VENDAS: ["PROSPECÇÃO", "PENDENTE", "NEGOCIAÇÃO", "PROPOSTA", "FECHADO", "CONCLUÍDO"]
};

/* ========== IA (Groq) ========== */
// Cole sua chave do Groq. Se vazio, usa fallback heurístico local.
const GROQ_API_KEY = "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"; // <<< SUA GROQ KEY AQUI
// Modelo Groq (sugestões: "llama3-70b-8192", "mixtral-8x7b-32768")
const GROQ_MODEL = "llama-3.3-70b-versatile";
// Se encontrar CORS no navegador, publique um proxy simples e coloque a URL aqui:
const GROQ_PROXY_URL = "https://api.groq.com/openai/v1/chat/completions";

// Firebase (opcional). Sem as credenciais, roda em modo Local (localStorage).
const firebaseConfig = {
    apiKey: "AIzaSyA7l0LovQnLdv9obeR3YSH6MTdR2d6xcug",
    authDomain: "hubacia-407c1.firebaseapp.com",
    projectId: "hubacia-407c1",
    storageBucket: "hubacia-407c1.appspot.app",
    messagingSenderId: "633355141941",
    appId: "1:633355141941:web:e65270fdabe95da64cc27c",
    measurementId: "G-LN9BEKHCD5"
};


async function loadProfileDataIntoModal() {
    if (!currentUser || !db) return;

    const { doc, getDoc } = await import(
        "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js"
    );

    // vamos usar a presence como fonte principal
    const ref = doc(db, "presence", currentUser.uid);
    const snap = await getDoc(ref);
    const data = snap.exists() ? snap.data() : {};

    const nameInput = document.getElementById("profile-name");
    const roleInput = document.getElementById("profile-role");
    const phoneInput = document.getElementById("profile-phone");
    const bioInput = document.getElementById("profile-bio");
    const avatarImg = document.getElementById("profile-avatar-preview");

    const displayName =
        data.name ||
        currentDisplayName ||
        currentUser.displayName ||
        currentUser.email?.split("@")[0] ||
        "";

    if (nameInput) nameInput.value = displayName;
    if (roleInput) roleInput.value = data.role || "";      // 👈 cargo
    if (phoneInput) phoneInput.value = data.phone || "";
    if (bioInput) bioInput.value = data.bio || "";
    if (avatarImg) avatarImg.src = data.photoURL;
}

function initProfileModal() {
    const modal = document.getElementById("profile-modal");
    const btnClose = document.getElementById("profile-close");
    const btnSave = document.getElementById("profile-save");
    const btnChange = document.getElementById("profile-change-photo");
    const fileInput = document.getElementById("profile-photo");

    if (!modal || !btnClose || !btnSave) {
        console.warn("[Profile] Elementos do modal não encontrados");
        return;
    }

    // abrir modal (ex: quando clica no avatar / menu "Meu Perfil")
    const profileTriggers = [
        document.getElementById("authProfile"),  // se você tiver esse id
        document.getElementById("open-profile")  // ou esse
    ].filter(Boolean);

    profileTriggers.forEach((el) => {
        el.addEventListener("click", async () => {
            // garante que, ao abrir "Meu Perfil", os campos estejam editáveis
            try { unlockProfileModal(); } catch (e) { /* ignore */ }
            await loadProfileDataIntoModal();
            modal.style.display = "flex";
        });
    });

    // fechar no X
    btnClose.addEventListener("click", () => {
        const modal = document.getElementById("profile-modal");
        modal.classList.remove("readonly");
        unlockProfileModal();
        modal.style.display = "none";
    });

    // fechar clicando fora
    modal.addEventListener("click", (e) => {
        if (e.target === modal) {
            modal.style.display = "none";
        }
    });

    // trocar foto
    if (btnChange && fileInput) {
        btnChange.addEventListener("click", () => fileInput.click());
        document.getElementById("profile-photo").click();

        fileInput.addEventListener("change", async (ev) => {
            const file = ev.target.files[0];
            if (!file) return;
            const base64 = await uploadProfilePhotoLocal(file);
            const avatarImg = document.getElementById("profile-avatar-preview");
            if (avatarImg) avatarImg.src = base64;
        });
    }

    // SALVAR PERFIL (AQUI ESTAVA O PROBLEMA)
    btnSave.addEventListener("click", async () => {
        if (!currentUser || !db) return;

        const name = document.getElementById("profile-name")?.value.trim() || "";
        const role = document.getElementById("profile-role")?.value.trim() || "";
        const phone = document.getElementById("profile-phone")?.value.trim() || "";
        const bio = document.getElementById("profile-bio")?.value.trim() || "";

        try {
            const { doc, updateDoc } = await import(
                "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js"
            );

            const ref = doc(db, "presence", currentUser.uid);

            await updateDoc(ref, {
                name,
                role,   // 👈 cargo salvo aqui
                phone,
                bio
            });

            console.log("[Profile] Dados de perfil salvos com sucesso");
            alert("Perfil atualizado com sucesso!");

            // Atualiza coisas visuais se precisar (ex: nome em algum lugar)
            // ex: recarregar online-list automaticamente nas próximas snapshots

            modal.style.display = "none";
        } catch (e) {
            console.error("[Profile] Erro ao salvar:", e);
            alert("Erro ao salvar perfil: " + (e.message || e));
        }
    });
}

// garante inicialização
document.addEventListener("DOMContentLoaded", () => {
    initProfileModal();
});


async function initFirebase() {
    try {
        if (!firebaseConfig.apiKey) throw new Error('Sem config');

        const { initializeApp } = await import("https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js");
        const { getFirestore, doc, setDoc, getDoc } = await import("https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js");
        const {
            getAuth, onAuthStateChanged, signOut,
            signInWithEmailAndPassword, createUserWithEmailAndPassword,
            sendEmailVerification, sendPasswordResetEmail, fetchSignInMethodsForEmail
        } = await import("https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js");


        app = initializeApp(firebaseConfig);
        db = getFirestore(app);
        auth = getAuth(app);
        const ALLOWED_DOMAIN = 'acia.com.br';
        // handlers globais


        window.signInWork = async () => {
            const auth = getAuth();
            const email = (prompt('Seu e-mail @acia.com.br:') || '').trim().toLowerCase();
            if (!email.endsWith('@' + ALLOWED_DOMAIN)) {
                alert('Use um e-mail @' + ALLOWED_DOMAIN);
                return;
            }
            const pass = prompt('Senha:') || '';

            try {
                await signInWithEmailAndPassword(auth, email, pass);
                return; // sucesso
            } catch (err) {
                // Erro genérico (senha errada / usuário não existe / método desativado)
                if (err.code === 'auth/invalid-credential') {
                    try {
                        const methods = await fetchSignInMethodsForEmail(auth, email); // []
                        if (!methods.length) {
                            // usuário NÃO existe -> oferecer cadastro
                            const ok = confirm('Conta não encontrada. Deseja criar com este e-mail?');
                            if (!ok) return;

                            try {
                                const cred = await createUserWithEmailAndPassword(auth, email, pass);
                                try {
                                    await sendEmailVerification(cred.user);
                                    alert('Enviamos um e-mail de verificação. Confirme e faça login novamente.');
                                } catch { }
                                await signOut(auth);
                            } catch (e) {
                                if (e.code === 'auth/weak-password') {
                                    alert('Senha fraca (mín. 6 caracteres). Tente novamente.');
                                } else {
                                    alert('Falha ao criar conta: ' + (e.message || e.code));
                                }
                            }
                        } else if (methods.includes('password')) {
                            // usuário existe com senha -> provavelmente SENHA ERRADA
                            const r = confirm('Senha incorreta. Deseja receber um e-mail para redefinir?');
                            if (r) {
                                await sendPasswordResetEmail(auth, email);
                                alert('Enviamos instruções para ' + email);
                            }
                        } else {
                            // existe, mas com outro provedor (ex.: microsoft.com, google.com…)
                            alert('Este e-mail usa outro método de login: ' + methods.join(', ') +
                                '. Use o provedor correspondente ou peça para vincular senha.');
                        }
                    } catch (probeErr) {
                        alert('Erro ao verificar métodos de login: ' + (probeErr.message || probeErr.code));
                    }
                    return;
                }

                if (err.code === 'auth/operation-not-allowed') {
                    alert('O método Email/Password está desativado no Firebase Console.');
                    return;
                }

                // Outros erros (ex.: rede)
                alert('Falha no login: ' + (err.message || err.code));
            }


        };


        // (opcional) atalho pra “esqueci a senha”
        window.resetWorkPwd = async () => {
            const email = (prompt('E-mail @' + ALLOWED_DOMAIN + ' para reset de senha:') || '').trim().toLowerCase();
            if (!email.endsWith('@' + ALLOWED_DOMAIN)) { alert('Domínio inválido'); return; }
            try {
                await sendPasswordResetEmail(auth, email);
                alert('Enviamos instruções de redefinição de senha para ' + email);
            } catch (e) {
                alert('Não foi possível enviar o reset: ' + (e.message || e.code));
            }
        };
        window.signOutApp = async () => { await signOut(auth); };

        // muda UI conforme estado
        async function paintAuthUI() {
            const userArea = $('#authUserArea');
            const avatar = $('#authAvatar');
            const btnIn = $('#btnLogin');
            const btnOut = $('#btnLogout');

            const menu = $('#authMenu');
            const profileBtn = $('#authProfile');
            const logoutBtn = $('#authLogout');

            if (!userArea || !avatar) return;

            if (currentUser) {

                // esconder login
                if (btnIn) btnIn.classList.add('hidden');
                if (btnOut) btnOut.classList.add('hidden');

                // mostrar avatar
                userArea.classList.remove("hidden");

                // buscar presença do usuário
                const { doc, getDoc } = await import(
                    "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js"
                );

                const ref = doc(db, "presence", currentUser.uid);
                const snap = await getDoc(ref);
                const data = snap.exists() ? snap.data() : {};

                // pegar campos
                const savedPhoto = data.photoURL;

                const savedName = data.name || currentUser.displayName || currentUser.email?.split("@")[0];

                // gerar avatar com prioridade CORRETA
                const avatarURL =
                    savedPhoto

                avatar.src = avatarURL;

                // ao clicar: mostra/oculta menu
                avatar.onclick = (e) => {
                    e.stopPropagation();
                    menu.classList.toggle("hidden");
                };

                // fechar ao clicar fora
                document.addEventListener("click", (ev) => {
                    if (!userArea.contains(ev.target)) {
                        menu.classList.add("hidden");
                    }
                });

                // botão "Meu Perfil"
                profileBtn.onclick = () => {
                    const modal = document.getElementById("profile-modal");
                    const nameInput = document.getElementById("profile-name");

                    if (nameInput) nameInput.value = savedName;

                    modal.style.display = "flex";
                    menu.classList.add("hidden");
                };

                // botão "Sair"
                logoutBtn.onclick = () => {
                    menu.classList.add("hidden");
                    if (btnOut) btnOut.click();
                };


            } else {

                // offline
                if (btnIn) btnIn.classList.remove('hidden');
                if (btnOut) btnOut.classList.add('hidden');
                userArea.classList.add("hidden");

            }
        }

        onAuthStateChanged(auth, (user) => {
            if (user) {
                listenUserForceReload(db, user);
                listenThemeBroadcast();
            }
        });


        // Observa autenticação
        onAuthStateChanged(auth, async (u) => {
            currentUser = u || null;

            if (!u) {
                cloudOk = false;            // ou mantenha true só se quiser exigir login
                currentRole = 'viewer';
                currentDisplayName = null;
                document.dispatchEvent(new Event('auth:changed'));
                paintAuthUI();
                return; // << não continue se não houver usuário
            }

            // ... (só aqui busque o doc do usuário)
            const ud = await getDoc(doc(db, 'users', u.uid));
            currentRole = ud.exists() ? (ud.data().role || 'editor') : 'editor';
            currentDisplayName = (ud.exists() && ud.data().name) ? ud.data().name : (u.displayName || null);
            cloudOk = true;

            document.dispatchEvent(new Event('auth:changed'));
            paintAuthUI();
        });

        // liga botões
        $('#btnLogout')?.addEventListener('click', () => window.signOutApp());
        $('#btnLogin')?.addEventListener('click', () => { location.hash = '#/entrar'; });


    } catch (e) {
        cloudOk = false;
        $('#authChip').textContent = `Local • ${currentRole}`;
        console.warn('Firebase init falhou:', e.message);
    }
}

// Só checa manutenção depois do Firebase iniciar
document.addEventListener("auth:changed", () => {
    setTimeout(() => {
        checkMaintenance();              // roda depois de logar
        setInterval(checkMaintenance, 5000);
    }, 500);
});

function applyCarnavalTheme(enabled) {
    const root = document.documentElement;
    const on = !!enabled;

    root.classList.toggle("theme-carnaval", on);

    // opcional: persistir localmente pra ficar estável entre reloads
    try { localStorage.setItem("theme:carnaval", on ? "1" : "0"); } catch { }
}

function listenThemeBroadcast() {
  if (!db) return;

  import("https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js")
    .then(({ doc, onSnapshot }) => {
      const ref = doc(db, "admin", "broadcast");

      onSnapshot(ref, (snap) => {
        if (!snap.exists()) return;
        applySeasonThemes(snap.data());
      });
    })
    .catch((e) => console.warn("[ThemeBroadcast] Falhou:", e?.message || e));
}


function applySeasonThemes(data = {}) {
    const root = document.documentElement;

    root.classList.toggle("theme-pascoa", data.themePascoa === true);
}

// === CHECK MAINTENANCE MODE ===
async function checkMaintenance() {
    try {
        const { doc, getDoc } = await import(
            "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js"
        );

        const snap = await getDoc(doc(db, "admin", "broadcast"));
        const data = snap.exists() ? snap.data() : {};
        applyCarnavalTheme(data.carnavalTheme === true);

        if (data.maintenance === true) {
            if (!location.href.includes("maintenance.html")) {
                window.location.href = "maintenance.html";
            }
        }
    } catch (e) {
        console.warn("Erro ao checar manutenção:", e);
    }
}

// só começa a checar após firebase + auth estarem prontos
document.addEventListener("auth:changed", () => {
    checkMaintenance();
    setInterval(checkMaintenance, 5000);
});



// === FECHAR MODAL DO PERFIL ===
document.addEventListener("DOMContentLoaded", () => {
    const profileModal = document.getElementById("profile-modal");
    const closeBtn = document.getElementById("profile-close");

    if (closeBtn) {
        closeBtn.addEventListener("click", () => {
            profileModal.style.display = "none";
        });
    }

    // fechar ao clicar fora
    profileModal?.addEventListener("click", (e) => {
        if (e.target === profileModal) {
            profileModal.style.display = "none";
        }
    });
});


async function ensureUserProfile() {
    const { doc, getDoc, setDoc } = await import(
        "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js"
    );

    const ref = doc(db, "users", currentUser.uid);
    const snap = await getDoc(ref);

    if (!snap.exists()) {
        await setDoc(ref, {
            name: currentUser.displayName || "Usuário",
            email: currentUser.email,
            role: "member",
            photoURL: null,
            bio: "",
            phone: "",
            createdAt: Date.now()
        });
    }
}

// script.js
let unsubBroadcast = null;
function listenAdminForceReload() {
    if (!cloudOk || !db) return;
    if (unsubBroadcast) return;

    import("https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js")
        .then(({ doc, onSnapshot }) => {
            const ref = doc(db, 'admin', 'broadcast');
            let lastSeen = Number(localStorage.getItem('nexus:lastForceReload') || 0);

            unsubBroadcast = onSnapshot(ref, (snap) => {
                const data = snap.data() || {};
                const ts = Number(data.forceReloadAt || 0);
                if (!ts || ts <= lastSeen) return;

                // guarda “o que dizer” depois do reload
                const notice = {
                    ts,
                    category: data.category || 'Atualização do sistema',
                    message: data.message || '',
                    ref: data.ref || '',
                    by: data.by || 'Admin'
                };
                localStorage.setItem('nexus:lastForceReload', String(ts));
                localStorage.setItem('nexus:pendingReloadNotice', JSON.stringify(notice));

                // recarrega tipo Ctrl+Shift+R
                location.reload(true);
            }, (err) => {
                console.warn('Broadcast listener falhou:', err?.message || err);
            });
        });
}

document.addEventListener('auth:changed', listenAdminForceReload);
listenAdminForceReload();

