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
// STABILITÀ FRONTEND: CRASH-PROOF & ERROR SHIELD
// ============================================================================
window.addEventListener('error', (event) => {
    console.error('🛡️ [FRONTEND SHIELD - Errore JS non bloccante]:', event.message, event.filename, event.lineno);
    // Previene la propagazione all'infinito e non blocca la UI dell'utente
});

window.addEventListener('unhandledrejection', (event) => {
    console.warn('🛡️ [FRONTEND SHIELD - Promise Rejection intercettata]:', event.reason);
    if (event.reason && (event.reason.status === 401 || (event.reason.message && event.reason.message.includes('Token non valido')))) {
        showToast('Sessione scaduta. Reindirizzamento al login...', 'warning');
        setTimeout(() => logout(), 1200);
    }
});

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
 * Intercetta le risposte globali fetch: se la sessione scade (401), notifica l'utente con toast chiaro
 */
const _originalFetch = window.fetch;
window.fetch = async function(...args) {
    try {
        const response = await _originalFetch.apply(this, args);
        if (response && (response.status === 401 || response.status === 403)) {
            // Controlla se la richiesta riguarda un endpoint autenticato interno
            const url = (args[0] && typeof args[0] === 'string') ? args[0] : (args[0]?.url || '');
            if (url.startsWith('/api') && !url.includes('/api/auth/login') && !url.includes('/api/2fa')) {
                if (response.status === 401) {
                    showToast('Sessione di lavoro scaduta. Verrai reindirizzato al login.', 'warning');
                    setTimeout(() => logout(), 1500);
                }
            }
        }
        return response;
    } catch (networkErr) {
        console.warn('⚠️ [Network Fault Intercettato]:', networkErr.message || networkErr);
        throw networkErr;
    }
};

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
            if (typeof window.loadCondominoFinanceDashboard === 'function') window.loadCondominoFinanceDashboard();
        };
    }



    // Dati profilo nell'header
    document.getElementById('user-display-name').textContent = user.nome;
    document.getElementById('user-display-unit').textContent = user.is_superadmin ? 'Proprietario della Piattaforma' : (isAdmin ? 'Amministrazione Condominiale' : (user.unita || 'condomino'));

    const roleBadge = document.getElementById('role-badge');
    if (roleBadge) {
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
        bannerDesc.textContent = 'Trasparenza a tutela della privacy (GDPR): visualizzi le tue quote personali e lo stato di salute finanziario aggregato del condominio.';

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
    if (tabId === 'unita') {
        return switchTab('anagrafica');
    }
    state.currentTab = tabId;

    document.querySelectorAll('.tab-pane').forEach(p => p.classList.add('hidden'));
    const target = document.getElementById(`tab-${tabId}`);
    if (target) target.classList.remove('hidden');

    // Gestione visibilità tasto "Torna alla Dashboard" e Breadcrumb di navigazione
    const tabNames = {
        'dashboard': 'Dashboard',
        'accounting': 'Contabilità & Finanze',
        'assemblies': 'Assemblee & Verbali',
        'communications': 'Comunicazioni & Circolari',
        'storico-comunicazioni': 'Storico Comunicazioni Inviate',
        'documenti': 'Documenti & Allegati Condominiali',
        'tickets': 'Segnalazioni Guasti & Manutenzioni',
        'admin-profile': 'Studio Amministratore',
        'condominio': 'Dati Ufficiali del Condominio',
        'anagrafica': 'Anagrafica Condòmini & Tabelle Millesimali',
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
    if (tabId === 'dashboard') { loadAnagrafica(); loadTicketsBadge(); if (typeof loadCondoDocumentsBadge === 'function') loadCondoDocumentsBadge(); if (typeof window.loadCondominoFinanceDashboard === 'function') window.loadCondominoFinanceDashboard(); }
    else if (tabId === 'condominio') loadAnagrafica();
    else if (tabId === 'assemblies') loadAssembliesData();
    else if (tabId === 'communications' || tabId === 'storico-comunicazioni') loadConvocationsLog();
    else if (tabId === 'documenti') loadCondoDocuments();
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
        const isAdmin = state.currentUser && state.currentUser.role === 'admin';

        // 1. Fetch concorrente: l'elenco analitico debitori viene chiamato SOLO dall'amministratore
        // Per tutti gli utenti viene invece interrogato l'endpoint aggregato di sintesi finanziaria
        const fetches = [
            fetch('/api/accounting-summary', { headers: getAuthHeaders() }),
            fetch('/api/quotes', { headers: getAuthHeaders() }),
            isAdmin ? fetch('/api/receivables', { headers: getAuthHeaders() }) : Promise.resolve({ ok: true, json: async () => ({ success: false, data: [] }) }),
            fetch('/api/supplier-payments', { headers: getAuthHeaders() }),
            fetch('/api/condominio/financial-health', { headers: getAuthHeaders() })
        ];

        const [sumRes, quotesRes, recRes, supRes, healthRes] = await Promise.all(fetches);

        const sumData = await sumRes.json();
        const quotesData = await quotesRes.json();
        const recData = await recRes.json();
        const supData = await supRes.json();
        const healthData = await healthRes.json();

        // 2. Calcolo totale quote caricate (per il condomino sono esclusivamente le sue personali)
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
        } else if (isAdmin && recData.success && Array.isArray(recData.data)) {
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

        // Totali globali condominio
        const totCondoReceived = (sumData.success && sumData.data && sumData.data.totalReceived !== undefined)
            ? Number(sumData.data.totalReceived) : calcReceived;
        const totCondoReceivables = (sumData.success && sumData.data && sumData.data.totalReceivables !== undefined)
            ? Number(sumData.data.totalReceivables) : calcReceivables;
        const totSuppPaid = (sumData.success && sumData.data && sumData.data.totalSuppliersPaid !== undefined)
            ? Number(sumData.data.totalSuppliersPaid) : calcSuppPaid;
        const totSuppDebt = (sumData.success && sumData.data && sumData.data.totalSuppliersDebt !== undefined)
            ? Number(sumData.data.totalSuppliersDebt) : calcSuppDebt;

        // Aggiorna KPI in testa alla pagina
        const lblRec = document.getElementById('kpi-label-received');
        const subRec = document.getElementById('kpi-sub-received');
        const lblReceivables = document.getElementById('kpi-label-receivables');
        const subReceivables = document.getElementById('kpi-sub-receivables');

        if (isAdmin) {
            if (lblRec) lblRec.textContent = 'Monte Quote Acquisite';
            if (subRec) subRec.textContent = 'Incassi complessivi di gestione';
            if (lblReceivables) lblReceivables.textContent = 'Residui Attivi di Gestione';
            if (subReceivables) subReceivables.textContent = 'Quote complessive in riscossione';
            document.getElementById('kpi-total-received').textContent = formatCurrency(totCondoReceived);
            document.getElementById('kpi-total-receivables').textContent = formatCurrency(totCondoReceivables);
        } else {
            if (lblRec) lblRec.textContent = 'Quote Acquisite Personali';
            if (subRec) subRec.textContent = 'Importi contabilizzati a credito';
            if (lblReceivables) lblReceivables.textContent = 'Residuo Ripartizione Personale';
            if (subReceivables) subReceivables.textContent = 'Quote in corso di regolazione';
            document.getElementById('kpi-total-received').textContent = formatCurrency(calcReceived);
            document.getElementById('kpi-total-receivables').textContent = formatCurrency(calcReceivables);
        }

        document.getElementById('kpi-suppliers-paid').textContent = formatCurrency(totSuppPaid);
        document.getElementById('kpi-suppliers-debt').textContent = formatCurrency(totSuppDebt);

        // 3. Popolamento Sezione Salute Finanziaria Aggregata (Privacy-First GDPR)
        if (healthData.success && healthData.data) {
            const h = healthData.data;
            const perc = Math.max(0, Math.min(100, Math.round(h.percentuale_incasso || 0)));
            
            const elPerc = document.getElementById('fh-perc-incasso');
            const elBar = document.getElementById('fh-progress-bar');
            const elTotInc = document.getElementById('fh-tot-incassato');
            const elTotEm = document.getElementById('fh-tot-emesso');
            const elTotIns = document.getElementById('fh-tot-insoluti');
            const elBadgeInc = document.getElementById('fh-incasso-badge');

            if (elPerc) elPerc.textContent = perc + '%';
            if (elBar) {
                elBar.style.width = perc + '%';
                if (perc >= 85) {
                    elBar.className = 'h-full bg-gradient-to-r from-emerald-500 to-teal-500 rounded-full transition-all duration-700';
                } else if (perc >= 70) {
                    elBar.className = 'h-full bg-gradient-to-r from-amber-500 to-yellow-500 rounded-full transition-all duration-700';
                } else {
                    elBar.className = 'h-full bg-gradient-to-r from-rose-500 to-red-500 rounded-full transition-all duration-700';
                }
            }
            if (elTotInc) elTotInc.textContent = formatCurrency(h.totale_incassato);
            if (elTotEm) elTotEm.textContent = formatCurrency(h.totale_emesso);
            if (elTotIns) elTotIns.textContent = formatCurrency(h.totale_insoluti_scaduti);

            if (elBadgeInc) {
                if (perc >= 95) {
                    elBadgeInc.className = 'px-2.5 py-1 rounded-full text-[11px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-200';
                    elBadgeInc.textContent = 'Conforme (95%+)';
                } else if (perc >= 80) {
                    elBadgeInc.className = 'px-2.5 py-1 rounded-full text-[11px] font-bold bg-teal-100 text-teal-800 border border-teal-200';
                    elBadgeInc.textContent = 'Avanzamento Regolare';
                } else {
                    elBadgeInc.className = 'px-2.5 py-1 rounded-full text-[11px] font-bold bg-amber-100 text-amber-800 border border-amber-200';
                    elBadgeInc.textContent = 'In Perfezionamento';
                }
            }

            // Box Fornitori & Cassa
            const elTitleForn = document.getElementById('fh-fornitori-status-title');
            const elDescForn = document.getElementById('fh-fornitori-status-desc');
            const elPagForn = document.getElementById('fh-fornitori-pagati');
            const elDebForn = document.getElementById('fh-fornitori-debito');
            const elBadgeCassa = document.getElementById('fh-cassa-badge');

            if (elTitleForn) {
                if (h.cassa_status === 'ottimo') {
                    elTitleForn.innerHTML = '<span class="text-emerald-600 flex items-center gap-1.5"><i class="fa-solid fa-circle-check"></i> Equilibrio Finanziario Consolidato</span>';
                } else if (h.cassa_status === 'buono' || h.cassa_status === 'regolare') {
                    elTitleForn.innerHTML = '<span class="text-teal-600 flex items-center gap-1.5"><i class="fa-solid fa-circle-info"></i> Uscite Programmate nei Termini Contrattuali</span>';
                } else {
                    elTitleForn.innerHTML = '<span class="text-amber-600 flex items-center gap-1.5"><i class="fa-solid fa-scale-balanced"></i> Fabbisogno Subordinato ai Residui Attivi</span>';
                }
            }
            if (elDescForn) elDescForn.textContent = h.cassa_message || '';
            if (elPagForn) elPagForn.textContent = formatCurrency(h.fornitori_pagati);
            if (elDebForn) elDebForn.textContent = formatCurrency(h.fornitori_debito);
            if (elBadgeCassa) {
                if (h.fornitori_debito === 0) {
                    elBadgeCassa.className = 'px-2.5 py-1 rounded-full text-[11px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-200';
                    elBadgeCassa.textContent = 'Piena Copertura';
                } else {
                    elBadgeCassa.className = 'px-2.5 py-1 rounded-full text-[11px] font-bold bg-blue-100 text-blue-800 border border-blue-200';
                    elBadgeCassa.textContent = `${formatCurrency(h.fornitori_debito)} Impegni in Erogazione`;
                }
            }
        }

        // 4. Tabella Quote (filtrata automaticamente dal backend in base al ruolo)
        if (quotesData.success) {
            state.quotes = quotesData.data;
            renderQuotesTable();
        }

        // 5. Tabella Crediti Condominiali: SOLO Amministratore
        if (isAdmin && recData.success) {
            state.receivables = recData.data;
            renderReceivablesTable(recData);
        }

        // 6. Tabella Fornitori (Contabilità Generale)
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
state.quotesFilterStatus = state.quotesFilterStatus || 'all';
state.quotesSearchQuery = state.quotesSearchQuery || '';

window.filterQuotesByStatus = function(status) {
    state.quotesFilterStatus = status;
    updateQuoteFilterButtons();
    renderQuotesTable();
};

window.filterQuotesBySearch = function(query) {
    state.quotesSearchQuery = (query || '').trim().toLowerCase();
    renderQuotesTable();
};

function updateQuoteFilterButtons() {
    const statuses = ['all', 'saldata', 'acconto', 'scaduta', 'in_attesa'];
    statuses.forEach(s => {
        const btn = document.getElementById(`qf-btn-${s}`);
        if (!btn) return;
        if (state.quotesFilterStatus === s) {
            btn.className = 'px-2.5 py-1 rounded-lg font-bold transition bg-slate-900 text-white shadow-2xs cursor-pointer';
        } else {
            const colors = {
                saldata: 'text-emerald-700 hover:bg-emerald-50',
                acconto: 'text-amber-700 hover:bg-amber-50',
                scaduta: 'text-rose-700 hover:bg-rose-50',
                in_attesa: 'text-slate-700 hover:bg-slate-100',
                all: 'text-slate-700 hover:bg-slate-100'
            };
            btn.className = `px-2.5 py-1 rounded-lg font-bold transition bg-white ${colors[s] || 'text-slate-600'} border border-slate-200 cursor-pointer`;
        }
    });
}

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

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Conteggi globali per i filtri di stato
    let countAll = state.quotes.length;
    let countSaldata = 0;
    let countAcconto = 0;
    let countScaduta = 0;
    let countInAttesa = 0;

    // Arricchimento dati quote con stato calcolato
    const enrichedQuotes = state.quotes.map(q => {
        const amt = parseFloat(q.amount) || 0;
        const paid = parseFloat(q.paid_amount) || (q.status === 'Pagato' ? amt : 0);
        const residual = q.residual !== undefined ? parseFloat(q.residual) : Math.max(0, Math.round((amt - paid) * 100) / 100);
        const isPaid = q.status === 'Pagato' || residual <= 0.009;
        const isPartial = !isPaid && (q.status === 'Parziale' || paid > 0.009);

        let isExpired = false;
        let daysLate = 0;
        let daysToDue = null;

        if (q.due_date && !isPaid) {
            const due = new Date(q.due_date);
            due.setHours(0, 0, 0, 0);
            const diffDays = Math.round((today - due) / (1000 * 60 * 60 * 24));
            if (diffDays > 0) {
                isExpired = true;
                daysLate = diffDays;
            } else {
                daysToDue = Math.abs(diffDays);
            }
        }

        let statusCode = 'in_attesa';
        if (isPaid) {
            statusCode = 'saldata';
            countSaldata++;
        } else if (isPartial) {
            statusCode = 'acconto';
            countAcconto++;
        } else if (isExpired) {
            statusCode = 'scaduta';
            countScaduta++;
        } else {
            statusCode = 'in_attesa';
            countInAttesa++;
        }

        return {
            ...q,
            _amt: amt,
            _paid: paid,
            _residual: residual,
            _isPaid: isPaid,
            _isPartial: isPartial,
            _isExpired: isExpired,
            _daysLate: daysLate,
            _daysToDue: daysToDue,
            _statusCode: statusCode
        };
    });

    // Aggiornamento contatori nei bottoni filtro
    const elCountAll = document.getElementById('qf-count-all');
    if (elCountAll) elCountAll.textContent = countAll;
    const elCountSaldata = document.getElementById('qf-count-saldata');
    if (elCountSaldata) elCountSaldata.textContent = countSaldata;
    const elCountAcconto = document.getElementById('qf-count-acconto');
    if (elCountAcconto) elCountAcconto.textContent = countAcconto;
    const elCountScaduta = document.getElementById('qf-count-scaduta');
    if (elCountScaduta) elCountScaduta.textContent = countScaduta;
    const elCountInAttesa = document.getElementById('qf-count-in_attesa');
    if (elCountInAttesa) elCountInAttesa.textContent = countInAttesa;

    // Filtraggio per stato e per ricerca testuale
    let filtered = enrichedQuotes;
    if (state.quotesFilterStatus && state.quotesFilterStatus !== 'all') {
        filtered = filtered.filter(q => q._statusCode === state.quotesFilterStatus);
    }
    if (state.quotesSearchQuery) {
        filtered = filtered.filter(q => {
            const searchPool = [
                q.condomino_nome || '',
                q.persona_cognome || '',
                q.persona_nome || '',
                q.title || '',
                q.unita || '',
                q.condomino_unita || ''
            ].join(' ').toLowerCase();
            return searchPool.includes(state.quotesSearchQuery);
        });
    }

    if (filtered.length === 0) {
        tbody.innerHTML = `<tr><td colspan="${isAdmin ? 8 : 7}" class="py-8 text-center text-slate-400">Nessuna quota trovata con i filtri correnti.</td></tr>`;
        if (tfoot) tfoot.innerHTML = '';
        return;
    }

    const totalAmount = filtered.reduce((acc, q) => acc + q._amt, 0);
    const totalPaid = filtered.reduce((acc, q) => acc + q._paid, 0);
    const totalPending = Math.max(0, Math.round((totalAmount - totalPaid) * 100) / 100);

    tbody.innerHTML = filtered.map(q => {
        const amt = q._amt;
        const paid = q._paid;
        const residual = q._residual;
        const isPaid = q._isPaid;
        const isPartial = q._isPartial;
        const isExpired = q._isExpired;
        const daysLate = q._daysLate;
        const daysToDue = q._daysToDue;

        // Visualizzazione avanzata ed elegante dello STATO
        let statusHtml = '';
        if (isPaid) {
            statusHtml = `
                <div class="inline-flex flex-col items-center">
                    <span class="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-black bg-emerald-50 text-emerald-700 border border-emerald-300 shadow-2xs">
                        <span class="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                        <i class="fa-solid fa-check text-[10px]"></i>
                        <span>Saldata</span>
                    </span>
                    <span class="text-[10px] text-emerald-600 font-semibold mt-0.5">100% Incassata</span>
                </div>
            `;
        } else if (isPartial) {
            const pct = amt > 0 ? Math.min(99, Math.max(1, Math.round((paid / amt) * 100))) : 50;
            statusHtml = `
                <div class="inline-flex flex-col items-center">
                    <span class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-black bg-amber-50 text-amber-800 border border-amber-300 shadow-2xs">
                        <span class="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse"></span>
                        <i class="fa-solid fa-clock-rotate-left text-[10px] text-amber-600"></i>
                        <span>Acconto ${pct}%</span>
                    </span>
                    <span class="text-[10px] text-amber-700 font-bold mt-0.5">Res. ${formatCurrency(residual)}</span>
                </div>
            `;
        } else if (isExpired) {
            statusHtml = `
                <div class="inline-flex flex-col items-center">
                    <span class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-black bg-rose-50 text-rose-700 border border-rose-300 shadow-2xs">
                        <span class="w-1.5 h-1.5 rounded-full bg-rose-500 animate-ping"></span>
                        <i class="fa-solid fa-triangle-exclamation text-[10px] text-rose-500"></i>
                        <span>Scaduta</span>
                    </span>
                    <span class="text-[10px] text-rose-600 font-black mt-0.5">${daysLate} gg fa</span>
                </div>
            `;
        } else {
            const isImminent = daysToDue !== null && daysToDue <= 7;
            if (isImminent) {
                statusHtml = `
                    <div class="inline-flex flex-col items-center">
                        <span class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-black bg-sky-50 text-sky-800 border border-sky-300 shadow-2xs">
                            <span class="w-1.5 h-1.5 rounded-full bg-sky-500"></span>
                            <i class="fa-regular fa-clock text-[10px] text-sky-600"></i>
                            <span>In Scadenza</span>
                        </span>
                        <span class="text-[10px] text-sky-700 font-semibold mt-0.5">${daysToDue === 0 ? 'Oggi' : 'tra ' + daysToDue + ' gg'}</span>
                    </div>
                `;
            } else {
                statusHtml = `
                    <div class="inline-flex flex-col items-center">
                        <span class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-slate-100 text-slate-700 border border-slate-200 shadow-2xs">
                            <span class="w-1.5 h-1.5 rounded-full bg-slate-400"></span>
                            <i class="fa-regular fa-calendar text-[10px] text-slate-400"></i>
                            <span>Da Saldare</span>
                        </span>
                        <span class="text-[10px] text-slate-400 font-medium mt-0.5">In attesa</span>
                    </div>
                `;
            }
        }

        const isOrd = q.type === 'ordinaria';
        const typeBadge = isOrd ? '<span class="px-2 py-0.5 rounded text-[11px] font-bold bg-blue-50 text-blue-700">Ordinaria</span>' : '<span class="px-2 py-0.5 rounded text-[11px] font-bold bg-purple-50 text-purple-700">Straordinaria</span>';
        const displayUnita = q.unita || q.condomino_unita || '';

        const versatoResiduoCell = `
            <td class="py-3.5 px-4 text-right text-xs">
                <div class="font-bold text-emerald-600">${formatCurrency(paid)}</div>
                <div class="text-[11px] ${residual > 0.009 ? 'text-rose-500 font-bold' : 'text-slate-400'}">Res. ${formatCurrency(residual)}</div>
            </td>
        `;

        if (isAdmin) {
            let payAction = '';
            if (isPaid) {
                payAction = `
                    <button onclick="openPaymentModal('quote', ${q.id})" class="px-2 py-1 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 rounded-lg text-xs font-bold no-print cursor-pointer" title="Visualizza dettagli e storico versamenti"><i class="fa-solid fa-receipt mr-1"></i>Saldata</button>
                    <button onclick="sendReceipt(${q.id})" class="ml-1 px-2.5 py-1 bg-blue-500 hover:bg-blue-600 text-white rounded-lg text-xs font-bold shadow-2xs no-print cursor-pointer" title="Invia Ricevuta via Email"><i class="fa-solid fa-envelope"></i> Ricevuta</button>
                `;
            } else {
                payAction = `
                    <button onclick="openPaymentModal('quote', ${q.id})" class="px-2.5 py-1 ${isPartial ? 'bg-amber-600 hover:bg-amber-700' : 'bg-emerald-600 hover:bg-emerald-700'} text-white rounded-lg text-xs font-bold shadow-2xs no-print cursor-pointer" title="${isPartial ? 'Registra ulteriore acconto o saldo' : 'Registra incasso o acconto'}">
                        <i class="fa-solid fa-money-bill-wave mr-1"></i>${isPartial ? 'Acconto / Saldo' : 'Incassa'}
                    </button>
                    <button onclick="sendReminder(${q.id})" class="ml-1 px-2.5 py-1 bg-rose-500 hover:bg-rose-600 text-white rounded-lg text-xs font-bold shadow-2xs no-print cursor-pointer" title="Invia Sollecito di Pagamento"><i class="fa-solid fa-bell"></i> Sollecito</button>
                `;
            }
            
            payAction += ` <button onclick="editQuote(${q.id})" class="ml-1 px-2 py-1 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-lg text-xs font-bold no-print cursor-pointer" title="Modifica rata"><i class="fa-solid fa-pen"></i></button>`;
            payAction += ` <button onclick="deleteQuote(${q.id})" class="ml-1 px-2 py-1 bg-rose-50 hover:bg-rose-100 text-rose-600 rounded-lg text-xs font-bold no-print cursor-pointer" title="Elimina rata"><i class="fa-solid fa-trash-can"></i></button>`;

            return `
                <tr class="hover:bg-slate-50 transition-colors">
                    <td class="py-3.5 px-4">
                        <div class="font-bold text-slate-900">${q.persona_cognome ? q.persona_cognome + ' ' + (q.persona_nome || '') : (q.condomino_nome || 'Sconosciuto')}</div>
                        <div class="text-xs text-slate-500">${displayUnita}</div>
                    </td>
                    <td class="py-3.5 px-4">${typeBadge}</td>
                    <td class="py-3.5 px-4 font-medium text-slate-900">${q.title}</td>
                    <td class="py-3.5 px-4 text-xs text-slate-500 font-mono">${formatDate(q.due_date)}</td>
                    <td class="py-3.5 px-4 text-right font-bold text-slate-900">${formatCurrency(amt)}</td>
                    ${versatoResiduoCell}
                    <td class="py-3.5 px-4 text-center">${statusHtml}</td>
                    <td class="py-3.5 px-4 text-center whitespace-nowrap">${payAction}</td>
                </tr>
            `;
        } else {
            return `
                <tr class="hover:bg-slate-50 transition-colors">
                    <td class="py-3.5 px-4">${typeBadge}</td>
                    <td class="py-3.5 px-4 font-medium text-slate-900">${q.title}</td>
                    <td class="py-3.5 px-4 text-xs text-slate-500 font-mono">${formatDate(q.due_date)}</td>
                    <td class="py-3.5 px-4 text-right font-bold text-slate-900">${formatCurrency(amt)}</td>
                    ${versatoResiduoCell}
                    <td class="py-3.5 px-4 text-center">${statusHtml}</td>
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
                            <span>TOTALE QUOTE (${filtered.length}${filtered.length !== state.quotes.length ? ' di ' + state.quotes.length : ''}):</span>
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
/**
 * Renderizza la tabella dei Crediti Condominiali da Riscuotere
 * Impaginata con la stessa ricchezza, estetica e coerenza di Tutte le Quote del Condominio (Vista Amministratore)
 */
state.receivablesFilterStatus = state.receivablesFilterStatus || 'all';
state.receivablesSearchQuery = state.receivablesSearchQuery || '';

window.filterReceivablesByStatus = function(status) {
    state.receivablesFilterStatus = status;
    updateReceivablesFilterButtons();
    renderReceivablesTable();
};

window.filterReceivablesBySearch = function(query) {
    state.receivablesSearchQuery = (query || '').trim().toLowerCase();
    renderReceivablesTable();
};

function updateReceivablesFilterButtons() {
    const statuses = ['all', 'scaduta', 'acconto', 'in_attesa'];
    statuses.forEach(s => {
        const btn = document.getElementById(`rf-btn-${s}`);
        if (!btn) return;
        if (state.receivablesFilterStatus === s) {
            btn.className = 'px-2.5 py-1 rounded-lg font-bold transition bg-slate-900 text-white shadow-2xs cursor-pointer';
        } else {
            const colors = {
                scaduta: 'text-rose-700 hover:bg-rose-50',
                acconto: 'text-amber-700 hover:bg-amber-50',
                in_attesa: 'text-slate-700 hover:bg-slate-100',
                all: 'text-slate-700 hover:bg-slate-100'
            };
            btn.className = `px-2.5 py-1 rounded-lg font-bold transition bg-white ${colors[s] || 'text-slate-600'} border border-slate-200 cursor-pointer`;
        }
    });
}

function renderReceivablesTable(recData) {
    const isAdmin = state.currentUser && state.currentUser.role === 'admin';
    if (!isAdmin) return;

    if (recData && recData.data) {
        state.receivables = recData.data;
    } else if (Array.isArray(recData)) {
        state.receivables = recData;
    }

    const tbody = document.getElementById('receivables-table-body');
    const tfoot = document.getElementById('receivables-table-footer');
    const header = document.getElementById('receivables-table-header');
    const badgeContainer = document.getElementById('privacy-badge-container');

    if (!tbody) return;

    // Header della tabella coerente con la Vista Amministratore di Quote
    if (header) {
        header.innerHTML = `
            <th class="py-3.5 px-4">${isAdmin ? 'Debitore / Unit&agrave;' : 'Cond&ograve;mino / Unit&agrave;'}</th>
            <th class="py-3.5 px-4">Tipo</th>
            <th class="py-3.5 px-4">Descrizione Quota</th>
            <th class="py-3.5 px-4">Scadenza</th>
            <th class="py-3.5 px-4 text-right">Importo Totale</th>
            <th class="py-3.5 px-4 text-right">Versato / Residuo</th>
            <th class="py-3.5 px-4 text-center">Stato</th>
            <th class="py-3.5 px-4 text-center">Azioni</th>
        `;
    }

    // Badge Privacy / Trasparenza
    if (badgeContainer) {
        if (isAdmin) {
            badgeContainer.innerHTML = `
                <span class="px-3 py-1 rounded-full text-xs font-bold bg-blue-100 text-blue-800 border border-blue-200 shadow-2xs">
                    <i class="fa-solid fa-eye mr-1"></i> Nominativi in Chiaro (Vista Admin)
                </span>
            `;
        } else {
            badgeContainer.innerHTML = `
                <span class="px-3 py-1 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800 border border-emerald-200 shadow-2xs">
                    <i class="fa-solid fa-user-secret mr-1"></i> Nominativi Anonimizzati (Privacy Tutelata)
                </span>
            `;
        }
    }

    const rawList = state.receivables || [];
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Conteggi per i pulsanti filtro
    let countAll = rawList.length;
    let countScaduta = 0;
    let countAcconto = 0;
    let countInAttesa = 0;

    const enriched = rawList.map(r => {
        const residual = parseFloat(r.importo || r.residual || r.amount) || 0;
        const total = parseFloat(r.importo_totale) || (residual + (parseFloat(r.importo_versato) || 0));
        const paid = parseFloat(r.importo_versato) || 0;
        const isPaid = residual <= 0.009;
        const isPartial = !isPaid && (r.status === 'Parziale' || paid > 0.009);

        let isExpired = false;
        let daysLate = 0;
        let daysToDue = null;

        const dueDateStr = r.scadenza || r.due_date;
        if (dueDateStr && !isPaid) {
            const due = new Date(dueDateStr);
            due.setHours(0, 0, 0, 0);
            const diffDays = Math.round((today - due) / (1000 * 60 * 60 * 24));
            if (diffDays > 0) {
                isExpired = true;
                daysLate = diffDays;
            } else {
                daysToDue = Math.abs(diffDays);
            }
        }

        let statusCode = 'in_attesa';
        if (isPartial) {
            statusCode = 'acconto';
            countAcconto++;
        } else if (isExpired) {
            statusCode = 'scaduta';
            countScaduta++;
        } else {
            statusCode = 'in_attesa';
            countInAttesa++;
        }

        return {
            ...r,
            _total: total,
            _paid: paid,
            _residual: residual,
            _isPaid: isPaid,
            _isPartial: isPartial,
            _isExpired: isExpired,
            _daysLate: daysLate,
            _daysToDue: daysToDue,
            _statusCode: statusCode
        };
    });

    // Aggiornamento etichette numeriche bottoni filtro
    const elCountAll = document.getElementById('rf-count-all');
    if (elCountAll) elCountAll.textContent = countAll;
    const elCountScaduta = document.getElementById('rf-count-scaduta');
    if (elCountScaduta) elCountScaduta.textContent = countScaduta;
    const elCountAcconto = document.getElementById('rf-count-acconto');
    if (elCountAcconto) elCountAcconto.textContent = countAcconto;
    const elCountInAttesa = document.getElementById('rf-count-in_attesa');
    if (elCountInAttesa) elCountInAttesa.textContent = countInAttesa;

    // Filtraggio per stato e query di ricerca
    let filtered = enriched;
    if (state.receivablesFilterStatus && state.receivablesFilterStatus !== 'all') {
        filtered = filtered.filter(r => r._statusCode === state.receivablesFilterStatus);
    }
    if (state.receivablesSearchQuery) {
        filtered = filtered.filter(r => {
            const pool = [
                r.debitore || '',
                r.persona_cognome || '',
                r.persona_nome || '',
                r.titolo_quota || r.title || '',
                r.unita || ''
            ].join(' ').toLowerCase();
            return pool.includes(state.receivablesSearchQuery);
        });
    }

    if (filtered.length === 0) {
        tbody.innerHTML = `<tr><td colspan="8" class="py-8 text-center text-slate-400">Nessun credito in sospeso trovato con i filtri correnti.</td></tr>`;
        if (tfoot) tfoot.innerHTML = '';
        return;
    }

    const sumTotal = filtered.reduce((acc, r) => acc + r._total, 0);
    const sumPaid = filtered.reduce((acc, r) => acc + r._paid, 0);
    const sumResidual = filtered.reduce((acc, r) => acc + r._residual, 0);

    tbody.innerHTML = filtered.map(r => {
        const isOwn = r.is_my_quote;
        const isOrd = (r.type === 'ordinaria' || (r.titolo_quota && r.titolo_quota.toLowerCase().includes('ordinar')));
        const typeBadge = isOrd 
            ? '<span class="px-2 py-0.5 rounded text-[11px] font-bold bg-blue-50 text-blue-700">Ordinaria</span>' 
            : '<span class="px-2 py-0.5 rounded text-[11px] font-bold bg-purple-50 text-purple-700">Straordinaria</span>';

        // 1. Debitore / Unità
        let debtorHtml = '';
        if (isAdmin) {
            const debName = r.debitore || `${r.persona_cognome || ''} ${r.persona_nome || ''}`.trim() || 'Sconosciuto';
            debtorHtml = `
                <div class="font-bold text-slate-900">${debName}</div>
                <div class="text-xs text-slate-500">${r.unita || '-'}</div>
            `;
        } else {
            debtorHtml = `
                <div class="${isOwn ? 'font-bold text-amber-800' : 'font-medium text-slate-700'} flex items-center gap-1.5 flex-wrap">
                    ${isOwn ? '<i class="fa-solid fa-user text-amber-600"></i>' : '<i class="fa-solid fa-user-shield text-slate-400"></i>'}
                    <span>${r.debitore}</span>
                    ${isOwn ? '<span class="px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-amber-100 text-amber-800 border border-amber-300">La tua quota</span>' : ''}
                </div>
                <div class="text-xs text-slate-400">${r.unita || 'Unità Riservata'}</div>
            `;
        }

        // 2. Stato Badge Evoluto (Stesso design di Quote Condominiali)
        let statusHtml = '';
        if (r._isPartial) {
            const pct = r._total > 0 ? Math.min(99, Math.max(1, Math.round((r._paid / r._total) * 100))) : 50;
            statusHtml = `
                <div class="inline-flex flex-col items-center">
                    <span class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-black bg-amber-50 text-amber-800 border border-amber-300 shadow-2xs">
                        <span class="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse"></span>
                        <i class="fa-solid fa-clock-rotate-left text-[10px] text-amber-600"></i>
                        <span>Acconto ${pct}%</span>
                    </span>
                    <span class="text-[10px] text-amber-700 font-bold mt-0.5">Res. ${formatCurrency(r._residual)}</span>
                </div>
            `;
        } else if (r._isExpired) {
            statusHtml = `
                <div class="inline-flex flex-col items-center">
                    <span class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-black bg-rose-50 text-rose-700 border border-rose-300 shadow-2xs">
                        <span class="w-1.5 h-1.5 rounded-full bg-rose-500 animate-ping"></span>
                        <i class="fa-solid fa-triangle-exclamation text-[10px] text-rose-500"></i>
                        <span>Scaduta</span>
                    </span>
                    <span class="text-[10px] text-rose-600 font-black mt-0.5">${r._daysLate} gg fa</span>
                </div>
            `;
        } else {
            const isImminent = r._daysToDue !== null && r._daysToDue <= 7;
            if (isImminent) {
                statusHtml = `
                    <div class="inline-flex flex-col items-center">
                        <span class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-black bg-sky-50 text-sky-800 border border-sky-300 shadow-2xs">
                            <span class="w-1.5 h-1.5 rounded-full bg-sky-500"></span>
                            <i class="fa-regular fa-clock text-[10px] text-sky-600"></i>
                            <span>In Scadenza</span>
                        </span>
                        <span class="text-[10px] text-sky-700 font-semibold mt-0.5">${r._daysToDue === 0 ? 'Oggi' : 'tra ' + r._daysToDue + ' gg'}</span>
                    </div>
                `;
            } else {
                statusHtml = `
                    <div class="inline-flex flex-col items-center">
                        <span class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-slate-100 text-slate-700 border border-slate-200 shadow-2xs">
                            <span class="w-1.5 h-1.5 rounded-full bg-slate-400"></span>
                            <i class="fa-regular fa-calendar text-[10px] text-slate-400"></i>
                            <span>Da Saldare</span>
                        </span>
                        <span class="text-[10px] text-slate-400 font-medium mt-0.5">In attesa</span>
                    </div>
                `;
            }
        }

        // 3. Azioni
        let actionHtml = '';
        if (isAdmin) {
            actionHtml = `
                <div class="flex items-center justify-center gap-1.5 no-print whitespace-nowrap">
                    <button onclick="openPaymentModal('quote', ${r.id})" class="px-2.5 py-1 ${r._isPartial ? 'bg-amber-600 hover:bg-amber-700' : 'bg-emerald-600 hover:bg-emerald-700'} text-white rounded-lg text-xs font-bold shadow-2xs cursor-pointer" title="${r._isPartial ? 'Registra ulteriore acconto o saldo' : 'Registra incasso o acconto'}">
                        <i class="fa-solid fa-money-bill-wave mr-1"></i>${r._isPartial ? 'Acconto / Saldo' : 'Incassa'}
                    </button>
                    <button onclick="sendReminder(${r.id})" class="ml-1 px-2.5 py-1 bg-rose-500 hover:bg-rose-600 text-white rounded-lg text-xs font-bold shadow-2xs cursor-pointer" title="Invia Sollecito di Pagamento"><i class="fa-solid fa-bell"></i> Sollecito</button>
                    <button onclick="editQuote(${r.id})" class="ml-1 px-2 py-1 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-lg text-xs font-bold cursor-pointer" title="Modifica rata"><i class="fa-solid fa-pen"></i></button>
                </div>
            `;
        } else {
            if (isOwn) {
                actionHtml = `
                    <div class="flex items-center justify-center text-xs text-slate-500 no-print">
                        <button onclick="openPaymentModal('quote', ${r.id})" class="px-3 py-1 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-bold shadow-2xs cursor-pointer" title="Paga la tua quota"><i class="fa-solid fa-credit-card mr-1"></i>Paga Ora</button>
                    </div>
                `;
            } else {
                actionHtml = `<span class="text-slate-400">-</span>`;
            }
        }

        return `
            <tr class="hover:bg-slate-50 transition-colors ${isOwn ? 'bg-amber-50/30' : ''}">
                <td class="py-3.5 px-4">${debtorHtml}</td>
                <td class="py-3.5 px-4">${typeBadge}</td>
                <td class="py-3.5 px-4 font-medium text-slate-900">${r.titolo_quota || r.title}</td>
                <td class="py-3.5 px-4 text-xs text-slate-500 font-mono">${formatDate(r.scadenza || r.due_date)}</td>
                <td class="py-3.5 px-4 text-right font-bold text-slate-900">${formatCurrency(r._total)}</td>
                <td class="py-3.5 px-4 text-right text-xs">
                    <div class="font-bold text-emerald-600">${formatCurrency(r._paid)}</div>
                    <div class="text-[11px] ${r._residual > 0.009 ? 'text-rose-500 font-bold' : 'text-slate-400'}">Res. ${formatCurrency(r._residual)}</div>
                </td>
                <td class="py-3.5 px-4 text-center">${statusHtml}</td>
                <td class="py-3.5 px-4 text-center whitespace-nowrap">${actionHtml}</td>
            </tr>
        `;
    }).join('');

    // Footer totali
    if (tfoot) {
        tfoot.innerHTML = `
            <tr class="bg-amber-50/70 border-t-2 border-amber-300 font-bold text-xs text-slate-700">
                <td colspan="4" class="py-3.5 px-4 text-amber-950">
                    <div class="flex flex-wrap items-center gap-2">
                        <i class="fa-solid fa-calculator text-amber-600"></i>
                        <span>TOTALE CREDITI DA RISCUOTERE (${filtered.length}${filtered.length !== enriched.length ? ' di ' + enriched.length : ''}):</span>
                        <span class="inline-flex items-center text-[11px] font-bold text-emerald-800 bg-emerald-100/90 border border-emerald-200 px-2 py-0.5 rounded-full">
                            <i class="fa-solid fa-check-double mr-1 text-[10px]"></i> Già Versati: ${formatCurrency(sumPaid)}
                        </span>
                        <span class="inline-flex items-center text-[11px] font-bold text-rose-800 bg-rose-100/90 border border-rose-200 px-2 py-0.5 rounded-full">
                            <i class="fa-solid fa-triangle-exclamation mr-1 text-[10px]"></i> Insoluti / Residui: ${formatCurrency(sumResidual)}
                        </span>
                    </div>
                </td>
                <td class="py-3.5 px-4 text-right font-extrabold text-slate-900 text-sm">${formatCurrency(sumTotal)}</td>
                <td class="py-3.5 px-4 text-right text-xs">
                    <div class="font-bold text-emerald-600">${formatCurrency(sumPaid)}</div>
                    <div class="text-[11px] text-rose-600 font-bold">Res. ${formatCurrency(sumResidual)}</div>
                </td>
                <td class="py-3.5 px-4 text-center">
                    <span class="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800 border border-amber-200">
                        In Sospeso
                    </span>
                </td>
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
                renderUsersTable();
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
    
    // Popola tendina selezione condòmino per nuove credenziali
    populateUsersPersonaSelect();
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

// ============================================================================
// GESTIONE UTENTI - TENDINA ANAGRAFICA E CREAZIONE CREDENZIALI
// ============================================================================

async function populateUsersPersonaSelect() {
    const sel = document.getElementById('new-user-persona-select');
    if (!sel) return;

    if (!state.anagraficaPersone || state.anagraficaPersone.length === 0) {
        try {
            const res = await fetch('/api/anagrafica-persone', { headers: getAuthHeaders() });
            const data = await res.json();
            if (data.success && Array.isArray(data.data)) {
                state.anagraficaPersone = data.data;
            }
        } catch(e) {
            console.error('Errore caricamento anagrafica per tendina utenti:', e);
        }
    }

    if (!state.anagraficaPersone || state.anagraficaPersone.length === 0) {
        sel.innerHTML = '<option value="">-- Nessun condòmino censito in Anagrafica --</option>';
        return;
    }

    const currentVal = sel.value;
    const sorted = [...state.anagraficaPersone].sort((a, b) => {
        const nameA = `${a.cognome || ''} ${a.nome || ''}`.trim().toLowerCase();
        const nameB = `${b.cognome || ''} ${b.nome || ''}`.trim().toLowerCase();
        return nameA.localeCompare(nameB, 'it');
    });

    sel.innerHTML = '<option value="">-- Seleziona un condòmino dall\'anagrafica --</option>' + 
        sorted.map(p => {
            const cognome = (p.cognome || '').trim();
            const nome = (p.nome || '').trim();
            const nominativo = `${cognome} ${nome}`.trim() || 'Senza Nominativo';
            const ruolo = p.ruolo_default || 'Condòmino';
            const extra = p.unita_identificativo ? ` [${p.unita_identificativo}]` : '';
            return `<option value="${p.id}">${nominativo} (${ruolo}${extra})</option>`;
        }).join('');

    if (currentVal) sel.value = currentVal;
}

function onSelectCondominoForUser(personaId) {
    const hiddenId = document.getElementById('new-user-persona-id');
    const inputNome = document.getElementById('new-user-nome');
    const inputCognome = document.getElementById('new-user-cognome');
    const inputEmail = document.getElementById('new-user-email');
    const inputUnita = document.getElementById('new-user-unita');
    const inputTelefono = document.getElementById('new-user-telefono');
    const inputCatasto = document.getElementById('new-user-catasto');
    const selectRole = document.getElementById('new-user-role');

    if (!personaId || !state.anagraficaPersone) {
        if (hiddenId) hiddenId.value = '';
        if (inputNome) inputNome.value = '';
        if (inputCognome) inputCognome.value = '';
        if (inputEmail) inputEmail.value = '';
        if (inputUnita) inputUnita.value = '';
        if (inputTelefono) inputTelefono.value = '';
        if (inputCatasto) inputCatasto.value = '';
        return;
    }

    const p = state.anagraficaPersone.find(x => String(x.id) === String(personaId));
    if (!p) return;

    if (hiddenId) hiddenId.value = p.id;
    if (inputNome) inputNome.value = p.nome || '';
    if (inputCognome) inputCognome.value = p.cognome || '';
    if (inputEmail) inputEmail.value = p.email || '';

    // Telefono / cellulare
    const tel = p.cellulare || p.telefono || '';
    if (inputTelefono) inputTelefono.value = tel;

    // Unità info
    let unitaStr = '';
    if (p.unita_identificativo) {
        unitaStr = p.unita_identificativo;
        const details = [];
        if (p.unita_scala) details.push(`Sc. ${p.unita_scala}`);
        if (p.unita_piano) details.push(`P. ${p.unita_piano}`);
        if (p.unita_interno) details.push(`Int. ${p.unita_interno}`);
        if (details.length > 0) unitaStr += ` (${details.join(', ')})`;
    }
    if (inputUnita) inputUnita.value = unitaStr;
    if (inputCatasto) inputCatasto.value = p.unita_dati_catastali || '';

    if (selectRole && !selectRole.value) {
        selectRole.value = 'condomino';
    }
}

async function handleCreateUser(e) {
    if (e) e.preventDefault();

    if (typeof isLicenseReadOnly === 'function' && isLicenseReadOnly()) {
        showToast("Condominio in Sola Lettura: creazione credenziali bloccata.", "warning");
        return;
    }

    const personaId = document.getElementById('new-user-persona-id')?.value || document.getElementById('new-user-persona-select')?.value;
    const nome = document.getElementById('new-user-nome')?.value?.trim();
    const cognome = document.getElementById('new-user-cognome')?.value?.trim();
    const email = document.getElementById('new-user-email')?.value?.trim();
    const password = document.getElementById('new-user-password')?.value;
    const role = document.getElementById('new-user-role')?.value || 'condomino';
    const unita = document.getElementById('new-user-unita')?.value || '';
    const telefono = document.getElementById('new-user-telefono')?.value || '';
    const dati_catastali = document.getElementById('new-user-catasto')?.value || '';

    if (!personaId) {
        showToast('Devi prima selezionare un condòmino censito in Anagrafica', 'warning');
        const sel = document.getElementById('new-user-persona-select');
        if (sel) sel.focus();
        return;
    }

    if (!nome || !cognome) {
        showToast('Nome e Cognome obbligatori', 'warning');
        return;
    }

    if (!email) {
        showToast('Inserisci un\'email valida per il login del condòmino', 'warning');
        const em = document.getElementById('new-user-email');
        if (em) em.focus();
        return;
    }

    if (!password || password.length < 8) {
        showToast('La password provvisoria deve contenere almeno 8 caratteri', 'warning');
        const pwd = document.getElementById('new-user-password');
        if (pwd) pwd.focus();
        return;
    }

    const submitBtn = document.getElementById('btn-submit-user');
    const originalText = submitBtn ? submitBtn.innerHTML : '';
    if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin mr-1.5"></i> Creazione in corso...';
    }

    try {
        const nominativoCompleto = `${nome} ${cognome}`.trim();
        const res = await fetch('/api/users', {
            method: 'POST',
            headers: getAuthHeaders(),
            body: JSON.stringify({
                persona_id: personaId,
                nome: nominativoCompleto,
                email: email,
                password: password,
                role: role,
                unita: unita,
                telefono: telefono,
                dati_catastali: dati_catastali
            })
        });

        const data = await res.json();
        if (res.ok && data.success) {
            showToast('Credenziali create con successo!', 'success');
            const form = document.getElementById('form-create-user');
            if (form) form.reset();
            if (document.getElementById('new-user-persona-id')) document.getElementById('new-user-persona-id').value = '';
            if (document.getElementById('new-user-nome')) document.getElementById('new-user-nome').value = '';
            if (document.getElementById('new-user-cognome')) document.getElementById('new-user-cognome').value = '';
            if (document.getElementById('new-user-email')) document.getElementById('new-user-email').value = '';
            if (document.getElementById('new-user-unita')) document.getElementById('new-user-unita').value = '';
            if (document.getElementById('new-user-telefono')) document.getElementById('new-user-telefono').value = '';
            if (document.getElementById('new-user-catasto')) document.getElementById('new-user-catasto').value = '';
            
            await loadUsersList();
        } else {
            showToast(data.message || 'Errore durante la creazione delle credenziali', 'error');
        }
    } catch(err) {
        console.error('Errore handleCreateUser:', err);
        showToast('Errore di connessione con il server', 'error');
    } finally {
        if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.innerHTML = originalText;
        }
    }
}

window.populateUsersPersonaSelect = populateUsersPersonaSelect;
window.onSelectCondominoForUser = onSelectCondominoForUser;
window.handleCreateUser = handleCreateUser;

async function populateQuoteUsersSelect() {
    const selPersona = document.getElementById('quote-persona-id');
    const selUnita = document.getElementById('quote-unita-id');
    
    // Carica sempre i dati aggiornati da Anagrafica Condominio & Tabelle Millesimali
    try {
        const res = await fetch('/api/anagrafica-persone', { headers: getAuthHeaders() });
        const data = await res.json();
        if (data.success) state.anagraficaPersone = data.data || [];
    } catch(e) {}

    if (selPersona && state.anagraficaPersone) {
        selPersona.innerHTML = '<option value="">-- Seleziona Intestatario --</option>' + 
            state.anagraficaPersone.map(p => `<option value="${p.id}">${p.cognome} ${p.nome}</option>`).join('');
    }
    
    if (selUnita && state.anagraficaPersone) {
        const unitsFromAnagrafica = state.anagraficaPersone
            .filter(p => p.unita_id)
            .map(p => {
                const loc = [
                    p.unita_scala ? `Sc. ${p.unita_scala}` : '',
                    p.unita_piano ? `P. ${p.unita_piano}` : '',
                    p.unita_interno ? `Int. ${p.unita_interno}` : ''
                ].filter(Boolean).join(' ');
                const label = loc || p.unita_identificativo || p.unita_tipo || 'Unità';
                return `<option value="${p.unita_id}">${label} - ${p.cognome} ${p.nome}</option>`;
            });
        selUnita.innerHTML = '<option value="">-- Unità associata in Anagrafica --</option>' + unitsFromAnagrafica.join('');
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

function formatItalianDateNumeric(dateString) {
    if (!dateString) return '';
    const clean = String(dateString).trim().split('T')[0];
    const parts = clean.split('-');
    if (parts.length === 3 && parts[0].length === 4) {
        return `${parts[2].padStart(2, '0')}/${parts[1].padStart(2, '0')}/${parts[0]}`;
    }
    const d = new Date(dateString);
    if (!isNaN(d.getTime())) {
        const dd = String(d.getDate()).padStart(2, '0');
        const mm = String(d.getMonth() + 1).padStart(2, '0');
        const yyyy = d.getFullYear();
        return `${dd}/${mm}/${yyyy}`;
    }
    return dateString;
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

function toggleEditScheda(showForm) {
    const view = document.getElementById('scheda-condominio-view');
    const form = document.getElementById('form-condominio');
    const btn = document.getElementById('btn-edit-scheda');
    if (view) view.classList.toggle('hidden', showForm);
    if (form) form.classList.toggle('hidden', !showForm);
    if (btn) btn.classList.toggle('hidden', showForm);
}

function copySchedaMarkdown() {
    const c = state.activeCondominioData || {};
    const adminFullName = ((c.admin_titolo ? c.admin_titolo + ' ' : '') + (c.admin_nome || '') + ' ' + (c.admin_cognome || '')).trim() || '[Dato non fornito]';
    const studioDenom = c.admin_studio_nome || (c.admin_nome ? `Studio di Amministrazione ${adminFullName}` : '[Dato non fornito]');
    const iban = c.bank_iban || c.dati_bancari || '[Dato non fornito]';
    const banca = c.bank_name || '[Dato non fornito]';

    const md = `### 1. DATI GENERALI DEL CONDOMINIO

| Campo | Valore |
| :--- | :--- |
| **Denominazione Condominio** | ${c.nome || '[Dato non fornito]'} |
| **Indirizzo Completo** | ${c.indirizzo || '[Dato non fornito]'} |
| **Codice Fiscale Condominio** | ${c.cf || '[Dato non fornito]'} |
| **Codice CIG (se applicabile)** | ${c.cig || '[Dato non fornito]'} |
| **Numero di Unità Immobiliari** | ${c.units_count && c.units_count > 0 ? c.units_count : '[Dato non fornito]'} |

### 2. STUDIO & DATI AMMINISTRATORE

| Campo | Valore |
| :--- | :--- |
| **Nome Studio / Amministratore** | ${studioDenom} |
| **Responsabile / Referente** | ${adminFullName} |
| **Indirizzo Studio** | ${c.admin_studio_indirizzo || '[Dato non fornito]'} |
| **Telefono Fisso** | ${c.admin_telefono || '[Dato non fornito]'} |
| **Cellulare di Urgenza** | ${c.admin_emergenze || c.admin_cellulare || '[Dato non fornito]'} |
| **Email Studio** | ${c.admin_email || '[Dato non fornito]'} |
| **Email Dedicata al Condominio** | ${c.admin_email_condominio || c.admin_email || '[Dato non fornito]'} |
| **PEC (Posta Elettronica Certificata)** | ${c.admin_pec || '[Dato non fornito]'} |
| **Sito Web / Portale Condomini** | ${window.location.origin} (Condominio Trasparente) |
| **Orari di Apertura / Reperibilità** | ${c.admin_orari_ricevimento || '[Dato non fornito]'} |

### 3. DATI BANCARI & ASSICURATIVI

| Campo | Valore |
| :--- | :--- |
| **Istituto Bancario** | ${banca} |
| **IBAN del Condominio** | ${iban} |
| **Compagnia Assicurativa (Polizza Fabbricati)** | ${c.assicurazione_compagnia || '[Dato non fornito]'} |
| **Numero Polizza** | ${c.assicurazione_polizza || '[Dato non fornito]'} |
| **Scadenza Polizza** | ${c.assicurazione_scadenza || '[Dato non fornito]'} |

### 4. NOTE E SPECIFICHE AGGIUNTIVE
${c.note_fabbricato || (c.scala ? `Fabbricato suddiviso in ${c.scala}. ` : '') + (c.admin_ricevimento_note || 'Nessuna nota aggiuntiva.')}`;

    if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(md).then(() => {
            showToast('Tabelle copiate negli appunti in formato Markdown!', 'success');
        }).catch(() => {
            prompt('Copia il testo Markdown seguente:', md);
        });
    } else {
        prompt('Copia il testo Markdown seguente:', md);
    }
}

function renderSchedaTecnicaView(c) {
    state.activeCondominioData = c;

    // Popola Form di Modifica
    if (document.getElementById('condominio-nome')) document.getElementById('condominio-nome').value = c.nome || '';
    if (document.getElementById('condominio-indirizzo')) document.getElementById('condominio-indirizzo').value = c.indirizzo || '';
    if (document.getElementById('condominio-cf')) document.getElementById('condominio-cf').value = c.cf || '';
    if (document.getElementById('condominio-cig')) document.getElementById('condominio-cig').value = c.cig || '';
    if (document.getElementById('condominio-scala')) document.getElementById('condominio-scala').value = c.scala || '';
    if (document.getElementById('condominio-studio-nome')) document.getElementById('condominio-studio-nome').value = c.admin_studio_nome || '';
    if (document.getElementById('condominio-admin-titolo')) document.getElementById('condominio-admin-titolo').value = c.admin_titolo || '';
    if (document.getElementById('condominio-admin-nome')) document.getElementById('condominio-admin-nome').value = ((c.admin_nome || '') + ' ' + (c.admin_cognome || '')).trim();
    if (document.getElementById('condominio-studio-indirizzo')) document.getElementById('condominio-studio-indirizzo').value = c.admin_studio_indirizzo || '';
    if (document.getElementById('condominio-admin-telefono')) document.getElementById('condominio-admin-telefono').value = c.admin_telefono || '';
    if (document.getElementById('condominio-admin-emergenze')) document.getElementById('condominio-admin-emergenze').value = c.admin_emergenze || '';
    if (document.getElementById('condominio-admin-cellulare')) document.getElementById('condominio-admin-cellulare').value = c.admin_cellulare || '';
    if (document.getElementById('condominio-admin-email')) document.getElementById('condominio-admin-email').value = c.admin_email || '';
    if (document.getElementById('condominio-admin-email-condo')) document.getElementById('condominio-admin-email-condo').value = c.admin_email_condominio || '';
    if (document.getElementById('condominio-admin-pec')) document.getElementById('condominio-admin-pec').value = c.admin_pec || '';
    if (document.getElementById('condominio-admin-orari')) document.getElementById('condominio-admin-orari').value = c.admin_orari_ricevimento || '';
    if (document.getElementById('condominio-dati-bancari')) document.getElementById('condominio-dati-bancari').value = c.dati_bancari || c.bank_iban || '';
    if (document.getElementById('condominio-assicurazione-compagnia')) document.getElementById('condominio-assicurazione-compagnia').value = c.assicurazione_compagnia || '';
    if (document.getElementById('condominio-assicurazione-polizza')) document.getElementById('condominio-assicurazione-polizza').value = c.assicurazione_polizza || '';
    if (document.getElementById('condominio-assicurazione-scadenza')) document.getElementById('condominio-assicurazione-scadenza').value = c.assicurazione_scadenza || '';
    if (document.getElementById('condominio-note-fabbricato')) document.getElementById('condominio-note-fabbricato').value = c.note_fabbricato || '';

    // Popola le 4 Tabelle Visive a Video
    const adminFullName = ((c.admin_titolo ? c.admin_titolo + ' ' : '') + (c.admin_nome || '') + ' ' + (c.admin_cognome || '')).trim() || '[Dato non fornito]';
    const studioDenom = c.admin_studio_nome || (c.admin_nome ? `Studio di Amministrazione ${adminFullName}` : '[Dato non fornito]');
    const iban = c.bank_iban || c.dati_bancari || '[Dato non fornito]';
    const banca = c.bank_name || (c.dati_bancari ? c.dati_bancari.split('-')[0].trim() : '[Dato non fornito]');

    // Tabella 1: Generali
    const tbodyGen = document.getElementById('tbody-scheda-generali');
    if (tbodyGen) {
        tbodyGen.innerHTML = `
            <tr class="hover:bg-slate-50/80 transition"><td class="py-2.5 px-4 font-bold text-slate-700 bg-slate-50/50">Denominazione Condominio</td><td class="py-2.5 px-4 font-bold text-slate-900">${c.nome || '[Dato non fornito]'}</td></tr>
            <tr class="hover:bg-slate-50/80 transition"><td class="py-2.5 px-4 font-bold text-slate-700 bg-slate-50/50">Indirizzo Completo</td><td class="py-2.5 px-4 text-slate-800">${c.indirizzo || '[Dato non fornito]'}</td></tr>
            <tr class="hover:bg-slate-50/80 transition"><td class="py-2.5 px-4 font-bold text-slate-700 bg-slate-50/50">Codice Fiscale Condominio</td><td class="py-2.5 px-4 font-mono font-bold text-slate-900">${c.cf || '[Dato non fornito]'}</td></tr>
            <tr class="hover:bg-slate-50/80 transition"><td class="py-2.5 px-4 font-bold text-slate-700 bg-slate-50/50">Codice CIG (se applicabile)</td><td class="py-2.5 px-4 font-mono text-slate-800">${c.cig || '[Dato non fornito]'}</td></tr>
            <tr class="hover:bg-slate-50/80 transition"><td class="py-2.5 px-4 font-bold text-slate-700 bg-slate-50/50">Numero di Unità Immobiliari</td><td class="py-2.5 px-4 font-semibold text-slate-800">${c.units_count && c.units_count > 0 ? c.units_count + ' unità censite' : '[Dato non fornito]'}</td></tr>
            ${c.scala ? `<tr class="hover:bg-slate-50/80 transition"><td class="py-2.5 px-4 font-bold text-slate-700 bg-slate-50/50">Scale / Struttura Fabbricato</td><td class="py-2.5 px-4 text-slate-800">${c.scala}</td></tr>` : ''}
        `;
    }

    // Tabella 2: Studio
    const tbodyStudio = document.getElementById('tbody-scheda-studio');
    if (tbodyStudio) {
        tbodyStudio.innerHTML = `
            <tr class="hover:bg-slate-50/80 transition"><td class="py-2.5 px-4 font-bold text-slate-700 bg-slate-50/50">Nome Studio / Amministratore</td><td class="py-2.5 px-4 font-bold text-slate-900">${studioDenom}</td></tr>
            <tr class="hover:bg-slate-50/80 transition"><td class="py-2.5 px-4 font-bold text-slate-700 bg-slate-50/50">Responsabile / Referente</td><td class="py-2.5 px-4 text-slate-800">${adminFullName}</td></tr>
            <tr class="hover:bg-slate-50/80 transition"><td class="py-2.5 px-4 font-bold text-slate-700 bg-slate-50/50">Indirizzo Studio</td><td class="py-2.5 px-4 text-slate-800">${c.admin_studio_indirizzo || '[Dato non fornito]'}</td></tr>
            <tr class="hover:bg-slate-50/80 transition"><td class="py-2.5 px-4 font-bold text-slate-700 bg-slate-50/50">Telefono Fisso</td><td class="py-2.5 px-4 font-semibold text-slate-800">${c.admin_telefono ? `<a href="tel:${c.admin_telefono}" class="text-violet-700 hover:underline">${c.admin_telefono}</a>` : '[Dato non fornito]'}</td></tr>
            <tr class="hover:bg-slate-50/80 transition"><td class="py-2.5 px-4 font-bold text-rose-700 bg-rose-50/30">Cellulare di Urgenza / Emergenze</td><td class="py-2.5 px-4 font-bold text-rose-700">${c.admin_emergenze || c.admin_cellulare ? `<a href="tel:${c.admin_emergenze || c.admin_cellulare}" class="hover:underline">${c.admin_emergenze || c.admin_cellulare}</a>` : '[Dato non fornito]'}</td></tr>
            <tr class="hover:bg-slate-50/80 transition"><td class="py-2.5 px-4 font-bold text-slate-700 bg-slate-50/50">Email Studio</td><td class="py-2.5 px-4 font-mono text-slate-800">${c.admin_email ? `<a href="mailto:${c.admin_email}" class="text-violet-700 hover:underline">${c.admin_email}</a>` : '[Dato non fornito]'}</td></tr>
            <tr class="hover:bg-slate-50/80 transition"><td class="py-2.5 px-4 font-bold text-slate-700 bg-slate-50/50">Email Dedicata al Condominio</td><td class="py-2.5 px-4 font-mono text-slate-800">${c.admin_email_condominio || c.admin_email ? `<a href="mailto:${c.admin_email_condominio || c.admin_email}" class="text-violet-700 hover:underline">${c.admin_email_condominio || c.admin_email}</a>` : '[Dato non fornito]'}</td></tr>
            <tr class="hover:bg-slate-50/80 transition"><td class="py-2.5 px-4 font-bold text-slate-700 bg-slate-50/50">PEC (Posta Elettronica Certificata)</td><td class="py-2.5 px-4 font-mono text-slate-800">${c.admin_pec ? `<a href="mailto:${c.admin_pec}" class="text-violet-700 hover:underline">${c.admin_pec}</a>` : '[Dato non fornito]'}</td></tr>
            <tr class="hover:bg-slate-50/80 transition"><td class="py-2.5 px-4 font-bold text-slate-700 bg-slate-50/50">Sito Web / Portale Condomini</td><td class="py-2.5 px-4 text-violet-700 font-medium">${window.location.origin} (Condominio Trasparente)</td></tr>
            <tr class="hover:bg-slate-50/80 transition"><td class="py-2.5 px-4 font-bold text-slate-700 bg-slate-50/50">Orari di Apertura / Reperibilità</td><td class="py-2.5 px-4 text-slate-800">${c.admin_orari_ricevimento || '[Dato non fornito]'}</td></tr>
        `;
    }

    // Tabella 3: Banca & Assicurazione
    const tbodyBanca = document.getElementById('tbody-scheda-banca');
    if (tbodyBanca) {
        tbodyBanca.innerHTML = `
            <tr class="hover:bg-slate-50/80 transition"><td class="py-2.5 px-4 font-bold text-slate-700 bg-slate-50/50">Istituto Bancario</td><td class="py-2.5 px-4 font-semibold text-slate-900">${banca}</td></tr>
            <tr class="hover:bg-slate-50/80 transition"><td class="py-2.5 px-4 font-bold text-slate-700 bg-slate-50/50">IBAN del Condominio</td><td class="py-2.5 px-4 font-mono font-bold text-slate-900">${iban}</td></tr>
            <tr class="hover:bg-slate-50/80 transition"><td class="py-2.5 px-4 font-bold text-slate-700 bg-slate-50/50">Compagnia Assicurativa (Polizza Fabbricati)</td><td class="py-2.5 px-4 font-semibold text-slate-800">${c.assicurazione_compagnia || '[Dato non fornito]'}</td></tr>
            <tr class="hover:bg-slate-50/80 transition"><td class="py-2.5 px-4 font-bold text-slate-700 bg-slate-50/50">Numero Polizza</td><td class="py-2.5 px-4 font-mono text-slate-800">${c.assicurazione_polizza || '[Dato non fornito]'}</td></tr>
            <tr class="hover:bg-slate-50/80 transition"><td class="py-2.5 px-4 font-bold text-slate-700 bg-slate-50/50">Scadenza Polizza</td><td class="py-2.5 px-4 font-semibold text-slate-800">${c.assicurazione_scadenza || '[Dato non fornito]'}</td></tr>
        `;
    }

    // Sezione 4: Note
    const boxNote = document.getElementById('box-scheda-note');
    if (boxNote) {
        const noteText = c.note_fabbricato || (c.scala ? `Complesso fabbricato articolato su ${c.scala}. ` : '') + (c.admin_ricevimento_note || 'Nessuna nota aggiuntiva.');
        boxNote.textContent = noteText;
    }
}

async function loadAnagrafica() {
    try {
        const res = await fetch('/api/condominio', { headers: getAuthHeaders() });
        const data = await res.json();
        if (data.success && data.data.nome) {
            state.CondominioInfo = data.data;
            state.condominioInfo = data.data;
            renderSchedaTecnicaView(data.data);
            renderDashboardHome(data.data);

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
    } catch(e) { console.error('Errore loadAnagrafica:', e); }
}

function renderDashboardHome(condo) {
    if (!condo) return;

    // Nome Fabbricato
    const dashNome = document.getElementById('dash-condo-nome');
    if (dashNome) dashNome.textContent = (condo.nome || 'CONDOMINIO').toUpperCase();

    // Dati generali stabile
    const dashIndirizzo = document.getElementById('dash-condo-indirizzo');
    if (dashIndirizzo) dashIndirizzo.textContent = condo.indirizzo || 'N/D';
    const dashCf = document.getElementById('dash-condo-cf');
    if (dashCf) dashCf.textContent = condo.cf || 'N/D';
    const dashScala = document.getElementById('dash-condo-scala');
    if (dashScala) dashScala.textContent = condo.scala || 'Unica';
    const dashCig = document.getElementById('dash-condo-cig');
    const dashCigBadge = document.getElementById('dash-condo-cig-badge');
    if (dashCig && dashCigBadge) {
        if (condo.cig) {
            dashCig.textContent = condo.cig;
            dashCigBadge.classList.remove('hidden');
        } else {
            dashCigBadge.classList.add('hidden');
        }
    }

    // ============================================================
    // DATI BANCARI (IBAN)
    // ============================================================
    const dashBanca = document.getElementById('dash-condo-dati-bancari');
    if (dashBanca) dashBanca.textContent = condo.dati_bancari || 'Non specificati';

    // ============================================================
    // DATI AMMINISTRATORE & CONTATTI ORDINARI
    // ============================================================
    const adminFullName = ((condo.admin_titolo ? condo.admin_titolo + ' ' : '') + (condo.admin_nome || '') + ' ' + (condo.admin_cognome || '')).trim() || 'N/D';
    const elAdminNome = document.getElementById('dash-admin-nome');
    if (elAdminNome) elAdminNome.textContent = adminFullName;

    const elAdminTel = document.getElementById('dash-admin-tel');
    if (elAdminTel) elAdminTel.textContent = condo.admin_telefono || 'N/D';

    const elAdminCell = document.getElementById('dash-admin-cell');
    if (elAdminCell) elAdminCell.textContent = condo.admin_cellulare || 'N/D';

    // ============================================================
    // IN EVIDENZA: EMAIL DEDICATA AL CONDOMINIO
    // ============================================================
    const emailDedicata = (condo.admin_email_condominio || condo.admin_email || 'test@gmail.com').trim();
    const elAdminEmail = document.getElementById('dash-admin-email');
    const elAdminEmailLink = document.getElementById('dash-admin-email-link');
    if (elAdminEmail) elAdminEmail.textContent = emailDedicata;
    if (elAdminEmailLink) {
        const condoNameEnc = encodeURIComponent(condo.nome || 'Condominio');
        elAdminEmailLink.href = `mailto:${emailDedicata}?subject=Richiesta Condomino - ${condoNameEnc}`;
    }

    // ============================================================
    // IN MASSIMA EVIDENZA: REPERIBILITÀ EMERGENZE
    // ============================================================
    const emergenzaNum = (condo.admin_emergenze || condo.admin_cellulare || condo.admin_telefono || '348 79512689').trim();
    const elAdminEmg = document.getElementById('dash-admin-emg');
    const elAdminEmgLink = document.getElementById('dash-admin-emg-link');
    if (elAdminEmg) elAdminEmg.textContent = emergenzaNum;
    if (elAdminEmgLink) {
        const cleanPhone = emergenzaNum.replace(/[^0-9+]/g, '');
        elAdminEmgLink.href = cleanPhone ? `tel:${cleanPhone}` : '#';
    }
}

window.copyIbanToClipboard = function() {
    const iban = (document.getElementById('dash-condo-dati-bancari')?.textContent || '').trim();
    if (iban && !iban.includes('Non specificati') && !iban.includes('In attesa') && !iban.includes('N/D')) {
        navigator.clipboard.writeText(iban).then(() => {
            showToast('IBAN copiato negli appunti!', 'success');
        }).catch(() => {
            showToast('Errore durante la copia dell\'IBAN', 'warning');
        });
    } else {
        showToast('Nessun IBAN valido configurato da copiare', 'info');
    }
};

async function handleSaveCondominio(e) {
    e.preventDefault();
    if (isLicenseReadOnly()) {
        showToast("Operazione bloccata: la licenza per questo condominio è scaduta o sospesa (Sola Lettura).", "error");
        return;
    }

    const adminNomeRaw = (document.getElementById('condominio-admin-nome')?.value || '').trim();
    let nomeSplitted = adminNomeRaw.split(' ');
    let adminNome = nomeSplitted[0] || '';
    let adminCognome = nomeSplitted.slice(1).join(' ') || '';

    const payload = {
        nome: (document.getElementById('condominio-nome').value || '').trim(),
        indirizzo: (document.getElementById('condominio-indirizzo').value || '').trim(),
        cf: (document.getElementById('condominio-cf').value || '').trim().toUpperCase(),
        cig: (document.getElementById('condominio-cig')?.value || '').trim().toUpperCase(),
        scala: (document.getElementById('condominio-scala').value || '').trim(),
        dati_bancari: (document.getElementById('condominio-dati-bancari')?.value || '').trim(),
        admin_studio_nome: (document.getElementById('condominio-studio-nome')?.value || '').trim(),
        admin_titolo: (document.getElementById('condominio-admin-titolo')?.value || '').trim(),
        admin_nome: adminNome,
        admin_cognome: adminCognome,
        admin_studio_indirizzo: (document.getElementById('condominio-studio-indirizzo')?.value || '').trim(),
        admin_telefono: (document.getElementById('condominio-admin-telefono')?.value || '').trim(),
        admin_emergenze: (document.getElementById('condominio-admin-emergenze')?.value || '').trim(),
        admin_cellulare: (document.getElementById('condominio-admin-cellulare')?.value || '').trim(),
        admin_email: (document.getElementById('condominio-admin-email')?.value || '').trim(),
        admin_email_condominio: (document.getElementById('condominio-admin-email-condo')?.value || '').trim(),
        admin_pec: (document.getElementById('condominio-admin-pec')?.value || '').trim(),
        admin_orari_ricevimento: (document.getElementById('condominio-admin-orari')?.value || '').trim(),
        assicurazione_compagnia: (document.getElementById('condominio-assicurazione-compagnia')?.value || '').trim(),
        assicurazione_polizza: (document.getElementById('condominio-assicurazione-polizza')?.value || '').trim(),
        assicurazione_scadenza: (document.getElementById('condominio-assicurazione-scadenza')?.value || '').trim(),
        note_fabbricato: (document.getElementById('condominio-note-fabbricato')?.value || '').trim()
    };

    try {
        const res = await fetch('/api/condominio', {
            method: 'PUT',
            headers: getAuthHeaders(),
            body: JSON.stringify(payload)
        });
        const data = await res.json();
        if (data.success) { 
            showToast('Scheda Anagrafica & Tecnica salvata con successo!', 'success'); 
            const headerCondo = document.getElementById('header-condo-name');
            if (headerCondo) headerCondo.textContent = payload.nome;
            const dashNome = document.getElementById('dash-condo-nome');
            if (dashNome) dashNome.textContent = payload.nome.toUpperCase();
            toggleEditScheda(false);
            loadAnagrafica();
        } else {
            showToast('Errore nel salvataggio: ' + (data.error || data.message || ''), 'error');
        }
    } catch(err) { 
        showToast('Errore di comunicazione col server', 'error'); 
    }
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

async function downloadSchedaTecnicaPdf() {
    showToast("Generazione PDF Scheda Anagrafica & Tecnica in corso...", "info");
    try {
        const res = await fetch('/api/export/scheda-tecnica-pdf', { headers: getAuthHeaders() });
        if (res.ok) {
            const blob = await res.blob();
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            const condoName = (state.activeCondominio && state.activeCondominio.nome) 
                ? state.activeCondominio.nome.replace(/[^a-zA-Z0-9_\-]/g, '_') 
                : 'Condominio';
            a.download = `Scheda_Anagrafica_Tecnica_${condoName}.pdf`;
            document.body.appendChild(a);
            a.click();
            a.remove();
            showToast("Scheda Anagrafica & Tecnica scaricata con successo!", "success");
            return;
        } else {
            const err = await res.json().catch(() => ({}));
            showToast(err.message || "Errore nella generazione del PDF", "error");
        }
    } catch(e) {
        console.error("Errore download scheda tecnica PDF:", e);
        showToast("Errore di connessione durante la generazione del PDF", "error");
    }
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
    if (!container) return;
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
                const internoStr = u.interno ? ` | Int: ${u.interno}` : '';
                const catastaliStr = u.dati_catastali ? `<div class="text-[10px] text-slate-400 font-mono mt-0.5"><i class="fa-solid fa-landmark text-[9px] mr-1"></i>${u.dati_catastali}</div>` : '';
                let displayIdent = u.identificativo || '';
                if (/^(Appartamento|Unit[àa])\s*\d+$/i.test(displayIdent)) {
                    displayIdent = u.interno ? `Int. ${u.interno}` : (u.tipo || 'Unità');
                }
                return `
                <tr class="hover:bg-slate-50 transition-colors">
                    <td class="px-6 py-4">
                        <div class="font-bold text-slate-800">${displayIdent}</div>
                        <div class="text-[11px] text-slate-400">Sc: ${u.scala || '-'} | P: ${u.piano || '-'}${internoStr}</div>
                        ${catastaliStr}
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
    if(document.getElementById('unita-interno')) document.getElementById('unita-interno').value = u ? (u.interno || '') : '';
    if(document.getElementById('unita-dati-catastali')) document.getElementById('unita-dati-catastali').value = u ? (u.dati_catastali || '') : '';
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
        scala: (document.getElementById('unita-scala').value || '').trim().toUpperCase(),
        piano: document.getElementById('unita-piano').value,
        interno: document.getElementById('unita-interno') ? document.getElementById('unita-interno').value.trim() : '',
        dati_catastali: document.getElementById('unita-dati-catastali') ? document.getElementById('unita-dati-catastali').value.trim() : '',
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
            if (typeof loadRubrica === 'function') loadRubrica();
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

function addCollaboratoreRow(data = {}) {
    const container = document.getElementById('admin-collaboratori-container');
    if (!container) return;
    
    const rowId = 'collab-' + Date.now() + '-' + Math.floor(Math.random() * 1000);
    const row = document.createElement('div');
    row.id = rowId;
    row.className = 'collab-row p-4 rounded-xl border border-slate-200 bg-white shadow-xs space-y-3';
    row.innerHTML = `
        <div class="flex items-center justify-between border-b border-slate-100 pb-2">
            <span class="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                <i class="fa-solid fa-user-gear text-indigo-500"></i> Scheda Collaboratore / Referente
            </span>
            <button type="button" onclick="document.getElementById('${rowId}').remove()" class="text-rose-500 hover:text-rose-700 hover:bg-rose-50 px-2 py-1 rounded-lg text-xs font-bold transition-all flex items-center gap-1">
                <i class="fa-solid fa-trash-can"></i> Rimuovi
            </button>
        </div>
        <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <div>
                <label class="block text-[11px] font-bold text-slate-600 mb-1">Titolo</label>
                <input type="text" class="collab-titolo w-full border border-slate-300 rounded-lg px-2.5 py-1.5 text-xs focus:border-indigo-500 outline-none" placeholder="es. Dott., Geom., Sig." value="${data.titolo ? String(data.titolo).replace(/"/g, '&quot;') : ''}">
            </div>
            <div class="sm:col-span-1 lg:col-span-2">
                <label class="block text-[11px] font-bold text-slate-600 mb-1">Nome e Cognome *</label>
                <input type="text" class="collab-nome w-full border border-slate-300 rounded-lg px-2.5 py-1.5 text-xs focus:border-indigo-500 outline-none font-bold text-slate-800" placeholder="es. Laura Bianchi" value="${data.nome ? String(data.nome).replace(/"/g, '&quot;') : ''}">
            </div>
            <div>
                <label class="block text-[11px] font-bold text-slate-600 mb-1">Ruolo / Reparto</label>
                <input type="text" class="collab-ruolo w-full border border-slate-300 rounded-lg px-2.5 py-1.5 text-xs focus:border-indigo-500 outline-none" placeholder="es. Contabilità, Tecnico, Segreteria" value="${data.ruolo ? String(data.ruolo).replace(/"/g, '&quot;') : ''}">
            </div>
            <div>
                <label class="block text-[11px] font-bold text-slate-600 mb-1">Telefono / Cellulare</label>
                <input type="text" class="collab-telefono w-full border border-slate-300 rounded-lg px-2.5 py-1.5 text-xs focus:border-indigo-500 outline-none" placeholder="es. 081 123456 int. 2" value="${data.telefono ? String(data.telefono).replace(/"/g, '&quot;') : ''}">
            </div>
            <div class="sm:col-span-1 lg:col-span-2">
                <label class="block text-[11px] font-bold text-slate-600 mb-1">Email Diretta</label>
                <input type="email" class="collab-email w-full border border-slate-300 rounded-lg px-2.5 py-1.5 text-xs focus:border-indigo-500 outline-none font-mono" placeholder="es. referente@studio.it" value="${data.email ? String(data.email).replace(/"/g, '&quot;') : ''}">
            </div>
            <div>
                <label class="block text-[11px] font-bold text-slate-600 mb-1">Giorni / Note Presenza</label>
                <input type="text" class="collab-note w-full border border-slate-300 rounded-lg px-2.5 py-1.5 text-xs focus:border-indigo-500 outline-none" placeholder="es. Mar e Gio matt." value="${data.note ? String(data.note).replace(/"/g, '&quot;') : ''}">
            </div>
        </div>
    `;
    container.appendChild(row);
}

function renderAdminProfileView() {
    const admin = state.CondominioInfo || {};
    const viewMode = document.getElementById('admin-view-mode');
    if (!viewMode) return;

    // Popolamento Form di Modifica
    if (document.getElementById('admin-studio-nome-input')) document.getElementById('admin-studio-nome-input').value = admin.admin_studio_nome || '';
    if (document.getElementById('admin-studio-indirizzo-input')) document.getElementById('admin-studio-indirizzo-input').value = admin.admin_studio_indirizzo || '';
    if (document.getElementById('admin-nome-input')) document.getElementById('admin-nome-input').value = admin.admin_nome || '';
    if (document.getElementById('admin-cognome-input')) document.getElementById('admin-cognome-input').value = admin.admin_cognome || '';
    if (document.getElementById('admin-titolo-input')) document.getElementById('admin-titolo-input').value = admin.admin_titolo || '';
    if (document.getElementById('admin-telefono-input')) document.getElementById('admin-telefono-input').value = admin.admin_telefono || '';
    if (document.getElementById('admin-cellulare-input')) document.getElementById('admin-cellulare-input').value = admin.admin_cellulare || '';
    if (document.getElementById('admin-emergenze-input')) document.getElementById('admin-emergenze-input').value = admin.admin_emergenze || '';
    if (document.getElementById('admin-email-input')) document.getElementById('admin-email-input').value = admin.admin_email || '';
    if (document.getElementById('admin-pec-input')) document.getElementById('admin-pec-input').value = admin.admin_pec || '';
    if (document.getElementById('admin-orari-ricevimento-input')) document.getElementById('admin-orari-ricevimento-input').value = admin.admin_orari_ricevimento || '';
    if (document.getElementById('admin-ricevimento-note-input')) document.getElementById('admin-ricevimento-note-input').value = admin.admin_ricevimento_note || '';

    // Collaboratori
    let collaboratori = [];
    if (admin.admin_collaboratori) {
        try {
            collaboratori = typeof admin.admin_collaboratori === 'string'
                ? JSON.parse(admin.admin_collaboratori)
                : admin.admin_collaboratori;
            if (!Array.isArray(collaboratori)) collaboratori = [];
        } catch (_) {
            collaboratori = [];
        }
    }

    // Popola righe collaboratori nel form
    const collabContainer = document.getElementById('admin-collaboratori-container');
    if (collabContainer) {
        collabContainer.innerHTML = '';
        if (collaboratori.length > 0) {
            collaboratori.forEach(c => addCollaboratoreRow(c));
        }
    }

    // Costruzione HTML Vista in Sola Lettura
    let html = '';

    // 1. Scheda Studio (se presente intestazione studio o indirizzo)
    const studioNome = admin.admin_studio_nome || '';
    const studioIndirizzo = admin.admin_studio_indirizzo || '';
    if (studioNome || studioIndirizzo) {
        html += `
            <div class="p-5 rounded-2xl bg-gradient-to-r from-violet-50 to-indigo-50 border border-violet-100 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div class="flex items-center gap-3.5">
                    <div class="w-12 h-12 rounded-xl bg-violet-600 text-white flex items-center justify-center text-xl shrink-0 shadow-xs">
                        <i class="fa-solid fa-building-columns"></i>
                    </div>
                    <div>
                        <span class="text-[10px] font-extrabold uppercase tracking-wider text-violet-700">Studio di Amministrazione</span>
                        <h3 class="text-lg font-black text-slate-900 leading-tight">${studioNome || 'Studio Amministrativo'}</h3>
                        ${studioIndirizzo ? `<p class="text-xs text-slate-600 mt-0.5 flex items-center gap-1.5"><i class="fa-solid fa-location-dot text-violet-500"></i> ${studioIndirizzo}</p>` : ''}
                    </div>
                </div>
            </div>
        `;
    }

    // 2. Recapiti Amministratore Principale
    const adminFullName = ((admin.admin_titolo ? admin.admin_titolo + ' ' : '') + (admin.admin_nome || '') + ' ' + (admin.admin_cognome || '')).trim();
    const contactCards = [
        { icon: 'fa-user-tie', label: 'Amministratore', value: adminFullName || 'N/D', isLink: false },
        { icon: 'fa-envelope', label: 'Email Ufficiale', value: admin.admin_email, isLink: true, linkType: 'mailto' },
        { icon: 'fa-at', label: 'PEC', value: admin.admin_pec, isLink: true, linkType: 'mailto' },
        { icon: 'fa-phone', label: 'Telefono Fisso', value: admin.admin_telefono, isLink: true, linkType: 'tel' },
        { icon: 'fa-mobile-screen', label: 'Cellulare', value: admin.admin_cellulare, isLink: true, linkType: 'tel' },
        { icon: 'fa-truck-medical', label: 'Emergenze & Reperibilità', value: admin.admin_emergenze, isEmergency: true, isLink: true, linkType: 'tel' }
    ].filter(f => f.value && f.value.trim() !== '');

    html += `
        <div>
            <h4 class="text-xs font-extrabold uppercase tracking-wider text-slate-400 mb-3 flex items-center gap-1.5">
                <i class="fa-solid fa-address-card text-violet-600"></i> Contatti Ufficiali Amministratore
            </h4>
            <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                ${contactCards.map(f => {
                    const color = f.isEmergency ? 'text-rose-600 bg-rose-50' : 'text-violet-600 bg-violet-50';
                    const labelColor = f.isEmergency ? 'text-rose-600 font-bold' : 'text-slate-500';
                    const border = f.isEmergency ? 'border-rose-200 bg-rose-50/40' : 'border-slate-100 bg-slate-50/50';
                    
                    let valHtml = `<span class="font-bold text-slate-800 truncate">${f.value}</span>`;
                    if (f.isLink && f.value) {
                        valHtml = `<a href="${f.linkType}:${f.value}" class="font-bold ${f.isEmergency ? 'text-rose-700 hover:text-rose-900' : 'text-violet-700 hover:text-violet-900'} hover:underline truncate">${f.value}</a>`;
                    }
                    return `
                        <div class="flex items-center space-x-3.5 p-4 rounded-2xl border ${border}">
                            <div class="w-11 h-11 rounded-xl flex items-center justify-center text-lg shrink-0 ${color}">
                                <i class="fa-solid ${f.icon}"></i>
                            </div>
                            <div class="overflow-hidden">
                                <p class="text-[10px] font-bold uppercase tracking-wider mb-0.5 ${labelColor}">${f.label}</p>
                                ${valHtml}
                            </div>
                        </div>
                    `;
                }).join('')}
            </div>
        </div>
    `;

    // 3. Ricevimento & Orari di Studio
    const orari = admin.admin_orari_ricevimento || '';
    const noteRicevimento = admin.admin_ricevimento_note || '';
    html += `
        <div class="p-5 rounded-2xl border border-amber-200 bg-amber-50/40 space-y-3">
            <div class="flex items-center gap-2">
                <div class="w-8 h-8 rounded-lg bg-amber-100 text-amber-700 flex items-center justify-center text-sm font-bold">
                    <i class="fa-solid fa-clock"></i>
                </div>
                <h4 class="text-sm font-extrabold text-slate-900">Giorni ed Orari di Ricevimento Studio</h4>
            </div>
            <div class="grid grid-cols-1 md:grid-cols-2 gap-4 pt-1">
                <div class="bg-white p-3.5 rounded-xl border border-amber-200/60 shadow-2xs">
                    <span class="block text-[10px] font-extrabold uppercase tracking-wider text-amber-700 mb-1">Orari di Apertura & Ricevimento</span>
                    <p class="text-xs sm:text-sm font-semibold text-slate-800 whitespace-pre-line">${orari ? orari : '<span class="text-slate-400 italic">Nessun orario di ricevimento specificato.</span>'}</p>
                </div>
                <div class="bg-white p-3.5 rounded-xl border border-amber-200/60 shadow-2xs">
                    <span class="block text-[10px] font-extrabold uppercase tracking-wider text-amber-700 mb-1">Modalità & Note di Ricevimento</span>
                    <p class="text-xs sm:text-sm text-slate-700 whitespace-pre-line">${noteRicevimento ? noteRicevimento : '<span class="text-slate-400 italic">Si riceve preferibilmente previo appuntamento concordato con lo studio.</span>'}</p>
                </div>
            </div>
        </div>
    `;

    // 4. Collaboratori & Referenti dello Studio
    html += `
        <div class="space-y-3 pt-2">
            <div class="flex items-center justify-between">
                <h4 class="text-xs font-extrabold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                    <i class="fa-solid fa-users-gear text-indigo-600"></i> Team di Studio & Collaboratori (${collaboratori.length})
                </h4>
            </div>
    `;

    if (collaboratori.length > 0) {
        html += `
            <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                ${collaboratori.map(c => {
                    const collabTitle = (c.titolo ? c.titolo + ' ' : '') + (c.nome || 'Collaboratore');
                    return `
                        <div class="p-4 rounded-2xl border border-slate-200 bg-white hover:border-indigo-200 shadow-2xs transition-all space-y-2.5">
                            <div class="flex items-start justify-between gap-2 border-b border-slate-100 pb-2">
                                <div>
                                    <h5 class="text-sm font-extrabold text-slate-900 leading-tight">${collabTitle}</h5>
                                    ${c.ruolo ? `<span class="inline-block mt-0.5 px-2 py-0.5 rounded-md text-[10px] font-bold bg-indigo-50 text-indigo-700 border border-indigo-100">${c.ruolo}</span>` : ''}
                                </div>
                                <div class="w-8 h-8 rounded-full bg-slate-100 text-slate-600 flex items-center justify-center text-xs shrink-0">
                                    <i class="fa-solid fa-user"></i>
                                </div>
                            </div>
                            <div class="space-y-1.5 text-xs">
                                ${c.telefono ? `
                                    <div class="flex items-center gap-2 text-slate-600">
                                        <i class="fa-solid fa-phone text-slate-400 w-3.5 text-center"></i>
                                        <a href="tel:${c.telefono}" class="font-semibold text-slate-800 hover:text-indigo-600 hover:underline">${c.telefono}</a>
                                    </div>
                                ` : ''}
                                ${c.email ? `
                                    <div class="flex items-center gap-2 text-slate-600">
                                        <i class="fa-solid fa-envelope text-slate-400 w-3.5 text-center"></i>
                                        <a href="mailto:${c.email}" class="font-semibold text-slate-800 hover:text-indigo-600 hover:underline truncate">${c.email}</a>
                                    </div>
                                ` : ''}
                                ${c.note ? `
                                    <div class="flex items-start gap-2 text-slate-500 pt-1 border-t border-slate-50 text-[11px]">
                                        <i class="fa-regular fa-clock text-slate-400 w-3.5 text-center mt-0.5"></i>
                                        <span>${c.note}</span>
                                    </div>
                                ` : ''}
                            </div>
                        </div>
                    `;
                }).join('')}
            </div>
        `;
    } else {
        html += `
            <div class="p-6 text-center text-slate-400 bg-slate-50/70 rounded-2xl border border-dashed border-slate-200">
                <i class="fa-solid fa-users text-slate-300 text-2xl mb-1.5 block"></i>
                <p class="text-xs font-medium">Nessun collaboratore aggiuntivo censito per questo studio.</p>
            </div>
        `;
    }

    html += `</div>`;

    viewMode.innerHTML = html;
}

function toggleEditAdmin(showForm) {
    const viewMode = document.getElementById('admin-view-mode');
    const editForm = document.getElementById('admin-edit-form');
    const editBtn = document.getElementById('btn-edit-admin');
    if (viewMode) viewMode.classList.toggle('hidden', showForm);
    if (editForm) editForm.classList.toggle('hidden', !showForm);
    if (editBtn) editBtn.classList.toggle('hidden', showForm);
}

async function saveAdminProfile(e) {
    e.preventDefault();

    // Raccoglie i collaboratori dalle righe dinamiche
    const collabRows = document.querySelectorAll('#admin-collaboratori-container .collab-row');
    const collaboratori = [];
    collabRows.forEach(row => {
        const titolo = (row.querySelector('.collab-titolo')?.value || '').trim();
        const nome = (row.querySelector('.collab-nome')?.value || '').trim();
        const ruolo = (row.querySelector('.collab-ruolo')?.value || '').trim();
        const telefono = (row.querySelector('.collab-telefono')?.value || '').trim();
        const email = (row.querySelector('.collab-email')?.value || '').trim();
        const note = (row.querySelector('.collab-note')?.value || '').trim();

        if (nome || telefono || email || ruolo) {
            collaboratori.push({ titolo, nome, ruolo, telefono, email, note });
        }
    });

    const payload = {
        admin_studio_nome: (document.getElementById('admin-studio-nome-input')?.value || '').trim(),
        admin_studio_indirizzo: (document.getElementById('admin-studio-indirizzo-input')?.value || '').trim(),
        admin_nome: (document.getElementById('admin-nome-input')?.value || '').trim(),
        admin_cognome: (document.getElementById('admin-cognome-input')?.value || '').trim(),
        admin_titolo: (document.getElementById('admin-titolo-input')?.value || '').trim(),
        admin_telefono: (document.getElementById('admin-telefono-input')?.value || '').trim(),
        admin_cellulare: (document.getElementById('admin-cellulare-input')?.value || '').trim(),
        admin_emergenze: (document.getElementById('admin-emergenze-input')?.value || '').trim(),
        admin_email: (document.getElementById('admin-email-input')?.value || '').trim(),
        admin_pec: (document.getElementById('admin-pec-input')?.value || '').trim(),
        admin_orari_ricevimento: (document.getElementById('admin-orari-ricevimento-input')?.value || '').trim(),
        admin_ricevimento_note: (document.getElementById('admin-ricevimento-note-input')?.value || '').trim(),
        admin_collaboratori: JSON.stringify(collaboratori)
    };

    try {
        const res = await fetch('/api/Condominio', {
            method: 'PUT',
            headers: getAuthHeaders(),
            body: JSON.stringify(payload)
        });
        const data = await res.json();
        if (data.success) {
            showToast('Dati amministratore e studio salvati con successo', 'success');
            toggleEditAdmin(false);
            loadAdminProfile();
        } else {
            showToast('Errore nel salvataggio: ' + (data.message || data.error || ''), 'error');
        }
    } catch (_) {
        showToast('Errore di connessione durante il salvataggio', 'error');
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
            loadConvocationsLog();
        } else {
            showToast('Errore invio email: ' + data.message, 'error');
        }
    } catch (e) {
        console.error(e);
        showToast('Errore di connessione durante l\'invio dell\'email.', 'error');
    }
}

function getCommTypeBadge(tipo) {
    const t = (tipo || '').toLowerCase();
    if (t.includes('convocazione')) {
        return `<span class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold bg-indigo-50 text-indigo-700 border border-indigo-200"><i class="fa-solid fa-landmark text-[10px]"></i> ${tipo}</span>`;
    }
    if (t.includes('sollecito')) {
        return `<span class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold bg-rose-50 text-rose-700 border border-rose-200"><i class="fa-solid fa-triangle-exclamation text-[10px]"></i> ${tipo}</span>`;
    }
    if (t.includes('ricevuta')) {
        return `<span class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200"><i class="fa-solid fa-circle-check text-[10px]"></i> ${tipo}</span>`;
    }
    return `<span class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold bg-sky-50 text-sky-700 border border-sky-200"><i class="fa-solid fa-bullhorn text-[10px]"></i> ${tipo || 'Comunicazione / Circolare'}</span>`;
}

