const fs = require('fs');
let server = fs.readFileSync('server.js', 'utf8');

const postRoute = `app.post('/api/supplier-payments', authenticateToken, requireCondominio, isAdmin, (req, res) => {
    const { supplier_name, category, invoice_number, amount, payment_date, status, notes } = req.body;
    db.run('INSERT INTO supplier_payments (condominio_id, supplier_name, category, invoice_number, amount, payment_date, status, notes) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        [req.condominio_id, supplier_name, category, invoice_number, amount, payment_date, status, notes], function(err) {
            res.json({ success: !err });
        });
});`;

const putRoute = `
app.put('/api/supplier-payments/:id', authenticateToken, requireCondominio, isAdmin, (req, res) => {
    const { amount, status } = req.body;
    db.run('UPDATE supplier_payments SET amount = ?, status = ? WHERE id = ? AND condominio_id = ?',
        [amount, status, req.params.id, req.condominio_id], function(err) {
            if (err) return res.status(500).json({ success: false, error: err.message });
            res.json({ success: true });
        });
});
`;

if (server.includes('app.post(\'/api/supplier-payments\'')) {
    server = server.replace(postRoute, postRoute + putRoute);
    fs.writeFileSync('server.js', server);
    console.log('Added PUT route for supplier-payments');
} else {
    console.log('Target POST route not found');
}
