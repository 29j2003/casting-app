"""Every scene with every transition: after each switch exactly one scene is left, fully visible.

    python tests/live/transitions.py

For each transition type the scenes are switched in a shuffled order. After a switch has finished, the
overlay must show the new scene in a single layer, all its parts fully visible (only sponsor and music
may still be fading) and the stinger hidden again.
"""

import asyncio
import random

from common import SCENES, TRANSITIONS, control_and_overlay, finish, switch_scene

SWITCH_SECONDS = 1.15          # transitions take 0.5 s here; wait a little longer than one transition

SETTLED_STATE = """[document.body.dataset.currentscene,
  document.querySelectorAll('.layer').length,
  [...(document.querySelector('.layer') || {children: []}).children].filter(e => parseFloat(getComputedStyle(e).opacity) < 0.99
     && !e.classList.contains('sponsor') && !e.classList.contains('music')).length,
  getComputedStyle(document.querySelector('.stinger')).visibility]"""


async def main() -> None:
    async with control_and_overlay("/overlay.html?test=1") as (control, overlay, errors):
        random.seed(3)
        clean, total = 0, 0
        for transition in TRANSITIONS:
            order = SCENES[:]
            random.shuffle(order)
            for scene in order:
                await switch_scene(control, scene, transition)
                await overlay.wait_for_timeout(SWITCH_SECONDS * 1000)
                # a slow CI machine (first load of each scene template) may need a moment longer – up to 3 s more;
                # a switch that never settles still fails below
                for _ in range(12):
                    current, layers, still_fading, stinger = await overlay.evaluate(SETTLED_STATE)
                    if current == scene and layers == 1 and still_fading == 0 and stinger == "hidden":
                        break
                    await overlay.wait_for_timeout(250)
                total += 1
                if current == scene and layers == 1 and still_fading == 0 and stinger == "hidden":
                    clean += 1
                else:
                    print(f"  {transition} → {scene}: scene {current}, {layers} layer(s), {still_fading} part(s) fading, stinger {stinger}")
    finish(clean == total and not errors, f"{clean}/{total} switches clean · JavaScript errors: {errors[:3]}")


asyncio.run(main())
