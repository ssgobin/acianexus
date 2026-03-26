/* ================================================================
   NEXUS — Firestore Service
   Funções CRUD genéricas e específicas por coleção.
   ================================================================ */

import { db } from './firebase-config.js';
import {
    collection, doc,
    getDoc, getDocs, addDoc, setDoc, updateDoc, deleteDoc,
    query, where, orderBy, limit, startAfter,
    onSnapshot, serverTimestamp, Timestamp,
    writeBatch, increment
} from 'firebase/firestore';

export { serverTimestamp, Timestamp, writeBatch, increment };
export { collection, doc, query, where, orderBy, limit, onSnapshot, getDoc, getDocs };

// ================================================================
// USUARIOS
// ================================================================
export const USERS = 'users';

export async function getUser(uid) {
    const snap = await getDoc(doc(db, USERS, uid));
    return snap.exists() ? { id: snap.id, ...snap.data() } : null;
}

export async function listUsers(activeOnly = true) {
    let q = collection(db, USERS);
    if (activeOnly) q = query(q, where('active', '==', true), orderBy('name'));
    const snap = await getDocs(q);
    return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

export async function createUser(uid, data) {
    await setDoc(doc(db, USERS, uid), {
        ...data,
        active: true,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
    });
}

export async function updateUser(uid, data) {
    await updateDoc(doc(db, USERS, uid), {
        ...data,
        updatedAt: serverTimestamp()
    });
}

// ================================================================
// TAREFAS
// ================================================================
export const TASKS = 'tasks';

export async function getTask(taskId) {
    const snap = await getDoc(doc(db, TASKS, taskId));
    return snap.exists() ? { id: snap.id, ...snap.data() } : null;
}

export async function createTask(data) {
    return await addDoc(collection(db, TASKS), {
        ...data,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
    });
}

export async function updateTask(taskId, data) {
    await updateDoc(doc(db, TASKS, taskId), {
        ...data,
        updatedAt: serverTimestamp()
    });
}

export async function deleteTask(taskId) {
    await deleteDoc(doc(db, TASKS, taskId));
}

export function subscribeToTasks(filters, callback) {
    let q = collection(db, TASKS);
    const constraints = [];

    if (filters.board) constraints.push(where('board', '==', filters.board));
    if (filters.assigneeId) constraints.push(where('assigneeId', '==', filters.assigneeId));
    if (filters.status) constraints.push(where('status', '==', filters.status));

    constraints.push(orderBy('createdAt', 'desc'));
    q = query(q, ...constraints);

    return onSnapshot(q, snap => {
        const tasks = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        callback(tasks);
    });
}

// ================================================================
// COMENTÁRIOS DE TAREFA
// ================================================================
export const TASK_COMMENTS = 'taskComments';

export async function getTaskComments(taskId) {
    const q = query(
        collection(db, TASK_COMMENTS),
        where('taskId', '==', taskId),
        orderBy('createdAt', 'asc')
    );
    const snap = await getDocs(q);
    return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

export async function addTaskComment(data) {
    return await addDoc(collection(db, TASK_COMMENTS), {
        ...data,
        createdAt: serverTimestamp()
    });
}

// ================================================================
// HISTÓRICO DE TAREFA
// ================================================================
export const TASK_HISTORY = 'taskHistory';

export async function addTaskHistory(data) {
    return await addDoc(collection(db, TASK_HISTORY), {
        ...data,
        createdAt: serverTimestamp()
    });
}

export async function getTaskHistory(taskId) {
    const q = query(
        collection(db, TASK_HISTORY),
        where('taskId', '==', taskId),
        orderBy('createdAt', 'asc')
    );
    const snap = await getDocs(q);
    return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

// ================================================================
// ROTINAS
// ================================================================
export const ROUTINES = 'routines';

export async function listRoutines() {
    const q = query(collection(db, ROUTINES), orderBy('createdAt', 'desc'));
    const snap = await getDocs(q);
    return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

export async function createRoutine(data) {
    return await addDoc(collection(db, ROUTINES), {
        ...data,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
    });
}

export async function updateRoutine(id, data) {
    await updateDoc(doc(db, ROUTINES, id), { ...data, updatedAt: serverTimestamp() });
}

export async function deleteRoutine(id) {
    await deleteDoc(doc(db, ROUTINES, id));
}

// ================================================================
// EVENTOS / AGENDA
// ================================================================
export const EVENTS = 'events';

export async function listEvents(startDate, endDate) {
    let constraints = [orderBy('eventDate', 'asc')];
    if (startDate) constraints.unshift(where('eventDate', '>=', Timestamp.fromDate(startDate)));
    if (endDate) constraints.push(where('eventDate', '<=', Timestamp.fromDate(endDate)));

    const q = query(collection(db, EVENTS), ...constraints);
    const snap = await getDocs(q);
    return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

export async function createEvent(data) {
    return await addDoc(collection(db, EVENTS), {
        ...data,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
    });
}

export async function updateEvent(id, data) {
    await updateDoc(doc(db, EVENTS, id), { ...data, updatedAt: serverTimestamp() });
}

export async function deleteEvent(id) {
    await deleteDoc(doc(db, EVENTS, id));
}

// ================================================================
// CHAMADOS (TICKETS)
// ================================================================
export const TICKETS = 'tickets';

export async function listTickets(filters = {}) {
    const constraints = [orderBy('createdAt', 'desc')];
    if (filters.status) constraints.unshift(where('status', '==', filters.status));
    if (filters.severity) constraints.unshift(where('severity', '==', filters.severity));

    const q = query(collection(db, TICKETS), ...constraints);
    const snap = await getDocs(q);
    return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

export function subscribeToTickets(callback) {
    const q = query(collection(db, TICKETS), orderBy('createdAt', 'desc'), limit(100));
    return onSnapshot(q, snap => callback(snap.docs.map(d => ({ id: d.id, ...d.data() }))));
}

export async function createTicket(data) {
    return await addDoc(collection(db, TICKETS), {
        ...data,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
    });
}

export async function updateTicket(id, data) {
    await updateDoc(doc(db, TICKETS, id), { ...data, updatedAt: serverTimestamp() });
}

// ================================================================
// COMENTÁRIOS DE CHAMADO
// ================================================================
export const TICKET_COMMENTS = 'ticketComments';

export async function getTicketComments(ticketId) {
    const q = query(
        collection(db, TICKET_COMMENTS),
        where('ticketId', '==', ticketId),
        orderBy('createdAt', 'asc')
    );
    const snap = await getDocs(q);
    return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

export async function addTicketComment(data) {
    return await addDoc(collection(db, TICKET_COMMENTS), {
        ...data,
        createdAt: serverTimestamp()
    });
}

// ================================================================
// RELATÓRIO DIÁRIO
// ================================================================
export const DAILY_REPORTS = 'dailyReports';

export async function getDailyReport(userId, date) {
    const q = query(
        collection(db, DAILY_REPORTS),
        where('userId', '==', userId),
        where('date', '==', date)
    );
    const snap = await getDocs(q);
    if (snap.empty) return null;
    const d = snap.docs[0];
    return { id: d.id, ...d.data() };
}

export async function upsertDailyReport(userId, date, data) {
    const existing = await getDailyReport(userId, date);
    if (existing) {
        await updateDoc(doc(db, DAILY_REPORTS, existing.id), {
            ...data,
            updatedAt: serverTimestamp()
        });
        return existing.id;
    } else {
        const ref = await addDoc(collection(db, DAILY_REPORTS), {
            userId,
            date,
            ...data,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp()
        });
        return ref.id;
    }
}

export async function listDailyReports(userId, startDate, endDate) {
    const constraints = [
        where('userId', '==', userId),
        orderBy('date', 'desc')
    ];
    if (startDate) constraints.push(where('date', '>=', startDate));
    if (endDate) constraints.push(where('date', '<=', endDate));
    const q = query(collection(db, DAILY_REPORTS), ...constraints);
    const snap = await getDocs(q);
    return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

// ================================================================
// COMUNICADOS
// ================================================================
export const ANNOUNCEMENTS = 'announcements';

export async function listAnnouncements(role) {
    const q = query(
        collection(db, ANNOUNCEMENTS),
        where('active', '==', true),
        orderBy('publishedAt', 'desc')
    );
    const snap = await getDocs(q);
    const now = new Date();
    return snap.docs
        .map(d => ({ id: d.id, ...d.data() }))
        .filter(a => {
            if (a.expiresAt && a.expiresAt.toDate() < now) return false;
            if (!a.targetRoles || a.targetRoles.includes('all') || a.targetRoles.includes(role)) return true;
            return false;
        });
}

export async function createAnnouncement(data) {
    return await addDoc(collection(db, ANNOUNCEMENTS), {
        ...data,
        active: true,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
    });
}

export async function updateAnnouncement(id, data) {
    await updateDoc(doc(db, ANNOUNCEMENTS, id), { ...data, updatedAt: serverTimestamp() });
}

// ================================================================
// CHAT ROOMS
// ================================================================
export const CHAT_ROOMS = 'chatRooms';

export async function listChatRooms() {
    const q = query(collection(db, CHAT_ROOMS), orderBy('lastMessageAt', 'desc'));
    const snap = await getDocs(q);
    return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

export async function createChatRoom(data) {
    return await addDoc(collection(db, CHAT_ROOMS), {
        ...data,
        createdAt: serverTimestamp(),
        lastMessage: '',
        lastMessageAt: serverTimestamp()
    });
}

// ================================================================
// MENSAGENS DE CHAT
// ================================================================
export const CHAT_MESSAGES = 'chatMessages';

export function subscribeToChatMessages(roomId, callback) {
    const q = query(
        collection(db, CHAT_MESSAGES),
        where('roomId', '==', roomId),
        orderBy('createdAt', 'asc'),
        limit(200)
    );
    return onSnapshot(q, snap => callback(snap.docs.map(d => ({ id: d.id, ...d.data() }))));
}

export async function sendChatMessage(roomId, data) {
    const batch = writeBatch(db);

    const msgRef = doc(collection(db, CHAT_MESSAGES));
    batch.set(msgRef, {
        roomId,
        ...data,
        deleted: false,
        readBy: [data.authorId],
        createdAt: serverTimestamp()
    });

    const roomRef = doc(db, CHAT_ROOMS, roomId);
    batch.update(roomRef, {
        lastMessage: data.content.substring(0, 80),
        lastMessageAt: serverTimestamp()
    });

    await batch.commit();
    return msgRef.id;
}

// ================================================================
// LOGS DE AUDITORIA
// ================================================================
export const AUDIT_LOGS = 'auditLogs';

export async function listAuditLogs(limitCount = 100) {
    const q = query(
        collection(db, AUDIT_LOGS),
        orderBy('createdAt', 'desc'),
        limit(limitCount)
    );
    const snap = await getDocs(q);
    return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}
