const fs = require('fs');
let login = fs.readFileSync('public/login.html', 'utf8');

login = login.replace("fetch('/api/login/verify-otp'", "fetch('/api/auth/login/verify-otp'");
login = login.replace("fetch('/api/login'", "fetch('/api/auth/login'");

// Clean up the old executeLogin block and keep only handleLogin (the new async one)
if (login.includes('function executeLogin')) {
    login = login.replace(/async function executeLogin[\s\S]*?\} catch \(err\) \{\s*submitBtn\.disabled = false;\s*submitBtn\.innerHTML = '<span>Accedi al Portale<\/span>';\s*\}\s*\}/g, '');
}

fs.writeFileSync('public/login.html', login);
console.log('Fixed URLs and cleaned up executeLogin');
