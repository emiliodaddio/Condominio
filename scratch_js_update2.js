const fs = require('fs');

let js = fs.readFileSync('public/app_v4.js', 'utf8');

const targetStr = `        // Carica i dati della prima scheda
        loadAccountingData();
        loadTicketsBadge();`;

const newStr = `        // Carica i dati della prima scheda
        loadAccountingData();
        loadTicketsBadge();
        loadAnagrafica(); // Always load dashboard banner data`;

if (js.includes(targetStr)) {
    js = js.replace(targetStr, newStr);
    fs.writeFileSync('public/app_v4.js', js);
    console.log("JS Updated to loadAnagrafica on init!");
} else {
    console.log("Could not find target string in app_v4.js for init load");
}
