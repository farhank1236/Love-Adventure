# Warrior V13 validation

Both warriors share four character-relative attacks, a rigid hand/sword relationship, trajectory-based locomotion and grounded body mechanics. Female leg surfaces previously assigned to coat controls now use a continuous anatomical weight field. Male knee/ankle transitions and joint centers are repaired in their own proportions. Limb translations remain fixed, and the knee pole follows the foot direction.

The appearance check protects body and handle vertices, normals, UVs, texture bytes and topology against the pre-change models. The only geometric edit is the 10% extension of the blade beyond the guard. All skin weights are finite, positive and normalized. Both models retain 14 actions and their original compact skeletons. Blender projects add optional, non-stretching leg IK controls; constraints are disabled by default so the baked game animations remain intact.

Validation covers both rigs in the game sampler and actual Chromium renderer: thigh participation, knee bending, locomotion seams, planted contact versus traveled distance, run flight phase, compression/weight transfer, cut direction, foot pivots, grip stability, ground clearance, four-press damage, held Space, one-second combo reset, forward enemy interruption, run/sprint keys and jump/fall/landing. Preview controls and mobile layout, plus the store and Game Over menu, are regression checked.

The renderer footage presents locomotion and all four attacks, with front, side and rear attack views at half game speed. ZIP downloads include the exact GLB used by the game, a Blender project with packed textures and preserved actions, and rig notes.

## Remaining deformation and authoring limits

This repair does not supply a new full anatomical skeleton: the original game rigs have one lower spine and chest chain, sculpted hands and compact foot bones. Separate mid-spine/clavicle, finger and toe deformation controls are absent. The supplied projects support editing existing FK actions and optional leg IK.

Skinning remains linear. Deep finisher poses can produce localized coat stretching and armor compression. The cape no longer follows hands or thighs; its sampled edge stretch remains below the earlier 1.8 regression limit. The old “coat panel” mask includes leg and knee surfaces, so its previous blanket limit does not describe the newly bending thighs. The updated regression separately checks the cape and bounds local expansion on the combined coat/leg surface. This is a remaining cloth limitation, not a claim of perfect deformation or a physical cloth simulation.
