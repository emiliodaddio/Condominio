const fs = require('fs');
let html = fs.readFileSync('public/login.html', 'utf8');

// The injected code is currently inside the tailwindcdn script or somewhere else.
// I will just read it, rip it out if it exists, and append it cleanly before </body>.

const jsLogic = `
<script>
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

window.addEventListener('DOMContentLoaded', () => {
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.has('token')) {
        document.getElementById('modal-reset-pwd').classList.remove('hidden');
    }
});

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

// Rip out the broken one if it's there
const rx = /\/\/ --- PASSWORD RECOVERY LOGIC ---[\s\S]*?window\.togglePasswordVisibility = function\([^)]*\)\s*\{[\s\S]*?\}\s*;\s*(<\/script>)?/g;
html = html.replace(rx, '</script>');

if (!html.includes('showForgotPassword() {')) {
    html = html.replace('</body>', jsLogic + '\n</body>');
    fs.writeFileSync('public/login.html', html);
    console.log('Fixed js logic');
} else {
    console.log('Already there');
}
