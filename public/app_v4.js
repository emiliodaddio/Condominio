/**
 * ============================================================================
 * GESTIONE CondominiALE - Logica Client-Side RBAC (Vanilla JavaScript)
 * ============================================================================
 * 
 * Gestisce:
 * 1. Controllo di autenticazione e reindirizzamento (se non loggato -> login.html).
 * 2. Visualizzazione dinamica basata sul ruolo (Amministratore vs condomino).
 * 3. Nomi debitori in chiaro per Admin vs Anonimizzazione automatica per condomino.
 * 4. Pannello "Gestione Utenti" e generazione credenziali riservato all'Amministratore.
 * 5. Chiamate asincrone protette con header Bearer JWT verso le API Express.
 */

const state = {
    currentUser: null,
    token: sessionStorage.getItem('condo_token') || null,
    activeCondominioId: null,
    currentTab: 'dashboard',
    quotes: [],
    receivables: [],
    suppliers: [],
    assemblies: [],
    tickets: [],
    users: [],
    currentTicketId: null
};

// ============================================================================
// 1. VERIFICA AUTENTICAZIONE ALL'AVVIO
// ============================================================================

document.addEventListener('DOMContentLoaded', async () => {
    // Se non è presente alcun token JWT, reindirizza immediatamente a login.html
    if (!state.token) {
        window.location.href = 'login.html?v=2';
        return;
    }

    try {
        // Valida il token con il backend e recupera i dati del profilo
        const res = await fetch('/api/auth/me', { headers: getAuthHeaders() });
        if (!res.ok) {
            logout();
            return;
        }

        const data = await res.json();
        state.currentUser = data.user;

        // Se l'utente ha più condomini, azzera activeCondominioId all'avvio 
        // così da mostrare SEMPRE la maschera iniziale "La tua Scrivania"
        if (state.currentUser.condomini && state.currentUser.condomini.length > 1) {
            state.activeCondominioId = null;
            sessionStorage.removeItem('active_Condominio_id');
        }

        // Configura l'interfaccia grafica in base al ruolo dell'utente
        setupUIForRole();
        checkPrivacyStatus();

        // Se un condominio è attivo, carica i dati iniziali
        if (state.activeCondominioId) {
            loadTicketsBadge();
            loadAnagrafica();
            if (state.currentUser.role === 'admin') {
                loadUsersList();
            }
        }

    } catch (err) {
        console.error('Errore durante la verifica della sessione:', err);
        logout();
    }
});

/**
 * Restituisce l'header Authorization con il token JWT Bearer
 */

function getAuthHeaders() {
    const headers = {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + state.token
    };
    if (state.activeCondominioId) {
        headers['X-Condominio-Id'] = state.activeCondominioId;
    }
    return headers;
}


/**
 * Disconnette l'utente cancellando la sessione e reindirizzando al login
 */
function logout() {
    sessionStorage.removeItem('condo_token');
    sessionStorage.removeItem('condo_user');
    sessionStorage.removeItem('active_Condominio_id');
    window.location.href = 'login.html?v=2';
}

window.handleHomeClick = function() {
    if (state.currentUser && state.currentUser.condomini && state.currentUser.condomini.length > 1) {
        returnToAgencyDashboard();
    } else {
        switchTab('dashboard');
    }
};

// ============================================================================
// 2. CONFIGURAZIONE DINAMICA DELLA UI PER IL RUOLO (RBAC)
// ============================================================================

function setupUIForRole() {
    const user = state.currentUser;
    
    if (!state.activeCondominioId && user.condomini && user.condomini.length > 1) {
        showAgencyDashboard();
        return;
    }
    if (!state.activeCondominioId && user.condomini && user.condomini.length > 0) {
        state.activeCondominioId = user.condomini[0].id;
    }
    
    let currentCondo = user.condomini ? user.condomini.find(c => c.id == state.activeCondominioId) : null;
    if (!currentCondo && state.suData && state.suData.condomini) {
        currentCondo = state.suData.condomini.find(c => c.id == state.activeCondominioId);
    }
    const isAdmin = user.is_superadmin || (currentCondo && currentCondo.role === 'admin');

    const btnReturnDash = document.getElementById('btn-return-dashboard');
    if (btnReturnDash) {
        if (user.condomini && user.condomini.length > 1) {
            btnReturnDash.classList.remove('hidden');
        } else {
            btnReturnDash.classList.add('hidden');
        }
    }
    
    // FISSA IL RUOLO NELLO STATE
    state.currentUser.role = isAdmin ? 'admin' : 'condomino';

    if (currentCondo) {
        const headerCondoName = document.getElementById('header-condo-name');
        if (headerCondoName) {
            headerCondoName.innerHTML = currentCondo.nome;
        }
    }

    if (!window.changeCondominioDefined) {
        window.changeCondominioDefined = true;
        window.changeCondominio = function(id) {
            state.activeCondominioId = id;
            setupUIForRole();
            if (state.currentTab) switchTab(state.currentTab);
            else switchTab('dashboard');
        };
    }



    // Dati profilo nell'header
    document.getElementById('user-display-name').textContent = user.nome;
    document.getElementById('user-display-unit').textContent = user.is_superadmin ? 'Proprietario della Piattaforma' : (isAdmin ? 'Amministrazione Condominiale' : (user.unita || 'condomino'));

    const roleBadge = document.getElementById('role-badge');
    if (user.is_superadmin) {
        roleBadge.className = 'px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase bg-gradient-to-r from-purple-100 to-indigo-100 text-purple-900 border border-purple-300 shadow-2xs';
        roleBadge.innerHTML = '<i class="fa-solid fa-crown text-amber-500 mr-1"></i> SUPERUSER (PROPRIETARIO)';
    } else if (isAdmin) {
        roleBadge.className = 'px-2.5 py-0.5 rounded-full text-[10px] font-extrabold uppercase bg-blue-100 text-blue-800 border border-blue-200';
        roleBadge.innerHTML = '<i class="fa-solid fa-shield-halved mr-1"></i> AMMINISTRATORE';
    } else {
        roleBadge.className = 'px-2.5 py-0.5 rounded-full text-[10px] font-extrabold uppercase bg-emerald-100 text-emerald-800 border border-emerald-200';
        roleBadge.innerHTML = '<i class="fa-solid fa-user-check mr-1"></i> condomino';
    }

    const btnSuDesk = document.getElementById('btn-superuser-desk');
    if (btnSuDesk) {
        if (user.is_superadmin) btnSuDesk.classList.remove('hidden');
        else btnSuDesk.classList.add('hidden');
    }
    const btnSuHeader = document.getElementById('btn-superuser-header');
    if (btnSuHeader) {
        if (user.is_superadmin) btnSuHeader.classList.remove('hidden');
        else btnSuHeader.classList.add('hidden');
    }

    const tabBtnUsers = document.getElementById('tab-btn-users');
    const tabBtnAnagrafica = document.getElementById('tab-btn-anagrafica');
    const tabBtnBanca = document.getElementById('tab-btn-banca');
    const tabBtnGiornale = document.getElementById('tab-btn-giornale');
    const tabBtnAudit = document.getElementById('tab-btn-audit');
    if (isAdmin) {
        if (tabBtnUsers) tabBtnUsers.classList.remove('hidden');
        if (tabBtnAnagrafica) tabBtnAnagrafica.classList.remove('hidden');
        const tabBtnUnita = document.getElementById('tab-btn-unita'); if (tabBtnUnita) tabBtnUnita.classList.remove('hidden');
        if (tabBtnBanca) tabBtnBanca.classList.remove('hidden');
        if (tabBtnGiornale) tabBtnGiornale.classList.remove('hidden');
        if (tabBtnAudit) tabBtnAudit.classList.remove('hidden');
        document.getElementById('admin-add-quote-btn-box').classList.remove('hidden');
        document.getElementById('admin-add-supplier-btn').classList.remove('hidden');
        const adminAddSuppReg = document.getElementById('admin-add-supplier-registry-btn');
        if (adminAddSuppReg) adminAddSuppReg.classList.remove('hidden');
        document.querySelectorAll('.admin-only').forEach(el => el.classList.remove('hidden'));
    } else {
        if (tabBtnUsers) tabBtnUsers.classList.add('hidden');
        if (tabBtnAnagrafica) tabBtnAnagrafica.classList.add('hidden');
        const tabBtnUnita = document.getElementById('tab-btn-unita'); if (tabBtnUnita) tabBtnUnita.classList.add('hidden');
        if (tabBtnBanca) tabBtnBanca.classList.add('hidden');
        if (tabBtnGiornale) tabBtnGiornale.classList.add('hidden');
        if (tabBtnAudit) tabBtnAudit.classList.add('hidden');
        document.getElementById('admin-add-quote-btn-box').classList.add('hidden');
        document.getElementById('admin-add-supplier-btn').classList.add('hidden');
        const adminAddSuppReg = document.getElementById('admin-add-supplier-registry-btn');
        if (adminAddSuppReg) adminAddSuppReg.classList.add('hidden');
        document.querySelectorAll('.admin-only').forEach(el => el.classList.add('hidden'));
    }


    // Banner informativo sulle regole di privacy attive
    const banner = document.getElementById('role-accounting-banner');
    const bannerIcon = document.getElementById('role-banner-icon');
    const bannerTitle = document.getElementById('role-banner-title');
    const bannerDesc = document.getElementById('role-banner-desc');

    if (isAdmin) {
        banner.className = 'p-4 rounded-2xl border bg-gradient-to-r from-blue-50/90 to-indigo-50/90 border-blue-200/80 text-blue-950 flex items-center justify-between shadow-xs';
        bannerIcon.className = 'w-10 h-10 rounded-xl bg-gradient-to-tr from-blue-600 to-indigo-600 text-white flex items-center justify-center text-lg shrink-0 shadow-xs';
        bannerIcon.innerHTML = '<i class="fa-solid fa-user-shield"></i>';
        bannerTitle.textContent = 'Pannello Contabile Amministratore';
        bannerDesc.textContent = 'Controllo completo delle finanze: debitori in chiaro, riconciliazione quote e fatture fornitori.';

        document.getElementById('quotes-table-title').innerHTML = '<i class="fa-solid fa-list-check text-blue-600"></i> Tutte le Quote del Condominio (Vista Amministratore)';
        document.getElementById('quotes-table-subtitle').textContent = 'Elenco completo delle quote emesse per ciascun condomino con stato e opzione di saldo';

        document.getElementById('th-ticket-user').textContent = 'condomino Segnalatore';
        document.getElementById('tickets-header-desc').textContent = 'Registro di tutte le segnalazioni aperte dai Condomini del fabbricato.';
        document.getElementById('admin-ticket-status-box').classList.remove('hidden');
        document.getElementById('admin-ticket-status-box').classList.add('flex');
    } else {
        banner.className = 'p-4 rounded-2xl border bg-gradient-to-r from-emerald-50/90 to-teal-50/90 border-emerald-200/80 text-emerald-950 flex items-center justify-between shadow-xs';
        bannerIcon.className = 'w-10 h-10 rounded-xl bg-gradient-to-tr from-emerald-600 to-teal-600 text-white flex items-center justify-center text-lg shrink-0 shadow-xs';
        bannerIcon.innerHTML = '<i class="fa-solid fa-lock"></i>';
        bannerTitle.textContent = 'Area Riservata Condòmino';
        bannerDesc.textContent = 'Visualizzazione trasparente e protetta delle tue quote e delle scadenze condominiali.';

        document.getElementById('quotes-table-title').innerHTML = '<i class="fa-solid fa-wallet text-emerald-600"></i> Le Mie Quote Personali';
        document.getElementById('quotes-table-subtitle').textContent = `Quote ordinarie e straordinarie intestate a ${user.nome} (${user.unita})`;

        document.getElementById('th-ticket-user').textContent = 'Richiedente';
        document.getElementById('tickets-header-desc').textContent = 'Elenco delle tue richieste di manutenzione e stato di avanzamento.';
        document.getElementById('admin-ticket-status-box').classList.add('hidden');
    }
}

// ============================================================================
// 3. NAVIGAZIONE A SCHEDE (SPA TABS)
// ============================================================================

function switchTab(tabId) {
    state.currentTab = tabId;

    document.querySelectorAll('.tab-pane').forEach(p => p.classList.add('hidden'));
    const target = document.getElementById(`tab-${tabId}`);
    if (target) target.classList.remove('hidden');
    if (tabId === 'unita') loadUnita();

    // Gestione visibilità tasto "Torna alla Dashboard" e Breadcrumb di navigazione
    const tabNames = {
        'dashboard': 'Dashboard',
        'accounting': 'Contabilità & Finanze',
        'assemblies': 'Assemblee & Verbali',
        'communications': 'Comunicazioni & Circolari',
        'tickets': 'Segnalazioni Guasti & Manutenzioni',
        'admin-profile': 'Studio Amministratore',
        'unita': 'Unità & Tabelle Millesimali',
        'anagrafica': 'Rubrica & Anagrafica Residenti',
        'banca': 'Banca & Cassa',
        'giornale': 'Libro Giornale',
        'audit': 'Registro Log & Attività',
        'users': 'Gestione Utenti & Credenziali'
    };

    const backBtn = document.getElementById('btn-header-back-dash');
    const breadcrumbBar = document.getElementById('subpage-breadcrumb-bar');
    const breadcrumbTitle = document.getElementById('breadcrumb-current-page');

    if (tabId === 'dashboard') {
        if (backBtn) backBtn.classList.add('hidden');
        if (breadcrumbBar) breadcrumbBar.classList.add('hidden');
    } else {
        if (backBtn) backBtn.classList.remove('hidden');
        if (breadcrumbBar) breadcrumbBar.classList.remove('hidden');
        if (breadcrumbTitle) breadcrumbTitle.textContent = tabNames[tabId] || tabId;
        window.scrollTo({ top: 0, behavior: 'smooth' });
    }

    document.querySelectorAll('.tab-btn').forEach(b => {
        b.classList.remove('border-blue-600', 'text-blue-600', 'font-semibold');
        b.classList.add('border-transparent', 'text-slate-500', 'font-medium');
    });

    const activeBtn = document.getElementById(`tab-btn-${tabId}`);
    if (activeBtn) {
        activeBtn.classList.remove('border-transparent', 'text-slate-500', 'font-medium');
        activeBtn.classList.add('border-blue-600', 'text-blue-600', 'font-semibold');
    }

    if (tabId === 'accounting') loadAccountingData();
    if (tabId === 'dashboard') { loadAnagrafica(); loadTicketsBadge(); }
    else if (tabId === 'assemblies') loadAssembliesData();
    else if (tabId === 'communications') loadConvocationsLog();
    else if (tabId === 'tickets') loadTicketsData();
    else if (tabId === 'users' && state.currentUser.role === 'admin') loadUsersList();
    else if (tabId === 'anagrafica' && state.currentUser.role === 'admin') { loadAnagrafica(); loadUsersList(); loadRubrica(); }
    else if (tabId === 'banca' && state.currentUser.role === 'admin') loadBanca();
    else if (tabId === 'giornale' && state.currentUser.role === 'admin') loadGiornale();
    else if (tabId === 'audit' && state.currentUser.role === 'admin') loadAudit();
    else if (tabId === 'admin-profile') loadAdminProfile();
    
    if (typeof updateLicenseReadOnlyUI === 'function') updateLicenseReadOnlyUI();
}

// ============================================================================
// 4. AREA CONTABILE (DATI PERSONALI + PRIVACY CREDITI ANONIMIZZATI)
// ============================================================================

async function loadAccountingData() {
    loadSupplierRegistry();
    try {
        const [sumRes, quotesRes, recRes, supRes] = await Promise.all([
            fetch('/api/accounting-summary', { headers: getAuthHeaders() }),
            fetch('/api/quotes', { headers: getAuthHeaders() }),
            fetch('/api/receivables', { headers: getAuthHeaders() }),
            fetch('/api/supplier-payments', { headers: getAuthHeaders() })
        ]);

        const sumData = await sumRes.json();
        const quotesData = await quotesRes.json();
        const recData = await recRes.json();
        const supData = await supRes.json();

        // 1. KPI Cards: calcola con fallback in tempo reale basato sulle quote e fatture caricate
        let calcReceived = 0;
        let calcReceivables = 0;
        if (quotesData.success && Array.isArray(quotesData.data)) {
            calcReceived = quotesData.data.reduce((acc, q) => {
                const amt = parseFloat(q.amount) || 0;
                const paid = parseFloat(q.paid_amount);
                if (!isNaN(paid) && paid > 0) return acc + paid;
                return q.status === 'Pagato' ? acc + amt : acc;
            }, 0);
            calcReceivables = quotesData.data.reduce((acc, q) => {
                if (q.status === 'Pagato') return acc;
                const amt = parseFloat(q.amount) || 0;
                const paid = parseFloat(q.paid_amount) || 0;
                return acc + Math.max(0, Math.round((amt - paid) * 100) / 100);
            }, 0);
        } else if (recData.success && Array.isArray(recData.data)) {
            calcReceivables = recData.data.reduce((acc, r) => acc + (parseFloat(r.importo || r.amount) || 0), 0);
        }

        let calcSuppPaid = 0;
        let calcSuppDebt = 0;
        if (supData.success && Array.isArray(supData.data)) {
            calcSuppPaid = supData.data.reduce((acc, s) => {
                const amt = parseFloat(s.amount) || 0;
                const paid = parseFloat(s.paid_amount);
                if (!isNaN(paid) && paid > 0) return acc + paid;
                return s.status === 'Pagato' ? acc + amt : acc;
            }, 0);
            calcSuppDebt = supData.data.reduce((acc, s) => {
                if (s.status === 'Pagato') return acc;
                const amt = parseFloat(s.amount) || 0;
                const paid = parseFloat(s.paid_amount) || 0;
                return acc + Math.max(0, Math.round((amt - paid) * 100) / 100);
            }, 0);
        }

        const totReceived = (sumData.success && sumData.data && sumData.data.totalReceived !== undefined)
            ? Number(sumData.data.totalReceived)
            : calcReceived;

        const totReceivables = (sumData.success && sumData.data && sumData.data.totalReceivables !== undefined)
            ? Number(sumData.data.totalReceivables)
            : calcReceivables;

        const totSuppPaid = (sumData.success && sumData.data && sumData.data.totalSuppliersPaid !== undefined)
            ? Number(sumData.data.totalSuppliersPaid)
            : calcSuppPaid;

        const totSuppDebt = (sumData.success && sumData.data && sumData.data.totalSuppliersDebt !== undefined)
            ? Number(sumData.data.totalSuppliersDebt)
            : calcSuppDebt;

        document.getElementById('kpi-total-received').textContent = formatCurrency(totReceived);
        document.getElementById('kpi-total-receivables').textContent = formatCurrency(totReceivables);
        document.getElementById('kpi-suppliers-paid').textContent = formatCurrency(totSuppPaid);
        document.getElementById('kpi-suppliers-debt').textContent = formatCurrency(totSuppDebt);

        // 2. Tabella Quote (filtrata automaticamente dal backend in base al ruolo)
        if (quotesData.success) {
            state.quotes = quotesData.data;
            renderQuotesTable();
        }

        // 3. Tabella Crediti Condominiali (con nomi oscurati se condomino)
        if (recData.success) {
            state.receivables = recData.data;
            renderReceivablesTable(recData);
        }

        // 4. Tabella Fornitori (Contabilità Generale)
        if (supData.success) {
            state.suppliers = supData.data;
            renderSuppliersTable();
        }

    } catch (err) {
        console.error('Errore caricamento dati contabili:', err);
    }
}

/**
 * Renderizza la tabella delle quote (Personali per il condomino o generali per l'admin)
 */
function renderQuotesTable() {
    const tbody = document.getElementById('quotes-table-body');
    const header = document.getElementById('quotes-table-header');
    const tfoot = document.getElementById('quotes-table-footer');
    const isAdmin = state.currentUser.role === 'admin';

    // Intestazione condizionale della tabella
    if (isAdmin) {
        header.innerHTML = `
            <th class="py-3.5 px-4">Cond&ograve;mino / Unit&agrave;</th>
            <th class="py-3.5 px-4">Tipo</th>
            <th class="py-3.5 px-4">Descrizione Quota</th>
            <th class="py-3.5 px-4">Scadenza</th>
            <th class="py-3.5 px-4 text-right">Importo</th>
            <th class="py-3.5 px-4 text-right">Versato / Residuo</th>
            <th class="py-3.5 px-4 text-center">Stato</th>
            <th class="py-3.5 px-4 text-center">Azioni</th>
        `;
    } else {
        header.innerHTML = `
            <th class="py-3.5 px-4">Tipo</th>
            <th class="py-3.5 px-4">Descrizione Quota</th>
            <th class="py-3.5 px-4">Scadenza</th>
            <th class="py-3.5 px-4 text-right">Importo</th>
            <th class="py-3.5 px-4 text-right">Versato / Residuo</th>
            <th class="py-3.5 px-4 text-center">Stato</th>
            <th class="py-3.5 px-4 text-center">Data Saldo</th>
        `;
    }

    if (!state.quotes || state.quotes.length === 0) {
        tbody.innerHTML = `<tr><td colspan="${isAdmin ? 8 : 7}" class="py-8 text-center text-slate-400">Nessuna quota registrata.</td></tr>`;
        if (tfoot) tfoot.innerHTML = '';
        return;
    }

    const totalAmount = state.quotes.reduce((acc, q) => acc + (parseFloat(q.amount) || 0), 0);
    const totalPaid = state.quotes.reduce((acc, q) => {
        const amt = parseFloat(q.amount) || 0;
        const paid = parseFloat(q.paid_amount);
        if (!isNaN(paid) && paid > 0) return acc + paid;
        return q.status === 'Pagato' ? acc + amt : acc;
    }, 0);
    const totalPending = Math.max(0, Math.round((totalAmount - totalPaid) * 100) / 100);

    tbody.innerHTML = state.quotes.map(q => {
        const amt = parseFloat(q.amount) || 0;
        const paid = parseFloat(q.paid_amount) || (q.status === 'Pagato' ? amt : 0);
        const residual = q.residual !== undefined ? parseFloat(q.residual) : Math.max(0, Math.round((amt - paid) * 100) / 100);
        const isPaid = q.status === 'Pagato' || residual <= 0.009;
        const isPartial = q.status === 'Parziale' || (!isPaid && paid > 0.009);

        let badgeClass = 'bg-rose-50 text-rose-700 border-rose-200';
        let statusText = q.status || 'In sospeso';
        if (isPaid) {
            badgeClass = 'bg-emerald-50 text-emerald-700 border-emerald-200';
            statusText = 'Pagato';
        } else if (isPartial) {
            badgeClass = 'bg-amber-50 text-amber-700 border-amber-200';
            statusText = '<i class="fa-solid fa-hourglass-half mr-1 text-[10px]"></i>Parziale';
        }

        const isOrd = q.type === 'ordinaria';
        const typeBadge = isOrd ? '<span class="px-2 py-0.5 rounded text-[11px] font-bold bg-blue-50 text-blue-700">Ordinaria</span>' : '<span class="px-2 py-0.5 rounded text-[11px] font-bold bg-purple-50 text-purple-700">Straordinaria</span>';
        const displayUnita = q.unita || q.condomino_unita || '';

        const versatoResiduoCell = `
            <td class="py-3.5 px-4 text-right text-xs">
                <div class="font-bold text-emerald-600">${formatCurrency(paid)}</div>
                <div class="text-[11px] ${residual > 0.009 ? 'text-rose-500 font-semibold' : 'text-slate-400'}">Res. ${formatCurrency(residual)}</div>
            </td>
        `;

        if (isAdmin) {
            let payAction = '';
            if (isPaid) {
                payAction = `
                    <button onclick="openPaymentModal('quote', ${q.id})" class="px-2 py-1 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 rounded-lg text-xs font-bold no-print" title="Visualizza dettagli e storico versamenti"><i class="fa-solid fa-receipt mr-1"></i>Saldata</button>
                    <button onclick="sendReceipt(${q.id})" class="ml-1 px-2.5 py-1 bg-blue-500 hover:bg-blue-600 text-white rounded-lg text-xs font-bold shadow-2xs no-print" title="Invia Ricevuta via Email"><i class="fa-solid fa-envelope"></i> Ricevuta</button>
                `;
            } else {
                payAction = `
                    <button onclick="openPaymentModal('quote', ${q.id})" class="px-2.5 py-1 ${isPartial ? 'bg-amber-600 hover:bg-amber-700' : 'bg-emerald-600 hover:bg-emerald-700'} text-white rounded-lg text-xs font-bold shadow-2xs no-print" title="${isPartial ? 'Registra ulteriore acconto o saldo' : 'Registra incasso o acconto'}">
                        <i class="fa-solid fa-money-bill-wave mr-1"></i>${isPartial ? 'Acconto / Saldo' : 'Incassa'}
                    </button>
                    <button onclick="sendReminder(${q.id})" class="ml-1 px-2.5 py-1 bg-rose-500 hover:bg-rose-600 text-white rounded-lg text-xs font-bold shadow-2xs no-print" title="Invia Sollecito di Pagamento"><i class="fa-solid fa-bell"></i> Sollecito</button>
                `;
            }
            
            payAction += ` <button onclick="editQuote(${q.id})" class="ml-1 px-2 py-1 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-lg text-xs font-bold no-print" title="Modifica rata"><i class="fa-solid fa-pen"></i></button>`;

            return `
                <tr class="hover:bg-slate-50 transition-colors">
                    <td class="py-3.5 px-4">
                        <div class="font-bold text-slate-900">${q.persona_cognome ? q.persona_cognome + ' ' + (q.persona_nome || '') : (q.condomino_nome || 'Sconosciuto')}</div>
                        <div class="text-xs text-slate-500">${displayUnita}</div>
                    </td>
                    <td class="py-3.5 px-4">${typeBadge}</td>
                    <td class="py-3.5 px-4 font-medium text-slate-900">${q.title}</td>
                    <td class="py-3.5 px-4 text-xs text-slate-500">${formatDate(q.due_date)}</td>
                    <td class="py-3.5 px-4 text-right font-bold text-slate-900">${formatCurrency(amt)}</td>
                    ${versatoResiduoCell}
                    <td class="py-3.5 px-4 text-center"><span class="px-2.5 py-0.5 rounded-full text-xs font-bold border ${badgeClass}">${statusText}</span></td>
                    <td class="py-3.5 px-4 text-center whitespace-nowrap">${payAction}</td>
                </tr>
            `;
        } else {
            return `
                <tr class="hover:bg-slate-50 transition-colors">
                    <td class="py-3.5 px-4">${typeBadge}</td>
                    <td class="py-3.5 px-4 font-medium text-slate-900">${q.title}</td>
                    <td class="py-3.5 px-4 text-xs text-slate-500">${formatDate(q.due_date)}</td>
                    <td class="py-3.5 px-4 text-right font-bold text-slate-900">${formatCurrency(amt)}</td>
                    ${versatoResiduoCell}
                    <td class="py-3.5 px-4 text-center"><span class="px-2.5 py-0.5 rounded-full text-xs font-bold border ${badgeClass}">${statusText}</span></td>
                    <td class="py-3.5 px-4 text-center text-xs text-slate-500">${q.payment_date ? formatDate(q.payment_date) : (isPartial ? '<span class="text-amber-600 font-semibold">Parzialmente versato</span>' : '<span class="italic text-slate-400">In attesa</span>')}</td>
                </tr>
            `;
        }
    }).join('');

    // Calcolo riga totale in fondo alla tabella Quote
    if (tfoot) {
        if (isAdmin) {
            tfoot.innerHTML = `
                <tr class="bg-slate-50 border-t-2 border-slate-300 font-bold text-xs text-slate-700">
                    <td colspan="4" class="py-3.5 px-4">
                        <div class="flex flex-wrap items-center gap-2">
                            <span>TOTALE QUOTE (${state.quotes.length}):</span>
                            <span class="inline-flex items-center text-[11px] font-bold text-emerald-800 bg-emerald-100/90 border border-emerald-200 px-2 py-0.5 rounded-full">
                                <i class="fa-solid fa-check-double mr-1 text-[10px]"></i> Incassate: ${formatCurrency(totalPaid)}
                            </span>
                            <span class="inline-flex items-center text-[11px] font-bold text-amber-800 bg-amber-100/90 border border-amber-200 px-2 py-0.5 rounded-full">
                                <i class="fa-solid fa-clock mr-1 text-[10px]"></i> Da Riscuotere: ${formatCurrency(totalPending)}
                            </span>
                        </div>
                    </td>
                    <td class="py-3.5 px-4 text-right font-extrabold text-slate-900 text-sm">${formatCurrency(totalAmount)}</td>
                    <td class="py-3.5 px-4 text-right text-xs">
                        <div class="font-bold text-emerald-600">${formatCurrency(totalPaid)}</div>
                        <div class="text-[11px] text-rose-500 font-bold">Res. ${formatCurrency(totalPending)}</div>
                    </td>
                    <td colspan="2"></td>
                </tr>
            `;
        } else {
            tfoot.innerHTML = `
                <tr class="bg-slate-50 border-t-2 border-slate-300 font-bold text-xs text-slate-700">
                    <td colspan="3" class="py-3.5 px-4">
                        <div class="flex flex-wrap items-center gap-2">
                            <span>TOTALE TUE QUOTE:</span>
                            <span class="inline-flex items-center text-[11px] font-bold text-emerald-800 bg-emerald-100 px-2 py-0.5 rounded-full">Saldate: ${formatCurrency(totalPaid)}</span>
                            <span class="inline-flex items-center text-[11px] font-bold text-amber-800 bg-amber-100 px-2 py-0.5 rounded-full">Da Saldare: ${formatCurrency(totalPending)}</span>
                        </div>
                    </td>
                    <td class="py-3.5 px-4 text-right font-extrabold text-slate-900 text-sm">${formatCurrency(totalAmount)}</td>
                    <td class="py-3.5 px-4 text-right text-xs">
                        <div class="font-bold text-emerald-600">${formatCurrency(totalPaid)}</div>
                        <div class="text-[11px] text-rose-500 font-bold">Res. ${formatCurrency(totalPending)}</div>
                    </td>
                    <td colspan="2"></td>
                </tr>
            `;
        }
    }
}

