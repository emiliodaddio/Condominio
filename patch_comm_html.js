const fs = require('fs');
let html = fs.readFileSync('public/index.html', 'utf8');

const logContainerHtml = `
                <!-- STORICO COMUNICAZIONI -->
                <div class="mt-8 border-t border-slate-200 pt-8">
                    <h2 class="text-base font-bold text-slate-900 mb-4 flex items-center">
                        <i class="fa-solid fa-clock-rotate-left text-slate-500 mr-2"></i> Storico Globale Email Inviate
                    </h2>
                    <p class="text-xs text-slate-500 mb-4">Registro di tutte le email (Solleciti, Ricevute, Circolari, Convocazioni) inviate dalla piattaforma.</p>
                    <div id="communications-log-container" class="space-y-3 mb-8">
                        <div class="py-4 text-center text-slate-400 bg-white rounded-2xl border text-sm italic">Caricamento storico...</div>
                    </div>
                </div>`;

const targetHtml = `(nella scheda Area Assemblee).</p>
                    </div>
                </div>
            </div>
        </section>`;

if (html.includes(targetHtml)) {
    html = html.replace(targetHtml, `(nella scheda Area Assemblee).</p>
                    </div>
                </div>${logContainerHtml}
            </div>
        </section>`);
    fs.writeFileSync('public/index.html', html);
    console.log('HTML Injected');
} else {
    console.log('Target HTML not found');
}
