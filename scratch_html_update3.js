const fs = require('fs');
let html = fs.readFileSync('public/index.html', 'utf8');

const targetStr = `<div id="dash-admin-details" class="flex flex-wrap gap-5 text-blue-50 pt-3 mt-1 border-t border-white/10 hidden">
                            <div class="flex items-center"><i class="fa-solid fa-user-tie mr-2 text-blue-300 text-lg"></i>Amministratore: <span id="dash-admin-nome" class="font-bold ml-1">N/D</span></div>
                            <div class="flex items-center"><i class="fa-solid fa-phone mr-2 text-blue-300"></i><span id="dash-admin-tel">N/D</span></div>
                            <div class="flex items-center"><i class="fa-solid fa-envelope mr-2 text-blue-300"></i><span id="dash-admin-email">N/D</span></div>
                        </div>`;

const newStr = `<div id="dash-admin-details" class="flex flex-wrap gap-5 text-blue-50 pt-3 mt-1 border-t border-white/10 hidden">
                            <div class="flex items-center"><i class="fa-solid fa-user-tie mr-2 text-blue-300 text-lg"></i>Amministratore: <span id="dash-admin-nome" class="font-bold ml-1">N/D</span></div>
                            <div class="flex items-center"><i class="fa-solid fa-phone mr-2 text-blue-300"></i>Fisso: <span id="dash-admin-tel" class="ml-1">N/D</span></div>
                            <div class="flex items-center"><i class="fa-solid fa-mobile-screen mr-2 text-blue-300"></i>Cellulare: <span id="dash-admin-cell" class="ml-1">N/D</span></div>
                            <div class="flex items-center text-rose-300"><i class="fa-solid fa-truck-medical mr-2"></i>Emergenze: <span id="dash-admin-emg" class="ml-1 font-bold">N/D</span></div>
                            <div class="flex items-center"><i class="fa-solid fa-envelope mr-2 text-blue-300"></i><span id="dash-admin-email">N/D</span></div>
                        </div>`;

html = html.replace(targetStr, newStr);
fs.writeFileSync('public/index.html', html);
console.log("Updated index.html!");
