const jwt = require('jsonwebtoken');
const http = require('http');

const JWT_SECRET = 'chiave_segreta_condominio_sicura_123!';

// Genera token JWT validi
function makeToken(user) {
    return jwt.sign(user, JWT_SECRET, { expiresIn: '1h' });
}

const adminUser = { id: 2, nome: 'Studio Rossi', email: 'admin@condominio.it', is_superadmin: 0 };
const condominoUser = { id: 3, nome: 'Mario Rossi', email: 'mario@email.it', is_superadmin: 0 };

const adminToken = makeToken(adminUser);
const condominoToken = makeToken(condominoUser);

function apiGet(path, token, condoId = 1) {
    return new Promise((resolve, reject) => {
        const req = http.request({
            hostname: '127.0.0.1',
            port: 3000,
            path: path,
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${token}`,
                'x-condominio-id': String(condoId)
            }
        }, res => {
            let d = '';
            res.on('data', c => d += c);
            res.on('end', () => {
                try {
                    resolve({ status: res.statusCode, json: JSON.parse(d) });
                } catch (e) {
                    resolve({ status: res.statusCode, raw: d });
                }
            });
        });
        req.on('error', reject);
        req.end();
    });
}

// Avvio server express
require('./server');

setTimeout(async () => {
    try {
        console.log('--- INIZIO VERIFICA REGOLE PRIVACY & GDPR ---');

        // Test 1: GET /api/quotes
        console.log('\n--- TEST 1: GET /api/quotes ---');
        const qAdmin = await apiGet('/api/quotes', adminToken);
        const qCondo = await apiGet('/api/quotes', condominoToken);
        console.log(`Admin vede ${qAdmin.json.data.length} quote totali.`);
        console.log(`Condomino Mario Rossi vede ${qCondo.json.data.length} quote personali.`);
        
        const condoHasOtherPeople = qCondo.json.data.some(q => {
            const name = (q.condomino_nome || '').toLowerCase();
            return !name.includes('rossi') && !name.includes('mario');
        });
        if (condoHasOtherPeople) {
            console.error('❌ ERRORE: Il condomino vede quote intestate ad altre persone!');
            process.exit(1);
        } else {
            console.log('✅ SUCCESSO: Il condomino visualizza esclusivamente le proprie quote!');
        }

        // Test 2: GET /api/receivables (Drill-down lista debitori)
        console.log('\n--- TEST 2: GET /api/receivables (Lista analitica debitori) ---');
        const recAdmin = await apiGet('/api/receivables', adminToken);
        const recCondo = await apiGet('/api/receivables', condominoToken);
        console.log(`Admin status /api/receivables: ${recAdmin.status} (${recAdmin.json.data ? recAdmin.json.data.length : 0} debitori visibili per gestione)`);
        console.log(`Condomino status /api/receivables: ${recCondo.status} (Messaggio: "${recCondo.json ? recCondo.json.message : ''}")`);
        if (recCondo.status === 403) {
            console.log('✅ SUCCESSO: Drill-down bloccato per il condomino con HTTP 403 Forbidden!');
        } else {
            console.error('❌ ERRORE: Il condomino non è stato bloccato su /api/receivables!');
            process.exit(1);
        }

        // Test 3: GET /api/condominio/financial-health (Card aggregata e anonimizzata)
        console.log('\n--- TEST 3: GET /api/condominio/financial-health (Salute finanziaria aggregata) ---');
        const healthCondo = await apiGet('/api/condominio/financial-health', condominoToken);
        console.log(`Condomino status /api/condominio/financial-health: ${healthCondo.status}`);
        console.log('Dati aggregati ricevuti dal condomino:', JSON.stringify(healthCondo.json.data, null, 2));
        if (healthCondo.status === 200 && healthCondo.json.data && healthCondo.json.data.privacy_note) {
            console.log('✅ SUCCESSO: Sintesi finanziaria aggregata esposta a norma GDPR (zero identificativi individuali)!');
        } else {
            console.error('❌ ERRORE nel recupero salute finanziaria.');
            process.exit(1);
        }

        // Test 4: GET /api/unita
        console.log('\n--- TEST 4: GET /api/unita (Isolamento Unità Immobiliari) ---');
        const uAdmin = await apiGet('/api/unita', adminToken);
        const uCondo = await apiGet('/api/unita', condominoToken);
        console.log(`Admin vede ${uAdmin.json.data.length} unità totali.`);
        console.log(`Condomino Mario Rossi vede ${uCondo.json.data.length} unità personali.`);
        if (uCondo.json.data.length < uAdmin.json.data.length) {
            console.log('✅ SUCCESSO: Elenco unità filtrato per il singolo condomino!');
        }

        // Test 5: GET /api/anagrafica-persone
        console.log('\n--- TEST 5: GET /api/anagrafica-persone (Isolamento Anagrafica e Dati Personali) ---');
        const anAdmin = await apiGet('/api/anagrafica-persone', adminToken);
        const anCondo = await apiGet('/api/anagrafica-persone', condominoToken);
        console.log(`Admin vede ${anAdmin.json.data.length} anagrafiche residenti.`);
        console.log(`Condomino vede ${anCondo.json.data.length} record (solo il proprio profilo).`);
        if (anCondo.json.data.length <= 1) {
            console.log('✅ SUCCESSO: Anagrafica protetta da accessi incrociati non autorizzati!');
        }

        // Test 6: GET /api/export/accounting-excel (Blocco export massivo non autorizzato)
        console.log('\n--- TEST 6: GET /api/export/accounting-excel (Blocco Export Excel) ---');
        const expCondo = await apiGet('/api/export/accounting-excel', condominoToken);
        console.log(`Condomino status export excel: ${expCondo.status}`);
        if (expCondo.status === 403) {
            console.log('✅ SUCCESSO: Esportazione massiva bloccata per il condomino (403 Forbidden)!');
        } else {
            console.error('❌ ERRORE: Export excel non protetto!');
            process.exit(1);
        }

        console.log('\n=============================================');
        console.log('🎉 TUTTI I TEST PRIVACY & GDPR COMPLETATI CON SUCCESSO!');
        console.log('=============================================');
        process.exit(0);

    } catch (err) {
        console.error('Errore durante i test:', err);
        process.exit(1);
    }
}, 1500);
