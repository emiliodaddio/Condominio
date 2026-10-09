const fs = require('fs');
let js = fs.readFileSync('public/app.js', 'utf8');

// 1. handleCreateUser
js = js.replace(
    /const unita = document\.getElementById\('new-user-unita'\)\.value\.trim\(\);\s*const role = document\.getElementById\('new-user-role'\)\.value;/,
    `const unita = document.getElementById('new-user-unita').value.trim();
    const telefono = document.getElementById('new-user-telefono').value.trim();
    const dati_catastali = document.getElementById('new-user-catasto').value.trim();
    const role = document.getElementById('new-user-role').value;`
);

js = js.replace(
    /body: JSON\.stringify\(\{ nome, email, password, unita, role \}\)/,
    `body: JSON.stringify({ nome, email, password, unita, role, telefono, dati_catastali })`
);

// 2. renderUsersTable
js = js.replace(
    /<td class="py-3\.5 px-4 text-xs text-slate-600 font-mono">\$\{u\.email\}<\/td>\s*<td class="py-3\.5 px-4 text-xs text-slate-700">\$\{u\.unita \|\| '-'\}<\/td>/,
    `<td class="py-3.5 px-4 text-xs text-slate-600 font-mono">\${u.email}</td>
                <td class="py-3.5 px-4 text-xs text-slate-700">\${u.telefono || '-'}</td>
                <td class="py-3.5 px-4 text-xs text-slate-700">\${u.unita || '-'}</td>
                <td class="py-3.5 px-4 text-xs text-slate-700">\${u.dati_catastali || '-'}</td>`
);

// 3. editUser
js = js.replace(
    /<div>\s*<label class="block text-xs font-bold text-slate-700 mb-1">Unità \(Opzionale\)<\/label>\s*<input type="text" id="edit-unita" value="\$\{u\.unita \|\| ''\}" class="w-full border rounded-xl p-2\.5 text-sm">\s*<\/div>/,
    `<div>
                <label class="block text-xs font-bold text-slate-700 mb-1">Telefono</label>
                <input type="text" id="edit-telefono" value="\${u.telefono || ''}" class="w-full border rounded-xl p-2.5 text-sm">
            </div>
            <div>
                <label class="block text-xs font-bold text-slate-700 mb-1">Dati Catastali</label>
                <input type="text" id="edit-catasto" value="\${u.dati_catastali || ''}" class="w-full border rounded-xl p-2.5 text-sm">
            </div>
            <div>
                <label class="block text-xs font-bold text-slate-700 mb-1">Unità (Opzionale)</label>
                <input type="text" id="edit-unita" value="\${u.unita || ''}" class="w-full border rounded-xl p-2.5 text-sm">
            </div>`
);

// 4. handleEditSubmit
js = js.replace(
    /unita: document\.getElementById\('edit-unita'\)\.value,\s*role: document\.getElementById\('edit-role'\)\.value/,
    `unita: document.getElementById('edit-unita').value,
            role: document.getElementById('edit-role').value,
            telefono: document.getElementById('edit-telefono').value,
            dati_catastali: document.getElementById('edit-catasto').value`
);

// 5. Add exportUsersExcel
const exportFn = `
async function exportUsersExcel(e) {
    if (e) e.preventDefault();
    if (!state.users || state.users.length === 0) return;
    
    let csv = 'Nome,Email,Telefono,Unita,Dati Catastali,Ruolo,Data Creazione\\n';
    state.users.forEach(u => {
        const row = [
            u.nome,
            u.email,
            u.telefono || '',
            u.unita || '',
            u.dati_catastali || '',
            u.role === 'admin' ? 'Amministratore' : 'Condomino',
            formatDate(u.created_at)
        ].map(val => '"' + String(val).replace(/"/g, '""') + '"').join(',');
        csv += row + '\\n';
    });
    
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = "Elenco_Utenti.csv";
    document.body.appendChild(a);
    a.click();
    a.remove();
    showToast('Download completato', 'success');
}
`;

if (!js.includes('exportUsersExcel')) {
    js += '\n' + exportFn;
}

fs.writeFileSync('public/app.js', js);
console.log('Updated app.js for users fields and export');
