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

