const fs = require('fs');
let app = fs.readFileSync('public/app_v4.js', 'utf8');

const target = "if (tabId === 'accounting') loadAccountingData();";
const replacement = "if (tabId === 'accounting') loadAccountingData();\n    if (tabId === 'dashboard') loadAnagrafica();";

if (app.includes(target)) {
    app = app.replace(target, replacement);
    fs.writeFileSync('public/app_v4.js', app);
    console.log('Successfully injected loadAnagrafica into switchTab');
}
