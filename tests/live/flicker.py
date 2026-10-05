"""Frame by frame: no part of a scene flashes, flickers or disappears during a scene switch.

    python tests/live/flicker.py [transition]        (fade, slide, wipe or stinger; default fade)

For pairs of scenes the overlay records the visibility of every part (data-part) on each animation
frame while the switch runs. Rules:
  * a part in both scenes stays visible all the time (it may glide, but never vanish)
  * a part that leaves only fades out, one that arrives only fades in (no jumps back)
  * sponsor and music must not flash up
  * no frame between start and end may be completely empty
"""

import asyncio
import sys

from common import control_and_overlay, finish, switch_scene

PAIRS = [("intro", "cast-duo"), ("cast-duo", "cast-duo-interview"), ("cast-duo-interview", "cast-solo-clips"),
         ("cast-solo-clips", "cast-duo-clips"), ("cast-duo-clips", "cast-solo"), ("cast-solo", "intro"), ("intro", "pause"),
         ("pause", "end"), ("end", "map-veto"), ("map-veto", "players"), ("players", "ingame"), ("ingame", "cast-duo")]
FRAMES = 200

# runs in the overlay: records {part id: visibility 0…1} for FRAMES animation frames into window.__samples
SAMPLER = """
window.__ids = window.__ids || new WeakMap(); window.__nextId = window.__nextId || 0; window.__samples = [];
const visibility = e => { let o = 1; for (let x = e; x && x !== document.body; x = x.parentElement) {
  const cs = getComputedStyle(x); if (cs.display === 'none' || cs.visibility === 'hidden') return 0; o *= parseFloat(cs.opacity); } return o; };
(function sample() {
  const frame = {};
  document.querySelectorAll('.layer > [data-part]').forEach(e => {
    if (!window.__ids.has(e)) window.__ids.set(e, ++window.__nextId + ':' + e.dataset.part);
    frame[window.__ids.get(e)] = visibility(e);
  });
  window.__samples.push(frame); if (window.__samples.length < %d) requestAnimationFrame(sample); })();
""" % FRAMES


def problems_in(samples: list[dict]) -> list[str]:
    """Check the recorded frames against the rules in the module docstring."""
    problems = []
    for part_id in set().union(*samples):
        values = [frame.get(part_id) for frame in samples]
        present = [v for v in values if v is not None]
        part = part_id.split(":")[1]
        if part in ("music", "sponsor"):
            if max(present) > 0.05:
                problems.append(f"{part} flashes up ({max(present):.2f})")
            continue
        at_start, at_end = values[0] is not None, values[-1] is not None
        if at_start and at_end and min(present) < 0.9:
            problems.append(f"{part} (stays) disappears briefly: min {min(present):.2f}")
        if at_start and not at_end and any(b > a + 0.1 for a, b in zip(present, present[1:])):
            problems.append(f"{part} (leaves) flashes up")
        if not at_start and at_end and any(b < a - 0.1 and a > 0.3 for a, b in zip(present, present[1:])):
            problems.append(f"{part} (arrives) flickers")
    visible = [sum(1 for v in frame.values() if v > 0.5) for frame in samples]
    empty = [i for i in range(1, len(visible) - 1) if visible[i] == 0 and max(visible[:i]) > 0 and max(visible[i:]) > 0]
    if empty:
        problems.append(f"{len(empty)} empty frames")
    return problems


async def main() -> None:
    transition = sys.argv[1] if len(sys.argv) > 1 else "fade"
    total = 0
    async with control_and_overlay() as (control, overlay, errors):
        for start, target in PAIRS:
            await switch_scene(control, start, "cut")
            await overlay.wait_for_timeout(1300)
            await overlay.evaluate(SAMPLER)
            await overlay.wait_for_timeout(100)
            await switch_scene(control, target, transition)
            await overlay.wait_for_timeout(3300)
            problems = problems_in(await overlay.evaluate("window.__samples"))
            total += len(problems)
            print(f"{start:>20} → {target:<20}", "ok" if not problems else problems)
    finish(total == 0 and not errors, f"{transition}: {total} problem(s) · JavaScript errors: {errors[:3]}")


asyncio.run(main())
