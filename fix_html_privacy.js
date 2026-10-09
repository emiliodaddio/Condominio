const fs = require('fs');
let html = fs.readFileSync('public/index.html', 'utf8');

const privacyModalHTML = `
    <!-- Modale Consenso Privacy (Obbligatorio) -->
    <div id="modal-privacy" class="fixed inset-0 z-[100] hidden overflow-y-auto">
        <div class="min-h-screen px-4 flex items-center justify-center p-4">
            <div class="fixed inset-0 modal-backdrop bg-slate-900/80 backdrop-blur-sm"></div>
            <div class="bg-white rounded-3xl max-w-2xl w-full p-6 sm:p-8 shadow-2xl relative z-10 modal-content border border-slate-100 max-h-[90vh] flex flex-col">
                <div class="flex items-center gap-3 pb-4 border-b border-slate-100">
                    <div class="w-10 h-10 bg-indigo-100 text-indigo-600 rounded-xl flex items-center justify-center text-xl">
                        <i class="fa-solid fa-shield-halved"></i>
                    </div>
                    <div>
                        <h3 class="text-xl font-bold text-slate-900">Informativa e Consenso Privacy</h3>
                        <p class="text-xs text-slate-500">Ai sensi del Regolamento UE 2016/679 (GDPR)</p>
                    </div>
                </div>
                
                <div class="overflow-y-auto py-4 text-sm text-slate-600 space-y-4 pr-2 flex-grow">
                    <p>Gentile Condòmino,</p>
                    <p>Per poter erogare i servizi di gestione condominiale tramite questa piattaforma (inclusa la visualizzazione delle proprie quote, la partecipazione alle assemblee e la gestione delle manutenzioni), è necessario che l'Amministratore pro-tempore possa trattare i Suoi dati personali.</p>
                    <h4 class="font-bold text-slate-800">1. Finalità del trattamento</h4>
                    <p>I Suoi dati (nome, cognome, email, unità immobiliare di pertinenza, e dati contabili relativi alle quote) saranno trattati unicamente per le finalità strettamente connesse alla gestione amministrativa e contabile del Condominio, e per l'adempimento di obblighi di legge.</p>
                    <h4 class="font-bold text-slate-800">2. Conservazione e Sicurezza</h4>
                    <p>I dati saranno conservati all'interno della piattaforma per la durata del mandato dell'Amministratore e/o secondo i tempi previsti dalla legge. L'accesso è strettamente limitato, crittografato e protetto da policy di sicurezza.</p>
                    <h4 class="font-bold text-slate-800">3. Diritti dell'interessato</h4>
                    <p>Lei ha il diritto di richiedere all'Amministratore l'accesso ai Suoi dati, la rettifica, la cancellazione (nei limiti consentiti dalla normativa condominiale), o la limitazione del trattamento. Cliccando su "Accetto e Sottoscrivo", acconsente espressamente al trattamento per le finalità sopra esposte.</p>
                </div>
                
                <div class="pt-4 mt-4 flex flex-col space-y-3 border-t border-slate-100">
                    <div class="flex items-start gap-2">
                        <input type="checkbox" id="privacy-checkbox" class="mt-1 w-4 h-4 text-indigo-600 rounded border-slate-300">
                        <label for="privacy-checkbox" class="text-xs font-bold text-slate-700">Dichiaro di aver preso visione dell'informativa e presto il consenso al trattamento dei miei dati personali ai fini della gestione condominiale.</label>
                    </div>
                    <button id="btn-accept-privacy" onclick="acceptPrivacy()" class="w-full py-3 bg-slate-300 text-slate-500 font-bold rounded-xl transition-all cursor-not-allowed" disabled>
                        Accetto e Sottoscrivo
                    </button>
                </div>
            </div>
        </div>
    </div>
`;

// Insert the modal before the end of the body or after another modal
html = html.replace('<!-- Modale Nuovo Ticket -->', privacyModalHTML + '\n    <!-- Modale Nuovo Ticket -->');
fs.writeFileSync('public/index.html', html);
