const puppeteer = require('puppeteer');

(async () => {
    const browser = await puppeteer.launch();
    const page = await browser.newPage();
    
    page.on('response', response => {
        if (response.status() === 400) {
            console.log('400 BAD REQUEST:', response.url());
        }
    });

    await page.goto('http://127.0.0.1:3000/login.html');
    await page.evaluate(() => {
        fillAndLogin('admin@condominio.it', 'AdminPassword123!');
    });
    
    await page.waitForNavigation();
    
    await page.evaluate(() => {
        switchTab('assemblies');
    });
    
    await new Promise(r => setTimeout(r, 1000));
    await browser.close();
})();
