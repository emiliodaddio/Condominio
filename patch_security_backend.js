const fs = require('fs');
let server = fs.readFileSync('server.js', 'utf8');

// 1. Add route for GET /api/security-logs
const getLogsRoute = `
// --- SECURITY LOGS ---
app.get('/api/security-logs', authenticateToken, isAdmin, (req, res) => {
    db.all(\`SELECT s.*, u.nome, u.email 
            FROM security_logs s 
            LEFT JOIN users u ON s.user_id = u.id 
            ORDER BY s.created_at DESC LIMIT 50\`, [], (err, rows) => {
        if (err) return res.status(500).json({ success: false, error: err.message });
        res.json({ success: true, data: rows || [] });
    });
});
`;

if (!server.includes('/api/security-logs')) {
    server = server.replace('app.listen(PORT', getLogsRoute + '\napp.listen(PORT');
}

// 2. Add logging to /api/auth/reset-password
const resetTarget = `db.run('UPDATE users SET password_hash = ?, reset_token = NULL, reset_token_expires = NULL WHERE id = ?', [hash, user.id], (err) => {
            if (err) return res.status(500).json({ success: false, message: 'Errore durante il salvataggio della password.' });
            res.json({ success: true, message: 'Password aggiornata con successo! Ora puoi accedere.' });
        });`;

const resetReplacement = `db.run('UPDATE users SET password_hash = ?, reset_token = NULL, reset_token_expires = NULL WHERE id = ?', [hash, user.id], (err) => {
            if (err) return res.status(500).json({ success: false, message: 'Errore durante il salvataggio della password.' });
            
            // Log security event
            db.run('INSERT INTO security_logs (user_id, action) VALUES (?, ?)', [user.id, 'Ha reimpostato la password autonomamente']);
            
            res.json({ success: true, message: 'Password aggiornata con successo! Ora puoi accedere.' });
        });`;

if (server.includes(resetTarget)) {
    server = server.replace(resetTarget, resetReplacement);
}

// 3. Add table creation in initialization block
const createTablesTarget = `db.run(\`CREATE TABLE IF NOT EXISTS convocations_log`;
const createTablesReplacement = `db.run(\`CREATE TABLE IF NOT EXISTS security_logs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER,
            action TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )\`);
        db.run(\`CREATE TABLE IF NOT EXISTS convocations_log`;

if (server.includes(createTablesTarget) && !server.includes('CREATE TABLE IF NOT EXISTS security_logs')) {
    server = server.replace(createTablesTarget, createTablesReplacement);
}

fs.writeFileSync('server.js', server);
console.log('Security logs backend added');
