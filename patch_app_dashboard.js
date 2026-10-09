const fs = require('fs');
let code = fs.readFileSync('public/app_v4.js', 'utf8');

// 1. Inject functions at the end of the file
const newFunctions = `
window.showAgencyDashboard = function() {
    document.getElementById('agency-dashboard-view').classList.remove('hidden');
    document.getElementById('agency-dashboard-view').classList.add('flex');
    document.getElementById('app-core-view').classList.add('hidden');
    
    const grid = document.getElementById('agency-condos-grid');
    grid.innerHTML = '';
    
    state.currentUser.condomini.forEach(c => {
        grid.innerHTML += \`
            <div onclick="enterCondo(\${c.id})" class="bg-white rounded-3xl p-6 shadow-sm border border-slate-200 hover:shadow-lg hover:-translate-y-1 transition-all cursor-pointer flex flex-col justify-between group">
                <div>
                    <div class="w-12 h-12 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center text-xl mb-4 group-hover:bg-blue-600 group-hover:text-white transition-colors">
                        <i class="fa-solid fa-building"></i>
                    </div>
                    <h3 class="font-extrabold text-xl text-slate-900 mb-1">\${c.nome}</h3>
                    <p class="text-sm text-slate-500 mb-4">Ruolo: <span class="uppercase font-bold">\${c.role}</span></p>
                </div>
                <div class="flex items-center text-blue-600 font-bold text-sm">
                    Accedi <i class="fa-solid fa-arrow-right ml-2 group-hover:translate-x-1 transition-transform"></i>
                </div>
            </div>
        \`;
    });
};

window.enterCondo = function(id) {
    state.activeCondominioId = id;
    sessionStorage.setItem('active_Condominio_id', id);
    document.getElementById('agency-dashboard-view').classList.add('hidden');
    document.getElementById('agency-dashboard-view').classList.remove('flex');
    document.getElementById('app-core-view').classList.remove('hidden');
    setupUIForRole();
    switchTab('accounting');
};

window.returnToAgencyDashboard = function() {
    state.activeCondominioId = null;
    sessionStorage.removeItem('active_Condominio_id');
    showAgencyDashboard();
};
`;

if(!code.includes('showAgencyDashboard')) {
    code += "\n" + newFunctions;
}

// 2. Modify setupUIForRole to check for multiple condos and no active condo
const setupUIForRoleRegex = /function setupUIForRole\(\) \{\s*const user = state\.currentUser;/;
const setupUIForRoleReplacement = `function setupUIForRole() {
    const user = state.currentUser;
    
    if (!state.activeCondominioId && user.condomini && user.condomini.length > 1) {
        showAgencyDashboard();
        return;
    }`;
code = code.replace(setupUIForRoleRegex, setupUIForRoleReplacement);

fs.writeFileSync('public/app_v4.js', code);
console.log('Patched app_v4.js for Dashboard');
