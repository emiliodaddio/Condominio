const fs = require('fs');

let appJS = fs.readFileSync('public/app_v4.js', 'utf8');

const rx = /const container = document\.getElementById\('assemblies-log-container'\);[\s\S]*?Nessuna convocazione inviata finora\.<\/div>\`;\s*\}/;

const replacementRender = `        const htmlContent = (data.success && data.data.length > 0) ? data.data.map(log => \`
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
            \`).join('') : \`<div class="py-4 text-center text-slate-400 bg-white rounded-2xl border text-sm italic">Nessuna email inviata finora.</div>\`;
            
        const container1 = document.getElementById('assemblies-log-container');
        if (container1) container1.innerHTML = htmlContent;
        
        const container2 = document.getElementById('communications-log-container');
        if (container2) container2.innerHTML = htmlContent;`;

if (rx.test(appJS)) {
    appJS = appJS.replace(rx, replacementRender);
    fs.writeFileSync('public/app_v4.js', appJS);
    console.log('Successfully updated loadConvocationsLog');
} else {
    console.log('Regex failed for loadConvocationsLog');
}
