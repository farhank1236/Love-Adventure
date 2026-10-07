/* The only playable hero definitions. Selection, gameplay and preview share these assets. */
(() => {
    const freeze = value => {
        if (value && typeof value === 'object') {
            Object.values(value).forEach(freeze);
            Object.freeze(value);
        }
        return value;
    };
    const define = (id, gender, name, revision, attackCount) => freeze({
        id, gender, name, role: 'warrior', weapon: 'sword',
        model: { revision, parts: Array.from({ length: 8 }, (_, i) =>
            `assets/models/${gender}-${String(i + 1).padStart(2, '0')}.js`), cacheVersion: 'heroes-v14-1' },
        health: { max: 100, stage1Damage: 25, fallDamage: 25, topDownDamage: 10,
            invulnerabilityTicks: 45, hitReactionTicks: 12 },
        combat: { name: 'Warrior', weapon: 'sword', normal: 'Slash with sword',
            ultimate: 'Warlord’s Cleave', power: 4, ultType: 'arc', attackCount, attackSpeed: 2 },
        movement: { walk: 4, run: 7, sprint: 9, topDownWalk: 4.2, topDownRun: 7.2, topDownSprint: 9.2,
            clips: ['Idle', 'Walk', 'Run', 'Sprint', 'Jump', 'Fall', 'Land', 'Stop', 'Turn', 'Combo'] },
        ultimate: { name: 'Warlord’s Cleave', type: 'arc', power: 4 }
    });
    const heroes = freeze({
        maleWarrior: define('maleWarrior', 'male', 'Male Warrior', 'MALE_BODY_AND_SWORD_V14', 5),
        femaleWarrior: define('femaleWarrior', 'female', 'Female Warrior', 'BODY_AND_SWORD_V14', 6)
    });
    function resolve(value) {
        if (value && typeof value === 'object') {
            const candidate = value.heroId || value.characterId || value.id;
            value = /^(male|female|m_|f_)/i.test(candidate || '') ? candidate : value.gender || value.data;
        }
        if (value && typeof value === 'object') return resolve(value);
        const key = String(value || '').toLowerCase();
        return key === 'female' || key === 'f_eg' || key.startsWith('female') || key.startsWith('f_')
            ? heroes.femaleWarrior : heroes.maleWarrior;
    }
    const models = new Map(), rigs = new Map();
    function loadModel(value) {
        const hero = resolve(value);
        if (models.has(hero.id)) return models.get(hero.id);
        const promise = (async () => {
            const parts = window.LoveAdventureModelParts ||= { male: [], female: [] };
            parts[hero.gender] = [];
            for (const path of hero.model.parts) await new Promise((success, failure) => {
                const script = document.createElement('script');
                script.src = `${path}?v=${hero.model.cacheVersion}`;
                script.onload = () => { script.remove(); success(); };
                script.onerror = () => { script.remove(); failure(new Error(`${hero.name} could not load. Please try again.`)); };
                document.head.appendChild(script);
            });
            if (parts[hero.gender].length !== hero.model.parts.length)
                throw new Error(`${hero.name} model is incomplete.`);
            const encoded = parts[hero.gender].join('');
            parts[hero.gender] = [];
            return encoded;
        })().catch(error => { models.delete(hero.id); throw error; });
        models.set(hero.id, promise);
        return promise;
    }
    function createRig(THREE, value) {
        const hero = resolve(value);
        if (rigs.has(hero.id)) return rigs.get(hero.id);
        const promise = (async () => {
            const rig = createWarriorAsset(THREE, await loadModel(hero));
            await rig.textureReady;
            if (rig.revision !== hero.model.revision || rig.attackHits.length !== hero.combat.attackCount ||
                hero.movement.clips.some(clip => !rig.channels[clip]) || rig.byName.Sword.parent !== rig.byName.RHand)
                throw new Error(`${hero.name} model and animations do not match the approved warrior.`);
            rig.heroId = hero.id;
            return rig;
        })().catch(error => { rigs.delete(hero.id); throw error; });
        rigs.set(hero.id, promise);
        return promise;
    }
    function avatar(value) {
        const hero = resolve(value);
        return { id: hero.id, gender: hero.gender, name: hero.name, role: hero.role, country: 'Æthelos' };
    }
    window.HeroSystem = Object.freeze({ heroes, resolve, avatar, loadModel, createRig });
})();
