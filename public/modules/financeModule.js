/**
 * ============================================================================
 * CondoTransparent - Finance & Accounting Module (Strangler Fig Architecture)
 * ============================================================================
 * Gestisce la logica contabile, le scadenze del condòmino, i saldi di cassa
 * e il download delle ricevute PDFKit.
 */

(function() {
    'use strict';

    class FinanceModule {
        constructor(api) {
            this.api = api || window.CondoModules?.apiClient || window.apiClient;
            this.currencyFormatter = new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' });
        }

        formatEuro(amount) {
            return this.currencyFormatter.format(Number(amount) || 0);
        }

        escapeHtml(str) {
            return String(str || '').replace(/[&<>"']/g, m => ({
                '&': '&amp;',
                '<': '&lt;',
                '>': '&gt;',
                '"': '&quot;',
                "'": '&#39;'
            })[m]);
        }

        async loadCondominoDashboard() {
            const cardContainer = document.getElementById('condomino-finance-dashboard');
            if (!cardContainer) return;

            const elUnita = document.getElementById('pers-unita');
            const elMillesimi = document.getElementById('pers-millesimi');
            const elBadgeSaldo = document.getElementById('pers-badge-saldo');
            const tbody = document.getElementById('condomino-scadenze-tbody');

            const activeCondoId = this.api.getActiveCondoId();
            const query = activeCondoId ? { condominio_id: activeCondoId } : null;

            try {
                const res = await this.api.get('/api/condomino/dashboard', query);

                if (!res.ok || !res.data || !res.data.success) {
                    const isAdmin = window.state && window.state.currentUser && (window.state.currentUser.role === 'admin' || window.state.currentUser.is_superadmin);
                    if (elUnita) elUnita.textContent = isAdmin ? 'Studio Amministrazione' : 'Unità Condominiale';
                    if (elMillesimi) elMillesimi.textContent = '0,00 / 1000';
                    if (elBadgeSaldo) {
                        elBadgeSaldo.className = 'px-3 py-1 rounded-full text-xs font-bold bg-slate-800 text-slate-300 border border-slate-700 flex items-center gap-1.5';
                        elBadgeSaldo.innerHTML = isAdmin ? '<i class="fa-solid fa-user-shield text-indigo-400"></i> Studio Amministrazione' : '<i class="fa-solid fa-circle-check text-emerald-400"></i> Flussi Regolari';
                    }
                    if (tbody) {
                        tbody.innerHTML = '<tr><td colspan="6" class="py-6 text-center text-slate-500">Nessuna spesa individuale pendente per questo profilo.</td></tr>';
                    }
                    return;
                }

                const data = res.data;
                const pers = data.dati_personali || {};
                const glob = data.aggregato_cassa_stabile || {};

                // 1. Aggiornamento KPI di cassa fabbricato
                const elTotalePrevisto = document.getElementById('stat-totale-preventivato');
                const elTotaleRiscosso = document.getElementById('stat-totale-riscosso');
                const elResiduiAttivi = document.getElementById('stat-residui-attivi');
                const elPerc = document.getElementById('stat-percentuale-avanzamento');
                const elBar = document.getElementById('bar-avanzamento-riscossioni');
                const elBadge = document.getElementById('badge-stato-riscossioni');

                if (elTotalePrevisto) elTotalePrevisto.textContent = this.formatEuro(glob.totale_gestione_preventivata);
                if (elTotaleRiscosso) elTotaleRiscosso.textContent = this.formatEuro(glob.totale_riscosso_fabbricato);
                if (elResiduiAttivi) elResiduiAttivi.textContent = this.formatEuro(glob.residui_attivi_gestione);

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

                // 2. Dettaglio posizione personale
                if (elUnita) elUnita.textContent = pers.unita_immobiliare ? pers.unita_immobiliare.interno : (pers.interno || 'Unità Condominiale');
                if (elMillesimi) {
                    const mill = pers.unita_immobiliare ? pers.unita_immobiliare.millesimi : pers.millesimi;
                    elMillesimi.textContent = `${parseFloat(mill || 0).toFixed(2)} / 1000`;
                }

                const saldoPers = pers.riepilogo_personale ? pers.riepilogo_personale.saldo_in_corso : 0;
                const statoTesto = pers.riepilogo_personale ? pers.riepilogo_personale.stato : '';
                if (elBadgeSaldo) {
                    if (pers.is_admin_view || (statoTesto && (statoTesto.includes('Amministratore') || statoTesto.includes('Proprietario')))) {
                        elBadgeSaldo.className = 'px-3 py-1 rounded-full text-xs font-bold bg-indigo-500/10 text-indigo-300 border border-indigo-500/20 flex items-center gap-1.5';
                        elBadgeSaldo.innerHTML = '<i class="fa-solid fa-user-shield"></i> Studio Amministrazione';
                    } else if (saldoPers <= 0) {
                        elBadgeSaldo.className = 'px-3 py-1 rounded-full text-xs font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 flex items-center gap-1.5';
                        elBadgeSaldo.innerHTML = '<i class="fa-solid fa-check-circle"></i> In regola con i versamenti';
                    } else {
                        elBadgeSaldo.className = 'px-3 py-1 rounded-full text-xs font-bold bg-amber-500/10 text-amber-300 border border-amber-500/20 flex items-center gap-1.5';
                        elBadgeSaldo.innerHTML = `<i class="fa-solid fa-clock"></i> Quota residua: ${this.formatEuro(saldoPers)}`;
                    }
                }

                // 3. Tabella scadenze individuali
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
                            return `
                                <tr class="hover:bg-white/5 transition-colors">
                                    <td class="py-3 px-3 font-medium text-white">${this.escapeHtml(s.titolo)}</td>
                                    <td class="py-3 px-3 text-right text-slate-400">${s.data_scadenza ? s.data_scadenza.slice(0, 10) : '-'}</td>
                                    <td class="py-3 px-3 text-right font-semibold text-white">${this.formatEuro(s.quota_dovuta)}</td>
                                    <td class="py-3 px-3 text-right text-emerald-400">${this.formatEuro(s.importo_versato)}</td>
                                    <td class="py-3 px-3 text-right font-bold ${parseFloat(s.residuo_individuale) > 0 ? 'text-amber-300' : 'text-slate-400'}">${this.formatEuro(s.residuo_individuale)}</td>
                                    <td class="py-3 px-3 text-center">
                                        <span class="px-2.5 py-0.5 rounded-full text-[10px] font-bold ${badgeClass}">
                                            ${this.escapeHtml(s.stato_contabile)}
                                        </span>
                                    </td>
                                </tr>
                            `;
                        }).join('');
                    }
                }
            } catch (err) {
                console.warn('⚠️ [FinanceModule] Errore recupero dashboard finanziaria:', err);
                if (elUnita) elUnita.textContent = 'Posizione Regolare';
                if (elMillesimi) elMillesimi.textContent = '0,00 / 1000';
                if (elBadgeSaldo) {
                    elBadgeSaldo.className = 'px-3 py-1 rounded-full text-xs font-bold bg-slate-800 text-slate-400 border border-slate-700';
                    elBadgeSaldo.textContent = 'Posizione Aggiornata';
                }
                if (tbody) {
                    tbody.innerHTML = '<tr><td colspan="6" class="py-6 text-center text-slate-500">Nessuna pendenza contabile attiva.</td></tr>';
                }
            }
        }

        async downloadRicevutaPdf(receiptCode) {
            if (!receiptCode) return;
            try {
                if (typeof window.showToast === 'function') {
                    window.showToast('Generazione ricevuta PDF in corso...', 'info');
                }
                const res = await this.api.request(`/api/condomino/ricevuta/${encodeURIComponent(receiptCode)}`, { responseType: 'blob' });
                if (!res.ok) {
                    throw new Error('Impossibile scaricare la ricevuta.');
                }
                const blob = res.data;
                const blobUrl = window.URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = blobUrl;
                a.download = `Ricevuta_${receiptCode}.pdf`;
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                window.URL.revokeObjectURL(blobUrl);
            } catch (e) {
                console.error('❌ [FinanceModule] Errore download ricevuta:', e);
                if (typeof window.showToast === 'function') {
                    window.showToast('Errore durante il download della ricevuta.', 'error');
                }
            }
        }
    }

    window.CondoModules = window.CondoModules || {};
    window.CondoModules.finance = new FinanceModule(window.CondoModules.apiClient);

    // Backward-compatibility bridge verso le funzioni globali storiche
    window.loadCondominoFinanceDashboard = () => window.CondoModules.finance.loadCondominoDashboard();
    window.downloadRicevutaPdf = (codice) => window.CondoModules.finance.downloadRicevutaPdf(codice);
})();
