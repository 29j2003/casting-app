import asyncio, json, sys
from playwright.async_api import async_playwright
PAARE = [("intro","cast-duo"),("cast-duo","cast-duo-interview"),("cast-duo-interview","cast-solo-clips"),("cast-solo-clips","cast-duo-clips"),("cast-duo-clips","cast-solo"),("cast-solo","intro"),("intro","pause"),("pause","ende"),("ende","map-veto"),("map-veto","spieler"),("spieler","ingame"),("ingame","cast-duo")]
SAMPLER = """
window.__ids = window.__ids || new WeakMap(); window.__nid = window.__nid || 0; window.__proben = [];
const sichtbar = e => { let o = 1; for (let x = e; x && x !== document.body; x = x.parentElement) { const cs = getComputedStyle(x); if (cs.display === 'none' || cs.visibility === 'hidden') return 0; o *= parseFloat(cs.opacity); } return o; };
(function lauf(){
  const probe = {};
  document.querySelectorAll('.schicht > [data-teil]').forEach(e => { if (!window.__ids.has(e)) window.__ids.set(e, ++window.__nid + ':' + e.dataset.teil); probe[window.__ids.get(e)] = sichtbar(e); });
  window.__proben.push(probe); if (window.__proben.length < 200) requestAnimationFrame(lauf); })();
"""
async def main():
    art = sys.argv[1] if len(sys.argv) > 1 else "blende"
    async with async_playwright() as p:
        b = await p.chromium.launch()
        ov = await (await b.new_context(viewport={"width":1920,"height":1080})).new_page()
        pg = await (await b.new_context(viewport={"width":1500,"height":900})).new_page()
        await pg.goto("http://localhost:8787/steuerung.html"); await pg.wait_for_timeout(1200)
        await pg.evaluate("Z.sendung.aktiv=true; Z.sendung.dauer=900; Z.sendung.szene='intro'; Z.sponsoren.listen={}; Z.hintergrund.videos=[]; alles(); senden();")
        await ov.goto("http://localhost:8787/overlay.html"); await ov.wait_for_timeout(2500)
        summe = 0
        for a, z in PAARE:
            await pg.evaluate(f"Z.sendung.uebergang='schnitt'; szeneWechseln('{a}')"); await ov.wait_for_timeout(1300)
            await ov.evaluate(SAMPLER); await ov.wait_for_timeout(100)
            await pg.evaluate(f"Z.sendung.uebergang='{art}'; szeneWechseln('{z}')")
            await ov.wait_for_timeout(3300)
            proben = await ov.evaluate("window.__proben")
            alle = set().union(*[set(x) for x in proben])
            probleme = []
            for k in alle:
                v = [x.get(k) for x in proben]
                da = [o for o in v if o is not None]
                teil = k.split(":")[1]
                if teil in ("musik", "sponsor"):
                    if max(da) > 0.05: probleme.append(f"{teil} blitzt auf ({max(da):.2f})")
                    continue
                am_anfang, am_ende = v[0] is not None, v[-1] is not None
                if am_anfang and am_ende and min(da) < 0.9: probleme.append(f"{teil} (bleibt) verschwindet kurz: min {min(da):.2f}")
                if am_anfang and not am_ende:
                    for i in range(1, len(da)):
                        if da[i] > da[i-1] + 0.1: probleme.append(f"{teil} (geht) blitzt auf"); break
                if not am_anfang and am_ende:
                    for i in range(1, len(da)):
                        if da[i] < da[i-1] - 0.1 and da[i-1] > 0.3: probleme.append(f"{teil} (kommt) flackert"); break
            # leere Bilder: nichts sichtbar, obwohl vorher und nachher etwas da ist
            n = [sum(1 for o in x.values() if o > 0.5) for x in proben]
            leer = [i for i in range(1, len(n) - 1) if n[i] == 0 and max(n[:i]) > 0 and max(n[i:]) > 0]
            if leer: probleme.append(f"{len(leer)} leere Bilder")
            summe += len(probleme)
            print(f"{a:>20} → {z:<20}", "ok" if not probleme else probleme)
        print(art, "– Auffälligkeiten:", summe)
        await b.close()
asyncio.run(main())
