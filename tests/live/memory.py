"""Memory over a long session: the app window's memory must stay flat.

    python tests/live/memory.py [rounds]          (default 8)

Drives the control page inside the desktop app window (preview included) through DevTools, so the app
must run with remote debugging: QTWEBENGINE_REMOTE_DEBUGGING=9222 python -m casting_app

Each round: 60 scene switches with random transitions, 10 DACH page switches, audio on/off. After each
round (and a garbage collection) it measures JS heap, DOM elements and listeners of the control page and
the memory (PSS) of all app processes (Linux). What counts is the growth in the second half, after the
caches have warmed up.
"""

import asyncio
import os
import random
import sys

from cdp import PageConnection
from common import DACH_PAGES, SCENES, TRANSITIONS, finish

LIVE_DOM = "document.getElementsByTagName('*').length + $('frame').contentDocument.getElementsByTagName('*').length"
ALLOWED_GROWTH = {"heap_mb": 5, "dom": 200, "listeners": 100}


def app_memory_mb() -> float | None:
    """Sum of PSS of the app and its web engine processes (shared memory counted proportionally) – Linux only."""
    if not os.path.isdir("/proc"):
        return None
    total_kb = 0
    for pid in filter(str.isdigit, os.listdir("/proc")):
        try:
            with open(f"/proc/{pid}/cmdline", "rb") as f:
                command = f.read()
            if not any(name in command for name in (b"casting_app", b"QtWebEngineProcess", b"Casting-App")):
                continue
            with open(f"/proc/{pid}/smaps_rollup") as f:
                total_kb += sum(int(line.split()[1]) for line in f if line.startswith("Pss:"))
        except OSError:
            pass
    return total_kb / 1024


async def measure(page) -> tuple[float, int, float, float | None]:
    """JS heap (MB), live DOM elements, event listeners, app memory (MB) – after garbage collection."""
    await page.send("HeapProfiler.collectGarbage")
    await asyncio.sleep(0.5)
    metrics = {m["name"]: m["value"] for m in (await page.send("Performance.getMetrics"))["metrics"]}
    return metrics["JSHeapUsedSize"] / 1048576, await page.evaluate(LIVE_DOM), metrics["JSEventListeners"], app_memory_mb()


def describe(values) -> str:
    heap, dom, listeners, memory = values
    return f"JS {heap:.1f} MB · DOM {dom} elements · {int(listeners)} listeners · app {memory or 0:.0f} MB"


async def main() -> None:
    rounds = int(sys.argv[1]) if len(sys.argv) > 1 else 8
    page = await PageConnection.open()
    await page.send("Performance.enable")
    await page.evaluate("Z.broadcast.active = true; Z.broadcast.duration = 500; themeChoose('regular'); send(); 1")
    await asyncio.sleep(1.5)
    values = [await measure(page)]
    print("start:", describe(values[0]))
    random.seed(7)
    switches = 0
    for round_number in range(1, rounds + 1):
        for _ in range(60):
            await page.evaluate(f"Z.broadcast.transition = {random.choice(TRANSITIONS)!r}; sceneSwitch({random.choice(SCENES)!r}); 1")
            await asyncio.sleep(random.randint(80, 400) / 1000)
            switches += 1
        await page.evaluate("themeChoose('dachcs-official'); send(); 1")
        for _ in range(10):
            await page.evaluate(f"dachSwitch({random.choice(list(DACH_PAGES))!r}); 1")
            await asyncio.sleep(0.2)
            switches += 1
        await page.evaluate("themeChoose('regular'); send(); $('appAudio').click(); $('appAudio').click(); 1")
        await asyncio.sleep(1.5)
        values.append(await measure(page))
        print(f"round {round_number}: {switches} switches ·", describe(values[-1]))
    await page.close()
    middle, end = values[len(values) // 2], values[-1]
    heap, dom, listeners = end[0] - middle[0], end[1] - middle[1], end[2] - middle[2]
    stable = heap < ALLOWED_GROWTH["heap_mb"] and dom < ALLOWED_GROWTH["dom"] and listeners < ALLOWED_GROWTH["listeners"]
    finish(stable, f"second half: JS {heap:+.1f} MB · DOM {dom:+d} · listeners {listeners:+.0f} · "
                   f"app {((end[3] or 0) - (middle[3] or 0)):+.0f} MB")


asyncio.run(main())
