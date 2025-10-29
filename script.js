
/* ===========================
   CONFIG & HELPERS
============================ */

function computeGut(g, u, t) {
    const G = Math.max(1, Math.min(10, Number(g) || 0));
    const U = Math.max(1, Math.min(10, Number(u) || 0));
    const T = Math.max(1, Math.min(10, Number(t) || 0));
    return G * U * T;
}
function gutClass(gut) {
    if (gut > 100) return 'A';
    if (gut >= 50) return 'B';
    return 'C';
}
/* prioridade = GUT + bônus de urgência do prazo */
function computePriority(dueISO, gut) {
    let bonus = 0;
    if (dueISO) {
        const hrs = (new Date(dueISO).getTime() - Date.now()) / 36e5;
        if (hrs <= 0) bonus = 200;            // atrasado
        else if (hrs <= 1) bonus = 160;
        else if (hrs <= 3) bonus = 120;
        else if (hrs <= 24) bonus = 60;
    }
    return (gut || 0) + bonus;
}

// === CHAT (por card) ===
const Chat = {
    async addMessage(cardId, text) {
        const createdAt = new Date().toISOString();
        const author = currentUser?.uid || 'anon';
        const authorName = currentUser?.displayName || currentUser?.email || '—';
        if (cloudOk) {
            const { collection, addDoc } = await import("https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js");
            await addDoc(collection(db, 'cards', cardId, 'chat'), { text, createdAt, author, authorName });
        } else {
            const all = LocalDB.load();
            const i = all.cards.findIndex(c => String(c.id) === String(cardId));
            if (i >= 0) {
                all.cards[i].chat = (all.cards[i].chat || []).concat({ text, createdAt, author, authorName });
                LocalDB.save(all);
            }
        }
    },
    listen(cardId, cb) {
        if (cloudOk) {
            const listen = async () => {
                const { collection, onSnapshot, orderBy, query } = await import("https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js");
                const qRef = query(collection(db, 'cards', cardId, 'chat'), orderBy('createdAt', 'asc'));
                return onSnapshot(qRef, (snap) => {
                    const arr = []; snap.forEach(d => arr.push({ id: d.id, ...d.data() }));
                    cb(arr);
                });
            };
            return listen();
        } else {
            const emit = () => cb((LocalDB.list().find(c => String(c.id) === String(cardId))?.chat) || []);
            emit();
            const t = setInterval(emit, 700);
            return () => clearInterval(t);
        }
    },
    async count(cardId) {
        if (cloudOk) {
            const { collection, getDocs } = await import("https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js");
            const snap = await getDocs(collection(db, 'cards', cardId, 'chat'));
            return snap.size || 0;
        } else {
            const l = (LocalDB.list().find(c => String(c.id) === String(cardId))?.chat) || [];
            return l.length;
        }
    }
};

const Members = {
    async add({ uid, displayName, email, role = 'editor' }) {
        const createdAt = new Date().toISOString();
        if (cloudOk) {
            const { doc, setDoc } = await import("https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js");
            // use o uid do auth quando houver; senão gera um id
            const id = uid || (crypto?.randomUUID?.() || String(Date.now() + Math.random()));
            await setDoc(doc(db, 'members', id), { displayName, email, role, createdAt });
            return { id, displayName, email, role, createdAt };
        } else {
            // fallback local
            const all = LocalDB.load();
            all.members = all.members || [];
            const id = String(Date.now() + Math.random());
            all.members.push({ id, displayName, email, role, createdAt });
            LocalDB.save(all);
            return { id, displayName, email, role, createdAt };
        }
    },
    async list() {
        if (cloudOk) {
            const { getDocs, collection, orderBy, query } = await import("https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js");
            const snap = await getDocs(query(collection(db, 'members'), orderBy('createdAt', 'asc')));
            const arr = []; snap.forEach(d => arr.push({ id: d.id, ...d.data() }));
            return arr;
        } else {
            return (LocalDB.load().members || []);
        }
    }
};

/* ===========================
   Mural Service (Firestore / Local)
=========================== */
const MuralService = (() => {
    const COL = 'mural';

    const LocalMural = {
        load() {
            try { return JSON.parse(localStorage.getItem('acia-mural') || '{"items":[]}'); }
            catch { return { items: [] } }
        },
        save(data) { localStorage.setItem('acia-mural', JSON.stringify(data)); },
        list() { return LocalMural.load().items || []; },
        upsert(item) {
            const db = LocalMural.load();
            const i = db.items.findIndex(x => x.id === item.id);
            if (i >= 0) db.items[i] = { ...db.items[i], ...item };
            else db.items.push(item);
            LocalMural.save(db);
        },
        bulkMarkRead(uid) {
            const db = LocalMural.load();
            db.items = (db.items || []).map(x => ({
                ...x,
                lidoBy: { ...(x.lidoBy || {}), [uid]: true }
            }));
            LocalMural.save(db);
        }
    };

    async function listOnce() {
        if (!cloudOk) return LocalMural.list();
        const { collection, getDocs, orderBy, query } = await import("https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js");
        const qRef = query(collection(db, COL), orderBy('createdAt', 'desc'));
        const snap = await getDocs(qRef);
        const arr = [];
        snap.forEach(d => arr.push({ id: d.id, ...d.data() }));
        return arr;
    }

    function listen(cb) {
        if (!cloudOk) {
            // polling leve
            cb(LocalMural.list());
            const t = setInterval(() => cb(LocalMural.list()), 1000);
            return () => clearInterval(t);
        }
        return (async () => {
            const { collection, onSnapshot, orderBy, query } = await import("https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js");
            const qRef = query(collection(db, COL), orderBy('createdAt', 'desc'));
            const unsub = onSnapshot(qRef, (snap) => {
                const arr = [];
                snap.forEach(d => arr.push({ id: d.id, ...d.data() }));
                cb(arr);
            });
            return unsub;
        })();
    }

    async function add({ titulo, corpo }) {
        const rec = {
            titulo: titulo || '(sem título)',
            corpo: corpo || '',
            createdAt: new Date().toISOString(),
            lidoBy: {} // mapa por uid
        };
        if (!cloudOk) {
            LocalMural.upsert({ id: String(Date.now() + Math.random()), ...rec });
            return;
        }
        const { collection, addDoc } = await import("https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js");
        await addDoc(collection(db, COL), rec);
    }

    async function markAllRead(uid) {
        if (!uid) return;
        if (!cloudOk) { LocalMural.bulkMarkRead(uid); return; }

        const { collection, getDocs, updateDoc, doc } =
            await import("https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js");
        const snap = await getDocs(collection(db, COL));
        await Promise.all(snap.docs.map(d => {
            const data = d.data() || {};
            const lidoBy = data.lidoBy || {};
            if (lidoBy[uid]) return Promise.resolve();
            return updateDoc(doc(db, COL, d.id), { lidoBy: { ...lidoBy, [uid]: true } });
        }));
    }

    return { listOnce, listen, add, markAllRead };
})();


const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
const setMsg = (el, type, text) => { if (!el) return; el.className = `msg ${type} show`; el.textContent = text; setTimeout(() => el.classList.remove('show'), 5000); };
let currentDisplayName = null;

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

function renderMural(items) {
    const uid = currentUser?.uid || 'anon';
    const unread = items.filter(x => !(x.lidoBy || {})[uid]);
    // badge
    if (muralUI.badge) {
        if (unread.length > 0) {
            muralUI.badge.textContent = unread.length;
            muralUI.badge.hidden = false;
        } else {
            muralUI.badge.hidden = true;
        }
    }
    // lista
    if (muralUI.list) {
        muralUI.list.innerHTML = items.map(x => {
            const lido = !!(x.lidoBy || {})[uid];
            return `<li class="${lido ? 'lido' : ''}">
        <div style="font-weight:700">${x.title || '(sem título)'}</div>
        ${x.corpo ? `<div class="muted" style="font-size:12px;margin-top:4px">${x.corpo}</div>` : ''}
      </li>`;
        }).join('') || '<li class="muted">Sem comunicados</li>';
    }
}

async function startMuralLive() {
    stopMuralLive(); // evita múltiplos listeners
    // ainda não logado? escuta local
    muralUI.unsub = await MuralService.listen(renderMural);
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

    // marcar tudo como lido
    muralUI.btnAllRead?.addEventListener('click', async () => {
        const uid = currentUser?.uid || 'anon';
        await MuralService.markAllRead(uid);
    });
}



