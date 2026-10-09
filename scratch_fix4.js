const fs = require('fs');

let server = fs.readFileSync('server.js', 'utf8');

// remove everything after `app.post('/api/quotes/:id/send-receipt'` and before `// Fallback Frontend SPA`
let startIdx = server.indexOf("app.post('/api/quotes/:id/send-receipt'");
let endIdx = server.indexOf("// Fallback Frontend SPA");
if (startIdx !== -1 && endIdx !== -1) {
    server = server.substring(0, startIdx) + server.substring(endIdx);
}

let feat = fs.readFileSync('fix_server_features.js', 'utf8');

// Find the start of newEndpoints
let nStartStr = 'const newEndpoints = `';
let nStart = feat.indexOf(nStartStr) + nStartStr.length;

// Find the end of newEndpoints string literal
let nEndStr = '`;\n    \n    if (idx !== -1)';
let nEnd = feat.indexOf(nEndStr);

if (nStart !== -1 && nEnd !== -1) {
    let rep2Raw = feat.substring(nStart, nEnd);
    let rep2 = rep2Raw.replace(/\\`/g, '`').replace(/\\\$/g, '$');
    
    // There might be L\'Amministrazione inside it, let's fix it if our unescape ruined it.
    // \\' becomes \' naturally in a template string, but we are just reading raw text.
    // We want L\'Amministrazione in the final code.
    rep2 = rep2.replace(/L\\\\'Amministrazione/g, "L\\'Amministrazione");
    
    let fallbackIdx = server.indexOf('// Fallback Frontend SPA');
    server = server.substring(0, fallbackIdx) + '\n' + rep2 + '\n' + server.substring(fallbackIdx);
    
    fs.writeFileSync('server.js', server);
    console.log("Properly appended send-receipt!");
} else {
    console.log("Could not find bounds", nStart, nEnd);
}
