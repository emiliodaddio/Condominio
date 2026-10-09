const fs = require('fs');

let html = fs.readFileSync('public/index.html', 'utf8');

const oldHeader = `<div class="bg-indigo-900 text-white p-6 rounded-2xl shadow-md flex flex-col sm:flex-row justify-between sm:items-center gap-4">
                <div>
                    <span class="px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-indigo-700 text-indigo-200 border border-indigo-500/30">
                        Area Riservata Amministratore
                    </span>
                    <h1 class="text-2xl font-extrabold tracking-tight mt-1">Gestione Utenti & Credenziali Condòmini</h1>
                    <p class="text-xs text-indigo-200 mt-1">Crea nuovi accessi per i condòmini, assegna le unità immobiliari e gestisci i ruoli.</p>
                </div>
            </div>`;

const newHeader = `<div class="bg-indigo-900 text-white p-6 rounded-2xl shadow-md flex flex-col sm:flex-row justify-between sm:items-center gap-4">
                <div>
                    <span class="px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-indigo-700 text-indigo-200 border border-indigo-500/30">
                        Area Riservata Amministratore
                    </span>
                    <h1 class="text-2xl font-extrabold tracking-tight mt-1">Gestione Utenti & Credenziali Condòmini</h1>
                    <p class="text-xs text-indigo-200 mt-1">Crea nuovi accessi per i condòmini, assegna le unità immobiliari e gestisci i ruoli.</p>
                </div>
                <div class="space-x-2 no-print flex shrink-0 mt-4 sm:mt-0">
                    <button onclick="window.print()" class="px-4 py-2 bg-indigo-800 hover:bg-indigo-700 text-indigo-100 rounded-xl text-sm font-bold border border-indigo-600 transition-colors"><i class="fa-solid fa-print mr-2"></i>Stampa Pagina</button>
                    <button onclick="exportUsersExcel()" class="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-sm font-bold shadow-md transition-colors"><i class="fa-solid fa-file-excel mr-2"></i>Esporta Excel</button>
                </div>
            </div>`;

html = html.replace(oldHeader, newHeader);

// Optionally remove them from the table header if they were there, to avoid duplicates
const oldTableButtons = `<div class="space-x-2 no-print ml-auto flex">
                            <button onclick="window.print()" class="px-3 py-1.5 bg-slate-200 hover:bg-slate-300 text-slate-700 rounded-lg text-xs font-bold"><i class="fa-solid fa-print mr-1"></i>Stampa</button>
                            <button onclick="exportUsersExcel()" class="px-3 py-1.5 bg-emerald-100 hover:bg-emerald-200 text-emerald-700 rounded-lg text-xs font-bold"><i class="fa-solid fa-file-excel mr-1"></i>Esporta</button>
                        </div>`;
html = html.replace(oldTableButtons, '');

fs.writeFileSync('public/index.html', html);
console.log('Moved print and export buttons to the main header');
