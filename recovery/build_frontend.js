const fs = require('fs');
const path = require('path');

const publicDir = path.join(__dirname, 'public');

// 1. MANIFEST.JSON
const manifestCode = \`{
  "name": "CondoTransparent",
  "short_name": "CondoApp",
  "start_url": "/",
  "display": "standalone",
  "background_color": "#ffffff",
  "theme_color": "#2563eb",
  "icons": [
    {
      "src": "https://cdn-icons-png.flaticon.com/512/5988/5988246.png",
      "sizes": "192x192",
      "type": "image/png"
    }
  ]
}\`;
fs.writeFileSync(path.join(publicDir, 'manifest.json'), manifestCode);

// 2. SW.JS (Service Worker)
const swCode = \`self.addEventListener('install', (e) => {
    e.waitUntil(
        caches.open('condo-store').then((cache) => cache.addAll([
            '/',
            '/index.html',
            '/login.html',
            '/style.css',
            '/app.js'
        ]))
    );
});

self.addEventListener('fetch', (e) => {
    // Only cache GET requests for our origin to avoid API issues
    if (e.request.method !== 'GET' || !e.request.url.startsWith(self.location.origin)) {
        return fetch(e.request);
    }
    e.respondWith(
        fetch(e.request).catch(() => caches.match(e.request))
    );
});\`;
fs.writeFileSync(path.join(publicDir, 'sw.js'), swCode);

// 3. STYLE.CSS (Append Print Styles)
let styleCss = fs.existsSync(path.join(publicDir, 'style.css')) ? fs.readFileSync(path.join(publicDir, 'style.css'), 'utf8') : '';
if (!styleCss.includes('@media print')) {
    styleCss += \`\n\n@media print {
    .no-print, nav, header, footer, button, .modal, aside {
        display: none !important;
    }
    body {
        background-color: white !important;
        color: black !important;
    }
    main {
        width: 100% !important;
        margin: 0 !important;
        padding: 0 !important;
        box-shadow: none !important;
    }
}\n\`;
    fs.writeFileSync(path.join(publicDir, 'style.css'), styleCss);
}

// 4. APP.JS (Append Export, WebSpeech, and 2FA Logic)
let appJs = fs.existsSync(path.join(publicDir, 'app.js')) ? fs.readFileSync(path.join(publicDir, 'app.js'), 'utf8') : '';
if (!appJs.includes('exportToExcel')) {
    appJs += \`\n\n// --- AGGIUNTE STEP 3 & 4 ---\n
// Esportazione in Excel (SheetJS)
async function exportToExcel() {
    try {
        const token = localStorage.getItem('condo_token');
        const cId = localStorage.getItem('active_condominio_id');
        const res = await fetch('/api/quotes', {
            headers: { 'Authorization': \\\`Bearer \\\${token}\\\`, 'x-condominio-id': cId }
        });
        const json = await res.json();
        
        if (json.success && json.data.length > 0) {
            const worksheet = XLSX.utils.json_to_sheet(json.data);
            const workbook = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(workbook, worksheet, "Estratto_Conto");
            XLSX.writeFile(workbook, \\\`Estratto_Condominio_\\\${cId}.xlsx\\\`);
        } else {
            alert("Nessun dato disponibile da esportare.");
        }
    } catch(err) {
        console.error("Errore Excel:", err);
    }
}

// Dettatura Vocale (Web Speech API) per verbali assemblea
let recognition;
function startDictation(targetInputId) {
    if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) {
        alert("Il tuo browser non supporta la dettatura vocale.");
        return;
    }
    
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    recognition = new SpeechRecognition();
    recognition.lang = 'it-IT';
    recognition.interimResults = true;
    recognition.continuous = true;

    recognition.onresult = function(event) {
        let transcript = '';
        for (let i = event.resultIndex; i < event.results.length; i++) {
            transcript += event.results[i][0].transcript;
        }
        document.getElementById(targetInputId).value += " " + transcript;
    };

    recognition.start();
    alert("Dettatura avviata. Premi OK e inizia a parlare.");
}

function stopDictation() {
    if(recognition) {
        recognition.stop();
        alert("Dettatura fermata.");
    }
}

// Setup 2FA nel Profilo
async function open2FASetup() {
    const token = localStorage.getItem('condo_token');
    const res = await fetch('/api/2fa/setup', { method: 'POST', headers: { 'Authorization': \\\`Bearer \\\${token}\\\` }});
    const data = await res.json();
    if(data.success) {
        // Supponiamo l'esistenza di un modale con questi ID
        const qrImg = document.getElementById('qr-code-img');
        const backupList = document.getElementById('backup-codes-list');
        if(qrImg) qrImg.src = data.qrCodeUrl;
        if(backupList) backupList.innerHTML = data.backupCodes.map(c => \\\`<li>\\\${c}</li>\\\`).join('');
    }
}

async function verify2FASetup() {
    const totpCode = document.getElementById('totp-verify-input').value;
    const token = localStorage.getItem('condo_token');
    const res = await fetch('/api/2fa/verify', { 
        method: 'POST', 
        headers: { 'Authorization': \\\`Bearer \\\${token}\\\`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: totpCode })
    });
    const data = await res.json();
    if(data.success) {
        alert("2FA Attivata con successo! Usa il tuo authenticator al prossimo login.");
    } else {
        alert("Codice errato, riprova.");
    }
}
\`;
    fs.writeFileSync(path.join(publicDir, 'app.js'), appJs);
}

console.log("Frontend Step 3 e 4 costruiti con successo!");
