/**
 * ============================================================================
 * CondoTransparent - Unified Secure API Client (Strangler Fig Architecture)
 * ============================================================================
 * Centralizza tutte le chiamate HTTP/REST con:
 * - Inclusione automatica credenziali (HttpOnly Cookie)
 * - Iniezione trasparente del contesto multi-tenant (Header X-Condominio-Id)
 * - Rilevamento token JWT (Bearer fallback)
 * - Gestione unificata sessione (intercettazione 401/403)
 */

(function() {
    'use strict';

    class ApiClient {
        getToken() {
            return (window.state && window.state.token) ||
                   sessionStorage.getItem('condo_token') ||
                   localStorage.getItem('jwt_token') ||
                   localStorage.getItem('condo_token') ||
                   null;
        }

        getActiveCondoId() {
            return (window.state && window.state.activeCondominioId) ||
                   sessionStorage.getItem('active_Condominio_id') ||
                   (window.state && window.state.currentUser && window.state.currentUser.condomini && window.state.currentUser.condomini[0] && window.state.currentUser.condomini[0].id) ||
                   null;
        }

        buildHeaders(customHeaders = {}, isFormData = false) {
            const headers = {};
            if (!isFormData) {
                headers['Content-Type'] = 'application/json';
            }
            headers['Accept'] = 'application/json';

            const token = this.getToken();
            if (token) {
                headers['Authorization'] = `Bearer ${token}`;
            }

            const condoId = this.getActiveCondoId();
            if (condoId) {
                headers['X-Condominio-Id'] = String(condoId);
            }

            return Object.assign(headers, customHeaders);
        }

        async request(endpoint, options = {}) {
            const url = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
            const isFormData = typeof FormData !== 'undefined' && options.body instanceof FormData;
            
            const fetchConfig = {
                method: options.method || 'GET',
                headers: this.buildHeaders(options.headers, isFormData),
                credentials: 'include'
            };

            if (options.body && !isFormData && typeof options.body === 'object') {
                fetchConfig.body = JSON.stringify(options.body);
            } else if (options.body) {
                fetchConfig.body = options.body;
            }

            try {
                const response = await fetch(url, fetchConfig);

                if (response.status === 401) {
                    if (!url.includes('/api/auth/login') && !url.includes('/api/2fa')) {
                        console.warn('🔒 [ApiClient] Sessione scaduta o token non valido (401).');
                        if (typeof window.showToast === 'function') {
                            window.showToast('Sessione scaduta. Reindirizzamento al login...', 'warning');
                        }
                        if (typeof window.logout === 'function') {
                            setTimeout(() => window.logout(), 1200);
                        }
                    }
                }

                // Gestione risposte binarie (es. PDF, blob, Excel)
                if (options.responseType === 'blob') {
                    const blobData = await response.blob();
                    return { ok: response.ok, status: response.status, data: blobData };
                }

                let responseData = null;
                const contentType = response.headers.get('content-type') || '';
                if (contentType.includes('application/json')) {
                    responseData = await response.json();
                } else {
                    responseData = await response.text();
                }

                return {
                    ok: response.ok,
                    status: response.status,
                    data: responseData,
                    headers: response.headers
                };
            } catch (networkError) {
                console.error(`❌ [ApiClient] Errore di rete su ${url}:`, networkError);
                return {
                    ok: false,
                    status: 0,
                    error: networkError.message || 'Errore di connessione al server',
                    data: null
                };
            }
        }

        get(endpoint, queryParams = null, options = {}) {
            let url = endpoint;
            if (queryParams && typeof queryParams === 'object') {
                const search = new URLSearchParams();
                Object.entries(queryParams).forEach(([k, v]) => {
                    if (v !== undefined && v !== null) search.append(k, v);
                });
                const queryString = search.toString();
                if (queryString) {
                    url += (url.includes('?') ? '&' : '?') + queryString;
                }
            }
            return this.request(url, { ...options, method: 'GET' });
        }

        post(endpoint, body, options = {}) {
            return this.request(endpoint, { ...options, method: 'POST', body });
        }

        put(endpoint, body, options = {}) {
            return this.request(endpoint, { ...options, method: 'PUT', body });
        }

        delete(endpoint, options = {}) {
            return this.request(endpoint, { ...options, method: 'DELETE' });
        }

        upload(endpoint, formData, options = {}) {
            return this.request(endpoint, { ...options, method: 'POST', body: formData });
        }
    }

    // Esportazione su namespace globale
    window.CondoModules = window.CondoModules || {};
    window.CondoModules.apiClient = new ApiClient();
    window.apiClient = window.CondoModules.apiClient;
})();
