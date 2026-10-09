const fs = require('fs');
const path = require('path');

const appFile = path.join(__dirname, 'public', 'app.js');
let appContent = fs.readFileSync(appFile, 'utf8');

// Aggiungiamo l'ID condominio attivo allo stato e all'header
const newAuthHeaders = `
function getAuthHeaders() {
    const headers = {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + state.token
    };
    if (state.activeCondominioId) {
        headers['X-Condominio-Id'] = state.activeCondominioId;
    }
    return headers;
}
`;

appContent = appContent.replace(/function getAuthHeaders\(\) \{[\s\S]*?return \{[\s\S]*?\};[\s\n]*\}/, newAuthHeaders);

// Setup del selettore
const setupSelector = `
    const user = state.currentUser;
    const isAdmin = user.condomini && user.condomini.some(c => c.role === 'admin');

    // Mappatura condomini
    if (user.condomini && user.condomini.length > 0) {
        if (!state.activeCondominioId) {
            state.activeCondominioId = user.condomini[0].id;
        }
        
        let selectorHtml = '<select id="condo-selector" onchange="changeCondominio(this.value)" class="bg-white border border-slate-300 text-slate-700 text-xs font-bold rounded-xl px-2 py-1">';
        user.condomini.forEach(c => {
            selectorHtml += \`<option value="\${c.id}" \${c.id == state.activeCondominioId ? 'selected' : ''}>\${c.nome}</option>\`;
        });
        selectorHtml += '</select>';
        
        const headerCondoName = document.getElementById('header-condo-name');
        if (headerCondoName && user.condomini.length > 1) {
            headerCondoName.innerHTML = selectorHtml;
        }
    }

    // Aggiungi func changeCondominio se non c'è
    if (!window.changeCondominioDefined) {
        window.changeCondominioDefined = true;
        window.changeCondominio = function(id) {
            state.activeCondominioId = id;
            setupUIForRole();
            if (state.currentTab) switchTab(state.currentTab);
            else switchTab('accounting');
        };
    }
`;

appContent = appContent.replace('const isAdmin = user.role === \'admin\';', setupSelector);

fs.writeFileSync(appFile, appContent, 'utf8');
console.log('App.js patched for multi-tenant UI');
