const fs = require('fs');
const path = require('path');

const indexFile = path.join(__dirname, 'public', 'index.html');
let htmlContent = fs.readFileSync(indexFile, 'utf8');

const editModalHtml = `
    <!-- Modale Modifica Interattiva -->
    <div id="modal-edit-generic" class="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 hidden flex items-center justify-center p-4 no-print">
        <div class="bg-white rounded-3xl shadow-2xl w-full max-w-md overflow-hidden flex flex-col max-h-[90vh]">
            <div class="px-6 py-5 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
                <h3 class="text-lg font-extrabold text-slate-800" id="edit-modal-title">Modifica Record</h3>
                <button onclick="closeEditModal()" class="text-slate-400 hover:text-rose-500 transition-colors">
                    <i class="fa-solid fa-xmark text-xl"></i>
                </button>
            </div>
            <div class="p-6 overflow-y-auto">
                <form id="form-edit-generic" onsubmit="handleEditSubmit(event)" class="space-y-4">
                    <div id="edit-modal-fields" class="space-y-4"></div>
                    <div class="pt-4 border-t border-slate-100 flex justify-end gap-3">
                        <button type="button" onclick="closeEditModal()" class="px-5 py-2.5 text-slate-600 hover:bg-slate-100 font-bold text-sm rounded-xl transition-colors">Annulla</button>
                        <button type="submit" class="px-5 py-2.5 bg-amber-500 hover:bg-amber-600 text-white font-bold text-sm rounded-xl shadow-md transition-all flex items-center gap-2">
                            <i class="fa-solid fa-save"></i> Salva Modifiche
                        </button>
                    </div>
                </form>
            </div>
        </div>
    </div>
`;

if (!htmlContent.includes('id="modal-edit-generic"')) {
    htmlContent = htmlContent.replace('<!-- Contenitore Toast di Notifica -->', editModalHtml + '\n    <!-- Contenitore Toast di Notifica -->');
    fs.writeFileSync(indexFile, htmlContent, 'utf8');
}
console.log('Modal injected to index.html');
