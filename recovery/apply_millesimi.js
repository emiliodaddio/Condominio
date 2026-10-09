const fs = require('fs');

let indexHtml = fs.readFileSync('public/index.html', 'utf8');

const tabButton = `
                <button id="tab-btn-unita" onclick="switchTab('unita')" class="tab-btn hidden admin-only flex items-center space-x-2 py-3 px-3 border-b-2 border-transparent font-medium text-sm text-slate-500 hover:text-slate-700 whitespace-nowrap transition-colors">
                    <i class="fa-solid fa-building text-base"></i><span>Anagrafica & Millesimi</span>
                </button>`;

if (!indexHtml.includes('tab-btn-unita')) {
    indexHtml = indexHtml.replace(
        `<!-- TABS ADMIN V2.0 -->`,
        `<!-- TABS ADMIN V2.0 -->` + tabButton
    );
}

const unitaSection = fs.readFileSync('unita_section.html', 'utf8');
if (!indexHtml.includes('id="tab-unita"')) {
    // We need to inject the unita tab pane
    // Wait, the id should be "tab-unita" to match switchTab logic
    const sectionHtml = unitaSection.replace('id="section-unita"', 'id="tab-unita" class="tab-pane hidden space-y-6"');
    
    indexHtml = indexHtml.replace(
        `<!-- ====================================================================`,
        sectionHtml + "\n\n        <!-- ===================================================================="
    );
}

fs.writeFileSync('public/index.html', indexHtml);

let appJs = fs.readFileSync('public/app.js', 'utf8');
if (!appJs.includes('loadUnita')) {
    const unitaJs = fs.readFileSync('unita_app.js', 'utf8');
    appJs = appJs + '\n' + unitaJs;
    
    // patch applyRoleVisibility to also show tab-btn-unita
    appJs = appJs.replace(
        "document.getElementById('tab-btn-anagrafica').style.display = 'flex';",
        "document.getElementById('tab-btn-anagrafica').style.display = 'flex';\n        const unitaBtn = document.getElementById('tab-btn-unita'); if (unitaBtn) unitaBtn.style.display = 'flex';"
    );
    // patch switchTab to call loadUnita if tabId === 'unita'
    appJs = appJs.replace(
        "document.getElementById(`tab-${tabId}`).classList.remove('hidden');",
        "document.getElementById(`tab-${tabId}`).classList.remove('hidden');\n    if (tabId === 'unita') loadUnita();"
    );

    fs.writeFileSync('public/app.js', appJs);
}

console.log("Patched index.html and app.js successfully!");
