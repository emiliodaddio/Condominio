const fs = require('fs');
let server = fs.readFileSync('server.js', 'utf8');

server = server.replace('db.run(`\n        db.run(`CREATE TABLE IF NOT EXISTS anagrafica_persone', 'db.run(`CREATE TABLE IF NOT EXISTS anagrafica_persone');

fs.writeFileSync('server.js', server);
console.log('Fixed syntax error in server.js');
