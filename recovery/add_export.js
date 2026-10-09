const fs = require('fs');
const path = require('path');

const appFile = path.join(__dirname, 'public', 'app.js');
let content = fs.readFileSync(appFile, 'utf8');

const exportFunc = `
// ============================================================================
// EXPORT EXCEL
// ============================================================================
async function exportExcel(e) {
    if (e) e.preventDefault();
    try {
        const res = await fetch('/api/export/accounting-excel', { headers: getAuthHeaders() });
        if (!res.ok) throw new Error("Export fallito");
        const blob = await res.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = "Bilancio_Condominiale.xlsx";
        document.body.appendChild(a);
        a.click();
        a.remove();
        showToast('Download in corso', 'success');
    } catch(err) {
        showToast('Errore durante esportazione Excel', 'error');
    }
}
`;

content += '\n' + exportFunc;
fs.writeFileSync(appFile, content, 'utf8');
console.log('Export func added');
