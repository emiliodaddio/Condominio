const fs = require('fs');
let app = fs.readFileSync('public/app_v4.js', 'utf8');

const targetStr = `document.getElementById('condominio-nome').value = data.data.nome || '';
            document.getElementById('condominio-indirizzo').value = data.data.indirizzo || '';
            document.getElementById('condominio-cf').value = data.data.cf || '';
            document.getElementById('condominio-scala').value = data.data.scala || '';`;

const replacementStr = `document.getElementById('condominio-nome').value = data.data.nome || '';
            document.getElementById('condominio-indirizzo').value = data.data.indirizzo || '';
            document.getElementById('condominio-cf').value = data.data.cf || '';
            document.getElementById('condominio-scala').value = data.data.scala || '';
            
            document.getElementById('dash-condo-nome').textContent = (data.data.nome || 'CONDOMINIO').toUpperCase();
            if (data.data.indirizzo || data.data.cf) {
                document.getElementById('dash-condo-details-box').classList.remove('hidden');
                document.getElementById('dash-condo-indirizzo').textContent = data.data.indirizzo || 'N/D';
                document.getElementById('dash-condo-cf').textContent = data.data.cf || 'N/D';
                document.getElementById('dash-condo-scala').textContent = data.data.scala || 'Unica';
            }`;

app = app.replace(targetStr, replacementStr);

// I should also call loadCondominioData() when the user enters the Dashboard!
// Currently, loadCondominioData() is probably only called when switching to tab-anagrafica?
// Let's add it to switchTab('dashboard').
const switchTabRegex = /if \(tabId === 'dashboard'\) \{[\s\S]*?\}/;
if (app.match(switchTabRegex)) {
    const match = app.match(switchTabRegex)[0];
    const newMatch = match.replace("}", "    loadCondominioData();\n}");
    app = app.replace(match, newMatch);
}

// And call it initially in setupUIForRole or DOMContentLoaded if it's not already called.
// Actually, it's safer to just inject it at the end of setupUIForRole:
app = app.replace("updateNavActive(state.currentTab || 'dashboard');", "updateNavActive(state.currentTab || 'dashboard');\n    loadCondominioData();");

fs.writeFileSync('public/app_v4.js', app);
console.log('Successfully updated JS');