function formatCommDateTime(dateStr) {
    if (!dateStr) return 'N/D';
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return dateStr;
    return d.toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit', year: 'numeric' }) + ' ore ' + d.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' });
}

function normalizeCommLogItem(log) {
    let tipo = log.tipo || '';
    let oggetto = log.oggetto || '';
    let nominativo = log.nominativo || log.user_nome || '';
    const rawDest = log.destinatario || '';

    if (!tipo) {
        if (/^RICEVUTA:/i.test(rawDest)) {
            tipo = 'Ricevuta di Pagamento';
            if (!nominativo) nominativo = rawDest.replace(/^RICEVUTA:\s*/i, '').trim();
            if (!oggetto) oggetto = 'Invio Ricevuta di Pagamento Quota Condominiale';
        } else if (/^SOLLECITO:/i.test(rawDest)) {
            tipo = 'Sollecito di Pagamento';
            if (!nominativo) nominativo = rawDest.replace(/^SOLLECITO:\s*/i, '').trim();
            if (!oggetto) oggetto = 'Invio Sollecito di Pagamento Scaduto';
        } else if (/^COMUNICAZIONE:/i.test(rawDest)) {
            tipo = 'Comunicazione / Circolare';
            if (!oggetto) oggetto = rawDest.replace(/^COMUNICAZIONE:\s*/i, '').trim();
            if (!nominativo) {
                const matchedUser = (state.users || []).find(u => u.id == log.user_id || (u.email && log.email && u.email.toLowerCase() === log.email.toLowerCase()));
                nominativo = matchedUser ? matchedUser.nome : ('Condòmino (' + (log.email || 'N/D') + ')');
            }
        } else {
            tipo = 'Convocazione Assemblea';
            if (!nominativo) nominativo = rawDest || 'Condòmino';
            if (!oggetto) oggetto = 'Convocazione Assemblea Condominiale';
        }
    } else {
        if (!nominativo) nominativo = rawDest || 'Condòmino';
        if (!oggetto) oggetto = tipo;
    }

    let unita = log.unita || log.user_unita || '';
    if (!unita && state.users) {
        const matchedUser = state.users.find(u => u.id == log.user_id || (u.email && log.email && u.email.toLowerCase() === log.email.toLowerCase()));
        if (matchedUser && matchedUser.unita) unita = matchedUser.unita;
    }

    return {
        ...log,
        nominativo,
        unita,
        tipo,
        oggetto
    };
}

