const fs = require('fs');
let code = fs.readFileSync('server.js', 'utf8');

// 1. Update issueToken
code = code.replace(
    `const tokenPayload = { id: user.id, nome: user.nome, email: user.email, is_superadmin: user.is_superadmin };`,
    `const tokenPayload = { id: user.id, nome: user.nome, email: user.email, is_superadmin: user.is_superadmin, privacy_accepted: user.privacy_accepted };`
);

// 2. Update /api/auth/me
code = code.replace(
    `db.get('SELECT id, nome, email, is_superadmin, two_factor_enabled FROM users WHERE id = ?', [req.user.id], (err, user) => {`,
    `db.get('SELECT id, nome, email, is_superadmin, two_factor_enabled, privacy_accepted FROM users WHERE id = ?', [req.user.id], (err, user) => {`
);

// 3. Update CREATE TABLE users
code = code.replace(
    `two_factor_enabled BOOLEAN DEFAULT 0,`,
    `two_factor_enabled BOOLEAN DEFAULT 0,\n            privacy_accepted BOOLEAN DEFAULT 0,\n            privacy_accepted_at DATETIME,`
);

// 4. Inject /api/users/accept-privacy
const anchor = "app.put('/api/users/:id', authenticateToken, requireCondominio, isAdmin, (req, res) => {";
const endpoint = `app.post('/api/users/accept-privacy', authenticateToken, (req, res) => {
    db.run('UPDATE users SET privacy_accepted = 1, privacy_accepted_at = CURRENT_TIMESTAMP WHERE id = ?', [req.user.id], (err) => {
        if (err) return res.status(500).json({ success: false, message: 'Errore DB' });
        res.json({ success: true });
    });
});

`;
const idx = code.indexOf(anchor);
if (idx !== -1) {
    code = code.substring(0, idx) + endpoint + code.substring(idx);
} else {
    console.error("COULD NOT FIND ANCHOR");
}

fs.writeFileSync('server.js', code);
