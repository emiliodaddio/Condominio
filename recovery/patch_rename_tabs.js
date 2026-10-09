const fs = require('fs');
let html = fs.readFileSync('public/index.html', 'utf8');

// Rename the tab buttons
html = html.replace('<span>Anagrafica & Millesimi</span>', '<span>Unità Immobiliari</span>');
html = html.replace('<span>Anagrafica</span>', '<span>Profilo & Rubrica</span>');

fs.writeFileSync('public/index.html', html);
console.log('Renamed tabs in index.html');
