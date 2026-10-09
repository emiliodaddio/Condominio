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

const regexTableRow = /<td class="px-6 py-4">\\s*<div class="flex items-center space-x-3">\\s*<div class="w-8 h-8 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center font-bold text-xs">\\s*\\$\\{u\\.user_nome \? u\\.user_nome\\[0\\]\\.toUpperCase\(\) : '\\?'\\}\\s*<\\/div>\\s*<div>\\s*<div class="font-bold text-slate-800">\\$\\{u\\.user_nome \|\| 'Nessuno'\\}<\\/div>\\s*<div class="text-\\[11px\\] text-slate-400">\\$\\{u\\.user_email \|\| 'Nessuna mail'\\}<\\/div>\\s*<\\/div>\\s*<\\/div>\\s*<\\/td>/;

// For the table row render, we'll replace the Condomino column with Proprietario and Conduttore columns.
app = app.replace(/<td class="px-6 py-4">\s*<div class="flex items-center space-x-3">\s*<div class="w-8 h-8 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center font-bold text-xs">\s*\$\{u\.user_nome \? u\.user_nome\[0\]\.toUpperCase\(\) : \'\?\'\}\s*<\/div>\s*<div>\s*<div class="font-bold text-slate-800">\$\{u\.user_nome \|\| \'Nessuno\'\}<\/div>\s*<div class="text-\[11px\] text-slate-400">\$\{u\.user_email \|\| \'Nessuna mail\'\}<\/div>\s*<\/div>\s*<\/div>\s*<\/td>/, 
`
<td class="px-6 py-4 font-bold text-slate-800">\${u.prop_cognome ? u.prop_cognome + ' ' + u.prop_nome : '-'}</td>
<td class="px-6 py-4 text-slate-600">\${u.cond_cognome ? u.cond_cognome + ' ' + u.cond_nome : '-'}</td>
`);

fs.writeFileSync('public/app_v4.js', app);
console.log('Updated Unita Modal JS and Table render');
