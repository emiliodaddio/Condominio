const fs = require('fs');
let code = fs.readFileSync('public/app_v4.js', 'utf8');

const regex = /const isAdmin = user\.is_superadmin \|\| \(currentCondo && currentCondo\.role === 'admin'\);/;
const replacement = `const isAdmin = user.is_superadmin || (currentCondo && currentCondo.role === 'admin');

    const btnReturnDash = document.getElementById('btn-return-dashboard');
    if (btnReturnDash) {
        if (user.condomini && user.condomini.length > 1) {
            btnReturnDash.classList.remove('hidden');
        } else {
            btnReturnDash.classList.add('hidden');
        }
    }`;

code = code.replace(regex, replacement);
fs.writeFileSync('public/app_v4.js', code);
