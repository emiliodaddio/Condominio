const fs = require('fs');
let html = fs.readFileSync('public/index.html', 'utf8');

const regex = /<div class="relative z-10 max-w-3xl">[\s\S]*?<\/div>/;

const replacementHtml = `<div class="relative z-10 max-w-3xl">
                    <h1 class="text-3xl sm:text-4xl font-extrabold tracking-tight mb-3 drop-shadow-lg">Benvenuto nella Home Page del <span id="dash-condo-nome">CONDOMINIO</span></h1>
                    <p class="text-base sm:text-lg text-blue-100 font-medium leading-relaxed opacity-90 mb-6">Qui troverai tutte le informazioni utili relative alla gestione amministrativa condominiale.</p>
                    
                    <div id="dash-condo-details-box" class="hidden inline-flex flex-wrap gap-4 text-sm font-bold text-white bg-black/20 px-5 py-3.5 rounded-2xl backdrop-blur-md border border-white/20 shadow-inner">
                        <div class="flex items-center"><i class="fa-solid fa-map-location-dot mr-2 text-blue-300"></i><span id="dash-condo-indirizzo"></span></div>
                        <div class="flex items-center"><i class="fa-solid fa-fingerprint mr-2 text-blue-300"></i>C.F. <span id="dash-condo-cf"></span></div>
                        <div class="flex items-center"><i class="fa-solid fa-building mr-2 text-blue-300"></i>Scale: <span id="dash-condo-scala"></span></div>
                    </div>
                </div>`;

if (html.match(regex)) {
    // Be careful! There are multiple `<div class="relative z-10 max-w-3xl">`? No, max-w-3xl is probably unique here. Let's find index.
    const idx = html.indexOf('<div class="relative z-10 max-w-3xl">');
    const endIdx = html.indexOf('</div>', idx) + 6;
    
    html = html.substring(0, idx) + replacementHtml + html.substring(endIdx);
    fs.writeFileSync('public/index.html', html);
    console.log('Fixed banner html');
}
