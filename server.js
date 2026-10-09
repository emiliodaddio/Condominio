const express = require('express');
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
const nodemailer = require('nodemailer');

const app = express();

app.get('/api/export/accounting-excel', authenticateToken, requireCondominio, async (req, res) => {
    try {
        const workbook = new ExcelJS.Workbook();
        workbook.creator = 'CondoTransparent';
        
        // Sheet 1: Libro Giornale
        const sheetJournal = workbook.addWorksheet('Libro Giornale');
        sheetJournal.columns = [
            { header: 'ID', key: 'id', width: 8 },
            { header: 'Data', key: 'data', width: 15 },
            { header: 'Descrizione', key: 'descrizione', width: 50 },
            { header: 'Conto/Soggetto', key: 'conto', width: 25 },
            { header: 'Entrate (Dare)', key: 'dare', width: 18 },
            { header: 'Uscite (Avere)', key: 'avere', width: 18 }
        ];
        
        sheetJournal.getColumn('dare').numFmt = '"€"#,##0.00';
        sheetJournal.getColumn('avere').numFmt = '"€"#,##0.00';

        const journalRows = await new Promise((resolve, reject) => {
            db.all('SELECT * FROM journal_entries WHERE condominio_id = ? ORDER BY data DESC', [req.condominio_id], (err, rows) => {
                if (err) reject(err); else resolve(rows);
            });
        });
        
        journalRows.forEach(r => sheetJournal.addRow({
            id: r.id, data: r.data, descrizione: r.descrizione, conto: r.conto || 'N/D', dare: r.dare, avere: r.avere
        }));

        // Sheet 2: Uscite Fornitori (Pagamenti)
        const sheetSuppliers = workbook.addWorksheet('Fatture Fornitori');
        sheetSuppliers.columns = [
            { header: 'Fornitore', key: 'supplier_name', width: 35 },
            { header: 'Categoria', key: 'category', width: 25 },
            { header: 'N. Fattura', key: 'invoice_number', width: 18 },
            { header: 'Importo', key: 'amount', width: 18 },
            { header: 'Stato', key: 'status', width: 18 },
            { header: 'Data Pagamento', key: 'payment_date', width: 18 }
        ];

        sheetSuppliers.getColumn('amount').numFmt = '"€"#,##0.00';

        const supplierRows = await new Promise((resolve, reject) => {
            db.all('SELECT * FROM supplier_payments WHERE condominio_id = ? ORDER BY payment_date DESC', [req.condominio_id], (err, rows) => {
                if (err) reject(err); else resolve(rows);
            });
        });
        
        supplierRows.forEach(r => {
            if (r.status !== 'Pagato') r.payment_date = '-';
            sheetSuppliers.addRow(r);
        });

        // Sheet 3: Entrate Quote (Pagamenti)
        const sheetQuotes = workbook.addWorksheet('Quote Condominiali');
        sheetQuotes.columns = [
            { header: 'Condomino', key: 'condomino_nome', width: 35 },
            { header: 'Titolo', key: 'title', width: 35 },
            { header: 'Scadenza', key: 'due_date', width: 15 },
            { header: 'Importo', key: 'amount', width: 18 },
            { header: 'Stato', key: 'status', width: 18 },
            { header: 'Data Pagamento', key: 'payment_date', width: 18 }
        ];
        
        sheetQuotes.getColumn('amount').numFmt = '"€"#,##0.00';

        const quoteRows = await new Promise((resolve, reject) => {
            db.all(`SELECT q.*, p.nome as persona_nome, p.cognome as persona_cognome 
                   FROM quotes q 
                   LEFT JOIN anagrafica_persone p ON q.persona_id = p.id 
                   WHERE q.condominio_id = ? ORDER BY q.due_date ASC`, [req.condominio_id], (err, rows) => {
                if (err) reject(err); else resolve(rows);
            });
        });
        
        quoteRows.forEach(r => {
            r.condomino_nome = r.persona_cognome ? r.persona_cognome + ' ' + r.persona_nome : 'Sconosciuto';
            if (r.status !== 'Pagato') r.payment_date = '-';
            sheetQuotes.addRow(r);
        });

        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', 'attachment; filename=' + 'Bilancio_Condominiale.xlsx');

        await workbook.xlsx.write(res);
        res.end();
    } catch (err) {
        console.error(err);
        res.status(500).send('Errore Generazione Excel');
    }
});

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
        db.run(`CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            nome TEXT NOT NULL,
            email TEXT UNIQUE NOT NULL,
            password_hash TEXT NOT NULL,
            is_superadmin BOOLEAN DEFAULT 0,
            two_factor_secret TEXT,
            two_factor_enabled BOOLEAN DEFAULT 0,
            privacy_accepted BOOLEAN DEFAULT 0,
            privacy_accepted_at DATETIME,
            backup_codes TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )`, () => {
            // Migrazione fail-safe per tabelle esistenti
            db.run(`ALTER TABLE users ADD COLUMN two_factor_secret TEXT`, () => {});
            db.run(`ALTER TABLE users ADD COLUMN two_factor_enabled BOOLEAN DEFAULT 0`, () => {});
            db.run(`ALTER TABLE users ADD COLUMN backup_codes TEXT`, () => {});
        });


        // UNITA IMMOBILIARI E MILLESIMI
        db.run(`CREATE TABLE IF NOT EXISTS anagrafica_persone (
            cellulare TEXT,
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            condominio_id INTEGER NOT NULL,
            nome TEXT NOT NULL,
            cognome TEXT NOT NULL,
            codice_fiscale TEXT,
            telefono TEXT,
            email TEXT,
            ruolo_default TEXT DEFAULT 'Proprietario',
            notes TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )`);
        
        // Aggiungi colonne proprietario e conduttore alle unita
        db.run("ALTER TABLE anagrafica_persone ADD COLUMN cellulare TEXT", (err) => { /* ignora se esiste */ });
        db.run("ALTER TABLE unita_immobiliari ADD COLUMN proprietario_id INTEGER", (err) => { /* ignora se esiste */ });
        db.run("ALTER TABLE unita_immobiliari ADD COLUMN conduttore_id INTEGER", (err) => { /* ignora se esiste */ });

        db.run(`CREATE TABLE IF NOT EXISTS unita_immobiliari (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            condominio_id INTEGER NOT NULL,
            user_id INTEGER, 
            tipo TEXT DEFAULT 'Appartamento',
            identificativo TEXT NOT NULL,
            scala TEXT,
            piano TEXT,
            millesimi_proprieta REAL DEFAULT 0,
            millesimi_scale REAL DEFAULT 0,
            millesimi_ascensore REAL DEFAULT 0,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY(condominio_id) REFERENCES condominios(id) ON DELETE CASCADE,
            FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE SET NULL
        )`, () => {
            // Seed initial data if empty
            db.get('SELECT COUNT(*) as count FROM unita_immobiliari', (err, row) => {
                if (!err && row.count === 0) {
                    db.run("INSERT INTO unita_immobiliari (condominio_id, user_id, identificativo, millesimi_proprieta) VALUES (1, 3, 'Int. 1', 250.00)");
                    db.run("INSERT INTO unita_immobiliari (condominio_id, user_id, identificativo, millesimi_proprieta) VALUES (1, 4, 'Int. 2', 300.50)");
                    db.run("INSERT INTO unita_immobiliari (condominio_id, user_id, identificativo, millesimi_proprieta) VALUES (2, 4, 'Int. 10', 150.00)");
                }
            });
        });

        // CONDOMINI
        db.run(`CREATE TABLE IF NOT EXISTS condominios (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            nome TEXT NOT NULL,
            indirizzo TEXT NOT NULL,
            cf TEXT,
            scala TEXT,
            piano TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )`);

        // USER_CONDOMINIOS (Mapping Utente <-> Condominio)
        db.run(`CREATE TABLE IF NOT EXISTS user_condominios (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            condominio_id INTEGER NOT NULL,
            role TEXT NOT NULL CHECK(role IN ('admin', 'condomino')),
            unita TEXT,
            FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE,
            FOREIGN KEY(condominio_id) REFERENCES condominios(id) ON DELETE CASCADE,
            UNIQUE(user_id, condominio_id)
        )`);

        // QUOTES
        db.run(`CREATE TABLE IF NOT EXISTS quotes (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            condominio_id INTEGER NOT NULL,
            persona_id INTEGER,
            unita_id INTEGER,
            type TEXT CHECK(type IN ('ordinaria', 'straordinaria')),
            title TEXT NOT NULL,
            due_date TEXT NOT NULL,
            amount REAL NOT NULL,
            description TEXT,
            status TEXT DEFAULT 'In sospeso' CHECK(status IN ('In sospeso', 'Pagato')),
            payment_date TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY(condominio_id) REFERENCES condominios(id) ON DELETE CASCADE,
            FOREIGN KEY(persona_id) REFERENCES anagrafica_persone(id) ON DELETE CASCADE,
            FOREIGN KEY(unita_id) REFERENCES unita_immobiliari(id) ON DELETE SET NULL
        )`);

        // SUPPLIER PAYMENTS
        db.run(`CREATE TABLE IF NOT EXISTS supplier_payments (
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
        )`);

        // ASSEMBLIES
                db.run(`CREATE TABLE IF NOT EXISTS security_logs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER,
            action TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )`);
        db.run(`CREATE TABLE IF NOT EXISTS convocations_log (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            condominio_id INTEGER NOT NULL,
            user_id INTEGER,
            destinatario TEXT,
            email TEXT,
            data_invio DATETIME DEFAULT CURRENT_TIMESTAMP,
            preview_url TEXT
        )`);
