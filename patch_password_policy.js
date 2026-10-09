const fs = require('fs');

// 1. Patch app_v4.js
let app = fs.readFileSync('public/app_v4.js', 'utf8');
const appTarget = `const role = document.getElementById('new-user-role').value;`;
const appReplacement = `const role = document.getElementById('new-user-role').value;

    const pwdRegex = /^(?=.*[A-Z])(?=.*\\d)(?=.*[!@#$%^&*(),.?":{}|<>]).{8,}$/;
    if (!pwdRegex.test(password)) {
        showToast('La password deve contenere almeno 8 caratteri, una maiuscola, un numero e un carattere speciale.', 'error');
        return;
    }`;

app = app.replace(appTarget, appReplacement);
fs.writeFileSync('public/app_v4.js', app);

// 2. Patch server.js
let server = fs.readFileSync('server.js', 'utf8');

// Remove duplicate route (if it exists)
const duplicateRegex = /app\.post\('\/api\/users', authenticateToken, requireCondominio, isAdmin, \(req, res\) => \{\s*const \{ nome, email, password, unita, role \} = req\.body;[\s\S]*?logAudit\(req\.user\.id, req\.condominio_id, 'Creazione Utente', 'users', newUserId, null, req\.ip\);\s*res\.json\(\{ success: true, message: 'Utente creato con successo' \}\);\s*\}\);\s*\}\);\s*\n\}\);/g;
// Actually simpler: just find the index of the second `app.post('/api/users'` and slice it out.
let idx1 = server.indexOf(`app.post('/api/users'`);
let idx2 = server.indexOf(`app.post('/api/users'`, idx1 + 1);

if (idx2 !== -1) {
    let nextApp = server.indexOf(`app.`, idx2 + 10);
    // Remove from idx2 to nextApp
    server = server.slice(0, idx2) + server.slice(nextApp);
}

const serverTarget = `const { nome, email, password, unita, role, telefono, dati_catastali } = req.body;`;
const serverReplacement = `const { nome, email, password, unita, role, telefono, dati_catastali } = req.body;
    
    const pwdRegex = /^(?=.*[A-Z])(?=.*\\d)(?=.*[!@#$%^&*(),.?":{}|<>]).{8,}$/;
    if (!pwdRegex.test(password)) {
        return res.status(400).json({ success: false, message: 'La password deve contenere almeno 8 caratteri, una maiuscola, un numero e un carattere speciale.' });
    }`;

server = server.replace(serverTarget, serverReplacement);
fs.writeFileSync('server.js', server);

console.log('Password policy enforced.');
