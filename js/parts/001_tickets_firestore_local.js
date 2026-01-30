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
            all.tickets.push({ id, ...base });
            return { id, ...base };

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