db.run(`CREATE TABLE IF NOT EXISTS assemblies (
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
        )`);

        // TICKETS
        db.run(`CREATE TABLE IF NOT EXISTS tickets (
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
        )`);

        // BANK ACCOUNTS
        db.run(`CREATE TABLE IF NOT EXISTS bank_accounts (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            condominio_id INTEGER NOT NULL,
            banca TEXT NOT NULL,
            iban TEXT NOT NULL,
            intestazione TEXT NOT NULL,
            note TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY(condominio_id) REFERENCES condominios(id) ON DELETE CASCADE
        )`);

        // BANK TRANSACTIONS
        db.run(`CREATE TABLE IF NOT EXISTS bank_transactions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            account_id INTEGER NOT NULL,
            data TEXT NOT NULL,
            importo REAL NOT NULL,
            causale TEXT NOT NULL,
            tipo TEXT NOT NULL CHECK(tipo IN ('Entrata', 'Uscita')),
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (account_id) REFERENCES bank_accounts(id) ON DELETE CASCADE
        )`);

        // JOURNAL ENTRIES (Libro Giornale)
        db.run(`CREATE TABLE IF NOT EXISTS journal_entries (
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
        )`);

        // AUDIT LOG
        db.run(`CREATE TABLE IF NOT EXISTS audit_log (
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
        )`);

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
        return res.status(403).json({ success: false, message: 'Operazione riservata all\'amministratore.' });
    }
}

function logAudit(userId, condominioId, azione, tabella, recordId, valoriPrecedenti, ip) {
    db.run(
        `INSERT INTO audit_log (user_id, condominio_id, azione, tabella, record_id, valori_precedenti, ip) VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [userId, condominioId, azione, tabella, recordId, valoriPrecedenti ? JSON.stringify(valoriPrecedenti) : null, ip]
    );
}

// ==========================================
// STEP 1 & 2: API 2FA & AUTH
// ==========================================

app.post('/api/auth/login', (req, res) => {
    const { email, password } = req.body;
    console.log('LOGIN ATTEMPT:', email);
    db.get('SELECT * FROM users WHERE LOWER(email) = LOWER(?)', [email.trim()], (err, user) => {
        if (err || !user) {
            logAudit(null, null, 'Login Fallito', 'users', null, null, req.ip);
            return res.status(401).json({ success: false, message: 'Credenziali non valide.' });
        }
        
        if (!bcrypt.compareSync(password, user.password_hash)) {
            logAudit(user.id, null, 'Login Fallito (Password)', 'users', user.id, null, req.ip);
            return res.status(401).json({ success: false, message: 'Credenziali non valide.' });
        }

        
        if (!user.two_factor_enabled) {
            const tokenPayload = { id: user.id, nome: user.nome, email: user.email, is_superadmin: user.is_superadmin, privacy_accepted: user.privacy_accepted };
            const token = jwt.sign(tokenPayload, JWT_SECRET, { expiresIn: '8h' });
            logAudit(user.id, null, 'Login Riuscito', 'users', user.id, null, req.ip);
            return res.json({ success: true, token, user: { id: user.id, nome: user.nome, email: user.email, is_superadmin: user.is_superadmin, privacy_accepted: user.privacy_accepted } });
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
                    text: `Il tuo codice di accesso è: ${otpCode}\nScade in 10 minuti.`,
                    html: `<h3>Codice di Accesso 2FA</h3><p>Il tuo codice è: <b>${otpCode}</b></p><p>Scade in 10 minuti.</p>`,
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
    console.log('OTP VERIFY ATTEMPT:', userId, otp);
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
});


// ==========================================
// RESTORED: /api/auth/me
// ==========================================
app.get('/api/auth/me', authenticateToken, (req, res) => {
    db.get('SELECT id, nome, email, is_superadmin, two_factor_enabled, privacy_accepted FROM users WHERE id = ?', [req.user.id], (err, user) => {
        if (!user) return res.status(404).json({ success: false });
        db.all('SELECT c.id, c.nome, c.indirizzo, c.cf, c.scala, uc.role, uc.unita FROM user_condominios uc JOIN condominios c ON uc.condominio_id = c.id WHERE uc.user_id = ?', [user.id], (err, condomini) => {
            res.json({ success: true, user: { ...user, condomini: condomini || [] } });
        });
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
    db.all('SELECT c.id, c.nome, c.indirizzo, c.cf, c.scala, uc.role, uc.unita FROM user_condominios uc JOIN condominios c ON uc.condominio_id = c.id WHERE uc.user_id = ?', [user.id], (err, condomini) => {
        const tokenPayload = { id: user.id, nome: user.nome, email: user.email, is_superadmin: user.is_superadmin, privacy_accepted: user.privacy_accepted };
        const jwtToken = jwt.sign(tokenPayload, JWT_SECRET, { expiresIn: '24h' });
        res.json({ success: true, token: jwtToken, user: { ...tokenPayload, condomini: condomini || [] } });
    });
}

// Genera e invia il QRCode e i codici di backup
app.post('/api/2fa/setup', authenticateToken, (req, res) => {
    const secret = speakeasy.generateSecret({ name: `CondoTransparent (${req.user.email})` });
    
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
        res.json({ success: true, message: '2FA resettato per l\'utente' });
    });
});


// ==========================================
// API GESTIONALI (Anonimizzazione, Conti, Libro Giornale)
// ==========================================

// ==========================================
// UNITA IMMOBILIARI E MILLESIMI
// ==========================================


// ==========================================
// ANAGRAFICA PERSONE (RUBRICA)
// ==========================================
app.get('/api/anagrafica-persone', authenticateToken, requireCondominio, (req, res) => {
    db.all('SELECT * FROM anagrafica_persone WHERE condominio_id = ? ORDER BY cognome ASC, nome ASC', [req.condominio_id], (err, rows) => {
        res.json({ success: true, data: rows || [] });
    });
});

app.post('/api/anagrafica-persone', authenticateToken, requireCondominio, isAdmin, (req, res) => {
    const { nome, cognome, codice_fiscale, telefono, cellulare, email, ruolo_default, notes } = req.body;
    db.run(`INSERT INTO anagrafica_persone (condominio_id, nome, cognome, codice_fiscale, telefono, cellulare, email, ruolo_default, notes) 
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [req.condominio_id, nome, cognome, codice_fiscale, telefono, cellulare, email, ruolo_default || 'Proprietario', notes], 
        function(err) {
            if (err) return res.status(500).json({ success: false, message: err.message });
            res.json({ success: true, id: this.lastID });
    });
});

