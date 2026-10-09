const fs = require('fs');
let server = fs.readFileSync('server.js', 'utf8');

// Fix send-receipt
const receiptQueryOld = "db.get('SELECT q.*, u.nome, u.email, uc.unita FROM quotes q JOIN users u ON q.user_id = u.id JOIN user_condominios uc ON u.id = uc.user_id AND uc.condominio_id = q.condominio_id WHERE q.id = ?', \n[quoteId], async (err, quote) => {";
const receiptQueryNew = "db.get('SELECT q.*, p.nome, p.cognome, p.email, ui.identificativo as unita FROM quotes q JOIN anagrafica_persone p ON q.persona_id = p.id LEFT JOIN unita_immobiliari ui ON q.unita_id = ui.id WHERE q.id = ?', \n[quoteId], async (err, quote) => {\n            if (quote) quote.nome = (quote.cognome ? quote.cognome + ' ' : '') + quote.nome;";
server = server.replace(receiptQueryOld, receiptQueryNew);

const receiptLogOld = `db.run('INSERT INTO convocations_log (condominio_id, user_id, destinatario, email, preview_url) VALUES (?, ?, ?, ?, ?)', \n                    [req.condominio_id, quote.user_id, 'RICEVUTA: ' + quote.nome, quote.email, previewUrl]);`;
const receiptLogNew = `db.run('INSERT INTO convocations_log (condominio_id, user_id, destinatario, email, preview_url) VALUES (?, ?, ?, ?, ?)', \n                    [req.condominio_id, null, 'RICEVUTA: ' + quote.nome, quote.email, previewUrl]);`;
server = server.replace(receiptLogOld, receiptLogNew);

// Fix send-reminder
const reminderQueryOld = "db.get('SELECT q.*, u.nome, u.email, uc.unita FROM quotes q JOIN users u ON q.user_id = u.id JOIN user_condominios uc ON u.id = uc.user_id AND uc.condominio_id = q.condominio_id WHERE q.id = ?', \n[quoteId], async (err, quote) => {";
const reminderQueryNew = "db.get('SELECT q.*, p.nome, p.cognome, p.email, ui.identificativo as unita FROM quotes q JOIN anagrafica_persone p ON q.persona_id = p.id LEFT JOIN unita_immobiliari ui ON q.unita_id = ui.id WHERE q.id = ?', \n[quoteId], async (err, quote) => {\n            if (quote) quote.nome = (quote.cognome ? quote.cognome + ' ' : '') + quote.nome;";
server = server.replace(reminderQueryOld, reminderQueryNew);

const reminderLogOld = `db.run('INSERT INTO convocations_log (condominio_id, user_id, destinatario, email, preview_url) VALUES (?, ?, ?, ?, ?)', \n                    [req.condominio_id, quote.user_id, 'SOLLECITO: ' + quote.nome, quote.email, previewUrl]);`;
const reminderLogNew = `db.run('INSERT INTO convocations_log (condominio_id, user_id, destinatario, email, preview_url) VALUES (?, ?, ?, ?, ?)', \n                    [req.condominio_id, null, 'SOLLECITO: ' + quote.nome, quote.email, previewUrl]);`;
server = server.replace(reminderLogOld, reminderLogNew);

fs.writeFileSync('server.js', server);
console.log('Fixed send-receipt and send-reminder queries');
