const fs = require('fs');
let js = fs.readFileSync('public/app.js', 'utf8');

const editUserNew = `async function editUser(id) {
    const u = state.users.find(x => x.id === id) || { unita: '', role: 'condomino', nome: 'Utente' };
    const fields = \`
        <div>
            <label class="block text-xs font-bold text-slate-700 mb-1">Telefono</label>
            <input type="text" id="edit-telefono" value="\${u.telefono || ''}" class="w-full border rounded-xl p-2.5 text-sm">
        </div>
        <div>
            <label class="block text-xs font-bold text-slate-700 mb-1">Dati Catastali</label>
            <input type="text" id="edit-catasto" value="\${u.dati_catastali || ''}" class="w-full border rounded-xl p-2.5 text-sm">
        </div>
        <div>
            <label class="block text-xs font-bold text-slate-700 mb-1">Unità Immobiliare / Scala</label>
            <input type="text" id="edit-unita" value="\${u.unita || ''}" class="w-full border rounded-xl p-2.5 text-sm">
        </div>
        <div>
            <label class="block text-xs font-bold text-slate-700 mb-1">Ruolo</label>
            <select id="edit-role" class="w-full border rounded-xl p-2.5 text-sm">
                <option value="condomino" \${u.role === 'condomino' ? 'selected' : ''}>Condòmino</option>
                <option value="admin" \${u.role === 'admin' ? 'selected' : ''}>Amministratore</option>
            </select>
        </div>
    \`;
    openEditModal("Modifica Utente", 'user', id, u, fields);
}`;

js = js.replace(/async function editUser\(id\) \{[\s\S]*?openEditModal\("Modifica Utente", 'user', id, u, fields\);\s*\}/, editUserNew);

fs.writeFileSync('public/app.js', js);
console.log('Fixed editUser');
