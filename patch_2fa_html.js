const fs = require('fs');
let html = fs.readFileSync('public/index.html', 'utf8');

const securityBtnHtml = `
                    <button onclick="openSecurityProfileModal()" class="no-print px-3.5 py-1.5 rounded-xl border border-blue-300 bg-blue-50 hover:bg-blue-100 text-blue-700 font-bold text-xs transition-colors flex items-center ml-2">
                        <i class="fa-solid fa-shield-halved mr-1.5 text-blue-500"></i> Sicurezza (2FA)
                    </button>`;

if (!html.includes('openSecurityProfileModal')) {
    html = html.replace(`<button onclick="window.location.href='/'"`, securityBtnHtml + `\n                    <button onclick="window.location.href='/'"`);
}

const modalHtml = `
    <!-- Modale Profilo Sicurezza (2FA) -->
    <div id="modal-security-profile" class="hidden fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center z-[200] p-4">
        <div class="bg-white rounded-3xl shadow-2xl w-full max-w-lg overflow-hidden flex flex-col">
            <div class="px-6 py-5 border-b border-slate-100 flex justify-between items-center bg-slate-50">
                <h3 class="text-lg font-extrabold text-slate-800 flex items-center"><i class="fa-solid fa-shield-halved text-blue-600 mr-2"></i> Sicurezza Account (2FA)</h3>
                <button onclick="closeSecurityProfileModal()" class="text-slate-400 hover:text-slate-600"><i class="fa-solid fa-xmark text-xl"></i></button>
            </div>
            <div class="p-6 space-y-6">
                <div class="text-sm text-slate-600">
                    L'Autenticazione a Due Fattori (2FA) protegge il tuo account richiedendo un codice temporaneo generato dal tuo smartphone (es. Google Authenticator) ad ogni accesso.
                </div>
                
                <div id="2fa-status-container" class="p-4 rounded-xl border bg-slate-50 flex items-center justify-between">
                    <div class="flex items-center space-x-3">
                        <div id="2fa-status-icon" class="w-10 h-10 rounded-full flex items-center justify-center text-lg"></div>
                        <div>
                            <div id="2fa-status-title" class="font-bold text-slate-900">Stato 2FA</div>
                            <div id="2fa-status-text" class="text-xs text-slate-500">Verifica in corso...</div>
                        </div>
                    </div>
                    <button id="btn-enable-2fa" onclick="start2FASetup()" class="hidden px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-xl shadow-md transition-colors">Attiva 2FA</button>
                </div>

                <div id="2fa-setup-container" class="hidden space-y-4 border-t border-slate-100 pt-4">
                    <p class="text-sm font-bold text-slate-800">1. Scansiona questo QR Code con un'App Authenticator:</p>
                    <div class="flex justify-center bg-white p-2 border border-slate-200 rounded-xl w-max mx-auto">
                        <img id="2fa-qrcode-img" src="" alt="QR Code 2FA" class="w-48 h-48">
                    </div>
                    <p class="text-sm font-bold text-slate-800">2. Inserisci il codice a 6 cifre generato dall'App:</p>
                    <div class="flex space-x-2">
                        <input type="text" id="2fa-verify-code" maxlength="6" class="w-full px-4 py-2 rounded-xl border border-slate-300 text-center tracking-widest text-xl font-mono focus:border-blue-500 outline-none" placeholder="000000">
                        <button onclick="verifyAndEnable2FA()" class="px-6 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl shadow-md transition-colors">Conferma</button>
                    </div>
                </div>
            </div>
        </div>
    </div>
`;

if (!html.includes('modal-security-profile')) {
    html = html.replace('</body>', modalHtml + '\n</body>');
}
fs.writeFileSync('public/index.html', html);
console.log('Added 2FA security modal to index.html');
