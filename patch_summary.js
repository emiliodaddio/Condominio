const fs = require('fs');
let server = fs.readFileSync('server.js', 'utf8');

const oldSummary = `app.get('/api/accounting-summary', authenticateToken, requireCondominio, (req, res) => {
    // Fake summary for simplicity
    res.json({ success: true, data: { totalReceived: 1500, totalReceivables: 500, totalSuppliersPaid: 800, totalSuppliersDebt: 200 } });
});`;

const newSummary = `app.get('/api/accounting-summary', authenticateToken, requireCondominio, (req, res) => {
    const condominioId = req.condominio_id;
    const data = { totalReceived: 0, totalReceivables: 0, totalSuppliersPaid: 0, totalSuppliersDebt: 0 };
    
    db.serialize(() => {
        db.get("SELECT SUM(amount) as sum FROM quotes WHERE condominio_id = ? AND status = 'Pagato'", [condominioId], (err, row) => {
            if (row && row.sum) data.totalReceived = row.sum;
        });
        db.get("SELECT SUM(amount) as sum FROM quotes WHERE condominio_id = ? AND status = 'In sospeso'", [condominioId], (err, row) => {
            if (row && row.sum) data.totalReceivables = row.sum;
        });
        db.get("SELECT SUM(amount) as sum FROM supplier_payments WHERE condominio_id = ? AND status = 'Pagato'", [condominioId], (err, row) => {
            if (row && row.sum) data.totalSuppliersPaid = row.sum;
        });
        db.get("SELECT SUM(amount) as sum FROM supplier_payments WHERE condominio_id = ? AND status != 'Pagato'", [condominioId], (err, row) => {
            if (row && row.sum) data.totalSuppliersDebt = row.sum;
            // Ultima query, invia la risposta!
            res.json({ success: true, data });
        });
    });
});`;

if (server.includes('// Fake summary for simplicity')) {
    server = server.replace(oldSummary, newSummary);
    fs.writeFileSync('server.js', server);
    console.log('Fixed accounting summary to use real data');
} else {
    console.log('Target string not found');
}
