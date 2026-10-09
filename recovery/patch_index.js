const fs = require('fs');
let c = fs.readFileSync('public/index.html', 'utf8');
const dashboardHtml = `
<div id="agency-dashboard-view" class="hidden min-h-screen bg-slate-100 py-12 flex-col items-center">
    <div class="max-w-6xl w-full px-6">
        <div class="flex justify-between items-center mb-10">
            <div>
                <h1 class="text-4xl font-extrabold text-slate-900 mb-2">La tua Scrivania</h1>
                <p class="text-slate-500">Seleziona il condominio che desideri gestire.</p>
            </div>
            <button onclick="logout()" class="px-4 py-2 bg-red-50 text-red-600 rounded-xl font-bold hover:bg-red-100"><i class="fa-solid fa-right-from-bracket mr-2"></i> Esci</button>
        </div>
        <div id="agency-condos-grid" class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            <!-- Cards here -->
        </div>
    </div>
</div>
`;
c = c.replace('<div id="app-core-view">', dashboardHtml + '<div id="app-core-view">');
fs.writeFileSync('public/index.html', c);