/**
 * Renderizza la tabella dei crediti/debiti con gestione della Privacy
 */
function renderReceivablesTable(recData) {
    const tbody = document.getElementById('receivables-table-body');
    const tfoot = document.getElementById('receivables-table-footer');
    const badgeContainer = document.getElementById('privacy-badge-container');
    const isAdmin = state.currentUser.role === 'admin';

    // Badge Privacy / Trasparenza
    if (isAdmin) {
        badgeContainer.innerHTML = `
            <span class="px-3 py-1 rounded-full text-xs font-bold bg-blue-100 text-blue-800 border border-blue-200">
                <i class="fa-solid fa-eye mr-1"></i> Nominativi in Chiaro (Vista Admin)
            </span>
        `;
    } else {
        badgeContainer.innerHTML = `
            <span class="px-3 py-1 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">
                <i class="fa-solid fa-user-secret mr-1"></i> Nominativi Anonimizzati dal Backend (Privacy Tutelata)
            </span>
        `;
    }

    if (!recData.data || recData.data.length === 0) {
        tbody.innerHTML = `<tr><td colspan="7" class="py-8 text-center text-slate-400">Nessun credito in sospeso. Tutti i Condomini sono in regola!</td></tr>`;
        if (tfoot) tfoot.innerHTML = '';
        return;
    }

    const sumReceivables = recData.data.reduce((acc, r) => acc + (parseFloat(r.importo || r.amount) || 0), 0);

    tbody.innerHTML = recData.data.map(r => {
        const isOwn = r.is_my_quote;
        const nameClass = isOwn ? 'font-bold text-amber-700 bg-amber-50 px-2 py-0.5 rounded' : 'font-medium text-slate-700';

        const residual = parseFloat(r.importo || r.amount) || 0;
        const total = parseFloat(r.importo_totale) || (residual + (parseFloat(r.importo_versato) || 0));
        const paid = parseFloat(r.importo_versato) || 0;
        const isPartial = r.status === 'Parziale' || paid > 0.009;

        const statusBadge = isPartial
            ? `<span class="px-2.5 py-0.5 rounded-full text-xs font-bold bg-amber-50 text-amber-700 border border-amber-200" title="Già versati € ${paid.toFixed(2)}"><i class="fa-solid fa-hourglass-half mr-1 text-[10px]"></i>Parziale</span>`
            : `<span class="px-2.5 py-0.5 rounded-full text-xs font-bold bg-rose-50 text-rose-700 border border-rose-200">In sospeso</span>`;

        let actionHtml = '-';
        if (isAdmin) {
            actionHtml = `
                <div class="flex items-center justify-center gap-1.5 no-print">
                    <button onclick="openPaymentModal('quote', ${r.id})" class="px-2.5 py-1 ${isPartial ? 'bg-amber-600 hover:bg-amber-700' : 'bg-emerald-600 hover:bg-emerald-700'} text-white rounded-lg text-xs font-bold shadow-2xs" title="Registra incasso o acconto">
                        <i class="fa-solid fa-money-bill-wave mr-1"></i>${isPartial ? 'Acconto / Saldo' : 'Incassa'}
                    </button>
                    <button onclick="editQuote(${r.id})" class="p-1.5 text-slate-400 hover:text-amber-600 rounded-lg" title="Modifica rata"><i class="fa-solid fa-pen"></i></button>
                </div>
            `;
        }

        return `
            <tr class="hover:bg-slate-50 transition-colors ${isOwn ? 'bg-amber-50/30' : ''}">
                <td class="py-3.5 px-4">
                    <span class="${nameClass}">
                        ${isOwn ? '<i class="fa-solid fa-user mr-1 text-amber-600"></i>' : '<i class="fa-solid fa-user-shield mr-1 text-slate-400"></i>'}
                        ${r.debitore}
                    </span>
                </td>
                <td class="py-3.5 px-4 text-xs text-slate-600">${r.unita}</td>
                <td class="py-3.5 px-4 text-xs font-medium text-slate-800">${r.titolo_quota}</td>
                <td class="py-3.5 px-4 text-xs text-slate-500">${formatDate(r.scadenza)}</td>
                <td class="py-3.5 px-4 text-right">
                    <div class="font-bold text-rose-600 text-sm">${formatCurrency(residual)}</div>
                    ${isPartial ? `<div class="text-[11px] text-slate-400">Tot: ${formatCurrency(total)} (Vers: ${formatCurrency(paid)})</div>` : ''}
                </td>
                <td class="py-3.5 px-4 text-center">${statusBadge}</td>
                <td class="py-3.5 px-4 text-center">${actionHtml}</td>
            </tr>
        `;
    }).join('');

    // Calcolo riga totale in fondo alla tabella Crediti da Riscuotere
    if (tfoot) {
        tfoot.innerHTML = `
            <tr class="bg-amber-50/70 border-t-2 border-amber-200 font-bold text-xs">
                <td colspan="4" class="py-3.5 px-4 text-amber-900 flex items-center gap-2">
                    <i class="fa-solid fa-calculator text-amber-600"></i>
                    <span>TOTALE CREDITI DA RISCUOTERE (${recData.data.length} quote insolute o parziali):</span>
                </td>
                <td class="py-3.5 px-4 text-right font-black text-rose-600 text-sm">${formatCurrency(sumReceivables)}</td>
                <td class="py-3.5 px-4 text-center text-xs text-amber-800">In sospeso</td>
                <td></td>
            </tr>
        `;
    }
}

function renderSuppliersTable() {
    const tbody = document.getElementById('suppliers-table-body');
    const tfoot = document.getElementById('suppliers-table-footer');
    const isAdmin = state.currentUser.role === 'admin';
    if (!state.suppliers || state.suppliers.length === 0) {
        tbody.innerHTML = `<tr><td colspan="9" class="py-8 text-center text-slate-400">Nessuna fattura registrata.</td></tr>`;
        if (tfoot) tfoot.innerHTML = '';
        return;
    }

    const totInvoices = state.suppliers.reduce((acc, s) => acc + (parseFloat(s.amount) || 0), 0);
    const totPaid = state.suppliers.reduce((acc, s) => {
        const amt = parseFloat(s.amount) || 0;
        const paid = parseFloat(s.paid_amount);
        if (!isNaN(paid) && paid > 0) return acc + paid;
        return s.status === 'Pagato' ? acc + amt : acc;
    }, 0);
    const totResidual = Math.max(0, Math.round((totInvoices - totPaid) * 100) / 100);

    tbody.innerHTML = state.suppliers.map(s => {
        const totalAmount = parseFloat(s.amount) || 0;
        const paidAmount = parseFloat(s.paid_amount) || (s.status === 'Pagato' ? totalAmount : 0);
        const residual = s.residual !== undefined ? parseFloat(s.residual) : Math.max(0, Math.round((totalAmount - paidAmount) * 100) / 100);
        const isPaid = s.status === 'Pagato' || residual <= 0.009;
        const isPartial = s.status === 'Parziale' || (!isPaid && paidAmount > 0.009);

        let badge = '<span class="px-2.5 py-0.5 rounded-full text-xs font-bold bg-rose-50 text-rose-700 border border-rose-200">Da Liquidare</span>';
        if (isPaid) {
            badge = '<span class="px-2.5 py-0.5 rounded-full text-xs font-bold bg-blue-50 text-blue-700 border border-blue-200">Pagato</span>';
        } else if (isPartial) {
            badge = `<span class="px-2.5 py-0.5 rounded-full text-xs font-bold bg-amber-50 text-amber-700 border border-amber-200" title="Residuo: ${formatCurrency(residual)}"><i class="fa-solid fa-hourglass-half mr-1 text-[10px]"></i>Parziale</span>`;
        }

        let actionHtml = '-';
        if (isAdmin) {
            if (isPaid) {
                actionHtml = `
                    <div class="flex items-center justify-center gap-1.5 no-print">
                        <button onclick="openPaymentModal('supplier', ${s.id})" class="px-2 py-1 bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 rounded-lg text-xs font-bold no-print" title="Visualizza dettagli e storico pagamenti"><i class="fa-solid fa-receipt mr-1"></i>Liquidata</button>
                        <button onclick="editSupplier(${s.id})" class="p-1.5 text-slate-400 hover:text-amber-600 rounded-lg" title="Modifica"><i class="fa-solid fa-pen"></i></button>
                    </div>
                `;
            } else {
                actionHtml = `
                    <div class="flex items-center justify-center gap-1.5 no-print">
                        <button onclick="openPaymentModal('supplier', ${s.id})" class="px-2.5 py-1 ${isPartial ? 'bg-amber-600 hover:bg-amber-700' : 'bg-indigo-600 hover:bg-indigo-700'} text-white rounded-lg text-xs font-bold shadow-2xs" title="${isPartial ? 'Registra ulteriore acconto o saldo' : 'Liquida fattura o versa acconto'}">
                            <i class="fa-solid fa-money-bill-wave mr-1"></i>${isPartial ? 'Acconto / Saldo' : 'Liquida'}
                        </button>
                        <button onclick="editSupplier(${s.id})" class="p-1.5 text-slate-400 hover:text-amber-600 rounded-lg" title="Modifica"><i class="fa-solid fa-pen"></i></button>
                    </div>
                `;
            }
        }

        return `
            <tr class="hover:bg-slate-50 transition-colors">
                <td class="py-3.5 px-4 font-bold text-slate-900">${s.supplier_name}</td>
                <td class="py-3.5 px-4"><span class="px-2 py-0.5 rounded text-xs bg-slate-100">${s.category}</span></td>
                <td class="py-3.5 px-4 font-mono text-xs text-slate-600">${s.invoice_number || '-'}</td>
                <td class="py-3.5 px-4 text-xs text-slate-500">${formatDate(s.payment_date)}</td>
                <td class="py-3.5 px-4 text-right font-bold text-slate-900">${formatCurrency(totalAmount)}</td>
                <td class="py-3.5 px-4 text-right text-xs">
                    <div class="font-bold text-emerald-600">${formatCurrency(paidAmount)}</div>
                    <div class="text-[11px] ${residual > 0.009 ? 'text-rose-500 font-semibold' : 'text-slate-400'}">Res. ${formatCurrency(residual)}</div>
                </td>
                <td class="py-3.5 px-4 text-center">${badge}</td>
                <td class="py-3.5 px-4 text-xs text-slate-500 max-w-xs truncate" title="${s.notes || ''}">${s.notes || '-'}</td>
                <td class="py-3.5 px-4 text-center whitespace-nowrap">${actionHtml}</td>
            </tr>
        `;
    }).join('');

    if (tfoot) {
        tfoot.innerHTML = `
            <tr class="bg-slate-50 border-t-2 border-slate-300 font-bold text-xs text-slate-700">
                <td colspan="4" class="py-3.5 px-4">
                    <div class="flex flex-wrap items-center gap-2">
                        <span>FATTURE FORNITORI (${state.suppliers.length}):</span>
                        <span class="inline-flex items-center text-[11px] font-bold text-blue-800 bg-blue-100 border border-blue-200 px-2 py-0.5 rounded-full">
                            <i class="fa-solid fa-check mr-1 text-[10px]"></i> Liquidato: ${formatCurrency(totPaid)}
                        </span>
                        <span class="inline-flex items-center text-[11px] font-bold text-rose-800 bg-rose-100 border border-rose-200 px-2 py-0.5 rounded-full">
                            <i class="fa-solid fa-clock mr-1 text-[10px]"></i> Da Saldare: ${formatCurrency(totResidual)}
                        </span>
                    </div>
                </td>
                <td class="py-3.5 px-4 text-right font-extrabold text-slate-900 text-sm">${formatCurrency(totInvoices)}</td>
                <td class="py-3.5 px-4 text-right text-xs">
                    <div class="font-bold text-emerald-600">${formatCurrency(totPaid)}</div>
                    <div class="text-[11px] text-rose-500 font-bold">Res. ${formatCurrency(totResidual)}</div>
                </td>
                <td colspan="3"></td>
            </tr>
        `;
    }
}

// ============================================================================
// GESTIONE MODALE REGISTRAZIONE PAGAMENTO / ACCONTO / SALDO
// ============================================================================

let currentPaymentResidual = 0;

function openPaymentModal(type, id) {
    if (typeof isLicenseReadOnly === 'function' && isLicenseReadOnly()) {
        showToast("Condominio in Sola Lettura: registrazione pagamenti bloccata.", "warning");
        return;
    }

    let item = null;
    if (type === 'quote') {
        item = (state.quotes || []).find(q => q.id === id) || (state.receivables || []).find(r => r.id === id);
    } else if (type === 'supplier') {
        item = (state.suppliers || []).find(s => s.id === id);
    }

    if (!item) {
        showToast('Elemento contabile non trovato.', 'error');
        return;
    }

    const amount = parseFloat(item.amount || item.importo_totale || item.importo || 0);
    const paidAmount = parseFloat(item.paid_amount || item.importo_versato || 0);
    const residual = item.residual !== undefined 
        ? parseFloat(item.residual) 
        : Math.max(0, Math.round((amount - paidAmount) * 100) / 100);

    currentPaymentResidual = residual > 0 ? residual : amount;

    document.getElementById('record-payment-type').value = type;
    document.getElementById('record-payment-id').value = id;

    const modalTitle = document.getElementById('record-payment-title');
    const modalSubtitle = document.getElementById('record-payment-subtitle');
    const typeLabel = document.getElementById('record-payment-type-label');
    const subjectEl = document.getElementById('record-payment-subject');
    const descEl = document.getElementById('record-payment-desc');
    const statusBadge = document.getElementById('record-payment-status-badge');
    const iconEl = document.getElementById('record-payment-icon');

    if (type === 'quote') {
        modalTitle.textContent = 'Registra Incasso Quota Condominiale';
        modalSubtitle.textContent = 'Incasso da condomino (saldo o acconto parziale)';
        typeLabel.textContent = 'Condòmino / Unità';
        iconEl.className = 'fa-solid fa-money-bill-wave text-emerald-600';
        
        const condName = item.persona_cognome 
            ? `${item.persona_cognome} ${item.persona_nome || ''}` 
            : (item.condomino_nome || item.debitore || 'Condòmino');
        subjectEl.textContent = condName;
        descEl.textContent = `${item.title || item.titolo_quota || 'Quota'} — ${item.unita || item.condomino_unita || ''}`;
        
        document.getElementById('record-payment-notes').value = `Incasso quota da ${condName}`;
    } else {
        modalTitle.textContent = 'Registra Pagamento Fattura Fornitore';
        modalSubtitle.textContent = 'Pagamento fattura fornitore (saldo o acconto)';
        typeLabel.textContent = 'Fornitore / Fattura';
        iconEl.className = 'fa-solid fa-file-invoice-dollar text-indigo-600';

        subjectEl.textContent = item.supplier_name || 'Fornitore';
        descEl.textContent = `Fattura: ${item.invoice_number || 'N/D'} — Categoria: ${item.category || '-'}`;

        document.getElementById('record-payment-notes').value = `Pagamento fattura ${item.invoice_number || ''} ${item.supplier_name || ''}`.trim();
    }

    // Totali nella scheda
    document.getElementById('record-payment-total').textContent = formatCurrency(amount);
    document.getElementById('record-payment-already-paid').textContent = formatCurrency(paidAmount);
    document.getElementById('record-payment-residual').textContent = formatCurrency(residual);

    if (item.status === 'Pagato') {
        statusBadge.className = 'px-2.5 py-1 text-xs font-bold rounded-lg bg-emerald-100 text-emerald-800';
        statusBadge.textContent = 'Pagato';
    } else if (item.status === 'Parziale' || paidAmount > 0.009) {
        statusBadge.className = 'px-2.5 py-1 text-xs font-bold rounded-lg bg-amber-100 text-amber-800';
        statusBadge.textContent = 'Parziale';
    } else {
        statusBadge.className = 'px-2.5 py-1 text-xs font-bold rounded-lg bg-rose-100 text-rose-800';
        statusBadge.textContent = item.status || 'In sospeso';
    }

    // Amount input default
    const amountInput = document.getElementById('record-payment-amount');
    amountInput.value = currentPaymentResidual > 0 ? currentPaymentResidual.toFixed(2) : amount.toFixed(2);
    document.getElementById('record-payment-date').value = new Date().toISOString().slice(0, 10);
    document.getElementById('record-payment-journal').checked = true;

    updatePaymentCalcHint();

    // Listener dinamico per l'importo
    amountInput.oninput = updatePaymentCalcHint;

    // Storico pagamenti
    const historyContainer = document.getElementById('record-payment-history-container');
    const historyList = document.getElementById('record-payment-history-list');
    let history = [];
    if (item.payment_history) {
        try {
            history = typeof item.payment_history === 'string' ? JSON.parse(item.payment_history) : item.payment_history;
        } catch (e) {
            history = [];
        }
    }

    if (Array.isArray(history) && history.length > 0) {
        historyContainer.classList.remove('hidden');
        historyList.innerHTML = history.map((h) => `
            <div class="flex items-center justify-between text-xs py-1.5 border-b border-slate-200/60 last:border-b-0">
                <div>
                    <span class="font-bold text-emerald-700">${formatCurrency(h.amount)}</span>
                    <span class="text-slate-400 ml-1.5">${formatDate(h.date)}</span>
                    ${h.method ? `<span class="ml-1 text-[10px] text-slate-500 bg-slate-200/60 px-1.5 py-0.5 rounded font-medium">${h.method}</span>` : ''}
                </div>
                <div class="text-[11px] text-slate-500 italic max-w-[180px] truncate" title="${h.notes || ''}">
                    ${h.notes || 'Versamento'}
                </div>
            </div>
        `).join('');
    } else {
        historyContainer.classList.add('hidden');
        historyList.innerHTML = '';
    }

    document.getElementById('modal-record-payment').classList.remove('hidden');
}

function closeRecordPaymentModal() {
    const modal = document.getElementById('modal-record-payment');
    if (modal) modal.classList.add('hidden');
}

function setQuickPaymentAmount(mode) {
    const input = document.getElementById('record-payment-amount');
    if (!input) return;
    if (mode === 'full') {
        input.value = currentPaymentResidual > 0 ? currentPaymentResidual.toFixed(2) : '0.00';
    } else if (mode === 'half') {
        const half = Math.round((currentPaymentResidual / 2) * 100) / 100;
        input.value = half > 0 ? half.toFixed(2) : '0.00';
    }
    updatePaymentCalcHint();
}

function updatePaymentCalcHint() {
    const val = parseFloat(document.getElementById('record-payment-amount')?.value) || 0;
    const hint = document.getElementById('record-payment-calc-hint');
    if (!hint) return;
    if (val <= 0) {
        hint.innerHTML = 'Inserisci l\'importo dell\'acconto o premi "Saldo Totale".';
        hint.className = 'text-[11px] text-slate-400 mt-1';
    } else if (val >= currentPaymentResidual - 0.009) {
        hint.innerHTML = '<span class="text-emerald-600 font-semibold"><i class="fa-solid fa-circle-check mr-1"></i>Questo importo salderà completamente il documento (Stato: Pagato).</span>';
    } else {
        const rem = Math.max(0, Math.round((currentPaymentResidual - val) * 100) / 100);
        hint.innerHTML = `<span class="text-amber-600 font-semibold"><i class="fa-solid fa-hourglass-half mr-1"></i>Acconto parziale registrato. Residuo rimanente: <strong>${formatCurrency(rem)}</strong> (Stato: Parziale).</span>`;
    }
}

async function handleConfirmPayment(event) {
    event.preventDefault();
    if (typeof isLicenseReadOnly === 'function' && isLicenseReadOnly()) {
        showToast("Condominio in Sola Lettura: registrazione pagamenti bloccata.", "warning");
        return;
    }

    const type = document.getElementById('record-payment-type').value;
    const id = document.getElementById('record-payment-id').value;
    const payment_amount = parseFloat(document.getElementById('record-payment-amount').value);
    const payment_date = document.getElementById('record-payment-date').value;
    const payment_method = document.getElementById('record-payment-method').value;
    const notes = document.getElementById('record-payment-notes').value.trim();
    const create_journal_entry = document.getElementById('record-payment-journal').checked;

    if (!payment_amount || payment_amount <= 0) {
        showToast('Inserisci un importo valido maggiore di zero.', 'warning');
        return;
    }

    const url = type === 'quote' ? `/api/quotes/${id}/pay` : `/api/supplier-payments/${id}/pay`;
    const btn = document.getElementById('btn-submit-record-payment');
    if (btn) {
        btn.disabled = true;
        btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin mr-1.5"></i>Registrazione...';
    }

    try {
        const res = await fetch(url, {
            method: 'POST',
            headers: {
                ...getAuthHeaders(),
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                payment_amount,
                payment_date,
                payment_method,
                notes,
                create_journal_entry
            })
        });
        const data = await res.json();
        if (res.ok && data.success) {
            showToast(data.message || 'Pagamento registrato con successo!', 'success');
            closeRecordPaymentModal();
            await loadAccountingData();
            if (typeof loadGiornale === 'function') loadGiornale();
        } else {
            showToast(data.message || 'Errore nella registrazione del pagamento.', 'error');
        }
    } catch (err) {
        console.error('Errore pagamento:', err);
        showToast('Errore di connessione durante la registrazione del pagamento.', 'error');
    } finally {
        if (btn) {
            btn.disabled = false;
            btn.innerHTML = '<i class="fa-solid fa-check mr-1.5"></i>Registra Pagamento';
        }
    }
}

async function markQuoteAsPaid(quoteId) {
    openPaymentModal('quote', quoteId);
}


// ============================================================================
// 5. PANNELLO GESTIONE UTENTI (ESCLUSIVO AMMINISTRATORE)
// ============================================================================


async function loadUsersList() {
    loadRubrica();

    if (state.currentUser.role !== 'admin') {
        showToast('Devi essere amministratore per vedere questa pagina', 'error');
        return;
    }

    try {
        const res = await fetch('/api/users', { headers: getAuthHeaders() });
        const data = await res.json();

        if (res.ok && data.success) {
            state.users = data.data;
            if (state.users.length === 0) {
                document.getElementById('users-table-body').innerHTML = '<tr><td colspan="7" class="text-center p-4">Nessun utente trovato nel database (Array vuoto)</td></tr>';
            } else {
                renderUsersTable(); loadSecurityLogs();
                populateQuoteUsersSelect(); populateCommUsersSelect();
            }
        } else {
            showToast('Errore API Users: ' + (data.message || 'Sconosciuto'), 'error');
            document.getElementById('users-table-body').innerHTML = '<tr><td colspan="7" class="text-center p-4 text-rose-500">Errore Server: ' + (data.message || JSON.stringify(data)) + '</td></tr>';
        }
    } catch (err) {
        showToast('Errore di connessione a /api/users', 'error');
        document.getElementById('users-table-body').innerHTML = '<tr><td colspan="7" class="text-center p-4 text-rose-500">Errore Fetch: ' + err.message + '</td></tr>';
        console.error('Errore caricamento lista utenti:', err);
    }
}


