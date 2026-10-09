const fs = require('fs');
let server = fs.readFileSync('server.js', 'utf8');

const target1 = "db.get('SELECT q.*, u.nome, u.email, uc.unita FROM quotes q JOIN users u ON q.user_id = u.id JOIN user_condominios uc ON u.id = uc.user_id AND uc.condominio_id = q.condominio_id WHERE q.id = ?', \n[quoteId], async (err, quote) => {";
const target2 = "db.get('SELECT q.*, u.nome, u.email, uc.unita FROM quotes q JOIN users u ON q.user_id = u.id JOIN user_condominios uc ON u.id = uc.user_id AND uc.condominio_id = q.condominio_id WHERE q.id = ?', \r\n[quoteId], async (err, quote) => {";

const replacement = "db.get('SELECT q.*, p.nome, p.cognome, p.email, ui.identificativo as unita FROM quotes q JOIN anagrafica_persone p ON q.persona_id = p.id LEFT JOIN unita_immobiliari ui ON q.unita_id = ui.id WHERE q.id = ?', \n[quoteId], async (err, quote) => {\n            if (quote) quote.nome = (quote.cognome ? quote.cognome + ' ' : '') + quote.nome;";

server = server.split(target1).join(replacement);
server = server.split(target2).join(replacement);

const targetLog1 = "db.run('INSERT INTO convocations_log (condominio_id, user_id, destinatario, email, preview_url) VALUES (?, ?, ?, ?, ?)', \n                    [req.condominio_id, quote.user_id,";
const targetLog2 = "db.run('INSERT INTO convocations_log (condominio_id, user_id, destinatario, email, preview_url) VALUES (?, ?, ?, ?, ?)', \r\n                    [req.condominio_id, quote.user_id,";

const replacementLog = "db.run('INSERT INTO convocations_log (condominio_id, user_id, destinatario, email, preview_url) VALUES (?, ?, ?, ?, ?)', \n                    [req.condominio_id, null,";

server = server.split(targetLog1).join(replacementLog);
server = server.split(targetLog2).join(replacementLog);

fs.writeFileSync('server.js', server);
console.log('Fixed send docs with string split!');
