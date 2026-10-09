const fs = require('fs');
let code = fs.readFileSync('public/app_v4.js', 'utf8');

code = code.replace(
    `if (!state.currentUser.is_superadmin && state.currentUser.privacy_accepted !== 1) {`,
    `if (state.currentUser.role !== 'admin' && state.currentUser.privacy_accepted !== 1) {`
);

fs.writeFileSync('public/app_v4.js', code);
