const puppeteer = require('puppeteer');

(async () => {
    const browser = await puppeteer.launch();
    const page = await browser.newPage();
    
    page.on('console', msg => console.log('BROWSER LOG:', msg.text()));

    await page.goto('http://127.0.0.1:3000/login.html');
    await page.evaluate(() => { fillAndLogin('mario.rossi@example.com', 'Password123!'); });
    await page.waitForNavigation();
    
    await new Promise(r => setTimeout(r, 1500));
    
    const isVisible = await page.evaluate(() => {
        const el = document.getElementById('modal-privacy');
        return el && !el.classList.contains('hidden');
    });
    
    console.log('Privacy Modal Visible:', isVisible);
    
    if (isVisible) {
        // Accetta privacy
        await page.evaluate(() => {
            document.getElementById('privacy-checkbox').click();
            setTimeout(() => {
                document.getElementById('btn-accept-privacy').click();
            }, 500);
        });
        await new Promise(r => setTimeout(r, 1500));
        const isHidden = await page.evaluate(() => {
            const el = document.getElementById('modal-privacy');
            return el.classList.contains('hidden');
        });
        console.log('Privacy Modal Hidden after accept:', isHidden);
    }
    
    await browser.close();
})();
