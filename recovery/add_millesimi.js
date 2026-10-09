const fs = require('fs');

let code = fs.readFileSync('server.js', 'utf8');

// 1. Add schema for unita_immobiliari
const newSchema = `
        // UNITA IMMOBILIARI E MILLESIMI
        db.run(\`CREATE TABLE IF NOT EXISTS unita_immobiliari (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            condominio_id INTEGER NOT NULL,
            user_id INTEGER, 
            tipo TEXT DEFAULT 'Appartamento',
            identificativo TEXT NOT NULL,
            scala TEXT,
            piano TEXT,
            millesimi_proprieta REAL DEFAULT 0,
            millesimi_scale REAL DEFAULT 0,
            millesimi_ascensore REAL DEFAULT 0,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY(condominio_id) REFERENCES condominios(id) ON DELETE CASCADE,
            FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE SET NULL
        )\`, () => {
            // Seed initial data if empty
            db.get('SELECT COUNT(*) as count FROM unita_immobiliari', (err, row) => {
                if (!err && row.count === 0) {
                    db.run("INSERT INTO unita_immobiliari (condominio_id, user_id, identificativo, millesimi_proprieta) VALUES (1, 3, 'Int. 1', 250.00)");
                    db.run("INSERT INTO unita_immobiliari (condominio_id, user_id, identificativo, millesimi_proprieta) VALUES (1, 4, 'Int. 2', 300.50)");
                    db.run("INSERT INTO unita_immobiliari (condominio_id, user_id, identificativo, millesimi_proprieta) VALUES (2, 4, 'Int. 10', 150.00)");
                }
            });
        });
`;

if (!code.includes('unita_immobiliari')) {
    code = code.replace(
        "        // CONDOMINI",
        newSchema + "\n        // CONDOMINI"
    );
}

// 2. Add Endpoints
const newEndpoints = `
// ==========================================
// UNITA IMMOBILIARI E MILLESIMI
// ==========================================

app.get('/api/unita', authenticateToken, requireCondominio, (req, res) => {
    db.all(\`SELECT u.*, us.nome as condomino_nome, us.email as condomino_email 
            FROM unita_immobiliari u 
            LEFT JOIN users us ON u.user_id = us.id 
            WHERE u.condominio_id = ? 
            ORDER BY u.identificativo ASC\`, [req.condominio_id], (err, rows) => {
        res.json({ success: true, data: rows });
    });
});

app.post('/api/unita', authenticateToken, requireCondominio, isAdmin, (req, res) => {
    const { user_id, tipo, identificativo, scala, piano, millesimi_proprieta, millesimi_scale, millesimi_ascensore } = req.body;
    db.run(\`INSERT INTO unita_immobiliari (condominio_id, user_id, tipo, identificativo, scala, piano, millesimi_proprieta, millesimi_scale, millesimi_ascensore) 
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)\`,
        [req.condominio_id, user_id || null, tipo || 'Appartamento', identificativo, scala, piano, millesimi_proprieta || 0, millesimi_scale || 0, millesimi_ascensore || 0], 
        function(err) {
            if (err) return res.status(500).json({ success: false, message: err.message });
            logAudit(req.user.id, req.condominio_id, 'Creata Unità Immobiliare', 'unita_immobiliari', this.lastID, null, req.ip);
            res.json({ success: true });
    });
});

app.put('/api/unita/:id', authenticateToken, requireCondominio, isAdmin, (req, res) => {
    const { user_id, tipo, identificativo, scala, piano, millesimi_proprieta, millesimi_scale, millesimi_ascensore } = req.body;
    db.run(\`UPDATE unita_immobiliari 
            SET user_id = ?, tipo = ?, identificativo = ?, scala = ?, piano = ?, millesimi_proprieta = ?, millesimi_scale = ?, millesimi_ascensore = ? 
            WHERE id = ? AND condominio_id = ?\`,
        [user_id || null, tipo || 'Appartamento', identificativo, scala, piano, millesimi_proprieta || 0, millesimi_scale || 0, millesimi_ascensore || 0, req.params.id, req.condominio_id], 
        function(err) {
            if (err) return res.status(500).json({ success: false, message: err.message });
            logAudit(req.user.id, req.condominio_id, 'Modificata Unità Immobiliare', 'unita_immobiliari', req.params.id, null, req.ip);
            res.json({ success: true });
    });
});
`;

if (!code.includes('/api/unita')) {
    code = code.replace(
        "// ==========================================\n// API GESTIONALI (Anonimizzazione, Conti, Libro Giornale)\n// ==========================================",
        "// ==========================================\n// API GESTIONALI (Anonimizzazione, Conti, Libro Giornale)\n// ==========================================\n" + newEndpoints
    );
    fs.writeFileSync('server.js', code);
    console.log("Endpoint tabelle millesimali aggiunti con successo.");
} else {
    console.log("Endpoint tabelle millesimali già presenti.");
}
