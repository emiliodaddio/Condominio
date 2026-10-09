const fs = require('fs');
let html = fs.readFileSync('public/index.html', 'utf8');

const targetInput = '<input type="text" id="supplier-name" required placeholder="Es: Enel Energia S.p.A." class="w-full px-3.5 py-2 text-xs rounded-xl border border-slate-300">';
const selectHtml = '<select id="supplier-name" required class="w-full px-3.5 py-2 text-xs rounded-xl border border-slate-300 bg-white"><option value="">Seleziona fornitore dall\\\'anagrafica...</option></select>';

html = html.replace(targetInput, selectHtml);
fs.writeFileSync('public/index.html', html);
console.log('Replaced text input with select');
