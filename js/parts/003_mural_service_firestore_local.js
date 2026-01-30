/* ===========================
   Mural Service (Firestore / Local)
=========================== */
const MuralService = (() => {
  const COL = "mural";

  const LocalMural = {
    load() { try { return JSON.parse(localStorage.getItem("acia-mural") || '{"items":[]}'); } catch { return { items: [] }; } },
    save(data) { localStorage.setItem("acia-mural", JSON.stringify(data)); },
    list() { return LocalMural.load().items || []; },
    upsert(item) {
      const dbb = LocalMural.load();
      const i = dbb.items.findIndex(x => x.id === item.id);
      if (i >= 0) dbb.items[i] = { ...dbb.items[i], ...item };
      else dbb.items.push(item);
      LocalMural.save(dbb);
    },
    bulkMarkRead(uid) {
      const dbb = LocalMural.load();
      dbb.items = (dbb.items || []).map(x => ({ ...x, lidoBy: { ...(x.lidoBy || {}), [uid]: true } }));
      LocalMural.save(dbb);
    },
    clear() { localStorage.setItem("acia-mural", JSON.stringify({ items: [] })); }
  };

  async function listOnce() {
    if (!cloudOk || !db) return LocalMural.list();
    const { collection, getDocs, orderBy, query } = await Core.fs();
    const qRef = query(collection(db, COL), orderBy("createdAt", "desc"));
    const snap = await getDocs(qRef);
    const arr = [];
    snap.forEach(d => arr.push({ id: d.id, ...d.data() }));
    return arr;
  }

  function listen(cb) {
    if (!cloudOk || !db) {
      cb(LocalMural.list());
      const t = setInterval(() => cb(LocalMural.list()), 1000);
      return () => clearInterval(t);
    }
    (async () => {
      const { collection, onSnapshot, orderBy, query } = await Core.fs();
      const qRef = query(collection(db, COL), orderBy("createdAt", "desc"));
      const unsub = onSnapshot(qRef, (snap) => {
        const arr = [];
        snap.forEach(d => arr.push({ id: d.id, ...d.data() }));
        cb(arr);
      });
      return unsub;
    })();
  }

  async function add({ titulo, corpo }) {
    const rec = { titulo: titulo || "(sem título)", corpo: corpo || "", createdAt: new Date().toISOString(), lidoBy: {} };
    if (!cloudOk || !db) { LocalMural.upsert({ id: String(Date.now() + Math.random()), ...rec }); return; }
    const { collection, addDoc } = await Core.fs();
    await addDoc(collection(db, COL), rec);
  }

  async function markAllRead(uid) {
    if (!uid) return;
    if (!cloudOk || !db) { LocalMural.bulkMarkRead(uid); return; }
    const { collection, getDocs, updateDoc, doc } = await Core.fs();
    const snap = await getDocs(collection(db, COL));
    await Promise.all(snap.docs.map(d => {
      const data = d.data() || {};
      const lidoBy = data.lidoBy || {};
      if (lidoBy[uid]) return Promise.resolve();
      return updateDoc(doc(db, COL, d.id), { lidoBy: { ...lidoBy, [uid]: true } });
    }));
  }

  async function clearAll() {
    if (!cloudOk || !db) { LocalMural.clear(); return; }
    const { collection, getDocs, deleteDoc } = await Core.fs();
    const snap = await getDocs(collection(db, COL));
    await Promise.all(snap.docs.map(d => deleteDoc(d.ref)));
  }

  return { listOnce, listen, add, markAllRead, clearAll };
})();



const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
const setMsg = (el, type, text) => { if (!el) return; el.className = `msg ${type} show`; el.textContent = text; setTimeout(() => el.classList.remove('show'), 5000); };
let currentDisplayName = null;

