const fs = require('fs');

let app = fs.readFileSync('public/app_v4.js', 'utf8');

const oldRegex = /const dati_catastali = document\.getElementById\('new-user-catasto'\)\.value\.trim\(\);\s*const role = document\.getElementById\('new-user-role'\)\.value;/;
const newJs = `const sez = (document.getElementById('new-user-catasto-sez') ? document.getElementById('new-user-catasto-sez').value.trim() : '');
    const fg = (document.getElementById('new-user-catasto-fg') ? document.getElementById('new-user-catasto-fg').value.trim() : '');
    const part = (document.getElementById('new-user-catasto-part') ? document.getElementById('new-user-catasto-part').value.trim() : '');
    const sub = (document.getElementById('new-user-catasto-sub') ? document.getElementById('new-user-catasto-sub').value.trim() : '');
    let dcArr = [];
    if(sez) dcArr.push(\`Sez. \${sez}\`);
    if(fg) dcArr.push(\`Fg. \${fg}\`);
    if(part) dcArr.push(\`Part. \${part}\`);
    if(sub) dcArr.push(\`Sub. \${sub}\`);
    const dati_catastali = dcArr.join(', ');
    
    const role = document.getElementById('new-user-role').value;`;

if(oldRegex.test(app)) {
    app = app.replace(oldRegex, newJs);
    fs.writeFileSync('public/app_v4.js', app);
    console.log('app_v4.js updated correctly');
} else {
    console.log('Regex did not match app_v4.js');
}
