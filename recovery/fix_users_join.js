const fs = require('fs');
let code = fs.readFileSync('server.js', 'utf8');

const replacement = `
// ==========================================
// API UTENTI
// ==========================================

app.get('/api/users', authenticateToken, requireCondominio, isAdmin, (req, res) => {
    db.all(\`SELECT u.id, u.nome, u.email, u.two_factor_enabled, u.created_at, uc.role, uc.unita 
            FROM users u 
            JOIN user_condominios uc ON u.id = uc.user_id 
            WHERE uc.condominio_id = ?
            ORDER BY u.nome ASC\`, [req.condominio_id], (err, rows) => {
        res.json({ success: true, data: rows });
    });
});
`;

code = code.replace(
    /\/\/ ==========================================\s*\/\/ API UTENTI\s*\/\/ ==========================================\s*app\.get\('\/api\/users'[\s\S]*?\}\);\s*\n\}\);/,
    replacement + "\n" + code.match(/app\.post\('\/api\/users'[\s\S]*?\}\);\s*\n\}\);/)[0]
);

fs.writeFileSync('server.js', code);
console.log('Fixed users API join!');
