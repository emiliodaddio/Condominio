const fs = require('fs');
let server = fs.readFileSync('server.js', 'utf8');

const targetForgot = `const nodemailer = require('nodemailer');
                        const url = nodemailer.getTestMessageUrl(info);
                        console.log('🔗 Mail di Reset Password inviata! Anteprima:', url);
                        db.run('INSERT INTO convocations_log (condominio_id, user_id, destinatario, email, preview_url) VALUES (?, ?, ?, ?, ?)', 
                            [0, user.id, 'Reset Password', email, url || '']);`;

const replacementForgot = `const nodemailer = require('nodemailer');
                        const url = nodemailer.getTestMessageUrl(info);
                        console.log('🔗 Mail di Reset Password inviata! Anteprima:', url);
                        db.run('INSERT INTO security_logs (user_id, action) VALUES (?, ?)', 
                            [user.id, \`Richiesta reset (Email di test inviata: <a href="\${url}" target="_blank" class="text-blue-500 underline">Apri Email</a>)\`]);`;

if (server.includes(targetForgot)) {
    server = server.replace(targetForgot, replacementForgot);
    fs.writeFileSync('server.js', server);
    console.log('Forgot password now logs to security logs with link');
} else {
    console.log('Target not found for forgot password modification');
}
