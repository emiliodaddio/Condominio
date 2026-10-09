const fs = require('fs');
let code = fs.readFileSync('server.js', 'utf8');

const missingEndpoints = `
app.put('/api/journal/:id', authenticateToken, requireCondominio, isAdmin, (req, res) => {
    const { data, numero, tipo, descrizione, dare, avere, conto } = req.body;
    db.run('UPDATE journal_entries SET data = ?, numero = ?, tipo = ?, descrizione = ?, dare = ?, avere = ?, conto = ? WHERE id = ? AND condominio_id = ?',
    [data, numero, tipo, descrizione, dare, avere, conto, req.params.id, req.condominio_id], function(err) {
        if (err) return res.status(500).json({ success: false });
        res.json({ success: this.changes > 0 });
    });
});

app.delete('/api/journal/:id', authenticateToken, requireCondominio, isAdmin, (req, res) => {
    db.run('DELETE FROM journal_entries WHERE id = ? AND condominio_id = ?', [req.params.id, req.condominio_id], function(err) {
        if (err) return res.status(500).json({ success: false });
        res.json({ success: this.changes > 0 });
    });
});
`;

if (!code.includes("app.put('/api/journal/:id'")) {
    code = code.replace(
        "app.post('/api/journal', authenticateToken, requireCondominio, isAdmin, (req, res) => {\n    const { data, numero, tipo, descrizione, dare, avere, conto } = req.body;\n    db.run('INSERT INTO journal_entries (condominio_id, data, numero, tipo, descrizione, dare, avere, conto) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',\n    [req.condominio_id, data, numero, tipo, descrizione, dare, avere, conto], function(err) {\n        res.json({ success: !err });\n    });\n});",
        "app.post('/api/journal', authenticateToken, requireCondominio, isAdmin, (req, res) => {\n    const { data, numero, tipo, descrizione, dare, avere, conto } = req.body;\n    db.run('INSERT INTO journal_entries (condominio_id, data, numero, tipo, descrizione, dare, avere, conto) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',\n    [req.condominio_id, data, numero, tipo, descrizione, dare, avere, conto], function(err) {\n        res.json({ success: !err });\n    });\n});\n" + missingEndpoints
    );
    fs.writeFileSync('server.js', code);
    console.log("Added PUT and DELETE endpoints for /api/journal");
}
