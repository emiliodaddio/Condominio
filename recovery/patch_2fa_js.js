const fs = require('fs');
let appJS = fs.readFileSync('public/app_v4.js', 'utf8');

const jsLogic = `
// ============================================================================
// 2FA SECURITY PROFILE LOGIC
// ============================================================================

function openSecurityProfileModal() {
    document.getElementById('modal-security-profile').classList.remove('hidden');
    document.getElementById('2fa-setup-container').classList.add('hidden');
    check2FAStatus();
}

function closeSecurityProfileModal() {
    document.getElementById('modal-security-profile').classList.add('hidden');
    document.getElementById('2fa-verify-code').value = '';
}

function check2FAStatus() {
    const isEnabled = state.currentUser.two_factor_enabled;
    const icon = document.getElementById('2fa-status-icon');
    const text = document.getElementById('2fa-status-text');
    const btn = document.getElementById('btn-enable-2fa');
    
    if (isEnabled) {
        icon.className = 'w-10 h-10 rounded-full flex items-center justify-center text-lg bg-emerald-100 text-emerald-600';
        icon.innerHTML = '<i class="fa-solid fa-lock"></i>';
        text.textContent = 'Autenticazione a Due Fattori ATTIVA';
        text.className = 'text-xs font-bold text-emerald-600';
        btn.classList.add('hidden');
    } else {
        icon.className = 'w-10 h-10 rounded-full flex items-center justify-center text-lg bg-rose-100 text-rose-600';
        icon.innerHTML = '<i class="fa-solid fa-unlock-keyhole"></i>';
        text.textContent = 'Non attiva. Il tuo account è a rischio.';
        text.className = 'text-xs font-bold text-rose-600';
        btn.classList.remove('hidden');
    }
}

async function start2FASetup() {
    try {
        const res = await fetch('/api/2fa/setup', { method: 'POST', headers: getAuthHeaders() });
        const data = await res.json();
        if (data.success && data.qrCodeDataUrl) {
            document.getElementById('2fa-qrcode-img').src = data.qrCodeDataUrl;
            document.getElementById('2fa-setup-container').classList.remove('hidden');
            document.getElementById('btn-enable-2fa').classList.add('hidden');
        } else {
            showToast('Errore durante la generazione del QR Code', 'error');
        }
    } catch (e) {
        showToast('Errore di connessione', 'error');
    }
}

async function verifyAndEnable2FA() {
    const token = document.getElementById('2fa-verify-code').value.trim();
    if (token.length !== 6) {
        showToast('Inserisci un codice di 6 cifre valido', 'error');
        return;
    }
    
    try {
        const res = await fetch('/api/2fa/verify', {
            method: 'POST',
            headers: getAuthHeaders(),
            body: JSON.stringify({ token })
        });
        const data = await res.json();
        
        if (data.success) {
            showToast('Autenticazione a Due Fattori abilitata con successo!', 'success');
            state.currentUser.two_factor_enabled = 1;
            sessionStorage.setItem('condo_user', JSON.stringify(state.currentUser));
            document.getElementById('2fa-setup-container').classList.add('hidden');
            check2FAStatus();
        } else {
            showToast(data.message || 'Codice errato. Riprova.', 'error');
        }
    } catch (e) {
        showToast('Errore di connessione', 'error');
    }
}
`;

if (!appJS.includes('openSecurityProfileModal')) {
    appJS += '\n' + jsLogic;
    fs.writeFileSync('public/app_v4.js', appJS);
    console.log('Added 2FA JS logic to app_v4.js');
}
