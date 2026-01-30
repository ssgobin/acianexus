/* ===========================
Membros (admin)
============================ */
; (function initMembers() {
    const view = $('#view-members'); if (!view) return;
    const list = $('#mb-list');
    const addBtn = $('#mb-add');
    const nameIn = $('#mb-name');
    const emailIn = $('#mb-email');
    const roleIn = $('#mb-role');
    const msg = $('#memb-msg');

    function setMsgTxt(type, text) { setMsg(msg, type, text); }

    // render tabela simples
    let unsubUsers = null;
    async function startUsersLive() {
        if (!cloudOk) { list.innerHTML = '<div class="muted">Entre com sua conta.</div>'; return; }
        const { collection, onSnapshot, orderBy, query } = await import("https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js");
        const qRef = query(collection(db, 'users'), orderBy('name', 'asc'));
        if (unsubUsers) unsubUsers();
        unsubUsers = onSnapshot(qRef, (snap) => {
            const rows = [];
            snap.forEach(d => {
                const u = { id: d.id, ...d.data() };
                rows.push(`
  <div class="row user-row"
       data-docid="${u.id}"
       data-uid="${u.uid || u.id}"
       data-role="${u.role || 'editor'}"
       style="align-items:center;margin:6px 0">
    <div class="field"><input value="${u.name || '—'}" disabled /></div>
    <div class="field"><input value="${u.email || '—'}" disabled /></div>
    <div class="field">
      <select data-uid="${u.uid || u.id}">
        <option value="viewer" ${u.role === 'viewer' ? 'selected' : ''}>viewer</option>
        <option value="editor" ${(!u.role || u.role === 'editor') ? 'selected' : ''}>editor</option>
        <option value="admin" ${u.role === 'admin' ? 'selected' : ''}>admin</option>
      </select>
    </div>
    <div class="field" style="display:flex;justify-content:flex-end">
      <button class="btn secondary btn-del"
              type="button"
              title="Remover usuário"
              ${currentRole !== 'admin' ? 'disabled' : ''}
              style="border-color: rgba(239,68,68,.45)">
        Excluir
      </button>
    </div>
  </div>
`);

            });
            list.innerHTML = rows.join('') || '<div class="muted">Sem membros.</div>';

            // listeners de alteração de role
            list.querySelectorAll('select[data-uid]').forEach(sel => {
                sel.onchange = async () => {
                    if (currentRole !== 'admin') { setMsgTxt('err', 'Somente admin pode alterar papéis.'); sel.value = sel.getAttribute('value') || 'editor'; return; }
                    const uid = sel.getAttribute('data-uid');
                    const role = sel.value;
                    try {
                        const { doc, setDoc } = await import("https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js");
                        await setDoc(doc(db, 'users', uid), { role }, { merge: true });
                        setMsgTxt('ok', 'Papel atualizado.');
                        // se alterar o próprio, força re-render global
                        if (uid === currentUser?.uid) {
                            const evt = new Event('auth:changed'); document.dispatchEvent(evt);
                        }
                    } catch (e) { setMsgTxt('err', 'Falha ao alterar papel.'); }
                };
            });
            // excluir usuário (apenas admin)
            list.querySelectorAll('.btn-del').forEach(btn => {
                btn.onclick = async () => {
                    if (currentRole !== 'admin') {
                        setMsgTxt('err', 'Somente admin pode excluir usuários.');
                        return;
                    }
                    const row = btn.closest('.user-row');
                    const docId = row?.getAttribute('data-docid');
                    const uid = row?.getAttribute('data-uid');
                    const role = row?.getAttribute('data-role');

                    // não permitir excluir a si mesmo
                    if (uid && currentUser?.uid && uid === currentUser.uid) {
                        setMsgTxt('err', 'Você não pode excluir a si mesmo.');
                        return;
                    }

                    // impedir apagar o último admin
                    const adminsCount = list.querySelectorAll('.user-row[data-role="admin"]').length;
                    if (role === 'admin' && adminsCount <= 1) {
                        setMsgTxt('err', 'Não é possível excluir o último administrador.');
                        return;
                    }

                    if (!docId) return;
                    const ok = confirm('Excluir este usuário? Isso remove apenas o registro em /users (não apaga a conta de login).');
                    if (!ok) return;

                    try {
                        const { doc, deleteDoc } = await import("https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js");
                        await deleteDoc(doc(db, 'users', docId));
                        setMsgTxt('ok', 'Usuário removido.');
                    } catch (e) {
                        console.error(e);
                        setMsgTxt('err', 'Falha ao excluir. Verifique as regras do Firestore.');
                    }
                };
            });

        });
    }

    addBtn.addEventListener('click', async () => {
        if (currentRole !== 'admin') { setMsgTxt('err', 'Somente admin pode adicionar/atualizar.'); return; }
        const email = (emailIn.value || '').trim().toLowerCase();
        const name = (nameIn.value || '').trim() || null;
        const role = roleIn.value || 'editor';
        if (!email) { setMsgTxt('err', 'Informe um e-mail.'); return; }

        try {
            const { collection, query, where, getDocs, setDoc, doc } = await import("https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js");
            // procura por usuário já existente por e-mail
            const q = query(collection(db, 'users'), where('email', '==', email));
            const snap = await getDocs(q);

            if (!snap.empty) {
                // atualiza role do existente
                const d = snap.docs[0];
                await setDoc(doc(db, 'users', d.id), { role, name: name ?? d.data().name }, { merge: true });
                setMsgTxt('ok', 'Usuário atualizado.');
            } else {
                // cria um "pré-cadastro" sem UID (será unido quando este email logar)
                const tempId = `pre_${Date.now()}`;
                await setDoc(doc(db, 'users', tempId), { email, name, role, placeholder: true, createdAt: new Date().toISOString() });
                setMsgTxt('ok', 'Pré-cadastro criado. Quando essa pessoa fizer login, você pode ajustar/mesclar.');
            }
            emailIn.value = ''; nameIn.value = '';
        } catch (e) { console.error(e); setMsgTxt('err', 'Não foi possível adicionar.'); }
    });

    ; (function initAuthView() {
        const ALLOWED_DOMAIN = 'acia.com.br'; // mantém igual ao usado no initFirebase

        const view = document.querySelector('#view-auth');
        if (!view) return;

        const tabLogin = document.querySelector('#auth-tab-login');
        const tabRegister = document.querySelector('#auth-tab-register');
        const paneLogin = document.querySelector('#loginForm');
        const paneRegister = document.querySelector('#registerForm');

        const loginEmail = document.querySelector('#auth-login-email');
        const loginPass = document.querySelector('#auth-login-pass');
        const loginMsg = document.querySelector('#auth-login-msg');
        const loginBtn = document.querySelector('#auth-login-btn');
        const btnForgot = document.querySelector('#auth-forgot');

        const regName = document.querySelector('#auth-reg-name');
        const regEmail = document.querySelector('#auth-reg-email');
        const regPass = document.querySelector('#auth-reg-pass');
        const regPass2 = document.querySelector('#auth-reg-pass2');
        const regMsg = document.querySelector('#auth-reg-msg');
        const regBtn = document.querySelector('#auth-reg-btn');

        const toLogin = document.querySelector('#auth-to-login');
        const toRegister = document.querySelector('#auth-to-register');

        const setMsg = (el, type, text) => { el.className = `msg ${type} show`; el.textContent = text; };

        function switchTab(which) {
            const isLogin = which === 'login';
            tabLogin.classList.toggle('active', isLogin);
            tabRegister.classList.toggle('active', !isLogin);
            paneLogin.classList.toggle('hidden', !isLogin);
            paneRegister.classList.toggle('hidden', isLogin);
            (isLogin ? loginEmail : regEmail).focus();
        }

        tabLogin.onclick = () => switchTab('login');
        tabRegister.onclick = () => switchTab('register');
        toLogin.onclick = () => switchTab('login');
        toRegister.onclick = () => switchTab('register');

        // Prefill vindo de outra ação
        window.addEventListener('hashchange', () => {
            if (location.hash.startsWith('#/entrar')) switchTab('login');
        });

        // LOGIN
        paneLogin.addEventListener('submit', async (e) => {
            e.preventDefault();
            loginMsg.classList.remove('show');

            const email = (loginEmail.value || '').trim().toLowerCase();
            const pass = loginPass.value || '';

            if (!email.endsWith('@' + ALLOWED_DOMAIN)) {
                setMsg(loginMsg, 'err', `Use um e-mail @${ALLOWED_DOMAIN}.`);
                return;
            }
            if (!pass) {
                setMsg(loginMsg, 'err', 'Informe a senha.');
                return;
            }

            loginBtn.disabled = true; loginBtn.textContent = 'Entrando…';
            try {
                const { getAuth, signInWithEmailAndPassword, fetchSignInMethodsForEmail, sendPasswordResetEmail } =
                    await import("https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js");
                const auth = getAuth();

                try {
                    await signInWithEmailAndPassword(auth, email, pass);
                    setMsg(loginMsg, 'ok', 'Bem-vindo! Redirecionando…');
                    setTimeout(() => { location.hash = '#/kanban'; }, 500);
                } catch (err) {
                    if (err.code === 'auth/invalid-credential') {
                        // Descobrir se é senha errada ou usuário inexistente
                        try {
                            const methods = await fetchSignInMethodsForEmail(auth, email);
                            if (!methods.length) {
                                setMsg(loginMsg, 'err', 'Conta não encontrada. Clique em "Criar conta".');
                                switchTab('register'); regEmail.value = email; regPass.focus();
                            } else if (methods.includes('password')) {
                                setMsg(loginMsg, 'err', 'Senha incorreta. Você pode redefinir abaixo.');
                            } else {
                                setMsg(loginMsg, 'err', `Este e-mail usa outro método: ${methods.join(', ')}`);
                            }
                        } catch {
                            setMsg(loginMsg, 'err', 'Não foi possível verificar sua conta agora.');
                        }
                    } else if (err.code === 'auth/operation-not-allowed') {
                        setMsg(loginMsg, 'err', 'Método Email/Senha está desativado no Firebase.');
                    } else {
                        setMsg(loginMsg, 'err', 'Falha no login. Tente novamente.');
                    }
                }
            } finally {
                loginBtn.disabled = false; loginBtn.textContent = 'Entrar';
            }
        });

        // RESET DE SENHA
        btnForgot?.addEventListener('click', async (e) => {
            e.preventDefault();
            loginMsg.classList.remove('show');
            const email = (loginEmail.value || '').trim().toLowerCase();
            if (!email || !email.endsWith('@' + ALLOWED_DOMAIN)) {
                setMsg(loginMsg, 'err', `Informe seu e-mail @${ALLOWED_DOMAIN} para redefinir.`);
                return;
            }
            try {
                const { getAuth, sendPasswordResetEmail } =
                    await import("https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js");
                await sendPasswordResetEmail(getAuth(), email);
                setMsg(loginMsg, 'ok', `Enviamos instruções para ${email}.`);
            } catch (err) {
                setMsg(loginMsg, 'err', 'Não foi possível enviar o e-mail de redefinição.');
            }
        });

        // REGISTRO
        paneRegister.addEventListener('submit', async (e) => {
            e.preventDefault();
            regMsg.classList.remove('show');

            const name = (regName.value || '').trim();
            const email = (regEmail.value || '').trim().toLowerCase();
            const pass = regPass.value || '';
            const pass2 = regPass2.value || '';

            if (!email.endsWith('@' + ALLOWED_DOMAIN)) {
                setMsg(regMsg, 'err', `Use um e-mail @${ALLOWED_DOMAIN}.`);
                return;
            }
            if (pass.length < 6) {
                setMsg(regMsg, 'err', 'Senha muito curta (mín. 6).');
                return;
            }
            if (pass !== pass2) {
                setMsg(regMsg, 'err', 'As senhas não coincidem.');
                return;
            }

            regBtn.disabled = true; regBtn.textContent = 'Criando…';
            try {
                const { getAuth, createUserWithEmailAndPassword, sendEmailVerification, updateProfile } =
                    await import("https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js");
                const { getFirestore, doc, setDoc } =
                    await import("https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js");

                const auth = getAuth();
                const cred = await createUserWithEmailAndPassword(auth, email, pass);

                // Nome de exibição (opcional)
                if (name) {
                    try {
                        await updateProfile(cred.user, { displayName: name });
                        await cred.user.reload(); // <=== ADICIONE ISTO
                    } catch { }
                }


                // Cria/atualiza registro em /users (ajuda no painel de membros)
                try {
                    const db = getFirestore();
                    await setDoc(doc(db, 'users', cred.user.uid), {
                        uid: cred.user.uid,
                        name: name || null,
                        email: email,
                        role: 'editor',
                        createdAt: new Date().toISOString()
                    }, { merge: true });
                } catch { }

                // Verificação por e-mail
                try { await sendEmailVerification(cred.user); } catch { }

                setMsg(regMsg, 'ok', 'Conta criada! Verifique seu e-mail antes de entrar.');
                // Faz sign-out para forçar verificação antes do acesso
                try { (await import("https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js")).signOut(auth); } catch { }
                setTimeout(() => switchTab('login'), 800);
            } catch (err) {
                if (err.code === 'auth/email-already-in-use') {
                    setMsg(regMsg, 'err', 'Este e-mail já está em uso. Tente entrar ou redefinir a senha.');
                    switchTab('login'); loginEmail.value = email; loginPass.focus();
                } else if (err.code === 'auth/weak-password') {
                    setMsg(regMsg, 'err', 'Senha fraca (mín. 6).');
                } else {
                    setMsg(regMsg, 'err', 'Não foi possível criar sua conta agora.');
                }
            } finally {
                regBtn.disabled = false; regBtn.textContent = 'Criar conta';
            }
        });

    })();


    // rota
    function paintMembersPermissions() {
        addBtn.disabled = (currentRole !== 'admin');
    }
    document.addEventListener('auth:changed', () => { paintMembersPermissions(); startUsersLive(); });

    // se já veio logado
    startUsersLive();
    paintMembersPermissions();
})();
