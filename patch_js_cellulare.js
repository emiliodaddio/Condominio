const fs = require('fs');
let app = fs.readFileSync('public/app_v4.js', 'utf8');

// Update openPersonaModal
const openModalMatch = "document.getElementById('persona-tel').value = p ? (p.telefono || '') : '';\n    document.getElementById('persona-email').value = p ? (p.email || '') : '';";
const openModalReplace = "document.getElementById('persona-tel').value = p ? (p.telefono || '') : '';\n    document.getElementById('persona-cell').value = p ? (p.cellulare || '') : '';\n    document.getElementById('persona-email').value = p ? (p.email || '') : '';";
app = app.replace(openModalMatch, openModalReplace);

// Update savePersona
const savePersonaMatch = "telefono: document.getElementById('persona-tel').value,\n        email: document.getElementById('persona-email').value,";
const savePersonaReplace = "telefono: document.getElementById('persona-tel').value,\n        cellulare: document.getElementById('persona-cell').value,\n        email: document.getElementById('persona-email').value,";
app = app.replace(savePersonaMatch, savePersonaReplace);

// Update table rendering
const renderMatch = "                ${p.telefono ? `<i class=\"fa-solid fa-phone mr-1\"></i> ${p.telefono}<br>` : ''}\n                ${p.email ? `<i class=\"fa-solid fa-envelope mr-1\"></i> ${p.email}` : ''}";
const renderReplace = "                ${p.telefono ? `<i class=\"fa-solid fa-phone mr-1\"></i> ${p.telefono}<br>` : ''}\n                ${p.cellulare ? `<i class=\"fa-solid fa-mobile-screen mr-1\"></i> ${p.cellulare}<br>` : ''}\n                ${p.email ? `<i class=\"fa-solid fa-envelope mr-1\"></i> ${p.email}` : ''}";
app = app.replace(renderMatch, renderReplace);

fs.writeFileSync('public/app_v4.js', app);
console.log('Updated app_v4.js for cellulare');
