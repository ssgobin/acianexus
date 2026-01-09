/*
Para quem for mexer nesse código, boa sorte, esse código foi feito com fé em Deus.

Se você é budista, reze para Buda.
Se você é muçulmano, faça suas orações.
Se você é cristão, peça a Jesus.
Se você é espírita, invoque seus guias.
Se você é judeu, peça a Yahweh.
Se você é hinduísta, reze para Shiva.
Se você é ateu, boa sorte mesmo assim.
Se você é agnóstico, boa sorte também.

Se algo quebrar, lembre-se:
1. Não fui eu.
2. Já estava assim quando cheguei.
3. Se funcionar, eu chamo de feature.
4. Se não funcionar, chame de milagre quando voltar a funcionar.
5. Uma oração nunca é demais.
6. Lembre-se: "Funciona na minha máquina".
7. Não me peça para documentar o código, isso é trabalho para os fracos.
8. Você pode consertar, mas não me peça para explicar como funciona.

Ass: O programador que já desistiu 3 vezes antes de escrever esse comentário.
*/

/* ===========================
   CONFIG & HELPERS
============================ */
window._inboxItems = [];
let currentDM = null;
let currentDMOtherUid = null;
let dmUnsubMessages = null;
let dmUnsubMeta = null;
let dmConvsUnsub = null;
let dmTypingTimeout = null;

let MEMBER_TARGET = null;        // "c-members" ou "m-members"
const MEMBER_SELECTED = {};   // garante objeto global

let cloudOk = false, app = null, db = null, auth = null, currentUser = null, currentRole = 'editor';

// Notificações do chat (global + DM)
let chatBadgeUnsubGlobal = null;
let chatBadgeUnsubDM = null;

// Marca o chat GLOBAL como lido
function markChatGlobalRead() {
    try {
        const now = Date.now();
        localStorage.setItem("chatGlobal:lastRead", String(now));
        const el = document.getElementById("chat-badge-global");
        if (el) {
            el.hidden = true;
            el.textContent = "0";
        }
    } catch { }
}

// Pega a foto real do usuário direto do Firestore
async function getUserPhoto(uid) {
    const { doc, getDoc } =
        await import("https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js");

    const snap = await getDoc(doc(db, "users", uid));
    const data = snap.data() || {};

    return data.photoURL || "";
}

// Marca as DMs como lidas
function markDMRead() {
    try {
        const now = Date.now();
        localStorage.setItem("dm:lastRead", String(now));
        const el = document.getElementById("chat-badge-dm");
        if (el) {
            el.hidden = true;
            el.textContent = "0";
        }
    } catch { }
}



async function listenAdminThemeFlags() {
  if (!cloudOk) return; // se quiser, dá pra colocar fallback localStorage aqui também

  const { doc, onSnapshot } = await import("https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js");
  const ref = doc(db, "admin", "broadcast");

  return onSnapshot(ref, (snap) => {
    const data = snap.exists() ? snap.data() : {};
    applyCarnavalTheme(data.carnavalTheme === true);
  }, (err) => {
    console.warn("Theme flags listener falhou:", err?.message || err);
  });
}

document.addEventListener('auth:changed', listenAdminThemeFlags);
listenAdminThemeFlags();


// Inicia os listeners das bolinhas
async function initChatBadges() {
    if (!cloudOk || !db || !currentUser) return;

    const globalEl = document.getElementById("chat-badge-global");
    const dmEl = document.getElementById("chat-badge-dm");

    if (!globalEl && !dmEl) return;

    const {
        collection,
        onSnapshot,
        query,
        where
    } = await import("https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js");

    // ------------ GLOBAL ------------
    if (globalEl && !chatBadgeUnsubGlobal) {
        chatBadgeUnsubGlobal = onSnapshot(collection(db, "chatGlobal"), (snap) => {
            const lastRead = Number(localStorage.getItem("chatGlobal:lastRead") || "0");
            let count = 0;

            snap.forEach((d) => {
                const data = d.data() || {};
                const created = data.createdAt ? new Date(data.createdAt).getTime() : 0;
                if (!created) return;

                // ignora mensagens que eu mesmo mandei
                if (data.author && data.author === currentUser.uid) return;

                if (created > lastRead) count++;
            });

            if (count > 0) {
                globalEl.hidden = false;
                globalEl.textContent = count > 9 ? "9+" : String(count);
            } else {
                globalEl.hidden = true;
            }
        });
    }

    // ------------ DMs ------------
    if (dmEl && !chatBadgeUnsubDM) {
        const qDM = query(
            collection(db, "privateChats"),
            where("users", "array-contains", currentUser.uid)
        );

        chatBadgeUnsubDM = onSnapshot(qDM, (snap) => {
            const lastReadDM = Number(localStorage.getItem("dm:lastRead") || "0");
            let count = 0;

            snap.forEach((d) => {
                const data = d.data() || {};
                const lastAt = data.lastAt ? new Date(data.lastAt).getTime() : 0;
                if (!lastAt) return;

                if (lastAt > lastReadDM) count++;
            });

            if (count > 0) {
                dmEl.hidden = false;
                dmEl.textContent = count > 9 ? "9+" : String(count);
            } else {
                dmEl.hidden = true;
            }
        });
    }
}

