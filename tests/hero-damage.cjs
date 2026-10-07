'use strict';

// Exercise real enemy collision paths in both stages and both approved rigs.
const assert = require('node:assert/strict');
const { chromium } = require('playwright');

(async () => {
    const browser = await chromium.launch({
        ...(process.env.BROWSER_EXECUTABLE ? { executablePath: process.env.BROWSER_EXECUTABLE } : {}),
        headless: true,
        args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader']
    });
    const page = await browser.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.route('https://**/*', route => route.abort());
    try {
        await page.goto(process.env.GAME_URL || 'http://127.0.0.1:8000', { waitUntil: 'load' });
        const result = await page.evaluate(async () => {
            let checks = 0;
            const check = (ok, message) => { if (!ok) throw Error(message); checks++; };
            const hp = () => Number(document.getElementById('hudHealth').innerText);
            function isolate() {
                paused = true;
                Object.keys(keys).forEach(key => keys[key] = false);
                heroGuard = 0;
                birds = []; archers = []; shots = []; projs = [];
                gates.forEach(gate => gate.dead = true);
                boss.dead = true; boss.active = false; boss.swords = []; bossDefeated = true;
                arena = null; checkpoint = 60; camX = 500; birdTimer = 99999;
                heroPlayer.x = 900; heroPlayer.y = 412;
                heroPlayer.vx = heroPlayer.vy = 0; heroPlayer.isGrounded = true;
                heroPlayer.facing = 'right'; invuln = stage2DamageCooldown = 0;
                heroHealth = 100; gameOver = false; gameRunning = true;
                document.getElementById('gameOverModal').classList.add('hidden');
                WarriorCombat.reset(); updateHealthHUD();
            }
            for (const gender of ['male', 'female']) {
                startNewGameFlow(); selectÆthelosHero(gender); await beginSelectedCharacter();
                isolate();
                const marker = { x: 1200, y: 350, k: 'arrow', vx: 0, vy: 0, r: 6, age: 0 };
                const bird = { x: 1300, y: 100, vx: 0, vy: 0, age: 0 };
                const blade = { x: 1600, y: 350, s: 'fly', vx: 0, vy: 0 };
                const encounter = { type: 'boss', x: 1300 };
                shots = [marker]; birds = [bird]; boss.swords = [blade];
                arena = encounter;
                heroPlayer.vx = 2; heroPlayer.vy = -1;
                kill({ x: 890, y: 412 });
                check(heroHealth === 75 && hp() === 75 && document.getElementById('hudHealthBar').style.width === '75%', gender + ': normal hit updates the existing health bar');
                check(heroPlayer.x === 900 && heroPlayer.y === 412 && heroPlayer.vx === 2 && heroPlayer.vy === -1, gender + ': hit preserves position and movement');
                check(camX === 500 && checkpoint === 60 && arena === encounter && shots[0] === marker && birds[0] === bird && boss.swords[0] === blade, gender + ': hit keeps camera and encounter state');
                check(heroPlayer.hitReaction === 12 && heroPlayer.hitReactionDirection === 1 && invuln === 45, gender + ': brief local recoil and immunity begin');
                kill({ x: 890, y: 412 });
                check(heroHealth === 75, gender + ': repeated contact during immunity does not drain HP');
                heroPlayer.hitReaction = 0; WarriorCombat.pose();
                const rig = WarriorCombat.rig;
                const spine = rig.byName.Spine.quaternion.clone(), chest = rig.byName.Chest.quaternion.clone();
                heroPlayer.hitReaction = 6; WarriorCombat.pose();
                check(spine.angleTo(rig.byName.Spine.quaternion) > .05 && chest.angleTo(rig.byName.Chest.quaternion) > .05, gender + ': hit visibly recoils the existing 3D body');
                check(rig.byName.Sword.getWorldPosition(new THREE.Vector3()).distanceTo(rig.byName.RHand.getWorldPosition(new THREE.Vector3())) < 1e-6, gender + ': recoil keeps the sword attached to its hand');

                for (const kind of ['arrow', 'laser', 'wave', 'boss-sword', 'bird', 'archer-body', 'boss-body']) {
                    isolate();
                    if (kind === 'boss-sword') {
                        boss.dead = false; boss.active = true; bossDefeated = false;
                        boss.bx = 3000; boss.st = 'cool'; boss.t = boss.proximityTimer = 1000;
                        boss.swords = [{ x: 900, y: 412, s: 'fly', vx: 0, vy: 0 }];
                    } else if (kind === 'bird') {
                        birds = [{ x: 900, y: 412, vx: 0, vy: 0, age: 0 }];
                    } else if (kind === 'archer-body') {
                        archers = [{ x: 900, y: 412, hp: 10, max: 10, timer: 1000, dead: false }];
                    } else if (kind === 'boss-body') {
                        boss.dead = false; boss.active = true; bossDefeated = false;
                        boss.x = boss.bx = 920; boss.y = 412;
                        boss.st = 'cool'; boss.t = boss.proximityTimer = 1000;
                    } else {
                        shots = [{ k: kind, x: 900, y: 412, vx: 0, vy: 0, r: 8, age: 0 }];
                    }
                    updatePhysics();
                    check(heroHealth === 75 && heroPlayer.x === 900 && heroPlayer.y === 412, gender + ': ' + kind + ' collision deals HP damage in place');
                    check(gameRunning && !gameOver, gender + ': nonlethal ' + kind + ' hit keeps gameplay running');
                }
                isolate();
                keys.attack = true; updatePhysics(); keys.attack = false;
                const combo = WarriorCombat.snapshot().combo;
                check(!!combo, gender + ': attack starts before recoil check');
                kill({ x: 890, y: 412 });
                check(WarriorCombat.snapshot().combo?.index === combo.index, gender + ': hit does not reset an ongoing combo');
                updatePhysics();
                check(WarriorCombat.snapshot().combo?.time > combo.time && heroPlayer.hitReaction === 11, gender + ': combat and recoil advance after a hit');

                isolate();
                kill({ x: 890, y: 412 });
                for (let tick = 0; tick < 45; tick++) updatePhysics();
                check(heroPlayer.hitReaction === 0 && invuln === 0, gender + ': recoil and immunity expire');
                kill({ x: 890, y: 412 });
                check(heroHealth === 50 && heroPlayer.x === 900, gender + ': damage resumes after immunity without checkpoint movement');

                isolate(); heroHealth = 25;
                kill({ x: 890, y: 412 });
                check(heroHealth === 0 && hp() === 0 && gameOver && !gameRunning, gender + ': actual zero HP stops gameplay');
                check(!document.getElementById('gameOverModal').classList.contains('hidden') && heroPlayer.x === 900 && heroPlayer.y === 412, gender + ': defeat opens game over at the defeat location');

                isolate(); heroPlayer.y = canvas.height + 100; checkpoint = 700;
                recoverHeroFromFall();
                check(heroHealth === 75 && heroPlayer.x === 700 && heroPlayer.y === 350 && gameRunning, gender + ': genuine fall recovers at the checkpoint');

                stageNumber = 2; initStage2(); isolate(); stage2.trees = []; stage2.cats = [];
                heroPlayer.x = 1500; heroPlayer.y = 1000;
                stage2.monsters = [{ x: 1520, y: 1000, hp: 10, dead: false }];
                updatePhysics();
                check(heroHealth === 92 && hp() === 92 && heroPlayer.x === 1500 && heroPlayer.y === 1000, gender + ': Stage 2 monster contact takes HP without spawn movement');
                check(heroPlayer.hitReaction === 12 && stage2DamageCooldown === 45, gender + ': Stage 2 uses the same brief reaction and cooldown');
                damageStage2Player(10, stage2.monsters[0]);
                check(heroHealth === 92, gender + ': Stage 2 repeated contact respects cooldown');
                stage2.monsters = []; stage2DamageCooldown = 0; heroPlayer.hitReaction = 0;
                stage2.cats = [{ x: 1520, y: 1000, baseX: 1520, baseY: 1000, t: 0, hp: 10, dead: false }];
                updatePhysics();
                check(heroHealth === 82 && heroPlayer.x === 1500 && heroPlayer.y === 1000, gender + ': Stage 2 cat contact also stays in place');
                stage2DamageCooldown = 0; heroHealth = 8;
                damageStage2Player(8, stage2.cats[0]);
                check(heroHealth === 0 && gameOver && !gameRunning && heroPlayer.x === 1500 && heroPlayer.y === 1000, gender + ': Stage 2 actual defeat opens game over without respawning');

                initStage2(); isolate(); stage2.trees = []; stage2.cats = []; stage2.monsters = [];
                keys.jump = true;
                for (let tick = 0; tick < 12; tick++) updatePhysics();
                keys.jump = false; keys.attack = true; updatePhysics(); keys.attack = false;
                check(WarriorCombat.snapshot().jumpZ > 0 && !!WarriorCombat.snapshot().combo, gender + ': airborne combo is active before lethal Stage 2 damage');
                heroHealth = 8; stage2DamageCooldown = 0;
                damageStage2Player(8, { x: heroPlayer.x - 100, y: heroPlayer.y });
                check(gameOver && !gameRunning && hp() === 0, gender + ': airborne combo can receive a lethal rear attack');
                restartLevel();
                const restarted = WarriorCombat.snapshot();
                check(heroHealth === 100 && hp() === 100 && document.getElementById('hudHealthBar').style.width === '100%', gender + ': Stage 2 restart restores full visible health');
                check(restarted.jumpZ === 0 && restarted.combo === null && heroPlayer.jump3D === 0, gender + ': restart clears the old jump and combo');
                check(heroPlayer.x === 180 && heroPlayer.y === 180 && heroPlayer.vx === 0 && heroPlayer.vy === 0 && heroPlayer.hitReaction === 0 && invuln === 0 && stage2DamageCooldown === 0, gender + ': restart resets spawn movement, recoil and damage cooldown');
                check(stageNumber === 2 && !!stage2 && gameRunning && !gameOver && !paused && document.getElementById('gameOverModal').classList.contains('hidden'), gender + ': restart resumes the selected hero in Stage 2');
                const restartTime = levelTimeSeconds;
                await new Promise(resolve => setTimeout(resolve, 1250));
                paused = true;
                check(levelTimeSeconds > restartTime, gender + ': adventure timer resumes after actual defeat and restart');
                stage2 = null;
            }
            return checks;
        });
        assert.deepEqual(errors, [], 'Browser JavaScript errors');
        console.log(`${result} hero damage checks passed`);
    } finally {
        await browser.close();
    }
})().catch(error => { console.error(error); process.exitCode = 1; });