function renderUsersTable() {
    const tbody = document.getElementById('users-table-body');
    if (!tbody) return;

    
    try {
        tbody.innerHTML = state.users.map(u => {
            const isAdmin = u.role === 'admin';
            
            let privacyBadge = '<span class="text-xs text-slate-400 italic">N/D</span>';
            if (!isAdmin) {
                if (u.privacy_accepted) {
                    privacyBadge = `<span title="Accettata il ${formatDate(u.privacy_accepted_at)}" class="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-200"><i class="fa-solid fa-check mr-1"></i> Accettata</span>`;
                } else {
                    privacyBadge = `<span class="px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-100 text-rose-800 border border-rose-200"><i class="fa-solid fa-clock mr-1"></i> In attesa</span>`;
                }
            } else {
                privacyBadge = '<span class="text-[10px] text-slate-400">Admin</span>';
            }
            
            const roleBadge = isAdmin
                ? '<span class="px-2 py-0.5 rounded-full text-xs font-bold bg-blue-100 text-blue-800">Amministratore</span>'
                : '<span class="px-2 py-0.5 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800">condomino</span>';
    
            return `
                <tr class="hover:bg-slate-50 transition-colors">
                    <td class="py-3.5 px-4 font-bold text-slate-900">${u.nome || 'Sconosciuto'}</td>
                    <td class="py-3.5 px-4 text-xs text-slate-600 font-mono">${u.email || '-'}</td>
                    <td class="py-3.5 px-4 text-xs text-slate-700">${u.telefono || '-'}</td>
                    <td class="py-3.5 px-4 text-xs text-slate-700">${u.unita || '-'}</td>
                    <td class="py-3.5 px-4 text-xs text-slate-700">${u.dati_catastali || '-'}</td>
                    <td class="py-3.5 px-4 text-center">${privacyBadge}</td>
                      <td class="py-3.5 px-4 text-center">${roleBadge}</td>
                    <td class="py-3.5 px-4 text-xs text-slate-400">${formatDate(u.created_at)}
            ${state.currentUser.role === 'admin' ? `<button onclick="editUser(${u.id})" class="ml-2 text-amber-500 no-print"><i class="fa-solid fa-pen"></i></button> <button onclick="deleteUser(${u.id})" class="ml-1 text-rose-500 no-print"><i class="fa-solid fa-trash"></i></button>` : ''}
        </td>
                </tr>
            `;
        }).join('');
    } catch(e) {
        tbody.innerHTML = '<tr><td colspan="7" class="text-rose-500 p-4">Errore rendering JS: ' + e.message + '</td></tr>';
        console.error(e);
    }

}

async function populateQuoteUsersSelect() {
    const selPersona = document.getElementById('quote-persona-id');
    const selUnita = document.getElementById('quote-unita-id');
    
    // Fetch if missing
    if (!state.anagraficaPersone) {
        try {
            const res = await fetch('/api/anagrafica-persone', { headers: getAuthHeaders() });
            const data = await res.json();
            if (data.success) state.anagraficaPersone = data.data;
        } catch(e) {}
    }
    if (!state.unitaList) {
        try {
            const res = await fetch('/api/unita', { headers: getAuthHeaders() });
            const data = await res.json();
            if (data.success) state.unitaList = data.data;
        } catch(e) {}
    }

    if (selPersona && state.anagraficaPersone) {
        selPersona.innerHTML = '<option value="">-- Seleziona Intestatario --</option>' + 
            state.anagraficaPersone.map(p => `<option value="${p.id}">${p.cognome} ${p.nome}</option>`).join('');
    }
    
    if (selUnita && state.unitaList) {
        selUnita.innerHTML = '<option value="">-- Nessuna Unità Specifica --</option>' + 
            state.unitaList.map(u => `<option value="${u.id}">${u.identificativo} (${u.tipo})</option>`).join('');
    }
}

function updateTicketsBadge() {
    const openTickets = (state.tickets || []).filter(t => t.status !== 'Risolto' && t.status !== 'Chiuso' && t.status !== 'Risolta');
    const openCount = openTickets.length;
    
    // Badge conteggio storico (se presente)
    const badge = document.getElementById('open-tickets-badge');
    if (badge) badge.textContent = openCount;

    // Lampeggio Card "Segnalazioni Guasti" nella Dashboard
    const ticketCard = document.getElementById('dash-card-tickets');
    const ticketIcon = document.getElementById('dash-card-tickets-icon');
    const ticketAlertBadge = document.getElementById('dash-ticket-alert-badge');
    const ticketCountText = document.getElementById('dash-ticket-count-text');
    const ticketActionText = document.getElementById('dash-ticket-action-text');

    if (ticketCard) {
        if (openCount > 0) {
            ticketCard.classList.add('ticket-blinking-alert');
            if (ticketIcon) ticketIcon.classList.add('ticket-icon-blink');
            if (ticketAlertBadge) {
                ticketAlertBadge.classList.remove('hidden');
                ticketAlertBadge.classList.add('inline-flex');
            }
            if (ticketCountText) {
                ticketCountText.textContent = openCount === 1 ? '1 GUASTO ATTIVO' : `${openCount} GUASTI ATTIVI`;
            }
            if (ticketActionText) {
                ticketActionText.innerHTML = '<span class="text-rose-600 flex items-center gap-1.5"><i class="fa-solid fa-triangle-exclamation text-xs animate-bounce"></i> Intervento Richiesto</span>';
            }
        } else {
            ticketCard.classList.remove('ticket-blinking-alert');
            if (ticketIcon) ticketIcon.classList.remove('ticket-icon-blink');
            if (ticketAlertBadge) {
                ticketAlertBadge.classList.add('hidden');
                ticketAlertBadge.classList.remove('inline-flex');
            }
            if (ticketActionText) {
                ticketActionText.innerHTML = '<span>Apri segnalazione</span>';
            }
        }
    }
}

async function loadTicketsBadge() {
    try {
        const res = await fetch('/api/tickets', { headers: getAuthHeaders() });
        const data = await res.json();
        if (data.success) {
            state.tickets = data.data;
            updateTicketsBadge();
        }
    } catch (_) {}
}

function openNewTicketModal() { 
    if (typeof isLicenseReadOnly === 'function' && isLicenseReadOnly()) {
        showToast("Condominio in Sola Lettura: apertura segnalazioni bloccata.", "warning");
        return;
    }
    document.getElementById('modal-new-ticket').classList.remove('hidden'); 
}
function closeNewTicketModal() { document.getElementById('modal-new-ticket').classList.add('hidden'); }


// ============================================================================
// GESTIONE TICKETS (Ripristino)
// ============================================================================

async function loadTicketsData() {
    try {
        const res = await fetch('/api/tickets', { headers: getAuthHeaders() });
        const data = await res.json();
        if (data.success) {
            state.tickets = data.data;
            renderTicketsTable();
            updateTicketsBadge();
        } else {
            showToast(data.message || 'Errore nel caricamento tickets.', 'error');
        }
    } catch (e) {
        console.error(e);
        showToast('Errore di connessione durante il caricamento dei ticket.', 'error');
    }
}

function renderTicketsTable() {
    const tbody = document.getElementById('tickets-table-body');
    if (!tbody) return;

    const thUser = document.getElementById('th-ticket-user');
    const isAdmin = state.currentUser && state.currentUser.role === 'admin';

    if (thUser) {
        if (isAdmin) {
            thUser.classList.remove('hidden');
        } else {
            thUser.classList.add('hidden');
        }
    }

    if (!state.tickets || state.tickets.length === 0) {
        const colSpan = isAdmin ? 8 : 7;
        tbody.innerHTML = `<tr><td colspan="${colSpan}" class="text-center py-4 text-slate-500">Nessuna segnalazione presente.</td></tr>`;
        return;
    }

    tbody.innerHTML = state.tickets.map(t => {
        let statusColor = 'bg-slate-100 text-slate-600';
        if (t.status === 'Nuova' || t.status === 'Nuovo') statusColor = 'bg-rose-100 text-rose-700';
        if (t.status === 'In Lavorazione') statusColor = 'bg-amber-100 text-amber-700';
        if (t.status === 'Risolta' || t.status === 'Risolto') statusColor = 'bg-emerald-100 text-emerald-700';
        
        let priorityIcon = '';
        if (t.priority === 'Bassa') priorityIcon = '<i class="fa-solid fa-arrow-down text-blue-500"></i>';
        if (t.priority === 'Media') priorityIcon = '<i class="fa-solid fa-equals text-amber-500"></i>';
        if (t.priority === 'Alta') priorityIcon = '<i class="fa-solid fa-arrow-up text-rose-500"></i>';

        const userCell = isAdmin ? `<td class="py-3.5 px-4 font-medium text-slate-800">${t.creator_name || 'N/D'} <span class="text-[10px] text-slate-400 block">${t.creator_unita || ''}</span></td>` : `<td class="py-3.5 px-4 hidden"></td>`;

        return `
        <tr class="hover:bg-slate-50 transition-colors group">
            <td class="py-3.5 px-4 font-bold text-slate-500">#${t.id}</td>
            ${userCell}
            <td class="py-3.5 px-4">
                <span class="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-slate-100 text-slate-700">
                    ${t.category}
                </span>
            </td>
            <td class="py-3.5 px-4 font-medium text-slate-800">${t.title}</td>
            <td class="py-3.5 px-4 text-center" title="${t.priority}">${priorityIcon}</td>
            <td class="py-3.5 px-4 text-center">
                <span class="px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider ${statusColor}">
                    ${t.status}
                </span>
            </td>
            <td class="py-3.5 px-4 text-slate-500">${formatDate(t.created_at)}</td>
            <td class="py-3.5 px-4 text-center">
                <button onclick="openTicketDetailsModal(${t.id})" class="p-1.5 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors" title="Dettagli">
                    <i class="fa-solid fa-eye"></i>
                </button>
            </td>
        </tr>
        `;
    }).join('');
}
async function handleCreateTicket(event) {
    event.preventDefault();
    if (typeof isLicenseReadOnly === 'function' && isLicenseReadOnly()) {
        showToast("Operazione bloccata: il condominio è in modalità Sola Lettura.", "error");
        return;
    }
    const payload = {
        category: document.getElementById('ticket-category').value,
        priority: document.getElementById('ticket-priority').value,
        title: document.getElementById('ticket-title').value.trim(),
        description: document.getElementById('ticket-description').value.trim()
    };

    try {
        const res = await fetch('/api/tickets', {
            method: 'POST',
            headers: getAuthHeaders(),
            body: JSON.stringify(payload)
        });
        const data = await res.json();
        if (res.ok && data.success) {
            showToast('Segnalazione registrata!', 'success');
            closeNewTicketModal();
            loadTicketsData();
        } else {
            showToast(data.message || 'Errore creazione ticket.', 'error');
        }
    } catch (_) {
        showToast('Errore di connessione.', 'error');
    }
}

async function openTicketDetailsModal(ticketId) {
    state.currentTicketId = ticketId;
    const modal = document.getElementById('modal-ticket-details');
    if (modal) modal.classList.remove('hidden');

    try {
        const res = await fetch(`/api/tickets/${ticketId}`, { headers: getAuthHeaders() });
        const data = await res.json();
        if (!data.success) {
            showToast(data.message || 'Errore recupero dettagli ticket.', 'error');
            return;
        }

        const ticket = data.data;
        const idElem = document.getElementById('detail-ticket-id');
        if (idElem) idElem.textContent = `#${ticket.id}`;
        
        const titleElem = document.getElementById('detail-ticket-title');
        if (titleElem) titleElem.textContent = ticket.title || '';
        
        const metaElem = document.getElementById('detail-ticket-meta');
        if (metaElem) {
            const creator = ticket.creator_name || 'Utente';
            const unit = ticket.creator_unita ? ` (${ticket.creator_unita})` : '';
            metaElem.innerHTML = `Segnalato da <strong>${creator}</strong>${unit} il ${formatDate(ticket.created_at)}`;
        }
        
        const descElem = document.getElementById('detail-ticket-description');
        if (descElem) descElem.textContent = ticket.description || '';

        // Mostra il box cambio stato se l'utente è amministratore
        const adminStatusBox = document.getElementById('admin-ticket-status-box');
        if (adminStatusBox) {
            const isAdmin = state.currentUser && state.currentUser.role === 'admin';
            if (isAdmin) {
                adminStatusBox.classList.remove('hidden');
                adminStatusBox.classList.add('flex');
            } else {
                adminStatusBox.classList.add('hidden');
                adminStatusBox.classList.remove('flex');
            }
        }

        const statusSelect = document.getElementById('update-ticket-status-select');
        if (statusSelect && ticket.status) {
            statusSelect.value = ticket.status;
        }

        const container = document.getElementById('detail-ticket-updates');
        if (container) {
            const updates = ticket.updates || [];
            if (updates.length === 0) {
                container.innerHTML = `<div class="text-xs text-slate-400 italic py-2">Nessuna risposta o comunicazione registrata finora.</div>`;
            } else {
                container.innerHTML = updates.map(up => `
                    <div class="relative timeline-item pb-3">
                        <div class="flex justify-between text-xs mb-1">
                            <span class="font-bold px-2 py-0.5 rounded bg-slate-100 text-slate-700">${up.author_name || 'Utente'}</span>
                            <span class="text-slate-400">${formatDate(up.created_at)}</span>
                        </div>
                        <p class="text-xs text-slate-700 bg-white p-2.5 rounded-xl border border-slate-200/80 shadow-2xs">${up.message}</p>
                    </div>
                `).join('');
                container.scrollTop = container.scrollHeight;
            }
        }

    } catch (err) {
        console.error('Errore dettagli ticket:', err);
        showToast('Errore recupero dettagli ticket.', 'error');
    }
}

function closeTicketDetailsModal() {
    document.getElementById('modal-ticket-details').classList.add('hidden');
    state.currentTicketId = null;
}

async function handleAddTicketUpdate(event) {
    event.preventDefault();
    if (typeof isLicenseReadOnly === 'function' && isLicenseReadOnly()) {
        showToast("Condominio in Sola Lettura: invio risposte bloccato.", "error");
        return;
    }
    if (!state.currentTicketId) return;

    const inputElem = document.getElementById('update-message');
    const message = inputElem ? inputElem.value.trim() : '';
    if (!message) return;

    try {
        const res = await fetch(`/api/tickets/${state.currentTicketId}/updates`, {
            method: 'POST',
            headers: getAuthHeaders(),
            body: JSON.stringify({ message })
        });
        const data = await res.json();
        if (res.ok && data.success) {
            showToast('Risposta registrata!', 'success');
            if (inputElem) inputElem.value = '';
            await openTicketDetailsModal(state.currentTicketId);
            loadTicketsData();
        } else {
            showToast((data && data.message) || 'Errore salvataggio risposta.', 'error');
        }
    } catch (err) {
        console.error('Errore risposta ticket:', err);
        showToast('Errore durante l\'invio della risposta.', 'error');
    }
}

async function submitStatusUpdate() {
    if (!state.currentTicketId) return;
    const statusSelect = document.getElementById('update-ticket-status-select');
    const status = statusSelect ? statusSelect.value : null;
    if (!status) return;

    try {
        const res = await fetch(`/api/tickets/${state.currentTicketId}/status`, {
            method: 'PUT',
            headers: getAuthHeaders(),
            body: JSON.stringify({ status })
        });
        const data = await res.json();
        if (res.ok && data.success) {
            showToast(`Stato aggiornato a "${status}"`, 'success');
            await openTicketDetailsModal(state.currentTicketId);
            loadTicketsData();
        } else {
            showToast((data && data.message) || 'Errore aggiornamento stato.', 'error');
        }
    } catch (err) {
        console.error('Errore aggiornamento stato ticket:', err);
        showToast('Errore durante l\'aggiornamento dello stato.', 'error');
    }
}

// ============================================================================
// 7. AREA ASSEMBLEE
// ============================================================================
// La funzione loadAssembliesData (con future + verbali passati) è definita alla sezione 10

function renderAssembliesCards() {
    const container = document.getElementById('assemblies-cards-container');
    if (state.assemblies.length === 0) {
        container.innerHTML = `<div class="col-span-full py-8 text-center text-slate-400 bg-white rounded-2xl border">Nessuna assemblea in programma.</div>`;
        return;
    }

    container.innerHTML = state.assemblies.map(item => `
        <div class="bg-white rounded-2xl border border-slate-200 shadow-xs p-6 flex flex-col justify-between">
            <div>
                <div class="flex justify-between items-start mb-3">
                    <span class="px-2.5 py-1 rounded-lg text-xs font-bold bg-blue-100 text-blue-800">Assemblea ${item.type}</span>
                    <span class="text-xs font-semibold text-slate-500 bg-slate-100 px-2 py-1 rounded-lg">${item.time}</span>
                </div>
                <h3 class="text-lg font-bold text-slate-900 mb-2">${item.title}</h3>
                <div class="text-xs text-slate-600 mb-4 bg-slate-50 p-3 rounded-xl border border-slate-100 space-y-1">
                    <p><strong>Data:</strong> ${formatDate(item.date)}</p>
                    <p><strong>Luogo:</strong> ${item.location}</p>
                </div>
                <h4 class="text-xs font-bold uppercase text-slate-500 mb-2">Ordine del Giorno:</h4>
                <p class="text-xs text-slate-700 whitespace-pre-line">${item.agenda}</p>
            </div>
            ${item.meeting_link ? `
                <div class="mt-4 pt-3 border-t border-slate-100">
                    <a href="${item.meeting_link}" target="_blank" class="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-bold inline-flex items-center shadow-xs">
                        <i class="fa-solid fa-video mr-1.5 animate-pulse"></i> Partecipa in Video Call
                    </a>
                </div>
            ` : ''}
        </div>
    `).join('');
}

// ============================================================================
// MODALE NUOVA QUOTA (ADMIN)
// ============================================================================

async function openNewQuoteModal() {
    if (typeof isLicenseReadOnly === 'function' && isLicenseReadOnly()) {
        showToast("Condominio in Sola Lettura: creazione quote bloccata.", "warning");
        return;
    }
    populateQuoteUsersSelect();
    document.getElementById('modal-new-quote').classList.remove('hidden');
}

function closeNewQuoteModal() {
    document.getElementById('modal-new-quote').classList.add('hidden');
    const pInput = document.getElementById('quote-paid-amount');
    if (pInput) pInput.value = '';
}

async function handleCreateQuote(event) {
    event.preventDefault();
    if (typeof isLicenseReadOnly === 'function' && isLicenseReadOnly()) {
        showToast("Operazione bloccata: il condominio è in modalità Sola Lettura.", "error");
        return;
    }
    const personaVal = document.getElementById('quote-persona-id') ? document.getElementById('quote-persona-id').value : '';
    const unitaVal = document.getElementById('quote-unita-id') ? document.getElementById('quote-unita-id').value : '';
    const amountVal = parseFloat(document.getElementById('quote-amount').value) || 0;
    const paidVal = parseFloat(document.getElementById('quote-paid-amount')?.value) || 0;

    const payload = {
        persona_id: personaVal ? parseInt(personaVal, 10) : null,
        unita_id: unitaVal ? parseInt(unitaVal, 10) : null,
        type: document.getElementById('quote-type').value,
        title: document.getElementById('quote-title').value.trim(),
        amount: amountVal,
        paid_amount: paidVal,
        due_date: document.getElementById('quote-due-date').value
    };

    try {
        const res = await fetch('/api/quotes', {
            method: 'POST',
            headers: getAuthHeaders(),
            body: JSON.stringify(payload)
        });
        const data = await res.json();
        if (res.ok && data.success) {
            showToast('Quota assegnata con successo!', 'success');
            closeNewQuoteModal();
            loadAccountingData();
        } else {
            showToast(data.message || 'Errore assegnazione quota.', 'error');
        }
    } catch (_) {
        showToast('Errore di connessione.', 'error');
    }
}

// ============================================================================
// UTILITIES
// ============================================================================

function formatCurrency(amount) {
    return new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' }).format(amount || 0);
}

function formatDate(dateString) {
    if (!dateString) return '-';
    const d = new Date(dateString);
    return isNaN(d.getTime()) ? dateString : d.toLocaleDateString('it-IT', { day: '2-digit', month: 'short', year: 'numeric' });
}

function showToast(message, type = 'info') {
    const container = document.getElementById('toast-container');
    if (!container) return;

    const toast = document.createElement('div');
    let color = 'bg-white text-slate-800 border-slate-200';
    let icon = 'fa-circle-info text-blue-500';

    if (type === 'success') {
        color = 'bg-white text-slate-900 border-emerald-300';
        icon = 'fa-circle-check text-emerald-500';
    } else if (type === 'error') {
        color = 'bg-white text-slate-900 border-rose-300';
        icon = 'fa-triangle-exclamation text-rose-500';
    }

    toast.className = `toast flex items-center p-4 text-xs font-semibold rounded-2xl shadow-xl border ${color}`;
    toast.innerHTML = `<i class="fa-solid ${icon} text-base mr-3"></i><span class="flex-grow">${message}</span><button onclick="this.parentElement.remove()" class="ml-3 text-slate-400">&times;</button>`;
    container.appendChild(toast);
    setTimeout(() => toast.remove(), 4000);
}

// ============================================================================
// 8. MODALE REGISTRAZIONE FATTURA FORNITORE (ADMIN)
// ============================================================================

function openNewSupplierModal() {
    if (typeof isLicenseReadOnly === 'function' && isLicenseReadOnly()) {
        showToast("Condominio in Sola Lettura: registrazione pagamenti fornitori bloccata.", "warning");
        return;
    }
    document.getElementById('modal-new-supplier').classList.remove('hidden');
    
    // Popola il menu a tendina
    const select = document.getElementById('supplier-name');
    if (select && window.suppliersRegistryData) {
        let opts = '<option value="">Seleziona fornitore dall\'anagrafica...</option>';
        window.suppliersRegistryData.forEach(s => {
            opts += '<option value="' + s.ragione_sociale + '">' + s.ragione_sociale + '</option>';
        });
        select.innerHTML = opts;
    }
}

function toggleSupplierPartialInput() {
    const status = document.getElementById('supplier-status')?.value;
    const container = document.getElementById('supplier-paid-amount-container');
    if (container) {
        if (status === 'Parziale') container.classList.remove('hidden');
        else container.classList.add('hidden');
    }
}

function closeNewSupplierModal() {
    document.getElementById('modal-new-supplier').classList.add('hidden');
    const pInput = document.getElementById('supplier-paid-amount');
    if (pInput) pInput.value = '';
    const container = document.getElementById('supplier-paid-amount-container');
    if (container) container.classList.add('hidden');
}

async function handleCreateSupplier(event) {
    event.preventDefault();
    if (typeof isLicenseReadOnly === 'function' && isLicenseReadOnly()) {
        showToast("Operazione bloccata: il condominio è in modalità Sola Lettura.", "error");
        return;
    }
    const statusVal = document.getElementById('supplier-status').value;
    const paidVal = statusVal === 'Parziale'
        ? (parseFloat(document.getElementById('supplier-paid-amount')?.value) || 0)
        : (statusVal === 'Pagato' ? parseFloat(document.getElementById('supplier-amount').value) || 0 : 0);

    const payload = {
        supplier_name: document.getElementById('supplier-name').value.trim(),
        category: document.getElementById('supplier-category').value,
        invoice_number: document.getElementById('supplier-invoice').value.trim(),
        amount: document.getElementById('supplier-amount').value,
        paid_amount: paidVal,
        payment_date: document.getElementById('supplier-date').value,
        status: statusVal,
        notes: document.getElementById('supplier-notes').value.trim()
    };

    try {
        const res = await fetch('/api/supplier-payments', {
            method: 'POST',
            headers: getAuthHeaders(),
            body: JSON.stringify(payload)
        });
        const data = await res.json();
        if (res.ok && data.success) {
            showToast('Fattura registrata con successo!', 'success');
            closeNewSupplierModal();
            document.getElementById('supplier-name').value = '';
            document.getElementById('supplier-invoice').value = '';
            document.getElementById('supplier-amount').value = '';
            document.getElementById('supplier-notes').value = '';
            loadAccountingData();
        } else {
            showToast(data.message || 'Errore durante la registrazione.', 'error');
        }
    } catch (_) {
        showToast('Errore di connessione.', 'error');
    }
}

// ============================================================================
// 9. UPLOAD ALLEGATI PDF AI TICKET
// ============================================================================

let currentAttachmentTicketId = null;

async function openAttachmentsModal(ticketId) {
    currentAttachmentTicketId = ticketId;
    document.getElementById('modal-attachments').classList.remove('hidden');
    document.getElementById('attachment-ticket-id-label').textContent = `#${ticketId}`;
    document.getElementById('attachments-list').innerHTML = '<p class="text-xs text-slate-400 text-center py-2">Caricamento allegati...</p>';

    try {
        const res = await fetch(`/api/tickets/${ticketId}/attachments`, { headers: getAuthHeaders() });
        const data = await res.json();
        const listEl = document.getElementById('attachments-list');

        if (data.success && data.data.length > 0) {
            listEl.innerHTML = data.data.map(a => {
                let icon = 'fa-file text-slate-500';
                if (a.mimetype.startsWith('image/')) icon = 'fa-file-image text-blue-500';
                else if (a.mimetype.startsWith('video/')) icon = 'fa-file-video text-purple-500';
                else if (a.mimetype === 'application/pdf') icon = 'fa-file-pdf text-rose-500';
                else if (a.mimetype.includes('spreadsheet') || a.mimetype.includes('excel')) icon = 'fa-file-excel text-green-600';
                else if (a.mimetype.includes('word')) icon = 'fa-file-word text-blue-700';
                else if (a.mimetype.includes('zip') || a.mimetype.includes('rar')) icon = 'fa-file-zipper text-orange-500';
                const sizeFmt = a.size > 1024 * 1024
                    ? `${(a.size / 1024 / 1024).toFixed(1)} MB`
                    : `${(a.size / 1024).toFixed(0)} KB`;
  return `
                    <div class="flex items-center justify-between bg-slate-50 border border-slate-200 rounded-xl p-2.5">
                        <div class="flex items-center space-x-2">
                            <i class="fa-solid ${icon} text-base shrink-0"></i>
                            <div>
                                <p class="text-xs font-semibold text-slate-800 truncate max-w-[200px]">${a.original_name}</p>
                                <p class="text-[11px] text-slate-400">${sizeFmt} &bull; ${formatDate(a.uploaded_at)}</p>
                            </div>
                        </div>
                        <a href="${a.url}" target="_blank" download="${a.original_name}"
                            class="px-2.5 py-1 bg-blue-50 hover:bg-blue-100 text-blue-700 rounded-lg text-xs font-bold shrink-0">
                            <i class="fa-solid fa-download mr-1"></i>Scarica
                        </a>
                    </div>
                `;
            }).join('');
        } else if (data.success) {
            listEl.innerHTML = '<p class="text-xs text-slate-400 text-center py-3 italic">Nessun allegato per questo ticket.</p>';
        }
    } catch (_) {
        document.getElementById('attachments-list').innerHTML = '<p class="text-xs text-rose-400 text-center py-2">Errore nel caricamento allegati.</p>';
    }
}

function closeAttachmentsModal() {
    document.getElementById('modal-attachments').classList.add('hidden');
    document.getElementById('attachment-file').value = '';
    currentAttachmentTicketId = null;
}

