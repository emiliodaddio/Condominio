const fs = require('fs');
let html = fs.readFileSync('public/index.html', 'utf8');

const oldUserSelect = `
                <div class="grid grid-cols-2 gap-4 mt-4">
                    <div>
                        <label class="block text-xs font-bold text-slate-700 mb-1">Proprietario / Condòmino (User ID)</label>
                        <select id="unita-user-id" class="w-full p-2 border rounded-xl"><option value="">-- Nessun Proprietario (Sfitto/Esterno) --</option></select>
                    </div>
                </div>`;

const newAnagraficaSelect = `
                <div class="grid grid-cols-2 gap-4 mt-4">
                    <div>
                        <label class="block text-xs font-bold text-slate-700 mb-1"><i class="fa-solid fa-user-tie mr-1"></i> Proprietario (dalla Rubrica)</label>
                        <select id="unita-proprietario" class="w-full p-2 border rounded-xl"><option value="">-- Seleziona Proprietario --</option></select>
                    </div>
                    <div>
                        <label class="block text-xs font-bold text-slate-700 mb-1"><i class="fa-solid fa-user mr-1"></i> Conduttore (Inquilino)</label>
                        <select id="unita-conduttore" class="w-full p-2 border rounded-xl"><option value="">-- Nessun Inquilino --</option></select>
                    </div>
                </div>`;

html = html.replace(oldUserSelect, newAnagraficaSelect);
fs.writeFileSync('public/index.html', html);
console.log('Updated Unita Modal in index.html');
