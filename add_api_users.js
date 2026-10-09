const fs = require('fs');

let code = fs.readFileSync('server.js', 'utf8');

const userEndpoints = `
// ==========================================
// API UTENTI
// ==========================================

app.get('/api/users', authenticateToken, isAdmin, (req, res) => {
    db.all('SELECT id, nome, email, is_superadmin, two_factor_enabled FROM users', [], (err, rows) => {
        res.json({ success: true, data: rows });
    });
});

app.post('/api/users', authenticateToken, isAdmin, (req, res) => {
    const { nome, email, password } = req.body;
    const hash = bcrypt.hashSync(password, 10);
    db.run('INSERT INTO users (nome, email, password_hash) VALUES (?, ?, ?)', [nome, email, hash], function(err) {
        if (err) return res.status(500).json({ success: false, message: 'Errore inserimento utente' });
        res.json({ success: true });
    });
});

app.delete('/api/users/:id', authenticateToken, isAdmin, (req, res) => {
    db.run('DELETE FROM users WHERE id = ?', [req.params.id], function(err) {
        if (err) return res.status(500).json({ success: false });
        res.json({ success: true });
    });
});
`;

if (!code.includes('/api/users')) {
    code = code.replace(
        "// Fallback Frontend SPA",
        userEndpoints + "\n// Fallback Frontend SPA"
    );
    fs.writeFileSync('server.js', code);
    console.log("Endpoint /api/users aggiunti con successo.");
}
