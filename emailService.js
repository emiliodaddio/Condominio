/**
 * ============================================================================
 * CondoTransparent - Unified Email Service (Transazionale & Sicuro)
 * ============================================================================
 * Gestisce i 3 flussi critici di posta elettronica:
 * - FLUSSO A: Invito e Primo Accesso (Onboarding) - Valido 72 ore
 * - FLUSSO B: Codice di Sicurezza 2FA (OTP) - Valido 10 minuti
 * - FLUSSO C: Recupero Password (Reset) - Valido 2 ore
 * 
 * Supporta provider transazionali ad alta deliverability (SendGrid, Mailgun, AWS SES, SMTP)
 * con fallback automatico a Nodemailer/Ethereal in ambiente di sviluppo.
 */

const nodemailer = require('nodemailer');
const fs = require('fs');
const path = require('path');

// Carica variabili da .env se presente (incluso /etc/secrets/.env per Render)
const envPaths = [
    path.join(__dirname, '.env'),
    '/etc/secrets/.env',
    path.join(process.cwd(), '.env')
];
envPaths.forEach(envPath => {
    if (fs.existsSync(envPath)) {
        try {
            const lines = fs.readFileSync(envPath, 'utf8').split(/\r?\n/);
            lines.forEach(line => {
                const trimmed = line.trim();
                if (trimmed && !trimmed.startsWith('#')) {
                    const eqIdx = trimmed.indexOf('=');
                    if (eqIdx > 0) {
                        const key = trimmed.slice(0, eqIdx).trim();
                        const val = trimmed.slice(eqIdx + 1).trim();
                        if (!process.env[key]) process.env[key] = val;
                    }
                }
            });
        } catch (_) {}
    }
});

let transporter = null;
let isEthereal = false;

function initEmailTransporter() {
    // 0. Brevo REST API (HTTPS Porta 443 - Massima velocità e compatibilità cloud)
    if (process.env.BREVO_API_KEY) {
        console.log('📧 Email Service: Collegato con successo a Brevo REST API (HTTPS Porta 443).');
        return;
    }

    // 1. SendGrid via SMTP o API
    if (process.env.SENDGRID_API_KEY) {
        transporter = nodemailer.createTransport({
            host: 'smtp.sendgrid.net',
            port: 587,
            secure: false,
            auth: {
                user: 'apikey',
                pass: process.env.SENDGRID_API_KEY
            }
        });
        console.log('📧 Email Service: Collegato a SendGrid.');
        return;
    }

    // 2. Mailgun via SMTP
    if (process.env.MAILGUN_API_KEY && process.env.MAILGUN_DOMAIN) {
        transporter = nodemailer.createTransport({
            host: 'smtp.mailgun.org',
            port: 587,
            secure: false,
            auth: {
                user: `postmaster@${process.env.MAILGUN_DOMAIN}`,
                pass: process.env.MAILGUN_API_KEY
            }
        });
        console.log('📧 Email Service: Collegato a Mailgun.');
        return;
    }

    // 3. Brevo, AWS SES, Aruba o SMTP generico (con timeout anti-hang)
    if (process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS) {
        transporter = nodemailer.createTransport({
            host: process.env.SMTP_HOST,
            port: parseInt(process.env.SMTP_PORT || '587', 10),
            secure: process.env.SMTP_SECURE === 'true',
            auth: {
                user: process.env.SMTP_USER,
                pass: process.env.SMTP_PASS
            },
            connectionTimeout: 8000,
            greetingTimeout: 8000,
            socketTimeout: 10000
        });
        console.log(`📧 Email Service: Collegato con successo a SMTP (${process.env.SMTP_HOST}:${process.env.SMTP_PORT || 587}).`);
        return;
    }

    // 4. Fallback Ethereal per collaudo locale sicuro
    isEthereal = true;
    nodemailer.createTestAccount().then(testAccount => {
        transporter = nodemailer.createTransport({
            host: 'smtp.ethereal.email',
            port: 587,
            secure: false,
            auth: {
                user: testAccount.user,
                pass: testAccount.pass
            }
        });
        console.log('📧 Email Service: Inizializzato fallback Ethereal per ambiente test.');
    }).catch(err => {
        console.warn('⚠️ Avviso inizializzazione email Ethereal:', err.message);
    });
}

