const fs = require('fs');
let app = fs.readFileSync('public/app_v4.js', 'utf8');

app = app.replace(
    "if (data.success) showToast(data.message, 'success');",
    "if (data.success) { showToast(data.message || 'Dati salvati con successo!', 'success'); document.getElementById('header-condo-name').textContent = payload.nome; }"
);
// Ehi, I also need to update the header if the nome changes! So I added that too.

// Wait, I also need to fix fetch('/api/Condominio') in handleSaveCondominio!
// Did I fix it in the previous script? Let's check!
app = app.replace("fetch('/api/Condominio', {", "fetch('/api/condominio', {");

fs.writeFileSync('public/app_v4.js', app);
console.log('Fixed handleSaveCondominio toast');
