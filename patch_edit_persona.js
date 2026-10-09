const fs = require('fs');
let app = fs.readFileSync('public/app_v4.js', 'utf8');

app = app.replace('onclick="editPersona(${p.id})"', 'onclick="openPersonaModal(${p.id})"');

fs.writeFileSync('public/app_v4.js', app);
console.log('Fixed edit button in Rubrica table');
