const puppeteer = require('puppeteer');

(async () => {
    const browser = await puppeteer.launch();
    const page = await browser.newPage();
    
    // Catch console errors
    page.on('console', msg => console.log('BROWSER LOG:', msg.text()));

    await page.goto('http://127.0.0.1:3000/login.html');
    await page.evaluate(() => {
        fillAndLogin('admin@condominio.it', 'AdminPassword123!');
    });
    
    await page.waitForNavigation();
    
    await page.evaluate(() => {
        switchTab('assemblies');
    });
    
    await new Promise(r => setTimeout(r, 1000));
    
    await page.evaluate(() => {
        openConvocazioneModal();
    });
    
    await new Promise(r => setTimeout(r, 500));
    
    const isVisible = await page.evaluate(() => {
        return !document.getElementById('convocazione-modal').classList.contains('hidden');
    });
    
    console.log('Modal is visible:', isVisible);
    
    await browser.close();
})();
