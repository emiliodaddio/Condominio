const fs = require('fs');
let html = fs.readFileSync('public/index.html', 'utf8');

const rubricaHtml = `
            <!-- SEZIONE RUBRICA ANAGRAFICA -->
            <div class="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden mt-8">
                <div class="p-5 border-b border-slate-200 bg-slate-50/50 flex justify-between items-center">
                    <div>
                        <h2 class="text-base font-bold text-slate-900 flex items-center gap-2">
                            <i class="fa-solid fa-address-book text-indigo-600"></i>
                            Rubrica Persone (Proprietari / Conduttori)
                        </h2>
                        <p class="text-xs text-slate-500">Gestione dell'anagrafica centralizzata delle persone fisiche o giuridiche del condominio</p>
                    </div>
                    <button onclick="openPersonaModal()" class="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold transition-colors">
                        <i class="fa-solid fa-plus mr-1"></i> Nuova Persona
                    </button>
                </div>
                <div class="overflow-x-auto">
                    <table class="w-full text-left text-sm">
                        <thead class="bg-slate-50 text-slate-600 text-xs uppercase tracking-wider border-b border-slate-200 font-semibold">
                            <tr>
                                <th class="py-3.5 px-4">Nominativo</th>
                                <th class="py-3.5 px-4">Codice Fiscale</th>
                                <th class="py-3.5 px-4">Contatti (Tel / Email)</th>
                                <th class="py-3.5 px-4">Ruolo Fiscale</th>
                                <th class="py-3.5 px-4 text-right">Azioni</th>
                            </tr>
                        </thead>
                        <tbody id="persone-table-body" class="divide-y divide-slate-100">
                            <!-- Popolato via JS -->
                        </tbody>
                    </table>
                </div>
            </div>

            <!-- Modale Nuova Persona -->
            <div id="modal-persona" class="hidden fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
                <div class="bg-white rounded-3xl shadow-2xl w-full max-w-lg overflow-hidden">
                    <div class="px-6 py-4 border-b border-slate-100 flex justify-between items-center bg-slate-50">
                        <h3 class="font-bold text-slate-800" id="persona-modal-title">Nuova Persona</h3>
                        <button onclick="closePersonaModal()" class="text-slate-400 hover:text-slate-600"><i class="fa-solid fa-xmark text-xl"></i></button>
                    </div>
                    <form id="persona-form" onsubmit="savePersona(event)" class="p-6 space-y-4">
                        <input type="hidden" id="persona-id">
                        
                        <div class="grid grid-cols-2 gap-4">
                            <div>
                                <label class="block text-xs font-bold text-slate-700 mb-1">Nome *</label>
                                <input type="text" id="persona-nome" required class="w-full p-2 border rounded-xl">
                            </div>
                            <div>
                                <label class="block text-xs font-bold text-slate-700 mb-1">Cognome / Ragione Sociale *</label>
                                <input type="text" id="persona-cognome" required class="w-full p-2 border rounded-xl">
                            </div>
                            <div class="col-span-2">
                                <label class="block text-xs font-bold text-slate-700 mb-1">Codice Fiscale / P.IVA</label>
                                <input type="text" id="persona-cf" class="w-full p-2 border rounded-xl uppercase">
                            </div>
                            <div>
                                <label class="block text-xs font-bold text-slate-700 mb-1">Telefono</label>
                                <input type="tel" id="persona-tel" class="w-full p-2 border rounded-xl">
                            </div>
                            <div>
                                <label class="block text-xs font-bold text-slate-700 mb-1">Email</label>
                                <input type="email" id="persona-email" class="w-full p-2 border rounded-xl">
                            </div>
                            <div class="col-span-2">
                                <label class="block text-xs font-bold text-slate-700 mb-1">Ruolo Fiscale Prevalente</label>
                                <select id="persona-ruolo" class="w-full p-2 border rounded-xl">
                                    <option value="Proprietario">Proprietario</option>
                                    <option value="Conduttore">Conduttore (Inquilino)</option>
                                    <option value="Usufruttuario">Usufruttuario</option>
                                </select>
                            </div>
                        </div>
                        <div class="pt-4 flex justify-end space-x-3">
                            <button type="button" onclick="closePersonaModal()" class="px-4 py-2 text-slate-600 hover:bg-slate-100 font-bold rounded-xl transition-colors">Annulla</button>
                            <button type="submit" class="px-4 py-2 bg-indigo-600 text-white font-bold rounded-xl shadow-md hover:bg-indigo-700 transition-colors">Salva Persona</button>
                        </div>
                    </form>
                </div>
            </div>
`;

const insertMarker = '</form>\n            </div>\n        </section>\n\n        <!-- ========================================================================';
if (html.includes('id="tab-anagrafica"')) {
    // Find the end of tab-anagrafica
    let pieces = html.split('id="tab-banca"');
    let tabAna = pieces[0];
    tabAna = tabAna.replace('</form>\n            </div>', '</form>\n            </div>' + rubricaHtml);
    html = tabAna + 'id="tab-banca"' + pieces[1];
    fs.writeFileSync('public/index.html', html);
    console.log('Added Rubrica to tab-anagrafica');
}
