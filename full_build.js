
const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const cors = require('cors');
const multer = require('multer');
const path = require('path');
const ExcelJS = require('exceljs');
const fs = require('fs');

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
        const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
        const mimetype = allowedTypes.test(file.mimetype);
        if (extname && mimetype) return cb(null, true);
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

        // SUPERADMIN / USERS GLOBALI
        db.run(`CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            nome TEXT NOT NULL,
            email TEXT UNIQUE NOT NULL,
            password_hash TEXT NOT NULL,
            is_superadmin BOOLEAN DEFAULT 0,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )`);

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

        // TICKET UPDATES
        db.run(`CREATE TABLE IF NOT EXISTS ticket_updates (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            ticket_id INTEGER NOT NULL,
            user_id INTEGER,
            author_name TEXT NOT NULL,
            message TEXT NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (ticket_id) REFERENCES tickets(id) ON DELETE CASCADE,
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
        )`);

        // TICKET ATTACHMENTS
        db.run(`CREATE TABLE IF NOT EXISTS ticket_attachments (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            ticket_id INTEGER NOT NULL,
            user_id INTEGER,
            filename TEXT NOT NULL,
            original_name TEXT NOT NULL,
            mimetype TEXT NOT NULL,
            size INTEGER NOT NULL,
            uploaded_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (ticket_id) REFERENCES tickets(id) ON DELETE CASCADE,
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
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

        // JOURNAL ENTRIES
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

        // 1. Users
        db.run("INSERT INTO users (id, nome, email, password_hash, is_superadmin) VALUES (1, 'Super Admin', 'super@condominio.it', ?, 1)", [adminHash]);
        db.run("INSERT INTO users (id, nome, email, password_hash) VALUES (2, 'Studio Rossi', 'admin@condominio.it', ?)", [adminHash]);
        db.run("INSERT INTO users (id, nome, email, password_hash) VALUES (3, 'Mario Rossi', 'mario@email.it', ?)", [userHash]);
        db.run("INSERT INTO users (id, nome, email, password_hash) VALUES (4, 'Luigi Verdi', 'luigi@email.it', ?)", [userHash]);
        
        // 2. Condominios
        db.run("INSERT INTO condominios (id, nome, indirizzo, cf) VALUES (1, 'Condominio Le Ginestre', 'Via Roma 1', '90012345678')");
        db.run("INSERT INTO condominios (id, nome, indirizzo, cf) VALUES (2, 'Condominio I Pini', 'Via Milano 2', '90087654321')");

        // 3. User Condominios (Roles)
        // Studio Rossi is Admin of both
        db.run("INSERT INTO user_condominios (user_id, condominio_id, role, unita) VALUES (2, 1, 'admin', 'Ufficio')");
        db.run("INSERT INTO user_condominios (user_id, condominio_id, role, unita) VALUES (2, 2, 'admin', 'Ufficio')");
        // Mario is condomino in Ginestre
        db.run("INSERT INTO user_condominios (user_id, condominio_id, role, unita) VALUES (3, 1, 'condomino', 'Int. 1')");
        // Luigi is condomino in Ginestre AND I Pini
        db.run("INSERT INTO user_condominios (user_id, condominio_id, role, unita) VALUES (4, 1, 'condomino', 'Int. 2')");
        db.run("INSERT INTO user_condominios (user_id, condominio_id, role, unita) VALUES (4, 2, 'condomino', 'Int. 10')");
        
        // 4. Quotes (for Condo 1)
        db.run("INSERT INTO quotes (condominio_id, user_id, type, title, due_date, amount, status) VALUES (1, 3, 'ordinaria', 'Rata 1', '2026-03-31', 350.00, 'Pagato')");
        db.run("INSERT INTO quotes (condominio_id, user_id, type, title, due_date, amount, status) VALUES (1, 4, 'ordinaria', 'Rata 1', '2026-03-31', 350.00, 'In sospeso')");
    });
}

initDatabase();



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
        return res.status(403).json({ success: false, message: 'Operazione riservata all\'amministratore.' });
    }
}

function logAction(userId, condominioId, azione, tabella, recordId, valoriPrecedenti, ip) {
    db.run(
        `INSERT INTO audit_log (user_id, condominio_id, azione, tabella, record_id, valori_precedenti, ip) VALUES (?, ?, ?, ?, ?, ?, ?)`,
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



// ENDPOINT MULTI-TENANT

app.get('/api/condominios', authenticateToken, (req, res) => {
    if (req.user.is_superadmin) {
        db.all('SELECT * FROM condominios', [], (err, rows) => res.json({ success: true, data: rows }));
    } else {
        res.status(403).json({success:false});
    }
});

app.get('/api/condominio', authenticateToken, requireCondominio, (req, res) => {
    db.get('SELECT * FROM condominios WHERE id = ?', [req.condominio_id], (err, row) => {
        res.json({ success: true, data: row || {} });
    });
});

app.put('/api/condominio', authenticateToken, requireCondominio, isAdmin, (req, res) => {
    const { nome, indirizzo, cf, scala, piano } = req.body;
    db.run(`UPDATE condominios SET nome = ?, indirizzo = ?, cf = ?, scala = ?, piano = ? WHERE id = ?`,
    [nome, indirizzo, cf, scala, piano, req.condominio_id], function(err) {
        res.json({ success: true, message: 'Dati condominio aggiornati.' });
    });
});

// USERS per condominio
app.get('/api/users', authenticateToken, requireCondominio, isAdmin, (req, res) => {
    db.all('SELECT u.id, u.nome, u.email, uc.role, uc.unita, u.created_at FROM users u JOIN user_condominios uc ON u.id = uc.user_id WHERE uc.condominio_id = ?', 
    [req.condominio_id], (err, rows) => {
        res.json({ success: true, data: rows });
    });
});

app.put('/api/users/:id', authenticateToken, requireCondominio, isAdmin, (req, res) => {
    const { unita, role } = req.body;
    db.run(`UPDATE user_condominios SET unita = ?, role = ? WHERE user_id = ? AND condominio_id = ?`,
    [unita, role, req.params.id, req.condominio_id], function(err) {
        res.json({ success: true, message: 'Utente aggiornato con successo.' });
    });
});

// ACCOUNTING SUMMARY
app.get('/api/accounting-summary', authenticateToken, requireCondominio, (req, res) => {
    if (req.role_in_condominio === 'admin') {
        db.get("SELECT IFNULL(SUM(amount),0) as tot_receivables FROM quotes WHERE status = 'In sospeso' AND condominio_id = ?", [req.condominio_id], (err, rec) => {
            db.get("SELECT IFNULL(SUM(amount),0) as tot_payables FROM supplier_payments WHERE status != 'Pagato' AND condominio_id = ?", [req.condominio_id], (err, pay) => {
                db.get("SELECT IFNULL(SUM(importo),0) as cassa_balance FROM bank_transactions JOIN bank_accounts ON bank_transactions.account_id = bank_accounts.id WHERE bank_accounts.condominio_id = ?", [req.condominio_id], (err, bank) => {
                    res.json({ success: true, data: { receivables: rec.tot_receivables, payables: pay.tot_payables, bank_balance: bank ? bank.cassa_balance : 0 } });
                });
            });
        });
    } else {
        db.get("SELECT IFNULL(SUM(amount),0) as tot_receivables FROM quotes WHERE status = 'In sospeso' AND user_id = ? AND condominio_id = ?", [req.user.id, req.condominio_id], (err, rec) => {
            res.json({ success: true, data: { receivables: rec.tot_receivables, payables: 0, bank_balance: 0 } });
        });
    }
});

// QUOTES
app.get('/api/quotes', authenticateToken, requireCondominio, (req, res) => {
    if (req.role_in_condominio === 'admin') {
        db.all('SELECT q.*, u.nome as condomino_nome, uc.unita as condomino_unita FROM quotes q JOIN users u ON q.user_id = u.id JOIN user_condominios uc ON u.id = uc.user_id AND uc.condominio_id = q.condominio_id WHERE q.condominio_id = ? ORDER BY q.due_date ASC', 
        [req.condominio_id], (err, rows) => {
            res.json({ success: true, data: rows });
        });
    } else {
        db.all('SELECT * FROM quotes WHERE user_id = ? AND condominio_id = ? ORDER BY due_date ASC', 
        [req.user.id, req.condominio_id], (err, rows) => {
            res.json({ success: true, data: rows });
        });
    }
});

app.put('/api/quotes/:id', authenticateToken, requireCondominio, isAdmin, (req, res) => {
    const { amount, due_date, status } = req.body;
    db.run(`UPDATE quotes SET amount = ?, due_date = ?, status = ? WHERE id = ? AND condominio_id = ?`,
    [amount, due_date, status, req.params.id, req.condominio_id], function(err) {
        res.json({ success: true, message: 'Quota aggiornata.' });
    });
});

app.patch('/api/quotes/:id/pay', authenticateToken, requireCondominio, isAdmin, (req, res) => {
    db.run(`UPDATE quotes SET status = 'Pagato', payment_date = ? WHERE id = ? AND condominio_id = ?`,
    [new Date().toISOString().slice(0, 10), req.params.id, req.condominio_id], function(err) {
        res.json({ success: true });
    });
});

// SUPPLIERS
app.get('/api/supplier-payments', authenticateToken, requireCondominio, (req, res) => {
    db.all('SELECT * FROM supplier_payments WHERE condominio_id = ?', [req.condominio_id], (err, rows) => {
        res.json({ success: true, data: rows });
    });
});

app.post('/api/supplier-payments', authenticateToken, requireCondominio, isAdmin, (req, res) => {
    const { supplier_name, category, invoice_number, amount, payment_date, status, notes } = req.body;
    db.run(`INSERT INTO supplier_payments (condominio_id, supplier_name, category, invoice_number, amount, payment_date, status, notes) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [req.condominio_id, supplier_name, category, invoice_number, amount, payment_date, status, notes], function(err) {
        res.json({ success: true });
    });
});