// Quando logar, liga os badges
document.addEventListener("auth:changed", () => {
    initChatBadges();
    initDMConversations();
});

const emojiCategories = {
    "😀 Smileys & Emoção": [
        // Felizes / Risonhos
        "😀", "😃", "😄", "😁", "😆", "😅", "🤣", "😂", "🙂", "🙃",
        "😉", "😊", "😇", "🥰", "😍", "🤩", "😘", "😗", "😚", "😙",
        // Neutros / Pensativos
        "😋", "😛", "😜", "🤪", "😝", "🤑", "🤗", "🤭", "🤫",
        "🤔", "🤐", "🤨", "😐", "😑", "😶", "😏", "😒", "🙄", "😬",
        // Tristes / Preocupados
        "🤥", "😌", "😔", "😪", "🤤", "😴", "😷", "🤒", "🤕", "🤢",
        "🤮", "🤧", "🥵", "🥶", "🥴", "😵", "🤯", "🤠", "🥳", "😎",
        "🤓", "🧐", "😕", "😟", "🙁", "😮", "😯", "😲", "😳", "🥺",
        "😦", "😧", "😨", "😰", "😥", "😢", "😭", "😱", "😖", "😣",
        "😞", "😓", "😩", "😫", "🥱", "😤", "😡", "😠", "🤬", "😈"
    ],

    "❤️ Corações & Amor": [
        "❤️", "🧡", "💛", "💚", "💙", "💜", "🖤", "🤍", "🤎", "💔",
        "❣️", "💕", "💞", "💓", "💗", "💖", "💘", "💝", "💟", "☮️",
        "✝️", "☪️", "🕉", "☸️", "✡️", "🔯", "🕎", "☯️", "☦️", "🛐",
        "⛎", "♈", "♉", "♊", "♋", "♌", "♍", "♎", "♏", "♐", "♑",
        "♒", "♓", "🆔", "⚛️"
    ],

    "🔥 Ações & Mãos": [
        "🔥", "💥", "✨", "💫", "👋", "🤚", "🖐", "✋", "🖖", "👌",
        "🤏", "✌️", "🤞", "🤟", "🤘", "🤙", "👈", "👉", "👆", "🖕",
        "👇", "☝️", "👍", "👎", "✊", "👊", "🤛", "🤜", "👏", "🙌",
        "👐", "🤲", "🤝", "🙏", "✍️", "💅", "🤳", "💪", "🦾", "🦿",
        "🦵", "🦶", "👂", "🦻", "👃", "🧠", "🫀", "🫁", "🦷", "🦴"
    ],

    "🐶 Animais & Natureza": [
        // Mamíferos
        "🐶", "🐱", "🐭", "🐹", "🐰", "🦊", "🐻", "🐼", "🐨", "🐯",
        "🦁", "🐮", "🐷", "🐸", "🐵", "🐔", "🐧", "🐦", "🐤", "🦅",
        "🦉", "🦇", "🐺", "🐗", "🐴", "🦄", "🐝", "🐛", "🦋", "🐌",
        "🐞", "🐜", "🦟", "🦗", "🕷", "🕸", "🦂", "🐢", "🐍", "🦎",
        "🦖", "🦕", "🐙", "🦑", "🦐", "🦞", "🦀", "🐡", "🐠", "🐟",
        // Natureza
        "🐬", "🐳", "🐋", "🦈", "🐊", "🐅", "🐆", "🦓", "🦍", "🦧",
        "🌵", "🎄", "🌲", "🌳", "🌴", "🌱", "🌿", "☘️", "🍀", "🎍",
        "🎋", "🍃", "🍂", "🍁", "🍄", "🐚", "🌾", "💐", "🌷", "🌹",
        "🥀", "🌺", "🌸", "🌼", "🌻", "🌞", "🌝", "🌛", "🌜", "🌚"
    ],

    "🍔 Comida & Bebida": [
        // Frutas
        "🍏", "🍎", "🍐", "🍊", "🍋", "🍌", "🍉", "🍇", "🍓", "🍈",
        "🍒", "🍑", "🥭", "🍍", "🥥", "🥝", "🍅", "🥑",
        // Comidas
        "🍆", "🌶", "🥒", "🥬", "🥦", "🌽", "🥕", "🥔", "🥯", "🍞",
        "🥖", "🥨", "🧀", "🥚", "🍳", "🥞", "🧇", "🥓", "🥩", "🍗",
        "🍖", "🌭", "🍔", "🍟", "🍕", "🥪", "🥙", "🧆", "🌮", "🌯",
        "🥗", "🥘", "🍝", "🍜", "🍲", "🍛", "🍣", "🍱", "🥟", "🍤",
        "🍙", "🍚", "🍘", "🍥", "🥠", "🍢", "🍡", "🍧", "🍨", "🍦",
        "🥧", "🧁", "🍰", "🎂", "🍮", "🍭", "🍬", "🍫", "🍿", "🍩",
        // Bebidas
        "🍪", "🌰", "🥜", "🍯", "🥛", "☕", "🍵", "🧃", "🥤", "🍺",
        "🍻", "🥂", "🍷", "🥃", "🍸", "🍹", "🍾", "🍶", "🧊"
    ],

    "⚽ Atividades & Esportes": [
        "⚽", "🏀", "🏈", "⚾", "🥎", "🎾", "🏐", "🏉", "🥏", "🎱",
        "🪀", "🏓", "🏸", "🏒", "🏑", "🥍", "🏏", "🥅", "⛳", "🪁",
        "🏹", "🎣", "🤿", "🥊", "🥋", "🎽", "🛹", "🛷", "⛸", "🥌",
        "🎿", "⛷", "🏂", "🪂", "🏋️", "🤼", "🤸", "⛹️", "🤺", "🤾",
        "🏌️", "🏇", "🧘", "🏄", "🏊", "🤽", "🚣", "🧗", "🚴", "🚵",
        "🏆", "🥇", "🥈", "🥉", "🏅", "🎖", "🏵", "🎗", "🎫", "🎟",
        "🎪", "🤹", "🎭", "🎨", "🎬", "🎤", "🎧", "🎼", "🎹", "🥁",
        "🎷", "🎺", "🎸", "🪕", "🎻", "🎲", "♟", "🎯", "🎳", "🎮"
    ],

    "🚀 Objetos & Viagem": [
        "🚗", "🚕", "🚙", "🚌", "🚎", "🏎", "🚓", "🚑", "🚒", "VX",
        "🚚", "🚛", "🚜", "🏍", "🛵", "🚲", "🛴", "🚨", "🚔", "🚍",
        "🚘", "🚖", "🚡", "🚠", "🚟", "🚃", "🚋", "🚞", "🚝", "🚄",
        "🚅", "🚈", "🚂", "🚆", "🚇", "🚊", "🚉", "✈️", "🛫", "🛬",
        "🛩", "💺", "🛰", "🚀", "🛸", "🚁", "🛶", "⛵", "🚤", "🛥",
        "⛴", "🛳", "🚢", "⚓", "⛽", "🚧", "🚦", "🚥", "🚏", "🗺",
        "🗿", "🗽", "🗼", "🏰", "🏯", "🏟", "🎡", "🎢", "🎠", "⛲",
        "⛱", "🏖", "🏝", "🏜", "🌋", "⛰", "🏔", "🗻", "⛺"
    ],

    "💡 Símbolos & Diversos": [
        "⌚", "📱", "💻", "⌨️", "🖥", "🖨", "🖱", "🖲", "🕹", "🗜",
        "💽", "💾", "💿", "📀", "📼", "📷", "📸", "📹", "🎥", "📽",
        "🎞", "📞", "☎️", "📟", "📠", "📺", "📻", "🎙", "🎚", "🎛",
        "🛑", "✅", "❇️", "❎", "✳️", "‼️", "⁉️", "❓", "❔", "❕",
        "❗", "⚠️", "⛔", "🚫", "📛", "🚫", "🔞", "📵", "🚭", "☢️",
        "☣️", "⬆️", "↗️", "➡️", "↘️", "⬇️", "↙️", "⬅️", "↖️", "↕️",
        "↔️", "↩️", "↪️", "⤴️", "⤵️", "🔃", "🔄", "🔙", "🔚", "🔛"
    ]
};



