const fs = require('fs');

let content = fs.readFileSync('public/login.html', 'utf8');

const oldScript = `                if (response.ok && data.success) {
                    // Memorizza il token JWT e i dati utente
                    localStorage.setItem('condo_token', data.token);
                    localStorage.setItem('condo_user', JSON.stringify(data.user));

                    // Reindirizza alla dashboard
                    window.location.href = 'index.html';
                } else {`;

const newScript = `                if (response.ok && data.success) {
                    if (data.require2FA) {
                        const token = prompt('Inserisci il codice 2FA dal tuo Authenticator:');
                        if (!token) {
                            submitBtn.disabled = false;
                            submitBtn.innerHTML = '<span>Accedi al Portale</span>';
                            return;
                        }
                        
                        const res2fa = await fetch('/api/2fa/validate', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ userId: data.userId, token })
                        });
                        const data2fa = await res2fa.json();
                        
                        if (res2fa.ok && data2fa.success) {
                            localStorage.setItem('condo_token', data2fa.token);
                            localStorage.setItem('condo_user', JSON.stringify(data2fa.user));
                            window.location.href = 'index.html';
                        } else {
                            alertBox.classList.remove('hidden');
                            alertMsg.textContent = data2fa.message || 'Codice 2FA non valido.';
                            submitBtn.disabled = false;
                            submitBtn.innerHTML = '<span>Accedi al Portale</span>';
                        }
                    } else {
                        // Memorizza il token JWT e i dati utente
                        localStorage.setItem('condo_token', data.token);
                        localStorage.setItem('condo_user', JSON.stringify(data.user));

                        // Reindirizza alla dashboard
                        window.location.href = 'index.html';
                    }
                } else {`;

if (!content.includes("data.require2FA")) {
    content = content.replace(oldScript, newScript);
    fs.writeFileSync('public/login.html', content);
    console.log('Frontend login aggiornato con successo!');
}
