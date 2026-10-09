const fs = require('fs');
let server = fs.readFileSync('server.js', 'utf8');

server = server.replace(/Cond\ufffdmino/g, 'Condòmino');
server = server.replace(/cond\ufffdmini/g, 'condòmini');

fs.writeFileSync('server.js', server);
console.log('Fixed \\ufffd accents in server.js');