function openArchivedCommDocument(logId) {
    const logs = state.communicationsLog || [];
    const item = logs.find(x => x.id == logId);
    if (!item) return;

    const activeCondoName = state.currentUser && state.currentUser.condomini
        ? (state.currentUser.condomini.find(c => c.id == state.activeCondominioId)?.nome || 'Condominio')
        : 'Condominio';

    const docHtml = item.contenuto_html && item.contenuto_html.trim()
        ? item.contenuto_html
        : `
            <div style="font-family: Arial, sans-serif; padding: 40px; color: #1e293b; max-width: 750px; margin: 0 auto;">
                <div style="text-align: center; border-bottom: 2px solid #1e293b; padding-bottom: 16px; margin-bottom: 30px;">
                    <h2 style="margin: 0; font-size: 20px;">AMMINISTRAZIONE CONDOMINIO</h2>
                    <h3 style="margin: 6px 0 0; font-size: 16px; color: #334155;">${activeCondoName}</h3>
                </div>
                <div style="background: #f8fafc; border: 1px solid #cbd5e1; border-radius: 12px; padding: 24px; margin-bottom: 30px;">
                    <h3 style="margin-top: 0; color: #1e3a8a; font-size: 16px;">ATTESTAZIONE DI ARCHIVIAZIONE COMUNICAZIONE INVIATA</h3>
                    <p style="margin: 8px 0;"><strong>ID Registro:</strong> #${item.id}</p>
                    <p style="margin: 8px 0;"><strong>Data e Ora di Invio:</strong> ${formatCommDateTime(item.data_invio)}</p>
                    <p style="margin: 8px 0;"><strong>Nominativo Destinatario:</strong> ${item.nominativo} ${item.unita ? '(' + item.unita + ')' : ''}</p>
                    <p style="margin: 8px 0;"><strong>Email Destinatario:</strong> ${item.email || 'N/D'}</p>
                    <p style="margin: 8px 0;"><strong>Tipologia:</strong> ${item.tipo}</p>
                    <p style="margin: 8px 0;"><strong>Oggetto / Causale:</strong> ${item.oggetto}</p>
                </div>
                <p style="font-size: 12px; color: #64748b; text-align: center;">Documento generato dall'Archivio Storico Comunicazioni Inviate della piattaforma CondoTransparent.</p>
            </div>
        `;

    const win = window.open('', '_blank');
    if (!win) {
        alert('Abilita i pop-up per visualizzare e stampare il documento archiviato.');
        return;
    }
    win.document.write(`
        <!DOCTYPE html>
        <html lang="it">
        <head>
            <meta charset="UTF-8">
            <title>Archivio Comunicazione #${item.id} - ${item.nominativo}</title>
            <style>
                @media print { .no-print-bar { display: none !important; } }
                body { margin: 0; padding: 0; background: #f1f5f9; }
                .no-print-bar {
                    background: #0f172a; color: white; padding: 12px 24px;
                    display: flex; justify-content: space-between; align-items: center;
                    font-family: Arial, sans-serif; font-size: 13px; position: sticky; top: 0; z-index: 50;
                }
                .btn-print {
                    background: #2563eb; color: white; border: none; padding: 8px 16px;
                    border-radius: 8px; font-weight: bold; cursor: pointer; font-size: 12px;
                }
                .page-sheet {
                    background: white; max-width: 820px; margin: 24px auto; padding: 20px;
                    box-shadow: 0 4px 20px rgba(0,0,0,0.08); border-radius: 8px;
                }
                @media print {
                    body { background: white; }
                    .page-sheet { box-shadow: none; margin: 0; padding: 0; max-width: 100%; }
                }
            </style>
        </head>
        <body>
            <div class="no-print-bar">
                <div>
                    <strong>Storico Comunicazioni Inviate</strong> — Destinatario: <b>${item.nominativo}</b> (${formatCommDateTime(item.data_invio)})
                </div>
                <button class="btn-print" onclick="window.print()">Stampa / Salva PDF</button>
            </div>
            <div class="page-sheet">
                ${docHtml}
            </div>
        </body>
        </html>
    `);
    win.document.close();
}

