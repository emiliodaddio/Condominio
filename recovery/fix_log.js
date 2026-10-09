const fs = require('fs');
let content = fs.readFileSync('public/app_v4.js', 'utf8');

const logFn = `
async function loadConvocationsLog() {
    if (state.currentUser.role !== 'admin') return;
    try {
        const res = await fetch('/api/assemblies/convocations-log', { headers: getAuthHeaders() });
        const data = await res.json();
        
        const container = document.getElementById('assemblies-log-container');
        if (!container) return;
        
        if (data.success && data.data.length > 0) {
            container.innerHTML = data.data.map(log => \`
                <div class="bg-white rounded-2xl border border-slate-200 shadow-xs p-4 flex justify-between items-center">
                    <div>
                        <div class="font-bold text-slate-900">\${log.destinatario}</div>
                        <div class="text-xs text-slate-500">\${log.email}</div>
                    </div>
                    <div class="text-right">
                        <div class="text-xs font-bold text-slate-700">\${formatDate(log.data_invio)}</div>
                        \${log.preview_url ? \`<a href="\${log.preview_url}" target="_blank" class="text-[10px] text-blue-600 hover:underline">Vedi Email Inviata</a>\` : ''}
                    </div>
                </div>
            \`).join('');
        } else {
            container.innerHTML = \`<div class="py-4 text-center text-slate-400 bg-white rounded-2xl border text-sm italic">Nessuna convocazione inviata finora.</div>\`;
        }
    } catch (e) {
        console.error("Errore caricamento log", e);
    }
}
`;

content = content + "\n" + logFn;

content = content.replace(
    "const pastData = await pastRes.json();",
    "const pastData = await pastRes.json();\n        if (state.currentUser.role === 'admin') loadConvocationsLog();"
);

fs.writeFileSync('public/app_v4.js', content);
