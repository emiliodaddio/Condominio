const fs = require('fs');
let html = fs.readFileSync('public/index.html', 'utf8');

html = html.replace(
    '<th class="py-3.5 px-4 text-center">Ruolo</th>',
    '<th class="py-3.5 px-4 text-center">Privacy GDPR</th>\n                                    <th class="py-3.5 px-4 text-center">Ruolo</th>'
);

fs.writeFileSync('public/index.html', html);
