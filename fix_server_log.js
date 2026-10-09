const fs = require('fs');
let code = fs.readFileSync('server.js', 'utf8');

// 1. Add table creation
const createTableIdx = code.indexOf('db.run(`CREATE TABLE IF NOT EXISTS assemblies');
const createTableStr = `        db.run(\`CREATE TABLE IF NOT EXISTS convocations_log (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            condominio_id INTEGER NOT NULL,
            user_id INTEGER,
            destinatario TEXT,
            email TEXT,
            data_invio DATETIME DEFAULT CURRENT_TIMESTAMP,
            preview_url TEXT
        )\`);\n`;

if (createTableIdx !== -1) code = code.substring(0, createTableIdx) + createTableStr + code.substring(createTableIdx);

// 2. Modify send-convocation endpoint to accept userId and insert log
const endpointStart = code.indexOf("app.post('/api/assemblies/send-convocation'");
const endpointEnd = code.indexOf("});", endpointStart) + 3;

const newEndpoint = `app.post('/api/assemblies/send-convocation', authenticateToken, requireCondominio, isAdmin, async (req, res) => {
    const { userId, email, nome, htmlContent, activeCondoName } = req.body;
    
    if (!email) {
        return res.status(400).json({ success: false, message: 'Nessuna email associata a questo condomino.' });
    }

    let browser;
    try {
        if (!transporter) throw new Error("Servizio email non pronto");
        
        console.log("Generazione PDF in corso...");
        browser = await puppeteer.launch();
        const page = await browser.newPage();
        await page.setContent(htmlContent, { waitUntil: 'networkidle0' });
        const pdfBuffer = await page.pdf({ 
            format: 'A4', 
            printBackground: true,
            margin: { top: '30px', bottom: '30px', left: '30px', right: '30px' }
        });
        await browser.close();
        
        console.log("Invio email con allegato PDF...");
        let info = await transporter.sendMail({
            from: '"Amministrazione Condominio" <admin@condominio.it>',
            to: email,
            subject: 'Convocazione Assemblea Condominiale - ' + activeCondoName,
            html: '<p>Gent.le <b>' + nome + '</b>,</p><p>In allegato alla presente trova la lettera ufficiale di convocazione per la prossima Assemblea Condominiale.</p><p>Restiamo a disposizione per qualsiasi chiarimento.<br><br>Cordiali saluti,<br><i>L\\'Amministrazione</i></p>',
            attachments: [
                {
                    filename: 'Convocazione_Assemblea_' + nome.replace(/ /g, '_') + '.pdf',
                    content: pdfBuffer,
                    contentType: 'application/pdf'
                }
            ]
        });

        const previewUrl = nodemailer.getTestMessageUrl(info) || '';
        console.log("o Email Inviata! Anteprima disponibile su: " + previewUrl);
        
        // Log into database
        db.run('INSERT INTO convocations_log (condominio_id, user_id, destinatario, email, preview_url) VALUES (?, ?, ?, ?, ?)', 
            [req.condominio_id, userId, nome, email, previewUrl], 
            function(err) {
                if (err) console.error("Errore salvataggio log:", err);
            }
        );
        
        res.json({ 
            success: true, 
            message: 'Email con allegato PDF inviata con successo!', 
            previewUrl: previewUrl 
        });
    } catch (err) {
        console.error(err);
        if (browser) await browser.close();
        res.status(500).json({ success: false, message: 'Errore invio email' });
    }
});

app.get('/api/assemblies/convocations-log', authenticateToken, requireCondominio, isAdmin, (req, res) => {
    db.all('SELECT * FROM convocations_log WHERE condominio_id = ? ORDER BY data_invio DESC', [req.condominio_id], (err, rows) => {
        if (err) return res.status(500).json({ success: false, error: err.message });
        res.json({ success: true, data: rows || [] });
    });
});
`;

if (endpointStart !== -1) code = code.substring(0, endpointStart) + newEndpoint + code.substring(endpointEnd);
fs.writeFileSync('server.js', code);


