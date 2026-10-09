const fs = require('fs');
const path = require('path');

const appFile = path.join(__dirname, 'public', 'app.js');
let content = fs.readFileSync(appFile, 'utf8');

// 1. Show new tabs in setupUIForRole
const newTabsDisplay = `
    const tabBtnAnagrafica = document.getElementById('tab-btn-anagrafica');
    const tabBtnBanca = document.getElementById('tab-btn-banca');
    const tabBtnGiornale = document.getElementById('tab-btn-giornale');
    const tabBtnAudit = document.getElementById('tab-btn-audit');
    if (isAdmin) {
        tabBtnUsers.classList.remove('hidden');
        if (tabBtnAnagrafica) tabBtnAnagrafica.classList.remove('hidden');
        if (tabBtnBanca) tabBtnBanca.classList.remove('hidden');
        if (tabBtnGiornale) tabBtnGiornale.classList.remove('hidden');
        if (tabBtnAudit) tabBtnAudit.classList.remove('hidden');
        document.getElementById('admin-add-quote-btn-box').classList.remove('hidden');
        document.getElementById('admin-add-supplier-btn').classList.remove('hidden');
    } else {
        tabBtnUsers.classList.add('hidden');
        if (tabBtnAnagrafica) tabBtnAnagrafica.classList.add('hidden');
        if (tabBtnBanca) tabBtnBanca.classList.add('hidden');
        if (tabBtnGiornale) tabBtnGiornale.classList.add('hidden');
        if (tabBtnAudit) tabBtnAudit.classList.add('hidden');
        document.getElementById('admin-add-quote-btn-box').classList.add('hidden');
        document.getElementById('admin-add-supplier-btn').classList.add('hidden');
    }
`;

// Find where setupUIForRole handles tab visibility
content = content.replace(
    /const tabBtnUsers = document\.getElementById\('tab-btn-users'\);[\s\S]*?document\.getElementById\('admin-add-supplier-btn'\)\.classList\.add\('hidden'\);\n    \}/,
    newTabsDisplay
);

// 2. Add switchTab logic
content = content.replace(
    /else if \(tabId === 'users' && state\.currentUser\.role === 'admin'\) loadUsersList\(\);/,
    `else if (tabId === 'users' && state.currentUser.role === 'admin') loadUsersList();
    else if (tabId === 'anagrafica' && state.currentUser.role === 'admin') loadAnagrafica();
    else if (tabId === 'banca' && state.currentUser.role === 'admin') loadBanca();
    else if (tabId === 'giornale' && state.currentUser.role === 'admin') loadGiornale();
    else if (tabId === 'audit' && state.currentUser.role === 'admin') loadAudit();
    `
);

