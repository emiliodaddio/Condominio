const fs = require('fs');

let server = fs.readFileSync('recovery/server.js', 'utf8');

// The required top boilerplate
const topBoilerplate = `const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const cors = require('cors');
const multer = require('multer');
const path = require('path');
const ExcelJS = require('exceljs');
const fs = require('fs');
const puppeteer = require('puppeteer');

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = 'chiave_segreta_condominio_sicura_123!';

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Assicura l'esistenza della cartella uploads
const uploadDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir);
}

const db = new sqlite3.Database('./condominio.db', (err) => {
    if (err) console.error(err.message);
    else console.log('✅ Connesso al database SQLite Multi-Tenant');
});

const nodemailer = require('nodemailer');
let transporter;
nodemailer.createTestAccount((err, account) => {
    if (err) {
        console.error('Failed to create a testing account. ' + err.message);
        return;
    }
    transporter = nodemailer.createTransport({
        host: account.smtp.host,
        port: account.smtp.port,
        secure: account.smtp.secure,
        auth: {
            user: account.user,
            pass: account.pass
        }
    });
});

// Middlewares
function authenticateToken(req, res, next) {
    const token = req.headers['authorization']?.split(' ')[1];
    if (!token) return res.sendStatus(401);
    jwt.verify(token, JWT_SECRET, (err, user) => {
        if (err) return res.sendStatus(403);
        req.user = user;
        next();
    });
}

function requireCondominio(req, res, next) {
    const condominio_id = req.headers['x-condominio-id'];
    if (!condominio_id) return res.status(400).json({ success: false, message: 'Condominio non selezionato' });
    req.condominio_id = condominio_id;
    
    // Controlla i permessi per questo condominio
    db.get('SELECT role FROM user_condominios WHERE user_id = ? AND condominio_id = ?', 
    [req.user.id, condominio_id], (err, row) => {
        if (err || !row) return res.status(403).json({ success: false, message: 'Accesso negato a questo condominio' });
        req.role_in_condominio = row.role;
        next();
    });
}

function isAdmin(req, res, next) {
    if (req.role_in_condominio !== 'Amministratore') return res.status(403).json({ success: false, message: 'Richiesto ruolo Amministratore' });
    next();
}

function logAudit(user_id, condominio_id, action, target_table, target_id, details, ip_address) {
    db.run(\`INSERT INTO audit_logs (user_id, condominio_id, action, target_table, target_id, details, ip_address) 
            VALUES (?, ?, ?, ?, ?, ?, ?)\`,
        [user_id, condominio_id, action, target_table, target_id, details, ip_address]);
}

`;

// Extract all lines
let lines = server.split('\n');

// Find where "app.post('/api/auth/login'" starts in recovery/server.js
// Wait, the easiest way is to find all endpoints and just append them to the boilerplate.
// Since the recovery/server.js is just a huge mess of prepended stuff and appended stuff,
// let's just use regex to extract everything.
// No, the safest way is to find the ACTUAL start of the code (before the prepended stuff).
// The prepended stuff starts at line 1.
// Where does the original code start?
// In full_build.js it started with `const express = require('express');`
// But we saw `patch_server_log2.js` deleted everything up to `// Fallback Frontend SPA`!
// So wait! If it deleted it, it IS NOT IN THE FILE!
// BUT I FOUND `app.post('/api/auth/login'` at line 707!!!
// So IT IS IN THE FILE!
// Why?
// Because in my recovery script, I DID NOT run `fix_server_log2.js` that deleted it! I RAN A DIFFERENT VERSION!
// Let's find exactly where `const express` is in recovery/server.js, if it's there.
