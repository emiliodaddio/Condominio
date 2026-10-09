const fs = require('fs');
let js = fs.readFileSync('public/app.js', 'utf8');

const newLoadUsersList = `
async function loadUsersList() {
    if (state.currentUser.role !== 'admin') {
        showToast('Devi essere amministratore per vedere questa pagina', 'error');
        return;
    }

    try {
        const res = await fetch('/api/users', { headers: getAuthHeaders() });
        const data = await res.json();

        if (res.ok && data.success) {
            state.users = data.data;
            if (state.users.length === 0) {
                document.getElementById('users-table-body').innerHTML = '<tr><td colspan="7" class="text-center p-4">Nessun utente trovato nel database (Array vuoto)</td></tr>';
            } else {
                renderUsersTable();
                populateQuoteUsersSelect();
            }
        } else {
            showToast('Errore API Users: ' + (data.message || 'Sconosciuto'), 'error');
            document.getElementById('users-table-body').innerHTML = '<tr><td colspan="7" class="text-center p-4 text-rose-500">Errore Server: ' + (data.message || JSON.stringify(data)) + '</td></tr>';
        }
    } catch (err) {
        showToast('Errore di connessione a /api/users', 'error');
        document.getElementById('users-table-body').innerHTML = '<tr><td colspan="7" class="text-center p-4 text-rose-500">Errore Fetch: ' + err.message + '</td></tr>';
        console.error('Errore caricamento lista utenti:', err);
    }
}
`;

js = js.replace(/async function loadUsersList\(\) \{[\s\S]*?console\.error\('Errore caricamento lista utenti:', err\);\s*\}\s*\}/, newLoadUsersList);

fs.writeFileSync('public/app.js', js);
console.log('Injected diagnostic loadUsersList');
