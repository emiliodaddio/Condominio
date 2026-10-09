const fs = require('fs');

let html = fs.readFileSync('public/index.html', 'utf8');

const pwRegex = /<label class="block text-xs font-bold text-slate-700 mb-1">Password Iniziale \*<\/label>\s*<input type="password" id="new-user-password" required placeholder="Minimo 8 caratteri" \s*class="w-full px-3 py-2 text-xs rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-500">/;

const pwNew = `<label class="block text-xs font-bold text-slate-700 mb-1">Password Iniziale *</label>
                            <div class="relative">
                                <input type="password" id="new-user-password" required placeholder="Minimo 8 caratteri" class="w-full px-3 py-2 text-xs rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-500 pr-10">
                                <button type="button" onclick="togglePasswordVisibility('new-user-password', 'eye-icon-new-user')" class="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-400 hover:text-slate-600">
                                    <i id="eye-icon-new-user" class="fa-solid fa-eye"></i>
                                </button>
                            </div>`;

if(pwRegex.test(html)) {
    html = html.replace(pwRegex, pwNew);
    console.log('Password replaced');
} else {
    console.log('Password NOT replaced');
}

const catRegex = /<label class="block text-xs font-bold text-slate-700 mb-1">Dati Catastali \(Sez, Fg, Part, Sub\)<\/label>\s*<input type="text" id="new-user-catasto" placeholder="Es\. Fg\. 10, Part\. 100, Sub 5" class="w-full px-3 py-2 text-xs rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-500">/;

const catNew = `<label class="block text-xs font-bold text-slate-700 mb-1">Dati Catastali</label>
                            <div class="grid grid-cols-4 gap-2">
                                <input type="text" id="new-user-catasto-sez" placeholder="Sez." class="w-full px-2 py-2 text-xs rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-500">
                                <input type="text" id="new-user-catasto-fg" placeholder="Fg." class="w-full px-2 py-2 text-xs rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-500">
                                <input type="text" id="new-user-catasto-part" placeholder="Part." class="w-full px-2 py-2 text-xs rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-500">
                                <input type="text" id="new-user-catasto-sub" placeholder="Sub." class="w-full px-2 py-2 text-xs rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-500">
                            </div>`;

if(catRegex.test(html)) {
    html = html.replace(catRegex, catNew);
    console.log('Catasto replaced');
} else {
    console.log('Catasto NOT replaced');
}

fs.writeFileSync('public/index.html', html);
