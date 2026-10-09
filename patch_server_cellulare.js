const fs = require('fs');
let server = fs.readFileSync('server.js', 'utf8');

// 1. Add column to database initialization
const tableMatch = "CREATE TABLE IF NOT EXISTS anagrafica_persone (";
if (server.includes(tableMatch)) {
    server = server.replace(tableMatch, tableMatch + "\n            cellulare TEXT,");
    server = server.replace('db.run("ALTER TABLE unita_immobiliari ADD COLUMN proprietario_id INTEGER", (err) => { /* ignora se esiste */ });', 'db.run("ALTER TABLE anagrafica_persone ADD COLUMN cellulare TEXT", (err) => { /* ignora se esiste */ });\n        db.run("ALTER TABLE unita_immobiliari ADD COLUMN proprietario_id INTEGER", (err) => { /* ignora se esiste */ });');
}

// 2. Update POST route
const postRouteMatch = "const { nome, cognome, codice_fiscale, telefono, email, ruolo_default, notes } = req.body;";
const postRouteReplace = "const { nome, cognome, codice_fiscale, telefono, cellulare, email, ruolo_default, notes } = req.body;";
server = server.replace(postRouteMatch, postRouteReplace);

const postInsertMatch = "db.run(`INSERT INTO anagrafica_persone (condominio_id, nome, cognome, codice_fiscale, telefono, email, ruolo_default, notes) \n            VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,\n        [req.condominio_id, nome, cognome, codice_fiscale, telefono, email, ruolo_default || 'Proprietario', notes]";
const postInsertReplace = "db.run(`INSERT INTO anagrafica_persone (condominio_id, nome, cognome, codice_fiscale, telefono, cellulare, email, ruolo_default, notes) \n            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,\n        [req.condominio_id, nome, cognome, codice_fiscale, telefono, cellulare, email, ruolo_default || 'Proprietario', notes]";
server = server.replace(postInsertMatch, postInsertReplace);

// 3. Update PUT route
const putRouteMatch = "const { nome, cognome, codice_fiscale, telefono, email, ruolo_default, notes } = req.body;";
const putRouteReplace = "const { nome, cognome, codice_fiscale, telefono, cellulare, email, ruolo_default, notes } = req.body;";
server = server.replace(putRouteMatch, putRouteReplace);

const putUpdateMatch = "db.run(`UPDATE anagrafica_persone \n            SET nome = ?, cognome = ?, codice_fiscale = ?, telefono = ?, email = ?, ruolo_default = ?, notes = ? \n            WHERE id = ? AND condominio_id = ?`,\n        [nome, cognome, codice_fiscale, telefono, email, ruolo_default, notes, req.params.id, req.condominio_id]";
const putUpdateReplace = "db.run(`UPDATE anagrafica_persone \n            SET nome = ?, cognome = ?, codice_fiscale = ?, telefono = ?, cellulare = ?, email = ?, ruolo_default = ?, notes = ? \n            WHERE id = ? AND condominio_id = ?`,\n        [nome, cognome, codice_fiscale, telefono, cellulare, email, ruolo_default, notes, req.params.id, req.condominio_id]";
server = server.replace(putUpdateMatch, putUpdateReplace);

fs.writeFileSync('server.js', server);
console.log('Updated server.js for cellulare in anagrafica_persone');