const ALL_RESP = ["João Vitor Sgobin", "ssgobin"];
const FLOWS = {
    PROJETOS: ["PENDENTE", "EXECUÇÃO", "APROVAR", "CORRIGIR", "FINALIZAR", "CONCLUÍDO"],
    ROTINAS: ["PENDENTE", "EXECUÇÃO", "APROVAR", "CORRIGIR", "FINALIZAR", "CONCLUÍDO"],
    EVENTOS: ["PENDENTE", "PROJETOS", "CRIAÇÃO", "DIVULGAÇÃO", "ORGANIZAÇÃO", "EXECUÇÃO", "PÓS-EVENTO", "CONCLUÍDO"],
    VENDAS: ["PROSPECÇÃO", "PENDENTE", "NEGOCIAÇÃO", "PROPOSTA", "FECHADO", "CONCLUÍDO"]
};

const DEFAULT_CARD_DESC = `TAREFA QUE DEVE SER FEITA
Descrever todas as ações que devem ser aplicada para a execução e entrega da tarefa, com excelência.

OBJETIVO DA TAREFA
Descrever qual é a razão da execução desta tarefa e qual o resultado esperado.

INFORMAÇÕES ADICIONAIS
Listar todas as informações pertinentes que contribuam para a ação mais efetiva e assertiva em sua execução.`;


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
    storageBucket: "hubacia-407c1.firebasestorage.app",
    messagingSenderId: "633355141941",
    appId: "1:633355141941:web:e65270fdabe95da64cc27c",
    measurementId: "G-LN9BEKHCD5"
};

let cloudOk = false, app = null, db = null, auth = null, currentUser = null, currentRole = 'editor';


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
        function paintAuthUI() {
            const chip = $('#authChip');
            const btnIn = $('#btnLogin');
            const btnOut = $('#btnLogout');

            if (currentUser) {
                const name = currentDisplayName || currentUser.displayName || currentUser.email || currentUser.uid.slice(0, 6);
                chip.textContent = `${name} • ${currentRole}`;
                btnIn.classList.add('hidden');
                btnOut.classList.remove('hidden');
            } else {
                chip.textContent = 'Offline';
                btnIn.classList.remove('hidden');
                btnOut.classList.add('hidden');
            }
        }
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


