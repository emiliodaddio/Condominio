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
    
    let pool;
    const connUri = process.env.MYSQL_URL || process.env.DATABASE_URL;
    if (connUri) {
        pool = mysql.createPool(connUri);
    } else {
        pool = mysql.createPool({
            host: process.env.MYSQL_HOST || '127.0.0.1',
            port: parseInt(process.env.MYSQL_PORT || '3306', 10),
            user: process.env.MYSQL_USER || 'root',
            password: process.env.MYSQL_PASSWORD || '',
            database: process.env.MYSQL_DATABASE || 'condominio_db',
            waitForConnections: true,
            connectionLimit: 25,
            maxIdle: 10,
            idleTimeout: 60000,
            queueLimit: 0,
            enableKeepAlive: true,
            keepAliveInitialDelay: 10000,
            dateStrings: true,
            ssl: (process.env.MYSQL_SSL === 'true' || process.env.MYSQL_SSL === '1') ? {
                minVersion: 'TLSv1.2',
                rejectUnauthorized: process.env.MYSQL_SSL_REJECT_UNAUTHORIZED === 'true'
            } : undefined
        });
    }

    // Intercetta errori a livello di pool per prevenire crash del processo
    pool.on('error', (err) => {
        console.error('⚠️ [DB Pool] Errore imprevisto su connessione MySQL:', err.code || err.errno, err.message);
    });

    pool.getConnection((err, conn) => {
        if (err) {
            console.error('❌ ERRORE CRITICO CONNESSIONE MYSQL:', err.code || err.errno, err.message);
            console.error('👉 Parametri attuali: host =', process.env.MYSQL_HOST || (connUri ? 'URI fornito' : '127.0.0.1'), '| database =', process.env.MYSQL_DATABASE || 'condominio_db');
        } else {
            console.log('✅ Connesso con successo al database MySQL:', process.env.MYSQL_DATABASE || 'condominio_db');
            conn.release();
        }
    });

    // Keep-alive heartbeat periodico (ogni 45 secondi) per evitare timeout di inattività dei cloud provider
    setInterval(() => {
        try {
            pool.query('SELECT 1', (err) => {
                if (err) console.warn('⚠️ [DB Keep-Alive] Ping fallito:', err.code || err.message);
            });
        } catch (_) {}
    }, 45000);

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

    // Esegue query con retry automatico (1 tentativo extra) in caso di connessione persa o riavvio del server DB
    function executeWithRetry(queryFn, callback) {
        queryFn((err, results) => {
            const isTransientError = err && [
                'PROTOCOL_CONNECTION_LOST',
                'ECONNRESET',
                'PROTOCOL_ENQUEUE_AFTER_FATAL_ERROR',
                'ETIMEDOUT',
                'EPIPE'
            ].includes(err.code);

            if (isTransientError) {
                console.warn(`🔄 [DB Retry] Errore transitorio ${err.code}, ripeto l'operazione tra 250ms...`);
                setTimeout(() => {
                    queryFn(callback);
                }, 250);
            } else {
                if (callback) callback(err, results);
            }
        });
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
            executeWithRetry((done) => {
                pool.query(cleanSql, params, (err, rows) => {
                    done(err, rows || []);
                });
            }, callback);
        },
        get(sql, params, callback) {
            if (typeof params === 'function') {
                callback = params;
                params = [];
            }
            const cleanSql = adaptSqlForMysql(sql);
            executeWithRetry((done) => {
                pool.query(cleanSql, params, (err, rows) => {
                    done(err, rows && rows.length > 0 ? rows[0] : undefined);
                });
            }, callback);
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

            executeWithRetry((done) => {
                pool.query(cleanSql, params, (err, results) => {
                    done(err, results);
                });
            }, (err, results) => {
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
        getConnection() {
            if (pool && typeof pool.promise === 'function') {
                return pool.promise().getConnection();
            }
            throw new Error('MySQL connection pool non disponibile per transazioni');
        },
        close(cb) {
            pool.end(cb);
        }
    };
}

module.exports = db;
