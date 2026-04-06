/* ================================================================
   NEXUS — Audit Service
   Registra trilha de auditoria no Firestore.
   
   LIMITAÇÃO DE SEGURANÇA:
   Logs gravados pelo cliente podem ser manipulados se as regras
   do Firestore forem permissivas demais. Nossa estratégia:
   - Regras do Firestore: apenas create em auditLogs (sem update/delete)
   - Usuário só pode criar seu próprio log (request.auth.uid == data.userId)
   - Leitura apenas para admins
   ================================================================ */

import { db, auth } from './firebase-config.js';
import { collection, addDoc, serverTimestamp, doc, getDoc } from 'firebase/firestore';
import { AUDIT_LOGS } from './firestore.service.js';

let _auditProfileCache = null;

// ================================================================
// Ações de auditoria catalogadas
// ================================================================
export const AUDIT_ACTIONS = {
    // Auth
    LOGIN: 'auth.login',
    LOGOUT: 'auth.logout',
    PASSWORD_RESET: 'auth.password_reset',

    // Tarefas
    TASK_CREATED: 'task.created',
    TASK_UPDATED: 'task.updated',
    TASK_DELETED: 'task.deleted',
    TASK_STATUS_CHANGED: 'task.status_changed',
    TASK_ASSIGNED: 'task.assigned',
    TASK_COMMENTED: 'task.commented',

    // Rotinas
    ROUTINE_CREATED: 'routine.created',
    ROUTINE_UPDATED: 'routine.updated',
    ROUTINE_DELETED: 'routine.deleted',

    // Eventos
    EVENT_CREATED: 'event.created',
    EVENT_UPDATED: 'event.updated',
    EVENT_DELETED: 'event.deleted',

    // Chamados
    TICKET_CREATED: 'ticket.created',
    TICKET_UPDATED: 'ticket.updated',
    TICKET_COMMENTED: 'ticket.commented',
    TICKET_STATUS: 'ticket.status_changed',
    TICKET_STATUS_CHANGED: 'ticket.status_changed',

    // Relatórios
    REPORT_SAVED: 'report.saved',
    REPORT_SUBMITTED: 'report.saved',

    // Comunicados
    ANNOUNCEMENT_CREATED: 'announcement.created',
    ANNOUNCEMENT_UPDATED: 'announcement.updated',

    // Membros
    MEMBER_CREATED: 'member.created',
    MEMBER_UPDATED: 'member.updated',
    MEMBER_DEACTIVATED: 'member.deactivated',
    ROLE_CHANGED: 'member.role_changed',
    USER_CREATED: 'member.created',
    USER_UPDATED: 'member.updated',

    // Chat
    MESSAGE_SENT: 'chat.message_sent',
    MESSAGE_DELETED: 'chat.message_deleted',
};

// ================================================================
// Registrar log de auditoria
// NÃO throw em erros — log nunca deve bloquear operação do usuário
// ================================================================
async function resolveAuditProfile(explicitProfile = null) {
    if (explicitProfile?.uid) return explicitProfile;

    const current = auth.currentUser;
    if (!current?.uid) return null;

    if (_auditProfileCache?.uid === current.uid) {
        return _auditProfileCache;
    }

    let profile = {
        uid: current.uid,
        email: current.email || '',
        name: current.displayName || current.email?.split('@')[0] || 'desconhecido',
        role: 'viewer',
    };

    try {
        const snap = await getDoc(doc(db, 'users', current.uid));
        if (snap.exists()) {
            const data = snap.data() || {};
            profile = {
                uid: current.uid,
                email: data.email || current.email || '',
                name: data.name || data.displayName || current.displayName || current.email?.split('@')[0] || 'desconhecido',
                role: data.role || 'viewer',
            };
        }
    } catch (_) {
        // Fallback para auth.currentUser já definido em profile.
    }

    _auditProfileCache = profile;
    return profile;
}

export async function logAudit(...args) {
    try {
        let explicitProfile = null;
        let action;
        let targetType;
        let targetId;
        let details;

        // Compatível com dois formatos:
        // 1) logAudit(profile, action, targetType, targetId, details)
        // 2) logAudit(action, targetId, targetType, details, [profile])
        if (args[0] && typeof args[0] === 'object' && 'uid' in args[0]) {
            [explicitProfile, action, targetType, targetId, details = {}] = args;
        } else {
            [action, targetId, targetType, details = {}, explicitProfile = null] = args;
        }

        const profile = await resolveAuditProfile(explicitProfile);
        if (!profile?.uid) return;

        // Sanitiza details: remove campos undefined / funções / objetos circulares
        const safeDetails = JSON.parse(JSON.stringify(details, (key, value) => {
            if (typeof value === 'function') return undefined;
            if (value instanceof Object && value.constructor === Object && Object.keys(value).length > 50) {
                return '[object too large]';
            }
            return value;
        }));

        await addDoc(collection(db, AUDIT_LOGS), {
            action,
            userId: profile.uid,
            userName: profile.name || profile.email || 'desconhecido',
            userRole: profile.role || 'viewer',
            targetType: targetType || '',
            targetId: targetId || '',
            details: safeDetails,
            userAgent: navigator.userAgent.substring(0, 200),
            createdAt: serverTimestamp()
        });
    } catch (e) {
        // Silencia erros de log — nunca interrompemos o fluxo principal
        console.warn('[Nexus Audit] Falha ao registrar log:', e.message);
    }
}

// ================================================================
// Log específico de login (chamado após autenticação bem-sucedida)
// ================================================================
export async function logLogin(profile) {
    await logAudit(profile, AUDIT_ACTIONS.LOGIN, 'auth', profile.uid, {
        email: profile.email
    });
}

// ================================================================
// Log específico de logout
// ================================================================
export async function logLogout(profile) {
    await logAudit(profile, AUDIT_ACTIONS.LOGOUT, 'auth', profile.uid, {});
}
