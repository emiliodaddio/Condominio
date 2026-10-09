const fs = require('fs');
let html = fs.readFileSync('public/index.html', 'utf8');

// Modifica container generale se necessario, o meglio, cambia il grid della sezione utenti.
// Troviamo il div: <div class="grid grid-cols-1 lg:grid-cols-3 gap-8"> nella sezione tab-users
const tabUsersSplit = html.split('<section id="tab-users" class="tab-pane hidden space-y-8">');
if (tabUsersSplit.length > 1) {
    let usersSection = tabUsersSplit[1];
    
    // Rimuoviamo la griglia side-by-side
    usersSection = usersSection.replace('<div class="grid grid-cols-1 lg:grid-cols-3 gap-8">', '<div class="flex flex-col gap-8">');
    
    // Rimuoviamo lg:col-span-1 e lg:col-span-2
    usersSection = usersSection.replace('shadow-xs lg:col-span-1"', 'shadow-xs"');
    usersSection = usersSection.replace('shadow-xs lg:col-span-2 overflow-hidden"', 'shadow-xs overflow-hidden"');
    
    html = tabUsersSplit[0] + '<section id="tab-users" class="tab-pane hidden space-y-8">' + usersSection;
    
    // Come ulteriore miglioramento, allarghiamo il main
    html = html.replace('<main class="max-w-7xl mx-auto', '<main class="max-w-[1500px] mx-auto');
    
    fs.writeFileSync('public/index.html', html);
    console.log('Layout updated to be full width');
} else {
    console.log('Could not find tab-users');
}
