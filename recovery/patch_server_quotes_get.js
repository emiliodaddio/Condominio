const fs = require('fs');
let server = fs.readFileSync('server.js', 'utf8');

// Replace /api/receivables
const recRegex = /app\.get\('\/api\/receivables', authenticateToken, requireCondominio, \(req, res\) => \{[\s\S]*?\}\);/;
const recReplace = `app.get('/api/receivables', authenticateToken, requireCondominio, (req, res) => {
    db.all(\`SELECT q.*, p.nome as persona_nome, p.cognome as persona_cognome, ui.identificativo as unita 
             FROM quotes q 
             LEFT JOIN anagrafica_persone p ON q.persona_id = p.id 
             LEFT JOIN unita_immobiliari ui ON q.unita_id = ui.id 
             WHERE q.condominio_id = ? AND q.status = 'In sospeso'\`, 
    [req.condominio_id], (err, rows) => {
        if (err) return res.status(500).json({success: false, message: err.message});
        if (req.role_in_condominio === 'admin') {
            res.json({ success: true, data: rows.map(r => ({ ...r, debitore: r.persona_cognome ? r.persona_cognome + ' ' + r.persona_nome : 'Sconosciuto', unita: r.unita || '-', titolo_quota: r.title, importo: r.amount, scadenza: r.due_date })) });
        } else {
            // Anonimizzazione
            let i = 1;
            const data = rows.map(r => {
                // TODO: match user with persona if possible, for now just anonymize all
                return {
                    id: r.id, is_my_quote: false, importo: r.amount, scadenza: r.due_date, titolo_quota: r.title,
                    debitore: 'Condòmino #' + (i++), unita: 'Unità Riservata'
                };
            });
            res.json({ success: true, data });
        }
    });
});`;
server = server.replace(recRegex, recReplace);

// Replace /api/quotes
const qRegex = /app\.get\('\/api\/quotes', authenticateToken, requireCondominio, \(req, res\) => \{[\s\S]*?\}\);/;
const qReplace = `app.get('/api/quotes', authenticateToken, requireCondominio, (req, res) => {
    db.all(\`SELECT q.*, p.nome as persona_nome, p.cognome as persona_cognome, ui.identificativo as condomino_unita 
             FROM quotes q 
             LEFT JOIN anagrafica_persone p ON q.persona_id = p.id 
             LEFT JOIN unita_immobiliari ui ON q.unita_id = ui.id 
             WHERE q.condominio_id = ? ORDER BY q.due_date ASC\`, 
    [req.condominio_id], (err, rows) => {
        if (err) return res.status(500).json({success: false, message: err.message});
        // Remap to match what frontend expects
        const mapped = rows.map(r => ({...r, condomino_nome: r.persona_cognome ? r.persona_cognome + ' ' + r.persona_nome : 'Sconosciuto', condomino_unita: r.condomino_unita || '-'}));
        res.json({ success: true, data: mapped });
    });
});`;
server = server.replace(qRegex, qReplace);

fs.writeFileSync('server.js', server);
console.log('Fixed quotes GET endpoints');
