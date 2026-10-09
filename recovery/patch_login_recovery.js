const fs = require('fs');
let html = fs.readFileSync('public/login.html', 'utf8');

// 1. Add "Hai dimenticato la password?" link in the login form
const targetBtn = `<button type="submit" id="btn-login"`;
const linkHtml = `<div class="text-right mt-2 mb-4">
                            <a href="#" onclick="showForgotPassword()" class="text-xs text-indigo-600 hover:text-indigo-800 font-semibold transition-colors">Hai dimenticato la password?</a>
                        </div>
                        <button type="submit" id="btn-login"`;
if (!html.includes('Hai dimenticato la password?')) {
    html = html.replace(targetBtn, linkHtml);
}

// 2. Add the modals HTML at the end of the body
const modalsHtml = `
    <!-- Modale Inserimento Email per Recupero -->
    <div id="modal-forgot-pwd" class="hidden fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
        <div class="bg-white rounded-3xl shadow-2xl w-full max-w-sm overflow-hidden">
            <div class="px-6 py-4 border-b border-slate-100 flex justify-between items-center bg-slate-50">
                <h3 class="font-bold text-slate-800"><i class="fa-solid fa-unlock-keyhole mr-2"></i>Recupero Password</h3>
                <button onclick="document.getElementById('modal-forgot-pwd').classList.add('hidden')" class="text-slate-400 hover:text-slate-600"><i class="fa-solid fa-xmark text-xl"></i></button>
            </div>
            <form id="form-forgot-pwd" onsubmit="handleForgotPassword(event)" class="p-6 space-y-4">
                <p class="text-xs text-slate-500">Inserisci l'email associata al tuo account. Ti invieremo un link per reimpostare la password.</p>
                <div>
                    <label class="block text-xs font-bold text-slate-700 mb-1">Email</label>
                    <input type="email" id="forgot-email" required class="w-full px-4 py-3 rounded-xl border border-slate-300 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-all shadow-xs text-sm">
                </div>
                <button type="submit" id="btn-forgot-submit" class="w-full py-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-sm font-bold shadow-md transition-all">
                    Invia Link di Recupero
                </button>
            </form>
        </div>
    </div>

    <!-- Modale Inserimento Nuova Password (attivato dal link via mail) -->
    <div id="modal-reset-pwd" class="hidden fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
        <div class="bg-white rounded-3xl shadow-2xl w-full max-w-sm overflow-hidden">
            <div class="px-6 py-4 border-b border-slate-100 flex justify-between items-center bg-slate-50">
                <h3 class="font-bold text-slate-800"><i class="fa-solid fa-key mr-2"></i>Scegli Nuova Password</h3>
            </div>
            <form id="form-reset-pwd" onsubmit="handleResetPassword(event)" class="p-6 space-y-4">
                <p class="text-xs text-slate-500">Inserisci la tua nuova password sicura.</p>
                <div>
                    <label class="block text-xs font-bold text-slate-700 mb-1">Nuova Password</label>
                    <div class="relative">
                        <input type="password" id="reset-new-pwd" required placeholder="Min 8 car, 1 maiusc, 1 num, 1 spec" class="w-full px-4 py-3 rounded-xl border border-slate-300 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-all shadow-xs text-sm pr-10">
                        <button type="button" onclick="togglePasswordVisibility('reset-new-pwd', 'eye-icon-reset')" class="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-400 hover:text-slate-600">
                            <i id="eye-icon-reset" class="fa-solid fa-eye"></i>
                        </button>
                    </div>
                </div>
                <button type="submit" id="btn-reset-submit" class="w-full py-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-sm font-bold shadow-md transition-all">
                    Salva Nuova Password
                </button>
            </form>
        </div>
    </div>
</body>`;

if (!html.includes('modal-forgot-pwd')) {
    html = html.replace('</body>', modalsHtml);
}

// 3. Inject JS logic into the existing script
const jsLogic = `
        // --- PASSWORD RECOVERY LOGIC ---
        function showForgotPassword() {
            document.getElementById('modal-forgot-pwd').classList.remove('hidden');
        }

        async function handleForgotPassword(e) {
            e.preventDefault();
            const btn = document.getElementById('btn-forgot-submit');
            const email = document.getElementById('forgot-email').value.trim();
            btn.disabled = true; btn.innerHTML = 'Invio in corso...';
            
            try {
                const res = await fetch('/api/auth/forgot-password', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ email })
                });
                const data = await res.json();
                alert(data.message);
                if (data.success) {
                    document.getElementById('modal-forgot-pwd').classList.add('hidden');
                }
            } catch (err) {
                alert('Errore di connessione');
            }
            btn.disabled = false; btn.innerHTML = 'Invia Link di Recupero';
        }

        async function handleResetPassword(e) {
            e.preventDefault();
            const urlParams = new URLSearchParams(window.location.search);
            const token = urlParams.get('token');
            const newPassword = document.getElementById('reset-new-pwd').value;
            
            const btn = document.getElementById('btn-reset-submit');
            btn.disabled = true; btn.innerHTML = 'Salvataggio...';
            
            try {
                const res = await fetch('/api/auth/reset-password', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ token, newPassword })
                });
                const data = await res.json();
                alert(data.message);
                if (data.success) {
                    window.location.href = '/login.html'; // Togli il token dall'url
                }
            } catch (err) {
                alert('Errore di connessione');
            }
            btn.disabled = false; btn.innerHTML = 'Salva Nuova Password';
        }

        // Check if we arrived via a reset token
        window.addEventListener('DOMContentLoaded', () => {
            const urlParams = new URLSearchParams(window.location.search);
            if (urlParams.has('token')) {
                document.getElementById('modal-reset-pwd').classList.remove('hidden');
            }
        });

        // Global function for toggle password visibility
        window.togglePasswordVisibility = function(inputId, iconId) {
            const input = document.getElementById(inputId);
            const icon = document.getElementById(iconId);
            if (input.type === 'password') {
                input.type = 'text';
                icon.classList.remove('fa-eye');
                icon.classList.add('fa-eye-slash');
            } else {
                input.type = 'password';
                icon.classList.remove('fa-eye-slash');
                icon.classList.add('fa-eye');
            }
        };
        </script>
`;
if (!html.includes('handleForgotPassword')) {
    html = html.replace('</script>', jsLogic);
}

fs.writeFileSync('public/login.html', html);
console.log('login.html updated with forgot password UI');
