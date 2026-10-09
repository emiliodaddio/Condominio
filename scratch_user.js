const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('condominio.db');
db.all("SELECT id, email, password_hash FROM users WHERE email='eleonorafinelli@virgilio.it'", [], (err, rows) => {
    console.log(rows);
});
