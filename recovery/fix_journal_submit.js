const fs = require('fs');
let code = fs.readFileSync('public/app.js', 'utf8');

code = code.replace(
    /\} else if \(currentEditType === 'journal'\) \{[\s\S]*?url = '\/api\/journal\/' \+ currentEditId;\s*\n\s*\} else if \(currentEditType === 'supplier'\) \{/,
    `} else if (currentEditType === 'journal') {
        const dareStr = document.getElementById('edit-journal-dare').value;
        const avereStr = document.getElementById('edit-journal-avere').value;
        payload = {
            descrizione: document.getElementById('edit-journal-desc').value,
            data: document.getElementById('edit-journal-data').value,
            conto: document.getElementById('edit-journal-conto').value,
            dare: parseFloat(dareStr || 0),
            avere: parseFloat(avereStr || 0),
            tipo: 'Generica',
            numero: '1'
        };
        endpoint = '/api/journal/' + currentEditId;
    } else if (currentEditType === 'supplier') {`
);

fs.writeFileSync('public/app.js', code);
console.log('Fixed handleEditSubmit variable names');
