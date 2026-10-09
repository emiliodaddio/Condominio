const fs = require('fs');
let js = fs.readFileSync('public/app_v3.js', 'utf8');

const setupUINew = `
    const currentCondo = user.condomini ? user.condomini.find(c => c.id == state.activeCondominioId) : null;
    const isAdmin = user.is_superadmin || (currentCondo && currentCondo.role === 'admin');
    
    // FISSA IL RUOLO NELLO STATE
    state.currentUser.role = isAdmin ? 'admin' : 'condomino';

    if (user.condomini && user.condomini.length > 1) {
`;

js = js.replace(/const currentCondo = user\.condomini \? user\.condomini\.find\(c => c\.id == state\.activeCondominioId\) : null;\s*const isAdmin = user\.is_superadmin \|\| \(currentCondo && currentCondo\.role === 'admin'\);\s*if \(user\.condomini && user\.condomini\.length > 1\) \{/, setupUINew);

fs.writeFileSync('public/app_v3.js', js);
console.log('Fixed state.currentUser.role assignment');
