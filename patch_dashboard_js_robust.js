const fs = require('fs');
let app = fs.readFileSync('public/app_v4.js', 'utf8');

const regex = /document\.getElementById\('condominio-nome'\)\.value[\s\S]*?document\.getElementById\('condominio-scala'\)\.value = data\.data\.scala \|\| '';/;

const replacementStr = `document.getElementById('condominio-nome').value = data.data.nome || '';
            document.getElementById('condominio-indirizzo').value = data.data.indirizzo || '';
            document.getElementById('condominio-cf').value = data.data.cf || '';
            document.getElementById('condominio-scala').value = data.data.scala || '';
            
            const dashNome = document.getElementById('dash-condo-nome');
            if(dashNome) dashNome.textContent = (data.data.nome || 'CONDOMINIO').toUpperCase();
            
            const dashBox = document.getElementById('dash-condo-details-box');
            if(dashBox && (data.data.indirizzo || data.data.cf)) {
                dashBox.classList.remove('hidden');
                document.getElementById('dash-condo-indirizzo').textContent = data.data.indirizzo || 'N/D';
                document.getElementById('dash-condo-cf').textContent = data.data.cf || 'N/D';
                document.getElementById('dash-condo-scala').textContent = data.data.scala || 'Unica';
            }`;

if (app.match(regex)) {
    app = app.replace(regex, replacementStr);
    fs.writeFileSync('public/app_v4.js', app);
    console.log('Fixed loadCondominioData');
} else {
    console.log('Regex did not match');
}