// === Corrige coleta de membros de card ===
function getSelectedMembers(rootEl) {
    // checkboxes
    const cb = rootEl.querySelectorAll('input[name="c-member"]:checked, input[type="checkbox"][name="member"]:checked');
    if (cb.length) return [...cb].map(el => el.value);

    // select múltiplo
    const sel = rootEl.querySelector('#c-members, select[name="members"]');
    if (sel) {
        const opts = sel.multiple ? [...sel.selectedOptions] : (sel.value ? [sel.options[sel.selectedIndex]] : []);
        return opts.map(o => o.value).filter(Boolean);
    }
    return [];
}

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
   Tickets (Firestore + Local)
=========================== */
const Tickets = {
    async add(ticket) {
        const base = {
            title: ticket.title || '(sem título)',
            desc: ticket.desc || '',
            severity: ticket.severity || 'Baixa',
            author: ticket.author || '',
            authorEmail: ticket.authorEmail || '',
            status: 'Aberto',
            feedback: '',
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
        };
        if (cloudOk) {
            const { addDoc, collection } = await import("https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js");
            const ref = await addDoc(collection(db, 'tickets'), base);
            return { id: ref.id, ...base };
        } else {
            const all = LocalDB.load();
            all.tickets = all.tickets || [];
            const id = String(Date.now() + Math.random());
            all.tickets.push({ id, ...base });
            LocalDB.save(all);
            return { id, ...base };
        }
    },

    async update(id, patch) {
        const data = { ...patch, updatedAt: new Date().toISOString() };
        if (cloudOk) {
            const { updateDoc, doc } = await import("https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js");
            await updateDoc(doc(db, 'tickets', id), data);

        } else {
            const all = LocalDB.load();
            all.tickets = all.tickets || [];
            const i = all.tickets.findIndex(t => t.id === id);
            if (i >= 0) {
                all.tickets[i] = { ...all.tickets[i], ...data };
                LocalDB.save(all);
            }
        }
        if (patch.status?.toLowerCase() === "fechado" || patch.status?.toLowerCase() === "resolvido") {
            givePoints(currentUser.uid, 10, "Ticket resolvido");
            unlockBadge(currentUser.uid, "resolver-ticket");
        }

    },

    listen(cb) {
        if (cloudOk) {
            import("https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js")
                .then(({ collection, onSnapshot, orderBy, query }) => {
                    const qRef = query(collection(db, 'tickets'), orderBy('createdAt', 'desc'));
                    onSnapshot(qRef, snap => {
                        const arr = [];
                        snap.forEach(d => arr.push({ id: d.id, ...d.data() }));
                        cb(arr);
                    });
                });
            return;
        }
        const emit = () => cb((LocalDB.load().tickets || []).sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1)));
        emit();
        const t = setInterval(emit, 800);
        return () => clearInterval(t);
    }
};

