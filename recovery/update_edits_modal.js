const fs = require('fs');
const path = require('path');

const indexFile = path.join(__dirname, 'public', 'index.html');
let htmlContent = fs.readFileSync(indexFile, 'utf8');

const editModalHtml = `
    <!-- Modale Modifica Interattiva -->
    <div id="modal-edit-generic" class="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 hidden flex items-center justify-center p-4 no-print">
        <div class="bg-white rounded-3xl shadow-2xl w-full max-w-md overflow-hidden flex flex-col max-h-[90vh]">
            <div class="px-6 py-5 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
                <h3 class="text-lg font-extrabold text-slate-800" id="edit-modal-title">Modifica Record</h3>
                <button onclick="closeEditModal()" class="text-slate-400 hover:text-rose-500 transition-colors">
                    <i class="fa-solid fa-xmark text-xl"></i>
                </button>
            </div>
            <div class="p-6 overflow-y-auto">
                <form id="form-edit-generic" onsubmit="handleEditSubmit(event)" class="space-y-4">
                    <div id="edit-modal-fields" class="space-y-4"></div>
                    <div class="pt-4 border-t border-slate-100 flex justify-end gap-3">
                        <button type="button" onclick="closeEditModal()" class="px-5 py-2.5 text-slate-600 hover:bg-slate-100 font-bold text-sm rounded-xl transition-colors">Annulla</button>
                        <button type="submit" class="px-5 py-2.5 bg-amber-500 hover:bg-amber-600 text-white font-bold text-sm rounded-xl shadow-md transition-all flex items-center gap-2">
                            <i class="fa-solid fa-save"></i> Salva Modifiche
                        </button>
                    </div>
                </form>
            </div>
        </div>
    </div>
`;

if (!htmlContent.includes('id="modal-edit-generic"')) {
    htmlContent = htmlContent.replace('<!-- Toast Container -->', editModalHtml + '\n    <!-- Toast Container -->');
    fs.writeFileSync(indexFile, htmlContent, 'utf8');
}

const appFile = path.join(__dirname, 'public', 'app.js');
let appContent = fs.readFileSync(appFile, 'utf8');

