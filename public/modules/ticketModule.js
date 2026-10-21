/**
 * ============================================================================
 * CondoTransparent - Ticket & Media Module (Strangler Fig Architecture)
 * ============================================================================
 * Gestisce l'apertura guasti, lo scatto WebRTC in tempo reale e il caricamento
 * di allegati fotografici su storage protetto.
 */

(function() {
    'use strict';

    class TicketModule {
        constructor(api) {
            this.api = api || window.CondoModules?.apiClient || window.apiClient;
            this.cameraStream = null;
        }

        async openCameraCaptureModal() {
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
                this.cameraStream = await navigator.mediaDevices.getUserMedia({
                    video: {
                        facingMode: { ideal: 'environment' },
                        width: { ideal: 1920 },
                        height: { ideal: 1080 }
                    },
                    audio: false
                });
                video.srcObject = this.cameraStream;
                await video.play();
            } catch (err) {
                console.warn('⚠️ [TicketModule] Accesso fotocamera fallito, fallback a input file:', err);
                this.closeCameraCaptureModal();
                const camInput = document.getElementById('doc-upload-camera-input');
                if (camInput) {
                    camInput.click();
                } else if (typeof window.showToast === 'function') {
                    window.showToast('Impossibile accedere alla fotocamera: ' + (err.message || 'permesso negato'), 'warning');
                }
            }
        }

        closeCameraCaptureModal() {
            const modal = document.getElementById('modal-camera-capture');
            if (modal) modal.classList.add('hidden');
            if (this.cameraStream) {
                try {
                    this.cameraStream.getTracks().forEach(track => track.stop());
                } catch (_) {}
                this.cameraStream = null;
            }
            const video = document.getElementById('camera-stream-video');
            if (video) video.srcObject = null;
        }

        takeCameraSnapshot() {
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
        }

        retakeCameraSnapshot() {
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
        }

        confirmCameraSnapshot() {
            const preview = document.getElementById('camera-snapshot-preview');
            if (!preview || !preview.src) return;

            const dataUrl = preview.src;
            // Converte il dataURL in Blob e lo passa all'input file dedicato o allo stato
            fetch(dataUrl)
                .then(res => res.blob())
                .then(blob => {
                    const file = new File([blob], `scatto_${Date.now()}.jpg`, { type: 'image/jpeg' });
                    if (window.handleCapturedPhoto && typeof window.handleCapturedPhoto === 'function') {
                        window.handleCapturedPhoto(file);
                    }
                    this.closeCameraCaptureModal();
                    if (typeof window.showToast === 'function') {
                        window.showToast('Foto acquisita correttamente!', 'success');
                    }
                })
                .catch(err => {
                    console.error('❌ [TicketModule] Errore conversione scatto:', err);
                    this.closeCameraCaptureModal();
                });
        }
    }

    window.CondoModules = window.CondoModules || {};
    window.CondoModules.tickets = new TicketModule(window.CondoModules.apiClient);

    // Backward-compatibility bridge
    window.openCameraCaptureModal = () => window.CondoModules.tickets.openCameraCaptureModal();
    window.closeCameraCaptureModal = () => window.CondoModules.tickets.closeCameraCaptureModal();
    window.takeCameraSnapshot = () => window.CondoModules.tickets.takeCameraSnapshot();
    window.retakeCameraSnapshot = () => window.CondoModules.tickets.retakeCameraSnapshot();
    window.confirmCameraSnapshot = () => window.CondoModules.tickets.confirmCameraSnapshot();
})();
