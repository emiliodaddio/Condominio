const fs = require('fs');
const path = require('path');

const indexHtmlPath = path.join(__dirname, 'public', 'index.html');
const appJsPath = path.join(__dirname, 'public', 'app.js');

// 1. Aggiungi il link nella sidebar e la sezione in index.html
if (fs.existsSync(indexHtmlPath)) {
    let indexHtml = fs.readFileSync(indexHtmlPath, 'utf8');
    
    // Aggiungi link Sidebar
    if (!indexHtml.includes('id="nav-unita"')) {
        const sidebarRegex = /(<nav[^>]*>[\\s\\S]*?)(<\\/nav>)/;
        indexHtml = indexHtml.replace(sidebarRegex, (match, p1, p2) => {
            return p1 + '\\n<a href="#" id="nav-unita" onclick="switchTab(\\'unita\\')" class="flex items-center px-4 py-3 text-slate-600 hover:bg-slate-50 hover:text-blue-600 rounded-xl transition-all"><i class="fa-solid fa-building w-6"></i><span class="font-bold text-sm">Anagrafica & Millesimi</span></a>\\n' + p2;
        });
    }

    // Aggiungi la sezione Unità
    if (!indexHtml.includes('id="section-unita"')) {
        const mainRegex = /(<main[^>]*>[\\s\\S]*?)(<\\/main>)/;
        const unitaSection = fs.readFileSync('unita_section.html', 'utf8');
        indexHtml = indexHtml.replace(mainRegex, (match, p1, p2) => {
            return p1 + unitaSection + "\\n" + p2;
        });
    }
    
    fs.writeFileSync(indexHtmlPath, indexHtml);
}

// 2. Aggiungi la logica JS in app.js
if (fs.existsSync(appJsPath)) {
    let appJs = fs.readFileSync(appJsPath, 'utf8');
    if (!appJs.includes('loadUnita')) {
        const jsCode = fs.readFileSync('unita_app.js', 'utf8');

        // Modifica switchTab per caricare automaticamente la lista
        const tabSwitchRegex = /function switchTab\\(tabId\\) \\{([\\s\\S]*?)(document\\.getElementById\\(\\`section-\\$\\{tabId\\}\\`\\)\\.classList\\.remove\\('hidden'\\);)/;
        appJs = appJs.replace(tabSwitchRegex, (match, p1, p2) => {
            return "function switchTab(tabId) {" + p1 + "\\n    if (tabId === 'unita') loadUnita();\\n    " + p2;
        });

        appJs += "\\n\\n" + jsCode;
        fs.writeFileSync(appJsPath, appJs);
    }
}
console.log('Interfaccia Millesimi generata e iniettata con successo!');