function reloadEmailTransporter() {
    isEthereal = false;
    transporter = null;
    initEmailTransporter();
}

initEmailTransporter();

/**
 * Genera il template HTML responsive e minimale coerente con il brand CondoTransparent
 */
function buildEmailHtml({ headline, introText, ctaText, ctaUrl, otpCode, extraNotice }) {
    const primaryColor = '#2563eb';
    const darkSlate = '#0f172a';
    const bgLight = '#f8fafc';
    const borderColor = '#e2e8f0';

    const ctaButtonHtml = ctaUrl ? `
        <div style="text-align: center; margin: 32px 0 24px 0;">
            <a href="${ctaUrl}" style="background: linear-gradient(135deg, #2563eb, #4f46e5); color: #ffffff; padding: 14px 34px; text-decoration: none; font-size: 14px; font-weight: 700; border-radius: 12px; display: inline-block; box-shadow: 0 4px 14px rgba(37,99,235,0.28); letter-spacing: 0.3px;">
                ${ctaText || 'Accedi al Portale'}
            </a>
        </div>
    ` : '';

    const otpHtml = otpCode ? `
        <div style="text-align: center; margin: 28px 0;">
            <div style="display: inline-block; background-color: #f1f5f9; border: 2px dashed #cbd5e1; border-radius: 16px; padding: 16px 36px;">
                <span style="font-size: 11px; font-weight: 800; color: #64748b; text-transform: uppercase; letter-spacing: 1.5px; display: block; margin-bottom: 6px;">Codice Monouso OTP</span>
                <span style="font-family: 'SF Mono', Consolas, Monaco, monospace; font-size: 32px; font-weight: 800; color: #1e293b; letter-spacing: 8px;">
                    ${otpCode}
                </span>
            </div>
        </div>
    ` : '';

    const linkFallbackHtml = ctaUrl ? `
        <p style="margin: 20px 0 0 0; font-size: 11px; line-height: 1.5; color: #94a3b8; word-break: break-all;">
            In caso di problemi con il pulsante, copia e incolla questo indirizzo nel tuo browser:<br>
            <a href="${ctaUrl}" style="color: ${primaryColor}; text-decoration: underline;">${ctaUrl}</a>
        </p>
    ` : '';

    return `
    <!DOCTYPE html>
    <html lang="it">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>CondoTransparent</title>
    </head>
    <body style="margin: 0; padding: 0; background-color: ${bgLight}; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #334155;">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background-color: ${bgLight}; padding: 36px 12px;">
            <tr>
                <td align="center">
                    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="max-width: 560px; background-color: #ffffff; border-radius: 24px; border: 1px solid ${borderColor}; box-shadow: 0 10px 25px rgba(15,23,42,0.04); overflow: hidden;">
                        
                        <!-- Header Brand -->
                        <tr>
                            <td style="padding: 32px 36px 20px 36px; border-bottom: 1px solid #f1f5f9; text-align: left;">
                                <table role="presentation" cellspacing="0" cellpadding="0" border="0">
                                    <tr>
                                        <td style="width: 40px; height: 40px; background: linear-gradient(135deg, #1e293b, #0f172a); border-radius: 12px; text-align: center; vertical-align: middle; color: #60a5fa; font-size: 18px; font-weight: bold;">
                                            🏢
                                        </td>
                                        <td style="padding-left: 14px;">
                                            <span style="font-size: 18px; font-weight: 800; color: ${darkSlate}; display: block; letter-spacing: -0.3px;">CondoTransparent</span>
                                            <span style="font-size: 11px; font-weight: 600; color: #64748b; text-transform: uppercase; letter-spacing: 0.8px;">Portale Digitale del Fabbricato</span>
                                        </td>
                                    </tr>
                                </table>
                            </td>
                        </tr>

                        <!-- Body Principale -->
                        <tr>
                            <td style="padding: 32px 36px;">
                                ${headline ? `<h1 style="margin: 0 0 16px 0; font-size: 20px; font-weight: 800; color: ${darkSlate}; letter-spacing: -0.4px; line-height: 1.35;">${headline}</h1>` : ''}
                                
                                <div style="font-size: 14px; line-height: 1.65; color: #475569;">
                                    ${introText}
                                </div>

                                ${otpHtml}
                                ${ctaButtonHtml}

                                ${extraNotice ? `
                                    <div style="margin-top: 24px; padding: 12px 16px; background-color: #f8fafc; border-left: 3px solid #cbd5e1; border-radius: 6px; font-size: 12px; color: #64748b; line-height: 1.5;">
                                        ${extraNotice}
                                    </div>
                                ` : ''}

                                ${linkFallbackHtml}
                            </td>
                        </tr>

                        <!-- Footer di Sicurezza Richiesto -->
                        <tr>
                            <td style="padding: 24px 36px 28px 36px; background-color: #fafbfc; border-top: 1px solid #f1f5f9; text-align: center;">
                                <p style="margin: 0 0 6px 0; font-size: 11px; font-weight: 600; color: #64748b;">
                                    🔒 Questa è una comunicazione protetta da crittografia end-to-end gestita da CondoTransparent.
                                </p>
                                <p style="margin: 0; font-size: 10px; color: #94a3b8;">
                                    Ricevi questa email a seguito delle attività amministrative del tuo stabile. Non rispondere direttamente a questo indirizzo.
                                </p>
                            </td>
                        </tr>
                    </table>
                </td>
            </tr>
        </table>
    </body>
    </html>
    `;
}

