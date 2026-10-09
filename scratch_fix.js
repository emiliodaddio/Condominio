const fs = require('fs');
let code = fs.readFileSync('server.js', 'utf8');
code = code.replace(/L\\\\'Amministrazione/g, "L\\'Amministrazione");
fs.writeFileSync('server.js', code);
console.log("Fixed!");
