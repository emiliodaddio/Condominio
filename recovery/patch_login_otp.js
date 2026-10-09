const fs = require('fs');
let login = fs.readFileSync('public/login.html', 'utf8');

const rxLoginJS = /async function handleLogin[\s\S]*?\} catch \(e\) \{\s*console\.error\(e\);\s*\}\s*\}/g;

const newLoginJS = `let pendingUserId = null;

        async function handleLogin(e) {
            e.preventDefault();
            const btn = document.getElementById('btn-login');
            const alertMsg = document.getElementById('login-alert');
            
            const email = document.getElementById('email').value;
            const password = document.getElementById('password').value;
            
            btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Attendere...';
            btn.disabled = true;
            alertMsg.classList.add('hidden');

            try {
                const res = await fetch('/api/login', {
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
                        
                        // ONLY FOR TESTING: We show a link to Ethereal so the user can easily test it
                        document.getElementById('otp-test-link').innerHTML = \`<a href="\${data.previewUrl}" target="_blank" class="text-xs text-blue-600 underline text-center block mt-2">Apri Email di Test per leggere il codice</a>\`;
                    } else {
                        // (Non ci dovrebbe più arrivare qui, ma nel caso)
                        sessionStorage.setItem('condo_token', data.token);
                        sessionStorage.setItem('condo_user', JSON.stringify(data.user));
                        window.location.href = 'index.html';
                    }
                } else {
                    alertMsg.textContent = data.message || 'Errore di login. Controlla email e password.';
                    alertMsg.classList.remove('hidden');
                    btn.innerHTML = 'Accedi al Gestionale';
                    btn.disabled = false;
                }
            } catch (e) {
                console.error(e);
                btn.innerHTML = 'Accedi al Gestionale';
                btn.disabled = false;
            }
        }
        
        async function handleVerifyOTP(e) {
            e.preventDefault();
            const btn = document.getElementById('btn-verify-otp');
            const alertMsg = document.getElementById('otp-alert');
            const otp = document.getElementById('otp-code').value.trim();
            
            btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Verifica...';
            btn.disabled = true;
            alertMsg.classList.add('hidden');

            try {
                const res = await fetch('/api/login/verify-otp', {
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
                    alertMsg.textContent = data.message || 'Codice errato.';
                    alertMsg.classList.remove('hidden');
                    btn.innerHTML = 'Conferma Accesso';
                    btn.disabled = false;
                }
            } catch(e) {
                console.error(e);
                btn.innerHTML = 'Conferma Accesso';
                btn.disabled = false;
            }
        }`;

login = login.replace(rxLoginJS, newLoginJS);

// Now inject the OTP Form Container in HTML
const targetHtml = `<div class="mt-6 flex justify-between items-center text-xs">`;

const otpFormHtml = `
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
`;

if (!login.includes('otp-form-container')) {
    login = login.replace(targetHtml, otpFormHtml + `\n                    ` + targetHtml);
    // Also we need to wrap the login form in a container `login-form-container`
    login = login.replace(`<form onsubmit="handleLogin(event)" class="space-y-5">`, `<div id="login-form-container">\n                    <form onsubmit="handleLogin(event)" class="space-y-5">`);
    login = login.replace(`Registrati qui</a>\n                        </div>`, `Registrati qui</a>\n                        </div>\n                    </div>`);
}

fs.writeFileSync('public/login.html', login);
console.log('Login HTML updated for Email OTP');
