import asyncio, random
from playwright.async_api import async_playwright
SZ = ["intro","cast-duo","cast-solo","cast-duo-clips","cast-solo-clips","cast-duo-interview","cast-solo-interview","map-veto","players","series","sponsors","ingame","pause","end"]
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch()
        ov = await (await b.new_context(viewport={"width":1920,"height":1080})).new_page()
        fehler = []; ov.on("pageerror", lambda e: fehler.append(str(e)))
        pg = await (await b.new_context(viewport={"width":1500,"height":900})).new_page()
        await pg.goto("http://localhost:8787/control.html"); await pg.wait_for_timeout(1200)
        await pg.evaluate("Z.broadcast.active=true; Z.broadcast.duration=500; Z.broadcast.scene='intro'; everything(); send();")
        await ov.goto("http://localhost:8787/overlay.html?test=1"); await ov.wait_for_timeout(1500)
        random.seed(3); ok = 0; n = 0
        for art in ["cut","fade","slide","wipe","stinger"]:
            folge = SZ[:]; random.shuffle(folge)
            for z in folge:
                await pg.evaluate(f"Z.broadcast.transition='{art}'; sceneSwitch('{z}')"); await ov.wait_for_timeout(1150)
                r = await ov.evaluate("[document.body.dataset.currentscene, document.querySelectorAll('.layer').length, [...document.querySelector('.layer').children].filter(e=>parseFloat(getComputedStyle(e).opacity)<0.99 && !e.classList.contains('sponsor') && !e.classList.contains('music')).length, getComputedStyle(document.querySelector('.stinger')).visibility]")
                n += 1
                if r[0] == z and r[1] == 1 and r[2] == 0 and r[3] == "hidden": ok += 1
                else: print("Problem", art, z, r)
        print(f"{ok}/{n} Wechsel sauber · Fehler: {fehler[:3]}")
        await b.close()
asyncio.run(main())
