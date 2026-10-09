const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('condominio.db');
db.serialize(() => {
    db.run("UPDATE users SET two_factor_enabled = 0", [], (err) => {
        if (err) console.error(err);
        else console.log("2FA disabled for all users.");
    });
});
