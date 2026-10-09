const fs = require('fs');
let html = fs.readFileSync('public/index.html', 'utf8');

const anchor = 'class="w-full px-3 py-2 text-xs rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-500">\r\n                        </div>\r\n\r\n                        <div>\r\n                            <label class="block text-xs font-bold text-slate-700 mb-1">Ruolo Assegnato</label>';

// Since line endings might be \n or \r\n, I'll use a regex replace for the anchor
const regex = /id="new-user-unita"([^>]+)>\s*<\/div>\s*<div>\s*<label class="block text-xs font-bold text-slate-700 mb-1">Ruolo Assegnato<\/label>/;

html = html.replace(regex, `id="new-user-unita"$1>
                        </div>
                        <div>
                            <label class="block text-xs font-bold text-slate-700 mb-1">Telefono</label>
                            <input type="text" id="new-user-telefono" placeholder="Es. 333 1234567" class="w-full px-3 py-2 text-xs rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-500">
                        </div>
                        <div>
                            <label class="block text-xs font-bold text-slate-700 mb-1">Dati Catastali (Sez, Fg, Part, Sub)</label>
                            <input type="text" id="new-user-catasto" placeholder="Es. Fg. 10, Part. 100, Sub 5" class="w-full px-3 py-2 text-xs rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-500">
                        </div>
                        <div>
                            <label class="block text-xs font-bold text-slate-700 mb-1">Ruolo Assegnato</label>`);

fs.writeFileSync('public/index.html', html);
console.log('Successfully injected phone and catasto!');