/* ===========================
   LocalDB Fallback
============================ */
const LocalDB = {
    load() { try { return JSON.parse(localStorage.getItem('acia-kanban-v2') || '{"cards":[]}'); } catch { return { cards: [] } } },
    save(data) { localStorage.setItem('acia-kanban-v2', JSON.stringify(data)); },
    list() { return this.load().cards; },
    upsert(card) {
        const all = this.load();
        const i = all.cards.findIndex(c => String(c.id) === String(card.id));
        if (i >= 0) all.cards[i] = { ...all.cards[i], ...card }; else all.cards.push(card);
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

/* ===========================
   Data Access Layer (Firestore/Local)
============================ */
const Cards = {

    async add(card) {
        const base = {
            title: card.title || '(sem título)',
            desc: card.desc || '',
            board: card.board || 'PROJETOS',
            status: (card.status || FLOWS[card.board || 'PROJETOS'][0]),
            resp: card.resp,
            respUid: card.respUid || null,                 // NOVO
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
            return { id: docRef.id, ...base };
        } else {
            const id = String(Date.now() + Math.random());
            const rec = { id, ...base };
            LocalDB.upsert(rec); return rec;
        }
    },
    async update(id, patch) {
        if (cloudOk) {
            const { doc, updateDoc } = await import("https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js");
            await updateDoc(doc(db, 'cards', id), patch);
        } else {
            const all = LocalDB.load();
            const i = all.cards.findIndex(c => String(c.id) === String(id));
            if (i >= 0) { all.cards[i] = { ...all.cards[i], ...patch }; LocalDB.save(all); }
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

/* ===========================
   IA Checklist (Groq + fallback)
============================ */
async function generateChecklistGroq({ title, desc, board }) {
    const fallback = generateChecklistHeuristic({ title, desc, board });
    if (!GROQ_API_KEY) return fallback;

    // 🔹 Checklist padrão por fluxo
    let checklistBase = [];

    // PENDENTE > EXECUÇÃO
    if (board === "PENDENTE") {
        checklistBase.push(
            "Li e compreendi o que deve ser entregue",
            "Tirei todas as dúvidas sobre a demanda",
            "Tenho todas as informações para iniciar a execução"
        );
    }

    // EXECUÇÃO > APROVAR
    if (board === "EXECUCAO") {
        checklistBase.push(
            "Fiz a conferência de tudo o que devo entregar",
            "Cumpri os processos e padrões estabelecidos",
            "O que estou entregando está compatível com o acordado"
        );
    }

    try {
        const prompt = `Gere uma checklist complementar e objetiva (máximo 15 itens) em português brasileiro para a tarefa abaixo.
Evite repetir os seguintes itens já incluídos:
${checklistBase.join('\n')}

Contexto:
- Board: ${board}
- Título: ${title}
- Descrição: ${desc || '(sem descrição)'}
Responda apenas com os itens da checklist, um por linha.`;

        const body = JSON.stringify({
            model: GROQ_MODEL,
            messages: [
                { role: "system", content: "Você é um assistente de gestão de tarefas que cria checklists práticas e claras." },
                { role: "user", content: prompt }
            ],
            temperature: 0.3
        });

        const url = GROQ_PROXY_URL || "https://api.groq.com/openai/v1/chat/completions";
        const resp = await fetch(url, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${GROQ_API_KEY}`
            },
            body
        });

        if (!resp.ok) throw new Error('Groq HTTP ' + resp.status);
        const data = await resp.json();
        const text = (data?.choices?.[0]?.message?.content || "").trim();
        const aiItems = text
            .split(/\n+/)
            .map(s => s.replace(/^[-*\d\.\)\s]+/, '').trim())
            .filter(Boolean);

        // 🔹 Evita erro "aiItems is not iterable"
        const safeAI = Array.isArray(aiItems) ? aiItems : [];
        const safeFallback = Array.isArray(fallback) ? fallback : [];

        // 🔹 Junta padrões + IA
        const fullChecklist = [...checklistBase, ...safeAI, ...safeFallback];
        return fullChecklist;
    } catch (e) {
        console.warn('Groq falhou, usando fallback:', e.message);
        const safeFallback = Array.isArray(fallback) ? fallback : [];
        return [...checklistBase, ...safeFallback];
    }
}


// renderização no DOM
function renderChecklist(arr = []) {
    const el = $('#c-checklist');
    if (!el) return;
    el.innerHTML = arr.map((txt, i) => `
    <div style="display:flex;align-items:center;gap:6px;margin-bottom:4px">
      <input type="checkbox" id="chk-${i}">
      <label for="chk-${i}">${txt}</label>
    </div>`).join('');
}


function generateChecklistHeuristic({ title, desc, board }) {
    const t = (title || '').toLowerCase() + ' ' + (desc || '').toLowerCase();
    const items = [];
    items.push('Definir objetivo e escopo');
    items.push('Mapear responsáveis e prazos');

    if (board === 'EVENTOS') {
        items.push('Reservar local e confirmar data');
        items.push('Orçar fornecedores e solicitar propostas');
        items.push('Planejar comunicação/divulgação');
        items.push('Criar checklist de montagem e operação');
    } else if (board === 'ROTINAS') {
        items.push('Documentar passo a passo padrão (SOP)');
        items.push('Agendar recorrência e lembretes');
    } else { // PROJETOS
        items.push('Quebrar tarefa em sub-atividades');
        items.push('Validar com partes interessadas');
    }
    if (t.includes('arte') || t.includes('peça') || t.includes('social')) {
        items.push('Checar branding (logo, tipografia, cores)');
        items.push('Revisar gramática e consistência');
    }
    if (t.includes('fornecedor') || t.includes('compra') || t.includes('orc') || t.includes('orçamento')) {
        items.push('Cotação com pelo menos 3 fornecedores');
        items.push('Aprovação de orçamento');
    }
    return items.slice(0, 10);
}
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

    function renderMembersCheckboxes(rows) {
        if (!cMembers) return;
        // rows: [{id, displayName, email, role}]
        cMembers.innerHTML = rows.map((u, i) => {
            const uid = u.id || u.uid || String(i);
            const label = u.displayName || u.name || u.email || uid;
            const cid = `c-m-${uid.replace(/[^a-z0-9_-]/gi, '')}`;
            return `
      <label class="chip" for="${cid}" style="display:inline-flex;gap:6px;align-items:center;margin:4px 6px 0 0">
        <input type="checkbox" id="${cid}" name="c-member" value="${uid}" data-label="${label}">
        <span>${label}</span>
      </label>
    `;
        }).join('');
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
                renderMembersCheckboxes(rows);
            });
        } else {
            // Fallback local (sem Firestore): usa nomes coletados de cards existentes ou uma lista mínima
            const localNames = Array.from(new Set(LocalDB.list().map(c => c.resp).filter(Boolean)));
            const rows = localNames.length ? localNames.map((n, i) => ({ id: String(i), displayName: n })) : [{ id: 'local-1', displayName: 'Colaborador' }];
            cResp.innerHTML = `<option value="">— Selecione —</option>` + rows.map(u =>
                `<option value="${u.id}" data-label="${u.displayName}">${u.displayName}</option>`
            ).join('');
            renderMembersCheckboxes(rows);
        }
    }

    document.addEventListener('auth:changed', startUsersLiveForCreate);
    startUsersLiveForCreate();

    let unsubParentsForCreate = null;
    async function bindUsersToCreate() {
        try { unsubUsersForCreate && unsubUsersForCreate(); } catch { }
        unsubUsersForCreate = null;

        // Fallback (no cloud or db not ready yet)
        if (!cloudOk || !db) {
            try {
                const arr = (await Members.list()).filter(m => (m.role || 'editor') !== 'viewer');

                // Build options safely (no undefined var in ternary)
                const respOpts = arr.length
                    ? arr.map(u => `<option value="${u.id}">${u.displayName || u.email || u.id}</option>`).join('')
                    : '<option value="">—</option>';

                cResp.innerHTML = respOpts;
                cMembers.innerHTML = arr.map(u => `
  <label style="display:flex;align-items:center;gap:6px;margin:4px 0">
    <input type="checkbox" name="c-member" value="${u.id}">
    <span>${u.displayName || u.email || u.id}</span>
  </label>
`).join('');


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

            cMembers.innerHTML = users.map(u => {
                const cid = `c-m-${String(u.uid).replace(/[^a-z0-9_-]/gi, '')}`;
                return `
    <label class="chip" for="${cid}" style="display:inline-flex;gap:6px;align-items:center;margin:4px 6px 0 0">
      <input type="checkbox" id="${cid}" name="c-member" value="${u.uid}" data-label="${u.label}">
      <span>${u.label}</span>
    </label>
  `;
            }).join('');
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

    // ===== Criar card =====
    btnCreate.addEventListener('click', async () => {
        const title = (cTitle.value || '').trim();
        if (!title) { setMsg(msg, 'err', 'Informe o título.'); return; }

        const dueIso = cDue.value ? new Date(cDue.value).toISOString() : null;

        // rotina só vale quando o board for ROTINAS
        const isRotinaBoard = (cBoard.value === 'ROTINAS');
        const rtEnabledSel = $('#c-rt-enabled');
        const rtKindSel = $('#c-rt-kind');
        const isRotinaOn = isRotinaBoard && rtEnabledSel && (rtEnabledSel.value === 'on');

        if (isRotinaOn && !dueIso) {
            setMsg(msg, 'err', 'Para rotina, defina um prazo inicial (data/hora).');
            return;
        }

        const members = Array.from(document.querySelectorAll('#c-members input[name="c-member"]:checked')).map(ch => ch.value);

        const respUid = cloudOk ? cResp.value : null;
        const respLabel = cloudOk
            ? (cResp.selectedOptions[0]?.dataset?.label || '')
            : cResp.value;

        const routine = isRotinaOn
            ? { enabled: true, kind: rtKindSel?.value }
            : { enabled: false };

        const gut = computeGut(cG.value, cU.value, cT.value);
        const priority = computePriority(dueIso, gut);
        const gutGrade = gutClass(gut);

        // Descrição + checklist do buffer atual (IA ou básica)
        const desc = cDesc.value || buildDescFromModel();
        const checklistItems = setDescAndPreview._buffer || basicChecklistFromModel();

        const rec = await Cards.add({
            title,
            board: cBoard.value,
            resp: respLabel,          // compat com UI atual
            respUid,
            gut, gutGrade, priority,
            due: dueIso,
            desc,
            routine,
            members,
            gutG: Number(cG.value),
            gutU: Number(cU.value),
            gutT: Number(cT.value),
            parentId: (cParent?.value || '').trim() || null,
            parentTitle: (cParent && cParent.value ? (cParent.selectedOptions[0]?.dataset?.label || cParent.selectedOptions[0]?.textContent || '') : '')
        });

        if (checklistItems.length) {
            for (const it of checklistItems) {
                await Sub.addChecklistItem(rec.id, it.text, it.done);
            }
        }

        setMsg(msg, 'ok', '✅ Card criado!');
        // reset mínimos
        cTitle.value = '';
        cDue.value = '';
        mdObj.value = ''; mdAco.value = ''; mdInf.value = '';
        setDescAndPreview._buffer = null;
        renderModelPreview();                      // refaz preview vazio
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

/* ===========================
   Kanbans (3 abas), KPIs, Modal, Drag
============================ */
; (function initKanbans() {
    const tabs = $('#kb-tabs');
    const columnsEl = $('#columns');
    const kpiWrap = $('#kpis');
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
        // limpa listener anterior
        try { unsubUsersForEdit && unsubUsersForEdit(); } catch { }
        unsubUsersForEdit = null;

        // helper para pintar as opções
        const paint = (rows) => {
            // rows: [{ uid, label }]
            const baseResp = '<option value="">—</option>';
            // responsável segue como <select>
            mResp.innerHTML = baseResp + rows
                .map(u => `<option value="${u.uid}" data-label="${u.label}">${u.label}</option>`)
                .join('');

            // membros vira uma lista de checkboxes dentro do <div id="m-members">
            mMembers.innerHTML = rows.map(u => `
  <label class="pill" style="display:inline-flex;gap:6px;align-items:center;margin:4px 6px 0 0">
    <input type="checkbox" value="${u.uid}"/>
    <span>${u.label}</span>
  </label>
`).join('') || '<div class="muted">Sem itens</div>';

            // depois de pintar, tenta aplicar a seleção pendente
            applyPendingSelection?.();
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
        const { respUid, respLabel, memberUids, memberLabels } = pendingModalSelection;

        // RESPONSÁVEL
        let appliedResp = false;
        if (respUid && mResp.querySelector(`option[value="${respUid}"]`)) {
            mResp.value = respUid;
            appliedResp = true;
        } else if (respLabel) {
            // tenta casar por label (caso legado)
            const opt = Array.from(mResp.options).find(o => (o.dataset.label || o.textContent) === respLabel);
            if (opt) { mResp.value = opt.value; appliedResp = true; }
        }

        // se ainda não deu, adiciona uma opção “fantasma” só para exibir
        if (!appliedResp && (respUid || respLabel)) {
            const val = respUid || `legacy_${Date.now()}`;
            const lab = respLabel || respUid || '—';
            const ghost = document.createElement('option');
            ghost.value = val;
            ghost.dataset.label = lab;
            ghost.textContent = `${lab} (não cadastrado)`;
            mResp.appendChild(ghost);
            mResp.value = val;
        }

        // MEMBROS
        const want = new Set(memberUids || []);
        // também aceita labels legadas
        const wantLabels = new Set((memberLabels || []).map(s => String(s).trim()));

        Array.from(mMembers.options).forEach(o => {
            const byUid = want.has(o.value);
            const byLabel = wantLabels.has(o.textContent) || wantLabels.has(o.dataset?.label || '');
            o.selected = byUid || byLabel;
        });

        // limpa o pendente
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
        const overdue = list.filter(c => c.due && new Date(c.due) < new Date()).length;
        const exec = list.filter(c => c.status === 'EXECUÇÃO').length;
        const pend = list.filter(c => ['PENDENTE', 'BACKLOG'].includes(c.status)).length;
        const concl = list.filter(c => c.status === 'CONCLUÍDO').length;
        const card = (t, v) => `<div class="kpi-card"><div class="kpi-title">${t}</div><div class="kpi-val">${v}</div></div>`;
        kpiWrap.innerHTML = card('Total', total) + card('Vencidos', overdue) + card('Em execução', exec) + card('Pendentes', pend) + card('Concluídos', concl);
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
        <span class="pill" data-chat-count="${card.id}">💬 …</span>
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

    function paint(all) {
        lastAll = all;
        const flow = boardFlow(currentBoard);
        buildCols(flow);
        const rows = applyFilters(all);
        renderKPIs(rows);
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

        mG.value = (card.gutG ?? 5);
        mU.value = (card.gutU ?? 5);
        mT.value = (card.gutT ?? 5);

        mGUT.value = computeGut(mG.value, mU.value, mT.value);
        refreshEditGUT();

        mTitle.value = card.title || '';
        mDesc.value = card.desc || '';
        // dentro de openModal(card)
        window.currentEditingCardId = card.id;


        // pré-preenche os 3 campos do modelo a partir da descrição existente
        syncDescToModel();


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
        /* ========= RESPONSÁVEL & MEMBROS (robusto ao async) ========= */
        // o que queremos selecionar (aceita UID e/ou label legado)
        const desiredRespUid = (cloudOk && card.respUid) ? String(card.respUid) : null;
        const desiredRespLabel = (card.resp || '').trim() || null;

        const desiredMemberUids = Array.isArray(card.members)
            ? card.members.map(x => String(x))
            : [];
        // caso “legado” (membros salvos como nomes/emails), também tentamos por label:
        const desiredMemberLabels = Array.isArray(card.members)
            ? card.members.map(x => String(x).trim())
            : [];

        function applyRespAndMembers() {
            // só aplica quando os <option> já existem
            const readyResp = mResp && mResp.options && mResp.options.length > 0;
            const readyMembers = mMembers && mMembers.querySelectorAll('input[type="checkbox"]').length > 0;
            if (!readyResp || !readyMembers) return false;

            // --- responsável
            let appliedResp = false;
            if (desiredRespUid) {
                const optByVal = Array.from(mResp.options).find(o => o.value === desiredRespUid);
                if (optByVal) { mResp.value = optByVal.value; appliedResp = true; }
            }
            if (!appliedResp && desiredRespLabel) {
                const optByLabel = Array.from(mResp.options).find(o => {
                    const lbl = (o.dataset?.label || o.textContent || '').trim();
                    return lbl === desiredRespLabel;
                });
                if (optByLabel) { mResp.value = optByLabel.value; appliedResp = true; }
            }
            // se não encontrou, cria uma opção “fantasma” pra mostrar algo coerente
            if (!appliedResp && (desiredRespUid || desiredRespLabel)) {
                const ghost = document.createElement('option');
                ghost.value = desiredRespUid || `legacy_${Date.now()}`;
                ghost.dataset.label = desiredRespLabel || desiredRespUid || '—';
                ghost.textContent = `${ghost.dataset.label} (não cadastrado)`;
                mResp.appendChild(ghost);
                mResp.value = ghost.value;
            }

            // --- membros (marca por UID e também por label legado)
            const wantUids = new Set(desiredMemberUids);
            const wantLabels = new Set(desiredMemberLabels);
            mMembers.querySelectorAll('input[type="checkbox"]').forEach(cb => {
                const labelEl = cb.nextElementSibling;
                const lbl = (labelEl?.textContent || '').trim();
                cb.checked = wantUids.has(cb.value) || (lbl && wantLabels.has(lbl));
            });

            return true;
        }

        // tenta aplicar agora; se ainda não deu, re-tenta algumas vezes até as opções chegarem
        if (!applyRespAndMembers()) {
            let tries = 0;
            const t = setInterval(() => {
                tries++;
                if (applyRespAndMembers() || tries >= 25) clearInterval(t); // ~3s total @120ms
            }, 120);
        }
        /* ========= /RESP/MEM ========= */

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


        const members = Array
            .from(mMembers.querySelectorAll('input[type="checkbox"]:checked'))
            .map(cb => cb.value);
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
        const now = new Date();
        const embed = {
            title: `[${sevEl.value}] ${titleEl.value.trim()}`,
            color: sevColor(sevEl.value),
            description: `${descEl.value.trim()}\n\n**Quem reportou:** ${nameEl.value.trim() || '—'}\n**E-mail:** ${emailEl.value.trim() || '—'}\n**Quando:** ${now.toLocaleString('pt-BR')}`,
            footer: { text: 'Bug Reporter • ACIANexus' }
        };
        const payload = { username: 'ACIA Bug Reporter', embeds: [embed] };
        setBusy(true);
        try {
            const resp = await fetch(HOOK, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
            if (!resp.ok) throw new Error('HTTP ' + resp.status);
            form.reset(); setMsg(okMsg, 'ok', '✅ Obrigado! Seu relato foi enviado.');
        } catch (err) { console.error(err); setMsg(errMsg, 'err', '⚠️ Não foi possível enviar agora.'); }
        finally { setBusy(false); }
    });
})();

/* ===========================
Membros (admin)
============================ */
; (function initMembers() {
    const view = $('#view-members'); if (!view) return;
    const list = $('#mb-list');
    const addBtn = $('#mb-add');
    const nameIn = $('#mb-name');
    const emailIn = $('#mb-email');
    const roleIn = $('#mb-role');
    const msg = $('#memb-msg');

    function setMsgTxt(type, text) { setMsg(msg, type, text); }

    // render tabela simples
    let unsubUsers = null;
    async function startUsersLive() {
        if (!cloudOk) { list.innerHTML = '<div class="muted">Entre com sua conta.</div>'; return; }
        const { collection, onSnapshot, orderBy, query } = await import("https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js");
        const qRef = query(collection(db, 'users'), orderBy('name', 'asc'));
        if (unsubUsers) unsubUsers();
        unsubUsers = onSnapshot(qRef, (snap) => {
            const rows = [];
            snap.forEach(d => {
                const u = { id: d.id, ...d.data() };
                rows.push(`
  <div class="row user-row"
       data-docid="${u.id}"
       data-uid="${u.uid || u.id}"
       data-role="${u.role || 'editor'}"
       style="align-items:center;margin:6px 0">
    <div class="field"><input value="${u.name || '—'}" disabled /></div>
    <div class="field"><input value="${u.email || '—'}" disabled /></div>
    <div class="field">
      <select data-uid="${u.uid || u.id}">
        <option value="viewer" ${u.role === 'viewer' ? 'selected' : ''}>viewer</option>
        <option value="editor" ${(!u.role || u.role === 'editor') ? 'selected' : ''}>editor</option>
        <option value="admin" ${u.role === 'admin' ? 'selected' : ''}>admin</option>
      </select>
    </div>
    <div class="field" style="display:flex;justify-content:flex-end">
      <button class="btn secondary btn-del"
              type="button"
              title="Remover usuário"
              ${currentRole !== 'admin' ? 'disabled' : ''}
              style="border-color: rgba(239,68,68,.45)">
        Excluir
      </button>
    </div>
  </div>
`);

            });
            list.innerHTML = rows.join('') || '<div class="muted">Sem membros.</div>';

            // listeners de alteração de role
            list.querySelectorAll('select[data-uid]').forEach(sel => {
                sel.onchange = async () => {
                    if (currentRole !== 'admin') { setMsgTxt('err', 'Somente admin pode alterar papéis.'); sel.value = sel.getAttribute('value') || 'editor'; return; }
                    const uid = sel.getAttribute('data-uid');
                    const role = sel.value;
                    try {
                        const { doc, setDoc } = await import("https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js");
                        await setDoc(doc(db, 'users', uid), { role }, { merge: true });
                        setMsgTxt('ok', 'Papel atualizado.');
                        // se alterar o próprio, força re-render global
                        if (uid === currentUser?.uid) {
                            const evt = new Event('auth:changed'); document.dispatchEvent(evt);
                        }
                    } catch (e) { setMsgTxt('err', 'Falha ao alterar papel.'); }
                };
            });
            // excluir usuário (apenas admin)
            list.querySelectorAll('.btn-del').forEach(btn => {
                btn.onclick = async () => {
                    if (currentRole !== 'admin') {
                        setMsgTxt('err', 'Somente admin pode excluir usuários.');
                        return;
                    }
                    const row = btn.closest('.user-row');
                    const docId = row?.getAttribute('data-docid');
                    const uid = row?.getAttribute('data-uid');
                    const role = row?.getAttribute('data-role');

                    // não permitir excluir a si mesmo
                    if (uid && currentUser?.uid && uid === currentUser.uid) {
                        setMsgTxt('err', 'Você não pode excluir a si mesmo.');
                        return;
                    }

                    // impedir apagar o último admin
                    const adminsCount = list.querySelectorAll('.user-row[data-role="admin"]').length;
                    if (role === 'admin' && adminsCount <= 1) {
                        setMsgTxt('err', 'Não é possível excluir o último administrador.');
                        return;
                    }

                    if (!docId) return;
                    const ok = confirm('Excluir este usuário? Isso remove apenas o registro em /users (não apaga a conta de login).');
                    if (!ok) return;

                    try {
                        const { doc, deleteDoc } = await import("https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js");
                        await deleteDoc(doc(db, 'users', docId));
                        setMsgTxt('ok', 'Usuário removido.');
                    } catch (e) {
                        console.error(e);
                        setMsgTxt('err', 'Falha ao excluir. Verifique as regras do Firestore.');
                    }
                };
            });

        });
    }

    addBtn.addEventListener('click', async () => {
        if (currentRole !== 'admin') { setMsgTxt('err', 'Somente admin pode adicionar/atualizar.'); return; }
        const email = (emailIn.value || '').trim().toLowerCase();
        const name = (nameIn.value || '').trim() || null;
        const role = roleIn.value || 'editor';
        if (!email) { setMsgTxt('err', 'Informe um e-mail.'); return; }

        try {
            const { collection, query, where, getDocs, setDoc, doc } = await import("https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js");
            // procura por usuário já existente por e-mail
            const q = query(collection(db, 'users'), where('email', '==', email));
            const snap = await getDocs(q);

            if (!snap.empty) {
                // atualiza role do existente
                const d = snap.docs[0];
                await setDoc(doc(db, 'users', d.id), { role, name: name ?? d.data().name }, { merge: true });
                setMsgTxt('ok', 'Usuário atualizado.');
            } else {
                // cria um "pré-cadastro" sem UID (será unido quando este email logar)
                const tempId = `pre_${Date.now()}`;
                await setDoc(doc(db, 'users', tempId), { email, name, role, placeholder: true, createdAt: new Date().toISOString() });
                setMsgTxt('ok', 'Pré-cadastro criado. Quando essa pessoa fizer login, você pode ajustar/mesclar.');
            }
            emailIn.value = ''; nameIn.value = '';
        } catch (e) { console.error(e); setMsgTxt('err', 'Não foi possível adicionar.'); }
    });

    ; (function initAuthView() {
        const ALLOWED_DOMAIN = 'acia.com.br'; // mantém igual ao usado no initFirebase

        const view = document.querySelector('#view-auth');
        if (!view) return;

        const tabLogin = document.querySelector('#auth-tab-login');
        const tabRegister = document.querySelector('#auth-tab-register');
        const paneLogin = document.querySelector('#loginForm');
        const paneRegister = document.querySelector('#registerForm');

        const loginEmail = document.querySelector('#auth-login-email');
        const loginPass = document.querySelector('#auth-login-pass');
        const loginMsg = document.querySelector('#auth-login-msg');
        const loginBtn = document.querySelector('#auth-login-btn');
        const btnForgot = document.querySelector('#auth-forgot');

        const regName = document.querySelector('#auth-reg-name');
        const regEmail = document.querySelector('#auth-reg-email');
        const regPass = document.querySelector('#auth-reg-pass');
        const regPass2 = document.querySelector('#auth-reg-pass2');
        const regMsg = document.querySelector('#auth-reg-msg');
        const regBtn = document.querySelector('#auth-reg-btn');

        const toLogin = document.querySelector('#auth-to-login');
        const toRegister = document.querySelector('#auth-to-register');

        const setMsg = (el, type, text) => { el.className = `msg ${type} show`; el.textContent = text; };

        function switchTab(which) {
            const isLogin = which === 'login';
            tabLogin.classList.toggle('active', isLogin);
            tabRegister.classList.toggle('active', !isLogin);
            paneLogin.classList.toggle('hidden', !isLogin);
            paneRegister.classList.toggle('hidden', isLogin);
            (isLogin ? loginEmail : regEmail).focus();
        }

        tabLogin.onclick = () => switchTab('login');
        tabRegister.onclick = () => switchTab('register');
        toLogin.onclick = () => switchTab('login');
        toRegister.onclick = () => switchTab('register');

        // Prefill vindo de outra ação
        window.addEventListener('hashchange', () => {
            if (location.hash.startsWith('#/entrar')) switchTab('login');
        });

        // LOGIN
        paneLogin.addEventListener('submit', async (e) => {
            e.preventDefault();
            loginMsg.classList.remove('show');

            const email = (loginEmail.value || '').trim().toLowerCase();
            const pass = loginPass.value || '';

            if (!email.endsWith('@' + ALLOWED_DOMAIN)) {
                setMsg(loginMsg, 'err', `Use um e-mail @${ALLOWED_DOMAIN}.`);
                return;
            }
            if (!pass) {
                setMsg(loginMsg, 'err', 'Informe a senha.');
                return;
            }

            loginBtn.disabled = true; loginBtn.textContent = 'Entrando…';
            try {
                const { getAuth, signInWithEmailAndPassword, fetchSignInMethodsForEmail, sendPasswordResetEmail } =
                    await import("https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js");
                const auth = getAuth();

                try {
                    await signInWithEmailAndPassword(auth, email, pass);
                    setMsg(loginMsg, 'ok', 'Bem-vindo! Redirecionando…');
                    setTimeout(() => { location.hash = '#/kanban'; }, 500);
                } catch (err) {
                    if (err.code === 'auth/invalid-credential') {
                        // Descobrir se é senha errada ou usuário inexistente
                        try {
                            const methods = await fetchSignInMethodsForEmail(auth, email);
                            if (!methods.length) {
                                setMsg(loginMsg, 'err', 'Conta não encontrada. Clique em "Criar conta".');
                                switchTab('register'); regEmail.value = email; regPass.focus();
                            } else if (methods.includes('password')) {
                                setMsg(loginMsg, 'err', 'Senha incorreta. Você pode redefinir abaixo.');
                            } else {
                                setMsg(loginMsg, 'err', `Este e-mail usa outro método: ${methods.join(', ')}`);
                            }
                        } catch {
                            setMsg(loginMsg, 'err', 'Não foi possível verificar sua conta agora.');
                        }
                    } else if (err.code === 'auth/operation-not-allowed') {
                        setMsg(loginMsg, 'err', 'Método Email/Senha está desativado no Firebase.');
                    } else {
                        setMsg(loginMsg, 'err', 'Falha no login. Tente novamente.');
                    }
                }
            } finally {
                loginBtn.disabled = false; loginBtn.textContent = 'Entrar';
            }
        });

        // RESET DE SENHA
        btnForgot?.addEventListener('click', async (e) => {
            e.preventDefault();
            loginMsg.classList.remove('show');
            const email = (loginEmail.value || '').trim().toLowerCase();
            if (!email || !email.endsWith('@' + ALLOWED_DOMAIN)) {
                setMsg(loginMsg, 'err', `Informe seu e-mail @${ALLOWED_DOMAIN} para redefinir.`);
                return;
            }
            try {
                const { getAuth, sendPasswordResetEmail } =
                    await import("https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js");
                await sendPasswordResetEmail(getAuth(), email);
                setMsg(loginMsg, 'ok', `Enviamos instruções para ${email}.`);
            } catch (err) {
                setMsg(loginMsg, 'err', 'Não foi possível enviar o e-mail de redefinição.');
            }
        });

        // REGISTRO
        paneRegister.addEventListener('submit', async (e) => {
            e.preventDefault();
            regMsg.classList.remove('show');

            const name = (regName.value || '').trim();
            const email = (regEmail.value || '').trim().toLowerCase();
            const pass = regPass.value || '';
            const pass2 = regPass2.value || '';

            if (!email.endsWith('@' + ALLOWED_DOMAIN)) {
                setMsg(regMsg, 'err', `Use um e-mail @${ALLOWED_DOMAIN}.`);
                return;
            }
            if (pass.length < 6) {
                setMsg(regMsg, 'err', 'Senha muito curta (mín. 6).');
                return;
            }
            if (pass !== pass2) {
                setMsg(regMsg, 'err', 'As senhas não coincidem.');
                return;
            }

            regBtn.disabled = true; regBtn.textContent = 'Criando…';
            try {
                const { getAuth, createUserWithEmailAndPassword, sendEmailVerification, updateProfile } =
                    await import("https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js");
                const { getFirestore, doc, setDoc } =
                    await import("https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js");

                const auth = getAuth();
                const cred = await createUserWithEmailAndPassword(auth, email, pass);

                // Nome de exibição (opcional)
                if (name) {
                    try {
                        await updateProfile(cred.user, { displayName: name });
                        await cred.user.reload(); // <=== ADICIONE ISTO
                    } catch { }
                }


                // Cria/atualiza registro em /users (ajuda no painel de membros)
                try {
                    const db = getFirestore();
                    await setDoc(doc(db, 'users', cred.user.uid), {
                        uid: cred.user.uid,
                        name: name || null,
                        email: email,
                        role: 'editor',
                        createdAt: new Date().toISOString()
                    }, { merge: true });
                } catch { }

                // Verificação por e-mail
                try { await sendEmailVerification(cred.user); } catch { }

                setMsg(regMsg, 'ok', 'Conta criada! Verifique seu e-mail antes de entrar.');
                // Faz sign-out para forçar verificação antes do acesso
                try { (await import("https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js")).signOut(auth); } catch { }
                setTimeout(() => switchTab('login'), 800);
            } catch (err) {
                if (err.code === 'auth/email-already-in-use') {
                    setMsg(regMsg, 'err', 'Este e-mail já está em uso. Tente entrar ou redefinir a senha.');
                    switchTab('login'); loginEmail.value = email; loginPass.focus();
                } else if (err.code === 'auth/weak-password') {
                    setMsg(regMsg, 'err', 'Senha fraca (mín. 6).');
                } else {
                    setMsg(regMsg, 'err', 'Não foi possível criar sua conta agora.');
                }
            } finally {
                regBtn.disabled = false; regBtn.textContent = 'Criar conta';
            }
        });

    })();


    // rota
    function paintMembersPermissions() {
        addBtn.disabled = (currentRole !== 'admin');
    }
    document.addEventListener('auth:changed', () => { paintMembersPermissions(); startUsersLive(); });

    // se já veio logado
    startUsersLive();
    paintMembersPermissions();
})();
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


/* ===========================
   Router + Boot
============================ */
function renderRoute() {
    const hash = location.hash || '#/';

    if (cloudOk && !currentUser && !hash.startsWith('#/entrar')) {
        location.hash = '#/entrar';
        return;
    }


    // esconda TODOS os views sempre
    const views = ['#view-home', '#view-create', '#view-kanban', '#view-report', '#view-members', '#view-metrics', '#view-auth', '#view-calendar'];
    views.forEach(id => { const el = document.querySelector(id); el && el.classList.add('hidden'); });

    // mostre só o view da rota atual
    if (hash.startsWith('#/criar')) {
        document.querySelector('#view-create')?.classList.remove('hidden');
    } else if (hash.startsWith('#/kanban')) {
        document.querySelector('#view-kanban')?.classList.remove('hidden');
    } else if (hash.startsWith('#/reportar')) {
        document.querySelector('#view-report')?.classList.remove('hidden');
    } else if (hash.startsWith('#/membros')) {
        document.querySelector('#view-members')?.classList.remove('hidden');
    } else if (hash.startsWith('#/indicadores')) {
        document.querySelector('#view-metrics')?.classList.remove('hidden');
    } else if (hash.startsWith('#/entrar')) {
        document.querySelector('#view-auth')?.classList.remove('hidden');
    } else if (hash.startsWith('#/agenda')) {
        document.querySelector('#view-calendar')?.classList.remove('hidden');
        try { loadAndRenderCalendar(); } catch { }
    } else {
        document.querySelector('#view-home')?.classList.remove('hidden');
    }
}

window.addEventListener('hashchange', renderRoute);

(async function () {
    await initFirebase();
    renderRoute();
})();
// === IA: Gerar Checklist com Groq ===
$('#c-ai')?.addEventListener('click', async () => {
    const title = $('#c-title')?.value?.trim();
    const desc = $('#md-acoes')?.value?.trim() + "\n" + $('#md-objetivo')?.value?.trim();
    const info = $('#md-info')?.value?.trim();
    const prompt = `
  Gere uma checklist prática e detalhada com base na tarefa:
  Título: ${title || '(sem título)'}
  Descrição: ${desc || '(sem descrição)'}
  Informações adicionais: ${info || '(nenhuma)'}
  Liste apenas os itens da checklist, sem numeração nem explicações.
  `;

    const checklistEl = $('#c-checklist');
    checklistEl.innerHTML = '<p class="muted">⏳ Gerando checklist...</p>';

    try {
        const res = await fetch((GROQ_PROXY_URL || "https://api.groq.com/openai/v1/chat/completions"), {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${GROQ_API_KEY}`,
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                model: GROQ_MODEL,
                messages: [{ role: "user", content: prompt }]
            })
        });

        const data = await res.json();
        const text = data?.choices?.[0]?.message?.content || "Erro ao gerar checklist.";
        const lines = text.split(/\n+/).filter(l => l.trim());

        checklistEl.innerHTML = lines.map(l => `
      <label><input type="checkbox" /> ${l.replace(/^[•\-–\d\.\s]+/, '')}</label>
    `).join('');
    } catch (err) {
        checklistEl.innerHTML = `<p class="msg err">⚠️ Falha ao gerar checklist: ${err.message}</p>`;
    }
});

// === Upload de anexos via Uploadcare (REST, gratuito) ===
const UPLOADCARE_PUBLIC_KEY = "bec8b0653d0455ca2d7d"; // sua public key
// Dica: não precisa de domínio fixo; use sempre ucarecdn.com
async function uploadWithUploadcare(file) {
    const form = new FormData();
    form.append("UPLOADCARE_PUB_KEY", UPLOADCARE_PUBLIC_KEY);
    form.append("UPLOADCARE_STORE", "1");           // guarda no CDN
    form.append("file", file);

    const res = await fetch("https://upload.uploadcare.com/base/", {
        method: "POST",
        body: form
    });
    const data = await res.json();
    if (!data.file) throw new Error("Falha no upload (sem UUID).");
    // URL canônica do CDN:
    // Usa o seu subdomínio real
    return `https://4n9t773dy8.ucarecd.net/${data.file}/${encodeURIComponent(file.name)}`;

}

// Clique do botão "Anexar" no modal
document.querySelector('#m-send-attach')?.addEventListener('click', async () => {
    const picker = document.createElement('input');
    picker.type = 'file';
    picker.accept = '*/*';
    picker.onchange = async () => {
        const file = picker.files?.[0];
        if (!file) return;

        try {
            const url = await uploadWithUploadcare(file);

            // Render imediato no modal
            const list = document.querySelector('#m-attachments');
            if (list) {
                list.insertAdjacentHTML('beforeend', `
          <div class="comment">
            <a href="${url}" target="_blank">${file.name}</a>
          </div>`);
            }

            // Persistência no card (Firestore ou Local)
            if (window.currentEditingCardId) {
                if (cloudOk) {
                    const { collection, addDoc } =
                        await import("https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js");
                    await addDoc(collection(db, 'cards', window.currentEditingCardId, 'attachments'), {
                        name: file.name,
                        url,
                        createdAt: new Date().toISOString(),
                        author: currentUser?.uid || 'anon',
                        authorName: currentUser?.displayName || currentUser?.email || '—'
                    });
                } else {
                    // Local fallback
                    const all = LocalDB.load();
                    const i = all.cards.findIndex(c => String(c.id) === String(window.currentEditingCardId));
                    if (i >= 0) {
                        all.cards[i].attachments = (all.cards[i].attachments || [])
                            .concat({ name: file.name, url, createdAt: new Date().toISOString() });
                        LocalDB.save(all);
                    }
                }
            }

            alert("Arquivo anexado com sucesso!");
        } catch (e) {
            alert("⚠️ Erro no upload: " + e.message);
        }
    };
    picker.click();
});


(function () {
    const storageKey = 'acia-calendar-events-v1';
    // Simple calendar UI stored in localStorage (key: acia-calendar-events-v1)
    function loadAll() { try { return JSON.parse(localStorage.getItem(storageKey) || '{}') } catch { return {} } }
    function saveAll(obj) { localStorage.setItem(storageKey, JSON.stringify(obj || {})); }

    let viewDate = new Date();
    const calTitle = document.getElementById('cal-title');
    const grid = document.getElementById('cal-grid');

    function startOfMonth(d) { return new Date(d.getFullYear(), d.getMonth(), 1); }
    function endOfMonth(d) { return new Date(d.getFullYear(), d.getMonth() + 1, 0); }
    function formatDateISO(d) { return d.toISOString().slice(0, 10); }

    function render() {
        if (!grid) return;
        const first = startOfMonth(viewDate);
        const last = endOfMonth(viewDate);
        const startWeekDay = first.getDay(); // 0 = Sun
        const days = [];
        for (let i = 0; i < startWeekDay; i++) { const date = new Date(first); date.setDate(first.getDate() - (startWeekDay - i)); days.push({ date, inMonth: false }); }
        for (let d = 1; d <= last.getDate(); d++) { days.push({ date: new Date(viewDate.getFullYear(), viewDate.getMonth(), d), inMonth: true }); }
        while (days.length % 7 !== 0) { const date = new Date(last); date.setDate(last.getDate() + (days.length - (startWeekDay + last.getDate()) + 1)); days.push({ date, inMonth: false }); }

        const events = loadAll();
        const monthName = viewDate.toLocaleString('pt-BR', { month: 'long', year: 'numeric' });
        calTitle.textContent = 'Agenda — ' + (monthName.charAt(0).toUpperCase() + monthName.slice(1));

        const weekNames = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
        let html = '<div style="display:grid;grid-template-columns:repeat(7,1fr);gap:6px;margin-bottom:6px">';
        weekNames.forEach(n => html += `<div style="text-align:center;font-weight:700">${n}</div>`);
        html += '</div>';
        html += '<div style="display:grid;grid-template-columns:repeat(7,1fr);gap:8px">';

        days.forEach(dobj => {
            const d = dobj.date; const iso = formatDateISO(d); const dayNum = d.getDate();
            const evs = events[iso] || [];
            html += `<div class="cal-day ${dobj.inMonth ? '' : 'muted'}" data-date="${iso}" style="min-height:100px;padding:8px;border-radius:10px;border:1px solid rgba(96,165,250,.08);background:${dobj.inMonth ? 'rgba(255,255,255,.02)' : 'transparent'};position:relative;">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">
              <strong style="font-size:14px">${dayNum}</strong>
              <button class="cal-add btn secondary" data-date="${iso}" type="button" style="padding:4px 8px;font-size:12px">+</button>
            </div>
            <div class="cal-events" style="display:flex;flex-direction:column;gap:6px;max-height:60px;overflow:auto">`;
            evs.slice(0, 5).forEach((ev, i) => {
                const title = (ev.title || '(sem título)').replace(/</g, '&lt;');
                const resp = (ev.resp || '').split(',').map(s => s.trim()).filter(Boolean).slice(0, 2).join(', ');
                html += `<div class="cal-evt pill" data-date="${iso}" data-idx="${i}" style="cursor:pointer;padding:6px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:100px;max-height:175px;" title="${title}\n${resp}">${title}${resp ? (' · ' + resp) : ''}</div>`;
            });
            html += `</div></div>`;
        });
        html += '</div>';
        grid.innerHTML = html;

        grid.querySelectorAll('.cal-add').forEach(btn => btn.addEventListener('click', openAddModal));
        grid.querySelectorAll('.cal-evt').forEach(el => el.addEventListener('click', openEditModal));
    }

    document.getElementById('cal-prev')?.addEventListener('click', () => { viewDate.setMonth(viewDate.getMonth() - 1); render(); });
    document.getElementById('cal-next')?.addEventListener('click', () => { viewDate.setMonth(viewDate.getMonth() + 1); render(); });
    document.getElementById('cal-today')?.addEventListener('click', () => { viewDate = new Date(); render(); });

    // modal
    const modal = document.getElementById('calendarModal');
    const modalBack = document.getElementById('modalBack');
    const inDate = document.getElementById('evt-date');
    const inTime = document.getElementById('evt-time');
    const inTitle = document.getElementById('evt-title');
    const inResp = document.getElementById('evt-resp');
    const inDesc = document.getElementById('evt-desc');
    const msg = document.getElementById('evt-msg');
    const btnSave = document.getElementById('evt-save');
    const btnClose = document.getElementById('cal-close');
    const btnDelete = document.getElementById('evt-delete');
    let editing = null; // {date, idx}

    function openAddModal(e) { const d = e.currentTarget.dataset.date; editing = { date: d, idx: null }; inDate.value = d; inTime.value = ''; inTitle.value = ''; inResp.value = ''; inDesc.value = ''; msg.classList.remove('show'); modal.classList.add('show'); modalBack?.classList.add('show'); btnDelete.style.display = 'none'; }

    function openEditModal(e) { const iso = e.currentTarget.dataset.date; const idx = Number(e.currentTarget.dataset.idx); const events = loadAll(); const list = events[iso] || []; const ev = list[idx]; if (!ev) return; editing = { date: iso, idx }; inDate.value = iso; inTime.value = ev.time || ''; inTitle.value = ev.title || ''; inResp.value = ev.resp || ''; inDesc.value = ev.desc || ''; msg.classList.remove('show'); modal.classList.add('show'); modalBack?.classList.add('show'); btnDelete.style.display = 'inline-block'; }

    btnClose?.addEventListener('click', () => { modal.classList.remove('show'); modalBack?.classList.remove('show'); });

    btnSave?.addEventListener('click', () => {
        const date = inDate.value; if (!date) { msg.className = 'msg err show'; msg.textContent = 'Informe a data'; return; }
        const ev = { title: inTitle.value.trim(), time: inTime.value, resp: inResp.value.trim(), desc: inDesc.value.trim(), createdAt: new Date().toISOString() };
        const all = loadAll(); all[date] = all[date] || [];
        if (editing && editing.idx !== null) { all[date][editing.idx] = { ...all[date][editing.idx], ...ev }; }
        else { all[date].push(ev); }
        saveAll(all); modal.classList.remove('show'); modalBack?.classList.remove('show'); render();
    });

    btnDelete?.addEventListener('click', () => {
        if (!editing || editing.idx === null) return; const date = editing.date; const all = loadAll(); all[date] = all[date] || []; all[date].splice(editing.idx, 1); if (all[date].length === 0) delete all[date]; saveAll(all); modal.classList.remove('show'); modalBack?.classList.remove('show'); render();
    });

    render();
})();

/* ========== Calendar — Firestore persistence (shared agenda) ========== */
const CalendarDB = {
    async add(event) {
        const createdAt = new Date().toISOString();
        // if event has id -> update (setDoc), else add (addDoc)
        if (cloudOk && db) {
            const { collection, addDoc, doc, setDoc } = await import("https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js");
            if (event.id) {
                await setDoc(doc(db, 'agenda', event.id), { ...event, updatedAt: createdAt }, { merge: true });
                return { id: event.id };
            } else {
                const r = await addDoc(collection(db, 'agenda'), { ...event, createdAt });
                return { id: r.id };
            }
        } else {
            // local fallback (LocalDB or localStorage)
            try {
                const all = (typeof LocalDB !== 'undefined' && LocalDB.load) ? LocalDB.load() : JSON.parse(localStorage.getItem('acia_local') || '{}');
                all.agenda = all.agenda || [];
                if (event.id) {
                    const idx = all.agenda.findIndex(e => e.id === event.id);
                    if (idx >= 0) { all.agenda[idx] = { ...all.agenda[idx], ...event, updatedAt: createdAt }; }
                    else { all.agenda.push({ ...event, id: event.id, createdAt }); }
                } else {
                    const id = String(Date.now()) + String(Math.random()).slice(2, 8);
                    all.agenda.push({ ...event, id, createdAt });
                }
                if (typeof LocalDB !== 'undefined' && LocalDB.save) LocalDB.save(all);
                else localStorage.setItem('acia_local', JSON.stringify(all));
                return { id: event.id || all.agenda[all.agenda.length - 1].id };
            } catch (e) { console.error(e); throw e; }
        }
    },

    async list() {
        if (cloudOk && db) {
            const { getDocs, collection, orderBy, query } = await import("https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js");
            const q = query(collection(db, 'agenda'), orderBy('date', 'asc'));
            const snap = await getDocs(q);
            const arr = []; snap.forEach(d => arr.push({ id: d.id, ...d.data() }));
            return arr;
        } else {
            const all = (typeof LocalDB !== 'undefined' && LocalDB.load) ? LocalDB.load() : JSON.parse(localStorage.getItem('acia_local') || '{}');
            return (all.agenda || []);
        }
    },

    async remove(id) {
        if (!id) return;
        if (cloudOk && db) {
            const { doc, deleteDoc } = await import("https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js");
            await deleteDoc(doc(db, 'agenda', id));
        } else {
            const all = (typeof LocalDB !== 'undefined' && LocalDB.load) ? LocalDB.load() : JSON.parse(localStorage.getItem('acia_local') || '{}');
            all.agenda = (all.agenda || []).filter(a => a.id !== id);
            if (typeof LocalDB !== 'undefined' && LocalDB.save) LocalDB.save(all);
            else localStorage.setItem('acia_local', JSON.stringify(all));
        }
    }
};

let __currentCalendarEventId = null;

// simple renderer: groups by date and lists events
async function loadAndRenderCalendar() {
    try {
        const el = $('#cal-list'); // novo container para a lista Firestore
        if (!el) return;
        el.innerHTML = '<div style="opacity:.6">Carregando agenda…</div>';
        const events = await CalendarDB.list();
        if (!events || !events.length) { el.innerHTML = '<div class="muted">Nenhum evento encontrado.</div>'; return; }
        // group by date
        const grouped = events.reduce((acc, ev) => {
            const d = ev.date || '';
            acc[d] = acc[d] || [];
            acc[d].push(ev);
            return acc;
        }, {});
        // build HTML
        const keys = Object.keys(grouped).sort();
        const parts = keys.map(d => {
            const items = grouped[d].sort((a, b) => (a.time || '').localeCompare(b.time || ''))
                .map(ev => {
                    const idAttr = ev.id ? `data-evt-id="${ev.id}"` : '';
                    const time = ev.time ? `<div style="font-weight:700">${ev.time}</div>` : '';
                    return `<div class="card-item" ${idAttr} style="margin-bottom:8px;cursor:pointer;padding:8px" onclick="__openCalendarModal('${ev.id || ''}')">
                    <div class="title"><div class="title-text">${escapeHtml(ev.title || '—')}</div><div class="title-badges"></div></div>
                    <div class="meta">${time}<div style="margin-top:6px">${escapeHtml((ev.resp || '') + (ev.desc ? ' — ' + ev.desc : ''))}</div></div>
                  </div>`;
                }).join('');
            return `<div style="margin-bottom:14px"><h4 style="margin:6px 0">${d}</h4>${items}</div>`;
        });
        el.innerHTML = parts.join('');
    } catch (e) { console.error(e); $('#cal-grid').innerHTML = '<div class="muted">Erro ao carregar agenda.</div>'; }
}

// small helper to escape HTML
function escapeHtml(s) { return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }

// open modal and populate fields for event id (or create new)
window.__openCalendarModal = async function (id) {
    __currentCalendarEventId = id || null;
    const modal = $('#calendarModal');
    if (!modal) return;
    if (!id) {
        $('#cal-modal-title').textContent = 'Novo evento';
        $('#evt-date').value = '';
        $('#evt-time').value = '';
        $('#evt-title').value = '';
        $('#evt-resp').value = '';
        $('#evt-desc').value = '';
        $('#evt-delete').classList.add('hidden');
    } else {
        // load event
        const events = await CalendarDB.list();
        const ev = events.find(x => String(x.id) === String(id));
        if (ev) {
            $('#cal-modal-title').textContent = 'Editar evento';
            $('#evt-date').value = ev.date || '';
            $('#evt-time').value = ev.time || '';
            $('#evt-title').value = ev.title || '';
            $('#evt-resp').value = ev.resp || '';
            $('#evt-desc').value = ev.desc || '';
            $('#evt-delete').classList.remove('hidden');
        } else {
            // not found
            $('#evt-delete').classList.add('hidden');
        }
    }
    modal.classList.add('show');
};

// attach save handler
$('#evt-save').addEventListener('click', async () => {
    const date = $('#evt-date').value;
    const time = $('#evt-time').value;
    const title = $('#evt-title').value.trim();
    const resp = $('#evt-resp').value.trim();
    const desc = $('#evt-desc').value.trim();
    const createdBy = currentUser?.uid || 'anon';
    const createdByName = currentUser?.displayName || currentUser?.email || '—';
    if (!date || !title) { setMsg($('#evt-msg'), 'err', 'Preencha data e título.'); return; }
    const payload = { date, time, title, resp, desc, createdBy, createdByName };
    if (__currentCalendarEventId) payload.id = __currentCalendarEventId;
    try {
        const r = await CalendarDB.add(payload);
        setMsg($('#evt-msg'), 'ok', 'Evento salvo.');
        __currentCalendarEventId = r.id || payload.id;
        $('#calendarModal').classList.remove('show');
        await loadAndRenderCalendar();
    } catch (e) {
        console.error(e); setMsg($('#evt-msg'), 'err', 'Falha ao salvar.');
    }
});

// attach delete handler
$('#evt-delete').addEventListener('click', async () => {
    if (!__currentCalendarEventId) { setMsg($('#evt-msg'), 'err', 'Nenhum evento selecionado.'); return; }
    try {
        await CalendarDB.remove(__currentCalendarEventId);
        setMsg($('#evt-msg'), 'ok', 'Evento excluído.');
        __currentCalendarEventId = null;
        $('#calendarModal').classList.remove('show');
        await loadAndRenderCalendar();
    } catch (e) {
        console.error(e); setMsg($('#evt-msg'), 'err', 'Falha ao excluir.');
    }
});

// wire modal close button (in case not already wired)
$('#cal-close')?.addEventListener('click', () => { $('#calendarModal').classList.remove('show'); __currentCalendarEventId = null; });

// when '#cal-grid' clicked on empty area, open new modal for date? ignored for now

// initial load when firebase ready — try to detect cloudOk or app ready
(async function initCalendarIntegration() {

    // wait a bit for firebase init to possibly run in the same module
    try { await new Promise(r => setTimeout(r, 500)); } catch (e) { }
    loadAndRenderCalendar();
    // expose refresh
    window.refreshCalendar = loadAndRenderCalendar;
})();

document.addEventListener('auth:changed', loadAndRenderCalendar);


// ==== TROCA AUTOMÁTICA DE LOGO POR TEMA ====
const logo = document.getElementById('logo');

function aplicarTema() {
    const tema = localStorage.getItem('theme') || 'dark';
    document.body.setAttribute('data-theme', tema);

    // Troca o logo conforme o tema
    if (logo) {
        if (tema === 'light') {
            logo.src = 'img/8572256d-599f-44c3-86d9-40052c7a886c.jpeg'; // <- CAMINHO DA LOGO CLARA
        } else {
            logo.src = 'img/logoacianexus.png'; // <- CAMINHO DA LOGO ESCURA
        }
    }
}

// Quando o usuário clica pra trocar o tema:
document.getElementById('toggleTheme')?.addEventListener('click', () => {
    const atual = localStorage.getItem('theme') === 'light' ? 'dark' : 'light';
    localStorage.setItem('theme', atual);
    aplicarTema();
});

// Chama uma vez ao carregar a página
aplicarTema();

