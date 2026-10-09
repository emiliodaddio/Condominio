const fs = require('fs');
let server = fs.readFileSync('server.js', 'utf8');

const targetRoute = `app.post('/api/tickets/:id/updates', authenticateToken, requireCondominio, (req, res) => {
    const { message } = req.body;
    db.run('INSERT INTO ticket_updates (ticket_id, user_id, message) VALUES (?, ?, ?)',
    [req.params.id, req.user.id, message], function(err) {
        if (err) return res.status(500).json({ success: false });
        res.json({ success: true });
    });
});`;

const replacementRoute = `app.post('/api/tickets/:id/updates', authenticateToken, requireCondominio, (req, res) => {
    const { message } = req.body;
    db.run('INSERT INTO ticket_updates (ticket_id, user_id, author_name, message) VALUES (?, ?, ?, ?)',
    [req.params.id, req.user.id, req.user.nome, message], function(err) {
        if (err) {
            console.error('Ticket update error:', err);
            return res.status(500).json({ success: false, message: 'Database error' });
        }
        res.json({ success: true });
    });
});`;

if (server.includes('INSERT INTO ticket_updates (ticket_id, user_id, message)')) {
    server = server.replace(targetRoute, replacementRoute);
    fs.writeFileSync('server.js', server);
    console.log('Fixed ticket update route to include author_name');
} else {
    console.log('Target route not found');
}
