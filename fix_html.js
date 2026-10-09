const fs = require('fs');
let html = fs.readFileSync('public/index.html', 'utf8');

const target = `<!-- Archivio Verbali Assemblee Passate -->`;
const replacement = `
            <!-- Storico Convocazioni (Admin) -->
            <div class="admin-only hidden">
                <h2 class="text-sm font-bold text-slate-700 uppercase tracking-wider mb-3 flex items-center gap-2">
                    <i class="fa-solid fa-clock-rotate-left text-slate-500"></i> Storico Convocazioni Inviate
                </h2>
                <div id="assemblies-log-container" class="space-y-3 mb-8">
                    <div class="py-4 text-center text-slate-400 bg-white rounded-2xl border text-sm italic">Caricamento storico...</div>
                </div>
            </div>

            <!-- Archivio Verbali Assemblee Passate -->`;

html = html.replace(target, replacement);
fs.writeFileSync('public/index.html', html);
