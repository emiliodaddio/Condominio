const fs = require('fs');
let code = fs.readFileSync('server.js', 'utf8');

const putUsers = `
app.put('/api/users/:id', authenticateToken, requireCondominio, isAdmin, (req, res) => {
    const { unita, role, telefono, dati_catastali } = req.body;
    
    if (telefono !== undefined) {
        db.run('UPDATE users SET telefono = ? WHERE id = ?', [telefono, req.params.id]);
    }
    
    db.run('UPDATE user_condominios SET unita = ?, role = ?, dati_catastali = ? WHERE user_id = ? AND condominio_id = ?', 
        [unita, role, dati_catastali, req.params.id, req.condominio_id], function(err) {
        if (err) return res.status(500).json({ success: false, message: 'Errore salvataggio' });
        res.json({ success: true });
    });
});
`;

code = code.replace("app.delete('/api/users/:id', authenticateToken, isAdmin, (req, res) => {", putUsers + "\napp.delete('/api/users/:id', authenticateToken, isAdmin, (req, res) => {");

fs.writeFileSync('server.js', code);
console.log('Successfully injected PUT /api/users/:id');
