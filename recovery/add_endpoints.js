const fs = require('fs');
const path = require('path');

const serverFile = path.join(__dirname, 'server.js');
let content = fs.readFileSync(serverFile, 'utf8');

const newEndpoints = `
// ============================================================================
// NUOVI ENDPOINT V2.0
// ============================================================================

// --- Anagrafica Condominio ---
app.get('/api/condominio', authenticateToken, (req, res) => {
    db.get('SELECT * FROM condominio_info WHERE id = 1', (err, row) => {
        if (err) return res.status(500).json({ success: false, error: err.message });
        res.json({ success: true, data: row || {} });
    });
});

app.put('/api/condominio', authenticateToken, isAdmin, (req, res) => {
    const { nome, indirizzo, cf, scala, piano } = req.body;
    db.get('SELECT * FROM condominio_info WHERE id = 1', (err, row) => {
        if (row) {
            db.run(\`UPDATE condominio_info SET nome = ?, indirizzo = ?, cf = ?, scala = ?, piano = ? WHERE id = 1\`,
            [nome, indirizzo, cf, scala, piano], function(err) {
                if (err) return res.status(500).json({ success: false, error: err.message });
                logAction(req.user.id, 'Update', 'condominio_info', 1, row, req.ip);
                res.json({ success: true, message: 'Dati condominio aggiornati.' });
            });
        } else {
            db.run(\`INSERT INTO condominio_info (id, nome, indirizzo, cf, scala, piano) VALUES (1, ?, ?, ?, ?, ?)\`,
            [nome, indirizzo, cf, scala, piano], function(err) {
                if (err) return res.status(500).json({ success: false, error: err.message });
                logAction(req.user.id, 'Insert', 'condominio_info', 1, null, req.ip);
                res.json({ success: true, message: 'Dati condominio inseriti.' });
            });
        }
    });
});

// --- Modifica/Elimina Utenti ---
app.put('/api/users/:id', authenticateToken, isAdmin, (req, res) => {
    const { nome, email, unita, role } = req.body;
    db.get('SELECT * FROM users WHERE id = ?', [req.params.id], (err, row) => {
        if (err || !row) return res.status(404).json({ success: false, message: 'Utente non trovato' });
        
        db.run(\`UPDATE users SET nome = ?, email = ?, unita = ?, role = ? WHERE id = ?\`,
        [nome, email.toLowerCase(), unita, role, req.params.id], function(err) {
            if (err) return res.status(500).json({ success: false, error: err.message });
            logAction(req.user.id, 'Update', 'users', req.params.id, row, req.ip);
            res.json({ success: true, message: 'Utente aggiornato con successo.' });
        });
    });
});

app.delete('/api/users/:id', authenticateToken, isAdmin, (req, res) => {
    db.get('SELECT * FROM users WHERE id = ?', [req.params.id], (err, row) => {
        if (err || !row) return res.status(404).json({ success: false, message: 'Utente non trovato' });
        db.run('DELETE FROM users WHERE id = ?', [req.params.id], (err) => {
            if (err) return res.status(500).json({ success: false, error: err.message });
            logAction(req.user.id, 'Delete', 'users', req.params.id, row, req.ip);
            res.json({ success: true, message: 'Utente eliminato.' });
        });
    });
});

// --- Modifica Quote ---
app.put('/api/quotes/:id', authenticateToken, isAdmin, (req, res) => {
    const { type, title, due_date, amount, description, status, payment_date } = req.body;
    db.get('SELECT * FROM quotes WHERE id = ?', [req.params.id], (err, row) => {
        if (err || !row) return res.status(404).json({ success: false, message: 'Quota non trovata' });
        
        db.run(\`UPDATE quotes SET type = ?, title = ?, due_date = ?, amount = ?, description = ?, status = ?, payment_date = ? WHERE id = ?\`,
        [type, title, due_date, amount, description, status, payment_date, req.params.id], function(err) {
            if (err) return res.status(500).json({ success: false, error: err.message });
            logAction(req.user.id, 'Update', 'quotes', req.params.id, row, req.ip);
            res.json({ success: true, message: 'Quota aggiornata con successo.' });
        });
    });
});

// --- Modifica Fatture ---
app.put('/api/supplier-payments/:id', authenticateToken, isAdmin, (req, res) => {
    const { supplier_name, category, invoice_number, amount, payment_date, status, notes } = req.body;
    db.get('SELECT * FROM supplier_payments WHERE id = ?', [req.params.id], (err, row) => {
        if (err || !row) return res.status(404).json({ success: false, message: 'Fattura non trovata' });
        
        db.run(\`UPDATE supplier_payments SET supplier_name=?, category=?, invoice_number=?, amount=?, payment_date=?, status=?, notes=? WHERE id = ?\`,
        [supplier_name, category, invoice_number, amount, payment_date, status, notes, req.params.id], function(err) {
            if (err) return res.status(500).json({ success: false, error: err.message });
            logAction(req.user.id, 'Update', 'supplier_payments', req.params.id, row, req.ip);
            res.json({ success: true, message: 'Fattura aggiornata con successo.' });
        });
    });
});

// --- Modifica Ticket ---
app.put('/api/tickets/:id', authenticateToken, isAdmin, (req, res) => {
    const { category, title, description, priority, status } = req.body;
    db.get('SELECT * FROM tickets WHERE id = ?', [req.params.id], (err, row) => {
        if (err || !row) return res.status(404).json({ success: false, message: 'Ticket non trovato' });
        
        db.run(\`UPDATE tickets SET category=?, title=?, description=?, priority=?, status=?, updated_at=CURRENT_TIMESTAMP WHERE id = ?\`,
        [category, title, description, priority, status, req.params.id], function(err) {
            if (err) return res.status(500).json({ success: false, error: err.message });
            logAction(req.user.id, 'Update', 'tickets', req.params.id, row, req.ip);
            res.json({ success: true, message: 'Ticket aggiornato con successo.' });
        });
    });
});

// --- Dettatura Verbale ---
app.post('/api/assemblies/:id/minutes', authenticateToken, isAdmin, (req, res) => {
    const { text } = req.body;
    db.get('SELECT * FROM assemblies WHERE id = ?', [req.params.id], (err, row) => {
        if (err || !row) return res.status(404).json({ success: false, message: 'Assemblea non trovata' });
        
        db.run(\`UPDATE assemblies SET minutes_summary = ? WHERE id = ?\`, [text, req.params.id], function(err) {
            if (err) return res.status(500).json({ success: false, error: err.message });
            logAction(req.user.id, 'UpdateMinutes', 'assemblies', req.params.id, row, req.ip);
            res.json({ success: true, message: 'Verbale aggiornato.' });
        });
    });
});

// --- Conti Bancari ---
app.get('/api/bank-accounts', authenticateToken, isAdmin, (req, res) => {
    db.all('SELECT * FROM bank_accounts ORDER BY id ASC', [], (err, rows) => {
        if (err) return res.status(500).json({ success: false, error: err.message });
        res.json({ success: true, data: rows });
    });
});

app.post('/api/bank-accounts', authenticateToken, isAdmin, (req, res) => {
    const { banca, iban, intestazione, note } = req.body;
    db.run(\`INSERT INTO bank_accounts (banca, iban, intestazione, note) VALUES (?, ?, ?, ?)\`,
    [banca, iban, intestazione, note], function(err) {
        if (err) return res.status(500).json({ success: false, error: err.message });
        logAction(req.user.id, 'Insert', 'bank_accounts', this.lastID, null, req.ip);
        res.json({ success: true, message: 'Conto aggiunto.', id: this.lastID });
    });
});

app.get('/api/bank-transactions', authenticateToken, isAdmin, (req, res) => {
    db.all('SELECT * FROM bank_transactions ORDER BY data DESC', [], (err, rows) => {
        if (err) return res.status(500).json({ success: false, error: err.message });
        res.json({ success: true, data: rows });
    });
});

app.post('/api/bank-transactions', authenticateToken, isAdmin, (req, res) => {
    const { account_id, data, importo, causale, tipo } = req.body;
    db.run(\`INSERT INTO bank_transactions (account_id, data, importo, causale, tipo) VALUES (?, ?, ?, ?, ?)\`,
    [account_id, data, importo, causale, tipo], function(err) {
        if (err) return res.status(500).json({ success: false, error: err.message });
        logAction(req.user.id, 'Insert', 'bank_transactions', this.lastID, null, req.ip);
        res.json({ success: true, message: 'Movimento aggiunto.', id: this.lastID });
    });
});

// --- Libro Giornale ---
app.get('/api/journal', authenticateToken, isAdmin, (req, res) => {
    db.all('SELECT * FROM journal_entries ORDER BY data DESC, id DESC', [], (err, rows) => {
        if (err) return res.status(500).json({ success: false, error: err.message });
        res.json({ success: true, data: rows });
    });
});

app.post('/api/journal', authenticateToken, isAdmin, (req, res) => {
    const { data, numero, tipo, descrizione, dare, avere, conto } = req.body;
    db.run(\`INSERT INTO journal_entries (data, numero, tipo, descrizione, dare, avere, conto) VALUES (?, ?, ?, ?, ?, ?, ?)\`,
    [data, numero, tipo, descrizione, dare || 0, avere || 0, conto], function(err) {
        if (err) return res.status(500).json({ success: false, error: err.message });
        logAction(req.user.id, 'Insert', 'journal_entries', this.lastID, null, req.ip);
        res.json({ success: true, message: 'Registrazione aggiunta.', id: this.lastID });
    });
});

`;

content = content.replace('// Fallback SPA', newEndpoints + '\n// Fallback SPA');
fs.writeFileSync(serverFile, content, 'utf8');
console.log('Endpoints added to server.js');
