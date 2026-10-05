# Speicher über eine lange Sitzung: steuert das App-Fenster der Desktop-App selbst (Vorschau inklusive) mit vielen
# Szenenwechseln, Übergängen, DACH-Seiten und Ton an/aus und misst nach jeder Runde (nach Speicherbereinigung)
# JS-Speicher, DOM-Elemente und Listener der Steuerseite sowie den Arbeitsspeicher (PSS) aller App-Prozesse (Linux).
#   App mit Fernsteuerung starten:  QTWEBENGINE_REMOTE_DEBUGGING=9222 python -m casting_app
#   python3 tests/test_speicher.py [Runden]
import asyncio
import os
import random
import sys

from cdp import PageConnection

SCENES = ["intro", "cast-duo", "cast-solo", "cast-duo-clips", "cast-solo-clips", "cast-duo-interview", "cast-solo-interview",
          "map-veto", "players", "series", "sponsors", "ingame", "pause", "end"]
DACH_PAGES = ["dach-duocast", "dach-singlecast", "dach-pause", "dach-table", "dach-overview"]
TRANSITIONS = ["cut", "fade", "slide", "wipe", "stinger"]
LIVE_DOM = "document.getElementsByTagName('*').length + $('frame').contentDocument.getElementsByTagName('*').length"


def app_memory_mb():
    """Sum of PSS of the app and its web engine processes (shared memory counted proportionally) – Linux only."""
    if not os.path.isdir("/proc"):
        return None
    total_kb = 0
    for pid in filter(str.isdigit, os.listdir("/proc")):
        try:
            command = open(f"/proc/{pid}/cmdline", "rb").read()
            if b"casting_app" not in command and b"QtWebEngineProcess" not in command and b"Casting-App" not in command:
                continue
            for line in open(f"/proc/{pid}/smaps_rollup"):
                if line.startswith("Pss:"):
                    total_kb += int(line.split()[1])
        except OSError:
            pass
    return total_kb / 1024


async def measure(page):
    """JS heap (MB), live DOM elements, event listeners, app memory (MB) – after garbage collection."""
    await page.send("HeapProfiler.collectGarbage")
    await asyncio.sleep(0.5)
    metrics = {m["name"]: m["value"] for m in (await page.send("Performance.getMetrics"))["metrics"]}
    return metrics["JSHeapUsedSize"] / 1048576, await page.evaluate(LIVE_DOM), metrics["JSEventListeners"], app_memory_mb()


def describe(values):
    heap, dom, listeners, memory = values
    return f"JS {heap:.1f} MB · DOM {dom} Elemente · Listener {int(listeners)} · App gesamt {memory or 0:.0f} MB"


async def main():
    rounds = int(sys.argv[1]) if len(sys.argv) > 1 else 8
    page = await PageConnection.open()
    await page.send("Performance.enable")
    await page.evaluate("Z.broadcast.active=true; Z.broadcast.duration=500; themeChoose('regular'); send(); 1")
    await asyncio.sleep(1.5)
    values = [await measure(page)]
    print("Start:", describe(values[0]))
    random.seed(7)
    switches = 0
    for round_number in range(rounds):
        for _ in range(60):
            await page.evaluate(f"Z.broadcast.transition='{random.choice(TRANSITIONS)}'; sceneSwitch('{random.choice(SCENES)}'); 1")
            await asyncio.sleep(random.randint(80, 400) / 1000)
            switches += 1
        await page.evaluate("themeChoose('dachcs-official'); send(); 1")
        for _ in range(10):
            await page.evaluate(f"dachSwitch('{random.choice(DACH_PAGES)}'); 1")
            await asyncio.sleep(0.2)
            switches += 1
        await page.evaluate("themeChoose('regular'); send(); $('appAudio').click(); $('appAudio').click(); 1")
        await asyncio.sleep(1.5)
        values.append(await measure(page))
        print(f"Runde {round_number + 1}: {switches} Wechsel ·", describe(values[-1]))
    # growth in the second half (after warming up) is what counts
    middle, end = values[len(values) // 2], values[-1]
    heap, dom, listeners = end[0] - middle[0], end[1] - middle[1], end[2] - middle[2]
    print(f"Zweite Hälfte: JS {heap:+.1f} MB · DOM {dom:+d} Elemente · Listener {listeners:+.0f} · "
          f"App {((end[3] or 0) - (middle[3] or 0)):+.0f} MB")
    stable = heap < 5 and dom < 200 and listeners < 100
    print("Speicher stabil" if stable else "Speicher wächst – bitte prüfen")
    await page.close()
    sys.exit(0 if stable else 1)


asyncio.run(main())
