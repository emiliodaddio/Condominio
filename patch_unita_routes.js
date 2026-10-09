const fs = require('fs');
let server = fs.readFileSync('server.js', 'utf8');

// Modifica la query GET /api/unita per joinare l'anagrafica
const oldUnitaGet = `app.get('/api/unita', authenticateToken, requireCondominio, (req, res) => {
    db.all('SELECT * FROM unita_immobiliari WHERE condominio_id = ?', [req.condominio_id], (err, rows) => {`;
const newUnitaGet = `app.get('/api/unita', authenticateToken, requireCondominio, (req, res) => {
    db.all(\`SELECT u.*, 
            p.nome as prop_nome, p.cognome as prop_cognome, 
            c.nome as cond_nome, c.cognome as cond_cognome
            FROM unita_immobiliari u 
            LEFT JOIN anagrafica_persone p ON u.proprietario_id = p.id 
            LEFT JOIN anagrafica_persone c ON u.conduttore_id = c.id
            WHERE u.condominio_id = ?\`, [req.condominio_id], (err, rows) => {`;

server = server.replace(oldUnitaGet, newUnitaGet);

// Modifica le query POST e PUT di unita per supportare proprietario_id e conduttore_id
const oldPost = `const { user_id, tipo, identificativo, scala, piano, millesimi_proprieta, millesimi_scale, millesimi_ascensore } = req.body;
    db.run(\`INSERT INTO unita_immobiliari (condominio_id, user_id, tipo, identificativo, scala, piano, millesimi_proprieta, millesimi_scale, millesimi_ascensore) 
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)\`,
        [req.condominio_id, user_id || null, tipo || 'Appartamento', identificativo, scala, piano, millesimi_proprieta || 0, millesimi_scale || 0, millesimi_ascensore || 0],`;

const newPost = `const { proprietario_id, conduttore_id, user_id, tipo, identificativo, scala, piano, millesimi_proprieta, millesimi_scale, millesimi_ascensore } = req.body;
    db.run(\`INSERT INTO unita_immobiliari (condominio_id, user_id, tipo, identificativo, scala, piano, millesimi_proprieta, millesimi_scale, millesimi_ascensore, proprietario_id, conduttore_id) 
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)\`,
        [req.condominio_id, user_id || null, tipo || 'Appartamento', identificativo, scala, piano, millesimi_proprieta || 0, millesimi_scale || 0, millesimi_ascensore || 0, proprietario_id || null, conduttore_id || null],`;

server = server.replace(oldPost, newPost);

const oldPut = `const { user_id, tipo, identificativo, scala, piano, millesimi_proprieta, millesimi_scale, millesimi_ascensore } = req.body;
    db.run(\`UPDATE unita_immobiliari 
            SET user_id = ?, tipo = ?, identificativo = ?, scala = ?, piano = ?, millesimi_proprieta = ?, millesimi_scale = ?, millesimi_ascensore = ? 
            WHERE id = ? AND condominio_id = ?\`,
        [user_id || null, tipo || 'Appartamento', identificativo, scala, piano, millesimi_proprieta || 0, millesimi_scale || 0, millesimi_ascensore || 0, req.params.id, req.condominio_id],`;

const newPut = `const { proprietario_id, conduttore_id, user_id, tipo, identificativo, scala, piano, millesimi_proprieta, millesimi_scale, millesimi_ascensore } = req.body;
    db.run(\`UPDATE unita_immobiliari 
            SET user_id = ?, tipo = ?, identificativo = ?, scala = ?, piano = ?, millesimi_proprieta = ?, millesimi_scale = ?, millesimi_ascensore = ?, proprietario_id = ?, conduttore_id = ?
            WHERE id = ? AND condominio_id = ?\`,
        [user_id || null, tipo || 'Appartamento', identificativo, scala, piano, millesimi_proprieta || 0, millesimi_scale || 0, millesimi_ascensore || 0, proprietario_id || null, conduttore_id || null, req.params.id, req.condominio_id],`;

server = server.replace(oldPut, newPut);

fs.writeFileSync('server.js', server);
console.log('Updated Unita routes in server.js');
