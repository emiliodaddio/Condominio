const fs = require('fs');
let html = fs.readFileSync('public/index.html', 'utf8');

const target = `<!-- SEZIONE 1.3: ANAGRAFICA FORNITORI -->
            <div class="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden mb-8">`;
const replacement = `<!-- SEZIONE 1.3: ANAGRAFICA FORNITORI (Solo Admin) -->
            <div class="admin-only hidden bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden mb-8">`;

html = html.replace(target, replacement);
fs.writeFileSync('public/index.html', html);
