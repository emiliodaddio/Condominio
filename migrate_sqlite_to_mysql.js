const sqlite3 = require('sqlite3').verbose();
const mysql = require('mysql2/promise');
const path = require('path');

async function migrate() {
    console.log('🚀 Avvio migrazione da SQLite a MySQL...');

    const sqliteDbPath = path.join(__dirname, 'condominio.db');
    const sqliteDb = new sqlite3.Database(sqliteDbPath);

    const mysqlConnection = await mysql.createConnection({
        host: '127.0.0.1',
        port: 3306,
        user: 'root',
        password: '',
        multipleStatements: true
    });

    console.log('✅ Connessione a MySQL riuscita.');

    await mysqlConnection.query(`CREATE DATABASE IF NOT EXISTS condominio_db CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;`);
    await mysqlConnection.changeUser({ database: 'condominio_db' });
    console.log('✅ Database condominio_db selezionato.');

    // Disabilita temporaneamente i vincoli foreign key per il caricamento
    await mysqlConnection.query('SET FOREIGN_KEY_CHECKS = 0;');

    const tableSchemas = {
        users: `
            CREATE TABLE IF NOT EXISTS users (
                id INT AUTO_INCREMENT PRIMARY KEY,
                nome VARCHAR(255) NOT NULL,
                email VARCHAR(255) NOT NULL UNIQUE,
                password_hash VARCHAR(255) NOT NULL,
                is_superadmin TINYINT(1) DEFAULT 0,
                two_factor_secret VARCHAR(255),
                two_factor_enabled TINYINT(1) DEFAULT 0,
                backup_codes TEXT,
                telefono VARCHAR(50),
                privacy_accepted TINYINT(1) DEFAULT 0,
                privacy_accepted_at DATETIME,
                reset_token VARCHAR(255),
                reset_token_expires BIGINT,
                otp_code VARCHAR(20),
                otp_expires DATETIME,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
        `,
        condominios: `
            CREATE TABLE IF NOT EXISTS condominios (
                id INT AUTO_INCREMENT PRIMARY KEY,
                nome VARCHAR(255) NOT NULL,
                indirizzo VARCHAR(255) NOT NULL,
                cf VARCHAR(50),
                scala VARCHAR(50),
                piano VARCHAR(50),
                admin_nome VARCHAR(255),
                admin_cognome VARCHAR(255),
                admin_titolo VARCHAR(100),
                admin_telefono VARCHAR(50),
                admin_cellulare VARCHAR(50),
                admin_emergenze VARCHAR(100),
                admin_email VARCHAR(255),
                admin_pec VARCHAR(255),
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
        `,
        user_condominios: `
            CREATE TABLE IF NOT EXISTS user_condominios (
                id INT AUTO_INCREMENT PRIMARY KEY,
                user_id INT NOT NULL,
                condominio_id INT NOT NULL,
                role VARCHAR(50) NOT NULL,
                unita VARCHAR(100),
                dati_catastali TEXT,
                UNIQUE KEY unique_user_condo (user_id, condominio_id)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
        `,
        anagrafica_persone: `
            CREATE TABLE IF NOT EXISTS anagrafica_persone (
                id INT AUTO_INCREMENT PRIMARY KEY,
                condominio_id INT NOT NULL,
                nome VARCHAR(255) NOT NULL,
                cognome VARCHAR(255) NOT NULL,
                codice_fiscale VARCHAR(50),
                telefono VARCHAR(50),
                cellulare VARCHAR(50),
                email VARCHAR(255),
                ruolo_default VARCHAR(50) DEFAULT 'Proprietario',
                notes TEXT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
        `,
        unita_immobiliari: `
            CREATE TABLE IF NOT EXISTS unita_immobiliari (
                id INT AUTO_INCREMENT PRIMARY KEY,
                condominio_id INT NOT NULL,
                user_id INT,
                tipo VARCHAR(100) DEFAULT 'Appartamento',
                identificativo VARCHAR(100) NOT NULL,
                scala VARCHAR(50),
                piano VARCHAR(50),
                millesimi_proprieta DOUBLE DEFAULT 0,
                millesimi_scale DOUBLE DEFAULT 0,
                millesimi_ascensore DOUBLE DEFAULT 0,
                proprietario_id INT,
                conduttore_id INT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
        `,
        quotes: `
            CREATE TABLE IF NOT EXISTS quotes (
                id INT AUTO_INCREMENT PRIMARY KEY,
                condominio_id INT NOT NULL,
                persona_id INT,
                unita_id INT,
                type VARCHAR(50),
                title VARCHAR(255) NOT NULL,
                due_date VARCHAR(50) NOT NULL,
                amount DOUBLE NOT NULL,
                description TEXT,
                status VARCHAR(50) DEFAULT 'In sospeso',
                payment_date VARCHAR(50),
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
        `,
        suppliers: `
            CREATE TABLE IF NOT EXISTS suppliers (
                id INT AUTO_INCREMENT PRIMARY KEY,
                condominio_id INT NOT NULL,
                ragione_sociale VARCHAR(255) NOT NULL,
                partita_iva VARCHAR(50),
                codice_fiscale VARCHAR(50),
                indirizzo VARCHAR(255),
                email VARCHAR(255),
                telefono VARCHAR(50),
                iban VARCHAR(50),
                note TEXT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
        `,
        supplier_payments: `
            CREATE TABLE IF NOT EXISTS supplier_payments (
                id INT AUTO_INCREMENT PRIMARY KEY,
                condominio_id INT NOT NULL,
                supplier_name VARCHAR(255) NOT NULL,
                category VARCHAR(100) NOT NULL,
                invoice_number VARCHAR(100),
                amount DOUBLE NOT NULL,
                payment_date VARCHAR(50) NOT NULL,
                status VARCHAR(50) DEFAULT 'Da liquidare',
                notes TEXT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
        `,
        assemblies: `
            CREATE TABLE IF NOT EXISTS assemblies (
                id INT AUTO_INCREMENT PRIMARY KEY,
                condominio_id INT NOT NULL,
                type VARCHAR(50),
                title VARCHAR(255) NOT NULL,
                date VARCHAR(50) NOT NULL,
                time VARCHAR(50) NOT NULL,
                location VARCHAR(255) NOT NULL,
                agenda TEXT NOT NULL,
                meeting_link VARCHAR(255),
                is_past TINYINT(1) DEFAULT 0,
                minutes_summary TEXT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
        `,
        tickets: `
            CREATE TABLE IF NOT EXISTS tickets (
                id INT AUTO_INCREMENT PRIMARY KEY,
                condominio_id INT NOT NULL,
                user_id INT NOT NULL,
                category VARCHAR(100) NOT NULL,
                title VARCHAR(255) NOT NULL,
                description TEXT NOT NULL,
                priority VARCHAR(50) DEFAULT 'Media',
                status VARCHAR(50) DEFAULT 'Segnalato',
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
        `,
        ticket_updates: `
            CREATE TABLE IF NOT EXISTS ticket_updates (
                id INT AUTO_INCREMENT PRIMARY KEY,
                ticket_id INT NOT NULL,
                user_id INT,
                author_name VARCHAR(255) NOT NULL,
                message TEXT NOT NULL,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
        `,
        ticket_attachments: `
            CREATE TABLE IF NOT EXISTS ticket_attachments (
                id INT AUTO_INCREMENT PRIMARY KEY,
                ticket_id INT NOT NULL,
                user_id INT,
                filename VARCHAR(255) NOT NULL,
                original_name VARCHAR(255) NOT NULL,
                mimetype VARCHAR(100) NOT NULL,
                size INT NOT NULL,
                uploaded_at DATETIME DEFAULT CURRENT_TIMESTAMP
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
        `,
        bank_accounts: `
            CREATE TABLE IF NOT EXISTS bank_accounts (
                id INT AUTO_INCREMENT PRIMARY KEY,
                condominio_id INT NOT NULL,
                banca VARCHAR(255) NOT NULL,
                iban VARCHAR(50) NOT NULL,
                intestazione VARCHAR(255) NOT NULL,
                note TEXT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
        `,
        bank_transactions: `
            CREATE TABLE IF NOT EXISTS bank_transactions (
                id INT AUTO_INCREMENT PRIMARY KEY,
                account_id INT NOT NULL,
                data VARCHAR(50) NOT NULL,
                importo DOUBLE NOT NULL,
                causale VARCHAR(255) NOT NULL,
                tipo VARCHAR(50) NOT NULL,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
        `,
        journal_entries: `
            CREATE TABLE IF NOT EXISTS journal_entries (
                id INT AUTO_INCREMENT PRIMARY KEY,
                condominio_id INT NOT NULL,
                data VARCHAR(50) NOT NULL,
                numero VARCHAR(50),
                tipo VARCHAR(100) NOT NULL,
                descrizione TEXT NOT NULL,
                dare DOUBLE DEFAULT 0,
                avere DOUBLE DEFAULT 0,
                conto VARCHAR(100),
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
        `,
        audit_log: `
            CREATE TABLE IF NOT EXISTS audit_log (
                id INT AUTO_INCREMENT PRIMARY KEY,
                condominio_id INT,
                user_id INT,
                azione VARCHAR(255) NOT NULL,
                tabella VARCHAR(100),
                record_id INT,
                valori_precedenti TEXT,
                ip VARCHAR(100),
                timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
        `,
        security_logs: `
            CREATE TABLE IF NOT EXISTS security_logs (
                id INT AUTO_INCREMENT PRIMARY KEY,
                user_id INT,
                action VARCHAR(255),
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
        `,
        convocations_log: `
            CREATE TABLE IF NOT EXISTS convocations_log (
                id INT AUTO_INCREMENT PRIMARY KEY,
                condominio_id INT NOT NULL,
                user_id INT,
                destinatario VARCHAR(255),
                email VARCHAR(255),
                data_invio DATETIME DEFAULT CURRENT_TIMESTAMP,
                preview_url TEXT
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
        `,
        condo_features: `
            CREATE TABLE IF NOT EXISTS condo_features (
                condominio_id INT PRIMARY KEY,
                module_contabilita TINYINT(1) DEFAULT 1,
                module_segnalazioni TINYINT(1) DEFAULT 1,
                module_assemblee TINYINT(1) DEFAULT 1,
                module_comunicazioni TINYINT(1) DEFAULT 1,
                module_banca TINYINT(1) DEFAULT 1,
                module_anagrafica TINYINT(1) DEFAULT 1
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
        `,
        condo_licenses: `
            CREATE TABLE IF NOT EXISTS condo_licenses (
                id INT AUTO_INCREMENT PRIMARY KEY,
                condominio_id INT NOT NULL UNIQUE,
                plan_type VARCHAR(50) DEFAULT 'completo',
                license_status VARCHAR(50) DEFAULT 'active',
                start_date VARCHAR(50) NOT NULL,
                end_date VARCHAR(50) NOT NULL,
                payment_status VARCHAR(50) DEFAULT 'paid',
                payment_reference VARCHAR(255),
                payment_amount DOUBLE DEFAULT 240.00,
                payment_date VARCHAR(50),
                max_units INT DEFAULT 50,
                notes TEXT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
        `
    };

    // Crea le tabelle in MySQL
    for (const [tableName, sql] of Object.entries(tableSchemas)) {
        await mysqlConnection.query(sql);
    }
    console.log('✅ Tutte le 20 tabelle create in MySQL.');

    // Funzione di lettura SQLite
    const sqliteAll = (sql) => new Promise((resolve, reject) => {
        sqliteDb.all(sql, [], (err, rows) => {
            if (err) reject(err);
            else resolve(rows);
        });
    });

    console.log('\n📦 Trasferimento dati da SQLite a MySQL...');
    const tablesToMigrate = Object.keys(tableSchemas);

    for (const table of tablesToMigrate) {
        // Svuota tabella MySQL prima della copia per garantire coerenza
        await mysqlConnection.query(`TRUNCATE TABLE ${table}`);
        const rows = await sqliteAll(`SELECT * FROM ${table}`);

        if (rows.length > 0) {
            const columns = Object.keys(rows[0]);
            const placeholders = columns.map(() => '?').join(', ');
            const insertSql = `INSERT INTO ${table} (\`${columns.join('`, `')}\`) VALUES (${placeholders})`;

            for (const row of rows) {
                const values = columns.map(col => row[col]);
                await mysqlConnection.query(insertSql, values);
            }
            console.log(`  ✓ ${table}: ${rows.length} record migrati.`);
        } else {
            console.log(`  - ${table}: 0 record.`);
        }
    }

    await mysqlConnection.query('SET FOREIGN_KEY_CHECKS = 1;');
    console.log('\n🔒 Vincoli FOREIGN_KEY_CHECKS riattivati.');

    // Verifica finale
    console.log('\n🔍 Riepilogo Verifica di Coerenza:');
    let totalSqlite = 0;
    let totalMysql = 0;

    for (const table of tablesToMigrate) {
        const sqCountRes = await sqliteAll(`SELECT COUNT(*) as c FROM ${table}`);
        const sqCount = sqCountRes[0].c;
        const [myCountRows] = await mysqlConnection.query(`SELECT COUNT(*) as c FROM ${table}`);
        const myCount = myCountRows[0].c;

        totalSqlite += sqCount;
        totalMysql += myCount;

        const match = sqCount === myCount ? 'OK ✅' : 'MISMATCH ⚠️';
        console.log(`  • ${table.padEnd(20)}: SQLite=${sqCount} | MySQL=${myCount} -> ${match}`);
    }

    console.log(`\n🎉 Migrazione completata con successo! Totale record: ${totalMysql}/${totalSqlite}`);

    await mysqlConnection.end();
    sqliteDb.close();
}

migrate().catch(err => {
    console.error('❌ Errore durante la migrazione:', err);
    process.exit(1);
});
