'use strict';

// Exercise the actual selection, loading, save and stage paths with isolated saves.
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const gameUrl = process.env.GAME_URL || 'http://127.0.0.1:8000';

(async () => {
    const browser = await chromium.launch({
        ...(process.env.BROWSER_EXECUTABLE ? { executablePath: process.env.BROWSER_EXECUTABLE } : {}),
        args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader']
    });
    let checks = 0;
    const check = (condition, message) => { assert.ok(condition, message); checks++; };
    const errors = [];
    const page = await browser.newPage({ viewport: { width: 1200, height: 900 } });
    page.on('pageerror', error => errors.push(error.message));
    await page.route('https://**/*', route => route.abort());
    try {
        await page.goto(gameUrl);
        await page.waitForFunction(() => window.HeroSystem && window.WarriorCombat);
        const definitions = await page.evaluate(() => {
            const entries = Object.values(HeroSystem.heroes);
            return {
                ids: entries.map(hero => hero.id),
                frozen: Object.isFrozen(HeroSystem.heroes) && entries.every(Object.isFrozen),
                aliases: ['male', 'female', 'm_jp', 'f_eg', 'male_warrior', 'female_warrior', { id: 'mage', gender: 'female' }].map(value => HeroSystem.resolve(value).gender),
                sprites: Object.keys(ART_SOURCES).filter(key => /^(male|female)_/.test(key)),
                legacyFields: entries.flatMap(hero => Object.keys(HeroSystem.avatar(hero.id)).filter(key => ['skin', 'hair', 'hairStyle', 'hijab', 'outfit', 'outfitDark'].includes(key)))
            };
        });
        check(definitions.ids.length === 2 && new Set(definitions.ids).size === 2, 'Only two canonical playable hero definitions');
        check(definitions.frozen, 'Hero definitions are immutable');
        assert.deepEqual(definitions.aliases, ['male', 'female', 'male', 'female', 'male', 'female', 'female']); checks++;
        check(definitions.sprites.length === 0 && definitions.legacyFields.length === 0, 'Playable warriors have no old sprite or chibi configuration');

        for (const gender of ['female', 'male']) {
            console.log(`Checking ${gender} selection, gameplay and saves…`);
            await page.evaluate(gender => { startNewGameFlow(); selectÆthelosHero(gender); }, gender);
            const card = page.locator(gender === 'male' ? '#heroCardMale' : '#heroCardFemale');
            check(await card.getAttribute('aria-pressed') === 'true', `Selection marks the ${gender} warrior`);
            await page.waitForFunction(gender => {
                const hero = HeroSystem.resolve(gender), canvas = document.getElementById(hero.id + 'Preview');
                return canvas.dataset.heroId === hero.id && canvas.dataset.revision === hero.model.revision;
            }, gender, { timeout: 60000 });
            check(await page.evaluate(gender => {
                const canvas = document.getElementById(HeroSystem.resolve(gender).id + 'Preview');
                const pixels = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
                let visible = 0;
                for (let i = 3; i < pixels.length; i += 4) if (pixels[i] > 32) visible++;
                return visible > 1000;
            }, gender), `${gender} selection displays the approved rendered 3D model`);
            await page.evaluate(async () => { await beginSelectedCharacter(); paused = true; });
            const state = await page.evaluate(async gender => {
                const definition = HeroSystem.resolve(gender);
                const cachedRig = await HeroSystem.createRig(THREE, definition.id);
                renderCanvas();
                const canvas = document.createElement('canvas'); canvas.width = canvas.height = 512;
                const context = canvas.getContext('2d');
                drawChibi3D(context, 256, 350, heroPlayer.data, { facing: 'right', isActive: true });
                const pixels = context.getImageData(0, 0, 512, 512).data;
                let visible = 0;
                for (let i = 3; i < pixels.length; i += 4) if (pixels[i] > 80) visible++;
                return {
                    gameRunning, gender: playerGender, heroId: heroPlayer.data.id,
                    selectedId: selectedHeroAvatar.id, canonicalId: definition.id,
                    revision: WarriorCombat.rig.revision, expectedRevision: definition.model.revision,
                    sameRig: WarriorCombat.rig === cachedRig,
                    mesh: !!WarriorCombat.rig.mesh?.isSkinnedMesh,
                    animations: ['Idle', 'Walk', 'Run', 'Sprint', 'Jump', 'Fall', 'Land', 'Stop', 'Turn', 'Combo'].every(name => WarriorCombat.rig.channels[name]),
                    cuts: WarriorCombat.cuts.length,
                    guardGeometry: !!WarriorCombat.rig.guardGeometry,
                    visible: visible > 1000,
                    weapon, role: selectedRole
                };
            }, gender);
            check(state.gameRunning && state.gender === gender, `New Game starts the selected ${gender} warrior`);
            check(state.heroId === state.canonicalId && state.selectedId === state.canonicalId, `${gender} selection and spawn use the canonical identity`);
            check(state.sameRig && state.mesh && state.revision === state.expectedRevision, `${gender} gameplay uses the exact shared approved 3D rig`);
            check(state.visible, `${gender} approved 3D rig renders visibly in the gameplay drawing path`);
            check(state.animations && state.cuts === (gender === 'male' ? 5 : 6) && state.guardGeometry, `${gender} rig retains locomotion, combo and hand-held blade geometry`);
            check(state.weapon === 'sword' && state.role === 'warrior', `${gender} warrior uses the approved sword role`);

            const stageState = await page.evaluate(() => {
                const identity = heroPlayer.data.id;
                stageNumber = 2; initStage2(); paused = true;
                stage2.trees = []; stage2.monsters = []; stage2.cats = [];
                renderCanvas();
                const stageIdentity = heroPlayer.data.id;
                keys.jump = keys.attack = true;
                for (let i = 0; i < 12; i++) updatePhysics();
                Object.keys(keys).forEach(key => keys[key] = false);
                heroHealth = 0; updateHealthHUD(); gameOver = true; gameRunning = false;
                restartLevel(); paused = true;
                const combat = WarriorCombat.snapshot();
                return { identity, stageIdentity, restartIdentity: heroPlayer.data.id, stageNumber, health: heroHealth, running: gameRunning,
                    hudHealth: Number(document.getElementById('hudHealth').innerText),
                    hudBar: document.getElementById('hudHealthBar').style.width,
                    reset: combat.combo === null && combat.pendingCuts.length === 0 && combat.nextCut === 0 && combat.jumpZ === 0 && heroPlayer.jump3D === 0 };
            });
            check(stageState.identity === stageState.stageIdentity && stageState.identity === stageState.restartIdentity && stageState.stageNumber === 2 && stageState.health === 100 && stageState.running, `${gender} remains the same hero through Stage 2 and restart`);
            check(stageState.hudHealth === 100 && stageState.hudBar === '100%' && stageState.reset, `${gender} Stage 2 restart restores the health display and clears jump and combo state`);

            const saved = await page.evaluate(() => {
                ultimateCharge = 43; saveCurrentSlot(0);
                return loadSaveSlots()[0];
            });
            check(saved.heroId === state.canonicalId && saved.gender === gender && saved.weapon === 'sword' && saved.stageNumber === 2 && saved.ultimateCharge === 43, `${gender} save stores canonical hero identity and progress`);
            await page.evaluate(async () => { showMainMenu(); await loadSaveSlot(0); paused = true; });
            check(await page.evaluate(id => gameRunning && stageNumber === 2 && heroPlayer.data.id === id && ultimateCharge === 43 && selectedRole === 'warrior' && weapon === 'sword', state.canonicalId), `${gender} Continue loads the saved canonical rig and stage`);
        }

        console.log('Checking legacy save migration…');
        await page.evaluate(() => {
            writeSaveSlots([
                { avatarId: 'f_eg', gender: 'female', role: 'mage', heroName: 'Fatima', weapon: 'wand', stageNumber: 2, ultimateCharge: 61 },
                { avatarId: 'm_jp', gender: 'male', role: 'titan', heroName: 'Kenji', weapon: 'gun', stageNumber: 1, ultimateCharge: 27 },
                { heroId: 'female_archer', gender: 'female', role: 'archer', weapon: 'bow', stageNumber: 1, ultimateCharge: 9 }
            ]);
        });
        for (const [index, gender, stage, charge] of [[0, 'female', 2, 61], [1, 'male', 1, 27], [2, 'female', 1, 9]]) {
            const migrated = await page.evaluate(async index => {
                showMainMenu(); await loadSaveSlot(index); paused = true;
                const definition = HeroSystem.resolve(playerGender);
                return { id: heroPlayer.data.id, canonicalId: definition.id, gender: playerGender, stage: stageNumber, charge: ultimateCharge, role: selectedRole, weapon, revision: WarriorCombat.rig.revision, expectedRevision: definition.model.revision, storedId: loadSaveSlots()[index].heroId };
            }, index);
            check(migrated.gender === gender && migrated.id === migrated.canonicalId && migrated.storedId === migrated.canonicalId && migrated.revision === migrated.expectedRevision && migrated.role === 'warrior' && migrated.weapon === 'sword' && migrated.stage === stage && migrated.charge === charge, `Legacy save ${index + 1} migrates to the approved ${gender} warrior and preserves progress`);
        }
        check(errors.length === 0, `No browser JavaScript errors: ${errors.join('; ')}`);
        await page.close();

        const defaultPage = await browser.newPage();
        await defaultPage.route('https://**/*', route => route.abort());
        await defaultPage.addInitScript(() => localStorage.setItem('loveAdventureHeroGender', 'f_eg'));
        await defaultPage.goto(gameUrl);
        await defaultPage.waitForFunction(() => window.HeroSystem && window.WarriorCombat);
        check(await defaultPage.evaluate(() => {
            startNewGameFlow();
            return newGender === 'female' && selectedHeroAvatar.id === HeroSystem.resolve('female').id;
        }), 'Old persisted default selection resolves to the latest female warrior');
        await defaultPage.close();

        // A failed model must keep the game stopped, and a second attempt must work.
        console.log('Checking selected model failure and retry…');
        const failurePage = await browser.newPage();
        const failureErrors = [];
        failurePage.on('pageerror', error => failureErrors.push(error.message));
        await failurePage.route('https://**/*', route => route.abort());
        let failModel = true;
        let failedRequests = 0;
        await failurePage.route('**/assets/models/female-01.js*', route => {
            if (failModel) { failedRequests++; return route.abort(); }
            return route.continue();
        });
        await failurePage.goto(gameUrl);
        await failurePage.waitForFunction(() => window.HeroSystem && window.WarriorCombat);
        await failurePage.evaluate(async () => {
            startNewGameFlow(); selectÆthelosHero('female');
            try { await beginSelectedCharacter(); } catch (_) {}
        });
        check(failedRequests > 0, 'Failure coverage actually rejects the selected model asset');
        check(await failurePage.evaluate(() => !gameRunning && !document.querySelector('#characterScreen').classList.contains('hidden') && !document.querySelector('[onclick="beginSelectedCharacter()"]').disabled), 'Failed 3D load keeps selection usable without starting a fallback hero');
        failModel = false;
        await failurePage.evaluate(async () => { await beginSelectedCharacter(); paused = true; });
        check(await failurePage.evaluate(() => gameRunning && heroPlayer.data.id === HeroSystem.resolve('female').id && WarriorCombat.rig.revision === HeroSystem.resolve('female').model.revision), 'Retry starts the correct approved 3D hero');
        check(failureErrors.length === 0, `Failure and retry have no uncaught browser errors: ${failureErrors.join('; ')}`);
        await failurePage.close();

        console.log('Checking pending launch cancellation…');
        const cancellationPage = await browser.newPage();
        const cancellationErrors = [];
        cancellationPage.on('pageerror', error => cancellationErrors.push(error.message));
        await cancellationPage.route('https://**/*', route => route.abort());
        let releaseModel;
        const modelGate = new Promise(resolve => { releaseModel = resolve; });
        await cancellationPage.route('**/assets/models/female-01.js*', async route => {
            await modelGate;
            await route.continue();
        });
        await cancellationPage.goto(gameUrl);
        await cancellationPage.waitForFunction(() => window.HeroSystem && window.WarriorCombat);
        const heldRequest = cancellationPage.waitForRequest(request => request.url().includes('/assets/models/female-01.js'));
        await cancellationPage.evaluate(() => {
            startNewGameFlow(); selectÆthelosHero('female');
            window.pendingHeroLaunch = beginSelectedCharacter();
        });
        await heldRequest;
        await cancellationPage.evaluate(() => showMainMenu());
        releaseModel();
        await cancellationPage.evaluate(() => window.pendingHeroLaunch);
        check(await cancellationPage.evaluate(() => !gameRunning && !heroPlayer && !document.querySelector('#mainMenu').classList.contains('hidden') && document.querySelector('#gameScreen').classList.contains('hidden')), 'Leaving a pending model load keeps the menu open without spawning a hero');
        check(await cancellationPage.evaluate(async () => {
            startNewGameFlow(); selectÆthelosHero('female');
            const pending = beginSelectedCharacter();
            selectÆthelosHero('male');
            await pending;
            return !gameRunning && !heroPlayer && newGender === 'male' && !document.querySelector('#characterScreen').classList.contains('hidden');
        }), 'Changing selection during a pending Begin cancels the captured old hero');
        await cancellationPage.evaluate(async () => { await beginSelectedCharacter(); paused = true; });
        check(await cancellationPage.evaluate(() => gameRunning && heroPlayer.data.id === HeroSystem.resolve('male').id), 'A new Begin after cancellation starts the newly selected male warrior');
        check(cancellationErrors.length === 0, `Canceled launches have no uncaught browser errors: ${cancellationErrors.join('; ')}`);
        await cancellationPage.close();
        console.log(`${checks} hero identity, selection, 3D loading, save migration and stage checks passed`);
    } finally {
        await browser.close();
    }
})().catch(error => { console.error(error); process.exitCode = 1; });