function populateStoricoNominativiFilter(logs) {
    const select = document.getElementById('storico-filter-user');
    if (!select) return;
    const currentVal = select.value;

    const namesSet = new Set();
    if (Array.isArray(state.users)) {
        state.users.forEach(u => {
            if (u.nome) namesSet.add(u.nome.trim());
        });
    }
    if (Array.isArray(logs)) {
        logs.forEach(l => {
            if (l.nominativo) namesSet.add(l.nominativo.trim());
        });
    }

    const sortedNames = Array.from(namesSet).sort((a, b) => a.localeCompare(b, 'it'));
    select.innerHTML = '<option value="">Tutti i Condòmini</option>' +
        sortedNames.map(name => `<option value="${name.replace(/"/g, '&quot;')}">${name}</option>`).join('');

    if (currentVal && sortedNames.includes(currentVal)) {
        select.value = currentVal;
    }
}

function resetStoricoComunicazioniFilters() {
    const searchInput = document.getElementById('storico-search-nominativo');
    const userSelect = document.getElementById('storico-filter-user');
    const tipoSelect = document.getElementById('storico-filter-tipo');
    if (searchInput) searchInput.value = '';
    if (userSelect) userSelect.value = '';
    if (tipoSelect) tipoSelect.value = '';
    filterStoricoComunicazioni();
}

function filterStoricoComunicazioni() {
    const logs = state.communicationsLog || [];
    const searchVal = (document.getElementById('storico-search-nominativo')?.value || '').trim().toLowerCase();
    const userFilter = (document.getElementById('storico-filter-user')?.value || '').trim().toLowerCase();
    const tipoFilter = (document.getElementById('storico-filter-tipo')?.value || '').trim().toLowerCase();

    const filtered = logs.filter(item => {
        if (userFilter && (item.nominativo || '').toLowerCase() !== userFilter) {
            return false;
        }
        if (tipoFilter && (item.tipo || '').toLowerCase() !== tipoFilter) {
            return false;
        }
        if (searchVal) {
            const haystack = [
                item.nominativo || '',
                item.email || '',
                item.unita || '',
                item.tipo || '',
                item.oggetto || '',
                formatCommDateTime(item.data_invio)
            ].join(' ').toLowerCase();
            if (!haystack.includes(searchVal)) return false;
        }
        return true;
    });

    const countEl = document.getElementById('storico-filter-results-count');
    if (countEl) {
        countEl.textContent = filtered.length === logs.length
            ? `Visualizzate tutte le ${logs.length} comunicazioni archiviate`
            : `Trovate ${filtered.length} comunicazioni su ${logs.length} totali`;
    }

    const tbody = document.getElementById('storico-comunicazioni-tbody');
    if (!tbody) return;

    if (filtered.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="5" class="py-10 text-center text-slate-400 italic">
                    Nessuna comunicazione trovata per i criteri di ricerca selezionati.
                </td>
            </tr>
        `;
        return;
    }

    tbody.innerHTML = filtered.map(log => {
        const initials = (log.nominativo || 'C').split(' ').filter(Boolean).slice(0, 2).map(p => p[0].toUpperCase()).join('');
        return `
            <tr class="hover:bg-slate-50/80 transition-colors">
                <td class="py-3.5 px-4 whitespace-nowrap">
                    <div class="font-bold text-slate-800">${formatCommDateTime(log.data_invio)}</div>
                    <div class="text-[10px] text-slate-400 font-mono">Prot. #${log.id}</div>
                </td>
                <td class="py-3.5 px-4">
                    <div class="flex items-center gap-2.5">
                        <div class="w-8 h-8 rounded-xl bg-indigo-50 text-indigo-700 border border-indigo-100 flex items-center justify-center font-extrabold text-[11px] shrink-0">
                            ${initials}
                        </div>
                        <div>
                            <div class="font-bold text-slate-900 flex items-center gap-1.5 flex-wrap">
                                <span>${log.nominativo}</span>
                                ${log.unita ? `<span class="px-2 py-0.5 rounded-md bg-slate-100 text-slate-600 text-[10px] font-bold">${log.unita}</span>` : ''}
                            </div>
                            <div class="text-[11px] text-slate-500">${log.email || 'N/D'}</div>
                        </div>
                    </div>
                </td>
                <td class="py-3.5 px-4 whitespace-nowrap">
                    ${getCommTypeBadge(log.tipo)}
                </td>
                <td class="py-3.5 px-4">
                    <div class="font-semibold text-slate-800 max-w-md">${log.oggetto}</div>
                </td>
                <td class="py-3.5 px-4 text-right whitespace-nowrap">
                    <div class="inline-flex items-center justify-end gap-2">
                        <button onclick="openArchivedCommDocument(${log.id})" class="px-3 py-1.5 rounded-xl bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 font-bold text-[11px] inline-flex items-center gap-1.5 transition-colors" title="Visualizza e ristampa il documento archiviato">
                            <i class="fa-solid fa-file-pdf"></i>
                            <span>Documento</span>
                        </button>
                        ${log.preview_url ? `
                            <a href="${log.preview_url}" target="_blank" class="px-2.5 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-[11px] inline-flex items-center gap-1 transition-colors" title="Apri anteprima email">
                                <i class="fa-solid fa-arrow-up-right-from-square text-[10px]"></i>
                                <span>Email</span>
                            </a>
                        ` : ''}
                    </div>
                </td>
            </tr>
        `;
    }).join('');
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

        const logs = (data.success && Array.isArray(data.data))
            ? data.data.map(normalizeCommLogItem)
            : [];
        state.communicationsLog = logs;

        // Aggiorna contatori KPI nella scheda Storico Comunicazioni Inviate
        const kpiTot = document.getElementById('storico-kpi-totale');
        const kpiConv = document.getElementById('storico-kpi-convocazioni');
        const kpiCirc = document.getElementById('storico-kpi-circolari');
        const kpiCont = document.getElementById('storico-kpi-contabili');
        if (kpiTot) kpiTot.textContent = logs.length;
        if (kpiConv) kpiConv.textContent = logs.filter(l => (l.tipo || '').toLowerCase().includes('convocazione')).length;
        if (kpiCirc) kpiCirc.textContent = logs.filter(l => (l.tipo || '').toLowerCase().includes('comunicazione') || (l.tipo || '').toLowerCase().includes('circolare')).length;
        if (kpiCont) kpiCont.textContent = logs.filter(l => (l.tipo || '').toLowerCase().includes('sollecito') || (l.tipo || '').toLowerCase().includes('ricevuta')).length;

        populateStoricoNominativiFilter(logs);
        filterStoricoComunicazioni();

        const renderCompactCards = (items) => (items && items.length > 0) ? items.slice(0, 10).map(log => `
            <div class="bg-white rounded-2xl border border-slate-200 shadow-xs p-4 flex flex-col sm:flex-row justify-between sm:items-center gap-3 hover:border-indigo-200 transition-colors">
                <div class="space-y-1">
                    <div class="flex items-center gap-2 flex-wrap">
                        ${getCommTypeBadge(log.tipo)}
                        <span class="font-extrabold text-slate-900 text-sm">${log.nominativo}</span>
                        ${log.unita ? `<span class="px-2 py-0.5 rounded-md bg-slate-100 text-slate-600 text-[10px] font-bold">${log.unita}</span>` : ''}
                    </div>
                    <div class="text-xs font-semibold text-slate-700">${log.oggetto}</div>
                    <div class="text-[11px] text-slate-400">${log.email || ''}</div>
                </div>
                <div class="flex sm:flex-col items-center sm:items-end justify-between gap-2 shrink-0">
                    <div class="text-xs font-bold text-slate-700">${formatCommDateTime(log.data_invio)}</div>
                    <div class="flex items-center gap-2">
                        <button onclick="openArchivedCommDocument(${log.id})" class="px-2.5 py-1 rounded-lg bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 text-[11px] font-bold inline-flex items-center gap-1">
                            <i class="fa-solid fa-file-pdf"></i> Documento
                        </button>
                        ${log.preview_url ? `<a href="${log.preview_url}" target="_blank" class="text-[11px] font-bold text-blue-600 hover:underline">Vedi Email</a>` : ''}
                    </div>
                </div>
            </div>
        `).join('') : `<div class="py-4 text-center text-slate-400 bg-white rounded-2xl border text-sm italic">Nessuna comunicazione inviata finora.</div>`;

        const container1 = document.getElementById('assemblies-log-container');
        if (container1) container1.innerHTML = renderCompactCards(logs);

        const container2 = document.getElementById('communications-log-container');
        if (container2) container2.innerHTML = renderCompactCards(logs);
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
            loadConvocationsLog();
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
            loadConvocationsLog();
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
            loadConvocationsLog();
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
    if (typeof window.loadCondominoFinanceDashboard === 'function') window.loadCondominoFinanceDashboard();
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
            if (typeof populateUsersPersonaSelect === 'function') populateUsersPersonaSelect();
        }
    } catch(e) { console.error('Errore loadRubrica', e); }
}

function renderRubricaTable() {
    const tbody = document.getElementById('persone-table-body');
    if (!tbody) return;
    if (!state.anagraficaPersone || state.anagraficaPersone.length === 0) {
        tbody.innerHTML = '<tr><td colspan="7" class="py-12 text-center text-slate-400"><i class="fa-solid fa-users text-3xl mb-2 text-slate-300 block"></i>Nessuna persona inserita nell\'anagrafica.<br><span class="text-xs text-slate-400">Clicca su "Nuova Persona" in alto per censire un condòmino o proprietario con la relativa unità.</span></td></tr>';
        return;
    }
    
    tbody.innerHTML = state.anagraficaPersone.map(p => {
        // Dettagli anagrafici secondari (residenza, nascita)
        let extraBio = [];
        if (p.residenza) extraBio.push(`<span title="Residenza"><i class="fa-solid fa-house-chimney text-slate-400 mr-1"></i>${p.residenza}</span>`);
        if (p.luogo_nascita || p.data_nascita) {
            let nStr = 'Nato ';
            if (p.luogo_nascita) nStr += `a ${p.luogo_nascita} `;
            if (p.data_nascita) nStr += `il ${formatItalianDateNumeric(p.data_nascita)}`;
            extraBio.push(`<span title="Nascita"><i class="fa-solid fa-cake-candles text-slate-400 mr-1"></i>${nStr.trim()}</span>`);
        }
        const extraBioHtml = extraBio.length > 0 
            ? `<div class="text-[11px] text-slate-500 mt-1 space-y-0.5">${extraBio.join('<br>')}</div>` 
            : '';

        // Dettaglio Unità
        let unitaHtml = '';
        const hasUnita = p.unita_id || p.unita_identificativo || p.unita_interno || p.unita_scala || p.unita_piano || p.unita_dati_catastali || (parseFloat(p.unita_mill_prop) > 0);
        if (hasUnita) {
            const tipo = p.unita_tipo || 'Appartamento';
            let rawIdent = (p.unita_identificativo || '').trim();
            // Ignoriamo codici fittizi come 'Appartamento 60005' o identificativi ridondanti
            const isAutoId = /^(Appartamento|Unit[àa])\s*\d+$/i.test(rawIdent);
            const isJustTipo = rawIdent.toLowerCase() === tipo.toLowerCase();
            const isJustInterno = p.unita_interno && (rawIdent.toLowerCase() === ('int. ' + p.unita_interno).toLowerCase() || rawIdent.toLowerCase() === ('interno ' + p.unita_interno).toLowerCase() || rawIdent.toLowerCase() === p.unita_interno.toLowerCase());
            
            const customIdent = (!isAutoId && !isJustTipo && !isJustInterno) ? rawIdent : '';
            
            const sc = p.unita_scala ? `Sc: <b class="text-slate-700">${p.unita_scala}</b>` : '';
            const pi = p.unita_piano ? `P: <b class="text-slate-700">${p.unita_piano}</b>` : '';
            const inT = p.unita_interno ? `Int: <b class="text-slate-700">${p.unita_interno}</b>` : '';
            const locDetails = [sc, pi, inT].filter(Boolean).join(' | ');
            const catast = p.unita_dati_catastali ? `<div class="text-[10px] text-slate-400 font-mono mt-0.5"><i class="fa-solid fa-landmark text-[9px] mr-1"></i>${p.unita_dati_catastali}</div>` : '';
            
            unitaHtml = `
                <div class="font-bold text-slate-800 flex items-center gap-1.5 flex-wrap">
                    <span class="px-2 py-0.5 rounded text-[11px] font-semibold bg-blue-50 text-blue-700 border border-blue-200/60">${tipo}</span>
                    ${customIdent ? `<span class="text-xs text-slate-700 font-semibold">${customIdent}</span>` : ''}
                </div>
                ${locDetails ? `<div class="text-[11px] text-slate-600 font-medium mt-0.5">${locDetails}</div>` : ''}
                ${catast}
            `;
        } else {
            unitaHtml = `<span class="text-slate-400 italic text-xs">Nessuna unità collegata</span>`;
        }

        // Millesimi
        let millHtml = '';
        if (p.unita_mill_prop !== null && p.unita_mill_prop !== undefined && (parseFloat(p.unita_mill_prop) > 0 || parseFloat(p.unita_mill_scale) > 0 || parseFloat(p.unita_mill_asc) > 0)) {
            millHtml = `
                <div class="font-mono text-xs"><span class="text-slate-500 font-sans text-[11px]">Prop:</span> <b class="text-slate-900">${(parseFloat(p.unita_mill_prop) || 0).toFixed(2)}</b></div>
                <div class="font-mono text-[11px] text-slate-500 mt-0.5">Sc: ${(parseFloat(p.unita_mill_scale) || 0).toFixed(2)} | Asc: ${(parseFloat(p.unita_mill_asc) || 0).toFixed(2)}</div>
            `;
        } else {
            millHtml = `<span class="text-slate-400 text-xs">-</span>`;
        }

        // Contatti
        let contatti = [];
        if (p.cellulare) contatti.push(`<div class="text-xs text-slate-700"><i class="fa-solid fa-mobile-screen text-emerald-600 mr-1.5 w-3.5 text-center"></i>${p.cellulare}</div>`);
        if (p.telefono) contatti.push(`<div class="text-xs text-slate-600"><i class="fa-solid fa-phone text-slate-400 mr-1.5 w-3.5 text-center"></i>${p.telefono}</div>`);
        if (p.email) contatti.push(`<div class="text-xs text-slate-700 truncate max-w-[200px]"><i class="fa-solid fa-envelope text-blue-500 mr-1.5 w-3.5 text-center"></i><a href="mailto:${p.email}" class="hover:underline text-blue-600">${p.email}</a></div>`);
        if (p.pec) contatti.push(`<div class="text-[11px] text-indigo-700 truncate max-w-[200px] font-medium"><i class="fa-solid fa-stamp text-indigo-500 mr-1.5 w-3.5 text-center"></i>${p.pec}</div>`);
        const contattiHtml = contatti.length > 0 ? contatti.join('') : '<span class="text-slate-400 text-xs">-</span>';

        // Badge Ruolo
        const isConduttore = p.ruolo_default === 'Conduttore';
        const isUsufruttuario = p.ruolo_default === 'Usufruttuario';
        const isComproprietario = p.ruolo_default === 'Comproprietario';
        let badgeClass = 'bg-indigo-50 text-indigo-700 border border-indigo-200/80';
        if (isConduttore) badgeClass = 'bg-amber-50 text-amber-700 border border-amber-200/80';
        else if (isUsufruttuario) badgeClass = 'bg-purple-50 text-purple-700 border border-purple-200/80';
        else if (isComproprietario) badgeClass = 'bg-teal-50 text-teal-700 border border-teal-200/80';

        const safeNome = (p.cognome + ' ' + p.nome).replace(/'/g, "\\'");

        return `
            <tr class="hover:bg-slate-50/80 transition-colors">
                <td class="py-3.5 px-4">
                    <div class="font-bold text-slate-900 text-sm">${p.cognome} ${p.nome}</div>
                    ${extraBioHtml}
                </td>
                <td class="py-3.5 px-4 font-mono text-xs text-slate-700 uppercase font-semibold">${p.codice_fiscale || '-'}</td>
                <td class="py-3.5 px-4">${unitaHtml}</td>
                <td class="py-3.5 px-4">${millHtml}</td>
                <td class="py-3.5 px-4 space-y-0.5">${contattiHtml}</td>
                <td class="py-3.5 px-4">
                    <span class="px-2.5 py-1 rounded-full text-xs font-semibold ${badgeClass}">
                        ${p.ruolo_default || 'Proprietario'}
                    </span>
                </td>
                <td class="py-3.5 px-4 text-right whitespace-nowrap">
                    <button onclick="sendOnboardingInviteForPersona(${p.id}, '${safeNome}')" class="p-2 text-blue-600 hover:bg-blue-50 rounded-xl transition-colors" title="Invia Invito e Primo Accesso (Flusso Onboarding 72h)">
                        <i class="fa-solid fa-paper-plane"></i>
                    </button>
                    <button onclick="openNewQuoteModalForPersona(${p.id})" class="p-2 text-emerald-600 hover:bg-emerald-50 rounded-xl transition-colors ml-1" title="Calcola Quota per Millesimi per questo Condòmino">
                        <i class="fa-solid fa-calculator"></i>
                    </button>
                    <button onclick="openPersonaModal(${p.id})" class="p-2 text-indigo-600 hover:bg-indigo-50 rounded-xl transition-colors ml-1" title="Modifica Scheda">
                        <i class="fa-solid fa-pen-to-square"></i>
                    </button>
                    <button onclick="deletePersona(${p.id}, '${safeNome}')" class="p-2 text-rose-500 hover:bg-rose-50 rounded-xl transition-colors ml-1" title="Elimina Persona">
                        <i class="fa-solid fa-trash-can"></i>
                    </button>
                </td>
            </tr>
        `;
    }).join('');

    const tfoot = document.getElementById('persone-table-footer');
    if (tfoot) {
        const totProp = state.anagraficaPersone.reduce((acc, p) => acc + (parseFloat(p.unita_mill_prop) || 0), 0);
        const totScale = state.anagraficaPersone.reduce((acc, p) => acc + (parseFloat(p.unita_mill_scale) || 0), 0);
        const totAsc = state.anagraficaPersone.reduce((acc, p) => acc + (parseFloat(p.unita_mill_asc) || 0), 0);
        tfoot.innerHTML = `
            <tr class="bg-slate-50/90 text-xs font-bold text-slate-800">
                <td colspan="3" class="py-3 px-4 text-right uppercase tracking-wider text-slate-500">Totale Millesimi Censiti in Anagrafica:</td>
                <td class="py-3 px-4 font-mono">
                    <div class="text-slate-900">Prop: <b>${totProp.toFixed(2)}</b> / 1000</div>
                    <div class="text-[11px] text-slate-500">Sc: ${totScale.toFixed(2)} | Asc: ${totAsc.toFixed(2)}</div>
                </td>
                <td colspan="3" class="py-3 px-4 text-right">
                    <button type="button" onclick="openMillesimiCalculatorModal()" class="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition shadow-2xs">
                        <i class="fa-solid fa-calculator mr-1"></i> Simula o Ripartisci Spesa
                    </button>
                </td>
            </tr>
        `;
    }
}

function openPersonaModal(id = null) {
    if (typeof isLicenseReadOnly === 'function' && isLicenseReadOnly()) {
        showToast("Condominio in Sola Lettura: inserimento o modifica anagrafica bloccata.", "warning");
        return;
    }
    let p = null;
    if (id && state.anagraficaPersone) p = state.anagraficaPersone.find(x => x.id === id);
    
    const titleEl = document.getElementById('persona-modal-title');
    if (titleEl) {
        titleEl.innerHTML = p 
            ? `<i class="fa-solid fa-user-pen text-indigo-600"></i> Modifica Scheda: ${p.cognome} ${p.nome}`
            : `<i class="fa-solid fa-user-plus text-indigo-600"></i> Nuova Scheda Anagrafica Condòmino`;
    }
        
    document.getElementById('persona-id').value = p ? p.id : '';
    document.getElementById('persona-unita-id').value = p ? (p.unita_id || '') : '';
    document.getElementById('persona-cognome').value = p ? (p.cognome || '') : '';
    document.getElementById('persona-nome').value = p ? (p.nome || '') : '';
    document.getElementById('persona-ruolo').value = p ? (p.ruolo_default || 'Proprietario') : 'Proprietario';
    document.getElementById('persona-cf').value = p ? (p.codice_fiscale || '') : '';
    document.getElementById('persona-data-nascita').value = p ? (p.data_nascita || '') : '';
    document.getElementById('persona-luogo-nascita').value = p ? (p.luogo_nascita || '') : '';
    document.getElementById('persona-residenza').value = p ? (p.residenza || '') : '';
    
    document.getElementById('persona-cell').value = p ? (p.cellulare || '') : '';
    document.getElementById('persona-tel').value = p ? (p.telefono || '') : '';
    document.getElementById('persona-email').value = p ? (p.email || '') : '';
    document.getElementById('persona-pec').value = p ? (p.pec || '') : '';
    
    let identVal = p ? (p.unita_identificativo || '') : '';
    if (/^(Appartamento|Unit[àa])\s*\d+$/i.test(identVal)) {
        identVal = '';
    }
    document.getElementById('persona-unita-identificativo').value = identVal;
    document.getElementById('persona-unita-tipo').value = p ? (p.unita_tipo || 'Appartamento') : 'Appartamento';
    document.getElementById('persona-unita-scala').value = p ? (p.unita_scala || '') : '';
    document.getElementById('persona-unita-piano').value = p ? (p.unita_piano || '') : '';
    document.getElementById('persona-unita-interno').value = p ? (p.unita_interno || '') : '';
    document.getElementById('persona-unita-catastali').value = p ? (p.unita_dati_catastali || '') : '';
    
    document.getElementById('persona-unita-mill-prop').value = p ? (p.unita_mill_prop ?? '0') : '';
    document.getElementById('persona-unita-mill-scale').value = p ? (p.unita_mill_scale ?? '0') : '';
    document.getElementById('persona-unita-mill-asc').value = p ? (p.unita_mill_asc ?? '0') : '';
    
    document.getElementById('persona-notes').value = p ? (p.notes || '') : '';
    
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
        cognome: document.getElementById('persona-cognome').value.trim(),
        nome: document.getElementById('persona-nome').value.trim(),
        codice_fiscale: document.getElementById('persona-cf').value.trim(),
        ruolo_default: document.getElementById('persona-ruolo').value,
        data_nascita: document.getElementById('persona-data-nascita').value,
        luogo_nascita: document.getElementById('persona-luogo-nascita').value.trim(),
        residenza: document.getElementById('persona-residenza').value.trim(),
        cellulare: document.getElementById('persona-cell').value.trim(),
        telefono: document.getElementById('persona-tel').value.trim(),
        email: document.getElementById('persona-email').value.trim(),
        pec: document.getElementById('persona-pec').value.trim(),
        
        unita_id: document.getElementById('persona-unita-id').value || null,
        unita_identificativo: document.getElementById('persona-unita-identificativo').value.trim(),
        unita_tipo: document.getElementById('persona-unita-tipo').value,
        unita_scala: document.getElementById('persona-unita-scala').value.trim().toUpperCase(),
        unita_piano: document.getElementById('persona-unita-piano').value.trim(),
        unita_interno: document.getElementById('persona-unita-interno').value.trim(),
        unita_dati_catastali: document.getElementById('persona-unita-catastali').value.trim(),
        unita_mill_prop: parseFloat(document.getElementById('persona-unita-mill-prop').value) || 0,
        unita_mill_scale: parseFloat(document.getElementById('persona-unita-mill-scale').value) || 0,
        unita_mill_asc: parseFloat(document.getElementById('persona-unita-mill-asc').value) || 0,
        
        notes: document.getElementById('persona-notes').value.trim()
    };

    const method = id ? 'PUT' : 'POST';
    const url = id ? '/api/anagrafica-persone/' + id : '/api/anagrafica-persone';

    try {
        const res = await fetch(url, {
            method,
            headers: getAuthHeaders(),
            body: JSON.stringify(body)
        });
        const data = await res.json();
        if (res.ok && data.success) {
            closePersonaModal();
            showToast(id ? "Scheda persona e unità aggiornate con successo!" : "Persona e unità create con successo!", "success");
            loadRubrica();
            if (typeof loadUnita === 'function') loadUnita();
        } else {
            showToast(data.message || "Errore durante il salvataggio", "error");
        }
    } catch(err) {
        console.error(err);
        showToast("Errore di rete o del server", "error");
    }
}

async function deletePersona(id, nominativo) {
    if (typeof isLicenseReadOnly === 'function' && isLicenseReadOnly()) {
        showToast("Operazione bloccata: il condominio è in modalità Sola Lettura.", "error");
        return;
    }
    if (!confirm(`Sei sicuro di voler eliminare "${nominativo}" dall'anagrafica? L'eventuale unità collegata non verrà cancellata ma rimarrà senza assegnazione.`)) {
        return;
    }
    try {
        const res = await fetch('/api/anagrafica-persone/' + id, {
            method: 'DELETE',
            headers: getAuthHeaders()
        });
        const data = await res.json();
        if (res.ok && data.success) {
            showToast("Persona eliminata dall'anagrafica.", "info");
            loadRubrica();
            if (typeof loadUnita === 'function') loadUnita();
        } else {
            showToast(data.message || "Errore durante l'eliminazione", "error");
        }
    } catch(e) {
        console.error(e);
        showToast("Errore di rete", "error");
    }
}

// ============================================================================
// FLUSSO A: INVITO E PRIMO ACCESSO (ONBOARDING) DA RUBRICA
// ============================================================================
window.sendOnboardingInviteForPersona = async function(id, nominativo) {
    if (typeof isLicenseReadOnly === 'function' && isLicenseReadOnly()) {
        showToast("Operazione bloccata: il condominio è in modalità Sola Lettura.", "warning");
        return;
    }
    if (!confirm(`Desideri inviare l'email di Invito e Primo Accesso (onboarding sicuro, valido 72 ore) a "${nominativo}"?`)) {
        return;
    }

    showToast(`Invio invito a ${nominativo} in corso...`, "info");

    try {
        const res = await fetch(`/api/anagrafica-persone/${id}/send-invite`, {
            method: 'POST',
            headers: getAuthHeaders()
        });
        const data = await res.json();

        if (res.ok && data.success) {
            showToast(data.message || `Invito inviato con successo a ${nominativo}!`, "success");
            if (data.previewUrl) {
                console.log(`🔗 [Test Ethereal] Invito primo accesso inviato: ${data.previewUrl}`);
            }
        } else {
            showToast(data.message || "Errore durante l'invio dell'invito.", "error");
        }
    } catch (e) {
        console.error(e);
        showToast("Errore di comunicazione con il server.", "error");
    }
};

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

