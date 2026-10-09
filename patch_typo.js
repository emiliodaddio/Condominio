const fs = require('fs');
let app = fs.readFileSync('public/app_v4.js', 'utf8');

app = app.replace('<th class="py-3.5 px-4">condomino / unitath>', '<th class="py-3.5 px-4">Condòmino / Unità</th>');

fs.writeFileSync('public/app_v4.js', app);
console.log('Fixed unitath> typo');
