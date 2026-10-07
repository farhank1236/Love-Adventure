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
            await WarriorCombat.load('female');
            await WarriorCombat.load('male');
            const rig=createWarriorAsset(THREE,FEMALE_WARRIOR_MODEL,{loadTexture:false});
            check(!!rig.channels.Run, 'Female warrior includes a distinct Run clip');
            check(['Sprint','Fall','Land','Stop','Turn','Attack5','Attack6'].every(n=>rig.channels[n]),'Distinct locomotion, jump and six attack clips exist');
            const hand=rig.byName.RHand.position.clone();
            for(const name of Object.keys(rig.channels))for(let i=0;i<=12;i++){
                rig.sample(name,rig.channels[name].duration*i/12);
                check(rig.byName.RHand.position.distanceTo(hand)<1e-6,'Grip does not slide during '+name);
                check(rig.byName.Sword.getWorldPosition(new THREE.Vector3()).distanceTo(rig.byName.RHand.getWorldPosition(new THREE.Vector3()))<1e-6,'Sword pivots at the hand in '+name);
                const q=rig.byName.RElbow.quaternion;
                check(Math.abs(q.y)<1e-6&&Math.abs(q.z)<1e-6&&2*Math.acos(Math.min(1,Math.abs(q.w)))<1.6,'Elbow has bounded hinge flex in '+name);
                check(rig.bones.every(b=>b.quaternion.toArray().every(Number.isFinite)),'All rotations are finite in '+name);
            }
            for(const name of ['Walk','Run','Sprint']){
                rig.sample(name,0);const initial=rig.bones.map(b=>({q:b.quaternion.clone(),p:b.position.clone()}));
                rig.sample(name,rig.channels[name].duration);
                check(rig.bones.every((b,i)=>b.quaternion.angleTo(initial[i].q)<1e-5&&b.position.distanceTo(initial[i].p)<1e-6),name+' has a continuous loop seam');
            }
            const joints=['Hips','Chest','RShoulder','RWrist'];
            for(let i=1;i<=6;i++){
                const name='Attack'+i;rig.sample(name,.12);const first=joints.map(n=>rig.byName[n].quaternion.clone());const hip=rig.byName.Hips.position.y;
                rig.sample(name,rig.channels[name].duration*.70);
                joints.forEach((n,j)=>check(first[j].angleTo(rig.byName[n].quaternion)>.03,n+' contributes to '+name));
                const heights=[];for(let j=0;j<=20;j++){rig.sample(name,rig.channels[name].duration*j/20);heights.push(rig.byName.Hips.position.y)}check(Math.max(...heights)-Math.min(...heights)>.005,'Body rises and falls in '+name);
                if(i<6){rig.sample(name,rig.channels[name].duration);const end=rig.bones.map(b=>({q:b.quaternion.clone(),p:b.position.clone()}));rig.sample('Attack'+(i+1),0);check(rig.bones.every((b,j)=>b.quaternion.angleTo(end[j].q)<1e-5&&b.position.distanceTo(end[j].p)<1e-5),'Consecutive cuts share their boundary pose');}
            }
            rig.sample('Combo',.06);const planted=rig.byName.RFoot.getWorldPosition(new THREE.Vector3());rig.sample('Combo',.60);
            check(planted.distanceTo(rig.byName.RFoot.getWorldPosition(new THREE.Vector3()))<.002,'Supporting foot remains planted during the first advancing cut');
            rig.sample('Jump',.13);const crouch=rig.byName.Hips.position.y;rig.sample('Jump',.25);check(rig.byName.Hips.position.y-crouch>.04,'Jump crouch extends into takeoff');
            rig.sample('Combo',2.70);check(rig.aura.visible&&rig.mana.visible,'Finisher has transient body and blade energy');rig.sample('Idle',0);check(!rig.aura.visible&&!rig.mana.visible,'Attack energy clears on idle');
            const cloth=await (await fetch('tools/female-cloth-bindings.json')).json(),indices=rig.mesh.geometry.attributes.skinIndex.array,weights=rig.mesh.geometry.attributes.skinWeight.array;
            check(cloth.patches.every(([v])=>{for(let j=0;j<4;j++)if([6,7,8,9,11,12,13,14].includes(indices[v*4+j])&&weights[v*4+j]>1e-6)return false;return true}),'Cape and coat bindings contain no hand or arm influence');
            const kinds=new Uint8Array(rig.mesh.geometry.attributes.position.count);cloth.patches.forEach(([v,b,w,k])=>kinds[v]=k);
            const pos=rig.mesh.geometry.attributes.position,idx=rig.mesh.geometry.index.array,edges=[];
            for(let k=0;k<idx.length;k+=3){const a=idx[k],b=idx[k+1];if(kinds[a]&&kinds[a]===kinds[b]){const A=new THREE.Vector3().fromBufferAttribute(pos,a),B=new THREE.Vector3().fromBufferAttribute(pos,b),length=A.distanceTo(B);if(length>.004)edges.push([a,b,length])}}
            const va=new THREE.Vector3(),vb=new THREE.Vector3();let maxStretch=0,maxCapeStretch=0,maxExpansion=0;
            for(const t of [.23,.42,1.10,1.85,2.40,2.70]){rig.sample('Combo',t);for(const [a,b,length] of edges){va.fromBufferAttribute(pos,a);vb.fromBufferAttribute(pos,b);rig.mesh.applyBoneTransform(a,va);rig.mesh.applyBoneTransform(b,vb);const distance=va.distanceTo(vb);maxStretch=Math.max(maxStretch,distance/length);maxExpansion=Math.max(maxExpansion,distance-length);if(kinds[a]===1)maxCapeStretch=Math.max(maxCapeStretch,distance/length)}}
            check(maxCapeStretch<1.8,'Cape stays on its cloth chain; max='+maxCapeStretch.toFixed(2));
            // The old coat mask also includes thigh/knee surfaces. These now bend,
            // so protect against long spikes by absolute expansion as well as ratio.
            check(maxStretch<4&&maxExpansion<.05,'Repaired coat/leg surface has bounded local expansion; ratio='+maxStretch.toFixed(2)+', expansion='+maxExpansion.toFixed(3));
            startNewGameFlow();selectÆthelosHero('female');await beginSelectedCharacter();paused=true;
            check(binds.run==='KeyR'&&binds.sprint==='ControlLeft'&&binds.jump==='ShiftLeft','Old saved controls gain R without replacing Jump');
            return checks;
        });
        await page.keyboard.down('ArrowRight');
        const walk = await page.evaluate(() => {const x=heroPlayer.x;for(let i=0;i<10;i++)updatePhysics();return heroPlayer.x-x});
        await page.keyboard.down('r');
        const run = await page.evaluate(() => {const x=heroPlayer.x;for(let i=0;i<20;i++)updatePhysics();return {distance:heroPlayer.x-x,running:heroPlayer.isRunning}});
        if(run.distance<=walk*2||!run.running)throw Error('R must make movement faster');
        await page.keyboard.up('r');
        const released = await page.evaluate(() => {for(let i=0;i<25;i++)updatePhysics();return !heroPlayer.isRunning&&Math.abs(heroPlayer.vx-4)<.01});
        if(!released)throw Error('Releasing R must return to walking');
        await page.keyboard.up('ArrowRight');
        await page.keyboard.down('ArrowRight');await page.keyboard.down('ControlLeft');const sprinting=await page.evaluate(()=>{for(let i=0;i<20;i++)updatePhysics();return heroPlayer.isSprinting&&heroPlayer.vx>8.9});if(!sprinting)throw Error('Ctrl triggers faster sprint');await page.keyboard.up('ControlLeft');await page.keyboard.up('ArrowRight');
        await page.evaluate(()=>remap('run'));await page.keyboard.press('KeyT');
        if(!(await page.evaluate(()=>binds.run==='KeyT'&&binds.jump==='ShiftLeft')))throw Error('Run key must be remappable separately');
        const combatChecks = await page.evaluate(async () => {
            let checks=0;const check=(ok,message)=>{if(!ok)throw Error(message);checks++};
            async function setup(){
                await startGame();paused=true;Object.keys(keys).forEach(k=>keys[k]=false);
                birds=[];archers=[];shots=[];gates.forEach(g=>g.dead=true);
                boss.active=false;bossDefeated=true;boss.swords=[];birdTimer=9999;
                heroPlayer.x=100;heroPlayer.y=412;heroPlayer.vy=0;heroPlayer.isGrounded=true;heroPlayer.facing='right';invuln=0;
            }
            function shot(k,dx,dy,vx=0,r=7){return {k,x:heroPlayer.x+dx,y:heroPlayer.y+dy,vx,vy:0,r,age:0}}
            for(const gender of ['female','male']){
                playerGender=gender;await setup();keys.attack=true;
                for(let i=0;i<45;i++)updatePhysics();
                check(WarriorCombat.snapshot().combo===null&&WarriorCombat.snapshot().nextCut===1&&WarriorCombat.snapshot().pendingCuts.length===0,'Holding Space triggers only one cut for '+gender);
                keys.attack=false;for(let i=0;i<65;i++)updatePhysics();keys.attack=true;updatePhysics();
                check(WarriorCombat.snapshot().combo.index===0,'One-second gap resets to the first attack for '+gender);
            }
            playerGender='female';
            await setup();heroPlayer.data=HeroSystem.avatar('femaleWarrior');renderCanvas();
            const guardBlade=WarriorCombat.rig.guardGeometry,scale=WarriorCombat.rig.rootMotionScale;
            check(!!guardBlade,'Real rendered sword supplies guard geometry');
            const bx=heroPlayer.x+(guardBlade.hilt.x*.6+guardBlade.tip.x*.4)*scale,by=heroPlayer.y+18-(guardBlade.hilt.y*.6+guardBlade.tip.y*.4)*scale;
            check(Math.abs(by-(heroPlayer.y-12))>45,'Physical blade test lies beyond the old low-only sweep');
            const highBlade=shot('laser',bx-heroPlayer.x,by-heroPlayer.y,0,5);shots=[highBlade];keys.attack=true;updatePhysics();
            check(highBlade.dead&&heroHealth===100,'Space interrupts a projectile beside the visible blade');
            await setup();const low=shot('wave',4,16,0,12);shots=[low];keys.attack=true;updatePhysics();
            check(low.dead&&heroHealth===100&&invuln===0,'Space cancels a low wave immediately; cancelled wave cannot still damage');
            await setup();const ground=shot('wave',0,38,0,40);shots=[ground];keys.attack=true;updatePhysics();
            check(ground.dead&&heroHealth===100,'Large ground wave is cancelled when its edge reaches the padded sword sweep');
            await setup();const arrow=shot('arrow',125,8,-110);shots=[arrow];keys.attack=true;updatePhysics();
            check(arrow.dead&&heroHealth===100,'Arrow entering the sweep this tick is cancelled before damage');
            await setup();const laser=shot('laser',10,-8,0);shots=[laser];keys.attack=true;updatePhysics();
            check(laser.dead&&heroHealth===100,'Close homing laser is cancelled');
            await setup();const left=shot('wave',-4,16,0,12);heroPlayer.facing='left';shots=[left];keys.attack=true;updatePhysics();
            check(left.dead&&heroHealth===100,'Low defence mirrors when facing left');
            await setup();const rear=shot('arrow',-16,0);shots=[rear];keys.attack=true;updatePhysics();
            check(!rear.dead&&heroHealth===75,'Attack from behind still damages the warrior');
            await setup();const far=shot('arrow',240,0);shots=[far];keys.attack=true;updatePhysics();
            check(!far.dead,'Distant attacks are not erased');
            await setup();shots=[shot('wave',4,16,0,12)];updatePhysics();
            check(heroHealth===75,'Low wave damages normally without a sword swing');
            await setup();keys.attack=true;updatePhysics();keys.attack=false;for(let i=0;i<22;i++)updatePhysics();
            const recovered=shot('wave',4,16,0,12);shots=[recovered];updatePhysics();
            check(heroHealth===75&&!recovered.dead,'Recovery does not provide permanent immunity');
            await setup();boss.active=true;bossDefeated=false;boss.bx=3000;boss.st='cool';boss.t=1000;
            const blade={x:heroPlayer.x+125,y:heroPlayer.y+8,s:'fly',vx:-110,vy:0};boss.swords=[blade];keys.attack=true;updatePhysics();
            check(blade.dead&&heroHealth===100,'Boss blade entering the sweep is cancelled before its contact hit');
            await setup();keys.right=keys.run=keys.attack=true;updatePhysics();
            check(!heroPlayer.isRunning&&heroPlayer.vx===0,'Attack takes priority over sprint movement');
            await setup();initStage2();paused=true;stage2.trees=[];stage2.cats=[];
            const enemy={x:heroPlayer.x+22,y:heroPlayer.y+10,hp:10,dead:false};stage2.monsters=[enemy];keys.attack=true;updatePhysics();
            check(heroHealth===100&&enemy.stunned>0,'Stage 2 close forward attack is interrupted');
            await setup();initStage2();paused=true;stage2.trees=[];stage2.cats=[];
            const enemyBehind={x:heroPlayer.x-24,y:heroPlayer.y,hp:10,dead:false};stage2.monsters=[enemyBehind];keys.attack=true;updatePhysics();
            check(heroHealth===92,'Stage 2 rear contact still damages');
            await setup();initStage2();paused=true;stage2.trees=[];stage2.monsters=[];stage2.cats=[];keys.right=true;keys.down=true;
            for(let i=0;i<25;i++)updatePhysics();const x=heroPlayer.x,y=heroPlayer.y;updatePhysics();const step=Math.hypot(heroPlayer.x-x,heroPlayer.y-y);
            keys.run=true;for(let i=0;i<25;i++)updatePhysics();const sx=heroPlayer.x,sy=heroPlayer.y;updatePhysics();const running=Math.hypot(heroPlayer.x-sx,heroPlayer.y-sy);
            check(Math.abs(step-4.2)<.02&&Math.abs(running-7.2)<.02,'Stage 2 speeds converge smoothly and are normalized diagonally');
            await setup();const originalTargets=combatTargets;const target={x:heroPlayer.x+60,y:heroPlayer.y,hp:10,flash:0,dead:false};combatTargets=()=>[{o:target,k:'monster'}];
            for(let i=0;i<6;i++){keys.attack=true;updatePhysics();keys.attack=false;updatePhysics()}
            for(let i=0;i<170;i++){target.flash=0;target.x=heroPlayer.x+60;updatePhysics()}
            check(target.hp===3,'Six presses produce six cuts, with a stronger finisher');combatTargets=originalTargets;
            await setup();initStage2();paused=true;stage2.trees=[];stage2.monsters=[];stage2.cats=[];
            keys.right=true;updatePhysics();const firstSpeed=heroPlayer.moveSpeed;
            for(let i=0;i<25;i++)updatePhysics();check(firstSpeed<2&&heroPlayer.moveSpeed>4.1,'Locomotion accelerates smoothly');
            keys.right=false;const coastX=heroPlayer.x;updatePhysics();check(heroPlayer.x>coastX&&heroPlayer.moveSpeed<4.2,'Releasing direction decelerates instead of snapping to a stop');
            for(let i=0;i<25;i++)updatePhysics();check(!heroPlayer.isMoving,'Deceleration settles to a stop');
            keys.jump=true;updatePhysics();check(WarriorCombat.pose()==='Jump'&&WarriorCombat.snapshot().jumpZ===0,'Jump anticipation bends before leaving the ground');
            keys.jump=false;const modes=new Set();for(let i=0;i<70;i++){updatePhysics();modes.add(WarriorCombat.pose())}
            check(['Jump','Fall','Land','Idle'].every(m=>modes.has(m)),'Gameplay transitions through jump, fall and landing');
            returnToSetup();check(!keys.run&&!gameRunning,'Leaving the game releases sprint');
            return checks;
        });
        if(errors.length)throw Error('Browser errors: '+errors.join('; '));
        console.log(`${modelChecks} animation assertions, ${combatChecks} combat checks, and keyboard/run/sprint checks passed.`);
    } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode=1; });
