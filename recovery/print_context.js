const fs = require('fs');
let app = fs.readFileSync('public/app_v4.js', 'utf8');

const idx = app.indexOf("document.getElementById('condominio-nome')");
console.log(app.substring(Math.max(0, idx - 500), idx + 500));