async function sendViaBrevoApi(mailOptions) {
    const fromAddress = process.env.MAIL_FROM || 'CondoTransparent <noreply@condominiotrasparente.com>';
    let senderName = 'CondoTransparent';
    let senderEmail = 'noreply@condominiotrasparente.com';
    const match = fromAddress.match(/"?([^"<]+)"?\s*<([^>]+)>/);
    if (match) {
        senderName = match[1].trim();
        senderEmail = match[2].trim();
    } else if (fromAddress.includes('@')) {
        senderEmail = fromAddress.trim();
    }

    const payload = {
        sender: { name: senderName, email: senderEmail },
        to: [{ email: mailOptions.to }],
        subject: mailOptions.subject,
        htmlContent: mailOptions.html,
        textContent: mailOptions.text
    };

    const res = await fetch('https://api.brevo.com/v3/smtp/email', {
        method: 'POST',
        headers: {
            'api-key': process.env.BREVO_API_KEY,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
    });

    const data = await res.json();
    if (!res.ok) {
        throw new Error(data.message || `Brevo API HTTP ${res.status}`);
    }
    console.log('✅ Email inviata con successo via Brevo REST API (HTTPS).');
    return { info: data, previewUrl: null };
}

async function sendViaResendApi(mailOptions) {
    const fromAddress = process.env.MAIL_FROM || 'CondoTransparent <noreply@condominiotrasparente.com>';
    const payload = {
        from: fromAddress,
        to: [mailOptions.to],
        subject: mailOptions.subject,
        html: mailOptions.html,
        text: mailOptions.text
    };

    const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${process.env.RESEND_API_KEY}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
    });

    const data = await res.json();
    if (!res.ok) {
        throw new Error(data.message || `Resend API HTTP ${res.status}`);
    }
    console.log('✅ Email inviata con successo via Resend REST API (HTTPS).');
    return { info: data, previewUrl: null };
}

/**
 * Invia email tramite il provider configurato (API REST o SMTP con timeout)
 */
