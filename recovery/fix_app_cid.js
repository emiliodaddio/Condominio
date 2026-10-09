const fs = require('fs');
let code = fs.readFileSync('public/app.js', 'utf8');

code = code.replace(
    /const cId = localStorage\.getItem\('active_condominio_id'\);/g,
    "const cId = state.activeCondominioId || localStorage.getItem('active_condominio_id');"
);

fs.writeFileSync('public/app.js', code);
console.log('Fixed loadUnita activeCondominioId bug!');
