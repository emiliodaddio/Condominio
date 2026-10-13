const mysql = require('mysql2/promise');

async function migrate() {
    console.log('🚀 Avvio migrazione da MySQL Locale a TiDB Cloud (condominio_db)...');

    // Connessione Locale
    const localConn = await mysql.createConnection({
        host: '127.0.0.1',
        port: 3306,
        user: 'root',
        password: '',
        database: 'condominio_db'
    });
    console.log('✅ Connesso al MySQL Locale.');

    // Connessione TiDB Cloud
    const tidbConn = await mysql.createConnection({
        host: 'gateway01.ap-northeast-1.prod.aws.tidbcloud.com',
        port: 4000,
        user: '2u7FVvX2nvc9Ao9.root',
        password: 'l91ZwovpJHHuOWkj',
        ssl: {
            minVersion: 'TLSv1.2',
            rejectUnauthorized: true
        },
        multipleStatements: true
    });
    console.log('✅ Connesso a TiDB Cloud.');

    await tidbConn.query(`CREATE DATABASE IF NOT EXISTS condominio_db CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;`);
    await tidbConn.changeUser({ database: 'condominio_db' });
    console.log('✅ Database condominio_db selezionato su TiDB Cloud.');

    await tidbConn.query('SET FOREIGN_KEY_CHECKS = 0;');

    // Recupera lista tabelle da MySQL Locale
    const [tablesRes] = await localConn.query(`SHOW FULL TABLES WHERE Table_type = 'BASE TABLE'`);
    const tableNames = tablesRes.map(row => Object.values(row)[0]);
    console.log(`📋 Tabelle trovate in locale (${tableNames.length}):`, tableNames.join(', '));

    for (const table of tableNames) {
        // Estrai DDL da locale
        const [showCreate] = await localConn.query(`SHOW CREATE TABLE \`${table}\``);
        const createSql = showCreate[0]['Create Table'];

        // Crea tabella su TiDB
        await tidbConn.query(`DROP TABLE IF EXISTS \`${table}\``);
        await tidbConn.query(createSql);

        // Estrai dati da locale
        const [rows] = await localConn.query(`SELECT * FROM \`${table}\``);

        if (rows.length > 0) {
            const columns = Object.keys(rows[0]);
            const placeholders = columns.map(() => '?').join(', ');
            const insertSql = `INSERT INTO \`${table}\` (\`${columns.join('`, `')}\`) VALUES (${placeholders})`;

            for (const row of rows) {
                const values = columns.map(col => row[col]);
                await tidbConn.query(insertSql, values);
            }
            console.log(`  ✓ ${table}: ${rows.length} record copiati in TiDB.`);
        } else {
            console.log(`  - ${table}: 0 record.`);
        }
    }

    await tidbConn.query('SET FOREIGN_KEY_CHECKS = 1;');
    console.log('\n🔒 Vincoli FOREIGN_KEY_CHECKS riattivati su TiDB.');

    // Verifica finale
    console.log('\n🔍 Riepilogo Verifica di Coerenza TiDB:');
    let totalLocal = 0;
    let totalTiDB = 0;

    for (const table of tableNames) {
        const [locCountRows] = await localConn.query(`SELECT COUNT(*) as c FROM \`${table}\``);
        const locCount = locCountRows[0].c;
        const [tidbCountRows] = await tidbConn.query(`SELECT COUNT(*) as c FROM \`${table}\``);
        const tidbCount = tidbCountRows[0].c;

        totalLocal += locCount;
        totalTiDB += tidbCount;

        const match = locCount === tidbCount ? 'OK ✅' : 'MISMATCH ⚠️';
        console.log(`  • ${table.padEnd(22)}: Locale=${locCount} | TiDB=${tidbCount} -> ${match}`);
    }

    console.log(`\n🎉 Migrazione completata con successo! Totale record TiDB: ${totalTiDB}/${totalLocal}`);

    await localConn.end();
    await tidbConn.end();
}

migrate().catch(err => {
    console.error('❌ Errore durante la migrazione:', err);
    process.exit(1);
});
