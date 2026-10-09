const fs = require('fs');

const serverCode = `const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const cors = require('cors');
const multer = require('multer');
const path = require('path');
const ExcelJS = require('exceljs');
const fs = require('fs');
const speakeasy = require('speakeasy');
const QRCode = require('qrcode');

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = 'chiave_segreta_condominio_sicura_123!';

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Assicura l'esistenza della cartella uploads
const uploadDir = path.join(__dirname, 'public', 'uploads');
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
}

// Configurazione Multer
const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, uploadDir),
    filename: (req, file, cb) => cb(null, Date.now() + '-' + Math.round(Math.random() * 1E9) + path.extname(file.originalname))
});
const upload = multer({
    storage, limits: { fileSize: 10 * 1024 * 1024 },
    fileFilter: (req, file, cb) => {
        const allowedTypes = /pdf|jpg|jpeg|png/;
        if (allowedTypes.test(path.extname(file.originalname).toLowerCase()) && allowedTypes.test(file.mimetype)) {
            return cb(null, true);
        }
        cb(new Error('Solo PDF o Immagini (JPG, PNG) sono permessi!'));
    }
});

// Database
const db = new sqlite3.Database(path.join(__dirname, 'condominio.db'), (err) => {
    if (err) console.error('Errore connessione DB:', err.message);
    else console.log('✅ Connesso al database SQLite Multi-Tenant');
});

function initDatabase() {
    db.serialize(() => {
        db.run('PRAGMA foreign_keys = ON');

        // SUPERADMIN / USERS GLOBALI (con campi 2FA e backup codes)
        db.run(\`CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            nome TEXT NOT NULL,
            email TEXT UNIQUE NOT NULL,
            password_hash TEXT NOT NULL,
            is_superadmin BOOLEAN DEFAULT 0,
            two_factor_secret TEXT,
            two_factor_enabled BOOLEAN DEFAULT 0,
            backup_codes TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )\`, () => {
            // Migrazione fail-safe per tabelle esistenti
            db.run(\`ALTER TABLE users ADD COLUMN two_factor_secret TEXT\`, () => {});
            db.run(\`ALTER TABLE users ADD COLUMN two_factor_enabled BOOLEAN DEFAULT 0\`, () => {});
            db.run(\`ALTER TABLE users ADD COLUMN backup_codes TEXT\`, () => {});
        });

        // CONDOMINI
        db.run(\`CREATE TABLE IF NOT EXISTS condominios (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            nome TEXT NOT NULL,
            indirizzo TEXT NOT NULL,
            cf TEXT,
            scala TEXT,
            piano TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )\`);

        // USER_CONDOMINIOS (Mapping Utente <-> Condominio)
        db.run(\`CREATE TABLE IF NOT EXISTS user_condominios (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            condominio_id INTEGER NOT NULL,
            role TEXT NOT NULL CHECK(role IN ('admin', 'condomino')),
            unita TEXT,
            FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE,
            FOREIGN KEY(condominio_id) REFERENCES condominios(id) ON DELETE CASCADE,
            UNIQUE(user_id, condominio_id)
        )\`);

        // QUOTES
        db.run(\`CREATE TABLE IF NOT EXISTS quotes (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            condominio_id INTEGER NOT NULL,
            user_id INTEGER NOT NULL,
            type TEXT CHECK(type IN ('ordinaria', 'straordinaria')),
            title TEXT NOT NULL,
            due_date TEXT NOT NULL,
            amount REAL NOT NULL,
            description TEXT,
            status TEXT DEFAULT 'In sospeso' CHECK(status IN ('In sospeso', 'Pagato')),
            payment_date TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY(condominio_id) REFERENCES condominios(id) ON DELETE CASCADE,
            FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
        )\`);

        // SUPPLIER PAYMENTS
        db.run(\`CREATE TABLE IF NOT EXISTS supplier_payments (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            condominio_id INTEGER NOT NULL,
            supplier_name TEXT NOT NULL,
            category TEXT NOT NULL,
            invoice_number TEXT,
            amount REAL NOT NULL,
            payment_date TEXT NOT NULL,
            status TEXT DEFAULT 'Da liquidare' CHECK(status IN ('Pagato', 'In elaborazione', 'Da liquidare')),
            notes TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY(condominio_id) REFERENCES condominios(id) ON DELETE CASCADE
        )\`);

        // ASSEMBLIES
        db.run(\`CREATE TABLE IF NOT EXISTS assemblies (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            condominio_id INTEGER NOT NULL,
            type TEXT CHECK(type IN ('Ordinaria', 'Straordinaria')),
            title TEXT NOT NULL,
            date TEXT NOT NULL,
            time TEXT NOT NULL,
            location TEXT NOT NULL,
            agenda TEXT NOT NULL,
            meeting_link TEXT,
            is_past BOOLEAN DEFAULT 0,
            minutes_summary TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY(condominio_id) REFERENCES condominios(id) ON DELETE CASCADE
        )\`);

        // TICKETS
        db.run(\`CREATE TABLE IF NOT EXISTS tickets (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            condominio_id INTEGER NOT NULL,
            user_id INTEGER NOT NULL,
            category TEXT NOT NULL,
            title TEXT NOT NULL,
            description TEXT NOT NULL,
            priority TEXT DEFAULT 'Media' CHECK(priority IN ('Bassa', 'Media', 'Alta', 'Urgente')),
            status TEXT DEFAULT 'Segnalato' CHECK(status IN ('Segnalato', 'Preso in carico', 'In lavorazione', 'Risolto', 'Chiuso')),
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY(condominio_id) REFERENCES condominios(id) ON DELETE CASCADE,
            FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
        )\`);

        // BANK ACCOUNTS
        db.run(\`CREATE TABLE IF NOT EXISTS bank_accounts (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            condominio_id INTEGER NOT NULL,
            banca TEXT NOT NULL,
            iban TEXT NOT NULL,
            intestazione TEXT NOT NULL,
            note TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY(condominio_id) REFERENCES condominios(id) ON DELETE CASCADE
        )\`);

        // BANK TRANSACTIONS
        db.run(\`CREATE TABLE IF NOT EXISTS bank_transactions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            account_id INTEGER NOT NULL,
            data TEXT NOT NULL,
            importo REAL NOT NULL,
            causale TEXT NOT NULL,
            tipo TEXT NOT NULL CHECK(tipo IN ('Entrata', 'Uscita')),
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (account_id) REFERENCES bank_accounts(id) ON DELETE CASCADE
        )\`);

        // JOURNAL ENTRIES (Libro Giornale)
        db.run(\`CREATE TABLE IF NOT EXISTS journal_entries (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            condominio_id INTEGER NOT NULL,
            data TEXT NOT NULL,
            numero TEXT,
            tipo TEXT NOT NULL,
            descrizione TEXT NOT NULL,
            dare REAL DEFAULT 0,
            avere REAL DEFAULT 0,
            conto TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY(condominio_id) REFERENCES condominios(id) ON DELETE CASCADE
        )\`);

        // AUDIT LOG
        db.run(\`CREATE TABLE IF NOT EXISTS audit_log (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            condominio_id INTEGER,
            user_id INTEGER,
            azione TEXT NOT NULL,
            tabella TEXT,
            record_id INTEGER,
            valori_precedenti TEXT,
            ip TEXT,
            timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY(condominio_id) REFERENCES condominios(id) ON DELETE CASCADE,
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
        )\`);

        seedInitialData();
    });
}

function seedInitialData() {
    db.get('SELECT COUNT(*) as count FROM users', (err, row) => {
        if (err || (row && row.count > 0)) return;

        const adminHash = bcrypt.hashSync('AdminPassword123!', 10);
        const userHash = bcrypt.hashSync('CondominoPass123!', 10);

        db.serialize(() => {
            db.run("INSERT INTO users (id, nome, email, password_hash, is_superadmin) VALUES (1, 'Super Admin', 'super@condominio.it', ?, 1)", [adminHash]);
            db.run("INSERT INTO users (id, nome, email, password_hash) VALUES (2, 'Studio Rossi', 'admin@condominio.it', ?)", [adminHash]);
            db.run("INSERT INTO users (id, nome, email, password_hash) VALUES (3, 'Mario Rossi', 'mario@email.it', ?)", [userHash]);
            db.run("INSERT INTO users (id, nome, email, password_hash) VALUES (4, 'Luigi Verdi', 'luigi@email.it', ?)", [userHash]);
            
            db.run("INSERT INTO condominios (id, nome, indirizzo, cf) VALUES (1, 'Condominio Le Ginestre', 'Via Roma 1', '90012345678')");
            db.run("INSERT INTO condominios (id, nome, indirizzo, cf) VALUES (2, 'Condominio I Pini', 'Via Milano 2', '90087654321')");

            db.run("INSERT INTO user_condominios (user_id, condominio_id, role, unita) VALUES (2, 1, 'admin', 'Ufficio')");
            db.run("INSERT INTO user_condominios (user_id, condominio_id, role, unita) VALUES (2, 2, 'admin', 'Ufficio')");
            db.run("INSERT INTO user_condominios (user_id, condominio_id, role, unita) VALUES (3, 1, 'condomino', 'Int. 1')");
            db.run("INSERT INTO user_condominios (user_id, condominio_id, role, unita) VALUES (4, 1, 'condomino', 'Int. 2')");
            db.run("INSERT INTO user_condominios (user_id, condominio_id, role, unita) VALUES (4, 2, 'condomino', 'Int. 10')");
            
            db.run("INSERT INTO quotes (condominio_id, user_id, type, title, due_date, amount, status) VALUES (1, 3, 'ordinaria', 'Rata 1', '2026-03-31', 350.00, 'Pagato')");
            db.run("INSERT INTO quotes (condominio_id, user_id, type, title, due_date, amount, status) VALUES (1, 4, 'ordinaria', 'Rata 1', '2026-03-31', 350.00, 'In sospeso')");
        });
    });
}

initDatabase();

// ==========================================
// MIDDLEWARES
// ==========================================
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

function requireCondominio(req, res, next) {
    if (req.user.is_superadmin) {
        req.condominio_id = req.headers['x-condominio-id'] || null;
        req.role_in_condominio = 'admin'; 
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

function logAudit(userId, condominioId, azione, tabella, recordId, valoriPrecedenti, ip) {
    db.run(
        \`INSERT INTO audit_log (user_id, condominio_id, azione, tabella, record_id, valori_precedenti, ip) VALUES (?, ?, ?, ?, ?, ?, ?)\`,
        [userId, condominioId, azione, tabella, recordId, valoriPrecedenti ? JSON.stringify(valoriPrecedenti) : null, ip]
    );
}

// ==========================================
// STEP 1 & 2: API 2FA & AUTH
// ==========================================

app.post('/api/auth/login', (req, res) => {
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
});

app.post('/api/2fa/validate', (req, res) => {
    const { userId, token } = req.body;
    db.get('SELECT * FROM users WHERE id = ?', [userId], (err, user) => {
        if (err || !user || !user.two_factor_enabled) return res.status(400).json({ success: false, message: 'Utente non valido o 2FA non attiva' });
        
        let isValid = speakeasy.totp.verify({
            secret: user.two_factor_secret,
            encoding: 'base32',
            token: token,
            window: 1
        });

        // Controlla codici di backup se TOTP fallisce
        if (!isValid && user.backup_codes) {
            let backupCodes = JSON.parse(user.backup_codes);
            if (backupCodes.includes(token)) {
                isValid = true;
                backupCodes = backupCodes.filter(c => c !== token); // Consuma il codice
                db.run('UPDATE users SET backup_codes = ? WHERE id = ?', [JSON.stringify(backupCodes), user.id]);
                logAudit(user.id, null, 'Uso Codice di Backup', 'users', user.id, null, req.ip);
            }
        }

        if (!isValid) {
            logAudit(user.id, null, 'Validazione 2FA Fallita', 'users', user.id, null, req.ip);
            return res.status(401).json({ success: false, message: 'Codice non valido' });
        }
        
        logAudit(user.id, null, 'Login Riuscito (2FA)', 'users', user.id, null, req.ip);
        issueToken(user, res);
    });
});

function issueToken(user, res) {
    db.all('SELECT c.id, c.nome, uc.role, uc.unita FROM user_condominios uc JOIN condominios c ON uc.condominio_id = c.id WHERE uc.user_id = ?', [user.id], (err, condomini) => {
        const tokenPayload = { id: user.id, nome: user.nome, email: user.email, is_superadmin: user.is_superadmin };
        const jwtToken = jwt.sign(tokenPayload, JWT_SECRET, { expiresIn: '24h' });
        res.json({ success: true, token: jwtToken, user: { ...tokenPayload, condomini: condomini || [] } });
    });
}

// Genera e invia il QRCode e i codici di backup
app.post('/api/2fa/setup', authenticateToken, (req, res) => {
    const secret = speakeasy.generateSecret({ name: \`CondoTransparent (\${req.user.email})\` });
    
    // Genera 5 codici di backup da 8 caratteri
    const backupCodes = Array.from({length: 5}, () => Math.random().toString(36).substring(2, 10).toUpperCase());

    db.run('UPDATE users SET two_factor_secret = ?, backup_codes = ? WHERE id = ?', 
        [secret.base32, JSON.stringify(backupCodes), req.user.id], (err) => {
        if (err) return res.status(500).json({ success: false });
        
        QRCode.toDataURL(secret.otpauth_url, (err, imageUrl) => {
            if (err) return res.status(500).json({ success: false });
            res.json({ success: true, qrCodeUrl: imageUrl, secret: secret.base32, backupCodes });
        });
    });
});

// Conferma il primo token per attivare definitivamente 2FA
app.post('/api/2fa/verify', authenticateToken, (req, res) => {
    const { token } = req.body;
    db.get('SELECT two_factor_secret FROM users WHERE id = ?', [req.user.id], (err, user) => {
        if (err || !user || !user.two_factor_secret) return res.status(400).json({ success: false, message: '2FA non setup' });
        
        const isValid = speakeasy.totp.verify({ secret: user.two_factor_secret, encoding: 'base32', token: token, window: 1 });
        if (!isValid) return res.status(400).json({ success: false, message: 'Codice errato' });
        
        db.run('UPDATE users SET two_factor_enabled = 1 WHERE id = ?', [req.user.id], () => {
            logAudit(req.user.id, null, '2FA Attivata', 'users', req.user.id, null, req.ip);
            res.json({ success: true, message: '2FA Attivata' });
        });
    });
});

// L'admin può disabilitare il 2FA per un condomino che ha perso il telefono
app.post('/api/2fa/reset/:userId', authenticateToken, requireCondominio, isAdmin, (req, res) => {
    db.run('UPDATE users SET two_factor_enabled = 0, two_factor_secret = NULL, backup_codes = NULL WHERE id = ?', [req.params.userId], function(err) {
        if (err) return res.status(500).json({success:false});
        logAudit(req.user.id, req.condominio_id, 'Reset 2FA Utente', 'users', req.params.userId, null, req.ip);
        res.json({ success: true, message: '2FA resettato per l\\'utente' });
    });
});


// ==========================================
// API GESTIONALI (Anonimizzazione, Conti, Libro Giornale)
// ==========================================

app.get('/api/condominios', authenticateToken, (req, res) => {
    if (req.user.is_superadmin) {
        db.all('SELECT * FROM condominios', [], (err, rows) => res.json({ success: true, data: rows }));
    } else {
        res.status(403).json({success:false});
    }
});

// Quote e Receivables (Crediti) con ANONIMIZZAZIONE
app.get('/api/receivables', authenticateToken, requireCondominio, (req, res) => {
    db.all('SELECT q.*, u.nome as debtor_name, uc.unita as debtor_unit FROM quotes q JOIN users u ON q.user_id = u.id JOIN user_condominios uc ON u.id = uc.user_id AND uc.condominio_id = q.condominio_id WHERE q.condominio_id = ? AND q.status = "In sospeso"', 
    [req.condominio_id], (err, rows) => {
        if (req.role_in_condominio === 'admin') {
            res.json({ success: true, data: rows.map(r => ({ ...r, debitore: r.debtor_name, unita: r.debtor_unit, titolo_quota: r.title, importo: r.amount, scadenza: r.due_date })) });
        } else {
            // Anonimizzazione per il Condomino
            let i = 1;
            const data = rows.map(r => {
                const isOwn = r.user_id === req.user.id;
                return {
                    id: r.id, is_my_quote: isOwn, importo: r.amount, scadenza: r.due_date, titolo_quota: r.title,
                    debitore: isOwn ? r.debtor_name + ' (Tu)' : 'Condòmino #' + (i++),
                    unita: isOwn ? r.debtor_unit : 'Riservato'
                };
            });
            res.json({ success: true, data });
        }
    });
});

app.get('/api/quotes', authenticateToken, requireCondominio, (req, res) => {
    db.all('SELECT q.*, u.nome as condomino_nome, uc.unita as condomino_unita FROM quotes q JOIN users u ON q.user_id = u.id JOIN user_condominios uc ON u.id = uc.user_id AND uc.condominio_id = q.condominio_id WHERE q.condominio_id = ? ORDER BY q.due_date ASC', 
    [req.condominio_id], (err, rows) => {
        if (req.role_in_condominio === 'admin') {
            res.json({ success: true, data: rows });
        } else {
            // Anonimizzazione automatica
            let i = 1;
            const data = rows.map(r => {
                const isOwn = r.user_id === req.user.id;
                return {
                    ...r,
                    condomino_nome: isOwn ? r.condomino_nome + ' (Tu)' : 'Condòmino #' + (i++),
                    condomino_unita: isOwn ? r.condomino_unita : 'Riservato'
                };
            });
            res.json({ success: true, data });
        }
    });
});

// Conti Correnti e Transazioni
app.get('/api/bank-accounts', authenticateToken, requireCondominio, isAdmin, (req, res) => {
    db.all('SELECT * FROM bank_accounts WHERE condominio_id = ?', [req.condominio_id], (err, rows) => {
        res.json({ success: true, data: rows });
    });
});

app.post('/api/bank-transactions', authenticateToken, requireCondominio, isAdmin, (req, res) => {
    const { account_id, data, importo, causale, tipo } = req.body;
    db.run(\`INSERT INTO bank_transactions (account_id, data, importo, causale, tipo) VALUES (?, ?, ?, ?, ?)\`,
    [account_id, data, importo, causale, tipo], function(err) {
        logAudit(req.user.id, req.condominio_id, 'Inserimento Transazione Bancaria', 'bank_transactions', this.lastID, null, req.ip);
        res.json({ success: true });
    });
});

// Libro Giornale
app.get('/api/journal-entries', authenticateToken, requireCondominio, isAdmin, (req, res) => {
    db.all('SELECT * FROM journal_entries WHERE condominio_id = ? ORDER BY data DESC', [req.condominio_id], (err, rows) => {
        res.json({ success: true, data: rows });
    });
});

app.post('/api/journal-entries', authenticateToken, requireCondominio, isAdmin, (req, res) => {
    const { data, numero, tipo, descrizione, dare, avere, conto } = req.body;
    db.run(\`INSERT INTO journal_entries (condominio_id, data, numero, tipo, descrizione, dare, avere, conto) VALUES (?, ?, ?, ?, ?, ?, ?, ?)\`,
    [req.condominio_id, data, numero, tipo, descrizione, dare, avere, conto], function(err) {
        logAudit(req.user.id, req.condominio_id, 'Registrazione Libro Giornale', 'journal_entries', this.lastID, null, req.ip);
        res.json({ success: true });
    });
});

// Correzione Errori (Override / Aggiornamento generico con Audit Log)
app.put('/api/override/:table/:id', authenticateToken, requireCondominio, isAdmin, (req, res) => {
    const table = req.params.table;
    const allowedTables = ['journal_entries', 'bank_transactions', 'quotes', 'supplier_payments'];
    if (!allowedTables.includes(table)) return res.status(400).json({ success: false, message: 'Tabella non supportata' });

    db.get(\`SELECT * FROM \${table} WHERE id = ?\`, [req.params.id], (err, oldRecord) => {
        if (err || !oldRecord) return res.status(404).json({ success: false });

        const updates = [];
        const values = [];
        for (const [key, value] of Object.entries(req.body)) {
            updates.push(\`\${key} = ?\`);
            values.push(value);
        }
        values.push(req.params.id);

        db.run(\`UPDATE \${table} SET \${updates.join(', ')} WHERE id = ?\`, values, function(err) {
            logAudit(req.user.id, req.condominio_id, \`Correzione Errore in \${table}\`, table, req.params.id, oldRecord, req.ip);
            res.json({ success: true, message: 'Record aggiornato' });
        });
    });
});

// Audit Logs
app.get('/api/audit-logs', authenticateToken, requireCondominio, isAdmin, (req, res) => {
    db.all('SELECT a.*, u.email as user_email FROM audit_log a LEFT JOIN users u ON a.user_id = u.id WHERE a.condominio_id = ? OR a.condominio_id IS NULL ORDER BY a.timestamp DESC', 
    [req.condominio_id], (err, rows) => {
        res.json({ success: true, data: rows });
    });
});

// Fallback Frontend SPA
app.use((req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

app.listen(PORT, () => {
    console.log(\`====================================================\`);
    console.log(\`🏢 MULTI-TENANT CONDO ONLINE (SaaS) - STEP 1 & 2\`);
    console.log(\`🚀 Server in ascolto su: http://localhost:\${PORT}\`);
    console.log(\`====================================================\`);
});
`;

fs.writeFileSync('server.js', serverCode);
console.log('server.js riscritto per supportare tutti i requisiti dello Step 1 e 2.');
