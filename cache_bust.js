const fs = require('fs');
let html = fs.readFileSync('public/index.html', 'utf8');

html = html.replace(
    '<script src="app_v4.js"></script>',
    '<script src="app_v4.js?v=2"></script>'
);
html = html.replace(
    '<script src="app_v4.js?v=1"></script>',
    '<script src="app_v4.js?v=2"></script>'
);
// just in case
html = html.replace(
    /app_v4\.js(\?v=\d+)?/g,
    'app_v4.js?v=' + Date.now()
);

fs.writeFileSync('public/index.html', html);
