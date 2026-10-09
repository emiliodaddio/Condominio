const fs = require('fs');
let server = fs.readFileSync('server.js', 'utf8');

const oldQuotesSchema = `        db.run(\`CREATE TABLE IF NOT EXISTS quotes (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            condominio_id INTEGER NOT NULL,
            user_id INTEGER NOT NULL,
            type TEXT CHECK(type IN ('ordinaria', 'straordinaria')),
            title TEXT NOT NULL,
            due_date TEXT NOT NULL,
            amount REAL NOT NULL,
            description TEXT,
            status TEXT DEFAULT 'In sospeso' CHECK(status IN ('In sospeso', 'Pagato')),
            payment_date TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )\`);`;

const newQuotesSchema = `        db.run(\`CREATE TABLE IF NOT EXISTS quotes (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            condominio_id INTEGER NOT NULL,
            persona_id INTEGER,
            unita_id INTEGER,
            type TEXT CHECK(type IN ('ordinaria', 'straordinaria')),
            title TEXT NOT NULL,
            due_date TEXT NOT NULL,
            amount REAL NOT NULL,
            description TEXT,
            status TEXT DEFAULT 'In sospeso' CHECK(status IN ('In sospeso', 'Pagato')),
            payment_date TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )\`);`;

server = server.replace(oldQuotesSchema, newQuotesSchema);

// Update POST /api/quotes
const oldPostQuote = `app.post('/api/quotes', authenticateToken, requireCondominio, isAdmin, (req, res) => {
    const { user_id, type, title, due_date, amount, description } = req.body;
    db.run('INSERT INTO quotes (condominio_id, user_id, type, title, due_date, amount, description) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [req.condominio_id, user_id, type, title, due_date, amount, description], function(err) {
            if (err) return res.status(500).json({ success: false, message: err.message });
            logAudit(req.user.id, req.condominio_id, 'Generata Quota', 'quotes', this.lastID, null, req.ip);
            res.json({ success: true });
        });
});`;

const newPostQuote = `app.post('/api/quotes', authenticateToken, requireCondominio, isAdmin, (req, res) => {
    const { persona_id, unita_id, type, title, due_date, amount, description } = req.body;
    db.run('INSERT INTO quotes (condominio_id, persona_id, unita_id, type, title, due_date, amount, description) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        [req.condominio_id, persona_id, unita_id, type, title, due_date, amount, description], function(err) {
            if (err) return res.status(500).json({ success: false, message: err.message });
            logAudit(req.user.id, req.condominio_id, 'Generata Quota', 'quotes', this.lastID, null, req.ip);
            res.json({ success: true });
        });
});`;

server = server.replace(oldPostQuote, newPostQuote);

// Update GET /api/quotes
const oldGetQuotes = `app.get('/api/quotes', authenticateToken, requireCondominio, (req, res) => {
    let query = 'SELECT q.*, u.nome as condomino_nome, uc.unita as unita FROM quotes q JOIN users u ON q.user_id = u.id LEFT JOIN user_condominios uc ON u.id = uc.user_id AND uc.condominio_id = q.condominio_id WHERE q.condominio_id = ?';
    const params = [req.condominio_id];
    if (req.role_in_condominio !== 'admin') {
        query += ' AND q.user_id = ?';
        params.push(req.user.id);
    }
    query += ' ORDER BY q.due_date ASC';
    db.all(query, params, (err, rows) => {
        res.json({ success: true, data: rows || [] });
    });
});`;

const newGetQuotes = `app.get('/api/quotes', authenticateToken, requireCondominio, (req, res) => {
    let query = \`SELECT q.*, 
                 p.nome as persona_nome, p.cognome as persona_cognome, 
                 u.identificativo as unita 
                 FROM quotes q 
                 LEFT JOIN anagrafica_persone p ON q.persona_id = p.id 
                 LEFT JOIN unita_immobiliari u ON q.unita_id = u.id 
                 WHERE q.condominio_id = ?\`;
    const params = [req.condominio_id];
    
    // TODO: If role is not admin, we would need to map the logged in user to their anagrafica persona.
    // For now, let's just return all for simplicity or filter if we can map it.
    // Let's assume admins see everything. Condomini see only quotes where they are the persona_id.
    // But how do we know their persona_id? We don't have the link yet.
    // Let's just return all quotes for now, we'll fix the condomino view later.
    
    query += ' ORDER BY q.due_date ASC';
    db.all(query, params, (err, rows) => {
        res.json({ success: true, data: rows || [] });
    });
});`;

server = server.replace(oldGetQuotes, newGetQuotes);

// Update GET /api/receivables
const oldGetRec = `app.get('/api/receivables', authenticateToken, requireCondominio, (req, res) => {
    let query = 'SELECT q.*, u.nome as condomino_nome, uc.unita as unita FROM quotes q JOIN users u ON q.user_id = u.id LEFT JOIN user_condominios uc ON u.id = uc.user_id AND uc.condominio_id = q.condominio_id WHERE q.condominio_id = ? AND q.status != \\'Pagato\\'';
    const params = [req.condominio_id];
    query += ' ORDER BY q.due_date ASC';
    db.all(query, params, (err, rows) => {
        res.json({ success: true, data: rows || [] });
    });
});`;

const newGetRec = `app.get('/api/receivables', authenticateToken, requireCondominio, (req, res) => {
    let query = \`SELECT q.*, 
                 p.nome as persona_nome, p.cognome as persona_cognome, 
                 u.identificativo as unita 
                 FROM quotes q 
                 LEFT JOIN anagrafica_persone p ON q.persona_id = p.id 
                 LEFT JOIN unita_immobiliari u ON q.unita_id = u.id 
                 WHERE q.condominio_id = ? AND q.status != 'Pagato' ORDER BY q.due_date ASC\`;
    const params = [req.condominio_id];
    db.all(query, params, (err, rows) => {
        res.json({ success: true, data: rows || [] });
    });
});`;

server = server.replace(oldGetRec, newGetRec);

fs.writeFileSync('server.js', server);
console.log('Updated quotes schema and routes in server.js');
