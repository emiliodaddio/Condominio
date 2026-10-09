const fs = require('fs');
let code = fs.readFileSync('server.js', 'utf8');

code = code.replace(
    'SELECT u.id, u.nome, u.email, u.telefono, u.two_factor_enabled, u.created_at, uc.role, uc.unita, uc.dati_catastali',
    'SELECT u.id, u.nome, u.email, u.telefono, u.two_factor_enabled, u.created_at, u.privacy_accepted, u.privacy_accepted_at, uc.role, uc.unita, uc.dati_catastali'
);

fs.writeFileSync('server.js', code);
