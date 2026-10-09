const fs = require('fs');
let code = fs.readFileSync('public/app_v4.js', 'utf8');

// Modifica renderQuotes per aggiungere pulsanti
const renderQuotesRegex = /const row = \`\[\\s\\S\]\*?\`;/g;
let match = renderQuotesRegex.exec(code);
if (match) {
    // Actually, I can just replace the specific part inside renderQuotes.
    const oldHtml = `<td class="p-3 text-right">`;
    const newHtml = `
            <td class="p-3 text-right">
                \${isAdmin ? (q.status === 'Pagata' ? \`<button onclick="sendReceipt(\${q.id})" class="px-2 py-1 text-[10px] bg-emerald-100 text-emerald-700 hover:bg-emerald-200 rounded mr-1" title="Invia Ricevuta Email"><i class="fa-solid fa-envelope"></i> Ricevuta</button>\` : \`<button onclick="sendReminder(\${q.id})" class="px-2 py-1 text-[10px] bg-amber-100 text-amber-700 hover:bg-amber-200 rounded mr-1" title="Invia Sollecito Email"><i class="fa-solid fa-bell"></i> Sollecito</button>\`) : ''}
    `;
    code = code.replace('<td class="p-3 text-right">', newHtml);
}

const funcs = `
async function sendReceipt(quoteId) {
    if (!confirm('Vuoi generare e inviare via email la ricevuta di pagamento in formato PDF al condomino?')) return;
    try {
        showToast('Generazione ricevuta in corso...', 'info');
        const activeCondoName = state.currentUser.condomini ? state.currentUser.condomini.find(c => c.id == state.activeCondominioId)?.nome : 'Condominio';
        const res = await fetch(\`/api/quotes/\${quoteId}/send-receipt\`, {
            method: 'POST',
            headers: getAuthHeaders(),
            body: JSON.stringify({ activeCondoName })
        });
        const data = await res.json();
        if (data.success) {
            showToast('Ricevuta inviata con successo!', 'success');
        } else {
            showToast('Errore: ' + data.message, 'error');
        }
    } catch (e) {
        showToast('Errore di connessione', 'error');
    }
}

async function sendReminder(quoteId) {
    if (!confirm('Vuoi generare e inviare via email un formale sollecito di pagamento in formato PDF al condomino?')) return;
    try {
        showToast('Generazione sollecito in corso...', 'info');
        const activeCondoName = state.currentUser.condomini ? state.currentUser.condomini.find(c => c.id == state.activeCondominioId)?.nome : 'Condominio';
        const res = await fetch(\`/api/quotes/\${quoteId}/send-reminder\`, {
            method: 'POST',
            headers: getAuthHeaders(),
            body: JSON.stringify({ activeCondoName })
        });
        const data = await res.json();
        if (data.success) {
            showToast('Sollecito inviato con successo!', 'success');
        } else {
            showToast('Errore: ' + data.message, 'error');
        }
    } catch (e) {
        showToast('Errore di connessione', 'error');
    }
}
`;

code = code + '\n' + funcs;
fs.writeFileSync('public/app_v4.js', code);
