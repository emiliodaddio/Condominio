const fs = require('fs');
let server = fs.readFileSync('server.js', 'utf8');

const targetStr = `app.post('/api/auth/login', (req, res) => {
    const { email, password } = req.body;
    db.get('SELECT * FROM users WHERE LOWER(email) = LOWER(?)', [email.trim()], (err, user) => {
        if (err || !user) {
            logAudit(null, null, 'Login Fallito', 'users', null, null, req.ip);
            return res.status(401).json({ success: false, message: 'Credenziali non valide.' });
        }
        
        if (!bcrypt.compareSync(password, user.password_hash)) {
            logAudit(user.id, null, 'Login Fallito (Password)', 'users', user.id, null, req.ip);
            return res.status(401).json({ success: false, message: 'Credenziali non valide.' });
        }

        if (user.two_factor_enabled) {
            logAudit(user.id, null, 'Richiesta 2FA', 'users', user.id, null, req.ip);
            return res.json({ success: true, require2FA: true, userId: user.id });
        }

        logAudit(user.id, null, 'Login Riuscito', 'users', user.id, null, req.ip);
        issueToken(user, res);
    });
});`;

const newStr = `app.post('/api/auth/login', (req, res) => {
    const { email, password } = req.body;
    db.get('SELECT * FROM users WHERE LOWER(email) = LOWER(?)', [email.trim()], (err, user) => {
        if (err || !user) {
            logAudit(null, null, 'Login Fallito', 'users', null, null, req.ip);
            return res.status(401).json({ success: false, message: 'Credenziali non valide.' });
        }
        
        if (!bcrypt.compareSync(password, user.password_hash)) {
            logAudit(user.id, null, 'Login Fallito (Password)', 'users', user.id, null, req.ip);
            return res.status(401).json({ success: false, message: 'Credenziali non valide.' });
        }

        // Genera OTP di 6 cifre
        const otpCode = Math.floor(100000 + Math.random() * 900000).toString();
        const otpExpires = Date.now() + 10 * 60 * 1000; // 10 minuti

        db.run('UPDATE users SET otp_code = ?, otp_expires = ? WHERE id = ?', [otpCode, otpExpires, user.id], async (err) => {
            if (err) return res.status(500).json({ success: false, message: 'Errore di sistema' });

            try {
                let testAccount = await nodemailer.createTestAccount();
                let transporter = nodemailer.createTransport({
                    host: "smtp.ethereal.email",
                    port: 587,
                    secure: false,
                    auth: { user: testAccount.user, pass: testAccount.pass },
                });

                let info = await transporter.sendMail({
                    from: '"CondoTransparent" <no-reply@condominio.it>',
                    to: user.email,
                    subject: "Codice di Accesso (OTP)",
                    text: \`Il tuo codice di accesso è: \${otpCode}\\nScade in 10 minuti.\`,
                    html: \`<h3>Codice di Accesso 2FA</h3><p>Il tuo codice è: <b>\${otpCode}</b></p><p>Scade in 10 minuti.</p>\`,
                });

                const previewUrl = nodemailer.getTestMessageUrl(info);
                console.log("OTP Email sent to", user.email, "- Preview:", previewUrl);

                logAudit(user.id, null, 'Richiesta OTP Login', 'users', user.id, null, req.ip);
                return res.json({ success: true, requireOTP: true, userId: user.id, email: user.email, previewUrl: previewUrl });
            } catch (e) {
                console.error(e);
                return res.status(500).json({ success: false, message: 'Errore invio email OTP' });
            }
        });
    });
});

app.post('/api/auth/login/verify-otp', (req, res) => {
    const { userId, otp } = req.body;
    db.get('SELECT * FROM users WHERE id = ?', [userId], (err, user) => {
        if (err || !user) return res.status(401).json({ success: false, message: 'Utente non trovato' });

        if (user.otp_code !== otp) {
            return res.status(401).json({ success: false, message: 'Codice errato.' });
        }
        if (Date.now() > user.otp_expires) {
            return res.status(401).json({ success: false, message: 'Codice scaduto.' });
        }

        db.run('UPDATE users SET otp_code = NULL, otp_expires = NULL WHERE id = ?', [user.id], () => {
            logAudit(user.id, null, 'Login Riuscito (con OTP)', 'users', user.id, null, req.ip);
            issueToken(user, res);
        });
    });
});`;

if (server.includes(targetStr)) {
    server = server.replace(targetStr, newStr);
    fs.writeFileSync('server.js', server);
    console.log('Server login route replaced');
} else {
    console.log('Target string not found');
}
