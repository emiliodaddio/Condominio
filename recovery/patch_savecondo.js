const fs = require('fs');
let app = fs.readFileSync('public/app_v4.js', 'utf8');

app = app.replace(
    "nome: document.getElementById('Condominio-nome').value,", 
    "nome: document.getElementById('condominio-nome').value,"
);
app = app.replace(
    "indirizzo: document.getElementById('Condominio-indirizzo').value,", 
    "indirizzo: document.getElementById('condominio-indirizzo').value,"
);
app = app.replace(
    "cf: document.getElementById('Condominio-cf').value,", 
    "cf: document.getElementById('condominio-cf').value,"
);
app = app.replace(
    "scala: document.getElementById('Condominio-scala').value,", 
    "scala: document.getElementById('condominio-scala').value,"
);
app = app.replace(
    "fetch('/api/Condominio', {", 
    "fetch('/api/condominio', {"
);

fs.writeFileSync('public/app_v4.js', app);
console.log('Fixed handleSaveCondominio');
