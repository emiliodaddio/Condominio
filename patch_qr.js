const fs = require('fs');
let app = fs.readFileSync('public/app_v4.js', 'utf8');

app = app.replace(/data\.qrCodeDataUrl/g, 'data.qrCodeUrl');

fs.writeFileSync('public/app_v4.js', app);
console.log('Fixed qrCodeUrl variable in app_v4.js');
