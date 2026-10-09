const fs = require('fs');
let server = fs.readFileSync('server.js', 'utf8');

const routes = `
app.put('/api/quotes/:id', authenticateToken, requireCondominio, isAdmin, (req, res) => {
    const { amount, due_date, status } = req.body;
    let payment_date = null;
    if (status === 'Pagato') {
        payment_date = new Date().toISOString().slice(0, 10);
    }
    
    db.run(\`UPDATE quotes SET amount = ?, due_date = ?, status = ?, payment_date = COALESCE(payment_date, ?) WHERE id = ? AND condominio_id = ?\`,
        [amount, due_date, status, payment_date, req.params.id, req.condominio_id], 
        function(err) {
            if (err) return res.status(500).json({ success: false, message: 'Errore aggiornamento quota' });
            logAudit(req.user.id, req.condominio_id, 'Modifica Quota', 'quotes', req.params.id, null, req.ip);
            res.json({ success: true });
        });
});

app.patch('/api/quotes/:id/pay', authenticateToken, requireCondominio, isAdmin, (req, res) => {
    const { payment_date } = req.body;
    db.run(\`UPDATE quotes SET status = 'Pagato', payment_date = ? WHERE id = ? AND condominio_id = ?\`,
        [payment_date || new Date().toISOString().slice(0, 10), req.params.id, req.condominio_id], 
        function(err) {
            if (err) return res.status(500).json({ success: false, message: 'Errore saldo quota' });
            logAudit(req.user.id, req.condominio_id, 'Saldo Quota', 'quotes', req.params.id, null, req.ip);
            res.json({ success: true });
        });
});
`;

if (!server.includes("app.put('/api/quotes/:id'")) {
    server = server.replace("app.post('/api/quotes/:id/send-receipt',", routes + "\napp.post('/api/quotes/:id/send-receipt',");
    fs.writeFileSync('server.js', server);
    console.log('Added PUT and PATCH for quotes');
}