// ============================================================================
// CALCOLATORE & RIPARTIZIONE SPESE PER MILLESIMI (ESPERTO CONTABILE)
// ============================================================================

let millesimiDistributionRows = [];

window.deleteQuote = async function(id) {
    if (typeof isLicenseReadOnly === 'function' && isLicenseReadOnly()) {
        showToast("Operazione bloccata: il condominio è in modalità Sola Lettura.", "error");
        return;
    }
    if (!confirm('Sei sicuro di voler eliminare questa quota condominiale?')) return;
    try {
        const res = await fetch(`/api/quotes/${id}`, {
            method: 'DELETE',
            headers: getAuthHeaders()
        });
        const data = await res.json();
        if (res.ok && data.success) {
            showToast('Quota eliminata con successo.', 'success');
            if (typeof loadAccountingData === 'function') loadAccountingData();
        } else {
            showToast(data.message || 'Errore eliminazione quota.', 'error');
        }
    } catch (_) {
        showToast('Errore di connessione.', 'error');
    }
};

async function ensureMillesimiDataLoaded() {
    try {
        const resPers = await fetch('/api/anagrafica-persone', { headers: getAuthHeaders() });
        const dataPers = await resPers.json().catch(() => ({}));
        if (dataPers.success) state.anagraficaPersone = dataPers.data || [];
    } catch (e) {
        console.warn('Errore caricamento dati millesimi da Anagrafica:', e);
    }
}

function getPersonaOrUnitMillesimi(personaId, unitaId, tabella = 'proprieta') {
    const colMap = {
        proprieta: 'unita_mill_prop',
        scale: 'unita_mill_scale',
        ascensore: 'unita_mill_asc'
    };
    const colName = colMap[tabella] || colMap.proprieta;

    if (!Array.isArray(state.anagraficaPersone)) return 0;

    if (personaId) {
        const p = state.anagraficaPersone.find(x => String(x.id) === String(personaId));
        if (p) return parseFloat(p[colName]) || 0;
    }
    if (unitaId) {
        const pByUnit = state.anagraficaPersone.find(x => String(x.unita_id) === String(unitaId));
        if (pByUnit) return parseFloat(pByUnit[colName]) || 0;
    }
    return 0;
}

window.onQuotePersonaOrUnitaChange = function(source) {
    const selPersona = document.getElementById('quote-persona-id');
    const selUnita = document.getElementById('quote-unita-id');
    const tabella = document.getElementById('single-calc-tabella')?.value || 'proprieta';

    if (source === 'persona' && selPersona && selPersona.value && Array.isArray(state.anagraficaPersone)) {
        const p = state.anagraficaPersone.find(x => String(x.id) === String(selPersona.value));
        if (p && selUnita) {
            selUnita.value = p.unita_id ? String(p.unita_id) : '';
        }
    } else if (source === 'unita' && selUnita && selUnita.value && Array.isArray(state.anagraficaPersone)) {
        const p = state.anagraficaPersone.find(x => String(x.unita_id) === String(selUnita.value));
        if (p && selPersona) {
            selPersona.value = String(p.id);
        }
    }

    const mill = getPersonaOrUnitMillesimi(selPersona?.value, selUnita?.value, tabella);
    const millInput = document.getElementById('single-calc-user-millesimi');
    if (millInput) {
        millInput.value = mill > 0 ? mill : '';
    }
    computeSingleQuoteMillesimi();
};

window.onSingleCalcTabellaChange = function() {
    const selPersona = document.getElementById('quote-persona-id');
    const selUnita = document.getElementById('quote-unita-id');
    const tabella = document.getElementById('single-calc-tabella')?.value || 'proprieta';
    const mill = getPersonaOrUnitMillesimi(selPersona?.value, selUnita?.value, tabella);
    const millInput = document.getElementById('single-calc-user-millesimi');
    if (millInput) {
        millInput.value = mill > 0 ? mill : '';
    }
    computeSingleQuoteMillesimi();
};

window.computeSingleQuoteMillesimi = function() {
    const spesaTotale = parseFloat(document.getElementById('single-calc-total-expense')?.value) || 0;
    const millTotali = parseFloat(document.getElementById('single-calc-total-millesimi')?.value) || 1000;
    const millCondomino = parseFloat(document.getElementById('single-calc-user-millesimi')?.value) || 0;
    const stepsBox = document.getElementById('single-calc-steps-box');
    const amountInput = document.getElementById('quote-amount');

    if (spesaTotale <= 0 || millTotali <= 0 || millCondomino <= 0) {
        if (stepsBox) stepsBox.classList.add('hidden');
        return;
    }

    const quotaPerMillesimo = spesaTotale / millTotali;
    const quotaEsatta = quotaPerMillesimo * millCondomino;
    const quotaArrotondata = Math.round(quotaEsatta * 100) / 100;

    if (amountInput) {
        amountInput.value = quotaArrotondata.toFixed(2);
    }

    if (stepsBox) {
        stepsBox.classList.remove('hidden');
        stepsBox.innerHTML = `
            <div class="font-sans font-bold text-emerald-900 mb-1 flex items-center justify-between">
                <span><i class="fa-solid fa-check-circle text-emerald-600 mr-1"></i>Passaggi Matematici Applicati:</span>
                <span class="text-xs bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded-lg font-extrabold">€ ${quotaArrotondata.toFixed(2)}</span>
            </div>
            <div><b>1. Formula:</b> (Spesa Totale &divide; Millesimi Totali) &times; Millesimi Condòmino</div>
            <div><b>2. Valore 1 Millesimo:</b> € ${spesaTotale.toFixed(2)} &divide; ${millTotali} = <b>€ ${quotaPerMillesimo.toFixed(6)}</b></div>
            <div><b>3. Quota Condòmino:</b> € ${quotaPerMillesimo.toFixed(6)} &times; ${millCondomino} = € ${quotaEsatta.toFixed(4)}</div>
            <div class="text-emerald-800 font-bold pt-0.5 border-t border-emerald-100"><b>4. Arrotondamento al centesimo:</b> € ${quotaArrotondata.toFixed(2)}</div>
        `;
    }
};

window.openNewQuoteModalForPersona = async function(personaId) {
    await ensureMillesimiDataLoaded();
    await openNewQuoteModal();
    const selPersona = document.getElementById('quote-persona-id');
    if (selPersona && personaId) {
        selPersona.value = String(personaId);
        onQuotePersonaOrUnitaChange('persona');
    }
    const dueEl = document.getElementById('quote-due-date');
    if (dueEl && !dueEl.value) {
        dueEl.value = new Date(Date.now() + 15 * 86400000).toISOString().slice(0, 10);
    }
    const expEl = document.getElementById('single-calc-total-expense');
    if (expEl && !expEl.value) {
        expEl.value = '1200.00';
        computeSingleQuoteMillesimi();
    }
};

function buildMillesimiDistributionRows(tabella = 'proprieta') {
    const rows = [];
    const seenPersonaIds = new Set();
    const seenNames = new Set();

    const getMillByTab = (millProp, millScale, millAsc) => {
        if (tabella === 'scale') return millScale;
        if (tabella === 'ascensore') return millAsc;
        return millProp;
    };

    // FONTE UNICA DI VERITÀ: "Anagrafica Condominio & Tabelle Millesimali" (state.anagraficaPersone)
    if (Array.isArray(state.anagraficaPersone)) {
        state.anagraficaPersone.forEach(p => {
            if (!p || seenPersonaIds.has(String(p.id))) return;
            const nom = `${p.cognome || ''} ${p.nome || ''}`.trim();
            const normKey = nom.toLowerCase().replace(/\s+/g, ' ');
            if (seenNames.has(normKey)) return;

            seenPersonaIds.add(String(p.id));
            seenNames.add(normKey);

            const mProp = parseFloat(p.unita_mill_prop) || 0;
            const mScale = parseFloat(p.unita_mill_scale) || 0;
            const mAsc = parseFloat(p.unita_mill_asc) || 0;

            const tipo = p.unita_tipo || 'Appartamento';
            const locParts = [];
            if (p.unita_scala) locParts.push(`Sc. ${p.unita_scala}`);
            if (p.unita_piano) locParts.push(`P. ${p.unita_piano}`);
            if (p.unita_interno) locParts.push(`Int. ${p.unita_interno}`);
            const unitaLabel = locParts.length > 0
                ? `${tipo} (${locParts.join(' | ')})`
                : (p.unita_identificativo || tipo);

            rows.push({
                checked: true,
                persona_id: p.id,
                unita_id: p.unita_id || null,
                nominativo: nom,
                unita_label: unitaLabel,
                millesimi_proprieta: mProp,
                millesimi_scale: mScale,
                millesimi_ascensore: mAsc,
                millesimi: getMillByTab(mProp, mScale, mAsc),
                is_simulation: false
            });
        });
    }

    millesimiDistributionRows = rows;
    return rows;
}

window.openMillesimiCalculatorModal = async function() {
    await ensureMillesimiDataLoaded();

    const condoName = state.condominioInfo?.nome || sessionStorage.getItem('active_Condominio_nome') || 'Condominio Ma.Ca.';
    const subEl = document.getElementById('mill-calc-condo-subtitle');
    if (subEl) {
        subEl.innerHTML = `Tabella millesimale attiva per <b>${condoName}</b> &bull; Puoi modificare i millesimi o la spesa totale per simulare qualsiasi riparto`;
    }

    // Popola select fatture fornitori per importazione rapida
    const suppSel = document.getElementById('mill-calc-supplier-select');
    if (suppSel) {
        const payments = state.suppliers || [];
        suppSel.innerHTML = '<option value="">-- Inserimento Manuale Importo --</option>' +
            payments.map(s => `<option value="${s.id}">€ ${(parseFloat(s.amount) || 0).toFixed(2)} - ${s.supplier_name} (${s.category || 'Fattura'})</option>`).join('');
    }

    // Imposta data scadenza default (+15 gg)
    const dueEl = document.getElementById('mill-calc-quote-due-date');
    if (dueEl && !dueEl.value) {
        dueEl.value = new Date(Date.now() + 15 * 86400000).toISOString().slice(0, 10);
    }

    const tabella = document.getElementById('mill-calc-tabella')?.value || 'proprieta';
    buildMillesimiDistributionRows(tabella);
    recalcMillesimiDistribution();

    const modal = document.getElementById('modal-ripartizione-millesimi');
    if (modal) modal.classList.remove('hidden');
};

window.closeMillesimiCalculatorModal = function() {
    const modal = document.getElementById('modal-ripartizione-millesimi');
    if (modal) modal.classList.add('hidden');
};

window.onChangeMillesimiTableType = function() {
    const tabella = document.getElementById('mill-calc-tabella')?.value || 'proprieta';
    millesimiDistributionRows.forEach(r => {
        if (!r.is_simulation) {
            if (tabella === 'scale') r.millesimi = r.millesimi_scale || 0;
            else if (tabella === 'ascensore') r.millesimi = r.millesimi_ascensore || 0;
            else r.millesimi = r.millesimi_proprieta || 0;
        }
    });
    recalcMillesimiDistribution();
};

window.setMillesimiBaseFromRealSum = function() {
    const sumMill = millesimiDistributionRows.reduce((acc, r) => acc + (r.checked ? (parseFloat(r.millesimi) || 0) : 0), 0);
    if (sumMill > 0) {
        document.getElementById('mill-calc-totale-millesimi').value = (Math.round(sumMill * 100) / 100).toString();
        recalcMillesimiDistribution();
    } else {
        showToast('La somma dei millesimi selezionati è zero.', 'warning');
    }
};

window.onSelectSupplierForMillesimiCalc = function() {
    const suppId = document.getElementById('mill-calc-supplier-select')?.value;
    if (!suppId || !state.suppliers) return;
    const supp = state.suppliers.find(s => String(s.id) === String(suppId));
    if (supp) {
        document.getElementById('mill-calc-spesa-totale').value = (parseFloat(supp.amount) || 0).toFixed(2);
        const titleEl = document.getElementById('mill-calc-quote-title');
        if (titleEl) {
            titleEl.value = `Riparto ${supp.category || 'Spesa'}: ${supp.supplier_name}${supp.invoice_number ? ' (Fatt. ' + supp.invoice_number + ')' : ''}`;
        }
        recalcMillesimiDistribution();
    }
};

window.addSimulationRowMillesimi = function() {
    millesimiDistributionRows.push({
        checked: true,
        persona_id: null,
        unita_id: null,
        nominativo: `Condòmino Simulato #${millesimiDistributionRows.length + 1}`,
        unita_label: 'Unità Simulazione',
        millesimi_proprieta: 45.5,
        millesimi_scale: 45.5,
        millesimi_ascensore: 45.5,
        millesimi: 45.5,
        is_simulation: true
    });
    recalcMillesimiDistribution();
};

window.removeSimulationRowMillesimi = function(idx) {
    millesimiDistributionRows.splice(idx, 1);
    recalcMillesimiDistribution();
};

window.toggleAllMillesimiRows = function(checked) {
    millesimiDistributionRows.forEach(r => { r.checked = checked; });
    recalcMillesimiDistribution();
};

window.onToggleMillesimiRowCheck = function(idx, checked) {
    if (millesimiDistributionRows[idx]) {
        millesimiDistributionRows[idx].checked = checked;
        recalcMillesimiDistribution();
    }
};

window.onEditMillesimiRowValue = function(idx, val) {
    if (millesimiDistributionRows[idx]) {
        millesimiDistributionRows[idx].millesimi = parseFloat(val) || 0;
        recalcMillesimiDistribution(true);
    }
};

