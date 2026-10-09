const fs = require('fs');
const path = require('path');

const indexFile = path.join(__dirname, 'public', 'index.html');
let htmlContent = fs.readFileSync(indexFile, 'utf8');

htmlContent = htmlContent.replace(
    '<p class="text-xs text-slate-500 font-medium">Condominio "Le Ginestre" &bull; Via Garibaldi 45, Milano</p>',
    '<p id="header-condo-name" class="text-xs text-slate-500 font-medium">Caricamento dati condominio...</p>'
);
fs.writeFileSync(indexFile, htmlContent, 'utf8');

const appFile = path.join(__dirname, 'public', 'app.js');
let appContent = fs.readFileSync(appFile, 'utf8');

const fetchCondoInfo = `
        // Carica i dati dell'anagrafica condominio per l'header globale
        try {
            const condoRes = await fetch('/api/condominio', { headers: getAuthHeaders() });
            const condoData = await condoRes.json();
            if (condoData.success && condoData.data && condoData.data.nome) {
                const c = condoData.data;
                const headerText = c.nome + (c.indirizzo ? ' &bull; ' + c.indirizzo : '');
                document.getElementById('header-condo-name').innerHTML = headerText;
            } else {
                document.getElementById('header-condo-name').innerHTML = 'Condominio (Dati non inseriti)';
            }
        } catch(e) {
            console.error('Errore caricamento anagrafica header:', e);
        }
`;

// Insert the fetch logic in DOMContentLoaded right before setupUIForRole()
if (!appContent.includes("condoRes = await fetch('/api/condominio'")) {
    appContent = appContent.replace(
        '// Configura l\'interfaccia grafica in base al ruolo dell\'utente',
        fetchCondoInfo + '\n        // Configura l\'interfaccia grafica in base al ruolo dell\'utente'
    );
    fs.writeFileSync(appFile, appContent, 'utf8');
}

console.log("Updated header condo name logic");