// ========== CRIAR TICKET ==========
const formTicket = document.getElementById('formTicket');
if (formTicket) {
    formTicket.addEventListener('submit', async (e) => {
        e.preventDefault();
        const title = document.getElementById('ticketTitle').value.trim();
        const desc = document.getElementById('ticketDesc').value.trim();
        const dept = document.getElementById('ticketDept').value;

        if (!title || !desc) return alert('Preencha todos os campos');

        try {
            await Tickets.add({
                title,
                desc,
                severity: dept,            // aproveita o campo "departamento" como severidade
                author: currentUser?.displayName || currentUser?.email || 'Anônimo',
                authorEmail: currentUser?.email || 'Anônimo'
            });
            alert('Ticket enviado com sucesso!');
            formTicket.reset();
            window.location.hash = '#/tickets';
        } catch (err) {
            console.error(err);
            alert('Erro ao enviar ticket');
        }
    });
}

/* ===========================
   Inbox efêmero (não persiste no Firestore)
=========================== */
const Ephemeral = (() => {
    const KEY = 'acia-ephem-v1';
    const load = () => { try { return JSON.parse(localStorage.getItem(KEY) || '[]'); } catch { return []; } };
    const save = (arr) => localStorage.setItem(KEY, JSON.stringify(arr));
    function push({ titulo, corpo }) {
        const it = {
            id: (crypto?.randomUUID?.() || String(Date.now() + Math.random())),
            titulo: titulo || '(sem título)',
            corpo: corpo || '',
            createdAt: new Date().toISOString(),
            lido: false
        };
        const arr = load();
        arr.unshift(it);
        // limite pra não inchar o storage
        save(arr.slice(0, 80));
    }
    const list = () => load();
    function markAllRead() {
        const arr = load().map(x => ({ ...x, lido: true }));
        save(arr);
    }
    function clear() { save([]); }
    return { push, list, markAllRead, clear };
})();

