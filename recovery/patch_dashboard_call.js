const fs = require('fs');
let app = fs.readFileSync('public/app_v4.js', 'utf8');

const regex = /if \(tabId === 'dashboard'\) \{[\s\S]*?\}\s*else if \(tabId === 'accounting'\)/;

if (app.match(regex)) {
    const match = app.match(regex)[0];
    const newMatch = match.replace("}", "    loadAnagrafica();\n}").replace("loadCondominioData();", "");
    app = app.replace(match, newMatch);
    fs.writeFileSync('public/app_v4.js', app);
    console.log('Fixed switchTab for dashboard');
} else {
    console.log('switchTab match failed');
}

// Also, let's call it on initial page load to populate the banner immediately.
// We can add it at the end of setupUIForRole.
const setupRegex = /updateNavActive\(state\.currentTab \|\| 'dashboard'\);/;
if (app.match(setupRegex)) {
    app = app.replace(setupRegex, "updateNavActive(state.currentTab || 'dashboard');\n    loadAnagrafica();");
    fs.writeFileSync('public/app_v4.js', app);
    console.log('Fixed setupUIForRole for dashboard');
}

