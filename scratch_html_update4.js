const fs = require('fs');

let html = fs.readFileSync('public/index.html', 'utf8');

const targetStr = `                <!-- Card: Profilo -->
                <div onclick="switchTab('admin-profile')" class="group cursor-pointer bg-white rounded-3xl p-6 border border-slate-200 hover:border-slate-400 hover:shadow-xl hover:-translate-y-1 transition-all duration-300">
                    <div class="w-14 h-14 bg-slate-100 text-slate-700 rounded-2xl flex items-center justify-center text-2xl mb-4 group-hover:scale-110 transition-transform">
                        <i class="fa-solid fa-user-gear"></i>
                    </div>
                    <h3 class="text-lg font-bold text-slate-900 mb-2">Il Mio Profilo</h3>
                    <p class="text-sm text-slate-500 line-clamp-2">Gestisci i tuoi dati personali, il cambio password e l'autenticazione a due fattori.</p>
                </div>`;

if (html.includes(targetStr)) {
    html = html.replace(targetStr, '');
    fs.writeFileSync('public/index.html', html);
    console.log("Removed the misleading Il Mio Profilo card!");
} else {
    // Normalize newlines in case
    const targetStrNorm = targetStr.replace(/\r\n/g, '\n');
    html = html.replace(/\r\n/g, '\n');
    if (html.includes(targetStrNorm)) {
        html = html.replace(targetStrNorm, '');
        fs.writeFileSync('public/index.html', html);
        console.log("Removed the misleading Il Mio Profilo card (with normalized newlines)!");
    } else {
        console.log("Could not find the target string!");
    }
}
