
# 🚀 Nuvvo — Plataforma Interna  
![Status](https://img.shields.io/badge/status-stable-brightgreen)
![Firebase](https://img.shields.io/badge/Firebase-Active-orange)
![License](https://img.shields.io/badge/license-Private-red)
![JS](https://img.shields.io/badge/JavaScript-ES6%2B-yellow)
![CSS](https://img.shields.io/badge/Styled%20With-CSS-blue)
![AI](https://img.shields.io/badge/AI-Groq-purple)

Documentação oficial do **Nuvvo**, plataforma interna para gestão de tarefas, tickets, comunicação, prospecção e rotinas empresariais.

---

## 📁 Estrutura do Projeto

### **1. index.html**
Arquivo base da interface do sistema, contendo rotas via hash e containers principais.

### **2. main.css**
Estilos globais, tema claro/escuro, responsividade e componentes visuais.

### **3. politica.html**
Documento oficial da Política de Privacidade com layout otimizado.

### **4. script.js**
Núcleo completo da aplicação, incluindo:
- Autenticação Firebase  
- Firestore + fallback offline  
- Chat Global com GIFs, emojis e reactions  
- Sistema de tickets  
- Prospecção empresarial  
- Rotinas e daily reports  
- Checklist avançado com IA Groq  
- Kanban completo com subcoleções  
- Avatares, presença online e notificações  
- Mural e Inbox  
- Tema claro/escuro sincronizado entre abas  

---

## 🧠 Tecnologias Utilizadas
| Tecnologia | Função |
|-----------|--------|
| **Firebase Auth** | Login empresarial |
| **Firestore** | Banco principal |
| **LocalStorage** | Modo offline |
| **Groq LLM** | Geração de checklists inteligentes |
| **Tenor API** | GIFs no chat |
| **Vanilla JS** | Frontend |
| **CSS Puro** | Estilos e tema |

---

## 🚀 Como Rodar

### 1️⃣ Baixe o projeto  
```bash
git clone https://github.com/SEU_REPOSITORIO
```

### 2️⃣ Configure o Firebase  
Abra `script.js` e substitua o bloco `firebaseConfig`.

### 3️⃣ Rode localmente  
```bash
npx serve
```
Ou abra diretamente o `index.html`.

---

## 🧩 Funcionalidades Principais

### ✔ Gestão de Tarefas (Kanban)
- GUT automático  
- Priorização dinâmica  
- Membros, responsável e solicitante  
- Chat interno por card  
- Anexos, comentários e checklist inteligente  

### ✔ Chat Global
- Tempo real  
- Reactions  
- GIFs (Tenor)  
- Indicador de digitação  
- Avatares dinâmicos  
- Pinned messages  

### ✔ Tickets
- CRUD completo  
- Severidade  
- Feedback  
- Realtime listener  

### ✔ Prospecção
- Base mensal via GitHub  
- Filtragem por CNPJ, fantasia, situação, CNAE  
- Novos no mês  
- Cache local automático  

### ✔ Rotinas & Daily Reports  
- Registro único por período  
- Intervalos customizados  
- Salvamento no Firestore  

### ✔ Mural & Notificações  
- Inbox do usuário  
- Comunicados  
- Marcar tudo como lido  
- Broadcast administrativo  

### ✔ IA Groq  
- Geração automática de checklist  
- Complemento inteligente baseado no título e descrição  

---

## 🤝 Contribuição
```bash
git checkout -b sua-feature
git commit -m "Descrição da feature"
git push origin sua-feature
```

---

## 📬 Contato  
**João Vitor Sgobin**  
📧 ssgobin.dev@gmail.com  
GitHub: https://github.com/ssgobin

---

