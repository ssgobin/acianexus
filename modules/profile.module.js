/* ================================================================
   NEXUS — Profile Module
   Edição de perfil do usuário logado.
   ================================================================ */

import { requireAuth, updateUserProfile, changePassword } from '/services/auth.service.js';
import { db } from '/services/firebase-config.js';
import { doc, getDoc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { renderSidebar } from '/components/sidebar.js';
import { renderHeader } from '/components/header.js';
import { createModal, openModal, closeModal, confirmDialog } from '/components/modal.js';
import { toast } from '/components/toast.js';
import { getStoredTheme, setTheme, escapeHtml, getInitials, stringToColor, ROLE_LABELS } from '/utils/helpers.js';

let _profile = null;

async function init() {
    setTheme(getStoredTheme());

    _profile = await requireAuth();
    if (!_profile) return;

    renderSidebar('profile', _profile);
    renderHeader(_profile, 'Perfil', 'Suas informações pessoais');

    document.getElementById('page-content').innerHTML = buildLayout();

    renderProfileInfo();
    setupListeners();

    document.getElementById('app-loading').style.display = 'none';
    document.getElementById('app').style.display = 'flex';
    window.renderIcons?.();
}

function buildLayout() {
    const color = stringToColor(_profile.name || _profile.email);
    const initials = getInitials(_profile.name || _profile.email);
    const roleLabel = ROLE_LABELS[_profile.role] || _profile.role;

    return `
    <div class="profile-page">
      <!-- Avatar Section -->
      <div class="profile-avatar-section">
        <div class="profile-avatar" style="background: linear-gradient(135deg, ${color}, ${color}cc)">
          ${initials}
        </div>
        <h3>${escapeHtml(_profile.name || 'Usuário')}</h3>
        <p class="role-badge">${roleLabel}</p>
      </div>

      <!-- Info Cards -->
      <div class="profile-cards">
        <div class="profile-card">
          <div class="profile-card-header">
            <i data-fa-icon="user"></i>
            <h4>Informações Pessoais</h4>
          </div>
          <div class="profile-card-body">
            <div class="profile-field">
              <label>Nome</label>
              <span>${escapeHtml(_profile.name || '-')}</span>
            </div>
            <div class="profile-field">
              <label>E-mail</label>
              <span>${escapeHtml(_profile.email || '-')}</span>
            </div>
            <div class="profile-field">
              <label>Cargo</label>
              <span>${roleLabel}</span>
            </div>
            <div class="profile-field">
              <label>Telefone</label>
              <span>${escapeHtml(_profile.phone || 'Não informado')}</span>
            </div>
            <div class="profile-field">
              <label>Membro desde</label>
              <span>${_profile.createdAt ? new Date(_profile.createdAt).toLocaleDateString('pt-BR') : '-'}</span>
            </div>
          </div>
          <div class="profile-card-footer">
            <button class="btn btn-secondary btn-sm" onclick="window._openEditProfile()">
              <i data-fa-icon="edit-2"></i> Editar
            </button>
          </div>
        </div>

        <div class="profile-card">
          <div class="profile-card-header">
            <i data-fa-icon="shield"></i>
            <h4>Segurança</h4>
          </div>
          <div class="profile-card-body">
            <div class="profile-field">
              <label>Última alteração de senha</label>
              <span>${_profile.lastPasswordChange ? new Date(_profile.lastPasswordChange).toLocaleDateString('pt-BR') : 'Nunca'}</span>
            </div>
            <div class="profile-field">
              <label>Autenticação</label>
              <span><span class="badge badge-success">Firebase Auth</span></span>
            </div>
          </div>
          <div class="profile-card-footer">
            <button class="btn btn-secondary btn-sm" onclick="window._openChangePassword()">
              <i data-fa-icon="lock"></i> Alterar Senha
            </button>
          </div>
        </div>

        <div class="profile-card">
          <div class="profile-card-header">
            <i data-fa-icon="palette"></i>
            <h4>Aparência</h4>
          </div>
          <div class="profile-card-body">
            <div class="profile-field">
              <label>Tema atual</label>
              <span>${getStoredTheme() === 'dark' ? 'Escuro' : 'Claro'}</span>
            </div>
          </div>
          <div class="profile-card-footer">
            <div class="theme-toggle">
              <button class="btn ${getStoredTheme() === 'light' ? 'btn-primary' : 'btn-secondary'} btn-sm" onclick="window._toggleTheme('light')">
                <i data-fa-icon="sun"></i> Claro
              </button>
              <button class="btn ${getStoredTheme() === 'dark' ? 'btn-primary' : 'btn-secondary'} btn-sm" onclick="window._toggleTheme('dark')">
                <i data-fa-icon="moon"></i> Escuro
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>

    <style>
    .profile-page { max-width: 900px; margin: 0 auto; padding: 24px; }
    .profile-avatar-section { text-align: center; margin-bottom: 32px; }
    .profile-avatar {
        width: 100px; height: 100px; border-radius: 50%;
        display: flex; align-items: center; justify-content: center;
        font-size: 36px; font-weight: 700; color: white;
        margin: 0 auto 16px;
    }
    .profile-avatar-section h3 { margin: 0 0 8px; }
    .role-badge {
        display: inline-block; padding: 4px 12px;
        background: var(--clr-primary-100); color: var(--clr-primary-700);
        border-radius: 20px; font-size: 13px; font-weight: 500;
    }
    .profile-cards { display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 20px; }
    .profile-card {
        background: var(--bg-card); border: 1px solid var(--border-color);
        border-radius: 12px; overflow: hidden;
    }
    .profile-card-header {
        display: flex; align-items: center; gap: 10px;
        padding: 16px; background: var(--bg-subtle);
        border-bottom: 1px solid var(--border-color);
    }
    .profile-card-header i { color: var(--clr-primary-500); }
    .profile-card-header h4 { margin: 0; font-size: 15px; font-weight: 600; }
    .profile-card-body { padding: 16px; }
    .profile-field { margin-bottom: 12px; }
    .profile-field:last-child { margin-bottom: 0; }
    .profile-field label {
        display: block; font-size: 12px; color: var(--text-muted);
        margin-bottom: 4px; text-transform: uppercase; letter-spacing: 0.5px;
    }
    .profile-field span { font-size: 14px; color: var(--text-primary); }
    .profile-card-footer { padding: 12px 16px; border-top: 1px solid var(--border-color); }
    .theme-toggle { display: flex; gap: 8px; }
    .badge-success {
        background: #dcfce7; color: #166534; padding: 2px 8px;
        border-radius: 4px; font-size: 12px;
    }
    @media (max-width: 640px) {
        .profile-cards { grid-template-columns: 1fr; }
    }
    </style>
    `;
}

function renderProfileInfo() {
    // Already rendered in buildLayout
}

function setupListeners() {
    // Handlers are exposed globally
}

window._openEditProfile = async function() {
    if (!document.getElementById('modal-profile')) {
        createProfileModal();
    }
    
    document.getElementById('prof-name').value = _profile.name || '';
    document.getElementById('prof-phone').value = _profile.phone || '';
    document.getElementById('prof-role').textContent = ROLE_LABELS[_profile.role] || _profile.role;
    document.getElementById('prof-email').textContent = _profile.email;
    
    openModal('modal-profile');
    window.renderIcons?.();
};

window._saveProfile = async function() {
    const name = document.getElementById('prof-name').value.trim();
    const phone = document.getElementById('prof-phone').value.trim();
    
    if (!name) {
        toast.warning('Nome obrigatório', 'Informe seu nome completo.');
        return;
    }
    
    try {
        await updateUserProfile(_profile.uid, { name, phone });
        _profile.name = name;
        _profile.phone = phone;
        
        const userRef = doc(db, 'users', _profile.uid);
        await updateDoc(userRef, { 
            name, 
            phone,
            updatedAt: serverTimestamp()
        });
        
        toast.success('Perfil atualizado', 'Suas informações foram salvas.');
        closeModal('modal-profile');
        
        document.getElementById('page-content').innerHTML = buildLayout();
        setupListeners();
        window.renderIcons?.();
    } catch (err) {
        console.error(err);
        toast.error('Erro', 'Não foi possível atualizar o perfil.');
    }
};

window._openChangePassword = async function() {
    if (!document.getElementById('modal-password')) {
        createPasswordModal();
    }
    document.getElementById('pass-current').value = '';
    document.getElementById('pass-new').value = '';
    document.getElementById('pass-confirm').value = '';
    openModal('modal-password');
};

window._savePassword = async function() {
    const current = document.getElementById('pass-current').value;
    const newPass = document.getElementById('pass-new').value;
    const confirm = document.getElementById('pass-confirm').value;
    
    if (!current || !newPass || !confirm) {
        toast.warning('Preencha todos os campos');
        return;
    }
    
    if (newPass.length < 6) {
        toast.warning('Senha fraca', 'A senha deve ter pelo menos 6 caracteres.');
        return;
    }
    
    if (newPass !== confirm) {
        toast.warning('Senhas diferentes', 'A nova senha e a confirmação não conferem.');
        return;
    }
    
    try {
        await changePassword(current, newPass);
        toast.success('Senha alterada', 'Sua senha foi atualizada com sucesso.');
        closeModal('modal-password');
    } catch (err) {
        console.error(err);
        if (err.code === 'auth/wrong-password') {
            toast.error('Senha atual incorreta', 'Digite sua senha atual corretamente.');
        } else {
            toast.error('Erro', 'Não foi possível alterar a senha.');
        }
    }
};

window._toggleTheme = function(theme) {
    setTheme(theme);
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('nexus_theme', theme);
    
    document.getElementById('page-content').innerHTML = buildLayout();
    setupListeners();
    window.renderIcons?.();
};

function createProfileModal() {
    createModal({
        id: 'modal-profile',
        title: 'Editar Perfil',
        body: `
        <form id="form-profile" class="form-grid">
            <div class="form-group">
                <label class="form-label">Nome</label>
                <input type="text" id="prof-name" class="form-input" maxlength="100" required>
            </div>
            <div class="form-group">
                <label class="form-label">Telefone</label>
                <input type="tel" id="prof-phone" class="form-input" maxlength="20" placeholder="(00) 00000-0000">
            </div>
            <div class="form-group">
                <label class="form-label">E-mail</label>
                <input type="email" id="prof-email" class="form-input" disabled style="opacity:0.6">
            </div>
            <div class="form-group">
                <label class="form-label">Cargo</label>
                <input type="text" id="prof-role" class="form-input" disabled style="opacity:0.6">
            </div>
        </form>`,
        footer: `
        <button class="btn btn-secondary" onclick="closeModal('modal-profile')">Cancelar</button>
        <button class="btn btn-primary" onclick="window._saveProfile()">
            <i data-fa-icon="save"></i> Salvar
        </button>`
    });
}

function createPasswordModal() {
    createModal({
        id: 'modal-password',
        title: 'Alterar Senha',
        body: `
        <form id="form-password" class="form-stack">
            <div class="form-group">
                <label class="form-label">Senha Atual</label>
                <input type="password" id="pass-current" class="form-input" required>
            </div>
            <div class="form-group">
                <label class="form-label">Nova Senha</label>
                <input type="password" id="pass-new" class="form-input" minlength="6" required>
            </div>
            <div class="form-group">
                <label class="form-label">Confirmar Nova Senha</label>
                <input type="password" id="pass-confirm" class="form-input" minlength="6" required>
            </div>
        </form>`,
        footer: `
        <button class="btn btn-secondary" onclick="closeModal('modal-password')">Cancelar</button>
        <button class="btn btn-primary" onclick="window._savePassword()">
            <i data-fa-icon="lock"></i> Alterar
        </button>`
    });
}

init();