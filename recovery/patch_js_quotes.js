const fs = require('fs');
let app = fs.readFileSync('public/app_v4.js', 'utf8');

const populateQuoteMatch = `function populateQuoteUsersSelect() {
    const select = document.getElementById('quote-user-id');
    if (!select) return;

    const CondominiOnly = state.users.filter(u => u.role === 'condomino');
    select.innerHTML = CondominiOnly.map(u => \`
        <option value="\${u.id}">\${u.nome} (\${u.unita || 'Nessuna Unita'})</option>
    \`).join('');
}`;

const populateQuoteReplace = `function populateQuoteUsersSelect() {
    const selPersona = document.getElementById('quote-persona-id');
    const selUnita = document.getElementById('quote-unita-id');
    
    if (selPersona && state.anagraficaPersone) {
        selPersona.innerHTML = '<option value="">-- Seleziona Intestatario --</option>' + 
            state.anagraficaPersone.map(p => \`<option value="\${p.id}">\${p.cognome} \${p.nome}</option>\`).join('');
    }
    
    if (selUnita && state.unitaList) {
        selUnita.innerHTML = '<option value="">-- Nessuna Unità Specifica --</option>' + 
            state.unitaList.map(u => \`<option value="\${u.id}">\${u.identificativo} (\${u.tipo})</option>\`).join('');
    }
}`;

app = app.replace(populateQuoteMatch, populateQuoteReplace);

const handleQuoteMatch = `async function handleCreateQuote(event) {
    event.preventDefault();
    const payload = {
        user_id: document.getElementById('quote-user-id').value,
        type: document.getElementById('quote-type').value,
        title: document.getElementById('quote-title').value.trim(),
        amount: document.getElementById('quote-amount').value,
        due_date: document.getElementById('quote-due-date').value
    };`;

const handleQuoteReplace = `async function handleCreateQuote(event) {
    event.preventDefault();
    const payload = {
        persona_id: document.getElementById('quote-persona-id').value,
        unita_id: document.getElementById('quote-unita-id').value || null,
        type: document.getElementById('quote-type').value,
        title: document.getElementById('quote-title').value.trim(),
        amount: document.getElementById('quote-amount').value,
        due_date: document.getElementById('quote-due-date').value
    };`;

app = app.replace(handleQuoteMatch, handleQuoteReplace);

// Update table renders
app = app.replace('<div class="font-bold text-slate-800">${q.condomino_nome || \'Sconosciuto\'}</div>', '<div class="font-bold text-slate-800">${q.persona_cognome ? q.persona_cognome + \' \' + q.persona_nome : \'Sconosciuto\'}</div>');
app = app.replace('<div class="text-[11px] text-slate-400">Unità: ${q.unita || \'-\'}</div>', '<div class="text-[11px] text-slate-400">Unità: ${q.unita || \'-\'}</div>');

app = app.replace('<div class="font-bold text-slate-800">${r.condomino_nome || \'Sconosciuto\'}</div>', '<div class="font-bold text-slate-800">${r.persona_cognome ? r.persona_cognome + \' \' + r.persona_nome : \'Sconosciuto\'}</div>');

fs.writeFileSync('public/app_v4.js', app);
console.log('Updated app_v4.js for quotes');