// 3. New logic for V2 features
const v2Logic = `
// ============================================================================
// V2.0 LOGICA AGGIUNTIVA
// ============================================================================

async function loadAnagrafica() {
    try {
        const res = await fetch('/api/condominio', { headers: getAuthHeaders() });
        const data = await res.json();
        if (data.success && data.data.nome) {
            document.getElementById('condominio-nome').value = data.data.nome || '';
            document.getElementById('condominio-indirizzo').value = data.data.indirizzo || '';
            document.getElementById('condominio-cf').value = data.data.cf || '';
            document.getElementById('condominio-scala').value = data.data.scala || '';
        }
    } catch(e) { console.error(e); }
}

async function handleSaveCondominio(e) {
    e.preventDefault();
    const payload = {
        nome: document.getElementById('condominio-nome').value,
        indirizzo: document.getElementById('condominio-indirizzo').value,
        cf: document.getElementById('condominio-cf').value,
        scala: document.getElementById('condominio-scala').value,
        piano: ''
    };
    try {
        const res = await fetch('/api/condominio', {
            method: 'PUT',
            headers: getAuthHeaders(),
            body: JSON.stringify(payload)
        });
        const data = await res.json();
        if (data.success) showToast(data.message, 'success');
        else showToast('Errore salvataggio', 'error');
    } catch(err) { showToast('Errore rete', 'error'); }
}

async function loadBanca() {
    const container = document.getElementById('banca-container');
    container.innerHTML = 'Caricamento...';
    try {
        const res = await fetch('/api/bank-transactions', { headers: getAuthHeaders() });
        const data = await res.json();
        if (data.success) {
            container.innerHTML = '<table class="w-full text-left text-sm"><thead class="bg-slate-50 border-b"><tr><th class="p-2">Data</th><th class="p-2">Causale</th><th class="p-2 text-right">Importo</th><th class="p-2">Tipo</th></tr></thead><tbody>' +
                data.data.map(t => \`<tr><td class="p-2">\${formatDate(t.data)}</td><td class="p-2">\${t.causale}</td><td class="p-2 text-right">\${formatCurrency(t.importo)}</td><td class="p-2">\${t.tipo}</td></tr>\`).join('') +
                '</tbody></table>';
        }
    } catch(e) { container.innerHTML = 'Errore caricamento banca'; }
}

async function addBankTransaction() {
    const causale = prompt('Causale:');
    if (!causale) return;
    const importo = prompt('Importo:');
    const tipo = prompt('Tipo (Entrata/Uscita):', 'Entrata');
    if (!importo || !tipo) return;
    try {
        await fetch('/api/bank-transactions', {
            method: 'POST',
            headers: getAuthHeaders(),
            body: JSON.stringify({ account_id: 1, data: new Date().toISOString().slice(0,10), importo: parseFloat(importo), causale, tipo })
        });
        loadBanca();
    } catch(e) {}
}

async function loadGiornale() {
    const container = document.getElementById('giornale-container');
    container.innerHTML = 'Caricamento...';
    try {
        const res = await fetch('/api/journal', { headers: getAuthHeaders() });
        const data = await res.json();
        if (data.success) {
            container.innerHTML = '<table class="w-full text-left text-sm"><thead class="bg-slate-50 border-b"><tr><th class="p-2">Data</th><th class="p-2">Descrizione</th><th class="p-2 text-right">Dare</th><th class="p-2 text-right">Avere</th></tr></thead><tbody>' +
                data.data.map(j => \`<tr><td class="p-2">\${formatDate(j.data)}</td><td class="p-2">\${j.descrizione}</td><td class="p-2 text-right">\${formatCurrency(j.dare)}</td><td class="p-2 text-right">\${formatCurrency(j.avere)}</td></tr>\`).join('') +
                '</tbody></table>';
        }
    } catch(e) { container.innerHTML = 'Errore caricamento giornale'; }
}

async function addJournalEntry() {
    const descrizione = prompt('Descrizione registrazione:');
    if (!descrizione) return;
    const dare = prompt('Dare (€):', '0');
    const avere = prompt('Avere (€):', '0');
    try {
        await fetch('/api/journal', {
            method: 'POST',
            headers: getAuthHeaders(),
            body: JSON.stringify({ data: new Date().toISOString().slice(0,10), numero: '1', tipo: 'Generica', descrizione, dare: parseFloat(dare), avere: parseFloat(avere), conto: 'Cassa' })
        });
        loadGiornale();
    } catch(e) {}
}

async function loadAudit() {
    const container = document.getElementById('audit-container');
    container.innerHTML = 'Caricamento...';
    try {
        const res = await fetch('/api/audit-log', { headers: getAuthHeaders() });
        const data = await res.json();
        if (data.success) {
            container.innerHTML = '<table class="w-full text-left text-xs"><thead class="bg-slate-50 border-b"><tr><th class="p-2">Data/Ora</th><th class="p-2">Utente</th><th class="p-2">Azione</th><th class="p-2">Tabella</th><th class="p-2">IP</th></tr></thead><tbody>' +
                data.data.map(a => \`<tr><td class="p-2">\${new Date(a.timestamp).toLocaleString()}</td><td class="p-2">\${a.nome || 'Sistema'}</td><td class="p-2">\${a.azione}</td><td class="p-2">\${a.tabella}</td><td class="p-2">\${a.ip}</td></tr>\`).join('') +
                '</tbody></table>';
        }
    } catch(e) { container.innerHTML = 'Errore caricamento audit log'; }
}

`;

content += '\n' + v2Logic;

fs.writeFileSync(appFile, content, 'utf8');
console.log('app.js updated');
