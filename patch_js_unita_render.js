const fs = require('fs');
let app = fs.readFileSync('public/app_v4.js', 'utf8');

const oldRow = `<td class="px-6 py-4">
                        <div class="font-bold text-slate-700">\${u.condomino_nome || 'Nessuno'}</div>
                        \${u.condomino_email ? \`<div class="text-[11px] text-slate-400">\${u.condomino_email}</div>\` : ''}
                    </td>`;
const newRow = `<td class="px-6 py-4">
                        <div class="font-bold text-slate-700">\${u.prop_cognome ? u.prop_cognome + ' ' + u.prop_nome : 'Nessuno'}</div>
                    </td>
                    <td class="px-6 py-4">
                        <div class="font-bold text-slate-700">\${u.cond_cognome ? u.cond_cognome + ' ' + u.cond_nome : '-'}</div>
                    </td>`;

app = app.replace(oldRow, newRow);

fs.writeFileSync('public/app_v4.js', app);
console.log('Fixed loadUnita table render');
