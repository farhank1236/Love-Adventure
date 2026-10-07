'use strict';

// Capture the real selection and gameplay render paths for visual review.
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

(async () => {
    const output = path.resolve(process.env.QA_OUTPUT || path.join(__dirname, '..', 'docs', 'qa'));
    fs.mkdirSync(output, { recursive: true });
    const browser = await chromium.launch({
        ...(process.env.BROWSER_EXECUTABLE ? { executablePath: process.env.BROWSER_EXECUTABLE } : {}),
        args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader']
    });
    const page = await browser.newPage({ viewport: { width: 1440, height: 1080 }, deviceScaleFactor: 1 });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    if (process.env.QA_OFFLINE === '1') await page.route('https://**/*', route => route.abort());
    try {
        await page.goto(process.env.GAME_URL || 'http://127.0.0.1:8000', { waitUntil: 'load' });
        await page.waitForFunction(() => window.HeroSystem && window.WarriorCombat);
        await page.evaluate(() => { startNewGameFlow(); selectÆthelosHero('female'); });
        await page.waitForFunction(() => Object.values(HeroSystem.heroes).every(hero => {
            const canvas = document.getElementById(hero.id + 'Preview');
            return canvas.dataset.heroId === hero.id && canvas.dataset.revision === hero.model.revision;
        }), null, { timeout: 60000 });
        if (process.env.QA_OFFLINE !== '1') {
            await page.waitForFunction(() => getComputedStyle(document.querySelector('#characterScreen .grid')).display === 'grid', null, { timeout: 30000 });
            await page.evaluate(() => document.fonts.ready);
        }
        const previews = await page.evaluate(() => Object.values(HeroSystem.heroes).map(hero => {
            const canvas = document.getElementById(hero.id + 'Preview');
            const pixels = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
            let count = 0, left = canvas.width, right = -1, top = canvas.height, bottom = -1;
            for (let y = 0; y < canvas.height; y++) for (let x = 0; x < canvas.width; x++) {
                if (pixels[(y * canvas.width + x) * 4 + 3] <= 32) continue;
                count++; left = Math.min(left, x); right = Math.max(right, x);
                top = Math.min(top, y); bottom = Math.max(bottom, y);
            }
            return { id: hero.id, count, left, right, top, bottom, width: canvas.width, height: canvas.height };
        }));
        for (const preview of previews) {
            assert.ok(preview.count > 1000, `${preview.id} must be visible in the selection preview`);
            assert.ok(preview.left > 0 && preview.right < preview.width - 1 && preview.top > 0 && preview.bottom < preview.height - 1, `${preview.id} selection preview must not crop the model`);
        }
        await page.locator('#characterScreen').screenshot({ path: path.join(output, 'hero-selection.png'), animations: 'disabled' });

        for (const gender of ['female', 'male']) {
            await page.evaluate(async gender => {
                startNewGameFlow(); selectÆthelosHero(gender); await beginSelectedCharacter();
                paused = true; Object.keys(keys).forEach(key => keys[key] = false);
                birds = []; shots = []; projs = []; particles = []; clashBursts = [];
                archers.forEach(enemy => enemy.dead = true); gates.forEach(enemy => enemy.dead = true);
                boss.active = false; boss.dead = true; boss.swords = []; bossDefeated = false;
                birdTimer = 99999; arena = null; camX = 0;
                heroPlayer.x = 420; heroPlayer.y = 412; heroPlayer.vx = heroPlayer.vy = 0;
                heroPlayer.isGrounded = true; heroPlayer.isMoving = false; heroPlayer.facing = 'right';
                heroPlayer.hitReaction = 0; invuln = 0; heroHealth = HeroSystem.resolve(gender).health.max;
                WarriorCombat.reset(); updateHealthHUD(); renderCanvas();
            }, gender);
            const state = await page.evaluate(gender => ({
                id: heroPlayer.data.id, expectedId: HeroSystem.resolve(gender).id,
                revision: WarriorCombat.rig.revision, expectedRevision: HeroSystem.resolve(gender).model.revision,
                grounded: heroPlayer.isGrounded, health: heroHealth,
                canvas: { width: canvas.width, height: canvas.height },
                body: { x: heroPlayer.x - camX, ground: heroPlayer.y + 18 },
                visible: !!WarriorCombat.rig.guardGeometry
            }), gender);
            assert.equal(state.id, state.expectedId);
            assert.equal(state.revision, state.expectedRevision);
            assert.ok(state.grounded && state.health === 100 && state.visible, `${gender} must render safely with its full health bar`);
            assert.ok(state.body.x > 100 && state.body.x < state.canvas.width - 100 && state.body.ground < state.canvas.height - 20, `${gender} must fit inside the gameplay canvas`);
            await page.locator('#gameCanvas').screenshot({ path: path.join(output, `${gender}-gameplay.png`), animations: 'disabled' });
        }
        assert.deepEqual(errors, [], 'Screenshots must have no uncaught browser JavaScript errors');
        console.log(JSON.stringify({ output, previews, screenshots: ['hero-selection.png', 'female-gameplay.png', 'male-gameplay.png'], errors }, null, 2));
    } finally {
        await browser.close();
    }
})().catch(error => { console.error(error); process.exitCode = 1; });