async function sendMailWrapper(mailOptions) {
    // 1. Invio tramite Brevo REST API (HTTPS Porta 443 - compatibile con Render Cloud Free)
    if (process.env.BREVO_API_KEY) {
        return sendViaBrevoApi(mailOptions);
    }

    // 2. Invio tramite Resend REST API (HTTPS Porta 443 - compatibile con Render Cloud Free)
    if (process.env.RESEND_API_KEY) {
        return sendViaResendApi(mailOptions);
    }

    if (!transporter) {
        console.warn('⚠️ Transporter non ancora pronto, invio rimandato di 500ms...');
        await new Promise(r => setTimeout(r, 500));
        if (!transporter) throw new Error('Servizio email non disponibile.');
    }

    const fromAddress = process.env.MAIL_FROM || '"CondoTransparent" <no-reply@condominio.it>';
    const info = await transporter.sendMail({
        from: fromAddress,
        ...mailOptions
    });

    let previewUrl = null;
    if (isEthereal) {
        previewUrl = nodemailer.getTestMessageUrl(info);
        console.log(`🔗 [Ethereal Preview] "${mailOptions.subject}" ->`, previewUrl);
    }
    return { info, previewUrl };
}

/**
 * ============================================================================
 * FLUSSO A: INVITO E PRIMO ACCESSO (ONBOARDING)
 * Validità token: 72 ore
 * ============================================================================
 */
async function sendOnboardingInviteEmail({ email, nome, condoNome, token, host, protocol = 'http' }) {
    const activationUrl = `${protocol}://${host}/login.html?token=${token}&flow=onboarding`;
    const cleanCondo = condoNome || 'Condominio';

    const headline = `Benvenuto su CondoTransparent`;
    const introText = `
        <p style="margin: 0 0 14px 0;">Gentile <strong>${nome}</strong>,</p>
        <p style="margin: 0 0 14px 0;">
            Il tuo amministratore ti ha invitato ad accedere al portale del <strong>Condominio ${cleanCondo}</strong>.
        </p>
        <p style="margin: 0 0 14px 0;">
            Clicca qui per impostare la tua password e attivare il tuo profilo in totale sicurezza.
        </p>
    `;

    const extraNotice = `Il link di attivazione rimarrà valido per <strong>72 ore</strong>. Ti consigliamo di scegliere una password sicura con almeno 8 caratteri, una maiuscola, un numero e un carattere speciale.`;

    const html = buildEmailHtml({
        headline,
        introText,
        ctaText: 'Attiva Profilo e Imposta Password',
        ctaUrl: activationUrl,
        extraNotice
    });

    const text = `Benvenuto su CondoTransparent. Il tuo amministratore ti ha invitato ad accedere al portale del Condominio ${cleanCondo}. Clicca qui per impostare la tua password e attivare il tuo profilo in totale sicurezza:\n${activationUrl}\n\nIl link è valido per 72 ore.\n\nQuesta è una comunicazione protetta da crittografia end-to-end gestita da CondoTransparent.`;

    return sendMailWrapper({
        to: email,
        subject: `Benvenuto su CondoTransparent - Invito Condominio ${cleanCondo}`,
        text,
        html
    });
}

/**
 * ============================================================================
 * FLUSSO B: CODICE DI SICUREZZA 2FA (ACCESSO CONFERMATO)
 * Validità codice: 10 minuti
 * ============================================================================
 */
async function sendTwoFactorOtpEmail({ email, nome, otpCode }) {
    const headline = `Codice di Verifica di Sicurezza`;
    const introText = `
        <p style="margin: 0 0 12px 0;">Gentile <strong>${nome || 'Condòmino'}</strong>,</p>
        <p style="margin: 0 0 12px 0;">
            Il tuo codice di verifica per accedere a CondoTransparent è riportato di seguito.
        </p>
    `;

    const extraNotice = `Non condividere questo codice con nessuno. Se non hai richiesto tu questo accesso, ti invitiamo a cambiare immediatamente la tua password. Il codice scade tra <strong>10 minuti</strong>.`;

    const html = buildEmailHtml({
        headline,
        introText,
        otpCode,
        extraNotice
    });

    const text = `Il tuo codice di verifica per accedere a CondoTransparent è: ${otpCode}. Non condividere questo codice con nessuno. Se non hai richiesto tu questo accesso, ti invitiamo a cambiare immediatamente la tua password.\n\nValidità: 10 minuti.\n\nQuesta è una comunicazione protetta da crittografia end-to-end gestita da CondoTransparent.`;

    return sendMailWrapper({
        to: email,
        subject: `Il tuo codice di verifica CondoTransparent: ${otpCode}`,
        text,
        html
    });
}

