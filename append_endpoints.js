const fs = require('fs');

let server = fs.readFileSync('server.js', 'utf8');

let log2 = fs.readFileSync('fix_server_log2.js', 'utf8');
let rep1 = log2.substring(log2.indexOf('const replacement = `') + 21, log2.indexOf('`;', log2.indexOf('const replacement = `')));

let feat = fs.readFileSync('fix_server_features.js', 'utf8');
let rep2 = feat.substring(feat.indexOf('const newEndpoints = `') + 22, feat.indexOf('`;', feat.indexOf('const newEndpoints = `')));

let fallbackIdx = server.indexOf('// Fallback Frontend SPA');
if (fallbackIdx !== -1) {
    server = server.substring(0, fallbackIdx) + '\n' + rep1 + '\n' + rep2 + '\n' + server.substring(fallbackIdx);
    fs.writeFileSync('server.js', server);
    console.log('Appended missing endpoints!');
} else {
    console.log('Fallback not found!');
}
