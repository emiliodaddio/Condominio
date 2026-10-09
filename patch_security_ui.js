const fs = require('fs');

let html = fs.readFileSync('public/index.html', 'utf8');

const targetHtml = `<!-- Tabella Elenco Utenti Esistenti -->`;
const newSectionHtml = `<!-- Log Sicurezza -->
                <div class="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden no-print">
                    <div class="p-5 border-b border-slate-200 bg-slate-50/50 flex justify-between items-center">
                        <h3 class="text-base font-bold text-slate-900 flex items-center gap-2">
                            <i class="fa-solid fa-shield-halved text-indigo-700"></i>
                            Registro Attività di Sicurezza (Log)
                        </h3>
                    </div>
                    <div class="overflow-x-auto">
                        <table class="w-full text-left text-sm">
                            <thead class="bg-slate-50 text-slate-600 text-xs uppercase tracking-wider border-b border-slate-200 font-semibold">
                                <tr>
                                    <th class="py-3.5 px-4">Data/Ora</th>
                                    <th class="py-3.5 px-4">Utente</th>
                                    <th class="py-3.5 px-4">Azione Effettuata</th>
                                </tr>
                            </thead>
                            <tbody id="security-logs-body" class="divide-y divide-slate-100">
                                <tr><td colspan="3" class="text-center p-4 text-slate-400">Caricamento log...</td></tr>
                            </tbody>
                        </table>
                    </div>
                </div>

                <!-- Tabella Elenco Utenti Esistenti -->`;

if (html.includes(targetHtml) && !html.includes('Registro Attività di Sicurezza')) {
    html = html.replace(targetHtml, newSectionHtml);
    fs.writeFileSync('public/index.html', html);
    console.log('Added security log section to index.html');
}

let appJS = fs.readFileSync('public/app_v4.js', 'utf8');

const jsLogic = `
async function loadSecurityLogs() {
    if (state.currentUser.role !== 'admin') return;
    try {
        const res = await fetch('/api/security-logs', { headers: getAuthHeaders() });
        const data = await res.json();
        
        const tbody = document.getElementById('security-logs-body');
        if (!tbody) return;

        if (data.success && data.data.length > 0) {
            tbody.innerHTML = data.data.map(log => \`
                <tr class="hover:bg-slate-50 transition-colors">
                    <td class="py-3 px-4 text-xs font-semibold text-slate-600">\${formatDate(log.created_at)}</td>
                    <td class="py-3 px-4">
                        <div class="font-bold text-slate-900">\${log.nome || 'Utente Sconosciuto'}</div>
                        <div class="text-xs text-slate-500">\${log.email || ''}</div>
                    </td>
                    <td class="py-3 px-4 text-sm"><span class="px-2 py-1 bg-blue-100 text-blue-800 rounded-md font-bold text-xs">\${log.action}</span></td>
                </tr>
            \`).join('');
        } else {
            tbody.innerHTML = '<tr><td colspan="3" class="text-center p-4 text-slate-400">Nessun evento registrato</td></tr>';
        }
    } catch (e) {
        console.error('Error loading security logs', e);
    }
}
`;

if (!appJS.includes('loadSecurityLogs')) {
    appJS += '\n' + jsLogic;
    
    // Call loadSecurityLogs when loading users
    const loadUsersTarget = `renderUsersTable();`;
    const loadUsersReplacement = `renderUsersTable(); loadSecurityLogs();`;
    
    if (appJS.includes(loadUsersTarget)) {
        appJS = appJS.replace(loadUsersTarget, loadUsersReplacement);
    }
    
    fs.writeFileSync('public/app_v4.js', appJS);
    console.log('Added JS logic for security logs');
}