/**
 * ============================================================================
 * FLUSSO C: RECUPERO PASSWORD (RESET)
 * Validità token: 2 ore
 * ============================================================================
 */
async function sendPasswordResetEmail({ email, nome, token, host, protocol = 'http' }) {
    const resetUrl = `${protocol}://${host}/login.html?token=${token}&flow=reset`;

    const headline = `Ripristino della Password`;
    const introText = `
        <p style="margin: 0 0 14px 0;">Gentile <strong>${nome || 'Utente'}</strong>,</p>
        <p style="margin: 0 0 14px 0;">
            Hai richiesto il ripristino della password per il tuo account CondoTransparent. Clicca sul link sottostante per sceglierne una nuova.
        </p>
    `;

    const extraNotice = `Se non hai effettuato tu la richiesta, ignora questa e-mail. Il link rimarrà valido per <strong>2 ore</strong>.`;

    const html = buildEmailHtml({
        headline,
        introText,
        ctaText: 'Reimposta la tua Password',
        ctaUrl: resetUrl,
        extraNotice
    });

    const text = `Hai richiesto il ripristino della password per il tuo account CondoTransparent. Clicca sul link sottostante per sceglierne una nuova:\n${resetUrl}\n\nSe non hai effettuato tu la richiesta, ignora questa e-mail.\nIl link è valido per 2 ore.\n\nQuesta è una comunicazione protetta da crittografia end-to-end gestita da CondoTransparent.`;

    return sendMailWrapper({
        to: email,
        subject: `Ripristino Password - CondoTransparent`,
        text,
        html
    });
}


/**
 * ============================================================================
 * FLUSSO D: ACCESSO RAPIDO PASSWORDLESS (MAGIC LINK)
 * Validità token: 15 minuti
 * ============================================================================
 */
async function sendMagicLinkEmail({ email, nome, token, host, protocol = 'http' }) {
    const magicUrl = `${protocol}://${host}/login.html?magic_token=${token}`;

    const headline = `Accesso Rapido a Condominio Trasparente`;
    const introText = `
        <p style="margin: 0 0 14px 0;">Gentile <strong>${nome || 'Utente'}</strong>,</p>
        <p style="margin: 0 0 14px 0;">
            Hai richiesto un link sicuro per accedere a <strong>Condominio Trasparente</strong> senza dover digitare la password. Clicca sul pulsante qui sotto per completare l'accesso.
        </p>
    `;

    const extraNotice = `Se non hai richiesto tu questo accesso, puoi ignorare questo messaggio. Il link è monouso e scadrà tra <strong>15 minuti</strong>.`;

    const html = buildEmailHtml({
        headline,
        introText,
        ctaText: 'Accedi al Portale',
        ctaUrl: magicUrl,
        extraNotice
    });

    const text = `Gentile ${nome || 'Utente'}, clicca sul seguente link per accedere a Condominio Trasparente senza password:\n${magicUrl}\n\nIl link è valido per 15 minuti ed è monouso.`;

    return sendMailWrapper({
        to: email,
        subject: `Link di Accesso Rapido - Condominio Trasparente`,
        text,
        html
    });
}

module.exports = {
    sendMagicLinkEmail,
    sendOnboardingInviteEmail,
    sendTwoFactorOtpEmail,
    sendPasswordResetEmail,
    buildEmailHtml,
    reloadEmailTransporter,
    isUsingEthereal: () => isEthereal
};
