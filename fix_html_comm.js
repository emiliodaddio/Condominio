const fs = require('fs');
let html = fs.readFileSync('public/index.html', 'utf8');

const navTarget = `                <button id="tab-btn-assemblies" onclick="switchTab('assemblies')" class="tab-btn flex items-center space-x-2 py-3 px-3 border-b-2 border-transparent font-medium text-sm text-slate-500 hover:text-slate-700 whitespace-nowrap transition-colors">
                    <i class="fa-solid fa-landmark text-base"></i>
                    <span>Area Assemblee & Video Call</span>
                </button>`;

const navReplacement = navTarget + `
                <button id="tab-btn-communications" onclick="switchTab('communications')" class="tab-btn admin-only hidden flex items-center space-x-2 py-3 px-3 border-b-2 border-transparent font-medium text-sm text-slate-500 hover:text-slate-700 whitespace-nowrap transition-colors">
                    <i class="fa-solid fa-paper-plane text-base"></i>
                    <span>Comunicazioni & Circolari</span>
                </button>`;

html = html.replace(navTarget, navReplacement);

const dashboardCardTarget = `                <!-- Card: Supporto & Ticket -->
                <div onclick="switchTab('tickets')" class="group cursor-pointer bg-white rounded-3xl p-6 border border-slate-200 hover:border-blue-400 hover:shadow-xl hover:-translate-y-1 transition-all duration-300">`;

const dashboardCardReplacement = `                <!-- Card: Comunicazioni -->
                <div onclick="switchTab('communications')" class="group cursor-pointer bg-white rounded-3xl p-6 border border-slate-200 hover:border-emerald-400 hover:shadow-xl hover:-translate-y-1 transition-all duration-300 admin-only hidden">
                    <div class="w-14 h-14 bg-emerald-50 text-emerald-600 rounded-2xl flex items-center justify-center text-2xl mb-4 group-hover:scale-110 transition-transform">
                        <i class="fa-solid fa-paper-plane"></i>
                    </div>
                    <h3 class="text-lg font-bold text-slate-900 mb-2">Comunicazioni</h3>
                    <p class="text-sm text-slate-500 line-clamp-2">Invia circolari, avvisi o comunicazioni a testo libero ai condòmini.</p>
                </div>
                
` + dashboardCardTarget;

html = html.replace(dashboardCardTarget, dashboardCardReplacement);

const sectionTarget = `        <!-- ====================================================================
             3. TAB: TICKET SUPPORTO
             ==================================================================== -->`;

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

` + sectionTarget;

html = html.replace(sectionTarget, sectionReplacement);

fs.writeFileSync('public/index.html', html);
