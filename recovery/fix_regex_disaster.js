const fs = require('fs');
let server = fs.readFileSync('server.js', 'utf8');

server = server.replace(/puòblic/g, 'public');
server = server.replace(/puòò/g, 'può');
server = server.replace(/app\.puòt/g, 'app.put');
server = server.replace(/\.puòsh/g, '.push');
server = server.replace(/puòppeteer/g, 'puppeteer');
server = server.replace(/puòoi/g, 'puoi');

fs.writeFileSync('server.js', server);
console.log('Fixed my regex disaster!');
