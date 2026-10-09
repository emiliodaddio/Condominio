const fs = require('fs');
let code = fs.readFileSync('public/app_v4.js', 'utf8');

const idx = code.indexOf('async function inviaConvocazioneEmail()');
if (idx !== -1) {
    code = code.substring(0, idx);
}

const functionCode = `
async function inviaConvocazioneEmail() {
    const userId = document.getElementById('convocazione-user').value;
    const data1 = document.getElementById('convocazione-data1').value;
    const data2 = document.getElementById('convocazione-data2').value;
    const luogo1 = document.getElementById('convocazione-luogo1').value;
    const luogo2 = document.getElementById('convocazione-luogo2').value;
    const odg = document.getElementById('convocazione-odg').value;
    
    if (!userId || !data1 || !data2 || !odg) {
        alert('Compila tutti i campi obbligatori (Destinatario, Date e ODG).');
        return;
    }
    
    const u = state.users.find(x => x.id == userId);
    if (!u) return;

    if (!u.email) {
        alert('Questo condomino non ha un indirizzo email configurato nel sistema.');
        return;
    }
    
    const formatDate = (ds) => {
        if (!ds) return '';
        const d = new Date(ds);
        return d.toLocaleDateString('it-IT') + ' alle ore ' + d.toLocaleTimeString('it-IT', {hour: '2-digit', minute:'2-digit'});
    };
    
    const odgHtml = odg.split('\\n').map(r => '<li>' + r + '</li>').join('');
    
    const activeCondoName = state.currentUser.condomini ? state.currentUser.condomini.find(c => c.id == state.activeCondominioId)?.nome : 'Condominio';
    
    const html = \`
        <html>
        <head>
            <style>
                body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; padding: 20px; }
                .header { text-align: center; margin-bottom: 40px; border-bottom: 2px solid #000; padding-bottom: 20px; }
                .destinatario { margin-bottom: 40px; text-align: right; }
                .oggetto { font-weight: bold; margin-bottom: 30px; text-decoration: underline; }
                .content { margin-bottom: 40px; }
                .odg { margin-left: 20px; }
                .footer { margin-top: 50px; text-align: right; }
            </style>
        </head>
        <body>
            <div class="header">
                <h2>AMMINISTRAZIONE CONDOMINIO</h2>
                <h3>\${activeCondoName}</h3>
            </div>
            
            <div class="destinatario">
                <strong>DESTINATARIO:</strong><br>
                Gent.le Sig./Sig.ra \${u.nome}<br>
                Unità: \${u.unita || ''}<br>
            </div>
            
            <div class="oggetto">
                OGGETTO: Convocazione Assemblea Condominiale
            </div>
            
            <div class="content">
                <p>La S.V. è invitata a partecipare all'Assemblea del Condominio "\${activeCondoName}", che si terrà:</p>
                
                <p>
                    <strong>In prima convocazione:</strong><br>
                    Il \${formatDate(data1)}<br>
                    Luogo: \${luogo1}
                </p>
                
                <p>
                    <strong>In seconda convocazione:</strong><br>
                    Il \${formatDate(data2)}<br>
                    Luogo: \${luogo2}
                </p>
                
                <p>Per discutere e deliberare sul seguente:</p>
                
                <p><strong>ORDINE DEL GIORNO</strong></p>
                <ol class="odg">
                    \${odgHtml}
                </ol>
            </div>
            
            <div class="footer">
                L'Amministratore<br>
                <em>_______________________</em>
            </div>
        </body>
        </html>
    \`;

    try {
        showToast('Invio email in corso...', 'info');
        const res = await fetch('/api/assemblies/send-convocation', {
            method: 'POST',
            headers: getAuthHeaders(),
            body: JSON.stringify({ 
                email: u.email, 
                nome: u.nome, 
                htmlContent: html,
                activeCondoName 
            })
        });
        
        const data = await res.json();
        if (data.success) {
            showToast('Email inviata con successo!', 'success');
            if (data.previewUrl) {
                console.log("Email Preview URL:", data.previewUrl);
                alert("Email di test inviata (Ethereal).\\nAnteprima disponibile nella console o al link:\\n" + data.previewUrl);
            }
            closeConvocazioneModal();
        } else {
            showToast('Errore invio email: ' + data.message, 'error');
        }
    } catch (e) {
        console.error(e);
        showToast('Errore di connessione durante l\\'invio dell\\'email.', 'error');
    }
}
\`;

fs.writeFileSync('public/app_v4.js', code + '\n' + functionCode);
