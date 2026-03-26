/* ================================================================
   NEXUS — Content Sanitizer
   Proteção XSS para conteúdo exibido ao usuário.
   
   Usa DOMPurify (carregado via CDN como script global).
   Fallback para escape HTML simples se DOMPurify não estiver disponível.
   ================================================================ */

// ================================================================
// CONFIG do DOMPurify — configuração restritiva por padrão
// ================================================================
const SAFE_CONFIG = {
    ALLOWED_TAGS: ['b', 'i', 'em', 'strong', 'u', 'br', 'p', 'a', 'ul', 'ol', 'li', 'code', 'pre', 'blockquote', 'h3', 'h4'],
    ALLOWED_ATTR: ['href', 'target', 'rel'],
    ALLOW_DATA_ATTR: false,
    FORCE_BODY: false,
};

const TEXT_CONFIG = {
    ALLOWED_TAGS: [],
    ALLOWED_ATTR: [],
};

// ================================================================
// sanitize(html) — para conteúdo que pode ter HTML básico
// ================================================================
export function sanitize(html) {
    if (!html || typeof html !== 'string') return '';
    if (window.DOMPurify) {
        return window.DOMPurify.sanitize(html, SAFE_CONFIG);
    }
    // Fallback: strip all tags
    return html.replace(/<[^>]*>/g, '');
}

// ================================================================
// sanitizeStrict(str) — apenas texto, sem tags
// ================================================================
export function sanitizeText(str) {
    if (!str || typeof str !== 'string') return '';
    if (window.DOMPurify) {
        return window.DOMPurify.sanitize(str, TEXT_CONFIG);
    }
    return str
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#x27;');
}

// ================================================================
// sanitizeObject(obj, fields) — sanitiza campos de texto de um objeto
// ================================================================
export function sanitizeObject(obj, fields) {
    const result = { ...obj };
    for (const field of fields) {
        if (typeof result[field] === 'string') {
            result[field] = sanitizeText(result[field]);
        }
    }
    return result;
}

// ================================================================
// Renderizar texto com quebras de linha convertidas para <br>
// ================================================================
export function nl2br(str) {
    const safe = sanitizeText(str || '');
    return safe.replace(/\n/g, '<br>');
}

// ================================================================
// Truncar e sanitizar texto para preview
// ================================================================
export function sanitizePreview(str, maxLen = 120) {
    const clean = sanitizeText(str || '');
    return clean.length > maxLen ? clean.substring(0, maxLen) + '…' : clean;
}

// ================================================================
// Garantir que uma URL seja segura (apenas http/https)
// ================================================================
export function sanitizeUrl(url) {
    if (!url || typeof url !== 'string') return '#';
    const trimmed = url.trim();
    if (/^https?:\/\//i.test(trimmed)) return trimmed;
    if (/^\//.test(trimmed)) return trimmed; // relative path
    return '#'; // rejeitado
}
