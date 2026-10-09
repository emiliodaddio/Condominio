const fs = require('fs');
let code = fs.readFileSync('server.js', 'utf8');

// 1. Update GET /api/users
code = code.replace(
    'SELECT u.id, u.nome, u.email, u.two_factor_enabled, u.created_at, uc.role, uc.unita',
    'SELECT u.id, u.nome, u.email, u.telefono, u.two_factor_enabled, u.created_at, uc.role, uc.unita, uc.dati_catastali'
);

// 2. Update POST /api/users
// Need to find the existing POST /api/users
// It was updated in `fix_users_api.js`.
const postUsersOld = `const { nome, email, password, unita, role } = req.body;
    const hash = bcrypt.hashSync(password, 10);
    
    // Inserisce utente e mappa il condominio
    db.run('INSERT INTO users (nome, email, password_hash) VALUES (?, ?, ?)', [nome, email, hash]`;

const postUsersNew = `const { nome, email, password, unita, role, telefono, dati_catastali } = req.body;
    const hash = bcrypt.hashSync(password, 10);
    
    // Inserisce utente e mappa il condominio
    db.run('INSERT INTO users (nome, email, password_hash, telefono) VALUES (?, ?, ?, ?)', [nome, email, hash, telefono || null]`;

code = code.replace(postUsersOld, postUsersNew);

const postUsersExistingMapOld = `db.run('INSERT INTO user_condominios (user_id, condominio_id, role, unita) VALUES (?, ?, ?, ?)', 
                            [existingUser.id, req.condominio_id, role || 'condomino', unita || '']`;

const postUsersExistingMapNew = `db.run('INSERT INTO user_condominios (user_id, condominio_id, role, unita, dati_catastali) VALUES (?, ?, ?, ?, ?)', 
                            [existingUser.id, req.condominio_id, role || 'condomino', unita || '', dati_catastali || null]`;

code = code.replace(postUsersExistingMapOld, postUsersExistingMapNew);

const postUsersNewMapOld = `db.run('INSERT INTO user_condominios (user_id, condominio_id, role, unita) VALUES (?, ?, ?, ?)', 
            [newUserId, req.condominio_id, role || 'condomino', unita || '']`;

const postUsersNewMapNew = `db.run('INSERT INTO user_condominios (user_id, condominio_id, role, unita, dati_catastali) VALUES (?, ?, ?, ?, ?)', 
            [newUserId, req.condominio_id, role || 'condomino', unita || '', dati_catastali || null]`;

code = code.replace(postUsersNewMapOld, postUsersNewMapNew);

fs.writeFileSync('server.js', code);
console.log('Updated server.js for users fields');
