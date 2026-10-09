// ==========================================
// GESTIONE UNITA E MILLESIMI
// ==========================================

async function loadUnita() {
    const cId = localStorage.getItem('active_condominio_id');
    if(!cId) return;
    
    try {
        const res = await fetch('/api/unita', { headers: getAuthHeaders() });
        const data = await res.json();
        
        const tbody = document.getElementById('unita-list');
        if(!tbody) return;
        
        if (res.ok && data.success) {
            tbody.innerHTML = data.data.map(u => `
                <tr class="hover:bg-slate-50 transition-colors">
                    <td class="px-6 py-4">
                        <div class="font-bold text-slate-800">${u.identificativo}</div>
                        <div class="text-[11px] text-slate-400">Sc: ${u.scala || '-'} | P: ${u.piano || '-'}</div>
                    </td>
                    <td class="px-6 py-4"><span class="px-2 py-1 bg-slate-100 rounded-lg text-xs font-semibold">${u.tipo}</span></td>
                    <td class="px-6 py-4">
                        <div class="font-bold text-slate-700">${u.condomino_nome || 'Nessuno'}</div>
                        ${u.condomino_email ? `<div class="text-[11px] text-slate-400">${u.condomino_email}</div>` : ''}
                    </td>
                    <td class="px-6 py-4 font-mono">${u.millesimi_proprieta.toFixed(2)}</td>
                    <td class="px-6 py-4 font-mono">${u.millesimi_scale.toFixed(2)}</td>
                    <td class="px-6 py-4 font-mono">${u.millesimi_ascensore.toFixed(2)}</td>
                    <td class="px-6 py-4 text-right admin-only">
                        <button onclick='openUnitaModal(${JSON.stringify(u)})' class="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors">
                            <i class="fa-solid fa-pen"></i>
                        </button>
                    </td>
                </tr>
            `).join('');
        }
        applyRoleVisibility();
    } catch(e) {
        console.error(e);
    }
}

function openUnitaModal(u = null) {
    document.getElementById('unita-modal-title').textContent = u ? 'Modifica Unità' : 'Nuova Unità';
    document.getElementById('unita-id').value = u ? u.id : '';
    document.getElementById('unita-identificativo').value = u ? u.identificativo : '';
    document.getElementById('unita-tipo').value = u ? u.tipo : 'Appartamento';
    document.getElementById('unita-scala').value = u ? (u.scala || '') : '';
    document.getElementById('unita-piano').value = u ? (u.piano || '') : '';
    document.getElementById('unita-mill-prop').value = u ? u.millesimi_proprieta : '0';
    document.getElementById('unita-mill-scale').value = u ? u.millesimi_scale : '0';
    document.getElementById('unita-mill-asc').value = u ? u.millesimi_ascensore : '0';
    document.getElementById('unita-user-id').value = u ? (u.user_id || '') : '';
    
    document.getElementById('unita-modal').classList.remove('hidden');
}

function closeUnitaModal() {
    document.getElementById('unita-modal').classList.add('hidden');
}

async function saveUnita(e) {
    e.preventDefault();
    const id = document.getElementById('unita-id').value;
    const body = {
        identificativo: document.getElementById('unita-identificativo').value,
        tipo: document.getElementById('unita-tipo').value,
        scala: document.getElementById('unita-scala').value,
        piano: document.getElementById('unita-piano').value,
        millesimi_proprieta: parseFloat(document.getElementById('unita-mill-prop').value),
        millesimi_scale: parseFloat(document.getElementById('unita-mill-scale').value),
        millesimi_ascensore: parseFloat(document.getElementById('unita-mill-asc').value),
        user_id: document.getElementById('unita-user-id').value ? parseInt(document.getElementById('unita-user-id').value) : null
    };

    const method = id ? 'PUT' : 'POST';
    const url = id ? '/api/unita/' + id : '/api/unita';

    try {
        const res = await fetch(url, {
            method,
            headers: getAuthHeaders(),
            body: JSON.stringify(body)
        });
        
        if (res.ok) {
            closeUnitaModal();
            loadUnita();
        } else {
            alert("Errore salvataggio unità.");
        }
    } catch(err) {
        console.error(err);
    }
}
