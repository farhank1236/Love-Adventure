"use strict";
// Real browser/model checks, plus controlled simulation ticks for reproducible collisions.
const { chromium } = require('playwright');
(async () => {
    const browser = await chromium.launch({
        ...(process.env.BROWSER_EXECUTABLE ? { executablePath: process.env.BROWSER_EXECUTABLE } : {}),
        headless: true, args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader']
    });
    const page = await browser.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    // These checks do not rely on optional CDN styling, fonts or icons.
    await page.route('https://**/*', route => route.abort());
    try {
        await page.addInitScript(() => localStorage.setItem('loveAdventureKeyBinds', JSON.stringify({jump:'ShiftLeft',attack:'Space'})));
        await page.goto(process.env.GAME_URL || 'http://127.0.0.1:8000', { waitUntil: 'load' });
        const modelChecks = await page.evaluate(async () => {
            let checks=0;
            const check=(ok,message)=>{if(!ok)throw Error(message);checks++};
            const rig=createWarriorAsset(THREE,FEMALE_WARRIOR_MODEL,{loadTexture:false});
            check(!!rig.channels.Run, 'Female warrior includes a distinct Run clip');
            const hand=rig.byName.RHand.position.clone();
            for(const name of Object.keys(rig.channels)){
                for(let i=0;i<=12;i++){
                    rig.sample(name,rig.channels[name].duration*i/12);
                    check(rig.byName.RHand.position.distanceTo(hand)<1e-6,'Grip must not slide during '+name);
                    check(rig.byName.Sword.quaternion.angleTo(rig.byName.RHand.quaternion)<1e-6,'Blade must not rotate independently during '+name);
                    check(rig.byName.Sword.getWorldPosition(new THREE.Vector3()).distanceTo(rig.byName.RHand.getWorldPosition(new THREE.Vector3()))<1e-6,'Sword stays at the hand in '+name);
                    const q=rig.byName.RElbow.quaternion;
                    check(Math.abs(q.y)<1e-6&&Math.abs(q.z)<1e-6&&2*Math.acos(Math.min(1,Math.abs(q.w)))<1.6,'Elbow must flex as a bounded hinge in '+name);
                }
            }
            rig.sample('Combo',.28);const raised=rig.byName.RShoulder.quaternion.clone();
            rig.sample('Combo',.56);check(raised.angleTo(rig.byName.RShoulder.quaternion)>1,'Upper arm drives the downward cut');
            rig.sample('Idle',0);const idleHand=rig.byName.RHand.position.clone();
            rig.sample('Combo',1.36);rig.sample('Walk',.2);
            check(rig.byName.RHand.position.distanceTo(idleHand)<1e-6,'Attack transform cannot leak into walking');
            rig.sample('Run',0);const initial=rig.bones.map(b=>({q:b.quaternion.clone(),p:b.position.clone()}));
            rig.sample('Run',rig.channels.Run.duration);
            check(rig.bones.every((b,i)=>b.quaternion.angleTo(initial[i].q)<1e-5&&b.position.distanceTo(initial[i].p)<1e-6),'Run loop has a continuous seam');
            rig.sample('Run',.2);check(rig.byName.RHip.quaternion.angleTo(rig.byName.LHip.quaternion)>1,'Running uses opposing leg strides');
            startNewGameFlow();setNewGender('female');await beginSelectedCharacter();paused=true;
            check(binds.run==='KeyR'&&binds.jump==='ShiftLeft','Old saved controls gain R without replacing Jump');
            return checks;
        });
        await page.keyboard.down('ArrowRight');
        const walk = await page.evaluate(() => {const x=heroPlayer.x;for(let i=0;i<10;i++)updatePhysics();return heroPlayer.x-x});
        await page.keyboard.down('r');
        const run = await page.evaluate(() => {const x=heroPlayer.x;for(let i=0;i<10;i++)updatePhysics();return {distance:heroPlayer.x-x,running:heroPlayer.isRunning}});
        if(run.distance<=walk*1.5||!run.running)throw Error('R must make movement faster');
        await page.keyboard.up('r');
        const released = await page.evaluate(() => {updatePhysics();return !heroPlayer.isRunning&&heroPlayer.vx===4});
        if(!released)throw Error('Releasing R must return to walking');
        await page.keyboard.up('ArrowRight');
        await page.evaluate(()=>remap('run'));await page.keyboard.press('ControlLeft');
        if(!(await page.evaluate(()=>binds.run==='ControlLeft'&&binds.jump==='ShiftLeft')))throw Error('Run key must be remappable separately');
        const combatChecks = await page.evaluate(() => {
            let checks=0;const check=(ok,message)=>{if(!ok)throw Error(message);checks++};
            function setup(){
                startGame();paused=true;Object.keys(keys).forEach(k=>keys[k]=false);
                birds=[];archers=[];shots=[];gates.forEach(g=>g.dead=true);
                boss.active=false;bossDefeated=true;boss.swords=[];birdTimer=9999;
                heroPlayer.x=100;heroPlayer.y=412;heroPlayer.vy=0;heroPlayer.isGrounded=true;heroPlayer.facing='right';invuln=0;
            }
            function shot(k,dx,dy,vx=0,r=7){return {k,x:heroPlayer.x+dx,y:heroPlayer.y+dy,vx,vy:0,r,age:0}}
            setup();const low=shot('wave',4,16,0,12);shots=[low];keys.attack=true;updatePhysics();
            check(low.dead&&lives===4&&invuln===0,'Space cancels a low wave immediately; cancelled wave cannot still damage');
            setup();const ground=shot('wave',0,38,0,40);shots=[ground];keys.attack=true;updatePhysics();
            check(ground.dead&&lives===4,'Large ground wave is cancelled when its edge reaches the padded sword sweep');
            setup();const arrow=shot('arrow',125,8,-110);shots=[arrow];keys.attack=true;updatePhysics();
            check(arrow.dead&&lives===4,'Arrow entering the sweep this tick is cancelled before damage');
            setup();const laser=shot('laser',10,-8,0);shots=[laser];keys.attack=true;updatePhysics();
            check(laser.dead&&lives===4,'Close homing laser is cancelled');
            setup();const left=shot('wave',-4,16,0,12);heroPlayer.facing='left';shots=[left];keys.attack=true;updatePhysics();
            check(left.dead&&lives===4,'Low defence mirrors when facing left');
            setup();const rear=shot('arrow',-16,0);shots=[rear];keys.attack=true;updatePhysics();
            check(!rear.dead&&lives===3,'Attack from behind still damages the warrior');
            setup();const far=shot('arrow',240,0);shots=[far];keys.attack=true;updatePhysics();
            check(!far.dead,'Distant attacks are not erased');
            setup();shots=[shot('wave',4,16,0,12)];updatePhysics();
            check(lives===3,'Low wave damages normally without a sword swing');
            setup();keys.attack=true;updatePhysics();keys.attack=false;for(let i=0;i<24;i++)updatePhysics();
            const recovered=shot('wave',4,16,0,12);shots=[recovered];updatePhysics();
            check(lives===3&&!recovered.dead,'Recovery does not provide permanent immunity');
            setup();boss.active=true;bossDefeated=false;boss.bx=3000;boss.st='cool';boss.t=1000;
            const blade={x:heroPlayer.x+125,y:heroPlayer.y+8,s:'fly',vx:-110,vy:0};boss.swords=[blade];keys.attack=true;updatePhysics();
            check(blade.dead&&lives===4,'Boss blade entering the sweep is cancelled before its contact hit');
            setup();keys.right=keys.run=keys.attack=true;updatePhysics();
            check(!heroPlayer.isRunning&&heroPlayer.vx===0,'Attack takes priority over sprint movement');
            setup();initStage2();paused=true;stage2.trees=[];stage2.cats=[];
            const enemy={x:heroPlayer.x+22,y:heroPlayer.y+10,hp:10,dead:false};stage2.monsters=[enemy];keys.attack=true;updatePhysics();
            check(stage2Health===100&&enemy.stunned>0,'Stage 2 close forward attack is interrupted');
            setup();initStage2();paused=true;stage2.trees=[];stage2.cats=[];
            const enemyBehind={x:heroPlayer.x-24,y:heroPlayer.y,hp:10,dead:false};stage2.monsters=[enemyBehind];keys.attack=true;updatePhysics();
            check(stage2Health===92,'Stage 2 rear contact still damages');
            setup();initStage2();paused=true;stage2.trees=[];stage2.monsters=[];stage2.cats=[];keys.right=true;keys.down=true;
            const x=heroPlayer.x,y=heroPlayer.y;updatePhysics();const step=Math.hypot(heroPlayer.x-x,heroPlayer.y-y);
            keys.run=true;const sx=heroPlayer.x,sy=heroPlayer.y;updatePhysics();const sprint=Math.hypot(heroPlayer.x-sx,heroPlayer.y-sy);
            check(Math.abs(step-4.2)<1e-6&&Math.abs(sprint-7.2)<1e-6,'Stage 2 run speed is normalized diagonally');
            setup();const originalTargets=combatTargets;const target={x:heroPlayer.x+60,y:heroPlayer.y,hp:10,flash:0,dead:false};combatTargets=()=>[{o:target,k:'monster'}];
            for(let i=0;i<4;i++){keys.attack=true;updatePhysics();keys.attack=false;updatePhysics()}
            for(let i=0;i<120;i++){target.flash=0;target.x=heroPlayer.x+60;updatePhysics()}
            check(target.hp===5,'Four presses still produce four cuts, with a stronger finisher');combatTargets=originalTargets;
            returnToSetup();check(!keys.run&&!gameRunning,'Leaving the game releases sprint');
            return checks;
        });
        if(errors.length)throw Error('Browser errors: '+errors.join('; '));
        console.log(`${modelChecks} animation assertions, ${combatChecks} combat checks, and 4 keyboard/run checks passed.`);
    } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode=1; });
