const path = require('path');
const fs = require('fs');

// Carica variabili da .env se presente
const envPath = path.join(__dirname, '.env');
if (fs.existsSync(envPath)) {
    try {
        const lines = fs.readFileSync(envPath, 'utf8').split(/\r?\n/);
        lines.forEach(line => {
            const trimmed = line.trim();
            if (trimmed && !trimmed.startsWith('#')) {
                const eqIdx = trimmed.indexOf('=');
                if (eqIdx > 0) {
                    const key = trimmed.slice(0, eqIdx).trim();
                    const val = trimmed.slice(eqIdx + 1).trim();
                    if (!process.env[key]) process.env[key] = val;
                }
            }
        });
    } catch (e) {
        console.warn('Avviso: impossibile leggere .env:', e.message);
    }
}

const DB_TYPE = (process.env.DB_TYPE || 'mysql').toLowerCase();

let db;

if (DB_TYPE === 'sqlite') {
    try {
        const sqlite3 = require('sqlite3').verbose();
        db = new sqlite3.Database(path.join(__dirname, 'condominio.db'), (err) => {
            if (err) console.error('❌ Errore connessione SQLite:', err.message);
            else console.log('✅ Connesso al database SQLite');
        });
        db.type = 'sqlite';
    } catch (e) {
        console.error('❌ Modulo sqlite3 non disponibile. Usa MySQL impostando DB_TYPE=mysql.');
        throw e;
    }
} else {
    const mysql = require('mysql2');
    const pool = mysql.createPool({
        host: process.env.MYSQL_HOST || '127.0.0.1',
        port: parseInt(process.env.MYSQL_PORT || '3306', 10),
        user: process.env.MYSQL_USER || 'root',
        password: process.env.MYSQL_PASSWORD || '',
        database: process.env.MYSQL_DATABASE || 'condominio_db',
        waitForConnections: true,
        connectionLimit: 20,
        queueLimit: 0,
        dateStrings: true
    });

    pool.getConnection((err, conn) => {
        if (err) {
            console.error('❌ Errore connessione MySQL:', err.message);
        } else {
            console.log('✅ Connesso al database MySQL Server (condominio_db)');
            conn.release();
        }
    });

    function adaptSqlForMysql(sql) {
        let clean = sql;
        if (/INSERT\s+OR\s+IGNORE/i.test(clean)) {
            clean = clean.replace(/INSERT\s+OR\s+IGNORE/gi, 'INSERT IGNORE');
        }
        if (/ON\s+CONFLICT\s*\([^)]*\)\s*DO\s+UPDATE\s+SET/i.test(clean)) {
            clean = clean.replace(/ON\s+CONFLICT\s*\([^)]*\)\s*DO\s+UPDATE\s+SET/gi, 'ON DUPLICATE KEY UPDATE');
            clean = clean.replace(/excluded\.([a-zA-Z0-9_]+)/gi, 'VALUES($1)');
        }
        return clean;
    }

    db = {
        type: 'mysql',
        pool,
        all(sql, params, callback) {
            if (typeof params === 'function') {
                callback = params;
                params = [];
            }
            const cleanSql = adaptSqlForMysql(sql);
            pool.query(cleanSql, params, (err, rows) => {
                if (callback) callback(err, rows || []);
            });
        },
        get(sql, params, callback) {
            if (typeof params === 'function') {
                callback = params;
                params = [];
            }
            const cleanSql = adaptSqlForMysql(sql);
            pool.query(cleanSql, params, (err, rows) => {
                if (callback) callback(err, rows && rows.length > 0 ? rows[0] : undefined);
            });
        },
        run(sql, params, callback) {
            if (typeof params === 'function') {
                callback = params;
                params = [];
            }
            let cleanSql = sql;
            if (cleanSql.trim().toUpperCase().startsWith('PRAGMA')) {
                if (callback) callback.call({ lastID: 0, changes: 0 }, null);
                return;
            }
            cleanSql = adaptSqlForMysql(cleanSql);

            pool.query(cleanSql, params, (err, results) => {
                if (callback) {
                    const ctx = {
                        lastID: results ? results.insertId : null,
                        changes: results ? results.affectedRows : 0
                    };
                    callback.call(ctx, err);
                }
            });
        },
        serialize(cb) {
            if (cb) cb();
        },
        close(cb) {
            pool.end(cb);
        }
    };
}

module.exports = db;
