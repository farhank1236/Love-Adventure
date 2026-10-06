"use strict";
// Run against a local game server. Each run uses an isolated browser profile.
const {chromium}=require('playwright');const assert=require('node:assert/strict');
(async()=>{
 const proxyUrl=process.env.HTTPS_PROXY||process.env.https_proxy;
 const browser=await chromium.launch({...(process.env.BROWSER_EXECUTABLE?{executablePath:process.env.BROWSER_EXECUTABLE}:{}),headless:true,args:['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader'],...(proxyUrl?{proxy:{server:proxyUrl,bypass:'127.0.0.1,localhost'}}:{})});
 const page=await browser.newPage();let checks=0;const errors=[];page.on('pageerror',e=>errors.push(e.message));
 function check(value,msg){assert.ok(value,msg);checks++}
 try{
 await page.goto(process.env.GAME_URL||'http://127.0.0.1:8000',{waitUntil:'networkidle'});
 await page.evaluate(()=>openMainMenu());await page.getByRole('button',{name:'🛒 STORE',exact:true}).click();
 check(await page.locator('#storeModal').isVisible(),'Store opens from menu');
 check(await page.locator('#storeWeapons .store-card').count()===4,'Four distinct weapon upgrades');
 check(await page.locator('#storeModal [onclick="purchaseGem(\'blue\')"]').isDisabled(),'Unaffordable gem disabled');
 check(await page.locator('#storeCharacters [onclick="buyStoreCharacterRole(\'warrior\',\'female\')"]').textContent()==='♀ Female · Select','Starter role free');
 await page.evaluate(()=>{progression.diamonds=100;progression.gems=20;progression.redGems=20;progression.money=1000;syncEconomyUI()});
 await page.locator('#storeModal [onclick="purchaseGem(\'blue\')"]').click();
 check(await page.evaluate(()=>progression.diamonds===99&&progression.gems===21),'Gem purchase exact deduction');
 check((await page.locator('#storeMessage').textContent()).includes('Blue gem purchased'),'Feedback inside store');
 await page.locator('#storeCharacters [onclick="buyStoreCharacterRole(\'titan\',\'female\')"]').click();
 check(await page.evaluate(()=>progression.diamonds===79&&progression.ownedFemaleRoles.includes('titan')),'Character purchase persisted');
 await page.locator('#storeCharacters [onclick="buyStoreCharacterRole(\'titan\',\'female\')"]').click();
 check(await page.evaluate(()=>progression.diamonds===79&&playerGender==='female'&&selectedRole==='titan'),'Owned select without charging');
 await page.locator('#storeWeapons [onclick="upgradeWeapon(\'sword\')"]').click();
 check(await page.evaluate(()=>progression.gems===20&&progression.weaponLevels.sword===1),'Weapon upgrade exact cost');
 await page.locator('#storeUpgrades button').click();
 check(await page.evaluate(()=>progression.redGems===19&&characterLevel===2&&progression.characterLevels.female_titan===2),'Character upgrade persisted per role');
 const outfit=await page.evaluate(()=>CLOTHES.find(c=>c.id!=='classic').id);
 await page.locator(`#storeClothes [onclick="buyClothes('${outfit}')"]`).click();
 check(await page.evaluate(id=>progression.ownedClothes.includes(id)&&progression.selectedClothes===id,outfit),'Outfit purchase equips');
 await page.evaluate(()=>{progression.weaponLevels.sword=10;syncEconomyUI()});
 check(await page.locator('#storeWeapons [onclick="upgradeWeapon(\'sword\')"]').isDisabled(),'Max upgrade disabled');
 check((await page.locator('#storeWeapons [onclick="upgradeWeapon(\'sword\')"]').textContent())==='MAX LEVEL','Max price removed');
 await page.evaluate(()=>{progression.diamonds=0;progression.gems=0;progression.redGems=0;saveProgress();syncEconomyUI();const d=progression.diamonds;purchaseGem('red');buyStoreCharacterRole('ogre','male');upgradeWeapon('bow');upgradeCharacter();if(progression.diamonds!==d||progression.gems!==0||progression.redGems!==0)throw Error('Insufficient funds deducted')});checks++;
 
 await page.getByRole('button',{name:'CLOSE',exact:true}).click();
 check(await page.evaluate(()=>!paused),'Store restores menu pause state');
 await page.getByRole('button',{name:'❤️ NEW GAME',exact:true}).click();
 check(await page.locator('#roleGrid [onclick="selectNewRole(\'titan\')"]').count()===1,'Purchased character available in new game');
 check(await page.evaluate(()=>selectedRole==='titan'&&newGender==='female'),'Store selection preserved');
 await page.getByRole('button',{name:'START ADVENTURE',exact:true}).click();
 await page.evaluate(()=>{paused=true});
 await page.locator('#gameScreen [onclick="toggleStore()"]').click();
 await page.evaluate(()=>equipStoreRole('warrior','male'));
 check(await page.evaluate(()=>selectedRole==='titan'&&playerGender==='female'),'Cannot change hero mid-game');
 await page.getByRole('button',{name:'CLOSE',exact:true}).click();
 check(await page.evaluate(()=>paused),'Store restores previously paused gameplay');
 await page.evaluate(()=>{paused=false;lives=1;for(let i=0;i<8&&!gameOver;i++){invuln=0;kill()}});
 check(await page.locator('#gameOverModal').isVisible(),'Actual defeat opens game over');
 await page.locator('#gameOverModal').getByRole('button',{name:'MAIN MENU',exact:true}).click();
 check(await page.locator('#mainMenu').isVisible()&&!(await page.locator('#gameOverModal').isVisible()),'Game over menu navigation');
 check(await page.evaluate(()=>!gameRunning&&!gameOver&&!paused&&stage2===null),'Menu cleans up game state');
 await page.getByRole('button',{name:'❤️ NEW GAME',exact:true}).click();await page.getByRole('button',{name:'START ADVENTURE',exact:true}).click();
 check(await page.evaluate(()=>gameRunning&&!gameOver&&lives===4),'Can play again after game over');
 await page.evaluate(()=>returnToSetup());await page.reload({waitUntil:'networkidle'});
 check(await page.evaluate(()=>progression.ownedFemaleRoles.includes('titan')&&progression.characterLevels.female_titan===2),'Purchases and levels survive reload');
 await page.setViewportSize({width:390,height:844});await page.evaluate(()=>{openMainMenu();openMainStore()});
 check(await page.evaluate(()=>document.querySelector('#storeModal>div').getBoundingClientRect().width<=innerWidth),'Mobile store fits screen');
 
 check(errors.length===0,`Browser JavaScript errors: ${errors.join('; ')}`);
 console.log(`${checks} store and game-over checks passed`);
 }finally{await browser.close()}
})().catch(e=>{console.error(e);process.exitCode=1});
