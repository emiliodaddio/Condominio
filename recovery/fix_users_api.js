const fs = require('fs');
let code = fs.readFileSync('server.js', 'utf8');

const replacement = `
// ==========================================
// API UTENTI
// ==========================================

app.get('/api/users', authenticateToken, requireCondominio, isAdmin, (req, res) => {
    db.all(\`SELECT u.id, u.nome, u.email, u.two_factor_enabled, uc.role, uc.unita 
            FROM users u 
            LEFT JOIN user_condominios uc ON u.id = uc.user_id AND uc.condominio_id = ?
            ORDER BY u.nome ASC\`, [req.condominio_id], (err, rows) => {
        res.json({ success: true, data: rows });
    });
});

app.post('/api/users', authenticateToken, requireCondominio, isAdmin, (req, res) => {
    const { nome, email, password, unita, role } = req.body;
    const hash = bcrypt.hashSync(password, 10);
    
    // Inserisce utente e mappa il condominio
    db.run('INSERT INTO users (nome, email, password_hash) VALUES (?, ?, ?)', [nome, email, hash], function(err) {
        if (err) {
            // Se l'email esiste già, prova solo ad assegnarlo al condominio
            if (err.message.includes('UNIQUE constraint failed')) {
                db.get('SELECT id FROM users WHERE email = ?', [email], (err, existingUser) => {
                    if (existingUser) {
                        db.run('INSERT INTO user_condominios (user_id, condominio_id, role, unita) VALUES (?, ?, ?, ?)', 
                            [existingUser.id, req.condominio_id, role || 'condomino', unita || ''], (err2) => {
                            if (err2) return res.status(500).json({ success: false, message: 'Utente già nel condominio' });
                            return res.json({ success: true, message: 'Utente esistente aggiunto al condominio' });
                        });
                    }
                });
                return;
            }
            return res.status(500).json({ success: false, message: 'Errore inserimento utente' });
        }
        
        const newUserId = this.lastID;
        db.run('INSERT INTO user_condominios (user_id, condominio_id, role, unita) VALUES (?, ?, ?, ?)', 
            [newUserId, req.condominio_id, role || 'condomino', unita || ''], function(err) {
            logAudit(req.user.id, req.condominio_id, 'Creazione Utente', 'users', newUserId, null, req.ip);
            res.json({ success: true, message: 'Utente creato con successo' });
        });
    });
});
`;

code = code.replace(
    /\/\/ ==========================================\s*\/\/ API UTENTI\s*\/\/ ==========================================\s*app\.get\('\/api\/users'[\s\S]*?app\.post\('\/api\/users'[\s\S]*?\}\);\s*\n\}\);/,
    replacement
);

fs.writeFileSync('server.js', code);
console.log('Fixed users API logic!');
