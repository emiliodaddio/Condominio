const fs = require('fs');
let code = fs.readFileSync('server.js', 'utf8');

const authMeCode = `
// ==========================================
// RESTORED: /api/auth/me
// ==========================================
app.get('/api/auth/me', authenticateToken, (req, res) => {
    db.get('SELECT id, nome, email, is_superadmin, two_factor_enabled FROM users WHERE id = ?', [req.user.id], (err, user) => {
        if (!user) return res.status(404).json({ success: false });
        db.all('SELECT c.id, c.nome, uc.role, uc.unita FROM user_condominios uc JOIN condominios c ON uc.condominio_id = c.id WHERE uc.user_id = ?', [user.id], (err, condomini) => {
            res.json({ success: true, user: { ...user, condomini: condomini || [] } });
        });
    });
});
`;

if (!code.includes('/api/auth/me')) {
    code = code.replace(
        "app.post('/api/2fa/validate', (req, res) => {",
        authMeCode + "\napp.post('/api/2fa/validate', (req, res) => {"
    );
    fs.writeFileSync('server.js', code);
    console.log("Endpoint /api/auth/me ripristinato con successo.");
} else {
    console.log("L'endpoint /api/auth/me è già presente.");
}
