const fs = require('fs');
const path = require('path');

const appFile = path.join(__dirname, 'public', 'app.js');
let content = fs.readFileSync(appFile, 'utf8');

// 1. Add Edit button to Quotes Table
content = content.replace(
    /const payAction = isPaid[\s\S]*?Segna Pagato<\/button>\`;/,
    `let payAction = isPaid
                ? '<span class="text-xs text-slate-400"><i class="fa-solid fa-check mr-1 text-emerald-500"></i> Saldata</span>'
                : \`<button onclick="markQuoteAsPaid(\${q.id})" class="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold shadow-2xs">Segna Pagato</button>\`;
            payAction += \` <button onclick="editQuote(\${q.id})" class="ml-1 px-2.5 py-1 bg-amber-500 hover:bg-amber-600 text-white rounded-lg text-xs font-bold shadow-2xs no-print"><i class="fa-solid fa-pen"></i></button>\`;`
);

// 2. Add Edit button to Suppliers Table
content = content.replace(
    /const badge = isPaid[\s\S]*?Da Liquidare<\/span>'\;/,
    `const badge = isPaid 
            ? '<span class="px-2.5 py-0.5 rounded-full text-xs font-bold bg-blue-50 text-blue-700 border border-blue-200">Pagato</span>'
            : '<span class="px-2.5 py-0.5 rounded-full text-xs font-bold bg-rose-50 text-rose-700 border border-rose-200">Da Liquidare</span>';
        const editAction = isAdmin ? \` <button onclick="editSupplier(\${s.id})" class="ml-2 text-amber-500 hover:text-amber-700 no-print"><i class="fa-solid fa-pen"></i></button>\` : '';
    `
);
content = content.replace(
    /<td class="py-3.5 px-4 text-center">\${badge}<\/td>/,
    '<td class="py-3.5 px-4 text-center">${badge}${editAction}</td>'
);

// 3. Add Edit/Delete button to Users Table
content = content.replace(
    /<td class="py-3.5 px-4 text-xs text-slate-400">\${formatDate\(u.created_at\)}<\/td>/,
    `<td class="py-3.5 px-4 text-xs text-slate-400">\${formatDate(u.created_at)}
        \${isAdmin ? \`<button onclick="editUser(\${u.id})" class="ml-2 text-amber-500 no-print"><i class="fa-solid fa-pen"></i></button> <button onclick="deleteUser(\${u.id})" class="ml-1 text-rose-500 no-print"><i class="fa-solid fa-trash"></i></button>\` : ''}
    </td>`
);

// Append the functions
const editFunctions = `
// ============================================================================
// V2.0 FUNZIONI DI MODIFICA RAPIDA
// ============================================================================

async function editQuote(id) {
    const q = state.quotes.find(x => x.id === id);
    if (!q) return;
    const amount = prompt("Nuovo importo:", q.amount);
    const date = prompt("Nuova scadenza (YYYY-MM-DD):", q.due_date);
    if (amount && date) {
        try {
            await fetch('/api/quotes/'+id, {
                method: 'PUT',
                headers: getAuthHeaders(),
                body: JSON.stringify({...q, amount: parseFloat(amount), due_date: date})
            });
            loadAccountingData();
        } catch(e) {}
    }
}

async function editSupplier(id) {
    const s = state.suppliers.find(x => x.id === id);
    if (!s) return;
    const amount = prompt("Nuovo importo:", s.amount);
    const status = prompt("Nuovo stato (Pagato, Da liquidare, In elaborazione):", s.status);
    if (amount && status) {
        try {
            await fetch('/api/supplier-payments/'+id, {
                method: 'PUT',
                headers: getAuthHeaders(),
                body: JSON.stringify({...s, amount: parseFloat(amount), status})
            });
            loadAccountingData();
        } catch(e) {}
    }
}

async function editUser(id) {
    const u = state.users.find(x => x.id === id);
    if (!u) return;
    const unita = prompt("Nuova unità immobiliare:", u.unita);
    const role = prompt("Ruolo (admin, condomino):", u.role);
    if (unita !== null && role) {
        try {
            await fetch('/api/users/'+id, {
                method: 'PUT',
                headers: getAuthHeaders(),
                body: JSON.stringify({...u, unita, role})
            });
            loadUsersList();
        } catch(e) {}
    }
}

async function deleteUser(id) {
    if (!confirm("Sicuro di voler eliminare questo utente?")) return;
    try {
        await fetch('/api/users/'+id, {
            method: 'DELETE',
            headers: getAuthHeaders()
        });
        loadUsersList();
    } catch(e) {}
}
`;

content += '\n' + editFunctions;

fs.writeFileSync(appFile, content, 'utf8');
console.log('Edit buttons added to tables.');
