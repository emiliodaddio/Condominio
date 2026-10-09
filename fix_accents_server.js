const fs = require('fs');
let server = fs.readFileSync('server.js', 'utf8');

server = server.replace(/Cond\?mino/g, 'Condòmino');
server = server.replace(/Condmino/g, 'Condòmino');
server = server.replace(/cond\?mini/g, 'condòmini');
server = server.replace(/condmini/g, 'condòmini');
server = server.replace(/pu/g, 'può');
server = server.replace(/qualit/g, 'qualità');
server = server.replace(/societ/g, 'società');
server = server.replace(/Sar\?/g, 'Sarà');
server = server.replace(/sar\?/g, 'sarà');
server = server.replace(/proprietà\?/g, 'proprietà');
server = server.replace(/verr\?/g, 'verrà');

fs.writeFileSync('server.js', server);
console.log('Fixed accents in server.js');
