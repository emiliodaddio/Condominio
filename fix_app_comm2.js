const fs = require('fs');
let code = fs.readFileSync('public/app_v4.js', 'utf8');

// Rimuovo l'errore precedente se c'è
code = code.replace('code = code.replace(loadUsersListTarget, loadUsersListTarget + " populateCommUsersSelect();");', '');

// Ora faccio il VERO replace
code = code.replace('populateQuoteUsersSelect();', 'populateQuoteUsersSelect(); populateCommUsersSelect();');

fs.writeFileSync('public/app_v4.js', code);
