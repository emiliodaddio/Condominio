const fs = require('fs');
let server = fs.readFileSync('server.js', 'utf8');

const target = `db.all('SELECT * FROM convocations_log WHERE condominio_id = ? ORDER BY data_invio DESC', [req.condominio_id], (err, rows) => {`;
const replacement = `db.all('SELECT * FROM convocations_log WHERE condominio_id = ? OR condominio_id = 0 ORDER BY data_invio DESC', [req.condominio_id], (err, rows) => {`;

if (server.includes(target)) {
    server = server.replace(target, replacement);
    fs.writeFileSync('server.js', server);
    console.log('Query updated for comm log');
} else {
    console.log('Target not found');
}
