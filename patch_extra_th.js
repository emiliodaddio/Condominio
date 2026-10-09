const fs = require('fs');
let app = fs.readFileSync('public/app_v4.js', 'utf8');

app = app.replace('Cond&ograve;mino / Unit&agrave;</th></th>', 'Cond&ograve;mino / Unit&agrave;</th>');
app = app.replace('<th class="p-3">condomino / Conto</th>', '<th class="p-3">Cond&ograve;mino / Conto</th>');

fs.writeFileSync('public/app_v4.js', app);
console.log('Fixed extra th closing tag');
