const fs = require('fs');
let login = fs.readFileSync('public/login.html', 'utf8');

const scriptStart = login.indexOf('<script>');
const scriptEnd = login.indexOf('</script>') + '</script>'.length;

const newScript = `<script>
        let pendingUserId = null;

        async function handleLogin(e) {
            e.preventDefault();
            const btn = document.querySelector('#login-form button[type="submit"]');
            const alertMsg = document.getElementById('error-message');
            const alertBox = document.getElementById('error-alert');
            
            const email = document.getElementById('email').value.trim();
            const password = document.getElementById('password').value;
            
            btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Attendere...';
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
                        
                        document.getElementById('otp-test-link').innerHTML = \`<a href="\${data.previewUrl}" target="_blank" class="text-xs text-blue-600 underline text-center block mt-2">Apri Email di Test per leggere il codice</a>\`;
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
                btn.innerHTML = '<span>Accedi al Portale</span>';
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
        }
        
        function openForgotPasswordModal() {
            document.getElementById('modal-forgot-password').classList.remove('hidden');
        }

        function closeForgotPasswordModal() {
            document.getElementById('modal-forgot-password').classList.add('hidden');
            document.getElementById('forgot-email').value = '';
            document.getElementById('forgot-alert').classList.add('hidden');
        }
        
        async function submitForgotPassword(event) {
            event.preventDefault();
            const email = document.getElementById('forgot-email').value;
            const btn = document.getElementById('btn-forgot-submit');
            const alert = document.getElementById('forgot-alert');
            const testLink = document.getElementById('forgot-test-link');

            btn.disabled = true;
            btn.innerHTML = 'Invio in corso...';
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
                        testLink.innerHTML = \`<a href="\${data.previewUrl}" target="_blank" class="text-xs text-blue-600 underline">Apri Email di Test per continuare (Solo Admin)</a>\`;
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
        </script>`;

login = login.slice(0, scriptStart) + newScript + login.slice(scriptEnd);
fs.writeFileSync('public/login.html', login);
console.log('Fully replaced login.html script');
