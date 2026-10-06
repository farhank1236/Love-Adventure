# Love Adventure

Version 17 with the Female Warrior V8 model and animations.

Open index.html, then select New Game → Female → Warrior. Default controls: arrow keys move, Space attacks, Shift jumps. Each press triggers one cut; four presses queue the combo. A one-second input gap resets it. Attacking while jumping works in both stages.

Keep the entire assets folder beside index.html. Model data is divided into script files so no repository file exceeds the single-file limit. All chunks are loaded before the 3D combat code runs. The original self-contained game has the same model and animation data.

The male warrior and existing stage systems are retained. Some sleeve deformation remains on the female model. Automated combat and model-load checks passed; live GPU rendering was not verified.

Use 3D Warrior · Animation view inside the game to inspect the character.
