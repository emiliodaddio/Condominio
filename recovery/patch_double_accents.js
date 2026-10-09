const fs = require('fs');
let html = fs.readFileSync('public/index.html', 'utf8');

html = html.replace(/Unit&agrave;à/g, 'Unità');
html = html.replace(/Unit&agrave;/g, 'Unità');
html = html.replace(/Cond&ograve;mino/g, 'Condòmino');

fs.writeFileSync('public/index.html', html);
console.log('Fixed double accents in HTML');
