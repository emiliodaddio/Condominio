const fs = require('fs');
let app = fs.readFileSync('public/app_v4.js', 'utf8');

const targetStr = `<h3 class="font-extrabold text-xl text-slate-900 mb-1">\${c.nome}</h3>
                    <p class="text-sm text-slate-500 mb-4">Ruolo: <span class="uppercase font-bold">\${c.role}</span></p>`;

const replacementStr = `<h3 class="font-extrabold text-xl text-slate-900 mb-2">\${c.nome}</h3>
                    <div class="space-y-1 mb-4">
                        \${c.indirizzo ? \`<p class="text-xs text-slate-500 flex items-center"><i class="fa-solid fa-map-pin w-4 mr-1"></i> \${c.indirizzo}</p>\` : ''}
                        \${c.cf ? \`<p class="text-xs text-slate-500 flex items-center"><i class="fa-solid fa-fingerprint w-4 mr-1"></i> C.F. \${c.cf}</p>\` : ''}
                        <p class="text-xs text-slate-500 mt-2">Ruolo: <span class="uppercase font-bold text-blue-600">\${c.role}</span></p>
                    </div>`;

if (app.includes(targetStr)) {
    app = app.replace(targetStr, replacementStr);
    fs.writeFileSync('public/app_v4.js', app);
    console.log('Fixed agency dashboard render');
} else {
    console.log('Agency dashboard render target not found');
}
