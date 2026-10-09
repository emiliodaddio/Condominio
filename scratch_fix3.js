const fs = require('fs');

// 1. Clean up the truncated `server.js`
let server = fs.readFileSync('server.js', 'utf8');
// remove everything after `app.post('/api/quotes/:id/send-receipt'` and before `// Fallback Frontend SPA`
let startIdx = server.indexOf("app.post('/api/quotes/:id/send-receipt'");
let endIdx = server.indexOf("// Fallback Frontend SPA");
if (startIdx !== -1 && endIdx !== -1) {
    server = server.substring(0, startIdx) + server.substring(endIdx);
}

// 2. Properly get `newEndpoints` from `fix_server_features.js`
let feat = fs.readFileSync('fix_server_features.js', 'utf8');
// To extract the body of newEndpoints properly:
// It starts with const newEndpoints = `
// and ends with `;\n\nconst idx2
let nStart = feat.indexOf('const newEndpoints = `') + 22;
let nEnd = feat.lastIndexOf('`;\n\nconst idx2');
let rep2Raw = feat.substring(nStart, nEnd);
let rep2 = rep2Raw.replace(/\\`/g, '`').replace(/\\\$/g, '$'); // Unescape

// 3. Inject it back
let fallbackIdx = server.indexOf('// Fallback Frontend SPA');
server = server.substring(0, fallbackIdx) + '\n' + rep2 + '\n' + server.substring(fallbackIdx);

fs.writeFileSync('server.js', server);
console.log("Properly appended send-receipt!");