async function handleUploadAttachment(event) {
    event.preventDefault();
    if (!currentAttachmentTicketId) return;

    const fileInput = document.getElementById('attachment-file');
    const file = fileInput.files[0];
    if (!file) return;

    const btn = document.getElementById('btn-upload-attachment');
    btn.disabled = true;
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin mr-1"></i> Caricamento...';

    const formData = new FormData();
    formData.append('file', file);

    try {
        const uploadHeaders = { 'Authorization': `Bearer ${state.token}` };
        if (state.activeCondominioId) {
            uploadHeaders['x-Condominio-id'] = state.activeCondominioId;
        }

        const res = await fetch(`/api/tickets/${currentAttachmentTicketId}/attachments`, {
            method: 'POST',
            headers: uploadHeaders, // NO Content-Type per multipart
            body: formData
        });
        const data = await res.json();
        if (res.ok && data.success) {
            showToast(data.message, 'success');
            fileInput.value = '';
            // Ricarica la lista allegati
            await openAttachmentsModal(currentAttachmentTicketId);
            loadTicketsData(); // aggiorna badge e tabella
        } else {
            showToast(data.message || 'Errore upload.', 'error');
        }
    } catch (_) {
        showToast('Errore di connessione durante l\'upload.', 'error');
    } finally {
        btn.disabled = false;
        btn.innerHTML = '<i class="fa-solid fa-upload mr-1"></i> Carica Allegato';
    }
}

// ============================================================================
// 10. ASSEMBLEE PASSATE (VERBALI)
// ============================================================================

async function loadAssembliesData() {
    try {
        // Carica convocazioni future e assemblee passate in parallelo
        const [futureRes, pastRes] = await Promise.all([
            fetch('/api/assemblies?past=0', { headers: getAuthHeaders() }),
            fetch('/api/assemblies?past=1', { headers: getAuthHeaders() })
        ]);

        const futureData = await futureRes.json();
        const pastData = await pastRes.json();
        if (state.currentUser.role === 'admin') loadConvocationsLog();

        if (futureData.success) {
            state.assemblies = futureData.data;
            renderAssembliesCards();
        }

        if (pastData.success) {
            renderPastAssemblies(pastData.data);
        }
    } catch (_) {
        showToast('Errore caricamento assemblee.', 'error');
    }
}

function renderPastAssemblies(items) {
    const container = document.getElementById('assemblies-past-container');
    if (!items || items.length === 0) {
        container.innerHTML = `<div class="py-6 text-center text-slate-400 bg-white rounded-2xl border text-sm italic">Nessun verbale archiviato.</div>`;
        return;
    }

    container.innerHTML = items.map(item => `
        <div class="bg-white rounded-2xl border border-slate-200 shadow-xs p-5">
            <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-3">
                <div>
                    <span class="px-2 py-0.5 rounded-lg text-xs font-bold bg-slate-100 text-slate-600">
                        Assemblea ${item.type} &bull; ${formatDate(item.date)}
                    </span>
                    <h3 class="text-base font-bold text-slate-900 mt-1">${item.title}</h3>
                </div>
                <span class="px-2.5 py-1 rounded-full text-xs font-bold bg-emerald-50 text-emerald-700 border border-emerald-200 shrink-0">
                    <i class="fa-solid fa-check-circle mr-1"></i>Deliberata
                </span>
            </div>
            ${item.minutes_summary ? `
                <div class="bg-slate-50 border border-slate-200 rounded-xl p-4">
                    <p class="text-xs font-bold uppercase tracking-wider text-slate-400 mb-2"><i class="fa-solid fa-scroll mr-1"></i>Sintesi del Verbale</p>
                    <p class="text-xs text-slate-700 leading-relaxed">${item.minutes_summary}</p>
                </div>
            ` : `<p class="text-xs text-slate-400 italic">Verbale non ancora pubblicato.</p>`}
        </div>
    `).join('');
}



// ============================================================================
// V2.0 LOGICA AGGIUNTIVA
// ============================================================================

function isLicenseReadOnly() {
    return !!(state.currentCondoLicense && state.currentCondoLicense.is_read_only);
}

function updateLicenseReadOnlyUI() {
    const isReadOnly = isLicenseReadOnly();

    // 1. Badge dinamico nell'intestazione
    const headerTitle = document.getElementById('dash-condo-nome');
    let badge = document.getElementById('header-readonly-badge');
    if (isReadOnly) {
        if (!badge && headerTitle && headerTitle.parentNode) {
            badge = document.createElement('span');
            badge.id = 'header-readonly-badge';
            badge.className = 'inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-black uppercase bg-rose-100 text-rose-800 border border-rose-300 shadow-2xs ml-3';
            badge.innerHTML = '<i class="fa-solid fa-lock text-rose-600"></i> Modalità Sola Lettura';
            headerTitle.parentNode.appendChild(badge);
        } else if (badge) {
            badge.classList.remove('hidden');
        }
    } else if (badge) {
        badge.classList.add('hidden');
    }

    // 2. Disabilita visivamente e interattivamente i pulsanti di scrittura
    const writeBtnSelectors = [
        'button[onclick*="openNewQuoteModal"]',
        'button[onclick*="openSupplierRegistryModal"]',
        'button[onclick*="openNewSupplierModal"]',
        'button[onclick*="openConvocazioneModal"]',
        'button[onclick*="openNewTicketModal"]',
        'button[onclick*="openPersonaModal"]',
        'button[onclick*="openUnitaModal"]',
        'button[onclick*="openNewJournal"]',
        'button[onclick*="openNewBankAccount"]',
        'button[onclick*="openNewBankTransaction"]',
        '#form-condominio button[type="submit"]',
        '#admin-add-supplier-registry-btn',
        '#admin-add-supplier-btn',
        '#admin-edit-form button[type="submit"]',
        'button[onclick*="markQuoteAsPaid"]',
        'button[onclick*="openPaymentModal"]',
        'button[onclick*="editQuote"]',
        'button[onclick*="sendReceipt"]',
        'button[onclick*="sendReminder"]',
        'button[onclick*="editPersona"]',
        'button[onclick*="editUnita"]',
        'button[onclick*="editSupplierRegistry"]',
        'button[onclick*="editUser"]',
        'button[onclick*="deleteUser"]',
        'button[onclick*="deleteQuote"]',
        '#btn-export-excel-accounting',
        '#btn-export-excel-users',
        'button[onclick*="exportExcel"]',
        'button[onclick*="exportUsersExcel"]'
    ];

    writeBtnSelectors.forEach(sel => {
        document.querySelectorAll(sel).forEach(btn => {
            if (isReadOnly) {
                btn.disabled = true;
                btn.classList.add('opacity-40', 'cursor-not-allowed', 'pointer-events-none');
                btn.setAttribute('title', 'Bloccato: Condominio in sola lettura (licenza scaduta o sospesa)');
            } else {
                btn.disabled = false;
                btn.classList.remove('opacity-40', 'cursor-not-allowed', 'pointer-events-none');
                btn.removeAttribute('title');
            }
        });
    });

    // 3. Campi form Dati Condominio
    const condoForm = document.getElementById('form-condominio');
    if (condoForm) {
        condoForm.querySelectorAll('input, select, textarea').forEach(inp => {
            if (isReadOnly) {
                inp.setAttribute('readonly', 'true');
                inp.classList.add('bg-slate-100', 'cursor-not-allowed');
            } else {
                inp.removeAttribute('readonly');
                inp.classList.remove('bg-slate-100', 'cursor-not-allowed');
            }
        });
    }

    // 4. Inserimento banner informativo nei tab operativi
    const tabs = ['tab-contabilita', 'tab-unita', 'tab-anagrafica', 'tab-tickets', 'tab-condominio'];
    tabs.forEach(tabId => {
        const pane = document.getElementById(tabId);
        if (!pane) return;
        let tabBanner = pane.querySelector('.tab-license-readonly-banner');
        if (isReadOnly) {
            if (!tabBanner) {
                tabBanner = document.createElement('div');
                tabBanner.className = 'tab-license-readonly-banner mb-5 p-4 rounded-2xl bg-gradient-to-r from-rose-50 to-red-100 border border-rose-300 text-rose-950 text-xs flex items-center justify-between gap-3 shadow-xs';
                tabBanner.innerHTML = `
                    <div class="flex items-center gap-3">
                        <div class="w-9 h-9 rounded-xl bg-rose-600 text-white flex items-center justify-center shrink-0 shadow-xs">
                            <i class="fa-solid fa-lock"></i>
                        </div>
                        <div>
                            <span class="font-black uppercase tracking-wide text-rose-900 block text-xs">Modalità Sola Lettura Attiva</span>
                            <span class="text-rose-800 text-[11px]">La licenza per questo fabbricato è scaduta o sospesa. L'inserimento di nuovi dati e le modifiche sono disabilitate.</span>
                        </div>
                    </div>
                    ${state.currentUser && state.currentUser.is_superadmin ? `
                        <button onclick="openSuLicenseFromCondo()" class="shrink-0 px-3 py-1.5 rounded-xl bg-purple-600 hover:bg-purple-700 text-white font-bold text-xs transition-colors flex items-center gap-1.5 shadow-xs">
                            <i class="fa-solid fa-crown text-amber-300"></i> Rinnova (SuperUser)
                        </button>
                    ` : ''}
                `;
                pane.insertBefore(tabBanner, pane.firstChild);
            } else {
                tabBanner.classList.remove('hidden');
            }
        } else if (tabBanner) {
            tabBanner.classList.add('hidden');
        }
    });
}

async function loadAnagrafica() {
    try {
        const res = await fetch('/api/condominio', { headers: getAuthHeaders() });
        const data = await res.json();
        if (data.success && data.data.nome) {
            document.getElementById('condominio-nome').value = data.data.nome || '';
            document.getElementById('condominio-indirizzo').value = data.data.indirizzo || '';
            document.getElementById('condominio-cf').value = data.data.cf || '';
            document.getElementById('condominio-scala').value = data.data.scala || '';
            
            const dashNome = document.getElementById('dash-condo-nome');
            if(dashNome) dashNome.textContent = (data.data.nome || 'CONDOMINIO').toUpperCase();
            
            const dashBox = document.getElementById('dash-condo-details-box');
            if(dashBox && (data.data.indirizzo || data.data.cf)) {
                dashBox.classList.remove('hidden');
                document.getElementById('dash-condo-indirizzo').textContent = data.data.indirizzo || 'N/D';
                document.getElementById('dash-condo-cf').textContent = data.data.cf || 'N/D';
                document.getElementById('dash-condo-scala').textContent = data.data.scala || 'Unica';
                
                if (data.data.admin_nome || data.data.admin_cognome) {
                    const adminDetails = document.getElementById('dash-admin-details');
                    if (adminDetails) {
                        adminDetails.classList.remove('hidden');
                        document.getElementById('dash-admin-nome').textContent = (data.data.admin_titolo ? data.data.admin_titolo + ' ' : '') + (data.data.admin_nome || '') + ' ' + (data.data.admin_cognome || '');
                        document.getElementById('dash-admin-tel').textContent = data.data.admin_telefono || 'N/D';
                        document.getElementById('dash-admin-cell').textContent = data.data.admin_cellulare || 'N/D';
                        document.getElementById('dash-admin-emg').textContent = data.data.admin_emergenze || 'N/D';
                        document.getElementById('dash-admin-email').textContent = data.data.admin_email || 'N/D';
                    }
                }
            }

            // Gestione Banner Licenza (Scaduta, Sospesa, In Scadenza)
            if (data.data.license) {
                state.currentCondoLicense = data.data.license;
                const lic = data.data.license;
                const bannerExpired = document.getElementById('banner-license-expired');
                const bannerExpiring = document.getElementById('banner-license-expiring');
                const btnRenewExpiredSu = document.getElementById('banner-btn-renew-su');
                const btnRenewExpiringSu = document.getElementById('banner-btn-renew-expiring-su');
                const isSuper = state.currentUser && state.currentUser.is_superadmin;

                if (lic.is_read_only) {
                    if (bannerExpired) {
                        bannerExpired.classList.remove('hidden');
                        const desc = document.getElementById('banner-license-expired-desc');
                        if (desc) {
                            if (lic.is_suspended) {
                                desc.textContent = `La licenza per questo condominio è stata temporaneamente SOSPESA dall'amministrazione. Il sistema è in modalità di consultazione (sola lettura).`;
                            } else {
                                desc.textContent = `La licenza per questo fabbricato è scaduta il ${lic.end_date}. È possibile consultare i bilanci e lo storico, ma l'inserimento di nuovi dati, fatture e ticket è bloccato fino al rinnovo.`;
                            }
                        }
                        if (btnRenewExpiredSu) {
                            if (isSuper) btnRenewExpiredSu.classList.remove('hidden');
                            else btnRenewExpiredSu.classList.add('hidden');
                        }
                    }
                    if (bannerExpiring) bannerExpiring.classList.add('hidden');
                } else if (lic.is_expiring) {
                    if (bannerExpiring) {
                        bannerExpiring.classList.remove('hidden');
                        const desc = document.getElementById('banner-license-expiring-desc');
                        if (desc) {
                            desc.textContent = `Attenzione: la licenza per questo fabbricato scadrà il ${lic.end_date} (mancano ${lic.days_remaining} giorni). Effettua il rinnovo per garantire la continuità dei servizi.`;
                        }
                        if (btnRenewExpiringSu) {
                            if (isSuper) btnRenewExpiringSu.classList.remove('hidden');
                            else btnRenewExpiringSu.classList.add('hidden');
                        }
                    }
                    if (bannerExpired) bannerExpired.classList.add('hidden');
                } else {
                    if (bannerExpired) bannerExpired.classList.add('hidden');
                    if (bannerExpiring) bannerExpiring.classList.add('hidden');
                }
                updateLicenseReadOnlyUI();
            }
        }
    } catch(e) { console.error(e); }
}

async function handleSaveCondominio(e) {
    e.preventDefault();
    if (isLicenseReadOnly()) {
        showToast("Operazione bloccata: la licenza per questo condominio è scaduta o sospesa (Sola Lettura).", "error");
        return;
    }
    const payload = {
        nome: document.getElementById('condominio-nome').value,
        indirizzo: document.getElementById('condominio-indirizzo').value,
        cf: document.getElementById('condominio-cf').value,
        scala: document.getElementById('condominio-scala').value,
        piano: ''
    };
    try {
        const res = await fetch('/api/condominio', {
            method: 'PUT',
            headers: getAuthHeaders(),
            body: JSON.stringify(payload)
        });
        const data = await res.json();
        if (data.success) { showToast(data.message || 'Dati salvati con successo!', 'success'); document.getElementById('header-condo-name').textContent = payload.nome; }
        else showToast('Errore salvataggio', 'error');
    } catch(err) { showToast('Errore rete', 'error'); }
}

async function loadBanca() {
    const anagraficaContainer = document.getElementById('anagrafica-banca-container');
    const movimentiContainer = document.getElementById('banca-container');
    anagraficaContainer.innerHTML = 'Caricamento...';
    movimentiContainer.innerHTML = 'Caricamento...';

    try {
        const resConti = await fetch('/api/bank-accounts', { headers: getAuthHeaders() });
        const dataConti = await resConti.json();
        if (dataConti.success) {
            window.bankAccountsData = dataConti.data;
            if (dataConti.data.length === 0) {
                anagraficaContainer.innerHTML = '<p class="text-slate-500 italic">Nessun conto bancario configurato.</p>';
            } else {
                anagraficaContainer.innerHTML = '<table class="w-full text-left text-sm"><thead class="bg-slate-50 border-b"><tr><th class="p-2">Banca</th><th class="p-2">IBAN</th><th class="p-2">Intestazione</th><th class="p-2">Note</th><th class="p-2 text-right">Azioni</th></tr></thead><tbody>' +
                    dataConti.data.map(c => `<tr><td class="p-2">${c.banca}</td><td class="p-2">${c.iban}</td><td class="p-2">${c.intestazione}</td><td class="p-2">${c.note || ''}</td><td class="p-2 text-right"><button onclick="editBankAccount(${c.id})" class="text-indigo-600 hover:text-indigo-800 mr-2 no-print"><i class="fa-solid fa-pen"></i></button><button onclick="deleteBankAccount(${c.id})" class="text-red-500 hover:text-red-700 no-print"><i class="fa-solid fa-trash"></i></button></td></tr>`).join('') +
                    '</tbody></table>';
            }
        }
    } catch(e) { anagraficaContainer.innerHTML = 'Errore caricamento conti'; }

    try {
        const resMovimenti = await fetch('/api/bank-transactions', { headers: getAuthHeaders() });
        const dataMovimenti = await resMovimenti.json();
        if (dataMovimenti.success) {
            window.bankTransactionsData = dataMovimenti.data;
            movimentiContainer.innerHTML = '<table class="w-full text-left text-sm"><thead class="bg-slate-50 border-b"><tr><th class="p-2">Data</th><th class="p-2">Causale</th><th class="p-2 text-right">Importo</th><th class="p-2">Tipo</th><th class="p-2 text-right">Azioni</th></tr></thead><tbody>' +
                dataMovimenti.data.map(t => `<tr><td class="p-2">${formatDate(t.data)}</td><td class="p-2">${t.causale}</td><td class="p-2 text-right">${formatCurrency(t.importo)}</td><td class="p-2">${t.tipo}</td><td class="p-2 text-right"><button onclick="editBankTransaction(${t.id})" class="text-indigo-600 hover:text-indigo-800 mr-2 no-print"><i class="fa-solid fa-pen"></i></button><button onclick="deleteBankTransaction(${t.id})" class="text-red-500 hover:text-red-700 no-print"><i class="fa-solid fa-trash"></i></button></td></tr>`).join('') +
                '</tbody></table>';
        }
    } catch(e) { movimentiContainer.innerHTML = 'Errore caricamento movimenti'; }
}

let editingBankAccountId = null;

function addBankAccount() {
    editingBankAccountId = null;
    document.getElementById('form-new-bank-account').reset();
    document.querySelector('#modal-new-bank-account h3').innerHTML = '<i class="fa-solid fa-building-columns text-indigo-600 mr-2"></i>Nuovo Conto Bancario';
    document.getElementById('modal-new-bank-account').classList.remove('hidden');
}

function editBankAccount(id) {
    editingBankAccountId = id;
    const conto = window.bankAccountsData.find(c => c.id === id);
    if (!conto) return;
    
    document.getElementById('bank-name').value = conto.banca;
    document.getElementById('bank-iban').value = conto.iban;
    document.getElementById('bank-holder').value = conto.intestazione;
    document.getElementById('bank-notes').value = conto.note || '';
    
    document.querySelector('#modal-new-bank-account h3').innerHTML = '<i class="fa-solid fa-building-columns text-indigo-600 mr-2"></i>Modifica Conto Bancario';
    document.getElementById('modal-new-bank-account').classList.remove('hidden');
}

function closeBankAccountModal() {
    document.getElementById('modal-new-bank-account').classList.add('hidden');
    document.getElementById('form-new-bank-account').reset();
    editingBankAccountId = null;
}

async function handleNewBankAccountSubmit(event) {
    event.preventDefault();
    const banca = document.getElementById('bank-name').value.trim();
    const iban = document.getElementById('bank-iban').value.trim();
    const intestazione = document.getElementById('bank-holder').value.trim();
    const note = document.getElementById('bank-notes').value.trim();

    try {
        const method = editingBankAccountId ? 'PUT' : 'POST';
        const url = editingBankAccountId ? `/api/bank-accounts/${editingBankAccountId}` : '/api/bank-accounts';
        
        await fetch(url, {
            method,
            headers: getAuthHeaders(),
            body: JSON.stringify({ banca, iban, intestazione, note })
        });
        closeBankAccountModal();
        loadBanca();
    } catch(e) { alert('Errore salvataggio conto'); }
}

async function deleteBankAccount(id) {
    if (!confirm('Sei sicuro di voler eliminare questo conto bancario?')) return;
    try {
        await fetch(`/api/bank-accounts/${id}`, {
            method: 'DELETE',
            headers: getAuthHeaders()
        });
        loadBanca();
    } catch(e) { alert('Errore eliminazione conto'); }
}

let editingBankTransactionId = null;

async function addBankTransaction() {
    editingBankTransactionId = null;
    document.getElementById('form-new-bank-transaction').reset();
    document.querySelector('#modal-new-bank-transaction h3').innerHTML = '<i class="fa-solid fa-money-bill-transfer text-indigo-600 mr-2"></i>Nuovo Movimento Bancario';

    try {
        const res = await fetch('/api/bank-accounts', { headers: getAuthHeaders() });
        const data = await res.json();
        const select = document.getElementById('trans-account-id');
        if (data.success && data.data.length > 0) {
            select.innerHTML = data.data.map(c => `<option value="${c.id}">${c.banca} - ${c.intestazione}</option>`).join('');
        } else {
            select.innerHTML = '<option value="">Nessun conto disponibile (aggiungine uno)</option>';
        }
    } catch (e) {
        console.error("Errore caricamento conti", e);
    }
    
    document.getElementById('trans-date').value = new Date().toISOString().slice(0,10);
    document.getElementById('modal-new-bank-transaction').classList.remove('hidden');
}

async function editBankTransaction(id) {
    editingBankTransactionId = id;
    const trans = window.bankTransactionsData.find(t => t.id === id);
    if (!trans) return;

    try {
        const res = await fetch('/api/bank-accounts', { headers: getAuthHeaders() });
        const data = await res.json();
        const select = document.getElementById('trans-account-id');
        if (data.success && data.data.length > 0) {
            select.innerHTML = data.data.map(c => `<option value="${c.id}">${c.banca} - ${c.intestazione}</option>`).join('');
        } else {
            select.innerHTML = '<option value="">Nessun conto disponibile (aggiungine uno)</option>';
        }
    } catch (e) {}

    document.getElementById('trans-account-id').value = trans.account_id;
    document.getElementById('trans-date').value = trans.data.slice(0,10);
    document.getElementById('trans-causale').value = trans.causale;
    document.getElementById('trans-importo').value = trans.importo;
    document.getElementById('trans-tipo').value = trans.tipo;

    document.querySelector('#modal-new-bank-transaction h3').innerHTML = '<i class="fa-solid fa-money-bill-transfer text-indigo-600 mr-2"></i>Modifica Movimento Bancario';
    document.getElementById('modal-new-bank-transaction').classList.remove('hidden');
}

function closeBankTransactionModal() {
    document.getElementById('modal-new-bank-transaction').classList.add('hidden');
    document.getElementById('form-new-bank-transaction').reset();
    editingBankTransactionId = null;
}

async function handleNewBankTransactionSubmit(event) {
    event.preventDefault();
    const account_id = document.getElementById('trans-account-id').value;
    if (!account_id) {
        alert("Seleziona un conto bancario valido.");
        return;
    }
    const data = document.getElementById('trans-date').value;
    const causale = document.getElementById('trans-causale').value.trim();
    const importo = document.getElementById('trans-importo').value;
    const tipo = document.getElementById('trans-tipo').value;

    try {
        const method = editingBankTransactionId ? 'PUT' : 'POST';
        const url = editingBankTransactionId ? `/api/bank-transactions/${editingBankTransactionId}` : '/api/bank-transactions';
        await fetch(url, {
            method,
            headers: getAuthHeaders(),
            body: JSON.stringify({ account_id: parseInt(account_id), data, importo: parseFloat(importo), causale, tipo })
        });
        closeBankTransactionModal();
        loadBanca();
    } catch(e) { alert('Errore salvataggio movimento'); }
}

async function deleteBankTransaction(id) {
    if (!confirm('Sei sicuro di voler eliminare questo movimento bancario?')) return;
    try {
        await fetch(`/api/bank-transactions/${id}`, {
            method: 'DELETE',
            headers: getAuthHeaders()
        });
        loadBanca();
    } catch(e) { alert('Errore eliminazione movimento'); }
}


let journalFilteredData = null;

async function loadGiornale() {
    const container = document.getElementById('giornale-container');
    if (!container) return;
    container.innerHTML = '<div class="text-center py-8 text-slate-400"><i class="fa-solid fa-spinner fa-spin mr-2"></i>Caricamento scritture contabili in corso...</div>';
    
    // Aggiorna intestazione di stampa se presente
    updateJournalPrintHeader();

    try {
        const res = await fetch('/api/journal', { headers: getAuthHeaders() });
        const data = await res.json();
        if (data.success) {
            state.journal = data.data || [];
            journalFilteredData = [...state.journal];
            renderJournalTable(journalFilteredData);
            updateJournalKPIs(state.journal);
        } else {
            container.innerHTML = '<div class="text-center py-6 text-rose-500 font-semibold"><i class="fa-solid fa-triangle-exclamation mr-2"></i>Impossibile caricare il Libro Giornale.</div>';
        }
    } catch(e) { 
        console.error('Errore caricamento giornale:', e);
        container.innerHTML = '<div class="text-rose-500 p-6 text-center">Errore di connessione durante il caricamento del giornale.</div>'; 
    }
}

function updateJournalPrintHeader() {
    const condo = state.activeCondominio || {};
    const nameEl = document.getElementById('print-journal-condo-name');
    const detailsEl = document.getElementById('print-journal-condo-details');
    const dateEl = document.getElementById('print-journal-date');
    
    if (nameEl) nameEl.textContent = (condo.nome || 'CONDOMINIO').toUpperCase();
    if (detailsEl) {
        const admin = condo.admin_nome ? `Amministrazione: ${condo.admin_titolo || ''} ${condo.admin_cognome || ''} ${condo.admin_nome || ''} &bull; ` : '';
        detailsEl.innerHTML = `${condo.indirizzo || ''} &bull; C.F.: <b>${condo.cf || 'N/D'}</b><br>${admin}Stampa ufficiale ad uso contabile`;
    }
    if (dateEl) {
        dateEl.innerHTML = `Data Emissione: <b>${new Date().toLocaleDateString('it-IT', { day: '2-digit', month: 'long', year: 'numeric' })}</b>`;
    }
}

function updateJournalKPIs(entries) {
    let totDare = 0;
    let totAvere = 0;
    (entries || []).forEach(e => {
        totDare += parseFloat(e.dare || 0);
        totAvere += parseFloat(e.avere || 0);
    });
    const saldo = totDare - totAvere;

    const elDare = document.getElementById('journal-kpi-dare');
    const elAvere = document.getElementById('journal-kpi-avere');
    const elSaldo = document.getElementById('journal-kpi-saldo');
    const elBadge = document.getElementById('journal-kpi-saldo-badge');
    const elIcon = document.getElementById('journal-kpi-saldo-icon');
    const elCount = document.getElementById('journal-kpi-count');

    if (elDare) elDare.textContent = formatCurrency(totDare);
    if (elAvere) elAvere.textContent = formatCurrency(totAvere);
    if (elCount) elCount.textContent = (entries || []).length;
    
    if (elSaldo) {
        elSaldo.textContent = formatCurrency(saldo);
        if (saldo >= 0) {
            elSaldo.className = 'text-lg font-extrabold text-emerald-600 tracking-tight my-0.5';
            if (elBadge) {
                elBadge.className = 'text-[10px] text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full font-semibold inline-block';
                elBadge.textContent = 'Avanzo di gestione attivo';
            }
            if (elIcon) elIcon.className = 'w-11 h-11 rounded-xl bg-emerald-50 text-emerald-600 border border-emerald-100 flex items-center justify-center text-lg shrink-0';
        } else {
            elSaldo.className = 'text-lg font-extrabold text-rose-600 tracking-tight my-0.5';
            if (elBadge) {
                elBadge.className = 'text-[10px] text-rose-700 bg-rose-50 px-2 py-0.5 rounded-full font-semibold inline-block';
                elBadge.textContent = 'Disavanzo di cassa temporaneo';
            }
            if (elIcon) elIcon.className = 'w-11 h-11 rounded-xl bg-rose-50 text-rose-600 border border-rose-100 flex items-center justify-center text-lg shrink-0';
        }
    }
}

