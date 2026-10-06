'use strict';
const { chromium } = require('playwright');
(async () => {
    const browser = await chromium.launch({
        ...(process.env.BROWSER_EXECUTABLE ? { executablePath: process.env.BROWSER_EXECUTABLE } : {}),
        args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader']
    });
    const page = await browser.newPage({ viewport: { width: 1200, height: 900 } });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    try {
        await page.goto((process.env.GAME_URL || 'http://127.0.0.1:8000') + '/character-preview.html');
        await page.waitForFunction(() => window.previewReady, null, { timeout: 60000 });
        await page.click('#pause');
        const clips = ['Sprint', 'Jump', 'Fall', 'Land', 'Stop', 'Turn', 'Attack1', 'Attack2', 'Attack3', 'Attack4', 'Attack5', 'Combo'];
        for (const clip of clips) {
            await page.click(`[data-clip="${clip}"]`);
            await page.locator('#position').fill('600');
            await page.locator('#position').dispatchEvent('input');
            if (!(await page.locator('#status').textContent()).startsWith(clip)) throw Error('Wrong clip: ' + clip);
        }
        await page.setViewportSize({ width: 390, height: 844 });
        if (await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)) throw Error('Mobile layout overflows');
        if (errors.length) throw Error(errors.join('; '));
        console.log('12 preview clips, scrub controls and mobile layout passed');
    } finally {
        await browser.close();
    }
})().catch(error => { console.error(error); process.exitCode = 1; });
