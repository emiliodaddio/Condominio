const fs = require('fs');
let html = fs.readFileSync('public/index.html', 'utf8');

const target = `                    <div>
                        <label class="block text-xs font-semibold text-slate-700 mb-1">Condòmino Destinatario *</label>
                        <select id="quote-user-id" required class="w-full px-3 py-2 text-xs rounded-xl border border-slate-300 bg-white"></select>
                    </div>`;

const replacement = `                    <div>
                        <label class="block text-xs font-semibold text-slate-700 mb-1">Intestatario Bolletta (dalla Rubrica) *</label>
                        <select id="quote-persona-id" required class="w-full px-3 py-2 text-xs rounded-xl border border-slate-300 bg-white"></select>
                    </div>
                    <div>
                        <label class="block text-xs font-semibold text-slate-700 mb-1">Riferimento Unità (Opzionale)</label>
                        <select id="quote-unita-id" class="w-full px-3 py-2 text-xs rounded-xl border border-slate-300 bg-white"></select>
                    </div>`;

// Since there could be a carriage return \r difference, let's use a regex replace
const regex = /<div>\s*<label class="block text-xs font-semibold text-slate-700 mb-1">Condòmino Destinatario \*<\/label>\s*<select id="quote-user-id" required class="w-full px-3 py-2 text-xs rounded-xl border border-slate-300 bg-white"><\/select>\s*<\/div>/;

if (regex.test(html)) {
    html = html.replace(regex, replacement);
    fs.writeFileSync('public/index.html', html);
    console.log('Fixed quote user id select in HTML');
} else {
    console.log('Regex did not match!');
}