function renderJournalTable(entries) {
    const container = document.getElementById('giornale-container');
    if (!container) return;

    if (!entries || entries.length === 0) {
        container.innerHTML = `
            <div class="py-12 text-center text-slate-400">
                <i class="fa-solid fa-book-open text-4xl mb-3 text-slate-300"></i>
                <p class="font-bold text-slate-600 text-sm">Nessuna registrazione contabile trovata</p>
                <p class="text-xs text-slate-400 mt-1">Non ci sono movimenti registrati o corrispondenti ai filtri impostati.</p>
            </div>
        `;
        return;
    }

    // Ordina in ordine cronologico crescente per calcolare il saldo progressivo corretto
    const sorted = [...entries].sort((a, b) => new Date(a.data) - new Date(b.data) || a.id - b.id);

    let totDare = 0;
    let totAvere = 0;
    let runningBalance = 0;

    const rowsHtml = sorted.map((j, idx) => {
        const d = parseFloat(j.dare || 0);
        const a = parseFloat(j.avere || 0);
        totDare += d;
        totAvere += a;
        runningBalance += (d - a);

        let typeBadge = '';
        if (j.tipo === 'Incasso Quota' || d > 0) {
            typeBadge = '<span class="px-2 py-0.5 text-[10px] font-bold rounded-md bg-emerald-100 text-emerald-800"><i class="fa-solid fa-arrow-down mr-1"></i>Incasso</span>';
        } else if (j.tipo === 'Pagamento Fornitore' || a > 0) {
            typeBadge = '<span class="px-2 py-0.5 text-[10px] font-bold rounded-md bg-rose-100 text-rose-800"><i class="fa-solid fa-arrow-up mr-1"></i>Pagamento</span>';
        } else {
            typeBadge = '<span class="px-2 py-0.5 text-[10px] font-bold rounded-md bg-slate-100 text-slate-700">Generica</span>';
        }

        const num = j.numero && j.numero !== 'AUTO' ? j.numero : (idx + 1);

        return `
            <tr class="hover:bg-slate-50/80 transition-colors border-b border-slate-100 text-xs">
                <td class="p-3 text-center font-bold text-slate-400">${num}</td>
                <td class="p-3 whitespace-nowrap font-medium text-slate-700">${formatDate(j.data)}</td>
                <td class="p-3 whitespace-nowrap">${typeBadge}</td>
                <td class="p-3 font-bold text-slate-900">${j.conto || '<span class="text-slate-400 font-normal italic">Cassa</span>'}</td>
                <td class="p-3 text-slate-700 max-w-[280px] break-words">${j.descrizione || '-'}</td>
                <td class="p-3 text-right font-bold whitespace-nowrap ${d > 0 ? 'text-emerald-600' : 'text-slate-300'}">${d > 0 ? formatCurrency(d) : '-'}</td>
                <td class="p-3 text-right font-bold whitespace-nowrap ${a > 0 ? 'text-rose-600' : 'text-slate-300'}">${a > 0 ? formatCurrency(a) : '-'}</td>
                <td class="p-3 text-right font-extrabold whitespace-nowrap ${runningBalance >= 0 ? 'text-emerald-700' : 'text-rose-700'}">${formatCurrency(runningBalance)}</td>
                <td class="p-3 text-center whitespace-nowrap no-print">
                    <button onclick="editJournalEntry(${j.id})" class="p-1.5 text-slate-400 hover:text-amber-600 rounded-lg transition-colors" title="Modifica"><i class="fa-solid fa-pen"></i></button>
                    <button onclick="deleteJournalEntry(${j.id})" class="p-1.5 text-slate-400 hover:text-rose-600 rounded-lg transition-colors ml-1" title="Elimina"><i class="fa-solid fa-trash"></i></button>
                </td>
            </tr>
        `;
    }).join('');

    const saldoFinale = totDare - totAvere;

    const tableHtml = `
        <div class="overflow-x-auto">
            <table class="w-full text-left text-sm border-collapse">
                <thead class="bg-slate-50 border-b border-slate-200 text-xs font-bold text-slate-600 uppercase tracking-wider">
                    <tr>
                        <th class="p-3 text-center w-12">N°</th>
                        <th class="p-3">Data</th>
                        <th class="p-3">Tipo</th>
                        <th class="p-3">Conto / Soggetto</th>
                        <th class="p-3">Descrizione Operazione</th>
                        <th class="p-3 text-right">Entrate (Dare)</th>
                        <th class="p-3 text-right">Uscite (Avere)</th>
                        <th class="p-3 text-right">Saldo Progr.</th>
                        <th class="p-3 text-center no-print">Azioni</th>
                    </tr>
                </thead>
                <tbody class="divide-y divide-slate-100">
                    ${rowsHtml}
                </tbody>
                <tfoot class="bg-slate-900 text-white font-bold text-xs">
                    <tr>
                        <td colspan="5" class="p-3.5 uppercase tracking-wide">TOTALE GENERALE DEL PERIODO</td>
                        <td class="p-3.5 text-right font-extrabold text-emerald-400 whitespace-nowrap">${formatCurrency(totDare)}</td>
                        <td class="p-3.5 text-right font-extrabold text-rose-400 whitespace-nowrap">${formatCurrency(totAvere)}</td>
                        <td class="p-3.5 text-right font-black ${saldoFinale >= 0 ? 'text-emerald-400' : 'text-rose-400'} whitespace-nowrap">${formatCurrency(saldoFinale)}</td>
                        <td class="p-3.5 no-print"></td>
                    </tr>
                </tfoot>
            </table>
        </div>
    `;

    container.innerHTML = tableHtml;
}

function filterJournalEntries() {
    if (!state.journal) return;
    const q = (document.getElementById('journal-search-input')?.value || '').toLowerCase().trim();
    const from = document.getElementById('journal-filter-from')?.value;
    const to = document.getElementById('journal-filter-to')?.value;

    const filtered = state.journal.filter(j => {
        if (q) {
            const desc = (j.descrizione || '').toLowerCase();
            const conto = (j.conto || '').toLowerCase();
            const tipo = (j.tipo || '').toLowerCase();
            if (!desc.includes(q) && !conto.includes(q) && !tipo.includes(q)) return false;
        }
        if (from && j.data && j.data.slice(0, 10) < from) return false;
        if (to && j.data && j.data.slice(0, 10) > to) return false;
        return true;
    });

    journalFilteredData = filtered;
    renderJournalTable(filtered);
    updateJournalKPIs(filtered);
}

function resetJournalFilters() {
    const s = document.getElementById('journal-search-input');
    const f = document.getElementById('journal-filter-from');
    const t = document.getElementById('journal-filter-to');
    if (s) s.value = '';
    if (f) f.value = '';
    if (t) t.value = '';
    if (state.journal) {
        journalFilteredData = [...state.journal];
        renderJournalTable(state.journal);
        updateJournalKPIs(state.journal);
    }
}

function printJournal() {
    updateJournalPrintHeader();
    window.print();
}

async function downloadJournalPdf() {
    if (typeof isLicenseReadOnly === 'function' && isLicenseReadOnly()) {
        showToast("Operazione limitata: il condominio è in modalità Sola Lettura.", "warning");
    }
    showToast("Generazione PDF del Libro Giornale in corso...", "info");
    try {
        const res = await fetch('/api/export/journal-pdf', { headers: getAuthHeaders() });
        if (res.ok) {
            const blob = await res.blob();
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            const condoName = (state.activeCondominio && state.activeCondominio.nome) 
                ? state.activeCondominio.nome.replace(/[^a-zA-Z0-9_\-]/g, '_') 
                : 'Condominio';
            a.download = `Libro_Giornale_${condoName}.pdf`;
            document.body.appendChild(a);
            a.click();
            a.remove();
            showToast("PDF del Libro Giornale scaricato con successo!", "success");
            return;
        }
    } catch(e) {
        console.warn("Server PDF non disponibile, fallback su stampa:", e);
    }
    // Fallback immediato a stampa nativa ad alta fedeltà
    showToast("Apertura finestra di stampa e salvataggio PDF...", "info");
    printJournal();
}

async function exportJournalExcel() {
    if (typeof isLicenseReadOnly === 'function' && isLicenseReadOnly()) {
        showToast("Operazione limitata: il condominio è in modalità Sola Lettura.", "warning");
    }
    showToast("Generazione Excel del Libro Giornale in corso...", "info");
    try {
        const res = await fetch('/api/export/journal-excel', { headers: getAuthHeaders() });
        if (!res.ok) {
            const err = await res.json().catch(() => ({}));
            showToast(err.message || "Errore nell'esportazione Excel", "error");
            return;
        }
        const blob = await res.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        const condoName = (state.activeCondominio && state.activeCondominio.nome) 
            ? state.activeCondominio.nome.replace(/[^a-zA-Z0-9_\-]/g, '_') 
            : 'Condominio';
        a.download = `Libro_Giornale_${condoName}.xlsx`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        showToast("Excel del Libro Giornale scaricato con successo!", "success");
    } catch(e) {
        console.error("Errore export Excel:", e);
        showToast("Errore durante l'esportazione Excel.", "error");
    }
}

async function editJournalEntry(id) {
    const entry = state.journal.find(x => x.id === id);
    if (!entry) return;
    
    currentEditType = 'journal';
    currentEditId = id;
    
    document.getElementById('edit-modal-title').innerHTML = '<i class="fa-solid fa-pen text-amber-500 mr-2"></i> Modifica Registrazione';
    
    const fields = `
        <div class="grid grid-cols-2 gap-3">
            <div class="col-span-2">
                <label class="block text-xs font-bold text-slate-700 mb-1">Descrizione</label>
                <input type="text" id="edit-journal-desc" value="${entry.descrizione}" class="w-full border rounded-xl p-2.5 text-sm" required>
            </div>
            <div>
                <label class="block text-xs font-bold text-slate-700 mb-1">Data</label>
                <input type="date" id="edit-journal-data" value="${entry.data}" class="w-full border rounded-xl p-2.5 text-sm" required>
            </div>
            <div>
                <label class="block text-xs font-bold text-slate-700 mb-1">Conto</label>
                <input type="text" id="edit-journal-conto" value="${entry.conto || ''}" class="w-full border rounded-xl p-2.5 text-sm">
            </div>
            <div>
                <label class="block text-xs font-bold text-slate-700 mb-1">Dare (à)</label>
                <input type="number" step="0.01" id="edit-journal-dare" value="${entry.dare}" class="w-full border rounded-xl p-2.5 text-sm text-emerald-600 font-bold" required>
            </div>
            <div>
                <label class="block text-xs font-bold text-slate-700 mb-1">Avere (à)</label>
                <input type="number" step="0.01" id="edit-journal-avere" value="${entry.avere}" class="w-full border rounded-xl p-2.5 text-sm text-rose-600 font-bold" required>
            </div>
        </div>
    `;
    
    document.getElementById('edit-modal-fields').innerHTML = fields;
    document.getElementById('modal-edit-generic').classList.remove('hidden');
}

async function deleteJournalEntry(id) {
    if (!confirm('Sei sicuro di voler eliminare questa registrazione dal giornale?')) return;
    try {
        const res = await fetch('/api/journal/' + id, {
            method: 'DELETE',
            headers: getAuthHeaders()
        });
        if (res.ok) {
            showToast('Registrazione eliminata', 'success');
            loadGiornale();
        } else {
            showToast('Errore durante leliminazione', 'error');
        }
    } catch(e) { showToast('Errore di connessione', 'error'); }
}



async function addJournalEntry() {
    document.getElementById('journal-desc').value = '';
    document.getElementById('journal-dare').value = '0.00';
    document.getElementById('journal-avere').value = '0.00';
    document.getElementById('journal-data').value = new Date().toISOString().slice(0,10);
    
    try {
        const [resUsers, resSuppliers] = await Promise.all([
            fetch('/api/users', { headers: getAuthHeaders() }),
            fetch('/api/suppliers', { headers: getAuthHeaders() })
        ]);
        const dataUsers = await resUsers.json();
        const dataSuppliers = await resSuppliers.json();
        
        const select = document.getElementById('journal-user-id');
        let optionsHtml = '<option value="">-- Nessuno / Altro --</option>';
        optionsHtml += '<option value="Scontrino">Scontrino</option>';
        
        if (dataUsers.success && dataUsers.data.length > 0) {
            optionsHtml += '<optgroup label="Condomini">';
            optionsHtml += dataUsers.data.map(user => `<option value="${user.nome}">${user.nome}</option>`).join('');
            optionsHtml += '</optgroup>';
        }
        
        if (dataSuppliers.success && dataSuppliers.data.length > 0) {
            optionsHtml += '<optgroup label="Fornitori">';
            optionsHtml += dataSuppliers.data.map(supp => `<option value="${supp.ragione_sociale}">${supp.ragione_sociale}</option>`).join('');
            optionsHtml += '</optgroup>';
        }
        
        select.innerHTML = optionsHtml;
    } catch (e) { console.error('Errore fetch users/suppliers', e); }
    
    document.getElementById('modal-new-journal').classList.remove('hidden');
}

function closeJournalModal() {
    document.getElementById('modal-new-journal').classList.add('hidden');
}

async function handleNewJournalSubmit(e) {
    e.preventDefault();
    if (typeof isLicenseReadOnly === 'function' && isLicenseReadOnly()) {
        showToast("Operazione bloccata: il condominio è in modalità Sola Lettura.", "error");
        return;
    }
    
    const conto = document.getElementById('journal-user-id').value;
    const descrizione = document.getElementById('journal-desc').value;
    const data = document.getElementById('journal-data').value;
    const dare = parseFloat(document.getElementById('journal-dare').value || 0);
    const avere = parseFloat(document.getElementById('journal-avere').value || 0);
    
    try {
        const res = await fetch('/api/journal', {
            method: 'POST',
            headers: getAuthHeaders(),
            body: JSON.stringify({ 
                data, 
                numero: '1', 
                tipo: 'Generica', 
                descrizione, 
                dare, 
                avere, 
                conto: conto || 'Cassa' 
            })
        });
        
        if (res.ok) {
            showToast('Registrazione salvata', 'success');
            closeJournalModal();
            loadGiornale();
        } else {
            showToast('Errore durante il salvataggio', 'error');
        }
    } catch(err) {
        showToast('Errore di connessione', 'error');
    }
}

async function loadAudit() {
    const container = document.getElementById('audit-container');
    container.innerHTML = 'Caricamento...';
    try {
        const res = await fetch('/api/audit-log', { headers: getAuthHeaders() });
        const data = await res.json();
        if (data.success) {
            container.innerHTML = '<table class="w-full text-left text-xs"><thead class="bg-slate-50 border-b"><tr><th class="p-2">Data/Ora</th><th class="p-2">Utente</th><th class="p-2">Azione</th><th class="p-2">Tabella</th><th class="p-2">IP</th></tr></thead><tbody>' +
                data.data.map(a => `<tr><td class="p-2">${new Date(a.timestamp).toLocaleString()}</td><td class="p-2">${a.nome || 'Sistema'}</td><td class="p-2">${a.azione}</td><td class="p-2">${a.tabella}</td><td class="p-2">${a.ip}</td></tr>`).join('') +
                '</tbody></table>';
        }
    } catch(e) { container.innerHTML = 'Errore caricamento audit log'; }
}



// ============================================================================
// V2.0 SPEECH TO TEXT
// ============================================================================
let recognition;
let isRecording = false;
let transcriptText = "";

function startSpeechToText() {
    if (!('webkitSpeechRecognition' in window)) {
        alert("Il tuo browser non supporta il riconoscimento vocale. Usa Chrome o Edge.");
        return;
    }
    
    if (!recognition) {
        recognition = new webkitSpeechRecognition();
        recognition.continuous = true;
        recognition.interimResults = true;
        recognition.lang = 'it-IT';
        
        recognition.onresult = function(event) {
            let interimTranscript = '';
            for (let i = event.resultIndex; i < event.results.length; ++i) {
                if (event.results[i].isFinal) {
                    transcriptText += event.results[i][0].transcript + " ";
                } else {
                    interimTranscript += event.results[i][0].transcript;
                }
            }
            document.getElementById('speech-output').value = transcriptText + interimTranscript;
        };
        
        recognition.onerror = function(event) {
            console.error("Speech error", event.error);
        };
    }
    
    const btn = document.getElementById('btn-speech');
    if (isRecording) {
        recognition.stop();
        isRecording = false;
        btn.innerHTML = '<i class="fa-solid fa-microphone"></i> Avvia Dettatura';
    } else {
        recognition.start();
        isRecording = true;
        btn.innerHTML = '<i class="fa-solid fa-stop text-red-500"></i> Ferma Dettatura';
    }
}

