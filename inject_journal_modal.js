const fs = require('fs');
let html = fs.readFileSync('public/index.html', 'utf8');

const modalHtml = `
    <!-- Modale Nuova Registrazione Giornale -->
    <div id="modal-new-journal" class="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 hidden flex items-center justify-center p-4 no-print">
        <div class="bg-white rounded-3xl shadow-2xl w-full max-w-md overflow-hidden flex flex-col max-h-[90vh]">
            <div class="px-6 py-5 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
                <h3 class="text-lg font-extrabold text-slate-800"><i class="fa-solid fa-book text-indigo-600 mr-2"></i>Nuova Registrazione</h3>
                <button onclick="closeJournalModal()" class="text-slate-400 hover:text-rose-500 transition-colors">
                    <i class="fa-solid fa-xmark text-xl"></i>
                </button>
            </div>
            <div class="p-6 overflow-y-auto">
                <form id="form-new-journal" onsubmit="handleNewJournalSubmit(event)" class="space-y-4">
                    <div>
                        <label class="block text-xs font-bold text-slate-700 mb-1">Condòmino di riferimento (Conto)</label>
                        <select id="journal-user-id" class="w-full px-3.5 py-2.5 text-sm rounded-xl border border-slate-300 bg-white">
                            <option value="">-- Nessuno / Fornitore Esterno --</option>
                        </select>
                    </div>
                    <div>
                        <label class="block text-xs font-bold text-slate-700 mb-1">Descrizione *</label>
                        <input type="text" id="journal-desc" required placeholder="Es. Pagamento quota condominiale" class="w-full px-3.5 py-2.5 text-sm rounded-xl border border-slate-300">
                    </div>
                    <div class="grid grid-cols-2 gap-3">
                        <div>
                            <label class="block text-xs font-bold text-slate-700 mb-1">Entrate (Dare) €</label>
                            <input type="number" step="0.01" id="journal-dare" value="0.00" min="0" class="w-full px-3.5 py-2.5 text-sm rounded-xl border border-slate-300 text-emerald-600 font-bold">
                        </div>
                        <div>
                            <label class="block text-xs font-bold text-slate-700 mb-1">Uscite (Avere) €</label>
                            <input type="number" step="0.01" id="journal-avere" value="0.00" min="0" class="w-full px-3.5 py-2.5 text-sm rounded-xl border border-slate-300 text-rose-600 font-bold">
                        </div>
                    </div>
                    <div>
                        <label class="block text-xs font-bold text-slate-700 mb-1">Data Registrazione *</label>
                        <input type="date" id="journal-data" required class="w-full px-3.5 py-2.5 text-sm rounded-xl border border-slate-300">
                    </div>
                    
                    <div class="pt-4 border-t border-slate-100 flex justify-end gap-3 mt-4">
                        <button type="button" onclick="closeJournalModal()" class="px-5 py-2.5 text-slate-600 hover:bg-slate-100 font-bold text-sm rounded-xl transition-colors">Annulla</button>
                        <button type="submit" class="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-sm rounded-xl shadow-md transition-all flex items-center gap-2">
                            <i class="fa-solid fa-save"></i> Salva
                        </button>
                    </div>
                </form>
            </div>
        </div>
    </div>
`;

if (!html.includes('id="modal-new-journal"')) {
    html = html.replace('<!-- Contenitore Toast di Notifica -->', modalHtml + '\n    <!-- Contenitore Toast di Notifica -->');
    fs.writeFileSync('public/index.html', html);
    console.log('Injected modal-new-journal');
} else {
    console.log('Modal already exists');
}
