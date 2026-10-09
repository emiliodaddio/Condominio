const fs = require('fs');
let code = fs.readFileSync('server.js', 'utf8');

const anchor = "// Genera OTP di 6 cifre";
const injection = `
        if (!user.two_factor_enabled) {
            const tokenPayload = { id: user.id, nome: user.nome, email: user.email, is_superadmin: user.is_superadmin, privacy_accepted: user.privacy_accepted };
            const token = jwt.sign(tokenPayload, JWT_SECRET, { expiresIn: '8h' });
            logAudit(user.id, null, 'Login Riuscito', 'users', user.id, null, req.ip);
            return res.json({ success: true, token, user: { id: user.id, nome: user.nome, email: user.email, is_superadmin: user.is_superadmin, privacy_accepted: user.privacy_accepted } });
        }

        // Genera OTP di 6 cifre`;

code = code.replace(anchor, injection);
fs.writeFileSync('server.js', code);
console.log("Injected 2FA bypass!");