app.put('/api/anagrafica-persone/:id', authenticateToken, requireCondominio, isAdmin, (req, res) => {
    const { nome, cognome, codice_fiscale, telefono, cellulare, email, ruolo_default, notes } = req.body;
    db.run(`UPDATE anagrafica_persone 
            SET nome = ?, cognome = ?, codice_fiscale = ?, telefono = ?, cellulare = ?, email = ?, ruolo_default = ?, notes = ? 
            WHERE id = ? AND condominio_id = ?`,
        [nome, cognome, codice_fiscale, telefono, cellulare, email, ruolo_default, notes, req.params.id, req.condominio_id], 
        function(err) {
            if (err) return res.status(500).json({ success: false, message: err.message });
            res.json({ success: true });
    });
});

app.delete('/api/anagrafica-persone/:id', authenticateToken, requireCondominio, isAdmin, (req, res) => {
    db.run('DELETE FROM anagrafica_persone WHERE id = ? AND condominio_id = ?', [req.params.id, req.condominio_id], function(err) {
        if (err) return res.status(500).json({ success: false, message: err.message });
        res.json({ success: true });
    });
});

app.get('/api/unita', authenticateToken, requireCondominio, (req, res) => {
    db.all(`SELECT u.*, us.nome as condomino_nome, us.email as condomino_email 
            FROM unita_immobiliari u 
            LEFT JOIN users us ON u.user_id = us.id 
            WHERE u.condominio_id = ? 
            ORDER BY u.identificativo ASC`, [req.condominio_id], (err, rows) => {
        res.json({ success: true, data: rows });
    });
});

