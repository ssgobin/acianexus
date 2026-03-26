/* ================================================================
   NEXUS — Notifications Service
   Sistema de notificações para tarefas, chamados e comunicados.
   ================================================================ */

import { db } from '/services/firebase-config.js';
import {
    collection, doc, addDoc, updateDoc, getDocs, query, where,
    serverTimestamp, Timestamp, onSnapshot, orderBy, limit, writeBatch
} from 'firebase/firestore';

export const NOTIFICATIONS = 'notifications';

export const NOTIFICATION_TYPES = {
    TASK_ASSIGNED: 'task_assigned',
    TASK_MOVED: 'task_moved',
    TASK_UPDATED: 'task_updated',
    TASK_DELETED: 'task_deleted',
    TASK_NEAR_DUE: 'task_near_due',
    TASK_OVERDUE: 'task_overdue',
    TICKET_REPLIED: 'ticket_replied',
    TICKET_STATUS_CHANGED: 'ticket_status_changed',
    ANNOUNCEMENT_NEW: 'announcement_new',
};

const NEAR_DUE_HOURS = 24;
const NOTIFIED_TASKS_KEY = 'nexus_notified_tasks';

function getNotifiedTasks() {
    try {
        return JSON.parse(localStorage.getItem(NOTIFIED_TASKS_KEY) || '{}');
    } catch { return {}; }
}

function setNotifiedTask(taskId, type, value = true) {
    const notified = getNotifiedTasks();
    notified[`${taskId}_${type}`] = value;
    localStorage.setItem(NOTIFIED_TASKS_KEY, JSON.stringify(notified));
}

function wasNotified(taskId, type) {
    return getNotifiedTasks()[`${taskId}_${type}`] === true;
}

export async function createNotification(data) {
    return await addDoc(collection(db, NOTIFICATIONS), {
        ...data,
        read: false,
        createdAt: serverTimestamp(),
    });
}

export async function markAsRead(notifId) {
    await updateDoc(doc(db, NOTIFICATIONS, notifId), {
        read: true,
        readAt: serverTimestamp(),
    });
}

export async function markAllAsRead(userId) {
    const q = query(
        collection(db, NOTIFICATIONS),
        where('userId', '==', userId),
        where('read', '==', false)
    );
    const snap = await getDocs(q);
    if (snap.empty) return;
    
    const batch = writeBatch(db);
    snap.docs.forEach(d => {
        batch.update(d.ref, { read: true, readAt: serverTimestamp() });
    });
    await batch.commit();
}

export async function clearAllNotifications(userId) {
    const q = query(
        collection(db, NOTIFICATIONS),
        where('userId', '==', userId)
    );
    const snap = await getDocs(q);
    if (snap.empty) return;
    
    const batch = writeBatch(db);
    snap.docs.forEach(d => {
        batch.delete(d.ref);
    });
    await batch.commit();
}

export function subscribeToUserNotifications(userId, callback) {
    const q = query(
        collection(db, NOTIFICATIONS),
        where('userId', '==', userId),
        orderBy('createdAt', 'desc'),
        limit(50)
    );
    return onSnapshot(q, snap => {
        const notifs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        callback(notifs);
    });
}

export async function getUnreadCount(userId) {
    const q = query(
        collection(db, NOTIFICATIONS),
        where('userId', '==', userId),
        where('read', '==', false)
    );
    const snap = await getDocs(q);
    return snap.size;
}

// ================================================================
// HELPERS — Criar notificações automaticamente
// ================================================================

export async function notifyTaskAssigned(task, previousAssigneeId) {
    if (!task.assigneeId || task.assigneeId === previousAssigneeId) return;
    
    const title = task.title?.substring(0, 50) || 'Tarefa';
    await createNotification({
        userId: task.assigneeId,
        type: NOTIFICATION_TYPES.TASK_ASSIGNED,
        title: 'Nova tarefa atribuída',
        message: `Você foi atribuído na tarefa: "${title}"`,
        entityId: task.id,
        entityType: 'task',
    });
}

export async function notifyTaskInvolved(task, previousInvolvedIds = []) {
    const currentInvolved = task.involvedIds || [];
    const newInvolved = currentInvolved.filter(id => !previousInvolvedIds.includes(id));
    
    if (newInvolved.length === 0) return;
    
    const title = task.title?.substring(0, 50) || 'Tarefa';
    
    for (const userId of newInvolved) {
        await createNotification({
            userId,
            type: NOTIFICATION_TYPES.TASK_ASSIGNED,
            title: 'Você foi adicionado a uma tarefa',
            message: `Você foi adicionado como envolvido na tarefa: "${title}"`,
            entityId: task.id,
            entityType: 'task',
        });
    }
}

export async function notifyTaskMoved(task, oldStatus, newStatus) {
    const notifyUsers = [task.assigneeId, ...(task.involvedIds || [])].filter(Boolean);
    if (notifyUsers.length === 0) return;
    if (oldStatus === newStatus) return;
    
    const title = task.title?.substring(0, 50) || 'Tarefa';
    const uniqueUsers = [...new Set(notifyUsers)];
    
    for (const userId of uniqueUsers) {
        await createNotification({
            userId,
            type: NOTIFICATION_TYPES.TASK_MOVED,
            title: 'Tarefa movida',
            message: `Tarefa "${title}" movida para "${getStatusLabel(newStatus)}"`,
            entityId: task.id,
            entityType: 'task',
        });
    }
}

