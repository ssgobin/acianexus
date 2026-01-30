/* ===========================
   IA Checklist (Groq + fallback)
============================ */
async function generateChecklistGroq({ title, desc, board }) {
    const fallback = generateChecklistHeuristic({ title, desc, board });
    if (!GROQ_API_KEY) return fallback;

    // 🔹 Checklist padrão por fluxo
    let checklistBase = [];

    // PENDENTE > EXECUÇÃO
    if (board === "PENDENTE") {
        checklistBase.push(
            "Li e compreendi o que deve ser entregue",
            "Tirei todas as dúvidas sobre a demanda",
            "Tenho todas as informações para iniciar a execução"
        );
    }

    // EXECUÇÃO > APROVAR
    if (board === "EXECUCAO") {
        checklistBase.push(
            "Fiz a conferência de tudo o que devo entregar",
            "Cumpri os processos e padrões estabelecidos",
            "O que estou entregando está compatível com o acordado"
        );
    }

    try {
        const prompt = `Gere uma checklist complementar e objetiva (máximo 15 itens) em português brasileiro para a tarefa abaixo.
Evite repetir os seguintes itens já incluídos:
${checklistBase.join('\n')}

Contexto:
- Board: ${board}
- Título: ${title}
- Descrição: ${desc || '(sem descrição)'}
Responda apenas com os itens da checklist, um por linha.`;

        const body = JSON.stringify({
            model: GROQ_MODEL,
            messages: [
                { role: "system", content: "Você é um assistente de gestão de tarefas que cria checklists práticas e claras." },
                { role: "user", content: prompt }
            ],
            temperature: 0.3
        });

        const url = GROQ_PROXY_URL || "https://api.groq.com/openai/v1/chat/completions";
        const resp = await fetch(url, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${GROQ_API_KEY}`
            },
            body
        });

        if (!resp.ok) throw new Error('Groq HTTP ' + resp.status);
        const data = await resp.json();
        const text = (data?.choices?.[0]?.message?.content || "").trim();
        const aiItems = text
            .split(/\n+/)
            .map(s => s.replace(/^[-*\d\.\)\s]+/, '').trim())
            .filter(Boolean);

        // 🔹 Evita erro "aiItems is not iterable"
        const safeAI = Array.isArray(aiItems) ? aiItems : [];
        const safeFallback = Array.isArray(fallback) ? fallback : [];

        // 🔹 Junta padrões + IA
        const fullChecklist = [...checklistBase, ...safeAI, ...safeFallback];
        return fullChecklist;
    } catch (e) {
        console.warn('Groq falhou, usando fallback:', e.message);
        const safeFallback = Array.isArray(fallback) ? fallback : [];
        return [...checklistBase, ...safeFallback];
    }
}


// renderização no DOM
function renderChecklist(arr = []) {
    const el = $('#c-checklist');
    if (!el) return;
    el.innerHTML = arr.map((txt, i) => `
    <div style="display:flex;align-items:center;gap:6px;margin-bottom:4px">
      <input type="checkbox" id="chk-${i}">
      <label for="chk-${i}">${txt}</label>
    </div>`).join('');
}


function generateChecklistHeuristic({ title, desc, board }) {
    const t = (title || '').toLowerCase() + ' ' + (desc || '').toLowerCase();
    const items = [];
    items.push('Definir objetivo e escopo');
    items.push('Mapear responsáveis e prazos');

    if (board === 'EVENTOS') {
        items.push('Reservar local e confirmar data');
        items.push('Orçar fornecedores e solicitar propostas');
        items.push('Planejar comunicação/divulgação');
        items.push('Criar checklist de montagem e operação');
    } else if (board === 'ROTINAS') {
        items.push('Documentar passo a passo padrão (SOP)');
        items.push('Agendar recorrência e lembretes');
    } else { // PROJETOS
        items.push('Quebrar tarefa em sub-atividades');
        items.push('Validar com partes interessadas');
    }
    if (t.includes('arte') || t.includes('peça') || t.includes('social')) {
        items.push('Checar branding (logo, tipografia, cores)');
        items.push('Revisar gramática e consistência');
    }
    if (t.includes('fornecedor') || t.includes('compra') || t.includes('orc') || t.includes('orçamento')) {
        items.push('Cotação com pelo menos 3 fornecedores');
        items.push('Aprovação de orçamento');
    }
    return items.slice(0, 10);
}