app.post('/api/unita', authenticateToken, requireCondominio, isAdmin, (req, res) => {
    const { proprietario_id, conduttore_id, user_id, tipo, identificativo, scala, piano, millesimi_proprieta, millesimi_scale, millesimi_ascensore } = req.body;
    db.run(`INSERT INTO unita_immobiliari (condominio_id, user_id, tipo, identificativo, scala, piano, millesimi_proprieta, millesimi_scale, millesimi_ascensore, proprietario_id, conduttore_id) 
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [req.condominio_id, user_id || null, tipo || 'Appartamento', identificativo, scala, piano, millesimi_proprieta || 0, millesimi_scale || 0, millesimi_ascensore || 0, proprietario_id || null, conduttore_id || null], 
        function(err) {
            if (err) return res.status(500).json({ success: false, message: err.message });
            logAudit(req.user.id, req.condominio_id, 'Creata Unità Immobiliare', 'unita_immobiliari', this.lastID, null, req.ip);
            res.json({ success: true });
    });
});

app.put('/api/unita/:id', authenticateToken, requireCondominio, isAdmin, (req, res) => {
    const { proprietario_id, conduttore_id, user_id, tipo, identificativo, scala, piano, millesimi_proprieta, millesimi_scale, millesimi_ascensore } = req.body;
    db.run(`UPDATE unita_immobiliari 
            SET user_id = ?, tipo = ?, identificativo = ?, scala = ?, piano = ?, millesimi_proprieta = ?, millesimi_scale = ?, millesimi_ascensore = ?, proprietario_id = ?, conduttore_id = ?
            WHERE id = ? AND condominio_id = ?`,
        [user_id || null, tipo || 'Appartamento', identificativo, scala, piano, millesimi_proprieta || 0, millesimi_scale || 0, millesimi_ascensore || 0, proprietario_id || null, conduttore_id || null, req.params.id, req.condominio_id], 
        function(err) {
            if (err) return res.status(500).json({ success: false, message: err.message });
            logAudit(req.user.id, req.condominio_id, 'Modificata Unità Immobiliare', 'unita_immobiliari', req.params.id, null, req.ip);
            res.json({ success: true });
    });
});


app.get('/api/condominios', authenticateToken, (req, res) => {
    if (req.user.is_superadmin) {
        db.all('SELECT * FROM condominios', [], (err, rows) => res.json({ success: true, data: rows }));
    } else {
        res.status(403).json({success:false});
    }
});

// Quote e Receivables (Crediti) con ANONIMIZZAZIONE
app.get('/api/receivables', authenticateToken, requireCondominio, (req, res) => {
    db.all(`SELECT q.*, p.nome as persona_nome, p.cognome as persona_cognome, ui.identificativo as unita 
             FROM quotes q 
             LEFT JOIN anagrafica_persone p ON q.persona_id = p.id 
             LEFT JOIN unita_immobiliari ui ON q.unita_id = ui.id 
             WHERE q.condominio_id = ? AND q.status = 'In sospeso'`, 
    [req.condominio_id], (err, rows) => {
        if (err) return res.status(500).json({success: false, message: err.message});
        if (req.role_in_condominio === 'admin') {
            res.json({ success: true, data: rows.map(r => ({ ...r, debitore: r.persona_cognome ? r.persona_cognome + ' ' + r.persona_nome : 'Sconosciuto', unita: r.unita || '-', titolo_quota: r.title, importo: r.amount, scadenza: r.due_date })) });
        } else {
            // Anonimizzazione
            let i = 1;
            const data = rows.map(r => {
                // TODO: match user with persona if possible, for now just anonymize all
                return {
                    id: r.id, is_my_quote: false, importo: r.amount, scadenza: r.due_date, titolo_quota: r.title,
                    debitore: 'Condòmino #' + (i++), unita: 'Unità Riservata'
                };
            });
            res.json({ success: true, data });
        }
    });
});


app.get('/api/quotes', authenticateToken, requireCondominio, (req, res) => {
    db.all(`SELECT q.*, p.nome as persona_nome, p.cognome as persona_cognome, ui.identificativo as condomino_unita 
             FROM quotes q 
             LEFT JOIN anagrafica_persone p ON q.persona_id = p.id 
             LEFT JOIN unita_immobiliari ui ON q.unita_id = ui.id 
             WHERE q.condominio_id = ? ORDER BY q.due_date ASC`, 
    [req.condominio_id], (err, rows) => {
        if (err) return res.status(500).json({success: false, message: err.message});
        // Remap to match what frontend expects
        const mapped = rows.map(r => ({...r, condomino_nome: r.persona_cognome ? r.persona_cognome + ' ' + r.persona_nome : 'Sconosciuto', condomino_unita: r.condomino_unita || '-'}));
        res.json({ success: true, data: mapped });
    });
});

app.post('/api/quotes', authenticateToken, requireCondominio, isAdmin, (req, res) => {
    const { persona_id, unita_id, type, title, amount, due_date } = req.body;
    const status = 'In sospeso';
    db.run(
        `INSERT INTO quotes (condominio_id, persona_id, unita_id, type, title, amount, due_date, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [req.condominio_id, persona_id, unita_id, type, title, amount, due_date, status],
        function(err) {
            if (err) return res.status(500).json({ success: false, message: err.message });
            res.json({ success: true, id: this.lastID });
        }
    );
});

app.put('/api/quotes/:id', authenticateToken, requireCondominio, isAdmin, (req, res) => {
    const { id } = req.params;
    const { amount, due_date, status } = req.body;
    let payment_date = null;
    if (status === 'Pagato') {
        payment_date = new Date().toISOString().split('T')[0];
    }
    db.run(
        `UPDATE quotes SET amount = ?, due_date = ?, status = ?, payment_date = COALESCE(payment_date, ?) WHERE id = ? AND condominio_id = ?`,
        [amount, due_date, status, payment_date, id, req.condominio_id],
        function(err) {
            if (err) return res.status(500).json({ success: false, message: err.message });
            res.json({ success: true });
        }
    );
});

app.patch('/api/quotes/:id/pay', authenticateToken, requireCondominio, isAdmin, (req, res) => {
    const { id } = req.params;
    const paymentDate = new Date().toISOString().split('T')[0];
    db.run("UPDATE quotes SET status = 'Pagato', payment_date = ? WHERE id = ? AND condominio_id = ?",
        [paymentDate, id, req.condominio_id],
        function(err) {
            if (err) return res.status(500).json({ success: false, message: err.message });
            res.json({ success: true, message: 'Quota saldata' });
        }
    );
});

app.delete('/api/quotes/:id', authenticateToken, requireCondominio, isAdmin, (req, res) => {
    const { id } = req.params;
    db.run("DELETE FROM quotes WHERE id = ? AND condominio_id = ?", [id, req.condominio_id], function(err) {
        if (err) return res.status(500).json({ success: false, message: err.message });
        res.json({ success: true });
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
    db.run(`INSERT INTO bank_transactions (account_id, data, importo, causale, tipo) VALUES (?, ?, ?, ?, ?)`,
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
    db.run(`INSERT INTO journal_entries (condominio_id, data, numero, tipo, descrizione, dare, avere, conto) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
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

    db.get(`SELECT * FROM ${table} WHERE id = ?`, [req.params.id], (err, oldRecord) => {
        if (err || !oldRecord) return res.status(404).json({ success: false });

        const updates = [];
        const values = [];
        for (const [key, value] of Object.entries(req.body)) {
            updates.push(`${key} = ?`);
            values.push(value);
        }
        values.push(req.params.id);

        db.run(`UPDATE ${table} SET ${updates.join(', ')} WHERE id = ?`, values, function(err) {
            logAudit(req.user.id, req.condominio_id, `Correzione Errore in ${table}`, table, req.params.id, oldRecord, req.ip);
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




// ==========================================
// API UTENTI
// ==========================================

app.get('/api/users', authenticateToken, requireCondominio, isAdmin, (req, res) => {
    db.all(`SELECT u.id, u.nome, u.email, u.telefono, u.two_factor_enabled, u.created_at, u.privacy_accepted, u.privacy_accepted_at, uc.role, uc.unita, uc.dati_catastali 
            FROM users u 
            JOIN user_condominios uc ON u.id = uc.user_id 
            WHERE uc.condominio_id = ?
            ORDER BY u.nome ASC`, [req.condominio_id], (err, rows) => {
        res.json({ success: true, data: rows });
    });
});

app.post('/api/users', authenticateToken, requireCondominio, isAdmin, (req, res) => {
    const { nome, email, password, unita, role, telefono, dati_catastali } = req.body;
    const hash = bcrypt.hashSync(password, 10);
    
    // Inserisce utente e mappa il condominio
    db.run('INSERT INTO users (nome, email, password_hash, telefono) VALUES (?, ?, ?, ?)', [nome, email, hash, telefono || null], function(err) {
        if (err) {
            // Se l'email esiste già, prova solo ad assegnarlo al condominio
            if (err.message.includes('UNIQUE constraint failed')) {
                db.get('SELECT id FROM users WHERE email = ?', [email], (err, existingUser) => {
                    if (existingUser) {
                        db.run('INSERT INTO user_condominios (user_id, condominio_id, role, unita, dati_catastali) VALUES (?, ?, ?, ?, ?)', 
                            [existingUser.id, req.condominio_id, role || 'condomino', unita || '', dati_catastali || null], (err2) => {
                            if (err2) return res.status(500).json({ success: false, message: 'Utente già nel condominio' });
                            return res.json({ success: true, message: 'Utente esistente aggiunto al condominio' });
                        });
                    }
                });
                return;
            }
            return res.status(500).json({ success: false, message: 'Errore inserimento utente' });
        }
        
        const newUserId = this.lastID;
        db.run('INSERT INTO user_condominios (user_id, condominio_id, role, unita, dati_catastali) VALUES (?, ?, ?, ?, ?)', 
            [newUserId, req.condominio_id, role || 'condomino', unita || '', dati_catastali || null], function(err) {
            logAudit(req.user.id, req.condominio_id, 'Creazione Utente', 'users', newUserId, null, req.ip);
            res.json({ success: true, message: 'Utente creato con successo' });
        });
    });
});

app.post('/api/users', authenticateToken, requireCondominio, isAdmin, (req, res) => {
    const { nome, email, password, unita, role } = req.body;
    const hash = bcrypt.hashSync(password, 10);
    
    // Inserisce utente e mappa il condominio
    db.run('INSERT INTO users (nome, email, password_hash) VALUES (?, ?, ?)', [nome, email, hash], function(err) {
        if (err) {
            // Se l'email esiste già, prova solo ad assegnarlo al condominio
            if (err.message.includes('UNIQUE constraint failed')) {
                db.get('SELECT id FROM users WHERE email = ?', [email], (err, existingUser) => {
                    if (existingUser) {
                        db.run('INSERT INTO user_condominios (user_id, condominio_id, role, unita) VALUES (?, ?, ?, ?)', 
                            [existingUser.id, req.condominio_id, role || 'condomino', unita || ''], (err2) => {
                            if (err2) return res.status(500).json({ success: false, message: 'Utente già nel condominio' });
                            return res.json({ success: true, message: 'Utente esistente aggiunto al condominio' });
                        });
                    }
                });
                return;
            }
            return res.status(500).json({ success: false, message: 'Errore inserimento utente' });
        }
        
        const newUserId = this.lastID;
        db.run('INSERT INTO user_condominios (user_id, condominio_id, role, unita) VALUES (?, ?, ?, ?)', 
            [newUserId, req.condominio_id, role || 'condomino', unita || ''], function(err) {
            logAudit(req.user.id, req.condominio_id, 'Creazione Utente', 'users', newUserId, null, req.ip);
            res.json({ success: true, message: 'Utente creato con successo' });
        });
    });
});



app.post('/api/users/accept-privacy', authenticateToken, (req, res) => {
    db.run('UPDATE users SET privacy_accepted = 1, privacy_accepted_at = CURRENT_TIMESTAMP WHERE id = ?', [req.user.id], (err) => {
        if (err) return res.status(500).json({ success: false, message: 'Errore DB' });
        res.json({ success: true });
    });
});

app.put('/api/users/:id', authenticateToken, requireCondominio, isAdmin, (req, res) => {
    const { unita, role, telefono, dati_catastali, nome, email, password } = req.body;
    
    if (password && password.trim() !== '') {
        const pwdRegex = /^(?=.*[A-Z])(?=.*\d)(?=.*[!@#$%^&*(),.?":{}|<>]).{8,}$/;
        if (!pwdRegex.test(password)) {
            return res.status(400).json({ success: false, message: 'La password deve contenere almeno 8 caratteri, una maiuscola, un numero e un carattere speciale.' });
        }
    }

    db.get('SELECT email FROM users WHERE id = ?', [req.params.id], (err, user) => {
        if (!user) return res.status(404).json({success: false});

        let updates = [];
        let params = [];
        
        if (telefono !== undefined) { updates.push('telefono = ?'); params.push(telefono); }
        if (nome !== undefined && nome.trim() !== '') { updates.push('nome = ?'); params.push(nome.trim()); }
        if (email !== undefined && email.trim() !== '') { updates.push('email = ?'); params.push(email.trim()); }
        
        if (password && password.trim() !== '') {
            updates.push('password_hash = ?');
            params.push(require('bcryptjs').hashSync(password, 10));
        }
        
        if (updates.length > 0) {
            params.push(req.params.id);
            db.run(`UPDATE users SET ${updates.join(', ')} WHERE id = ?`, params, (err) => {
                // Ignore email duplicate error for now to keep flow simple, or handle if needed
            });
        }
        
        db.run('UPDATE user_condominios SET unita = ?, role = ?, dati_catastali = ? WHERE user_id = ? AND condominio_id = ?', 
            [unita, role, dati_catastali, req.params.id, req.condominio_id], function(err) {
            if (err) return res.status(500).json({ success: false, message: 'Errore salvataggio' });
            res.json({ success: true });
        });
    });
});

app.delete('/api/users/:id', authenticateToken, isAdmin, (req, res) => {
    db.run('DELETE FROM users WHERE id = ?', [req.params.id], function(err) {
        if (err) return res.status(500).json({ success: false });
        res.json({ success: true });
    });
});


// ==========================================
// RESTORED MISSING ENDPOINTS
// ==========================================

app.get('/api/suppliers', authenticateToken, requireCondominio, (req, res) => {
    db.all('SELECT * FROM suppliers WHERE condominio_id = ? ORDER BY ragione_sociale ASC', [req.condominio_id], (err, rows) => {
        if (err) return res.status(500).json({ success: false, message: 'DB Error' });
        res.json({ success: true, data: rows || [] });
    });
});

app.post('/api/suppliers', authenticateToken, requireCondominio, (req, res) => {
    if (req.role_in_condominio !== 'admin') return res.status(403).json({ success: false });
    const { ragione_sociale, piva, email, telefono, iban } = req.body;
    db.run('INSERT INTO suppliers (condominio_id, ragione_sociale, piva, email, telefono, iban) VALUES (?, ?, ?, ?, ?, ?)',
        [req.condominio_id, ragione_sociale, piva, email, telefono, iban], function(err) {
            res.json({ success: !err });
        });
});

app.put('/api/suppliers/:id', authenticateToken, requireCondominio, (req, res) => {
    if (req.role_in_condominio !== 'admin') return res.status(403).json({ success: false });
    const { ragione_sociale, piva, email, telefono, iban } = req.body;
    db.run('UPDATE suppliers SET ragione_sociale = ?, piva = ?, email = ?, telefono = ?, iban = ? WHERE id = ? AND condominio_id = ?',
        [ragione_sociale, piva, email, telefono, iban, req.params.id, req.condominio_id], function(err) {
            res.json({ success: !err });
        });
});

app.get('/api/supplier-payments', authenticateToken, requireCondominio, (req, res) => {
    db.all('SELECT * FROM supplier_payments WHERE condominio_id = ? ORDER BY payment_date DESC', [req.condominio_id], (err, rows) => {
        res.json({ success: true, data: rows || [] });
    });
});

app.post('/api/supplier-payments', authenticateToken, requireCondominio, isAdmin, (req, res) => {
    const { supplier_name, category, invoice_number, amount, payment_date, status, notes } = req.body;
    db.run('INSERT INTO supplier_payments (condominio_id, supplier_name, category, invoice_number, amount, payment_date, status, notes) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        [req.condominio_id, supplier_name, category, invoice_number, amount, payment_date, status, notes], function(err) {
            res.json({ success: !err });
        });
});
app.put('/api/supplier-payments/:id', authenticateToken, requireCondominio, isAdmin, (req, res) => {
    const { amount, status } = req.body;
    db.run('UPDATE supplier_payments SET amount = ?, status = ? WHERE id = ? AND condominio_id = ?',
        [amount, status, req.params.id, req.condominio_id], function(err) {
            if (err) return res.status(500).json({ success: false, error: err.message });
            res.json({ success: true });
        });
});


app.get('/api/accounting-summary', authenticateToken, requireCondominio, (req, res) => {
    const condominioId = req.condominio_id;
    const data = { totalReceived: 0, totalReceivables: 0, totalSuppliersPaid: 0, totalSuppliersDebt: 0 };
    
    db.serialize(() => {
        db.get("SELECT SUM(amount) as sum FROM quotes WHERE condominio_id = ? AND status = 'Pagato'", [condominioId], (err, row) => {
            if (row && row.sum) data.totalReceived = row.sum;
        });
        db.get("SELECT SUM(amount) as sum FROM quotes WHERE condominio_id = ? AND status = 'In sospeso'", [condominioId], (err, row) => {
            if (row && row.sum) data.totalReceivables = row.sum;
        });
        db.get("SELECT SUM(amount) as sum FROM supplier_payments WHERE condominio_id = ? AND status = 'Pagato'", [condominioId], (err, row) => {
            if (row && row.sum) data.totalSuppliersPaid = row.sum;
        });
        db.get("SELECT SUM(amount) as sum FROM supplier_payments WHERE condominio_id = ? AND status != 'Pagato'", [condominioId], (err, row) => {
            if (row && row.sum) data.totalSuppliersDebt = row.sum;
            // Ultima query, invia la risposta!
            res.json({ success: true, data });
        });
    });
});

app.get('/api/tickets', authenticateToken, requireCondominio, (req, res) => {
    let query = 'SELECT t.*, u.nome as creator_name, uc.unita as creator_unita FROM tickets t JOIN users u ON t.user_id = u.id JOIN user_condominios uc ON u.id = uc.user_id AND uc.condominio_id = t.condominio_id WHERE t.condominio_id = ?';
    const params = [req.condominio_id];
    if (req.role_in_condominio !== 'admin') {
        query += ' AND t.user_id = ?';
        params.push(req.user.id);
    }
    db.all(query, params, (err, rows) => {
        res.json({ success: true, data: rows || [] });
    });
});

app.post('/api/tickets', authenticateToken, requireCondominio, (req, res) => {
    const { category, title, description, priority } = req.body;
    db.run('INSERT INTO tickets (condominio_id, user_id, category, title, description, priority) VALUES (?, ?, ?, ?, ?, ?)',
        [req.condominio_id, req.user.id, category, title, description, priority], function(err) {
            res.json({ success: !err });
        });
});

app.get('/api/assemblies', authenticateToken, requireCondominio, (req, res) => {
    const isPast = req.query.past === '1' ? 1 : 0;
    db.all('SELECT * FROM assemblies WHERE condominio_id = ? AND is_past = ? ORDER BY date DESC', [req.condominio_id, isPast], (err, rows) => {
        res.json({ success: true, data: rows || [] });
    });
});

app.get('/api/condominio', authenticateToken, requireCondominio, (req, res) => {
    db.get('SELECT * FROM condominios WHERE id = ?', [req.condominio_id], (err, row) => {
        res.json({ success: true, data: row || {} });
    });
});

app.put('/api/condominio', authenticateToken, requireCondominio, isAdmin, (req, res) => {
    const fields = ['nome', 'indirizzo', 'cf', 'scala', 'admin_nome', 'admin_cognome', 'admin_titolo', 'admin_telefono', 'admin_cellulare', 'admin_emergenze', 'admin_email', 'admin_pec'];
    let updatePairs = [];
    let params = [];
    
    fields.forEach(f => {
        if (req.body[f] !== undefined) {
            updatePairs.push(f + ' = ?');
            params.push(req.body[f]);
        }
    });

    if (updatePairs.length === 0) return res.json({ success: true });

    params.push(req.condominio_id);
    const query = 'UPDATE condominios SET ' + updatePairs.join(', ') + ' WHERE id = ?';
    
    db.run(query, params, function(err) {
        if (err) return res.status(500).json({ success: false, error: err.message });
        res.json({ success: true });
    });
});


app.get('/api/journal', authenticateToken, requireCondominio, isAdmin, (req, res) => {
    db.all('SELECT * FROM journal_entries WHERE condominio_id = ? ORDER BY data DESC', [req.condominio_id], (err, rows) => {
        res.json({ success: true, data: rows || [] });
    });
});

app.post('/api/journal', authenticateToken, requireCondominio, isAdmin, (req, res) => {
    const { data, numero, tipo, descrizione, dare, avere, conto } = req.body;
    db.run('INSERT INTO journal_entries (condominio_id, data, numero, tipo, descrizione, dare, avere, conto) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    [req.condominio_id, data, numero, tipo, descrizione, dare, avere, conto], function(err) {
        res.json({ success: !err });
    });
});

app.put('/api/journal/:id', authenticateToken, requireCondominio, isAdmin, (req, res) => {
    const { data, numero, tipo, descrizione, dare, avere, conto } = req.body;
    db.run('UPDATE journal_entries SET data = ?, numero = ?, tipo = ?, descrizione = ?, dare = ?, avere = ?, conto = ? WHERE id = ? AND condominio_id = ?',
    [data, numero, tipo, descrizione, dare, avere, conto, req.params.id, req.condominio_id], function(err) {
        if (err) return res.status(500).json({ success: false });
        res.json({ success: this.changes > 0 });
    });
});

app.delete('/api/journal/:id', authenticateToken, requireCondominio, isAdmin, (req, res) => {
    db.run('DELETE FROM journal_entries WHERE id = ? AND condominio_id = ?', [req.params.id, req.condominio_id], function(err) {
        if (err) return res.status(500).json({ success: false });
        res.json({ success: this.changes > 0 });
    });
});


app.get('/api/audit-log', authenticateToken, requireCondominio, isAdmin, (req, res) => {
    db.all('SELECT a.*, u.nome FROM audit_log a LEFT JOIN users u ON a.user_id = u.id WHERE a.condominio_id = ? OR a.condominio_id IS NULL ORDER BY a.timestamp DESC', 
    [req.condominio_id], (err, rows) => {
        res.json({ success: true, data: rows || [] });
    });
});

// --- PASSWORD RECOVERY ROUTES ---
app.post('/api/auth/forgot-password', (req, res) => {
    const { email } = req.body;
    if (!email) return res.status(400).json({ success: false, message: 'Email obbligatoria' });

    db.get('SELECT id FROM users WHERE LOWER(email) = LOWER(?)', [email.trim()], (err, user) => {
        if (err || !user) {
            return res.json({ success: true, message: 'Se l\'email esiste nel sistema, riceverai un link per il reset.' });
        }

        const crypto = require('crypto');
        const token = crypto.randomBytes(32).toString('hex');
        const expires = Date.now() + 3600000;

        db.run('UPDATE users SET reset_token = ?, reset_token_expires = ? WHERE id = ?', [token, expires, user.id], (err) => {
            if (err) return res.status(500).json({ success: false, message: 'Errore interno' });

            const host = req.get('host');
            const protocol = req.protocol || 'http';
            const resetLink = `${protocol}://${host}/login.html?token=${token}`;

            const mailOptions = {
                from: '"Gestione Condominio" <no-reply@condominio.it>',
                to: email,
                subject: 'Recupero Password - Gestione Condominio',
                text: `Hai richiesto il reset della password.\nClicca qui per reimpostarla: ${resetLink}\nIl link scade tra 1 ora.`,
                html: `<p>Hai richiesto il reset della password.</p><p><a href="${resetLink}">Clicca qui per reimpostarla</a></p><p>Il link scade tra 1 ora.</p>`
            };

            if (transporter) {
                transporter.sendMail(mailOptions, (err, info) => {
                    if (err) console.error('Errore invio mail reset:', err);
                    else {
                        const nodemailer = require('nodemailer');
                        const url = nodemailer.getTestMessageUrl(info);
                        console.log('🔗 Mail di Reset Password inviata! Anteprima:', url);
                        db.run('INSERT INTO security_logs (user_id, action) VALUES (?, ?)', 
                            [user.id, `Richiesta reset (Email di test inviata: <a href="${url}" target="_blank" class="text-blue-500 underline">Apri Email</a>)`]);
                    }
                });
            }
            res.json({ success: true, message: 'Se l\'email esiste nel sistema, riceverai un link per il reset.' });
        });
    });
});

app.post('/api/auth/reset-password', (req, res) => {
    const { token, newPassword } = req.body;
    if (!token || !newPassword) return res.status(400).json({ success: false, message: 'Dati mancanti' });

    const pwdRegex = /^(?=.*[A-Z])(?=.*\d)(?=.*[!@#$%^&*(),.?":{}|<>]).{8,}$/;
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
            
            // Log security event
            db.run('INSERT INTO security_logs (user_id, action) VALUES (?, ?)', [user.id, 'Ha reimpostato la password autonomamente']);
            
            res.json({ success: true, message: 'Password aggiornata con successo! Ora puoi accedere.' });
        });
    });
});

