const fs = require('fs');
let server = fs.readFileSync('server.js', 'utf8');

const tableSql = `
        db.run(\`CREATE TABLE IF NOT EXISTS anagrafica_persone (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            condominio_id INTEGER NOT NULL,
            nome TEXT NOT NULL,
            cognome TEXT NOT NULL,
            codice_fiscale TEXT,
            telefono TEXT,
            email TEXT,
            ruolo_default TEXT DEFAULT 'Proprietario',
            notes TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )\`);
        
        // Aggiungi colonne proprietario e conduttore alle unita
        db.run("ALTER TABLE unita_immobiliari ADD COLUMN proprietario_id INTEGER", (err) => { /* ignora se esiste */ });
        db.run("ALTER TABLE unita_immobiliari ADD COLUMN conduttore_id INTEGER", (err) => { /* ignora se esiste */ });
`;

// Inserisco la tabella dopo l'ultima create table
if (server.includes('CREATE TABLE IF NOT EXISTS unita_immobiliari')) {
    server = server.replace('CREATE TABLE IF NOT EXISTS unita_immobiliari', tableSql + '\n        db.run(`CREATE TABLE IF NOT EXISTS unita_immobiliari');
}

const routesSql = `
// ==========================================
// ANAGRAFICA PERSONE (RUBRICA)
// ==========================================
app.get('/api/anagrafica-persone', authenticateToken, requireCondominio, (req, res) => {
    db.all('SELECT * FROM anagrafica_persone WHERE condominio_id = ? ORDER BY cognome ASC, nome ASC', [req.condominio_id], (err, rows) => {
        res.json({ success: true, data: rows || [] });
    });
});

app.post('/api/anagrafica-persone', authenticateToken, requireCondominio, isAdmin, (req, res) => {
    const { nome, cognome, codice_fiscale, telefono, email, ruolo_default, notes } = req.body;
    db.run(\`INSERT INTO anagrafica_persone (condominio_id, nome, cognome, codice_fiscale, telefono, email, ruolo_default, notes) 
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)\`,
        [req.condominio_id, nome, cognome, codice_fiscale, telefono, email, ruolo_default || 'Proprietario', notes], 
        function(err) {
            if (err) return res.status(500).json({ success: false, message: err.message });
            res.json({ success: true, id: this.lastID });
    });
});

app.put('/api/anagrafica-persone/:id', authenticateToken, requireCondominio, isAdmin, (req, res) => {
    const { nome, cognome, codice_fiscale, telefono, email, ruolo_default, notes } = req.body;
    db.run(\`UPDATE anagrafica_persone 
            SET nome = ?, cognome = ?, codice_fiscale = ?, telefono = ?, email = ?, ruolo_default = ?, notes = ? 
            WHERE id = ? AND condominio_id = ?\`,
        [nome, cognome, codice_fiscale, telefono, email, ruolo_default, notes, req.params.id, req.condominio_id], 
        function(err) {
            if (err) return res.status(500).json({ success: false, message: err.message });
            res.json({ success: true });
    });
});

app.delete('/api/anagrafica-persone/:id', authenticateToken, requireCondominio, isAdmin, (req, res) => {
    db.run('DELETE FROM anagrafica_persone WHERE id = ? AND condominio_id = ?', [req.params.id, req.condominio_id], function(err) {
        if (err) return res.status(500).json({ success: false, message: err.message });
        res.json({ success: true });
    });
});
`;

if (!server.includes('/api/anagrafica-persone')) {
    server = server.replace('app.get(\'/api/unita\',', routesSql + '\napp.get(\'/api/unita\',');
}

fs.writeFileSync('server.js', server);
console.log('Added Anagrafica Persone to server.js');
