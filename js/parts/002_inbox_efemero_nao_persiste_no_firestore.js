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


