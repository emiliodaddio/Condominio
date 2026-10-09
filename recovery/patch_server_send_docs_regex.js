const fs = require('fs');
let server = fs.readFileSync('server.js', 'utf8');

const regexQuery = /db\.get\('SELECT q\.\*, u\.nome, u\.email, uc\.unita FROM quotes q JOIN users u ON q\.user_id = u\.id JOIN user_condominios uc ON u\.id = uc\.user_id AND uc\.condominio_id = q\.condominio_id WHERE q\.id = \?',[\s\S]*?\[quoteId\], async \(err, quote\) => \{/g;
const replaceQuery = `db.get('SELECT q.*, p.nome, p.cognome, p.email, ui.identificativo as unita FROM quotes q JOIN anagrafica_persone p ON q.persona_id = p.id LEFT JOIN unita_immobiliari ui ON q.unita_id = ui.id WHERE q.id = ?', \n[quoteId], async (err, quote) => {\n            if (quote) quote.nome = (quote.cognome ? quote.cognome + ' ' : '') + quote.nome;`;

server = server.replace(regexQuery, replaceQuery);

const regexLog = /db\.run\('INSERT INTO convocations_log \(condominio_id, user_id, destinatario, email, preview_url\) VALUES \(\?, \?, \?, \?, \?\)',[\s\S]*?\[req\.condominio_id, quote\.user_id,/g;
const replaceLog = `db.run('INSERT INTO convocations_log (condominio_id, user_id, destinatario, email, preview_url) VALUES (?, ?, ?, ?, ?)', \n                    [req.condominio_id, null,`;

server = server.replace(regexLog, replaceLog);

fs.writeFileSync('server.js', server);
console.log('Fixed with proper regex');
