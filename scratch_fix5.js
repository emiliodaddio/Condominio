const fs = require('fs');

let server = fs.readFileSync('server.js', 'utf8');

let startIdx = server.indexOf("app.post('/api/quotes/:id/send-receipt'");
let endIdx = server.indexOf("// Fallback Frontend SPA");
if (startIdx !== -1 && endIdx !== -1) {
    server = server.substring(0, startIdx) + server.substring(endIdx);
}

let feat = fs.readFileSync('fix_server_features.js', 'utf8');

let nStartStr = 'const newEndpoints = `';
let nStart = feat.indexOf(nStartStr) + nStartStr.length;

let nEndStr = '`;\n    \n    if (idx !== -1)';
let nEnd = feat.indexOf(nEndStr);

if (nStart !== -1 && nEnd !== -1) {
    let rep2Raw = feat.substring(nStart, nEnd);
    let rep2 = rep2Raw.replace(/\\`/g, '`').replace(/\\\$/g, '$');
    
    // Fix escaped single quotes inside the string like dell\\'importo or L\\'Amministrazione
    rep2 = rep2.replace(/\\\\'/g, "\\'");
    
    let fallbackIdx = server.indexOf('// Fallback Frontend SPA');
    server = server.substring(0, fallbackIdx) + '\n' + rep2 + '\n' + server.substring(fallbackIdx);
    
    fs.writeFileSync('server.js', server);
    console.log("Properly appended send-receipt with unescaped single quotes!");
} else {
    console.log("Could not find bounds", nStart, nEnd);
}
