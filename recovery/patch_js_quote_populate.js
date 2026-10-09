const fs = require('fs');
let app = fs.readFileSync('public/app_v4.js', 'utf8');

const oldPopulate = `function populateQuoteUsersSelect() {
    const selPersona = document.getElementById('quote-persona-id');
    const selUnita = document.getElementById('quote-unita-id');
    
    if (selPersona && state.anagraficaPersone) {
        selPersona.innerHTML = '<option value="">-- Seleziona Intestatario --</option>' + 
            state.anagraficaPersone.map(p => \`<option value="\${p.id}">\${p.cognome} \${p.nome}</option>\`).join('');
    }
    
    if (selUnita && state.unitaList) {
        selUnita.innerHTML = '<option value="">-- Nessuna Unità Specifica --</option>' + 
            state.unitaList.map(u => \`<option value="\${u.id}">\${u.identificativo} (\${u.tipo})</option>\`).join('');
    }
}`;

const newPopulate = `async function populateQuoteUsersSelect() {
    const selPersona = document.getElementById('quote-persona-id');
    const selUnita = document.getElementById('quote-unita-id');
    
    // Fetch if missing
    if (!state.anagraficaPersone) {
        try {
            const res = await fetch('/api/anagrafica-persone', { headers: getAuthHeaders() });
            const data = await res.json();
            if (data.success) state.anagraficaPersone = data.data;
        } catch(e) {}
    }
    if (!state.unitaList) {
        try {
            const res = await fetch('/api/unita', { headers: getAuthHeaders() });
            const data = await res.json();
            if (data.success) state.unitaList = data.data;
        } catch(e) {}
    }

    if (selPersona && state.anagraficaPersone) {
        selPersona.innerHTML = '<option value="">-- Seleziona Intestatario --</option>' + 
            state.anagraficaPersone.map(p => \`<option value="\${p.id}">\${p.cognome} \${p.nome}</option>\`).join('');
    }
    
    if (selUnita && state.unitaList) {
        selUnita.innerHTML = '<option value="">-- Nessuna Unità Specifica --</option>' + 
            state.unitaList.map(u => \`<option value="\${u.id}">\${u.identificativo} (\${u.tipo})</option>\`).join('');
    }
}`;

app = app.replace(oldPopulate, newPopulate);
fs.writeFileSync('public/app_v4.js', app);
console.log('Fixed populateQuoteUsersSelect to fetch missing data');
