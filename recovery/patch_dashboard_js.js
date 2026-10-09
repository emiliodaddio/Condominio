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
            
            // Popola Banner Dashboard
            document.getElementById('dash-condo-nome').textContent = (data.data.nome || 'CONDOMINIO').toUpperCase();
            if (data.data.indirizzo || data.data.cf) {
                document.getElementById('dash-condo-details-box').classList.remove('hidden');
                document.getElementById('dash-condo-indirizzo').textContent = data.data.indirizzo || 'N/D';
                document.getElementById('dash-condo-cf').textContent = data.data.cf || 'N/D';
                document.getElementById('dash-condo-scala').textContent = data.data.scala || 'Unica';
            }`;

if (app.includes(targetStr)) {
    app = app.replace(targetStr, replacementStr);
    fs.writeFileSync('public/app_v4.js', app);
    console.log('Updated app_v4.js loadCondominioData');
} else {
    console.log('Target string not found in app_v4.js');
}
