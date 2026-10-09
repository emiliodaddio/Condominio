const fs = require('fs');
let html = fs.readFileSync('public/index.html', 'utf8');
const target = `<!-- Form Creazione Credenziali -->
                <div class="bg-white p-6 rounded-2xl border border-slate-200 shadow-xs">`;
const replacement = `<!-- Form Creazione Credenziali -->
                <div class="bg-white p-6 rounded-2xl border border-slate-200 shadow-xs no-print">`;

if(html.includes(target)) {
    html = html.replace(target, replacement);
    fs.writeFileSync('public/index.html', html);
    console.log('Added no-print class');
} else {
    console.log('Target not found, trying regex');
    const rx = /<div class="bg-white p-6 rounded-2xl border border-slate-200 shadow-xs">(\s*<h3 class="text-base font-bold text-slate-900 mb-1 flex items-center gap-2">\s*<i class="fa-solid fa-user-plus text-indigo-600"><\/i> Genera Nuove Credenziali)/;
    html = html.replace(rx, '<div class="bg-white p-6 rounded-2xl border border-slate-200 shadow-xs no-print">$1');
    fs.writeFileSync('public/index.html', html);
    console.log('Regex applied');
}
