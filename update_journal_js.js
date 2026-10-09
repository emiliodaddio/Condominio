const fs = require('fs');
let js = fs.readFileSync('public/app.js', 'utf8');

const replacementJs = `
async function addJournalEntry() {
    document.getElementById('journal-desc').value = '';
    document.getElementById('journal-dare').value = '0.00';
    document.getElementById('journal-avere').value = '0.00';
    document.getElementById('journal-data').value = new Date().toISOString().slice(0,10);
    
    try {
        const res = await fetch('/api/users', { headers: getAuthHeaders() });
        const data = await res.json();
        if (data.success) {
            const select = document.getElementById('journal-user-id');
            select.innerHTML = '<option value="">-- Nessuno / Fornitore Esterno --</option>' + 
                data.data.map(user => \`<option value="\${user.nome}">\${user.nome}</option>\`).join('');
        }
    } catch (e) { console.error('Errore fetch users', e); }
    
    document.getElementById('modal-new-journal').classList.remove('hidden');
}

function closeJournalModal() {
    document.getElementById('modal-new-journal').classList.add('hidden');
}

async function handleNewJournalSubmit(e) {
    e.preventDefault();
    
    const conto = document.getElementById('journal-user-id').value;
    const descrizione = document.getElementById('journal-desc').value;
    const data = document.getElementById('journal-data').value;
    const dare = parseFloat(document.getElementById('journal-dare').value || 0);
    const avere = parseFloat(document.getElementById('journal-avere').value || 0);
    
    try {
        const res = await fetch('/api/journal', {
            method: 'POST',
            headers: getAuthHeaders(),
            body: JSON.stringify({ 
                data, 
                numero: '1', 
                tipo: 'Generica', 
                descrizione, 
                dare, 
                avere, 
                conto: conto || 'Cassa' 
            })
        });
        
        if (res.ok) {
            showToast('Registrazione salvata', 'success');
            closeJournalModal();
            loadGiornale();
        } else {
            showToast('Errore durante il salvataggio', 'error');
        }
    } catch(err) {
        showToast('Errore di connessione', 'error');
    }
}
`;

// Replace the old addJournalEntry
js = js.replace(/async function addJournalEntry\(\) \{[\s\S]*?\}\s*\} catch\(e\) \{\}\s*\}/, replacementJs);

fs.writeFileSync('public/app.js', js);
console.log('Updated app.js with new Journal logic');