app.put('/api/supplier-payments/:id', authenticateToken, requireCondominio, isAdmin, (req, res) => {
    const { amount, status } = req.body;
    db.run(`UPDATE supplier_payments SET amount = ?, status = ? WHERE id = ? AND condominio_id = ?`,
    [amount, status, req.params.id, req.condominio_id], function(err) {
        res.json({ success: true });
    });
});

// TICKETS
app.get('/api/tickets', authenticateToken, requireCondominio, (req, res) => {
    const filter = req.role_in_condominio === 'admin' ? '1=1' : `user_id = ${req.user.id}`;
    db.all(`SELECT t.*, u.nome as user_nome, uc.unita FROM tickets t JOIN users u ON t.user_id = u.id JOIN user_condominios uc ON u.id = uc.user_id AND uc.condominio_id = t.condominio_id WHERE t.condominio_id = ? AND ${filter} ORDER BY t.created_at DESC`, 
    [req.condominio_id], (err, rows) => {
        res.json({ success: true, data: rows });
    });
});

app.patch('/api/tickets/:id/status', authenticateToken, requireCondominio, isAdmin, (req, res) => {
    db.run(`UPDATE tickets SET status = ? WHERE id = ? AND condominio_id = ?`,
    [req.body.status, req.params.id, req.condominio_id], function(err) {
        res.json({ success: true });
    });
});

