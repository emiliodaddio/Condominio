const fs = require('fs');
let html = fs.readFileSync('public/index.html', 'utf8');

// 1. Inject Telefono and Catasto fields in the User form
const unitaDivStart = html.indexOf('id="new-user-unita"');
const formRoleStart = html.indexOf('<label class="block text-xs font-bold text-slate-700 mb-1">Ruolo</label>', unitaDivStart);
if (unitaDivStart !== -1 && formRoleStart !== -1) {
    const replacement = `id="new-user-unita" placeholder="Es: Scala B - Int. 6" class="w-full px-3 py-2 text-xs rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-500">
                        </div>
                        <div>
                            <label class="block text-xs font-bold text-slate-700 mb-1">Telefono</label>
                            <input type="text" id="new-user-telefono" placeholder="Es. 333 1234567" class="w-full px-3 py-2 text-xs rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-500">
                        </div>
                        <div>
                            <label class="block text-xs font-bold text-slate-700 mb-1">Dati Catastali</label>
                            <input type="text" id="new-user-catasto" placeholder="Es. Fg. 10, Part. 100, Sub 5" class="w-full px-3 py-2 text-xs rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-500">
                        </div>
                        <div>
                            `;
    html = html.substring(0, unitaDivStart) + replacement + html.substring(formRoleStart);
}

// 2. Inject Export Buttons
html = html.replace(
    '<h3 class="text-lg font-bold text-slate-800">Utenti e Ruoli nel Sistema</h3>',
    `<h3 class="text-lg font-bold text-slate-800">Utenti e Ruoli nel Sistema</h3>
                              <div class="space-x-2 no-print float-right">
                                  <button onclick="window.print()" class="px-3 py-1.5 bg-slate-200 hover:bg-slate-300 text-slate-700 rounded-lg text-xs font-bold"><i class="fa-solid fa-print mr-1"></i>Stampa</button>
                                  <button onclick="exportUsersExcel()" class="px-3 py-1.5 bg-emerald-100 hover:bg-emerald-200 text-emerald-700 rounded-lg text-xs font-bold"><i class="fa-solid fa-file-excel mr-1"></i>Esporta</button>
                              </div>`
);

// 3. Make sure table headers have enough colspan if needed, they are already replaced properly in the previous script.
// But let's fix the header flex container
html = html.replace(
    '<div class="px-6 py-5 border-b border-slate-100 bg-slate-50/50 rounded-t-3xl">',
    '<div class="px-6 py-5 border-b border-slate-100 bg-slate-50/50 rounded-t-3xl flex justify-between items-center">'
);

fs.writeFileSync('public/index.html', html);
console.log('Fixed index.html properly');
