const fs = require('fs');
let code = fs.readFileSync('public/app.js', 'utf8');

const replacement = `
async function loadGiornale() {
    const container = document.getElementById('giornale-container');
    container.innerHTML = '<div class="text-center py-4 text-slate-500"><i class="fa-solid fa-spinner fa-spin mr-2"></i>Caricamento...</div>';
    try {
        const res = await fetch('/api/journal', { headers: getAuthHeaders() });
        const data = await res.json();
        if (data.success) {
            state.journal = data.data; // Store in state for editing
            
            let html = '<table class="w-full text-left text-sm"><thead class="bg-slate-50 border-b"><tr><th class="p-3">Data</th><th class="p-3">Descrizione</th><th class="p-3 text-right">Dare</th><th class="p-3 text-right">Avere</th><th class="p-3 text-center">Azioni</th></tr></thead><tbody class="divide-y divide-slate-100">';
            
            if (data.data.length === 0) {
                html += '<tr><td colspan="5" class="p-4 text-center text-slate-500">Nessuna registrazione presente.</td></tr>';
            } else {
                html += data.data.map(j => \`
                    <tr class="hover:bg-slate-50 transition-colors">
                        <td class="p-3 whitespace-nowrap">\${formatDate(j.data)}</td>
                        <td class="p-3 text-slate-800">\${j.descrizione}</td>
                        <td class="p-3 text-right font-medium \${j.dare > 0 ? 'text-emerald-600' : 'text-slate-400'}">\${formatCurrency(j.dare)}</td>
                        <td class="p-3 text-right font-medium \${j.avere > 0 ? 'text-rose-600' : 'text-slate-400'}">\${formatCurrency(j.avere)}</td>
                        <td class="p-3 text-center whitespace-nowrap">
                            <button onclick="editJournalEntry(\${j.id})" class="p-1.5 text-amber-500 hover:bg-amber-50 rounded transition-colors" title="Modifica"><i class="fa-solid fa-pen"></i></button>
                            <button onclick="deleteJournalEntry(\${j.id})" class="p-1.5 text-rose-500 hover:bg-rose-50 rounded transition-colors ml-1" title="Elimina"><i class="fa-solid fa-trash"></i></button>
                        </td>
                    </tr>
                \`).join('');
            }
            
            html += '</tbody></table>';
            container.innerHTML = html;
        }
    } catch(e) { 
        container.innerHTML = '<div class="text-rose-500 p-4">Errore caricamento giornale</div>'; 
    }
}

async function editJournalEntry(id) {
    const entry = state.journal.find(x => x.id === id);
    if (!entry) return;
    
    currentEditType = 'journal';
    currentEditId = id;
    
    document.getElementById('edit-modal-title').innerHTML = '<i class="fa-solid fa-pen text-amber-500 mr-2"></i> Modifica Registrazione';
    
    const fields = \`
        <div class="grid grid-cols-2 gap-3">
            <div class="col-span-2">
                <label class="block text-xs font-bold text-slate-700 mb-1">Descrizione</label>
                <input type="text" id="edit-journal-desc" value="\${entry.descrizione}" class="w-full border rounded-xl p-2.5 text-sm" required>
            </div>
            <div>
                <label class="block text-xs font-bold text-slate-700 mb-1">Data</label>
                <input type="date" id="edit-journal-data" value="\${entry.data}" class="w-full border rounded-xl p-2.5 text-sm" required>
            </div>
            <div>
                <label class="block text-xs font-bold text-slate-700 mb-1">Conto</label>
                <input type="text" id="edit-journal-conto" value="\${entry.conto || ''}" class="w-full border rounded-xl p-2.5 text-sm">
            </div>
            <div>
                <label class="block text-xs font-bold text-slate-700 mb-1">Dare (€)</label>
                <input type="number" step="0.01" id="edit-journal-dare" value="\${entry.dare}" class="w-full border rounded-xl p-2.5 text-sm text-emerald-600 font-bold" required>
            </div>
            <div>
                <label class="block text-xs font-bold text-slate-700 mb-1">Avere (€)</label>
                <input type="number" step="0.01" id="edit-journal-avere" value="\${entry.avere}" class="w-full border rounded-xl p-2.5 text-sm text-rose-600 font-bold" required>
            </div>
        </div>
    \`;
    
    document.getElementById('edit-modal-fields').innerHTML = fields;
    document.getElementById('modal-edit-generic').classList.remove('hidden');
}

async function deleteJournalEntry(id) {
    if (!confirm('Sei sicuro di voler eliminare questa registrazione dal giornale?')) return;
    try {
        const res = await fetch('/api/journal/' + id, {
            method: 'DELETE',
            headers: getAuthHeaders()
        });
        if (res.ok) {
            showToast('Registrazione eliminata', 'success');
            loadGiornale();
        } else {
            showToast('Errore durante leliminazione', 'error');
        }
    } catch(e) { showToast('Errore di connessione', 'error'); }
}
`;

// we also need to handle the submit for journal in handleEditSubmit
// Let's first replace loadGiornale completely
code = code.replace(/async function loadGiornale\(\) \{[\s\S]*?async function addJournalEntry\(\)/, replacement + '\n\nasync function addJournalEntry()');

// Then inject the logic into handleEditSubmit
const editSubmitLogic = `
        } else if (currentEditType === 'journal') {
            const dareStr = document.getElementById('edit-journal-dare').value;
            const avereStr = document.getElementById('edit-journal-avere').value;
            body = {
                descrizione: document.getElementById('edit-journal-desc').value,
                data: document.getElementById('edit-journal-data').value,
                conto: document.getElementById('edit-journal-conto').value,
                dare: parseFloat(dareStr || 0),
                avere: parseFloat(avereStr || 0),
                tipo: 'Generica',
                numero: '1'
            };
            url = '/api/journal/' + currentEditId;
`;

code = code.replace(/\} else if \(currentEditType === 'supplier'\) \{/, editSubmitLogic + "\n        } else if (currentEditType === 'supplier') {");

// We also need to add loadGiornale() to the success callback
code = code.replace(/if \(currentEditType === 'user'\) loadUsersList\(\);\s*else loadAccountingData\(\);/g, 
    "if (currentEditType === 'user') loadUsersList();\n            else if (currentEditType === 'journal') loadGiornale();\n            else loadAccountingData();"
);

fs.writeFileSync('public/app.js', code);
console.log("Updated frontend journal edit functionality");
