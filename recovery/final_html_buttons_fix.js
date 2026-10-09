const fs = require('fs');
let html = fs.readFileSync('public/index.html', 'utf8');

const regex = /Elenco Utenti e Cond[^m]*mini Registrati\s*<\/h3>\s*<\/div>/;

if (regex.test(html) && !html.includes('exportUsersExcel()')) {
    html = html.replace(regex, `Elenco Utenti e Condòmini Registrati
                        </h3>
                        <div class="space-x-2 no-print ml-auto flex">
                            <button onclick="window.print()" class="px-3 py-1.5 bg-slate-200 hover:bg-slate-300 text-slate-700 rounded-lg text-xs font-bold"><i class="fa-solid fa-print mr-1"></i>Stampa</button>
                            <button onclick="exportUsersExcel()" class="px-3 py-1.5 bg-emerald-100 hover:bg-emerald-200 text-emerald-700 rounded-lg text-xs font-bold"><i class="fa-solid fa-file-excel mr-1"></i>Esporta</button>
                        </div>
                    </div>`);
    // I also need to change the flex container of the parent div to justify-between
    html = html.replace(
        '<div class="p-5 border-b border-slate-200 bg-slate-50/50">',
        '<div class="p-5 border-b border-slate-200 bg-slate-50/50 flex justify-between items-center">'
    );
    fs.writeFileSync('public/index.html', html);
    console.log('Successfully injected export buttons');
} else {
    console.log('Failed to match or already injected');
}
