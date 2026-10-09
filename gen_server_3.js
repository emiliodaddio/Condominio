const fs = require('fs');
const path = require('path');

const serverContent3 = `

// ENDPOINT MULTI-TENANT

app.get('/api/condominios', authenticateToken, (req, res) => {
    if (req.user.is_superadmin) {
        db.all('SELECT * FROM condominios', [], (err, rows) => res.json({ success: true, data: rows }));
    } else {
        res.status(403).json({success:false});
    }
});

app.get('/api/condominio', authenticateToken, requireCondominio, (req, res) => {
    db.get('SELECT * FROM condominios WHERE id = ?', [req.condominio_id], (err, row) => {
        res.json({ success: true, data: row || {} });
    });
});

app.put('/api/condominio', authenticateToken, requireCondominio, isAdmin, (req, res) => {
    const { nome, indirizzo, cf, scala, piano } = req.body;
    db.run(\`UPDATE condominios SET nome = ?, indirizzo = ?, cf = ?, scala = ?, piano = ? WHERE id = ?\`,
    [nome, indirizzo, cf, scala, piano, req.condominio_id], function(err) {
        res.json({ success: true, message: 'Dati condominio aggiornati.' });
    });
});

// USERS per condominio
app.get('/api/users', authenticateToken, requireCondominio, isAdmin, (req, res) => {
    db.all('SELECT u.id, u.nome, u.email, uc.role, uc.unita, u.created_at FROM users u JOIN user_condominios uc ON u.id = uc.user_id WHERE uc.condominio_id = ?', 
    [req.condominio_id], (err, rows) => {
        res.json({ success: true, data: rows });
    });
});

app.put('/api/users/:id', authenticateToken, requireCondominio, isAdmin, (req, res) => {
    const { unita, role } = req.body;
    db.run(\`UPDATE user_condominios SET unita = ?, role = ? WHERE user_id = ? AND condominio_id = ?\`,
    [unita, role, req.params.id, req.condominio_id], function(err) {
        res.json({ success: true, message: 'Utente aggiornato con successo.' });
    });
});

// ACCOUNTING SUMMARY
app.get('/api/accounting-summary', authenticateToken, requireCondominio, (req, res) => {
    if (req.role_in_condominio === 'admin') {
        db.get("SELECT IFNULL(SUM(amount),0) as tot_receivables FROM quotes WHERE status = 'In sospeso' AND condominio_id = ?", [req.condominio_id], (err, rec) => {
            db.get("SELECT IFNULL(SUM(amount),0) as tot_payables FROM supplier_payments WHERE status != 'Pagato' AND condominio_id = ?", [req.condominio_id], (err, pay) => {
                db.get("SELECT IFNULL(SUM(importo),0) as cassa_balance FROM bank_transactions JOIN bank_accounts ON bank_transactions.account_id = bank_accounts.id WHERE bank_accounts.condominio_id = ?", [req.condominio_id], (err, bank) => {
                    res.json({ success: true, data: { receivables: rec.tot_receivables, payables: pay.tot_payables, bank_balance: bank ? bank.cassa_balance : 0 } });
                });
            });
        });
    } else {
        db.get("SELECT IFNULL(SUM(amount),0) as tot_receivables FROM quotes WHERE status = 'In sospeso' AND user_id = ? AND condominio_id = ?", [req.user.id, req.condominio_id], (err, rec) => {
            res.json({ success: true, data: { receivables: rec.tot_receivables, payables: 0, bank_balance: 0 } });
        });
    }
});

// QUOTES
app.get('/api/quotes', authenticateToken, requireCondominio, (req, res) => {
    if (req.role_in_condominio === 'admin') {
        db.all('SELECT q.*, u.nome as condomino_nome, uc.unita as condomino_unita FROM quotes q JOIN users u ON q.user_id = u.id JOIN user_condominios uc ON u.id = uc.user_id AND uc.condominio_id = q.condominio_id WHERE q.condominio_id = ? ORDER BY q.due_date ASC', 
        [req.condominio_id], (err, rows) => {
            res.json({ success: true, data: rows });
        });
    } else {
        db.all('SELECT * FROM quotes WHERE user_id = ? AND condominio_id = ? ORDER BY due_date ASC', 
        [req.user.id, req.condominio_id], (err, rows) => {
            res.json({ success: true, data: rows });
        });
    }
});

app.put('/api/quotes/:id', authenticateToken, requireCondominio, isAdmin, (req, res) => {
    const { amount, due_date, status } = req.body;
    db.run(\`UPDATE quotes SET amount = ?, due_date = ?, status = ? WHERE id = ? AND condominio_id = ?\`,
    [amount, due_date, status, req.params.id, req.condominio_id], function(err) {
        res.json({ success: true, message: 'Quota aggiornata.' });
    });
});

app.patch('/api/quotes/:id/pay', authenticateToken, requireCondominio, isAdmin, (req, res) => {
    db.run(\`UPDATE quotes SET status = 'Pagato', payment_date = ? WHERE id = ? AND condominio_id = ?\`,
    [new Date().toISOString().slice(0, 10), req.params.id, req.condominio_id], function(err) {
        res.json({ success: true });
    });
});

// SUPPLIERS
app.get('/api/supplier-payments', authenticateToken, requireCondominio, (req, res) => {
    db.all('SELECT * FROM supplier_payments WHERE condominio_id = ?', [req.condominio_id], (err, rows) => {
        res.json({ success: true, data: rows });
    });
});

app.post('/api/supplier-payments', authenticateToken, requireCondominio, isAdmin, (req, res) => {
    const { supplier_name, category, invoice_number, amount, payment_date, status, notes } = req.body;
    db.run(\`INSERT INTO supplier_payments (condominio_id, supplier_name, category, invoice_number, amount, payment_date, status, notes) VALUES (?, ?, ?, ?, ?, ?, ?, ?)\`,
    [req.condominio_id, supplier_name, category, invoice_number, amount, payment_date, status, notes], function(err) {
        res.json({ success: true });
    });
});

app.put('/api/supplier-payments/:id', authenticateToken, requireCondominio, isAdmin, (req, res) => {
    const { amount, status } = req.body;
    db.run(\`UPDATE supplier_payments SET amount = ?, status = ? WHERE id = ? AND condominio_id = ?\`,
    [amount, status, req.params.id, req.condominio_id], function(err) {
        res.json({ success: true });
    });
});

// TICKETS
app.get('/api/tickets', authenticateToken, requireCondominio, (req, res) => {
    const filter = req.role_in_condominio === 'admin' ? '1=1' : \`user_id = \${req.user.id}\`;
    db.all(\`SELECT t.*, u.nome as user_nome, uc.unita FROM tickets t JOIN users u ON t.user_id = u.id JOIN user_condominios uc ON u.id = uc.user_id AND uc.condominio_id = t.condominio_id WHERE t.condominio_id = ? AND \${filter} ORDER BY t.created_at DESC\`, 
    [req.condominio_id], (err, rows) => {
        res.json({ success: true, data: rows });
    });
});

app.patch('/api/tickets/:id/status', authenticateToken, requireCondominio, isAdmin, (req, res) => {
    db.run(\`UPDATE tickets SET status = ? WHERE id = ? AND condominio_id = ?\`,
    [req.body.status, req.params.id, req.condominio_id], function(err) {
        res.json({ success: true });
    });
});

// OTHERS
app.get('/api/receivables', authenticateToken, requireCondominio, (req, res) => {
    db.all('SELECT q.*, u.nome as debtor_name, uc.unita as debtor_unit FROM quotes q JOIN users u ON q.user_id = u.id JOIN user_condominios uc ON u.id = uc.user_id AND uc.condominio_id = q.condominio_id WHERE q.condominio_id = ? AND q.status = "In sospeso"', 
    [req.condominio_id], (err, rows) => {
        if (req.role_in_condominio === 'admin') {
            res.json({ success: true, data: rows.map(r => ({ ...r, debitore: r.debtor_name, unita: r.debtor_unit, titolo_quota: r.title, importo: r.amount, scadenza: r.due_date })) });
        } else {
            let i = 1;
            const data = rows.map(r => {
                const isOwn = r.user_id === req.user.id;
                return {
                    id: r.id, is_my_quote: isOwn, importo: r.amount, scadenza: r.due_date, titolo_quota: r.title,
                    debitore: isOwn ? r.debtor_name + ' (Tu)' : 'Condòmino #' + (i++),
                    unita: isOwn ? r.debtor_unit : 'Riservato'
                };
            });
            res.json({ success: true, data });
        }
    });
});

// Fallback per Excel, Bank, Journal...
app.get('/api/export/accounting-excel', authenticateToken, requireCondominio, async (req, res) => {
    // Semplificato per ora, per far ripartire la piattaforma
    res.send('Export non configurato temporaneamente nel refactoring');
});

// Servizio File SPA
app.use((req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

app.listen(PORT, () => {
    console.log(\`====================================================\`);
    console.log(\`🏢 MULTI-TENANT CONDO ONLINE (SaaS)\`);
    console.log(\`🚀 Server in ascolto su: http://localhost:\${PORT}\`);
    console.log(\`====================================================\`);
});
`;

fs.writeFileSync(path.join(__dirname, 'build_server_3.js'), serverContent3, 'utf8');

const fullServer = fs.readFileSync(path.join(__dirname, 'build_server_1.js'), 'utf8') + 
                   fs.readFileSync(path.join(__dirname, 'build_server_2.js'), 'utf8') + 
                   fs.readFileSync(path.join(__dirname, 'build_server_3.js'), 'utf8');

fs.writeFileSync(path.join(__dirname, 'server.js'), fullServer, 'utf8');

console.log('Server refactored to Multi-Tenant!');
