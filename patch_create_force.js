const fs = require('fs');
let app = fs.readFileSync('public/app_v4.js', 'utf8');

const regex = /const payload = \{\s*user_id: document\.getElementById\('quote-user-id'\)\.value,\s*type: document\.getElementById\('quote-type'\)\.value,\s*title: document\.getElementById\('quote-title'\)\.value\.trim\(\),\s*amount: document\.getElementById\('quote-amount'\)\.value,\s*due_date: document\.getElementById\('quote-due-date'\)\.value\s*\};/;

const replacement = `const payload = {
        persona_id: document.getElementById('quote-persona-id').value,
        unita_id: document.getElementById('quote-unita-id') ? document.getElementById('quote-unita-id').value : null,
        type: document.getElementById('quote-type').value,
        title: document.getElementById('quote-title').value.trim(),
        amount: document.getElementById('quote-amount').value,
        due_date: document.getElementById('quote-due-date').value
    };`;

app = app.replace(regex, replacement);
fs.writeFileSync('public/app_v4.js', app);
console.log('Fixed handleCreateQuote with regex!');
