const fs = require('fs');
let js = fs.readFileSync('public/app.js', 'utf8');

js = js.replace(
    '<tr><th class="p-3">Data</th><th class="p-3">Descrizione</th><th class="p-3 text-right">Dare</th><th class="p-3 text-right">Avere</th><th class="p-3 text-center">Azioni</th></tr>',
    '<tr><th class="p-3">Data</th><th class="p-3">Condòmino / Conto</th><th class="p-3">Descrizione</th><th class="p-3 text-right">Entrate (Dare)</th><th class="p-3 text-right">Uscite (Avere)</th><th class="p-3 text-center">Azioni</th></tr>'
);

js = js.replace(
    '<td class="p-3 text-slate-800">${j.descrizione}</td>',
    '<td class="p-3 font-semibold text-slate-700">${j.conto || \'<span class="text-slate-400 italic">Nessuno</span>\'}</td>\n                        <td class="p-3 text-slate-800">${j.descrizione}</td>'
);

js = js.replace(
    '<td colspan="5" class="p-4 text-center',
    '<td colspan="6" class="p-4 text-center'
);

fs.writeFileSync('public/app.js', js);
console.log('Added Conto column to loadGiornale table');
