const { chromium } = require('playwright');
const fs = require('fs');

(async () => {
    try {
        console.log('Attempting to launch browser...');
        const browser = await chromium.launch({
            headless: true,
            args: ['--no-sandbox', '--disable-setuid-sandbox']
        });
        console.log('Browser launched successfully!');
        const page = await browser.newPage();
        console.log('Navigating to reddit login...');
        await page.goto('https://www.reddit.com/login', { waitUntil: 'networkidle', timeout: 60000 });

        console.log('Taking screenshot...');
        await page.screenshot({ path: 'reddit_login_diagnostic_2.png' });

        console.log('Saving HTML source...');
        const content = await page.content();
        fs.writeFileSync('reddit_login_source.html', content);
        console.log('HTML source saved to reddit_login_source.html');

        await browser.close();
        console.log('Test completed successfully!');
    } catch (error) {
        console.error('Diagnostic failed:');
        console.error(error);
        process.exit(1);
    }
})();
