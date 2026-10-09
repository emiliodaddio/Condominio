const fs = require('fs');
let html = fs.readFileSync('public/index.html', 'utf8');

html = html.replace(/Unit&agrave;a/g, 'Unita');
html = html.replace(/unit&agrave;a/g, 'unita');

fs.writeFileSync('public/index.html', html);
console.log('Fixed broken HTML function names');
