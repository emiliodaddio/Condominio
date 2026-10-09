const fs = require('fs');
let server = fs.readFileSync('server.js', 'utf8');

const regex = /CREATE TABLE IF NOT EXISTS quotes \([\s\S]*?\)\`\);/;

const newQuotesSchema = `CREATE TABLE IF NOT EXISTS quotes (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            condominio_id INTEGER NOT NULL,
            persona_id INTEGER,
            unita_id INTEGER,
            type TEXT CHECK(type IN ('ordinaria', 'straordinaria')),
            title TEXT NOT NULL,
            due_date TEXT NOT NULL,
            amount REAL NOT NULL,
            description TEXT,
            status TEXT DEFAULT 'In sospeso' CHECK(status IN ('In sospeso', 'Pagato')),
            payment_date TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY(condominio_id) REFERENCES condominios(id) ON DELETE CASCADE,
            FOREIGN KEY(persona_id) REFERENCES anagrafica_persone(id) ON DELETE CASCADE,
            FOREIGN KEY(unita_id) REFERENCES unita_immobiliari(id) ON DELETE SET NULL
        )\`);`;

if (regex.test(server)) {
    server = server.replace(regex, newQuotesSchema);
    fs.writeFileSync('server.js', server);
    console.log('Fixed quotes schema in server.js');
} else {
    console.log('Schema regex not found');
}
