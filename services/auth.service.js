/* ================================================================
   NEXUS — Auth Service
   Gerencia autenticação, sessão e perfil do usuário.
   ================================================================ */

import { auth, db } from './firebase-config.js';
import {
    signInWithEmailAndPassword,
    createUserWithEmailAndPassword,
    updateProfile,
    signOut as firebaseSignOut,
    sendPasswordResetEmail,
    onAuthStateChanged,
    setPersistence,
    browserSessionPersistence,
    browserLocalPersistence,
    updatePassword,
    reauthenticateWithCredential,
    EmailAuthProvider
} from 'firebase/auth';
import {
    doc, getDoc, setDoc, updateDoc, serverTimestamp
} from 'firebase/firestore';
import {
    collection, query, where, limit, getDocs
} from 'firebase/firestore';

// Cache em memória para o perfil do usuário (por sessão de página)
let _currentProfile = null;

// ================================================================
// Configurar persistência da sessão
// ================================================================
export async function configureSessionPersistence(rememberMe = true) {
    const persistence = rememberMe ? browserLocalPersistence : browserSessionPersistence;
    await setPersistence(auth, persistence);
}

// ================================================================
// Login com email e senha
// ================================================================
export async function signIn(email, password, rememberMe = true) {
    await configureSessionPersistence(rememberMe);
    const credential = await signInWithEmailAndPassword(auth, email, password);
    const user = credential.user;

    // Atualiza lastLogin no Firestore
    const userRef = doc(db, 'users', user.uid);
    let userSnap = await getDoc(userRef);

    // Primeiro acesso: tenta converter template por e-mail em perfil uid-based.
    if (!userSnap.exists()) {
        const bootstrapped = await bootstrapUserProfileFromEmailTemplate(user);
        if (!bootstrapped) {
            throw new Error('Usuário não encontrado no sistema. Contate o administrador.');
        }
        userSnap = await getDoc(userRef);
    }

    const profile = userSnap.exists() ? userSnap.data() : null;

    if (!profile.active) {
        await firebaseSignOut(auth);
        throw new Error('Conta desativada. Contate o administrador.');
    }

    // Atualiza timestamp de último acesso
    await updateDoc(userRef, { lastLogin: serverTimestamp() });
    _currentProfile = { ...profile, uid: user.uid };
    return _currentProfile;
}

// ================================================================
// Registro de conta (self-service)
// Sempre cria com menor privilégio (viewer).
// ================================================================
export async function registerUser({ name, email, password, rememberMe = true }) {
    await configureSessionPersistence(rememberMe);

    const cleanName = (name || '').trim();
    const cleanEmail = (email || '').trim().toLowerCase();

    const credential = await createUserWithEmailAndPassword(auth, cleanEmail, password);
    const user = credential.user;

    if (cleanName) {
        await updateProfile(user, { displayName: cleanName });
    }

    // Primeiro tenta aproveitar eventual template criado por admin.
    const bootstrapped = await bootstrapUserProfileFromEmailTemplate(user);

    if (!bootstrapped) {
        await setDoc(doc(db, 'users', user.uid), {
            uid: user.uid,
            name: cleanName || user.email.split('@')[0],
            email: cleanEmail,
            role: 'viewer',
            active: true,
            department: '',
            position: '',
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
            lastLogin: serverTimestamp(),
        }, { merge: true });
    }

    const profileSnap = await getDoc(doc(db, 'users', user.uid));
    const profile = profileSnap.exists() ? profileSnap.data() : null;
    _currentProfile = { ...(profile || {}), uid: user.uid };
    return _currentProfile;
}

// ================================================================
// Logout
// ================================================================
export async function signOut() {
    _currentProfile = null;
    await firebaseSignOut(auth);
    window.location.href = '/login.html';
}

// ================================================================
// Recuperação de senha
// ================================================================
export async function resetPassword(email) {
    await sendPasswordResetEmail(auth, email);
}

// ================================================================
// Obter usuário autenticado atual (Firebase Auth)
// ================================================================
export function getCurrentUser() {
    return auth.currentUser;
}

// ================================================================
// Aguardar auth state e retornar usuário ou null
// ================================================================
export function waitForAuthState() {
    return new Promise(resolve => {
        const unsubscribe = onAuthStateChanged(auth, user => {
            unsubscribe();
            resolve(user);
        });
    });
}

// ================================================================
// Obter perfil completo do usuário no Firestore
// ================================================================
export async function getUserProfile(uid) {
    if (_currentProfile && _currentProfile.uid === uid) {
        return _currentProfile;
    }
    let snap = await getDoc(doc(db, 'users', uid));
    if (!snap.exists() && auth.currentUser && auth.currentUser.uid === uid) {
        await bootstrapUserProfileFromEmailTemplate(auth.currentUser);
        snap = await getDoc(doc(db, 'users', uid));
    }
    if (!snap.exists()) return null;
    _currentProfile = { ...snap.data(), uid };
    return _currentProfile;
}

