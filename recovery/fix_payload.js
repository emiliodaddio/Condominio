const fs = require('fs');
let content = fs.readFileSync('public/app_v4.js', 'utf8');
content = content.replace(
    /body: JSON\.stringify\(\{[\s]*email: u\.email,[\s]*nome: u\.nome,[\s]*htmlContent: html,[\s]*activeCondoName[\s]*\}\)/,
    "body: JSON.stringify({ userId: u.id, email: u.email, nome: u.nome, htmlContent: html, activeCondoName })"
);
fs.writeFileSync('public/app_v4.js', content);