// --- SECURITY LOGS ---
app.get('/api/security-logs', authenticateToken, requireCondominio, isAdmin, (req, res) => {
    db.all(`SELECT s.*, u.nome, u.email 
            FROM security_logs s 
            JOIN users u ON s.user_id = u.id 
            JOIN user_condominios uc ON uc.user_id = u.id
            WHERE uc.condominio_id = ?
            ORDER BY s.created_at DESC LIMIT 50`, [req.condominio_id], (err, rows) => {
        if (err) return res.status(500).json({ success: false, error: err.message });
        res.json({ success: true, data: rows || [] });
    });
});


app.post('/api/assemblies/send-convocation', authenticateToken, requireCondominio, isAdmin, async (req, res) => {
    const { userId, email, nome, htmlContent, activeCondoName } = req.body;
    
    if (!email) {
        return res.status(400).json({ success: false, message: 'Nessuna email associata a questo condomino.' });
    }

    let browser;
    try {
        if (!transporter) throw new Error("Servizio email non pronto");
        
        console.log("Generazione PDF in corso...");
        browser = await puppeteer.launch();
        const page = await browser.newPage();
        await page.setContent(htmlContent, { waitUntil: 'networkidle0' });
        const pdfBuffer = await page.pdf({ 
            format: 'A4', 
            printBackground: true,
            margin: { top: '30px', bottom: '30px', left: '30px', right: '30px' }
        });
        await browser.close();
        
        console.log("Invio email con allegato PDF...");
        let info = await transporter.sendMail({
            from: '"Amministrazione Condominio" <admin@condominio.it>',
            to: email,
            subject: 'Convocazione Assemblea Condominiale - ' + activeCondoName,
            html: '<p>Gent.le <b>' + nome + '</b>,</p><p>In allegato alla presente trova la lettera ufficiale di convocazione per la prossima Assemblea Condominiale.</p><p>Restiamo a disposizione per qualsiasi chiarimento.<br><br>Cordiali saluti,<br><i>L\'Amministrazione</i></p>',
            attachments: [
                {
                    filename: 'Convocazione_Assemblea_' + nome.replace(/ /g, '_') + '.pdf',
                    content: pdfBuffer,
                    contentType: 'application/pdf'
                }
            ]
        });

        const previewUrl = nodemailer.getTestMessageUrl(info) || '';
        console.log("o Email Inviata! Anteprima disponibile su: " + previewUrl);
        
        // Log into database
        db.run('INSERT INTO convocations_log (condominio_id, user_id, destinatario, email, preview_url) VALUES (?, ?, ?, ?, ?)', 
            [req.condominio_id, userId, nome, email, previewUrl], 
            function(err) {
                if (err) console.error("Errore salvataggio log:", err);
            }
        );
        
        res.json({ 
            success: true, 
            message: 'Email con allegato PDF inviata con successo!', 
            previewUrl: previewUrl 
        });
    } catch (err) {
        console.error(err);
        if (browser) await browser.close();
        res.status(500).json({ success: false, message: 'Errore invio email' });
    }
});

