const fs = require('fs');
let app = fs.readFileSync('public/app_v4.js', 'utf8');

app = app.replace(
    "document.getElementById('Condominio-nome').value", 
    "document.getElementById('condominio-nome').value"
);
app = app.replace(
    "document.getElementById('Condominio-indirizzo').value", 
    "document.getElementById('condominio-indirizzo').value"
);
app = app.replace(
    "document.getElementById('Condominio-cf').value", 
    "document.getElementById('condominio-cf').value"
);
app = app.replace(
    "document.getElementById('Condominio-scala').value", 
    "document.getElementById('condominio-scala').value"
);

fs.writeFileSync('public/app_v4.js', app);
console.log('Fixed loadCondominioData');
