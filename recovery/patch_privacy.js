const fs = require('fs');
let code = fs.readFileSync('public/app_v4.js', 'utf8');

const regex = /function checkPrivacyStatus\(\) \{\s*if \(state\.currentUser\.role !== 'admin' && state\.currentUser\.privacy_accepted !== 1\) \{\s*document\.getElementById\('modal-privacy'\)\.classList\.remove\('hidden'\);\s*\}\s*\}/;
const newFn = `function checkPrivacyStatus() {
    const user = state.currentUser;
    const isGlobalAdmin = user.is_superadmin || (user.condomini && user.condomini.some(c => c.role === 'admin'));
    if (!isGlobalAdmin && user.privacy_accepted !== 1) {
        document.getElementById('modal-privacy').classList.remove('hidden');
    }
}`;

code = code.replace(regex, newFn);
fs.writeFileSync('public/app_v4.js', code);
console.log('Fixed privacy check');
