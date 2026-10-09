const puppeteer = require('puppeteer');

(async () => {
    const browser = await puppeteer.launch();
    const page = await browser.newPage();
    
    page.on('console', msg => console.log('BROWSER LOG:', msg.text()));

    await page.goto('http://127.0.0.1:3000/login.html');
    await page.evaluate(() => { fillAndLogin('admin@condominio.it', 'AdminPassword123!'); });
    await page.waitForNavigation();
    
    await page.evaluate(() => { switchTab('assemblies'); });
    await new Promise(r => setTimeout(r, 1000));
    
    // Check if the log is there
    const html = await page.evaluate(() => document.getElementById('assemblies-log-container').innerHTML);
    console.log('Log HTML:', html.substring(0, 150));
    
    await browser.close();
})();
