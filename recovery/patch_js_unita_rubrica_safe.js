const fs = require('fs');
let app = fs.readFileSync('public/app_v4.js', 'utf8');

const regexOpenUnita = /const select = document\.getElementById\('unita-user-id'\);[\s\S]*?\}/;
const newSelectPopulate = `
            const selProp = document.getElementById('unita-proprietario');
            const selCond = document.getElementById('unita-conduttore');
            let opts = '<option value="">-- Seleziona --</option>';
            data.data.forEach(p => {
                opts += \`<option value="\${p.id}">\${p.cognome} \${p.nome} (\${p.ruolo_default})</option>\`;
            });
            if(selProp) selProp.innerHTML = opts;
            if(selCond) selCond.innerHTML = opts;
        }
    } catch(e) { console.error('Errore fetch rubrica', e); }`;

app = app.replace(regexOpenUnita, newSelectPopulate);
app = app.replace("const res = await fetch('/api/users', { headers: getAuthHeaders() });", "const res = await fetch('/api/anagrafica-persone', { headers: getAuthHeaders() });");
app = app.replace("document.getElementById('unita-user-id').value = u ? (u.user_id || '') : '';", "if(document.getElementById('unita-proprietario')) document.getElementById('unita-proprietario').value = u ? (u.proprietario_id || '') : '';\n    if(document.getElementById('unita-conduttore')) document.getElementById('unita-conduttore').value = u ? (u.conduttore_id || '') : '';");

const regexSaveUnitaBody = /user_id: document\.getElementById\('unita-user-id'\)\.value \? parseInt\(document\.getElementById\('unita-user-id'\)\.value\) : null/;
const newSaveUnitaBody = `proprietario_id: document.getElementById('unita-proprietario') && document.getElementById('unita-proprietario').value ? parseInt(document.getElementById('unita-proprietario').value) : null,
        conduttore_id: document.getElementById('unita-conduttore') && document.getElementById('unita-conduttore').value ? parseInt(document.getElementById('unita-conduttore').value) : null`;
app = app.replace(regexSaveUnitaBody, newSaveUnitaBody);

const regexTableUnitaBody = /<th class="px-6 py-4 font-bold">Condòmino<\/th>/;
const newTableUnitaBody = `<th class="px-6 py-4 font-bold">Proprietario</th>\n<th class="px-6 py-4 font-bold">Conduttore</th>`;
app = app.replace(regexTableUnitaBody, newTableUnitaBody);

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
console.log('Updated Unita Modal JS and Table render safely');
