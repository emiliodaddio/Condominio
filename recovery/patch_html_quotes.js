const fs = require('fs');
let html = fs.readFileSync('public/index.html', 'utf8');

const oldQuoteForm = `<form id="form-new-quote" onsubmit="handleCreateQuote(event)" class="p-6 space-y-4">
                    <div>
                        <label class="block text-xs font-bold text-slate-700 mb-1">Condòmino / Unità</label>
                        <select id="quote-user-id" required class="w-full p-2 border rounded-xl bg-slate-50">
                        </select>
                    </div>`;

const newQuoteForm = `<form id="form-new-quote" onsubmit="handleCreateQuote(event)" class="p-6 space-y-4">
                    <div>
                        <label class="block text-xs font-bold text-slate-700 mb-1">Intestatario Bolletta (dalla Rubrica)</label>
                        <select id="quote-persona-id" required class="w-full p-2 border rounded-xl bg-slate-50">
                        </select>
                    </div>
                    <div>
                        <label class="block text-xs font-bold text-slate-700 mb-1">Riferimento Unità (Opzionale)</label>
                        <select id="quote-unita-id" class="w-full p-2 border rounded-xl bg-slate-50">
                        </select>
                    </div>`;

html = html.replace(oldQuoteForm, newQuoteForm);

// Also fix table headers for quotes and receivables
html = html.replace('<th class="px-6 py-4 font-bold">Condòmino / Unit&agrave;</th>', '<th class="px-6 py-4 font-bold">Intestatario / Unità</th>');
html = html.replace('<th class="py-3 px-4">Condòmino</th>', '<th class="py-3 px-4">Intestatario</th>');

fs.writeFileSync('public/index.html', html);
console.log('Updated index.html for quotes');