const newEditFunctions = `
// ============================================================================
// V2.0 MODALI INTERATTIVI DI MODIFICA
// ============================================================================
let currentEditType = '';
let currentEditId = null;
let currentEditItem = null;

function openEditModal(title, type, id, item, fieldsHtml) {
    currentEditType = type;
    currentEditId = id;
    currentEditItem = item;
    document.getElementById('edit-modal-title').innerHTML = '<i class="fa-solid fa-pen text-amber-500 mr-2"></i> ' + title;
    document.getElementById('edit-modal-fields').innerHTML = fieldsHtml;
    document.getElementById('modal-edit-generic').classList.remove('hidden');
}

function closeEditModal() {
    document.getElementById('modal-edit-generic').classList.add('hidden');
    currentEditType = '';
    currentEditId = null;
}

async function handleEditSubmit(e) {
    e.preventDefault();
    let endpoint = '';
    let payload = {};

    if (currentEditType === 'quote') {
        endpoint = '/api/quotes/' + currentEditId;
        payload = {
            ...currentEditItem,
            amount: parseFloat(document.getElementById('edit-amount').value),
            due_date: document.getElementById('edit-date').value,
            status: document.getElementById('edit-status').value
        };
    } else if (currentEditType === 'supplier') {
        endpoint = '/api/supplier-payments/' + currentEditId;
        payload = {
            ...currentEditItem,
            amount: parseFloat(document.getElementById('edit-amount').value),
            status: document.getElementById('edit-status').value
        };
    } else if (currentEditType === 'user') {
        endpoint = '/api/users/' + currentEditId;
        payload = {
            ...currentEditItem,
            unita: document.getElementById('edit-unita').value,
            role: document.getElementById('edit-role').value
        };
    }

    try {
        const res = await fetch(endpoint, {
            method: 'PUT',
            headers: getAuthHeaders(),
            body: JSON.stringify(payload)
        });
        const data = await res.json();
        if (res.ok && data.success) {
            showToast('Modifica salvata con successo!', 'success');
            closeEditModal();
            if (currentEditType === 'user') loadUsersList();
            else loadAccountingData();
        } else {
            showToast('Errore durante la modifica.', 'error');
        }
    } catch(err) {
        showToast('Errore di connessione', 'error');
    }
}

async function editQuote(id) {
    const q = state.quotes.find(x => x.id === id) || { amount: 0, due_date: '', status: 'In sospeso', title: 'Quota' };
    const fields = \`
        <div>
            <label class="block text-xs font-bold text-slate-700 mb-1">Importo (€)</label>
            <input type="number" step="0.01" id="edit-amount" value="\${q.amount}" class="w-full border rounded-xl p-2.5 text-sm" required>
        </div>
        <div>
            <label class="block text-xs font-bold text-slate-700 mb-1">Scadenza</label>
            <input type="date" id="edit-date" value="\${q.due_date}" class="w-full border rounded-xl p-2.5 text-sm" required>
        </div>
        <div>
            <label class="block text-xs font-bold text-slate-700 mb-1">Stato</label>
            <select id="edit-status" class="w-full border rounded-xl p-2.5 text-sm">
                <option value="In sospeso" \${q.status === 'In sospeso' ? 'selected' : ''}>In sospeso</option>
                <option value="Pagato" \${q.status === 'Pagato' ? 'selected' : ''}>Pagato</option>
            </select>
        </div>
    \`;
    openEditModal("Modifica Quota", 'quote', id, q, fields);
}

async function editSupplier(id) {
    const s = state.suppliers.find(x => x.id === id) || { amount: 0, status: 'Da liquidare', supplier_name: 'Fornitore' };
    const fields = \`
        <div>
            <label class="block text-xs font-bold text-slate-700 mb-1">Importo (€)</label>
            <input type="number" step="0.01" id="edit-amount" value="\${s.amount}" class="w-full border rounded-xl p-2.5 text-sm" required>
        </div>
        <div>
            <label class="block text-xs font-bold text-slate-700 mb-1">Stato Pagamento</label>
            <select id="edit-status" class="w-full border rounded-xl p-2.5 text-sm">
                <option value="Da liquidare" \${s.status === 'Da liquidare' ? 'selected' : ''}>Da liquidare</option>
                <option value="In elaborazione" \${s.status === 'In elaborazione' ? 'selected' : ''}>In elaborazione</option>
                <option value="Pagato" \${s.status === 'Pagato' ? 'selected' : ''}>Pagato</option>
            </select>
        </div>
    \`;
    openEditModal("Modifica Fattura Fornitore", 'supplier', id, s, fields);
}

async function editUser(id) {
    const u = state.users.find(x => x.id === id) || { unita: '', role: 'condomino', nome: 'Utente' };
    const fields = \`
        <div>
            <label class="block text-xs font-bold text-slate-700 mb-1">Unità Immobiliare</label>
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
}
`;

// Replace the old quick edit functions with the new modal-based ones
const oldFuncRegex = /\/\/ ============================================================================\n\/\/ V2\.0 FUNZIONI DI MODIFICA RAPIDA\n\/\/ ============================================================================\n[\s\S]*?(?=async function deleteUser)/;

if (appContent.match(oldFuncRegex)) {
    appContent = appContent.replace(oldFuncRegex, newEditFunctions);
    fs.writeFileSync(appFile, appContent, 'utf8');
} else {
    console.log("Regex non trovata. Provo a sostituire l'intero blocco.");
    // if regex fails we can just append and it will override the old functions because JS hoists or re-declares them (if they were let, but they are async function so they just get redefined at the end of the file)
    appContent += '\n' + newEditFunctions;
    fs.writeFileSync(appFile, appContent, 'utf8');
}

console.log('Interactive modal edit functions added.');
