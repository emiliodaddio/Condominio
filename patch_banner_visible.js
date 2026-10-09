const fs = require('fs');
let html = fs.readFileSync('public/index.html', 'utf8');

html = html.replace('id="dash-condo-details-box" class="hidden inline-flex', 'id="dash-condo-details-box" class="inline-flex');
html = html.replace('<span id="dash-condo-indirizzo"></span>', '<span id="dash-condo-indirizzo">Caricamento indirizzo...</span>');
html = html.replace('<span id="dash-condo-cf"></span>', '<span id="dash-condo-cf">...</span>');
html = html.replace('<span id="dash-condo-scala"></span>', '<span id="dash-condo-scala">...</span>');

fs.writeFileSync('public/index.html', html);
console.log('Made banner visible by default');
