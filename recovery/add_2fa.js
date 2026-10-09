const fs = require('fs');

let content = fs.readFileSync('server.js', 'utf8');

// 1. Add requires
if (!content.includes("require('otplib')")) {
    content = content.replace(
        "const fs = require('fs');",
        "const fs = require('fs');\nconst { authenticator } = require('otplib');\nconst QRCode = require('qrcode');"
    );
}

// 2. Add columns migration
if (!content.includes("two_factor_secret")) {
    content = content.replace(
        "created_at DATETIME DEFAULT CURRENT_TIMESTAMP\n        )`);",
        "created_at DATETIME DEFAULT CURRENT_TIMESTAMP\n        )`, () => {\n            db.run(`ALTER TABLE users ADD COLUMN two_factor_secret TEXT`, () => {});\n            db.run(`ALTER TABLE users ADD COLUMN two_factor_enabled BOOLEAN DEFAULT 0`, () => {});\n        });"
    );
}

// 3. Update login endpoint
const oldLogin = `// ENDPOINT AUTH
app.post('/api/auth/login', (req, res) => {
    const { email, password } = req.body;
    db.get('SELECT * FROM users WHERE LOWER(email) = LOWER(?)', [email.trim()], (err, user) => {
        if (err || !user) return res.status(401).json({ success: false, message: 'Credenziali non valide.' });
        
        if (!bcrypt.compareSync(password, user.password_hash)) {
            return res.status(401).json({ success: false, message: 'Credenziali non valide.' });
        }

        db.all('SELECT c.id, c.nome, uc.role, uc.unita FROM user_condominios uc JOIN condominios c ON uc.condominio_id = c.id WHERE uc.user_id = ?', [user.id], (err, condomini) => {
            const tokenPayload = { id: user.id, nome: user.nome, email: user.email, is_superadmin: user.is_superadmin };
            const token = jwt.sign(tokenPayload, JWT_SECRET, { expiresIn: '24h' });
            
            res.json({
                success: true,
                token,
                user: { ...tokenPayload, condomini: condomini || [] }
            });
        });
    });
});`;

const newLogin = `// ENDPOINT AUTH
app.post('/api/auth/login', (req, res) => {
    const { email, password } = req.body;
    db.get('SELECT * FROM users WHERE LOWER(email) = LOWER(?)', [email.trim()], (err, user) => {
        if (err || !user) return res.status(401).json({ success: false, message: 'Credenziali non valide.' });
        
        if (!bcrypt.compareSync(password, user.password_hash)) {
            return res.status(401).json({ success: false, message: 'Credenziali non valide.' });
        }

        if (user.two_factor_enabled) {
            return res.json({ success: true, require2FA: true, userId: user.id });
        }

        db.all('SELECT c.id, c.nome, uc.role, uc.unita FROM user_condominios uc JOIN condominios c ON uc.condominio_id = c.id WHERE uc.user_id = ?', [user.id], (err, condomini) => {
            const tokenPayload = { id: user.id, nome: user.nome, email: user.email, is_superadmin: user.is_superadmin };
            const token = jwt.sign(tokenPayload, JWT_SECRET, { expiresIn: '24h' });
            
            res.json({
                success: true,
                token,
                user: { ...tokenPayload, condomini: condomini || [] }
            });
        });
    });
});

app.post('/api/2fa/attiva', authenticateToken, (req, res) => {
    const secret = authenticator.generateSecret();
    const otpauth = authenticator.keyuri(req.user.email, 'Condominio Multi-Tenant', secret);
    
    db.run('UPDATE users SET two_factor_secret = ? WHERE id = ?', [secret, req.user.id], (err) => {
        if (err) return res.status(500).json({ success: false, message: 'Errore db' });
        
        QRCode.toDataURL(otpauth, (err, imageUrl) => {
            if (err) return res.status(500).json({ success: false, message: 'Errore QR Code' });
            res.json({ success: true, qrCodeUrl: imageUrl, secret });
        });
    });
});

app.post('/api/2fa/conferma', authenticateToken, (req, res) => {
    const { token } = req.body;
    db.get('SELECT two_factor_secret FROM users WHERE id = ?', [req.user.id], (err, user) => {
        if (err || !user || !user.two_factor_secret) return res.status(400).json({ success: false, message: '2FA non inizializzata' });
        
        const isValid = authenticator.check(token, user.two_factor_secret);
        if (!isValid) return res.status(400).json({ success: false, message: 'Codice non valido' });
        
        db.run('UPDATE users SET two_factor_enabled = 1 WHERE id = ?', [req.user.id], (err) => {
            res.json({ success: true, message: '2FA attivata con successo' });
        });
    });
});

app.post('/api/2fa/validate', (req, res) => {
    const { userId, token } = req.body;
    db.get('SELECT * FROM users WHERE id = ?', [userId], (err, user) => {
        if (err || !user || !user.two_factor_enabled) return res.status(400).json({ success: false, message: 'Utente non valido o 2FA non attiva' });
        
        const isValid = authenticator.check(token, user.two_factor_secret);
        if (!isValid) return res.status(401).json({ success: false, message: 'Codice non valido' });
        
        db.all('SELECT c.id, c.nome, uc.role, uc.unita FROM user_condominios uc JOIN condominios c ON uc.condominio_id = c.id WHERE uc.user_id = ?', [user.id], (err, condomini) => {
            const tokenPayload = { id: user.id, nome: user.nome, email: user.email, is_superadmin: user.is_superadmin };
            const jwtToken = jwt.sign(tokenPayload, JWT_SECRET, { expiresIn: '24h' });
            
            res.json({
                success: true,
                token: jwtToken,
                user: { ...tokenPayload, condomini: condomini || [] }
            });
        });
    });
});`;

if (!content.includes("/api/2fa/validate")) {
    content = content.replace(oldLogin, newLogin);
}

fs.writeFileSync('server.js', content);
console.log('File server.js aggiornato con successo con gli endpoint 2FA!');
