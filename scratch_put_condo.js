const fs = require('fs');

let server = fs.readFileSync('server.js', 'utf8');

const newStr = `app.put('/api/condominio', authenticateToken, requireCondominio, isAdmin, (req, res) => {
    const fields = ['nome', 'indirizzo', 'cf', 'scala', 'admin_nome', 'admin_cognome', 'admin_titolo', 'admin_telefono', 'admin_cellulare', 'admin_emergenze', 'admin_email', 'admin_pec'];
    let updatePairs = [];
    let params = [];
    
    fields.forEach(f => {
        if (req.body[f] !== undefined) {
            updatePairs.push(f + ' = ?');
            params.push(req.body[f]);
        }
    });

    if (updatePairs.length === 0) return res.json({ success: true });

    params.push(req.condominio_id);
    const query = 'UPDATE condominios SET ' + updatePairs.join(', ') + ' WHERE id = ?';
    
    db.run(query, params, function(err) {
        if (err) return res.status(500).json({ success: false, error: err.message });
        res.json({ success: true });
    });
});
`;

let targetGet = "app.get('/api/condominio', authenticateToken, requireCondominio, (req, res) => {\n    db.get('SELECT * FROM condominios WHERE id = ?', [req.condominio_id], (err, row) => {\n        res.json({ success: true, data: row || {} });\n    });\n});";

if (server.includes(targetGet)) {
    server = server.replace(targetGet, targetGet + '\n\n' + newStr);
    fs.writeFileSync('server.js', server);
    console.log("Injected app.put('/api/condominio') successfully!");
} else {
    console.log("Could not find targetGet block!");
}