export async function notifyTaskUpdated(taskId, taskTitle, updatedBy) {
    if (!taskId) return;
    
    await createNotification({
        userId: taskId,
        type: NOTIFICATION_TYPES.TASK_UPDATED,
        title: 'Tarefa atualizada',
        message: `A tarefa "${taskTitle?.substring(0, 50)}" foi atualizada`,
        entityId: taskId,
        entityType: 'task',
    });
}

export async function notifyTaskDeleted(taskTitle, assigneeId) {
    if (!assigneeId) return;
    
    await createNotification({
        userId: assigneeId,
        type: NOTIFICATION_TYPES.TASK_DELETED,
        title: 'Tarefa excluída',
        message: `A tarefa "${taskTitle?.substring(0, 50)}" foi excluída`,
        entityId: null,
        entityType: 'task',
    });
}

export async function notifyTicketReplied(ticket, commentAuthorName) {
    if (!ticket.createdBy || ticket.createdBy === commentAuthorName) return;
    
    const title = ticket.title?.substring(0, 50) || 'Chamado';
    await createNotification({
        userId: ticket.createdBy,
        type: NOTIFICATION_TYPES.TICKET_REPLIED,
        title: 'Novo comentário no chamado',
        message: `${commentAuthorName || 'Alguém'} respondeu ao seu chamado: "${title}"`,
        entityId: ticket.id,
        entityType: 'ticket',
    });
}

export async function notifyTicketStatusChanged(ticket, newStatus, changedBy) {
    if (!ticket.createdBy) return;
    if (ticket.createdBy === changedBy) return;
    
    const title = ticket.title?.substring(0, 50) || 'Chamado';
    await createNotification({
        userId: ticket.createdBy,
        type: NOTIFICATION_TYPES.TICKET_STATUS_CHANGED,
        title: 'Chamado atualizado',
        message: `Seu chamado "${title}" mudou para "${getTicketStatusLabel(newStatus)}"`,
        entityId: ticket.id,
        entityType: 'ticket',
    });
}

export async function notifyNewAnnouncement(announcement, currentUserId) {
    const targetRoles = announcement.targetRoles || ['all'];
    const allUsers = await getDocs(query(collection(db, 'users'), where('active', '==', true)));
    
    const batch = db.batch();
    const title = announcement.title?.substring(0, 50) || 'Novo comunicado';
    
    for (const userDoc of allUsers.docs) {
        const userData = userDoc.data();
        const userRole = userData.role || 'viewer';
        
        const shouldNotify = targetRoles.includes('all') || targetRoles.includes(userRole);
        if (!shouldNotify) continue;
        if (userData.uid === currentUserId) continue;
        
        const notifRef = doc(collection(db, NOTIFICATIONS));
        batch.set(notifRef, {
            userId: userData.uid,
            type: NOTIFICATION_TYPES.ANNOUNCEMENT_NEW,
            title: 'Novo comunicado',
            message: `"${title}"`,
            entityId: announcement.id,
            entityType: 'announcement',
            read: false,
            createdAt: serverTimestamp(),
        });
    }
    
    await batch.commit();
}

function getStatusLabel(status) {
    const labels = {
        todo: 'A Fazer',
        in_progress: 'Em Andamento',
        review: 'Revisão',
        done: 'Concluído',
        cancelled: 'Cancelado',
    };
    return labels[status] || status;
}

function getTicketStatusLabel(status) {
    const labels = {
        open: 'Aberto',
        in_progress: 'Em Atendimento',
        resolved: 'Resolvido',
        closed: 'Fechado',
    };
    return labels[status] || status;
}

export async function checkAndNotifyOverdueTasks(allTasks, userId) {
    const now = new Date();
    const notifyTasks = allTasks.filter(t => 
        t.assigneeId === userId && 
        t.status !== 'done' && 
        t.status !== 'cancelled' &&
        t.dueDate
    );
    
    for (const task of notifyTasks) {
        const dueDate = task.dueDate.toDate ? task.dueDate.toDate() : new Date(task.dueDate);
        
        if (dueDate < now && !wasNotified(task.id, 'overdue')) {
            await createNotification({
                userId: task.assigneeId,
                type: NOTIFICATION_TYPES.TASK_OVERDUE,
                title: 'Tarefa atrasada',
                message: `A tarefa "${task.title?.substring(0, 50)}" está atrasada`,
                entityId: task.id,
                entityType: 'task',
            });
            setNotifiedTask(task.id, 'overdue');
        } else if (dueDate > now && dueDate <= new Date(now.getTime() + NEAR_DUE_HOURS * 60 * 60 * 1000)) {
            if (!wasNotified(task.id, 'near_due')) {
                await createNotification({
                    userId: task.assigneeId,
                    type: NOTIFICATION_TYPES.TASK_NEAR_DUE,
                    title: 'Tarefa próximo de vencer',
                    message: `A tarefa "${task.title?.substring(0, 50)}" vence em breve`,
                    entityId: task.id,
                    entityType: 'task',
                });
                setNotifiedTask(task.id, 'near_due');
            }
        }
    }
}
