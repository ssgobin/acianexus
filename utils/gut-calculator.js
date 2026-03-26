/* ================================================================
   NEXUS — GUT Matrix Calculator
   Gravidade × Urgência × Tendência = Score de prioridade.
   
   Escala: 1 (mínimo) a 5 (máximo) por dimensão.
   Score máximo: 5 × 5 × 5 = 125
   ================================================================ */

// ================================================================
// Calcular score GUT
// ================================================================
export function calcGutScore(gravity, urgency, trend) {
    const g = clampGut(gravity);
    const u = clampGut(urgency);
    const t = clampGut(trend);
    return g * u * t;
}

function clampGut(val) {
    const n = Number(val);
    if (isNaN(n)) return 1;
    return Math.max(1, Math.min(5, Math.round(n)));
}

// ================================================================
// Nível de prioridade baseado no score
// ================================================================
export function gutPriorityLevel(score) {
    if (score >= 80) return 'critical';
    if (score >= 40) return 'high';
    if (score >= 15) return 'medium';
    return 'low';
}

export function gutPriorityLabel(score) {
    const map = {
        critical: 'Crítica',
        high: 'Alta',
        medium: 'Média',
        low: 'Baixa'
    };
    return map[gutPriorityLevel(score)] || 'Baixa';
}

export function gutPriorityClass(score) {
    const map = {
        critical: 'priority-critical',
        high: 'priority-high',
        medium: 'priority-medium',
        low: 'priority-low'
    };
    return map[gutPriorityLevel(score)] || 'priority-low';
}

// ================================================================
// Labels descritivos para cada dimensão e nível
// ================================================================
export const GUT_GRAVITY_LABELS = {
    1: 'Sem gravidade',
    2: 'Pouco grave',
    3: 'Grave',
    4: 'Muito grave',
    5: 'Extremamente grave'
};

export const GUT_URGENCY_LABELS = {
    1: 'Pode esperar',
    2: 'Pouco urgente',
    3: 'Urgente',
    4: 'Muito urgente',
    5: 'Ação imediata'
};

export const GUT_TREND_LABELS = {
    1: 'Não vai mudar',
    2: 'Vai piorar a longo prazo',
    3: 'Vai piorar a médio prazo',
    4: 'Vai piorar a curto prazo',
    5: 'Vai piorar rapidamente'
};

// ================================================================
// Objeto GUT completo para armazenar no Firestore
// ================================================================
export function buildGutObject(gravity, urgency, trend) {
    const g = clampGut(gravity);
    const u = clampGut(urgency);
    const t = clampGut(trend);
    const score = g * u * t;
    return {
        gravity: g,
        urgency: u,
        trend: t,
        score,
        level: gutPriorityLevel(score),
        label: gutPriorityLabel(score)
    };
}

// ================================================================
// Renderizar badge de prioridade GUT
// ================================================================
export function renderGutBadge(gut) {
    if (!gut) return '<span class="badge badge-gray">—</span>';
    const score = gut.score || calcGutScore(gut.gravity, gut.urgency, gut.trend);
    const level = gutPriorityLevel(score);
    const label = gutPriorityLabel(score);
    const cls = gutPriorityClass(score);
    return `<span class="badge ${cls}" title="GUT Score: ${score}">${label} (${score})</span>`;
}