// OTHERS
app.get('/api/receivables', authenticateToken, requireCondominio, (req, res) => {
    db.all('SELECT q.*, u.nome as debtor_name, uc.unita as debtor_unit FROM quotes q JOIN users u ON q.user_id = u.id JOIN user_condominios uc ON u.id = uc.user_id AND uc.condominio_id = q.condominio_id WHERE q.condominio_id = ? AND q.status = "In sospeso"', 
    [req.condominio_id], (err, rows) => {
        if (req.role_in_condominio === 'admin') {
            res.json({ success: true, data: rows.map(r => ({ ...r, debitore: r.debtor_name, unita: r.debtor_unit, titolo_quota: r.title, importo: r.amount, scadenza: r.due_date })) });
        } else {
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

// Fallback per Excel, Bank, Journal...
app.get('/api/export/accounting-excel', authenticateToken, requireCondominio, async (req, res) => {
    // Semplificato per ora, per far ripartire la piattaforma
    res.send('Export non configurato temporaneamente nel refactoring');
});

// Servizio File SPA
app.use((req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

app.listen(PORT, () => {
    console.log(`====================================================`);
    console.log(`🏢 MULTI-TENANT CONDO ONLINE (SaaS)`);
    console.log(`🚀 Server in ascolto su: http://localhost:${PORT}`);
    console.log(`====================================================`);
});