function getGravatar(email, name) {
    if (!email) {
        // fallback se não houver e-mail
        return `https://ui-avatars.com/api/?name=${encodeURIComponent(name || "U")}&background=4f46e5&color=fff&bold=true`;
    }

    const hash = CryptoJS.MD5(email.trim().toLowerCase()).toString();

    return `https://www.gravatar.com/avatar/${hash}?d=identicon&s=200`;
}


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
        },
        clear() {
            localStorage.setItem('acia-mural', JSON.stringify({ items: [] }));
        }
    };

    // dentro do IIFE do MuralService
    async function clearAll() {
        if (!cloudOk) {
            // Local (localStorage)
            try {
                LocalMural.clear();         // (ver Passo 2)
                return;
            } catch (e) { console.warn('clearAll local falhou:', e); return; }
        }
        // Firestore: apaga TODOS os docs da coleção "mural"
        const { collection, getDocs, deleteDoc } =
            await import("https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js");
        const snap = await getDocs(collection(db, COL));
        await Promise.all(snap.docs.map(d => deleteDoc(d.ref)));
    }

    // exporte a função
    return { listOnce, listen, add, markAllRead, clearAll };


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

import {
  getFirestore,
  doc,
  getDoc,
  setDoc,
  onSnapshot
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";


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
  try { localStorage.setItem("theme:carnaval", on ? "1" : "0"); } catch {}
}

