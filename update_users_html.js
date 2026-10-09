const fs = require('fs');
let html = fs.readFileSync('public/index.html', 'utf8');

// 1. Add fields to user creation form
html = html.replace(
    /id="new-user-unita"[^>]*><\/div>\s*<div>\s*<label class="block text-xs font-bold text-slate-700 mb-1">Ruolo<\/label>/i,
    `id="new-user-unita" placeholder="Es. Int. 1" class="w-full px-3.5 py-2.5 text-sm rounded-xl border border-slate-300">
                                    </div>
                                    <div>
                                        <label class="block text-xs font-bold text-slate-700 mb-1">Telefono</label>
                                        <input type="text" id="new-user-telefono" placeholder="Es. 333 1234567" class="w-full px-3.5 py-2.5 text-sm rounded-xl border border-slate-300">
                                    </div>
                                    <div>
                                        <label class="block text-xs font-bold text-slate-700 mb-1">Dati Catastali</label>
                                        <input type="text" id="new-user-catasto" placeholder="Es. Fg. 10, Part. 100, Sub 5" class="w-full px-3.5 py-2.5 text-sm rounded-xl border border-slate-300">
                                    </div>
                                    <div>
                                        <label class="block text-xs font-bold text-slate-700 mb-1">Ruolo</label>`
);

// 2. Add headers
html = html.replace(
    /<th class="py-3\.5 px-4">Email<\/th>\s*<th class="py-3\.5 px-4">[^<]+<\/th>/i,
    `<th class="py-3.5 px-4">Email</th>
                                      <th class="py-3.5 px-4">Telefono</th>
                                      <th class="py-3.5 px-4">Unità</th>
                                      <th class="py-3.5 px-4">Catasto</th>`
);

// 3. Add Export Buttons
if (!html.includes('exportUsersExcel()')) {
    html = html.replace(
        '<div class="px-6 py-5 border-b border-slate-100 bg-slate-50/50 rounded-t-3xl">\n                                  <h3 class="text-lg font-bold text-slate-800">Utenti e Ruoli nel Sistema</h3>\n                              </div>',
        `<div class="px-6 py-5 border-b border-slate-100 bg-slate-50/50 rounded-t-3xl flex justify-between items-center">
            <h3 class="text-lg font-bold text-slate-800">Utenti e Ruoli nel Sistema</h3>
            <div class="space-x-2 no-print">
                <button onclick="window.print()" class="px-3 py-1.5 bg-slate-200 hover:bg-slate-300 text-slate-700 rounded-lg text-xs font-bold"><i class="fa-solid fa-print mr-1"></i>Stampa</button>
                <button onclick="exportUsersExcel()" class="px-3 py-1.5 bg-emerald-100 hover:bg-emerald-200 text-emerald-700 rounded-lg text-xs font-bold"><i class="fa-solid fa-file-excel mr-1"></i>Esporta</button>
            </div>
        </div>`
    );
}

fs.writeFileSync('public/index.html', html);
console.log('Fixed HTML fields');
