/**
 * ============================================================================
 * CondoTransparent - Document & Presigned Retrieval Module (Strangler Fig Architecture)
 * ============================================================================
 * Gestisce l'anteprima, il download e l'upload sicuro dei documenti condominiali.
 */

(function() {
    'use strict';

    class DocumentModule {
        constructor(api) {
            this.api = api || window.CondoModules?.apiClient || window.apiClient;
        }

        formatFileSize(bytes) {
            if (!bytes || isNaN(bytes)) return '0 B';
            const k = 1024;
            const sizes = ['B', 'KB', 'MB', 'GB'];
            const i = Math.floor(Math.log(bytes) / Math.log(k));
            return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
        }

        async previewDocument(docId) {
            try {
                const res = await this.api.get(`/api/documents/${docId}/file`);
                if (!res.ok || !res.data || !res.data.success || !res.data.data) {
                    if (typeof window.showToast === 'function') {
                        window.showToast((res.data && res.data.message) || 'Impossibile caricare il documento richiesto.', 'error');
                    }
                    return;
                }

                const doc = res.data.data;
                const modal = document.getElementById('modal-preview-document');
                const titleEl = document.getElementById('preview-doc-title');
                const fileEl = document.getElementById('preview-doc-filename');
                const dlBtn = document.getElementById('preview-doc-download-btn');
                const bodyEl = document.getElementById('preview-doc-body');

                if (titleEl) titleEl.textContent = doc.title || 'Documento Condominiale';
                if (fileEl) fileEl.textContent = `${doc.file_name} (${this.formatFileSize(doc.file_size)})`;
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
                                <div class="text-4xl text-slate-400"><i class="fa-solid fa-file"></i></div>
                                <h4 class="font-bold text-slate-900 text-sm">${doc.file_name}</h4>
                                <p class="text-xs text-slate-500">Questo file può essere scaricato e consultato direttamente sul tuo dispositivo.</p>
                                <a href="${doc.file_data}" download="${doc.file_name}" class="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-orange-600 hover:bg-orange-700 text-white font-bold text-xs shadow-md">
                                    <i class="fa-solid fa-download"></i> Scarica File
                                </a>
                            </div>
                        `;
                    }
                }

                if (modal) modal.classList.remove('hidden');
            } catch (err) {
                console.error('❌ [DocumentModule] Errore anteprima documento:', err);
                if (typeof window.showToast === 'function') {
                    window.showToast('Errore durante il recupero del documento.', 'error');
                }
            }
        }

        closePreviewModal() {
            const modal = document.getElementById('modal-preview-document');
            const bodyEl = document.getElementById('preview-doc-body');
            if (bodyEl) bodyEl.innerHTML = '';
            if (modal) modal.classList.add('hidden');
        }

        async downloadDocument(docId) {
            try {
                const res = await this.api.get(`/api/documents/${docId}/file`);
                if (!res.ok || !res.data || !res.data.success || !res.data.data) {
                    if (typeof window.showToast === 'function') {
                        window.showToast((res.data && res.data.message) || 'Errore durante il download.', 'error');
                    }
                    return;
                }
                const doc = res.data.data;
                const link = document.createElement('a');
                link.href = doc.file_data;
                link.download = doc.file_name || 'documento.pdf';
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);
            } catch (err) {
                console.error('❌ [DocumentModule] Errore download documento:', err);
                if (typeof window.showToast === 'function') {
                    window.showToast('Errore durante il download del file.', 'error');
                }
            }
        }
    }

    window.CondoModules = window.CondoModules || {};
    window.CondoModules.documents = new DocumentModule(window.CondoModules.apiClient);

    // Backward-compatibility bridge
    window.previewCondoDocument = (id) => window.CondoModules.documents.previewDocument(id);
    window.closePreviewDocumentModal = () => window.CondoModules.documents.closePreviewModal();
    window.downloadCondoDocument = (id) => window.CondoModules.documents.downloadDocument(id);
})();
