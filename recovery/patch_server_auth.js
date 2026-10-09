const fs = require('fs');

let server = fs.readFileSync('server.js', 'utf8');

const routes = `
// --- PASSWORD RECOVERY ROUTES ---
app.post('/api/auth/forgot-password', (req, res) => {
    const { email } = req.body;
    if (!email) return res.status(400).json({ success: false, message: 'Email obbligatoria' });

    db.get('SELECT id FROM users WHERE LOWER(email) = LOWER(?)', [email.trim()], (err, user) => {
        if (err || !user) {
            return res.json({ success: true, message: 'Se l\\'email esiste nel sistema, riceverai un link per il reset.' });
        }

        const crypto = require('crypto');
        const token = crypto.randomBytes(32).toString('hex');
        const expires = Date.now() + 3600000;

        db.run('UPDATE users SET reset_token = ?, reset_token_expires = ? WHERE id = ?', [token, expires, user.id], (err) => {
            if (err) return res.status(500).json({ success: false, message: 'Errore interno' });

            const host = req.get('host');
            const protocol = req.protocol || 'http';
            const resetLink = \`\${protocol}://\${host}/login.html?token=\${token}\`;

            const mailOptions = {
                from: '"Gestione Condominio" <no-reply@condominio.it>',
                to: email,
                subject: 'Recupero Password - Gestione Condominio',
                text: \`Hai richiesto il reset della password.\\nClicca qui per reimpostarla: \${resetLink}\\nIl link scade tra 1 ora.\`,
                html: \`<p>Hai richiesto il reset della password.</p><p><a href="\${resetLink}">Clicca qui per reimpostarla</a></p><p>Il link scade tra 1 ora.</p>\`
            };

            if (transporter) {
                transporter.sendMail(mailOptions, (err, info) => {
                    if (err) console.error('Errore invio mail reset:', err);
                    else {
                        const nodemailer = require('nodemailer');
                        const url = nodemailer.getTestMessageUrl(info);
                        console.log('🔗 Mail di Reset Password inviata! Anteprima:', url);
                        db.run('INSERT INTO convocations_log (condominio_id, user_id, destinatario, email, preview_url) VALUES (?, ?, ?, ?, ?)', 
                            [0, user.id, 'Reset Password', email, url || '']);
                    }
                });
            }
            res.json({ success: true, message: 'Se l\\'email esiste nel sistema, riceverai un link per il reset.' });
        });
    });
});

app.post('/api/auth/reset-password', (req, res) => {
    const { token, newPassword } = req.body;
    if (!token || !newPassword) return res.status(400).json({ success: false, message: 'Dati mancanti' });

    const pwdRegex = /^(?=.*[A-Z])(?=.*\\d)(?=.*[!@#$%^&*(),.?":{}|<>]).{8,}$/;
    if (!pwdRegex.test(newPassword)) {
        return res.status(400).json({ success: false, message: 'La password non rispetta i criteri minimi.' });
    }

    db.get('SELECT id FROM users WHERE reset_token = ? AND reset_token_expires > ?', [token, Date.now()], (err, user) => {
        if (err || !user) {
            return res.status(400).json({ success: false, message: 'Il link di recupero non è valido o è scaduto.' });
        }

        const hash = bcrypt.hashSync(newPassword, 10);
        db.run('UPDATE users SET password_hash = ?, reset_token = NULL, reset_token_expires = NULL WHERE id = ?', [hash, user.id], (err) => {
            if (err) return res.status(500).json({ success: false, message: 'Errore durante il salvataggio della password.' });
            res.json({ success: true, message: 'Password aggiornata con successo! Ora puoi accedere.' });
        });
    });
});
`;

if (!server.includes('/api/auth/forgot-password')) {
    server = server.replace('app.listen(port, () => {', routes + '\napp.listen(port, () => {');
    fs.writeFileSync('server.js', server);
    console.log('Added auth recovery routes to server.js');
} else {
    console.log('Routes already exist in server.js');
}
