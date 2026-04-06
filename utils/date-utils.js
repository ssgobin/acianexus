/* ================================================================
   NEXUS — Date Utilities
   Formatação e manipulação de datas (sem bibliotecas externas).
   ================================================================ */

// ================================================================
// Converter Timestamp do Firestore → Date
// ================================================================
export function tsToDate(ts) {
    if (!ts) return null;
    if (ts instanceof Date) return ts;
    if (ts.toDate) return ts.toDate(); // Firestore Timestamp
    if (typeof ts === 'number') return new Date(ts);
    if (typeof ts === 'string') return new Date(ts);
    return null;
}

// ================================================================
// Formatar datas para exibição no idioma PT-BR
// ================================================================
const ptBR = { locale: 'pt-BR', timeZone: 'America/Sao_Paulo' };

export function formatDate(ts, pattern = 'short') {
    const d = tsToDate(ts);
    if (!d || isNaN(d)) return '—';

    const opts = {
        short: { day: '2-digit', month: '2-digit', year: 'numeric' },
        long: { day: '2-digit', month: 'long', year: 'numeric' },
        monthYear: { month: 'long', year: 'numeric' },
        dayMonth: { day: '2-digit', month: 'short' },
        datetime: { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' },
        time: { hour: '2-digit', minute: '2-digit' },
        weekday: { weekday: 'long', day: '2-digit', month: 'long' },
    };

    return d.toLocaleDateString('pt-BR', { ...ptBR, ...(opts[pattern] || opts.short) });
}

export function formatDatetime(ts) {
    return formatDate(ts, 'datetime');
}

export function formatTime(ts) {
    const d = tsToDate(ts);
    if (!d || isNaN(d)) return '—';
    return d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', ...ptBR });
}

// ================================================================
// Data relativa (ex: "há 5 minutos", "há 3 dias")
// ================================================================
export function formatRelative(ts) {
    const d = tsToDate(ts);
    if (!d || isNaN(d)) return '—';

    const now = new Date();
    const diff = now - d; // ms
    const secs = Math.floor(diff / 1000);
    const mins = Math.floor(secs / 60);
    const hrs = Math.floor(mins / 60);
    const days = Math.floor(hrs / 24);
    const weeks = Math.floor(days / 7);
    const months = Math.floor(days / 30);

    if (secs < 60) return 'agora mesmo';
    if (mins < 60) return `há ${mins} ${mins === 1 ? 'min' : 'min'}`;
    if (hrs < 24) return `há ${hrs}  ${hrs === 1 ? 'hora' : 'horas'}`;
    if (days < 7) return `há ${days} ${days === 1 ? 'dia' : 'dias'}`;
    if (weeks < 5) return `há ${weeks} ${weeks === 1 ? 'semana' : 'semanas'}`;
    if (months < 12) return `há ${months} ${months === 1 ? 'mês' : 'meses'}`;
    return formatDate(d, 'short');
}

// ================================================================
// Obter hoje como string YYYY-MM-DD (fuso SP)
// ================================================================
export function todayString() {
    return new Date().toLocaleDateString('en-CA', ptBR); // en-CA → YYYY-MM-DD
}

// ================================================================
// Converter string YYYY-MM-DD → Date no início do dia
// ================================================================
export function parseDate(str) {
    if (!str) return null;
    const [y, m, d] = str.split('-').map(Number);
    return new Date(y, m - 1, d, 0, 0, 0);
}

// ================================================================
// Comparar datas (apenas dia)
// ================================================================
export function isSameDay(d1, d2) {
    if (!d1 || !d2) return false;
    const a = tsToDate(d1), b = tsToDate(d2);
    return a.getFullYear() === b.getFullYear() &&
        a.getMonth() === b.getMonth() &&
        a.getDate() === b.getDate();
}

export function isToday(ts) {
    return isSameDay(tsToDate(ts), new Date());
}

export function isPast(ts) {
    const d = tsToDate(ts);
    if (!d) return false;
    return d < new Date();
}

export function isFuture(ts) {
    const d = tsToDate(ts);
    if (!d) return false;
    return d > new Date();
}

export function isOverdue(ts) {
    const d = tsToDate(ts);
    if (!d) return false;
    return d < new Date() && !isToday(d);
}

// ================================================================
// Adicionar dias a uma data
// ================================================================
export function addDays(date, days) {
    const d = tsToDate(date) || new Date();
    const result = new Date(d);
    result.setDate(result.getDate() + days);
    return result;
}

// ================================================================
// Início e fim da semana atual (segunda a domingo)
// ================================================================
export function currentWeekRange() {
    const now = new Date();
    const day = now.getDay();
    const diffToMonday = day === 0 ? -6 : 1 - day;
    const start = new Date(now);
    start.setDate(now.getDate() + diffToMonday);
    start.setHours(0, 0, 0, 0);
    const end = new Date(start);
    end.setDate(start.getDate() + 6);
    end.setHours(23, 59, 59, 999);
    return { start, end };
}

// ================================================================
// Início e fim do mês atual
// ================================================================
export function currentMonthRange() {
    const now = new Date();
    const start = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
    const end = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
    return { start, end };
}

// ================================================================
// Calcular SLA deadline dado horas
// ================================================================
export function slaDeadline(createdAt, hours) {
    const d = tsToDate(createdAt) || new Date();
    return new Date(d.getTime() + hours * 3600 * 1000);
}

// ================================================================
// Calcular diferença em horas entre duas datas
// ================================================================
export function hoursDiff(from, to) {
    const a = tsToDate(from), b = tsToDate(to) || new Date();
    if (!a) return 0;
    return Math.round((b - a) / 3600000 * 10) / 10;
}

// ================================================================
// SLA status (para chamados)
// ================================================================
export function getSlaStatus(slaDeadlineTs) {
    const deadline = tsToDate(slaDeadlineTs);
    if (!deadline) return { status: 'unknown', label: '—', class: '' };
    const now = new Date();
    const remaining = deadline - now;
    if (remaining < 0) return { status: 'breach', label: 'SLA vencido', class: 'sla-breach' };
    const hrs = remaining / 3600000;
    if (hrs < 2) return { status: 'warn', label: `${Math.round(hrs * 60)} min restantes`, class: 'sla-warn' };
    return { status: 'ok', label: `${Math.round(hrs)}h restantes`, class: 'sla-ok' };
}

// ================================================================
// Calcular próxima ocorrência de rotina
// ================================================================
export function calcNextDue(frequency, specificDays = []) {
    const now = new Date();
    const today = now.getDay(); // 0=Dom

    switch (frequency) {
        case 'daily':
            return addDays(now, 1);
        case 'weekly':
            return addDays(now, 7);
        case 'biweekly':
            return addDays(now, 14);
        case 'monthly':
            return new Date(now.getFullYear(), now.getMonth() + 1, now.getDate());
        case 'specific_days': {
            if (!specificDays || specificDays.length === 0) return addDays(now, 7);
            const sorted = [...specificDays].sort((a, b) => a - b);
            // Próximo dia da semana
            for (let offset = 1; offset <= 7; offset++) {
                const nextDay = (today + offset) % 7;
                if (sorted.includes(nextDay)) return addDays(now, offset);
            }
            return addDays(now, 7);
        }
        default:
            return addDays(now, 7);
    }
}

// ================================================================
// Verificar se rotina deve ser gerada hoje
// ================================================================
export function shouldGenerateRoutine(routine) {
    if (!routine.active) return false;
    if (!routine.nextDue) return true;

    const nextDue = tsToDate(routine.nextDue);
    if (!nextDue) return true;

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    nextDue.setHours(0, 0, 0, 0);
    return nextDue <= today;
}
