const fs = require('fs');
let html = fs.readFileSync('public/index.html', 'utf8');

const htmlOld = `                            <div>
                                <label class="block text-xs font-bold text-slate-700 mb-1">Telefono</label>
                                <input type="tel" id="persona-tel" class="w-full p-2 border rounded-xl">
                            </div>
                            <div>
                                <label class="block text-xs font-bold text-slate-700 mb-1">Email</label>
                                <input type="email" id="persona-email" class="w-full p-2 border rounded-xl">
                            </div>`;
const htmlNew = `                            <div>
                                <label class="block text-xs font-bold text-slate-700 mb-1">Tel. Fisso</label>
                                <input type="tel" id="persona-tel" class="w-full p-2 border rounded-xl">
                            </div>
                            <div>
                                <label class="block text-xs font-bold text-slate-700 mb-1">Cellulare</label>
                                <input type="tel" id="persona-cell" class="w-full p-2 border rounded-xl">
                            </div>
                            <div class="col-span-2">
                                <label class="block text-xs font-bold text-slate-700 mb-1">Email</label>
                                <input type="email" id="persona-email" class="w-full p-2 border rounded-xl">
                            </div>`;

html = html.replace(htmlOld, htmlNew);
fs.writeFileSync('public/index.html', html);
console.log('Updated index.html for cellulare');