app.get('/api/assemblies/convocations-log', authenticateToken, requireCondominio, isAdmin, (req, res) => {
    db.all('SELECT * FROM convocations_log WHERE condominio_id = ? ORDER BY data_invio DESC', [req.condominio_id], (err, rows) => {
        if (err) return res.status(500).json({ success: false, error: err.message });
        res.json({ success: true, data: rows || [] });
    });
});



// ---------------------------------------------------------
// INVIO RICEVUTA PAGAMENTO
// ---------------------------------------------------------


// ---------------------------------------------------------
// INVIO RICEVUTA PAGAMENTO
// ---------------------------------------------------------


// ---------------------------------------------------------
// INVIO RICEVUTA PAGAMENTO
// ---------------------------------------------------------
app.post('/api/quotes/:id/send-receipt', authenticateToken, requireCondominio, isAdmin, async (req, res) => {
    const quoteId = req.params.id;
    const { activeCondoName } = req.body;
    
    try {
        db.get('SELECT q.*, u.nome, u.email, uc.unita FROM quotes q JOIN users u ON q.user_id = u.id JOIN user_condominios uc ON u.id = uc.user_id AND uc.condominio_id = q.condominio_id WHERE q.id = ?', [quoteId], async (err, quote) => {
            if (err || !quote) return res.status(404).json({ success: false, message: 'Quota non trovata' });
            if (!quote.email) return res.status(400).json({ success: false, message: 'Nessuna email per questo condomino' });
            
            if (!transporter) throw new Error("Servizio email non pronto");
            
            let browser;
            try {
                browser = await puppeteer.launch();
                const page = await browser.newPage();
                
                const htmlContent = `
                    <html>
                    <body style="font-family: Arial; padding: 40px; color: #333;">
                        <h2 style="text-align:center; border-bottom: 2px solid #333; padding-bottom:10px;">AMMINISTRAZIONE CONDOMINIO<br>${activeCondoName}</h2>
                        <h1 style="text-align:center; color: #16a34a; margin-top:40px;">RICEVUTA DI PAGAMENTO</h1>
                        <p style="text-align:right; margin-bottom:40px;">Data: ${new Date().toLocaleDateString('it-IT')}</p>
                        <p>Si attesta di aver ricevuto dal Sig./Sig.ra <b>${quote.nome}</b> (Unit�: ${quote.unita || 'N/D'})</p>
                        <p>La somma di: <b style="font-size:24px;">� ${quote.amount.toFixed(2)}</b></p>
                        <p>A titolo di saldo per la seguente causale:</p>
                        <div style="background: #f8fafc; padding: 20px; border: 1px solid #e2e8f0; border-radius: 8px;">
                            <strong>${quote.title}</strong><br>
                            Tipo Quota: ${quote.type}<br>
                            Scadenza originaria: ${new Date(quote.due_date).toLocaleDateString('it-IT')}
                        </div>
                        <p style="margin-top:50px; text-align:right;">L'Amministratore<br>___________________</p>
                    </body>
                    </html>
                `;
                
                await page.setContent(htmlContent, { waitUntil: 'networkidle0' });
                const pdfBuffer = await page.pdf({ format: 'A4', printBackground: true });
                await browser.close();
                
                let info = await transporter.sendMail({
                    from: '"Amministrazione Condominio" <admin@condominio.it>',
                    to: quote.email,
                    subject: 'Ricevuta di Pagamento - ' + activeCondoName,
                    html: '<p>Gent.le <b>' + quote.nome + '</b>,</p><p>La ringraziamo per il pagamento effettuato. In allegato trova la ricevuta in formato PDF.</p><p>Cordiali saluti,<br><i>L\'Amministrazione</i></p>',
                    attachments: [{ filename: 'Ricevuta_Pagamento.pdf', content: pdfBuffer, contentType: 'application/pdf' }]
                });

                const previewUrl = nodemailer.getTestMessageUrl(info) || '';
                
                db.run('INSERT INTO convocations_log (condominio_id, user_id, destinatario, email, preview_url) VALUES (?, ?, ?, ?, ?)', 
                    [req.condominio_id, quote.user_id, 'RICEVUTA: ' + quote.nome, quote.email, previewUrl]);
                
                res.json({ success: true, message: 'Ricevuta inviata con successo!', previewUrl });
            } catch (e) {
                if(browser) await browser.close();
                console.error(e);
                res.status(500).json({ success: false, message: 'Errore generazione PDF' });
            }
        });
    } catch (err) {
        res.status(500).json({ success: false });
    }
});

