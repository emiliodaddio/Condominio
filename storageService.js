/**
 * ============================================================================
 * CondoTransparent - Secure Decoupled Storage Service (S3 / R2 / Local Fallback)
 * ============================================================================
 * Gestisce l'archiviazione e il recupero sicuro dei documenti condominiali.
 * - Archiviazione Cloud: AWS S3 / Cloudflare R2 / MinIO (con bucket privato a zero accesso pubblico)
 * - Accesso Protetto: Presigned URLs a tempo (TTL 60s) generati solo dopo verifica RBAC
 * - Fallback Locale: Directory protetta 'storage/uploads/' (esterna alla cartella pubblica)
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

let S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand, getSignedUrl;
try {
    const s3Sdk = require('@aws-sdk/client-s3');
    S3Client = s3Sdk.S3Client;
    PutObjectCommand = s3Sdk.PutObjectCommand;
    GetObjectCommand = s3Sdk.GetObjectCommand;
    DeleteObjectCommand = s3Sdk.DeleteObjectCommand;
    const presigner = require('@aws-sdk/s3-request-presigner');
    getSignedUrl = presigner.getSignedUrl;
} catch (e) {
    console.warn('⚠️ [StorageService] AWS SDK v3 non disponibile, fallback su filesystem locale protetto.');
}

// Directory protetta su filesystem locale (NON accessibile via express.static)
const LOCAL_STORAGE_DIR = path.join(__dirname, 'storage', 'uploads');
if (!fs.existsSync(LOCAL_STORAGE_DIR)) {
    try {
        fs.mkdirSync(LOCAL_STORAGE_DIR, { recursive: true });
    } catch (_) {}
}

class StorageService {
    constructor() {
        this.s3Client = null;
        this.bucketName = null;
        this.initClient();
    }

    initClient() {
        const accessKeyId = process.env.S3_ACCESS_KEY_ID || process.env.AWS_ACCESS_KEY_ID;
        const secretAccessKey = process.env.S3_SECRET_ACCESS_KEY || process.env.AWS_SECRET_ACCESS_KEY;
        const region = process.env.S3_REGION || process.env.AWS_REGION || 'eu-central-1';
        const bucket = process.env.S3_BUCKET || process.env.AWS_S3_BUCKET || process.env.R2_BUCKET;
        const endpoint = process.env.S3_ENDPOINT || null;

        if (S3Client && accessKeyId && secretAccessKey && bucket) {
            try {
                const config = {
                    region,
                    credentials: {
                        accessKeyId,
                        secretAccessKey
                    }
                };
                if (endpoint) {
                    config.endpoint = endpoint;
                    config.forcePathStyle = true;
                }
                this.s3Client = new S3Client(config);
                this.bucketName = bucket;
                console.log(`📦 [StorageService] Connesso a Object Storage S3/R2 (Bucket: ${bucket}, Region: ${region})`);
            } catch (err) {
                console.error('❌ [StorageService] Errore inizializzazione S3 Client:', err.message);
                this.s3Client = null;
            }
        } else {
            console.log('📂 [StorageService] Nessun bucket S3 configurato. Utilizzo storage locale protetto (/storage/uploads).');
        }
    }

    isS3Configured() {
        return !!(this.s3Client && this.bucketName);
    }

    /**
     * Genera una chiave univoca per il file (es: condomini/{condoId}/{uuid}-{filename})
     */
    generateStorageKey(condominioId, originalFilename) {
        const safeName = path.basename(originalFilename).replace(/[^a-zA-Z0-9._-]/g, '_');
        const uniquePrefix = `${Date.now()}-${crypto.randomBytes(6).toString('hex')}`;
        return `condomini/${condominioId}/${uniquePrefix}-${safeName}`;
    }

    /**
     * Salva un buffer di dati (o base64) nello storage (S3 se attivo, altrimenti storage protetto locale)
     */
    async upload({ condominioId, filename, mimeType, buffer }) {
        const key = this.generateStorageKey(condominioId, filename);
        const mime = mimeType || 'application/octet-stream';

        if (this.isS3Configured()) {
            const command = new PutObjectCommand({
                Bucket: this.bucketName,
                Key: key,
                Body: buffer,
                ContentType: mime
            });
            await this.s3Client.send(command);
            return {
                storageType: 's3',
                key,
                size: buffer.length
            };
        } else {
            // Local protected storage
            const targetPath = path.join(LOCAL_STORAGE_DIR, key.replace(/\//g, '_'));
            await fs.promises.writeFile(targetPath, buffer);
            return {
                storageType: 'local',
                key: key.replace(/\//g, '_'),
                size: buffer.length
            };
        }
    }

    /**
     * Restituisce l'URL di download a scadenza (Presigned URL 60s per S3, o URL API per storage locale)
     */
    async getDownloadUrl(key, originalFilename = 'documento.pdf', expiresInSeconds = 60) {
        if (!key) return null;

        if (this.isS3Configured()) {
            const command = new GetObjectCommand({
                Bucket: this.bucketName,
                Key: key,
                ResponseContentDisposition: `inline; filename="${encodeURIComponent(originalFilename)}"`
            });
            return await getSignedUrl(this.s3Client, command, { expiresIn: expiresInSeconds });
        } else {
            // Per storage locale, restituisce null così il server serve lo stream via API protetta
            return null;
        }
    }

    /**
     * Legge il buffer per storage locale
     */
    async getLocalFileBuffer(key) {
        if (!key) return null;
        const safeKey = path.basename(key);
        const targetPath = path.join(LOCAL_STORAGE_DIR, safeKey);
        if (fs.existsSync(targetPath)) {
            return await fs.promises.readFile(targetPath);
        }
        return null;
    }

    /**
     * Elimina un file dallo storage
     */
    async delete(key) {
        if (!key) return;
        try {
            if (this.isS3Configured()) {
                const command = new DeleteObjectCommand({
                    Bucket: this.bucketName,
                    Key: key
                });
                await this.s3Client.send(command);
            } else {
                const safeKey = path.basename(key);
                const targetPath = path.join(LOCAL_STORAGE_DIR, safeKey);
                if (fs.existsSync(targetPath)) {
                    await fs.promises.unlink(targetPath);
                }
            }
        } catch (e) {
            console.warn('⚠️ [StorageService] Errore eliminazione file:', e.message);
        }
    }
}

module.exports = new StorageService();
