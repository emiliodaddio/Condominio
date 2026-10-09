const fs = require('fs');
let server = fs.readFileSync('server.js', 'utf8');
let lines = server.split('\\n');

let newLines = [];
let i = 0;
while (i < lines.length) {
    if (lines[i].includes('SELECT q.*, u.nome, u.email, uc.unita FROM quotes q JOIN users u ON q.user_id = u.id')) {
        newLines.push("        db.get('SELECT q.*, p.nome, p.cognome, p.email, ui.identificativo as unita FROM quotes q JOIN anagrafica_persone p ON q.persona_id = p.id LEFT JOIN unita_immobiliari ui ON q.unita_id = ui.id WHERE q.id = ?', ");
        i++; // skip next line which is [quoteId]...
        newLines.push("[quoteId], async (err, quote) => {");
        newLines.push("            if (quote) quote.nome = (quote.cognome ? quote.cognome + ' ' : '') + quote.nome;");
    } else if (lines[i].includes('INSERT INTO convocations_log (condominio_id, user_id, destinatario, email, preview_url)') && lines[i+1] && lines[i+1].includes('quote.user_id')) {
        newLines.push("                db.run('INSERT INTO convocations_log (condominio_id, user_id, destinatario, email, preview_url) VALUES (?, ?, ?, ?, ?)', ");
        let nextLine = lines[i+1].replace('quote.user_id', 'null');
        newLines.push(nextLine);
        i++; // skip the old next line
    } else {
        newLines.push(lines[i]);
    }
    i++;
}

fs.writeFileSync('server.js', newLines.join('\\n'));
console.log('Fixed line by line');
