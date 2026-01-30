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

// =========================
// Core: Firestore import cache
// =========================
window.Core = window.Core || {};

Core.fs = (() => {
  let p = null;
  return async () => {
    if (!p) {
      p = import("https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js");
    }
    return p;
  };
})();
