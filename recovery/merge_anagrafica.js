const fs = require('fs');
const path = require('path');

const indexFile = path.join(__dirname, 'public', 'index.html');
let htmlContent = fs.readFileSync(indexFile, 'utf8');

// 1. Move the users table into tab-anagrafica
const usersTableHtml = `
            <div class="mt-8 border-t pt-8">
                <div class="flex justify-between items-center mb-4">
                    <h2 class="text-2xl font-bold">Anagrafica Condòmini (Utenti)</h2>
                    <button onclick="document.getElementById('modal-new-user').classList.remove('hidden')" class="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold no-print">
                        <i class="fa-solid fa-user-plus mr-1"></i> Nuovo Condòmino
                    </button>
                </div>
                <div class="bg-white rounded-2xl shadow-xs border overflow-hidden">
                    <div class="overflow-x-auto">
                        <table class="w-full text-left border-collapse">
                            <thead>
                                <tr class="bg-slate-50 border-b border-slate-200 text-xs uppercase tracking-wider text-slate-500 font-bold">
                                    <th class="py-3 px-4">Nominativo</th>
                                    <th class="py-3 px-4">Email / Login</th>
                                    <th class="py-3 px-4">Unità Immobiliare</th>
                                    <th class="py-3 px-4 text-center">Ruolo</th>
                                    <th class="py-3 px-4">Registrato il</th>
                                </tr>
                            </thead>
                            <tbody id="users-table-body" class="text-sm divide-y divide-slate-100">
                                <!-- Popolato via JS -->
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
`;

// Find where to insert it in tab-anagrafica
if (!htmlContent.includes('Anagrafica Condòmini (Utenti)')) {
    htmlContent = htmlContent.replace('</form>\n              </div>\n        </section>', '</form>\n              </div>\n' + usersTableHtml + '        </section>');
    
    // Hide the old users tab button
    htmlContent = htmlContent.replace('id="tab-btn-users"', 'id="tab-btn-users" style="display:none;"');
    
    // Hide the old users tab section content (it's redundant now but the modal still needs to work)
    htmlContent = htmlContent.replace('<section id="tab-users"', '<section id="tab-users-old" style="display:none;"');
    
    fs.writeFileSync(indexFile, htmlContent, 'utf8');
}
console.log('Merged Users into Anagrafica');
