const fs = require('fs');
let app = fs.readFileSync('public/app_v4.js', 'utf8');

const jsCode = `
// ==========================================
// RUBRICA PERSONE LOGICA
// ==========================================
async function loadRubrica() {
    try {
        const res = await fetch('/api/anagrafica-persone', { headers: getAuthHeaders() });
        const data = await res.json();
        if (data.success) {
            state.anagraficaPersone = data.data;
            renderRubricaTable();
        }
    } catch(e) { console.error('Errore loadRubrica', e); }
}

function renderRubricaTable() {
    const tbody = document.getElementById('persone-table-body');
    if (!tbody) return;
    if (!state.anagraficaPersone || state.anagraficaPersone.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" class="py-8 text-center text-slate-400">Nessuna persona in rubrica.</td></tr>';
        return;
    }
    
    tbody.innerHTML = state.anagraficaPersone.map(p => \`
        <tr class="hover:bg-slate-50 transition-colors">
            <td class="py-3.5 px-4 font-bold text-slate-900">\${p.cognome} \${p.nome}</td>
            <td class="py-3.5 px-4 font-mono text-xs text-slate-600">\${p.codice_fiscale || '-'}</td>
            <td class="py-3.5 px-4 text-xs text-slate-500">
                \${p.telefono ? \`<i class="fa-solid fa-phone mr-1"></i> \${p.telefono}<br>\` : ''}
                \${p.email ? \`<i class="fa-solid fa-envelope mr-1"></i> \${p.email}\` : ''}
            </td>
            <td class="py-3.5 px-4"><span class="px-2 py-0.5 rounded text-xs bg-slate-100">\${p.ruolo_default}</span></td>
            <td class="py-3.5 px-4 text-right">
                <button onclick="editPersona(\${p.id})" class="text-amber-500 hover:text-amber-700 ml-2"><i class="fa-solid fa-pen"></i></button>
            </td>
        </tr>
    \`).join('');
}

function openPersonaModal(id = null) {
    let p = null;
    if (id && state.anagraficaPersone) p = state.anagraficaPersone.find(x => x.id === id);
    
    document.getElementById('persona-modal-title').textContent = p ? 'Modifica Persona' : 'Nuova Persona';
    document.getElementById('persona-id').value = p ? p.id : '';
    document.getElementById('persona-nome').value = p ? p.nome : '';
    document.getElementById('persona-cognome').value = p ? p.cognome : '';
    document.getElementById('persona-cf').value = p ? (p.codice_fiscale || '') : '';
    document.getElementById('persona-tel').value = p ? (p.telefono || '') : '';
    document.getElementById('persona-email').value = p ? (p.email || '') : '';
    document.getElementById('persona-ruolo').value = p ? (p.ruolo_default || 'Proprietario') : 'Proprietario';
    
    document.getElementById('modal-persona').classList.remove('hidden');
}

function closePersonaModal() {
    document.getElementById('modal-persona').classList.add('hidden');
}

async function savePersona(e) {
    e.preventDefault();
    const id = document.getElementById('persona-id').value;
    const body = {
        nome: document.getElementById('persona-nome').value,
        cognome: document.getElementById('persona-cognome').value,
        codice_fiscale: document.getElementById('persona-cf').value,
        telefono: document.getElementById('persona-tel').value,
        email: document.getElementById('persona-email').value,
        ruolo_default: document.getElementById('persona-ruolo').value
    };

    const method = id ? 'PUT' : 'POST';
    const url = id ? '/api/anagrafica-persone/' + id : '/api/anagrafica-persone';

    try {
        const res = await fetch(url, {
            method, headers: getAuthHeaders(), body: JSON.stringify(body)
        });
        if (res.ok) {
            closePersonaModal();
            loadRubrica();
        } else { alert("Errore"); }
    } catch(err) { console.error(err); }
}
`;

if (!app.includes('loadRubrica()')) {
    app += '\n' + jsCode;
}

// Add loadRubrica to loadAnagrafica
app = app.replace('function loadUsersList() {', 'function loadUsersList() {\n    loadRubrica();\n');
app = app.replace('else if (tabId === \'anagrafica\' && state.currentUser.role === \'admin\') { loadAnagrafica(); loadUsersList(); }', 'else if (tabId === \'anagrafica\' && state.currentUser.role === \'admin\') { loadAnagrafica(); loadUsersList(); loadRubrica(); }');

fs.writeFileSync('public/app_v4.js', app);
console.log('Added Rubrica JS');
