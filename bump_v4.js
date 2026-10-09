const fs = require('fs');

if (fs.existsSync('public/app_v3.js')) {
    fs.renameSync('public/app_v3.js', 'public/app_v4.js');
}

let html = fs.readFileSync('public/index.html', 'utf8');
html = html.replace('<script src="app_v3.js"></script>', '<script src="app_v4.js"></script>');
fs.writeFileSync('public/index.html', html);

let sw = fs.readFileSync('public/sw.js', 'utf8');
sw = sw.replace("'app_v3.js'", "'app_v4.js'");
sw = sw.replace("'condo-store-v4'", "'condo-store-v5'");
fs.writeFileSync('public/sw.js', sw);

console.log('Bumped to app_v4.js');
