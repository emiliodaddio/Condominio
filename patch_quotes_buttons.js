const fs = require('fs');

let appJS = fs.readFileSync('public/app_v4.js', 'utf8');

const targetHeader = `<th class="py-3.5 px-4 text-center">Azione Saldo</th>`;
const replacementHeader = `<th class="py-3.5 px-4 text-center">Azioni</th>`;

appJS = appJS.replace(targetHeader, replacementHeader);

const targetButtons = `let payAction = isPaid
                ? '<span class="text-xs text-slate-400"><i class="fa-solid fa-check mr-1 text-emerald-500"></i> Saldata</span>'
                : \`<button onclick="markQuoteAsPaid(\${q.id})" class="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold shadow-2xs">Segna Pagato</button>\`;
            payAction += \` <button onclick="editQuote(\${q.id})" class="ml-1 px-2.5 py-1 bg-amber-500 hover:bg-amber-600 text-white rounded-lg text-xs font-bold shadow-2xs no-print"><i class="fa-solid fa-pen"></i></button>\`;`;

const replacementButtons = `let payAction = isPaid
                ? '<span class="text-xs text-slate-400"><i class="fa-solid fa-check mr-1 text-emerald-500"></i> Saldata</span>'
                : \`<button onclick="markQuoteAsPaid(\${q.id})" class="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold shadow-2xs no-print">Saldato</button>\`;
            
            if (isPaid) {
                payAction += \` <button onclick="sendReceipt(\${q.id})" class="ml-1 px-2.5 py-1 bg-blue-500 hover:bg-blue-600 text-white rounded-lg text-xs font-bold shadow-2xs no-print" title="Invia Ricevuta via Email"><i class="fa-solid fa-envelope"></i> Ricevuta</button>\`;
            } else {
                payAction += \` <button onclick="sendReminder(\${q.id})" class="ml-1 px-2.5 py-1 bg-rose-500 hover:bg-rose-600 text-white rounded-lg text-xs font-bold shadow-2xs no-print" title="Invia Sollecito di Pagamento"><i class="fa-solid fa-bell"></i> Sollecito</button>\`;
            }
            
            payAction += \` <button onclick="editQuote(\${q.id})" class="ml-1 px-2.5 py-1 bg-amber-500 hover:bg-amber-600 text-white rounded-lg text-xs font-bold shadow-2xs no-print" title="Modifica"><i class="fa-solid fa-pen"></i></button>\`;`;

if (appJS.includes(targetButtons)) {
    appJS = appJS.replace(targetButtons, replacementButtons);
    fs.writeFileSync('public/app_v4.js', appJS);
    console.log('Successfully injected action buttons for quotes');
} else {
    console.log('Target buttons not found in app_v4.js');
}
