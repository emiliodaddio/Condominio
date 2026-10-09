const fs = require('fs');
let html = fs.readFileSync('public/index.html', 'utf8');
html = html.replace('id="tab-users-old" style="display:none;"', 'id="tab-users"');
fs.writeFileSync('public/index.html', html);
console.log('Fixed tab-users');
