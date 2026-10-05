import asyncio, json, random
import websockets
from playwright.async_api import async_playwright
gesetzt = []
async def obs(ws):
    await ws.send(json.dumps({"op":0,"d":{"rpcVersion":1}})); await ws.recv(); await ws.send(json.dumps({"op":2,"d":{"negotiatedRpcVersion":1}}))
    werte = {"Cast – Overlay": [1.0, False, 0, "OBS_MONITORING_TYPE_NONE"]}
    async for raw in ws:
        d = json.loads(raw)["d"]; t = d.get("requestType"); rd = d.get("requestData", {}); a = {}
        if t == "GetInputList": a = {"inputs": [{"inputName": "Cast – Overlay"}]}
        elif t == "GetSceneList": a = {"scenes": [], "currentProgramSceneName": ""}
        elif t == "GetSceneTransitionList": a = {"transitions": [], "currentSceneTransitionName": ""}
        elif t == "GetInputVolume": a = {"inputVolumeMul": werte[rd["inputName"]][0]}
        elif t == "GetInputMute": a = {"inputMuted": werte[rd["inputName"]][1]}
        elif t == "GetInputAudioSyncOffset": a = {"inputAudioSyncOffset": werte[rd["inputName"]][2]}
        elif t == "GetInputAudioMonitorType": a = {"monitorType": werte[rd["inputName"]][3]}
        elif t and t.startswith("SetInput"): gesetzt.append((t, {k: v for k, v in rd.items() if k != "inputName"}))
        if t: await ws.send(json.dumps({"op":7,"d":{"requestType":t,"requestId":d["requestId"],"requestStatus":{"result":True,"code":100},"responseData":a}}))
async def main():
    async with websockets.serve(obs, "127.0.0.1", 4455):
        async with async_playwright() as p:
            b = await p.chromium.launch()
            pg = await (await b.new_context(viewport={"width":1500,"height":900})).new_page(); fehler = []; pg.on("pageerror", lambda e: fehler.append(str(e)))
            await pg.goto("http://localhost:8787/control.html"); await pg.wait_for_timeout(800)
            await pg.evaluate("localStorage.setItem('cast-steps-off','1'); stepsDraw(); Z.broadcast.active=true; themeChoose('regular'); send(); channel.obs.connect ? channel.obs.connect('ws://127.0.0.1:4455','') : null")
            await pg.wait_for_timeout(3500)
            print("Ton-Zeilen (aus OBS):", await pg.evaluate("[...document.querySelectorAll('#audioList .audio-z .tname b')].map(b=>b.textContent)"))
            if await pg.evaluate("!!document.querySelector('#audioList .audio-z input[type=range]')"):
                await pg.evaluate("(()=>{ const r=document.querySelector('#audioList .audio-z input[type=range]'); r.value=180; r.dispatchEvent(new Event('input')); })()"); await pg.wait_for_timeout(300)
                await pg.click("#audioList .audio-z .audio-mute"); await pg.click("#audioList .audio-z .gfx-more"); await pg.click("#audioList .audio-z [data-monitor=OBS_MONITORING_TYPE_MONITOR_ONLY]")
                await pg.fill("#audioList .audio-z input[type=number]", "250"); await pg.dispatch_event("#audioList .audio-z input[type=number]", "change"); await pg.wait_for_timeout(400)
            print("An OBS gesendet:", gesetzt)
            # schnelle Szenenwechsel (eigene Szenen) – am Ende darf nie ein leeres Bild stehen
            ov = await (await b.new_context(viewport={"width":1920,"height":1080})).new_page()
            await ov.goto("http://localhost:8787/overlay.html"); await ov.wait_for_timeout(1500)
            random.seed(3); sz = ["intro","cast-duo","pause","end","map-veto","cast-solo","players"]
            leer = 0
            for runde in range(6):
                for _ in range(8):
                    await pg.evaluate(f"Z.broadcast.transition='{random.choice(['fade','slide','wipe','stinger'])}'; sceneSwitch('{random.choice(sz)}')"); await pg.wait_for_timeout(random.randint(60, 350))
                await ov.wait_for_timeout(2500)
                z = await ov.evaluate("(()=>{ const s=[...document.querySelectorAll('.layer')]; const view=s.length ? [...s[s.length-1].children].filter(e=>parseFloat(getComputedStyle(e).opacity)>0.9).length : 0; return [s.length, view, getComputedStyle(document.querySelector('.stinger')).visibility] })()")
                if z[0] != 1 or z[1] < 2 or z[2] != "hidden": leer += 1; print("  Problem:", z)
            print("Eigene Szenen, 48 schnelle Wechsel:", "kein leeres Bild" if not leer else f"{leer} Probleme")
            # schnelle DACH-Wechsel
            await pg.evaluate("themeChoose('dachcs-official'); send();"); await ov.wait_for_timeout(2000)
            seiten = ["dach-duocast","dach-singlecast","dach-pause","dach-table","dach-overview"]
            ok = 0
            for runde in range(10):
                ziel = None
                for _ in range(5):
                    ziel = random.choice(seiten); await pg.evaluate(f"Z.broadcast.transition='{random.choice(['fade','wipe','cut','stinger'])}'; dachSwitch('{ziel}')"); await pg.wait_for_timeout(random.randint(80, 400))
                await ov.wait_for_timeout(3000)
                an = await ov.evaluate("[...document.querySelectorAll('.dach-page.on')].map(f=>f.getAttribute('src'))")
                if an == ["/dach/" + {"dach-duocast":"duocast","dach-singlecast":"singlecast","dach-pause":"pause","dach-table":"tabelle","dach-overview":"overview"}[ziel]]: ok += 1
                else: print("  DACH-Problem:", an, "erwartet", ziel)
            print(f"DACH, 25 schnelle Wechsel: {ok}/10 Runden mit richtiger, sichtbarer Seite")
            await pg.evaluate("themeChoose('regular'); send();")
            # Schließen: Klick auf ⏻ → Auswahl, Abbrechen
            await pg.click("#quitButton"); await pg.wait_for_timeout(200)
            print("Schließen-Auswahl:", await pg.evaluate("[...document.querySelectorAll('.question:not(#question) button')].map(b=>b.textContent)"))
            await pg.click(".question:not(#question) [data-w='']")
            print("Fehler:", fehler[:3])
            await b.close()
asyncio.run(main())
