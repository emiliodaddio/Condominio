const fs = require('fs');

let server = fs.readFileSync('server.js', 'utf8');

const targetRoute = `app.get('/api/security-logs', authenticateToken, isAdmin, (req, res) => {
    db.all(\`SELECT s.*, u.nome, u.email 
            FROM security_logs s 
            LEFT JOIN users u ON s.user_id = u.id 
            ORDER BY s.created_at DESC LIMIT 50\`, [], (err, rows) => {
        if (err) return res.status(500).json({ success: false, error: err.message });
        res.json({ success: true, data: rows || [] });
    });
});`;

const replacementRoute = `app.get('/api/security-logs', authenticateToken, requireCondominio, isAdmin, (req, res) => {
    db.all(\`SELECT s.*, u.nome, u.email 
            FROM security_logs s 
            JOIN users u ON s.user_id = u.id 
            JOIN user_condominios uc ON uc.user_id = u.id
            WHERE uc.condominio_id = ?
            ORDER BY s.created_at DESC LIMIT 50\`, [req.condominio_id], (err, rows) => {
        if (err) return res.status(500).json({ success: false, error: err.message });
        res.json({ success: true, data: rows || [] });
    });
});`;

if (server.includes(targetRoute)) {
    server = server.replace(targetRoute, replacementRoute);
    fs.writeFileSync('server.js', server);
    console.log('Security logs route updated with requireCondominio and proper filtering');
} else {
    console.log('Target route not found');
}
