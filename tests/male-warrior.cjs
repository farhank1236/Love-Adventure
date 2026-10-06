'use strict';
const { chromium } = require('playwright');
(async () => {
    const browser = await chromium.launch({
        ...(process.env.BROWSER_EXECUTABLE ? { executablePath: process.env.BROWSER_EXECUTABLE } : {}),
        args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader']
    });
    const page = await browser.newPage();
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.route('https://**/*', r => r.abort());
    try {
        await page.goto(process.env.GAME_URL || 'http://127.0.0.1:8000');
        const checks = await page.evaluate(async () => {
            let checks = 0;
            const check = (ok, message) => { if (!ok) throw Error(message); checks++; };
            const male = createMaleWarriorAsset(THREE, WARRIOR_MODEL, { loadTexture: false });
            const female = createWarriorAsset(THREE, FEMALE_WARRIOR_MODEL, { loadTexture: false });
            check(male.attackStarts.length===5&&female.attackStarts.length===6, 'Five male and six female full-body attacks');
            check(Object.keys(male.channels).every(n=>female.channels[n]),'Both warriors retain all locomotion and common attacks');
            const maleGrip = male.byName.RHand.position.clone();
            const vector = rig => rig.tip.getWorldPosition(new THREE.Vector3()).sub(rig.hilt.getWorldPosition(new THREE.Vector3())).normalize();
            for (const clip of Object.keys(male.channels)) {
                check(clip==='Combo'||male.channels[clip].duration === female.channels[clip].duration, 'Matching clip timing: ' + clip);
                for (let i = 0; i <= 12; i++) {
                    const t = male.channels[clip].duration * i / 12;
                    male.sample(clip, t); female.sample(clip, t);
                    check(male.bones.every(b => b.quaternion.toArray().every(Number.isFinite) && Math.abs(b.quaternion.length() - 1) < 1e-5), 'Finite, normalized male rotations: ' + clip);
                    check(male.byName.RHand.position.distanceTo(maleGrip) < 1e-6, 'Male hand does not slide: ' + clip);
                    check(male.byName.Sword.getWorldPosition(new THREE.Vector3()).distanceTo(male.byName.RHand.getWorldPosition(new THREE.Vector3())) < 1e-6, 'Male sword pivots at the grip: ' + clip);
                    check(vector(male).angleTo(vector(female)) < .003, 'Male blade follows the approved cutting direction: ' + clip);
                }
                if (['Walk', 'Run', 'Sprint'].includes(clip)) {
                    male.sample(clip, 0); const first = male.bones.map(b => ({ q: b.quaternion.clone(), p: b.position.clone() }));
                    male.sample(clip, male.channels[clip].duration);
                    check(male.bones.every((b, i) => b.quaternion.angleTo(first[i].q) < 1e-5 && b.position.distanceTo(first[i].p) < 1e-6), 'Male locomotion has a continuous loop: ' + clip);
                }
            }
            for (let i = 1; i < 5; i++) {
                male.sample('Attack' + i, male.channels['Attack' + i].duration);
                const end = male.bones.map(b => ({ q: b.quaternion.clone(), p: b.position.clone() }));
                male.sample('Attack' + (i + 1), 0);
                check(male.bones.every((b, j) => b.quaternion.angleTo(end[j].q) < 1e-5 && b.position.distanceTo(end[j].p) < 1e-5), 'Male cuts flow through a shared boundary');
            }
            male.sample('Combo', .06); const planted = male.byName.RFoot.getWorldPosition(new THREE.Vector3());
            male.sample('Combo', .60);
            check(planted.distanceTo(male.byName.RFoot.getWorldPosition(new THREE.Vector3())) < .002, 'Male supporting foot stays planted');
            male.sample('Combo', 2.70); check(male.mana.visible && male.aura.visible, 'Male finisher has blade and body energy');
            male.sample('Idle', 0); check(!male.mana.visible && !male.aura.visible, 'Male attack energy clears on idle');
            startNewGameFlow(); setNewGender('male'); await beginSelectedCharacter(); paused = true;
            function setup() {
                startGame(); paused = true; Object.keys(keys).forEach(k => keys[k] = false);
                birds = []; archers = []; shots = []; gates.forEach(g => g.dead = true);
                boss.active = false; bossDefeated = true; boss.swords = []; birdTimer = 9999;
                heroPlayer.x = 100; heroPlayer.y = 412; heroPlayer.vy = 0; heroPlayer.isGrounded = true; heroPlayer.facing = 'right'; invuln = 0;
            }
            setup(); check(WarriorCombat.cuts.length === 5, 'Male gameplay uses five cuts');
            const originalTargets = combatTargets;
            const target = { x: heroPlayer.x + 60, y: heroPlayer.y, hp: 10, flash: 0, dead: false };
            combatTargets = () => [{ o: target, k: 'monster' }];
            const originX = heroPlayer.x;
            for (let i = 0; i < 5; i++) { keys.attack = true; updatePhysics(); keys.attack = false; updatePhysics(); }
            for (let i = 0; i < 150; i++) { target.flash = 0; target.x = heroPlayer.x + 60; updatePhysics(); }
            check(target.hp === 4, 'Five male presses deliver five hits and a stronger finisher');
            check(Math.abs(heroPlayer.x - originX - 47.3) < .1, 'Male advancing combo travels the same gameplay distance');
            combatTargets = originalTargets;
            setup(); const low = { k: 'wave', x: heroPlayer.x + 4, y: heroPlayer.y + 16, vx: 0, vy: 0, r: 12, age: 0 };
            shots = [low]; keys.attack = true; updatePhysics();
            check(low.dead && lives === 4, 'Male sword interrupts low incoming attacks');
            setup(); initStage2(); paused = true; stage2.trees = []; stage2.monsters = []; stage2.cats = [];
            keys.right = keys.run = true; for (let i = 0; i < 25; i++) updatePhysics(); check(WarriorCombat.pose() === 'Run', 'Male running animation is assigned in gameplay');
            keys.sprint = true; for (let i = 0; i < 25; i++) updatePhysics(); check(WarriorCombat.pose() === 'Sprint' && heroPlayer.moveSpeed > 9, 'Male sprint is faster and has its own animation');
            keys.right = keys.run = keys.sprint = false; for (let i = 0; i < 30; i++) updatePhysics();
            keys.jump = true; updatePhysics(); check(WarriorCombat.pose() === 'Jump' && WarriorCombat.snapshot().jumpZ === 0, 'Male jump anticipates takeoff');
            keys.jump = false; const modes = new Set();
            for (let i = 0; i < 70; i++) { updatePhysics(); modes.add(WarriorCombat.pose()); }
            check(['Jump', 'Fall', 'Land', 'Idle'].every(n => modes.has(n)), 'Male jump passes through fall and landing');
            return checks;
        });
        if (errors.length) throw Error(errors.join('; '));
        console.log(checks + ' male retargeting, animation and gameplay checks passed');
    } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
