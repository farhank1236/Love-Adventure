# Official playable warrior assets

The playable heroes are the Male Warrior and Female Warrior from the V14 full-body movement update. Asset contents, authoring history and exported GLB byte comparisons identify these versions; filenames alone do not establish their identity.

## Provenance

Commit `65f3778a55a968c3a24c97c62bbd708ae0a50f81` (2026-10-06), “Improve full-body warrior movement and render winged aunt combat,” updated both sets of model chunks, their animation authoring tools, the shared skin sampler, regression checks and V14 validation record. The original uploaded body and texture are retained. The reviewed male left-boot correction, repaired leg and garment weights, hand controls, rigid sword grip and full-body attack/locomotion tracks belong to these same assets.

| Hero | Runtime source | Embedded revision | Deform bones | Baked actions | Attacks |
| --- | --- | --- | ---: | ---: | ---: |
| Male Warrior | `assets/models/male-01.js` through `male-08.js` | `MALE_BODY_AND_SWORD_V14` | 31 | 15 | 5 |
| Female Warrior | `assets/models/female-01.js` through `female-08.js` | `BODY_AND_SWORD_V14` | 36 | 16 | 6 |

Both models contain `Idle`, `Walk`, `Run`, `Sprint`, `Jump`, `Fall`, `Land`, `Stop`, `Turn`, `Combo`, and their gender-specific numbered attack actions. Their attack timings, gait strides and contact phases are embedded in the models alongside those animations. `Sword` follows `RHand` at the palm; effects use the actual sword hilt and tip transforms.

The male body has 326,204 vertices. The female body has 314,897 vertices, with its separate sword and aura surfaces preserved. `tests/warrior-model-baseline.json` and the model integrity checks protect body/handle geometry, topology, UVs and textures, while allowing the reviewed blade extension and male boot correction. `tests/warrior-rig.cjs` checks fixed limb lengths, sword/palm stability, full-body locomotion and attack blade clearance with the actual renderer sampler.

## Exact export comparison

The decoded runtime chunks match the GLBs inside the V14 downloadable ZIPs byte for byte:

| Hero | GLB in download ZIP | Bytes | SHA-256 |
| --- | --- | ---: | --- |
| Male Warrior | `hero-warrior-v14.zip` → `hero-warrior-v14.glb` | 44,325,840 | `cf04e6d7cf2c62851d91d33e8937f33e4afb48aae158196f058e3055d140ef42` |
| Female Warrior | `female-warrior-v14.zip` → `female-warrior-v14.glb` | 49,841,168 | `465eec3e0916cc20ec2262df1a45060914e4e924e39e09a77ddb34661510bfea` |

Each ZIP's rig notes identify its GLB as the exact game model and include all baked actions plus the editable Blender project. The Blender projects add four optional foot IK/knee-pole authoring controls; those controls are distinct from the deform bone counts above.

## Incorrect male override removed

Commit `2629f1f0f1b0f6d80b29b6178d8bf4f16349c5d6` added `assets/models/male-rigged.glb.gz.b64` after V14. The launch repair loaded that file instead of the existing V14 male chunks. Its decoded metadata identifies it as `MALE_GLTF_V1`, with a different 8,567-vertex body, 28 bones and eight actions. It supplies only four attacks and has no `Run`, `Sprint`, `Fall` or `Land` actions. Its GLB is 1,523,880 bytes with SHA-256 `2218fbd284fa46d58db6b9d5620305dfff1a266e31dc40c472820e2ff163c020`.

That later-added asset does not preserve the V14 male design or movement set and has been deleted from the playable asset tree. Obsolete V13 warrior downloads and movement footage have also been removed. Historical warrior versions remain recoverable in Git history; enemy assets, current V14 warrior geometry and all V14 animation data remain intact.

For movement verification and deformation limits, see `warrior-v14-validation.md`.
