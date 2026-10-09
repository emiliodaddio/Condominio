const fs = require('fs');
let app = fs.readFileSync('public/app_v4.js', 'utf8');

const regex = /async function openUnitaModal\(uId = null\) \{[\s\S]*?document\.getElementById\('unita-modal-title'\)\.textContent = u \? 'Modifica Unità' : 'Nuova Unità';/;

const replacement = `async function openUnitaModal(uId = null) {
    let u = null;
    if (uId && state.unitaList) {
        u = state.unitaList.find(x => x.id === uId);
    }

    // Carica la rubrica per i select
    try {
        const res = await fetch('/api/anagrafica-persone', { headers: getAuthHeaders() });
        const data = await res.json();
        if (data.success) {
            const selProp = document.getElementById('unita-proprietario');
            const selCond = document.getElementById('unita-conduttore');
            let opts = '<option value="">-- Seleziona --</option>';
            data.data.forEach(p => {
                opts += \`<option value="\${p.id}">\${p.cognome} \${p.nome} (\${p.ruolo_default})</option>\`;
            });
            if(selProp) selProp.innerHTML = opts;
            if(selCond) selCond.innerHTML = opts;
        }
    } catch(e) { console.error('Errore fetch rubrica', e); }

    document.getElementById('unita-modal-title').textContent = u ? 'Modifica Unità' : 'Nuova Unità';`;

app = app.replace(regex, replacement);
fs.writeFileSync('public/app_v4.js', app);
console.log('Fixed openUnitaModal syntax error');
