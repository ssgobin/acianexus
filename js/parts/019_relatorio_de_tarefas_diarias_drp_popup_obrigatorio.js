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
    const inCompany = document.getElementById('evt-company');
    const inAssoc = document.getElementById('evt-assoc');
    const inLocal = document.getElementById('evt-local');
    const inCoffee = document.getElementById('evt-coffee');
    const inPeople = document.getElementById('evt-people');
    const inReq = document.getElementById('evt-req');
    const msg = document.getElementById('evt-msg');
    const btnSave = document.getElementById('evt-save');
    const btnClose = document.getElementById('cal-close');
    const btnDelete = document.getElementById('evt-delete');
    let editing = null; // {date, idx}

    function openAddModal(e) {
        const d = e.currentTarget.dataset.date;
        editing = { date: d, idx: null };

        inDate.value = d;
        inTime.value = '';
        inTitle.value = '';

        inCompany.value = '';
        inAssoc.value = '';
        inLocal.value = '';
        inCoffee.value = '';
        inPeople.value = '';
        inReq.value = '';

        msg.classList.remove('show');
        modal.classList.add('show');
        modalBack?.classList.add('show');
        btnDelete.style.display = 'none';
    }


    function openEditModal(e) {
        const iso = e.currentTarget.dataset.date;
        const idx = Number(e.currentTarget.dataset.idx);

        const events = loadAll();
        const list = events[iso] || [];
        const ev = list[idx];
        if (!ev) return;

        editing = { date: iso, idx };

        inDate.value = iso;
        inTime.value = ev.time || '';
        inTitle.value = ev.title || '';

        inCompany.value = ev.company || '';
        inAssoc.value = ev.assocCode || '';
        inLocal.value = ev.local || '';
        inCoffee.value = ev.coffee || '';
        inPeople.value = ev.peopleQty || '';
        inReq.value = ev.req || '';

        msg.classList.remove('show');
        modal.classList.add('show');
        modalBack?.classList.add('show');
        btnDelete.style.display = 'inline-block';
    }


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
                    <div class="meta">${time}<div style="margin-top:6px">${escapeHtml(
                        (ev.company ? `Empresa: ${ev.company}` : '') +
                        (ev.local ? ` | Local: ${ev.local}` : '') +
                        (ev.coffee ? ` | Coffee: ${ev.coffee}` : '') +
                        (ev.peopleQty ? ` | Pessoas: ${ev.peopleQty}` : '') +
                        (ev.assocCode ? ` | Assoc: ${ev.assocCode}` : '') +
                        (ev.req ? `\nReq: ${ev.req}` : '')
                    )}
</div></div>
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
    $('#cal-modal-title').textContent = 'Nova locação';

    $('#evt-date').value = '';
    $('#evt-time').value = '';
    $('#evt-title').value = '';

    $('#evt-company').value = '';
    $('#evt-assoc').value = '';
    $('#evt-local').value = '';
    $('#evt-coffee').value = '';
    $('#evt-people').value = '';
    $('#evt-req').value = '';

    $('#evt-delete').classList.add('hidden');
  } else {
    const events = await CalendarDB.list();
    const ev = events.find(x => String(x.id) === String(id));

    if (ev) {
      $('#cal-modal-title').textContent = 'Editar locação';

      $('#evt-date').value = ev.date || '';
      $('#evt-time').value = ev.time || '';
      $('#evt-title').value = ev.title || '';

      $('#evt-company').value = ev.company || '';
      $('#evt-assoc').value = ev.assocCode || '';
      $('#evt-local').value = ev.local || '';
      $('#evt-coffee').value = ev.coffee || '';
      $('#evt-people').value = ev.peopleQty ?? '';
      $('#evt-req').value = ev.req || '';

      $('#evt-delete').classList.remove('hidden');
    } else {
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

    const company = $('#evt-company').value.trim();
    const assocCode = $('#evt-assoc').value.trim();
    const local = $('#evt-local').value.trim();
    const coffee = $('#evt-coffee').value;
    const peopleQty = Number($('#evt-people').value || 0) || null;
    const req = $('#evt-req').value.trim();

    const createdBy = currentUser?.uid || 'anon';
    const createdByName = currentUser?.displayName || currentUser?.email || '—';

    if (!date || !title) { setMsg($('#evt-msg'), 'err', 'Preencha data e nome do evento.'); return; }

    const payload = {
        date, time, title,
        company, assocCode, local, coffee, peopleQty, req,
        createdBy, createdByName
    };

    if (__currentCalendarEventId) payload.id = __currentCalendarEventId;

    try {
        const r = await CalendarDB.add(payload);
        setMsg($('#evt-msg'), 'ok', 'Locação salva.');
        __currentCalendarEventId = r.id || payload.id;
        $('#calendarModal').classList.remove('show');
        await loadAndRenderCalendar();
    } catch (e) {
        console.error(e);
        setMsg($('#evt-msg'), 'err', 'Falha ao salvar.');
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

