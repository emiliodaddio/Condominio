// ============================================================================
// MODULO CONVOCAZIONE ASSEMBLEA
// ============================================================================
function openConvocazioneModal() {
    const modal = document.getElementById('convocazione-modal');
    if (!modal) return;
    
    // Popola select utenti
    const select = document.getElementById('convocazione-user');
    select.innerHTML = '<option value="">-- Seleziona il Condòmino --</option>';
    state.users.forEach(u => {
        select.innerHTML += `<option value="${u.id}">${u.nome} (${u.unita || 'Nessuna Unità'})</option>`;
    });
    
    // Set default dates (tomorrow and day after tomorrow)
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(18, 0, 0, 0);
    const dayAfter = new Date();
    dayAfter.setDate(dayAfter.getDate() + 2);
    dayAfter.setHours(18, 0, 0, 0);
    
    document.getElementById('convocazione-data1').value = tomorrow.toISOString().slice(0, 16);
    document.getElementById('convocazione-data2').value = dayAfter.toISOString().slice(0, 16);
    
    modal.classList.remove('hidden');
}

function closeConvocazioneModal() {
    document.getElementById('convocazione-modal').classList.add('hidden');
}

function stampaConvocazione() {
    const userId = document.getElementById('convocazione-user').value;
    if (!userId) {
        showToast('Seleziona un condòmino destinatario.', 'error');
        return;
    }
    
    const u = state.users.find(x => x.id == userId);
    if (!u) return;
    
    const d1 = document.getElementById('convocazione-data1').value;
    const l1 = document.getElementById('convocazione-luogo1').value;
    const d2 = document.getElementById('convocazione-data2').value;
    const l2 = document.getElementById('convocazione-luogo2').value;
    const odg = document.getElementById('convocazione-odg').value;
    
    const formatDate = (ds) => {
        if (!ds) return '';
        const d = new Date(ds);
        return d.toLocaleDateString('it-IT') + ' alle ore ' + d.toLocaleTimeString('it-IT', {hour: '2-digit', minute:'2-digit'});
    };
    
    const odgHtml = odg.split('\n').map(r => `<li>${r}</li>`).join('');
    
    const activeCondoName = state.currentUser.condomini ? state.currentUser.condomini.find(c => c.id == state.activeCondominioId)?.nome : 'Condominio';
    
    const printWindow = window.open('', '_blank');
    const html = `
        <html>
        <head>
            <title>Convocazione Assemblea - ${u.nome}</title>
            <style>
                body { font-family: 'Arial', sans-serif; padding: 40px; line-height: 1.6; color: #333; max-width: 800px; margin: 0 auto; }
                h1, h2 { text-align: center; }
                .mittente, .destinatario { margin-bottom: 20px; }
                .destinatario { text-align: right; }
                .oggetto { font-weight: bold; margin: 30px 0; border-bottom: 1px solid #ccc; padding-bottom: 10px; }
                .details { margin: 20px 0; }
                .firma { margin-top: 50px; text-align: right; }
                .delega { margin-top: 50px; border-top: 2px dashed #999; padding-top: 30px; }
            </style>
        </head>
        <body>
            <div class="mittente">
                <strong>MITTENTE:</strong><br>
                Amministratore del Condominio "${activeCondoName}"<br>
                Email: ${state.currentUser.email}<br>
            </div>
            
            <div class="destinatario">
                <strong>DESTINATARIO:</strong><br>
                Gent.le Sig./Sig.ra ${u.nome}<br>
                Unità: ${u.unita || ''}<br>
            </div>
            
            <p><strong>Data:</strong> ${new Date().toLocaleDateString('it-IT')}</p>
            
            <div class="oggetto">
                OGGETTO: Convocazione Assemblea Condominiale
            </div>
            
            <p>Gentile Condòmino/a,</p>
            <p>La S.V. è invitata a partecipare all'Assemblea del Condominio "${activeCondoName}", che si terrà:</p>
            
            <ul class="details">
                <li><strong>In prima convocazione:</strong> Il giorno ${formatDate(d1)}, presso ${l1}.</li>
                <li><strong>In seconda convocazione:</strong> (qualora la prima andasse deserta) Il giorno <strong>${formatDate(d2)}</strong>, presso <strong>${l2}</strong>.</li>
            </ul>
            
            <p>L'assemblea è convocata per discutere e deliberare sul seguente:</p>
            
            <h3>ORDINE DEL GIORNO</h3>
            <ol>
                ${odgHtml}
            </ol>
            
            <p>Data l'importanza degli argomenti da trattare, si raccomanda la massima partecipazione. Nel caso in cui Lei fosse impossibilitato/a a intervenire personalmente, La invitiamo a farsi rappresentare da persona di Sua fiducia compilando la delega sottostante.</p>
            
            <div class="firma">
                L'Amministratore<br>
                ___________________________
            </div>
            
            <div class="delega">
                <h2>DELEGA PER ASSEMBLEA CONDOMINIALE</h2>
                <p>Il/La sottoscritto/a <strong>${u.nome}</strong>, proprietario/a dell'unità <strong>${u.unita || ''}</strong>,</p>
                <p><strong>DELEGA</strong></p>
                <p>Il/La Sig./Sig.ra ________________________________________________________________________, a rappresentarlo/a nell'Assemblea Condominiale convocata per il giorno <strong>${formatDate(d2)}</strong> in seconda convocazione, conferendogli/le il più ampio potere di discussione e votazione su tutti gli argomenti posti all'ordine del giorno.</p>
                <br>
                <p>Luogo e Data: ___________________________</p>
                <p>Firma del Delegante: ___________________________</p>
            </div>
            
            <script>
                window.onload = function() { window.print(); }
            </script>
        </body>
        </html>
    `;
    
    printWindow.document.write(html);
    printWindow.document.close();
    closeConvocazioneModal();
}
