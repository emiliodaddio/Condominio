const fs = require('fs');
let html = fs.readFileSync('public/index.html', 'utf8');

const sectionTarget = "        <!-- ====================================================================";
const sectionIdx = html.indexOf("3. TAB: AREA MANUTENZIONE & TICKETING");

if (sectionIdx !== -1) {
    const startIdx = html.lastIndexOf(sectionTarget, sectionIdx);
    
    const sectionReplacement = `        <!-- ====================================================================
             NEW TAB: COMUNICAZIONI E CIRCOLARI
             ==================================================================== -->
        <section id="tab-communications" class="tab-pane hidden space-y-8">
            <div class="bg-white p-6 rounded-2xl border border-slate-200 shadow-xs">
                <div class="mb-6">
                    <h1 class="text-2xl font-extrabold text-slate-900 tracking-tight">Circolari e Comunicazioni</h1>
                    <p class="text-sm text-slate-500 mt-1">Invia comunicazioni a testo libero in PDF ai condòmini. L'invio verrà tracciato nello storico.</p>
                </div>

                <div class="grid grid-cols-1 md:grid-cols-3 gap-8">
                    <!-- Form Invio -->
                    <div class="md:col-span-2 space-y-4">
                        <div>
                            <label class="block text-xs font-bold text-slate-700 mb-1">Destinatari</label>
                            <select id="comm-user" class="w-full border rounded-xl p-3 text-sm bg-slate-50 border-slate-200 focus:bg-white focus:border-blue-500 transition-colors">
                                <option value="all">Tutti i condòmini (con indirizzo email)</option>
                            </select>
                        </div>
                        <div>
                            <label class="block text-xs font-bold text-slate-700 mb-1">Oggetto della Comunicazione</label>
                            <input type="text" id="comm-subject" class="w-full border rounded-xl p-3 text-sm bg-slate-50 border-slate-200 focus:bg-white focus:border-blue-500 transition-colors" placeholder="Es. Avviso Lavori Straordinari" />
                        </div>
                        <div>
                            <label class="block text-xs font-bold text-slate-700 mb-1">Testo della Comunicazione</label>
                            <textarea id="comm-message" rows="8" class="w-full border rounded-xl p-3 text-sm bg-slate-50 border-slate-200 focus:bg-white focus:border-blue-500 transition-colors" placeholder="Scrivi qui il testo della comunicazione... Verrà automaticamente impaginato su carta intestata in PDF."></textarea>
                        </div>
                        <div class="flex justify-end pt-2">
                            <button onclick="sendCommunication()" class="px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-sm font-bold shadow-md transition-all flex items-center">
                                <i class="fa-solid fa-paper-plane mr-2"></i> Impagina PDF & Invia
                            </button>
                        </div>
                    </div>
                    
                    <!-- Box Informativo -->
                    <div class="bg-blue-50 rounded-2xl p-5 border border-blue-100 self-start">
                        <h3 class="text-blue-800 font-bold mb-3 flex items-center"><i class="fa-solid fa-circle-info mr-2"></i> Come Funziona</h3>
                        <p class="text-sm text-blue-700 mb-3">La piattaforma prenderà il testo che scrivi qui a lato e lo impaginerà automaticamente all'interno di un <b>documento PDF ufficiale</b> del Condominio.</p>
                        <p class="text-sm text-blue-700 mb-3">Il documento conterrà l'intestazione, i dati del destinatario, l'oggetto e la tua firma.</p>
                        <p class="text-sm text-blue-700">Tutti gli invii verranno registrati per tua sicurezza nello <b>Storico Convocazioni e Comunicazioni</b> (nella scheda Area Assemblee).</p>
                    </div>
                </div>
            </div>
        </section>

`;
    html = html.substring(0, startIdx) + sectionReplacement + html.substring(startIdx);
    fs.writeFileSync('public/index.html', html);
}
