const fs = require('fs');
let app = fs.readFileSync('public/app_v4.js', 'utf8');

app = app.replace('loadunita;', 'loadUnita();');
app = app.replace('loadunita()', 'loadUnita()');

fs.writeFileSync('public/app_v4.js', app);
console.log('Fixed loadUnita call in app_v4.js');
