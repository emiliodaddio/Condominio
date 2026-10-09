const fs = require('fs');
const path = require('path');

const serverContent = `
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
        db.run(\`CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            nome TEXT NOT NULL,
            email TEXT UNIQUE NOT NULL,
            password_hash TEXT NOT NULL,
            is_superadmin BOOLEAN DEFAULT 0,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )\`);

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

        // TICKET UPDATES
        db.run(\`CREATE TABLE IF NOT EXISTS ticket_updates (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            ticket_id INTEGER NOT NULL,
            user_id INTEGER,
            author_name TEXT NOT NULL,
            message TEXT NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (ticket_id) REFERENCES tickets(id) ON DELETE CASCADE,
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
        )\`);

        // TICKET ATTACHMENTS
        db.run(\`CREATE TABLE IF NOT EXISTS ticket_attachments (
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

        // JOURNAL ENTRIES
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

`;

fs.writeFileSync(path.join(__dirname, 'build_server_1.js'), serverContent, 'utf8');
console.log('Part 1 generated');
