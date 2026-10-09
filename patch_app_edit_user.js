const fs = require('fs');
let code = fs.readFileSync('public/app_v4.js', 'utf8');

const targetEditUser = `async function editUser(id) {
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
            <label class="block text-xs font-bold text-slate-700 mb-1">unita-mobiliare / Scala</label>
            <input type="text" id="edit-unita" value="\${u.unita || ''}" class="w-full border rounded-xl p-2.5 text-sm">
        </div>
        <div>
            <label class="block text-xs font-bold text-slate-700 mb-1">Ruolo</label>
            <select id="edit-role" class="w-full border rounded-xl p-2.5 text-sm">
                <option value="condomino" \${u.role === 'condomino' ? 'selected' : ''}>condomino</option>
                <option value="admin" \${u.role === 'admin' ? 'selected' : ''}>Amministratore</option>
            </select>
        </div>
    \`;
    openEditModal("Modifica Utente", 'user', id, u, fields);
}`;

const replacementEditUser = `async function editUser(id) {
    const u = state.users.find(x => x.id === id) || { unita: '', role: 'condomino', nome: 'Utente' };
    
    // Parse dati_catastali if possible
    let sez='', fg='', part='', sub='';
    if (u.dati_catastali) {
        const parts = u.dati_catastali.split(', ');
        parts.forEach(p => {
            if (p.startsWith('Sez.')) sez = p.replace('Sez. ', '').trim();
            if (p.startsWith('Fg.')) fg = p.replace('Fg. ', '').trim();
            if (p.startsWith('Part.')) part = p.replace('Part. ', '').trim();
            if (p.startsWith('Sub.')) sub = p.replace('Sub. ', '').trim();
        });
    }

    const fields = \`
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
                <label class="block text-xs font-bold text-slate-700 mb-1">Nome e Cognome</label>
                <input type="text" id="edit-nome" value="\${u.nome || ''}" class="w-full border rounded-xl p-2.5 text-sm">
            </div>
            <div>
                <label class="block text-xs font-bold text-slate-700 mb-1">Email</label>
                <input type="email" id="edit-email" value="\${u.email || ''}" class="w-full border rounded-xl p-2.5 text-sm">
            </div>
            <div>
                <label class="block text-xs font-bold text-slate-700 mb-1">Nuova Password (lascia vuoto per non cambiare)</label>
                <div class="relative">
                    <input type="password" id="edit-password" placeholder="Min 8 car, 1 maiusc, 1 num, 1 spec" class="w-full border rounded-xl p-2.5 text-sm pr-10">
                    <button type="button" onclick="togglePasswordVisibility('edit-password', 'eye-edit-pwd')" class="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-400 hover:text-slate-600">
                        <i id="eye-edit-pwd" class="fa-solid fa-eye"></i>
                    </button>
                </div>
            </div>
            <div>
                <label class="block text-xs font-bold text-slate-700 mb-1">Telefono</label>
                <input type="text" id="edit-telefono" value="\${u.telefono || ''}" class="w-full border rounded-xl p-2.5 text-sm">
            </div>
            <div>
                <label class="block text-xs font-bold text-slate-700 mb-1">Unità / Scala</label>
                <input type="text" id="edit-unita" value="\${u.unita || ''}" class="w-full border rounded-xl p-2.5 text-sm">
            </div>
            <div>
                <label class="block text-xs font-bold text-slate-700 mb-1">Ruolo</label>
                <select id="edit-role" class="w-full border rounded-xl p-2.5 text-sm">
                    <option value="condomino" \${u.role === 'condomino' ? 'selected' : ''}>Condòmino</option>
                    <option value="admin" \${u.role === 'admin' ? 'selected' : ''}>Amministratore</option>
                </select>
            </div>
            <div class="col-span-full">
                <label class="block text-xs font-bold text-slate-700 mb-1">Dati Catastali (Sez, Fg, Part, Sub)</label>
                <div class="grid grid-cols-4 gap-2">
                    <input type="text" id="edit-catasto-sez" placeholder="Sez." value="\${sez}" class="w-full px-2 py-2 text-xs rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-500">
                    <input type="text" id="edit-catasto-fg" placeholder="Fg." value="\${fg}" class="w-full px-2 py-2 text-xs rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-500">
                    <input type="text" id="edit-catasto-part" placeholder="Part." value="\${part}" class="w-full px-2 py-2 text-xs rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-500">
                    <input type="text" id="edit-catasto-sub" placeholder="Sub." value="\${sub}" class="w-full px-2 py-2 text-xs rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-500">
                </div>
            </div>
        </div>
    \`;
    openEditModal("Modifica Utente", 'user', id, u, fields);
}`;

let newCode = code.replace(/async function editUser\(id\) \{[\s\S]*?openEditModal\("Modifica Utente", 'user', id, u, fields\);\s*\}/, replacementEditUser);

const targetPayloadUser = `} else if (currentEditType === 'user') {
        endpoint = '/api/users/' + currentEditId;
        payload = {
            ...currentEditItem,
            unita: document.getElementById('edit-unita').value,
            role: document.getElementById('edit-role').value,
            telefono: document.getElementById('edit-telefono').value,
            dati_catastali: document.getElementById('edit-catasto').value
        };
    }`;

const replacementPayloadUser = `} else if (currentEditType === 'user') {
        endpoint = '/api/users/' + currentEditId;
        const eSez = (document.getElementById('edit-catasto-sez') ? document.getElementById('edit-catasto-sez').value.trim() : '');
        const eFg = (document.getElementById('edit-catasto-fg') ? document.getElementById('edit-catasto-fg').value.trim() : '');
        const ePart = (document.getElementById('edit-catasto-part') ? document.getElementById('edit-catasto-part').value.trim() : '');
        const eSub = (document.getElementById('edit-catasto-sub') ? document.getElementById('edit-catasto-sub').value.trim() : '');
        let eDcArr = [];
        if(eSez) eDcArr.push(\`Sez. \${eSez}\`);
        if(eFg) eDcArr.push(\`Fg. \${eFg}\`);
        if(ePart) eDcArr.push(\`Part. \${ePart}\`);
        if(eSub) eDcArr.push(\`Sub. \${eSub}\`);
        
        payload = {
            ...currentEditItem,
            nome: document.getElementById('edit-nome').value,
            email: document.getElementById('edit-email').value,
            password: document.getElementById('edit-password').value,
            unita: document.getElementById('edit-unita').value,
            role: document.getElementById('edit-role').value,
            telefono: document.getElementById('edit-telefono').value,
            dati_catastali: eDcArr.join(', ')
        };
    }`;

newCode = newCode.replace(targetPayloadUser, replacementPayloadUser);

fs.writeFileSync('public/app_v4.js', newCode);
console.log('app_v4.js updated for edit user');