function listenThemeBroadcast() {
  const ref = doc(db, "admin", "broadcast");

  onSnapshot(ref, (snap) => {
    if (!snap.exists()) return;
    applySeasonThemes(snap.data());
  });
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
            return { id: docRef.id, ...base };
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

/* ===============================
   GAMIFICAÇÃO – Pontos
=============================== */
async function givePoints(uid, amount, reason = '') {
    if (!uid || !amount) return;
    if (!cloudOk || !db) return;

    try {
        const { doc, getDoc, setDoc } = await import(
            "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js"
        );

        const ref = doc(db, "gamification", uid);
        const snap = await getDoc(ref);

        let base = snap.exists() ? snap.data() : {
            points: 0,
            monthPoints: 0,
            level: 1,
            badges: [],
            lastUpdated: new Date().toISOString()
        };

        base.points += amount;
        base.monthPoints += amount;
        base.lastUpdated = new Date().toISOString();
        if (reason) base.lastReason = reason;

        await setDoc(ref, base);

        // avisa HUD/Ranking
        document.dispatchEvent(new Event('gamification:updated'));

        // toast só pro próprio usuário
        if (uid === currentUser?.uid) {
            showGamificationToast(`+${amount} pontos`, reason || '');
        }

        console.log(`[GAMIFICAÇÃO] +${amount} pontos para ${uid} (${reason})`);
    } catch (e) {
        console.warn("[GAMIFICAÇÃO] Falha ao adicionar pontos:", e);
    }
}

/* =========================================
   GAMIFICAÇÃO – Upgrade automático de nível
========================================= */
async function applyLevelUp(uid) {
    if (!cloudOk || !db) return;

    const { doc, getDoc, updateDoc } = await import(
        "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js"
    );

    const ref = doc(db, "gamification", uid);
    const snap = await getDoc(ref);
    if (!snap.exists()) return;

    let data = snap.data();
    const pts = data.monthPoints || 0;

    let newLevel = data.level || 1;
    for (let i = GAMIF_LEVEL_REQS.length - 1; i >= 0; i--) {
        if (pts >= GAMIF_LEVEL_REQS[i]) {
            newLevel = i + 1;
            break;
        }
    }

    if (newLevel !== data.level) {
        await updateDoc(ref, { level: newLevel });
        document.dispatchEvent(new Event('gamification:updated'));

        if (uid === currentUser?.uid) {
            showGamificationToast(`⬆️ Nível ${newLevel}`, 'Subiu de nível!');
        }

        console.log(`[GAMIFICAÇÃO] ${uid} subiu para nível ${newLevel}`);
    }
}

/* ===============================
   GAMIFICAÇÃO – Badges / Conquistas
=============================== */
async function unlockBadge(uid, badge) {
    try {
        if (!cloudOk || !db) return;

        const { doc, getDoc, updateDoc } = await import(
            "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js"
        );

        const ref = doc(db, "gamification", uid);
        const snap = await getDoc(ref);
        if (!snap.exists()) return;

        let data = snap.data();
        const badges = data.badges || [];

        if (!badges.includes(badge)) {
            badges.push(badge);
            await updateDoc(ref, { badges });
            document.dispatchEvent(new Event('gamification:updated'));

            if (uid === currentUser?.uid) {
                showGamificationToast(`🏅 Nova conquista`, badge);
            }

            console.log(`[GAMIFICAÇÃO] Badge conquistada: ${badge}`);
        }
    } catch (e) {
        console.warn("[GAMIFICAÇÃO] Falha ao desbloquear badge:", e);
    }
}

// ===============================
// GAMIFICAÇÃO – HUD no topo
// ===============================
(function initGamificationHud() {
    const hud = document.getElementById('gamificationHud');
    if (!hud) return;

    const pointsSpan = hud.querySelector('.gamif-points');
    const levelSpan = hud.querySelector('.gamif-level');

    async function refreshHud() {
        if (!cloudOk || !db || !currentUser) {
            hud.classList.add('hidden');
            return;
        }

        try {
            const { doc, getDoc } = await import(
                "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js"
            );

            const ref = doc(db, "gamification", currentUser.uid);
            const snap = await getDoc(ref);

            if (!snap.exists()) {
                hud.classList.add('hidden');
                return;
            }

            const data = snap.data();
            const pts = data.monthPoints || 0;
            const lvl = data.level || 1;

            pointsSpan.textContent = `⭐ ${pts} pts`;
            levelSpan.textContent = `Nível ${lvl}`;
            hud.classList.remove('hidden');
        } catch (e) {
            console.warn('[Gamificação HUD] Falha ao carregar:', e);
            hud.classList.add('hidden');
        }
    }

    document.addEventListener('auth:changed', refreshHud);
    document.addEventListener('gamification:updated', refreshHud);

    // primeira carga
    setTimeout(refreshHud, 1000);
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
        const overdue = list.filter(c => c.due && new Date(c.due) < new Date()).length;
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

  let last = Number(localStorage.getItem("last_user_reload") || 0);

  onSnapshot(ref, async (snap) => {
    if (!snap.exists()) return;

    const data = snap.data() || {};
    const ts = Number(data.forceReloadAt || 0);

    if (!ts || ts <= last) return;

    localStorage.setItem("last_user_reload", String(ts));

    // 🧠 CONFIRMAÇÃO COM OK
    await Swal.fire({
      title: "🔄 Atualização disponível",
      html: `
        <p style="margin-bottom:8px">
          Liberamos uma atualização rápida no sistema 🚀
        </p>
        <small class="muted">
          Clique em <b>OK</b> para aplicar agora.
        </small>
      `,
      icon: "info",
      confirmButtonText: "OK, atualizar",
      allowOutsideClick: false,
      allowEscapeKey: false
    });

    location.reload(true);
  });
}




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
    const views = [
        '#view-home', '#view-create', '#view-kanban', '#view-members',
        '#view-metrics', '#view-auth', '#view-calendar',
        '#view-report', '#view-tickets', '#view-prospec', '#view-ranking', '#view-report-history'
    ];
    views.forEach(id => { const el = document.querySelector(id); el && el.classList.add('hidden'); });

    // mostre só o view da rota atual
    if (hash.startsWith('#/criar')) {
        document.querySelector('#view-create')?.classList.remove('hidden');
    } else if (hash.startsWith('#/kanban')) {
        document.querySelector('#view-kanban')?.classList.remove('hidden');
    } else if (hash.startsWith('#/reportar')) {
        document.querySelector('#view-report')?.classList.remove('hidden');
    } else if (hash.startsWith('#/tickets')) {
        document.querySelector('#view-tickets')?.classList.remove('hidden');
    } else if (hash.startsWith('#/membros')) {
        document.querySelector('#view-members')?.classList.remove('hidden');
    } else if (hash.startsWith('#/indicadores')) {
        document.querySelector('#view-metrics')?.classList.remove('hidden');
    } else if (hash.startsWith('#/entrar')) {
        document.querySelector('#view-auth')?.classList.remove('hidden');
    } else if (hash.startsWith('#/view-prospec')) {
        document.querySelector('#view-prospec')?.classList.remove('hidden');
    } else if (hash.startsWith('#/agenda')) {
        document.querySelector('#view-calendar')?.classList.remove('hidden');
        try { loadAndRenderCalendar(); } catch { }
    } else if (hash.startsWith('#/ranking')) {
        document.querySelector('#view-ranking')?.classList.remove('hidden');
    } else if (hash.startsWith('#/report-history')) {
        document.querySelector('#view-report-history')?.classList.remove('hidden');
    } else {
        document.querySelector('#view-home')?.classList.remove('hidden');
    }
}

window.addEventListener('hashchange', renderRoute);




/* =========================================================
   Relatório de Tarefas Diárias (DRP) — popup obrigatório
   Horários:
     Seg-Qui: 11:30 e 17:30  → períodos [08:00–11:30] e [13:00–17:30]
     Sexta : 11:30 e 16:30   → períodos [08:00–11:30] e [13:00–16:30]
========================================================= */



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

async function uploadProfilePhoto(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();

        reader.onload = async function (e) {
            const base64 = e.target.result; // DataURL

            try {
                const { doc, updateDoc } = await import(
                    "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js"
                );

                await updateDoc(doc(db, "presence", currentUser.uid), {
                    photoURL: base64
                });

                resolve(base64);
            } catch (err) {
                reject(err);
            }
        };

        reader.onerror = reject;

        reader.readAsDataURL(file);
    });
}

