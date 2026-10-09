const fs = require('fs');
let code = fs.readFileSync('public/app_v4.js', 'utf8');

const targetStr = `        // Carica i dati della prima scheda
        loadAccountingData();
        loadTicketsBadge();`;

const newStr = `        // Carica i dati della prima scheda
        loadAccountingData();
        loadTicketsBadge();
        loadAnagrafica();`;

// Normalize line endings to do reliable replacement
code = code.replace(/\r\n/g, '\n');
const targetStrNorm = targetStr.replace(/\r\n/g, '\n');

if (code.includes(targetStrNorm)) {
    code = code.replace(targetStrNorm, newStr);
    fs.writeFileSync('public/app_v4.js', code);
    console.log("Successfully added loadAnagrafica to DOMContentLoaded!");
} else {
    console.log("Could not find target string.");
}
