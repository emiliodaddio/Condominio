const fs = require('fs');
let app = fs.readFileSync('public/app_v4.js', 'utf8');

app = app.replace('<div class="font-bold text-slate-900">${q.condomino_nome}</div>', '<div class="font-bold text-slate-900">${q.persona_cognome ? q.persona_cognome + \' \' + q.persona_nome : \'Sconosciuto\'}</div>');
app = app.replace('<div class="text-xs text-slate-500">${q.condomino_unita}</div>', '<div class="text-xs text-slate-500">${q.unita || \'\'}</div>');

fs.writeFileSync('public/app_v4.js', app);
console.log('Fixed q.condomino_nome in renderQuotesTable');