function downloadVerbale() {
    const text = document.getElementById('speech-output').value;
    if (!text) return;
    const blob = new Blob([text], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'verbale_assemblea.txt';
    a.click();
}

// Hide speech section and new access button for non-admins
const oldSetupUIForRole = setupUIForRole;
setupUIForRole = function() {
    oldSetupUIForRole();
    const btnNuovoAccesso = document.getElementById('btn-nuovo-accesso');
    
    if (state.currentUser.role !== 'admin') {
        const speechSec = document.getElementById('speech-section');
        if (speechSec) speechSec.classList.add('hidden');
        if (btnNuovoAccesso) btnNuovoAccesso.classList.add('hidden');
    } else {
        const speechSec = document.getElementById('speech-section');
        if (speechSec) speechSec.classList.remove('hidden');
        if (btnNuovoAccesso) btnNuovoAccesso.classList.remove('hidden');
    }
}



// ============================================================================
// V2.0 MODALI INTERATTIVI DI MODIFICA
// ============================================================================
let currentEditType = '';
let currentEditId = null;
let currentEditItem = null;

function openEditModal(title, type, id, item, fieldsHtml) {
    currentEditType = type;
    currentEditId = id;
    currentEditItem = item;
    document.getElementById('edit-modal-title').innerHTML = '<i class="fa-solid fa-pen text-amber-500 mr-2"></i> ' + title;
    document.getElementById('edit-modal-fields').innerHTML = fieldsHtml;
    document.getElementById('modal-edit-generic').classList.remove('hidden');
}

function closeEditModal() {
    document.getElementById('modal-edit-generic').classList.add('hidden');
    currentEditType = '';
    currentEditId = null;
}

async function handleEditSubmit(e) {
    e.preventDefault();
    let endpoint = '';
    let payload = {};

    if (currentEditType === 'quote') {
        endpoint = '/api/quotes/' + currentEditId;
        payload = {
            ...currentEditItem,
            amount: parseFloat(document.getElementById('edit-amount').value),
            paid_amount: parseFloat(document.getElementById('edit-paid-amount')?.value || currentEditItem.paid_amount || 0),
            due_date: document.getElementById('edit-date').value,
            status: document.getElementById('edit-status').value
        };
    
        } else if (currentEditType === 'journal') {
        const dareStr = document.getElementById('edit-journal-dare').value;
        const avereStr = document.getElementById('edit-journal-avere').value;
        payload = {
            descrizione: document.getElementById('edit-journal-desc').value,
            data: document.getElementById('edit-journal-data').value,
            conto: document.getElementById('edit-journal-conto').value,
            dare: parseFloat(dareStr || 0),
            avere: parseFloat(avereStr || 0),
            tipo: 'Generica',
            numero: '1'
        };
        endpoint = '/api/journal/' + currentEditId;
    } else if (currentEditType === 'supplier') {
        endpoint = '/api/supplier-payments/' + currentEditId;
        payload = {
            ...currentEditItem,
            amount: parseFloat(document.getElementById('edit-amount').value),
            paid_amount: parseFloat(document.getElementById('edit-paid-amount')?.value || currentEditItem.paid_amount || 0),
            status: document.getElementById('edit-status').value
        };
    } else if (currentEditType === 'user') {
        endpoint = '/api/users/' + currentEditId;
        payload = {
            ...currentEditItem,
            unita: document.getElementById('edit-unita').value,
            role: document.getElementById('edit-role').value,
            telefono: document.getElementById('edit-telefono').value,
            dati_catastali: document.getElementById('edit-catasto').value
        };
    }

    try {
        const res = await fetch(endpoint, {
            method: 'PUT',
            headers: getAuthHeaders(),
            body: JSON.stringify(payload)
        });
        const data = await res.json();
        if (res.ok && data.success) {
            showToast('Modifica salvata con successo!', 'success');
            closeEditModal();
            if (currentEditType === 'user') loadUsersList();
            else if (currentEditType === 'journal') loadGiornale();
            else loadAccountingData();
        } else {
            showToast('Errore durante la modifica.', 'error');
        }
    } catch(err) {
        showToast('Errore di connessione', 'error');
    }
}

async function editQuote(id) {
    if (typeof isLicenseReadOnly === 'function' && isLicenseReadOnly()) {
        showToast("Condominio in Sola Lettura: modifica rate bloccata.", "warning");
        return;
    }
    const q = state.quotes.find(x => x.id === id) || { amount: 0, paid_amount: 0, due_date: '', status: 'In sospeso', title: 'Quota' };
    const fields = `
        <div>
            <label class="block text-xs font-bold text-slate-700 mb-1">Importo Totale (€)</label>
            <input type="number" step="0.01" id="edit-amount" value="${q.amount}" class="w-full border rounded-xl p-2.5 text-sm" required>
        </div>
        <div>
            <label class="block text-xs font-bold text-slate-700 mb-1">Importo Già Versato (€)</label>
            <input type="number" step="0.01" id="edit-paid-amount" value="${q.paid_amount || 0}" class="w-full border rounded-xl p-2.5 text-sm">
        </div>
        <div>
            <label class="block text-xs font-bold text-slate-700 mb-1">Scadenza</label>
            <input type="date" id="edit-date" value="${q.due_date}" class="w-full border rounded-xl p-2.5 text-sm" required>
        </div>
        <div>
            <label class="block text-xs font-bold text-slate-700 mb-1">Stato</label>
            <select id="edit-status" class="w-full border rounded-xl p-2.5 text-sm">
                <option value="In sospeso" ${q.status === 'In sospeso' ? 'selected' : ''}>In sospeso</option>
                <option value="Parziale" ${q.status === 'Parziale' ? 'selected' : ''}>Parziale</option>
                <option value="Pagato" ${q.status === 'Pagato' ? 'selected' : ''}>Pagato</option>
            </select>
        </div>
    `;
    openEditModal("Modifica Quota", 'quote', id, q, fields);
}

async function editSupplier(id) {
    const s = state.suppliers.find(x => x.id === id) || { amount: 0, paid_amount: 0, status: 'Da liquidare', supplier_name: 'Fornitore' };
    const fields = `
        <div>
            <label class="block text-xs font-bold text-slate-700 mb-1">Importo Fattura (€)</label>
            <input type="number" step="0.01" id="edit-amount" value="${s.amount}" class="w-full border rounded-xl p-2.5 text-sm" required>
        </div>
        <div>
            <label class="block text-xs font-bold text-slate-700 mb-1">Importo Già Liquidato (€)</label>
            <input type="number" step="0.01" id="edit-paid-amount" value="${s.paid_amount || 0}" class="w-full border rounded-xl p-2.5 text-sm">
        </div>
        <div>
            <label class="block text-xs font-bold text-slate-700 mb-1">Stato Pagamento</label>
            <select id="edit-status" class="w-full border rounded-xl p-2.5 text-sm">
                <option value="Da liquidare" ${s.status === 'Da liquidare' ? 'selected' : ''}>Da liquidare</option>
                <option value="Parziale" ${s.status === 'Parziale' ? 'selected' : ''}>Parziale</option>
                <option value="In elaborazione" ${s.status === 'In elaborazione' ? 'selected' : ''}>In elaborazione</option>
                <option value="Pagato" ${s.status === 'Pagato' ? 'selected' : ''}>Pagato</option>
            </select>
        </div>
    `;
    openEditModal("Modifica Fattura Fornitore", 'supplier', id, s, fields);
}

async function editUser(id) {
    const u = state.users.find(x => x.id === id) || { unita: '', role: 'condomino', nome: 'Utente' };
    
    // Parse dati_catastali if possible
    let sez='', fg='', part='', sub='';
    if (u.dati_catastali) {
        const parts = u.dati_catastali.split(', ');
        parts.forEach(p => {
            if (p.startsWith('Sez.')) sez = p.replace('Sez. ', '').trim();
            if (p.startsWith('Fg.')) fg = p.replace('Fg. ', '').trim();
            if (p.startsWith('Part.')) part = p.replace('Part. ', '').trim();
            if (p.startsWith('Sub.')) sub = p.replace('Sub. ', '').trim();
        });
    }

    const fields = `
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
                <label class="block text-xs font-bold text-slate-700 mb-1">Nome e Cognome</label>
                <input type="text" id="edit-nome" value="${u.nome || ''}" class="w-full border rounded-xl p-2.5 text-sm">
            </div>
            <div>
                <label class="block text-xs font-bold text-slate-700 mb-1">Email</label>
                <input type="email" id="edit-email" value="${u.email || ''}" class="w-full border rounded-xl p-2.5 text-sm">
            </div>
            <div>
                <label class="block text-xs font-bold text-slate-700 mb-1">Nuova Password (lascia vuoto per non cambiare)</label>
                <div class="relative">
                    <input type="password" id="edit-password" placeholder="Min 8 car, 1 maiusc, 1 num, 1 spec" class="w-full border rounded-xl p-2.5 text-sm pr-10">
                    <button type="button" onclick="togglePasswordVisibility('edit-password', 'eye-edit-pwd')" class="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-400 hover:text-slate-600">
                        <i id="eye-edit-pwd" class="fa-solid fa-eye"></i>
                    </button>
                </div>
            </div>
            <div>
                <label class="block text-xs font-bold text-slate-700 mb-1">Telefono</label>
                <input type="text" id="edit-telefono" value="${u.telefono || ''}" class="w-full border rounded-xl p-2.5 text-sm">
            </div>
            <div>
                <label class="block text-xs font-bold text-slate-700 mb-1">Unità / Scala</label>
                <input type="text" id="edit-unita" value="${u.unita || ''}" class="w-full border rounded-xl p-2.5 text-sm">
            </div>
            <div>
                <label class="block text-xs font-bold text-slate-700 mb-1">Ruolo</label>
                <select id="edit-role" class="w-full border rounded-xl p-2.5 text-sm">
                    <option value="condomino" ${u.role === 'condomino' ? 'selected' : ''}>Condòmino</option>
                    <option value="admin" ${u.role === 'admin' ? 'selected' : ''}>Amministratore</option>
                </select>
            </div>
            <div class="col-span-full">
                <label class="block text-xs font-bold text-slate-700 mb-1">Dati Catastali (Sez, Fg, Part, Sub)</label>
                <div class="grid grid-cols-4 gap-2">
                    <input type="text" id="edit-catasto-sez" placeholder="Sez." value="${sez}" class="w-full px-2 py-2 text-xs rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-500">
                    <input type="text" id="edit-catasto-fg" placeholder="Fg." value="${fg}" class="w-full px-2 py-2 text-xs rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-500">
                    <input type="text" id="edit-catasto-part" placeholder="Part." value="${part}" class="w-full px-2 py-2 text-xs rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-500">
                    <input type="text" id="edit-catasto-sub" placeholder="Sub." value="${sub}" class="w-full px-2 py-2 text-xs rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-500">
                </div>
            </div>
        </div>
    `;
    openEditModal("Modifica Utente", 'user', id, u, fields);
}
async function deleteUser(id) {
    if (!confirm("Sicuro di voler eliminare questo utente?")) return;
    try {
        await fetch('/api/users/'+id, {
            method: 'DELETE',
            headers: getAuthHeaders()
        });
        loadUsersList();
    } catch(e) {}
}


// ============================================================================
// EXPORT EXCEL
// ============================================================================
async function exportExcel(e) {
    if (e) e.preventDefault();
    if (typeof isLicenseReadOnly === 'function' && isLicenseReadOnly()) {
        showToast("Operazione bloccata: l'esportazione Excel è disabilitata per i condomini con licenza scaduta o sospesa (Sola Lettura).", "warning");
        return;
    }
    try {
        const res = await fetch('/api/export/accounting-excel', { headers: getAuthHeaders() });
        if (!res.ok) {
            const errData = await res.json().catch(() => ({}));
            showToast(errData.message || "Esportazione bloccata o non consentita", "error");
            return;
        }
        const blob = await res.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = "Bilancio_Condominiale.xlsx";
        document.body.appendChild(a);
        a.click();
        a.remove();
        showToast('Download in corso', 'success');
    } catch(err) {
        showToast('Errore durante esportazione Excel', 'error');
    }
}

// ==========================================
// GESTIONE unitaMILLESIMI
// ==========================================

async function loadUnita() {
    const cId = state.activeCondominioId || sessionStorage.getItem('active_Condominio_id');
    if(!cId) return;
    
    try {
        const res = await fetch('/api/unita', { headers: getAuthHeaders() });
        const data = await res.json();
        
        const tbody = document.getElementById('unita-list');
        if(!tbody) return;
        
        if (res.ok && data.success) {
            state.unitaList = data.data; // Salviamo nello state
            tbody.innerHTML = data.data.map(u => {
                const propDisplay = (u.prop_cognome || u.prop_nome)
                    ? `${u.prop_cognome || ''} ${u.prop_nome || ''}`.trim()
                    : (u.condomino_nome || 'Nessuno');
                const condDisplay = (u.cond_cognome || u.cond_nome)
                    ? `${u.cond_cognome || ''} ${u.cond_nome || ''}`.trim()
                    : '-';
                const userEmail = u.condomino_email ? `<div class="text-[11px] text-slate-400"><i class="fa-solid fa-user-circle mr-1"></i>${u.condomino_email}</div>` : '';
                return `
                <tr class="hover:bg-slate-50 transition-colors">
                    <td class="px-6 py-4">
                        <div class="font-bold text-slate-800">${u.identificativo}</div>
                        <div class="text-[11px] text-slate-400">Sc: ${u.scala || '-'} | P: ${u.piano || '-'}</div>
                    </td>
                    <td class="px-6 py-4"><span class="px-2 py-1 bg-slate-100 rounded-lg text-xs font-semibold">${u.tipo}</span></td>
                    <td class="px-6 py-4">
                        <div class="font-bold text-slate-700">${propDisplay}</div>
                        ${userEmail}
                    </td>
                    <td class="px-6 py-4 font-medium text-slate-600">${condDisplay}</td>
                    <td class="px-6 py-4 font-mono">${(parseFloat(u.millesimi_proprieta) || 0).toFixed(2)}</td>
                    <td class="px-6 py-4 font-mono">${(parseFloat(u.millesimi_scale) || 0).toFixed(2)}</td>
                    <td class="px-6 py-4 font-mono">${(parseFloat(u.millesimi_ascensore) || 0).toFixed(2)}</td>
                    <td class="px-6 py-4 text-right admin-only">
                        <button onclick="openUnitaModal(${u.id})" class="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors" title="Modifica Unità">
                            <i class="fa-solid fa-pen"></i>
                        </button>
                    </td>
                </tr>
            `;}).join('');
        }
        applyRoleVisibility();
    } catch(e) {
        console.error('Errore loadUnita', e);
    }
}

async function openUnitaModal(uId = null) {
    if (typeof isLicenseReadOnly === 'function' && isLicenseReadOnly()) {
        showToast("Condominio in Sola Lettura: censimento o modifica unità bloccata.", "warning");
        return;
    }
    let u = null;
    if (uId && state.unitaList) {
        u = state.unitaList.find(x => x.id === uId);
    }

    // 1. Carica la rubrica persone per i select Proprietario e Conduttore
    try {
        const res = await fetch('/api/anagrafica-persone', { headers: getAuthHeaders() });
        const data = await res.json();
        if (data.success) {
            state.anagraficaPersone = data.data;
            const selProp = document.getElementById('unita-proprietario');
            const selCond = document.getElementById('unita-conduttore');
            
            let propOpts = '<option value="">-- Seleziona Proprietario --</option>';
            let condOpts = '<option value="">-- Nessun Inquilino --</option>';
            
            if (data.data && data.data.length > 0) {
                data.data.forEach(p => {
                    const label = `${p.cognome} ${p.nome}${p.ruolo_default ? ' (' + p.ruolo_default + ')' : ''}`;
                    propOpts += `<option value="${p.id}">${label}</option>`;
                    condOpts += `<option value="${p.id}">${label}</option>`;
                });
            } else {
                propOpts = '<option value="">-- Nessuna persona in Rubrica (vai in Anagrafica) --</option>';
            }
            
            if (selProp) selProp.innerHTML = propOpts;
            if (selCond) selCond.innerHTML = condOpts;
        }
    } catch(e) { console.error('Errore fetch rubrica persone', e); }

    // 2. Carica gli utenti registrati per il select Account Utente Piattaforma (User ID)
    try {
        const resUsers = await fetch('/api/users', { headers: getAuthHeaders() });
        const dataUsers = await resUsers.json();
        if (dataUsers.success) {
            state.users = dataUsers.data;
            const selUser = document.getElementById('unita-user-id');
            if (selUser) {
                let userOpts = '<option value="">-- Nessun Account Web Collegato (Sfitto/Esterno) --</option>';
                if (dataUsers.data && dataUsers.data.length > 0) {
                    dataUsers.data.forEach(usr => {
                        userOpts += `<option value="${usr.id}">${usr.nome} (${usr.email})</option>`;
                    });
                }
                selUser.innerHTML = userOpts;
            }
        }
    } catch(e) { console.error('Errore fetch users', e); }

    document.getElementById('unita-modal-title').textContent = u ? 'Modifica Unità' : 'Nuova Unità';
    document.getElementById('unita-id').value = u ? u.id : '';
    document.getElementById('unita-identificativo').value = u ? u.identificativo : '';
    document.getElementById('unita-tipo').value = u ? u.tipo : 'Appartamento';
    document.getElementById('unita-scala').value = u ? (u.scala || '') : '';
    document.getElementById('unita-piano').value = u ? (u.piano || '') : '';
    document.getElementById('unita-mill-prop').value = u ? u.millesimi_proprieta : '0';
    document.getElementById('unita-mill-scale').value = u ? u.millesimi_scale : '0';
    document.getElementById('unita-mill-asc').value = u ? u.millesimi_ascensore : '0';
    if(document.getElementById('unita-proprietario')) document.getElementById('unita-proprietario').value = u ? (u.proprietario_id || '') : '';
    if(document.getElementById('unita-conduttore')) document.getElementById('unita-conduttore').value = u ? (u.conduttore_id || '') : '';
    if(document.getElementById('unita-user-id')) document.getElementById('unita-user-id').value = u ? (u.user_id || '') : '';
    
    document.getElementById('unita-modal').classList.remove('hidden');
}

function closeUnitaModal() {
    document.getElementById('unita-modal').classList.add('hidden');
}

async function saveUnita(e) {
    e.preventDefault();
    if (typeof isLicenseReadOnly === 'function' && isLicenseReadOnly()) {
        showToast("Operazione bloccata: il condominio è in modalità Sola Lettura.", "error");
        return;
    }
    const id = document.getElementById('unita-id').value;
    const propVal = document.getElementById('unita-proprietario') ? document.getElementById('unita-proprietario').value : null;
    const condVal = document.getElementById('unita-conduttore') ? document.getElementById('unita-conduttore').value : null;
    const userVal = document.getElementById('unita-user-id') ? document.getElementById('unita-user-id').value : null;

    const body = {
        identificativo: document.getElementById('unita-identificativo').value,
        tipo: document.getElementById('unita-tipo').value,
        scala: document.getElementById('unita-scala').value,
        piano: document.getElementById('unita-piano').value,
        millesimi_proprieta: parseFloat(document.getElementById('unita-mill-prop').value) || 0,
        millesimi_scale: parseFloat(document.getElementById('unita-mill-scale').value) || 0,
        millesimi_ascensore: parseFloat(document.getElementById('unita-mill-asc').value) || 0,
        proprietario_id: propVal ? parseInt(propVal, 10) : null,
        conduttore_id: condVal ? parseInt(condVal, 10) : null,
        user_id: userVal ? parseInt(userVal, 10) : null
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
            showToast(id ? "Unità aggiornata con successo." : "Nuova unità censita con successo.", "success");
        } else {
            const errData = await res.json().catch(() => ({}));
            alert(errData.message || "Errore salvataggio unità");
        }
    } catch(err) {
        console.error(err);
        showToast("Errore di rete o server durante il salvataggio.", "error");
    }
}


