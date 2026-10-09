const fs = require('fs');
const path = require('path');

const serverFile = path.join(__dirname, 'server.js');
let code = fs.readFileSync(serverFile, 'utf8');

const exportEndpoint = `
// ==========================================
// EXPORT EXCEL ENDPOINT
// ==========================================
app.get('/api/export/accounting-excel', authenticateToken, requireCondominio, async (req, res) => {
    try {
        const ExcelJS = require('exceljs');
        const workbook = new ExcelJS.Workbook();
        const worksheet = workbook.addWorksheet('Bilancio');
        
        worksheet.columns = [
            { header: 'Data', key: 'data', width: 15 },
            { header: 'Numero', key: 'numero', width: 10 },
            { header: 'Tipo', key: 'tipo', width: 15 },
            { header: 'Descrizione', key: 'descrizione', width: 30 },
            { header: 'Dare', key: 'dare', width: 15 },
            { header: 'Avere', key: 'avere', width: 15 },
            { header: 'Conto', key: 'conto', width: 20 }
        ];
        
        db.all('SELECT * FROM journal_entries WHERE condominio_id = ? ORDER BY data ASC', [req.condominio_id], async (err, rows) => {
            if (err) return res.status(500).send("Errore database");
            
            (rows || []).forEach(row => {
                worksheet.addRow(row);
            });
            
            res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
            res.setHeader('Content-Disposition', 'attachment; filename=Bilancio_Condominiale.xlsx');
            
            await workbook.xlsx.write(res);
            res.end();
        });
    } catch (err) {
        console.error(err);
        res.status(500).send("Errore durante esportazione");
    }
});
`;

if (!code.includes('/api/export/accounting-excel')) {
    code = code.replace(
        "// Fallback Frontend SPA",
        exportEndpoint + "\n// Fallback Frontend SPA"
    );
    fs.writeFileSync(serverFile, code, 'utf8');
    console.log("Export endpoint added successfully!");
} else {
    console.log("Export endpoint already exists.");
}