window.recalcMillesimiDistribution = function(skipInputRebuild = false) {
    const spesaTotale = parseFloat(document.getElementById('mill-calc-spesa-totale')?.value) || 0;
    const millTotaliTabella = parseFloat(document.getElementById('mill-calc-totale-millesimi')?.value) || 1000;
    const coeffUnitario = millTotaliTabella > 0 ? (spesaTotale / millTotaliTabella) : 0;

    // 1. Aggiorna banner formula e passaggi matematici
    const banner = document.getElementById('mill-calc-formula-banner');
    const sumMillesimiCensiti = millesimiDistributionRows.reduce((acc, r) => acc + (r.checked ? (parseFloat(r.millesimi) || 0) : 0), 0);
    const firstActiveRow = millesimiDistributionRows.find(r => r.checked && (parseFloat(r.millesimi) || 0) > 0) || { nominativo: 'Condòmino Esempio', millesimi: 43 };
    const exMill = parseFloat(firstActiveRow.millesimi) || 43;
    const exExact = coeffUnitario * exMill;
    const exRounded = Math.round(exExact * 100) / 100;

    if (banner) {
        banner.innerHTML = `
            <div class="grid grid-cols-1 lg:grid-cols-3 gap-4 items-center">
                <div class="lg:col-span-2 space-y-1.5 text-xs text-slate-700">
                    <div class="font-extrabold text-emerald-900 text-xs uppercase tracking-wider flex items-center gap-1.5">
                        <i class="fa-solid fa-square-root-variable text-emerald-600"></i>
                        Dimostrazione Matematica e Formula Contabile (Art. 1123 c.c.)
                    </div>
                    <div class="font-mono bg-slate-50 px-3 py-1.5 rounded-lg border border-slate-200 text-[11px] text-slate-800">
                        <b>Formula:</b> Quota Singolo Condòmino = (Spesa Totale &divide; Millesimi Totali) &times; Millesimi Condòmino
                    </div>
                    <div class="grid grid-cols-1 sm:grid-cols-3 gap-2 pt-1 font-mono text-[11px]">
                        <div class="p-2 rounded-lg bg-emerald-50/70 border border-emerald-200/70">
                            <span class="block text-[10px] font-sans font-bold text-slate-500 uppercase">1° Passaggio (Quota 1 Mill.)</span>
                            € ${spesaTotale.toFixed(2)} &divide; ${millTotaliTabella} = <b class="text-emerald-800">€ ${coeffUnitario.toFixed(6)}</b>
                        </div>
                        <div class="p-2 rounded-lg bg-blue-50/70 border border-blue-200/70">
                            <span class="block text-[10px] font-sans font-bold text-slate-500 uppercase">2° Passaggio (Es. ${firstActiveRow.nominativo})</span>
                            € ${coeffUnitario.toFixed(6)} &times; ${exMill} = <b class="text-blue-800">€ ${exExact.toFixed(4)}</b>
                        </div>
                        <div class="p-2 rounded-lg bg-indigo-50/70 border border-indigo-200/70">
                            <span class="block text-[10px] font-sans font-bold text-slate-500 uppercase">3° Passaggio (Arrotondamento)</span>
                            Arrotondato al centesimo = <b class="text-indigo-900 text-xs">€ ${exRounded.toFixed(2)}</b>
                        </div>
                    </div>
                </div>
                <div class="bg-gradient-to-br from-slate-900 to-slate-800 text-white p-3.5 rounded-xl flex flex-col justify-between space-y-2">
                    <div class="flex justify-between items-center text-xs">
                        <span class="text-slate-300">Spesa da Ripartire:</span>
                        <span class="font-extrabold text-emerald-400 text-sm">€ ${spesaTotale.toFixed(2)}</span>
                    </div>
                    <div class="flex justify-between items-center text-xs">
                        <span class="text-slate-300">Base Millesimale:</span>
                        <span class="font-mono font-bold">${millTotaliTabella.toFixed(2)} mill.</span>
                    </div>
                    <div class="flex justify-between items-center text-xs">
                        <span class="text-slate-300">Somma Mill. Attivi:</span>
                        <span class="font-mono font-bold ${Math.abs(sumMillesimiCensiti - millTotaliTabella) > 0.01 ? 'text-amber-300' : 'text-emerald-300'}">${sumMillesimiCensiti.toFixed(2)} mill.</span>
                    </div>
                    ${Math.abs(sumMillesimiCensiti - millTotaliTabella) > 0.01 && sumMillesimiCensiti > 0 ? `
                        <button type="button" onclick="setMillesimiBaseFromRealSum()" class="w-full py-1 px-2 bg-amber-500/20 hover:bg-amber-500/30 border border-amber-400/40 text-amber-200 rounded-lg text-[10px] font-bold transition">
                            <i class="fa-solid fa-wand-magic-sparkles mr-1"></i> Ripartisci su base ${sumMillesimiCensiti.toFixed(2)} mill.
                        </button>
                    ` : ''}
                </div>
            </div>
        `;
    }

    // 2. Popola tabella
    const tbody = document.getElementById('mill-calc-table-body');
    const tfoot = document.getElementById('mill-calc-table-footer');
    if (!tbody) return;

    let totMillSelected = 0;
    let totExactSelected = 0;
    let totRoundedSelected = 0;

    if (!skipInputRebuild) {
        tbody.innerHTML = millesimiDistributionRows.map((r, idx) => {
            const mill = parseFloat(r.millesimi) || 0;
            const exact = r.checked ? (coeffUnitario * mill) : 0;
            const rounded = r.checked ? (Math.round(exact * 100) / 100) : 0;
            if (r.checked) {
                totMillSelected += mill;
                totExactSelected += exact;
                totRoundedSelected += rounded;
            }
            return `
                <tr class="${r.checked ? 'hover:bg-slate-50/90' : 'opacity-45 bg-slate-50/40'} transition-colors">
                    <td class="py-2.5 px-3 text-center">
                        <input type="checkbox" ${r.checked ? 'checked' : ''} onchange="onToggleMillesimiRowCheck(${idx}, this.checked)" class="rounded border-slate-300">
                    </td>
                    <td class="py-2.5 px-3 font-bold text-slate-800">
                        ${r.nominativo}
                        ${r.is_simulation ? `<span class="ml-1 px-1.5 py-0.5 text-[10px] bg-amber-100 text-amber-800 rounded font-semibold">Simulazione</span>` : ''}
                    </td>
                    <td class="py-2.5 px-3 text-slate-600">${r.unita_label}</td>
                    <td class="py-2.5 px-3 text-right">
                        <input type="number" step="0.01" value="${mill}" oninput="onEditMillesimiRowValue(${idx}, this.value)" class="w-24 px-2 py-1 text-right font-mono font-bold text-slate-900 border border-slate-300 rounded-lg bg-white focus:ring-2 focus:ring-emerald-500 outline-none">
                    </td>
                    <td class="py-2.5 px-3 font-mono text-[11px] text-slate-600" id="mill-row-formula-${idx}">
                        (${spesaTotale.toFixed(2)} &divide; ${millTotaliTabella}) &times; ${mill.toFixed(2)}
                    </td>
                    <td class="py-2.5 px-3 text-right font-mono text-slate-500" id="mill-row-exact-${idx}">
                        € ${exact.toFixed(4)}
                    </td>
                    <td class="py-2.5 px-3 text-right font-mono font-extrabold text-emerald-700 text-sm" id="mill-row-rounded-${idx}">
                        € ${rounded.toFixed(2)}
                        ${r.is_simulation ? `<button type="button" onclick="removeSimulationRowMillesimi(${idx})" class="ml-2 text-rose-500 hover:text-rose-700" title="Rimuovi riga"><i class="fa-solid fa-trash-can text-xs"></i></button>` : ''}
                    </td>
                </tr>
            `;
        }).join('');
    } else {
        millesimiDistributionRows.forEach((r, idx) => {
            const mill = parseFloat(r.millesimi) || 0;
            const exact = r.checked ? (coeffUnitario * mill) : 0;
            const rounded = r.checked ? (Math.round(exact * 100) / 100) : 0;
            if (r.checked) {
                totMillSelected += mill;
                totExactSelected += exact;
                totRoundedSelected += rounded;
            }
            const fEl = document.getElementById(`mill-row-formula-${idx}`);
            const eEl = document.getElementById(`mill-row-exact-${idx}`);
            const rEl = document.getElementById(`mill-row-rounded-${idx}`);
            if (fEl) fEl.innerHTML = `(${spesaTotale.toFixed(2)} &divide; ${millTotaliTabella}) &times; ${mill.toFixed(2)}`;
            if (eEl) eEl.textContent = `€ ${exact.toFixed(4)}`;
            if (rEl) rEl.innerHTML = `€ ${rounded.toFixed(2)}${r.is_simulation ? `<button type="button" onclick="removeSimulationRowMillesimi(${idx})" class="ml-2 text-rose-500 hover:text-rose-700" title="Rimuovi riga"><i class="fa-solid fa-trash-can text-xs"></i></button>` : ''}`;
        });
    }

    if (tfoot) {
        const residuoNonRipartito = Math.round((spesaTotale - totRoundedSelected) * 100) / 100;
        tfoot.innerHTML = `
            <tr class="bg-slate-100 text-slate-900">
                <td colspan="3" class="py-3 px-3 text-right uppercase tracking-wider text-xs">Totale Riparto Condòmini Selezionati:</td>
                <td class="py-3 px-3 text-right font-mono text-xs">${totMillSelected.toFixed(2)} / ${millTotaliTabella}</td>
                <td class="py-3 px-3 font-mono text-[11px] text-slate-500">
                    ${Math.abs(residuoNonRipartito) > 0.009 ? `Quota residua su ${Math.max(0, millTotaliTabella - totMillSelected).toFixed(2)} mill.: € ${residuoNonRipartito.toFixed(2)}` : 'Quadratura 100%'}
                </td>
                <td class="py-3 px-3 text-right font-mono text-xs text-slate-600">€ ${totExactSelected.toFixed(4)}</td>
                <td class="py-3 px-3 text-right font-mono text-sm font-extrabold text-emerald-700">€ ${totRoundedSelected.toFixed(2)}</td>
            </tr>
        `;
    }
};

window.submitBatchMillesimiQuotes = async function() {
    if (typeof isLicenseReadOnly === 'function' && isLicenseReadOnly()) {
        showToast("Operazione bloccata: il condominio è in modalità Sola Lettura.", "error");
        return;
    }

    const spesaTotale = parseFloat(document.getElementById('mill-calc-spesa-totale')?.value) || 0;
    const millTotaliTabella = parseFloat(document.getElementById('mill-calc-totale-millesimi')?.value) || 1000;
    const coeffUnitario = millTotaliTabella > 0 ? (spesaTotale / millTotaliTabella) : 0;
    const title = (document.getElementById('mill-calc-quote-title')?.value || '').trim();
    const type = document.getElementById('mill-calc-quote-type')?.value || 'ordinaria';
    const due_date = document.getElementById('mill-calc-quote-due-date')?.value || '';

    if (!title || !due_date) {
        showToast('Inserisci il Titolo/Causale della bolletta e la Data di Scadenza.', 'warning');
        return;
    }

    const items = millesimiDistributionRows
        .filter(r => r.checked && (parseFloat(r.millesimi) || 0) > 0 && (r.persona_id || r.unita_id))
        .map(r => {
            const mill = parseFloat(r.millesimi) || 0;
            const amount = Math.round((coeffUnitario * mill) * 100) / 100;
            return {
                persona_id: r.persona_id,
                unita_id: r.unita_id,
                amount,
                title: `${title} (${mill.toFixed(2)}/${millTotaliTabella} mill.)`,
                description: `Calcolo millesimale: (€ ${spesaTotale.toFixed(2)} / ${millTotaliTabella}) x ${mill.toFixed(2)} mill. = € ${amount.toFixed(2)}`
            };
        })
        .filter(i => i.amount > 0);

    if (items.length === 0) {
        showToast('Nessun condòmino reale con millesimi > 0 selezionato per la generazione delle quote.', 'warning');
        return;
    }

    try {
        const res = await fetch('/api/quotes/batch', {
            method: 'POST',
            headers: getAuthHeaders(),
            body: JSON.stringify({ type, title, due_date, items })
        });
        const data = await res.json();
        if (res.ok && data.success) {
            showToast(`Generate e assegnate con successo ${data.inserted} quote millesimali!`, 'success');
            closeMillesimiCalculatorModal();
            if (typeof loadAccountingData === 'function') loadAccountingData();
        } else {
            showToast(data.message || 'Errore nella generazione massiva delle quote.', 'error');
        }
    } catch (e) {
        showToast('Errore di connessione al server.', 'error');
    }
};

window.printMillesimiDistribution = function() {
    const condoName = state.condominioInfo?.nome || sessionStorage.getItem('active_Condominio_nome') || 'Condominio Ma.Ca.';
    const spesaTotale = parseFloat(document.getElementById('mill-calc-spesa-totale')?.value) || 0;
    const millTotaliTabella = parseFloat(document.getElementById('mill-calc-totale-millesimi')?.value) || 1000;
    const coeffUnitario = millTotaliTabella > 0 ? (spesaTotale / millTotaliTabella) : 0;
    const title = document.getElementById('mill-calc-quote-title')?.value || 'Prospetto Ripartizione Spesa per Millesimi';

    let totMill = 0;
    let totRounded = 0;
    const rowsHtml = millesimiDistributionRows.filter(r => r.checked).map(r => {
        const mill = parseFloat(r.millesimi) || 0;
        const exact = coeffUnitario * mill;
        const rounded = Math.round(exact * 100) / 100;
        totMill += mill;
        totRounded += rounded;
        return `
            <tr>
                <td style="padding:8px;border:1px solid #cbd5e1;font-weight:bold;">${r.nominativo}</td>
                <td style="padding:8px;border:1px solid #cbd5e1;">${r.unita_label}</td>
                <td style="padding:8px;border:1px solid #cbd5e1;text-align:right;font-family:monospace;">${mill.toFixed(2)}</td>
                <td style="padding:8px;border:1px solid #cbd5e1;font-family:monospace;">(€ ${spesaTotale.toFixed(2)} ÷ ${millTotaliTabella}) × ${mill.toFixed(2)}</td>
                <td style="padding:8px;border:1px solid #cbd5e1;text-align:right;font-family:monospace;">€ ${exact.toFixed(4)}</td>
                <td style="padding:8px;border:1px solid #cbd5e1;text-align:right;font-weight:bold;font-family:monospace;">€ ${rounded.toFixed(2)}</td>
            </tr>
        `;
    }).join('');

    const w = window.open('', '_blank');
    if (!w) return;
    w.document.write(`
        <html>
        <head>
            <title>Piano di Riparto Millesimale - ${condoName}</title>
            <style>
                body { font-family: Arial, sans-serif; padding: 30px; color: #1e293b; }
                h1 { font-size: 20px; margin-bottom: 4px; }
                p { font-size: 12px; color: #475569; margin-top: 0; }
                .formula-box { background: #f8fafc; border: 1px solid #cbd5e1; padding: 12px; border-radius: 8px; margin: 16px 0; font-size: 12px; }
                table { width: 100%; border-collapse: collapse; font-size: 12px; margin-top: 12px; }
                th { background: #f1f5f9; padding: 8px; border: 1px solid #cbd5e1; text-align: left; }
            </style>
        </head>
        <body>
            <h1>${condoName} - Piano di Riparto Millesimale</h1>
            <p><b>Causale:</b> ${title} &bull; <b>Data elaborazione:</b> ${new Date().toLocaleDateString('it-IT')}</p>
            <div class="formula-box">
                <b>Dati Contabili di Riferimento:</b><br>
                &bull; Spesa Totale del Condominio: <b>€ ${spesaTotale.toFixed(2)}</b><br>
                &bull; Millesimi Totali di Riferimento: <b>${millTotaliTabella}</b><br>
                &bull; Coefficiente per 1 Millesimo (Spesa &divide; Millesimi Totali): <b>€ ${coeffUnitario.toFixed(6)}</b><br>
                &bull; Formula Applicata: <b>Quota Condòmino = (Spesa Totale &divide; Millesimi Totali) &times; Millesimi di Proprietà</b>
            </div>
            <table>
                <thead>
                    <tr>
                        <th>Condòmino</th>
                        <th>Unità Immobiliare</th>
                        <th style="text-align:right;">Millesimi</th>
                        <th>Formula Applicata</th>
                        <th style="text-align:right;">Quota Esatta</th>
                        <th style="text-align:right;">Quota Arrotondata (€)</th>
                    </tr>
                </thead>
                <tbody>${rowsHtml}</tbody>
                <tfoot>
                    <tr style="background:#f8fafc;font-weight:bold;">
                        <td colspan="2" style="padding:8px;border:1px solid #cbd5e1;text-align:right;">TOTALE RIPARTITO:</td>
                        <td style="padding:8px;border:1px solid #cbd5e1;text-align:right;font-family:monospace;">${totMill.toFixed(2)}</td>
                        <td colspan="2" style="padding:8px;border:1px solid #cbd5e1;"></td>
                        <td style="padding:8px;border:1px solid #cbd5e1;text-align:right;font-family:monospace;">€ ${totRounded.toFixed(2)}</td>
                    </tr>
                </tfoot>
            </table>
            <script>window.onload = function() { window.print(); };</script>
        </body>
        </html>
    `);
    w.document.close();
};

// ============================================================================
// GESTIONE DINAMICA TABELLE MILLESIMALI & CALCOLO ART. 1124 C.C. (CLIENT-SIDE)
// ============================================================================
state.dynamicMillesimiTables = [];
state.currentSelectedTableDetail = null;

window.openManageMillesimiTablesModal = async function() {
    const modal = document.getElementById('modal-manage-millesimi-tables');
    if (!modal) return;

    modal.classList.remove('hidden');
    await loadMillesimiTablesList();
};

window.closeManageMillesimiTablesModal = function() {
    const modal = document.getElementById('modal-manage-millesimi-tables');
    if (modal) modal.classList.add('hidden');
    const formBox = document.getElementById('form-new-millesimi-table-box');
    if (formBox) formBox.classList.add('hidden');
    const detailBox = document.getElementById('millesimi-table-detail-box');
    if (detailBox) detailBox.classList.add('hidden');
};

window.toggleNewMillesimiTableForm = function() {
    const formBox = document.getElementById('form-new-millesimi-table-box');
    if (!formBox) return;
    formBox.classList.toggle('hidden');

    if (!formBox.classList.contains('hidden')) {
        // Popola select clonazione da tabelle esistenti
        const cloneSel = document.getElementById('new-tab-clone-from');
        if (cloneSel) {
            cloneSel.innerHTML = '<option value="">-- Nessuna (Usa Proprietà) --</option>' +
                state.dynamicMillesimiTables.map(t => `<option value="${t.id}">${t.codice} - ${t.descrizione}</option>`).join('');
        }
    }
};

async function loadMillesimiTablesList() {
    const tbody = document.getElementById('millesimi-tables-list-body');
    if (!tbody) return;

    tbody.innerHTML = '<tr><td colspan="6" class="py-6 text-center text-slate-400"><i class="fa-solid fa-spinner fa-spin mr-1"></i> Caricamento tabelle millesimali...</td></tr>';

    try {
        const res = await fetch('/api/millesimi/tabelle', { headers: getAuthHeaders() });
        const data = await res.json();

        if (data.success && Array.isArray(data.data)) {
            state.dynamicMillesimiTables = data.data;

            // Aggiorna anche il selettore nella modale di calcolo rapido spesa
            const calcSel = document.getElementById('mill-calc-tabella');
            if (calcSel) {
                const currentVal = calcSel.value;
                calcSel.innerHTML = state.dynamicMillesimiTables.map(t => `<option value="${t.id}">${t.codice} - ${t.descrizione}</option>`).join('');
                if (currentVal) calcSel.value = currentVal;
            }

            if (state.dynamicMillesimiTables.length === 0) {
                tbody.innerHTML = '<tr><td colspan="6" class="py-6 text-center text-slate-400">Nessuna tabella configurata. Clicca su "Nuova Tabella Personalizzata".</td></tr>';
                return;
            }

            tbody.innerHTML = state.dynamicMillesimiTables.map(tab => {
                const sumReale = parseFloat(tab.somma_millesimi_reale) || 0;
                const isQuadrata = Math.abs(sumReale - 1000.0) < 0.05;
                return `
                    <tr class="hover:bg-amber-50/40 transition-colors">
                        <td class="py-3 px-3.5 font-bold font-mono text-slate-900">${tab.codice}</td>
                        <td class="py-3 px-3.5">
                            <span class="font-extrabold text-slate-800">${tab.descrizione}</span>
                            <span class="block text-[10px] text-slate-400">${tab.categoria}</span>
                        </td>
                        <td class="py-3 px-3.5 text-center">
                            ${tab.scala_filtro ? `<span class="px-2 py-0.5 rounded bg-blue-100 text-blue-800 font-bold text-[10px]">Scala ${tab.scala_filtro}</span>` : '<span class="text-slate-400 text-[11px]">Tutte</span>'}
                        </td>
                        <td class="py-3 px-3.5 text-center font-bold text-slate-700">${tab.unita_assegnate || 0} unità</td>
                        <td class="py-3 px-3.5 text-right font-mono font-bold ${isQuadrata ? 'text-emerald-700' : 'text-amber-600'}">
                            ${sumReale.toFixed(4)} mill.
                            ${isQuadrata ? '<i class="fa-solid fa-circle-check ml-1 text-emerald-600" title="Tabella perfettamente quadrata a 1000"></i>' : ''}
                        </td>
                        <td class="py-3 px-3.5 text-right whitespace-nowrap">
                            <button type="button" onclick="viewMillesimiTableDetail(${tab.id})" class="px-2.5 py-1 bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-200 rounded-lg text-xs font-bold transition">
                                <i class="fa-solid fa-eye mr-1"></i> Visualizza / Modifica Quote
                            </button>
                        </td>
                    </tr>
                `;
            }).join('');
        } else {
            tbody.innerHTML = '<tr><td colspan="6" class="py-6 text-center text-rose-500">Errore durante il caricamento delle tabelle.</td></tr>';
        }
    } catch (err) {
        tbody.innerHTML = '<tr><td colspan="6" class="py-6 text-center text-rose-500">Errore di connessione al server.</td></tr>';
    }
}

window.realignMillesimiUnits = async function() {
    try {
        showToast('Riallineamento e controllo deduplica unità in corso...', 'info');
        const res = await fetch('/api/millesimi/riallinea-unita', {
            method: 'POST',
            headers: getAuthHeaders()
        });
        const data = await res.json();
        if (data.success) {
            showToast(data.message || 'Riallineamento completato con successo!', 'success');
            await loadMillesimiTablesList();
            if (state.currentSelectedTableDetail && state.currentSelectedTableDetail.tabella) {
                viewMillesimiTableDetail(state.currentSelectedTableDetail.tabella.id);
            }
        } else {
            showToast(data.message || 'Errore durante il riallineamento.', 'error');
        }
    } catch (e) {
        showToast('Errore di connessione al server.', 'error');
    }
};

window.submitCreateMillesimiTable = async function() {
    const codice = (document.getElementById('new-tab-codice')?.value || '').trim();
    const descrizione = (document.getElementById('new-tab-desc')?.value || '').trim();
    const categoria = document.getElementById('new-tab-categoria')?.value || 'Personalizzata';
    const scala_filtro = (document.getElementById('new-tab-scala')?.value || '').trim();
    const clone_from_tab_id = document.getElementById('new-tab-clone-from')?.value || null;

    if (!codice || !descrizione) {
        showToast('Inserisci Codice e Descrizione della tabella.', 'warning');
        return;
    }

    try {
        const res = await fetch('/api/millesimi/tabelle', {
            method: 'POST',
            headers: getAuthHeaders(),
            body: JSON.stringify({ codice, descrizione, categoria, scala_filtro, clone_from_tab_id })
        });
        const data = await res.json();

        if (data.success) {
            showToast(data.message || 'Tabella millesimale creata!', 'success');
            toggleNewMillesimiTableForm();
            // Pulisci campi
            document.getElementById('new-tab-codice').value = '';
            document.getElementById('new-tab-desc').value = '';
            document.getElementById('new-tab-scala').value = '';
            loadMillesimiTablesList();
        } else {
            showToast(data.message || 'Errore nella creazione della tabella.', 'error');
        }
    } catch (e) {
        showToast('Errore di connessione al server.', 'error');
    }
};

window.viewMillesimiTableDetail = async function(tabId) {
    const detailBox = document.getElementById('millesimi-table-detail-box');
    const tbody = document.getElementById('millesimi-quotes-detail-body');
    const titleEl = document.getElementById('millesimi-detail-title');
    const badgeEl = document.getElementById('millesimi-detail-sum-badge');

    if (!detailBox || !tbody) return;

    detailBox.classList.remove('hidden');
    tbody.innerHTML = '<tr><td colspan="5" class="py-4 text-center text-slate-400"><i class="fa-solid fa-spinner fa-spin mr-1"></i> Caricamento quote...</td></tr>';

    try {
        const res = await fetch(`/api/millesimi/tabelle/${tabId}/quote`, { headers: getAuthHeaders() });
        const data = await res.json();

        if (data.success && data.tabella) {
            state.currentSelectedTableDetail = data;
            const tab = data.tabella;
            const quotes = data.data || [];

            const sum = quotes.reduce((acc, q) => acc + (parseFloat(q.valore_millesimale) || 0), 0);
            if (titleEl) titleEl.textContent = `Quote: ${tab.codice} - ${tab.descrizione}`;
            if (badgeEl) badgeEl.textContent = `Somma Totale: ${sum.toFixed(4)} mill.`;

            if (quotes.length === 0) {
                tbody.innerHTML = '<tr><td colspan="5" class="py-4 text-center text-slate-400">Nessuna unità assegnata a questa tabella.</td></tr>';
                return;
            }

            tbody.innerHTML = quotes.map(q => {
                const condName = (q.cognome || q.nome) ? `${q.cognome || ''} ${q.nome || ''}`.trim() : 'Nessun condòmino collegato';
                const ubi = [q.scala ? `Sc. ${q.scala}` : '', q.piano ? `P. ${q.piano}` : '', q.interno ? `Int. ${q.interno}` : ''].filter(Boolean).join(' - ') || 'N/D';
                const val = parseFloat(q.valore_millesimale) || 0;

                return `
                    <tr class="hover:bg-slate-50">
                        <td class="py-2.5 px-3 font-bold text-slate-900">${q.identificativo || 'Sub. ' + q.unita_id}</td>
                        <td class="py-2.5 px-3 font-semibold text-slate-700">${condName}</td>
                        <td class="py-2.5 px-3 text-center text-slate-500 font-mono text-[11px]">${ubi}</td>
                        <td class="py-2.5 px-3 text-right">
                            <input type="number" step="0.0001" id="quota-input-${tab.id}-${q.unita_id}" value="${val.toFixed(4)}" class="w-28 px-2 py-1 text-right font-mono font-bold text-slate-900 border border-slate-300 rounded-lg bg-white focus:ring-2 focus:ring-amber-500 outline-none">
                        </td>
                        <td class="py-2.5 px-3 text-right">
                            <button type="button" onclick="saveSingleUnitQuota(${tab.id}, ${q.unita_id})" class="px-2 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-[11px] font-bold shadow-2xs transition">
                                <i class="fa-solid fa-floppy-disk"></i> Salva
                            </button>
                        </td>
                    </tr>
                `;
            }).join('');
        }
    } catch (e) {
        tbody.innerHTML = '<tr><td colspan="5" class="py-4 text-center text-rose-500">Errore lettura quote tabella.</td></tr>';
    }
};

window.saveSingleUnitQuota = async function(tabId, unitaId) {
    const input = document.getElementById(`quota-input-${tabId}-${unitaId}`);
    if (!input) return;

    const val = parseFloat(input.value) || 0;
    try {
        const res = await fetch(`/api/millesimi/tabelle/${tabId}/quote/${unitaId}`, {
            method: 'PUT',
            headers: getAuthHeaders(),
            body: JSON.stringify({ valore_millesimale: val })
        });
        const data = await res.json();
        if (data.success) {
            showToast('Quota millesimale salvata!', 'success');
            loadMillesimiTablesList();
            viewMillesimiTableDetail(tabId);
        } else {
            showToast(data.message || 'Errore salvataggio quota.', 'error');
        }
    } catch (e) {
        showToast('Errore di connessione.', 'error');
    }
};

window.executeCalculateArt1124Modal = async function() {
    const tabB = state.dynamicMillesimiTables.find(t => t.codice === 'TAB_B' || t.categoria === 'Scale_Ascensore_1124');
    if (!tabB) {
        showToast('Tabella B (Scale e Ascensore) non trovata.', 'warning');
        return;
    }

    if (!confirm(`Vuoi eseguire il calcolo automatico della Tabella B (Art. 1124 c.c.) per ${tabB.descrizione}?\n\nLa formula combinerà il 50% del valore dei millesimi di proprietà (Tabella A) e il 50% dell'altezza del piano, con quadratura a 1000 millesimi.`)) {
        return;
    }

    try {
        const res = await fetch('/api/millesimi/tabelle/calcola-art1124', {
            method: 'POST',
            headers: getAuthHeaders(),
            body: JSON.stringify({ tabella_destinazione_id: tabB.id })
        });
        const data = await res.json();

        if (data.success) {
            showToast(data.message || 'Tabella B calcolata con successo!', 'success');
            await loadMillesimiTablesList();
            viewMillesimiTableDetail(tabB.id);
        } else {
            showToast(data.message || 'Errore durante il calcolo.', 'error');
        }
    } catch (e) {
        showToast('Errore di connessione al server.', 'error');
    }
};

// ============================================================================
// DOCUMENTI & ALLEGATI BIDIREZIONALI (AMMINISTRATORE <-> CONDÒMINI)
// ============================================================================
state.condoDocuments = [];
state.docDirectionFilter = 'all';
state.pendingUploadFile = null;

function formatFileSizeHuman(bytes) {
    const b = parseInt(bytes, 10) || 0;
    if (b <= 0) return 'PDF / Allegato';
    if (b < 1024) return `${b} B`;
    if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
    return `${(b / (1024 * 1024)).toFixed(2)} MB`;
}

