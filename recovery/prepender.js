const fs = require('fs');
let s1 = fs.readFileSync('build_server_1.js', 'utf8');
let s2 = fs.readFileSync('build_server_2.js', 'utf8');
let s3 = fs.readFileSync('build_server_3.js', 'utf8');

// Extract lines 1 to 74 of build_server_3
let s3_top = s3.split('\n').slice(0, 74).join('\n');

let top_code = s1 + '\n' + s2 + '\n' + s3_top + '\n';

let server_current = fs.readFileSync('server.js', 'utf8');

// The current server.js starts with "// ---------------------------------------------------------\n// INVIO RICEVUTA PAGAMENTO"
// We want to prepend the top_code before "app.put('/api/quotes/:id'"
let anchor = "app.put('/api/quotes/:id'";
let anchorIdx = server_current.indexOf(anchor);

if (anchorIdx !== -1) {
    // There is some junk at the very top (the // INVIO RICEVUTA PAGAMENTO part), let's ignore the junk and just prepend to the anchor.
    // Wait, the INVIO RICEVUTA PAGAMENTO comment might be useful, we can keep it.
    let full_code = top_code + '\n' + server_current.substring(anchorIdx - 120); // To include the comment block
    fs.writeFileSync('server.js', full_code);
    console.log('Successfully recovered the top of server.js!');
} else {
    console.log('Anchor not found in server.js');
}
