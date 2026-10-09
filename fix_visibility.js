const fs = require('fs');
let code = fs.readFileSync('public/app.js', 'utf8');

code = code.replace(
    "if (tabBtnAnagrafica) tabBtnAnagrafica.classList.remove('hidden');",
    "if (tabBtnAnagrafica) tabBtnAnagrafica.classList.remove('hidden');\n        const tabBtnUnita = document.getElementById('tab-btn-unita'); if (tabBtnUnita) tabBtnUnita.classList.remove('hidden');"
);

code = code.replace(
    "if (tabBtnAnagrafica) tabBtnAnagrafica.classList.add('hidden');",
    "if (tabBtnAnagrafica) tabBtnAnagrafica.classList.add('hidden');\n        const tabBtnUnita = document.getElementById('tab-btn-unita'); if (tabBtnUnita) tabBtnUnita.classList.add('hidden');"
);

fs.writeFileSync('public/app.js', code);
console.log("Fixed visibility!");
