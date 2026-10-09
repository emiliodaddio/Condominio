const fs = require('fs');
let app = fs.readFileSync('public/app_v4.js', 'utf8');

app = app.replace('function openNewQuoteModal() {', 'async function openNewQuoteModal() {');
app = app.replace('populateQuoteUsersSelect();\n    document.getElementById(\'modal-new-quote\').classList.remove(\'hidden\');', 'await populateQuoteUsersSelect();\n    document.getElementById(\'modal-new-quote\').classList.remove(\'hidden\');');

fs.writeFileSync('public/app_v4.js', app);
console.log('Fixed openNewQuoteModal to be async');
