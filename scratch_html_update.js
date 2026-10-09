const fs = require('fs');

let html = fs.readFileSync('public/index.html', 'utf8');

const targetStr = `<div id="dash-condo-details-box" class="inline-flex flex-wrap gap-4 text-sm font-bold text-white bg-black/20 px-5 py-3.5 rounded-2xl backdrop-blur-md border border-white/20 shadow-inner">
                        <div class="flex items-center"><i class="fa-solid fa-map-location-dot mr-2 text-blue-300"></i><span id="dash-condo-indirizzo">Caricamento indirizzo...</span></div>
                        <div class="flex items-center"><i class="fa-solid fa-fingerprint mr-2 text-blue-300"></i>C.F. <span id="dash-condo-cf">...</span></div>
                        <div class="flex items-center"><i class="fa-solid fa-building mr-2 text-blue-300"></i>Scale: <span id="dash-condo-scala">...</span></div>
                    </div>`;

const newStr = `<div id="dash-condo-details-box" class="flex flex-col gap-3 text-sm text-white bg-black/20 px-5 py-4 rounded-2xl backdrop-blur-md border border-white/20 shadow-inner">
                        <div class="flex flex-wrap gap-5 font-bold">
                            <div class="flex items-center"><i class="fa-solid fa-map-location-dot mr-2 text-blue-300"></i><span id="dash-condo-indirizzo">Caricamento indirizzo...</span></div>
                            <div class="flex items-center"><i class="fa-solid fa-fingerprint mr-2 text-blue-300"></i>C.F. <span id="dash-condo-cf">...</span></div>
                            <div class="flex items-center"><i class="fa-solid fa-building mr-2 text-blue-300"></i>Scale: <span id="dash-condo-scala">...</span></div>
                        </div>
                        <div id="dash-admin-details" class="flex flex-wrap gap-5 text-blue-50 pt-3 mt-1 border-t border-white/10 hidden">
                            <div class="flex items-center"><i class="fa-solid fa-user-tie mr-2 text-blue-300 text-lg"></i>Amministratore: <span id="dash-admin-nome" class="font-bold ml-1">N/D</span></div>
                            <div class="flex items-center"><i class="fa-solid fa-phone mr-2 text-blue-300"></i><span id="dash-admin-tel">N/D</span></div>
                            <div class="flex items-center"><i class="fa-solid fa-envelope mr-2 text-blue-300"></i><span id="dash-admin-email">N/D</span></div>
                        </div>
                    </div>`;

if (html.includes(targetStr)) {
    html = html.replace(targetStr, newStr);
    fs.writeFileSync('public/index.html', html);
    console.log("HTML Updated!");
} else {
    console.log("Could not find target string in index.html");
}
