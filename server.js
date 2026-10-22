const fs = require('fs');
const path = require('path');

// Carica variabili da .env (supporta sia locale che Secret Files di Render in /etc/secrets/.env)
const envPaths = [
    path.join(__dirname, '.env'),
    '/etc/secrets/.env',
    path.join(process.cwd(), '.env')
];
envPaths.forEach(envPath => {
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
        } catch (_) {}
    }
});

// ============================================================================
// STABILITÀ & PARACADUTE GLOBALE NODE.JS (ZERO-CRASH / AUTO-HEALING)
// ============================================================================
process.on('uncaughtException', (err) => {
    console.error('🚨 [FATAL ERROR INTERCETTATO - uncaughtException]:', err && (err.stack || err.message || err));
    // Non lascia morire il processo: preserva la disponibilità del server per tutti gli utenti
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('⚠️ [PROMISE REJECTION NON GESTITA]:', reason && (reason.stack || reason.message || reason));
});

const express = require('express');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const cors = require('cors');
const multer = require('multer');
const ExcelJS = require('exceljs');
const speakeasy = require('speakeasy');
const QRCode = require('qrcode');
const nodemailer = require('nodemailer');
const emailService = require('./emailService');
const puppeteer = require('puppeteer');

function getPuppeteerLaunchOptions() {
    const defaultArgs = ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'];
    const options = {
        headless: 'new',
        args: defaultArgs
    };
    if (process.env.PUPPETEER_EXECUTABLE_PATH) {
        options.executablePath = process.env.PUPPETEER_EXECUTABLE_PATH;
    } else if (process.platform === 'win32') {
        const chromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
        const edgePath = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
        if (fs.existsSync(chromePath)) {
            options.executablePath = chromePath;
        } else if (fs.existsSync(edgePath)) {
            options.executablePath = edgePath;
        }
    }
    return options;
}

let transporter = null;
nodemailer.createTestAccount().then(testAccount => {
    transporter = nodemailer.createTransport({
        host: "smtp.ethereal.email",
        port: 587,
        secure: false,
        auth: { user: testAccount.user, pass: testAccount.pass },
    });
    console.log('📧 Servizio email di test (Ethereal) inizializzato.');
}).catch(err => {
    console.warn('Avviso inizializzazione email di test:', err.message);
});

const app = express();
app.set('trust proxy', 1);

app.get('/healthz', (req, res) => res.json({ status: 'ok', service: 'condo-transparent' }));
app.get('/api/health', (req, res) => res.json({ status: 'ok', service: 'condo-transparent' }));

app.get('/api/health-email', (req, res) => {
    const keys = Object.keys(process.env);
    res.json({
        ok: true,
        hasBrevoKey: !!process.env.BREVO_API_KEY,
        brevoKeyPrefix: process.env.BREVO_API_KEY ? process.env.BREVO_API_KEY.slice(0, 12) + '...' : null,
        smtpHost: process.env.SMTP_HOST || null,
        mailFrom: process.env.MAIL_FROM || null,
        nodeEnv: process.env.NODE_ENV || 'development',
        envKeysFound: keys.filter(k => /brevo|smtp|mail|tidb|mysql/i.test(k))
    });
});

app.get('/api/export/accounting-excel', authenticateToken, requireCondominio, isAdmin, checkCondoLicenseWrite, async (req, res) => {
    try {
        const workbook = new ExcelJS.Workbook();
        workbook.creator = 'CondoTransparent';
        
        // Sheet 1: Libro Giornale
        const sheetJournal = workbook.addWorksheet('Libro Giornale');
        sheetJournal.columns = [
            { header: 'ID', key: 'id', width: 8 },
            { header: 'Data', key: 'data', width: 15 },
            { header: 'Descrizione', key: 'descrizione', width: 50 },
            { header: 'Conto/Soggetto', key: 'conto', width: 25 },
            { header: 'Entrate (Dare)', key: 'dare', width: 18 },
            { header: 'Uscite (Avere)', key: 'avere', width: 18 }
        ];
        
        sheetJournal.getColumn('dare').numFmt = '"€"#,##0.00';
        sheetJournal.getColumn('avere').numFmt = '"€"#,##0.00';

        const journalRows = await new Promise((resolve, reject) => {
            db.all('SELECT * FROM journal_entries WHERE condominio_id = ? ORDER BY data DESC', [req.condominio_id], (err, rows) => {
                if (err) reject(err); else resolve(rows);
            });
        });
        
        journalRows.forEach(r => sheetJournal.addRow({
            id: r.id, data: r.data, descrizione: r.descrizione, conto: r.conto || 'N/D', dare: r.dare, avere: r.avere
        }));

        // Sheet 2: Uscite Fornitori (Pagamenti)
        const sheetSuppliers = workbook.addWorksheet('Fatture Fornitori');
        sheetSuppliers.columns = [
            { header: 'Fornitore', key: 'supplier_name', width: 35 },
            { header: 'Categoria', key: 'category', width: 25 },
            { header: 'N. Fattura', key: 'invoice_number', width: 18 },
            { header: 'Importo Totale', key: 'amount', width: 18 },
            { header: 'Liquidato', key: 'paid_amount', width: 18 },
            { header: 'Residuo', key: 'residual', width: 18 },
            { header: 'Stato', key: 'status', width: 18 },
            { header: 'Data Pagamento', key: 'payment_date', width: 18 }
        ];

        sheetSuppliers.getColumn('amount').numFmt = '"€"#,##0.00';
        sheetSuppliers.getColumn('paid_amount').numFmt = '"€"#,##0.00';
        sheetSuppliers.getColumn('residual').numFmt = '"€"#,##0.00';

        const supplierRows = await new Promise((resolve, reject) => {
            db.all('SELECT * FROM supplier_payments WHERE condominio_id = ? ORDER BY payment_date DESC', [req.condominio_id], (err, rows) => {
                if (err) reject(err); else resolve(rows);
            });
        });
        
        supplierRows.forEach(r => {
            const tot = parseFloat(r.amount) || 0;
            const paid = parseFloat(r.paid_amount) || (r.status === 'Pagato' ? tot : 0);
            r.paid_amount = paid;
            r.residual = Math.max(0, tot - paid);
            if (r.status !== 'Pagato' && !r.payment_date) r.payment_date = '-';
            sheetSuppliers.addRow(r);
        });

        // Sheet 3: Entrate Quote (Pagamenti)
        const sheetQuotes = workbook.addWorksheet('Quote Condominiali');
        sheetQuotes.columns = [
            { header: 'Condomino', key: 'condomino_nome', width: 35 },
            { header: 'Titolo', key: 'title', width: 35 },
            { header: 'Scadenza', key: 'due_date', width: 15 },
            { header: 'Importo Quota', key: 'amount', width: 18 },
            { header: 'Versato', key: 'paid_amount', width: 18 },
            { header: 'Residuo', key: 'residual', width: 18 },
            { header: 'Stato', key: 'status', width: 18 },
            { header: 'Data Pagamento', key: 'payment_date', width: 18 }
        ];
        
        sheetQuotes.getColumn('amount').numFmt = '"€"#,##0.00';
        sheetQuotes.getColumn('paid_amount').numFmt = '"€"#,##0.00';
        sheetQuotes.getColumn('residual').numFmt = '"€"#,##0.00';

        const quoteRows = await new Promise((resolve, reject) => {
            db.all(`SELECT q.*, p.nome as persona_nome, p.cognome as persona_cognome 
                   FROM quotes q 
                   LEFT JOIN anagrafica_persone p ON q.persona_id = p.id 
                   WHERE q.condominio_id = ? ORDER BY q.due_date ASC`, [req.condominio_id], (err, rows) => {
                if (err) reject(err); else resolve(rows);
            });
        });
        
        quoteRows.forEach(r => {
            const tot = parseFloat(r.amount) || 0;
            const paid = parseFloat(r.paid_amount) || (r.status === 'Pagato' ? tot : 0);
            r.condomino_nome = r.persona_cognome ? r.persona_cognome + ' ' + r.persona_nome : 'Sconosciuto';
            r.paid_amount = paid;
            r.residual = Math.max(0, tot - paid);
            if (r.status !== 'Pagato' && !r.payment_date) r.payment_date = '-';
            sheetQuotes.addRow(r);
        });

        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', 'attachment; filename=' + 'Bilancio_Condominiale.xlsx');

        await workbook.xlsx.write(res);
        res.end();
    } catch (err) {
        console.error(err);
        res.status(500).send('Errore Generazione Excel');
    }
});

// ============================================================================
// EXPORT LIBRO GIORNALE & SITUAZIONE CONTABILE (EXCEL & PDF)
// ============================================================================
app.get('/api/export/journal-excel', authenticateToken, requireCondominio, async (req, res) => {
    try {
        const condo = await new Promise((resolve, reject) => {
            db.get('SELECT * FROM condominios WHERE id = ?', [req.condominio_id], (err, row) => {
                if (err) reject(err); else resolve(row || {});
            });
        });

        const workbook = new ExcelJS.Workbook();
        workbook.creator = 'CondoTransparent';
        workbook.created = new Date();

        const sheet = workbook.addWorksheet('Libro Giornale & Bilancio', {
            views: [{ showGridLines: true }]
        });

        // Intestazione Condominio
        sheet.mergeCells('A1:H1');
        sheet.getCell('A1').value = (condo.nome || 'CONDOMINIO').toUpperCase() + ' - LIBRO GIORNALE & SITUAZIONE CONTABILE';
        sheet.getCell('A1').font = { size: 14, bold: true, color: { argb: 'FFFFFFFF' } };
        sheet.getCell('A1').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E293B' } };
        sheet.getCell('A1').alignment = { vertical: 'middle', horizontal: 'center' };
        sheet.getRow(1).height = 30;

        sheet.mergeCells('A2:H2');
        const adminStr = condo.admin_nome ? ` | Amm.re: ${condo.admin_titolo || ''} ${condo.admin_cognome || ''} ${condo.admin_nome || ''} (${condo.admin_cellulare || condo.admin_telefono || ''})` : '';
        sheet.getCell('A2').value = `Indirizzo: ${condo.indirizzo || 'N/D'} | C.F.: ${condo.cf || 'N/D'}${adminStr} | Estratto il: ${new Date().toLocaleDateString('it-IT')}`;
        sheet.getCell('A2').font = { size: 9, italic: true, color: { argb: 'FF64748B' } };
        sheet.getCell('A2').alignment = { vertical: 'middle', horizontal: 'center' };
        sheet.getRow(2).height = 20;

        // Recupera scritture contabili
        const entries = await new Promise((resolve, reject) => {
            db.all('SELECT * FROM journal_entries WHERE condominio_id = ? ORDER BY data ASC, id ASC', [req.condominio_id], (err, rows) => {
                if (err) reject(err); else resolve(rows || []);
            });
        });

        let totDare = 0;
        let totAvere = 0;
        entries.forEach(e => {
            totDare += parseFloat(e.dare || 0);
            totAvere += parseFloat(e.avere || 0);
        });
        const saldoCassa = totDare - totAvere;

        // Quadro di Sintesi Finanziaria (Righe 4 e 5)
        sheet.getCell('B4').value = 'ENTRATE TOTALI (DARE)';
        sheet.getCell('B4').font = { size: 9, bold: true, color: { argb: 'FF047857' } };
        sheet.getCell('B5').value = totDare;
        sheet.getCell('B5').font = { size: 12, bold: true, color: { argb: 'FF047857' } };
        sheet.getCell('B5').numFmt = '"€" #,##0.00';

        sheet.getCell('D4').value = 'USCITE TOTALI (AVERE)';
        sheet.getCell('D4').font = { size: 9, bold: true, color: { argb: 'FFE11D48' } };
        sheet.getCell('D5').value = totAvere;
        sheet.getCell('D5').font = { size: 12, bold: true, color: { argb: 'FFE11D48' } };
        sheet.getCell('D5').numFmt = '"€" #,##0.00';

        sheet.getCell('F4').value = 'SALDO DI CASSA (AVANZO/DISAVANZO)';
        sheet.getCell('F4').font = { size: 9, bold: true, color: { argb: saldoCassa >= 0 ? 'FF047857' : 'FFE11D48' } };
        sheet.getCell('F5').value = saldoCassa;
        sheet.getCell('F5').font = { size: 12, bold: true, color: { argb: saldoCassa >= 0 ? 'FF047857' : 'FFE11D48' } };
        sheet.getCell('F5').numFmt = '"€" #,##0.00';

        sheet.getCell('H4').value = 'MOVIMENTI';
        sheet.getCell('H4').font = { size: 9, bold: true, color: { argb: 'FF475569' } };
        sheet.getCell('H5').value = entries.length;
        sheet.getCell('H5').font = { size: 12, bold: true, color: { argb: 'FF0F172A' } };

        // Intestazione Tabella (Riga 7)
        sheet.getRow(7).values = [
            'N° Reg.',
            'Data',
            'Tipo Scrittura',
            'Conto / Soggetto',
            'Descrizione Operazione',
            'Entrate (Dare)',
            'Uscite (Avere)',
            'Saldo Progressivo'
        ];
        sheet.getRow(7).font = { bold: true, color: { argb: 'FFFFFFFF' } };
        sheet.getRow(7).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF334155' } };
        sheet.getRow(7).alignment = { vertical: 'middle', horizontal: 'center' };
        sheet.getRow(7).height = 24;

        sheet.columns = [
            { key: 'num', width: 12 },
            { key: 'data', width: 14 },
            { key: 'tipo', width: 22 },
            { key: 'conto', width: 28 },
            { key: 'descrizione', width: 45 },
            { key: 'dare', width: 18 },
            { key: 'avere', width: 18 },
            { key: 'saldo', width: 20 }
        ];

        let runningBalance = 0;
        let rowIndex = 8;
        entries.forEach((e, idx) => {
            const d = parseFloat(e.dare || 0);
            const a = parseFloat(e.avere || 0);
            runningBalance += (d - a);

            const row = sheet.getRow(rowIndex);
            row.values = [
                e.numero && e.numero !== 'AUTO' ? e.numero : (idx + 1),
                e.data ? e.data.slice(0, 10) : '-',
                e.tipo || 'Scrittura Ordinaria',
                e.conto || '-',
                e.descrizione || '-',
                d,
                a,
                runningBalance
            ];

            row.getCell(6).numFmt = '"€" #,##0.00';
            row.getCell(7).numFmt = '"€" #,##0.00';
            row.getCell(8).numFmt = '"€" #,##0.00';

            row.getCell(1).alignment = { horizontal: 'center' };
            row.getCell(2).alignment = { horizontal: 'center' };
            row.getCell(6).font = { color: { argb: d > 0 ? 'FF047857' : 'FF94A3B8' } };
            row.getCell(7).font = { color: { argb: a > 0 ? 'FFE11D48' : 'FF94A3B8' } };
            row.getCell(8).font = { bold: true, color: { argb: runningBalance >= 0 ? 'FF047857' : 'FFE11D48' } };

            if (idx % 2 === 1) {
                row.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF8FAFC' } };
            }
            rowIndex++;
        });

        // Riga di Totale Complessivo
        const totalRow = sheet.getRow(rowIndex);
        totalRow.values = [
            'TOTALE',
            '',
            '',
            '',
            'SOMME COMPLESSIVE DELL\'ESERCIZIO',
            totDare,
            totAvere,
            saldoCassa
        ];
        totalRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
        totalRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0F172A' } };
        totalRow.height = 25;
        totalRow.getCell(6).numFmt = '"€" #,##0.00';
        totalRow.getCell(7).numFmt = '"€" #,##0.00';
        totalRow.getCell(8).numFmt = '"€" #,##0.00';

        const safeCondoName = (condo.nome || 'Condominio').replace(/[^a-zA-Z0-9_\-]/g, '_');
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', `attachment; filename="Libro_Giornale_${safeCondoName}.xlsx"`);

        await workbook.xlsx.write(res);
        res.end();
    } catch(err) {
        console.error('Errore export journal-excel:', err);
        res.status(500).json({ success: false, message: 'Errore durante esportazione Excel del Libro Giornale.' });
    }
});

app.get('/api/export/journal-pdf', authenticateToken, requireCondominio, async (req, res) => {
    let browser;
    try {
        const condo = await new Promise((resolve, reject) => {
            db.get('SELECT * FROM condominios WHERE id = ?', [req.condominio_id], (err, row) => {
                if (err) reject(err); else resolve(row || {});
            });
        });

        const entries = await new Promise((resolve, reject) => {
            db.all('SELECT * FROM journal_entries WHERE condominio_id = ? ORDER BY data ASC, id ASC', [req.condominio_id], (err, rows) => {
                if (err) reject(err); else resolve(rows || []);
            });
        });

        let totDare = 0;
        let totAvere = 0;
        entries.forEach(e => {
            totDare += parseFloat(e.dare || 0);
            totAvere += parseFloat(e.avere || 0);
        });
        const saldoCassa = totDare - totAvere;

        const formatEuro = (num) => '€ ' + (parseFloat(num) || 0).toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
        const formatDateIt = (str) => {
            if (!str) return '-';
            const parts = str.slice(0, 10).split('-');
            return parts.length === 3 ? `${parts[2]}/${parts[1]}/${parts[0]}` : str;
        };

        let runningBalance = 0;
        const rowsHtml = entries.map((e, idx) => {
            const d = parseFloat(e.dare || 0);
            const a = parseFloat(e.avere || 0);
            runningBalance += (d - a);
            const isEven = idx % 2 === 1 ? 'background-color: #f8fafc;' : 'background-color: #ffffff;';
            const num = e.numero && e.numero !== 'AUTO' ? e.numero : (idx + 1);
            return `
                <tr style="${isEven} border-bottom: 1px solid #e2e8f0; font-size: 11px;">
                    <td style="padding: 7px 8px; text-align: center; color: #64748b; font-weight: 600;">${num}</td>
                    <td style="padding: 7px 8px; white-space: nowrap; color: #334155;">${formatDateIt(e.data)}</td>
                    <td style="padding: 7px 8px; color: #475569; font-weight: 600;">${e.tipo || 'Ordinaria'}</td>
                    <td style="padding: 7px 8px; color: #1e293b; font-weight: bold;">${e.conto || '-'}</td>
                    <td style="padding: 7px 8px; color: #334155;">${e.descrizione || '-'}</td>
                    <td style="padding: 7px 8px; text-align: right; color: ${d > 0 ? '#059669' : '#94a3b8'}; font-weight: ${d > 0 ? '700' : '400'};">${d > 0 ? formatEuro(d) : '-'}</td>
                    <td style="padding: 7px 8px; text-align: right; color: ${a > 0 ? '#e11d48' : '#94a3b8'}; font-weight: ${a > 0 ? '700' : '400'};">${a > 0 ? formatEuro(a) : '-'}</td>
                    <td style="padding: 7px 8px; text-align: right; font-weight: 700; color: ${runningBalance >= 0 ? '#059669' : '#e11d48'};">${formatEuro(runningBalance)}</td>
                </tr>
            `;
        }).join('');

        const currentDateStr = new Date().toLocaleDateString('it-IT', { day: '2-digit', month: 'long', year: 'numeric' });
        const adminStr = condo.admin_nome 
            ? `${condo.admin_titolo ? condo.admin_titolo + ' ' : ''}${condo.admin_cognome || ''} ${condo.admin_nome}`.trim()
            : 'Studio di Amministrazione';

        const htmlContent = `
        <!DOCTYPE html>
        <html lang="it">
        <head>
            <meta charset="UTF-8">
            <title>Libro Giornale & Bilancio - ${condo.nome || 'Condominio'}</title>
            <style>
                @page {
                    size: A4 landscape;
                    margin: 12mm 10mm 15mm 10mm;
                }
                body {
                    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
                    color: #0f172a;
                    margin: 0;
                    padding: 0;
                    font-size: 12px;
                    -webkit-print-color-adjust: exact;
                    print-color-adjust: exact;
                }
                .header-table { width: 100%; border-collapse: collapse; margin-bottom: 14px; padding-bottom: 12px; border-bottom: 2px solid #0f172a; }
                table.journal-table { width: 100%; border-collapse: collapse; margin-bottom: 18px; }
                table.journal-table th { background-color: #1e293b; color: #ffffff; font-size: 10px; text-transform: uppercase; letter-spacing: 0.5px; padding: 8px; text-align: left; }
                table.journal-table tr { page-break-inside: avoid; }
            </style>
        </head>
        <body>
            <table class="header-table">
                <tr>
                    <td style="vertical-align: top; width: 60%;">
                        <div style="font-size: 18px; font-weight: 800; color: #0f172a; text-transform: uppercase; margin-bottom: 3px;">
                            ${condo.nome || 'CONDOMINIO'}
                        </div>
                        <div style="font-size: 11px; color: #475569; line-height: 1.4;">
                            ${condo.indirizzo || ''} &bull; C.F.: <b>${condo.cf || 'N/D'}</b><br>
                            Amministrazione: <b>${adminStr}</b> ${condo.admin_cellulare ? '&bull; Tel: ' + condo.admin_cellulare : ''} ${condo.admin_email ? '&bull; ' + condo.admin_email : ''}
                        </div>
                    </td>
                    <td style="vertical-align: top; text-align: right; width: 40%;">
                        <div style="display: inline-block; background-color: #eff6ff; color: #1d4ed8; font-size: 10px; font-weight: 800; padding: 4px 10px; border-radius: 6px; margin-bottom: 4px; text-transform: uppercase; letter-spacing: 0.5px; border: 1px solid #bfdbfe;">
                            Rendiconto di Cassa &bull; Esercizio 2026
                        </div>
                        <div style="font-size: 16px; font-weight: 800; color: #0f172a;">LIBRO GIORNALE</div>
                        <div style="font-size: 10px; color: #64748b;">Emesso in data: <b>${currentDateStr}</b></div>
                    </td>
                </tr>
            </table>

            <!-- Quadro di Sintesi Finanziaria ("Sorta di Bilancio") -->
            <div style="display: table; width: 100%; border-spacing: 10px 0; margin-bottom: 14px;">
                <div style="display: table-cell; width: 25%; background-color: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 8px; padding: 10px 14px;">
                    <div style="font-size: 9px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 4px; color: #166534;">Entrate Totali (Dare)</div>
                    <div style="font-size: 16px; font-weight: 800; color: #15803d;">${formatEuro(totDare)}</div>
                    <div style="font-size: 9px; color: #166534; margin-top: 2px;">Incassi quote & versamenti</div>
                </div>
                <div style="display: table-cell; width: 25%; background-color: #fff1f2; border: 1px solid #fecdd3; border-radius: 8px; padding: 10px 14px;">
                    <div style="font-size: 9px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 4px; color: #9f1239;">Uscite Totali (Avere)</div>
                    <div style="font-size: 16px; font-weight: 800; color: #be123c;">${formatEuro(totAvere)}</div>
                    <div style="font-size: 9px; color: #9f1239; margin-top: 2px;">Pagamenti fornitori & spese</div>
                </div>
                <div style="display: table-cell; width: 25%; background-color: ${saldoCassa >= 0 ? '#f0fdf4' : '#fff1f2'}; border: 1px solid ${saldoCassa >= 0 ? '#bbf7d0' : '#fecdd3'}; border-radius: 8px; padding: 10px 14px;">
                    <div style="font-size: 9px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 4px; color: ${saldoCassa >= 0 ? '#166534' : '#9f1239'};">Saldo Cassa (Avanzo/Disavanzo)</div>
                    <div style="font-size: 16px; font-weight: 800; color: ${saldoCassa >= 0 ? '#15803d' : '#be123c'};">${formatEuro(saldoCassa)}</div>
                    <div style="font-size: 9px; color: ${saldoCassa >= 0 ? '#166534' : '#9f1239'}; margin-top: 2px;">${saldoCassa >= 0 ? 'Avanzo di gestione attivo' : 'Disavanzo di cassa temporaneo'}</div>
                </div>
                <div style="display: table-cell; width: 25%; background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 10px 14px;">
                    <div style="font-size: 9px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 4px; color: #475569;">Scritture Registrate</div>
                    <div style="font-size: 16px; font-weight: 800; color: #0f172a;">${entries.length} Movimenti</div>
                    <div style="font-size: 9px; color: #64748b; margin-top: 2px;">Prima Nota Cassa & Banca</div>
                </div>
            </div>

            <!-- Tabella Dettaglio Movimenti -->
            <table class="journal-table">
                <thead>
                    <tr>
                        <th style="width: 5%; text-align: center;">N°</th>
                        <th style="width: 10%;">Data</th>
                        <th style="width: 15%;">Tipo Scrittura</th>
                        <th style="width: 18%;">Conto / Soggetto</th>
                        <th style="width: 26%;">Descrizione Movimento</th>
                        <th style="width: 9%; text-align: right;">Entrate (Dare)</th>
                        <th style="width: 9%; text-align: right;">Uscite (Avere)</th>
                        <th style="width: 8%; text-align: right;">Saldo Progr.</th>
                    </tr>
                </thead>
                <tbody>
                    ${rowsHtml.length > 0 ? rowsHtml : '<tr><td colspan="8" style="padding: 20px; text-align: center; color: #64748b;">Nessuna registrazione contabile presente nel periodo.</td></tr>'}
                </tbody>
                <tfoot>
                    <tr style="background-color: #0f172a; color: #ffffff; font-weight: bold; font-size: 11px;">
                        <td colspan="5" style="padding: 9px 10px; text-transform: uppercase; letter-spacing: 0.5px;">TOTALE GENERALE RENDICONTO CASSA</td>
                        <td style="padding: 9px 8px; text-align: right; color: #34d399;">${formatEuro(totDare)}</td>
                        <td style="padding: 9px 8px; text-align: right; color: #f87171;">${formatEuro(totAvere)}</td>
                        <td style="padding: 9px 8px; text-align: right; color: ${saldoCassa >= 0 ? '#34d399' : '#f87171'};">${formatEuro(saldoCassa)}</td>
                    </tr>
                </tfoot>
            </table>

            <!-- Note legali e Firma -->
            <table style="width: 100%; border-collapse: collapse; margin-top: 20px; font-size: 10px; color: #64748b; page-break-inside: avoid;">
                <tr>
                    <td style="width: 60%; vertical-align: top; line-height: 1.5;">
                        <p style="margin: 0;"><b>Nota di Trasparenza Contabile:</b> Il presente estratto del Libro Giornale è conforme alle registrazioni cronologiche di cassa/banca effettuate ai sensi dell'art. 1130-bis del Codice Civile.<br>
                        Documento prodotto telematicamente tramite la piattaforma cloud <b>CondoTransparent</b>.</p>
                    </td>
                    <td style="width: 40%; text-align: center; vertical-align: top;">
                        <div style="font-size: 11px; font-weight: bold; color: #1e293b; margin-bottom: 45px;">Timbro e Firma dell'Amministratore</div>
                        <div style="border-bottom: 1px dashed #94a3b8; width: 80%; margin: 0 auto;"></div>
                    </td>
                </tr>
            </table>
        </body>
        </html>
        `;

        browser = await puppeteer.launch(getPuppeteerLaunchOptions());
        const page = await browser.newPage();
        await page.setContent(htmlContent, { waitUntil: 'networkidle0' });
        const pdfBuffer = await page.pdf({
            format: 'A4',
            landscape: true,
            printBackground: true,
            margin: { top: '10mm', bottom: '10mm', left: '10mm', right: '10mm' }
        });
        await browser.close();
        browser = null;

        const safeCondoName = (condo.nome || 'Condominio').replace(/[^a-zA-Z0-9_\-]/g, '_');
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename="Libro_Giornale_${safeCondoName}.pdf"`);
        res.send(pdfBuffer);
    } catch(err) {
        if (browser) {
            try { await browser.close(); } catch(_) {}
        }
        console.error('Errore generazione PDF Libro Giornale:', err);
        res.status(500).json({ success: false, message: 'Errore durante la generazione del PDF: ' + err.message, stack: err.stack });
    }
});

// EXPORT SCHEDA ANAGRAFICA E TECNICA CONDOMINIO (PDF)
app.get('/api/export/scheda-tecnica-pdf', authenticateToken, requireCondominio, async (req, res) => {
    let browser;
    try {
        const condo = await new Promise((resolve, reject) => {
            db.get(`
                SELECT c.*, 
                    (SELECT COUNT(*) FROM unita_immobiliari WHERE condominio_id = c.id) as units_count,
                    (SELECT iban FROM bank_accounts WHERE condominio_id = c.id LIMIT 1) as bank_iban,
                    (SELECT banca FROM bank_accounts WHERE condominio_id = c.id LIMIT 1) as bank_name,
                    (SELECT intestazione FROM bank_accounts WHERE condominio_id = c.id LIMIT 1) as bank_intestazione
                FROM condominios c 
                WHERE c.id = ?
            `, [req.condominio_id], (err, row) => {
                if (err) reject(err); else resolve(row);
            });
        });

        if (!condo) {
            return res.status(404).json({ success: false, message: 'Condominio non trovato.' });
        }

        let collaboratori = [];
        if (condo.admin_collaboratori) {
            try {
                collaboratori = typeof condo.admin_collaboratori === 'string'
                    ? JSON.parse(condo.admin_collaboratori)
                    : condo.admin_collaboratori;
                if (!Array.isArray(collaboratori)) collaboratori = [];
            } catch (_) {
                collaboratori = [];
            }
        }

        const currentDateStr = new Date().toLocaleDateString('it-IT', { day: '2-digit', month: 'long', year: 'numeric' });
        const adminFullName = ((condo.admin_titolo ? condo.admin_titolo + ' ' : '') + (condo.admin_nome || '') + ' ' + (condo.admin_cognome || '')).trim() || '[Dato non fornito]';
        const studioDenom = condo.admin_studio_nome || (condo.admin_nome ? `Studio Amministrativo ${adminFullName}` : '[Dato non fornito]');
        const ibanDisplay = condo.bank_iban || (condo.dati_bancari ? condo.dati_bancari : '[Dato non fornito]');
        const bancaDisplay = condo.bank_name || '[Dato non fornito]';

        let collabsHtml = '';
        if (collaboratori.length > 0) {
            collabsHtml = `
                <div style="margin-top: 15px;">
                    <div style="font-size: 11px; font-weight: bold; color: #334155; text-transform: uppercase; margin-bottom: 6px;">Collaboratori & Referenti di Studio</div>
                    <table style="width: 100%; border-collapse: collapse; font-size: 11px;">
                        <thead>
                            <tr style="background: #f1f5f9; border-bottom: 2px solid #cbd5e1;">
                                <th style="padding: 6px 10px; text-align: left; color: #475569;">Nominativo</th>
                                <th style="padding: 6px 10px; text-align: left; color: #475569;">Ruolo / Reparto</th>
                                <th style="padding: 6px 10px; text-align: left; color: #475569;">Telefono</th>
                                <th style="padding: 6px 10px; text-align: left; color: #475569;">Email</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${collaboratori.map((c, i) => `
                                <tr style="border-bottom: 1px solid #e2e8f0; background: ${i % 2 === 0 ? '#ffffff' : '#f8fafc'};">
                                    <td style="padding: 6px 10px; font-weight: bold; color: #1e293b;">${(c.titolo ? c.titolo + ' ' : '') + (c.nome || '')}</td>
                                    <td style="padding: 6px 10px; color: #475569;">${c.ruolo || '-'}</td>
                                    <td style="padding: 6px 10px; color: #475569;">${c.telefono || '-'}</td>
                                    <td style="padding: 6px 10px; color: #475569;">${c.email || '-'}</td>
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>
                </div>
            `;
        }

        const htmlContent = `
        <!DOCTYPE html>
        <html lang="it">
        <head>
            <meta charset="UTF-8">
            <title>Scheda Anagrafica e Tecnica - ${condo.nome || 'Condominio'}</title>
            <style>
                @page { size: A4 portrait; margin: 12mm 15mm 15mm 15mm; }
                body {
                    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
                    color: #0f172a;
                    margin: 0;
                    padding: 0;
                    background: #ffffff;
                    font-size: 12px;
                    line-height: 1.45;
                }
                .header-table {
                    width: 100%;
                    border-bottom: 3px solid #0284c7;
                    padding-bottom: 12px;
                    margin-bottom: 20px;
                }
                .title {
                    font-size: 20px;
                    font-weight: 800;
                    color: #0f172a;
                    text-transform: uppercase;
                    letter-spacing: 0.5px;
                    margin: 0;
                }
                .subtitle {
                    font-size: 11px;
                    color: #64748b;
                    margin-top: 3px;
                    font-weight: 500;
                }
                .section-header {
                    font-size: 12px;
                    font-weight: 800;
                    color: #0369a1;
                    text-transform: uppercase;
                    letter-spacing: 0.5px;
                    margin-top: 18px;
                    margin-bottom: 8px;
                    padding-bottom: 4px;
                    border-bottom: 1.5px solid #e0f2fe;
                }
                .data-table {
                    width: 100%;
                    border-collapse: collapse;
                    margin-bottom: 8px;
                    border: 1px solid #cbd5e1;
                    border-radius: 6px;
                    overflow: hidden;
                }
                .data-table tr {
                    border-bottom: 1px solid #e2e8f0;
                }
                .data-table tr:last-child {
                    border-bottom: none;
                }
                .data-table td.field-name {
                    width: 38%;
                    background-color: #f8fafc;
                    padding: 7px 12px;
                    font-weight: 700;
                    color: #334155;
                    font-size: 11px;
                    border-right: 1px solid #e2e8f0;
                }
                .data-table td.field-value {
                    width: 62%;
                    padding: 7px 12px;
                    color: #0f172a;
                    font-size: 11px;
                    font-weight: 500;
                }
                .notes-box {
                    background: #f8fafc;
                    border: 1px solid #cbd5e1;
                    border-radius: 6px;
                    padding: 10px 14px;
                    font-size: 11px;
                    color: #334155;
                    margin-top: 6px;
                }
                .footer {
                    margin-top: 25px;
                    padding-top: 12px;
                    border-top: 1px solid #e2e8f0;
                    font-size: 10px;
                    color: #94a3b8;
                    display: flex;
                    justify-content: space-between;
                }
            </style>
        </head>
        <body>
            <table class="header-table">
                <tr>
                    <td>
                        <h1 class="title">Scheda Anagrafica e Tecnica</h1>
                        <div class="subtitle">Fascicolo Ufficiale del Fabbricato &bull; Riferimenti Amministrativi</div>
                    </td>
                    <td style="text-align: right; vertical-align: bottom;">
                        <div style="font-size: 10px; color: #64748b;">Data di emissione</div>
                        <div style="font-size: 12px; font-weight: bold; color: #0f172a;">${currentDateStr}</div>
                    </td>
                </tr>
            </table>

            <!-- 1. DATI GENERALI DEL CONDOMINIO -->
            <div class="section-header">1. DATI GENERALI DEL CONDOMINIO</div>
            <table class="data-table">
                <tr>
                    <td class="field-name">Denominazione Condominio</td>
                    <td class="field-value"><b>${condo.nome || '[Dato non fornito]'}</b></td>
                </tr>
                <tr>
                    <td class="field-name">Indirizzo Completo</td>
                    <td class="field-value">${condo.indirizzo || '[Dato non fornito]'}</td>
                </tr>
                <tr>
                    <td class="field-name">Codice Fiscale Condominio</td>
                    <td class="field-value"><b>${condo.cf || '[Dato non fornito]'}</b></td>
                </tr>
                <tr>
                    <td class="field-name">Codice CIG (se applicabile)</td>
                    <td class="field-value">${condo.cig || '[Dato non fornito]'}</td>
                </tr>
                <tr>
                    <td class="field-name">Numero di Unità Immobiliari</td>
                    <td class="field-value">${condo.units_count && condo.units_count > 0 ? condo.units_count + ' unità censite' : '[Dato non fornito]'}</td>
                </tr>
                ${condo.scala ? `
                <tr>
                    <td class="field-name">Articolazione Stabile (Scale / Piani)</td>
                    <td class="field-value">${condo.scala}</td>
                </tr>` : ''}
            </table>

            <!-- 2. STUDIO & DATI AMMINISTRATORE -->
            <div class="section-header">2. STUDIO & DATI AMMINISTRATORE</div>
            <table class="data-table">
                <tr>
                    <td class="field-name">Nome Studio / Amministratore</td>
                    <td class="field-value"><b>${studioDenom}</b></td>
                </tr>
                <tr>
                    <td class="field-name">Responsabile / Referente</td>
                    <td class="field-value">${adminFullName}</td>
                </tr>
                <tr>
                    <td class="field-name">Indirizzo Studio</td>
                    <td class="field-value">${condo.admin_studio_indirizzo || '[Dato non fornito]'}</td>
                </tr>
                <tr>
                    <td class="field-name">Telefono Fisso</td>
                    <td class="field-value">${condo.admin_telefono || '[Dato non fornito]'}</td>
                </tr>
                <tr>
                    <td class="field-name">Cellulare di Urgenza / Emergenze</td>
                    <td class="field-value"><b style="color: #b91c1c;">${condo.admin_emergenze || condo.admin_cellulare || '[Dato non fornito]'}</b></td>
                </tr>
                <tr>
                    <td class="field-name">Email Studio</td>
                    <td class="field-value">${condo.admin_email || '[Dato non fornito]'}</td>
                </tr>
                <tr>
                    <td class="field-name">Email Dedicata al Condominio</td>
                    <td class="field-value">${condo.admin_email_condominio || condo.admin_email || '[Dato non fornito]'}</td>
                </tr>
                <tr>
                    <td class="field-name">PEC (Posta Elettronica Certificata)</td>
                    <td class="field-value">${condo.admin_pec || '[Dato non fornito]'}</td>
                </tr>
                <tr>
                    <td class="field-name">Sito Web / Portale Condomini</td>
                    <td class="field-value">Piattaforma Web Condominio Trasparente</td>
                </tr>
                <tr>
                    <td class="field-name">Orari di Apertura / Reperibilità</td>
                    <td class="field-value">${condo.admin_orari_ricevimento || (condo.admin_emergenze ? 'Reperibilità urgenze attiva al recapito dedicato' : '[Dato non fornito]')}</td>
                </tr>
            </table>

            ${collabsHtml}

            <!-- 3. DATI BANCARI & ASSICURATIVI -->
            <div class="section-header">3. DATI BANCARI & ASSICURATIVI</div>
            <table class="data-table">
                <tr>
                    <td class="field-name">Istituto Bancario</td>
                    <td class="field-value">${bancaDisplay}</td>
                </tr>
                <tr>
                    <td class="field-name">IBAN del Condominio</td>
                    <td class="field-value"><b style="font-family: monospace; font-size: 11px;">${ibanDisplay}</b></td>
                </tr>
                <tr>
                    <td class="field-name">Compagnia Assicurativa (Polizza Fabbricati)</td>
                    <td class="field-value">${condo.assicurazione_compagnia || '[Dato non fornito]'}</td>
                </tr>
                <tr>
                    <td class="field-name">Numero Polizza</td>
                    <td class="field-value">${condo.assicurazione_polizza || '[Dato non fornito]'}</td>
                </tr>
                <tr>
                    <td class="field-name">Scadenza Polizza</td>
                    <td class="field-value">${condo.assicurazione_scadenza || '[Dato non fornito]'}</td>
                </tr>
            </table>

            <!-- 4. NOTE E SPECIFICHE AGGIUNTIVE -->
            <div class="section-header">4. NOTE E SPECIFICHE AGGIUNTIVE</div>
            <div class="notes-box">
                ${condo.note_fabbricato 
                    ? condo.note_fabbricato 
                    : (condo.admin_ricevimento_note ? condo.admin_ricevimento_note + '<br>' : '') + (condo.scala ? `Complesso condominiale articolato su ${condo.scala}. ` : '') + 'Piattaforma gestionale multi-tenant attiva per il monitoraggio contabile, pagamenti quote, archivio documentale e segnalazione guasti in tempo reale.'}
            </div>

            <div style="margin-top: 35px;">
                <table style="width: 100%;">
                    <tr>
                        <td style="width: 60%; font-size: 10px; color: #64748b; vertical-align: bottom;">
                            Documento generato telematicamente tramite Condominio Trasparente &bull; ${currentDateStr}
                        </td>
                        <td style="width: 40%; text-align: center;">
                            <div style="font-size: 11px; font-weight: bold; color: #1e293b; margin-bottom: 35px;">Timbro e Firma dell'Amministratore</div>
                            <div style="border-bottom: 1px dotted #94a3b8; width: 80%; margin: 0 auto;"></div>
                        </td>
                    </tr>
                </table>
            </div>
        </body>
        </html>
        `;

        browser = await puppeteer.launch(getPuppeteerLaunchOptions());
        const page = await browser.newPage();
        await page.setContent(htmlContent, { waitUntil: 'networkidle0' });
        const pdfBuffer = await page.pdf({
            format: 'A4',
            landscape: false,
            printBackground: true,
            margin: { top: '12mm', bottom: '12mm', left: '15mm', right: '15mm' }
        });
        await browser.close();
        browser = null;

        const safeCondoName = (condo.nome || 'Condominio').replace(/[^a-zA-Z0-9_\-]/g, '_');
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename="Scheda_Tecnica_${safeCondoName}.pdf"`);
        res.send(pdfBuffer);
    } catch(err) {
        if (browser) {
            try { await browser.close(); } catch(_) {}
        }
        console.error('Errore generazione PDF Scheda Tecnica:', err);
        res.status(500).json({ success: false, message: 'Errore durante la generazione del PDF: ' + err.message });
    }
});

const PORT = process.env.PORT || 3000;
const JWT_SECRET = 'chiave_segreta_condominio_sicura_123!';

app.use(cors());
app.use(express.json({ limit: '15mb' }));
app.use(express.urlencoded({ extended: true, limit: '15mb' }));

// Disabilita completamente il caching dei file statici e delle risposte per evitare problemi di cache del browser
app.use((req, res, next) => {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    res.setHeader('Surrogate-Control', 'no-store');
    next();
});

app.use(express.static(path.join(__dirname, 'public'), {
    etag: false,
    lastModified: false,
    maxAge: 0
}));

// Assicura l'esistenza della cartella uploads
const uploadDir = path.join(__dirname, 'public', 'uploads');
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
}

// Configurazione Multer
const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, uploadDir),
    filename: (req, file, cb) => cb(null, Date.now() + '-' + Math.round(Math.random() * 1E9) + path.extname(file.originalname))
});
const upload = multer({
    storage, limits: { fileSize: 10 * 1024 * 1024 },
    fileFilter: (req, file, cb) => {
        const allowedTypes = /pdf|jpg|jpeg|png/;
        if (allowedTypes.test(path.extname(file.originalname).toLowerCase()) && allowedTypes.test(file.mimetype)) {
            return cb(null, true);
        }
        cb(new Error('Solo PDF o Immagini (JPG, PNG) sono permessi!'));
    }
});

// Database (Supporta sia MySQL che SQLite tramite ./db.js)
const db = require('./db');

function initDatabase() {
    ensurePartialPaymentColumns();
    ensureAnagraficaAndUnitaColumns();
    ensureCondoDocumentsTable();
    selfHealCondoData();
    if (db.type === 'mysql') {
        console.log('✅ Inizializzazione schema MySQL verificata.');
        return;
    }
    db.serialize(() => {
        db.run('PRAGMA foreign_keys = ON');

        // SUPERADMIN / USERS GLOBALI (con campi 2FA e backup codes)
        db.run(`CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            nome TEXT NOT NULL,
            email TEXT UNIQUE NOT NULL,
            password_hash TEXT NOT NULL,
            is_superadmin BOOLEAN DEFAULT 0,
            two_factor_secret TEXT,
            two_factor_enabled BOOLEAN DEFAULT 0,
            privacy_accepted BOOLEAN DEFAULT 0,
            privacy_accepted_at DATETIME,
            backup_codes TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )`, () => {
            // Migrazione fail-safe per tabelle esistenti
            db.run(`ALTER TABLE users ADD COLUMN two_factor_secret TEXT`, () => {});
            db.run(`ALTER TABLE users ADD COLUMN two_factor_enabled BOOLEAN DEFAULT 0`, () => {});
            db.run(`ALTER TABLE users ADD COLUMN backup_codes TEXT`, () => {});
            db.run(`ALTER TABLE users ADD COLUMN ruolo ENUM('superuser', 'amministratore', 'condomino') NOT NULL DEFAULT 'condomino'`, () => {});
            db.run(`ALTER TABLE users ADD COLUMN is_active TINYINT(1) NOT NULL DEFAULT 1`, () => {});
            db.run(`ALTER TABLE users ADD COLUMN stato_abilitazione ENUM('In attesa', 'Abilitato', 'Sospeso') NOT NULL DEFAULT 'Abilitato'`, () => {});
            db.run(`ALTER TABLE users ADD COLUMN cognome VARCHAR(100) NULL`, () => {});
            db.run(`CREATE TABLE IF NOT EXISTS condomini (
                id INT AUTO_INCREMENT PRIMARY KEY,
                nome VARCHAR(150) NOT NULL,
                indirizzo VARCHAR(255) NOT NULL,
                codice_fiscale VARCHAR(16) NOT NULL UNIQUE,
                amministratore_id INT NULL,
                creato_il DATETIME DEFAULT CURRENT_TIMESTAMP,
                CONSTRAINT fk_condomini_amministratore FOREIGN KEY (amministratore_id) REFERENCES users(id) ON DELETE SET NULL ON UPDATE CASCADE
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`, () => {});
            db.run(`CREATE TABLE IF NOT EXISTS condomino_condominio (
                id INT AUTO_INCREMENT PRIMARY KEY,
                condomino_id INT NOT NULL,
                condominio_id INT NOT NULL,
                interno VARCHAR(50) NOT NULL,
                millesimi DECIMAL(6,2) NOT NULL DEFAULT 0.00,
                associato_il TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                UNIQUE KEY unico_condomino_stesso_stabile (condomino_id, condominio_id),
                CONSTRAINT fk_cc_condomino FOREIGN KEY (condomino_id) REFERENCES users(id) ON DELETE CASCADE,
                CONSTRAINT fk_cc_condominio FOREIGN KEY (condominio_id) REFERENCES condomini(id) ON DELETE CASCADE
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`, () => {});
            db.run(`CREATE OR REPLACE VIEW utenti AS SELECT * FROM users`, () => {});
        });

        db.run(`CREATE TABLE IF NOT EXISTS condomino_condominio (
            id INT AUTO_INCREMENT PRIMARY KEY,
            condomino_id INT NOT NULL,
            condominio_id INT NOT NULL,
            interno VARCHAR(50) NOT NULL,
            millesimi DECIMAL(6,2) NOT NULL DEFAULT 0.00,
            associato_il TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            UNIQUE KEY unico_condomino_stesso_stabile (condomino_id, condominio_id)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`, () => {});
        db.run(`ALTER TABLE condomino_condominio MODIFY COLUMN interno VARCHAR(50) NOT NULL`, () => {});

        db.run(`CREATE TABLE IF NOT EXISTS spese_scadenze (
            id INT AUTO_INCREMENT PRIMARY KEY,
            condominio_id INT NOT NULL,
            titolo VARCHAR(255) NOT NULL,
            importo_totale DECIMAL(10,2) NOT NULL,
            data_scadenza DATE NOT NULL,
            creato_il TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            CONSTRAINT fk_spese_condominio FOREIGN KEY (condominio_id) REFERENCES condomini(id) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`, () => {});

        db.run(`CREATE TABLE IF NOT EXISTS pagamenti_condomini (
            id INT AUTO_INCREMENT PRIMARY KEY,
            condomino_id INT NOT NULL,
            spesa_id INT NOT NULL,
            importo_versato DECIMAL(10,2) NOT NULL DEFAULT 0.00,
            data_pagamento TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            ricevuta_codice VARCHAR(50) UNIQUE NOT NULL,
            creato_il TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            CONSTRAINT fk_pagamenti_condomino FOREIGN KEY (condomino_id) REFERENCES users(id) ON DELETE CASCADE,
            CONSTRAINT fk_pagamenti_spesa FOREIGN KEY (spesa_id) REFERENCES spese_scadenze(id) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`, () => {});
        db.run(`ALTER TABLE pagamenti_condomini ADD COLUMN ricevuta_codice VARCHAR(50) UNIQUE NULL`, () => {});


        // UNITA IMMOBILIARI E MILLESIMI
        db.run(`CREATE TABLE IF NOT EXISTS anagrafica_persone (
            cellulare TEXT,
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            condominio_id INTEGER NOT NULL,
            nome TEXT NOT NULL,
            cognome TEXT NOT NULL,
            codice_fiscale TEXT,
            telefono TEXT,
            email TEXT,
            ruolo_default TEXT DEFAULT 'Proprietario',
            notes TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )`);
        
        // Aggiungi colonne anagrafica residenti e unita
        db.run("ALTER TABLE anagrafica_persone ADD COLUMN cellulare TEXT", (err) => { /* ignora se esiste */ });
        db.run("ALTER TABLE anagrafica_persone ADD COLUMN data_nascita TEXT", (err) => { /* ignora se esiste */ });
        db.run("ALTER TABLE anagrafica_persone ADD COLUMN luogo_nascita TEXT", (err) => { /* ignora se esiste */ });
        db.run("ALTER TABLE anagrafica_persone ADD COLUMN residenza TEXT", (err) => { /* ignora se esiste */ });
        db.run("ALTER TABLE anagrafica_persone ADD COLUMN pec TEXT", (err) => { /* ignora se esiste */ });
        db.run("ALTER TABLE unita_immobiliari ADD COLUMN proprietario_id INTEGER", (err) => { /* ignora se esiste */ });
        db.run("ALTER TABLE unita_immobiliari ADD COLUMN conduttore_id INTEGER", (err) => { /* ignora se esiste */ });
        db.run("ALTER TABLE unita_immobiliari ADD COLUMN dati_catastali TEXT", (err) => { /* ignora se esiste */ });
        db.run("ALTER TABLE unita_immobiliari ADD COLUMN interno TEXT", (err) => { /* ignora se esiste */ });

        db.run(`CREATE TABLE IF NOT EXISTS unita_immobiliari (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            condominio_id INTEGER NOT NULL,
            user_id INTEGER, 
            tipo TEXT DEFAULT 'Appartamento',
            identificativo TEXT NOT NULL,
            scala TEXT,
            piano TEXT,
            millesimi_proprieta REAL DEFAULT 0,
            millesimi_scale REAL DEFAULT 0,
            millesimi_ascensore REAL DEFAULT 0,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY(condominio_id) REFERENCES condominios(id) ON DELETE CASCADE,
            FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE SET NULL
        )`, () => {
            // Seed initial data if empty
            db.get('SELECT COUNT(*) as count FROM unita_immobiliari', (err, row) => {
                if (!err && row.count === 0) {
                    db.run("INSERT INTO unita_immobiliari (condominio_id, user_id, identificativo, millesimi_proprieta) VALUES (1, 3, 'Int. 1', 250.00)");
                    db.run("INSERT INTO unita_immobiliari (condominio_id, user_id, identificativo, millesimi_proprieta) VALUES (1, 4, 'Int. 2', 300.50)");
                    db.run("INSERT INTO unita_immobiliari (condominio_id, user_id, identificativo, millesimi_proprieta) VALUES (2, 4, 'Int. 10', 150.00)");
                }
            });
        });

        // CONDOMINI
        db.run(`CREATE TABLE IF NOT EXISTS condominios (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            nome TEXT NOT NULL,
            indirizzo TEXT NOT NULL,
            cf TEXT,
            scala TEXT,
            piano TEXT,
            dati_bancari TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )`);

        // USER_CONDOMINIOS (Mapping Utente <-> Condominio)
        db.run(`CREATE TABLE IF NOT EXISTS user_condominios (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            condominio_id INTEGER NOT NULL,
            role TEXT NOT NULL CHECK(role IN ('admin', 'condomino')),
            unita TEXT,
            FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE,
            FOREIGN KEY(condominio_id) REFERENCES condominios(id) ON DELETE CASCADE,
            UNIQUE(user_id, condominio_id)
        )`);

        // QUOTES
        db.run(`CREATE TABLE IF NOT EXISTS quotes (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            condominio_id INTEGER NOT NULL,
            persona_id INTEGER,
            unita_id INTEGER,
            type TEXT CHECK(type IN ('ordinaria', 'straordinaria')),
            title TEXT NOT NULL,
            due_date TEXT NOT NULL,
            amount REAL NOT NULL,
            description TEXT,
            status TEXT DEFAULT 'In sospeso' CHECK(status IN ('In sospeso', 'Pagato')),
            payment_date TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY(condominio_id) REFERENCES condominios(id) ON DELETE CASCADE,
            FOREIGN KEY(persona_id) REFERENCES anagrafica_persone(id) ON DELETE CASCADE,
            FOREIGN KEY(unita_id) REFERENCES unita_immobiliari(id) ON DELETE SET NULL
        )`);

        // SUPPLIER PAYMENTS
        db.run(`CREATE TABLE IF NOT EXISTS supplier_payments (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            condominio_id INTEGER NOT NULL,
            supplier_name TEXT NOT NULL,
            category TEXT NOT NULL,
            invoice_number TEXT,
            amount REAL NOT NULL,
            payment_date TEXT NOT NULL,
            status TEXT DEFAULT 'Da liquidare' CHECK(status IN ('Pagato', 'In elaborazione', 'Da liquidare')),
            notes TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY(condominio_id) REFERENCES condominios(id) ON DELETE CASCADE
        )`);

        // ASSEMBLIES
                db.run(`CREATE TABLE IF NOT EXISTS security_logs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER,
            action TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )`);
        db.run(`CREATE TABLE IF NOT EXISTS convocations_log (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            condominio_id INTEGER NOT NULL,
            user_id INTEGER,
            destinatario TEXT,
            email TEXT,
            tipo TEXT,
            oggetto TEXT,
            contenuto_html TEXT,
            data_invio DATETIME DEFAULT CURRENT_TIMESTAMP,
            preview_url TEXT
        )`);
db.run(`CREATE TABLE IF NOT EXISTS assemblies (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            condominio_id INTEGER NOT NULL,
            type TEXT CHECK(type IN ('Ordinaria', 'Straordinaria')),
            title TEXT NOT NULL,
            date TEXT NOT NULL,
            time TEXT NOT NULL,
            location TEXT NOT NULL,
            agenda TEXT NOT NULL,
            meeting_link TEXT,
            is_past BOOLEAN DEFAULT 0,
            minutes_summary TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY(condominio_id) REFERENCES condominios(id) ON DELETE CASCADE
        )`);

        // TICKETS
        db.run(`CREATE TABLE IF NOT EXISTS tickets (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            condominio_id INTEGER NOT NULL,
            user_id INTEGER NOT NULL,
            category TEXT NOT NULL,
            title TEXT NOT NULL,
            description TEXT NOT NULL,
            priority TEXT DEFAULT 'Media' CHECK(priority IN ('Bassa', 'Media', 'Alta', 'Urgente')),
            status TEXT DEFAULT 'Segnalato' CHECK(status IN ('Segnalato', 'Preso in carico', 'In lavorazione', 'Risolto', 'Chiuso')),
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY(condominio_id) REFERENCES condominios(id) ON DELETE CASCADE,
            FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
        )`);

        // TICKET UPDATES
        db.run(`CREATE TABLE IF NOT EXISTS ticket_updates (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            ticket_id INTEGER NOT NULL,
            user_id INTEGER,
            author_name TEXT NOT NULL,
            message TEXT NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (ticket_id) REFERENCES tickets(id) ON DELETE CASCADE,
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
        )`);

        // BANK ACCOUNTS
        db.run(`CREATE TABLE IF NOT EXISTS bank_accounts (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            condominio_id INTEGER NOT NULL,
            banca TEXT NOT NULL,
            iban TEXT NOT NULL,
            intestazione TEXT NOT NULL,
            note TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY(condominio_id) REFERENCES condominios(id) ON DELETE CASCADE
        )`);

        // BANK TRANSACTIONS
        db.run(`CREATE TABLE IF NOT EXISTS bank_transactions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            account_id INTEGER NOT NULL,
            data TEXT NOT NULL,
            importo REAL NOT NULL,
            causale TEXT NOT NULL,
            tipo TEXT NOT NULL CHECK(tipo IN ('Entrata', 'Uscita')),
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (account_id) REFERENCES bank_accounts(id) ON DELETE CASCADE
        )`);

        // JOURNAL ENTRIES (Libro Giornale)
        db.run(`CREATE TABLE IF NOT EXISTS journal_entries (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            condominio_id INTEGER NOT NULL,
            data TEXT NOT NULL,
            numero TEXT,
            tipo TEXT NOT NULL,
            descrizione TEXT NOT NULL,
            dare REAL DEFAULT 0,
            avere REAL DEFAULT 0,
            conto TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY(condominio_id) REFERENCES condominios(id) ON DELETE CASCADE
        )`);

        // AUDIT LOG
        db.run(`CREATE TABLE IF NOT EXISTS audit_log (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            condominio_id INTEGER,
            user_id INTEGER,
            azione TEXT NOT NULL,
            tabella TEXT,
            record_id INTEGER,
            valori_precedenti TEXT,
            ip TEXT,
            timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY(condominio_id) REFERENCES condominios(id) ON DELETE CASCADE,
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
        )`);

        // CONDO FEATURES (Gestione Moduli & Funzioni per Condominio da SuperUser)
        db.run(`CREATE TABLE IF NOT EXISTS condo_features (
            condominio_id INTEGER PRIMARY KEY,
            module_contabilita BOOLEAN DEFAULT 1,
            module_segnalazioni BOOLEAN DEFAULT 1,
            module_assemblee BOOLEAN DEFAULT 1,
            module_comunicazioni BOOLEAN DEFAULT 1,
            module_banca BOOLEAN DEFAULT 1,
            module_anagrafica BOOLEAN DEFAULT 1,
            FOREIGN KEY(condominio_id) REFERENCES condominios(id) ON DELETE CASCADE
        )`, () => {
            db.run(`INSERT OR IGNORE INTO condo_features (condominio_id) SELECT id FROM condominios`);
        });

        // CONDO LICENSES (Gestione Licenze e Abbonamenti SaaS per Condominio)
        db.run(`CREATE TABLE IF NOT EXISTS condo_licenses (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            condominio_id INTEGER NOT NULL UNIQUE,
            plan_type TEXT DEFAULT 'completo',
            license_status TEXT DEFAULT 'active',
            start_date TEXT NOT NULL,
            end_date TEXT NOT NULL,
            payment_status TEXT DEFAULT 'paid',
            payment_reference TEXT,
            payment_amount REAL DEFAULT 240.00,
            payment_date TEXT,
            max_units INTEGER DEFAULT 50,
            notes TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY(condominio_id) REFERENCES condominios(id) ON DELETE CASCADE
        )`, () => {
            // Seed default licenses for existing condomini if not present
            db.all('SELECT id FROM condominios', [], (err, conds) => {
                if (!err && conds && conds.length > 0) {
                    conds.forEach(c => {
                        db.run(`
                            INSERT OR IGNORE INTO condo_licenses 
                            (condominio_id, plan_type, license_status, start_date, end_date, payment_status, payment_reference, payment_amount, payment_date, max_units, notes)
                            VALUES (?, 'completo', 'active', '2026-01-01', '2026-12-31', 'paid', 'Bonifico CRO ' || (840000 + ? * 100), 240.00, '2026-01-02', 50, 'Canone Annuale SaaS 2026')
                        `, [c.id, c.id]);
                    });
                }
            });
        });

        ensurePartialPaymentColumns();
        seedInitialData();
    });
}

function ensureAnagraficaAndUnitaColumns(callback) {
    console.log('🔄 Controllo colonne Anagrafica Persone e Unità Immobiliari (MySQL & SQLite)...');
    const colsToEnsure = [
        { table: 'anagrafica_persone', col: 'data_nascita', defMysql: 'VARCHAR(50)', defSqlite: 'TEXT' },
        { table: 'anagrafica_persone', col: 'luogo_nascita', defMysql: 'VARCHAR(150)', defSqlite: 'TEXT' },
        { table: 'anagrafica_persone', col: 'residenza', defMysql: 'VARCHAR(255)', defSqlite: 'TEXT' },
        { table: 'anagrafica_persone', col: 'cellulare', defMysql: 'VARCHAR(50)', defSqlite: 'TEXT' },
        { table: 'anagrafica_persone', col: 'pec', defMysql: 'VARCHAR(255)', defSqlite: 'TEXT' },
        { table: 'unita_immobiliari', col: 'interno', defMysql: 'VARCHAR(50)', defSqlite: 'TEXT' },
        { table: 'unita_immobiliari', col: 'dati_catastali', defMysql: 'VARCHAR(255)', defSqlite: 'TEXT' },
        { table: 'unita_immobiliari', col: 'proprietario_id', defMysql: 'INT', defSqlite: 'INTEGER' },
        { table: 'unita_immobiliari', col: 'conduttore_id', defMysql: 'INT', defSqlite: 'INTEGER' },
        { table: 'convocations_log', col: 'tipo', defMysql: 'VARCHAR(100)', defSqlite: 'TEXT' },
        { table: 'convocations_log', col: 'oggetto', defMysql: 'VARCHAR(255)', defSqlite: 'TEXT' },
        { table: 'convocations_log', col: 'contenuto_html', defMysql: 'LONGTEXT', defSqlite: 'TEXT' },
        { table: 'condominios', col: 'dati_bancari', defMysql: 'VARCHAR(500)', defSqlite: 'TEXT' },
        { table: 'condominios', col: 'admin_studio_nome', defMysql: 'VARCHAR(255)', defSqlite: 'TEXT' },
        { table: 'condominios', col: 'admin_studio_indirizzo', defMysql: 'VARCHAR(255)', defSqlite: 'TEXT' },
        { table: 'condominios', col: 'admin_orari_ricevimento', defMysql: 'TEXT', defSqlite: 'TEXT' },
        { table: 'condominios', col: 'admin_ricevimento_note', defMysql: 'TEXT', defSqlite: 'TEXT' },
        { table: 'condominios', col: 'admin_collaboratori', defMysql: 'LONGTEXT', defSqlite: 'TEXT' },
        { table: 'condominios', col: 'cig', defMysql: 'VARCHAR(50)', defSqlite: 'TEXT' },
        { table: 'condominios', col: 'admin_email_condominio', defMysql: 'VARCHAR(255)', defSqlite: 'TEXT' },
        { table: 'condominios', col: 'assicurazione_compagnia', defMysql: 'VARCHAR(255)', defSqlite: 'TEXT' },
        { table: 'condominios', col: 'assicurazione_polizza', defMysql: 'VARCHAR(100)', defSqlite: 'TEXT' },
        { table: 'condominios', col: 'assicurazione_scadenza', defMysql: 'VARCHAR(50)', defSqlite: 'TEXT' },
        { table: 'condominios', col: 'note_fabbricato', defMysql: 'TEXT', defSqlite: 'TEXT' }
    ];

    let pending = colsToEnsure.length;
    const checkDone = () => {
        pending--;
        if (pending <= 0 && callback) callback();
    };

    colsToEnsure.forEach(({ table, col, defMysql, defSqlite }) => {
        if (db.type === 'mysql') {
            db.all(`SHOW COLUMNS FROM ${table} LIKE '${col}'`, [], (err, rows) => {
                if (err) {
                    db.run(`ALTER TABLE ${table} ADD COLUMN ${col} ${defMysql}`, () => checkDone());
                    return;
                }
                if (!rows || rows.length === 0) {
                    db.run(`ALTER TABLE ${table} ADD COLUMN ${col} ${defMysql}`, (aErr) => {
                        if (!aErr || aErr.code === 'ER_DUP_FIELDNAME') {
                            console.log(`✅ Colonna ${table}.${col} verificata/aggiunta su MySQL.`);
                        } else {
                            console.warn(`⚠️ ALTER TABLE ${table}.${col}:`, aErr.message);
                        }
                        checkDone();
                    });
                } else {
                    checkDone();
                }
            });
        } else {
            db.all(`PRAGMA table_info(${table})`, [], (err, cols) => {
                if (!err && cols && !cols.some(c => c.name === col)) {
                    db.run(`ALTER TABLE ${table} ADD COLUMN ${col} ${defSqlite}`, () => {
                        console.log(`✅ Colonna ${table}.${col} aggiunta su SQLite.`);
                        checkDone();
                    });
                } else {
                    checkDone();
                }
            });
        }
    });

    // Pulizia identificativi fittizi (es. 'Appartamento 60005') generati da ID persona
    try {
        db.all("SELECT id, identificativo, tipo, interno, scala, piano FROM unita_immobiliari WHERE identificativo LIKE 'Appartamento %' OR identificativo LIKE 'Unità %'", [], (err, rows) => {
            if (!err && rows && rows.length > 0) {
                rows.forEach(r => {
                    if (/^(Appartamento|Unit[àa])\s+\d+$/i.test(r.identificativo)) {
                        let clean = '';
                        if (r.interno) clean = 'Int. ' + r.interno;
                        else if (r.scala || r.piano) {
                            const parts = [];
                            if (r.scala) parts.push('Sc. ' + r.scala);
                            if (r.piano) parts.push('P. ' + r.piano);
                            clean = (r.tipo || 'Appartamento') + ' ' + parts.join(' ');
                        } else {
                            clean = r.tipo || 'Appartamento';
                        }
                        db.run("UPDATE unita_immobiliari SET identificativo = ? WHERE id = ?", [clean, r.id], () => {});
                    }
                });
            }
        });
    } catch(e) {
        console.warn('⚠️ Pulizia identificativi unità:', e.message);
    }

    // Riallineamento rigoroso a "Anagrafica Condominio & Tabelle Millesimali" (anagrafica_persone)
    realignDatabaseToAnagrafica();
}

function realignDatabaseToAnagrafica(condominioId = null, callback = null) {
    if (callback) callback();
    return;

    try {
        const condoFilterQuotes = condominioId ? `AND condominio_id = ${parseInt(condominioId, 10)}` : '';
        const condoFilterUnita = condominioId ? `WHERE u.condominio_id = ${parseInt(condominioId, 10)}` : '';

        // 1. Elimina le quote orfane non associate a una persona presente in Anagrafica Condominio & Tabelle Millesimali
        db.run(`DELETE FROM quotes WHERE (persona_id IS NULL OR persona_id NOT IN (SELECT id FROM anagrafica_persone)) ${condoFilterQuotes}`, () => {
            // 2. Analisi approfondita di tutte le unità per rilevare orfane e duplicati
            db.all(`
                SELECT u.id, u.condominio_id, u.identificativo, u.scala, u.piano, u.interno, 
                       u.millesimi_proprieta, u.proprietario_id, u.conduttore_id,
                       p1.id as p1_id, p2.id as p2_id
                FROM unita_immobiliari u
                LEFT JOIN anagrafica_persone p1 ON u.proprietario_id = p1.id
                LEFT JOIN anagrafica_persone p2 ON u.conduttore_id = p2.id
                ${condoFilterUnita}
                ORDER BY u.id ASC
            `, [], (errU, allUnits) => {
                if (errU || !Array.isArray(allUnits)) {
                    if (callback) callback();
                    return;
                }

                const unitsToDelete = new Set();
                const seenKeys = new Map();

                allUnits.forEach(u => {
                    const hasValidPersona = (u.p1_id !== null && u.p1_id !== undefined) || (u.p2_id !== null && u.p2_id !== undefined);
                    
                    // Se non collegata ad alcuna persona censita nell'anagrafica del condominio -> orfana di test/seed
                    if (!hasValidPersona) {
                        unitsToDelete.add(u.id);
                        return;
                    }

                    // Chiave per duplicati: identificativo normalizzato oppure locazione (scala + piano + interno)
                    const cleanIdent = String(u.identificativo || '').trim().toLowerCase();
                    const cleanScala = String(u.scala || '').trim().toLowerCase();
                    const cleanPiano = String(u.piano || '').trim().toLowerCase();
                    const cleanInterno = String(u.interno || '').trim().toLowerCase();

                    const keyIdent = cleanIdent ? `${u.condominio_id}|ident:${cleanIdent}` : null;
                    const keyLoc = (cleanScala || cleanPiano || cleanInterno)
                        ? `${u.condominio_id}|loc:${cleanScala}|${cleanPiano}|${cleanInterno}`
                        : null;

                    let existingMatchId = null;
                    if (keyIdent && seenKeys.has(keyIdent)) {
                        existingMatchId = seenKeys.get(keyIdent);
                    } else if (keyLoc && seenKeys.has(keyLoc)) {
                        existingMatchId = seenKeys.get(keyLoc);
                    }

                    if (existingMatchId) {
                        // Duplicato rilevato: teniamo quella con millesimi valorizzati > 0 o ID più recente
                        const prevUnit = allUnits.find(x => x.id === existingMatchId);
                        const currMill = parseFloat(u.millesimi_proprieta) || 0;
                        const prevMill = prevUnit ? (parseFloat(prevUnit.millesimi_proprieta) || 0) : 0;

                        if (currMill > 0 && prevMill === 0) {
                            unitsToDelete.add(existingMatchId);
                            if (keyIdent) seenKeys.set(keyIdent, u.id);
                            if (keyLoc) seenKeys.set(keyLoc, u.id);
                        } else {
                            unitsToDelete.add(u.id);
                        }
                    } else {
                        if (keyIdent) seenKeys.set(keyIdent, u.id);
                        if (keyLoc) seenKeys.set(keyLoc, u.id);
                    }
                });

                const deleteIds = Array.from(unitsToDelete);

                const afterUnitsPurged = () => {
                    // Pulizia quote_millesimali orfane (unita non più esistenti)
                    db.run(`DELETE FROM quote_millesimali WHERE unita_id NOT IN (SELECT id FROM unita_immobiliari)`, () => {
                        // Deduplica quote contabili identiche
                        db.all(`SELECT id, condominio_id, persona_id, title, due_date, amount, paid_amount FROM quotes WHERE 1=1 ${condoFilterQuotes} ORDER BY paid_amount DESC, id ASC`, [], (errQ, qRows) => {
                            if (!errQ && Array.isArray(qRows)) {
                                const seenQuotes = new Set();
                                const dupIds = [];
                                qRows.forEach(q => {
                                    const key = `${q.condominio_id}|${q.persona_id}|${(q.title || '').trim().toLowerCase()}|${q.due_date}|${parseFloat(q.amount) || 0}`;
                                    if (seenQuotes.has(key)) {
                                        dupIds.push(q.id);
                                    } else {
                                        seenQuotes.add(key);
                                    }
                                });
                                if (dupIds.length > 0) {
                                    db.run(`DELETE FROM quotes WHERE id IN (${dupIds.join(',')})`, () => {
                                        if (callback) callback();
                                    });
                                    return;
                                }
                            }
                            if (callback) callback();
                        });
                    });
                };

                if (deleteIds.length > 0) {
                    console.log(`🧹 [Riallineamento DB] Rimozione di ${deleteIds.length} unità orfane/duplicate: IDs [${deleteIds.join(', ')}]`);
                    db.run(`DELETE FROM quote_millesimali WHERE unita_id IN (${deleteIds.join(',')})`, () => {
                        db.run(`DELETE FROM unita_immobiliari WHERE id IN (${deleteIds.join(',')})`, () => {
                            afterUnitsPurged();
                        });
                    });
                } else {
                    afterUnitsPurged();
                }
            });
        });
    } catch (e) {
        console.warn('⚠️ realignDatabaseToAnagrafica:', e.message);
        if (callback) callback();
    }
}

function ensurePartialPaymentColumns() {
    console.log('🔄 Controllo schema colonne pagamenti parziali...');
    if (db.type === 'mysql') {
        db.all("SHOW COLUMNS FROM quotes LIKE 'paid_amount'", [], (err, rows) => {
            if (err) console.error('⚠️ Verifica quotes.paid_amount:', err.message);
            if (!err && (!rows || rows.length === 0)) {
                db.run("ALTER TABLE quotes ADD COLUMN paid_amount DOUBLE DEFAULT 0", [], (aErr) => {
                    if (aErr) console.error('⚠️ ALTER TABLE quotes.paid_amount:', aErr.message);
                    else {
                        console.log('✅ Colonna quotes.paid_amount aggiunta con successo.');
                        db.run("UPDATE quotes SET paid_amount = amount WHERE status = 'Pagato'");
                    }
                });
            }
        });
        db.all("SHOW COLUMNS FROM quotes LIKE 'payment_history'", [], (err, rows) => {
            if (err) console.error('⚠️ Verifica quotes.payment_history:', err.message);
            if (!err && (!rows || rows.length === 0)) {
                db.run("ALTER TABLE quotes ADD COLUMN payment_history TEXT", [], (aErr) => {
                    if (aErr) console.error('⚠️ ALTER TABLE quotes.payment_history:', aErr.message);
                    else console.log('✅ Colonna quotes.payment_history aggiunta con successo.');
                });
            }
        });
        db.all("SHOW COLUMNS FROM supplier_payments LIKE 'paid_amount'", [], (err, rows) => {
            if (err) console.error('⚠️ Verifica supplier_payments.paid_amount:', err.message);
            if (!err && (!rows || rows.length === 0)) {
                db.run("ALTER TABLE supplier_payments ADD COLUMN paid_amount DOUBLE DEFAULT 0", [], (aErr) => {
                    if (aErr) console.error('⚠️ ALTER TABLE supplier_payments.paid_amount:', aErr.message);
                    else {
                        console.log('✅ Colonna supplier_payments.paid_amount aggiunta con successo.');
                        db.run("UPDATE supplier_payments SET paid_amount = amount WHERE status = 'Pagato'");
                    }
                });
            }
        });
        db.all("SHOW COLUMNS FROM supplier_payments LIKE 'payment_history'", [], (err, rows) => {
            if (err) console.error('⚠️ Verifica supplier_payments.payment_history:', err.message);
            if (!err && (!rows || rows.length === 0)) {
                db.run("ALTER TABLE supplier_payments ADD COLUMN payment_history TEXT", [], (aErr) => {
                    if (aErr) console.error('⚠️ ALTER TABLE supplier_payments.payment_history:', aErr.message);
                    else console.log('✅ Colonna supplier_payments.payment_history aggiunta con successo.');
                });
            }
        });
    } else {
        db.all("PRAGMA table_info(quotes)", [], (err, cols) => {
            if (!err && cols) {
                if (!cols.some(c => c.name === 'paid_amount')) {
                    db.run("ALTER TABLE quotes ADD COLUMN paid_amount REAL DEFAULT 0", () => {
                        db.run("UPDATE quotes SET paid_amount = amount WHERE status = 'Pagato'");
                    });
                }
                if (!cols.some(c => c.name === 'payment_history')) {
                    db.run("ALTER TABLE quotes ADD COLUMN payment_history TEXT");
                }
            }
        });
        db.all("PRAGMA table_info(supplier_payments)", [], (err, cols) => {
            if (!err && cols) {
                if (!cols.some(c => c.name === 'paid_amount')) {
                    db.run("ALTER TABLE supplier_payments ADD COLUMN paid_amount REAL DEFAULT 0", () => {
                        db.run("UPDATE supplier_payments SET paid_amount = amount WHERE status = 'Pagato'");
                    });
                }
                if (!cols.some(c => c.name === 'payment_history')) {
                    db.run("ALTER TABLE supplier_payments ADD COLUMN payment_history TEXT");
                }
            }
        });
    }
}

function seedInitialData() {
    db.get('SELECT COUNT(*) as count FROM users', (err, row) => {
        if (err || (row && row.count > 0)) return;

        const adminHash = bcrypt.hashSync('AdminPassword123!', 10);
        const userHash = bcrypt.hashSync('CondominoPass123!', 10);

        db.serialize(() => {
            db.run("INSERT INTO users (id, nome, email, password_hash, is_superadmin) VALUES (1, 'Super Admin', 'super@condominio.it', ?, 1)", [adminHash]);
            db.run("INSERT INTO users (id, nome, email, password_hash) VALUES (2, 'Studio Rossi', 'admin@condominio.it', ?)", [adminHash]);
            db.run("INSERT INTO users (id, nome, email, password_hash) VALUES (3, 'Mario Rossi', 'mario@email.it', ?)", [userHash]);
            db.run("INSERT INTO users (id, nome, email, password_hash) VALUES (4, 'Luigi Verdi', 'luigi@email.it', ?)", [userHash]);
            
            db.run("INSERT INTO condominios (id, nome, indirizzo, cf) VALUES (1, 'Condominio Le Ginestre', 'Via Roma 1', '90012345678')");
            db.run("INSERT INTO condominios (id, nome, indirizzo, cf) VALUES (2, 'Condominio I Pini', 'Via Milano 2', '90087654321')");

            db.run("INSERT INTO user_condominios (user_id, condominio_id, role, unita) VALUES (2, 1, 'admin', 'Ufficio')");
            db.run("INSERT INTO user_condominios (user_id, condominio_id, role, unita) VALUES (2, 2, 'admin', 'Ufficio')");
            db.run("INSERT INTO user_condominios (user_id, condominio_id, role, unita) VALUES (3, 1, 'condomino', 'Int. 1')");
            db.run("INSERT INTO user_condominios (user_id, condominio_id, role, unita) VALUES (4, 1, 'condomino', 'Int. 2')");
            db.run("INSERT INTO user_condominios (user_id, condominio_id, role, unita) VALUES (4, 2, 'condomino', 'Int. 10')");
            
            db.run("INSERT INTO quotes (condominio_id, user_id, type, title, due_date, amount, status) VALUES (1, 3, 'ordinaria', 'Rata 1', '2026-03-31', 350.00, 'Pagato')");
            db.run("INSERT INTO quotes (condominio_id, user_id, type, title, due_date, amount, status) VALUES (1, 4, 'ordinaria', 'Rata 1', '2026-03-31', 350.00, 'In sospeso')");
        });
    });
}

initDatabase();

// ==========================================
// MIDDLEWARES
// ==========================================
function authenticateToken(req, res, next) {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    if (!token) return res.status(401).json({ success: false, message: 'Token mancante.' });

    jwt.verify(token, JWT_SECRET, (err, user) => {
        if (err) return res.status(403).json({ success: false, message: 'Token non valido.' });
        req.user = user;
        next();
    });
}

function requireCondominio(req, res, next) {
    if (req.user.is_superadmin) {
        req.condominio_id = req.headers['x-condominio-id'] || null;
        req.role_in_condominio = 'admin'; 
        return next();
    }
    
    const cId = req.headers['x-condominio-id'];
    if (!cId) return res.status(400).json({ success: false, message: 'Condominio non selezionato' });

    db.get('SELECT role FROM user_condominios WHERE user_id = ? AND condominio_id = ?', [req.user.id, cId], (err, row) => {
        if (err) return res.status(500).json({ success: false, error: err.message });
        if (!row) return res.status(403).json({ success: false, message: 'Accesso negato a questo condominio.' });
        
        req.condominio_id = cId;
        req.role_in_condominio = row.role;
        next();
    });
}

function isAdmin(req, res, next) {
    if (req.user.is_superadmin || req.role_in_condominio === 'admin') {
        next();
    } else {
        return res.status(403).json({ success: false, message: 'Operazione riservata all\'amministratore.' });
    }
}

function requireSuperAdmin(req, res, next) {
    if (req.user && (req.user.is_superadmin || req.user.ruolo === 'superuser')) {
        return next();
    }
    return res.status(403).json({ success: false, message: 'Accesso negato: operazione riservata al SuperUser (Proprietario).' });
}

const verifyJWT = authenticateToken;

// ==========================================
// MIDDLEWARE DI CONTROLLO RUOLO SUPERUSER
// ==========================================
const checkSuperuser = (req, res, next) => {
    // Se req.user è già stato popolato dal middleware precedente (es. verifyJWT / authenticateToken)
    if (req.user) {
        const isSuper = req.user.ruolo === 'superuser' || req.user.is_superadmin === 1 || req.user.is_superadmin === true;
        if (!isSuper) {
            return res.status(403).json({ 
                success: false, 
                error: 'Accesso negato: Autorizzazione riservata al Superuser.',
                errore: 'Accesso negato: Autorizzazione riservata al Superuser.' 
            });
        }
        return next();
    }

    // Altrimenti decodifica dal token Bearer
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
        return res.status(401).json({ 
            success: false, 
            error: 'Accesso non autorizzato: token di autenticazione mancante',
            errore: 'Accesso non autorizzato: token di autenticazione mancante' 
        });
    }

    jwt.verify(token, JWT_SECRET, (err, decodedUser) => {
        if (err) {
            return res.status(403).json({ 
                success: false, 
                error: 'Token non valido o sessione scaduta',
                errore: 'Token non valido o sessione scaduta' 
            });
        }

        const isSuper = decodedUser.ruolo === 'superuser' || decodedUser.is_superadmin === 1 || decodedUser.is_superadmin === true;

        if (!isSuper) {
            return res.status(403).json({ 
                success: false, 
                error: 'Accesso negato: Autorizzazione riservata al Superuser.',
                errore: 'Accesso negato: Autorizzazione riservata al Superuser.' 
            });
        }

        req.user = decodedUser;
        next();
    });
};

// ==========================================
// MIDDLEWARE PER VERIFICARE IL RUOLO DI AMMINISTRATORE ABILITATO
// ==========================================
const checkAmministratore = (req, res, next) => {
    if (!req.user) {
        const authHeader = req.headers['authorization'];
        const token = authHeader && authHeader.split(' ')[1];
        if (!token) {
            return res.status(401).json({ success: false, error: 'Token mancante.' });
        }
        return jwt.verify(token, JWT_SECRET, (err, decodedUser) => {
            if (err) return res.status(403).json({ success: false, error: 'Token non valido.' });
            req.user = decodedUser;
            return checkAmministratore(req, res, next);
        });
    }

    const isSuper = req.user.ruolo === 'superuser' || req.user.is_superadmin === 1 || req.user.is_superadmin === true;
    const isActiveAdmin = (req.user.ruolo === 'amministratore' || isSuper) && 
                          (req.user.is_active === 1 || req.user.is_active === true || req.user.is_active === undefined);

    if (!isActiveAdmin) {
        return res.status(403).json({ 
            success: false, 
            error: 'Accesso negato: Richiesto ruolo Amministratore attivo.' 
        });
    }
    next();
};

function computeLicenseInfo(license) {
    if (!license) {
        return {
            plan_type: 'completo',
            license_status: 'active',
            start_date: new Date().toISOString().slice(0, 10),
            end_date: new Date(Date.now() + 365*24*3600*1000).toISOString().slice(0, 10),
            payment_status: 'paid',
            payment_reference: 'Licenza di default',
            payment_amount: 0,
            payment_date: new Date().toISOString().slice(0, 10),
            max_units: 50,
            notes: '',
            days_remaining: 365,
            is_expired: false,
            is_expiring: false,
            is_suspended: false,
            is_read_only: false,
            computed_status: 'active'
        };
    }

    const todayStr = new Date().toISOString().slice(0, 10);
    const today = new Date(todayStr);
    const endDate = new Date(license.end_date || todayStr);
    const diffTime = endDate.getTime() - today.getTime();
    const daysRemaining = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

    const is_suspended = license.license_status === 'suspended';
    const is_expired = is_suspended || daysRemaining < 0;
    const is_expiring = !is_expired && daysRemaining <= 15;
    const is_read_only = is_expired;

    let computed_status = 'active';
    if (is_suspended) computed_status = 'suspended';
    else if (is_expired) computed_status = 'expired';
    else if (is_expiring) computed_status = 'expiring';

    return {
        ...license,
        days_remaining: daysRemaining,
        is_expired,
        is_expiring,
        is_suspended,
        is_read_only,
        computed_status
    };
}

function checkCondoLicenseWrite(req, res, next) {
    const cId = req.condominio_id || req.headers['x-condominio-id'] || req.body?.condominio_id || req.params?.condominio_id;
    if (!cId) return next();

    db.get('SELECT * FROM condo_licenses WHERE condominio_id = ?', [cId], (err, lic) => {
        if (err || !lic) return next();
        const info = computeLicenseInfo(lic);
        if (info.is_read_only) {
            return res.status(403).json({
                success: false,
                is_license_expired: true,
                message: `Operazione bloccata: la licenza per questo condominio è scaduta (il ${lic.end_date}) o sospesa. Il fabbricato è attivo in SOLA LETTURA. Per inserire o modificare dati ed esportare i prospetti in Excel è necessario rinnovare o riattivare la licenza.`
            });
        }
        next();
    });
}

function logAudit(userId, condominioId, azione, tabella, recordId, valoriPrecedenti, ip) {
    db.run(
        `INSERT INTO audit_log (user_id, condominio_id, azione, tabella, record_id, valori_precedenti, ip) VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [userId, condominioId, azione, tabella, recordId, valoriPrecedenti ? JSON.stringify(valoriPrecedenti) : null, ip]
    );
}

// ==========================================
// STEP 1 & 2: API 2FA & AUTH
// ==========================================

app.post('/api/auth/login', (req, res) => {
    const { email, password } = req.body;
    console.log('LOGIN ATTEMPT:', email);
    db.get('SELECT * FROM users WHERE LOWER(email) = LOWER(?)', [email ? email.trim() : ''], (err, user) => {
        if (err) {
            console.error('❌ ERRORE DATABASE LOGIN:', err);
            return res.status(500).json({ 
                success: false, 
                message: 'Errore di connessione al database: ' + (err.message || 'Verifica parametri MySQL') 
            });
        }
        if (!user) {
            logAudit(null, null, 'Login Fallito (Utente non trovato)', 'users', null, null, req.ip);
            return res.status(401).json({ success: false, message: 'Credenziali non valide.' });
        }
        
        if (!bcrypt.compareSync(password, user.password_hash)) {
            logAudit(user.id, null, 'Login Fallito (Password errata)', 'users', user.id, null, req.ip);
            return res.status(401).json({ success: false, message: 'Credenziali non valide.' });
        }

        
        if (!user.two_factor_enabled) {
            logAudit(user.id, null, 'Login Riuscito', 'users', user.id, null, req.ip);
            return issueToken(user, res);
        }

        // FLUSSO B: Codice di Sicurezza 2FA (Accesso Confermato) - Validità 10 minuti
        const otpCode = Math.floor(100000 + Math.random() * 900000).toString();
        const otpExpires = Date.now() + 10 * 60 * 1000; // 10 minuti

        db.run('UPDATE users SET otp_code = ?, otp_expires = ? WHERE id = ?', [otpCode, otpExpires, user.id], async (err) => {
            if (err) {
                console.error('Errore salvataggio OTP:', err);
                return res.status(500).json({ success: false, message: 'Errore salvataggio OTP: ' + err.message });
            }

            try {
                const { previewUrl } = await emailService.sendTwoFactorOtpEmail({
                    email: user.email,
                    nome: user.nome,
                    otpCode
                });

                logAudit(user.id, null, 'Richiesta OTP Login (2FA)', 'users', user.id, null, req.ip);
                return res.json({ 
                    success: true, 
                    requireOTP: true, 
                    userId: user.id, 
                    email: user.email, 
                    previewUrl 
                });
            } catch (e) {
                console.error('Errore invio email OTP:', e);
                return res.status(500).json({ success: false, message: 'Errore invio email OTP' });
            }
        });
    });
});

app.post('/api/auth/login/verify-otp', (req, res) => {
    const { userId, otp } = req.body;
    console.log('OTP VERIFY ATTEMPT:', userId, otp);
    db.get('SELECT * FROM users WHERE id = ?', [userId], (err, user) => {
        if (err || !user) return res.status(401).json({ success: false, message: 'Utente non trovato' });

        if (user.otp_code !== otp) {
            return res.status(401).json({ success: false, message: 'Codice errato.' });
        }
        const expiresTime = user.otp_expires instanceof Date ? user.otp_expires.getTime() : Number(user.otp_expires);
        if (Date.now() > expiresTime) {
            return res.status(401).json({ success: false, message: 'Codice scaduto.' });
        }

        db.run('UPDATE users SET otp_code = NULL, otp_expires = NULL WHERE id = ?', [user.id], () => {
            logAudit(user.id, null, 'Login Riuscito (con OTP)', 'users', user.id, null, req.ip);
            issueToken(user, res);
        });
    });
});


// ==========================================
// REGISTRAZIONE UTENTI (MySQL & SQLite)
// ==========================================
app.get('/api/auth/condominios', (req, res) => {
    db.all('SELECT id, nome, indirizzo, cf, scala FROM condominios ORDER BY nome ASC', [], (err, rows) => {
        if (err) return res.status(500).json({ success: false, message: 'Errore recupero lista condomini' });
        res.json({ success: true, data: rows || [] });
    });
});

app.post('/api/auth/register', (req, res) => {
    const { nome, email, password, telefono, condominio_id, unita } = req.body;

    if (!nome || !email || !password) {
        return res.status(400).json({ success: false, message: 'Nome, email e password sono obbligatori.' });
    }

    const trimmedEmail = email.trim().toLowerCase();
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(trimmedEmail)) {
        return res.status(400).json({ success: false, message: 'Formato email non valido.' });
    }

    const pwdRegex = /^(?=.*[A-Z])(?=.*\d)(?=.*[!@#$%^&*(),.?":{}|<>]).{8,}$/;
    if (!pwdRegex.test(password)) {
        return res.status(400).json({ 
            success: false, 
            message: 'La password deve contenere almeno 8 caratteri, una maiuscola, un numero e un carattere speciale.' 
        });
    }

    const hash = bcrypt.hashSync(password, 10);

    db.run(
        'INSERT INTO users (nome, email, password_hash, telefono) VALUES (?, ?, ?, ?)',
        [nome.trim(), trimmedEmail, hash, telefono ? telefono.trim() : null],
        function (err) {
            if (err) {
                const isDup = err.code === 'ER_DUP_ENTRY' ||
                    (err.message && (err.message.includes('UNIQUE constraint failed') || err.message.includes('Duplicate entry')));
                if (isDup) {
                    return res.status(409).json({ success: false, message: 'Un account con questa email è già registrato.' });
                }
                return res.status(500).json({ success: false, message: 'Errore durante la registrazione sul database.' });
            }

            const newUserId = this.lastID;

            // Se è stato selezionato un condominio, crea subito il collegamento
            if (condominio_id) {
                db.run(
                    'INSERT INTO user_condominios (user_id, condominio_id, role, unita) VALUES (?, ?, ?, ?)',
                    [newUserId, parseInt(condominio_id, 10), 'condomino', unita ? unita.trim() : 'Da assegnare'],
                    (errCondo) => {
                        if (errCondo) console.error('Errore associazione condominio in registrazione:', errCondo);
                    }
                );
            }

            logAudit(newUserId, condominio_id || null, 'Registrazione Portale', 'users', newUserId, null, req.ip);
            db.run('INSERT INTO security_logs (user_id, action) VALUES (?, ?)', [newUserId, 'Registrazione completata sul portale']);

            return res.json({ 
                success: true, 
                message: 'Registrazione completata con successo! Ora puoi accedere.',
                userId: newUserId 
            });
        }
    );
});

// ==========================================
// NUOVO ENDPOINT: Attivazione Account / Primo Accesso da Anagrafica
// ==========================================
app.post('/api/auth/activate-request', (req, res) => {
    const { identifier } = req.body;
    if (!identifier || !identifier.trim()) {
        return res.status(400).json({ success: false, message: 'Inserisci il tuo Codice Fiscale o la tua Email.' });
    }

    const clean = identifier.trim();
    const cleanLower = clean.toLowerCase();
    const cleanUpper = clean.toUpperCase();

    // Cerca in anagrafica_persone per email o codice fiscale
    const query = `
        SELECT ap.*, c.nome as condo_nome 
        FROM anagrafica_persone ap 
        LEFT JOIN condominios c ON ap.condominio_id = c.id 
        WHERE LOWER(ap.email) = ? OR UPPER(ap.codice_fiscale) = ?
        ORDER BY ap.id DESC LIMIT 1
    `;

    db.get(query, [cleanLower, cleanUpper], (err, persona) => {
        if (err) {
            console.error('Errore verifica anagrafica:', err);
            return res.status(500).json({ success: false, message: 'Errore interno del server durante la verifica.' });
        }

        // Se non trovato in anagrafica_persone, controlla se esiste in users
        if (!persona) {
            return db.get('SELECT id, email, nome FROM users WHERE LOWER(email) = ?', [cleanLower], (errU, user) => {
                if (errU || !user) {
                    return res.status(404).json({
                        success: false,
                        message: 'Nessuna anagrafica corrispondente trovata. Contatta lo studio di amministrazione per verificare la registrazione dei tuoi dati.'
                    });
                }
                deliverActivationEmail(user.id, user.email, user.nome, 'CondoTransparent', req, res);
            });
        }

        // Persona trovata in anagrafica_persone
        const targetEmail = (persona.email && persona.email.trim()) ? persona.email.trim() : (clean.includes('@') ? cleanLower : null);

        if (!targetEmail) {
            return res.status(400).json({
                success: false,
                message: `Anagrafica di ${persona.nome} ${persona.cognome} individuata, ma non risulta associata un'email. Comunica il tuo indirizzo email all'amministratore per attivare l'accesso.`
            });
        }

        // Controlla se esiste già un account utente per questa email
        db.get('SELECT id, email, nome FROM users WHERE LOWER(email) = ?', [targetEmail.toLowerCase()], (errUser, existingUser) => {
            if (errUser) return res.status(500).json({ success: false, message: 'Errore durante la verifica dell\'utenza.' });

            const condoTitle = persona.condo_nome || 'CondoTransparent';
            const fullName = `${persona.nome} ${persona.cognome}`.trim();

            if (existingUser) {
                deliverActivationEmail(existingUser.id, targetEmail, existingUser.nome || fullName, condoTitle, req, res);
            } else {
                // Crea l'utenza partendo dai dati ufficiali dell'anagrafica
                const crypto = require('crypto');
                const tempPassword = crypto.randomBytes(16).toString('hex');
                const hash = bcrypt.hashSync(tempPassword, 10);

                db.run(
                    'INSERT INTO users (nome, email, password_hash, telefono) VALUES (?, ?, ?, ?)',
                    [fullName, targetEmail.toLowerCase(), hash, persona.cellulare || persona.telefono || null],
                    function (errIns) {
                        if (errIns) {
                            console.error('Errore creazione utente da anagrafica:', errIns);
                            return res.status(500).json({ success: false, message: 'Errore durante la creazione del profilo utente.' });
                        }
                        const newUserId = this.lastID;

                        // Associazione automatica al condominio dell'anagrafica
                        db.run(
                            'INSERT INTO user_condominios (user_id, condominio_id, role, unita) VALUES (?, ?, ?, ?)',
                            [newUserId, persona.condominio_id, 'condomino', 'Da anagrafica'],
                            () => {
                                db.run('UPDATE unita_immobiliari SET user_id = ? WHERE condominio_id = ? AND (proprietario_id = ? OR conduttore_id = ?)',
                                    [newUserId, persona.condominio_id, persona.id, persona.id], () => {});
                            }
                        );

                        deliverActivationEmail(newUserId, targetEmail, fullName, condoTitle, req, res);
                    }
                );
            }
        });
    });
});

// ============================================================================
// FLUSSO A: INVITO E PRIMO ACCESSO (ONBOARDING) - Validità 72 ore
// ============================================================================
async function sendOnboardingInviteForPersonaId(personaId, condominioId, host, protocol = 'http') {
    return new Promise((resolve, reject) => {
        const query = `
            SELECT ap.*, c.nome as condo_nome 
            FROM anagrafica_persone ap 
            LEFT JOIN condominios c ON ap.condominio_id = c.id 
            WHERE ap.id = ? AND (ap.condominio_id = ? OR ? IS NULL)
        `;
        db.get(query, [personaId, condominioId, condominioId || null], async (err, persona) => {
            if (err) return reject(err);
            if (!persona) return reject(new Error('Scheda anagrafica non trovata.'));
            if (!persona.email || !persona.email.trim()) {
                return reject(new Error(`Nessun indirizzo email specificato per ${persona.nome} ${persona.cognome}.`));
            }

            const cleanEmail = persona.email.trim().toLowerCase();
            const fullName = `${persona.nome} ${persona.cognome}`.trim();
            const condoName = persona.condo_nome || 'Condominio';

            db.get('SELECT id, nome, email FROM users WHERE LOWER(email) = ?', [cleanEmail], async (errU, existingUser) => {
                if (errU) return reject(errU);

                const dispatchToken = async (userId) => {
                    const crypto = require('crypto');
                    const token = crypto.randomBytes(32).toString('hex');
                    const expires = Date.now() + 72 * 3600 * 1000; // 72 ORE

                    db.run('UPDATE users SET reset_token = ?, reset_token_expires = ? WHERE id = ?', [token, expires, userId], async (errUpd) => {
                        if (errUpd) return reject(errUpd);

                        try {
                            const { previewUrl } = await emailService.sendOnboardingInviteEmail({
                                email: cleanEmail,
                                nome: fullName,
                                condoNome: condoName,
                                token,
                                host,
                                protocol
                            });

                            db.run('INSERT INTO security_logs (user_id, action) VALUES (?, ?)', 
                                [userId, `Invito di onboarding inviato a ${cleanEmail} (Condominio ${condoName})`]);

                            resolve({
                                success: true,
                                userId,
                                email: cleanEmail,
                                nome: fullName,
                                condoNome: condoName,
                                previewUrl
                            });
                        } catch (e) {
                            reject(e);
                        }
                    });
                };

                if (existingUser) {
                    if (persona.condominio_id) {
                        db.get('SELECT id FROM user_condominios WHERE user_id = ? AND condominio_id = ?', [existingUser.id, persona.condominio_id], (errUc, uc) => {
                            if (!uc) {
                                db.run('INSERT INTO user_condominios (user_id, condominio_id, role, unita) VALUES (?, ?, ?, ?)',
                                    [existingUser.id, persona.condominio_id, 'condomino', 'Da anagrafica'], () => {});
                            }
                        });
                    }
                    await dispatchToken(existingUser.id);
                } else {
                    const crypto = require('crypto');
                    const tempPassword = crypto.randomBytes(16).toString('hex');
                    const hash = bcrypt.hashSync(tempPassword, 10);

                    db.run(
                        'INSERT INTO users (nome, email, password_hash, telefono) VALUES (?, ?, ?, ?)',
                        [fullName, cleanEmail, hash, persona.cellulare || persona.telefono || null],
                        function (errIns) {
                            if (errIns) return reject(errIns);
                            const newUserId = this.lastID;

                            if (persona.condominio_id) {
                                db.run('INSERT INTO user_condominios (user_id, condominio_id, role, unita) VALUES (?, ?, ?, ?)',
                                    [newUserId, persona.condominio_id, 'condomino', 'Da anagrafica'], () => {
                                        db.run('UPDATE unita_immobiliari SET user_id = ? WHERE condominio_id = ? AND (proprietario_id = ? OR conduttore_id = ?)',
                                            [newUserId, persona.condominio_id, persona.id, persona.id], () => {});
                                    });
                            }

                            dispatchToken(newUserId);
                        }
                    );
                }
            });
        });
    });
}

function deliverActivationEmail(userId, email, nome, condoNome, req, res) {
    const crypto = require('crypto');
    const token = crypto.randomBytes(32).toString('hex');
    const expires = Date.now() + 72 * 3600 * 1000; // 72 ORE

    db.run('UPDATE users SET reset_token = ?, reset_token_expires = ? WHERE id = ?', [token, expires, userId], async (err) => {
        if (err) return res.status(500).json({ success: false, message: 'Errore salvataggio credenziali di primo accesso.' });

        const host = req.get('host');
        const protocol = (req.headers['x-forwarded-proto'] || req.protocol || 'http').split(',')[0].trim();

        try {
            const { previewUrl } = await emailService.sendOnboardingInviteEmail({
                email,
                nome,
                condoNome,
                token,
                host,
                protocol
            });

            db.run('INSERT INTO security_logs (user_id, action) VALUES (?, ?)', 
                [userId, `Email attivazione inviata a ${email} (Scadenza: 72 ore)`]);

            const parts = email.split('@');
            const maskedUser = parts[0].length > 2 ? parts[0][0] + '***' + parts[0].slice(-1) : '***';
            const maskedEmail = `${maskedUser}@${parts[1] || ''}`;

            return res.json({
                success: true,
                message: `Anagrafica verificata! Abbiamo inviato un link sicuro all'indirizzo email associato (${maskedEmail}) per impostare la password.`,
                previewUrl
            });
        } catch (e) {
            console.error('Errore invio email attivazione:', e);
            return res.status(500).json({ success: false, message: 'Errore durante l\'invio dell\'email di attivazione.' });
        }
    });
}

// ==========================================
// RESTORED: /api/auth/me
// ==========================================
app.get('/api/auth/me', authenticateToken, (req, res) => {
    db.get('SELECT id, nome, email, is_superadmin, two_factor_enabled, privacy_accepted FROM users WHERE id = ?', [req.user.id], (err, user) => {
        if (!user) return res.status(404).json({ success: false });
        const fetchCondosQuery = user.is_superadmin
            ? "SELECT id, nome, indirizzo, cf, scala, 'admin' as role, 'Proprietario' as unita FROM condominios"
            : 'SELECT c.id, c.nome, c.indirizzo, c.cf, c.scala, uc.role, uc.unita FROM user_condominios uc JOIN condominios c ON uc.condominio_id = c.id WHERE uc.user_id = ?';
        const params = user.is_superadmin ? [] : [user.id];

        db.all(fetchCondosQuery, params, (err, condomini) => {
            res.json({ success: true, user: { ...user, condomini: condomini || [] } });
        });
    });
});

app.post('/api/2fa/validate', (req, res) => {
    const { userId, token } = req.body;
    db.get('SELECT * FROM users WHERE id = ?', [userId], (err, user) => {
        if (err || !user || !user.two_factor_enabled) return res.status(400).json({ success: false, message: 'Utente non valido o 2FA non attiva' });
        
        let isValid = speakeasy.totp.verify({
            secret: user.two_factor_secret,
            encoding: 'base32',
            token: token,
            window: 1
        });

        // Controlla codici di backup se TOTP fallisce
        if (!isValid && user.backup_codes) {
            let backupCodes = JSON.parse(user.backup_codes);
            if (backupCodes.includes(token)) {
                isValid = true;
                backupCodes = backupCodes.filter(c => c !== token); // Consuma il codice
                db.run('UPDATE users SET backup_codes = ? WHERE id = ?', [JSON.stringify(backupCodes), user.id]);
                logAudit(user.id, null, 'Uso Codice di Backup', 'users', user.id, null, req.ip);
            }
        }

        if (!isValid) {
            logAudit(user.id, null, 'Validazione 2FA Fallita', 'users', user.id, null, req.ip);
            return res.status(401).json({ success: false, message: 'Codice non valido' });
        }
        
        logAudit(user.id, null, 'Login Riuscito (2FA)', 'users', user.id, null, req.ip);
        issueToken(user, res);
    });
});

function issueToken(user, res) {
    const fetchCondosQuery = user.is_superadmin
        ? "SELECT id, nome, indirizzo, cf, scala, 'admin' as role, 'Proprietario' as unita FROM condominios"
        : 'SELECT c.id, c.nome, c.indirizzo, c.cf, c.scala, uc.role, uc.unita FROM user_condominios uc JOIN condominios c ON uc.condominio_id = c.id WHERE uc.user_id = ?';
    const params = user.is_superadmin ? [] : [user.id];

    db.all(fetchCondosQuery, params, (err, condomini) => {
        const tokenPayload = { id: user.id, nome: user.nome, email: user.email, is_superadmin: user.is_superadmin, privacy_accepted: user.privacy_accepted };
        const jwtToken = jwt.sign(tokenPayload, JWT_SECRET, { expiresIn: '24h' });
        res.json({ success: true, token: jwtToken, user: { ...tokenPayload, condomini: condomini || [] } });
    });
}

// Genera e invia il QRCode e i codici di backup
app.post('/api/2fa/setup', authenticateToken, (req, res) => {
    const secret = speakeasy.generateSecret({ name: `CondoTransparent (${req.user.email})` });
    
    // Genera 5 codici di backup da 8 caratteri
    const backupCodes = Array.from({length: 5}, () => Math.random().toString(36).substring(2, 10).toUpperCase());

    db.run('UPDATE users SET two_factor_secret = ?, backup_codes = ? WHERE id = ?', 
        [secret.base32, JSON.stringify(backupCodes), req.user.id], (err) => {
        if (err) return res.status(500).json({ success: false });
        
        QRCode.toDataURL(secret.otpauth_url, (err, imageUrl) => {
            if (err) return res.status(500).json({ success: false });
            res.json({ success: true, qrCodeUrl: imageUrl, secret: secret.base32, backupCodes });
        });
    });
});

// Conferma il primo token per attivare definitivamente 2FA
app.post('/api/2fa/verify', authenticateToken, (req, res) => {
    const { token } = req.body;
    db.get('SELECT two_factor_secret FROM users WHERE id = ?', [req.user.id], (err, user) => {
        if (err || !user || !user.two_factor_secret) return res.status(400).json({ success: false, message: '2FA non setup' });
        
        const isValid = speakeasy.totp.verify({ secret: user.two_factor_secret, encoding: 'base32', token: token, window: 1 });
        if (!isValid) return res.status(400).json({ success: false, message: 'Codice errato' });
        
        db.run('UPDATE users SET two_factor_enabled = 1 WHERE id = ?', [req.user.id], () => {
            logAudit(req.user.id, null, '2FA Attivata', 'users', req.user.id, null, req.ip);
            res.json({ success: true, message: '2FA Attivata' });
        });
    });
});

// L'admin può disabilitare il 2FA per un condomino che ha perso il telefono
app.post('/api/2fa/reset/:userId', authenticateToken, requireCondominio, isAdmin, (req, res) => {
    db.run('UPDATE users SET two_factor_enabled = 0, two_factor_secret = NULL, backup_codes = NULL WHERE id = ?', [req.params.userId], function(err) {
        if (err) return res.status(500).json({success:false});
        logAudit(req.user.id, req.condominio_id, 'Reset 2FA Utente', 'users', req.params.userId, null, req.ip);
        res.json({ success: true, message: '2FA resettato per l\'utente' });
    });
});


// ==========================================
// API GESTIONALI (Anonimizzazione, Conti, Libro Giornale)
// ==========================================

// ==========================================
// UNITA IMMOBILIARI E MILLESIMI
// ==========================================


// ==========================================
// ANAGRAFICA PERSONE (RUBRICA & REGISTRO ANAGRAFE)
// ==========================================

function handleSyncPersonaUnita(condominio_id, personaId, ruolo, uData, callback, isRetry = false) {
    if (!uData) return callback ? callback(null) : null;
    let ident = (uData.identificativo || '').trim();
    // Se l'identificativo fornito è un vecchio codice fittizio tipo 'Appartamento 60005', azzeralo
    if (/^(Appartamento|Unit[àa])\s*\d+$/i.test(ident)) {
        ident = '';
    }
    const interno = (uData.interno || '').trim();
    if (!ident && interno) {
        ident = 'Int. ' + interno;
    }
    // Se non ci sono campi unità compilati, non sincronizziamo l'unità
    if (!ident && !interno && !uData.millesimi_proprieta && !uData.scala && !uData.piano && !uData.dati_catastali) {
        return callback ? callback(null) : null;
    }
    if (!ident) {
        if (interno) {
            ident = 'Int. ' + interno;
        } else if (uData.scala || uData.piano) {
            const parts = [];
            if (uData.scala) parts.push('Sc. ' + uData.scala);
            if (uData.piano) parts.push('P. ' + uData.piano);
            ident = (uData.tipo || 'Appartamento') + ' ' + parts.join(' ');
        } else {
            ident = (uData.tipo || 'Appartamento');
        }
    }

    const isConduttore = (ruolo === 'Conduttore');
    
    // Cerca se esiste già un'unità associata: per unita_id specificato, oppure già collegata a questa persona, oppure per stesso identificativo
    const searchParams = [condominio_id];
    let queryCond = '';
    if (uData.unita_id) {
        queryCond = 'id = ?';
        searchParams.push(parseInt(uData.unita_id, 10));
    } else {
        queryCond = '(proprietario_id = ? OR conduttore_id = ?) OR LOWER(identificativo) = LOWER(?)';
        searchParams.push(personaId, personaId, ident);
    }

    db.get(`SELECT id FROM unita_immobiliari WHERE condominio_id = ? AND (${queryCond}) LIMIT 1`, 
    searchParams, (err, existing) => {
        if (err) {
            if (!isRetry && (err.code === 'ER_BAD_FIELD_ERROR' || (err.message && err.message.includes('Unknown column')))) {
                console.log('🔄 Rilevate colonne unità mancanti in ricerca sync, esecuzione migrazione fail-safe...');
                return ensureAnagraficaAndUnitaColumns(() => handleSyncPersonaUnita(condominio_id, personaId, ruolo, uData, callback, true));
            }
            return callback ? callback(err) : null;
        }
        
        if (existing) {
            const updateSql = isConduttore
                ? `UPDATE unita_immobiliari SET conduttore_id = ?, identificativo = ?, tipo = ?, scala = ?, piano = ?, interno = ?, millesimi_proprieta = ?, millesimi_scale = ?, millesimi_ascensore = ?, dati_catastali = ? WHERE id = ?`
                : `UPDATE unita_immobiliari SET proprietario_id = ?, identificativo = ?, tipo = ?, scala = ?, piano = ?, interno = ?, millesimi_proprieta = ?, millesimi_scale = ?, millesimi_ascensore = ?, dati_catastali = ? WHERE id = ?`;
            db.run(updateSql, [
                personaId, 
                ident, 
                uData.tipo || 'Appartamento', 
                (uData.scala || '').trim().toUpperCase(), 
                uData.piano || '', 
                interno || '', 
                parseFloat(uData.millesimi_proprieta) || 0, 
                parseFloat(uData.millesimi_scale) || 0, 
                parseFloat(uData.millesimi_ascensore) || 0, 
                uData.dati_catastali || '', 
                existing.id
            ], (uErr) => {
                if (uErr) {
                    if (!isRetry && (uErr.code === 'ER_BAD_FIELD_ERROR' || (uErr.message && uErr.message.includes('Unknown column')))) {
                        console.log('🔄 Rilevate colonne unità mancanti in update sync, esecuzione migrazione fail-safe...');
                        return ensureAnagraficaAndUnitaColumns(() => handleSyncPersonaUnita(condominio_id, personaId, ruolo, uData, callback, true));
                    }
                    return callback ? callback(uErr) : null;
                }
                if (callback) callback(null);
            });
        } else {
            const insertSql = isConduttore
                ? `INSERT INTO unita_immobiliari (condominio_id, identificativo, tipo, scala, piano, interno, millesimi_proprieta, millesimi_scale, millesimi_ascensore, dati_catastali, conduttore_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
                : `INSERT INTO unita_immobiliari (condominio_id, identificativo, tipo, scala, piano, interno, millesimi_proprieta, millesimi_scale, millesimi_ascensore, dati_catastali, proprietario_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;
            db.run(insertSql, [
                condominio_id, 
                ident, 
                uData.tipo || 'Appartamento', 
                (uData.scala || '').trim().toUpperCase(), 
                uData.piano || '', 
                interno || '', 
                parseFloat(uData.millesimi_proprieta) || 0, 
                parseFloat(uData.millesimi_scale) || 0, 
                parseFloat(uData.millesimi_ascensore) || 0, 
                uData.dati_catastali || '', 
                personaId
            ], (iErr) => {
                if (iErr) {
                    if (!isRetry && (iErr.code === 'ER_BAD_FIELD_ERROR' || (iErr.message && iErr.message.includes('Unknown column')))) {
                        console.log('🔄 Rilevate colonne unità mancanti in insert sync, esecuzione migrazione fail-safe...');
                        return ensureAnagraficaAndUnitaColumns(() => handleSyncPersonaUnita(condominio_id, personaId, ruolo, uData, callback, true));
                    }
                    return callback ? callback(iErr) : null;
                }
                if (callback) callback(null);
            });
        }
    });
}

app.get('/api/anagrafica-persone', authenticateToken, requireCondominio, (req, res) => {
    const isAdminUser = req.user && (req.user.is_superadmin || req.role_in_condominio === 'admin');
    const fetchList = (isRetry = false) => {
        let sql = `
            SELECT p.*,
                   (SELECT id FROM unita_immobiliari WHERE (proprietario_id = p.id OR conduttore_id = p.id) AND condominio_id = p.condominio_id ORDER BY id DESC LIMIT 1) as unita_id,
                   (SELECT identificativo FROM unita_immobiliari WHERE (proprietario_id = p.id OR conduttore_id = p.id) AND condominio_id = p.condominio_id ORDER BY id DESC LIMIT 1) as unita_identificativo,
                   (SELECT tipo FROM unita_immobiliari WHERE (proprietario_id = p.id OR conduttore_id = p.id) AND condominio_id = p.condominio_id ORDER BY id DESC LIMIT 1) as unita_tipo,
                   (SELECT scala FROM unita_immobiliari WHERE (proprietario_id = p.id OR conduttore_id = p.id) AND condominio_id = p.condominio_id ORDER BY id DESC LIMIT 1) as unita_scala,
                   (SELECT piano FROM unita_immobiliari WHERE (proprietario_id = p.id OR conduttore_id = p.id) AND condominio_id = p.condominio_id ORDER BY id DESC LIMIT 1) as unita_piano,
                   (SELECT interno FROM unita_immobiliari WHERE (proprietario_id = p.id OR conduttore_id = p.id) AND condominio_id = p.condominio_id ORDER BY id DESC LIMIT 1) as unita_interno,
                   (SELECT millesimi_proprieta FROM unita_immobiliari WHERE (proprietario_id = p.id OR conduttore_id = p.id) AND condominio_id = p.condominio_id ORDER BY id DESC LIMIT 1) as unita_mill_prop,
                   (SELECT millesimi_scale FROM unita_immobiliari WHERE (proprietario_id = p.id OR conduttore_id = p.id) AND condominio_id = p.condominio_id ORDER BY id DESC LIMIT 1) as unita_mill_scale,
                   (SELECT millesimi_ascensore FROM unita_immobiliari WHERE (proprietario_id = p.id OR conduttore_id = p.id) AND condominio_id = p.condominio_id ORDER BY id DESC LIMIT 1) as unita_mill_asc,
                   (SELECT dati_catastali FROM unita_immobiliari WHERE (proprietario_id = p.id OR conduttore_id = p.id) AND condominio_id = p.condominio_id ORDER BY id DESC LIMIT 1) as unita_dati_catastali
            FROM anagrafica_persone p
            WHERE p.condominio_id = ?`;
        const params = [req.condominio_id];

        if (!isAdminUser) {
            // Isolamento rigoroso per condomino (GDPR)
            sql += ` AND (
                (p.email IS NOT NULL AND LOWER(TRIM(p.email)) = LOWER(TRIM(?)))
                OR p.id IN (
                    SELECT proprietario_id FROM unita_immobiliari WHERE user_id = ? AND condominio_id = ? AND proprietario_id IS NOT NULL
                    UNION
                    SELECT conduttore_id FROM unita_immobiliari WHERE user_id = ? AND condominio_id = ? AND conduttore_id IS NOT NULL
                )
            )`;
            params.push(req.user.email || '', req.user.id, req.condominio_id, req.user.id, req.condominio_id);
        }

        sql += ` ORDER BY p.cognome ASC, p.nome ASC`;

        db.all(sql, params, (err, rows) => {
            if (err) {
                if (!isRetry && (err.code === 'ER_BAD_FIELD_ERROR' || (err.message && err.message.includes('Unknown column')))) {
                    console.log('🔄 Rilevate colonne mancanti in GET anagrafica, esecuzione migrazione fail-safe...');
                    return ensureAnagraficaAndUnitaColumns(() => fetchList(true));
                }
                return res.status(500).json({ success: false, message: err.message });
            }
            res.json({ success: true, data: rows || [] });
        });
    };
    fetchList(false);
});

app.post('/api/anagrafica-persone', authenticateToken, requireCondominio, isAdmin, checkCondoLicenseWrite, (req, res) => {
    const {
        nome, cognome, codice_fiscale, data_nascita, luogo_nascita, residenza,
        telefono, cellulare, email, pec, ruolo_default, notes,
        unita_id, unita_identificativo, unita_tipo, unita_scala, unita_piano, unita_interno,
        unita_mill_prop, unita_mill_scale, unita_mill_asc, unita_dati_catastali
    } = req.body;
    
    if (!nome || !cognome) {
        return res.status(400).json({ success: false, message: 'Nome e Cognome sono obbligatori.' });
    }

    const executeInsert = (isRetry = false) => {
        db.run(`INSERT INTO anagrafica_persone (condominio_id, nome, cognome, codice_fiscale, data_nascita, luogo_nascita, residenza, telefono, cellulare, email, pec, ruolo_default, notes) 
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [req.condominio_id, nome, cognome, codice_fiscale || null, data_nascita || null, luogo_nascita || null, residenza || null, telefono || null, cellulare || null, email || null, pec || null, ruolo_default || 'Proprietario', notes || null], 
            function(err) {
                if (err) {
                    if (!isRetry && (err.code === 'ER_BAD_FIELD_ERROR' || (err.message && err.message.includes('Unknown column')))) {
                        console.log('🔄 Rilevate colonne mancanti in POST anagrafica, esecuzione migrazione fail-safe...');
                        return ensureAnagraficaAndUnitaColumns(() => executeInsert(true));
                    }
                    return res.status(500).json({ success: false, message: err.message });
                }
                const personaId = this.lastID;
                handleSyncPersonaUnita(req.condominio_id, personaId, ruolo_default, {
                    unita_id,
                    identificativo: unita_identificativo,
                    tipo: unita_tipo,
                    scala: unita_scala,
                    piano: unita_piano,
                    interno: unita_interno,
                    millesimi_proprieta: unita_mill_prop,
                    millesimi_scale: unita_mill_scale,
                    millesimi_ascensore: unita_mill_asc,
                    dati_catastali: unita_dati_catastali
                }, (errSync) => {
                    logAudit(req.user.id, req.condominio_id, 'Creata Persona in Anagrafica', 'anagrafica_persone', personaId, null, req.ip);

                    // FLUSSO A: Trigger automatico invito primo accesso (validità 72h)
                    if (email && email.trim()) {
                        sendOnboardingInviteForPersonaId(personaId, req.condominio_id, req.get('host'), req.protocol || 'http')
                            .then(invResult => {
                                console.log(`✉️ [Flusso A Onboarding] Invito automatico inviato a ${invResult.email} (Anteprima: ${invResult.previewUrl || 'N/A'})`);
                            })
                            .catch(invErr => {
                                console.warn(`⚠️ [Flusso A Onboarding] Invio automatico non riuscito per #${personaId}:`, invErr.message);
                            });
                    }

                    res.json({ success: true, id: personaId });
                });
        });
    };
    executeInsert(false);
});

app.put('/api/anagrafica-persone/:id', authenticateToken, requireCondominio, isAdmin, checkCondoLicenseWrite, (req, res) => {
    const {
        nome, cognome, codice_fiscale, data_nascita, luogo_nascita, residenza,
        telefono, cellulare, email, pec, ruolo_default, notes,
        unita_id, unita_identificativo, unita_tipo, unita_scala, unita_piano, unita_interno,
        unita_mill_prop, unita_mill_scale, unita_mill_asc, unita_dati_catastali
    } = req.body;

    if (!nome || !cognome) {
        return res.status(400).json({ success: false, message: 'Nome e Cognome sono obbligatori.' });
    }

    const executeUpdate = (isRetry = false) => {
        db.run(`UPDATE anagrafica_persone 
                SET nome = ?, cognome = ?, codice_fiscale = ?, data_nascita = ?, luogo_nascita = ?, residenza = ?, telefono = ?, cellulare = ?, email = ?, pec = ?, ruolo_default = ?, notes = ? 
                WHERE id = ? AND condominio_id = ?`,
            [nome, cognome, codice_fiscale || null, data_nascita || null, luogo_nascita || null, residenza || null, telefono || null, cellulare || null, email || null, pec || null, ruolo_default || 'Proprietario', notes || null, req.params.id, req.condominio_id], 
            function(err) {
                if (err) {
                    if (!isRetry && (err.code === 'ER_BAD_FIELD_ERROR' || (err.message && err.message.includes('Unknown column')))) {
                        console.log('🔄 Rilevate colonne mancanti in PUT anagrafica, esecuzione migrazione fail-safe...');
                        return ensureAnagraficaAndUnitaColumns(() => executeUpdate(true));
                    }
                    return res.status(500).json({ success: false, message: err.message });
                }
                handleSyncPersonaUnita(req.condominio_id, req.params.id, ruolo_default, {
                    unita_id,
                    identificativo: unita_identificativo,
                    tipo: unita_tipo,
                    scala: unita_scala,
                    piano: unita_piano,
                    interno: unita_interno,
                    millesimi_proprieta: unita_mill_prop,
                    millesimi_scale: unita_mill_scale,
                    millesimi_ascensore: unita_mill_asc,
                    dati_catastali: unita_dati_catastali
                }, (errSync) => {
                    logAudit(req.user.id, req.condominio_id, 'Modificata Persona in Anagrafica', 'anagrafica_persone', req.params.id, null, req.ip);
                    res.json({ success: true });
                });
        });
    };
    executeUpdate(false);
});

app.delete('/api/anagrafica-persone/:id', authenticateToken, requireCondominio, isAdmin, checkCondoLicenseWrite, (req, res) => {
    db.run('DELETE FROM quotes WHERE persona_id = ? AND condominio_id = ?', [req.params.id, req.condominio_id], () => {
        db.run('UPDATE unita_immobiliari SET proprietario_id = NULL WHERE proprietario_id = ? AND condominio_id = ?', [req.params.id, req.condominio_id], () => {
            db.run('UPDATE unita_immobiliari SET conduttore_id = NULL WHERE conduttore_id = ? AND condominio_id = ?', [req.params.id, req.condominio_id], () => {
                db.run('DELETE FROM unita_immobiliari WHERE proprietario_id IS NULL AND conduttore_id IS NULL AND condominio_id = ?', [req.condominio_id], () => {
                    db.run('DELETE FROM anagrafica_persone WHERE id = ? AND condominio_id = ?', [req.params.id, req.condominio_id], function(err) {
                        if (err) return res.status(500).json({ success: false, message: err.message });
                        logAudit(req.user.id, req.condominio_id, 'Eliminata Persona da Anagrafica', 'anagrafica_persone', req.params.id, null, req.ip);
                        res.json({ success: true });
                    });
                });
            });
        });
    });
});

// ============================================================================
// FLUSSO A: Invio Manuale Invito & Primo Accesso da Pannello Amministratore
// ============================================================================
app.post('/api/anagrafica-persone/:id/send-invite', authenticateToken, requireCondominio, isAdmin, checkCondoLicenseWrite, async (req, res) => {
    try {
        const result = await sendOnboardingInviteForPersonaId(req.params.id, req.condominio_id, req.get('host'), req.protocol || 'http');
        res.json({
            success: true,
            message: `Invito di primo accesso inviato con successo a ${result.nome} (${result.email}).`,
            previewUrl: result.previewUrl
        });
    } catch (err) {
        console.error('Errore invio manuale invito:', err);
        res.status(400).json({ success: false, message: err.message || 'Errore durante l\'invio dell\'invito.' });
    }
});

app.get('/api/unita', authenticateToken, requireCondominio, (req, res) => {
    const isAdminUser = req.user && (req.user.is_superadmin || req.role_in_condominio === 'admin');
    let sql = `SELECT u.*, 
            us.nome as condomino_nome, us.email as condomino_email,
            p.nome as prop_nome, p.cognome as prop_cognome,
            c.nome as cond_nome, c.cognome as cond_cognome
            FROM unita_immobiliari u 
            LEFT JOIN users us ON u.user_id = us.id 
            LEFT JOIN anagrafica_persone p ON u.proprietario_id = p.id 
            LEFT JOIN anagrafica_persone c ON u.conduttore_id = c.id
            WHERE u.condominio_id = ? AND (p.id IS NOT NULL OR c.id IS NOT NULL)`;
    const params = [req.condominio_id];

    if (!isAdminUser) {
        // Isolamento rigoroso: solo le unità del condomino autenticato
        sql += ` AND (u.user_id = ? OR (p.email IS NOT NULL AND LOWER(TRIM(p.email)) = LOWER(TRIM(?))) OR (c.email IS NOT NULL AND LOWER(TRIM(c.email)) = LOWER(TRIM(?))))`;
        params.push(req.user.id, req.user.email || '', req.user.email || '');
    }

    sql += ` ORDER BY u.identificativo ASC`;

    db.all(sql, params, (err, rows) => {
        if (err) return res.status(500).json({ success: false, message: err.message });
        res.json({ success: true, data: rows || [] });
    });
});

app.post('/api/unita', authenticateToken, requireCondominio, isAdmin, checkCondoLicenseWrite, (req, res) => {
    const { proprietario_id, conduttore_id, user_id, tipo, identificativo, scala, piano, interno, millesimi_proprieta, millesimi_scale, millesimi_ascensore, dati_catastali } = req.body;
    
    // Controllo limite massimo unità consentite dalla licenza
    db.get('SELECT max_units FROM condo_licenses WHERE condominio_id = ?', [req.condominio_id], (errLic, licRow) => {
        const maxUnits = (licRow && licRow.max_units) ? licRow.max_units : 50;
        db.get('SELECT COUNT(*) as total FROM unita_immobiliari WHERE condominio_id = ?', [req.condominio_id], (errCnt, cntRow) => {
            const currentUnits = (cntRow && cntRow.total) ? cntRow.total : 0;
            if (!req.user.is_superadmin && currentUnits >= maxUnits) {
                return res.status(400).json({
                    success: false,
                    message: `Limite massimo di ${maxUnits} unità raggiunto per la licenza di questo condominio. Contatta il fornitore/proprietario per l'upgrade del piano.`
                });
            }

            db.run(`INSERT INTO unita_immobiliari (condominio_id, user_id, tipo, identificativo, scala, piano, interno, millesimi_proprieta, millesimi_scale, millesimi_ascensore, proprietario_id, conduttore_id, dati_catastali) 
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [req.condominio_id, user_id || null, tipo || 'Appartamento', identificativo, scala, piano, interno || null, millesimi_proprieta || 0, millesimi_scale || 0, millesimi_ascensore || 0, proprietario_id || null, conduttore_id || null, dati_catastali || null], 
                function(err) {
                    if (err) return res.status(500).json({ success: false, message: err.message });
                    logAudit(req.user.id, req.condominio_id, 'Creata Unità Immobiliare', 'unita_immobiliari', this.lastID, null, req.ip);
                    res.json({ success: true, id: this.lastID });
            });
        });
    });
});

app.put('/api/unita/:id', authenticateToken, requireCondominio, isAdmin, checkCondoLicenseWrite, (req, res) => {
    const { proprietario_id, conduttore_id, user_id, tipo, identificativo, scala, piano, interno, millesimi_proprieta, millesimi_scale, millesimi_ascensore, dati_catastali } = req.body;
    db.run(`UPDATE unita_immobiliari 
            SET user_id = ?, tipo = ?, identificativo = ?, scala = ?, piano = ?, interno = ?, millesimi_proprieta = ?, millesimi_scale = ?, millesimi_ascensore = ?, proprietario_id = ?, conduttore_id = ?, dati_catastali = ?
            WHERE id = ? AND condominio_id = ?`,
        [user_id || null, tipo || 'Appartamento', identificativo, scala, piano, interno || null, millesimi_proprieta || 0, millesimi_scale || 0, millesimi_ascensore || 0, proprietario_id || null, conduttore_id || null, dati_catastali || null, req.params.id, req.condominio_id], 
        function(err) {
            if (err) return res.status(500).json({ success: false, message: err.message });
            logAudit(req.user.id, req.condominio_id, 'Modificata Unità Immobiliare', 'unita_immobiliari', req.params.id, null, req.ip);
            res.json({ success: true });
    });
});


app.get('/api/condominios', authenticateToken, (req, res) => {
    if (req.user.is_superadmin) {
        db.all('SELECT * FROM condominios', [], (err, rows) => res.json({ success: true, data: rows }));
    } else {
        res.status(403).json({success:false});
    }
});

// Quote e Receivables (Crediti) con ANONIMIZZAZIONE, SALDO PARZIALE e allineamento rigoroso ad Anagrafica Condominio
app.get('/api/receivables', authenticateToken, requireCondominio, (req, res) => {
    const isAdminUser = req.user && (req.user.is_superadmin || req.role_in_condominio === 'admin');
    if (!isAdminUser) {
        return res.status(403).json({
            success: false,
            message: 'Accesso negato: l\'elenco analitico dei debitori è riservato esclusivamente all\'amministratore a tutela della privacy dei condòmini (GDPR).'
        });
    }

    realignDatabaseToAnagrafica(req.condominio_id, () => {
        db.all(`SELECT q.*, 
                       p.nome as persona_nome, p.cognome as persona_cognome,
                       (SELECT identificativo FROM unita_immobiliari WHERE (proprietario_id = p.id OR conduttore_id = p.id) AND condominio_id = p.condominio_id ORDER BY id DESC LIMIT 1) as unita,
                       (SELECT scala FROM unita_immobiliari WHERE (proprietario_id = p.id OR conduttore_id = p.id) AND condominio_id = p.condominio_id ORDER BY id DESC LIMIT 1) as unita_scala,
                       (SELECT piano FROM unita_immobiliari WHERE (proprietario_id = p.id OR conduttore_id = p.id) AND condominio_id = p.condominio_id ORDER BY id DESC LIMIT 1) as unita_piano,
                       (SELECT interno FROM unita_immobiliari WHERE (proprietario_id = p.id OR conduttore_id = p.id) AND condominio_id = p.condominio_id ORDER BY id DESC LIMIT 1) as unita_interno
                 FROM quotes q 
                 INNER JOIN anagrafica_persone p ON q.persona_id = p.id AND p.condominio_id = q.condominio_id
                 WHERE q.condominio_id = ? AND (q.status != 'Pagato' OR (q.amount - COALESCE(q.paid_amount, 0)) > 0.009)
                 ORDER BY q.due_date ASC, q.id DESC`, 
        [req.condominio_id], (err, rows) => {
            if (err) return res.status(500).json({success: false, message: err.message});
            res.json({ success: true, data: (rows || []).map(r => {
                const total = parseFloat(r.amount) || 0;
                const paid = (r.paid_amount !== undefined && r.paid_amount !== null) ? parseFloat(r.paid_amount) : 0;
                const residual = Math.max(0, Math.round((total - paid) * 100) / 100);
                const debName = `${r.persona_cognome || ''} ${r.persona_nome || ''}`.trim();
                const locParts = [];
                if (r.unita_scala) locParts.push(`Sc. ${r.unita_scala}`);
                if (r.unita_piano) locParts.push(`P. ${r.unita_piano}`);
                if (r.unita_interno) locParts.push(`Int. ${r.unita_interno}`);
                const unitaDisplay = locParts.length > 0 ? locParts.join(' | ') : (r.unita || '-');
                return {
                    ...r,
                    debitore: debName,
                    unita: unitaDisplay,
                    titolo_quota: r.title,
                    importo_totale: total,
                    importo_versato: paid,
                    importo: residual,
                    residual: residual,
                    scadenza: r.due_date,
                    status: r.status
                };
            }) });
        });
    });
});


app.get('/api/quotes', authenticateToken, requireCondominio, (req, res) => {
    realignDatabaseToAnagrafica(req.condominio_id, () => {
        const isAdminUser = req.user && (req.user.is_superadmin || req.role_in_condominio === 'admin');
        
        let query = `SELECT q.*, 
                       p.nome as persona_nome, p.cognome as persona_cognome,
                       (SELECT identificativo FROM unita_immobiliari WHERE (proprietario_id = p.id OR conduttore_id = p.id) AND condominio_id = p.condominio_id ORDER BY id DESC LIMIT 1) as condomino_unita,
                       (SELECT scala FROM unita_immobiliari WHERE (proprietario_id = p.id OR conduttore_id = p.id) AND condominio_id = p.condominio_id ORDER BY id DESC LIMIT 1) as unita_scala,
                       (SELECT piano FROM unita_immobiliari WHERE (proprietario_id = p.id OR conduttore_id = p.id) AND condominio_id = p.condominio_id ORDER BY id DESC LIMIT 1) as unita_piano,
                       (SELECT interno FROM unita_immobiliari WHERE (proprietario_id = p.id OR conduttore_id = p.id) AND condominio_id = p.condominio_id ORDER BY id DESC LIMIT 1) as unita_interno
                 FROM quotes q 
                 INNER JOIN anagrafica_persone p ON q.persona_id = p.id AND p.condominio_id = q.condominio_id
                 WHERE q.condominio_id = ?`;
        const params = [req.condominio_id];

        if (!isAdminUser) {
            // Isolamento rigoroso per condomino (GDPR): visualizza esclusivamente le proprie quote personali
            query += ` AND (
                (p.email IS NOT NULL AND LOWER(TRIM(p.email)) = LOWER(TRIM(?)))
                OR q.unita_id IN (SELECT id FROM unita_immobiliari WHERE user_id = ? AND condominio_id = ?)
                OR q.persona_id IN (
                    SELECT proprietario_id FROM unita_immobiliari WHERE user_id = ? AND condominio_id = ? AND proprietario_id IS NOT NULL
                    UNION
                    SELECT conduttore_id FROM unita_immobiliari WHERE user_id = ? AND condominio_id = ? AND conduttore_id IS NOT NULL
                )
            )`;
            params.push(req.user.email || '', req.user.id, req.condominio_id, req.user.id, req.condominio_id, req.user.id, req.condominio_id);
        }

        query += ` ORDER BY q.due_date ASC, q.id DESC`;

        db.all(query, params, (err, rows) => {
            if (err) return res.status(500).json({success: false, message: err.message});
            // Remap to match what frontend expects
            const mapped = (rows || []).map(r => {
                const total = parseFloat(r.amount) || 0;
                const paid = (r.paid_amount !== undefined && r.paid_amount !== null)
                    ? parseFloat(r.paid_amount)
                    : (r.status === 'Pagato' ? total : 0);
                const residual = Math.max(0, Math.round((total - paid) * 100) / 100);
                const condName = `${r.persona_cognome || ''} ${r.persona_nome || ''}`.trim();
                const locParts = [];
                if (r.unita_scala) locParts.push(`Sc. ${r.unita_scala}`);
                if (r.unita_piano) locParts.push(`P. ${r.unita_piano}`);
                if (r.unita_interno) locParts.push(`Int. ${r.unita_interno}`);
                const unitaDisplay = locParts.length > 0 ? locParts.join(' | ') : (r.condomino_unita || '-');
                return {
                    ...r, 
                    amount: total,
                    paid_amount: paid,
                    residual: residual,
                    condomino_nome: condName, 
                    condomino_unita: unitaDisplay,
                    unita: unitaDisplay
                };
            });
            res.json({ success: true, data: mapped });
        });
    });
});

app.post('/api/quotes', authenticateToken, requireCondominio, isAdmin, checkCondoLicenseWrite, (req, res) => {
    const { persona_id, unita_id, type, title, amount, due_date, paid_amount, payment_method, notes, description } = req.body;
    const personaVal = (persona_id !== undefined && persona_id !== '' && persona_id !== null) ? parseInt(persona_id, 10) : null;
    const unitaVal = (unita_id !== undefined && unita_id !== '' && unita_id !== null) ? parseInt(unita_id, 10) : null;
    const amountVal = parseFloat(amount) || 0;
    const paidVal = Math.max(0, Math.min(amountVal, parseFloat(paid_amount) || 0));
    
    let status = 'In sospeso';
    if (paidVal >= (amountVal - 0.009) && amountVal > 0) {
        status = 'Pagato';
    } else if (paidVal > 0) {
        status = 'Parziale';
    }

    let history = [];
    if (paidVal > 0) {
        history.push({
            id: Date.now(),
            date: new Date().toISOString().split('T')[0],
            amount: paidVal,
            method: payment_method || 'Bonifico Bancario',
            note: notes || (status === 'Pagato' ? 'Saldo alla creazione' : 'Acconto iniziale'),
            registered_by: (req.user && req.user.nome) ? req.user.nome : 'Amministratore'
        });
    }

    db.run(
        `INSERT INTO quotes (condominio_id, persona_id, unita_id, type, title, amount, paid_amount, due_date, status, description, payment_history) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [req.condominio_id, personaVal, unitaVal, type || 'ordinaria', title, amountVal, paidVal, due_date, status, description || notes || null, history.length > 0 ? JSON.stringify(history) : null],
        function(err) {
            if (err) return res.status(500).json({ success: false, message: err.message });
            logAudit(req.user.id, req.condominio_id, `Assegnazione Quota (€ ${amountVal.toFixed(2)})`, 'quotes', this.lastID, null, req.ip);
            res.json({ success: true, id: this.lastID });
        }
    );
});

app.post('/api/quotes/batch', authenticateToken, requireCondominio, isAdmin, checkCondoLicenseWrite, (req, res) => {
    const { type, title, due_date, items } = req.body;
    if (!title || !due_date || !Array.isArray(items) || items.length === 0) {
        return res.status(400).json({ success: false, message: 'Titolo, data di scadenza ed elenco quote sono obbligatori.' });
    }

    let inserted = 0;
    let errors = 0;
    let pending = items.length;

    items.forEach(item => {
        const personaVal = (item.persona_id !== undefined && item.persona_id !== '' && item.persona_id !== null) ? parseInt(item.persona_id, 10) : null;
        const unitaVal = (item.unita_id !== undefined && item.unita_id !== '' && item.unita_id !== null) ? parseInt(item.unita_id, 10) : null;
        const amountVal = Math.round((parseFloat(item.amount) || 0) * 100) / 100;
        const descVal = item.description || null;
        const itemTitle = item.title || title;

        if (amountVal <= 0) {
            pending--;
            if (pending === 0) {
                logAudit(req.user.id, req.condominio_id, `Ripartizione Millesimale Massiva (${inserted} quote generate)`, 'quotes', null, null, req.ip);
                return res.json({ success: true, inserted, errors });
            }
            return;
        }

        db.run(
            `INSERT INTO quotes (condominio_id, persona_id, unita_id, type, title, amount, paid_amount, due_date, status, description) VALUES (?, ?, ?, ?, ?, ?, 0, ?, 'In sospeso', ?)`,
            [req.condominio_id, personaVal, unitaVal, type || 'ordinaria', itemTitle, amountVal, due_date, descVal],
            function(err) {
                if (err) errors++;
                else inserted++;
                pending--;
                if (pending === 0) {
                    logAudit(req.user.id, req.condominio_id, `Ripartizione Millesimale Massiva (${inserted} quote generate)`, 'quotes', null, null, req.ip);
                    res.json({ success: true, inserted, errors });
                }
            }
        );
    });
});

app.put('/api/quotes/:id', authenticateToken, requireCondominio, isAdmin, checkCondoLicenseWrite, (req, res) => {
    const { id } = req.params;
    const { amount, due_date, status, paid_amount } = req.body;
    const amountVal = parseFloat(amount) || 0;
    const paidVal = (paid_amount !== undefined && paid_amount !== null)
        ? parseFloat(paid_amount)
        : (status === 'Pagato' ? amountVal : 0);
    let payment_date = null;
    if (status === 'Pagato') {
        payment_date = new Date().toISOString().split('T')[0];
    }
    db.run(
        `UPDATE quotes SET amount = ?, paid_amount = ?, due_date = ?, status = ?, payment_date = COALESCE(payment_date, ?) WHERE id = ? AND condominio_id = ?`,
        [amountVal, paidVal, due_date, status, payment_date, id, req.condominio_id],
        function(err) {
            if (err) return res.status(500).json({ success: false, message: err.message });
            res.json({ success: true });
        }
    );
});

// Registrazione Saldo / Acconto Quota Condominiale
app.post('/api/quotes/:id/pay', authenticateToken, requireCondominio, isAdmin, checkCondoLicenseWrite, (req, res) => {
    const { id } = req.params;
    let { amount_paying, payment_amount, amount, payment_date, payment_method, note, notes, add_to_journal, create_journal_entry } = req.body || {};
    const inputPaying = (payment_amount !== undefined && payment_amount !== null) ? payment_amount : ((amount_paying !== undefined && amount_paying !== null) ? amount_paying : amount);
    const inputNote = notes || note;
    const shouldAddToJournal = (create_journal_entry !== undefined) ? create_journal_entry : (add_to_journal !== false && add_to_journal !== undefined ? add_to_journal : true);

    db.get('SELECT q.*, p.nome as persona_nome, p.cognome as persona_cognome FROM quotes q LEFT JOIN anagrafica_persone p ON q.persona_id = p.id WHERE q.id = ? AND q.condominio_id = ?', [id, req.condominio_id], (err, quote) => {
        if (err || !quote) return res.status(404).json({ success: false, message: 'Quota non trovata' });

        const totalAmount = parseFloat(quote.amount) || 0;
        const alreadyPaid = (quote.paid_amount !== undefined && quote.paid_amount !== null)
            ? parseFloat(quote.paid_amount)
            : (quote.status === 'Pagato' ? totalAmount : 0);
        const currentResidual = Math.max(0, Math.round((totalAmount - alreadyPaid) * 100) / 100);

        let paying = parseFloat(inputPaying);
        if (isNaN(paying) || paying <= 0) paying = currentResidual;
        if (paying > currentResidual) paying = currentResidual;
        paying = Math.round(paying * 100) / 100;

        const newPaidAmount = Math.min(totalAmount, Math.round((alreadyPaid + paying) * 100) / 100);
        const newStatus = newPaidAmount >= (totalAmount - 0.009) ? 'Pagato' : 'Parziale';
        const pDate = payment_date || new Date().toISOString().split('T')[0];
        const pMethod = payment_method || 'Bonifico Bancario';
        const pNote = inputNote || (newStatus === 'Pagato' ? 'Saldo Quota' : 'Acconto Quota');

        let history = [];
        try {
            if (quote.payment_history) history = JSON.parse(quote.payment_history);
        } catch (_) {}
        history.push({
            id: Date.now(),
            date: pDate,
            amount: paying,
            method: pMethod,
            note: pNote,
            registered_by: (req.user && req.user.nome) ? req.user.nome : 'Amministratore'
        });

        db.run(
            `UPDATE quotes SET paid_amount = ?, status = ?, payment_date = ?, payment_history = ? WHERE id = ? AND condominio_id = ?`,
            [newPaidAmount, newStatus, pDate, JSON.stringify(history), id, req.condominio_id],
            function(updErr) {
                if (updErr) return res.status(500).json({ success: false, message: updErr.message });

                logAudit(req.user.id, req.condominio_id, `Registrato Incasso Quota (€ ${paying.toFixed(2)} - ${newStatus})`, 'quotes', id, null, req.ip);

                // Registrazione automatica nel Libro Giornale (se richiesta)
                if (shouldAddToJournal) {
                    const desc = `Incasso Quota (${newStatus === 'Pagato' ? 'Saldo' : 'Acconto'}): ${quote.title}${pNote ? ' - ' + pNote : ''}`;
                    const nominativo = quote.persona_cognome ? `${quote.persona_cognome} ${quote.persona_nome}` : 'Condòmino';
                    db.run(
                        `INSERT INTO journal_entries (condominio_id, data, numero, tipo, descrizione, dare, avere, conto) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
                        [req.condominio_id, pDate, 'AUTO', 'Incasso Quota', desc, paying, 0, nominativo],
                        function() {
                            res.json({
                                success: true,
                                message: newStatus === 'Pagato' ? 'Quota saldata interamente!' : `Acconto di € ${paying.toFixed(2)} registrato! (Residuo: € ${(totalAmount - newPaidAmount).toFixed(2)})`,
                                newStatus,
                                paid_amount: newPaidAmount,
                                residual: Math.max(0, Math.round((totalAmount - newPaidAmount) * 100) / 100)
                            });
                        }
                    );
                } else {
                    res.json({
                        success: true,
                        message: newStatus === 'Pagato' ? 'Quota saldata interamente!' : `Acconto di € ${paying.toFixed(2)} registrato! (Residuo: € ${(totalAmount - newPaidAmount).toFixed(2)})`,
                        newStatus,
                        paid_amount: newPaidAmount,
                        residual: Math.max(0, Math.round((totalAmount - newPaidAmount) * 100) / 100)
                    });
                }
            }
        );
    });
});

app.patch('/api/quotes/:id/pay', authenticateToken, requireCondominio, isAdmin, checkCondoLicenseWrite, (req, res) => {
    // Inoltra alla gestione completa pay
    req.url = `/api/quotes/${req.params.id}/pay`;
    app._router.handle(req, res);
});

app.delete('/api/quotes/:id', authenticateToken, requireCondominio, isAdmin, checkCondoLicenseWrite, (req, res) => {
    const { id } = req.params;
    db.run("DELETE FROM quotes WHERE id = ? AND condominio_id = ?", [id, req.condominio_id], function(err) {
        if (err) return res.status(500).json({ success: false, message: err.message });
        res.json({ success: true });
    });
});


// Conti Correnti e Transazioni
app.get('/api/bank-accounts', authenticateToken, requireCondominio, isAdmin, (req, res) => {
    db.all('SELECT * FROM bank_accounts WHERE condominio_id = ?', [req.condominio_id], (err, rows) => {
        res.json({ success: true, data: rows });
    });
});

app.post('/api/bank-transactions', authenticateToken, requireCondominio, isAdmin, checkCondoLicenseWrite, (req, res) => {
    const { account_id, data, importo, causale, tipo } = req.body;
    db.run(`INSERT INTO bank_transactions (account_id, data, importo, causale, tipo) VALUES (?, ?, ?, ?, ?)`,
    [account_id, data, importo, causale, tipo], function(err) {
        logAudit(req.user.id, req.condominio_id, 'Inserimento Transazione Bancaria', 'bank_transactions', this.lastID, null, req.ip);
        res.json({ success: true });
    });
});

// Libro Giornale
app.get('/api/journal-entries', authenticateToken, requireCondominio, isAdmin, (req, res) => {
    db.all('SELECT * FROM journal_entries WHERE condominio_id = ? ORDER BY data DESC', [req.condominio_id], (err, rows) => {
        res.json({ success: true, data: rows });
    });
});

app.post('/api/journal-entries', authenticateToken, requireCondominio, isAdmin, checkCondoLicenseWrite, (req, res) => {
    const { data, numero, tipo, descrizione, dare, avere, conto } = req.body;
    db.run(`INSERT INTO journal_entries (condominio_id, data, numero, tipo, descrizione, dare, avere, conto) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [req.condominio_id, data, numero, tipo, descrizione, dare, avere, conto], function(err) {
        logAudit(req.user.id, req.condominio_id, 'Registrazione Libro Giornale', 'journal_entries', this.lastID, null, req.ip);
        res.json({ success: true });
    });
});

// Correzione Errori (Override / Aggiornamento generico con Audit Log)
app.put('/api/override/:table/:id', authenticateToken, requireCondominio, isAdmin, checkCondoLicenseWrite, (req, res) => {
    const table = req.params.table;
    const allowedTables = ['journal_entries', 'bank_transactions', 'quotes', 'supplier_payments'];
    if (!allowedTables.includes(table)) return res.status(400).json({ success: false, message: 'Tabella non supportata' });

    db.get(`SELECT * FROM ${table} WHERE id = ?`, [req.params.id], (err, oldRecord) => {
        if (err || !oldRecord) return res.status(404).json({ success: false });

        const updates = [];
        const values = [];
        for (const [key, value] of Object.entries(req.body)) {
            updates.push(`${key} = ?`);
            values.push(value);
        }
        values.push(req.params.id);

        db.run(`UPDATE ${table} SET ${updates.join(', ')} WHERE id = ?`, values, function(err) {
            logAudit(req.user.id, req.condominio_id, `Correzione Errore in ${table}`, table, req.params.id, oldRecord, req.ip);
            res.json({ success: true, message: 'Record aggiornato' });
        });
    });
});

// Audit Logs
app.get('/api/audit-logs', authenticateToken, requireCondominio, isAdmin, (req, res) => {
    db.all('SELECT a.*, u.email as user_email FROM audit_log a LEFT JOIN users u ON a.user_id = u.id WHERE a.condominio_id = ? OR a.condominio_id IS NULL ORDER BY a.timestamp DESC', 
    [req.condominio_id], (err, rows) => {
        res.json({ success: true, data: rows });
    });
});




// ==========================================
// API UTENTI
// ==========================================

app.get('/api/users', authenticateToken, requireCondominio, isAdmin, (req, res) => {
    db.all(`SELECT u.id, u.nome, u.email, u.telefono, u.two_factor_enabled, u.created_at, u.privacy_accepted, u.privacy_accepted_at, uc.role, uc.unita, uc.dati_catastali 
            FROM users u 
            JOIN user_condominios uc ON u.id = uc.user_id 
            WHERE uc.condominio_id = ?
            ORDER BY u.nome ASC`, [req.condominio_id], (err, rows) => {
        res.json({ success: true, data: rows });
    });
});

app.post('/api/users', authenticateToken, requireCondominio, isAdmin, checkCondoLicenseWrite, (req, res) => {
    const { persona_id, nome, email, password, unita, role, telefono, dati_catastali } = req.body;
    if (!nome || !email || !password) {
        return res.status(400).json({ success: false, message: 'Nome, email e password sono obbligatori.' });
    }
    const hash = bcrypt.hashSync(password, 10);
    const cleanEmail = email.trim().toLowerCase();
    
    // Inserisce utente e mappa il condominio
    db.run('INSERT INTO users (nome, email, password_hash, telefono) VALUES (?, ?, ?, ?)', [nome.trim(), cleanEmail, hash, telefono || null], function(err) {
        if (err) {
            const isDup = err.code === 'ER_DUP_ENTRY' || 
                (err.message && (err.message.includes('UNIQUE constraint failed') || err.message.includes('Duplicate entry')));
            // Se l'email esiste già, prova solo ad assegnarlo al condominio
            if (isDup) {
                db.get('SELECT id FROM users WHERE LOWER(email) = LOWER(?)', [cleanEmail], (err2, existingUser) => {
                    if (existingUser) {
                        db.run('INSERT INTO user_condominios (user_id, condominio_id, role, unita, dati_catastali) VALUES (?, ?, ?, ?, ?)', 
                            [existingUser.id, req.condominio_id, role || 'condomino', unita || '', dati_catastali || null], (err3) => {
                            if (err3) return res.status(500).json({ success: false, message: 'Utente già presente in questo condominio' });
                            if (persona_id) {
                                db.run(`UPDATE unita_immobiliari SET user_id = ? WHERE condominio_id = ? AND (proprietario_id = ? OR conduttore_id = ?)`,
                                    [existingUser.id, req.condominio_id, persona_id, persona_id], () => {});
                                db.run(`UPDATE anagrafica_persone SET email = COALESCE(NULLIF(email, ''), ?) WHERE id = ? AND condominio_id = ?`,
                                    [cleanEmail, persona_id, req.condominio_id], () => {});
                            }
                            logAudit(req.user.id, req.condominio_id, 'Assegnazione Utente Esistente', 'user_condominios', existingUser.id, null, req.ip);
                            return res.json({ success: true, message: 'Utente esistente aggiunto al condominio' });
                        });
                    } else {
                        return res.status(500).json({ success: false, message: 'Errore identificazione utente esistente' });
                    }
                });
                return;
            }
            return res.status(500).json({ success: false, message: 'Errore inserimento utente nel database' });
        }
        
        const newUserId = this.lastID;
        db.run('INSERT INTO user_condominios (user_id, condominio_id, role, unita, dati_catastali) VALUES (?, ?, ?, ?, ?)', 
            [newUserId, req.condominio_id, role || 'condomino', unita || '', dati_catastali || null], function(err2) {
            if (err2) return res.status(500).json({ success: false, message: 'Errore associazione condominio' });
            if (persona_id) {
                db.run(`UPDATE unita_immobiliari SET user_id = ? WHERE condominio_id = ? AND (proprietario_id = ? OR conduttore_id = ?)`,
                    [newUserId, req.condominio_id, persona_id, persona_id], () => {});
                db.run(`UPDATE anagrafica_persone SET email = COALESCE(NULLIF(email, ''), ?) WHERE id = ? AND condominio_id = ?`,
                    [cleanEmail, persona_id, req.condominio_id], () => {});
            }
            logAudit(req.user.id, req.condominio_id, 'Creazione Utente', 'users', newUserId, null, req.ip);
            res.json({ success: true, message: 'Utente creato con successo' });
        });
    });
});



app.post('/api/users/accept-privacy', authenticateToken, (req, res) => {
    db.run('UPDATE users SET privacy_accepted = 1, privacy_accepted_at = CURRENT_TIMESTAMP WHERE id = ?', [req.user.id], (err) => {
        if (err) return res.status(500).json({ success: false, message: 'Errore DB' });
        res.json({ success: true });
    });
});

app.put('/api/users/:id', authenticateToken, requireCondominio, isAdmin, checkCondoLicenseWrite, (req, res) => {
    const { unita, role, telefono, dati_catastali, nome, email, password } = req.body;
    
    if (password && password.trim() !== '') {
        const pwdRegex = /^(?=.*[A-Z])(?=.*\d)(?=.*[!@#$%^&*(),.?":{}|<>]).{8,}$/;
        if (!pwdRegex.test(password)) {
            return res.status(400).json({ success: false, message: 'La password deve contenere almeno 8 caratteri, una maiuscola, un numero e un carattere speciale.' });
        }
    }

    db.get('SELECT email FROM users WHERE id = ?', [req.params.id], (err, user) => {
        if (!user) return res.status(404).json({success: false});

        let updates = [];
        let params = [];
        
        if (telefono !== undefined) { updates.push('telefono = ?'); params.push(telefono); }
        if (nome !== undefined && nome.trim() !== '') { updates.push('nome = ?'); params.push(nome.trim()); }
        if (email !== undefined && email.trim() !== '') { updates.push('email = ?'); params.push(email.trim()); }
        
        if (password && password.trim() !== '') {
            updates.push('password_hash = ?');
            params.push(require('bcryptjs').hashSync(password, 10));
        }
        
        if (updates.length > 0) {
            params.push(req.params.id);
            db.run(`UPDATE users SET ${updates.join(', ')} WHERE id = ?`, params, (err) => {
                // Ignore email duplicate error for now to keep flow simple, or handle if needed
            });
        }
        
        db.run('UPDATE user_condominios SET unita = ?, role = ?, dati_catastali = ? WHERE user_id = ? AND condominio_id = ?', 
            [unita, role, dati_catastali, req.params.id, req.condominio_id], function(err) {
            if (err) return res.status(500).json({ success: false, message: 'Errore salvataggio' });
            res.json({ success: true });
        });
    });
});

app.delete('/api/users/:id', authenticateToken, requireCondominio, isAdmin, checkCondoLicenseWrite, (req, res) => {
    db.run('DELETE FROM users WHERE id = ?', [req.params.id], function(err) {
        if (err) return res.status(500).json({ success: false });
        res.json({ success: true });
    });
});


// ==========================================
// RESTORED MISSING ENDPOINTS
// ==========================================

app.get('/api/suppliers', authenticateToken, requireCondominio, (req, res) => {
    db.all('SELECT * FROM suppliers WHERE condominio_id = ? ORDER BY ragione_sociale ASC', [req.condominio_id], (err, rows) => {
        if (err) return res.status(500).json({ success: false, message: 'DB Error' });
        res.json({ success: true, data: rows || [] });
    });
});

app.post('/api/suppliers', authenticateToken, requireCondominio, checkCondoLicenseWrite, (req, res) => {
    if (req.role_in_condominio !== 'admin') return res.status(403).json({ success: false });
    const { ragione_sociale, piva, email, telefono, iban } = req.body;
    db.run('INSERT INTO suppliers (condominio_id, ragione_sociale, piva, email, telefono, iban) VALUES (?, ?, ?, ?, ?, ?)',
        [req.condominio_id, ragione_sociale, piva, email, telefono, iban], function(err) {
            res.json({ success: !err });
        });
});

app.put('/api/suppliers/:id', authenticateToken, requireCondominio, checkCondoLicenseWrite, (req, res) => {
    if (req.role_in_condominio !== 'admin') return res.status(403).json({ success: false });
    const { ragione_sociale, piva, email, telefono, iban } = req.body;
    db.run('UPDATE suppliers SET ragione_sociale = ?, piva = ?, email = ?, telefono = ?, iban = ? WHERE id = ? AND condominio_id = ?',
        [ragione_sociale, piva, email, telefono, iban, req.params.id, req.condominio_id], function(err) {
            res.json({ success: !err });
        });
});

app.get('/api/supplier-payments', authenticateToken, requireCondominio, (req, res) => {
    db.all('SELECT * FROM supplier_payments WHERE condominio_id = ? ORDER BY payment_date DESC, id DESC', [req.condominio_id], (err, rows) => {
        if (err) return res.status(500).json({ success: false, message: err.message });
        const mapped = (rows || []).map(r => {
            const total = parseFloat(r.amount) || 0;
            const paid = (r.paid_amount !== undefined && r.paid_amount !== null)
                ? parseFloat(r.paid_amount)
                : (r.status === 'Pagato' ? total : 0);
            const residual = Math.max(0, Math.round((total - paid) * 100) / 100);
            return {
                ...r,
                amount: total,
                paid_amount: paid,
                residual: residual
            };
        });
        res.json({ success: true, data: mapped });
    });
});

app.post('/api/supplier-payments', authenticateToken, requireCondominio, isAdmin, checkCondoLicenseWrite, (req, res) => {
    const { supplier_name, category, invoice_number, amount, payment_date, status, notes, paid_amount, payment_method } = req.body;
    const amountVal = parseFloat(amount) || 0;
    let paidVal = (paid_amount !== undefined && paid_amount !== null && paid_amount !== '') ? parseFloat(paid_amount) : (status === 'Pagato' ? amountVal : 0);
    paidVal = Math.max(0, Math.min(amountVal, paidVal));
    
    let initialStatus = status || 'Da liquidare';
    if (paidVal >= (amountVal - 0.009) && amountVal > 0) {
        initialStatus = 'Pagato';
    } else if (paidVal > 0) {
        initialStatus = 'Parziale';
    }

    let history = [];
    if (paidVal > 0) {
        history.push({
            id: Date.now(),
            date: payment_date || new Date().toISOString().split('T')[0],
            amount: paidVal,
            method: payment_method || 'Bonifico Bancario',
            note: notes || (initialStatus === 'Pagato' ? 'Saldo alla registrazione' : 'Acconto iniziale'),
            registered_by: (req.user && req.user.nome) ? req.user.nome : 'Amministratore'
        });
    }

    db.run('INSERT INTO supplier_payments (condominio_id, supplier_name, category, invoice_number, amount, paid_amount, payment_date, status, notes, payment_history) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        [req.condominio_id, supplier_name, category, invoice_number, amountVal, paidVal, payment_date, initialStatus, notes, history.length > 0 ? JSON.stringify(history) : null], function(err) {
            if (err) return res.status(500).json({ success: false, message: err.message });
            res.json({ success: true, id: this.lastID });
        });
});

app.put('/api/supplier-payments/:id', authenticateToken, requireCondominio, isAdmin, checkCondoLicenseWrite, (req, res) => {
    const { amount, status, paid_amount, notes } = req.body;
    const amountVal = parseFloat(amount) || 0;
    const paidVal = (paid_amount !== undefined && paid_amount !== null) ? parseFloat(paid_amount) : (status === 'Pagato' ? amountVal : 0);
    db.run('UPDATE supplier_payments SET amount = ?, paid_amount = ?, status = ?, notes = COALESCE(?, notes) WHERE id = ? AND condominio_id = ?',
        [amountVal, paidVal, status, notes || null, req.params.id, req.condominio_id], function(err) {
            if (err) return res.status(500).json({ success: false, error: err.message });
            res.json({ success: true });
        });
});

// Registrazione Saldo / Acconto Fattura Fornitore
app.post('/api/supplier-payments/:id/pay', authenticateToken, requireCondominio, isAdmin, checkCondoLicenseWrite, (req, res) => {
    const { id } = req.params;
    let { amount_paying, payment_amount, amount, payment_date, payment_method, note, notes, add_to_journal, create_journal_entry } = req.body || {};
    const inputPaying = (payment_amount !== undefined && payment_amount !== null) ? payment_amount : ((amount_paying !== undefined && amount_paying !== null) ? amount_paying : amount);
    const inputNote = notes || note;
    const shouldAddToJournal = (create_journal_entry !== undefined) ? create_journal_entry : (add_to_journal !== false && add_to_journal !== undefined ? add_to_journal : true);

    db.get('SELECT * FROM supplier_payments WHERE id = ? AND condominio_id = ?', [id, req.condominio_id], (err, supplier) => {
        if (err || !supplier) return res.status(404).json({ success: false, message: 'Fattura fornitore non trovata' });

        const totalAmount = parseFloat(supplier.amount) || 0;
        const alreadyPaid = (supplier.paid_amount !== undefined && supplier.paid_amount !== null)
            ? parseFloat(supplier.paid_amount)
            : (supplier.status === 'Pagato' ? totalAmount : 0);
        const currentResidual = Math.max(0, Math.round((totalAmount - alreadyPaid) * 100) / 100);

        let paying = parseFloat(inputPaying);
        if (isNaN(paying) || paying <= 0) paying = currentResidual;
        if (paying > currentResidual) paying = currentResidual;
        paying = Math.round(paying * 100) / 100;

        const newPaidAmount = Math.min(totalAmount, Math.round((alreadyPaid + paying) * 100) / 100);
        const newStatus = newPaidAmount >= (totalAmount - 0.009) ? 'Pagato' : 'Parziale';
        const pDate = payment_date || new Date().toISOString().split('T')[0];
        const pMethod = payment_method || 'Bonifico Bancario';
        const pNote = inputNote || (newStatus === 'Pagato' ? 'Saldo Fattura' : 'Acconto Fattura');

        let history = [];
        try {
            if (supplier.payment_history) history = JSON.parse(supplier.payment_history);
        } catch (_) {}
        history.push({
            id: Date.now(),
            date: pDate,
            amount: paying,
            method: pMethod,
            note: pNote,
            registered_by: (req.user && req.user.nome) ? req.user.nome : 'Amministratore'
        });

        db.run(
            `UPDATE supplier_payments SET paid_amount = ?, status = ?, payment_date = ?, payment_history = ? WHERE id = ? AND condominio_id = ?`,
            [newPaidAmount, newStatus, pDate, JSON.stringify(history), id, req.condominio_id],
            function(updErr) {
                if (updErr) return res.status(500).json({ success: false, message: updErr.message });

                logAudit(req.user.id, req.condominio_id, `Registrato Pagamento Fornitore (€ ${paying.toFixed(2)} - ${newStatus})`, 'supplier_payments', id, null, req.ip);

                // Registrazione automatica nel Libro Giornale (se richiesta)
                if (shouldAddToJournal) {
                    const desc = `Pagamento Fornitore (${newStatus === 'Pagato' ? 'Saldo' : 'Acconto'}): ${supplier.supplier_name} - Fatt. ${supplier.invoice_number || 'N/D'}${pNote ? ' - ' + pNote : ''}`;
                    db.run(
                        `INSERT INTO journal_entries (condominio_id, data, numero, tipo, descrizione, dare, avere, conto) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
                        [req.condominio_id, pDate, supplier.invoice_number || 'AUTO', 'Pagamento Fornitore', desc, 0, paying, supplier.supplier_name],
                        function() {
                            res.json({
                                success: true,
                                message: newStatus === 'Pagato' ? 'Fattura saldata interamente!' : `Acconto di € ${paying.toFixed(2)} registrato! (Residuo: € ${(totalAmount - newPaidAmount).toFixed(2)})`,
                                newStatus,
                                paid_amount: newPaidAmount,
                                residual: Math.max(0, Math.round((totalAmount - newPaidAmount) * 100) / 100)
                            });
                        }
                    );
                } else {
                    res.json({
                        success: true,
                        message: newStatus === 'Pagato' ? 'Fattura saldata interamente!' : `Acconto di € ${paying.toFixed(2)} registrato! (Residuo: € ${(totalAmount - newPaidAmount).toFixed(2)})`,
                        newStatus,
                        paid_amount: newPaidAmount,
                        residual: Math.max(0, Math.round((totalAmount - newPaidAmount) * 100) / 100)
                    });
                }
            }
        );
    });
});


app.get('/api/accounting-summary', authenticateToken, requireCondominio, (req, res) => {
    const condominioId = req.condominio_id;

    const qQuotes = `
        SELECT 
            COALESCE(SUM(COALESCE(paid_amount, CASE WHEN status = 'Pagato' THEN amount ELSE 0 END)), 0) AS totalReceived,
            COALESCE(SUM(amount - COALESCE(paid_amount, CASE WHEN status = 'Pagato' THEN amount ELSE 0 END)), 0) AS totalReceivables
        FROM quotes 
        WHERE condominio_id = ?
    `;

    const qSuppliers = `
        SELECT 
            COALESCE(SUM(COALESCE(paid_amount, CASE WHEN status = 'Pagato' THEN amount ELSE 0 END)), 0) AS totalSuppliersPaid,
            COALESCE(SUM(amount - COALESCE(paid_amount, CASE WHEN status = 'Pagato' THEN amount ELSE 0 END)), 0) AS totalSuppliersDebt
        FROM supplier_payments 
        WHERE condominio_id = ?
    `;

    db.get(qQuotes, [condominioId], (err1, rowQuotes) => {
        if (err1) {
            console.error('Errore accounting-summary quotes:', err1);
            return res.status(500).json({ success: false, message: err1.message });
        }
        db.get(qSuppliers, [condominioId], (err2, rowSuppliers) => {
            if (err2) {
                console.error('Errore accounting-summary suppliers:', err2);
                return res.status(500).json({ success: false, message: err2.message });
            }
            const data = {
                totalReceived: parseFloat(rowQuotes && rowQuotes.totalReceived) || 0,
                totalReceivables: parseFloat(rowQuotes && rowQuotes.totalReceivables) || 0,
                totalSuppliersPaid: parseFloat(rowSuppliers && rowSuppliers.totalSuppliersPaid) || 0,
                totalSuppliersDebt: parseFloat(rowSuppliers && rowSuppliers.totalSuppliersDebt) || 0
            };
            res.json({ success: true, data });
        });
    });
});

// Endpoint di sintesi finanziaria aggregata a tutela della privacy (GDPR Compliant)
// Fornisce SOLO funzioni aggregate SUM/COUNT per card e indicatori senza identificativi individuali
app.get('/api/condominio/financial-health', authenticateToken, requireCondominio, (req, res) => {
    const condoId = req.condominio_id;
    const todaySql = (db && db.type === 'sqlite') ? "date('now')" : "CURDATE()";

    const qQuotes = `
        SELECT 
            COALESCE(SUM(amount), 0) AS totale_emesso,
            COALESCE(SUM(COALESCE(paid_amount, CASE WHEN status = 'Pagato' THEN amount ELSE 0 END)), 0) AS totale_incassato,
            COALESCE(SUM(CASE WHEN due_date < ${todaySql} AND (amount - COALESCE(paid_amount, CASE WHEN status = 'Pagato' THEN amount ELSE 0 END)) > 0 
                THEN (amount - COALESCE(paid_amount, CASE WHEN status = 'Pagato' THEN amount ELSE 0 END)) ELSE 0 END), 0) AS totale_insoluti_scaduti,
            COALESCE(SUM(amount - COALESCE(paid_amount, CASE WHEN status = 'Pagato' THEN amount ELSE 0 END)), 0) AS totale_quote_da_riscuotere
        FROM quotes 
        WHERE condominio_id = ?
    `;

    const qSuppliers = `
        SELECT 
            COALESCE(SUM(COALESCE(paid_amount, CASE WHEN status = 'Pagato' THEN amount ELSE 0 END)), 0) AS totale_fornitori_pagati,
            COALESCE(SUM(amount - COALESCE(paid_amount, CASE WHEN status = 'Pagato' THEN amount ELSE 0 END)), 0) AS totale_fornitori_debito,
            COALESCE(SUM(CASE WHEN payment_date < ${todaySql} AND (amount - COALESCE(paid_amount, CASE WHEN status = 'Pagato' THEN amount ELSE 0 END)) > 0 
                THEN (amount - COALESCE(paid_amount, CASE WHEN status = 'Pagato' THEN amount ELSE 0 END)) ELSE 0 END), 0) AS totale_fornitori_scaduti
        FROM supplier_payments 
        WHERE condominio_id = ?
    `;

    db.get(qQuotes, [condoId], (err1, qRow) => {
        if (err1) return res.status(500).json({ success: false, message: err1.message });
        db.get(qSuppliers, [condoId], (err2, sRow) => {
            if (err2) return res.status(500).json({ success: false, message: err2.message });

            const totEmesso = parseFloat(qRow && qRow.totale_emesso) || 0;
            const totIncassato = parseFloat(qRow && qRow.totale_incassato) || 0;
            const totInsolutiScaduti = parseFloat(qRow && qRow.totale_insoluti_scaduti) || 0;
            const totDaRiscuotere = parseFloat(qRow && qRow.totale_quote_da_riscuotere) || 0;

            const fornitoriPagati = parseFloat(sRow && sRow.totale_fornitori_pagati) || 0;
            const fornitoriDebito = parseFloat(sRow && sRow.totale_fornitori_debito) || 0;
            const fornitoriScaduti = parseFloat(sRow && sRow.totale_fornitori_scaduti) || 0;

            const percIncasso = totEmesso > 0 ? Math.min(100, Math.round((totIncassato / totEmesso) * 100)) : 100;

            let cassaStatus = 'ottimo';
            let cassaMessage = 'Il flusso di cassa generato soddisfa regolarmente la copertura degli impegni deliberati.';
            if (fornitoriDebito > 0 && totInsolutiScaduti > 0) {
                if (fornitoriScaduti > 0) {
                    cassaStatus = 'attenzione';
                    cassaMessage = 'Il fabbisogno per le uscite programmate è subordinato alla progressione dei residui attivi dell\'esercizio.';
                } else {
                    cassaStatus = 'regolare';
                    cassaMessage = 'Tempistiche di cassa ordinarie: partite di spesa programmate secondo scadenziario contrattuale.';
                }
            } else if (totInsolutiScaduti > 0) {
                cassaStatus = 'buono';
                cassaMessage = 'Liquidità comune attiva. Riscossione delle quote di riparto in regolare progressione.';
            }

            res.json({
                success: true,
                data: {
                    totale_emesso: totEmesso,
                    totale_incassato: totIncassato,
                    percentuale_incasso: percIncasso,
                    totale_insoluti_scaduti: totInsolutiScaduti,
                    totale_quote_da_riscuotere: totDaRiscuotere,
                    fornitori_pagati: fornitoriPagati,
                    fornitori_debito: fornitoriDebito,
                    fornitori_scaduti: fornitoriScaduti,
                    cassa_status: cassaStatus,
                    cassa_message: cassaMessage,
                    privacy_note: 'Dati contabili espressi esclusivamente in valori aggregati a salvaguardia della riservatezza individuale (Regolamento UE 2016/679).'
                }
            });
        });
    });
});

app.get('/api/tickets', authenticateToken, requireCondominio, (req, res) => {
    let query = `
        SELECT t.*, u.nome as creator_name, uc.unita as creator_unita 
        FROM tickets t 
        LEFT JOIN users u ON t.user_id = u.id 
        LEFT JOIN user_condominios uc ON u.id = uc.user_id AND uc.condominio_id = t.condominio_id 
        WHERE t.condominio_id = ?
    `;
    const params = [req.condominio_id];
    if (req.role_in_condominio !== 'admin') {
        query += ' AND t.user_id = ?';
        params.push(req.user.id);
    }
    query += ' ORDER BY t.id DESC';

    db.all(query, params, (err, rows) => {
        if (err) return res.status(500).json({ success: false, message: 'Database error' });
        res.json({ success: true, data: rows || [] });
    });
});

app.get('/api/tickets/:id', authenticateToken, requireCondominio, (req, res) => {
    let query = `
        SELECT t.*, u.nome as creator_name, uc.unita as creator_unita 
        FROM tickets t 
        LEFT JOIN users u ON t.user_id = u.id 
        LEFT JOIN user_condominios uc ON u.id = uc.user_id AND uc.condominio_id = t.condominio_id 
        WHERE t.id = ? AND t.condominio_id = ?
    `;
    const params = [req.params.id, req.condominio_id];
    if (req.role_in_condominio !== 'admin') {
        query += ' AND t.user_id = ?';
        params.push(req.user.id);
    }

    db.get(query, params, (err, ticket) => {
        if (err) {
            console.error('Ticket get error:', err);
            return res.status(500).json({ success: false, message: 'Database error' });
        }
        if (!ticket) {
            return res.status(404).json({ success: false, message: 'Segnalazione non trovata' });
        }

        db.all('SELECT * FROM ticket_updates WHERE ticket_id = ? ORDER BY created_at ASC, id ASC', [req.params.id], (err2, updates) => {
            if (err2) {
                console.error('Ticket updates fetch error:', err2);
                return res.status(500).json({ success: false, message: 'Database error' });
            }
            ticket.updates = updates || [];
            res.json({ success: true, data: ticket });
        });
    });
});

app.post('/api/tickets', authenticateToken, requireCondominio, checkCondoLicenseWrite, (req, res) => {
    const { category, title, description, priority } = req.body;
    db.run('INSERT INTO tickets (condominio_id, user_id, category, title, description, priority) VALUES (?, ?, ?, ?, ?, ?)',
        [req.condominio_id, req.user.id, category, title, description, priority], function(err) {
            if (err) return res.status(500).json({ success: false, message: 'Errore creazione ticket' });
            res.json({ success: true, id: this.lastID });
        });
});

app.post('/api/tickets/:id/updates', authenticateToken, requireCondominio, checkCondoLicenseWrite, (req, res) => {
    const { message } = req.body;
    if (!message || !message.trim()) {
        return res.status(400).json({ success: false, message: 'Il messaggio non può essere vuoto' });
    }

    let checkQuery = 'SELECT id, user_id FROM tickets WHERE id = ? AND condominio_id = ?';
    const checkParams = [req.params.id, req.condominio_id];
    if (req.role_in_condominio !== 'admin') {
        checkQuery += ' AND user_id = ?';
        checkParams.push(req.user.id);
    }

    db.get(checkQuery, checkParams, (err, ticket) => {
        if (err) return res.status(500).json({ success: false, message: 'Database error' });
        if (!ticket) return res.status(404).json({ success: false, message: 'Segnalazione non trovata' });

        const authorName = req.user.nome || (req.role_in_condominio === 'admin' ? 'Studio Amministrazione' : 'Utente');

        db.run(
            'INSERT INTO ticket_updates (ticket_id, user_id, author_name, message) VALUES (?, ?, ?, ?)',
            [req.params.id, req.user.id, authorName, message.trim()],
            function(err2) {
                if (err2) {
                    console.error('Ticket update insert error:', err2);
                    return res.status(500).json({ success: false, message: 'Errore durante la registrazione della risposta' });
                }

                db.run('UPDATE tickets SET updated_at = CURRENT_TIMESTAMP WHERE id = ?', [req.params.id]);
                res.json({ success: true, message: 'Risposta registrata!' });
            }
        );
    });
});

app.put('/api/tickets/:id/status', authenticateToken, requireCondominio, checkCondoLicenseWrite, (req, res) => {
    if (req.role_in_condominio !== 'admin') {
        return res.status(403).json({ success: false, message: 'Accesso negato: operazione riservata all\'amministratore' });
    }

    const { status } = req.body;
    const validStatuses = ['Segnalato', 'Preso in carico', 'In lavorazione', 'Risolto', 'Chiuso'];
    if (!validStatuses.includes(status)) {
        return res.status(400).json({ success: false, message: 'Stato non valido' });
    }

    db.get('SELECT id, status FROM tickets WHERE id = ? AND condominio_id = ?', [req.params.id, req.condominio_id], (err, ticket) => {
        if (err) return res.status(500).json({ success: false, message: 'Database error' });
        if (!ticket) return res.status(404).json({ success: false, message: 'Segnalazione non trovata' });

        const oldStatus = ticket.status;
        db.run('UPDATE tickets SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [status, req.params.id], function(err2) {
            if (err2) return res.status(500).json({ success: false, message: 'Errore aggiornamento stato' });

            const authorName = req.user.nome || 'Amministratore';
            const logMsg = `Stato modificato da "${oldStatus}" a "${status}"`;
            db.run(
                'INSERT INTO ticket_updates (ticket_id, user_id, author_name, message) VALUES (?, ?, ?, ?)',
                [req.params.id, req.user.id, authorName, logMsg],
                () => {}
            );

            res.json({ success: true, message: `Stato aggiornato a "${status}"` });
        });
    });
});

app.get('/api/assemblies', authenticateToken, requireCondominio, (req, res) => {
    const isPast = req.query.past === '1' ? 1 : 0;
    db.all('SELECT * FROM assemblies WHERE condominio_id = ? AND is_past = ? ORDER BY date DESC', [req.condominio_id, isPast], (err, rows) => {
        res.json({ success: true, data: rows || [] });
    });
});

app.get('/api/condominio', authenticateToken, requireCondominio, (req, res) => {
    db.get(`
        SELECT c.*, 
            COALESCE(cf.module_contabilita, 1) as module_contabilita,
            COALESCE(cf.module_segnalazioni, 1) as module_segnalazioni,
            COALESCE(cf.module_assemblee, 1) as module_assemblee,
            COALESCE(cf.module_comunicazioni, 1) as module_comunicazioni,
            COALESCE(cf.module_banca, 1) as module_banca,
            COALESCE(cf.module_anagrafica, 1) as module_anagrafica,
            cl.plan_type,
            cl.license_status,
            cl.start_date as license_start_date,
            cl.end_date as license_end_date,
            cl.payment_status as license_payment_status,
            cl.payment_reference as license_payment_reference,
            cl.payment_amount as license_payment_amount,
            cl.payment_date as license_payment_date,
            COALESCE(cl.max_units, 50) as license_max_units,
            cl.notes as license_notes,
            (SELECT COUNT(*) FROM unita_immobiliari WHERE condominio_id = c.id) as current_units_count
        FROM condominios c 
        LEFT JOIN condo_features cf ON c.id = cf.condominio_id 
        LEFT JOIN condo_licenses cl ON c.id = cl.condominio_id
        WHERE c.id = ?
    `, [req.condominio_id], (err, row) => {
        if (!row) return res.json({ success: true, data: {} });

        const licenseRaw = {
            plan_type: row.plan_type || 'completo',
            license_status: row.license_status || 'active',
            start_date: row.license_start_date || '2026-01-01',
            end_date: row.license_end_date || '2026-12-31',
            payment_status: row.license_payment_status || 'paid',
            payment_reference: row.license_payment_reference || '',
            payment_amount: row.license_payment_amount || 0,
            payment_date: row.license_payment_date || '',
            max_units: row.license_max_units || 50,
            notes: row.license_notes || ''
        };
        const computedLicense = computeLicenseInfo(licenseRaw);

        res.json({ 
            success: true, 
            data: {
                ...row,
                license: computedLicense
            }
        });
    });
});

app.put('/api/condominio', authenticateToken, requireCondominio, isAdmin, checkCondoLicenseWrite, (req, res) => {
    const fields = [
        'nome', 'indirizzo', 'cf', 'scala', 'dati_bancari',
        'admin_nome', 'admin_cognome', 'admin_titolo',
        'admin_studio_nome', 'admin_studio_indirizzo',
        'admin_telefono', 'admin_cellulare', 'admin_emergenze',
        'admin_email', 'admin_pec',
        'admin_orari_ricevimento', 'admin_ricevimento_note',
        'admin_collaboratori',
        'cig', 'admin_email_condominio',
        'assicurazione_compagnia', 'assicurazione_polizza', 'assicurazione_scadenza',
        'note_fabbricato'
    ];
    let updatePairs = [];
    let params = [];
    
    fields.forEach(f => {
        if (req.body[f] !== undefined) {
            updatePairs.push(f + ' = ?');
            params.push(req.body[f]);
        }
    });

    if (updatePairs.length === 0) return res.json({ success: true });

    params.push(req.condominio_id);
    const query = 'UPDATE condominios SET ' + updatePairs.join(', ') + ' WHERE id = ?';
    
    const executeUpdate = (retried = false) => {
        db.run(query, params, function(err) {
            if (err) {
                if (!retried && /Unknown column|no such column/i.test(err.message)) {
                    return ensureAnagraficaAndUnitaColumns(() => executeUpdate(true));
                }
                return res.status(500).json({ success: false, error: err.message });
            }
            res.json({ success: true });
        });
    };
    executeUpdate();
});


app.get('/api/journal', authenticateToken, requireCondominio, isAdmin, (req, res) => {
    db.all('SELECT * FROM journal_entries WHERE condominio_id = ? ORDER BY data DESC', [req.condominio_id], (err, rows) => {
        res.json({ success: true, data: rows || [] });
    });
});

app.post('/api/journal', authenticateToken, requireCondominio, isAdmin, checkCondoLicenseWrite, (req, res) => {
    const { data, numero, tipo, descrizione, dare, avere, conto } = req.body;
    db.run('INSERT INTO journal_entries (condominio_id, data, numero, tipo, descrizione, dare, avere, conto) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    [req.condominio_id, data, numero, tipo, descrizione, dare, avere, conto], function(err) {
        res.json({ success: !err });
    });
});

app.put('/api/journal/:id', authenticateToken, requireCondominio, isAdmin, checkCondoLicenseWrite, (req, res) => {
    const { data, numero, tipo, descrizione, dare, avere, conto } = req.body;
    db.run('UPDATE journal_entries SET data = ?, numero = ?, tipo = ?, descrizione = ?, dare = ?, avere = ?, conto = ? WHERE id = ? AND condominio_id = ?',
    [data, numero, tipo, descrizione, dare, avere, conto, req.params.id, req.condominio_id], function(err) {
        if (err) return res.status(500).json({ success: false });
        res.json({ success: this.changes > 0 });
    });
});

app.delete('/api/journal/:id', authenticateToken, requireCondominio, isAdmin, checkCondoLicenseWrite, (req, res) => {
    db.run('DELETE FROM journal_entries WHERE id = ? AND condominio_id = ?', [req.params.id, req.condominio_id], function(err) {
        if (err) return res.status(500).json({ success: false });
        res.json({ success: this.changes > 0 });
    });
});


app.get('/api/audit-log', authenticateToken, requireCondominio, isAdmin, (req, res) => {
    db.all('SELECT a.*, u.nome FROM audit_log a LEFT JOIN users u ON a.user_id = u.id WHERE a.condominio_id = ? OR a.condominio_id IS NULL ORDER BY a.timestamp DESC', 
    [req.condominio_id], (err, rows) => {
        res.json({ success: true, data: rows || [] });
    });
});

// --- PASSWORD RECOVERY ROUTES (FLUSSO C - Validità 2 ore) ---
app.post('/api/auth/forgot-password', (req, res) => {
    const { email } = req.body;
    if (!email) return res.status(400).json({ success: false, message: 'Email obbligatoria' });

    db.get('SELECT id, nome, email FROM users WHERE LOWER(email) = LOWER(?)', [email.trim()], (err, user) => {
        if (err || !user) {
            return res.json({ success: true, message: 'Se l\'email esiste nel sistema, riceverai un link sicuro per reimpostare la tua password.' });
        }

        const crypto = require('crypto');
        const token = crypto.randomBytes(32).toString('hex');
        const expires = Date.now() + 2 * 3600 * 1000; // 2 ore come richiesto dal Flusso C

        db.run('UPDATE users SET reset_token = ?, reset_token_expires = ? WHERE id = ?', [token, expires, user.id], async (err) => {
            if (err) return res.status(500).json({ success: false, message: 'Errore interno' });

            const host = req.get('host');
            const protocol = (req.headers['x-forwarded-proto'] || req.protocol || 'http').split(',')[0].trim();

            try {
                const { previewUrl } = await emailService.sendPasswordResetEmail({
                    email: user.email || email.trim(),
                    nome: user.nome,
                    token,
                    host,
                    protocol
                });

                db.run('INSERT INTO security_logs (user_id, action) VALUES (?, ?)', 
                    [user.id, `Richiesta reset password inviata a ${user.email} (Scadenza: 2 ore)`]);

                res.json({ 
                    success: true, 
                    message: 'Hai richiesto il ripristino della password per il tuo account CondoTransparent. Controlla la tua casella di posta.',
                    previewUrl 
                });
            } catch (errMail) {
                console.error('Errore invio mail reset:', errMail);
                res.status(500).json({ success: false, message: 'Errore durante l\'invio dell\'email di ripristino password.' });
            }
        });
    });
});

app.post('/api/auth/reset-password', (req, res) => {
    const { token, newPassword } = req.body;
    if (!token || !newPassword) return res.status(400).json({ success: false, message: 'Dati mancanti' });

    const pwdRegex = /^(?=.*[A-Z])(?=.*\d)(?=.*[!@#$%^&*(),.?":{}|<>]).{8,}$/;
    if (!pwdRegex.test(newPassword)) {
        return res.status(400).json({ success: false, message: 'La password non rispetta i criteri minimi.' });
    }

    db.get('SELECT id FROM users WHERE reset_token = ? AND reset_token_expires > ?', [token, Date.now()], (err, user) => {
        if (err || !user) {
            return res.status(400).json({ success: false, message: 'Il link di recupero non è valido o è scaduto.' });
        }

        const hash = bcrypt.hashSync(newPassword, 10);
        db.run('UPDATE users SET password_hash = ?, reset_token = NULL, reset_token_expires = NULL WHERE id = ?', [hash, user.id], (err) => {
            if (err) return res.status(500).json({ success: false, message: 'Errore durante il salvataggio della password.' });
            
            // Log security event
            db.run('INSERT INTO security_logs (user_id, action) VALUES (?, ?)', [user.id, 'Ha reimpostato la password autonomamente']);
            
            res.json({ success: true, message: 'Password aggiornata con successo! Ora puoi accedere.' });
        });
    });
});

// --- SECURITY LOGS ---
app.get('/api/security-logs', authenticateToken, requireCondominio, isAdmin, (req, res) => {
    db.all(`SELECT s.*, u.nome, u.email 
            FROM security_logs s 
            JOIN users u ON s.user_id = u.id 
            JOIN user_condominios uc ON uc.user_id = u.id
            WHERE uc.condominio_id = ?
            ORDER BY s.created_at DESC LIMIT 50`, [req.condominio_id], (err, rows) => {
        if (err) return res.status(500).json({ success: false, error: err.message });
        res.json({ success: true, data: rows || [] });
    });
});


function logCommunicationSent({ condominio_id, user_id, destinatario, email, tipo, oggetto, contenuto_html, preview_url }) {
    db.run(
        'INSERT INTO convocations_log (condominio_id, user_id, destinatario, email, tipo, oggetto, contenuto_html, preview_url) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        [condominio_id, user_id || null, destinatario || '', email || '', tipo || 'Comunicazione', oggetto || '', contenuto_html || '', preview_url || ''],
        function(err) {
            if (err) {
                console.warn('Fallback insert convocations_log:', err.message);
                db.run(
                    'INSERT INTO convocations_log (condominio_id, user_id, destinatario, email, preview_url) VALUES (?, ?, ?, ?, ?)',
                    [condominio_id, user_id || null, destinatario || '', email || '', preview_url || '']
                );
            }
        }
    );
}

app.post('/api/assemblies/send-convocation', authenticateToken, requireCondominio, isAdmin, checkCondoLicenseWrite, async (req, res) => {
    const { userId, email, nome, htmlContent, activeCondoName } = req.body;
    
    if (!email) {
        return res.status(400).json({ success: false, message: 'Nessuna email associata a questo condomino.' });
    }

    let browser;
    try {
        if (!transporter) throw new Error("Servizio email non pronto");
        
        console.log("Generazione PDF in corso...");
        browser = await puppeteer.launch(getPuppeteerLaunchOptions());
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
            html: '<p>Gent.le <b>' + nome + '</b>,</p><p>In allegato alla presente trova la lettera ufficiale di convocazione per la prossima Assemblea Condominiale.</p><p>Restiamo a disposizione per qualsiasi chiarimento.<br><br>Cordiali saluti,<br><i>L\'Amministrazione</i></p>',
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
        
        // Log into database with complete archive details
        logCommunicationSent({
            condominio_id: req.condominio_id,
            user_id: userId,
            destinatario: nome,
            email: email,
            tipo: 'Convocazione Assemblea',
            oggetto: 'Convocazione Assemblea Condominiale',
            contenuto_html: htmlContent,
            preview_url: previewUrl
        });
        
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
    const sql = `
        SELECT cl.*, u.nome AS user_nome, uc.unita AS user_unita
        FROM convocations_log cl
        LEFT JOIN users u ON cl.user_id = u.id
        LEFT JOIN user_condominios uc ON u.id = uc.user_id AND uc.condominio_id = cl.condominio_id
        WHERE cl.condominio_id = ?
        ORDER BY cl.data_invio DESC
    `;
    db.all(sql, [req.condominio_id], (err, rows) => {
        if (err) {
            return db.all('SELECT * FROM convocations_log WHERE condominio_id = ? ORDER BY data_invio DESC', [req.condominio_id], (err2, rows2) => {
                if (err2) return res.status(500).json({ success: false, error: err2.message });
                res.json({ success: true, data: rows2 || [] });
            });
        }
        const enriched = (rows || []).map(r => {
            let tipo = r.tipo || '';
            let oggetto = r.oggetto || '';
            let nominativo = r.user_nome || '';
            const rawDest = r.destinatario || '';

            if (!tipo) {
                if (/^RICEVUTA:/i.test(rawDest)) {
                    tipo = 'Ricevuta di Pagamento';
                    if (!nominativo) nominativo = rawDest.replace(/^RICEVUTA:\s*/i, '').trim();
                    if (!oggetto) oggetto = 'Invio Ricevuta di Pagamento Quota Condominiale';
                } else if (/^SOLLECITO:/i.test(rawDest)) {
                    tipo = 'Sollecito di Pagamento';
                    if (!nominativo) nominativo = rawDest.replace(/^SOLLECITO:\s*/i, '').trim();
                    if (!oggetto) oggetto = 'Invio Sollecito di Pagamento Scaduto';
                } else if (/^COMUNICAZIONE:/i.test(rawDest)) {
                    tipo = 'Comunicazione / Circolare';
                    if (!oggetto) oggetto = rawDest.replace(/^COMUNICAZIONE:\s*/i, '').trim();
                    if (!nominativo) nominativo = 'Condòmino (' + (r.email || 'N/D') + ')';
                } else {
                    tipo = 'Convocazione Assemblea';
                    if (!nominativo) nominativo = rawDest || 'Condòmino';
                    if (!oggetto) oggetto = 'Convocazione Assemblea Condominiale';
                }
            } else {
                if (!nominativo) nominativo = rawDest || 'Condòmino';
                if (!oggetto) oggetto = tipo;
            }

            return {
                ...r,
                nominativo,
                unita: r.user_unita || '',
                tipo,
                oggetto
            };
        });
        res.json({ success: true, data: enriched });
    });
});

// ---------------------------------------------------------
// INVIO RICEVUTA PAGAMENTO
// ---------------------------------------------------------
app.post('/api/quotes/:id/send-receipt', authenticateToken, requireCondominio, isAdmin, checkCondoLicenseWrite, async (req, res) => {
    const quoteId = req.params.id;
    const { activeCondoName } = req.body;
    
    try {
        db.get('SELECT q.*, u.nome, u.email, uc.unita FROM quotes q JOIN users u ON q.user_id = u.id JOIN user_condominios uc ON u.id = uc.user_id AND uc.condominio_id = q.condominio_id WHERE q.id = ?', [quoteId], async (err, quote) => {
            if (err || !quote) return res.status(404).json({ success: false, message: 'Quota non trovata' });
            if (!quote.email) return res.status(400).json({ success: false, message: 'Nessuna email per questo condomino' });
            
            if (!transporter) throw new Error("Servizio email non pronto");
            
            let browser;
            try {
                browser = await puppeteer.launch(getPuppeteerLaunchOptions());
                const page = await browser.newPage();
                
                const htmlContent = `
                    <html>
                    <body style="font-family: Arial; padding: 40px; color: #333;">
                        <h2 style="text-align:center; border-bottom: 2px solid #333; padding-bottom:10px;">AMMINISTRAZIONE CONDOMINIO<br>${activeCondoName}</h2>
                        <h1 style="text-align:center; color: #16a34a; margin-top:40px;">RICEVUTA DI PAGAMENTO</h1>
                        <p style="text-align:right; margin-bottom:40px;">Data: ${new Date().toLocaleDateString('it-IT')}</p>
                        <p>Si attesta di aver ricevuto dal Sig./Sig.ra <b>${quote.nome}</b> (Unità: ${quote.unita || 'N/D'})</p>
                        <p>La somma di: <b style="font-size:24px;">€ ${quote.amount.toFixed(2)}</b></p>
                        <p>A titolo di saldo per la seguente causale:</p>
                        <div style="background: #f8fafc; padding: 20px; border: 1px solid #e2e8f0; border-radius: 8px;">
                            <strong>${quote.title}</strong><br>
                            Tipo Quota: ${quote.type}<br>
                            Scadenza originaria: ${new Date(quote.due_date).toLocaleDateString('it-IT')}
                        </div>
                        <p style="margin-top:50px; text-align:right;">L'Amministratore<br>___________________</p>
                    </body>
                    </html>
                `;
                
                await page.setContent(htmlContent, { waitUntil: 'networkidle0' });
                const pdfBuffer = await page.pdf({ format: 'A4', printBackground: true });
                await browser.close();
                
                let info = await transporter.sendMail({
                    from: '"Amministrazione Condominio" <admin@condominio.it>',
                    to: quote.email,
                    subject: 'Ricevuta di Pagamento - ' + activeCondoName,
                    html: '<p>Gent.le <b>' + quote.nome + '</b>,</p><p>La ringraziamo per il pagamento effettuato. In allegato trova la ricevuta in formato PDF.</p><p>Cordiali saluti,<br><i>L\'Amministrazione</i></p>',
                    attachments: [{ filename: 'Ricevuta_Pagamento.pdf', content: pdfBuffer, contentType: 'application/pdf' }]
                });

                const previewUrl = nodemailer.getTestMessageUrl(info) || '';
                
                logCommunicationSent({
                    condominio_id: req.condominio_id,
                    user_id: quote.user_id,
                    destinatario: quote.nome,
                    email: quote.email,
                    tipo: 'Ricevuta di Pagamento',
                    oggetto: `Ricevuta quota: ${quote.title} (€ ${Number(quote.amount).toFixed(2)})`,
                    contenuto_html: htmlContent,
                    preview_url: previewUrl
                });
                
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
app.post('/api/quotes/:id/send-reminder', authenticateToken, requireCondominio, isAdmin, checkCondoLicenseWrite, async (req, res) => {
    const quoteId = req.params.id;
    const { activeCondoName } = req.body;
    
    try {
        db.get('SELECT q.*, u.nome, u.email, uc.unita FROM quotes q JOIN users u ON q.user_id = u.id JOIN user_condominios uc ON u.id = uc.user_id AND uc.condominio_id = q.condominio_id WHERE q.id = ?', [quoteId], async (err, quote) => {
            if (err || !quote) return res.status(404).json({ success: false, message: 'Quota non trovata' });
            if (!quote.email) return res.status(400).json({ success: false, message: 'Nessuna email per questo condomino' });
            
            if (!transporter) throw new Error("Servizio email non pronto");
            
            let browser;
            try {
                browser = await puppeteer.launch(getPuppeteerLaunchOptions());
                const page = await browser.newPage();
                
                const htmlContent = `
                    <html>
                    <body style="font-family: Arial; padding: 40px; color: #333;">
                        <h2 style="text-align:center; border-bottom: 2px solid #333; padding-bottom:10px;">AMMINISTRAZIONE CONDOMINIO<br>${activeCondoName}</h2>
                        <h1 style="text-align:center; color: #dc2626; margin-top:40px;">SOLLECITO DI PAGAMENTO</h1>
                        <p style="text-align:right; margin-bottom:40px;">Data: ${new Date().toLocaleDateString('it-IT')}</p>
                        
                        <div style="text-align:right; margin-bottom: 30px;">
                            Spett.le<br>
                            <b>${quote.nome}</b><br>
                            Unità: ${quote.unita || 'N/D'}
                        </div>
                        
                        <p>Gentile Condòmino,</p>
                        <p>Dalla verifica contabile ad oggi effettuata, non ci risulta pervenuto il pagamento relativo alla seguente quota condominiale, ormai <b>scaduta</b>:</p>
                        
                        <div style="background: #fef2f2; padding: 20px; border: 1px solid #fecaca; border-radius: 8px; margin: 20px 0;">
                            <strong>${quote.title}</strong><br>
                            Importo da saldare: <b style="color:#dc2626; font-size:18px;">€ ${quote.amount.toFixed(2)}</b><br>
                            Scaduta il: ${new Date(quote.due_date).toLocaleDateString('it-IT')}
                        </div>
                        
                        <p>La invitiamo a provvedere al saldo nel più breve tempo possibile, per consentire la corretta e serena gestione del Condominio.</p>
                        <p>Qualora avesse già provveduto al pagamento, La preghiamo di non tenere conto della presente comunicazione.</p>
                        
                        <p style="margin-top:50px; text-align:right;">Distinti saluti,<br>L'Amministratore<br>___________________</p>
                    </body>
                    </html>
                `;
                
                await page.setContent(htmlContent, { waitUntil: 'networkidle0' });
                const pdfBuffer = await page.pdf({ format: 'A4', printBackground: true });
                await browser.close();
                
                let info = await transporter.sendMail({
                    from: '"Amministrazione Condominio" <admin@condominio.it>',
                    to: quote.email,
                    subject: 'Sollecito di Pagamento Scaduto - ' + activeCondoName,
                    html: '<p>Gent.le <b>' + quote.nome + '</b>,</p><p>Le scriviamo per ricordarLe una scadenza condominiale in sospeso. In allegato trova la lettera formale di sollecito con i dettagli dell\'importo.</p><p>Cordiali saluti,<br><i>L\'Amministrazione</i></p>',
                    attachments: [{ filename: 'Sollecito_Pagamento.pdf', content: pdfBuffer, contentType: 'application/pdf' }]
                });

                const previewUrl = nodemailer.getTestMessageUrl(info) || '';
                
                logCommunicationSent({
                    condominio_id: req.condominio_id,
                    user_id: quote.user_id,
                    destinatario: quote.nome,
                    email: quote.email,
                    tipo: 'Sollecito di Pagamento',
                    oggetto: `Sollecito quota: ${quote.title} (€ ${Number(quote.amount).toFixed(2)})`,
                    contenuto_html: htmlContent,
                    preview_url: previewUrl
                });
                
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
app.post('/api/communications/send', authenticateToken, requireCondominio, isAdmin, checkCondoLicenseWrite, async (req, res) => {
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
                browser = await puppeteer.launch(getPuppeteerLaunchOptions());
                
                // Formatta il messaggio con br per l'HTML
                const formattedMessage = message.replace(/\n/g, '<br>');
                
                for (const u of validUsers) {
                    const page = await browser.newPage();
                    const htmlContent = `
                        <html>
                        <body style="font-family: Arial; padding: 40px; color: #333;">
                            <h2 style="text-align:center; border-bottom: 2px solid #333; padding-bottom:10px;">AMMINISTRAZIONE CONDOMINIO<br>${activeCondoName}</h2>
                            <p style="text-align:right; margin-bottom:40px;">Data: ${new Date().toLocaleDateString('it-IT')}</p>
                            
                            <div style="text-align:right; margin-bottom: 30px;">
                                Spett.le<br>
                                <b>${u.nome}</b><br>
                                Unità: ${u.unita || 'N/D'}
                            </div>
                            
                            <h3 style="margin-bottom: 30px; border-bottom: 1px solid #ccc; padding-bottom:5px;">Oggetto: ${subject}</h3>
                            
                            <div style="line-height: 1.6;">
                                ${formattedMessage}
                            </div>
                            
                            <p style="margin-top:50px; text-align:right;">Cordiali saluti,<br>L'Amministratore<br>___________________</p>
                        </body>
                        </html>
                    `;
                    
                    await page.setContent(htmlContent, { waitUntil: 'networkidle0' });
                    const pdfBuffer = await page.pdf({ format: 'A4', printBackground: true, margin: { top: '30px', bottom: '30px', left: '30px', right: '30px' } });
                    await page.close();
                    
                    let info = await transporter.sendMail({
                        from: '"Amministrazione Condominio" <admin@condominio.it>',
                        to: u.email,
                        subject: subject + ' - ' + activeCondoName,
                        html: '<p>Gent.le <b>' + u.nome + '</b>,</p><p>In allegato alla presente le trasmettiamo una comunicazione da parte dell\'Amministrazione.</p>',
                        attachments: [{ filename: 'Comunicazione.pdf', content: pdfBuffer, contentType: 'application/pdf' }]
                    });

                    const previewUrl = nodemailer.getTestMessageUrl(info) || '';
                    
                    logCommunicationSent({
                        condominio_id: req.condominio_id,
                        user_id: u.id,
                        destinatario: u.nome,
                        email: u.email,
                        tipo: 'Comunicazione / Circolare',
                        oggetto: subject,
                        contenuto_html: htmlContent,
                        preview_url: previewUrl
                    });
                }
                
                await browser.close();
                res.json({ success: true, message: 'Comunicazioni inviate con successo a ' + validUsers.length + ' condòmini!' });
                
            } catch (e) {
                if(browser) await browser.close();
                console.error(e);
                res.status(500).json({ success: false, message: 'Errore durante l\'invio' });
            }
        });
    } catch (e) {
        res.status(500).json({ success: false });
    }
});


// ============================================================================
// SUPERUSER / PROPRIETARIO API (Cabina di Regia)
// ============================================================================

app.get('/api/superuser/overview', authenticateToken, requireSuperAdmin, (req, res) => {
    const condominiQuery = `
        SELECT c.*, 
            COALESCE(cf.module_contabilita, 1) as module_contabilita,
            COALESCE(cf.module_segnalazioni, 1) as module_segnalazioni,
            COALESCE(cf.module_assemblee, 1) as module_assemblee,
            COALESCE(cf.module_comunicazioni, 1) as module_comunicazioni,
            COALESCE(cf.module_banca, 1) as module_banca,
            COALESCE(cf.module_anagrafica, 1) as module_anagrafica,
            cl.plan_type,
            cl.license_status,
            cl.start_date as license_start_date,
            cl.end_date as license_end_date,
            cl.payment_status as license_payment_status,
            cl.payment_reference as license_payment_reference,
            cl.payment_amount as license_payment_amount,
            cl.payment_date as license_payment_date,
            COALESCE(cl.max_units, 50) as license_max_units,
            cl.notes as license_notes,
            (SELECT u.nome FROM user_condominios uc JOIN users u ON uc.user_id = u.id WHERE uc.condominio_id = c.id AND uc.role = 'admin' LIMIT 1) as admin_nome,
            (SELECT COUNT(*) FROM unita_immobiliari WHERE condominio_id = c.id) as current_units_count,
            (SELECT COUNT(*) FROM user_condominios WHERE condominio_id = c.id) as total_units
        FROM condominios c
        LEFT JOIN condo_features cf ON c.id = cf.condominio_id
        LEFT JOIN condo_licenses cl ON c.id = cl.condominio_id
        ORDER BY c.id ASC
    `;

    const usersQuery = `
        SELECT u.id, u.nome, u.email, u.is_superadmin, u.two_factor_enabled, u.privacy_accepted, u.created_at,
            (SELECT COUNT(*) FROM user_condominios uc WHERE uc.user_id = u.id) as condo_count,
            (SELECT GROUP_CONCAT(DISTINCT c.nome) FROM user_condominios uc JOIN condominios c ON uc.condominio_id = c.id WHERE uc.user_id = u.id) as condo_names,
            (SELECT MAX(CASE WHEN uc.role = 'admin' THEN 1 ELSE 0 END) FROM user_condominios uc WHERE uc.user_id = u.id) as is_admin_role
        FROM users u
        ORDER BY u.is_superadmin DESC, is_admin_role DESC, u.nome ASC
    `;

    db.all(condominiQuery, [], (err, condomini) => {
        if (err) return res.status(500).json({ success: false, message: 'Database error condomini' });
        
        db.all(usersQuery, [], (err2, users) => {
            if (err2) return res.status(500).json({ success: false, message: 'Database error users' });

            db.get(`
                SELECT 
                    (SELECT COUNT(*) FROM condominios) as total_condomini,
                    (SELECT COUNT(*) FROM users) as total_users,
                    (SELECT COUNT(DISTINCT user_id) FROM user_condominios WHERE role = 'admin') as total_admins,
                    (SELECT COUNT(*) FROM tickets) as total_tickets,
                    (SELECT COUNT(*) FROM journal_entries) as total_journal
            `, [], (err3, stats) => {
                const condominiWithLicense = (condomini || []).map(c => {
                    const rawLicense = {
                        plan_type: c.plan_type || 'completo',
                        license_status: c.license_status || 'active',
                        start_date: c.license_start_date || '2026-01-01',
                        end_date: c.license_end_date || '2026-12-31',
                        payment_status: c.license_payment_status || 'paid',
                        payment_reference: c.license_payment_reference || '',
                        payment_amount: c.license_payment_amount || 0,
                        payment_date: c.license_payment_date || '',
                        max_units: c.license_max_units || 50,
                        notes: c.license_notes || ''
                    };
                    return {
                        ...c,
                        license: computeLicenseInfo(rawLicense)
                    };
                });

                res.json({
                    success: true,
                    data: {
                        condomini: condominiWithLicense,
                        users: users || [],
                        stats: stats || {}
                    }
                });
            });
        });
    });
});

app.post('/api/superuser/condo-license', authenticateToken, requireSuperAdmin, (req, res) => {
    const { 
        condominioId, 
        plan_type, 
        license_status, 
        start_date, 
        end_date, 
        payment_status, 
        payment_reference, 
        payment_amount, 
        payment_date, 
        max_units, 
        notes,
        sync_modules
    } = req.body;

    if (!condominioId || !start_date || !end_date) {
        return res.status(400).json({ success: false, message: 'Condominio, Data Inizio e Data Fine obbligatorie' });
    }

    db.run(`
        INSERT INTO condo_licenses (
            condominio_id, plan_type, license_status, start_date, end_date, 
            payment_status, payment_reference, payment_amount, payment_date, 
            max_units, notes, updated_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
        ON CONFLICT(condominio_id) DO UPDATE SET
            plan_type = excluded.plan_type,
            license_status = excluded.license_status,
            start_date = excluded.start_date,
            end_date = excluded.end_date,
            payment_status = excluded.payment_status,
            payment_reference = excluded.payment_reference,
            payment_amount = excluded.payment_amount,
            payment_date = excluded.payment_date,
            max_units = excluded.max_units,
            notes = excluded.notes,
            updated_at = CURRENT_TIMESTAMP
    `, [
        condominioId,
        plan_type || 'completo',
        license_status || 'active',
        start_date,
        end_date,
        payment_status || 'paid',
        payment_reference || '',
        parseFloat(payment_amount) || 0,
        payment_date || null,
        parseInt(max_units, 10) || 50,
        notes || ''
    ], function(err) {
        if (err) {
            console.error('Error saving condo license:', err);
            return res.status(500).json({ success: false, message: 'Errore salvataggio licenza' });
        }

        // Se richiesto, sincronizza i moduli attivi in base al piano scelto
        if (sync_modules) {
            let m_contab = 1, m_guasti = 1, m_assem = 1, m_comun = 1, m_banca = 1, m_anagr = 1;
            if (plan_type === 'base') {
                m_contab = 1; m_guasti = 0; m_assem = 0; m_comun = 0; m_banca = 0; m_anagr = 1;
            } else if (plan_type === 'standard') {
                m_contab = 1; m_guasti = 1; m_assem = 0; m_comun = 1; m_banca = 0; m_anagr = 1;
            }
            db.run(`
                INSERT INTO condo_features (condominio_id, module_contabilita, module_segnalazioni, module_assemblee, module_comunicazioni, module_banca, module_anagrafica)
                VALUES (?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(condominio_id) DO UPDATE SET
                    module_contabilita = excluded.module_contabilita,
                    module_segnalazioni = excluded.module_segnalazioni,
                    module_assemblee = excluded.module_assemblee,
                    module_comunicazioni = excluded.module_comunicazioni,
                    module_banca = excluded.module_banca,
                    module_anagrafica = excluded.module_anagrafica
            `, [condominioId, m_contab, m_guasti, m_assem, m_comun, m_banca, m_anagr]);
        }

        logAudit(req.user.id, condominioId, `SuperUser Rilascio Licenza (${plan_type})`, 'condo_licenses', condominioId, req.body, req.ip);
        res.json({ success: true, message: 'Licenza condominiale rilasciata e attivata con successo!' });
    });
});

app.post('/api/superuser/condo-features', authenticateToken, requireSuperAdmin, (req, res) => {
    const { condominioId, module_contabilita, module_segnalazioni, module_assemblee, module_comunicazioni, module_banca, module_anagrafica } = req.body;
    if (!condominioId) return res.status(400).json({ success: false, message: 'ID Condominio mancante' });

    db.run(`
        INSERT INTO condo_features (condominio_id, module_contabilita, module_segnalazioni, module_assemblee, module_comunicazioni, module_banca, module_anagrafica)
        VALUES (?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(condominio_id) DO UPDATE SET
            module_contabilita = excluded.module_contabilita,
            module_segnalazioni = excluded.module_segnalazioni,
            module_assemblee = excluded.module_assemblee,
            module_comunicazioni = excluded.module_comunicazioni,
            module_banca = excluded.module_banca,
            module_anagrafica = excluded.module_anagrafica
    `, [condominioId, module_contabilita ? 1 : 0, module_segnalazioni ? 1 : 0, module_assemblee ? 1 : 0, module_comunicazioni ? 1 : 0, module_banca ? 1 : 0, module_anagrafica ? 1 : 0], function(err) {
        if (err) {
            console.error('Error saving condo features:', err);
            return res.status(500).json({ success: false, message: 'Errore salvataggio permessi moduli' });
        }
        logAudit(req.user.id, condominioId, 'SuperUser Aggiornamento Moduli', 'condo_features', condominioId, req.body, req.ip);
        res.json({ success: true, message: 'Impostazioni moduli aggiornate con successo' });
    });
});

app.post('/api/superuser/reset-user-password', authenticateToken, requireSuperAdmin, (req, res) => {
    const { userId, newPassword, temporaryPassword } = req.body;
    if (!userId) return res.status(400).json({ success: false, message: 'ID Utente mancante' });

    const passwordToSet = (newPassword && newPassword.trim()) || (temporaryPassword && temporaryPassword.trim()) || 'SuperReset2026!';
    const passwordHash = bcrypt.hashSync(passwordToSet, 10);

    db.run('UPDATE users SET password_hash = ? WHERE id = ?', [passwordHash, userId], function(err) {
        if (err) return res.status(500).json({ success: false, message: 'Errore durante il reset della password' });
        logAudit(req.user.id, null, 'SuperUser Reset Password Utente', 'users', userId, null, req.ip);
        res.json({ 
            success: true, 
            message: `Password reimpostata con successo per l'utente #${userId}`, 
            temporaryPassword: passwordToSet 
        });
    });
});

app.post('/api/superuser/reset-user-2fa', authenticateToken, requireSuperAdmin, (req, res) => {
    const { userId } = req.body;
    if (!userId) return res.status(400).json({ success: false, message: 'ID Utente mancante' });

    db.run('UPDATE users SET two_factor_enabled = 0, two_factor_secret = NULL, backup_codes = NULL, otp_code = NULL, otp_expires = NULL WHERE id = ?', [userId], function(err) {
        if (err) return res.status(500).json({ success: false, message: 'Errore durante l\'azzeramento del 2FA' });
        logAudit(req.user.id, null, 'SuperUser Reset 2FA Utente', 'users', userId, null, req.ip);
        res.json({ success: true, message: 'Doppia autenticazione (2FA) rimossa con successo per l\'utente' });
    });
});

app.post('/api/superuser/toggle-user-role', authenticateToken, requireSuperAdmin, (req, res) => {
    const { userId, makeAdmin, condominioId } = req.body;
    if (!userId) return res.status(400).json({ success: false, message: 'ID Utente mancante' });

    const newRole = makeAdmin ? 'admin' : 'condomino';
    let query = 'UPDATE user_condominios SET role = ? WHERE user_id = ?';
    const params = [newRole, userId];
    if (condominioId) {
        query += ' AND condominio_id = ?';
        params.push(condominioId);
    }

    db.run(query, params, function(err) {
        if (err) return res.status(500).json({ success: false, message: 'Errore aggiornamento ruolo' });
        logAudit(req.user.id, condominioId || null, `SuperUser Cambio Ruolo (${newRole})`, 'user_condominios', userId, { newRole }, req.ip);
        res.json({ success: true, message: `Ruolo aggiornato a "${newRole}"` });
    });
});

app.post('/api/superuser/reset-condo-data', authenticateToken, requireSuperAdmin, (req, res) => {
    const { condominioId, resetType } = req.body;
    if (!condominioId || !resetType) return res.status(400).json({ success: false, message: 'Parametri mancanti per il reset' });

    db.serialize(() => {
        if (resetType === 'contabilita') {
            db.run('DELETE FROM journal_entries WHERE condominio_id = ?', [condominioId]);
            db.run('DELETE FROM supplier_payments WHERE condominio_id = ?', [condominioId]);
            db.run('DELETE FROM quotes WHERE condominio_id = ?', [condominioId]);
            logAudit(req.user.id, condominioId, 'SuperUser Reset Contabilità', 'journal_entries/quotes', condominioId, null, req.ip);
            return res.json({ success: true, message: 'Tutti i movimenti contabili di test del condominio sono stati azzerati!' });
        } else if (resetType === 'tickets') {
            db.run('DELETE FROM ticket_updates WHERE ticket_id IN (SELECT id FROM tickets WHERE condominio_id = ?)', [condominioId]);
            db.run('DELETE FROM tickets WHERE condominio_id = ?', [condominioId]);
            logAudit(req.user.id, condominioId, 'SuperUser Reset Segnalazioni', 'tickets', condominioId, null, req.ip);
            return res.json({ success: true, message: 'Tutte le segnalazioni e comunicazioni di prova sono state azzerate!' });
        } else {
            return res.status(400).json({ success: false, message: 'Tipo di reset non supportato' });
        }
    });
});

app.post('/api/superuser/create-condo-admin', authenticateToken, requireSuperAdmin, (req, res) => {
    try {
        const {
            nomeCondominio,
            indirizzo,
            cf,
            scala,
            isNewAdmin,
            existingUserId,
            adminNome,
            adminEmail,
            adminPassword,
            adminTelefono,
            plan_type,
            max_units,
            duration_months,
            payment_status,
            payment_amount,
            sendWelcomeEmail
        } = req.body;

        if (!nomeCondominio || !nomeCondominio.trim()) {
            return res.status(400).json({ success: false, message: 'Il nome del condominio è obbligatorio' });
        }
        if (!indirizzo || !indirizzo.trim()) {
            return res.status(400).json({ success: false, message: 'L\'indirizzo del condominio è obbligatorio' });
        }

        const assignAdminToCondo = (userId, adminFullName, adminContactEmail, isNewCreatedUser, plainPassword) => {
            db.run(`
                INSERT INTO condominios (nome, indirizzo, cf, scala, admin_nome, admin_email, admin_telefono, created_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
            `, [
                nomeCondominio.trim(),
                indirizzo.trim(),
                cf ? cf.trim() : null,
                scala ? scala.trim() : null,
                adminFullName || null,
                adminContactEmail || null,
                adminTelefono ? adminTelefono.trim() : null
            ], function(errCondo) {
                if (errCondo) {
                    console.error('Errore inserimento condominio:', errCondo);
                    return res.status(500).json({ success: false, message: 'Errore creazione condominio: ' + errCondo.message });
                }

                const newCondoId = this.lastID;

                // Associa Amministratore in user_condominios con role = 'admin'
                db.run(`
                    INSERT INTO user_condominios (user_id, condominio_id, role, unita)
                    VALUES (?, ?, 'admin', 'Studio Amministrazione')
                    ON CONFLICT(user_id, condominio_id) DO UPDATE SET role = 'admin'
                `, [userId, newCondoId], function(errUc) {
                    if (errUc) console.error('Errore associazione user_condominios:', errUc);

                    // Calcolo date licenza
                    const now = new Date();
                    const startDate = now.toISOString().split('T')[0];
                    const months = parseInt(duration_months, 10) || 12;
                    const end = new Date(now.getTime());
                    end.setMonth(end.getMonth() + months);
                    const endDate = end.toISOString().split('T')[0];

                    db.run(`
                        INSERT INTO condo_licenses (
                            condominio_id, plan_type, license_status, start_date, end_date,
                            payment_status, payment_amount, max_units, created_at, updated_at
                        ) VALUES (?, ?, 'active', ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
                        ON CONFLICT(condominio_id) DO UPDATE SET
                            plan_type = excluded.plan_type,
                            license_status = excluded.license_status,
                            start_date = excluded.start_date,
                            end_date = excluded.end_date,
                            payment_status = excluded.payment_status,
                            payment_amount = excluded.payment_amount,
                            max_units = excluded.max_units,
                            updated_at = CURRENT_TIMESTAMP
                    `, [
                        newCondoId,
                        plan_type || 'completo',
                        startDate,
                        endDate,
                        payment_status || 'paid',
                        parseFloat(payment_amount) || 240.00,
                        parseInt(max_units, 10) || 50
                    ], function(errLic) {
                        if (errLic) console.error('Errore inserimento licenza:', errLic);

                        // Abilita tutti i moduli per il nuovo condominio
                        db.run(`
                            INSERT INTO condo_features (condominio_id, module_contabilita, module_segnalazioni, module_assemblee, module_comunicazioni, module_banca, module_anagrafica)
                            VALUES (?, 1, 1, 1, 1, 1, 1)
                            ON CONFLICT(condominio_id) DO UPDATE SET
                                module_contabilita = 1, module_segnalazioni = 1, module_assemblee = 1,
                                module_comunicazioni = 1, module_banca = 1, module_anagrafica = 1
                        `, [newCondoId], function(errFeat) {
                            if (errFeat) console.error('Errore inserimento features:', errFeat);

                            // Audit Log
                            logAudit(
                                req.user.id,
                                newCondoId,
                                `SuperUser Crea Condominio & Assegna Amministratore: "${nomeCondominio}" ad ${adminFullName} (${adminContactEmail})`,
                                'condominios',
                                newCondoId,
                                req.body,
                                req.ip
                            );

                            // Notifica email facoltativa
                            if (sendWelcomeEmail && adminContactEmail && typeof transporter !== 'undefined' && transporter) {
                                try {
                                    const mailOptions = {
                                        from: process.env.SMTP_FROM || '"Condominio Trasparente" <noreply@condominiotrasparente.com>',
                                        to: adminContactEmail,
                                        subject: `Attivazione Spazio Condominiale: ${nomeCondominio} - Condominio Trasparente`,
                                        html: `
                                            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; border: 1px solid #e2e8f0; border-radius: 16px; background: #ffffff;">
                                                <h2 style="color: #4f46e5; margin-top: 0;">Benvenuto su Condominio Trasparente</h2>
                                                <p style="font-size: 14px; color: #334155;">Gentile <b>${adminFullName}</b>,</p>
                                                <p style="font-size: 14px; color: #334155;">È stato attivato il tuo nuovo spazio di gestione per lo stabile <b>${nomeCondominio}</b>.</p>
                                                <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; padding: 18px; border-radius: 12px; margin: 20px 0;">
                                                    <p style="margin: 0 0 10px 0; font-size: 14px;"><strong>Pannello di Accesso:</strong> <a href="https://www.condominiotrasparente.com/login.html" style="color: #4f46e5; font-weight: bold;">www.condominiotrasparente.com</a></p>
                                                    <p style="margin: 0 0 8px 0; font-size: 14px;"><strong>Email:</strong> ${adminContactEmail}</p>
                                                    ${isNewCreatedUser ? `<p style="margin: 0; font-size: 14px;"><strong>Password Temporanea:</strong> <code style="background: #e2e8f0; padding: 3px 8px; border-radius: 6px; font-weight: bold; color: #1e293b;">${plainPassword}</code></p>` : `<p style="margin: 0; font-size: 14px; color: #64748b;">(Accedi con la password abituale del tuo account)</p>`}
                                                </div>
                                                <p style="font-size: 13px; color: #64748b;">Al primo accesso potrai impostare i dati bancari del condominio, inserire le unità immobiliari e consultare la guida rapida.</p>
                                                <hr style="border: 0; border-top: 1px solid #e2e8f0; margin: 24px 0;" />
                                                <p style="font-size: 11px; color: #94a3b8; margin: 0;">Condominio Trasparente - Piattaforma SaaS di Gestione Condominiale</p>
                                            </div>
                                        `
                                    };
                                    transporter.sendMail(mailOptions, (mailErr) => {
                                        if (mailErr) console.warn('Avviso invio email benvenuto:', mailErr.message);
                                        else console.log('✅ Email di benvenuto inviata con successo a:', adminContactEmail);
                                    });
                                } catch (mErr) {
                                    console.warn('Errore sendMail:', mErr.message);
                                }
                            }

                            return res.json({
                                success: true,
                                message: `Condominio "${nomeCondominio}" creato con successo e assegnato ad ${adminFullName}!`,
                                data: {
                                    condominioId: newCondoId,
                                    nome: nomeCondominio,
                                    adminUserId: userId,
                                    adminNome: adminFullName,
                                    adminEmail: adminContactEmail,
                                    isNewUser: isNewCreatedUser,
                                    temporaryPassword: isNewCreatedUser ? plainPassword : null
                                }
                            });
                        });
                    });
                });
            });
        };

        // Modalità: Assegna ad amministratore esistente
        if (isNewAdmin === false || isNewAdmin === 'false') {
            if (!existingUserId) {
                return res.status(400).json({ success: false, message: 'Seleziona un utente amministratore esistente' });
            }
            db.get('SELECT id, nome, email FROM users WHERE id = ?', [existingUserId], (errUser, existingUser) => {
                if (errUser || !existingUser) {
                    return res.status(404).json({ success: false, message: 'Utente selezionato non trovato' });
                }
                assignAdminToCondo(existingUser.id, existingUser.nome, existingUser.email, false, null);
            });
        } else {
            // Modalità: Crea nuovo amministratore
            if (!adminNome || !adminNome.trim()) {
                return res.status(400).json({ success: false, message: 'Il nome dell\'amministratore è obbligatorio' });
            }
            if (!adminEmail || !adminEmail.trim()) {
                return res.status(400).json({ success: false, message: 'L\'email dell\'amministratore è obbligatoria' });
            }

            const cleanEmail = adminEmail.trim().toLowerCase();
            const passwordToUse = (adminPassword && adminPassword.trim()) ? adminPassword.trim() : ('Admin' + Math.floor(1000 + Math.random() * 9000) + '!');
            const hash = bcrypt.hashSync(passwordToUse, 10);

            // Verifica se email è già registrata
            db.get('SELECT id, nome, email FROM users WHERE LOWER(email) = ?', [cleanEmail], (errCheck, existingUserWithEmail) => {
                if (errCheck) {
                    return res.status(500).json({ success: false, message: 'Errore verifica email nel database' });
                }
                if (existingUserWithEmail) {
                    // L'utente esiste già: lo colleghiamo come admin al nuovo condominio
                    assignAdminToCondo(existingUserWithEmail.id, existingUserWithEmail.nome, existingUserWithEmail.email, false, null);
                } else {
                    // Creiamo il nuovo utente
                    db.run(`
                        INSERT INTO users (nome, email, password_hash, telefono, created_at)
                        VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
                    `, [adminNome.trim(), cleanEmail, hash, adminTelefono ? adminTelefono.trim() : null], function(errNewUser) {
                        if (errNewUser) {
                            console.error('Errore creazione nuovo utente amministratore:', errNewUser);
                            return res.status(500).json({ success: false, message: 'Errore creazione utente: ' + errNewUser.message });
                        }
                        const newUserId = this.lastID;
                        assignAdminToCondo(newUserId, adminNome.trim(), cleanEmail, true, passwordToUse);
                    });
                }
            });
        }
    } catch (e) {
        console.error('Errore imprevisto create-condo-admin:', e);
        res.status(500).json({ success: false, message: 'Errore interno del server: ' + e.message });
    }
});

// ============================================================================
// PRIMO INSERIMENTO CONDOMINIO & ABILITAZIONE AMMINISTRATORE (SUPERUSER)
// ============================================================================
app.post('/api/superadmin/condomini', checkSuperuser, async (req, res) => {
    const { nome, indirizzo, codice_fiscale, amministratore_id } = req.body;

    // Validazione input obbligatori
    if (!nome || !indirizzo || !codice_fiscale || !amministratore_id) {
        return res.status(400).json({
            success: false,
            errore: 'Tutti i campi sono obbligatori: nome, indirizzo, codice_fiscale, amministratore_id.'
        });
    }

    const cfPulito = String(codice_fiscale).trim().toUpperCase();
    const adminId = parseInt(amministratore_id, 10);
    if (isNaN(adminId)) {
        return res.status(400).json({
            success: false,
            errore: 'amministratore_id deve essere un valore numerico valido.'
        });
    }

    // Gestione transazione atomica con connection pooling mysql2 (o fallback db)
    let connection;
    try {
        if (db.pool && typeof db.pool.promise === 'function') {
            connection = await db.pool.promise().getConnection();
            await connection.beginTransaction();

            // 1. Verifica esistenza dell'amministratore designato
            const [userRows] = await connection.query(
                'SELECT id, nome, email, ruolo FROM users WHERE id = ? FOR UPDATE',
                [adminId]
            );

            if (!userRows || userRows.length === 0) {
                await connection.rollback();
                return res.status(404).json({
                    success: false,
                    errore: `Nessun utente/amministratore trovato con ID ${adminId}.`
                });
            }

            // 2. Inserimento nuovo condominio nella tabella condomini
            const [condoResult] = await connection.query(
                'INSERT INTO condomini (nome, indirizzo, codice_fiscale, amministratore_id, creato_il) VALUES (?, ?, ?, ?, NOW())',
                [nome.trim(), indirizzo.trim(), cfPulito, adminId]
            );
            const nuovoCondominioId = condoResult.insertId;

            // Allineamento opzionale alle tabelle di sistema condominios e user_condominios
            await connection.query(
                'INSERT INTO condominios (id, nome, indirizzo, cf, created_at) VALUES (?, ?, ?, ?, NOW()) ON DUPLICATE KEY UPDATE nome = VALUES(nome), indirizzo = VALUES(indirizzo), cf = VALUES(cf)',
                [nuovoCondominioId, nome.trim(), indirizzo.trim(), cfPulito]
            ).catch(() => {});

            await connection.query(
                'INSERT INTO user_condominios (user_id, condominio_id, role, unita) VALUES (?, ?, "admin", "Studio Amministrazione") ON DUPLICATE KEY UPDATE role = "admin"',
                [adminId, nuovoCondominioId]
            ).catch(() => {});

            // 3. Aggiornamento stato amministratore ad 'Abilitato' (is_active = 1, ruolo = 'amministratore')
            await connection.query(
                'UPDATE users SET ruolo = "amministratore", is_active = 1, stato_abilitazione = "Abilitato" WHERE id = ?',
                [adminId]
            );

            // Commit atomico della transazione
            await connection.commit();

            return res.status(201).json({
                success: true,
                messaggio: 'Condominio creato con successo e amministratore abilitato alle funzionalità gestionali.',
                dati: {
                    condominio: {
                        id: nuovoCondominioId,
                        nome: nome.trim(),
                        indirizzo: indirizzo.trim(),
                        codice_fiscale: cfPulito,
                        amministratore_id: adminId
                    },
                    amministratore: {
                        id: adminId,
                        nome: userRows[0].nome,
                        email: userRows[0].email,
                        ruolo: 'amministratore',
                        is_active: 1,
                        stato_abilitazione: 'Abilitato'
                    }
                }
            });
        } else {
            // Fallback database SQLite / generico
            const user = await new Promise((resolve, reject) => {
                db.get('SELECT id, nome, email, ruolo FROM users WHERE id = ?', [adminId], (err, row) => {
                    if (err) reject(err); else resolve(row);
                });
            });
            if (!user) {
                return res.status(404).json({ success: false, errore: `Nessun utente trovato con ID ${adminId}.` });
            }

            const condoId = await new Promise((resolve, reject) => {
                db.run(
                    'INSERT INTO condomini (nome, indirizzo, codice_fiscale, amministratore_id, creato_il) VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)',
                    [nome.trim(), indirizzo.trim(), cfPulito, adminId],
                    function(err) {
                        if (err) reject(err); else resolve(this.lastID);
                    }
                );
            });

            await new Promise((resolve, reject) => {
                db.run(
                    'UPDATE users SET ruolo = "amministratore", is_active = 1, stato_abilitazione = "Abilitato" WHERE id = ?',
                    [adminId],
                    function(err) {
                        if (err) reject(err); else resolve(this.changes);
                    }
                );
            });

            return res.status(201).json({
                success: true,
                messaggio: 'Condominio creato con successo e amministratore abilitato alle funzionalità gestionali.',
                dati: {
                    condominio: { id: condoId, nome: nome.trim(), indirizzo: indirizzo.trim(), codice_fiscale: cfPulito, amministratore_id: adminId },
                    amministratore: { id: adminId, ruolo: 'amministratore', is_active: 1, stato_abilitazione: 'Abilitato' }
                }
            });
        }
    } catch (error) {
        if (connection) {
            try { await connection.rollback(); } catch (rbErr) { console.error('Errore durante rollback:', rbErr); }
        }
        if (error.code === 'ER_DUP_ENTRY' || (error.message && error.message.includes('UNIQUE constraint failed'))) {
            return res.status(409).json({
                success: false,
                errore: 'Esiste già un condominio registrato con questo Codice Fiscale.'
            });
        }
        console.error('❌ [Superadmin API] Errore inserimento condominio e abilitazione amministratore:', error);
        return res.status(500).json({
            success: false,
            errore: 'Errore interno del server durante la transazione.',
            dettaglio: error.message
        });
    } finally {
        if (connection) {
            try { connection.release(); } catch (relErr) { console.error('Errore durante release connection:', relErr); }
        }
    }
});

// ==========================================
// ROTTA API: CREAZIONE CONDOMINIO E ABILITAZIONE AMMINISTRATORE (SUPERUSER)
// ==========================================
app.post('/api/superuser/crea-condominio', verifyJWT, checkSuperuser, async (req, res) => {
    const { nome, indirizzo, codice_fiscale, amministratore_email } = req.body;

    // Validazione base dei campi obbligatori
    if (!nome || !indirizzo || !codice_fiscale || !amministratore_email) {
        return res.status(400).json({ success: false, error: 'Tutti i campi sono obbligatori.' });
    }

    const cfPulito = String(codice_fiscale).trim().toUpperCase();
    const cleanEmail = String(amministratore_email).trim().toLowerCase();

    let connection;

    try {
        if (db.pool && typeof db.pool.promise === 'function') {
            // Ottieni una connessione dal pool per eseguire una transazione sicura
            connection = await db.getConnection();
            await connection.beginTransaction();

            // 1. Verifica se l'amministratore esiste nel sistema tramite email
            const [users] = await connection.query(
                'SELECT id, ruolo FROM utenti WHERE email = ?', 
                [cleanEmail]
            );

            if (!users || users.length === 0) {
                await connection.rollback();
                return res.status(404).json({ success: false, error: 'Nessun utente trovato con questa email.' });
            }

            const admin = users[0];

            if (admin.ruolo !== 'amministratore') {
                await connection.rollback();
                return res.status(400).json({ success: false, error: 'L\'utente specificato non ha il ruolo di Amministratore.' });
            }

            // 2. Inserisci il nuovo condominio associandolo all'amministratore trovato
            const [condoResult] = await connection.query(
                'INSERT INTO condomini (nome, indirizzo, codice_fiscale, amministratore_id) VALUES (?, ?, ?, ?)',
                [nome.trim(), indirizzo.trim(), cfPulito, admin.id]
            );
            const nuovoCondominioId = condoResult.insertId;

            // Allineamento tabelle del portale per immediata operatività
            await connection.query(
                'INSERT INTO condominios (id, nome, indirizzo, cf, created_at) VALUES (?, ?, ?, ?, NOW()) ON DUPLICATE KEY UPDATE nome = VALUES(nome), indirizzo = VALUES(indirizzo), cf = VALUES(cf)',
                [nuovoCondominioId, nome.trim(), indirizzo.trim(), cfPulito]
            ).catch(() => {});

            await connection.query(
                'INSERT INTO user_condominios (user_id, condominio_id, role, unita) VALUES (?, ?, "admin", "Studio Amministrazione") ON DUPLICATE KEY UPDATE role = "admin"',
                [admin.id, nuovoCondominioId]
            ).catch(() => {});

            // 3. Abilita l'amministratore cambiando il suo stato a 1 (Attivo)
            await connection.query(
                'UPDATE utenti SET is_active = 1, stato_abilitazione = "Abilitato" WHERE id = ?',
                [admin.id]
            );

            // Se tutto va a buon fine, conferma la transazione sul database MySQL
            await connection.commit();

            return res.status(201).json({
                success: true,
                message: 'Condominio creato con successo e Amministratore abilitato alla gestione.',
                condominioId: nuovoCondominioId
            });
        } else {
            // Fallback universale SQLite
            const user = await new Promise((resolve, reject) => {
                db.get('SELECT id, ruolo FROM utenti WHERE LOWER(email) = ?', [cleanEmail], (err, row) => {
                    if (err) reject(err); else resolve(row);
                });
            });

            if (!user) {
                return res.status(404).json({ success: false, error: 'Nessun utente trovato con questa email.' });
            }

            if (user.ruolo !== 'amministratore') {
                return res.status(400).json({ success: false, error: 'L\'utente specificato non ha il ruolo di Amministratore.' });
            }

            const condoId = await new Promise((resolve, reject) => {
                db.run(
                    'INSERT INTO condomini (nome, indirizzo, codice_fiscale, amministratore_id) VALUES (?, ?, ?, ?)',
                    [nome.trim(), indirizzo.trim(), cfPulito, user.id],
                    function(err) {
                        if (err) reject(err); else resolve(this.lastID);
                    }
                );
            });

            await new Promise((resolve, reject) => {
                db.run('UPDATE utenti SET is_active = 1, stato_abilitazione = "Abilitato" WHERE id = ?', [user.id], function(err) {
                    if (err) reject(err); else resolve(this.changes);
                });
            });

            return res.status(201).json({
                success: true,
                message: 'Condominio creato con successo e Amministratore abilitato alla gestione.',
                condominioId: condoId
            });
        }
    } catch (error) {
        if (connection) await connection.rollback();
        if (error.code === 'ER_DUP_ENTRY' || (error.message && error.message.includes('UNIQUE constraint'))) {
            return res.status(409).json({ success: false, error: 'Esiste già un condominio registrato con questo Codice Fiscale.' });
        }
        console.error('Errore durante la transazione del Superuser:', error);
        return res.status(500).json({ success: false, error: 'Errore interno del server durante l\'inserimento.' });
    } finally {
        if (connection) connection.release();
    }
});

// ============================================================================
// DASHBOARD PRIVATA CONDOMINO & CARD RIEPILOGO FINANZIARIO RISERVATO
// ============================================================================
app.get('/api/condomino/dashboard', verifyJWT, async (req, res) => {
    const userId = req.user.id;
    let condoId = req.query.condominio_id || req.headers['x-condominio-id'];

    let connection;
    try {
        if (db.pool && typeof db.pool.promise === 'function') {
            connection = await db.getConnection();

            // 1. Identificazione associazione del condomino allo stabile (multi-tabella fail-safe)
            let condominoProfile = null;

            // Tentativo 1: Tabella condomino_condominio + condomini
            if (condoId) {
                const [rows] = await connection.query(`
                    SELECT cc.condominio_id, cc.interno, cc.millesimi, 
                           COALESCE(c.nome, 'Condominio') AS condominio_nome, COALESCE(c.indirizzo, '') AS indirizzo, COALESCE(c.codice_fiscale, '') AS codice_fiscale,
                           u.id AS condomino_id, u.nome AS condomino_nome, u.email AS condomino_email
                    FROM condomino_condominio cc
                    LEFT JOIN condomini c ON cc.condominio_id = c.id
                    JOIN users u ON cc.condomino_id = u.id
                    WHERE cc.condomino_id = ? AND cc.condominio_id = ?
                    LIMIT 1
                `, [userId, condoId]);
                if (rows && rows.length > 0) condominoProfile = rows[0];
            } else {
                const [rows] = await connection.query(`
                    SELECT cc.condominio_id, cc.interno, cc.millesimi, 
                           COALESCE(c.nome, 'Condominio') AS condominio_nome, COALESCE(c.indirizzo, '') AS indirizzo, COALESCE(c.codice_fiscale, '') AS codice_fiscale,
                           u.id AS condomino_id, u.nome AS condomino_nome, u.email AS condomino_email
                    FROM condomino_condominio cc
                    LEFT JOIN condomini c ON cc.condominio_id = c.id
                    JOIN users u ON cc.condomino_id = u.id
                    WHERE cc.condomino_id = ?
                    ORDER BY cc.id DESC
                    LIMIT 1
                `, [userId]);
                if (rows && rows.length > 0) condominoProfile = rows[0];
            }

            // Tentativo 2: Tabella legacy user_condominios + unita_immobiliari + condominios
            if (!condominoProfile) {
                const condoFilter = condoId ? 'AND uc.condominio_id = ?' : '';
                const params = condoId ? [userId, condoId] : [userId];
                const [legacyRows] = await connection.query(`
                    SELECT uc.condominio_id,
                           COALESCE(ui.identificativo, uc.unita, 'Unità Condominiale') AS interno,
                           COALESCE(ui.millesimi_proprieta, 0.00) AS millesimi,
                           COALESCE(co.nome, c.nome, 'Condominio') AS condominio_nome,
                           COALESCE(co.indirizzo, c.indirizzo, '') AS indirizzo,
                           COALESCE(co.cf, c.codice_fiscale, '') AS codice_fiscale,
                           u.id AS condomino_id, u.nome AS condomino_nome, u.email AS condomino_email
                    FROM user_condominios uc
                    JOIN users u ON uc.user_id = u.id
                    LEFT JOIN condominios co ON uc.condominio_id = co.id
                    LEFT JOIN condomini c ON uc.condominio_id = c.id
                    LEFT JOIN unita_immobiliari ui ON (ui.condominio_id = uc.condominio_id AND (ui.user_id = u.id OR ui.proprietario_id = u.id OR ui.conduttore_id = u.id))
                    WHERE uc.user_id = ? ${condoFilter}
                    ORDER BY uc.id DESC
                    LIMIT 1
                `, params);
                if (legacyRows && legacyRows.length > 0) condominoProfile = legacyRows[0];
            }

            // Tentativo 3: Se utente è Amministratore o Superuser, oppure non ha unità assegnata
            if (!condominoProfile) {
                let targetCondoId = condoId;
                let condoInfo = null;
                if (targetCondoId) {
                    const [cRows] = await connection.query(
                        'SELECT id, nome, indirizzo, COALESCE(cf, "") AS codice_fiscale FROM condominios WHERE id = ? UNION SELECT id, nome, indirizzo, codice_fiscale FROM condomini WHERE id = ? LIMIT 1',
                        [targetCondoId, targetCondoId]
                    );
                    if (cRows && cRows.length > 0) condoInfo = cRows[0];
                }
                if (!condoInfo) {
                    const [cRows] = await connection.query(
                        'SELECT id, nome, indirizzo, COALESCE(cf, "") AS codice_fiscale FROM condominios ORDER BY id ASC LIMIT 1'
                    );
                    if (cRows && cRows.length > 0) condoInfo = cRows[0];
                }

                const isAdminUser = req.user.is_superadmin || req.user.ruolo === 'superuser' || req.user.ruolo === 'amministratore' || req.user.role === 'admin' || (condominoProfile && condominoProfile.role === 'admin');
                if (condominoProfile && isAdminUser) condominoProfile.is_admin_view = true;
                condominoProfile = {
                    condominio_id: condoInfo ? condoInfo.id : (condoId || 1),
                    condominio_nome: condoInfo ? condoInfo.nome : 'Condominio',
                    indirizzo: condoInfo ? condoInfo.indirizzo : '',
                    codice_fiscale: condoInfo ? condoInfo.codice_fiscale : '',
                    condomino_id: userId,
                    condomino_nome: req.user.nome || 'Utente',
                    condomino_email: req.user.email || '',
                    interno: isAdminUser ? 'Studio Amministrazione' : 'Unità Condominiale',
                    millesimi: 0.00,
                    is_admin_view: isAdminUser
                };
            }

            const activeCondoId = condominoProfile.condominio_id;

            // 2. Dettaglio scadenze personali da spese_scadenze
            let [personalScadenze] = await connection.query(`
                SELECT 
                    s.id AS spesa_id,
                    s.titolo,
                    s.importo_totale AS importo_totale_spesa,
                    s.data_scadenza,
                    ROUND((s.importo_totale * ? / 1000.00), 2) AS quota_dovuta,
                    COALESCE(p.totale_versato, 0.00) AS importo_versato,
                    ROUND(((s.importo_totale * ? / 1000.00) - COALESCE(p.totale_versato, 0.00)), 2) AS residuo_individuale,
                    CASE 
                        WHEN COALESCE(p.totale_versato, 0.00) >= ROUND((s.importo_totale * ? / 1000.00), 2) THEN 'Regolarizzato'
                        ELSE 'In corso di riscossione'
                    END AS stato_contabile,
                    p.ultima_data_pagamento
                FROM spese_scadenze s
                LEFT JOIN (
                    SELECT spesa_id, condomino_id, SUM(importo_versato) AS totale_versato, MAX(data_pagamento) AS ultima_data_pagamento
                    FROM pagamenti_condomini
                    WHERE condomino_id = ?
                    GROUP BY spesa_id, condomino_id
                ) p ON s.id = p.spesa_id
                WHERE s.condominio_id = ?
                ORDER BY s.data_scadenza ASC
            `, [condominoProfile.millesimi, condominoProfile.millesimi, condominoProfile.millesimi, userId, activeCondoId]);

            // Se spese_scadenze è vuota per questo stabile, controlla se ci sono quote nella tabella quotes
            if (!personalScadenze || personalScadenze.length === 0) {
                const [quotesRows] = await connection.query(`
                    SELECT 
                        q.id AS spesa_id,
                        q.title AS titolo,
                        q.amount AS importo_totale_spesa,
                        q.due_date AS data_scadenza,
                        q.amount AS quota_dovuta,
                        COALESCE(q.paid_amount, CASE WHEN q.status = 'Pagato' THEN q.amount ELSE 0.00 END) AS importo_versato,
                        ROUND(q.amount - COALESCE(q.paid_amount, CASE WHEN q.status = 'Pagato' THEN q.amount ELSE 0.00 END), 2) AS residuo_individuale,
                        CASE 
                            WHEN q.status = 'Pagato' OR COALESCE(q.paid_amount, 0) >= q.amount THEN 'Regolarizzato'
                            ELSE 'In corso di riscossione'
                        END AS stato_contabile,
                        q.due_date AS ultima_data_pagamento
                    FROM quotes q
                    WHERE (q.user_id = ? OR q.persona_id IN (SELECT id FROM anagrafica_persone WHERE email = ?))
                      AND (q.condominio_id = ? OR ? IS NULL)
                    ORDER BY q.due_date ASC
                `, [userId, condominoProfile.condomino_email, activeCondoId, activeCondoId]);
                if (quotesRows && quotesRows.length > 0) {
                    personalScadenze = quotesRows;
                }
            }

            // Calcolo totali personali
            let totaleQuoteDovute = 0;
            let totaleVersatoPersonale = 0;
            (personalScadenze || []).forEach(item => {
                totaleQuoteDovute += parseFloat(item.quota_dovuta || 0);
                totaleVersatoPersonale += parseFloat(item.importo_versato || 0);
            });
            const residuoPersonaleComplessivo = Math.max(0, parseFloat((totaleQuoteDovute - totaleVersatoPersonale).toFixed(2)));

            let statoLabel = 'In regola con i versamenti';
            if (condominoProfile.is_admin_view) {
                statoLabel = 'Profilo Amministratore (Nessun debito personale)';
            } else if (residuoPersonaleComplessivo > 0) {
                statoLabel = 'Quote in corso di regolazione';
            }

            // 3. Calcolo aggregato globale di cassa dello stabile (Zero-leakage di privacy)
            const [globalStats] = await connection.query(`
                SELECT 
                    COALESCE(SUM(s.importo_totale), 0.00) AS totale_gestione_preventivata,
                    COALESCE((
                        SELECT SUM(p.importo_versato) 
                        FROM pagamenti_condomini p
                        JOIN spese_scadenze sp ON p.spesa_id = sp.id
                        WHERE sp.condominio_id = ?
                    ), 0.00) AS totale_riscosso_fabbricato
                FROM spese_scadenze s
                WHERE s.condominio_id = ?
            `, [activeCondoId, activeCondoId]);

            let totalePreventivato = parseFloat((globalStats && globalStats[0] && globalStats[0].totale_gestione_preventivata) || 0);
            let totaleRiscosso = parseFloat((globalStats && globalStats[0] && globalStats[0].totale_riscosso_fabbricato) || 0);

            // Fallback aggregato su tabella quotes se spese_scadenze non ha ancora importi
            if (totalePreventivato === 0) {
                const [quotesStats] = await connection.query(`
                    SELECT 
                        COALESCE(SUM(amount), 0.00) AS totale_preventivato,
                        COALESCE(SUM(COALESCE(paid_amount, CASE WHEN status = 'Pagato' THEN amount ELSE 0.00 END)), 0.00) AS totale_riscosso
                    FROM quotes
                    WHERE condominio_id = ?
                `, [activeCondoId]);
                if (quotesStats && quotesStats.length > 0) {
                    totalePreventivato = parseFloat(quotesStats[0].totale_preventivato || 0);
                    totaleRiscosso = parseFloat(quotesStats[0].totale_riscosso || 0);
                }
            }

            const residuiAttiviGestione = Math.max(0, parseFloat((totalePreventivato - totaleRiscosso).toFixed(2)));
            const percentualeAvanzamento = totalePreventivato > 0 
                ? Math.min(100, Math.round((totaleRiscosso / totalePreventivato) * 100))
                : 100;

            // Storico pagamenti del singolo condomino con codice ricevuta (per download PDF)
            let [pagamentiPersonali] = await connection.query(`
                SELECT p.id, s.titolo, p.importo_versato, DATE_FORMAT(p.data_pagamento, '%d/%m/%Y') AS data, p.ricevuta_codice 
                FROM pagamenti_condomini p
                JOIN spese_scadenze s ON p.spesa_id = s.id
                WHERE p.condomino_id = ?
                ORDER BY p.data_pagamento DESC
            `, [userId]);

            if (!pagamentiPersonali || pagamentiPersonali.length === 0) {
                // Fallback da quotes pagate se non ci sono ancora record in pagamenti_condomini
                const [qPaid] = await connection.query(`
                    SELECT id, title AS titolo, 
                           COALESCE(paid_amount, amount) AS importo_versato,
                           DATE_FORMAT(COALESCE(created_at, NOW()), '%d/%m/%Y') AS data,
                           CONCAT('REC-', YEAR(NOW()), '-', UPPER(SUBSTRING(MD5(id), 1, 8))) AS ricevuta_codice
                    FROM quotes
                    WHERE (user_id = ? OR persona_id IN (SELECT id FROM anagrafica_persone WHERE email = ?))
                      AND (status = 'Pagato' OR paid_amount > 0)
                      AND (condominio_id = ? OR ? IS NULL)
                    ORDER BY id DESC
                `, [userId, condominoProfile.condomino_email, activeCondoId, activeCondoId]);
                if (qPaid && qPaid.length > 0) {
                    pagamentiPersonali = qPaid;
                }
            }

            return res.json({
                success: true,
                datiPersonali: {
                    interno: condominoProfile.interno,
                    millesimi: parseFloat(condominoProfile.millesimi || 0),
                    pagamenti: pagamentiPersonali || []
                },
                cassaComune: {
                    residuiAttivi: residuiAttiviGestione,
                    percentualeRiscossa: percentualeAvanzamento
                },
                dati_personali: {
                    is_admin_view: !!condominoProfile.is_admin_view,
                    condomino_id: condominoProfile.condomino_id,
                    nome: condominoProfile.condomino_nome,
                    email: condominoProfile.condomino_email,
                    condominio: {
                        id: condominoProfile.condominio_id,
                        nome: condominoProfile.condominio_nome,
                        indirizzo: condominoProfile.indirizzo,
                        codice_fiscale: condominoProfile.codice_fiscale
                    },
                    unita_immobiliare: {
                        interno: condominoProfile.interno,
                        millesimi: parseFloat(condominoProfile.millesimi || 0)
                    },
                    riepilogo_personale: {
                        totale_quote_dovute: parseFloat(totaleQuoteDovute.toFixed(2)),
                        totale_versato: parseFloat(totaleVersatoPersonale.toFixed(2)),
                        saldo_in_corso: residuoPersonaleComplessivo,
                        stato: statoLabel
                    },
                    scadenze: personalScadenze || []
                },
                // Dati aggregati a livello di fabbricato (GDPR Compliant - Nessun dato nominativo di terzi)
                aggregato_cassa_stabile: {
                    totale_gestione_preventivata: totalePreventivato,
                    totale_riscosso_fabbricato: totaleRiscosso,
                    residui_attivi_gestione: residuiAttiviGestione,
                    percentuale_avanzamento: percentualeAvanzamento,
                    formula_informativa: 'Valore matematico complessivo delle quote di gestione deliberate in fase di riscossione.'
                }
            });
        }
    } catch (error) {
        console.error('Errore dashboard condomino:', error);
        return res.status(500).json({ success: false, error: 'Errore durante il recupero dei dati contabili.' });
    } finally {
        if (connection) connection.release();
    }
});

// ==========================================
// ENDPOINT GENERAZIONE RICEVUTA PDF CON PUPPETEER
// ==========================================
app.get('/api/condomino/ricevuta/:ricevuta_codice', verifyJWT, async (req, res) => {
    const condominoId = req.user.id;
    const { ricevuta_codice } = req.params;
    let connection;

    try {
        if (db.pool && typeof db.pool.promise === 'function') {
            connection = await db.getConnection();

            const isPrivileged = req.user.ruolo === 'superuser' || req.user.is_superadmin || req.user.ruolo === 'amministratore';
            // Sicurezza: Recupera la ricevuta accertandosi che appartenga al condomino richiedente o ad utente autorizzato
            const [dati] = await connection.query(
                `SELECT p.importo_versato, DATE_FORMAT(p.data_pagamento, '%d/%m/%Y %H:%i') AS data_ora, p.ricevuta_codice,
                        s.titolo AS spesa_titolo, u.nome, COALESCE(u.cognome, '') AS cognome, c.nome AS condominio_nome, c.indirizzo AS condominio_via
                 FROM pagamenti_condomini p
                 JOIN spese_scadenze s ON p.spesa_id = s.id
                 JOIN users u ON p.condomino_id = u.id
                 JOIN condomini c ON s.condominio_id = c.id
                 WHERE (p.condomino_id = ? OR ?) AND p.ricevuta_codice = ?`,
                [condominoId, isPrivileged ? 1 : 0, ricevuta_codice]
            );

            if (!dati || dati.length === 0) {
                return res.status(404).json({ success: false, error: 'Ricevuta non trovata o non autorizzata.' });
            }

            const r = dati[0];

            // Struttura HTML del PDF
            const htmlContent = `
                <!DOCTYPE html>
                <html>
                <head>
                    <meta charset="utf-8">
                    <title>Ricevuta ${r.ricevuta_codice}</title>
                    <style>
                        body { font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; color: #333; padding: 40px; margin: 0; }
                        .header { border-bottom: 2px solid #4f46e5; padding-bottom: 20px; margin-bottom: 30px; }
                        .title { font-size: 24px; font-weight: bold; color: #1e1b4b; }
                        .details { margin-bottom: 40px; font-size: 14px; line-height: 1.6; }
                        .table-Ricevuta { width: 100%; border-collapse: collapse; margin-top: 20px; }
                        .table-Ricevuta th { background-color: #f3f4f6; text-align: left; padding: 12px; font-size: 14px; }
                        .table-Ricevuta td { padding: 12px; border-bottom: 1px solid #e5e7eb; font-size: 14px; }
                        .total-box { margin-top: 30px; text-align: right; font-size: 18px; font-weight: bold; color: #4f46e5; }
                        .footer { margin-top: 60px; text-align: center; font-size: 11px; color: #9ca3af; border-top: 1px solid #e5e7eb; padding-top: 20px; }
                    </style>
                </head>
                <body>
                    <div class="header">
                        <div class="title">RICEVUTA DI PAGAMENTO TELEMATICO</div>
                        <div style="font-size: 12px; color: #6b7280; margin-top: 5px;">Documento generato automaticamente dalla piattaforma</div>
                    </div>
                    <div class="details">
                        <strong>Condominio:</strong> ${r.condominio_nome}<br>
                        <strong>Ubicazione:</strong> ${r.condominio_via}<br><br>
                        <strong>Intestatario Unità:</strong> ${r.nome} ${r.cognome}<br>
                        <strong>Data/Ora Transazione:</strong> ${r.data_ora}
                    </div>
                    <table class="table-Ricevuta">
                        <thead>
                            <tr>
                                <th>Descrizione Causale</th>
                                <th>Identificativo Ricevuta</th>
                            </tr>
                        </thead>
                        <tbody>
                            <tr>
                                <td>${r.spesa_titolo}</td>
                                <td><code>${r.ricevuta_codice}</code></td>
                            </tr>
                        </tbody>
                    </table>
                    <div class="total-box">
                        Importo Corrisposto: € ${parseFloat(r.importo_versato).toFixed(2)}
                    </div>
                    <div class="footer">
                        Il presente documento attesta l'avvenuto incasso del rateo indicato nella cassa comune del condominio.<br>
                        Ai sensi del GDPR, i dati sensibili degli altri residenti sono protetti.
                    </div>
                </body>
                </html>
            `;

            // Avvia Puppeteer con getPuppeteerLaunchOptions
            const launchOpts = typeof getPuppeteerLaunchOptions === 'function'
                ? getPuppeteerLaunchOptions()
                : { headless: 'new', args: ['--no-sandbox', '--disable-setuid-sandbox'] };
            const browser = await puppeteer.launch(launchOpts);
            const page = await browser.newPage();
            await page.setContent(htmlContent, { waitUntil: 'networkidle0' });
            const pdfBuffer = await page.pdf({ format: 'A4', printBackground: true });
            await browser.close();

            // Invia il file binario direttamente al browser per il download
            res.contentType("application/pdf");
            res.setHeader("Content-Disposition", `attachment; filename=Ricevuta_${ricevuta_codice}.pdf`);
            return res.send(pdfBuffer);
        } else {
            return res.status(501).json({ success: false, error: 'Database MySQL non configurato.' });
        }
    } catch (error) {
        console.error('Errore generazione PDF:', error);
        return res.status(500).json({ success: false, error: 'Errore durante la generazione del file PDF.' });
    } finally {
        if (connection) connection.release();
    }
});

// Endpoint ausiliari per gestione contabile
app.post('/api/amministratore/spese-scadenze', verifyJWT, checkAmministratore, async (req, res) => {
    const { condominio_id, titolo, importo_totale, data_scadenza } = req.body;
    if (!condominio_id || !titolo || !importo_totale || !data_scadenza) {
        return res.status(400).json({ success: false, error: 'Tutti i campi sono obbligatori.' });
    }
    try {
        if (db.pool && typeof db.pool.promise === 'function') {
            const [result] = await db.pool.promise().query(
                'INSERT INTO spese_scadenze (condominio_id, titolo, importo_totale, data_scadenza) VALUES (?, ?, ?, ?)',
                [condominio_id, titolo.trim(), parseFloat(importo_totale), data_scadenza]
            );
            return res.status(201).json({ success: true, message: 'Spesa creata con successo.', spesaId: result.insertId });
        }
    } catch (e) {
        return res.status(500).json({ success: false, error: e.message });
    }
});

app.post('/api/amministratore/registra-pagamento', verifyJWT, checkAmministratore, async (req, res) => {
    let { condomino_id, spesa_id, importo_versato, data_pagamento, ricevuta_codice } = req.body;
    if (!condomino_id || !spesa_id || !importo_versato) {
        return res.status(400).json({ success: false, error: 'Tutti i campi sono obbligatori.' });
    }
    if (!ricevuta_codice) {
        ricevuta_codice = 'REC-' + new Date().getFullYear() + '-' + crypto.randomBytes(4).toString('hex').toUpperCase();
    }
    try {
        if (db.pool && typeof db.pool.promise === 'function') {
            const [result] = await db.pool.promise().query(
                'INSERT INTO pagamenti_condomini (condomino_id, spesa_id, importo_versato, data_pagamento, ricevuta_codice) VALUES (?, ?, ?, ?, ?)',
                [condomino_id, spesa_id, parseFloat(importo_versato), data_pagamento || new Date().toISOString().slice(0, 10), ricevuta_codice]
            );
            return res.status(201).json({ success: true, message: 'Pagamento registrato con successo.', pagamentoId: result.insertId, ricevuta_codice });
        }
    } catch (e) {
        return res.status(500).json({ success: false, error: e.message });
    }
});

// ==========================================
// API LISTA CONDOMINI AMMINISTRATORE
// ==========================================
app.get('/api/amministratore/miei-condomini', verifyJWT, checkAmministratore, async (req, res) => {
    try {
        const adminId = req.user.id;
        const isSuper = req.user.ruolo === 'superuser' || req.user.is_superadmin;
        if (db.pool && typeof db.pool.promise === 'function') {
            const [rows] = await db.pool.promise().query(
                isSuper 
                    ? 'SELECT id, nome, indirizzo, codice_fiscale FROM condomini ORDER BY nome ASC'
                    : 'SELECT id, nome, indirizzo, codice_fiscale FROM condomini WHERE amministratore_id = ? ORDER BY nome ASC',
                isSuper ? [] : [adminId]
            );
            return res.json({ success: true, condomini: rows || [] });
        } else {
            db.all(
                isSuper
                    ? 'SELECT id, nome, indirizzo, codice_fiscale FROM condomini ORDER BY nome ASC'
                    : 'SELECT id, nome, indirizzo, codice_fiscale FROM condomini WHERE amministratore_id = ? ORDER BY nome ASC',
                isSuper ? [] : [adminId],
                (err, rows) => {
                    if (err) return res.status(500).json({ success: false, error: err.message });
                    res.json({ success: true, condomini: rows || [] });
                }
            );
        }
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// ==========================================
// API PER L'INSERIMENTO/INVITO DI UN CONDOMINO IN UNO STABILE
// ==========================================
app.post('/api/amministratore/invita-condomino', verifyJWT, checkAmministratore, async (req, res) => {
    const { condominio_id, condomino_email, interno, millesimi } = req.body;
    const adminId = req.user.id; // Preso dal token JWT

    if (!condominio_id || !condomino_email || !interno || millesimi === undefined || millesimi === null || millesimi === '') {
        return res.status(400).json({ success: false, error: 'Tutti i campi sono obbligatori.' });
    }

    const condoId = parseInt(condominio_id, 10);
    const millesimiNum = parseFloat(millesimi);
    if (isNaN(condoId) || isNaN(millesimiNum)) {
        return res.status(400).json({ success: false, error: 'Valori numerici non validi per condominio o millesimi.' });
    }

    const cleanEmail = String(condomino_email).trim().toLowerCase();
    const cleanInterno = String(interno).trim();

    let connection;

    try {
        if (db.pool && typeof db.pool.promise === 'function') {
            connection = await db.getConnection();
            
            // 1. Sicurezza: Verifica che questo condominio sia gestito proprio dall'amministratore richiedente
            const isSuper = req.user && (req.user.ruolo === 'superuser' || req.user.is_superadmin);
            let condoCheck;
            if (isSuper) {
                [condoCheck] = await connection.query('SELECT id FROM condomini WHERE id = ?', [condoId]);
            } else {
                [condoCheck] = await connection.query(
                    'SELECT id FROM condomini WHERE id = ? AND amministratore_id = ?',
                    [condoId, adminId]
                );
            }

            if (!condoCheck || condoCheck.length === 0) {
                return res.status(403).json({ success: false, error: 'Non hai i permessi per gestire questo condominio.' });
            }

            // 2. Cerca il condomino tramite email
            const [userCheck] = await connection.query(
                'SELECT id, nome, email, ruolo FROM utenti WHERE email = ?',
                [cleanEmail]
            );

            if (!userCheck || userCheck.length === 0) {
                return res.status(404).json({ success: false, error: 'Nessun condomino registrato con questa email.' });
            }

            const targetUser = userCheck[0];

            if (targetUser.ruolo !== 'condomino') {
                return res.status(400).json({ success: false, error: 'L\'utente indicato non ha il ruolo di Condòmino.' });
            }

            // 3. Associa il condomino all'edificio (e imposta l'appartamento)
            await connection.query(
                'INSERT INTO condomino_condominio (condomino_id, condominio_id, interno, millesimi) VALUES (?, ?, ?, ?)',
                [targetUser.id, condoId, cleanInterno, millesimiNum]
            );

            // Sincronizzazione automatica con user_condominios per fruizione immediata del portale
            await connection.query(
                'INSERT INTO user_condominios (user_id, condominio_id, role, unita, millesimi) VALUES (?, ?, "condomino", ?, ?) ON DUPLICATE KEY UPDATE role = "condomino", unita = VALUES(unita), millesimi = VALUES(millesimi)',
                [targetUser.id, condoId, cleanInterno, millesimiNum]
            ).catch(() => {});

            return res.status(201).json({ 
                success: true, 
                message: `Condòmino associato correttamente all'interno ${cleanInterno}.` 
            });
        } else {
            // Fallback SQLite
            const isSuper = req.user && (req.user.ruolo === 'superuser' || req.user.is_superadmin);
            const condo = await new Promise((resolve, reject) => {
                const sql = isSuper 
                    ? 'SELECT id FROM condomini WHERE id = ?' 
                    : 'SELECT id FROM condomini WHERE id = ? AND amministratore_id = ?';
                const params = isSuper ? [condoId] : [condoId, adminId];
                db.get(sql, params, (err, row) => {
                    if (err) reject(err); else resolve(row);
                });
            });

            if (!condo) {
                return res.status(403).json({ success: false, error: 'Non hai i permessi per gestire questo condominio.' });
            }

            const targetUser = await new Promise((resolve, reject) => {
                db.get('SELECT id, ruolo FROM utenti WHERE LOWER(email) = ?', [cleanEmail], (err, row) => {
                    if (err) reject(err); else resolve(row);
                });
            });

            if (!targetUser) {
                return res.status(404).json({ success: false, error: 'Nessun condomino registrato con questa email.' });
            }

            if (targetUser.ruolo !== 'condomino') {
                return res.status(400).json({ success: false, error: 'L\'utente indicato non ha il ruolo di Condòmino.' });
            }

            await new Promise((resolve, reject) => {
                db.run(
                    'INSERT INTO condomino_condominio (condomino_id, condominio_id, interno, millesimi) VALUES (?, ?, ?, ?)',
                    [targetUser.id, condoId, cleanInterno, millesimiNum],
                    function(err) {
                        if (err) reject(err); else resolve(this.lastID);
                    }
                );
            });

            return res.status(201).json({ 
                success: true, 
                message: `Condòmino associato correttamente all'interno ${cleanInterno}.` 
            });
        }
    } catch (error) {
        if (error.code === 'ER_DUP_ENTRY' || (error.message && error.message.includes('UNIQUE constraint'))) {
            return res.status(400).json({ success: false, error: 'Questo condòmino è già associato a questo stabile.' });
        }
        console.error('Errore invito condomino:', error);
        return res.status(500).json({ success: false, error: 'Errore interno del server.' });
    } finally {
        if (connection) connection.release();
    }
});

app.get('/api/superuser/audit-logs', authenticateToken, requireSuperAdmin, (req, res) => {
    db.all(`
        SELECT a.*, u.nome as user_name, u.email as user_email, c.nome as condo_name
        FROM audit_log a
        LEFT JOIN users u ON a.user_id = u.id
        LEFT JOIN condominios c ON a.condominio_id = c.id
        ORDER BY a.id DESC
        LIMIT 60
    `, [], (err, rows) => {
        if (err) return res.status(500).json({ success: false, message: 'Database error audit' });
        res.json({ success: true, data: rows || [] });
    });
});

// ============================================================================
// DOCUMENTI & ALLEGATI BIDIREZIONALI (AMMINISTRATORE <-> CONDÒMINI)
// ============================================================================
function buildMinimalPdfDataUri(titleText, subtitleText, bodyText) {
    const clean = (s) => String(s || '')
        .replace(/[()\\]/g, '')
        .replace(/[^\x20-\x7E]/g, ' ');
    const t1 = clean(titleText).slice(0, 75);
    const t2 = clean(subtitleText).slice(0, 85);
    const t3 = clean(bodyText).slice(0, 95);
    const streamContent = [
        'BT',
        '/F1 16 Tf',
        '50 760 Td',
        `(${t1}) Tj`,
        '/F1 11 Tf',
        '0 -28 Td',
        `(${t2}) Tj`,
        '0 -24 Td',
        `(${t3}) Tj`,
        'ET'
    ].join('\n');
    const pdf = `%PDF-1.4
1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj
2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj
3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >> endobj
4 0 obj << /Length ${streamContent.length} >> stream
${streamContent}
endstream endobj
5 0 obj << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> endobj
xref
0 6
0000000000 65535 f 
0000000009 00000 n 
0000000058 00000 n 
0000000115 00000 n 
0000000241 00000 n 
0000000340 00000 n 
trailer << /Size 6 /Root 1 0 R >>
startxref
410
%%EOF`;
    return 'data:application/pdf;base64,' + Buffer.from(pdf, 'utf8').toString('base64');
}

function ensureCondoDocumentsTable() {
    const createSql = db.type === 'mysql'
        ? `CREATE TABLE IF NOT EXISTS condo_documents (
            id INT AUTO_INCREMENT PRIMARY KEY,
            condominio_id INT NOT NULL,
            sender_user_id INT NULL,
            sender_role VARCHAR(30) NOT NULL DEFAULT 'admin',
            sender_name VARCHAR(255) NOT NULL,
            sender_persona_id INT NULL,
            recipient_type VARCHAR(30) NOT NULL DEFAULT 'all',
            recipient_persona_id INT NULL,
            recipient_user_id INT NULL,
            recipient_name VARCHAR(255) NULL,
            unita_label VARCHAR(150) NULL,
            category VARCHAR(120) NOT NULL,
            title VARCHAR(255) NOT NULL,
            notes TEXT NULL,
            file_name VARCHAR(255) NOT NULL,
            file_mime VARCHAR(120) NOT NULL DEFAULT 'application/pdf',
            file_size INT DEFAULT 0,
            file_data LONGTEXT NULL,
            status VARCHAR(50) DEFAULT 'Pubblicato',
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )`
        : `CREATE TABLE IF NOT EXISTS condo_documents (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            condominio_id INTEGER NOT NULL,
            sender_user_id INTEGER,
            sender_role TEXT NOT NULL DEFAULT 'admin',
            sender_name TEXT NOT NULL,
            sender_persona_id INTEGER,
            recipient_type TEXT NOT NULL DEFAULT 'all',
            recipient_persona_id INTEGER,
            recipient_user_id INTEGER,
            recipient_name TEXT,
            unita_label TEXT,
            category TEXT NOT NULL,
            title TEXT NOT NULL,
            notes TEXT,
            file_name TEXT NOT NULL,
            file_mime TEXT NOT NULL DEFAULT 'application/pdf',
            file_size INTEGER DEFAULT 0,
            file_data TEXT,
            status TEXT DEFAULT 'Pubblicato',
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )`;

    db.run(createSql, [], (err) => {
        if (err) {
            console.warn('⚠️ Creazione tabella condo_documents:', err.message);
            return;
        }
        console.log('✅ Tabella condo_documents verificata.');
        // Popola documenti iniziali dimostrativi allineati all'Anagrafica se la tabella è vuota
        db.all('SELECT id, nome FROM condominios', [], (errC, conds) => {
            if (errC || !Array.isArray(conds)) return;
            conds.forEach(c => {
                db.get('SELECT COUNT(*) as cnt FROM condo_documents WHERE condominio_id = ?', [c.id], (errCnt, rowCnt) => {
                    if (!errCnt && rowCnt && Number(rowCnt.cnt) === 0) {
                        db.all(`
                            SELECT p.id, p.nome, p.cognome, p.email, u.scala, u.piano, u.interno, u.identificativo
                            FROM anagrafica_persone p
                            LEFT JOIN unita_immobiliari u ON (u.proprietario_id = p.id OR u.conduttore_id = p.id) AND u.condominio_id = p.condominio_id
                            WHERE p.condominio_id = ?
                            ORDER BY p.cognome ASC, p.nome ASC
                        `, [c.id], (errP, persone) => {
                            const p1 = (persone && persone[0]) ? persone[0] : null;
                            const p2 = (persone && persone[1]) ? persone[1] : p1;
                            const p1Name = p1 ? `${p1.cognome} ${p1.nome}`.trim() : 'Condòmino';
                            const p1Unita = p1 ? [p1.scala ? `Sc. ${p1.scala}` : '', p1.piano ? `P. ${p1.piano}` : '', p1.interno ? `Int. ${p1.interno}` : ''].filter(Boolean).join(' - ') : '';
                            const p2Name = p2 ? `${p2.cognome} ${p2.nome}`.trim() : 'Condòmino';
                            const p2Unita = p2 ? [p2.scala ? `Sc. ${p2.scala}` : '', p2.piano ? `P. ${p2.piano}` : '', p2.interno ? `Int. ${p2.interno}` : ''].filter(Boolean).join(' - ') : '';

                            const pdf1 = buildMinimalPdfDataUri(
                                `${c.nome} - Regolamento e Polizza Fabbricato`,
                                `Documento pubblico per tutti i condomini`,
                                `Consultabile e scaricabile dalla Bacheca Documentale Condominiale.`
                            );
                            db.run(`
                                INSERT INTO condo_documents
                                (condominio_id, sender_role, sender_name, recipient_type, recipient_name, unita_label, category, title, notes, file_name, file_mime, file_size, file_data, status)
                                VALUES (?, 'admin', 'Studio Amministratore', 'all', 'Tutti i Condòmini (Bacheca Pubblica)', 'Intero Fabbricato', 'Regolamento & Polizze', 'Regolamento Condominiale & Estratto Polizza Fabbricato 2026', 'Documento ufficiale sempre disponibile in bacheca per tutti i condòmini.', 'Regolamento_e_Polizza_Condominio_2026.pdf', 'application/pdf', 14200, ?, 'Pubblicato')
                            `, [c.id, pdf1], () => {});

                            if (p1) {
                                const pdf2 = buildMinimalPdfDataUri(
                                    `${c.nome} - Prospetto Individuale Quote`,
                                    `Destinatario: ${p1Name} (${p1Unita})`,
                                    `Riepilogo situazione contabile e riparto millesimale individuale.`
                                );
                                db.run(`
                                    INSERT INTO condo_documents
                                    (condominio_id, sender_role, sender_name, recipient_type, recipient_persona_id, recipient_name, unita_label, category, title, notes, file_name, file_mime, file_size, file_data, status)
                                    VALUES (?, 'admin', 'Studio Amministratore', 'persona', ?, ?, ?, 'Comunicazione Individuale', ?, 'Documento riservato inviato dallo Studio Amministrativo al singolo condòmino.', 'Prospetto_Contabile_Individuale.pdf', 'application/pdf', 12800, ?, 'Inviato')
                                `, [c.id, p1.id, p1Name, p1Unita, `Prospetto Contabile Individuale - ${p1Name}`, pdf2], () => {});
                            }

                            if (p2) {
                                const pdf3 = buildMinimalPdfDataUri(
                                    `Distinta Bonifico Bancario Quota Condominiale`,
                                    `Mittente: ${p2Name} (${p2Unita})`,
                                    `Allegato caricato dal condomino per verifica e registrazione incasso.`
                                );
                                db.run(`
                                    INSERT INTO condo_documents
                                    (condominio_id, sender_role, sender_name, sender_persona_id, recipient_type, recipient_name, unita_label, category, title, notes, file_name, file_mime, file_size, file_data, status)
                                    VALUES (?, 'condomino', ?, ?, 'admin', 'Studio Amministratore', ?, 'Ricevuta Bonifico / Pagamento', ?, 'Allego contabile bonifico bancario relativo al versamento della quota condominiale.', 'Contabile_Bonifico_Quota.pdf', 'application/pdf', 11500, ?, 'Da visionare')
                                `, [c.id, p2Name, p2.id, p2Unita, `Contabile Bonifico Quota - ${p2Name}`, pdf3], () => {});
                            }
                        });
                    }
                });
            });
        });
    });
}

// ============================================================================
// ARCHITETTURA DINAMICA TABELLE MILLESIMALI & RIPARTO SPESE (PropTech Standard)
// ============================================================================
function ensureMillesimiArchitectureTables() {
    const isMysql = db.type === 'mysql';

    const sqlTabelle = isMysql
        ? `CREATE TABLE IF NOT EXISTS anagrafica_tabelle_millesimali (
            id INT AUTO_INCREMENT PRIMARY KEY,
            condominio_id INT NOT NULL,
            codice VARCHAR(50) NOT NULL,
            descrizione VARCHAR(200) NOT NULL,
            categoria VARCHAR(50) NOT NULL DEFAULT 'Personalizzata',
            scala_filtro VARCHAR(20) NULL,
            totale_millesimi DECIMAL(10, 4) NOT NULL DEFAULT 1000.0000,
            attiva INT NOT NULL DEFAULT 1,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            UNIQUE KEY uk_condo_tab (condominio_id, codice)
        )`
        : `CREATE TABLE IF NOT EXISTS anagrafica_tabelle_millesimali (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            condominio_id INTEGER NOT NULL,
            codice TEXT NOT NULL,
            descrizione TEXT NOT NULL,
            categoria TEXT NOT NULL DEFAULT 'Personalizzata',
            scala_filtro TEXT NULL,
            totale_millesimi REAL NOT NULL DEFAULT 1000.0,
            attiva INTEGER NOT NULL DEFAULT 1,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            UNIQUE (condominio_id, codice)
        )`;

    const sqlQuote = isMysql
        ? `CREATE TABLE IF NOT EXISTS quote_millesimali (
            id INT AUTO_INCREMENT PRIMARY KEY,
            tabella_id INT NOT NULL,
            unita_id INT NOT NULL,
            valore_millesimale DECIMAL(10, 4) NOT NULL DEFAULT 0.0000,
            parametro_ausiliario DECIMAL(12, 4) NULL,
            note VARCHAR(255) NULL,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            UNIQUE KEY uk_tab_unita (tabella_id, unita_id)
        )`
        : `CREATE TABLE IF NOT EXISTS quote_millesimali (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            tabella_id INTEGER NOT NULL,
            unita_id INTEGER NOT NULL,
            valore_millesimale REAL NOT NULL DEFAULT 0.0,
            parametro_ausiliario REAL NULL,
            note TEXT NULL,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            UNIQUE (tabella_id, unita_id)
        )`;

    db.run(sqlTabelle, (errT) => {
        if (errT) console.error('⚠️ [Millesimi Schema] Errore creazione anagrafica_tabelle_millesimali:', errT.message);
        else {
            db.run(sqlQuote, (errQ) => {
                if (errQ) console.error('⚠️ [Millesimi Schema] Errore creazione quote_millesimali:', errQ.message);
                else {
                    seedDefaultMillesimiTables();
                }
            });
        }
    });
}

function seedDefaultMillesimiTables() {
    db.all('SELECT id, nome FROM condominios', [], (err, condomini) => {
        if (err || !Array.isArray(condomini)) return;
        condomini.forEach(c => {
            db.all('SELECT id, codice FROM anagrafica_tabelle_millesimali WHERE condominio_id = ?', [c.id], (errT, tabs) => {
                if (errT) return;
                const existingCodes = (tabs || []).map(t => t.codice);

                const defaults = [
                    { codice: 'TAB_A', descrizione: 'Tabella A - Proprietà Generale', categoria: 'Proprieta_Generale', scala: null },
                    { codice: 'TAB_B', descrizione: 'Tabella B - Scale e Ascensore (Art. 1124 c.c.)', categoria: 'Scale_Ascensore_1124', scala: null },
                    { codice: 'TAB_C', descrizione: 'Tabella C - Riscaldamento & Climatizzazione', categoria: 'Riscaldamento_Consumi', scala: null }
                ];

                defaults.forEach(def => {
                    if (!existingCodes.includes(def.codice)) {
                        db.run(
                            `INSERT INTO anagrafica_tabelle_millesimali (condominio_id, codice, descrizione, categoria, scala_filtro, totale_millesimi) VALUES (?, ?, ?, ?, ?, 1000.0000)`,
                            [c.id, def.codice, def.descrizione, def.categoria, def.scala],
                            function(errIns) {
                                if (!errIns) {
                                    const newTabId = this.lastID;
                                    // Sincronizza quote dalle unità esistenti
                                    syncDefaultMillesimiFromUnits(c.id, newTabId, def.codice);
                                }
                            }
                        );
                    }
                });
            });
        });
    });
}

function syncDefaultMillesimiFromUnits(condoId, tabId, codice) {
    db.all(`
        SELECT u.id, u.millesimi_proprieta, u.millesimi_scale, u.millesimi_ascensore 
        FROM unita_immobiliari u
        JOIN anagrafica_persone p ON (u.proprietario_id = p.id OR u.conduttore_id = p.id)
        WHERE u.condominio_id = ?
    `, [condoId], (err, unitaList) => {
        if (err || !Array.isArray(unitaList)) return;
        unitaList.forEach(u => {
            let val = 0;
            if (codice === 'TAB_A') val = parseFloat(u.millesimi_proprieta) || 0;
            else if (codice === 'TAB_B') val = parseFloat(u.millesimi_scale) || 0;
            else if (codice === 'TAB_C') val = parseFloat(u.millesimi_ascensore) || 0;

            if (val >= 0) {
                db.run(
                    `INSERT INTO quote_millesimali (tabella_id, unita_id, valore_millesimale) VALUES (?, ?, ?)`,
                    [tabId, u.id, val],
                    () => {}
                );
            }
        });
    });
}

// Avvia controllo tabelle a runtime
setTimeout(() => {
    try { 
        ensureCondoDocumentsTable();
        ensureMillesimiArchitectureTables();
    } catch (_) {}
}, 1200);

// Lista Documenti e Allegati (con filtro RBAC automatico per Admin vs Condòmino)
app.get('/api/documents', authenticateToken, requireCondominio, (req, res) => {
    const condoId = req.condominio_id;
    const isAdminUser = (req.user.is_superadmin || req.role_in_condominio === 'admin');

    const selectCols = `
        id, condominio_id, sender_user_id, sender_role, sender_name, sender_persona_id,
        recipient_type, recipient_persona_id, recipient_user_id, recipient_name, unita_label,
        category, title, notes, file_name, file_mime, file_size, status, created_at
    `;

    if (isAdminUser) {
        db.all(`SELECT ${selectCols} FROM condo_documents WHERE condominio_id = ? ORDER BY created_at DESC, id DESC`, [condoId], (err, rows) => {
            if (err) return res.status(500).json({ success: false, message: 'Errore caricamento documenti: ' + err.message });
            return res.json({ success: true, data: rows || [] });
        });
    } else {
        // Risolve l'eventuale persona_id associato all'utente condòmino loggato
        db.get('SELECT id, nome, email FROM users WHERE id = ?', [req.user.id], (errU, userRow) => {
            const userEmail = (userRow && userRow.email) ? userRow.email.trim().toLowerCase() : '';
            const userName = (userRow && userRow.nome) ? userRow.nome.trim().toLowerCase() : '';

            db.all('SELECT id, nome, cognome, email FROM anagrafica_persone WHERE condominio_id = ?', [condoId], (errP, persone) => {
                const matchedPersonaIds = [];
                if (!errP && Array.isArray(persone)) {
                    persone.forEach(p => {
                        const pEmail = (p.email || '').trim().toLowerCase();
                        const full1 = `${p.cognome || ''} ${p.nome || ''}`.trim().toLowerCase();
                        const full2 = `${p.nome || ''} ${p.cognome || ''}`.trim().toLowerCase();
                        if ((userEmail && pEmail && userEmail === pEmail) || (userName && (userName === full1 || userName === full2))) {
                            matchedPersonaIds.push(p.id);
                        }
                    });
                }

                db.all(`SELECT ${selectCols} FROM condo_documents WHERE condominio_id = ? ORDER BY created_at DESC, id DESC`, [condoId], (errD, allDocs) => {
                    if (errD) return res.status(500).json({ success: false, message: 'Errore caricamento documenti: ' + errD.message });
                    const visibleDocs = (allDocs || []).filter(doc => {
                        if (doc.recipient_type === 'all') return true;
                        if (doc.sender_user_id && Number(doc.sender_user_id) === Number(req.user.id)) return true;
                        if (doc.sender_persona_id && matchedPersonaIds.includes(Number(doc.sender_persona_id))) return true;
                        if (doc.recipient_type === 'persona') {
                            if (doc.recipient_user_id && Number(doc.recipient_user_id) === Number(req.user.id)) return true;
                            if (doc.recipient_persona_id && matchedPersonaIds.includes(Number(doc.recipient_persona_id))) return true;
                        }
                        return false;
                    });
                    return res.json({ success: true, data: visibleDocs });
                });
            });
        });
    }
});

// Scarica / Visualizza il contenuto di un singolo Documento (con controllo permessi RBAC)
app.get('/api/documents/:id/file', authenticateToken, requireCondominio, (req, res) => {
    const docId = parseInt(req.params.id, 10);
    const condoId = req.condominio_id;
    const isAdminUser = (req.user.is_superadmin || req.role_in_condominio === 'admin');

    db.get('SELECT * FROM condo_documents WHERE id = ? AND condominio_id = ?', [docId, condoId], (err, doc) => {
        if (err || !doc) {
            return res.status(404).json({ success: false, message: 'Documento non trovato.' });
        }
        if (isAdminUser || doc.recipient_type === 'all' || Number(doc.sender_user_id) === Number(req.user.id) || Number(doc.recipient_user_id) === Number(req.user.id)) {
            return res.json({
                success: true,
                data: {
                    id: doc.id,
                    title: doc.title,
                    file_name: doc.file_name,
                    file_mime: doc.file_mime,
                    file_size: doc.file_size,
                    file_data: doc.file_data
                }
            });
        }
        // Verifica corrispondenza tramite anagrafica_persone per i condòmini
        db.get('SELECT id, nome, email FROM users WHERE id = ?', [req.user.id], (errU, userRow) => {
            const userEmail = (userRow && userRow.email) ? userRow.email.trim().toLowerCase() : '';
            const userName = (userRow && userRow.nome) ? userRow.nome.trim().toLowerCase() : '';
            db.all('SELECT id, nome, cognome, email FROM anagrafica_persone WHERE condominio_id = ?', [condoId], (errP, persone) => {
                const matchedPersonaIds = (persone || []).filter(p => {
                    const pEmail = (p.email || '').trim().toLowerCase();
                    const full1 = `${p.cognome || ''} ${p.nome || ''}`.trim().toLowerCase();
                    const full2 = `${p.nome || ''} ${p.cognome || ''}`.trim().toLowerCase();
                    return (userEmail && pEmail && userEmail === pEmail) || (userName && (userName === full1 || userName === full2));
                }).map(p => Number(p.id));

                if (
                    (doc.recipient_persona_id && matchedPersonaIds.includes(Number(doc.recipient_persona_id))) ||
                    (doc.sender_persona_id && matchedPersonaIds.includes(Number(doc.sender_persona_id)))
                ) {
                    return res.json({
                        success: true,
                        data: {
                            id: doc.id,
                            title: doc.title,
                            file_name: doc.file_name,
                            file_mime: doc.file_mime,
                            file_size: doc.file_size,
                            file_data: doc.file_data
                        }
                    });
                }
                return res.status(403).json({ success: false, message: 'Non sei autorizzato a visualizzare questo documento riservato.' });
            });
        });
    });
});

// Carica e Invia un nuovo Documento / Allegato (Bidirezionale: Admin -> Tutti/Singolo Condòmino, oppure Condòmino -> Admin)
app.post('/api/documents', authenticateToken, requireCondominio, checkCondoLicenseWrite, (req, res) => {
    const condoId = req.condominio_id;
    const isAdminUser = (req.user.is_superadmin || req.role_in_condominio === 'admin');
    const {
        recipient_type,
        recipient_persona_id,
        sender_persona_id,
        category,
        title,
        notes,
        file_name,
        file_mime,
        file_size,
        file_data
    } = req.body || {};

    if (!title || !String(title).trim()) {
        return res.status(400).json({ success: false, message: 'Inserisci il titolo o oggetto del documento.' });
    }
    if (!file_name || !file_data) {
        return res.status(400).json({ success: false, message: 'Seleziona un file da allegare.' });
    }

    const cleanCategory = (category && String(category).trim()) ? String(category).trim() : 'Altra Documentazione';
    const cleanTitle = String(title).trim();
    const cleanNotes = notes ? String(notes).trim() : '';
    const cleanFileName = String(file_name).trim();
    const cleanFileMime = file_mime ? String(file_mime).trim() : 'application/octet-stream';
    const cleanFileSize = parseInt(file_size, 10) || 0;

    // Caso 1: Caricamento da parte dell'Amministratore (o quando l'Admin registra un allegato ricevuto da un condòmino)
    const effectiveDirection = (isAdminUser && req.body.direction === 'from_condomino') ? 'condomino_to_admin' : (isAdminUser ? 'admin_to_condomini' : 'condomino_to_admin');

    if (effectiveDirection === 'admin_to_condomini') {
        const recType = (recipient_type === 'persona') ? 'persona' : 'all';

        if (recType === 'all') {
            db.run(`
                INSERT INTO condo_documents
                (condominio_id, sender_user_id, sender_role, sender_name, recipient_type, recipient_name, unita_label, category, title, notes, file_name, file_mime, file_size, file_data, status)
                VALUES (?, ?, 'admin', 'Studio Amministratore', 'all', 'Tutti i Condòmini (Bacheca Pubblica)', 'Intero Fabbricato', ?, ?, ?, ?, ?, ?, ?, 'Pubblicato')
            `, [condoId, req.user.id, cleanCategory, cleanTitle, cleanNotes, cleanFileName, cleanFileMime, cleanFileSize, file_data], function(errIns) {
                if (errIns) return res.status(500).json({ success: false, message: 'Errore salvataggio documento: ' + errIns.message });
                const newDocId = this.lastID;
                logAudit(req.user.id, condoId, `Pubblica Documento in Bacheca: "${cleanTitle}" (${cleanFileName})`, 'condo_documents', newDocId, null, req.ip);
                return res.json({
                    success: true,
                    message: 'Documento pubblicato in Bacheca Condominiale per tutti i condòmini!',
                    data: { id: newDocId }
                });
            });
        } else {
            const pId = parseInt(recipient_persona_id, 10);
            if (!pId) {
                return res.status(400).json({ success: false, message: 'Seleziona il condòmino destinatario dall\'Anagrafica.' });
            }
            db.get(`
                SELECT p.id, p.nome, p.cognome, p.email, u.scala, u.piano, u.interno, u.identificativo
                FROM anagrafica_persone p
                LEFT JOIN unita_immobiliari u ON (u.proprietario_id = p.id OR u.conduttore_id = p.id) AND u.condominio_id = p.condominio_id
                WHERE p.id = ? AND p.condominio_id = ?
            `, [pId, condoId], (errP, persona) => {
                if (errP || !persona) {
                    return res.status(404).json({ success: false, message: 'Condòmino non trovato in Anagrafica.' });
                }
                const recName = `${persona.cognome || ''} ${persona.nome || ''}`.trim();
                const unitaParts = [];
                if (persona.scala) unitaParts.push(`Sc. ${persona.scala}`);
                if (persona.piano) unitaParts.push(`P. ${persona.piano}`);
                if (persona.interno) unitaParts.push(`Int. ${persona.interno}`);
                const unitaLabel = unitaParts.length > 0 ? unitaParts.join(' - ') : (persona.identificativo || '');

                db.run(`
                    INSERT INTO condo_documents
                    (condominio_id, sender_user_id, sender_role, sender_name, recipient_type, recipient_persona_id, recipient_name, unita_label, category, title, notes, file_name, file_mime, file_size, file_data, status)
                    VALUES (?, ?, 'admin', 'Studio Amministratore', 'persona', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Inviato')
                `, [condoId, req.user.id, persona.id, recName, unitaLabel, cleanCategory, cleanTitle, cleanNotes, cleanFileName, cleanFileMime, cleanFileSize, file_data], function(errIns) {
                    if (errIns) return res.status(500).json({ success: false, message: 'Errore invio documento: ' + errIns.message });
                    const newDocId = this.lastID;
                    logAudit(req.user.id, condoId, `Invia Documento a ${recName}: "${cleanTitle}" (${cleanFileName})`, 'condo_documents', newDocId, null, req.ip);
                    return res.json({
                        success: true,
                        message: `Documento inviato con successo a ${recName}!`,
                        data: { id: newDocId }
                    });
                });
            });
        }
    } else {
        // Caso 2: Invio da Condòmino -> Studio Amministratore
        const lookupPersonaId = isAdminUser && sender_persona_id ? parseInt(sender_persona_id, 10) : null;
        if (lookupPersonaId) {
            db.get(`
                SELECT p.id, p.nome, p.cognome, u.scala, u.piano, u.interno, u.identificativo
                FROM anagrafica_persone p
                LEFT JOIN unita_immobiliari u ON (u.proprietario_id = p.id OR u.conduttore_id = p.id) AND u.condominio_id = p.condominio_id
                WHERE p.id = ? AND p.condominio_id = ?
            `, [lookupPersonaId, condoId], (errP, persona) => {
                const sName = persona ? `${persona.cognome || ''} ${persona.nome || ''}`.trim() : 'Condòmino';
                const unitaParts = [];
                if (persona && persona.scala) unitaParts.push(`Sc. ${persona.scala}`);
                if (persona && persona.piano) unitaParts.push(`P. ${persona.piano}`);
                if (persona && persona.interno) unitaParts.push(`Int. ${persona.interno}`);
                const unitaLabel = unitaParts.length > 0 ? unitaParts.join(' - ') : (persona ? (persona.identificativo || '') : '');

                db.run(`
                    INSERT INTO condo_documents
                    (condominio_id, sender_user_id, sender_role, sender_name, sender_persona_id, recipient_type, recipient_name, unita_label, category, title, notes, file_name, file_mime, file_size, file_data, status)
                    VALUES (?, ?, 'condomino', ?, ?, 'admin', 'Studio Amministratore', ?, ?, ?, ?, ?, ?, ?, ?, 'Da visionare')
                `, [condoId, req.user.id, sName, persona ? persona.id : null, unitaLabel, cleanCategory, cleanTitle, cleanNotes, cleanFileName, cleanFileMime, cleanFileSize, file_data], function(errIns) {
                    if (errIns) return res.status(500).json({ success: false, message: 'Errore caricamento documento: ' + errIns.message });
                    return res.json({
                        success: true,
                        message: `Documento di ${sName} caricato e trasmesso allo Studio Amministratore!`,
                        data: { id: this.lastID }
                    });
                });
            });
        } else {
            // Risolve automaticamente i dati del condòmino loggato
            db.get('SELECT u.id, u.nome, u.email, uc.unita FROM users u LEFT JOIN user_condominios uc ON uc.user_id = u.id AND uc.condominio_id = ? WHERE u.id = ?', [condoId, req.user.id], (errU, uRow) => {
                const userEmail = (uRow && uRow.email) ? uRow.email.trim().toLowerCase() : '';
                const userName = (uRow && uRow.nome) ? uRow.nome.trim() : 'Condòmino';

                db.all(`
                    SELECT p.id, p.nome, p.cognome, p.email, u.scala, u.piano, u.interno, u.identificativo
                    FROM anagrafica_persone p
                    LEFT JOIN unita_immobiliari u ON (u.proprietario_id = p.id OR u.conduttore_id = p.id) AND u.condominio_id = p.condominio_id
                    WHERE p.condominio_id = ?
                `, [condoId], (errP, persone) => {
                    let matchedP = null;
                    if (!errP && Array.isArray(persone)) {
                        matchedP = persone.find(p => {
                            const pEmail = (p.email || '').trim().toLowerCase();
                            const full1 = `${p.cognome || ''} ${p.nome || ''}`.trim().toLowerCase();
                            const full2 = `${p.nome || ''} ${p.cognome || ''}`.trim().toLowerCase();
                            const uLower = userName.toLowerCase();
                            return (userEmail && pEmail && userEmail === pEmail) || (uLower && (uLower === full1 || uLower === full2));
                        });
                    }
                    const sName = matchedP ? `${matchedP.cognome || ''} ${matchedP.nome || ''}`.trim() : userName;
                    // Destinatario: può essere lo Studio Amministratore ('admin') o un Altro Condòmino ('persona')
                    const isToPeer = (recipient_type === 'persona' || recipient_type === 'condomino_peer') && recipient_persona_id;
                    if (isToPeer) {
                        const targetPeer = (persone || []).find(p => Number(p.id) === Number(recipient_persona_id));
                        const recName = targetPeer ? `${targetPeer.cognome || ''} ${targetPeer.nome || ''}`.trim() : 'Altro Condòmino';
                        const recUnitaParts = [];
                        if (targetPeer && targetPeer.scala) recUnitaParts.push(`Sc. ${targetPeer.scala}`);
                        if (targetPeer && targetPeer.piano) recUnitaParts.push(`P. ${targetPeer.piano}`);
                        if (targetPeer && targetPeer.interno) recUnitaParts.push(`Int. ${targetPeer.interno}`);
                        const recUnitaLabel = recUnitaParts.length > 0 ? recUnitaParts.join(' - ') : (targetPeer ? (targetPeer.identificativo || '') : '');

                        db.run(`
                            INSERT INTO condo_documents
                            (condominio_id, sender_user_id, sender_role, sender_name, sender_persona_id, recipient_type, recipient_persona_id, recipient_name, unita_label, category, title, notes, file_name, file_mime, file_size, file_data, status)
                            VALUES (?, ?, 'condomino', ?, ?, 'persona', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Inviato')
                        `, [condoId, req.user.id, sName, matchedP ? matchedP.id : null, targetPeer ? targetPeer.id : null, recName, recUnitaLabel, cleanCategory, cleanTitle, cleanNotes, cleanFileName, cleanFileMime, cleanFileSize, file_data], function(errIns) {
                            if (errIns) return res.status(500).json({ success: false, message: 'Errore invio documento al condòmino: ' + errIns.message });
                            const newDocId = this.lastID;
                            logAudit(req.user.id, condoId, `Condòmino ${sName} invia allegato a condòmino ${recName}: "${cleanTitle}"`, 'condo_documents', newDocId, null, req.ip);
                            return res.json({
                                success: true,
                                message: `Allegato inviato con successo a ${recName}!`,
                                data: { id: newDocId }
                            });
                        });
                    } else {
                        // Destinatario: Studio Amministratore
                        const unitaParts = [];
                        if (matchedP && matchedP.scala) unitaParts.push(`Sc. ${matchedP.scala}`);
                        if (matchedP && matchedP.piano) unitaParts.push(`P. ${matchedP.piano}`);
                        if (matchedP && matchedP.interno) unitaParts.push(`Int. ${matchedP.interno}`);
                        const unitaLabel = unitaParts.length > 0 ? unitaParts.join(' - ') : ((uRow && uRow.unita) || '');

                        db.run(`
                            INSERT INTO condo_documents
                            (condominio_id, sender_user_id, sender_role, sender_name, sender_persona_id, recipient_type, recipient_name, unita_label, category, title, notes, file_name, file_mime, file_size, file_data, status)
                            VALUES (?, ?, 'condomino', ?, ?, 'admin', 'Studio Amministratore', ?, ?, ?, ?, ?, ?, ?, ?, 'Da visionare')
                        `, [condoId, req.user.id, sName, matchedP ? matchedP.id : null, unitaLabel, cleanCategory, cleanTitle, cleanNotes, cleanFileName, cleanFileMime, cleanFileSize, file_data], function(errIns) {
                            if (errIns) return res.status(500).json({ success: false, message: 'Errore invio documento: ' + errIns.message });
                            const newDocId = this.lastID;
                            logAudit(req.user.id, condoId, `Condòmino ${sName} invia documento allo Studio: "${cleanTitle}" (${cleanFileName})`, 'condo_documents', newDocId, null, req.ip);
                            return res.json({
                                success: true,
                                message: 'Allegato inviato con successo allo Studio Amministratore!',
                                data: { id: newDocId }
                            });
                        });
                    }
                });
            });
        }
    }
});

// Aggiorna stato di lavorazione documento (Solo Amministratore: Da visionare -> Visionato -> Archiviato)
app.patch('/api/documents/:id/status', authenticateToken, requireCondominio, isAdmin, checkCondoLicenseWrite, (req, res) => {
    const docId = parseInt(req.params.id, 10);
    const { status } = req.body || {};
    const validStatuses = ['Pubblicato', 'Inviato', 'Da visionare', 'Visionato', 'Archiviato'];
    if (!status || !validStatuses.includes(status)) {
        return res.status(400).json({ success: false, message: 'Stato non valido.' });
    }
    db.run('UPDATE condo_documents SET status = ? WHERE id = ? AND condominio_id = ?', [status, docId, req.condominio_id], function(err) {
        if (err) return res.status(500).json({ success: false, message: 'Errore aggiornamento stato: ' + err.message });
        return res.json({ success: true, message: `Stato aggiornato a "${status}"!` });
    });
});

// Elimina un Documento (Admin oppure Condòmino proprietario se ancora "Da visionare")
app.delete('/api/documents/:id', authenticateToken, requireCondominio, checkCondoLicenseWrite, (req, res) => {
    const docId = parseInt(req.params.id, 10);
    const condoId = req.condominio_id;
    const isAdminUser = (req.user.is_superadmin || req.role_in_condominio === 'admin');

    db.get('SELECT id, title, sender_user_id, status FROM condo_documents WHERE id = ? AND condominio_id = ?', [docId, condoId], (err, doc) => {
        if (err || !doc) return res.status(404).json({ success: false, message: 'Documento non trovato.' });
        if (!isAdminUser && (Number(doc.sender_user_id) !== Number(req.user.id) || doc.status !== 'Da visionare')) {
            return res.status(403).json({ success: false, message: 'Non hai i permessi per eliminare questo documento.' });
        }
        db.run('DELETE FROM condo_documents WHERE id = ? AND condominio_id = ?', [docId, condoId], function(errDel) {
            if (errDel) return res.status(500).json({ success: false, message: 'Errore eliminazione documento: ' + errDel.message });
            logAudit(req.user.id, condoId, `Elimina Documento: "${doc.title}"`, 'condo_documents', docId, null, req.ip);
            return res.json({ success: true, message: 'Documento eliminato con successo.' });
        });
    });
});


// ============================================================================
// API: GESTIONE DINAMICA TABELLE MILLESIMALI & CALCOLO ART. 1124 C.C.
// ============================================================================

// 1. Elenco Tabelle Millesimali del Condominio
app.get('/api/millesimi/tabelle', authenticateToken, requireCondominio, (req, res) => {
    const condoId = req.condominio_id;
    realignDatabaseToAnagrafica(condoId, () => {
        db.all(`
            SELECT t.*, 
                (SELECT COUNT(DISTINCT q.unita_id) 
                 FROM quote_millesimali q 
                 JOIN unita_immobiliari u ON q.unita_id = u.id 
                 JOIN anagrafica_persone p ON (u.proprietario_id = p.id OR u.conduttore_id = p.id)
                 WHERE q.tabella_id = t.id) as unita_assegnate,
                (SELECT COALESCE(SUM(q.valore_millesimale), 0) 
                 FROM quote_millesimali q 
                 JOIN unita_immobiliari u ON q.unita_id = u.id 
                 JOIN anagrafica_persone p ON (u.proprietario_id = p.id OR u.conduttore_id = p.id)
                 WHERE q.tabella_id = t.id) as somma_millesimi_reale
            FROM anagrafica_tabelle_millesimali t
            WHERE t.condominio_id = ?
            ORDER BY t.id ASC
        `, [condoId], (err, rows) => {
            if (err) return res.status(500).json({ success: false, message: 'Errore lettura tabelle millesimali: ' + err.message });
            return res.json({ success: true, data: rows || [] });
        });
    });
});

// Riallineamento Esplicito e Pulizia Duplicati Unità Millesimali
app.post('/api/millesimi/riallinea-unita', authenticateToken, requireCondominio, isAdmin, checkCondoLicenseWrite, (req, res) => {
    const condoId = req.condominio_id;
    realignDatabaseToAnagrafica(condoId, () => {
        db.get(`
            SELECT COUNT(DISTINCT u.id) as total_units
            FROM unita_immobiliari u
            JOIN anagrafica_persone p ON (u.proprietario_id = p.id OR u.conduttore_id = p.id)
            WHERE u.condominio_id = ?
        `, [condoId], (err, row) => {
            const count = row ? row.total_units : 0;
            // Sincronizza eventuali unità censite mancanti nelle tabelle esistenti
            db.all('SELECT id, codice FROM anagrafica_tabelle_millesimali WHERE condominio_id = ?', [condoId], (tErr, tabs) => {
                if (!tErr && Array.isArray(tabs)) {
                    tabs.forEach(tab => {
                        db.all(`
                            SELECT u.id, u.millesimi_proprieta, u.millesimi_scale, u.millesimi_ascensore
                            FROM unita_immobiliari u
                            JOIN anagrafica_persone p ON (u.proprietario_id = p.id OR u.conduttore_id = p.id)
                            WHERE u.condominio_id = ?
                              AND u.id NOT IN (SELECT unita_id FROM quote_millesimali WHERE tabella_id = ?)
                        `, [condoId, tab.id], (mErr, missing) => {
                            if (!mErr && Array.isArray(missing)) {
                                missing.forEach(mu => {
                                    let v = 0;
                                    if (tab.codice === 'TAB_A') v = parseFloat(mu.millesimi_proprieta) || 0;
                                    else if (tab.codice === 'TAB_B') v = parseFloat(mu.millesimi_scale) || 0;
                                    else if (tab.codice === 'TAB_C') v = parseFloat(mu.millesimi_ascensore) || 0;
                                    db.run('INSERT INTO quote_millesimali (tabella_id, unita_id, valore_millesimale) VALUES (?, ?, ?)', [tab.id, mu.id, v]);
                                });
                            }
                        });
                    });
                }
                logAudit(req.user.id, condoId, `Riallineamento e Deduplica Unità Millesimali (${count} unità attive)`, 'quote_millesimali', null, null, req.ip);
                return res.json({
                    success: true,
                    message: `Riallineamento completato con successo: ${count} unità censite attive (nessun duplicato).`,
                    active_units: count
                });
            });
        });
    });
});

// 2. Crea Nuova Tabella Millesimale Personalizzata
app.post('/api/millesimi/tabelle', authenticateToken, requireCondominio, isAdmin, checkCondoLicenseWrite, (req, res) => {
    const condoId = req.condominio_id;
    const { codice, descrizione, categoria, scala_filtro, clone_from_tab_id } = req.body || {};

    if (!codice || !descrizione) {
        return res.status(400).json({ success: false, message: 'Codice e Descrizione della tabella sono obbligatori.' });
    }

    const cleanCodice = String(codice).trim().toUpperCase().replace(/\s+/g, '_');
    const cleanDesc = String(descrizione).trim();
    const cleanCat = categoria || 'Personalizzata';
    const cleanScala = (scala_filtro && String(scala_filtro).trim()) ? String(scala_filtro).trim().toUpperCase() : null;

    db.run(
        `INSERT INTO anagrafica_tabelle_millesimali (condominio_id, codice, descrizione, categoria, scala_filtro, totale_millesimi) VALUES (?, ?, ?, ?, ?, 1000.0000)`,
        [condoId, cleanCodice, cleanDesc, cleanCat, cleanScala],
        function(err) {
            if (err) return res.status(500).json({ success: false, message: 'Errore creazione tabella millesimale: ' + err.message });
            const newTabId = this.lastID;

            // Clona quote da tabella esistente o popola da unità attive
            if (clone_from_tab_id) {
                db.all('SELECT unita_id, valore_millesimale FROM quote_millesimali WHERE tabella_id = ?', [clone_from_tab_id], (cErr, cRows) => {
                    if (!cErr && Array.isArray(cRows)) {
                        cRows.forEach(cr => {
                            db.run('INSERT INTO quote_millesimali (tabella_id, unita_id, valore_millesimale) VALUES (?, ?, ?)', [newTabId, cr.unita_id, cr.valore_millesimale]);
                        });
                    }
                });
            } else {
                // Popola tutte le unità del condominio (eventualmente filtrate per scala)
                const scalaFilterSql = cleanScala ? `AND u.scala = '${cleanScala}'` : '';
                db.all(`
                    SELECT u.id, u.millesimi_proprieta 
                    FROM unita_immobiliari u 
                    JOIN anagrafica_persone p ON (u.proprietario_id = p.id OR u.conduttore_id = p.id)
                    WHERE u.condominio_id = ? ${scalaFilterSql}
                `, [condoId], (uErr, units) => {
                    if (!uErr && Array.isArray(units)) {
                        units.forEach(u => {
                            db.run('INSERT INTO quote_millesimali (tabella_id, unita_id, valore_millesimale) VALUES (?, ?, ?)', [newTabId, u.id, parseFloat(u.millesimi_proprieta) || 0]);
                        });
                    }
                });
            }

            logAudit(req.user.id, condoId, `Creata Tabella Millesimale: "${cleanCodice}" - ${cleanDesc}`, 'anagrafica_tabelle_millesimali', newTabId, null, req.ip);
            return res.json({ success: true, message: `Tabella "${cleanDesc}" creata con successo!`, data: { id: newTabId } });
        }
    );
});

// 3. Dettaglio Quote per Singola Tabella con Dati Condòmino/Unità
app.get('/api/millesimi/tabelle/:id/quote', authenticateToken, requireCondominio, (req, res) => {
    const tabId = parseInt(req.params.id, 10);
    const condoId = req.condominio_id;

    db.get('SELECT * FROM anagrafica_tabelle_millesimali WHERE id = ? AND condominio_id = ?', [tabId, condoId], (tErr, tab) => {
        if (tErr || !tab) return res.status(404).json({ success: false, message: 'Tabella millesimale non trovata.' });

        db.all(`
            SELECT q.id as quota_id, q.valore_millesimale, q.parametro_ausiliario, q.note,
                   u.id as unita_id, u.identificativo, u.tipo, u.scala, u.piano, u.interno, u.dati_catastali,
                   p.id as persona_id, p.nome, p.cognome, p.codice_fiscale
            FROM quote_millesimali q
            JOIN unita_immobiliari u ON q.unita_id = u.id
            JOIN anagrafica_persone p ON (u.proprietario_id = p.id OR u.conduttore_id = p.id)
            WHERE q.tabella_id = ?
            ORDER BY u.scala ASC, u.piano ASC, u.interno ASC
        `, [tabId], (err, rows) => {
            if (err) return res.status(500).json({ success: false, message: 'Errore lettura quote: ' + err.message });
            return res.json({ success: true, tabella: tab, data: rows || [] });
        });
    });
});

// 4. Aggiorna Quota Millesimale Singola Unità
app.put('/api/millesimi/tabelle/:id/quote/:unitaId', authenticateToken, requireCondominio, isAdmin, checkCondoLicenseWrite, (req, res) => {
    const tabId = parseInt(req.params.id, 10);
    const unitaId = parseInt(req.params.unitaId, 10);
    const { valore_millesimale, parametro_ausiliario, note } = req.body || {};

    const cleanVal = Math.max(0, parseFloat(valore_millesimale) || 0);

    db.run(`
        INSERT INTO quote_millesimali (tabella_id, unita_id, valore_millesimale, parametro_ausiliario, note)
        VALUES (?, ?, ?, ?, ?)
        ON CONFLICT(tabella_id, unita_id) DO UPDATE SET 
            valore_millesimale = excluded.valore_millesimale,
            parametro_ausiliario = excluded.parametro_ausiliario,
            note = excluded.note
    `, [tabId, unitaId, cleanVal, parametro_ausiliario || null, note || null], function(err) {
        if (err) return res.status(500).json({ success: false, message: 'Errore aggiornamento quota: ' + err.message });
        return res.json({ success: true, message: 'Quota millesimale aggiornata!' });
    });
});

// 5. Algoritmo di Calcolo Automatico Tabella B (Art. 1124 c.c. - Scale & Ascensore)
app.post('/api/millesimi/tabelle/calcola-art1124', authenticateToken, requireCondominio, isAdmin, checkCondoLicenseWrite, (req, res) => {
    const condoId = req.condominio_id;
    const { tabella_destinazione_id, scala_filtro } = req.body || {};

    if (!tabella_destinazione_id) {
        return res.status(400).json({ success: false, message: 'Seleziona la tabella di destinazione per la Tabella B.' });
    }

    const scalaSql = scala_filtro ? `AND u.scala = '${String(scala_filtro).trim().toUpperCase()}'` : '';

    // Recupera le unità del fabbricato con millesimi di proprietà e piano
    db.all(`
        SELECT u.id, u.identificativo, u.scala, u.piano, u.millesimi_proprieta,
               COALESCE(u.altezza_piano_metri, NULL) as altezza_metri
        FROM unita_immobiliari u
        JOIN anagrafica_persone p ON (u.proprietario_id = p.id OR u.conduttore_id = p.id)
        WHERE u.condominio_id = ? ${scalaSql}
    `, [condoId], (err, units) => {
        if (err || !units || units.length === 0) {
            return res.status(400).json({ success: false, message: 'Nessuna unità immobiliare trovata per il calcolo.' });
        }

        // Calcola l'altezza convenzionale in base al piano (se non presente altezza metrica espressa)
        // Piano T/R = 1, P1 = 2, P2 = 3, P3 = 4, Interrato = 0.5
        const unitsWithH = units.map(u => {
            const millProp = parseFloat(u.millesimi_proprieta) || 0;
            let h = 1.0;
            if (u.altezza_metri && parseFloat(u.altezza_metri) > 0) {
                h = parseFloat(u.altezza_metri);
            } else {
                const pNum = parseInt(String(u.piano || '0').replace(/[^0-9\-]/g, ''), 10);
                if (!isNaN(pNum)) {
                    h = pNum < 0 ? 0.5 : (pNum === 0 ? 1.0 : (pNum + 1.0));
                }
            }
            return {
                id: u.id,
                millProp,
                h,
                prodValoreAltezza: millProp * h
            };
        });

        const totMillProp = unitsWithH.reduce((acc, u) => acc + u.millProp, 0);
        const totProd = unitsWithH.reduce((acc, u) => acc + u.prodValoreAltezza, 0);

        if (totMillProp <= 0 || totProd <= 0) {
            return res.status(400).json({ success: false, message: 'Millesimi di proprietà generali non valorizzati per le unità.' });
        }

        // Formula Art. 1124 c.c.: 500 * (MillProp / TotMillProp) + 500 * (Prod / TotProd)
        const computedQuotes = unitsWithH.map(u => {
            const quotaValore = 500.0 * (u.millProp / totMillProp);
            const quotaAltezza = 500.0 * (u.prodValoreAltezza / totProd);
            const quotaTotale = Math.round((quotaValore + quotaAltezza) * 10000) / 10000;
            return {
                unita_id: u.id,
                valore: quotaTotale
            };
        });

        // Quadratura a 1000.0000 esatti
        const sumComputed = computedQuotes.reduce((acc, q) => acc + q.valore, 0);
        const diff = Math.round((1000.0000 - sumComputed) * 10000) / 10000;
        if (diff !== 0 && computedQuotes.length > 0) {
            computedQuotes.sort((a, b) => b.valore - a.valore);
            computedQuotes[0].valore = Math.round((computedQuotes[0].valore + diff) * 10000) / 10000;
        }

        // Scrittura batch su database
        let pending = computedQuotes.length;
        computedQuotes.forEach(cq => {
            db.run(`
                INSERT INTO quote_millesimali (tabella_id, unita_id, valore_millesimale, note)
                VALUES (?, ?, ?, 'Calcolato auto Art. 1124 c.c.')
                ON CONFLICT(tabella_id, unita_id) DO UPDATE SET 
                    valore_millesimale = excluded.valore_millesimale,
                    note = excluded.note
            `, [tabella_destinazione_id, cq.unita_id, cq.valore], () => {
                pending--;
                if (pending <= 0) {
                    logAudit(req.user.id, condoId, `Calcolata Tabella B Art. 1124 c.c. per tabella ID ${tabella_destinazione_id}`, 'quote_millesimali', tabella_destinazione_id, null, req.ip);
                    return res.json({
                        success: true,
                        message: `Tabella B calcolata con successo su ${computedQuotes.length} unità (Art. 1124 c.c., quadratura 1000.0000 millesimi)!`,
                        data: computedQuotes
                    });
                }
            });
        });
    });
});

// 404 per richieste API non trovate
app.use('/api', (req, res) => {
    res.status(404).json({ success: false, message: 'Endpoint API non trovato' });
});

// Fallback Frontend SPA
app.use((req, res, next) => {
    if (req.method === 'GET' && !req.path.startsWith('/api')) {
        return res.sendFile(path.join(__dirname, 'public', 'index.html'));
    }
    next();
});

// Gestore globale errori Express (Cattura eccezioni di route e payload)
app.use((err, req, res, next) => {
    console.error('⚠️ [EXPRESS GLOBAL ERROR HANDLER]:', err && (err.message || err));
    if (res.headersSent) return next(err);
    const status = err.status || err.statusCode || 500;
    res.status(status).json({
        success: false,
        message: err.message || 'Si è verificato un errore interno del server.'
    });
});



app.listen(PORT, () => {
    console.log(`====================================================`);
    console.log(`🏢 MULTI-TENANT CONDO ONLINE (SaaS) - STEP 1 & 2`);
    console.log(`🚀 Server in ascolto su: http://localhost:${PORT}`);
    console.log(`====================================================`);
});

module.exports = app;


async function selfHealCondoData() {
    if (db.type !== 'mysql') return;
    let conn;
    try {
        conn = await db.getConnection();

        // 1. Assicura che condominios abbia Condominio Ma.Ca. con ID 1
        await conn.query(`
            INSERT INTO condominios (id, nome, indirizzo, cf, scala)
            VALUES (1, 'Condominio Ma.Ca.', 'Via Vittorio Alfieri, 4 - 81020 San Nicola la Strada (Ce)', '9304301615', 'Scale A e B')
            ON DUPLICATE KEY UPDATE nome = VALUES(nome), indirizzo = VALUES(indirizzo), cf = VALUES(cf), scala = VALUES(scala)
        `).catch(() => {});

        // 2. Assicura associazione per Studio Rossi (admin) su Condominio Ma.Ca.
        await conn.query(`
            INSERT INTO user_condominios (user_id, condominio_id, role, unita)
            SELECT u.id, 1, 'admin', 'Ufficio'
            FROM users u WHERE LOWER(u.email) = 'admin@condominio.it'
            ON DUPLICATE KEY UPDATE role = 'admin'
        `).catch(() => {});

        // 3. Assicura che tutti i condòmini registrati siano in anagrafica_persone
        const [condoUsers] = await conn.query(`
            SELECT u.id as user_id, u.nome, u.email, u.telefono, uc.condominio_id, uc.unita, uc.role
            FROM users u
            JOIN user_condominios uc ON u.id = uc.user_id
            WHERE uc.condominio_id = 1 OR uc.role = 'condomino'
        `).catch(() => [[]]);

        for (const u of (condoUsers || [])) {
            if (u.role === 'admin' || !u.nome) continue;
            let nome = u.nome.trim();
            let cognome = '';
            const sp = nome.split(/\s+/);
            if (sp.length > 1) {
                nome = sp[0];
                cognome = sp.slice(1).join(' ');
            }

            const [pRows] = await conn.query(`
                SELECT id FROM anagrafica_persone
                WHERE condominio_id = ? AND (
                    (email IS NOT NULL AND email != '' AND LOWER(email) = LOWER(?))
                    OR (LOWER(nome) = LOWER(?) AND LOWER(cognome) = LOWER(?))
                )
            `, [u.condominio_id, u.email || '', nome, cognome]).catch(() => [[]]);

            let personaId;
            if (!pRows || pRows.length === 0) {
                const [pIns] = await conn.query(`
                    INSERT INTO anagrafica_persone 
                    (condominio_id, nome, cognome, email, cellulare, ruolo_default, created_at)
                    VALUES (?, ?, ?, ?, ?, 'Proprietario', NOW())
                `, [u.condominio_id, nome, cognome, u.email || '', u.telefono || '']).catch(() => [{}]);
                personaId = pIns ? pIns.insertId : null;
            } else {
                personaId = pRows[0].id;
                if (u.email) {
                    await conn.query(`UPDATE anagrafica_persone SET email = COALESCE(NULLIF(email, ''), ?) WHERE id = ?`, [u.email, personaId]).catch(() => {});
                }
            }

            if (!personaId) continue;

            const unitaLabel = u.unita || 'Int. 1';
            let scala = null, piano = null, interno = null;
            const mSc = unitaLabel.match(/Scala\s+([A-Za-z0-9]+)/i);
            if (mSc) scala = mSc[1];
            const mPi = unitaLabel.match(/Piano\s+([A-Za-z0-9°]+)/i);
            if (mPi) piano = mPi[1];
            const mIn = unitaLabel.match(/Int\.?\s*([A-Za-z0-9]+)/i);
            if (mIn) interno = mIn[1];
            else interno = unitaLabel;

            const [uRows] = await conn.query(`
                SELECT id FROM unita_immobiliari 
                WHERE condominio_id = ? AND (proprietario_id = ? OR user_id = ?)
            `, [u.condominio_id, personaId, u.user_id]).catch(() => [[]]);

            let unitaId;
            if (!uRows || uRows.length === 0) {
                const [uIns] = await conn.query(`
                    INSERT INTO unita_immobiliari
                    (condominio_id, user_id, tipo, identificativo, scala, piano, interno, millesimi_proprieta, millesimi_scale, millesimi_ascensore, proprietario_id, created_at)
                    VALUES (?, ?, 'Appartamento', ?, ?, ?, ?, 100.00, 100.00, 100.00, ?, NOW())
                `, [u.condominio_id, u.user_id, unitaLabel, scala, piano, interno, personaId]).catch(() => [{}]);
                unitaId = uIns ? uIns.insertId : null;
            } else {
                unitaId = uRows[0].id;
                await conn.query(`
                    UPDATE unita_immobiliari 
                    SET proprietario_id = COALESCE(proprietario_id, ?), user_id = COALESCE(user_id, ?)
                    WHERE id = ?
                `, [personaId, u.user_id, unitaId]).catch(() => {});
            }

            const [qRows] = await conn.query(`
                SELECT id FROM quotes WHERE condominio_id = ? AND (persona_id = ? OR unita_id = ?)
            `, [u.condominio_id, personaId, unitaId]).catch(() => [[]]);

            if (!qRows || qRows.length === 0) {
                await conn.query(`
                    INSERT INTO quotes 
                    (condominio_id, persona_id, unita_id, user_id, type, title, due_date, amount, paid_amount, status, created_at)
                    VALUES (?, ?, ?, ?, 'ordinaria', 'RATA ORDINARIA GESTIONE', '2026-11-15', 75.00, 0.00, 'In sospeso', NOW())
                `, [u.condominio_id, personaId, unitaId, u.user_id]).catch(() => {});
            } else {
                await conn.query(`
                    UPDATE quotes 
                    SET persona_id = COALESCE(persona_id, ?), unita_id = COALESCE(unita_id, ?)
                    WHERE id = ?
                `, [personaId, unitaId, qRows[0].id]).catch(() => {});
            }
        }

        const [supp] = await conn.query(`SELECT id FROM suppliers WHERE condominio_id = 1`).catch(() => [[]]);
        if (!supp || supp.length === 0) {
            await conn.query(`
                INSERT INTO suppliers (condominio_id, name, piva, cf, address, created_at)
                VALUES (1, 'La veloce tutto lind srl', '0158945221444', 'dddfrc85b62f839c', 'Via dei Matti, n° 0', NOW())
            `).catch(() => {});
            await conn.query(`
                INSERT INTO supplier_payments (condominio_id, supplier_name, category, invoice_number, amount, paid_amount, due_date, status, created_at)
                VALUES (1, 'La veloce tutto lind srl', 'Pulizia Scale', '1257', 250.00, 250.00, '2026-09-30', 'Pagato', NOW())
            `).catch(() => {});
        }

        const [bank] = await conn.query(`SELECT id FROM bank_accounts WHERE condominio_id = 1`).catch(() => [[]]);
        if (!bank || bank.length === 0) {
            await conn.query(`
                INSERT INTO bank_accounts (condominio_id, bank_name, iban, account_holder, created_at)
                VALUES (1, 'Banca Intesa Sanpaolo', 'IT30000000123456789012345', 'Condominio Ma.Ca.', NOW())
            `).catch(() => {});
        }

        await conn.query(`
            UPDATE condominios SET
                dati_bancari = COALESCE(NULLIF(dati_bancari, ''), 'Banca Intesa - IBAN: IT30000000123456789012345'),
                admin_nome = COALESCE(NULLIF(admin_nome, ''), 'Tizio'),
                admin_cognome = COALESCE(NULLIF(admin_cognome, ''), 'Caio'),
                admin_titolo = COALESCE(NULLIF(admin_titolo, ''), 'Avv.'),
                admin_telefono = COALESCE(NULLIF(admin_telefono, ''), '018890192456'),
                admin_cellulare = COALESCE(NULLIF(admin_cellulare, ''), '3357985406'),
                admin_emergenze = COALESCE(NULLIF(admin_emergenze, ''), '34879512689'),
                admin_email = COALESCE(NULLIF(admin_email, ''), 'test@gmail.com'),
                admin_pec = COALESCE(NULLIF(admin_pec, ''), 'test@pec.it')
            WHERE id = 1
        `).catch(() => {});

        console.log('✅ [Self-Heal] Sincronizzazione automatica e ripristino dati Condominio Ma.Ca. completati.');
    } catch (e) {
        console.warn('⚠️ [Self-Heal] Errore:', e.message);
    } finally {
        if (conn) {
            try { conn.release(); } catch (_) {}
        }
    }
}

