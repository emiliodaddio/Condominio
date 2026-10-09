const fs = require('fs');
let html = fs.readFileSync('public/index.html', 'utf8');

// Copy the log container HTML to tab-communications
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
                </div>
            </div>
        </section>
        
        <!-- AREA SEGNALAZIONI (TICKET) -->`;

const targetInsert = `                        <ul class="list-disc pl-5 text-sm text-blue-700 space-y-1">
                            <li>Lettera su carta intestata</li>
                            <li>Nome dell'Amministratore</li>
                            <li>Dati del Condominio</li>
                            <li>Data di invio</li>
                        </ul>
                    </div>
                </div>
            </div>
        </section>

        <!-- AREA SEGNALAZIONI (TICKET) -->`;

if (html.includes(targetInsert)) {
    html = html.replace(targetInsert, targetInsert.replace('</div>\n            </div>\n        </section>', '</div>\n                </div>\n' + logContainerHtml.split('<!-- STORICO COMUNICAZIONI -->')[1].split('<!-- AREA SEGNALAZIONI (TICKET) -->')[0] + '            </div>\n        </section>'));
}

fs.writeFileSync('public/index.html', html);

// Now update app_v4.js to render into BOTH containers!
let appJS = fs.readFileSync('public/app_v4.js', 'utf8');

const targetRender = `        const container = document.getElementById('assemblies-log-container');
        if (!container) return;
        
        if (data.success && data.data.length > 0) {
            container.innerHTML = data.data.map(log => \`
                <div class="bg-white rounded-2xl border border-slate-200 shadow-xs p-4 flex justify-between items-center">
                    <div>
                        <div class="font-bold text-slate-900">\${log.destinatario}</div>
                        <div class="text-xs text-slate-500">\${log.email}</div>
                    </div>
                    <div class="text-right">
                        <div class="text-xs font-bold text-slate-700">\${formatDate(log.data_invio)}</div>
                        \${log.preview_url ? \`<a href="\${log.preview_url}" target="_blank" class="text-[10px] text-blue-600 hover:underline">Vedi Email Inviata</a>\` : ''}
                    </div>
                </div>
            \`).join('');
        } else {
            container.innerHTML = \`<div class="py-4 text-center text-slate-400 bg-white rounded-2xl border text-sm italic">Nessuna convocazione inviata finora.</div>\`;
        }`;

const replacementRender = `        const htmlContent = (data.success && data.data.length > 0) ? data.data.map(log => \`
                <div class="bg-white rounded-2xl border border-slate-200 shadow-xs p-4 flex justify-between items-center">
                    <div>
                        <div class="font-bold text-slate-900">\${log.destinatario}</div>
                        <div class="text-xs text-slate-500">\${log.email}</div>
                    </div>
                    <div class="text-right">
                        <div class="text-xs font-bold text-slate-700">\${formatDate(log.data_invio)}</div>
                        \${log.preview_url ? \`<a href="\${log.preview_url}" target="_blank" class="text-[10px] text-blue-600 hover:underline">Vedi Email Inviata</a>\` : ''}
                    </div>
                </div>
            \`).join('') : \`<div class="py-4 text-center text-slate-400 bg-white rounded-2xl border text-sm italic">Nessuna email inviata finora.</div>\`;
            
        const container1 = document.getElementById('assemblies-log-container');
        if (container1) container1.innerHTML = htmlContent;
        
        const container2 = document.getElementById('communications-log-container');
        if (container2) container2.innerHTML = htmlContent;`;

if (appJS.includes(targetRender)) {
    appJS = appJS.replace(targetRender, replacementRender);
}

// Add loadConvocationsLog to switchTab('communications')
const targetSwitch = `else if (tabId === 'tickets') loadTicketsData();`;
const replacementSwitch = `else if (tabId === 'communications') loadConvocationsLog();
    else if (tabId === 'tickets') loadTicketsData();`;

if (appJS.includes(targetSwitch)) {
    appJS = appJS.replace(targetSwitch, replacementSwitch);
}

fs.writeFileSync('public/app_v4.js', appJS);
console.log('Successfully moved logs to communications tab');
