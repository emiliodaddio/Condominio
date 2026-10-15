const fs = require('fs');
const path = require('path');

// Carica variabili da .env
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
    } catch (_) {}
}

const express = require('express');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const cors = require('cors');
const multer = require('multer');
const ExcelJS = require('exceljs');
const speakeasy = require('speakeasy');
const QRCode = require('qrcode');
const nodemailer = require('nodemailer');
const puppeteer = require('puppeteer');

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

app.get('/api/export/accounting-excel', authenticateToken, requireCondominio, checkCondoLicenseWrite, async (req, res) => {
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

        browser = await puppeteer.launch({
            headless: 'new',
            args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
        });
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

const PORT = process.env.PORT || 3000;
const JWT_SECRET = 'chiave_segreta_condominio_sicura_123!';

app.use(cors());
app.use(express.json());

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
        });


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
        { table: 'unita_immobiliari', col: 'conduttore_id', defMysql: 'INT', defSqlite: 'INTEGER' }
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
    if (req.user && req.user.is_superadmin) {
        return next();
    }
    return res.status(403).json({ success: false, message: 'Accesso negato: operazione riservata al SuperUser (Proprietario).' });
}

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

        // Genera OTP di 6 cifre
        const otpCode = Math.floor(100000 + Math.random() * 900000).toString();
        const otpExpires = Date.now() + 10 * 60 * 1000; // 10 minuti

        db.run('UPDATE users SET otp_code = ?, otp_expires = ? WHERE id = ?', [otpCode, otpExpires, user.id], async (err) => {
            if (err) return res.status(500).json({ success: false, message: 'Errore di sistema' });

            try {
                let testAccount = await nodemailer.createTestAccount();
                let transporter = nodemailer.createTransport({
                    host: "smtp.ethereal.email",
                    port: 587,
                    secure: false,
                    auth: { user: testAccount.user, pass: testAccount.pass },
                });

                let info = await transporter.sendMail({
                    from: '"CondoTransparent" <no-reply@condominio.it>',
                    to: user.email,
                    subject: "Codice di Accesso (OTP)",
                    text: `Il tuo codice di accesso è: ${otpCode}\nScade in 10 minuti.`,
                    html: `<h3>Codice di Accesso 2FA</h3><p>Il tuo codice è: <b>${otpCode}</b></p><p>Scade in 10 minuti.</p>`,
                });

                const previewUrl = nodemailer.getTestMessageUrl(info);
                console.log("OTP Email sent to", user.email, "- Preview:", previewUrl);

                logAudit(user.id, null, 'Richiesta OTP Login', 'users', user.id, null, req.ip);
                return res.json({ success: true, requireOTP: true, userId: user.id, email: user.email, previewUrl: previewUrl });
            } catch (e) {
                console.error(e);
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
        if (Date.now() > user.otp_expires) {
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
    const interno = (uData.interno || '').trim();
    if (!ident && interno) {
        ident = 'Int. ' + interno;
    }
    // Se non ci sono campi unità compilati, non sincronizziamo l'unità
    if (!ident && !interno && !uData.millesimi_proprieta && !uData.scala && !uData.piano && !uData.dati_catastali) {
        return callback ? callback(null) : null;
    }
    if (!ident) {
        ident = (uData.tipo || 'Unità') + ' ' + (interno || personaId);
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
                uData.scala || '', 
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
                uData.scala || '', 
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
    const fetchList = (isRetry = false) => {
        const sql = `
            SELECT p.*,
                   (SELECT id FROM unita_immobiliari WHERE (proprietario_id = p.id OR conduttore_id = p.id) AND condominio_id = p.condominio_id LIMIT 1) as unita_id,
                   (SELECT identificativo FROM unita_immobiliari WHERE (proprietario_id = p.id OR conduttore_id = p.id) AND condominio_id = p.condominio_id LIMIT 1) as unita_identificativo,
                   (SELECT tipo FROM unita_immobiliari WHERE (proprietario_id = p.id OR conduttore_id = p.id) AND condominio_id = p.condominio_id LIMIT 1) as unita_tipo,
                   (SELECT scala FROM unita_immobiliari WHERE (proprietario_id = p.id OR conduttore_id = p.id) AND condominio_id = p.condominio_id LIMIT 1) as unita_scala,
                   (SELECT piano FROM unita_immobiliari WHERE (proprietario_id = p.id OR conduttore_id = p.id) AND condominio_id = p.condominio_id LIMIT 1) as unita_piano,
                   (SELECT interno FROM unita_immobiliari WHERE (proprietario_id = p.id OR conduttore_id = p.id) AND condominio_id = p.condominio_id LIMIT 1) as unita_interno,
                   (SELECT millesimi_proprieta FROM unita_immobiliari WHERE (proprietario_id = p.id OR conduttore_id = p.id) AND condominio_id = p.condominio_id LIMIT 1) as unita_mill_prop,
                   (SELECT millesimi_scale FROM unita_immobiliari WHERE (proprietario_id = p.id OR conduttore_id = p.id) AND condominio_id = p.condominio_id LIMIT 1) as unita_mill_scale,
                   (SELECT millesimi_ascensore FROM unita_immobiliari WHERE (proprietario_id = p.id OR conduttore_id = p.id) AND condominio_id = p.condominio_id LIMIT 1) as unita_mill_asc,
                   (SELECT dati_catastali FROM unita_immobiliari WHERE (proprietario_id = p.id OR conduttore_id = p.id) AND condominio_id = p.condominio_id LIMIT 1) as unita_dati_catastali
            FROM anagrafica_persone p
            WHERE p.condominio_id = ?
            ORDER BY p.cognome ASC, p.nome ASC`;
        db.all(sql, [req.condominio_id], (err, rows) => {
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
    db.run('UPDATE unita_immobiliari SET proprietario_id = NULL WHERE proprietario_id = ? AND condominio_id = ?', [req.params.id, req.condominio_id], () => {
        db.run('UPDATE unita_immobiliari SET conduttore_id = NULL WHERE conduttore_id = ? AND condominio_id = ?', [req.params.id, req.condominio_id], () => {
            db.run('DELETE FROM anagrafica_persone WHERE id = ? AND condominio_id = ?', [req.params.id, req.condominio_id], function(err) {
                if (err) return res.status(500).json({ success: false, message: err.message });
                logAudit(req.user.id, req.condominio_id, 'Eliminata Persona da Anagrafica', 'anagrafica_persone', req.params.id, null, req.ip);
                res.json({ success: true });
            });
        });
    });
});

app.get('/api/unita', authenticateToken, requireCondominio, (req, res) => {
    db.all(`SELECT u.*, 
            us.nome as condomino_nome, us.email as condomino_email,
            p.nome as prop_nome, p.cognome as prop_cognome,
            c.nome as cond_nome, c.cognome as cond_cognome
            FROM unita_immobiliari u 
            LEFT JOIN users us ON u.user_id = us.id 
            LEFT JOIN anagrafica_persone p ON u.proprietario_id = p.id 
            LEFT JOIN anagrafica_persone c ON u.conduttore_id = c.id
            WHERE u.condominio_id = ? 
            ORDER BY u.identificativo ASC`, [req.condominio_id], (err, rows) => {
        res.json({ success: true, data: rows });
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

// Quote e Receivables (Crediti) con ANONIMIZZAZIONE e SALDO PARZIALE
app.get('/api/receivables', authenticateToken, requireCondominio, (req, res) => {
    db.all(`SELECT q.*, p.nome as persona_nome, p.cognome as persona_cognome, ui.identificativo as unita 
             FROM quotes q 
             LEFT JOIN anagrafica_persone p ON q.persona_id = p.id 
             LEFT JOIN unita_immobiliari ui ON q.unita_id = ui.id 
             WHERE q.condominio_id = ? AND (q.status != 'Pagato' OR (q.amount - COALESCE(q.paid_amount, 0)) > 0.009)`, 
    [req.condominio_id], (err, rows) => {
        if (err) return res.status(500).json({success: false, message: err.message});
        if (req.role_in_condominio === 'admin') {
            res.json({ success: true, data: rows.map(r => {
                const total = parseFloat(r.amount) || 0;
                const paid = (r.paid_amount !== undefined && r.paid_amount !== null) ? parseFloat(r.paid_amount) : 0;
                const residual = Math.max(0, Math.round((total - paid) * 100) / 100);
                return {
                    ...r,
                    debitore: r.persona_cognome ? r.persona_cognome + ' ' + r.persona_nome : 'Sconosciuto',
                    unita: r.unita || '-',
                    titolo_quota: r.title,
                    importo_totale: total,
                    importo_versato: paid,
                    importo: residual,
                    residual: residual,
                    scadenza: r.due_date,
                    status: r.status
                };
            }) });
        } else {
            // Anonimizzazione
            let i = 1;
            const data = rows.map(r => {
                const total = parseFloat(r.amount) || 0;
                const paid = (r.paid_amount !== undefined && r.paid_amount !== null) ? parseFloat(r.paid_amount) : 0;
                const residual = Math.max(0, Math.round((total - paid) * 100) / 100);
                return {
                    id: r.id, is_my_quote: false, importo: residual, importo_totale: total, importo_versato: paid, residual: residual, scadenza: r.due_date, titolo_quota: r.title, status: r.status,
                    debitore: 'Condòmino #' + (i++), unita: 'Unità Riservata'
                };
            });
            res.json({ success: true, data });
        }
    });
});


app.get('/api/quotes', authenticateToken, requireCondominio, (req, res) => {
    db.all(`SELECT q.*, p.nome as persona_nome, p.cognome as persona_cognome, ui.identificativo as condomino_unita 
             FROM quotes q 
             LEFT JOIN anagrafica_persone p ON q.persona_id = p.id 
             LEFT JOIN unita_immobiliari ui ON q.unita_id = ui.id 
             WHERE q.condominio_id = ? ORDER BY q.due_date ASC`, 
    [req.condominio_id], (err, rows) => {
        if (err) return res.status(500).json({success: false, message: err.message});
        // Remap to match what frontend expects
        const mapped = rows.map(r => {
            const total = parseFloat(r.amount) || 0;
            const paid = (r.paid_amount !== undefined && r.paid_amount !== null)
                ? parseFloat(r.paid_amount)
                : (r.status === 'Pagato' ? total : 0);
            const residual = Math.max(0, Math.round((total - paid) * 100) / 100);
            return {
                ...r, 
                amount: total,
                paid_amount: paid,
                residual: residual,
                condomino_nome: r.persona_cognome ? r.persona_cognome + ' ' + r.persona_nome : 'Sconosciuto', 
                condomino_unita: r.condomino_unita || '-',
                unita: r.condomino_unita || '-'
            };
        });
        res.json({ success: true, data: mapped });
    });
});

app.post('/api/quotes', authenticateToken, requireCondominio, isAdmin, checkCondoLicenseWrite, (req, res) => {
    const { persona_id, unita_id, type, title, amount, due_date, paid_amount, payment_method, notes } = req.body;
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
        `INSERT INTO quotes (condominio_id, persona_id, unita_id, type, title, amount, paid_amount, due_date, status, payment_history) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [req.condominio_id, personaVal, unitaVal, type || 'ordinaria', title, amountVal, paidVal, due_date, status, history.length > 0 ? JSON.stringify(history) : null],
        function(err) {
            if (err) return res.status(500).json({ success: false, message: err.message });
            res.json({ success: true, id: this.lastID });
        }
    );
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
    const { nome, email, password, unita, role, telefono, dati_catastali } = req.body;
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
    const fields = ['nome', 'indirizzo', 'cf', 'scala', 'admin_nome', 'admin_cognome', 'admin_titolo', 'admin_telefono', 'admin_cellulare', 'admin_emergenze', 'admin_email', 'admin_pec'];
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
    
    db.run(query, params, function(err) {
        if (err) return res.status(500).json({ success: false, error: err.message });
        res.json({ success: true });
    });
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

// --- PASSWORD RECOVERY ROUTES ---
app.post('/api/auth/forgot-password', (req, res) => {
    const { email } = req.body;
    if (!email) return res.status(400).json({ success: false, message: 'Email obbligatoria' });

    db.get('SELECT id FROM users WHERE LOWER(email) = LOWER(?)', [email.trim()], (err, user) => {
        if (err || !user) {
            return res.json({ success: true, message: 'Se l\'email esiste nel sistema, riceverai un link per il reset.' });
        }

        const crypto = require('crypto');
        const token = crypto.randomBytes(32).toString('hex');
        const expires = Date.now() + 3600000;

        db.run('UPDATE users SET reset_token = ?, reset_token_expires = ? WHERE id = ?', [token, expires, user.id], (err) => {
            if (err) return res.status(500).json({ success: false, message: 'Errore interno' });

            const host = req.get('host');
            const protocol = req.protocol || 'http';
            const resetLink = `${protocol}://${host}/login.html?token=${token}`;

            const mailOptions = {
                from: '"Gestione Condominio" <no-reply@condominio.it>',
                to: email,
                subject: 'Recupero Password - Gestione Condominio',
                text: `Hai richiesto il reset della password.\nClicca qui per reimpostarla: ${resetLink}\nIl link scade tra 1 ora.`,
                html: `<p>Hai richiesto il reset della password.</p><p><a href="${resetLink}">Clicca qui per reimpostarla</a></p><p>Il link scade tra 1 ora.</p>`
            };

            if (transporter) {
                transporter.sendMail(mailOptions, (err, info) => {
                    if (err) console.error('Errore invio mail reset:', err);
                    else {
                        const nodemailer = require('nodemailer');
                        const url = nodemailer.getTestMessageUrl(info);
                        console.log('🔗 Mail di Reset Password inviata! Anteprima:', url);
                        db.run('INSERT INTO security_logs (user_id, action) VALUES (?, ?)', 
                            [user.id, `Richiesta reset (Email di test inviata: <a href="${url}" target="_blank" class="text-blue-500 underline">Apri Email</a>)`]);
                    }
                });
            }
            res.json({ success: true, message: 'Se l\'email esiste nel sistema, riceverai un link per il reset.' });
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


app.post('/api/assemblies/send-convocation', authenticateToken, requireCondominio, isAdmin, checkCondoLicenseWrite, async (req, res) => {
    const { userId, email, nome, htmlContent, activeCondoName } = req.body;
    
    if (!email) {
        return res.status(400).json({ success: false, message: 'Nessuna email associata a questo condomino.' });
    }

    let browser;
    try {
        if (!transporter) throw new Error("Servizio email non pronto");
        
        console.log("Generazione PDF in corso...");
        browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'] });
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



// ---------------------------------------------------------
// INVIO RICEVUTA PAGAMENTO
// ---------------------------------------------------------


// ---------------------------------------------------------
// INVIO RICEVUTA PAGAMENTO
// ---------------------------------------------------------


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
                browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'] });
                const page = await browser.newPage();
                
                const htmlContent = `
                    <html>
                    <body style="font-family: Arial; padding: 40px; color: #333;">
                        <h2 style="text-align:center; border-bottom: 2px solid #333; padding-bottom:10px;">AMMINISTRAZIONE CONDOMINIO<br>${activeCondoName}</h2>
                        <h1 style="text-align:center; color: #16a34a; margin-top:40px;">RICEVUTA DI PAGAMENTO</h1>
                        <p style="text-align:right; margin-bottom:40px;">Data: ${new Date().toLocaleDateString('it-IT')}</p>
                        <p>Si attesta di aver ricevuto dal Sig./Sig.ra <b>${quote.nome}</b> (Unit: ${quote.unita || 'N/D'})</p>
                        <p>La somma di: <b style="font-size:24px;"> ${quote.amount.toFixed(2)}</b></p>
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
                browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'] });
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
                            Unit�: ${quote.unita || 'N/D'}
                        </div>
                        
                        <p>Gentile Cond�mino,</p>
                        <p>Dalla verifica contabile ad oggi effettuata, non ci risulta pervenuto il pagamento relativo alla seguente quota condominiale, ormai <b>scaduta</b>:</p>
                        
                        <div style="background: #fef2f2; padding: 20px; border: 1px solid #fecaca; border-radius: 8px; margin: 20px 0;">
                            <strong>${quote.title}</strong><br>
                            Importo da saldare: <b style="color:#dc2626; font-size:18px;">� ${quote.amount.toFixed(2)}</b><br>
                            Scaduta il: ${new Date(quote.due_date).toLocaleDateString('it-IT')}
                        </div>
                        
                        <p>La invitiamo a provvedere al saldo nel pi� breve tempo possibile, per consentire la corretta e serena gestione del Condominio.</p>
                        <p>Qualora avesse gi� provveduto al pagamento, La preghiamo di non tenere conto della presente comunicazione.</p>
                        
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
                browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'] });
                
                // Formatta il messaggio con br per l'HTML
                const formattedMessage = message.replace(/\\n/g, '<br>');
                
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
                                Unit�: ${u.unita || 'N/D'}
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
                    
                    db.run('INSERT INTO convocations_log (condominio_id, user_id, destinatario, email, preview_url) VALUES (?, ?, ?, ?, ?)', 
                        [req.condominio_id, u.id, 'COMUNICAZIONE: ' + subject.substring(0, 20), u.email, previewUrl]);
                }
                
                await browser.close();
                res.json({ success: true, message: 'Comunicazioni inviate con successo a ' + validUsers.length + ' cond�mini!' });
                
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


// 404 per richieste API non trovate
app.use('/api', (req, res) => {
    res.status(404).json({ success: false, message: 'Endpoint API non trovato' });
});

// Fallback Frontend SPA
app.use((req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));



app.listen(PORT, () => {
    console.log(`====================================================`);
    console.log(`🏢 MULTI-TENANT CONDO ONLINE (SaaS) - STEP 1 & 2`);
    console.log(`🚀 Server in ascolto su: http://localhost:${PORT}`);
    console.log(`====================================================`);
});
