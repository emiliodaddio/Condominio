const puppeteer = require('puppeteer');
const jwt = require('jsonwebtoken');

const JWT_SECRET = 'chiave_segreta_condominio_sicura_123!';
const user = { id: 5, nome: 'Eleonora', email: 'eleonorafinelli@virgilio.it', is_superadmin: 0, privacy_accepted: 1 };
const token = jwt.sign(user, JWT_SECRET, { expiresIn: '8h' });

(async () => {
    const browser = await puppeteer.launch();
    const page = await browser.newPage();
    
    page.on('console', msg => console.log('PAGE LOG:', msg.text()));
    
    await page.goto('http://127.0.0.1:3000/login.html');
    await page.evaluate((token, user) => {
        sessionStorage.setItem('condo_token', token);
        sessionStorage.setItem('condo_user', JSON.stringify(user));
    }, token, user);
    
    await page.goto('http://127.0.0.1:3000/index.html');
    await new Promise(r => setTimeout(r, 4000));
    
    const evalRes = await page.evaluate(async () => {
        try {
            const res = await fetch('/api/condominio', { headers: getAuthHeaders() });
            const data = await res.json();
            return {
                data: data,
                condoNomeInput: document.getElementById('condominio-nome').value,
                dashIndirizzo: document.getElementById('dash-condo-indirizzo').textContent,
                adminNome: document.getElementById('dash-admin-nome')?.textContent
            };
        } catch (e) {
            return { error: e.toString() };
        }
    });
    console.log("EVAL RES:", evalRes);
    
    await browser.close();
})();
