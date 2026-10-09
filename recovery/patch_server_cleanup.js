const fs = require('fs');
let server = fs.readFileSync('server.js', 'utf8');

// 1. Remove the leftover else block from the old receivables
server = server.replace(`        } else {
            // Anonimizzazione per il Condomino
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
});`, '');

// 2. Replace the old POST /api/quotes that still uses user_id
const oldPostQuotes = `app.post('/api/quotes', authenticateToken, requireCondominio, isAdmin, (req, res) => {
    const { user_id, type, title, amount, due_date, description } = req.body;
    db.run(\`INSERT INTO quotes (condominio_id, user_id, type, title, amount, due_date, description) VALUES (?, ?, ?, ?, ?, ?, ?)\`,
    [req.condominio_id, user_id, type, title, amount, due_date, description || ''], function(err) {
        if (err) return res.status(500).json({ success: false, message: 'Errore inserimento quota' });
        logAudit(req.user.id, req.condominio_id, 'Assegnazione Quota', 'quotes', this.lastID, null, req.ip);
        res.json({ success: true });
    });
});`;

const newPostQuotes = `app.post('/api/quotes', authenticateToken, requireCondominio, isAdmin, (req, res) => {
    const { persona_id, unita_id, type, title, amount, due_date, description } = req.body;
    db.run(\`INSERT INTO quotes (condominio_id, persona_id, unita_id, type, title, amount, due_date, description) VALUES (?, ?, ?, ?, ?, ?, ?, ?)\`,
    [req.condominio_id, persona_id, unita_id, type, title, amount, due_date, description || ''], function(err) {
        if (err) return res.status(500).json({ success: false, message: 'Errore inserimento quota' });
        logAudit(req.user.id, req.condominio_id, 'Assegnazione Quota', 'quotes', this.lastID, null, req.ip);
        res.json({ success: true });
    });
});`;

server = server.replace(oldPostQuotes, newPostQuotes);

fs.writeFileSync('server.js', server);
console.log('Cleaned up server.js');
