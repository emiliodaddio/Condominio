const fs = require('fs');
let code = fs.readFileSync('public/app_v4.js', 'utf8');

const newCode = `
async function populateCommUsersSelect() {
    const select = document.getElementById('comm-user');
    if (!select) return;
    
    // Reset but keep first option
    const firstOpt = select.options[0];
    select.innerHTML = '';
    select.appendChild(firstOpt);
    
    state.users.forEach(u => {
        if (u.email) {
            select.innerHTML += \`<option value="\${u.id}">\${u.nome} (\${u.unita || 'Nessuna Unità'})</option>\`;
        }
    });
}

// Ensure this is called when loading users
const loadUsersListTarget = "populateQuoteUsersSelect();";
code = code.replace(loadUsersListTarget, loadUsersListTarget + " populateCommUsersSelect();");

async function sendCommunication() {
    const userId = document.getElementById('comm-user').value;
    const subject = document.getElementById('comm-subject').value;
    const message = document.getElementById('comm-message').value;
    
    if (!subject.trim() || !message.trim()) {
        alert('Compila sia l\\'oggetto che il testo della comunicazione.');
        return;
    }
    
    if (!confirm('Vuoi generare e inviare questa comunicazione in formato PDF ai destinatari selezionati?')) return;
    
    try {
        showToast('Generazione PDF e invio in corso...', 'info');
        const activeCondoName = state.currentUser.condomini ? state.currentUser.condomini.find(c => c.id == state.activeCondominioId)?.nome : 'Condominio';
        
        const res = await fetch('/api/communications/send', {
            method: 'POST',
            headers: getAuthHeaders(),
            body: JSON.stringify({ userId, subject, message, activeCondoName })
        });
        
        const data = await res.json();
        if (data.success) {
            showToast('Comunicazione inviata con successo!', 'success');
            document.getElementById('comm-subject').value = '';
            document.getElementById('comm-message').value = '';
        } else {
            showToast('Errore: ' + data.message, 'error');
        }
    } catch (e) {
        showToast('Errore di connessione', 'error');
    }
}
`;

fs.writeFileSync('public/app_v4.js', code + "\n" + newCode);
