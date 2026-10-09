const fs = require('fs');
const path = require('path');

const appFile = path.join(__dirname, 'public', 'app.js');
let appContent = fs.readFileSync(appFile, 'utf8');

// Correggiamo isAdmin in setupUIForRole per basarlo sul condominio attivo
const setupSelectorFix = `
    const user = state.currentUser;
    if (!state.activeCondominioId && user.condomini && user.condomini.length > 0) {
        state.activeCondominioId = user.condomini[0].id;
    }
    const currentCondo = user.condomini ? user.condomini.find(c => c.id == state.activeCondominioId) : null;
    const isAdmin = user.is_superadmin || (currentCondo && currentCondo.role === 'admin');

    if (user.condomini && user.condomini.length > 1) {
        let selectorHtml = '<select id="condo-selector" onchange="changeCondominio(this.value)" class="bg-white border border-slate-300 text-slate-700 text-xs font-bold rounded-xl px-2 py-1">';
        user.condomini.forEach(c => {
            selectorHtml += \`<option value="\${c.id}" \${c.id == state.activeCondominioId ? 'selected' : ''}>\${c.nome}</option>\`;
        });
        selectorHtml += '</select>';
        
        const headerCondoName = document.getElementById('header-condo-name');
        if (headerCondoName) {
            headerCondoName.innerHTML = selectorHtml;
        }
    } else if (currentCondo) {
        const headerCondoName = document.getElementById('header-condo-name');
        if (headerCondoName) {
            headerCondoName.innerHTML = currentCondo.nome;
        }
    }

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

// Sostituiamo il pezzo precedente fallato con il fix
const regex = /const user = state\.currentUser;[\s\S]*?else switchTab\('accounting'\);\n        };\n    }/;
if (appContent.match(regex)) {
    appContent = appContent.replace(regex, setupSelectorFix);
    fs.writeFileSync(appFile, appContent, 'utf8');
    console.log('App.js fixed');
} else {
    console.log('Regex non matchata');
}

