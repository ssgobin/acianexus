/* ================================================================
   NEXUS — Input Validators
   Validação client-side de formulários.
   NOTA: Estas validações são para UX. A segurança real está nas
   Firestore Security Rules (server-side).
   ================================================================ */

// ================================================================
// Validar email
// ================================================================
export function isValidEmail(email) {
    if (!email || typeof email !== 'string') return false;
    // RFC 5322 simplified
    return /^[^\s@]{1,64}@[^\s@]{1,250}\.[^\s@]{2,}$/.test(email.trim());
}

// ================================================================
// Validar senha mínima
// ================================================================
export function isValidPassword(password) {
    return typeof password === 'string' && password.length >= 8;
}

// ================================================================
// Verificar campo obrigatório
// ================================================================
export function isRequired(value) {
    if (value === null || value === undefined) return false;
    if (typeof value === 'string') return value.trim().length > 0;
    if (Array.isArray(value)) return value.length > 0;
    return true;
}

// ================================================================
// Validar tamanho máximo de string
// ================================================================
export function maxLength(value, max) {
    return typeof value === 'string' && value.length <= max;
}

// ================================================================
// Validar número positivo
// ================================================================
export function isPositiveNumber(value) {
    const n = Number(value);
    return !isNaN(n) && n > 0;
}

// ================================================================
// Validar intervalo numérico
// ================================================================
export function inRange(value, min, max) {
    const n = Number(value);
    return !isNaN(n) && n >= min && n <= max;
}

// ================================================================
// Validar data (string YYYY-MM-DD)
// ================================================================
export function isValidDate(str) {
    if (!str || typeof str !== 'string') return false;
    const d = new Date(str);
    return !isNaN(d.getTime());
}

// ================================================================
// Validar hora (string HH:mm)
// ================================================================
export function isValidTime(str) {
    return typeof str === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(str);
}

// ================================================================
// VALIDAÇÃO DE FORMULÁRIOS (helper genérico)
// Exemplo de uso:
//   const erros = validateForm(formData, rules);
//   se erros é {}, formulário é válido
// ================================================================
export function validateForm(data, rules) {
    const errors = {};

    for (const [field, fieldRules] of Object.entries(rules)) {
        const value = data[field];

        if (fieldRules.required && !isRequired(value)) {
            errors[field] = fieldRules.requiredMsg || 'Campo obrigatório.';
            continue;
        }
        if (!isRequired(value)) continue; // campo vazio e não obrigatório — pula demais regras

        if (fieldRules.email && !isValidEmail(value)) {
            errors[field] = 'E-mail inválido.';
            continue;
        }
        if (fieldRules.maxLen && !maxLength(value, fieldRules.maxLen)) {
            errors[field] = `Máximo ${fieldRules.maxLen} caracteres.`;
            continue;
        }
        if (fieldRules.minLen && value.length < fieldRules.minLen) {
            errors[field] = `Mínimo ${fieldRules.minLen} caracteres.`;
            continue;
        }
        if (fieldRules.min !== undefined && Number(value) < fieldRules.min) {
            errors[field] = `Valor mínimo: ${fieldRules.min}.`;
            continue;
        }
        if (fieldRules.max !== undefined && Number(value) > fieldRules.max) {
            errors[field] = `Valor máximo: ${fieldRules.max}.`;
            continue;
        }
        if (fieldRules.date && !isValidDate(value)) {
            errors[field] = 'Data inválida.';
            continue;
        }
        if (fieldRules.time && !isValidTime(value)) {
            errors[field] = 'Hora inválida (HH:mm).';
            continue;
        }
        if (fieldRules.matches && value !== data[fieldRules.matches]) {
            errors[field] = fieldRules.matchMsg || 'Os campos não coincidem.';
            continue;
        }
        if (fieldRules.custom && !fieldRules.custom(value, data)) {
            errors[field] = fieldRules.customMsg || 'Valor inválido.';
        }
    }

    return errors;
}

// ================================================================
// Aplicar erros de validação em elementos do DOM
// ================================================================
export function applyFormErrors(errors, formEl) {
    // Limpa erros anteriores
    formEl.querySelectorAll('.form-error').forEach(el => {
        el.textContent = '';
        el.classList.remove('visible');
    });
    formEl.querySelectorAll('.form-control').forEach(el => {
        el.classList.remove('error');
    });

    // Aplica novos erros
    for (const [field, msg] of Object.entries(errors)) {
        const input = formEl.querySelector(`[name="${field}"]`);
        const errEl = formEl.querySelector(`#error-${field}`);
        if (input) input.classList.add('error');
        if (errEl) {
            errEl.textContent = msg;
            errEl.classList.add('visible');
        }
    }
}

export function clearFormErrors(formEl) {
    formEl.querySelectorAll('.form-error').forEach(el => {
        el.textContent = '';
        el.classList.remove('visible');
    });
    formEl.querySelectorAll('.form-control').forEach(el => {
        el.classList.remove('error', 'success');
    });
}

// ================================================================
// Validar mensagem de chat
// ================================================================
export function validateChatMessage(content) {
    if (!isRequired(content)) return 'Mensagem não pode estar vazia.';
    if (!maxLength(content, 2000)) return 'Mensagem muito longa (máx 2000 caracteres).';
    return null;
}

// ================================================================
// Validar dados de tarefa
// ================================================================
export function validateTask(data) {
    return validateForm(data, {
        title: { required: true, maxLen: 200 },
        board: { required: true },
        assigneeId: { required: true, requiredMsg: 'Selecione um responsável.' },
        status: { required: true },
    });
}

// ================================================================
// Validar dados de chamado
// ================================================================
export function validateTicket(data) {
    return validateForm(data, {
        title: { required: true, maxLen: 200 },
        description: { required: true, maxLen: 4000 },
        department: { required: true },
        severity: { required: true },
    });
}

// ================================================================
// Validar dados de evento
// ================================================================
export function validateEvent(data) {
    return validateForm(data, {
        title: { required: true, maxLen: 200 },
        eventDate: { required: true, date: true },
        responsibleId: { required: true, requiredMsg: 'Selecione um responsável.' },
    });
}
