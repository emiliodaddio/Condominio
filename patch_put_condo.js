const fs = require('fs');
let server = fs.readFileSync('server.js', 'utf8');

const targetStr = `app.put('/api/condominio', authenticateToken, requireCondominio, isAdmin, (req, res) => {
    const {
        admin_nome, admin_cognome, admin_titolo, admin_telefono,
        admin_cellulare, admin_emergenze, admin_email, admin_pec
    } = req.body;
    db.run(\`UPDATE condominios SET 
            admin_nome = ?, admin_cognome = ?, admin_titolo = ?, 
            admin_telefono = ?, admin_cellulare = ?, admin_emergenze = ?, 
            admin_email = ?, admin_pec = ? 
            WHERE id = ?\`,
        [admin_nome, admin_cognome, admin_titolo, admin_telefono, admin_cellulare, admin_emergenze, admin_email, admin_pec, req.condominio_id], 
        function(err) {
            if (err) return res.status(500).json({ success: false, error: err.message });
            res.json({ success: true });
        });
});`;

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
});`;

if (server.includes(targetStr)) {
    server = server.replace(targetStr, newStr);
    fs.writeFileSync('server.js', server);
    console.log('Fixed PUT /api/condominio logic');
} else {
    console.log('Target string not found');
}
