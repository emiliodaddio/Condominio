const fs = require('fs');
let html = fs.readFileSync('public/index.html', 'utf8');
html = html.replace('id="tab-btn-users" style="display:none;"', 'id="tab-btn-users"');
fs.writeFileSync('public/index.html', html);
console.log('Fixed tab-btn-users');
