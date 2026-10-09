const fs = require('fs');
let login = fs.readFileSync('public/login.html', 'utf8');

// The clean HTML structure ends right before the first script after body
const bodyEndIdx = login.indexOf('</body>');

// No, wait, there are scripts inside <head>!
// <script src="https://cdn.tailwindcss.com"></script>
// We must keep that.
// And tailwind.config script.

let newHTML = `<!DOCTYPE html>
<html lang="it">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>CondoTransparent SaaS - Accesso al Gestionale</title>
    
    <script src="https://cdn.tailwindcss.com"></script>
    <script>
        tailwind.config = {
            theme: { extend: { colors: { brand: { 50: '#eff6ff', 100: '#dbeafe', 600: '#2563eb', 700: '#1d4ed8', 900: '#1e3a8a' } } } }
        }
    </script>
    
    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.1/css/all.min.css">
</head>
<body class="bg-slate-100 min-h-screen flex items-center justify-center p-4">

    <!-- Container Principale -->
    <div class="w-full max-w-[900px] bg-white rounded-[2rem] shadow-2xl flex flex-col md:flex-row overflow-hidden border border-slate-100">
        <!-- Colonna di Sinistra (Immagine/Brand) -->
        <div class="md:w-5/12 bg-blue-700 p-10 flex flex-col justify-between relative overflow-hidden hidden md:flex text-white">
            <div class="absolute inset-0 bg-blue-900 opacity-20"></div>
            <div class="absolute -top-24 -left-24 w-64 h-64 bg-blue-500 rounded-full mix-blend-multiply filter blur-3xl opacity-50 animate-blob"></div>
            <div class="absolute top-1/2 -right-24 w-72 h-72 bg-emerald-500 rounded-full mix-blend-multiply filter blur-3xl opacity-50 animate-blob animation-delay-2000"></div>

            <div class="relative z-10">
                <div class="flex items-center space-x-3 mb-12">
                    <div class="w-10 h-10 bg-white rounded-xl flex items-center justify-center shadow-lg">
                        <i class="fa-solid fa-building text-blue-700 text-xl"></i>
                    </div>
                    <span class="text-xl font-black tracking-tight">CondoTransparent</span>
                </div>
                <h2 class="text-3xl font-extrabold leading-tight mb-4">Gestione smart,<br>zero stress.</h2>
                <p class="text-blue-100 text-sm leading-relaxed">Accedi al pannello per amministrare immobili, bilanci, assemblee e comunicare in tempo reale con i tuoi condòmini.</p>
            </div>
            
            <div class="relative z-10">
                <div class="flex items-center space-x-2 text-blue-200 text-xs">
                    <i class="fa-solid fa-shield-halved"></i>
                    <span>Accesso Sicuro Criptato 256-bit</span>
                </div>
            </div>
        </div>

        <!-- Colonna di Destra (Form) -->
        <div class="md:w-7/12 p-8 md:p-12">
            <div class="max-w-[360px] mx-auto">
                <div class="text-center mb-8">
                    <h1 class="text-2xl font-black text-slate-900 tracking-tight">Bentornato 👋</h1>
                    <p class="text-sm text-slate-500 mt-1">Inserisci le tue credenziali per accedere.</p>
                </div>

                <div id="error-alert" class="hidden mb-6 p-4 bg-rose-50 border border-rose-100 rounded-xl flex items-start space-x-3 text-rose-600">
                    <i class="fa-solid fa-circle-exclamation mt-0.5"></i>
                    <p id="error-message" class="text-sm font-bold"></p>
                </div>

                <div id="login-form-container">
                    <form id="login-form" onsubmit="handleLogin(event)" class="space-y-4">
                        <div>
                            <label class="block text-xs font-bold text-slate-700 mb-1">Indirizzo Email</label>
                            <input type="email" id="email" required class="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:bg-white focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none transition-all" placeholder="mario.rossi@email.it">
                        </div>

                        <div>
                            <div class="flex justify-between items-center mb-1">
                                <label class="block text-xs font-bold text-slate-700">Password</label>
                                <a href="#" onclick="showForgotPassword()" class="text-xs text-blue-600 font-bold hover:underline">Dimenticata?</a>
                            </div>
                            <input type="password" id="password" required class="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:bg-white focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none transition-all" placeholder="••••••••">
                        </div>

                        <div class="pt-2">
                            <button type="submit" id="btn-submit" class="w-full bg-slate-900 hover:bg-slate-800 text-white font-bold py-3.5 px-4 rounded-xl shadow-lg shadow-slate-900/20 transition-all flex justify-center items-center">
                                <span>Accedi al Portale</span>
                            </button>
                        </div>
                    </form>
                    <div class="mt-6 flex justify-between items-center text-xs">
                        <span>Non hai un account? <a href="#" class="text-blue-600 font-bold hover:underline">Registrati qui</a></span>
                    </div>
                </div>

                <div id="otp-form-container" class="hidden mt-6">
                    <div class="mb-4 text-center">
                        <i class="fa-solid fa-envelope-circle-check text-4xl text-blue-600 mb-2"></i>
                        <h3 class="text-lg font-bold text-slate-800">Verifica in due passaggi</h3>
                        <p class="text-sm text-slate-500 mt-1">Abbiamo inviato un codice a 6 cifre a <b id="otp-email-display" class="text-slate-800"></b></p>
                    </div>
                    <form onsubmit="handleVerifyOTP(event)" class="space-y-5">
                        <div>
                            <input type="text" id="otp-code" maxlength="6" required class="w-full pl-4 pr-4 py-3.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:bg-white focus:border-blue-500 text-center text-2xl font-mono tracking-widest outline-none transition-all" placeholder="000000">
                        </div>
                        <div id="otp-test-link"></div>
                        <div id="otp-alert" class="hidden bg-rose-50 text-rose-600 text-xs font-bold p-3 rounded-lg border border-rose-100 flex items-center"></div>
                        <button type="submit" id="btn-verify-otp" class="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3.5 px-4 rounded-xl shadow-lg shadow-blue-600/30 transition-all flex justify-center items-center">
                            Conferma Accesso
                        </button>
                    </form>
                </div>
            </div>
        </div>
    </div>

    <!-- Modale Recupero Password -->
    <div id="modal-forgot-pwd" class="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4 hidden">
        <div class="bg-white rounded-3xl w-full max-w-md shadow-2xl overflow-hidden relative">
            <div class="p-6 pb-0 flex justify-between items-start">
                <div class="w-12 h-12 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center text-xl mb-4">
                    <i class="fa-solid fa-key"></i>
                </div>
                <button onclick="document.getElementById('modal-forgot-pwd').classList.add('hidden')" class="text-slate-400 hover:text-slate-600"><i class="fa-solid fa-xmark text-xl"></i></button>
            </div>
            <div class="px-6 pb-6">
                <h3 class="text-xl font-bold text-slate-900 mb-1">Recupera Password</h3>
                <p class="text-sm text-slate-500 mb-6">Inserisci l'indirizzo email associato al tuo account. Ti invieremo un link sicuro per reimpostare la password.</p>
                
                <form id="forgot-pwd-form" onsubmit="handleForgotPassword(event)" class="space-y-4">
                    <div>
                        <label class="block text-xs font-bold text-slate-700 mb-1">Email Registrata</label>
                        <input type="email" id="forgot-email" required class="w-full border border-slate-300 rounded-xl px-4 py-2.5 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none">
                    </div>
                    
                    <div id="forgot-alert" class="hidden p-3 rounded-xl text-xs font-bold border flex items-center"></div>
                    <div id="forgot-test-link" class="text-center mt-2"></div>
                    
                    <button type="submit" id="btn-forgot-submit" class="w-full py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-sm font-bold shadow-md transition-all">
                        Invia Link di Recupero
                    </button>
                </form>
            </div>
        </div>
    </div>

    <!-- Modale Reimposta Password (attivata se c'è un token nell'URL) -->
    <div id="modal-reset-pwd" class="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4 hidden">
        <div class="bg-white rounded-3xl w-full max-w-md shadow-2xl overflow-hidden relative">
            <div class="p-6">
                <div class="w-12 h-12 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center text-xl mb-4">
                    <i class="fa-solid fa-lock"></i>
                </div>
                <h3 class="text-xl font-bold text-slate-900 mb-1">Crea Nuova Password</h3>
                <p class="text-sm text-slate-500 mb-6">Inserisci la tua nuova password sicura. Deve contenere almeno 8 caratteri, una maiuscola, un numero e un carattere speciale.</p>
                
                <form id="reset-pwd-form" onsubmit="handleResetPassword(event)" class="space-y-4">
                    <input type="hidden" id="reset-token">
                    <div>
                        <label class="block text-xs font-bold text-slate-700 mb-1">Nuova Password</label>
                        <input type="password" id="reset-password-input" required minlength="8" class="w-full border border-slate-300 rounded-xl px-4 py-2.5 text-sm focus:emerald-500 focus:ring-1 focus:ring-emerald-500 outline-none">
                    </div>
                    
                    <div id="reset-alert" class="hidden p-3 rounded-xl text-xs font-bold border flex flex-col"></div>
                    
                    <button type="submit" id="btn-reset-submit" class="w-full py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-sm font-bold shadow-md transition-all">
                        Salva Nuova Password
                    </button>
                </form>
            </div>
        </div>
    </div>

    <script>
        // INIT ON LOAD
        document.addEventListener('DOMContentLoaded', () => {
            const urlParams = new URLSearchParams(window.location.search);
            if (urlParams.get('new_session') === '1') {
                sessionStorage.removeItem('condo_token');
                sessionStorage.removeItem('condo_user');
            }
            
            const token = urlParams.get('token');
            if (token) {
                document.getElementById('reset-token').value = token;
                document.getElementById('modal-reset-pwd').classList.remove('hidden');
                history.replaceState(null, null, window.location.pathname);
            }
        });

        // LOGIN WITH OTP FLOW
        let pendingUserId = null;

        async function handleLogin(e) {
            e.preventDefault();
            const btn = document.getElementById('btn-submit');
            const alertMsg = document.getElementById('error-message');
            const alertBox = document.getElementById('error-alert');
            
            const email = document.getElementById('email').value.trim();
            const password = document.getElementById('password').value;
            
            btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin mr-2"></i> Verifica in corso...';
            btn.disabled = true;
            alertBox.classList.add('hidden');

            try {
                const res = await fetch('/api/auth/login', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ email, password })
                });
                
                const data = await res.json();
                
                if (res.ok && data.success) {
                    if (data.requireOTP) {
                        pendingUserId = data.userId;
                        document.getElementById('login-form-container').classList.add('hidden');
                        document.getElementById('otp-form-container').classList.remove('hidden');
                        document.getElementById('otp-email-display').textContent = data.email;
                        
                        document.getElementById('otp-test-link').innerHTML = \`<a href="\${data.previewUrl}" target="_blank" class="text-xs text-blue-600 font-bold underline text-center block mt-3">👉 Apri Email di Test per leggere l'OTP</a>\`;
                    } else {
                        sessionStorage.setItem('condo_token', data.token);
                        sessionStorage.setItem('condo_user', JSON.stringify(data.user));
                        window.location.href = 'index.html';
                    }
                } else {
                    alertMsg.textContent = data.message || 'Errore di login.';
                    alertBox.classList.remove('hidden');
                    btn.innerHTML = '<span>Accedi al Portale</span>';
                    btn.disabled = false;
                }
            } catch (e) {
                console.error(e);
                alertMsg.textContent = 'Errore di connessione.';
                alertBox.classList.remove('hidden');
                btn.innerHTML = '<span>Accedi al Portale</span>';
                btn.disabled = false;
            }
        }
        
        async function handleVerifyOTP(e) {
            e.preventDefault();
            const btn = document.getElementById('btn-verify-otp');
            const alertBox = document.getElementById('otp-alert');
            const otp = document.getElementById('otp-code').value.trim();
            
            btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin mr-2"></i> Verifica...';
            btn.disabled = true;
            alertBox.classList.add('hidden');

            try {
                const res = await fetch('/api/auth/login/verify-otp', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ userId: pendingUserId, otp })
                });
                const data = await res.json();
                
                if (res.ok && data.success) {
                    sessionStorage.setItem('condo_token', data.token);
                    sessionStorage.setItem('condo_user', JSON.stringify(data.user));
                    window.location.href = 'index.html';
                } else {
                    alertBox.textContent = data.message || 'Codice errato.';
                    alertBox.classList.remove('hidden');
                    btn.innerHTML = 'Conferma Accesso';
                    btn.disabled = false;
                }
            } catch(e) {
                console.error(e);
                alertBox.textContent = 'Errore di connessione.';
                alertBox.classList.remove('hidden');
                btn.innerHTML = 'Conferma Accesso';
                btn.disabled = false;
            }
        }

        // FORGOT PASSWORD
        function showForgotPassword() {
            document.getElementById('modal-forgot-pwd').classList.remove('hidden');
        }

        async function handleForgotPassword(e) {
            e.preventDefault();
            const btn = document.getElementById('btn-forgot-submit');
            const email = document.getElementById('forgot-email').value;
            const alert = document.getElementById('forgot-alert');
            const testLink = document.getElementById('forgot-test-link');

            btn.disabled = true;
            btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin mr-2"></i> Invio in corso...';
            alert.classList.add('hidden');
            testLink.innerHTML = '';

            try {
                const res = await fetch('/api/auth/forgot-password', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ email })
                });
                const data = await res.json();

                alert.classList.remove('hidden', 'bg-rose-50', 'text-rose-600', 'border-rose-100');
                if (data.success) {
                    alert.classList.add('bg-emerald-50', 'text-emerald-700', 'border-emerald-200');
                    alert.innerHTML = '<i class="fa-solid fa-check-circle mr-1"></i> Se l\\'email esiste, riceverai a breve le istruzioni.';
                    if (data.previewUrl) {
                        testLink.innerHTML = \`<a href="\${data.previewUrl}" target="_blank" class="text-xs text-blue-600 underline font-bold mt-2 inline-block">Apri Email di Test per continuare</a>\`;
                    }
                } else {
                    alert.classList.add('bg-rose-50', 'text-rose-600', 'border-rose-100');
                    alert.textContent = data.message || 'Errore durante la richiesta.';
                }
            } catch (err) {
                alert.classList.remove('hidden');
                alert.classList.add('bg-rose-50', 'text-rose-600', 'border-rose-100');
                alert.textContent = 'Errore di connessione.';
            } finally {
                btn.disabled = false;
                btn.innerHTML = 'Invia Link di Recupero';
            }
        }

        // RESET PASSWORD
        async function handleResetPassword(e) {
            e.preventDefault();
            const token = document.getElementById('reset-token').value;
            const newPassword = document.getElementById('reset-password-input').value;
            const btn = document.getElementById('btn-reset-submit');
            const alert = document.getElementById('reset-alert');

            // Validazione Policy
            const policyRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\\d)(?=.*[@$!%*?&])[A-Za-z\\d@$!%*?&]{8,}$/;
            if (!policyRegex.test(newPassword)) {
                alert.classList.remove('hidden', 'bg-emerald-50', 'text-emerald-700', 'border-emerald-200');
                alert.classList.add('bg-rose-50', 'text-rose-600', 'border-rose-100');
                alert.innerHTML = '<i class="fa-solid fa-circle-xmark mr-1 mb-1"></i> La password non rispetta i requisiti di sicurezza:<br>- Minimo 8 caratteri<br>- Almeno una lettera maiuscola<br>- Almeno un numero<br>- Almeno un carattere speciale';
                return;
            }

            btn.disabled = true;
            btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin mr-2"></i> Salvataggio...';
            alert.classList.add('hidden');

            try {
                const res = await fetch('/api/auth/reset-password', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ token, newPassword })
                });
                const data = await res.json();

                alert.classList.remove('hidden', 'bg-rose-50', 'text-rose-600', 'border-rose-100');
                if (data.success) {
                    alert.classList.add('bg-emerald-50', 'text-emerald-700', 'border-emerald-200');
                    alert.innerHTML = '<i class="fa-solid fa-check-circle mr-1"></i> Password aggiornata con successo! Ora puoi accedere.';
                    setTimeout(() => {
                        window.location.href = 'login.html';
                    }, 3000);
                } else {
                    alert.classList.add('bg-rose-50', 'text-rose-600', 'border-rose-100');
                    alert.textContent = data.message || 'Errore. Il link potrebbe essere scaduto.';
                    btn.disabled = false;
                    btn.innerHTML = 'Salva Nuova Password';
                }
            } catch (err) {
                alert.classList.remove('hidden');
                alert.classList.add('bg-rose-50', 'text-rose-600', 'border-rose-100');
                alert.textContent = 'Errore di connessione.';
                btn.disabled = false;
                btn.innerHTML = 'Salva Nuova Password';
            }
        }
    </script>
</body>
</html>`;

fs.writeFileSync('public/login.html', newHTML);
console.log('REBUILT LOGIN.HTML FROM SCRATCH!');