function getDocFileIcon(fileName, mime) {
    const ext = String(fileName || '').split('.').pop().toLowerCase();
    const m = String(mime || '').toLowerCase();
    if (ext === 'pdf' || m.includes('pdf')) {
        return '<i class="fa-solid fa-file-pdf text-rose-600 text-base"></i>';
    }
    if (['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(ext) || m.includes('image')) {
        return '<i class="fa-solid fa-file-image text-sky-600 text-base"></i>';
    }
    if (['xls', 'xlsx', 'csv'].includes(ext) || m.includes('spreadsheet') || m.includes('excel')) {
        return '<i class="fa-solid fa-file-excel text-emerald-600 text-base"></i>';
    }
    if (['doc', 'docx'].includes(ext) || m.includes('word')) {
        return '<i class="fa-solid fa-file-word text-blue-600 text-base"></i>';
    }
    return '<i class="fa-solid fa-file-lines text-slate-600 text-base"></i>';
}

function updateDocumentsDashboardBadge(docs) {
    const list = Array.isArray(docs) ? docs : (state.condoDocuments || []);
    const pendingCount = list.filter(d => d.status === 'Da visionare').length;
    const badge = document.getElementById('dash-doc-alert-badge');
    const countText = document.getElementById('dash-doc-count-text');

    if (badge) {
        if (pendingCount > 0) {
            badge.classList.remove('hidden');
            badge.classList.add('inline-flex');
            if (countText) {
                countText.textContent = pendingCount === 1 ? '1 DA VISIONARE' : `${pendingCount} DA VISIONARE`;
            }
        } else {
            badge.classList.add('hidden');
            badge.classList.remove('inline-flex');
        }
    }
}

async function loadCondoDocumentsBadge() {
    try {
        const res = await fetch('/api/documents', { headers: getAuthHeaders() });
        const data = await res.json();
        if (data.success && Array.isArray(data.data)) {
            state.condoDocuments = data.data;
            updateDocumentsDashboardBadge(data.data);
        }
    } catch (_) {}
}

async function loadCondoDocuments() {
    try {
        const isAdmin = state.currentUser && state.currentUser.role === 'admin';

        // Personalizza etichette UI in base al ruolo (Amministratore vs Condòmino)
        const btnLabel = document.getElementById('btn-upload-doc-label');
        const subTitle = document.getElementById('doc-header-subtitle');
        const tabToLabel = document.getElementById('doc-tab-to-condomino-label');
        const tabFromLabel = document.getElementById('doc-tab-from-condomino-label');
        const personaFilterWrap = document.getElementById('doc-filter-persona-wrapper');

        if (isAdmin) {
            if (btnLabel) btnLabel.textContent = '+ Carica / Invia Documento';
            if (subTitle) subTitle.textContent = 'Bacheca documenti ufficiali del condominio e scambio bidirezionale di allegati tra Studio Amministratore e Condòmini.';
            if (tabToLabel) tabToLabel.textContent = 'Inviati ai Singoli Condòmini';
            if (tabFromLabel) tabFromLabel.textContent = 'Ricevuti dai Condòmini';
            if (personaFilterWrap) personaFilterWrap.classList.remove('hidden');
        } else {
            if (btnLabel) btnLabel.textContent = '+ Invia Allegato all\'Amministratore';
            if (subTitle) subTitle.textContent = 'Consulta i documenti ufficiali del condominio e invia ricevute di pagamento o allegati allo Studio Amministratore.';
            if (tabToLabel) tabToLabel.textContent = 'Ricevuti dallo Studio';
            if (tabFromLabel) tabFromLabel.textContent = 'Inviati da Me allo Studio';
            if (personaFilterWrap) personaFilterWrap.classList.add('hidden');
        }

        // Assicura il caricamento dell'Anagrafica per l'Amministratore
        if (isAdmin && (!state.persone || state.persone.length === 0)) {
            try {
                const [pRes, uRes] = await Promise.all([
                    fetch('/api/persone', { headers: getAuthHeaders() }),
                    fetch('/api/unita', { headers: getAuthHeaders() })
                ]);
                const pData = await pRes.json();
                const uData = await uRes.json();
                if (pData.success) state.persone = pData.data || [];
                if (uData.success) state.unita = uData.data || [];
            } catch (_) {}
        }

        populateDocPersonaSelectors();

        const res = await fetch('/api/documents', { headers: getAuthHeaders() });
        const data = await res.json();
        if (data.success && Array.isArray(data.data)) {
            state.condoDocuments = data.data;
        } else {
            state.condoDocuments = [];
        }

        // Aggiorna KPI
        const docs = state.condoDocuments;
        const kpiTotal = document.getElementById('doc-kpi-total');
        const kpiBacheca = document.getElementById('doc-kpi-bacheca');
        const kpiIndiv = document.getElementById('doc-kpi-individuali');
        const kpiPending = document.getElementById('doc-kpi-pending');

        if (kpiTotal) kpiTotal.textContent = docs.length;
        if (kpiBacheca) kpiBacheca.textContent = docs.filter(d => d.recipient_type === 'all').length;
        if (kpiIndiv) kpiIndiv.textContent = docs.filter(d => d.recipient_type !== 'all').length;
        if (kpiPending) kpiPending.textContent = docs.filter(d => d.status === 'Da visionare').length;

        updateDocumentsDashboardBadge(docs);
        renderCondoDocumentsTable();
    } catch (e) {
        console.error('Errore caricamento documenti:', e);
    }
}

async function populateDocPersonaSelectors() {
    try {
        if ((!state.anagraficaPersone || state.anagraficaPersone.length === 0) && typeof ensureMillesimiDataLoaded === 'function') {
            await ensureMillesimiDataLoaded();
        }
    } catch (_) {}

    let rows = [];
    try {
        if (typeof buildMillesimiDistributionRows === 'function') {
            rows = buildMillesimiDistributionRows() || [];
        }
    } catch (_) {}

    if (!Array.isArray(rows) && typeof millesimiDistributionRows !== 'undefined' && Array.isArray(millesimiDistributionRows)) {
        rows = millesimiDistributionRows;
    }
    if (!Array.isArray(rows)) rows = [];

    const filterSel = document.getElementById('doc-filter-persona');
    const uploadSel = document.getElementById('doc-upload-persona-id');

    if (filterSel) {
        const currentVal = filterSel.value;
        filterSel.innerHTML = '<option value="">Tutti i Condòmini</option>' +
            rows.map(r => `<option value="${r.persona_id}">${r.nominativo || 'Condòmino'} (${r.unita_label || r.unitaLabel || 'Unità'})</option>`).join('');
        filterSel.value = currentVal;
    }

    if (uploadSel) {
        const currentVal = uploadSel.value;
        uploadSel.innerHTML = '<option value="">-- Seleziona Condòmino dall\'Anagrafica --</option>' +
            rows.map(r => `<option value="${r.persona_id}">${r.nominativo || 'Condòmino'} — ${r.unita_label || r.unitaLabel || 'Unità'}</option>`).join('');
        uploadSel.value = currentVal;
    }
}

window.setDocDirectionFilter = function(mode) {
    state.docDirectionFilter = mode || 'all';
    const modes = ['all', 'bacheca', 'to_condomino', 'from_condomino'];
    modes.forEach(m => {
        const btn = document.getElementById(`doc-tab-${m}`);
        if (!btn) return;
        if (m === state.docDirectionFilter) {
            btn.className = 'px-3.5 py-2 rounded-xl text-xs font-extrabold bg-orange-600 text-white shadow-2xs transition-all flex items-center gap-1.5';
        } else {
            btn.className = 'px-3.5 py-2 rounded-xl text-xs font-bold bg-slate-100 hover:bg-slate-200 text-slate-700 transition-all flex items-center gap-1.5';
        }
    });
    renderCondoDocumentsTable();
};

window.resetCondoDocumentsFilters = function() {
    const s = document.getElementById('doc-search-input');
    const p = document.getElementById('doc-filter-persona');
    const c = document.getElementById('doc-filter-category');
    const st = document.getElementById('doc-filter-status');
    if (s) s.value = '';
    if (p) p.value = '';
    if (c) c.value = '';
    if (st) st.value = '';
    setDocDirectionFilter('all');
};

function getDocDirectionBadgeHtml(doc) {
    if (doc.recipient_type === 'all') {
        return `
            <span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-indigo-50 text-indigo-700 border border-indigo-200 text-[10px] font-extrabold uppercase tracking-wider">
                <i class="fa-solid fa-bullhorn"></i> Bacheca Condominio
            </span>
            <div class="font-bold text-slate-900 text-xs mt-1">Tutti i Condòmini</div>
            <div class="text-[11px] text-slate-500">Pubblicato da: Studio Amministratore</div>
        `;
    }
    if (doc.sender_role === 'admin' && doc.recipient_type === 'persona') {
        return `
            <span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-sky-50 text-sky-700 border border-sky-200 text-[10px] font-extrabold uppercase tracking-wider">
                <i class="fa-solid fa-share-from-square"></i> Studio &rarr; Condòmino
            </span>
            <div class="font-extrabold text-slate-900 text-xs mt-1">${doc.recipient_name || 'Condòmino'}</div>
            ${doc.unita_label ? `<div class="text-[11px] text-slate-500 font-semibold">${doc.unita_label}</div>` : ''}
        `;
    }
    if (doc.sender_role === 'condomino' && (doc.recipient_type === 'persona' || doc.recipient_type === 'condomino_peer')) {
        return `
            <span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-purple-50 text-purple-700 border border-purple-200 text-[10px] font-extrabold uppercase tracking-wider">
                <i class="fa-solid fa-people-arrows"></i> Condòmino &rarr; Condòmino
            </span>
            <div class="font-extrabold text-slate-900 text-xs mt-1">Da: ${doc.sender_name || 'Condòmino'}</div>
            <div class="text-[11px] text-slate-600 font-semibold">A: ${doc.recipient_name || 'Altro Condòmino'} ${doc.unita_label ? `(${doc.unita_label})` : ''}</div>
        `;
    }
    return `
        <span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-emerald-50 text-emerald-700 border border-emerald-200 text-[10px] font-extrabold uppercase tracking-wider">
            <i class="fa-solid fa-inbox"></i> Condòmino &rarr; Studio
        </span>
        <div class="font-extrabold text-slate-900 text-xs mt-1">${doc.sender_name || 'Condòmino'}</div>
        ${doc.unita_label ? `<div class="text-[11px] text-slate-500 font-semibold">${doc.unita_label}</div>` : '<div class="text-[11px] text-slate-500">Destinatario: Studio Amministratore</div>'}
    `;
}

function getDocStatusBadgeHtml(doc, isAdmin) {
    const st = doc.status || 'Pubblicato';
    const colors = {
        'Da visionare': 'bg-amber-50 text-amber-700 border-amber-300',
        'Visionato': 'bg-blue-50 text-blue-700 border-blue-200',
        'Archiviato': 'bg-emerald-50 text-emerald-700 border-emerald-200',
        'Pubblicato': 'bg-indigo-50 text-indigo-700 border-indigo-200',
        'Inviato': 'bg-sky-50 text-sky-700 border-sky-200'
    };
    const cls = colors[st] || 'bg-slate-100 text-slate-700 border-slate-200';

    if (isAdmin && doc.sender_role === 'condomino') {
        return `
            <select onchange="updateCondoDocumentStatus(${doc.id}, this.value)" class="px-2.5 py-1 rounded-lg border text-[11px] font-extrabold outline-none cursor-pointer ${cls}">
                <option value="Da visionare" ${st === 'Da visionare' ? 'selected' : ''}>Da visionare</option>
                <option value="Visionato" ${st === 'Visionato' ? 'selected' : ''}>Visionato</option>
                <option value="Archiviato" ${st === 'Archiviato' ? 'selected' : ''}>Archiviato / OK</option>
            </select>
        `;
    }
    return `<span class="inline-flex items-center px-2.5 py-1 rounded-full border text-[10px] font-extrabold uppercase tracking-wider ${cls}">${st}</span>`;
}

window.renderCondoDocumentsTable = function() {
    const tbody = document.getElementById('doc-table-body');
    const countLabel = document.getElementById('doc-filter-count-label');
    if (!tbody) return;

    const isAdmin = state.currentUser && state.currentUser.role === 'admin';
    const searchVal = (document.getElementById('doc-search-input')?.value || '').trim().toLowerCase();
    const personaFilter = document.getElementById('doc-filter-persona')?.value || '';
    const categoryFilter = document.getElementById('doc-filter-category')?.value || '';
    const statusFilter = document.getElementById('doc-filter-status')?.value || '';
    const dirFilter = state.docDirectionFilter || 'all';

    const filtered = (state.condoDocuments || []).filter(doc => {
        if (dirFilter === 'bacheca' && doc.recipient_type !== 'all') return false;
        if (dirFilter === 'to_condomino' && !(doc.sender_role === 'admin' && doc.recipient_type === 'persona')) return false;
        if (dirFilter === 'from_condomino' && doc.sender_role !== 'condomino') return false;

        if (personaFilter) {
            const pId = Number(personaFilter);
            const matchRec = doc.recipient_persona_id && Number(doc.recipient_persona_id) === pId;
            const matchSend = doc.sender_persona_id && Number(doc.sender_persona_id) === pId;
            if (!matchRec && !matchSend) return false;
        }

        if (categoryFilter && doc.category !== categoryFilter) return false;
        if (statusFilter && doc.status !== statusFilter) return false;

        if (searchVal) {
            const haystack = [
                doc.title,
                doc.file_name,
                doc.notes,
                doc.category,
                doc.sender_name,
                doc.recipient_name,
                doc.unita_label
            ].filter(Boolean).join(' ').toLowerCase();
            if (!haystack.includes(searchVal)) return false;
        }
        return true;
    });

    if (countLabel) {
        countLabel.textContent = filtered.length === 1
            ? '1 documento trovato nell\'archivio'
            : `${filtered.length} documenti trovati nell'archivio`;
    }

    if (filtered.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="6" class="py-10 text-center text-slate-400">
                    <i class="fa-solid fa-folder-open text-3xl mb-2 block text-slate-300"></i>
                    <span class="text-xs font-semibold">Nessun documento o allegato corrisponde ai filtri selezionati.</span>
                </td>
            </tr>
        `;
        return;
    }

    tbody.innerHTML = filtered.map(doc => {
        const dtStr = typeof formatCommDateTime === 'function' ? formatCommDateTime(doc.created_at) : (doc.created_at || '');
        const canDelete = isAdmin || (state.currentUser && Number(doc.sender_user_id) === Number(state.currentUser.id) && doc.status === 'Da visionare');
        return `
            <tr class="hover:bg-orange-50/30 transition-colors">
                <td class="py-3.5 px-4 whitespace-nowrap font-bold text-slate-700">${dtStr}</td>
                <td class="py-3.5 px-4">${getDocDirectionBadgeHtml(doc)}</td>
                <td class="py-3.5 px-4">
                    <span class="px-2.5 py-1 rounded-lg bg-slate-100 text-slate-700 font-bold text-[11px] inline-block">${doc.category || 'Documento'}</span>
                </td>
                <td class="py-3.5 px-4">
                    <div class="font-extrabold text-slate-900 text-xs sm:text-sm">${doc.title}</div>
                    <div class="flex items-center gap-2 mt-1 text-[11px] text-slate-500">
                        ${getDocFileIcon(doc.file_name, doc.file_mime)}
                        <span class="font-mono font-semibold text-slate-700">${doc.file_name}</span>
                        <span class="text-slate-400">&bull; ${formatFileSizeHuman(doc.file_size)}</span>
                    </div>
                    ${doc.notes ? `<p class="text-[11px] text-slate-500 italic mt-1">${doc.notes}</p>` : ''}
                </td>
                <td class="py-3.5 px-4 text-center whitespace-nowrap">
                    ${getDocStatusBadgeHtml(doc, isAdmin)}
                </td>
                <td class="py-3.5 px-4 text-right whitespace-nowrap">
                    <div class="inline-flex items-center gap-1.5">
                        <button type="button" onclick="previewCondoDocument(${doc.id})" class="px-2.5 py-1.5 rounded-xl bg-orange-50 hover:bg-orange-100 text-orange-700 border border-orange-200 font-bold text-[11px] inline-flex items-center gap-1 transition-colors" title="Visualizza Anteprima">
                            <i class="fa-solid fa-eye"></i>
                            <span>Vedi</span>
                        </button>
                        <button type="button" onclick="downloadCondoDocument(${doc.id})" class="px-2.5 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-[11px] inline-flex items-center gap-1 transition-colors" title="Scarica Allegato">
                            <i class="fa-solid fa-download"></i>
                            <span>Scarica</span>
                        </button>
                        ${canDelete ? `
                            <button type="button" onclick="deleteCondoDocument(${doc.id})" class="p-1.5 rounded-xl text-rose-500 hover:bg-rose-50 transition-colors" title="Elimina Documento">
                                <i class="fa-solid fa-trash-can"></i>
                            </button>
                        ` : ''}
                    </div>
                </td>
            </tr>
        `;
    }).join('');
};

window.onChangeDocAdminDestMode = function() {
    const selectedRadio = document.querySelector('input[name="doc_admin_dest_mode"]:checked');
    const mode = selectedRadio ? selectedRadio.value : 'all';
    const wrapper = document.getElementById('doc-persona-select-wrapper');
    const label = document.getElementById('doc-persona-select-label');
    const catSelect = document.getElementById('doc-upload-category');

    if (!wrapper) return;
    if (mode === 'all') {
        wrapper.classList.add('hidden');
        if (catSelect) catSelect.value = "Verbali d'Assemblea";
    } else {
        wrapper.classList.remove('hidden');
        if (label) label.textContent = "Seleziona Condòmino Destinatario (dall'Anagrafica) *";
        if (catSelect) catSelect.value = "Avvisi & Comunicazioni Generiche";
    }
};

window.onChangeDocCondoDestMode = function() {
    const selectedRadio = document.querySelector('input[name="doc_condo_dest_mode"]:checked');
    const mode = selectedRadio ? selectedRadio.value : 'admin';
    const wrapper = document.getElementById('doc-persona-select-wrapper');
    const label = document.getElementById('doc-persona-select-label');
    const catSelect = document.getElementById('doc-upload-category');

    if (!wrapper) return;
    if (mode === 'admin') {
        wrapper.classList.add('hidden');
        if (catSelect) catSelect.value = "Ricevuta Bonifico / Pagamento";
    } else {
        wrapper.classList.remove('hidden');
        if (label) label.textContent = "Seleziona il Condòmino dello Stabile a cui inviare l'allegato *";
        if (catSelect) catSelect.value = "Moduli Firmati & Deleghe";
    }
};

window.onChangeDocDirectionMode = function() {
    if (state.currentUser && state.currentUser.role === 'admin') {
        window.onChangeDocAdminDestMode();
    } else {
        window.onChangeDocCondoDestMode();
    }
};

// ==========================================
// CANALI DI INPUT: FILE, CAMERA & SCANNER
// ==========================================
window.triggerDocFilePicker = function() {
    const input = document.getElementById('doc-upload-file-input');
    if (input) input.click();
};

window.triggerDocCameraAction = function() {
    const isMobile = /Android|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent || '');
    if (isMobile) {
        const camInput = document.getElementById('doc-upload-camera-input');
        if (camInput) camInput.click();
    } else {
        openCameraCaptureModal();
    }
};

window.triggerDocScanAction = function() {
    const scanInput = document.getElementById('doc-upload-scanner-input');
    if (scanInput) {
        scanInput.click();
    }
};

window.onSelectScannedDocument = function(input) {
    if (input && input.files && input.files[0]) {
        const file = input.files[0];
        window.onSelectDocumentFile(input, true);
        showToast(`Documento scansionato acquisito: ${file.name}`, 'success');
    }
};

let cameraStream = null;

async function openCameraCaptureModal() {
    const modal = document.getElementById('modal-camera-capture');
    const video = document.getElementById('camera-stream-video');
    const canvas = document.getElementById('camera-stream-canvas');
    const preview = document.getElementById('camera-snapshot-preview');
    const guide = document.getElementById('camera-frame-guide');
    const shutterBtn = document.getElementById('btn-camera-shutter');
    const retakeBtn = document.getElementById('btn-camera-retake');
    const confirmBtn = document.getElementById('btn-camera-confirm');

    if (!modal || !video) return;

    if (canvas) canvas.classList.add('hidden');
    if (preview) {
        preview.classList.add('hidden');
        preview.src = '';
    }
    if (video) video.classList.remove('hidden');
    if (guide) guide.classList.remove('hidden');
    if (shutterBtn) shutterBtn.classList.remove('hidden');
    if (retakeBtn) retakeBtn.classList.add('hidden');
    if (confirmBtn) confirmBtn.classList.add('hidden');

    modal.classList.remove('hidden');

    try {
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
            throw new Error('WebRTC non supportato da questo browser.');
        }
        cameraStream = await navigator.mediaDevices.getUserMedia({
            video: {
                facingMode: { ideal: 'environment' },
                width: { ideal: 1920 },
                height: { ideal: 1080 }
            },
            audio: false
        });
        video.srcObject = cameraStream;
        await video.play();
    } catch (err) {
        console.warn('Accesso fotocamera fallito, fallback a input file fotocamera:', err);
        closeCameraCaptureModal();
        const camInput = document.getElementById('doc-upload-camera-input');
        if (camInput) {
            camInput.click();
        } else {
            showToast('Impossibile accedere alla fotocamera: ' + (err.message || 'permesso negato'), 'warning');
        }
    }
}

window.closeCameraCaptureModal = function() {
    const modal = document.getElementById('modal-camera-capture');
    if (modal) modal.classList.add('hidden');
    if (cameraStream) {
        try {
            cameraStream.getTracks().forEach(track => track.stop());
        } catch (_) {}
        cameraStream = null;
    }
    const video = document.getElementById('camera-stream-video');
    if (video) video.srcObject = null;
};

window.takeCameraSnapshot = function() {
    const video = document.getElementById('camera-stream-video');
    const canvas = document.getElementById('camera-stream-canvas');
    const preview = document.getElementById('camera-snapshot-preview');
    const guide = document.getElementById('camera-frame-guide');
    const shutterBtn = document.getElementById('btn-camera-shutter');
    const retakeBtn = document.getElementById('btn-camera-retake');
    const confirmBtn = document.getElementById('btn-camera-confirm');

    if (!video || !canvas || !preview) return;

    const w = video.videoWidth || 1280;
    const h = video.videoHeight || 720;
    canvas.width = w;
    canvas.height = h;

    const ctx = canvas.getContext('2d');
    ctx.drawImage(video, 0, 0, w, h);

    const dataUrl = canvas.toDataURL('image/jpeg', 0.92);
    preview.src = dataUrl;

    video.classList.add('hidden');
    if (guide) guide.classList.add('hidden');
    preview.classList.remove('hidden');

    if (shutterBtn) shutterBtn.classList.add('hidden');
    if (retakeBtn) retakeBtn.classList.remove('hidden');
    if (confirmBtn) confirmBtn.classList.remove('hidden');
};

window.retakeCameraSnapshot = function() {
    const video = document.getElementById('camera-stream-video');
    const preview = document.getElementById('camera-snapshot-preview');
    const guide = document.getElementById('camera-frame-guide');
    const shutterBtn = document.getElementById('btn-camera-shutter');
    const retakeBtn = document.getElementById('btn-camera-retake');
    const confirmBtn = document.getElementById('btn-camera-confirm');

    if (preview) {
        preview.classList.add('hidden');
        preview.src = '';
    }
    if (video) video.classList.remove('hidden');
    if (guide) guide.classList.remove('hidden');

    if (shutterBtn) shutterBtn.classList.remove('hidden');
    if (retakeBtn) retakeBtn.classList.add('hidden');
    if (confirmBtn) confirmBtn.classList.add('hidden');
};

window.confirmCameraSnapshot = function() {
    const preview = document.getElementById('camera-snapshot-preview');
    if (!preview || !preview.src || preview.src.length < 50) {
        showToast('Nessuna foto acquisita.', 'warning');
        return;
    }

    const dataUrl = preview.src;
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const fileName = `foto_documento_${timestamp}.jpg`;
    const approxSize = Math.round((dataUrl.length * 3) / 4);

    state.pendingUploadFile = {
        file_name: fileName,
        file_mime: 'image/jpeg',
        file_size: approxSize,
        file_data: dataUrl
    };

    updateSelectedFileBoxUI(fileName, approxSize, 'Foto scattata con la fotocamera');

    const titleInput = document.getElementById('doc-upload-title');
    if (titleInput && !titleInput.value.trim()) {
        titleInput.value = `Foto Documento ${new Date().toLocaleDateString('it-IT')}`;
    }

    window.closeCameraCaptureModal();
    showToast('Foto acquisita con successo!', 'success');
};

function updateSelectedFileBoxUI(name, size, note) {
    const box = document.getElementById('doc-selected-file-box');
    const nameEl = document.getElementById('doc-selected-file-name');
    const sizeEl = document.getElementById('doc-selected-file-size');
    const iconEl = document.getElementById('doc-selected-file-icon');

    if (box) box.classList.remove('hidden');
    if (nameEl) nameEl.textContent = name;
    if (sizeEl) sizeEl.textContent = `${formatFileSizeHuman(size)}${note ? ' • ' + note : ' • Pronto per l\'invio'}`;
    if (iconEl) iconEl.innerHTML = getDocFileIcon(name, state.pendingUploadFile ? state.pendingUploadFile.file_mime : '');
}

window.removePendingUploadFile = function() {
    state.pendingUploadFile = null;
    const box = document.getElementById('doc-selected-file-box');
    if (box) box.classList.add('hidden');

    ['doc-upload-file-input', 'doc-upload-camera-input', 'doc-upload-scanner-input'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.value = '';
    });
};

window.previewCurrentPendingFile = function() {
    if (!state.pendingUploadFile || !state.pendingUploadFile.file_data) {
        showToast('Nessun file selezionato da visualizzare.', 'warning');
        return;
    }
    const win = window.open();
    if (win) {
        if (state.pendingUploadFile.file_mime && state.pendingUploadFile.file_mime.startsWith('image/')) {
            win.document.write(`<title>${state.pendingUploadFile.file_name}</title><body style="margin:0;background:#111;display:flex;align-items:center;justify-content:center;height:100vh;"><img src="${state.pendingUploadFile.file_data}" style="max-width:100%;max-height:100%;object-fit:contain;"></body>`);
        } else {
            win.document.write(`<title>${state.pendingUploadFile.file_name}</title><iframe src="${state.pendingUploadFile.file_data}" style="border:none;width:100%;height:100vh;"></iframe>`);
        }
    } else {
        showToast('Finestra popup bloccata dal browser.', 'warning');
    }
};

window.openUploadDocumentModal = async function() {
    try {
        if (typeof isLicenseReadOnly === 'function' && isLicenseReadOnly()) {
            showToast('Condominio in Sola Lettura: caricamento documenti bloccato.', 'warning');
            return;
        }

        const modal = document.getElementById('modal-upload-document');
        if (!modal) {
            console.error('Elemento #modal-upload-document non trovato');
            return;
        }

        const isAdmin = state.currentUser && state.currentUser.role === 'admin';
        const adminRecSection = document.getElementById('doc-admin-recipient-section');
        const condoRecSection = document.getElementById('doc-condo-recipient-section');
        const modalTitle = document.getElementById('modal-upload-doc-title');
        const modalSub = document.getElementById('modal-upload-doc-subtitle');
        const catSelect = document.getElementById('doc-upload-category');

        // Reset file pending e form
        window.removePendingUploadFile();
        try {
            const form = document.getElementById('form-upload-document');
            if (form) form.reset();
        } catch (_) {}

        if (isAdmin) {
            if (adminRecSection) adminRecSection.classList.remove('hidden');
            if (condoRecSection) condoRecSection.classList.add('hidden');
            if (modalTitle) modalTitle.textContent = 'Carica e Invia Documento / Allegato';
            if (modalSub) modalSub.textContent = 'Pubblica in bacheca per l\'intero condominio o invia a un singolo condòmino';

            if (catSelect) {
                catSelect.innerHTML = `
                    <option value="Verbali d'Assemblea">Verbali d'Assemblea</option>
                    <option value="Bilanci & Rendiconti">Bilanci & Rendiconti</option>
                    <option value="Avvisi & Comunicazioni Generiche">Avvisi & Comunicazioni Generiche</option>
                    <option value="Regolamento & Polizze">Regolamento & Polizze</option>
                    <option value="Contratti Fornitori & Manutenzioni">Contratti Fornitori & Manutenzioni</option>
                    <option value="Altra Documentazione">Altra Documentazione</option>
                `;
                catSelect.value = "Verbali d'Assemblea";
            }
            window.onChangeDocAdminDestMode();
        } else {
            if (adminRecSection) adminRecSection.classList.add('hidden');
            if (condoRecSection) condoRecSection.classList.remove('hidden');
            if (modalTitle) modalTitle.textContent = 'Invia Allegato o Documento';
            if (modalSub) modalSub.textContent = 'Invia allo Studio Amministratore o a un altro condòmino dello stabile';

            if (catSelect) {
                catSelect.innerHTML = `
                    <option value="Ricevuta Bonifico / Pagamento">Ricevuta di Pagamento / Bonifico</option>
                    <option value="Segnalazione Guasto con Foto">Segnalazione Guasto con Foto</option>
                    <option value="Moduli Firmati & Deleghe">Moduli Firmati & Deleghe</option>
                    <option value="Comunicazione Riservata">Comunicazione Riservata</option>
                    <option value="Altra Documentazione">Altra Documentazione</option>
                `;
                catSelect.value = "Ricevuta Bonifico / Pagamento";
            }
            window.onChangeDocCondoDestMode();
        }

        modal.classList.remove('hidden');

        // Popola l'elenco condòmini in background
        populateDocPersonaSelectors().catch(() => {});
    } catch (err) {
        console.error('Errore openUploadDocumentModal:', err);
        const modal = document.getElementById('modal-upload-document');
        if (modal) modal.classList.remove('hidden');
    }
};

window.closeUploadDocumentModal = function() {
    const modal = document.getElementById('modal-upload-document');
    if (modal) modal.classList.add('hidden');
    window.closeCameraCaptureModal();
};

window.onSelectDocumentFile = function(input, isScanned = false) {
    const file = input && input.files && input.files[0];
    const titleInput = document.getElementById('doc-upload-title');

    if (!file) {
        state.pendingUploadFile = null;
        return;
    }

    if (file.size > 10 * 1024 * 1024) {
        showToast('Il file supera la dimensione massima di 10 MB.', 'error');
        input.value = '';
        state.pendingUploadFile = null;
        return;
    }

    const reader = new FileReader();
    reader.onload = function(evt) {
        state.pendingUploadFile = {
            file_name: file.name,
            file_mime: file.type || 'application/octet-stream',
            file_size: file.size,
            file_data: evt.target.result
        };
        updateSelectedFileBoxUI(file.name, file.size, isScanned ? 'Acquisito da Scanner' : 'File pronto');
        if (titleInput && !titleInput.value.trim()) {
            titleInput.value = file.name.replace(/\.[^/.]+$/, '').replace(/[_-]+/g, ' ');
        }
    };
    reader.readAsDataURL(file);
};

window.submitUploadDocument = async function(e) {
    if (e) e.preventDefault();

    const isAdmin = state.currentUser && state.currentUser.role === 'admin';
    const title = document.getElementById('doc-upload-title')?.value.trim();
    const category = document.getElementById('doc-upload-category')?.value || 'Altra Documentazione';
    const notes = document.getElementById('doc-upload-notes')?.value.trim() || '';

    if (!title) {
        showToast('Inserisci il titolo del documento.', 'warning');
        return;
    }
    if (!state.pendingUploadFile || !state.pendingUploadFile.file_data) {
        showToast('Acquisisci o seleziona un file tramite Scanner, Fotocamera o Sfoglia File.', 'warning');
        return;
    }

    const payload = {
        category,
        title,
        notes,
        file_name: state.pendingUploadFile.file_name,
        file_mime: state.pendingUploadFile.file_mime,
        file_size: state.pendingUploadFile.file_size,
        file_data: state.pendingUploadFile.file_data
    };

    if (isAdmin) {
        const selectedRadio = document.querySelector('input[name="doc_admin_dest_mode"]:checked');
        const mode = selectedRadio ? selectedRadio.value : 'all';
        const personaId = document.getElementById('doc-upload-persona-id')?.value;

        if (mode === 'all') {
            payload.recipient_type = 'all';
        } else {
            if (!personaId) {
                showToast('Seleziona il condòmino destinatario dall\'elenco.', 'warning');
                return;
            }
            payload.recipient_type = 'persona';
            payload.recipient_persona_id = personaId;
        }
    } else {
        const selectedRadio = document.querySelector('input[name="doc_condo_dest_mode"]:checked');
        const mode = selectedRadio ? selectedRadio.value : 'admin';
        const personaId = document.getElementById('doc-upload-persona-id')?.value;

        if (mode === 'admin') {
            payload.recipient_type = 'admin';
        } else {
            if (!personaId) {
                showToast('Seleziona il condòmino destinatario a cui inviare l\'allegato.', 'warning');
                return;
            }
            payload.recipient_type = 'persona';
            payload.recipient_persona_id = personaId;
        }
    }

    try {
        const btn = document.getElementById('btn-submit-upload-doc');
        if (btn) btn.disabled = true;

        const res = await fetch('/api/documents', {
            method: 'POST',
            headers: getAuthHeaders(),
            body: JSON.stringify(payload)
        });
        const data = await res.json();
        if (btn) btn.disabled = false;

        if (data.success) {
            showToast(data.message || 'Documento inviato con successo!', 'success');
            closeUploadDocumentModal();
            loadCondoDocuments();
        } else {
            showToast(data.message || 'Errore durante il caricamento.', 'error');
        }
    } catch (err) {
        const btn = document.getElementById('btn-submit-upload-doc');
        if (btn) btn.disabled = false;
        showToast('Errore di connessione durante il caricamento.', 'error');
    }
};

window.previewCondoDocument = async function(docId) {
    try {
        const res = await fetch(`/api/documents/${docId}/file`, { headers: getAuthHeaders() });
        const data = await res.json();
        if (!data.success || !data.data) {
            showToast(data.message || 'Impossibile aprire il documento.', 'error');
            return;
        }
        const doc = data.data;
        const modal = document.getElementById('modal-preview-document');
        const titleEl = document.getElementById('preview-doc-title');
        const fileEl = document.getElementById('preview-doc-filename');
        const dlBtn = document.getElementById('preview-doc-download-btn');
        const bodyEl = document.getElementById('preview-doc-body');

        if (titleEl) titleEl.textContent = doc.title || 'Documento';
        if (fileEl) fileEl.textContent = `${doc.file_name} (${formatFileSizeHuman(doc.file_size)})`;
        if (dlBtn) {
            dlBtn.href = doc.file_data || '#';
            dlBtn.download = doc.file_name || 'documento.pdf';
        }

        const mime = String(doc.file_mime || '').toLowerCase();
        const ext = String(doc.file_name || '').split('.').pop().toLowerCase();

        if (bodyEl) {
            if (mime.includes('pdf') || ext === 'pdf') {
                bodyEl.innerHTML = `<iframe src="${doc.file_data}" class="w-full h-full rounded-xl border border-slate-300 bg-white"></iframe>`;
            } else if (mime.includes('image') || ['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(ext)) {
                bodyEl.innerHTML = `<img src="${doc.file_data}" alt="${doc.file_name}" class="max-w-full max-h-full object-contain rounded-xl shadow-md">`;
            } else {
                bodyEl.innerHTML = `
                    <div class="bg-white p-8 rounded-2xl border border-slate-200 text-center max-w-md space-y-4">
                        <div class="text-4xl">${getDocFileIcon(doc.file_name, doc.file_mime)}</div>
                        <h4 class="font-bold text-slate-900 text-sm">${doc.file_name}</h4>
                        <p class="text-xs text-slate-500">Questo formato file può essere scaricato e aperto direttamente sul tuo dispositivo.</p>
                        <a href="${doc.file_data}" download="${doc.file_name}" class="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-orange-600 hover:bg-orange-700 text-white font-bold text-xs">
                            <i class="fa-solid fa-download"></i> Scarica sul Dispositivo
                        </a>
                    </div>
                `;
            }
        }

        if (modal) modal.classList.remove('hidden');
    } catch (e) {
        showToast('Errore apertura anteprima documento.', 'error');
    }
};

window.closePreviewDocumentModal = function() {
    const modal = document.getElementById('modal-preview-document');
    const bodyEl = document.getElementById('preview-doc-body');
    if (bodyEl) bodyEl.innerHTML = '';
    if (modal) modal.classList.add('hidden');
};

window.downloadCondoDocument = async function(docId) {
    try {
        const res = await fetch(`/api/documents/${docId}/file`, { headers: getAuthHeaders() });
        const data = await res.json();
        if (!data.success || !data.data || !data.data.file_data) {
            showToast(data.message || 'Errore durante il download.', 'error');
            return;
        }
        const a = document.createElement('a');
        a.href = data.data.file_data;
        a.download = data.data.file_name || 'documento.pdf';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
    } catch (e) {
        showToast('Errore durante il download del file.', 'error');
    }
};

window.updateCondoDocumentStatus = async function(docId, newStatus) {
    try {
        const res = await fetch(`/api/documents/${docId}/status`, {
            method: 'PATCH',
            headers: getAuthHeaders(),
            body: JSON.stringify({ status: newStatus })
        });
        const data = await res.json();
        if (data.success) {
            showToast(data.message || 'Stato aggiornato!', 'success');
            loadCondoDocuments();
        } else {
            showToast(data.message || 'Errore aggiornamento stato.', 'error');
        }
    } catch (e) {
        showToast('Errore di connessione.', 'error');
    }
};

window.deleteCondoDocument = async function(docId) {
    if (!confirm('Sei sicuro di voler eliminare definitivamente questo documento?')) return;
    try {
        const res = await fetch(`/api/documents/${docId}`, {
            method: 'DELETE',
            headers: getAuthHeaders()
        });
        const data = await res.json();
        if (data.success) {
            showToast('Documento eliminato.', 'success');
            loadCondoDocuments();
        } else {
            showToast(data.message || 'Errore eliminazione documento.', 'error');
        }
    } catch (e) {
        showToast('Errore di connessione.', 'error');
    }
};






// Gestione Modale Approfondimento Flussi di Tesoreria
window.openTesoreriaInfoModal = function() {
    const m = document.getElementById('modal-tesoreria-info');
    if (m) m.classList.remove('hidden');
};

window.closeTesoreriaInfoModal = function() {
    const m = document.getElementById('modal-tesoreria-info');
    if (m) m.classList.add('hidden');
};


// ============================================================================
// GESTIONE PANNELLO SUPERUSER (CENSIMENTO RAPIDO CONDOMINIO & ABILITAZIONE)
// ============================================================================
window.openSuperuserPanel = function() {
    const p = document.getElementById('superuser-panel');
    const d = document.getElementById('superuser-dashboard-view');
    const a = document.getElementById('agency-dashboard-view');
    const c = document.getElementById('app-core-view');
    if (d) d.classList.add('hidden');
    if (a) a.classList.add('hidden');
    if (c) c.classList.add('hidden');
    if (p) {
        p.classList.remove('hidden');
        window.scrollTo({ top: 0, behavior: 'smooth' });
    }
};

window.closeSuperuserPanel = function() {
    const p = document.getElementById('superuser-panel');
    if (p) p.classList.add('hidden');
    if (typeof openSuperUserDashboard === 'function') {
        openSuperUserDashboard();
    } else if (typeof returnToAgencyDashboard === 'function') {
        returnToAgencyDashboard();
    }
};

// Inizializzazione listener form censimento superuser
document.addEventListener('DOMContentLoaded', () => {
    const formCreaCondominio = document.getElementById('form-crea-condominio');

    if (formCreaCondominio) {
        formCreaCondominio.addEventListener('submit', async (e) => {
            e.preventDefault();

            // Recupera il token JWT salvato a sistema (es. in localStorage o sessionStorage)
            const token = localStorage.getItem('jwt_token') || sessionStorage.getItem('condo_token') || localStorage.getItem('condo_token') || (window.state && window.state.token); 

            // Estrazione dei dati dai campi dell'interfaccia
            const payload = {
                nome: document.getElementById('condo-nome').value.trim(),
                codice_fiscale: document.getElementById('condo-cf').value.trim(),
                indirizzo: document.getElementById('condo-indirizzo').value.trim(),
                amministratore_email: document.getElementById('condo-admin-email').value.trim()
            };

            const submitBtn = formCreaCondominio.querySelector('button[type="submit"]');
            const originalBtnHtml = submitBtn ? submitBtn.innerHTML : '';
            if (submitBtn) {
                submitBtn.disabled = true;
                submitBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Elaborazione in corso...';
            }

            try {
                const response = await fetch('/api/superuser/crea-condominio', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${token}` // Trasmissione sicura del token
                    },
                    body: JSON.stringify(payload)
                });

                const data = await response.json();

                if (response.ok && data.success) {
                    alert('🎉 Successo: ' + data.message);
                    formCreaCondominio.reset(); // Svuota i campi del form
                    if (typeof loadSuperUserOverview === 'function') loadSuperUserOverview();
                    if (typeof fetchCondos === 'function') fetchCondos();
                } else {
                    alert('❌ Errore: ' + (data.error || data.errore || data.message || 'Impossibile completare l\'operazione.'));
                }

            } catch (error) {
                console.error('Errore durante la richiesta Fetch:', error);
                alert('❌ Si è verificato un errore di rete o il server non risponde.');
            } finally {
                if (submitBtn) {
                    submitBtn.disabled = false;
                    submitBtn.innerHTML = originalBtnHtml;
                }
            }
        });
    }
});


