const fs = require('fs');
let code = fs.readFileSync('server.js', 'utf8');

const anchor = "app.get('/api/assemblies/convocations-log', authenticateToken, requireCondominio, isAdmin, (req, res) => {";
const idx = code.indexOf(anchor);

if (idx !== -1) {
    let top = code.substring(0, idx);
    let bottom = code.substring(idx);
    
    // Replace \` with `
    bottom = bottom.replace(/\\`/g, '`');
    // Replace \$ with $
    bottom = bottom.replace(/\\\$/g, '$');
    
    fs.writeFileSync('server.js', top + bottom);
    console.log("Fixed backticks and dollars!");
} else {
    console.log("Could not find anchor");
}
