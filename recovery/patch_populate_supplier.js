const fs = require('fs');
let app = fs.readFileSync('public/app_v4.js', 'utf8');

const targetStr = `function openNewSupplierModal() {
    document.getElementById('modal-new-supplier').classList.remove('hidden');
}`;

const replacementStr = `function openNewSupplierModal() {
    document.getElementById('modal-new-supplier').classList.remove('hidden');
    
    // Popola il menu a tendina
    const select = document.getElementById('supplier-name');
    if (select && window.suppliersRegistryData) {
        let opts = '<option value="">Seleziona fornitore dall\\'anagrafica...</option>';
        window.suppliersRegistryData.forEach(s => {
            opts += '<option value="' + s.ragione_sociale + '">' + s.ragione_sociale + '</option>';
        });
        select.innerHTML = opts;
    }
}`;

if (app.includes(targetStr)) {
    app = app.replace(targetStr, replacementStr);
    fs.writeFileSync('public/app_v4.js', app);
    console.log('Populated supplier dropdown');
} else {
    console.log('Target string not found');
}
