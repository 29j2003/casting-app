# Speicher über eine lange Sitzung: steuert das App-Fenster der Desktop-App selbst (Vorschau inklusive) mit vielen
# Szenenwechseln, Übergängen, DACH-Seiten und Ton an/aus und misst nach jeder Runde (nach Speicherbereinigung)
# JS-Speicher, DOM-Elemente und Listener der Steuerseite sowie den Arbeitsspeicher (PSS) aller App-Prozesse (Linux).
#   App mit Fernsteuerung starten:  npx electron . --remote-debugging-port=9222   (als root zusätzlich --no-sandbox)
#   python3 tests/test_speicher.py [Runden]
import asyncio, os, random, sys
from playwright.async_api import async_playwright

SZ = ["intro", "cast-duo", "cast-solo", "cast-duo-clips", "cast-solo-clips", "cast-duo-interview", "cast-solo-interview",
      "map-veto", "spieler", "serie", "sponsoren", "ingame", "pause", "ende"]
DACH = ["dach-duocast", "dach-singlecast", "dach-pause", "dach-tabelle", "dach-overview"]

def app_rss_mb():
    # Summe PSS aller Prozesse der Desktop-App (Haupt-, GPU-, Renderer-Prozesse; geteilter Speicher anteilig) – nur Linux
    if not os.path.isdir("/proc"): return None
    summe = 0
    for pid in os.listdir("/proc"):
        if not pid.isdigit(): continue
        try:
            cmd = open(f"/proc/{pid}/cmdline", "rb").read()
            if b"electron" not in cmd or b"xvfb" in cmd: continue
            for z in open(f"/proc/{pid}/smaps_rollup"):
                if z.startswith("Pss:"): summe += int(z.split()[1])
        except Exception: pass
    return summe / 1024

async def main():
    runden = int(sys.argv[1]) if len(sys.argv) > 1 else 8
    async with async_playwright() as p:
        b = await p.chromium.connect_over_cdp("http://localhost:9222")
        pg = next(x for x in b.contexts[0].pages if "steuerung.html" in x.url)
        cdp = await pg.context.new_cdp_session(pg)
        await cdp.send("Performance.enable")
        fehler = []; pg.on("pageerror", lambda e: fehler.append(str(e)))
        await pg.evaluate("Z.sendung.aktiv=true; Z.sendung.dauer=500; themeWaehlen('regulaer'); senden();")
        await pg.wait_for_timeout(1500)
        async def messen():
            await cdp.send("HeapProfiler.collectGarbage"); await pg.wait_for_timeout(500)
            m = {x["name"]: x["value"] for x in (await cdp.send("Performance.getMetrics"))["metrics"]}
            # Elemente, die wirklich im DOM hängen (Steuerseite + Vorschau); der Zähler „Nodes“ enthält auch noch nicht
            # weggeräumte Knoten und schwankt deshalb
            dom = await pg.evaluate("document.getElementsByTagName('*').length + $('frame').contentDocument.getElementsByTagName('*').length")
            return m["JSHeapUsedSize"] / 1048576, dom, app_rss_mb(), m["JSEventListeners"]
        start = await messen(); werte = [start]
        print(f"Start: JS {start[0]:.1f} MB · DOM {int(start[1])} Elemente · Listener {int(start[3])} · App gesamt {start[2] or 0:.0f} MB")
        random.seed(7); n = 0
        for r in range(runden):
            for _ in range(60):
                await pg.evaluate(f"Z.sendung.uebergang='{random.choice(['schnitt','blende','schieben','wischen','stinger'])}'; szeneWechseln('{random.choice(SZ)}')")
                await pg.wait_for_timeout(random.randint(80, 400)); n += 1
            await pg.evaluate("themeWaehlen('dachcs-offiziell'); senden();")
            for _ in range(10):
                await pg.evaluate(f"dachWechseln('{random.choice(DACH)}')"); await pg.wait_for_timeout(200); n += 1
            await pg.evaluate("themeWaehlen('regulaer'); senden(); $('appTon').click(); $('appTon').click();")
            await pg.wait_for_timeout(1500)
            w = await messen(); werte.append(w)
            print(f"Runde {r + 1}: {n} Wechsel · JS {w[0]:.1f} MB · DOM {int(w[1])} Elemente · Listener {int(w[3])} · App gesamt {w[2] or 0:.0f} MB")
        # Wachstum in der zweiten Hälfte (nach dem Aufwärmen) zählt
        mitte = werte[len(werte) // 2]; ende = werte[-1]
        js = ende[0] - mitte[0]; dom = ende[1] - mitte[1]; lis = ende[3] - mitte[3]
        print(f"Zweite Hälfte: JS {js:+.1f} MB · DOM {dom:+.0f} Elemente · Listener {lis:+.0f} · App {((ende[2] or 0) - (mitte[2] or 0)):+.0f} MB · Fehler: {fehler[:3]}")
        ok = js < 5 and dom < 200 and lis < 100 and not fehler
        print("Speicher stabil" if ok else "Speicher wächst – bitte prüfen")
        sys.exit(0 if ok else 1)

asyncio.run(main())
