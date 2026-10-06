'use strict';
const { chromium } = require('playwright');
const approvedDirections = require('./approved-sword-directions.json');
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
        const result = await page.evaluate(async approved => {
            let checks = 0;
            const check = (ok, label) => { if (!ok) throw Error(label); checks++; };
            const range = values => Math.max(...values) - Math.min(...values);
            const point = (rig, name) => rig.byName[name].getWorldPosition(new THREE.Vector3());
            const rigs = {
                female: createWarriorAsset(THREE, FEMALE_WARRIOR_MODEL, { loadTexture: false }),
                male: createMaleWarriorAsset(THREE, WARRIOR_MODEL, { loadTexture: false })
            };
            for (const [gender, rig] of Object.entries(rigs)) {
                const scale = rig.motionScale;
                const pulses = [];
                for (let cut = 1; cut <= 5; cut++) {
                    const clip = 'Attack' + cut, heights = [], lateral = [], forward = [];
                    const hipYaw = [], spinePitch = [], chestRoll = [];
                    for (let i = 0; i <= 30; i++) {
                        rig.sample(clip, rig.channels[clip].duration * i / 30);
                        heights.push(rig.byName.Hips.position.y);
                        lateral.push(rig.byName.Hips.position.x);
                        forward.push(rig.byName.Hips.position.z);
                        hipYaw.push(new THREE.Euler().setFromQuaternion(rig.byName.Hips.quaternion, 'YXZ').y);
                        spinePitch.push(new THREE.Euler().setFromQuaternion(rig.byName.Spine.quaternion).x);
                        chestRoll.push(new THREE.Euler().setFromQuaternion(rig.byName.Chest.quaternion).z);
                        check(Math.abs(rig.byName.Root.position.y) < 1e-6, gender + ' body compression must not become an attack jump');
                    }
                    pulses.push(range(heights));
                    check(range(heights) > .014 * scale, gender + ' visible down/up rhythm in ' + clip);
                    check(range(lateral) > .025 * scale, gender + ' visible transfer toward the supporting leg in ' + clip);
                    check(range(forward) > .008 * scale, gender + ' rear-to-front hip transfer in ' + clip);
                    check(range(hipYaw) > .35, gender + ' pelvis actively rotates in ' + clip);
                    check(range(spinePitch) > .025 && range(chestRoll) > .045, gender + ' torso bends and shoulders change level in ' + clip);
                    rig.sample(clip, .10); const freeArm = rig.byName.LElbow.quaternion.clone();
                    rig.sample(clip, rig.channels[clip].duration * .70);
                    check(freeArm.angleTo(rig.byName.LElbow.quaternion) > .10, gender + ' free arm counterbalances ' + clip);
                }
                check(pulses[4] > pulses[0] * 1.8, gender + ' finisher has the strongest compression and rise');
                // Forefoot contact stays fixed while the heel pivots around it.
                for (const [foot, a, b] of [['LFoot', .06, .60], ['RFoot', .38, .62], ['LFoot', 1.08, 1.25], ['RFoot', 1.80, 2.06], ['LFoot', 2.58, 2.88], ['RFoot', 3.48, 3.78]]) {
                    rig.sample('Combo', a); const planted = point(rig, foot), rotation = rig.byName[foot].getWorldQuaternion(new THREE.Quaternion());
                    let drift = 0, pivot = 0;
                    for (let i = 0; i <= 12; i++) {
                        rig.sample('Combo', a + (b - a) * i / 12);
                        drift = Math.max(drift, planted.distanceTo(point(rig, foot)));
                        pivot = Math.max(pivot, rotation.angleTo(rig.byName[foot].getWorldQuaternion(new THREE.Quaternion())));
                    }
                    check(drift < .0025, gender + ' foot contact remains planted: ' + foot + ' at ' + a + '; drift=' + drift);
                    check(pivot > .02, gender + ' heel pivots without locking the knee: ' + foot + ' at ' + a);
                }
                rig.sample('Combo', 3.24);
                for (const side of ['R', 'L']) {
                    const upper = point(rig, side + 'Knee').sub(point(rig, side + 'Hip'));
                    const lower = point(rig, side + 'Ankle').sub(point(rig, side + 'Knee'));
                    const bend = upper.angleTo(lower);
                    check(bend > .30 && bend < 1.9, gender + ' finisher compresses both knees within a balanced range');
                }
                rig.sample('Combo', 2.38);
                const head = new THREE.Euler().setFromQuaternion(rig.byName.Head.getWorldQuaternion(new THREE.Quaternion()), 'YXZ');
                const chest = new THREE.Euler().setFromQuaternion(rig.byName.Chest.getWorldQuaternion(new THREE.Quaternion()), 'YXZ');
                check(Math.abs(head.y) < Math.abs(chest.y) * .65, gender + ' head tracks the attack direction while the torso twists');
                for (const { time, direction } of approved) {
                    rig.sample('Combo', time);
                    const actual = point(rig, 'Sword');
                    actual.copy(rig.tip.getWorldPosition(new THREE.Vector3())).sub(rig.hilt.getWorldPosition(new THREE.Vector3())).normalize();
                    check(actual.angleTo(new THREE.Vector3(...direction)) < .015, gender + ' approved blade rotation is preserved at ' + time);
                }
            }
            startNewGameFlow(); setNewGender('female'); await beginSelectedCharacter(); paused = true;
            function setup(gender) {
                playerGender = gender; selectedRole = 'warrior'; startGame(); paused = true;
                Object.keys(keys).forEach(k => keys[k] = false); birds = []; archers = []; shots = [];
                gates.forEach(g => g.dead = true); arena = null; boss.active = false; bossDefeated = true; boss.swords = []; birdTimer = 9999;
                heroPlayer.x = 100; heroPlayer.y = 412; heroPlayer.vy = 0; heroPlayer.isGrounded = true; heroPlayer.facing = 'right';
            }
            for (const gender of ['female', 'male']) {
                setup(gender); const standX = heroPlayer.x; keys.attack = true; updatePhysics(); keys.attack = false;
                for (let i = 1; i < 12; i++) updatePhysics(); const standingTravel = heroPlayer.x - standX;
                setup(gender); keys.right = keys.run = true; for (let i = 0; i < 25; i++) updatePhysics();
                const runningX = heroPlayer.x; keys.attack = true; updatePhysics(); keys.attack = false;
                for (let i = 1; i < 12; i++) updatePhysics();
                check(WarriorCombat.snapshot().combo?.entryVelocity > 6, gender + ' running attack captures forward momentum');
                check(heroPlayer.x - runningX > standingTravel + 15, gender + ' running momentum flows into the opening attack step');
                check(!heroPlayer.isRunning && heroPlayer.vx === 0, gender + ' attack footwork still controls movement during the strike');
            }
            return checks;
        }, approvedDirections);
        if (errors.length) throw Error(errors.join('; '));
        console.log(result + ' body rhythm, weight transfer, pivot, blade preservation and running attack checks passed');
    } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
