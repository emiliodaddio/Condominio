const fs = require('fs');

// 1. Update index.html
let html = fs.readFileSync('public/index.html', 'utf8');

const oldHtml = `<div>
                            <label class="block text-xs font-bold text-slate-700 mb-1">Password Iniziale *</label>
                            <input type="password" id="new-user-password" required placeholder="Minimo 8 caratteri" 
                                class="w-full px-3 py-2 text-xs rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-500">
                        </div>

                        <div>
                            <label class="block text-xs font-bold text-slate-700 mb-1">Unità Immobiliare / Scala</label>
                            <input type="text" id="new-user-unita" placeholder="Es: Scala B - Int. 6" 
                                class="w-full px-3 py-2 text-xs rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-500">
                        </div>
                        <div>
                            <label class="block text-xs font-bold text-slate-700 mb-1">Telefono</label>
                            <input type="text" id="new-user-telefono" placeholder="Es. 333 1234567" class="w-full px-3 py-2 text-xs rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-500">
                        </div>
                        <div>
                            <label class="block text-xs font-bold text-slate-700 mb-1">Dati Catastali (Sez, Fg, Part, Sub)</label>
                            <input type="text" id="new-user-catasto" placeholder="Es. Fg. 10, Part. 100, Sub 5" class="w-full px-3 py-2 text-xs rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-500">
                        </div>`;

const newHtml = `<div>
                            <label class="block text-xs font-bold text-slate-700 mb-1">Password Iniziale *</label>
                            <div class="relative">
                                <input type="password" id="new-user-password" required placeholder="Minimo 8 caratteri" 
                                    class="w-full px-3 py-2 text-xs rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-500 pr-10">
                                <button type="button" onclick="togglePasswordVisibility('new-user-password', 'eye-icon-new-user')" class="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-400 hover:text-slate-600">
                                    <i id="eye-icon-new-user" class="fa-solid fa-eye"></i>
                                </button>
                            </div>
                        </div>

                        <div>
                            <label class="block text-xs font-bold text-slate-700 mb-1">Unità Immobiliare / Scala</label>
                            <input type="text" id="new-user-unita" placeholder="Es: Scala B - Int. 6" 
                                class="w-full px-3 py-2 text-xs rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-500">
                        </div>
                        <div>
                            <label class="block text-xs font-bold text-slate-700 mb-1">Telefono</label>
                            <input type="text" id="new-user-telefono" placeholder="Es. 333 1234567" class="w-full px-3 py-2 text-xs rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-500">
                        </div>
                        <div class="col-span-full">
                            <label class="block text-xs font-bold text-slate-700 mb-1">Dati Catastali</label>
                            <div class="grid grid-cols-4 gap-2">
                                <input type="text" id="new-user-catasto-sez" placeholder="Sez." class="w-full px-3 py-2 text-xs rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-500">
                                <input type="text" id="new-user-catasto-fg" placeholder="Fg." class="w-full px-3 py-2 text-xs rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-500">
                                <input type="text" id="new-user-catasto-part" placeholder="Part." class="w-full px-3 py-2 text-xs rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-500">
                                <input type="text" id="new-user-catasto-sub" placeholder="Sub." class="w-full px-3 py-2 text-xs rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-500">
                            </div>
                        </div>`;

if(html.includes('Dati Catastali (Sez, Fg, Part, Sub)')) {
    html = html.replace(oldHtml, newHtml);
    fs.writeFileSync('public/index.html', html);
    console.log('Updated index.html');
} else {
    console.log('Could not find old HTML in index.html, using regex...');
    const re = /<div>\s*<label class="block text-xs font-bold text-slate-700 mb-1">Password Iniziale \*<\/label>[\s\S]*?<input type="text" id="new-user-catasto"[\s\S]*?<\/div>/;
    html = html.replace(re, newHtml);
    fs.writeFileSync('public/index.html', html);
    console.log('Updated index.html with regex');
}

// 2. Update app_v4.js
let app = fs.readFileSync('public/app_v4.js', 'utf8');

const oldJs = `const dati_catastali = document.getElementById('new-user-catasto').value.trim();
    const role = document.getElementById('new-user-role').value;`;

const newJs = `const sez = document.getElementById('new-user-catasto-sez').value.trim();
    const fg = document.getElementById('new-user-catasto-fg').value.trim();
    const part = document.getElementById('new-user-catasto-part').value.trim();
    const sub = document.getElementById('new-user-catasto-sub').value.trim();
    let dcArr = [];
    if(sez) dcArr.push(\`Sez. \${sez}\`);
    if(fg) dcArr.push(\`Fg. \${fg}\`);
    if(part) dcArr.push(\`Part. \${part}\`);
    if(sub) dcArr.push(\`Sub. \${sub}\`);
    const dati_catastali = dcArr.join(', ');
    
    const role = document.getElementById('new-user-role').value;`;

app = app.replace(oldJs, newJs);

// Fix unitarole bug
app = app.replace('JSON.stringify({ nome, email, password, unitarole, telefono, dati_catastali })', 'JSON.stringify({ nome, email, password, unita, role, telefono, dati_catastali })');

// Add togglePasswordVisibility function
if (!app.includes('togglePasswordVisibility')) {
    const fn = `
window.togglePasswordVisibility = function(inputId, iconId) {
    const input = document.getElementById(inputId);
    const icon = document.getElementById(iconId);
    if (input.type === 'password') {
        input.type = 'text';
        icon.classList.remove('fa-eye');
        icon.classList.add('fa-eye-slash');
    } else {
        input.type = 'password';
        icon.classList.remove('fa-eye-slash');
        icon.classList.add('fa-eye');
    }
};
`;
    app += fn;
}

fs.writeFileSync('public/app_v4.js', app);
console.log('Updated app_v4.js');