// === Upload local da foto de perfil (Base64) ===
// === Upload de foto de perfil em Base64 COM COMPRESSÃO ===
async function uploadProfilePhotoLocal(file) {
    // 1. Cria um canvas pra redimensionar
    const img = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = e => {
            const i = new Image();
            i.onload = () => resolve(i);
            i.onerror = reject;
            i.src = e.target.result;
        };
        reader.onerror = reject;
        reader.readAsDataURL(file);
    });

    // 2. Reduz a imagem para garantir < 1MB
    const MAX_WIDTH = 600;   // Ajuste se quiser maior/menor
    const MAX_HEIGHT = 600;

    let w = img.width;
    let h = img.height;

    if (w > MAX_WIDTH || h > MAX_HEIGHT) {
        const ratio = Math.min(MAX_WIDTH / w, MAX_HEIGHT / h);
        w = w * ratio;
        h = h * ratio;
    }

    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;

    const ctx = canvas.getContext("2d");
    ctx.drawImage(img, 0, 0, w, h);

    // 3. Converte novamente para Base64 COM QUALIDADE REDUZIDA
    let base64 = canvas.toDataURL("image/jpeg", 0.75);

    // Garante que ficou menor que 1MB (tamanho base64 ≈ bytes*1.3)
    while (base64.length > 900_000) {
        base64 = canvas.toDataURL("image/jpeg", 0.6);
    }

    // 4. Salva no Firestore
    try {
        const { doc, updateDoc } = await import(
            "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js"
        );

        await updateDoc(doc(db, "presence", currentUser.uid), {
            photoURL: base64
        });

        return base64;
    } catch (err) {
        console.error("[uploadProfilePhotoLocal] Erro ao salvar:", err);
        throw err;
    }
}



document.getElementById("profile-photo").addEventListener("change", async (ev) => {
    const file = ev.target.files[0];
    if (!file) return;

    const base64 = await uploadProfilePhoto(file);

    // Atualiza visual
    document.getElementById("profile-avatar-preview").src = base64;
});

async function uploadSimple(file) {
    const FIXED_CDN = "3g9vdtdwtu.ucarecd.net";
    return new Promise((resolve, reject) => {
        uploadcare.fileFrom("object", file, {
            publicKey: "b4ee2700efa718b5276c",
            store: "auto"
        })
            .done(info => {
                const uuid = info.uuid;
                const safeName = encodeURIComponent(info.name);

                const finalUrl =
                    `https://${FIXED_CDN}/${uuid}/${safeName}`;

                resolve(finalUrl);
            })
            .fail(err => reject("Erro UploadCare: " + err));
    });
}


