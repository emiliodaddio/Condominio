const fs = require('fs');
let app = fs.readFileSync('public/app.js', 'utf8');
app = app.replace(
    "if (target) target.classList.remove('hidden');",
    "if (target) target.classList.remove('hidden');\n    if (tabId === 'unita') loadUnita();"
);
fs.writeFileSync('public/app.js', app);

let html = fs.readFileSync('public/index.html', 'utf8');
html = html.replace(
    'class="tab-pane hidden space-y-6" class="hidden space-y-6"',
    'class="tab-pane hidden space-y-6"'
);
fs.writeFileSync('public/index.html', html);
console.log("Fixes applied successfully.");
