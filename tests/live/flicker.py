"""Frame by frame: no part of a scene flashes, flickers or disappears during a scene switch.

    python tests/live/flicker.py [transition]        (fade, slide, wipe or stinger; default fade)

For pairs of scenes the overlay records the visibility of every part (data-part) on each animation
frame while the switch runs. Rules:
  * a part in both scenes stays visible all the time (it may glide, but never vanish) – except a part that jumps far
    (bar at the top in clips scenes ↔ at the bottom in cast scenes, broadcast.js LONG_JUMP): it fades out at the old
    place and in at the new one, so it may dip once, but must end fully visible
  * a part that leaves only fades out, one that arrives only fades in (no jumps back)
  * sponsor and music must not flash up
  * no frame between start and end may be completely empty
  * the logo (brand) is never cross-faded: two half transparent copies of the same logo look like a flicker
  * a part that stays glides straight to its new place – it never jumps somewhere else first (2.14: the bottom bar
    jumped to the template position when the bar had closed the sponsor gap)
"""

import asyncio
import sys

from common import control_and_overlay, finish, switch_scene

PAIRS = [("intro", "cast-duo"), ("cast-duo", "cast-duo-interview"), ("cast-duo-interview", "cast-solo-clips"),
         ("cast-solo-clips", "cast-duo-clips"), ("cast-duo-clips", "cast-solo"), ("cast-solo", "intro"), ("intro", "pause"),
         ("pause", "end"), ("end", "map-veto"), ("map-veto", "players"), ("players", "ingame"), ("ingame", "cast-duo"),
         ("cast-duo", "teams"), ("teams", "intro"), ("cast-quad", "teams"), ("cast-quad", "players"),
         ("players", "cast-quad"), ("intro", "cast-quad"), ("cast-quad", "intro")]
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
    const r = e.getBoundingClientRect(); frame['pos:' + window.__ids.get(e)] = [Math.round(r.left), Math.round(r.top)];
    // a child with its own "visibility: visible" shows even inside a hidden part (e.g. the slides of the team intro)
    if (getComputedStyle(e).visibility === 'hidden' && [...e.querySelectorAll('*')].some(x => getComputedStyle(x).visibility === 'visible' && x.getClientRects().length))
      frame['leak:' + e.dataset.part] = 1;
  });
  window.__samples.push(frame); if (window.__samples.length < %d) requestAnimationFrame(sample); })();
""" % FRAMES


def problems_in(samples: list[dict], jumped: tuple = ()) -> list[str]:
    """Check the recorded frames against the rules in the module docstring."""
    problems = []
    leaks = sorted({k[5:] for frame in samples for k in frame if k.startswith("leak:")})
    for key in {k for frame in samples for k in frame if k.startswith("pos:")}:
        track = [frame[key] for frame in samples if key in frame]
        if len(track) < len(samples) or key.split(":")[2] in jumped:
            continue                                   # only parts that stay (and glide) the whole time
        for axis in (0, 1):
            steps = [b[axis] - a[axis] for a, b in zip(track, track[1:]) if abs(b[axis] - a[axis]) > 2]
            if any(x > 0 for x in steps) and any(x < 0 for x in steps):
                problems.append(f"{key.split(':')[2]} jumps back and forth ({'xy'[axis]}: {steps[:6]})")
                break
    if leaks:
        problems.append(f"content of hidden parts shows: {leaks}")
    for part_id in {k for frame in samples for k in frame if not k.startswith(("leak:", "pos:"))}:
        values = [frame.get(part_id) for frame in samples]
        present = [v for v in values if v is not None]
        part = part_id.split(":")[1]
        if part in ("music", "sponsor"):
            if max(present) > 0.05:
                problems.append(f"{part} flashes up ({max(present):.2f})")
            continue
        at_start, at_end = values[0] is not None, values[-1] is not None
        if at_start and at_end and part in jumped:
            dips = sum(1 for a, b in zip(present, present[1:]) if a >= 0.5 > b)   # out at the old place, in at the new one
            if dips > 1 or present[-1] < 0.9:
                problems.append(f"{part} (jumps) flickers: {dips} dips, ends at {present[-1]:.2f}")
        elif at_start and at_end and min(present) < 0.9:
            problems.append(f"{part} (stays) disappears briefly: min {min(present):.2f}")
        if at_start and not at_end and any(b > a + 0.1 for a, b in zip(present, present[1:])):
            problems.append(f"{part} (leaves) flashes up")
        if not at_start and at_end and any(b < a - 0.1 and a > 0.3 for a, b in zip(present, present[1:])):
            problems.append(f"{part} (arrives) flickers")
    visible = [sum(1 for k, v in frame.items() if not k.startswith(("leak:", "pos:")) and v > 0.5) for frame in samples]
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
            last = await overlay.evaluate("window.__lastSwitch || {}")
            problems = problems_in(await overlay.evaluate("window.__samples"), tuple(last.get("jump") or ()))
            if "brand" in (last.get("cross") or []):
                problems.append("brand is cross-faded instead of staying")
            total += len(problems)
            print(f"{start:>20} → {target:<20}", "ok" if not problems else problems)
    finish(total == 0 and not errors, f"{transition}: {total} problem(s) · JavaScript errors: {errors[:3]}")


if __name__ == "__main__":
    asyncio.run(main())