// ---------------------------------------------------------
// INVIO SOLLECITO PAGAMENTO
// ---------------------------------------------------------
app.post('/api/quotes/:id/send-reminder', authenticateToken, requireCondominio, isAdmin, async (req, res) => {
    const quoteId = req.params.id;
    const { activeCondoName } = req.body;
    
    try {
        db.get('SELECT q.*, u.nome, u.email, uc.unita FROM quotes q JOIN users u ON q.user_id = u.id JOIN user_condominios uc ON u.id = uc.user_id AND uc.condominio_id = q.condominio_id WHERE q.id = ?', [quoteId], async (err, quote) => {
            if (err || !quote) return res.status(404).json({ success: false, message: 'Quota non trovata' });
            if (!quote.email) return res.status(400).json({ success: false, message: 'Nessuna email per questo condomino' });
            
            if (!transporter) throw new Error("Servizio email non pronto");
            
            let browser;
            try {
                browser = await puppeteer.launch();
                const page = await browser.newPage();
                
                const htmlContent = `
                    <html>
                    <body style="font-family: Arial; padding: 40px; color: #333;">
                        <h2 style="text-align:center; border-bottom: 2px solid #333; padding-bottom:10px;">AMMINISTRAZIONE CONDOMINIO<br>${activeCondoName}</h2>
                        <h1 style="text-align:center; color: #dc2626; margin-top:40px;">SOLLECITO DI PAGAMENTO</h1>
                        <p style="text-align:right; margin-bottom:40px;">Data: ${new Date().toLocaleDateString('it-IT')}</p>
                        
                        <div style="text-align:right; margin-bottom: 30px;">
                            Spett.le<br>
                            <b>${quote.nome}</b><br>
                            Unit�: ${quote.unita || 'N/D'}
                        </div>
                        
                        <p>Gentile Cond�mino,</p>
                        <p>Dalla verifica contabile ad oggi effettuata, non ci risulta pervenuto il pagamento relativo alla seguente quota condominiale, ormai <b>scaduta</b>:</p>
                        
                        <div style="background: #fef2f2; padding: 20px; border: 1px solid #fecaca; border-radius: 8px; margin: 20px 0;">
                            <strong>${quote.title}</strong><br>
                            Importo da saldare: <b style="color:#dc2626; font-size:18px;">� ${quote.amount.toFixed(2)}</b><br>
                            Scaduta il: ${new Date(quote.due_date).toLocaleDateString('it-IT')}
                        </div>
                        
                        <p>La invitiamo a provvedere al saldo nel pi� breve tempo possibile, per consentire la corretta e serena gestione del Condominio.</p>
                        <p>Qualora avesse gi� provveduto al pagamento, La preghiamo di non tenere conto della presente comunicazione.</p>
                        
                        <p style="margin-top:50px; text-align:right;">Distinti saluti,<br>L'Amministratore<br>___________________</p>
                    </body>
                    </html>
                `;
                
                await page.setContent(htmlContent, { waitUntil: 'networkidle0' });
                const pdfBuffer = await page.pdf({ format: 'A4', printBackground: true });
                await browser.close();
                
                let info = await transporter.sendMail({
                    from: '"Amministrazione Condominio" <admin@condominio.it>',
                    to: quote.email,
                    subject: 'Sollecito di Pagamento Scaduto - ' + activeCondoName,
                    html: '<p>Gent.le <b>' + quote.nome + '</b>,</p><p>Le scriviamo per ricordarLe una scadenza condominiale in sospeso. In allegato trova la lettera formale di sollecito con i dettagli dell\'importo.</p><p>Cordiali saluti,<br><i>L\'Amministrazione</i></p>',
                    attachments: [{ filename: 'Sollecito_Pagamento.pdf', content: pdfBuffer, contentType: 'application/pdf' }]
                });

                const previewUrl = nodemailer.getTestMessageUrl(info) || '';
                
                db.run('INSERT INTO convocations_log (condominio_id, user_id, destinatario, email, preview_url) VALUES (?, ?, ?, ?, ?)', 
                    [req.condominio_id, quote.user_id, 'SOLLECITO: ' + quote.nome, quote.email, previewUrl]);
                
                res.json({ success: true, message: 'Sollecito inviato con successo!', previewUrl });
            } catch (e) {
                if(browser) await browser.close();
                console.error(e);
                res.status(500).json({ success: false, message: 'Errore generazione PDF' });
            }
        });
    } catch (err) {
        res.status(500).json({ success: false });
    }
});

