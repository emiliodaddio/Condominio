const fs = require('fs');
let app = fs.readFileSync('public/app_v4.js', 'utf8');

// Use HTML entities to be completely safe against encoding corruptions
app = app.replace(/Cond.mino \/ Unit./g, 'Cond&ograve;mino / Unit&agrave;</th>');

// Wait! In the regex I am matching the corrupted string. 
// "Condmino / Unit"
// Let's just match the whole th tag
app = app.replace(/<th class="py-3\.5 px-4">Cond[^<]*<\/th>/g, '<th class="py-3.5 px-4">Cond&ograve;mino / Unit&agrave;</th>');

fs.writeFileSync('public/app_v4.js', app);
console.log('Fixed encoding in table header');
