const fs = require('fs');
let html = fs.readFileSync('public/index.html', 'utf8');

// The string was corrupted because PowerShell Set-Content uses Windows-1252 by default.
// Let's replace the corrupted characters with their UTF-8 equivalents using char codes or just correctly encoded node script.

html = html.replace(/Cond\ufffdmino/g, 'Condòmino');
html = html.replace(/CondÃ²mino/g, 'Condòmino');
html = html.replace(/cond\ufffdmino/g, 'condòmino');
html = html.replace(/condÃ²mino/g, 'condòmino');
html = html.replace(/Finalit\ufffd/g, 'Finalità');
html = html.replace(/FinalitÃ /g, 'Finalità ');
html = html.replace(/finalit\ufffd/g, 'finalità');
html = html.replace(/finalitÃ /g, 'finalità ');
html = html.replace(/ \ufffd /g, ' è ');
html = html.replace(/ Ã¨ /g, ' è ');
html = html.replace(/sar\ufffd/g, 'sarà');
html = html.replace(/sarÃ /g, 'sarà ');

fs.writeFileSync('public/index.html', html);
