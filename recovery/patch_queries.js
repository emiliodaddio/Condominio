const fs = require('fs');
let server = fs.readFileSync('server.js', 'utf8');

const targetQuery1 = "SELECT c.id, c.nome, uc.role, uc.unita FROM user_condominios uc JOIN condominios c ON uc.condominio_id = c.id WHERE uc.user_id = ?";
const newQuery = "SELECT c.id, c.nome, c.indirizzo, c.cf, c.scala, uc.role, uc.unita FROM user_condominios uc JOIN condominios c ON uc.condominio_id = c.id WHERE uc.user_id = ?";

server = server.split(targetQuery1).join(newQuery);

fs.writeFileSync('server.js', server);
console.log('Fixed server.js queries to return anagrafica');
