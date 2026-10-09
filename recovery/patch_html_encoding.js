const fs = require('fs');
let html = fs.readFileSync('public/index.html', 'utf8');

// Replace corrupted characters
html = html.replace(/Unit/g, 'Unit&agrave;');
html = html.replace(/Condmino/g, 'Cond&ograve;mino');

fs.writeFileSync('public/index.html', html);
console.log('Fixed encoding in tab-unita HTML');
