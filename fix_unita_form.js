const fs = require('fs');

// 1. Modifica index.html
let html = fs.readFileSync('public/index.html', 'utf8');

// Sostituisci l'input numerico con una select
html = html.replace(
    '<input type="number" id="unita-user-id" placeholder="ID Utente (es. 3 per Mario Rossi)" class="w-full p-2 border rounded-xl">',
    '<select id="unita-user-id" class="w-full p-2 border rounded-xl"><option value="">-- Nessun Proprietario (Sfitto/Esterno) --</option></select>'
);

fs.writeFileSync('public/index.html', html);

// 2. Modifica app.js
let app = fs.readFileSync('public/app.js', 'utf8');

// Sostituiamo il pezzo della tabella e della modale per usare un array globale ed evitare problemi di escape su JSON.stringify
app = app.replace(
    /async function loadUnita\(\) \{[\s\S]*?function closeUnitaModal/m,
    `async function loadUnita() {
    const cId = localStorage.getItem('active_condominio_id');
    if(!cId) return;
    
    try {
        const res = await fetch('/api/unita', { headers: getAuthHeaders() });
        const data = await res.json();
        
        const tbody = document.getElementById('unita-list');
        if(!tbody) return;
        
        if (res.ok && data.success) {
            state.unitaList = data.data; // Salviamo nello state
            tbody.innerHTML = data.data.map(u => \`
                <tr class="hover:bg-slate-50 transition-colors">
                    <td class="px-6 py-4">
                        <div class="font-bold text-slate-800">\${u.identificativo}</div>
                        <div class="text-[11px] text-slate-400">Sc: \${u.scala || '-'} | P: \${u.piano || '-'}</div>
                    </td>
                    <td class="px-6 py-4"><span class="px-2 py-1 bg-slate-100 rounded-lg text-xs font-semibold">\${u.tipo}</span></td>
                    <td class="px-6 py-4">
                        <div class="font-bold text-slate-700">\${u.condomino_nome || 'Nessuno'}</div>
                        \${u.condomino_email ? \`<div class="text-[11px] text-slate-400">\${u.condomino_email}</div>\` : ''}
                    </td>
                    <td class="px-6 py-4 font-mono">\${u.millesimi_proprieta.toFixed(2)}</td>
                    <td class="px-6 py-4 font-mono">\${u.millesimi_scale.toFixed(2)}</td>
                    <td class="px-6 py-4 font-mono">\${u.millesimi_ascensore.toFixed(2)}</td>
                    <td class="px-6 py-4 text-right admin-only">
                        <button onclick="openUnitaModal(\${u.id})" class="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors">
                            <i class="fa-solid fa-pen"></i>
                        </button>
                    </td>
                </tr>
            \`).join('');
        }
        applyRoleVisibility();
    } catch(e) {
        console.error(e);
    }
}

async function openUnitaModal(uId = null) {
    let u = null;
    if (uId && state.unitaList) {
        u = state.unitaList.find(x => x.id === uId);
    }

    // Carica gli utenti per la select
    try {
        const res = await fetch('/api/users', { headers: getAuthHeaders() });
        const data = await res.json();
        if (data.success) {
            const select = document.getElementById('unita-user-id');
            select.innerHTML = '<option value="">-- Nessun Proprietario (Sfitto/Esterno) --</option>' + 
                data.data.map(user => \`<option value="\${user.id}">\${user.nome} (\${user.email})</option>\`).join('');
        }
    } catch(e) { console.error('Errore fetch users', e); }

    document.getElementById('unita-modal-title').textContent = u ? 'Modifica Unità' : 'Nuova Unità';
    document.getElementById('unita-id').value = u ? u.id : '';
    document.getElementById('unita-identificativo').value = u ? u.identificativo : '';
    document.getElementById('unita-tipo').value = u ? u.tipo : 'Appartamento';
    document.getElementById('unita-scala').value = u ? (u.scala || '') : '';
    document.getElementById('unita-piano').value = u ? (u.piano || '') : '';
    document.getElementById('unita-mill-prop').value = u ? u.millesimi_proprieta : '0';
    document.getElementById('unita-mill-scale').value = u ? u.millesimi_scale : '0';
    document.getElementById('unita-mill-asc').value = u ? u.millesimi_ascensore : '0';
    document.getElementById('unita-user-id').value = u ? (u.user_id || '') : '';
    
    document.getElementById('unita-modal').classList.remove('hidden');
}

function closeUnitaModal`
);

fs.writeFileSync('public/app.js', app);
console.log("Fixes applied successfully.");