// === Upload de anexos via Uploadcare (REST, gratuito) ===
const UPLOADCARE_PUBLIC_KEY = "b4ee2700efa718b5276c"; // sua public key
// : não precisa de domínio fixo; use sempre ucarecdn.com
async function uploadWithUploadcare(file) {
    if (!UPLOADCARE_PUBLIC_KEY) throw new Error("UPLOADCARE_PUBLIC_KEY não definida");

    const form = new FormData();
    form.append("UPLOADCARE_PUB_KEY", UPLOADCARE_PUBLIC_KEY);
    form.append("UPLOADCARE_STORE", "1");
    form.append("file", file);

    const res = await fetch("https://upload.uploadcare.com/base/", {
        method: "POST",
        body: form,
        headers: { Accept: "application/json" }
    });

    const raw = await res.text();         // pode vir texto
    let data;
    try {
        data = JSON.parse(raw);
    } catch {
        throw new Error(`Resposta inesperada do Uploadcare: ${raw.slice(0, 80)}…`);
    }

    if (!res.ok) {
        // quando dá erro, o Uploadcare costuma mandar {"detail": "..."}
        throw new Error(data?.detail || `HTTP ${res.status}`);
    }
    if (!data.file) throw new Error("Falha no upload: UUID ausente.");

    // URL canônica no CDN (sem subdomínio fixo)
    return `https://3g9vdtdwtu.ucarecd.net/${data.file}/${encodeURIComponent(file.name)}`;
}

function renderFileButton(container, name, url) {
    const btn = document.createElement("div");
    btn.className = "file-button";
    btn.innerHTML = `
        <i>📎</i>
        <a href="${url}" target="_blank">${name}</a>
    `;
    container.appendChild(btn);
}


// Clique do botão "Anexar" no modal
document.querySelector('#m-send-attach')?.addEventListener('click', async () => {
    const picker = document.createElement('input');
    picker.type = 'file';
    picker.accept = '*/*';
    picker.multiple = true;

    picker.onchange = async () => {
        const files = Array.from(picker.files || []);
        if (!files.length) return;

        const container = document.querySelector('#m-attachments');

        for (const file of files) {
            try {
                const url = await uploadSimple(file);

                // VISUAL BONITO
                renderFileButton(container, file.name, url);

                // SALVAR NO CARD
                await Sub.addAttachment(window.currentEditingCardId, url);

            } catch (err) {
                alert("Erro ao anexar: " + err.message);
            }
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
function escapeHtml(s) {
    return String(s ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}


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

(async function initCalendarIntegration() {
    try { await new Promise(r => setTimeout(r, 500)); } catch (e) { }
    loadAndRenderCalendar();
    window.refreshCalendar = loadAndRenderCalendar;
})();

document.addEventListener('auth:changed', loadAndRenderCalendar);

const logo = document.getElementById('logo');

function aplicarTema() {
    const tema = localStorage.getItem('theme') || 'dark';
    document.body.setAttribute('data-theme', tema);

    if (logo) {
        if (tema === 'light') {
            logo.src = 'img/8572256d-599f-44c3-86d9-40052c7a886c.jpeg'; // <- CAMINHO DA LOGO CLARA
        } else {
            logo.src = 'img/logoacianexus.png'; // <- CAMINHO DA LOGO ESCURA
        }
    }
}

document.getElementById('toggleTheme')?.addEventListener('click', () => {
    const atual = localStorage.getItem('theme') === 'light' ? 'dark' : 'light';
    localStorage.setItem('theme', atual);
    aplicarTema();
});

aplicarTema();




// === Notifications Hub (unificado) ===
function getActor() {
    const uid = (typeof currentUser !== 'undefined' && currentUser && currentUser.uid) ? currentUser.uid :
        (typeof auth !== 'undefined' && auth.currentUser ? auth.currentUser.uid : null);
    const name = (typeof currentUser !== 'undefined' && currentUser && (currentUser.displayName || currentUser.email)) ? (currentUser.displayName || currentUser.email) :
        (typeof auth !== 'undefined' && auth.currentUser ? (auth.currentUser.displayName || auth.currentUser.email) : '—');
    return { uid, name };
}

function buildCardAudience(card, excludeUid) {
    const items = [];

    if (card && Array.isArray(card.members)) {
        items.push(...card.members); // espalha o array de membros
    }

    if (card && card.respUid) {
        items.push(card.respUid);
    }

    const set = new Set(items.filter(Boolean));
    if (excludeUid) set.delete(excludeUid);

    return Array.from(set);
}


function makeCardPayload(type, card, extra) {
    const actor = getActor();
    return Object.assign({
        type,
        board: card && card.board || '',
        cardId: card && (card.id || card.cardId) || '',
        title: card && card.title || '(sem título)',
        actorUid: actor.uid || null,
        actorName: actor.name || '—',
        status: card && card.status || '',
        due: card && card.due || null,
    }, (extra || {}));
}

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
