const fs = require('fs');
let code = fs.readFileSync('public/app_v4.js', 'utf8');

const target1 = `            let payAction = isPaid
                ? '<span class="text-xs text-slate-400"><i class="fa-solid fa-check mr-1 text-emerald-500"></i> Saldata</span>'
                : \`<button onclick="markQuoteAsPaid(\${q.id})" class="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold shadow-2xs">Segna Pagato</button>\`;`;

const replacement1 = `            let payAction = isPaid
                ? '<span class="text-xs text-slate-400"><i class="fa-solid fa-check mr-1 text-emerald-500"></i> Saldata</span>'
                   + \` <button onclick="sendReceipt(\${q.id})" class="ml-1 px-2.5 py-1 bg-blue-100 hover:bg-blue-200 text-blue-700 rounded-lg text-xs font-bold shadow-2xs no-print" title="Invia Ricevuta PDF"><i class="fa-solid fa-file-invoice"></i></button>\`
                : \`<button onclick="markQuoteAsPaid(\${q.id})" class="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold shadow-2xs">Pagato</button>\`
                   + \` <button onclick="sendReminder(\${q.id})" class="ml-1 px-2.5 py-1 bg-rose-100 hover:bg-rose-200 text-rose-700 rounded-lg text-xs font-bold shadow-2xs no-print" title="Invia Sollecito PDF"><i class="fa-solid fa-bell"></i></button>\`;`;

code = code.replace(target1, replacement1);
fs.writeFileSync('public/app_v4.js', code);
