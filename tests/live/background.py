"""Frame by frame: the background video fades together with the scene – never a hard cut, never the theme in between.

    python tests/live/background.py

Creates two test videos (bg-a.webm, bg-b.webm, VP9 – plays everywhere) in the app's videos folder with the app's FFmpeg.
Playlist A runs in "intro", playlist B in "pause", nothing in "ingame". For each switch the overlay records on every
animation frame how much of the video and of the theme background shows. Rules:
  * intro → ingame: the video fades out smoothly with the scene (no jump), the theme never shows up
  * ingame → intro: the video fades in smoothly, the theme never shows up
  * intro → pause: one video crosses into the other – the picture never goes dark or shows the theme
"""

import asyncio
import json
import subprocess
import sys
import urllib.request
from pathlib import Path

from common import BASE_URL, access_key, control_and_overlay, finish, switch_scene

FRAMES = 150
PLAYLISTS = """
Z.background.playlists = [
  { id: 'pa', name: 'A', kind: 'loop', videos: ['media/videos/bg-a.webm'], order: 'seq', transition: 'fade', fade: 800, scenes: ['intro'] },
  { id: 'pb', name: 'B', kind: 'loop', videos: ['media/videos/bg-b.webm'], order: 'seq', transition: 'fade', fade: 800, scenes: ['pause'] }];
Z.background.override = null; Z.broadcast.duration = 1000; bgApply('intro'); send();
"""
# runs in the overlay: per frame {video: visible share of running videos, theme: visible share of the theme background}
SAMPLER = """
window.__samples = [];
(function sample() {
  const b = document.querySelector('.backdrop'), o = e => parseFloat(getComputedStyle(e).opacity);
  const shown = [...b.querySelectorAll('video:not(.bg-clip)')].filter(v => v.getAttribute('src') && v.readyState >= 2);
  const video = Math.min(1, shown.reduce((sum, v) => sum + o(v), 0)) * o(b);
  const empty = b.querySelector('.bg-empty');
  const theme = (getComputedStyle(empty).display === 'none' ? 0 : o(empty)) * o(b);
  window.__samples.push({ video, theme });
  if (window.__samples.length < %d) requestAnimationFrame(sample); })();
""" % FRAMES


def check(name: str, samples: list[dict], start: float, end: float, steady: bool = False) -> list[str]:
    """Problems of one switch: jumps in the video share, the theme showing, the wrong start or end."""
    video = [s["video"] for s in samples]
    problems = []
    jumps = [round(b - a, 2) for a, b in zip(video, video[1:]) if abs(b - a) > 0.25]
    if jumps:
        problems.append(f"{name}: Video springt {jumps}")
    if max(s["theme"] for s in samples) > 0.05:
        problems.append(f"{name}: Theme-Hintergrund blitzt auf ({max(s['theme'] for s in samples):.2f})")
    if abs(video[0] - start) > 0.1 or abs(video[-1] - end) > 0.1:
        problems.append(f"{name}: Video {video[0]:.2f} → {video[-1]:.2f}, erwartet {start} → {end}")
    if steady and min(video) < 0.9:
        problems.append(f"{name}: Bild wird zwischendurch dunkel (min {min(video):.2f})")
    return problems


async def make_videos() -> None:
    """Two short test videos in the app's videos folder (asked from the app, so it works with any HOME)."""
    sys.path.insert(0, str(Path(__file__).resolve().parents[2]))
    from casting_app.server.media_converter import find_ffmpeg
    request = urllib.request.Request(BASE_URL + "/api/videos", headers={"X-Casting-Access": await access_key()})
    folder = Path(json.loads(urllib.request.urlopen(request, timeout=10).read())["folder"])
    for name, source in (("bg-a.webm", "testsrc2"), ("bg-b.webm", "smptebars")):
        if not (folder / name).is_file():
            subprocess.run([find_ffmpeg(), "-v", "error", "-y", "-f", "lavfi", "-i", f"{source}=size=640x360:rate=25", "-t", "20",
                            "-c:v", "libvpx-vp9", "-b:v", "300k", "-deadline", "realtime", str(folder / name)], check=True)


async def main() -> None:
    await make_videos()
    async with control_and_overlay() as (control, overlay, errors):
        await control.evaluate(PLAYLISTS)
        await overlay.wait_for_timeout(3000)
        problems = []
        for name, scene, start, end, steady in [("Intro → Ingame", "ingame", 1, 0, False), ("Ingame → Intro", "intro", 0, 1, False),
                                                ("Intro → Pause", "pause", 1, 1, True)]:
            await overlay.evaluate(SAMPLER)
            await switch_scene(control, scene, "fade")
            for _ in range(200):                          # (no wait_for_function: the overlay's CSP forbids eval)
                if await overlay.evaluate("window.__samples.length") >= FRAMES:
                    break
                await overlay.wait_for_timeout(100)
            problems += check(name, await overlay.evaluate("window.__samples"), start, end, steady)
            await overlay.wait_for_timeout(2500)
    finish(not problems and not errors, "; ".join(problems) or f"Hintergrund blendet mit der Szene · JavaScript errors: {errors}")


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
