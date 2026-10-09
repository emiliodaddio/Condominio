const fs = require('fs');
let app = fs.readFileSync('public/app_v4.js', 'utf8');
app = app.replace(/'login\.html'/g, "'login.html?v=2'");
fs.writeFileSync('public/app_v4.js', app);
console.log('Busted cache in app_v4.js');
