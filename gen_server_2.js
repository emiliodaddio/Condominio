const fs = require('fs');
const path = require('path');

const serverContent2 = `

// MIDDLEWARE AUTENTICAZIONE
function authenticateToken(req, res, next) {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    if (!token) return res.status(401).json({ success: false, message: 'Token mancante.' });

    jwt.verify(token, JWT_SECRET, (err, user) => {
        if (err) return res.status(403).json({ success: false, message: 'Token non valido.' });
        req.user = user;
        next();
    });
}

// MIDDLEWARE PER CONDOMINIO
function requireCondominio(req, res, next) {
    if (req.user.is_superadmin) {
        req.condominio_id = req.headers['x-condominio-id'] || null;
        req.role_in_condominio = 'admin'; // superadmin può fare tutto
        return next();
    }
    
    const cId = req.headers['x-condominio-id'];
    if (!cId) return res.status(400).json({ success: false, message: 'Condominio non selezionato' });

    db.get('SELECT role FROM user_condominios WHERE user_id = ? AND condominio_id = ?', [req.user.id, cId], (err, row) => {
        if (err) return res.status(500).json({ success: false, error: err.message });
        if (!row) return res.status(403).json({ success: false, message: 'Accesso negato a questo condominio.' });
        
        req.condominio_id = cId;
        req.role_in_condominio = row.role;
        next();
    });
}

function isAdmin(req, res, next) {
    if (req.user.is_superadmin || req.role_in_condominio === 'admin') {
        next();
    } else {
        return res.status(403).json({ success: false, message: 'Operazione riservata all\\'amministratore.' });
    }
}

function logAction(userId, condominioId, azione, tabella, recordId, valoriPrecedenti, ip) {
    db.run(
        \`INSERT INTO audit_log (user_id, condominio_id, azione, tabella, record_id, valori_precedenti, ip) VALUES (?, ?, ?, ?, ?, ?, ?)\`,
        [userId, condominioId, azione, tabella, recordId, valoriPrecedenti ? JSON.stringify(valoriPrecedenti) : null, ip]
    );
}

// ENDPOINT AUTH
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
});

app.get('/api/auth/me', authenticateToken, (req, res) => {
    db.get('SELECT id, nome, email, is_superadmin FROM users WHERE id = ?', [req.user.id], (err, user) => {
        if (!user) return res.status(404).json({ success: false });
        db.all('SELECT c.id, c.nome, uc.role, uc.unita FROM user_condominios uc JOIN condominios c ON uc.condominio_id = c.id WHERE uc.user_id = ?', [user.id], (err, condomini) => {
            res.json({ success: true, user: { ...user, condomini: condomini || [] } });
        });
    });
});

`;

fs.writeFileSync(path.join(__dirname, 'build_server_2.js'), serverContent2, 'utf8');
