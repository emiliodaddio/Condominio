const fs = require('fs');
let html = fs.readFileSync('public/index.html', 'utf8');
html = html.replace('placeholder="Minimo 8 caratteri"', 'placeholder="Es: Condomino1! (8 car, 1 maiusc, 1 num, 1 spec)"');
fs.writeFileSync('public/index.html', html);
