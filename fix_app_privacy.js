const fs = require('fs');
let code = fs.readFileSync('public/app_v4.js', 'utf8');

const privacyJS = `
// Gestione Privacy Form
document.addEventListener('DOMContentLoaded', () => {
    // Checkbox abilitazione pulsante
    setTimeout(() => {
        const checkbox = document.getElementById('privacy-checkbox');
        const btn = document.getElementById('btn-accept-privacy');
        if (checkbox && btn) {
            checkbox.addEventListener('change', (e) => {
                if (e.target.checked) {
                    btn.classList.remove('bg-slate-300', 'text-slate-500', 'cursor-not-allowed');
                    btn.classList.add('bg-indigo-600', 'text-white', 'hover:bg-indigo-700', 'shadow-lg');
                    btn.disabled = false;
                } else {
                    btn.classList.add('bg-slate-300', 'text-slate-500', 'cursor-not-allowed');
                    btn.classList.remove('bg-indigo-600', 'text-white', 'hover:bg-indigo-700', 'shadow-lg');
                    btn.disabled = true;
                }
            });
        }
    }, 1000);
});

function checkPrivacyStatus() {
    if (!state.currentUser.is_superadmin && state.currentUser.privacy_accepted !== 1) {
        document.getElementById('modal-privacy').classList.remove('hidden');
    }
}

async function acceptPrivacy() {
    try {
        const res = await fetch('/api/users/accept-privacy', {
            method: 'POST',
            headers: getAuthHeaders()
        });
        const data = await res.json();
        if (data.success) {
            state.currentUser.privacy_accepted = 1;
            document.getElementById('modal-privacy').classList.add('hidden');
            showToast('Consenso Privacy registrato con successo.', 'success');
        } else {
            showToast('Errore durante la registrazione del consenso.', 'error');
        }
    } catch (e) {
        showToast('Errore di connessione', 'error');
    }
}
`;

// Insert the privacy logic
code = code + '\n' + privacyJS;

// Hook into setupUIForRole to check privacy immediately after login/refresh
code = code.replace(
    "setupUIForRole();",
    "setupUIForRole();\n        checkPrivacyStatus();"
);

fs.writeFileSync('public/app_v4.js', code);
