const fs = require('fs');
let server = fs.readFileSync('server.js', 'utf8');

server = server.replace(/as creator_unit/g, 'as creator_unita');

fs.writeFileSync('server.js', server);
console.log('Fixed creator_unita in server.js');