// ---------------------------------------------------------
// COMUNICAZIONI LIBERE E CIRCOLARI
// ---------------------------------------------------------
app.post('/api/communications/send', authenticateToken, requireCondominio, isAdmin, async (req, res) => {
    const { userId, subject, message, activeCondoName } = req.body;
    
    if (!subject || !message) {
        return res.status(400).json({ success: false, message: 'Oggetto e Messaggio sono obbligatori' });
    }

    try {
        let query = 'SELECT u.id, u.nome, u.email, uc.unita FROM users u JOIN user_condominios uc ON u.id = uc.user_id WHERE uc.condominio_id = ?';
        let params = [req.condominio_id];
        
        if (userId && userId !== 'all') {
            query += ' AND u.id = ?';
            params.push(userId);
        }
        
        db.all(query, params, async (err, users) => {
            if (err) return res.status(500).json({ success: false });
            
            const validUsers = users.filter(u => u.email);
            if (validUsers.length === 0) return res.status(400).json({ success: false, message: 'Nessun destinatario valido trovato con email.' });

            if (!transporter) return res.status(500).json({ success: false, message: 'Servizio email non configurato' });

            let browser;
            try {
                browser = await puppeteer.launch();
                
                // Formatta il messaggio con br per l'HTML
                const formattedMessage = message.replace(/\\n/g, '<br>');
                
                for (const u of validUsers) {
                    const page = await browser.newPage();
                    const htmlContent = `
                        <html>
                        <body style="font-family: Arial; padding: 40px; color: #333;">
                            <h2 style="text-align:center; border-bottom: 2px solid #333; padding-bottom:10px;">AMMINISTRAZIONE CONDOMINIO<br>${activeCondoName}</h2>
                            <p style="text-align:right; margin-bottom:40px;">Data: ${new Date().toLocaleDateString('it-IT')}</p>
                            
                            <div style="text-align:right; margin-bottom: 30px;">
                                Spett.le<br>
                                <b>${u.nome}</b><br>
                                Unit�: ${u.unita || 'N/D'}
                            </div>
                            
                            <h3 style="margin-bottom: 30px; border-bottom: 1px solid #ccc; padding-bottom:5px;">Oggetto: ${subject}</h3>
                            
                            <div style="line-height: 1.6;">
                                ${formattedMessage}
                            </div>
                            
                            <p style="margin-top:50px; text-align:right;">Cordiali saluti,<br>L'Amministratore<br>___________________</p>
                        </body>
                        </html>
                    `;
                    
                    await page.setContent(htmlContent, { waitUntil: 'networkidle0' });
                    const pdfBuffer = await page.pdf({ format: 'A4', printBackground: true, margin: { top: '30px', bottom: '30px', left: '30px', right: '30px' } });
                    await page.close();
                    
                    let info = await transporter.sendMail({
                        from: '"Amministrazione Condominio" <admin@condominio.it>',
                        to: u.email,
                        subject: subject + ' - ' + activeCondoName,
                        html: '<p>Gent.le <b>' + u.nome + '</b>,</p><p>In allegato alla presente le trasmettiamo una comunicazione da parte dell\'Amministrazione.</p>',
                        attachments: [{ filename: 'Comunicazione.pdf', content: pdfBuffer, contentType: 'application/pdf' }]
                    });

                    const previewUrl = nodemailer.getTestMessageUrl(info) || '';
                    
                    db.run('INSERT INTO convocations_log (condominio_id, user_id, destinatario, email, preview_url) VALUES (?, ?, ?, ?, ?)', 
                        [req.condominio_id, u.id, 'COMUNICAZIONE: ' + subject.substring(0, 20), u.email, previewUrl]);
                }
                
                await browser.close();
                res.json({ success: true, message: 'Comunicazioni inviate con successo a ' + validUsers.length + ' cond�mini!' });
                
            } catch (e) {
                if(browser) await browser.close();
                console.error(e);
                res.status(500).json({ success: false, message: 'Errore durante l\'invio' });
            }
        });
    } catch (e) {
        res.status(500).json({ success: false });
    }
});


// Fallback Frontend SPA
app.use((req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));



app.listen(PORT, () => {
    console.log(`====================================================`);
    console.log(`🏢 MULTI-TENANT CONDO ONLINE (SaaS) - STEP 1 & 2`);
    console.log(`🚀 Server in ascolto su: http://localhost:${PORT}`);
    console.log(`====================================================`);
});
