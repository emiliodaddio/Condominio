const fs = require('fs');
let code = fs.readFileSync('server.js', 'utf8');

const anchor = "app.post('/api/assemblies/send-convocation'";
const idx = code.indexOf(anchor);

if (idx !== -1) {
    const newEndpoints = `
// ---------------------------------------------------------
// INVIO RICEVUTA PAGAMENTO
// ---------------------------------------------------------
app.post('/api/quotes/:id/send-receipt', authenticateToken, requireCondominio, isAdmin, async (req, res) => {
    const quoteId = req.params.id;
    const { activeCondoName } = req.body;
    
    try {
        db.get('SELECT q.*, u.nome, u.email, uc.unita FROM quotes q JOIN users u ON q.user_id = u.id JOIN user_condominios uc ON u.id = uc.user_id AND uc.condominio_id = q.condominio_id WHERE q.id = ?', [quoteId], async (err, quote) => {
            if (err || !quote) return res.status(404).json({ success: false, message: 'Quota non trovata' });
            if (!quote.email) return res.status(400).json({ success: false, message: 'Nessuna email per questo condomino' });
            
            if (!transporter) throw new Error("Servizio email non pronto");
            
            let browser;
            try {
                browser = await puppeteer.launch();
                const page = await browser.newPage();
                
                const htmlContent = \`
                    <html>
                    <body style="font-family: Arial; padding: 40px; color: #333;">
                        <h2 style="text-align:center; border-bottom: 2px solid #333; padding-bottom:10px;">AMMINISTRAZIONE CONDOMINIO<br>\${activeCondoName}</h2>
                        <h1 style="text-align:center; color: #16a34a; margin-top:40px;">RICEVUTA DI PAGAMENTO</h1>
                        <p style="text-align:right; margin-bottom:40px;">Data: \${new Date().toLocaleDateString('it-IT')}</p>
                        <p>Si attesta di aver ricevuto dal Sig./Sig.ra <b>\${quote.nome}</b> (Unit�: \${quote.unita || 'N/D'})</p>
                        <p>La somma di: <b style="font-size:24px;">� \${quote.amount.toFixed(2)}</b></p>
                        <p>A titolo di saldo per la seguente causale:</p>
                        <div style="background: #f8fafc; padding: 20px; border: 1px solid #e2e8f0; border-radius: 8px;">
                            <strong>\${quote.title}</strong><br>
                            Tipo Quota: \${quote.type}<br>
                            Scadenza originaria: \${new Date(quote.due_date).toLocaleDateString('it-IT')}
                        </div>
                        <p style="margin-top:50px; text-align:right;">L'Amministratore<br>___________________</p>
                    </body>
                    </html>
                \`;
                
                await page.setContent(htmlContent, { waitUntil: 'networkidle0' });
                const pdfBuffer = await page.pdf({ format: 'A4', printBackground: true });
                await browser.close();
                
                let info = await transporter.sendMail({
                    from: '"Amministrazione Condominio" <admin@condominio.it>',
                    to: quote.email,
                    subject: 'Ricevuta di Pagamento - ' + activeCondoName,
                    html: '<p>Gent.le <b>' + quote.nome + '</b>,</p><p>La ringraziamo per il pagamento effettuato. In allegato trova la ricevuta in formato PDF.</p><p>Cordiali saluti,<br><i>L\\'Amministrazione</i></p>',
                    attachments: [{ filename: 'Ricevuta_Pagamento.pdf', content: pdfBuffer, contentType: 'application/pdf' }]
                });

                const previewUrl = nodemailer.getTestMessageUrl(info) || '';
                
                db.run('INSERT INTO convocations_log (condominio_id, user_id, destinatario, email, preview_url) VALUES (?, ?, ?, ?, ?)', 
                    [req.condominio_id, quote.user_id, 'RICEVUTA: ' + quote.nome, quote.email, previewUrl]);
                
                res.json({ success: true, message: 'Ricevuta inviata con successo!', previewUrl });
            } catch (e) {
                if(browser) await browser.close();
                console.error(e);
                res.status(500).json({ success: false, message: 'Errore generazione PDF' });
            }
        });
    } catch (err) {
        res.status(500).json({ success: false });
    }
});

// ---------------------------------------------------------
// INVIO SOLLECITO PAGAMENTO
// ---------------------------------------------------------
app.post('/api/quotes/:id/send-reminder', authenticateToken, requireCondominio, isAdmin, async (req, res) => {
    const quoteId = req.params.id;
    const { activeCondoName } = req.body;
    
    try {
        db.get('SELECT q.*, u.nome, u.email, uc.unita FROM quotes q JOIN users u ON q.user_id = u.id JOIN user_condominios uc ON u.id = uc.user_id AND uc.condominio_id = q.condominio_id WHERE q.id = ?', [quoteId], async (err, quote) => {
            if (err || !quote) return res.status(404).json({ success: false, message: 'Quota non trovata' });
            if (!quote.email) return res.status(400).json({ success: false, message: 'Nessuna email per questo condomino' });
            
            if (!transporter) throw new Error("Servizio email non pronto");
            
            let browser;
            try {
                browser = await puppeteer.launch();
                const page = await browser.newPage();
                
                const htmlContent = \`
                    <html>
                    <body style="font-family: Arial; padding: 40px; color: #333;">
                        <h2 style="text-align:center; border-bottom: 2px solid #333; padding-bottom:10px;">AMMINISTRAZIONE CONDOMINIO<br>\${activeCondoName}</h2>
                        <h1 style="text-align:center; color: #dc2626; margin-top:40px;">SOLLECITO DI PAGAMENTO</h1>
                        <p style="text-align:right; margin-bottom:40px;">Data: \${new Date().toLocaleDateString('it-IT')}</p>
                        
                        <div style="text-align:right; margin-bottom: 30px;">
                            Spett.le<br>
                            <b>\${quote.nome}</b><br>
                            Unit�: \${quote.unita || 'N/D'}
                        </div>
                        
                        <p>Gentile Cond�mino,</p>
                        <p>Dalla verifica contabile ad oggi effettuata, non ci risulta pervenuto il pagamento relativo alla seguente quota condominiale, ormai <b>scaduta</b>:</p>
                        
                        <div style="background: #fef2f2; padding: 20px; border: 1px solid #fecaca; border-radius: 8px; margin: 20px 0;">
                            <strong>\${quote.title}</strong><br>
                            Importo da saldare: <b style="color:#dc2626; font-size:18px;">� \${quote.amount.toFixed(2)}</b><br>
                            Scaduta il: \${new Date(quote.due_date).toLocaleDateString('it-IT')}
                        </div>
                        
                        <p>La invitiamo a provvedere al saldo nel pi� breve tempo possibile, per consentire la corretta e serena gestione del Condominio.</p>
                        <p>Qualora avesse gi� provveduto al pagamento, La preghiamo di non tenere conto della presente comunicazione.</p>
                        
                        <p style="margin-top:50px; text-align:right;">Distinti saluti,<br>L'Amministratore<br>___________________</p>
                    </body>
                    </html>
                \`;
                
                await page.setContent(htmlContent, { waitUntil: 'networkidle0' });
                const pdfBuffer = await page.pdf({ format: 'A4', printBackground: true });
                await browser.close();
                
                let info = await transporter.sendMail({
                    from: '"Amministrazione Condominio" <admin@condominio.it>',
                    to: quote.email,
                    subject: 'Sollecito di Pagamento Scaduto - ' + activeCondoName,
                    html: '<p>Gent.le <b>' + quote.nome + '</b>,</p><p>Le scriviamo per ricordarLe una scadenza condominiale in sospeso. In allegato trova la lettera formale di sollecito con i dettagli dell\\'importo.</p><p>Cordiali saluti,<br><i>L\\'Amministrazione</i></p>',
                    attachments: [{ filename: 'Sollecito_Pagamento.pdf', content: pdfBuffer, contentType: 'application/pdf' }]
                });

                const previewUrl = nodemailer.getTestMessageUrl(info) || '';
                
                db.run('INSERT INTO convocations_log (condominio_id, user_id, destinatario, email, preview_url) VALUES (?, ?, ?, ?, ?)', 
                    [req.condominio_id, quote.user_id, 'SOLLECITO: ' + quote.nome, quote.email, previewUrl]);
                
                res.json({ success: true, message: 'Sollecito inviato con successo!', previewUrl });
            } catch (e) {
                if(browser) await browser.close();
                console.error(e);
                res.status(500).json({ success: false, message: 'Errore generazione PDF' });
            }
        });
    } catch (err) {
        res.status(500).json({ success: false });
    }
});

// ---------------------------------------------------------
// COMUNICAZIONI LIBERE E CIRCOLARI
// ---------------------------------------------------------
app.post('/api/communications/send', authenticateToken, requireCondominio, isAdmin, async (req, res) => {
    const { userId, subject, message, activeCondoName } = req.body;
    
    if (!subject || !message) {
        return res.status(400).json({ success: false, message: 'Oggetto e Messaggio sono obbligatori' });
    }

    try {
        let query = 'SELECT u.id, u.nome, u.email, uc.unita FROM users u JOIN user_condominios uc ON u.id = uc.user_id WHERE uc.condominio_id = ?';
        let params = [req.condominio_id];
        
        if (userId && userId !== 'all') {
            query += ' AND u.id = ?';
            params.push(userId);
        }
        
        db.all(query, params, async (err, users) => {
            if (err) return res.status(500).json({ success: false });
            
            const validUsers = users.filter(u => u.email);
            if (validUsers.length === 0) return res.status(400).json({ success: false, message: 'Nessun destinatario valido trovato con email.' });

            if (!transporter) return res.status(500).json({ success: false, message: 'Servizio email non configurato' });

            let browser;
            try {
                browser = await puppeteer.launch();
                
                // Formatta il messaggio con br per l'HTML
                const formattedMessage = message.replace(/\\n/g, '<br>');
                
                for (const u of validUsers) {
                    const page = await browser.newPage();
                    const htmlContent = \`
                        <html>
                        <body style="font-family: Arial; padding: 40px; color: #333;">
                            <h2 style="text-align:center; border-bottom: 2px solid #333; padding-bottom:10px;">AMMINISTRAZIONE CONDOMINIO<br>\${activeCondoName}</h2>
                            <p style="text-align:right; margin-bottom:40px;">Data: \${new Date().toLocaleDateString('it-IT')}</p>
                            
                            <div style="text-align:right; margin-bottom: 30px;">
                                Spett.le<br>
                                <b>\${u.nome}</b><br>
                                Unit�: \${u.unita || 'N/D'}
                            </div>
                            
                            <h3 style="margin-bottom: 30px; border-bottom: 1px solid #ccc; padding-bottom:5px;">Oggetto: \${subject}</h3>
                            
                            <div style="line-height: 1.6;">
                                \${formattedMessage}
                            </div>
                            
                            <p style="margin-top:50px; text-align:right;">Cordiali saluti,<br>L'Amministratore<br>___________________</p>
                        </body>
                        </html>
                    \`;
                    
                    await page.setContent(htmlContent, { waitUntil: 'networkidle0' });
                    const pdfBuffer = await page.pdf({ format: 'A4', printBackground: true, margin: { top: '30px', bottom: '30px', left: '30px', right: '30px' } });
                    await page.close();
                    
                    let info = await transporter.sendMail({
                        from: '"Amministrazione Condominio" <admin@condominio.it>',
                        to: u.email,
                        subject: subject + ' - ' + activeCondoName,
                        html: '<p>Gent.le <b>' + u.nome + '</b>,</p><p>In allegato alla presente le trasmettiamo una comunicazione da parte dell\\'Amministrazione.</p>',
                        attachments: [{ filename: 'Comunicazione.pdf', content: pdfBuffer, contentType: 'application/pdf' }]
                    });

                    const previewUrl = nodemailer.getTestMessageUrl(info) || '';
                    
                    db.run('INSERT INTO convocations_log (condominio_id, user_id, destinatario, email, preview_url) VALUES (?, ?, ?, ?, ?)', 
                        [req.condominio_id, u.id, 'COMUNICAZIONE: ' + subject.substring(0, 20), u.email, previewUrl]);
                }
                
                await browser.close();
                res.json({ success: true, message: 'Comunicazioni inviate con successo a ' + validUsers.length + ' cond�mini!' });
                
            } catch (e) {
                if(browser) await browser.close();
                console.error(e);
                res.status(500).json({ success: false, message: 'Errore durante l\\'invio' });
            }
        });
    } catch (e) {
        res.status(500).json({ success: false });
    }
});

`;
    
    if (idx !== -1) code = code.substring(0, idx) + newEndpoints + code.substring(idx);
    fs.writeFileSync('server.js', code);
}