async function exportUsersExcel(e) {
    if (e) e.preventDefault();
    if (typeof isLicenseReadOnly === 'function' && isLicenseReadOnly()) {
        showToast("Operazione bloccata: l'esportazione dell'elenco utenti è disabilitata per i condomini con licenza scaduta o sospesa (Sola Lettura).", "warning");
        return;
    }
    if (!state.users || state.users.length === 0) return;
    
    let csv = 'Nome,Email,Telefono,Unità,Dati Catastali,Ruolo,Data Creazione\n';
    state.users.forEach(u => {
        const row = [
            u.nome,
            u.email,
            u.telefono || '',
            u.unita || '',
            u.dati_catastali || '',
            u.role === 'admin' ? 'Amministratore' : 'condomino',
            formatDate(u.created_at)
        ].map(val => '"' + String(val).replace(/"/g, '""') + '"').join(',');
        csv += row + '\n';
    });
    
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = "Elenco_Utenti.csv";
    document.body.appendChild(a);
    a.click();
    a.remove();
    showToast('Download completato', 'success');
}

// --- ANAGRAFICA FORNITORI ---
let editingSupplierId = null;

async function loadSupplierRegistry() {
    const container = document.getElementById('suppliers-registry-body');
    if (!container) return;
    try {
        const res = await fetch('/api/suppliers', { headers: getAuthHeaders() });
        const data = await res.json();
        if (data.success) {
            window.suppliersRegistryData = data.data;
            if (data.data.length === 0) {
                container.innerHTML = '<tr><td colspan="5" class="p-4 text-center text-slate-500 italic">Nessun fornitore registrato</td></tr>';
            } else {
                container.innerHTML = data.data.map(s => `
                    <tr>
                        <td class="py-3 px-4 font-semibold">${s.ragione_sociale}</td>
                        <td class="py-3 px-4">${s.partita_iva || ''} ${s.codice_fiscale ? ' / ' + s.codice_fiscale : ''}</td>
                        <td class="py-3 px-4">${s.email || ''} ${s.telefono ? '<br>' + s.telefono : ''}</td>
                        <td class="py-3 px-4">${s.iban || ''}</td>
                        <td class="py-3 px-4 text-right">
                            <button onclick="editSupplierRegistry(${s.id})" class="text-indigo-600 hover:text-indigo-800 mr-2 no-print"><i class="fa-solid fa-pen"></i></button>
                            <button onclick="deleteSupplierRegistry(${s.id})" class="text-red-500 hover:text-red-700 no-print"><i class="fa-solid fa-trash"></i></button>
                        </td>
                    </tr>`).join('');
            }
        }
    } catch(e) { console.error('Errore caricamento anagrafica fornitori', e); }
}

function openSupplierRegistryModal() {
    if (typeof isLicenseReadOnly === 'function' && isLicenseReadOnly()) {
        showToast("Condominio in Sola Lettura: censimento fornitori bloccato.", "warning");
        return;
    }
    editingSupplierId = null;
    document.getElementById('form-supplier-registry').reset();
    document.querySelector('#modal-supplier-registry h3').innerHTML = '<i class="fa-solid fa-address-book text-indigo-600 mr-2"></i>Nuovo Fornitore';
    document.getElementById('modal-supplier-registry').classList.remove('hidden');
}

function editSupplierRegistry(id) {
    if (typeof isLicenseReadOnly === 'function' && isLicenseReadOnly()) {
        showToast("Condominio in Sola Lettura: modifica fornitori bloccata.", "warning");
        return;
    }
    editingSupplierId = id;
    const supp = window.suppliersRegistryData.find(s => s.id === id);
    if (!supp) return;

    document.getElementById('supp-name').value = supp.ragione_sociale;
    document.getElementById('supp-piva').value = supp.partita_iva || '';
    document.getElementById('supp-cf').value = supp.codice_fiscale || '';
    document.getElementById('supp-address').value = supp.indirizzo || '';
    document.getElementById('supp-email').value = supp.email || '';
    document.getElementById('supp-phone').value = supp.telefono || '';
    document.getElementById('supp-iban').value = supp.iban || '';
    document.getElementById('supp-notes').value = supp.note || '';

    document.querySelector('#modal-supplier-registry h3').innerHTML = '<i class="fa-solid fa-address-book text-indigo-600 mr-2"></i>Modifica Fornitore';
    document.getElementById('modal-supplier-registry').classList.remove('hidden');
}

function closeSupplierRegistryModal() {
    document.getElementById('modal-supplier-registry').classList.add('hidden');
    editingSupplierId = null;
}

async function handleSupplierRegistrySubmit(event) {
    event.preventDefault();
    if (typeof isLicenseReadOnly === 'function' && isLicenseReadOnly()) {
        showToast("Operazione bloccata: il condominio è in modalità Sola Lettura.", "error");
        return;
    }
    const payload = {
        ragione_sociale: document.getElementById('supp-name').value.trim(),
        partita_iva: document.getElementById('supp-piva').value.trim(),
        codice_fiscale: document.getElementById('supp-cf').value.trim(),
        indirizzo: document.getElementById('supp-address').value.trim(),
        email: document.getElementById('supp-email').value.trim(),
        telefono: document.getElementById('supp-phone').value.trim(),
        iban: document.getElementById('supp-iban').value.trim(),
        note: document.getElementById('supp-notes').value.trim()
    };

    try {
        const method = editingSupplierId ? 'PUT' : 'POST';
        const url = editingSupplierId ? `/api/suppliers/${editingSupplierId}` : '/api/suppliers';
        await fetch(url, {
            method,
            headers: getAuthHeaders(),
            body: JSON.stringify(payload)
        });
        closeSupplierRegistryModal();
        loadSupplierRegistry();
    } catch(e) { alert('Errore salvataggio fornitore'); }
}

async function deleteSupplierRegistry(id) {
    if (!confirm('Sei sicuro di voler eliminare questo fornitore?')) return;
    try {
        await fetch(`/api/suppliers/${id}`, {
            method: 'DELETE',
            headers: getAuthHeaders()
        });
        loadSupplierRegistry();
    } catch(e) { alert('Errore eliminazione fornitore'); }
}


// ============================================================================
// DATI AMMINISTRATORE
// ============================================================================
async function loadAdminProfile() {
    try {
        const res = await fetch('/api/Condominio', { headers: getAuthHeaders() });
        const data = await res.json();
        if (data.success) {
            state.CondominioInfo = data.data;
            renderAdminProfileView();
        }
    } catch (e) {
        showToast('Errore caricamento dati amministratore', 'error');
    }
}

function renderAdminProfileView() {
    const admin = state.CondominioInfo || {};
    const viewMode = document.getElementById('admin-view-mode');
    
    document.getElementById('admin-nome-input').value = admin.admin_nome || '';
    document.getElementById('admin-cognome-input').value = admin.admin_cognome || '';
    document.getElementById('admin-titolo-input').value = admin.admin_titolo || '';
    document.getElementById('admin-telefono-input').value = admin.admin_telefono || '';
    document.getElementById('admin-cellulare-input').value = admin.admin_cellulare || '';
    document.getElementById('admin-emergenze-input').value = admin.admin_emergenze || '';
    document.getElementById('admin-email-input').value = admin.admin_email || '';
    document.getElementById('admin-pec-input').value = admin.admin_pec || '';

    const fields = [
        { icon: 'fa-user', label: 'Nome Completo', value: (admin.admin_titolo ? admin.admin_titolo + ' ' : '') + (admin.admin_nome || '') + ' ' + (admin.admin_cognome || '') },
        { icon: 'fa-envelope', label: 'Email Ufficiale', value: admin.admin_email },
        { icon: 'fa-at', label: 'PEC', value: admin.admin_pec },
        { icon: 'fa-phone', label: 'Telefono Fisso', value: admin.admin_telefono },
        { icon: 'fa-mobile-screen', label: 'Cellulare', value: admin.admin_cellulare },
        { icon: 'fa-truck-medical', label: 'Emergenze', value: admin.admin_emergenze, isEmergency: true }
    ].filter(f => f.value && f.value.trim() !== '');

    if (fields.length > 0) {
        viewMode.innerHTML = fields.map(f => {
            const color = f.isEmergency ? 'text-rose-600 bg-rose-50' : 'text-blue-600 bg-blue-50';
            const labelColor = f.isEmergency ? 'text-rose-500 font-bold' : 'text-slate-500';
            return `
                <div class="flex items-center space-x-4 p-4 rounded-2xl border border-slate-100 bg-slate-50/50">
                    <div class="w-12 h-12 rounded-xl flex items-center justify-center text-xl shrink-0 ${color}">
                        <i class="fa-solid ${f.icon}"></i>
                    </div>
                    <div class="overflow-hidden">
                        <p class="text-[10px] font-bold uppercase tracking-wider mb-0.5 ${labelColor}">${f.label}</p>
                        <p class="font-bold text-slate-800 truncate">${f.value}</p>
                    </div>
                </div>
            `;
        }).join('');
    } else {
        viewMode.innerHTML = `<div class="col-span-full py-8 text-center text-slate-400 bg-slate-50 rounded-2xl border border-dashed border-slate-200">Nessun dato dell'amministratore inserito.</div>`;
    }
}

function toggleEditAdmin(showForm) {
    document.getElementById('admin-view-mode').classList.toggle('hidden', showForm);
    document.getElementById('admin-edit-form').classList.toggle('hidden', !showForm);
    document.getElementById('btn-edit-admin').classList.toggle('hidden', showForm);
}

async function saveAdminProfile(e) {
    e.preventDefault();
    const payload = {
        admin_nome: document.getElementById('admin-nome-input').value,
        admin_cognome: document.getElementById('admin-cognome-input').value,
        admin_titolo: document.getElementById('admin-titolo-input').value,
        admin_telefono: document.getElementById('admin-telefono-input').value,
        admin_cellulare: document.getElementById('admin-cellulare-input').value,
        admin_emergenze: document.getElementById('admin-emergenze-input').value,
        admin_email: document.getElementById('admin-email-input').value,
        admin_pec: document.getElementById('admin-pec-input').value
    };

    try {
        const res = await fetch('/api/Condominio', {
            method: 'PUT',
            headers: getAuthHeaders(),
            body: JSON.stringify(payload)
        });
        const data = await res.json();
        if (data.success) {
            showToast('Dati amministratore salvati', 'success');
            toggleEditAdmin(false);
            loadAdminProfile();
        } else {
            showToast('Errore nel salvataggio', 'error');
        }
    } catch (_) {
        showToast('Errore di connessione', 'error');
    }
}
// Inattività - Logout automatico dopo 15 minuti
let inactivityTimer;
const INACTIVITY_LIMIT = 15 * 60 * 1000;

function resetInactivityTimer() {
    clearTimeout(inactivityTimer);
    inactivityTimer = setTimeout(() => {
        console.warn('Sessione scaduta per inattività.');
        logout();
    }, INACTIVITY_LIMIT);
}

['mousemove', 'mousedown', 'keypress', 'touchmove', 'scroll'].forEach(event => {
    document.addEventListener(event, resetInactivityTimer, true);
});

resetInactivityTimer();






// ============================================================================
// MODULO CONVOCAZIONE ASSEMBLEA
// ============================================================================
async function openConvocazioneModal() {
    if (typeof isLicenseReadOnly === 'function' && isLicenseReadOnly()) {
        showToast("Condominio in Sola Lettura: invio convocazioni bloccato.", "warning");
        return;
    }
    const modal = document.getElementById('convocazione-modal');
    if (!modal) return;
    
    // Popola select utenti dinamicamente
    try {
        const res = await fetch('/api/users', { headers: getAuthHeaders() });
        const data = await res.json();
        if (data.success) {
            state.users = data.data;
        }
    } catch (e) {
        console.error('Failed to fetch users', e);
    }

    const select = document.getElementById('convocazione-user');
    select.innerHTML = '<option value="">-- Seleziona il condomino --</option>';
    if (state.users) {
        state.users.forEach(u => {
            select.innerHTML += `<option value="${u.id}">${u.nome} (${u.unita || 'Nessuna Unita'})</option>`;
        });
    }
    
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
        showToast('Seleziona un condomino destinatario.', 'error');
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
            
            <p>Gentile condomino/a,</p>
            <p>La S.V. &egrave; invitata a partecipare all'Assemblea del Condominio "${activeCondoName}", che si terr&agrave;:</p>
            
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
                <h2>DELEGA PER ASSEMBLEA CondominiALE</h2>
                <p>Il/La sottoscritto/a <strong>${u.nome}</strong>, proprietario/a dell'unità <strong>${u.unita || ''}</strong>,</p>
                <p><strong>DELEGA</strong></p>
                <p>Il/La Sig./Sig.ra ________________________________________________________________________, a rappresentarlo/a nell'Assemblea Condominiale convocata per il giorno <strong>${formatDate(d2)}</strong> in seconda convocazione, conferendogli/le il pi&ugrave; ampio potere di discussione e votazione su tutti gli argomenti posti all'ordine del giorno.</p>
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
    
    const odgHtml = odg.split('\n').map(r => '<li>' + r + '</li>').join('');
    
    const activeCondoName = state.currentUser.condomini ? state.currentUser.condomini.find(c => c.id == state.activeCondominioId)?.nome : 'Condominio';
    
    const html = `
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
                <h3>${activeCondoName}</h3>
            </div>
            
            <div class="destinatario">
                <strong>DESTINATARIO:</strong><br>
                Gent.le Sig./Sig.ra ${u.nome}<br>
                Unità: ${u.unita || ''}<br>
            </div>
            
            <div class="oggetto">
                OGGETTO: Convocazione Assemblea Condominiale
            </div>
            
            <div class="content">
                <p>La S.V. è invitata a partecipare all'Assemblea del Condominio "${activeCondoName}", che si terrà:</p>
                
                <p>
                    <strong>In prima convocazione:</strong><br>
                    Il ${formatDate(data1)}<br>
                    Luogo: ${luogo1}
                </p>
                
                <p>
                    <strong>In seconda convocazione:</strong><br>
                    Il ${formatDate(data2)}<br>
                    Luogo: ${luogo2}
                </p>
                
                <p>Per discutere e deliberare sul seguente:</p>
                
                <p><strong>ORDINE DEL GIORNO</strong></p>
                <ol class="odg">
                    ${odgHtml}
                </ol>
            </div>
            
            <div class="footer">
                L'Amministratore<br>
                <em>_______________________</em>
            </div>
        </body>
        </html>
    `;

    try {
        showToast('Invio email in corso...', 'info');
        const res = await fetch('/api/assemblies/send-convocation', {
            method: 'POST',
            headers: getAuthHeaders(),
            body: JSON.stringify({ userId: u.id, email: u.email, nome: u.nome, htmlContent: html, activeCondoName })
        });
        
        const data = await res.json();
        if (data.success) {
            showToast('Email inviata con successo!', 'success');
            if (data.previewUrl) {
                console.log("Email Preview URL:", data.previewUrl);
                alert("Email di test generata! Clicca OK per aprire l'anteprima in una nuova scheda.");
                window.open(data.previewUrl, '_blank');
            }
            closeConvocazioneModal();
        } else {
            showToast('Errore invio email: ' + data.message, 'error');
        }
    } catch (e) {
        console.error(e);
        showToast('Errore di connessione durante l\'invio dell\'email.', 'error');
    }
}



async function loadConvocationsLog() {
    if (state.currentUser.role !== 'admin') return;
    try {
        if (!state.users || state.users.length === 0) {
            const uRes = await fetch('/api/users', { headers: getAuthHeaders() });
            const uData = await uRes.json();
            if (uData.success) {
                state.users = uData.data;
                populateCommUsersSelect();
            }
        }
        const res = await fetch('/api/assemblies/convocations-log', { headers: getAuthHeaders() });
        const data = await res.json();
        
                const htmlContent = (data.success && data.data.length > 0) ? data.data.map(log => `
                <div class="bg-white rounded-2xl border border-slate-200 shadow-xs p-4 flex justify-between items-center">
                    <div>
                        <div class="font-bold text-slate-900">${log.destinatario}</div>
                        <div class="text-xs text-slate-500">${log.email}</div>
                    </div>
                    <div class="text-right">
                        <div class="text-xs font-bold text-slate-700">${formatDate(log.data_invio)}</div>
                        ${log.preview_url ? `<a href="${log.preview_url}" target="_blank" class="text-[10px] text-blue-600 hover:underline">Vedi Email Inviata</a>` : ''}
                    </div>
                </div>
            `).join('') : `<div class="py-4 text-center text-slate-400 bg-white rounded-2xl border text-sm italic">Nessuna email inviata finora.</div>`;
            
        const container1 = document.getElementById('assemblies-log-container');
        if (container1) container1.innerHTML = htmlContent;
        
        const container2 = document.getElementById('communications-log-container');
        if (container2) container2.innerHTML = htmlContent;
    } catch (e) {
        console.error("Errore caricamento log", e);
    }
}


async function sendReceipt(quoteId) {
    if (typeof isLicenseReadOnly === 'function' && isLicenseReadOnly()) {
        showToast("Condominio in Sola Lettura: invio ricevute bloccato.", "warning");
        return;
    }
    if (!confirm('Vuoi generare e inviare via email la ricevuta di pagamento in formato PDF al condomino?')) return;
    try {
        showToast('Generazione ricevuta in corso...', 'info');
        const activeCondoName = state.currentUser.condomini ? state.currentUser.condomini.find(c => c.id == state.activeCondominioId)?.nome : 'Condominio';
        const res = await fetch(`/api/quotes/${quoteId}/send-receipt`, {
            method: 'POST',
            headers: getAuthHeaders(),
            body: JSON.stringify({ activeCondoName })
        });
        const data = await res.json();
        if (data.success) {
            showToast('Ricevuta inviata con successo!', 'success');
        } else {
            showToast('Errore: ' + data.message, 'error');
        }
    } catch (e) {
        showToast('Errore di connessione', 'error');
    }
}

async function sendReminder(quoteId) {
    if (typeof isLicenseReadOnly === 'function' && isLicenseReadOnly()) {
        showToast("Condominio in Sola Lettura: invio solleciti bloccato.", "warning");
        return;
    }
    if (!confirm('Vuoi generare e inviare via email un formale sollecito di pagamento in formato PDF al condomino?')) return;
    try {
        showToast('Generazione sollecito in corso...', 'info');
        const activeCondoName = state.currentUser.condomini ? state.currentUser.condomini.find(c => c.id == state.activeCondominioId)?.nome : 'Condominio';
        const res = await fetch(`/api/quotes/${quoteId}/send-reminder`, {
            method: 'POST',
            headers: getAuthHeaders(),
            body: JSON.stringify({ activeCondoName })
        });
        const data = await res.json();
        if (data.success) {
            showToast('Sollecito inviato con successo!', 'success');
        } else {
            showToast('Errore: ' + data.message, 'error');
        }
    } catch (e) {
        showToast('Errore di connessione', 'error');
    }
}


async function populateCommUsersSelect() {
    const select = document.getElementById('comm-user');
    if (!select) return;
    
    // Reset but keep first option
    const firstOpt = select.options[0];
    select.innerHTML = '';
    select.appendChild(firstOpt);
    
    state.users.forEach(u => {
        if (u.email) {
            select.innerHTML += `<option value="${u.id}">${u.nome} (${u.unita || 'Nessuna Unità'})</option>`;
        }
    });
}

// Ensure this is called when loading users
const loadUsersListTarget = "populateQuoteUsersSelect();";


async function sendCommunication() {
    const userId = document.getElementById('comm-user').value;
    const subject = document.getElementById('comm-subject').value;
    const message = document.getElementById('comm-message').value;
    
    if (!subject.trim() || !message.trim()) {
        alert('Compila sia l\'oggetto che il testo della comunicazione.');
        return;
    }
    
    if (!confirm('Vuoi generare e inviare questa comunicazione in formato PDF ai destinatari selezionati?')) return;
    
    try {
        showToast('Generazione PDF e invio in corso...', 'info');
        const activeCondoName = state.currentUser.condomini ? state.currentUser.condomini.find(c => c.id == state.activeCondominioId)?.nome : 'Condominio';
        
        const res = await fetch('/api/communications/send', {
            method: 'POST',
            headers: getAuthHeaders(),
            body: JSON.stringify({ userId, subject, message, activeCondoName })
        });
        
        const data = await res.json();
        if (data.success) {
            showToast('Comunicazione inviata con successo!', 'success');
            document.getElementById('comm-subject').value = '';
            document.getElementById('comm-message').value = '';
        } else {
            showToast('Errore: ' + data.message, 'error');
        }
    } catch (e) {
        showToast('Errore di connessione', 'error');
    }
}


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
    const user = state.currentUser;
    const isGlobalAdmin = user.is_superadmin || (user.condomini && user.condomini.some(c => c.role === 'admin'));
    if (!isGlobalAdmin && user.privacy_accepted !== 1) {
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



window.showAgencyDashboard = function() {
    const suView = document.getElementById('superuser-dashboard-view');
    if (suView) suView.classList.add('hidden');

    document.getElementById('agency-dashboard-view').classList.remove('hidden');
    document.getElementById('agency-dashboard-view').classList.add('flex');
    document.getElementById('app-core-view').classList.add('hidden');

    const btnSuDesk = document.getElementById('btn-superuser-desk');
    if (btnSuDesk) {
        if (state.currentUser && state.currentUser.is_superadmin) {
            btnSuDesk.classList.remove('hidden');
        } else {
            btnSuDesk.classList.add('hidden');
        }
    }
    
    const grid = document.getElementById('agency-condos-grid');
    grid.innerHTML = '';
    
    state.currentUser.condomini.forEach(c => {
        const isAdmin = c.role === 'admin';
        const roleBadgeHtml = isAdmin 
            ? `<span class="px-2.5 py-0.5 rounded-full text-[10px] font-extrabold uppercase bg-blue-50 text-blue-700 border border-blue-200"><i class="fa-solid fa-shield-halved mr-1"></i> Amministratore</span>`
            : `<span class="px-2.5 py-0.5 rounded-full text-[10px] font-extrabold uppercase bg-emerald-50 text-emerald-700 border border-emerald-200"><i class="fa-solid fa-user-check mr-1"></i> Condòmino</span>`;

        grid.innerHTML += `
            <div onclick="enterCondo(${c.id})" class="card-friendly p-6 cursor-pointer flex flex-col justify-between group hover:border-blue-400 hover:shadow-xl hover:shadow-blue-500/5 transition-all">
                <div>
                    <div class="flex items-center justify-between mb-4">
                        <div class="w-12 h-12 rounded-2xl bg-gradient-to-br from-blue-500/10 to-indigo-500/10 text-blue-600 border border-blue-100 flex items-center justify-center text-xl group-hover:bg-gradient-to-tr group-hover:from-blue-600 group-hover:to-indigo-600 group-hover:text-white group-hover:shadow-md transition-all">
                            <i class="fa-solid fa-building"></i>
                        </div>
                        ${roleBadgeHtml}
                    </div>
                    <h3 class="font-extrabold text-xl text-slate-900 group-hover:text-blue-600 transition-colors mb-2">${c.nome}</h3>
                    <div class="space-y-1.5 mb-5 text-xs text-slate-500">
                        ${c.indirizzo ? `<p class="flex items-center gap-1.5"><i class="fa-solid fa-map-pin text-slate-400 w-4"></i> <span>${c.indirizzo}</span></p>` : ''}
                        ${c.cf ? `<p class="flex items-center gap-1.5"><i class="fa-solid fa-fingerprint text-slate-400 w-4"></i> <span>C.F. ${c.cf}</span></p>` : ''}
                    </div>
                </div>
                <div class="pt-4 border-t border-slate-100 flex items-center justify-between text-blue-600 font-bold text-xs group-hover:text-blue-700">
                    <span>Gestisci Condominio</span>
                    <span class="w-7 h-7 rounded-lg bg-blue-50 group-hover:bg-blue-600 group-hover:text-white flex items-center justify-center transition-all">
                        <i class="fa-solid fa-arrow-right text-[11px] group-hover:translate-x-0.5 transition-transform"></i>
                    </span>
                </div>
            </div>
        `;
    });
};

window.enterCondo = function(id, targetTab = 'dashboard') {
    state.activeCondominioId = id;
    state.currentCondoLicense = null;
    sessionStorage.setItem('active_Condominio_id', id);
    const suView = document.getElementById('superuser-dashboard-view');
    if (suView) suView.classList.add('hidden');
    document.getElementById('agency-dashboard-view').classList.add('hidden');
    document.getElementById('agency-dashboard-view').classList.remove('flex');
    document.getElementById('app-core-view').classList.remove('hidden');
    setupUIForRole();
    switchTab(targetTab);
    loadTicketsBadge();
    loadAnagrafica();
};

window.returnToAgencyDashboard = function() {
    state.activeCondominioId = null;
    state.currentCondoLicense = null;
    const badge = document.getElementById('header-readonly-badge');
    if (badge) badge.classList.add('hidden');
    sessionStorage.removeItem('active_Condominio_id');
    const suView = document.getElementById('superuser-dashboard-view');
    if (suView) suView.classList.add('hidden');
    showAgencyDashboard();
};

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


async function loadSecurityLogs() {
    if (state.currentUser.role !== 'admin') return;
    try {
        const res = await fetch('/api/security-logs', { headers: getAuthHeaders() });
        const data = await res.json();
        
        const tbody = document.getElementById('security-logs-body');
        if (!tbody) return;

        if (data.success && data.data.length > 0) {
            tbody.innerHTML = data.data.map(log => `
                <tr class="hover:bg-slate-50 transition-colors">
                    <td class="py-3 px-4 text-xs font-semibold text-slate-600">${formatDate(log.created_at)}</td>
                    <td class="py-3 px-4">
                        <div class="font-bold text-slate-900">${log.nome || 'Utente Sconosciuto'}</div>
                        <div class="text-xs text-slate-500">${log.email || ''}</div>
                    </td>
                    <td class="py-3 px-4 text-sm"><span class="px-2 py-1 bg-blue-100 text-blue-800 rounded-md font-bold text-xs">${log.action}</span></td>
                </tr>
            `).join('');
        } else {
            tbody.innerHTML = '<tr><td colspan="3" class="text-center p-4 text-slate-400">Nessun evento registrato</td></tr>';
        }
    } catch (e) {
        console.error('Error loading security logs', e);
    }
}


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
        if (data.success && data.qrCodeUrl) {
            document.getElementById('2fa-qrcode-img').src = data.qrCodeUrl;
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


// ==========================================
// RUBRICA PERSONE LOGICA
// ==========================================
async function loadRubrica() {
    try {
        const res = await fetch('/api/anagrafica-persone', { headers: getAuthHeaders() });
        const data = await res.json();
        if (data.success) {
            state.anagraficaPersone = data.data;
            renderRubricaTable();
        }
    } catch(e) { console.error('Errore loadRubrica', e); }
}

function renderRubricaTable() {
    const tbody = document.getElementById('persone-table-body');
    if (!tbody) return;
    if (!state.anagraficaPersone || state.anagraficaPersone.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" class="py-8 text-center text-slate-400">Nessuna persona in rubrica.</td></tr>';
        return;
    }
    
    tbody.innerHTML = state.anagraficaPersone.map(p => `
        <tr class="hover:bg-slate-50 transition-colors">
            <td class="py-3.5 px-4 font-bold text-slate-900">${p.cognome} ${p.nome}</td>
            <td class="py-3.5 px-4 font-mono text-xs text-slate-600">${p.codice_fiscale || '-'}</td>
            <td class="py-3.5 px-4 text-xs text-slate-500">
                ${p.telefono ? `<i class="fa-solid fa-phone mr-1"></i> ${p.telefono}<br>` : ''}
                ${p.cellulare ? `<i class="fa-solid fa-mobile-screen mr-1"></i> ${p.cellulare}<br>` : ''}
                ${p.email ? `<i class="fa-solid fa-envelope mr-1"></i> ${p.email}` : ''}
            </td>
            <td class="py-3.5 px-4"><span class="px-2 py-0.5 rounded text-xs bg-slate-100">${p.ruolo_default}</span></td>
            <td class="py-3.5 px-4 text-right">
                <button onclick="openPersonaModal(${p.id})" class="text-amber-500 hover:text-amber-700 ml-2"><i class="fa-solid fa-pen"></i></button>
            </td>
        </tr>
    `).join('');
}

function openPersonaModal(id = null) {
    if (typeof isLicenseReadOnly === 'function' && isLicenseReadOnly()) {
        showToast("Condominio in Sola Lettura: inserimento o modifica anagrafica bloccata.", "warning");
        return;
    }
    let p = null;
    if (id && state.anagraficaPersone) p = state.anagraficaPersone.find(x => x.id === id);
    
    document.getElementById('persona-modal-title').textContent = p ? 'Modifica Persona' : 'Nuova Persona';
    document.getElementById('persona-id').value = p ? p.id : '';
    document.getElementById('persona-nome').value = p ? p.nome : '';
    document.getElementById('persona-cognome').value = p ? p.cognome : '';
    document.getElementById('persona-cf').value = p ? (p.codice_fiscale || '') : '';
    document.getElementById('persona-tel').value = p ? (p.telefono || '') : '';
    document.getElementById('persona-cell').value = p ? (p.cellulare || '') : '';
    document.getElementById('persona-email').value = p ? (p.email || '') : '';
    document.getElementById('persona-ruolo').value = p ? (p.ruolo_default || 'Proprietario') : 'Proprietario';
    
    document.getElementById('modal-persona').classList.remove('hidden');
}

function closePersonaModal() {
    document.getElementById('modal-persona').classList.add('hidden');
}

async function savePersona(e) {
    e.preventDefault();
    if (typeof isLicenseReadOnly === 'function' && isLicenseReadOnly()) {
        showToast("Operazione bloccata: il condominio è in modalità Sola Lettura.", "error");
        return;
    }
    const id = document.getElementById('persona-id').value;
    const body = {
        nome: document.getElementById('persona-nome').value,
        cognome: document.getElementById('persona-cognome').value,
        codice_fiscale: document.getElementById('persona-cf').value,
        telefono: document.getElementById('persona-tel').value,
        cellulare: document.getElementById('persona-cell').value,
        email: document.getElementById('persona-email').value,
        ruolo_default: document.getElementById('persona-ruolo').value
    };

    const method = id ? 'PUT' : 'POST';
    const url = id ? '/api/anagrafica-persone/' + id : '/api/anagrafica-persone';

    try {
        const res = await fetch(url, {
            method, headers: getAuthHeaders(), body: JSON.stringify(body)
        });
        if (res.ok) {
            closePersonaModal();
            loadRubrica();
        } else { alert("Errore"); }
    } catch(err) { console.error(err); }
}

// ============================================================================
// SUPERUSER / PROPRIETARIO CONTROLLER (Cabina di Regia)
// ============================================================================

state.suData = null;
state.currentSuSubTab = 'modules';

window.openSuperUserDashboard = function() {
    document.getElementById('agency-dashboard-view').classList.add('hidden');
    document.getElementById('agency-dashboard-view').classList.remove('flex');
    document.getElementById('app-core-view').classList.add('hidden');
    
    const suView = document.getElementById('superuser-dashboard-view');
    if (suView) {
        suView.classList.remove('hidden');
        loadSuperUserOverview();
    }
};

window.switchSuperUserSubTab = function(subTab) {
    state.currentSuSubTab = subTab;
    const tabs = ['modules', 'licenses', 'operators', 'maintenance', 'audit'];
    
    tabs.forEach(t => {
        const btn = document.getElementById(`su-tab-btn-${t}`);
        const pane = document.getElementById(`su-subpane-${t}`);
        if (t === subTab) {
            if (btn) {
                btn.className = 'px-4 py-2 rounded-xl font-bold text-xs transition-all flex items-center gap-2 bg-white text-purple-900 shadow-xs';
                const icon = btn.querySelector('i');
                if (icon) icon.className = `fa-solid ${getSuTabIcon(t)} text-purple-600`;
            }
            if (pane) pane.classList.remove('hidden');
        } else {
            if (btn) {
                btn.className = 'px-4 py-2 rounded-xl font-bold text-xs transition-all flex items-center gap-2 text-slate-600 hover:text-slate-900';
                const icon = btn.querySelector('i');
                if (icon) icon.className = `fa-solid ${getSuTabIcon(t)} text-slate-400`;
            }
            if (pane) pane.classList.add('hidden');
        }
    });

    if (subTab === 'audit') {
        loadSuperUserAudit();
    }
};

function getSuTabIcon(t) {
    if (t === 'modules') return 'fa-sliders';
    if (t === 'licenses') return 'fa-certificate';
    if (t === 'operators') return 'fa-user-gear';
    if (t === 'maintenance') return 'fa-triangle-exclamation';
    if (t === 'audit') return 'fa-list-check';
    return 'fa-circle';
}

async function loadSuperUserOverview() {
    try {
        const res = await fetch('/api/superuser/overview', { headers: getAuthHeaders() });
        const data = await res.json();
        if (!data.success) {
            showToast(data.message || 'Errore caricamento dati SuperUser', 'error');
            return;
        }

        state.suData = data.data;

        // 1. Stats KPI
        const stats = data.data.stats || {};
        document.getElementById('su-stat-condomini').textContent = stats.total_condomini || 0;
        document.getElementById('su-stat-admins').textContent = stats.total_admins || 0;
        document.getElementById('su-stat-users').textContent = stats.total_users || 0;

        // 2. Render Condomini & Moduli
        renderSuCondoModules(data.data.condomini || []);

        // 2.1. Render Licenze & Abbonamenti
        renderSuLicenses(data.data.condomini || []);

        // 3. Render Operatori
        renderSuUsers(data.data.users || []);

        // 4. Popola tendine manutenzione
        populateSuMaintenanceSelects(data.data.condomini || []);

    } catch (err) {
        console.error('Errore superuser overview:', err);
        showToast('Errore durante il caricamento del pannello SuperUser', 'error');
    }
}

function renderSuCondoModules(condomini) {
    const tbody = document.getElementById('su-condo-modules-tbody');
    if (!tbody) return;

    if (condomini.length === 0) {
        tbody.innerHTML = `<tr><td colspan="8" class="text-center py-6 text-slate-400 italic">Nessun condominio registrato.</td></tr>`;
        return;
    }

    tbody.innerHTML = condomini.map(c => {
        const lic = c.license || {};
        let statusBadge = '';
        if (lic.is_suspended) {
            statusBadge = '<span class="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-extrabold bg-slate-100 text-slate-700 border border-slate-300">⏸️ Sospesa</span>';
        } else if (lic.is_expired) {
            statusBadge = '<span class="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-extrabold bg-rose-50 text-rose-700 border border-rose-200">🔴 Scaduta</span>';
        } else if (lic.is_expiring) {
            statusBadge = `<span class="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-extrabold bg-amber-50 text-amber-700 border border-amber-200">🟡 Scade (${lic.days_remaining} gg)</span>`;
        } else {
            statusBadge = '<span class="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-extrabold bg-emerald-50 text-emerald-700 border border-emerald-200">🟢 Attiva</span>';
        }

        const plan = lic.plan_type || 'completo';
        let planBadge = '<span class="px-1.5 py-0.5 rounded text-[10px] font-black bg-purple-100 text-purple-800 uppercase tracking-wider">Completo</span>';
        if (plan === 'standard') {
            planBadge = '<span class="px-1.5 py-0.5 rounded text-[10px] font-black bg-indigo-100 text-indigo-800 uppercase tracking-wider">Standard</span>';
        } else if (plan === 'base') {
            planBadge = '<span class="px-1.5 py-0.5 rounded text-[10px] font-black bg-slate-100 text-slate-800 uppercase tracking-wider">Base</span>';
        }

        return `
        <tr class="hover:bg-purple-50/20 transition-colors">
            <td class="py-3.5 px-4 font-semibold text-slate-900">
                <div class="flex flex-wrap items-center gap-1.5 mb-1">
                    <span class="font-extrabold text-sm text-slate-900">${c.nome}</span>
                    ${statusBadge}
                    ${planBadge}
                </div>
                <div class="text-[11px] text-slate-400 flex flex-wrap items-center gap-2">
                    <span><i class="fa-solid fa-user-shield text-purple-500"></i> Amm: <b class="text-slate-600">${c.admin_nome || 'Non assegnato'}</b></span>
                    <span>&bull;</span>
                    <span>${c.total_units || 0} unità</span>
                    <span>&bull;</span>
                    <span class="font-mono text-[10px] text-slate-500">Scade: <b>${lic.end_date || 'N/D'}</b></span>
                </div>
            </td>
            <td class="py-3.5 px-4 text-center">
                <input type="checkbox" onchange="handleModuleToggle(${c.id}, 'module_contabilita', this.checked)" ${c.module_contabilita ? 'checked' : ''} class="w-4 h-4 text-purple-600 rounded cursor-pointer accent-purple-600" title="Attiva/Disattiva Contabilità">
            </td>
            <td class="py-3.5 px-4 text-center">
                <input type="checkbox" onchange="handleModuleToggle(${c.id}, 'module_segnalazioni', this.checked)" ${c.module_segnalazioni ? 'checked' : ''} class="w-4 h-4 text-purple-600 rounded cursor-pointer accent-purple-600" title="Attiva/Disattiva Segnalazioni Guasti">
            </td>
            <td class="py-3.5 px-4 text-center">
                <input type="checkbox" onchange="handleModuleToggle(${c.id}, 'module_assemblee', this.checked)" ${c.module_assemblee ? 'checked' : ''} class="w-4 h-4 text-purple-600 rounded cursor-pointer accent-purple-600" title="Attiva/Disattiva Assemblee">
            </td>
            <td class="py-3.5 px-4 text-center">
                <input type="checkbox" onchange="handleModuleToggle(${c.id}, 'module_comunicazioni', this.checked)" ${c.module_comunicazioni ? 'checked' : ''} class="w-4 h-4 text-purple-600 rounded cursor-pointer accent-purple-600" title="Attiva/Disattiva Circolari">
            </td>
            <td class="py-3.5 px-4 text-center">
                <input type="checkbox" onchange="handleModuleToggle(${c.id}, 'module_banca', this.checked)" ${c.module_banca ? 'checked' : ''} class="w-4 h-4 text-purple-600 rounded cursor-pointer accent-purple-600" title="Attiva/Disattiva Banca">
            </td>
            <td class="py-3.5 px-4 text-center">
                <input type="checkbox" onchange="handleModuleToggle(${c.id}, 'module_anagrafica', this.checked)" ${c.module_anagrafica ? 'checked' : ''} class="w-4 h-4 text-purple-600 rounded cursor-pointer accent-purple-600" title="Attiva/Disattiva Anagrafica">
            </td>
            <td class="py-3.5 px-4 text-right whitespace-nowrap">
                <div class="flex items-center justify-end gap-1.5">
                    <button onclick="openSuLicenseModal(${c.id})" class="px-3 py-1.5 rounded-xl bg-purple-600 hover:bg-purple-700 text-white font-bold text-xs transition-colors inline-flex items-center gap-1.5 shadow-xs" title="Modifica Piano, Stato Abbonamento o Rinnova">
                        <i class="fa-solid fa-certificate"></i>
                        <span>Stato Abbonamento</span>
                    </button>
                    <button onclick="enterCondoFromSuperUser(${c.id})" class="px-2.5 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs border border-slate-200 transition-colors inline-flex items-center gap-1" title="Entra nel Condominio come Amministratore">
                        <i class="fa-solid fa-arrow-right-to-bracket text-[11px]"></i>
                        <span>Entra</span>
                    </button>
                </div>
            </td>
        </tr>
        `;
    }).join('');
}

window.handleModuleToggle = async function(condoId, moduleName, isChecked) {
    if (!state.suData) return;
    const condo = state.suData.condomini.find(c => c.id === condoId);
    if (!condo) return;

    condo[moduleName] = isChecked ? 1 : 0;

    try {
        const res = await fetch('/api/superuser/condo-features', {
            method: 'POST',
            headers: getAuthHeaders(),
            body: JSON.stringify({
                condominioId: condoId,
                module_contabilita: condo.module_contabilita,
                module_segnalazioni: condo.module_segnalazioni,
                module_assemblee: condo.module_assemblee,
                module_comunicazioni: condo.module_comunicazioni,
                module_banca: condo.module_banca,
                module_anagrafica: condo.module_anagrafica
            })
        });
        const data = await res.json();
        if (res.ok && data.success) {
            showToast('Permessi moduli aggiornati con successo!', 'success');
        } else {
            showToast(data.message || 'Errore salvataggio permessi', 'error');
        }
    } catch (err) {
        console.error(err);
        showToast('Errore di connessione', 'error');
    }
};

window.enterCondoFromSuperUser = function(condoId, targetTab = 'dashboard') {
    const suView = document.getElementById('superuser-dashboard-view');
    if (suView) suView.classList.add('hidden');
    enterCondo(condoId, targetTab);
};

function renderSuUsers(users) {
    const tbody = document.getElementById('su-users-tbody');
    if (!tbody) return;

    if (users.length === 0) {
        tbody.innerHTML = `<tr><td colspan="5" class="text-center py-6 text-slate-400 italic">Nessun utente trovato.</td></tr>`;
        return;
    }

    tbody.innerHTML = users.map(u => {
        let roleBadge = '<span class="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-700">Condòmino</span>';
        if (u.is_superadmin) {
            roleBadge = '<span class="px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-purple-100 text-purple-900 border border-purple-300"><i class="fa-solid fa-crown text-amber-500 mr-1"></i> SUPERUSER</span>';
        } else if (u.is_admin_role) {
            roleBadge = '<span class="px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-blue-100 text-blue-800 border border-blue-200"><i class="fa-solid fa-shield-halved mr-1"></i> Amministratore</span>';
        }

        const tfaBadge = u.two_factor_enabled 
            ? '<span class="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200"><i class="fa-solid fa-lock text-emerald-600 mr-1"></i> Attivo (2FA)</span>'
            : '<span class="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-500">Non attivo</span>';

        return `
            <tr class="hover:bg-slate-50 transition-colors">
                <td class="py-3 px-4 font-bold text-slate-900">
                    ${u.nome}
                    <span class="block text-[10px] text-slate-400 font-normal">ID #${u.id}</span>
                </td>
                <td class="py-3 px-4 font-mono text-slate-600">${u.email}</td>
                <td class="py-3 px-4">
                    <div class="flex items-center gap-1.5 flex-wrap">
                        ${roleBadge}
                        ${u.condo_names ? `<span class="text-[11px] text-slate-500 font-medium">(${u.condo_names})</span>` : ''}
                    </div>
                </td>
                <td class="py-3 px-4 text-center">${tfaBadge}</td>
                <td class="py-3 px-4 text-right">
                    <div class="inline-flex items-center gap-1.5">
                        <button onclick="openSuPasswordModal(${u.id}, '${escapeQuote(u.nome)}', '${escapeQuote(u.email)}')" class="px-2.5 py-1 rounded-lg bg-amber-50 hover:bg-amber-100 text-amber-700 font-bold text-[11px] border border-amber-200 transition-colors" title="Reimposta Password">
                            <i class="fa-solid fa-key mr-1"></i> Reset Pwd
                        </button>
                        ${u.two_factor_enabled ? `
                            <button onclick="resetUser2FA(${u.id}, '${escapeQuote(u.nome)}')" class="px-2.5 py-1 rounded-lg bg-rose-50 hover:bg-rose-100 text-rose-700 font-bold text-[11px] border border-rose-200 transition-colors" title="Azzera 2FA per sblocco">
                                <i class="fa-solid fa-unlock mr-1"></i> Sblocca 2FA
                            </button>
                        ` : ''}
                        ${!u.is_superadmin ? `
                            <button onclick="toggleUserAdminRole(${u.id}, '${escapeQuote(u.nome)}', ${u.is_admin_role ? 1 : 0})" class="px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-[11px] border border-slate-300 transition-colors" title="Cambia Ruolo">
                                <i class="fa-solid fa-user-pen mr-1"></i> ${u.is_admin_role ? 'Rendi Condomino' : 'Rendi Admin'}
                            </button>
                        ` : ''}
                    </div>
                </td>
            </tr>
        `;
    }).join('');
}

function escapeQuote(str) {
    if (!str) return '';
    return str.replace(/'/g, "\\'").replace(/"/g, '&quot;');
}

function populateSuMaintenanceSelects(condomini) {
    const s1 = document.getElementById('su-reset-condo-select-contab');
    const s2 = document.getElementById('su-reset-condo-select-tickets');
    if (!s1 || !s2) return;

    const optionsHtml = condomini.map(c => `<option value="${c.id}">${c.nome}</option>`).join('');
    s1.innerHTML = optionsHtml;
    s2.innerHTML = optionsHtml;
}

window.openSuPasswordModal = function(userId, userName, userEmail) {
    document.getElementById('su-pwd-user-id').value = userId;
    document.getElementById('su-pwd-user-meta').textContent = `${userName} (${userEmail})`;
    document.getElementById('su-pwd-new-input').value = `TempPass${Math.floor(1000 + Math.random() * 9000)}!`;
    document.getElementById('modal-su-password').classList.remove('hidden');
};

window.closeSuPasswordModal = function() {
    document.getElementById('modal-su-password').classList.add('hidden');
};

window.submitSuResetPassword = async function(e) {
    e.preventDefault();
    const userId = document.getElementById('su-pwd-user-id').value;
    const newPassword = document.getElementById('su-pwd-new-input').value.trim();
    if (!userId || !newPassword) return;

    try {
        const res = await fetch('/api/superuser/reset-user-password', {
            method: 'POST',
            headers: getAuthHeaders(),
            body: JSON.stringify({ userId, newPassword })
        });
        const data = await res.json();
        if (res.ok && data.success) {
            closeSuPasswordModal();
            showToast(`Password aggiornata a: "${newPassword}"`, 'success');
        } else {
            showToast(data.message || 'Errore reset password', 'error');
        }
    } catch (_) {
        showToast('Errore di connessione', 'error');
    }
};

window.resetUser2FA = async function(userId, userName) {
    if (!confirm(`Sei sicuro di voler azzerare la protezione 2FA per "${userName}"? L'utente potrà accedere solo con email e password.`)) return;

    try {
        const res = await fetch('/api/superuser/reset-user-2fa', {
            method: 'POST',
            headers: getAuthHeaders(),
            body: JSON.stringify({ userId })
        });
        const data = await res.json();
        if (res.ok && data.success) {
            showToast(data.message, 'success');
            loadSuperUserOverview();
        } else {
            showToast(data.message || 'Errore azzeramento 2FA', 'error');
        }
    } catch (_) {
        showToast('Errore di connessione', 'error');
    }
};

window.toggleUserAdminRole = async function(userId, userName, currentAdminState) {
    const makeAdmin = !currentAdminState;
    const actionLabel = makeAdmin ? 'Amministratore' : 'Condòmino standard';
    if (!confirm(`Confermi di voler assegnare all'utente "${userName}" il ruolo di ${actionLabel}?`)) return;

    try {
        const res = await fetch('/api/superuser/toggle-user-role', {
            method: 'POST',
            headers: getAuthHeaders(),
            body: JSON.stringify({ userId, makeAdmin })
        });
        const data = await res.json();
        if (res.ok && data.success) {
            showToast(data.message, 'success');
            loadSuperUserOverview();
        } else {
            showToast(data.message || 'Errore cambio ruolo', 'error');
        }
    } catch (_) {
        showToast('Errore di connessione', 'error');
    }
};

window.executeCondoReset = async function(resetType) {
    const selectElem = resetType === 'contabilita' 
        ? document.getElementById('su-reset-condo-select-contab')
        : document.getElementById('su-reset-condo-select-tickets');
    
    if (!selectElem) return;
    const condoId = selectElem.value;
    const condoName = selectElem.options[selectElem.selectedIndex]?.text || 'Condominio';

    const warnMsg = resetType === 'contabilita'
        ? `ATTENZIONE: Stai per cancellare tutti i movimenti contabili (prima nota, rate pagate e fatture) per "${condoName}". Le anagrafiche e gli utenti rimarranno intatti.\n\nVuoi procedere?`
        : `ATTENZIONE: Stai per eliminare tutte le segnalazioni guasti e la cronologia dei ticket per "${condoName}".\n\nVuoi procedere?`;

    if (!confirm(warnMsg)) return;

    try {
        const res = await fetch('/api/superuser/reset-condo-data', {
            method: 'POST',
            headers: getAuthHeaders(),
            body: JSON.stringify({ condominioId: condoId, resetType })
        });
        const data = await res.json();
        if (res.ok && data.success) {
            showToast(data.message, 'success');
            loadSuperUserOverview();
        } else {
            showToast(data.message || 'Errore durante il reset dei dati', 'error');
        }
    } catch (_) {
        showToast('Errore di connessione durante il reset', 'error');
    }
};

async function loadSuperUserAudit() {
    const tbody = document.getElementById('su-audit-tbody');
    if (!tbody) return;

    try {
        const res = await fetch('/api/superuser/audit-logs', { headers: getAuthHeaders() });
        const data = await res.json();
        if (!data.success) return;

        const rows = data.data || [];
        if (rows.length === 0) {
            tbody.innerHTML = `<tr><td colspan="6" class="text-center py-6 text-slate-400 italic">Nessun evento registrato finora.</td></tr>`;
            return;
        }

        tbody.innerHTML = rows.map(r => `
            <tr class="hover:bg-slate-50 transition-colors">
                <td class="py-3 px-4 font-mono text-[11px] text-slate-500">${formatDate(r.timestamp)}</td>
                <td class="py-3 px-4 font-bold text-slate-800">${r.user_name || 'Sistema'} <span class="text-[10px] text-slate-400 block">${r.user_email || ''}</span></td>
                <td class="py-3 px-4 font-medium text-slate-700">${r.condo_name || 'Tutti / Globale'}</td>
                <td class="py-3 px-4 font-semibold text-purple-700">${r.azione}</td>
                <td class="py-3 px-4 font-mono text-[11px] text-slate-500">${r.tabella || '-'} #${r.record_id || '-'}</td>
                <td class="py-3 px-4 font-mono text-[11px] text-slate-400">${r.ip || '-'}</td>
            </tr>
        `).join('');
    } catch (err) {
        console.error('Errore superuser audit:', err);
    }
}

// ============================================================================
// SUPERUSER: GESTIONE LICENZE CONDOMINIALI & SAAS
// ============================================================================

function renderSuLicenses(condomini) {
    const tbody = document.getElementById('su-licenses-tbody');
    if (!tbody) return;

    if (!condomini || condomini.length === 0) {
        tbody.innerHTML = `<tr><td colspan="6" class="text-center py-6 text-slate-400 italic">Nessun condominio registrato.</td></tr>`;
        return;
    }

    tbody.innerHTML = condomini.map(c => {
        const lic = c.license || {};
        const plan = lic.plan_type || 'completo';
        
        let planBadge = '<span class="px-2.5 py-1 rounded-lg text-[11px] font-black bg-purple-100 text-purple-800 uppercase tracking-wider">Completo</span>';
        if (plan === 'standard') {
            planBadge = '<span class="px-2.5 py-1 rounded-lg text-[11px] font-black bg-indigo-100 text-indigo-800 uppercase tracking-wider">Standard</span>';
        } else if (plan === 'base') {
            planBadge = '<span class="px-2.5 py-1 rounded-lg text-[11px] font-black bg-slate-100 text-slate-800 uppercase tracking-wider">Base</span>';
        }

        // Status badge
        let statusBadge = '';
        if (lic.is_suspended) {
            statusBadge = '<span class="px-2.5 py-1 rounded-full text-[11px] font-extrabold bg-slate-100 text-slate-700 border border-slate-300">⏸️ Sospesa</span>';
        } else if (lic.is_expired) {
            statusBadge = '<span class="px-2.5 py-1 rounded-full text-[11px] font-extrabold bg-rose-50 text-rose-700 border border-rose-200">🔴 Scaduta (Read-Only)</span>';
        } else if (lic.is_expiring) {
            statusBadge = `<span class="px-2.5 py-1 rounded-full text-[11px] font-extrabold bg-amber-50 text-amber-700 border border-amber-200">🟡 Scade tra ${lic.days_remaining} gg</span>`;
        } else {
            statusBadge = '<span class="px-2.5 py-1 rounded-full text-[11px] font-extrabold bg-emerald-50 text-emerald-700 border border-emerald-200">🟢 Attiva</span>';
        }

        // Days remaining text
        let validityNote = '';
        if (lic.is_suspended) {
            validityNote = '<span class="text-rose-600 font-bold block mt-0.5">Accesso operativo bloccato</span>';
        } else if (lic.is_expired) {
            validityNote = `<span class="text-rose-600 font-bold block mt-0.5">Scaduta da ${Math.abs(lic.days_remaining)} giorni</span>`;
        } else if (lic.is_expiring) {
            validityNote = `<span class="text-amber-600 font-bold block mt-0.5">Rinnovo urgente (${lic.days_remaining} gg rimanenti)</span>`;
        } else {
            validityNote = `<span class="text-slate-400 block mt-0.5">${lic.days_remaining} giorni rimanenti</span>`;
        }

        // Payment status
        let payStatusLabel = '';
        if (lic.payment_status === 'paid') {
            payStatusLabel = '<span class="text-emerald-700 font-bold flex items-center gap-1"><i class="fa-solid fa-check"></i> Saldato</span>';
        } else if (lic.payment_status === 'free_trial') {
            payStatusLabel = '<span class="text-purple-700 font-bold flex items-center gap-1"><i class="fa-solid fa-gift"></i> Omaggio / Prova</span>';
        } else {
            payStatusLabel = '<span class="text-amber-600 font-bold flex items-center gap-1"><i class="fa-solid fa-hourglass-half"></i> In attesa</span>';
        }

        const amountFormatted = parseFloat(lic.payment_amount || 0).toLocaleString('it-IT', { style: 'currency', currency: 'EUR' });

        return `
            <tr class="hover:bg-purple-50/20 transition-colors">
                <td class="py-3 px-4">
                    <div class="font-extrabold text-slate-900">${c.nome}</div>
                    <div class="text-[11px] text-slate-500">${c.indirizzo || 'Indirizzo non specificato'}</div>
                    <div class="text-[10px] text-slate-400 mt-0.5">Amm: <b class="text-slate-600">${c.admin_nome || 'Non assegnato'}</b></div>
                </td>
                <td class="py-3 px-4">
                    <div class="flex items-center gap-2 mb-1">
                        ${planBadge}
                    </div>
                    <div class="text-[11px] text-slate-600 font-medium">
                        <i class="fa-solid fa-door-open text-purple-400 mr-1"></i>
                        <b>${c.current_units_count || 0}</b> / ${lic.max_units || 50} unità
                    </div>
                </td>
                <td class="py-3 px-4">
                    <div class="font-mono text-[11px] text-slate-800 font-bold">
                        ${lic.start_date || '-'} &rarr; ${lic.end_date || '-'}
                    </div>
                    <div class="text-[11px]">${validityNote}</div>
                </td>
                <td class="py-3 px-4 text-center">
                    ${statusBadge}
                </td>
                <td class="py-3 px-4">
                    <div class="font-extrabold text-slate-900 text-xs">${amountFormatted}</div>
                    <div class="text-[11px]">${payStatusLabel}</div>
                    ${lic.payment_reference ? `<div class="text-[10px] text-slate-400 truncate max-w-[140px]" title="${lic.payment_reference}">${lic.payment_reference}</div>` : ''}
                </td>
                <td class="py-3 px-4 text-right">
                    <button onclick="openSuLicenseModal(${c.id})" class="px-3 py-1.5 rounded-xl bg-purple-600 hover:bg-purple-700 text-white font-bold text-xs transition-colors inline-flex items-center gap-1.5 shadow-xs" title="Modifica Stato Abbonamento o Piano">
                        <i class="fa-solid fa-certificate"></i>
                        <span>Modifica Abbonamento</span>
                    </button>
                </td>
            </tr>
        `;
    }).join('');
}

window.openSuLicenseModal = async function(condoId) {
    if (!state.suData || !state.suData.condomini) {
        try {
            const res = await fetch('/api/superuser/overview', { headers: getAuthHeaders() });
            const data = await res.json();
            if (data.success) {
                state.suData = data.data;
            }
        } catch (_) {}
    }
    if (!state.suData || !state.suData.condomini) return;
    const condo = state.suData.condomini.find(c => c.id == condoId);
    if (!condo) return;

    const modal = document.getElementById('modal-su-license');
    if (!modal) return;

    const lic = condo.license || {};
    
    document.getElementById('su-lic-condo-id').value = condo.id;
    const titleElem = document.getElementById('su-license-condo-title');
    if (titleElem) titleElem.textContent = `${condo.nome} (${condo.indirizzo || 'N/D'})`;

    document.getElementById('su-lic-plan-type').value = lic.plan_type || 'completo';
    document.getElementById('su-lic-status').value = lic.license_status || 'active';
    document.getElementById('su-lic-start-date').value = lic.start_date || new Date().toISOString().slice(0, 10);
    document.getElementById('su-lic-end-date').value = lic.end_date || new Date(Date.now() + 365*24*3600*1000).toISOString().slice(0, 10);
    document.getElementById('su-lic-payment-status').value = lic.payment_status || 'paid';
    document.getElementById('su-lic-payment-amount').value = lic.payment_amount !== undefined ? lic.payment_amount : 240.00;
    document.getElementById('su-lic-payment-ref').value = lic.payment_reference || '';
    document.getElementById('su-lic-payment-date').value = lic.payment_date || '';
    document.getElementById('su-lic-max-units').value = lic.max_units || 50;
    document.getElementById('su-lic-notes').value = lic.notes || '';
    document.getElementById('su-lic-sync-modules').checked = true;

    modal.classList.remove('hidden');
};

window.closeSuLicenseModal = function() {
    const modal = document.getElementById('modal-su-license');
    if (modal) modal.classList.add('hidden');
};

window.quickSetLicenseDuration = function(months) {
    const startInput = document.getElementById('su-lic-start-date');
    const endInput = document.getElementById('su-lic-end-date');
    if (!startInput || !endInput) return;

    const baseDate = startInput.value ? new Date(startInput.value) : new Date();
    const newEnd = new Date(baseDate);
    newEnd.setMonth(newEnd.getMonth() + parseInt(months, 10));
    endInput.value = newEnd.toISOString().slice(0, 10);
};

window.handlePlanChange = function(planType) {
    const amountInput = document.getElementById('su-lic-payment-amount');
    const unitsInput = document.getElementById('su-lic-max-units');
    if (!amountInput || !unitsInput) return;

    if (planType === 'base') {
        amountInput.value = '120.00';
        unitsInput.value = '20';
    } else if (planType === 'standard') {
        amountInput.value = '180.00';
        unitsInput.value = '40';
    } else {
        amountInput.value = '240.00';
        unitsInput.value = '50';
    }
};

window.submitSuLicense = async function(e) {
    if (e) e.preventDefault();

    const condoId = document.getElementById('su-lic-condo-id').value;
    if (!condoId) return;

    const payload = {
        condominioId: parseInt(condoId, 10),
        plan_type: document.getElementById('su-lic-plan-type').value,
        license_status: document.getElementById('su-lic-status').value,
        start_date: document.getElementById('su-lic-start-date').value,
        end_date: document.getElementById('su-lic-end-date').value,
        payment_status: document.getElementById('su-lic-payment-status').value,
        payment_amount: parseFloat(document.getElementById('su-lic-payment-amount').value) || 0,
        payment_reference: document.getElementById('su-lic-payment-ref').value,
        payment_date: document.getElementById('su-lic-payment-date').value || null,
        max_units: parseInt(document.getElementById('su-lic-max-units').value, 10) || 50,
        notes: document.getElementById('su-lic-notes').value,
        sync_modules: document.getElementById('su-lic-sync-modules').checked
    };

    try {
        const res = await fetch('/api/superuser/condo-license', {
            method: 'POST',
            headers: getAuthHeaders(),
            body: JSON.stringify(payload)
        });
        const data = await res.json();
        if (res.ok && data.success) {
            showToast(data.message, 'success');
            closeSuLicenseModal();
            loadSuperUserOverview();
            // Se stiamo attualmente gestendo quel condominio, ricarica anagrafica per aggiornare banner
            if (state.activeCondominioId == condoId) {
                loadAnagrafica();
            }
        } else {
            showToast(data.message || 'Errore salvataggio licenza', 'error');
        }
    } catch (_) {
        showToast('Errore di connessione', 'error');
    }
};

window.openSuLicenseFromCondo = async function() {
    if (!state.activeCondominioId) return;
    if (!state.suData || !state.suData.condomini) {
        try {
            const res = await fetch('/api/superuser/overview', { headers: getAuthHeaders() });
            const data = await res.json();
            if (data.success) {
                state.suData = data.data;
            }
        } catch (_) {}
    }
    openSuLicenseModal(state.activeCondominioId);
};

// ============================================================================
// SUPERUSER: CREA NUOVO CONDOMINIO & ABILITA AMMINISTRATORE
// ============================================================================

let currentAdminCreateMode = 'new';
let lastCreatedAdminData = null;

window.openModalCreateCondoAdmin = function() {
    currentAdminCreateMode = 'new';
    toggleSuAdminType('new');
    generateRandomAdminPassword();
    
    // Pulisci campi
    const nomeEl = document.getElementById('su-create-condo-nome');
    if (nomeEl) nomeEl.value = '';
    const indEl = document.getElementById('su-create-condo-indirizzo');
    if (indEl) indEl.value = '';
    const cfEl = document.getElementById('su-create-condo-cf');
    if (cfEl) cfEl.value = '';
    const scalaEl = document.getElementById('su-create-condo-scala');
    if (scalaEl) scalaEl.value = '';
    const adminNomeEl = document.getElementById('su-create-admin-nome');
    if (adminNomeEl) adminNomeEl.value = '';
    const adminEmailEl = document.getElementById('su-create-admin-email');
    if (adminEmailEl) adminEmailEl.value = '';
    const adminTelEl = document.getElementById('su-create-admin-tel');
    if (adminTelEl) adminTelEl.value = '';
    const licPlanEl = document.getElementById('su-create-lic-plan');
    if (licPlanEl) licPlanEl.value = 'completo';
    const licDurEl = document.getElementById('su-create-lic-duration');
    if (licDurEl) licDurEl.value = '12';
    const licUnitsEl = document.getElementById('su-create-lic-units');
    if (licUnitsEl) licUnitsEl.value = '50';
    const licAmountEl = document.getElementById('su-create-lic-amount');
    if (licAmountEl) licAmountEl.value = '240.00';
    const licPayEl = document.getElementById('su-create-lic-payment');
    if (licPayEl) licPayEl.value = 'paid';
    const sendMailEl = document.getElementById('su-create-send-email');
    if (sendMailEl) sendMailEl.checked = true;

    // Popola tendina utenti registrati per modalità 'existing'
    const selectExisting = document.getElementById('su-create-admin-existing-select');
    if (selectExisting) {
        selectExisting.innerHTML = '<option value="">-- Seleziona un utente registrato --</option>';
        if (state.suData && state.suData.users && state.suData.users.length > 0) {
            state.suData.users.forEach(u => {
                const opt = document.createElement('option');
                opt.value = u.id;
                opt.textContent = `${u.nome} (${u.email})${u.is_superadmin ? ' [SuperUser]' : ''}`;
                selectExisting.appendChild(opt);
            });
        }
    }

    const modal = document.getElementById('modal-su-create-condo-admin');
    if (modal) modal.classList.remove('hidden');
};

window.closeModalCreateCondoAdmin = function() {
    const modal = document.getElementById('modal-su-create-condo-admin');
    if (modal) modal.classList.add('hidden');
};

window.toggleSuAdminType = function(type) {
    currentAdminCreateMode = type;
    const btnNew = document.getElementById('btn-toggle-admin-new');
    const btnExisting = document.getElementById('btn-toggle-admin-existing');
    const blockNew = document.getElementById('su-create-admin-new-block');
    const blockExisting = document.getElementById('su-create-admin-existing-block');
    const adminNomeInput = document.getElementById('su-create-admin-nome');
    const adminEmailInput = document.getElementById('su-create-admin-email');

    if (type === 'new') {
        if (btnNew) {
            btnNew.className = 'px-3 py-1 rounded-lg text-xs font-bold bg-purple-600 text-white shadow-xs transition-all';
        }
        if (btnExisting) {
            btnExisting.className = 'px-3 py-1 rounded-lg text-xs font-bold text-slate-600 hover:text-purple-700 transition-all';
        }
        if (blockNew) blockNew.classList.remove('hidden');
        if (blockExisting) blockExisting.classList.add('hidden');
        if (adminNomeInput) adminNomeInput.setAttribute('required', 'required');
        if (adminEmailInput) adminEmailInput.setAttribute('required', 'required');
    } else {
        if (btnNew) {
            btnNew.className = 'px-3 py-1 rounded-lg text-xs font-bold text-slate-600 hover:text-purple-700 transition-all';
        }
        if (btnExisting) {
            btnExisting.className = 'px-3 py-1 rounded-lg text-xs font-bold bg-purple-600 text-white shadow-xs transition-all';
        }
        if (blockNew) blockNew.classList.add('hidden');
        if (blockExisting) blockExisting.classList.remove('hidden');
        if (adminNomeInput) adminNomeInput.removeAttribute('required');
        if (adminEmailInput) adminEmailInput.removeAttribute('required');
    }
};

window.generateRandomAdminPassword = function() {
    const adjectives = ['Studio', 'Admin', 'Gestione', 'Condo', 'Smart'];
    const prefix = adjectives[Math.floor(Math.random() * adjectives.length)];
    const num = Math.floor(1000 + Math.random() * 9000);
    const pwd = `${prefix}${num}!`;
    const input = document.getElementById('su-create-admin-pwd');
    if (input) input.value = pwd;
    return pwd;
};

window.submitCreateCondoAdmin = async function(event) {
    if (event) event.preventDefault();

    const submitBtn = document.getElementById('su-create-btn-submit');
    const originalBtnText = submitBtn ? submitBtn.innerHTML : '';
    if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Creazione in corso...';
    }

    const payload = {
        nomeCondominio: document.getElementById('su-create-condo-nome').value.trim(),
        indirizzo: document.getElementById('su-create-condo-indirizzo').value.trim(),
        cf: document.getElementById('su-create-condo-cf').value.trim(),
        scala: document.getElementById('su-create-condo-scala').value.trim(),
        isNewAdmin: currentAdminCreateMode === 'new',
        existingUserId: document.getElementById('su-create-admin-existing-select').value,
        adminNome: document.getElementById('su-create-admin-nome').value.trim(),
        adminEmail: document.getElementById('su-create-admin-email').value.trim(),
        adminPassword: document.getElementById('su-create-admin-pwd').value.trim(),
        adminTelefono: document.getElementById('su-create-admin-tel').value.trim(),
        plan_type: document.getElementById('su-create-lic-plan').value,
        duration_months: document.getElementById('su-create-lic-duration').value,
        max_units: document.getElementById('su-create-lic-units').value,
        payment_amount: document.getElementById('su-create-lic-amount').value,
        payment_status: document.getElementById('su-create-lic-payment').value,
        sendWelcomeEmail: document.getElementById('su-create-send-email').checked
    };

    try {
        const res = await fetch('/api/superuser/create-condo-admin', {
            method: 'POST',
            headers: getAuthHeaders(),
            body: JSON.stringify(payload)
        });
        const result = await res.json();

        if (res.ok && result.success) {
            closeModalCreateCondoAdmin();
            lastCreatedAdminData = result.data;

            // Popola scheda esito
            document.getElementById('su-success-condo-name').textContent = result.data.nome;
            document.getElementById('su-success-admin-name').textContent = result.data.adminNome;
            document.getElementById('su-success-admin-email').textContent = result.data.adminEmail;

            const pwdRow = document.getElementById('su-success-pwd-row');
            if (result.data.temporaryPassword) {
                document.getElementById('su-success-admin-pwd').textContent = result.data.temporaryPassword;
                if (pwdRow) pwdRow.classList.remove('hidden');
            } else {
                if (pwdRow) pwdRow.classList.add('hidden');
            }

            const successModal = document.getElementById('modal-su-create-success');
            if (successModal) successModal.classList.remove('hidden');

            showToast(result.message, 'success');
            loadSuperUserOverview();
        } else {
            showToast(result.message || 'Errore durante la creazione del condominio', 'error');
        }
    } catch (err) {
        console.error('Errore submitCreateCondoAdmin:', err);
        showToast('Errore di connessione durante la creazione', 'error');
    } finally {
        if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.innerHTML = originalBtnText;
        }
    }
};

window.closeModalCreateSuccess = function() {
    const successModal = document.getElementById('modal-su-create-success');
    if (successModal) successModal.classList.add('hidden');
};

window.copyAdminCredentialsToClipboard = function() {
    if (!lastCreatedAdminData) return;
    const pwdText = lastCreatedAdminData.temporaryPassword ? `Password Provvisoria: ${lastCreatedAdminData.temporaryPassword}\n` : '';
    const textToCopy = `Gentile ${lastCreatedAdminData.adminNome},

È stato attivato il tuo nuovo spazio di gestione per il "${lastCreatedAdminData.nome}" sulla piattaforma Condominio Trasparente!

🌐 Portale di Accesso: https://www.condominiotrasparente.com/login.html
📧 Email: ${lastCreatedAdminData.adminEmail}
🔑 ${pwdText}
Puoi accedere subito da PC, tablet o smartphone per iniziare la gestione.`;

    navigator.clipboard.writeText(textToCopy).then(() => {
        const copyLabel = document.getElementById('su-btn-copy-label');
        if (copyLabel) copyLabel.textContent = 'Copiato negli appunti! ✅';
        showToast('Credenziali copiate negli appunti!', 'success');
        setTimeout(() => {
            if (copyLabel) copyLabel.textContent = 'Copia Riepilogo per WhatsApp/Email';
        }, 3000);
    }).catch(() => {
        showToast('Impossibile copiare negli appunti', 'error');
    });
};