async function bootstrapUserProfileFromEmailTemplate(user) {
    if (!user?.email) return false;

    let templates;
    try {
        templates = await getDocs(query(
            collection(db, 'users'),
            where('email', '==', user.email.toLowerCase()),
            limit(1)
        ));
    } catch (_) {
        return false;
    }

    if (templates.empty) return false;

    const templateDoc = templates.docs[0];
    const template = templateDoc.data();

    const profileData = {
        name: template.name || user.displayName || user.email.split('@')[0],
        email: user.email.toLowerCase(),
        // Sempre cria com menor privilégio; promoção de papel deve ser feita por admin.
        role: 'viewer',
        department: template.department || '',
        position: template.position || '',
        active: template.active !== false,
        uid: user.uid,
        createdAt: template.createdAt || serverTimestamp(),
        updatedAt: serverTimestamp(),
        lastLogin: serverTimestamp(),
        profileTemplateId: templateDoc.id,
        requestedRole: template.role || 'viewer',
    };

    await setDoc(doc(db, 'users', user.uid), profileData, { merge: true });

    if (templateDoc.id !== user.uid) {
        await updateDoc(doc(db, 'users', templateDoc.id), {
            migratedToUid: user.uid,
            migratedAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
        });
    }

    return true;
}

// ================================================================
// Verificar se o usuário tem role suficiente
// roles: 'viewer' < 'editor' < 'admin'
// ================================================================
const ROLE_HIERARCHY = { viewer: 1, editor: 2, admin: 3 };

export function hasRole(profile, requiredRole) {
    if (!profile || !profile.active) return false;
    const userLevel = ROLE_HIERARCHY[profile.role] || 0;
    const requiredLevel = ROLE_HIERARCHY[requiredRole] || 99;
    return userLevel >= requiredLevel;
}

export function isAdmin(profile) { return hasRole(profile, 'admin'); }
export function isEditor(profile) { return hasRole(profile, 'editor'); }
export function isViewer(profile) { return hasRole(profile, 'viewer'); }

// ================================================================
// Guard de rota: redireciona para login se não autenticado,
// e carrega perfil. Uso em cada módulo JS de página.
// ================================================================
export async function requireAuth(requiredRole = 'viewer') {
    const user = await waitForAuthState();

    if (!user) {
        window.location.href = '/login.html';
        return null;
    }

    const profile = await getUserProfile(user.uid);

    if (!profile || !profile.active) {
        await firebaseSignOut(auth);
        window.location.href = '/login.html?error=inactive';
        return null;
    }

    if (!hasRole(profile, requiredRole)) {
        // Mostra tela de acesso negado ao invés de redirecionar cegamente
        showAccessDenied(profile);
        return null;
    }

    return profile;
}

// ================================================================
// Exibir tela de acesso negado
// ================================================================
function showAccessDenied(profile) {
    const loading = document.getElementById('app-loading');
    if (loading) loading.style.display = 'none';

    document.body.innerHTML = `
    <div style="min-height:100vh;display:flex;align-items:center;justify-content:center;
                font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;
                background:#F1F5F9;">
      <div style="text-align:center;max-width:380px;padding:48px 32px;
                  background:white;border-radius:20px;box-shadow:0 20px 40px rgba(0,0,0,0.08);
                  border:1px solid #E2E8F0;">
        <div style="width:60px;height:60px;border-radius:14px;background:#FEF2F2;
                    display:flex;align-items:center;justify-content:center;margin:0 auto 20px;">
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#EF4444" stroke-width="2">
            <circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/>
            <line x1="9" y1="9" x2="15" y2="15"/>
          </svg>
        </div>
        <h2 style="font-size:20px;font-weight:800;color:#0F172A;margin-bottom:8px;">
          Acesso Negado
        </h2>
        <p style="font-size:13px;color:#64748B;line-height:1.6;margin-bottom:24px;">
          Você não tem permissão para acessar esta área.
          Seu perfil atual: <strong>${profile?.role || 'desconhecido'}</strong>.
        </p>
        <a href="/dashboard.html"
           style="display:inline-flex;align-items:center;gap:8px;padding:10px 20px;
                  background:#4F46E5;color:white;border-radius:10px;font-weight:600;
                  font-size:13px;text-decoration:none;">
          Voltar ao Dashboard
        </a>
      </div>
    </div>`;
}

// ================================================================
// Inicializar listener de auth para atualizar UI em tempo real
// ================================================================
export function onAuthChange(callback) {
    return onAuthStateChanged(auth, callback);
}

// ================================================================
// Atualizar perfil do usuário (nome, telefone)
// ================================================================
export async function updateUserProfile(uid, data) {
    const userRef = doc(db, 'users', uid);
    await updateDoc(userRef, {
        ...data,
        updatedAt: serverTimestamp()
    });
}

// ================================================================
// Alterar senha do usuário logado
// ================================================================
export async function changePassword(currentPassword, newPassword) {
    const user = auth.currentUser;
    if (!user) throw new Error('Usuário não autenticado');
    
    const credential = EmailAuthProvider.credential(user.email, currentPassword);
    await reauthenticateWithCredential(user, credential);
    await updatePassword(user, newPassword);
}
