const fs = require('fs');
let server = fs.readFileSync('server.js', 'utf8');

const regexQuery = /db\.get\('SELECT q\.\*, u\.nome, u\.email, uc\.unita FROM quotes q JOIN users u ON q\.user_id = u\.id JOIN user_condominios uc ON u\.id = uc\.user_id AND uc\.condominio_id = q\.condominio_id WHERE q\.id = \?', \n\[quoteId\], async \(err, quote\) => \{/g;
const replaceQuery = `db.get('SELECT q.*, p.nome, p.cognome, p.email, ui.identificativo as unita FROM quotes q JOIN anagrafica_persone p ON q.persona_id = p.id LEFT JOIN unita_immobiliari ui ON q.unita_id = ui.id WHERE q.id = ?', \n[quoteId], async (err, quote) => {\n            if (quote) quote.nome = (quote.cognome ? quote.cognome + ' ' : '') + quote.nome;`;

// Only replace if it matches exactly
if (regexQuery.test(server)) {
    server = server.replace(regexQuery, replaceQuery);
    
    // Now replace the log queries safely using a simple string replacement
    server = server.split("quote.user_id, 'SOLLECITO: '").join("null, 'SOLLECITO: '");
    server = server.split("quote.user_id, 'RICEVUTA: '").join("null, 'RICEVUTA: '");
    
    fs.writeFileSync('server.js', server);
    console.log('Fixed send docs properly!');
} else {
    console.log('Regex did not match, using fallback!');
    
    // fallback
    const q1 = "db.get('SELECT q.*, u.nome, u.email, uc.unita FROM quotes q JOIN users u ON q.user_id = u.id JOIN user_condominios uc ON u.id = uc.user_id AND uc.condominio_id = q.condominio_id WHERE q.id = ?', \r\n[quoteId], async (err, quote) => {";
    
    server = server.split(q1).join(replaceQuery);
    
    server = server.split("quote.user_id, 'SOLLECITO: '").join("null, 'SOLLECITO: '");
    server = server.split("quote.user_id, 'RICEVUTA: '").join("null, 'RICEVUTA: '");
    
    fs.writeFileSync('server.js', server);
}