// ============================================================================
// GESTIONE PANNELLO AMMINISTRATORE (ASSOCIAZIONE CONDOMINO / RESIDENTI)
// ============================================================================
window.openAdminPanel = function() {
    const p = document.getElementById('admin-panel');
    const suP = document.getElementById('superuser-panel');
    const d = document.getElementById('superuser-dashboard-view');
    const a = document.getElementById('agency-dashboard-view');
    const c = document.getElementById('app-core-view');
    if (suP) suP.classList.add('hidden');
    if (d) d.classList.add('hidden');
    if (a) a.classList.add('hidden');
    if (c) c.classList.add('hidden');
    if (p) {
        p.classList.remove('hidden');
        window.scrollTo({ top: 0, behavior: 'smooth' });
        loadAdminCondosForInvito();
    }
};

window.closeAdminPanel = function() {
    const p = document.getElementById('admin-panel');
    if (p) p.classList.add('hidden');
    if (typeof returnToAgencyDashboard === 'function') {
        returnToAgencyDashboard();
    } else {
        const a = document.getElementById('agency-dashboard-view');
        if (a) a.classList.remove('hidden');
    }
};

async function loadAdminCondosForInvito() {
    const select = document.getElementById('invito-condominio-id');
    if (!select) return;
    
    select.innerHTML = '<option value="">Caricamento stabili in corso...</option>';
    
    const token = localStorage.getItem('jwt_token') || sessionStorage.getItem('condo_token') || localStorage.getItem('condo_token') || (window.state && window.state.token);
    
    try {
        const res = await fetch('/api/amministratore/miei-condomini', {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });
        const data = await res.json();
        if (data.success && Array.isArray(data.condomini) && data.condomini.length > 0) {
            select.innerHTML = '<option value="">Scegli lo stabile...</option>' + 
                data.condomini.map(c => `<option value="${c.id}">${c.nome} - ${c.indirizzo || ''} (CF: ${c.codice_fiscale || 'N/D'})</option>`).join('');
        } else if (window.state && state.currentUser && state.currentUser.condomini && state.currentUser.condomini.length > 0) {
            select.innerHTML = '<option value="">Scegli lo stabile...</option>' + 
                state.currentUser.condomini.map(c => `<option value="${c.id}">${c.nome}</option>`).join('');
        } else {
            select.innerHTML = '<option value="">Nessuno stabile assegnato trovato</option>';
        }
    } catch (e) {
        if (window.state && state.currentUser && state.currentUser.condomini && state.currentUser.condomini.length > 0) {
            select.innerHTML = '<option value="">Scegli lo stabile...</option>' + 
                state.currentUser.condomini.map(c => `<option value="${c.id}">${c.nome}</option>`).join('');
        } else {
            select.innerHTML = '<option value="">Errore caricamento stabili</option>';
        }
    }
}

// Inizializzazione listener form invito condomino
document.addEventListener('DOMContentLoaded', () => {
    const formInvitaCondomino = document.getElementById('form-invita-condomino');

    if (formInvitaCondomino) {
        formInvitaCondomino.addEventListener('submit', async (e) => {
            e.preventDefault();
            const token = localStorage.getItem('jwt_token') || sessionStorage.getItem('condo_token') || localStorage.getItem('condo_token') || (window.state && window.state.token);

            const payload = {
                condominio_id: document.getElementById('invito-condominio-id').value,
                condomino_email: document.getElementById('invito-email').value.trim(),
                interno: document.getElementById('invito-interno').value.trim(),
                millesimi: parseFloat(document.getElementById('invito-millesimi').value)
            };

            const submitBtn = formInvitaCondomino.querySelector('button[type="submit"]');
            const originalBtnHtml = submitBtn ? submitBtn.innerHTML : '';
            if (submitBtn) {
                submitBtn.disabled = true;
                submitBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Inserimento in corso...';
            }

            try {
                const response = await fetch('/api/amministratore/invita-condomino', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${token}`
                    },
                    body: JSON.stringify(payload)
                });

                const data = await response.json();

                if (response.ok && data.success) {
                    alert('🎉 Abbinamento completato con successo!\n' + (data.message || ''));
                    formInvitaCondomino.reset();
                    if (typeof fetchAnagrafica === 'function') fetchAnagrafica();
                } else {
                    alert('❌ Errore: ' + (data.error || 'Impossibile associare il condomino.'));
                }
            } catch (error) {
                console.error('Errore di rete:', error);
                alert('❌ Errore di connessione con il server.');
            } finally {
                if (submitBtn) {
                    submitBtn.disabled = false;
                    submitBtn.innerHTML = originalBtnHtml;
                }
            }
        });
    }
});


// Controllo visibilità pulsanti Amministratore (Desk & Header)
function updateAdminPanelVisibility() {
    const user = window.state && window.state.currentUser;
    if (!user) return;
    const isSuper = user.is_superadmin || user.ruolo === 'superuser';
    const isAdmin = isSuper || user.ruolo === 'amministratore' || (user.condomini && user.condomini.some(c => c.role === 'admin'));
    
    const bDesk = document.getElementById('btn-admin-desk');
    if (bDesk) {
        if (isAdmin) bDesk.classList.remove('hidden');
        else bDesk.classList.add('hidden');
    }
    const bHeader = document.getElementById('btn-admin-panel');
    if (bHeader) {
        if (isAdmin) bHeader.classList.remove('hidden');
        else bHeader.classList.add('hidden');
    }

    const isCondomino = user.ruolo === 'condomino' || (!isAdmin && !isSuper);
    const bCondoDesk = document.getElementById('btn-condomino-desk');
    if (bCondoDesk) {
        if (isCondomino) bCondoDesk.classList.remove('hidden');
        else bCondoDesk.classList.add('hidden');
    }
    const bCondoHeader = document.getElementById('btn-condomino-panel');
    if (bCondoHeader) {
        if (isCondomino) bCondoHeader.classList.remove('hidden');
        else bCondoHeader.classList.add('hidden');
    }
}
setInterval(updateAdminPanelVisibility, 1000);


// ============================================================================
// LOGICA CONTABILE CONDOMINO & CARD RIEPILOGO FINANZIARIO RISERVATO
// ============================================================================
window.loadCondominoFinanceDashboard = async function() {
    const cardContainer = document.getElementById('condomino-finance-dashboard');
    if (!cardContainer) return;

    const token = localStorage.getItem('jwt_token') || sessionStorage.getItem('condo_token') || localStorage.getItem('condo_token') || (window.state && window.state.token);
    if (!token) return;

    const activeCondoId = (window.state && (window.state.activeCondominioId || window.state.currentCondoId)) || sessionStorage.getItem('active_Condominio_id');
    const url = activeCondoId 
        ? `/api/condomino/dashboard?condominio_id=${encodeURIComponent(activeCondoId)}`
        : '/api/condomino/dashboard';

    const elUnita = document.getElementById('pers-unita');
    const elMillesimi = document.getElementById('pers-millesimi');
    const elBadgeSaldo = document.getElementById('pers-badge-saldo');
    const tbody = document.getElementById('condomino-scadenze-tbody');
    const formatEuro = (val) => new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' }).format(val || 0);

    try {
        const res = await fetch(url, {
            headers: {
                'Authorization': `Bearer ${token}`,
                'x-condominio-id': activeCondoId ? String(activeCondoId) : ''
            }
        });

        if (!res.ok) {
            if (elUnita) elUnita.textContent = 'Posizione Fabbricato';
            if (elMillesimi) elMillesimi.textContent = '1000.00 / 1000';
            if (elBadgeSaldo) {
                elBadgeSaldo.className = 'px-3 py-1 rounded-full text-xs font-bold bg-slate-800 text-slate-300 border border-slate-700 flex items-center gap-1.5';
                elBadgeSaldo.innerHTML = '<i class="fa-solid fa-circle-check text-emerald-400"></i> Flussi Regolari';
            }
            if (tbody) {
                tbody.innerHTML = '<tr><td colspan="6" class="py-6 text-center text-slate-500">Nessuna spesa individuale pendente per questo profilo.</td></tr>';
            }
            return;
        }

        const data = await res.json();
        if (!data.success) {
            if (elUnita) elUnita.textContent = 'Nessuna unità assegnata';
            if (elMillesimi) elMillesimi.textContent = '0,00 / 1000';
            if (elBadgeSaldo) {
                elBadgeSaldo.className = 'px-3 py-1 rounded-full text-xs font-bold bg-slate-800 text-slate-300 border border-slate-700';
                elBadgeSaldo.textContent = 'Nessuna pendenza';
            }
            if (tbody) {
                tbody.innerHTML = '<tr><td colspan="6" class="py-6 text-center text-slate-500">Nessuna scadenza contabile registrata.</td></tr>';
            }
            return;
        }

        const pers = data.dati_personali || {};
        const glob = data.aggregato_cassa_stabile || {};

        // 1. Aggiornamento Card Globale Riservata (Residui Attivi della Gestione)
        const elTotalePrevisto = document.getElementById('stat-totale-preventivato');
        const elTotaleRiscosso = document.getElementById('stat-totale-riscosso');
        const elResiduiAttivi = document.getElementById('stat-residui-attivi');
        const elPerc = document.getElementById('stat-percentuale-avanzamento');
        const elBar = document.getElementById('bar-avanzamento-riscossioni');
        const elBadge = document.getElementById('badge-stato-riscossioni');

        if (elTotalePrevisto) elTotalePrevisto.textContent = formatEuro(glob.totale_gestione_preventivata);
        if (elTotaleRiscosso) elTotaleRiscosso.textContent = formatEuro(glob.totale_riscosso_fabbricato);
        if (elResiduiAttivi) elResiduiAttivi.textContent = formatEuro(glob.residui_attivi_gestione);

        const perc = Math.round(glob.percentuale_avanzamento || 0);
        if (elPerc) elPerc.textContent = `${perc}%`;
        if (elBar) elBar.style.width = `${Math.min(100, Math.max(0, perc))}%`;

        if (elBadge) {
            if (perc >= 90) {
                elBadge.className = 'inline-flex items-center gap-1.5 px-3 py-1 rounded-xl text-xs font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 mt-1';
                elBadge.innerHTML = '<span class="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span> Ottima Liquidità';
            } else if (perc >= 60) {
                elBadge.className = 'inline-flex items-center gap-1.5 px-3 py-1 rounded-xl text-xs font-bold bg-indigo-500/10 text-indigo-300 border border-indigo-500/20 mt-1';
                elBadge.innerHTML = '<span class="w-2 h-2 rounded-full bg-indigo-400"></span> Flussi Regolari';
            } else {
                elBadge.className = 'inline-flex items-center gap-1.5 px-3 py-1 rounded-xl text-xs font-bold bg-amber-500/10 text-amber-300 border border-amber-500/20 mt-1';
                elBadge.innerHTML = '<span class="w-2 h-2 rounded-full bg-amber-400 animate-pulse"></span> Riscossioni in Corso';
            }
        }

        // 2. Aggiornamento Posizione Personale Individuale
        if (elUnita) elUnita.textContent = pers.unita_immobiliare ? pers.unita_immobiliare.interno : (pers.interno || 'Unità Condominiale');
        if (elMillesimi) elMillesimi.textContent = pers.unita_immobiliare ? `${parseFloat(pers.unita_immobiliare.millesimi || 0).toFixed(2)} / 1000` : '0,00 / 1000';

        const saldoPers = pers.riepilogo_personale ? pers.riepilogo_personale.saldo_in_corso : 0;
        const statoTesto = pers.riepilogo_personale ? pers.riepilogo_personale.stato : '';
        if (elBadgeSaldo) {
            if (statoTesto && (statoTesto.includes('Amministratore') || statoTesto.includes('Proprietario'))) {
                elBadgeSaldo.className = 'px-3 py-1 rounded-full text-xs font-bold bg-indigo-500/10 text-indigo-300 border border-indigo-500/20 flex items-center gap-1.5';
                elBadgeSaldo.innerHTML = '<i class="fa-solid fa-user-shield"></i> Studio Amministrazione';
            } else if (saldoPers === 0) {
                elBadgeSaldo.className = 'px-3 py-1 rounded-full text-xs font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 flex items-center gap-1.5';
                elBadgeSaldo.innerHTML = '<i class="fa-solid fa-check-circle"></i> In regola con i versamenti';
            } else {
                elBadgeSaldo.className = 'px-3 py-1 rounded-full text-xs font-bold bg-amber-500/10 text-amber-300 border border-amber-500/20 flex items-center gap-1.5';
                elBadgeSaldo.innerHTML = `<i class="fa-solid fa-clock"></i> Quota residua: ${formatEuro(saldoPers)}`;
            }
        }

        // 3. Tabella Scadenze Personali
        if (tbody) {
            const scadenze = pers.scadenze || [];
            if (scadenze.length === 0) {
                tbody.innerHTML = '<tr><td colspan="6" class="py-6 text-center text-slate-500">Nessuna spesa o scadenza contabile attualmente attiva per questo stabile.</td></tr>';
            } else {
                tbody.innerHTML = scadenze.map(s => {
                    const isRegolare = s.stato_contabile === 'Regolarizzato';
                    const badgeClass = isRegolare 
                        ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' 
                        : 'bg-amber-500/10 text-amber-300 border border-amber-500/20';
                    const escape = (str) => String(str || '').replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[m]);
                    return `
                        <tr class="hover:bg-white/5 transition-colors">
                            <td class="py-3 px-3 font-medium text-white">${escape(s.titolo)}</td>
                            <td class="py-3 px-3 text-right text-slate-400">${s.data_scadenza ? s.data_scadenza.slice(0, 10) : '-'}</td>
                            <td class="py-3 px-3 text-right font-semibold text-white">${formatEuro(s.quota_dovuta)}</td>
                            <td class="py-3 px-3 text-right text-emerald-400">${formatEuro(s.importo_versato)}</td>
                            <td class="py-3 px-3 text-right font-bold ${parseFloat(s.residuo_individuale) > 0 ? 'text-amber-300' : 'text-slate-400'}">${formatEuro(s.residuo_individuale)}</td>
                            <td class="py-3 px-3 text-center">
                                <span class="px-2.5 py-0.5 rounded-full text-[10px] font-bold ${badgeClass}">
                                    ${s.stato_contabile}
                                </span>
                            </td>
                        </tr>
                    `;
                }).join('');
            }
        }

    } catch (e) {
        console.warn('Avviso caricamento dashboard finanziaria condomino:', e);
        if (elUnita) elUnita.textContent = 'Dati non disponibili';
        if (elMillesimi) elMillesimi.textContent = '0,00 / 1000';
        if (elBadgeSaldo) {
            elBadgeSaldo.className = 'px-3 py-1 rounded-full text-xs font-bold bg-slate-800 text-slate-400 border border-slate-700';
            elBadgeSaldo.textContent = 'Nessuna informazione';
        }
        if (tbody) {
            tbody.innerHTML = '<tr><td colspan="6" class="py-6 text-center text-slate-500">Impossibile recuperare i dettagli contabili in questo momento.</td></tr>';
        }
    }
};

// Invocazione automatica ad avvio pagina


// ============================================================================
// MODULO DASHBOARD PRIVATA CONDOMINO & GENERAZIONE RICEVUTA PDF
// ============================================================================
window.openCondominoPanel = function() {
    const p = document.getElementById('condomino-panel');
    const adminP = document.getElementById('admin-panel');
    const suP = document.getElementById('superuser-panel');
    const d = document.getElementById('superuser-dashboard-view');
    const a = document.getElementById('agency-dashboard-view');
    const c = document.getElementById('app-core-view');
    if (adminP) adminP.classList.add('hidden');
    if (suP) suP.classList.add('hidden');
    if (d) d.classList.add('hidden');
    if (a) a.classList.add('hidden');
    if (c) c.classList.add('hidden');
    if (p) {
        p.classList.remove('hidden');
        window.scrollTo({ top: 0, behavior: 'smooth' });
        caricaDashboardCondomino();
    }
};

window.closeCondominoPanel = function() {
    const p = document.getElementById('condomino-panel');
    if (p) p.classList.add('hidden');
    const c = document.getElementById('app-core-view');
    if (c) c.classList.remove('hidden');
};

async function caricaDashboardCondomino() {
    const token = localStorage.getItem('jwt_token') || sessionStorage.getItem('condo_token') || localStorage.getItem('condo_token') || (window.state && window.state.token);

    try {
        const response = await fetch('/api/condomino/dashboard', {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const data = await response.json();

        if (response.ok && data.success) {
            // 1. Aggiorna intestazione privata
            const infoEl = document.getElementById('info-appartamento');
            if (infoEl && data.datiPersonali) {
                infoEl.innerText = `Unità Immobiliare: ${data.datiPersonali.interno || 'N/D'} | Quota: ${data.datiPersonali.millesimi || '0.00'} millesimi`;
            }

            // 2. Aggiorna la CARD PRIVACY con i dati aggregati
            const elBar = document.getElementById('cassa-progress-bar');
            const elPerc = document.getElementById('cassa-percentuale');
            const elResidui = document.getElementById('cassa-residui');

            if (data.cassaComune) {
                if (elBar) elBar.style.width = `${data.cassaComune.percentualeRiscossa || 0}%`;
                if (elPerc) elPerc.innerText = `${data.cassaComune.percentualeRiscossa || 0}%`;
                if (elResidui) elResidui.innerText = new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' }).format(data.cassaComune.residuiAttivi || 0);
            }

            // 3. Popola lo storico dei pagamenti personali
            const corpoTabella = document.getElementById('tabella-pagamenti-corpo');
            if (corpoTabella) {
                corpoTabella.innerHTML = '';
                const pagamenti = (data.datiPersonali && Array.isArray(data.datiPersonali.pagamenti)) ? data.datiPersonali.pagamenti : [];

                if (pagamenti.length === 0) {
                    corpoTabella.innerHTML = '<tr><td colspan="4" class="p-4 text-center text-slate-500">Nessun pagamento registrato.</td></tr>';
                    return;
                }

                pagamenti.forEach(p => {
                    const cod = p.ricevuta_codice || '';
                    corpoTabella.innerHTML += `
                        <tr class="border-b border-white/5 hover:bg-white/5 transition-colors">
                            <td class="p-3 font-medium text-white">${p.titolo || 'Quota Deliberata'}</td>
                            <td class="p-3 text-slate-400">${p.data || '-'}</td>
                            <td class="p-3 text-right font-mono text-emerald-400 font-bold">€ ${parseFloat(p.importo_versato || 0).toFixed(2)}</td>
                            <td class="p-3 text-center">
                                ${cod ? `
                                <button type="button" onclick="scaricaPDF('${cod}')" class="text-indigo-400 hover:text-indigo-300 transition-colors p-1.5 rounded-lg bg-indigo-500/10 hover:bg-indigo-500/20 inline-flex items-center gap-1.5 text-xs font-semibold">
                                    <i class="fa-solid fa-file-pdf"></i> Scarica
                                </button>
                                ` : '<span class="text-xs text-slate-500">N/D</span>'}
                            </td>
                        </tr>
                    `;
                });
            }
        }
    } catch (error) {
        console.error('Errore render dashboard condomino:', error);
    }
}

// Funzione globale per invocare il download binario del PDF generato da Puppeteer
async function scaricaPDF(codiceRicevuta) {
    const token = localStorage.getItem('jwt_token') || sessionStorage.getItem('condo_token') || localStorage.getItem('condo_token') || (window.state && window.state.token);
    try {
        const response = await fetch(`/api/condomino/ricevuta/${encodeURIComponent(codiceRicevuta)}`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });

        if (!response.ok) throw new Error('Download fallito');

        // Trasforma la risposta in un BLOB binario ed avvia il download del file
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `Ricevuta_${codiceRicevuta}.pdf`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => window.URL.revokeObjectURL(url), 1000);
    } catch (error) {
        alert('Impossibile scaricare il PDF della ricevuta.');
    }
}

window.caricaDashboardCondomino = caricaDashboardCondomino;
window.scaricaPDF = scaricaPDF;

// Aggiorna l'event listener DOMContentLoaded

document.addEventListener('DOMContentLoaded', () => {
    setTimeout(() => {
        if (typeof window.loadCondominoFinanceDashboard === 'function') {
            window.loadCondominoFinanceDashboard();
        }
        if (typeof window.caricaDashboardCondomino === 'function') {
            window.caricaDashboardCondomino();
        }
    }, 700);
});
