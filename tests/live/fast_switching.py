"""Fast clicking: rapid scene switches never leave an empty picture; audio controls reach OBS.

    python tests/live/fast_switching.py

Needs no real OBS: a small fake obs-websocket server on port 4455 answers the control page.
  1. Audio (Live → Ton): volume, mute, monitoring and delay of the overlay source are sent to OBS.
  2. Own scenes: 6 rounds of 8 quick switches with random transitions – afterwards one layer with
     visible parts, stinger hidden.
  3. DACH CS – official: 10 rounds of 5 quick page switches – afterwards exactly the last chosen page is visible.
  4. The ⏻ button opens the close question with its three choices.
"""

import asyncio
import json
import random

import websockets
from common import DACH_PAGES, control_and_overlay, finish, switch_scene

OBS_PORT = 4455
SOURCE = "Cast – Overlay"
sent_to_obs: list[tuple[str, dict]] = []      # every Set… request the control page sent


async def fake_obs(socket) -> None:
    """obs-websocket 5 without password: knows one input with audio and records all changes."""
    await socket.send(json.dumps({"op": 0, "d": {"rpcVersion": 1}}))
    await socket.recv()
    await socket.send(json.dumps({"op": 2, "d": {"negotiatedRpcVersion": 1}}))
    volume, muted, offset, monitor = 1.0, False, 0, "OBS_MONITORING_TYPE_NONE"
    answers = {"GetInputList": {"inputs": [{"inputName": SOURCE}]},
               "GetSceneList": {"scenes": [], "currentProgramSceneName": ""},
               "GetSceneTransitionList": {"transitions": [], "currentSceneTransitionName": ""},
               "GetInputVolume": {"inputVolumeMul": volume}, "GetInputMute": {"inputMuted": muted},
               "GetInputAudioSyncOffset": {"inputAudioSyncOffset": offset}, "GetInputAudioMonitorType": {"monitorType": monitor}}
    async for raw in socket:
        request = json.loads(raw)["d"]
        kind = request.get("requestType")
        if not kind:
            continue
        if kind.startswith("SetInput"):
            sent_to_obs.append((kind, {k: v for k, v in request.get("requestData", {}).items() if k != "inputName"}))
        await socket.send(json.dumps({"op": 7, "d": {"requestType": kind, "requestId": request["requestId"],
                                                     "requestStatus": {"result": True, "code": 100},
                                                     "responseData": answers.get(kind, {})}}))


async def check_audio(control) -> bool:
    """Change volume, mute, monitoring and delay of the first audio row; all four must reach OBS."""
    row = "#audioList .audio-z"
    await control.evaluate("document.querySelectorAll('[data-area=audio]').forEach(d => d.open = true)")   # (2.14: starts collapsed)
    await control.evaluate(f"""(() => {{ const r = document.querySelector('{row} input[type=range]');
        r.value = 180; r.dispatchEvent(new Event('input')); }})()""")
    await control.wait_for_timeout(300)
    await control.click(f"{row} .audio-mute")
    await control.click(f"{row} .gfx-more")
    await control.select_option(f"{row} .audio-monitor-choice", "OBS_MONITORING_TYPE_MONITOR_ONLY")
    await control.fill(f"{row} input[type=number]", "250")
    await control.dispatch_event(f"{row} input[type=number]", "change")
    await control.wait_for_timeout(400)
    print("sent to OBS:", sent_to_obs)
    return {kind for kind, _ in sent_to_obs} == {"SetInputVolume", "SetInputMute", "SetInputAudioMonitorType", "SetInputAudioSyncOffset"}


async def check_own_scenes(control, overlay) -> int:
    """Quick switches between own scenes; returns the number of rounds that ended with a bad picture."""
    scenes = ["intro", "cast-duo", "pause", "end", "map-veto", "cast-solo", "players"]
    bad = 0
    for _ in range(6):
        for _ in range(8):
            await switch_scene(control, random.choice(scenes), random.choice(["fade", "slide", "wipe", "stinger"]))
            await control.wait_for_timeout(random.randint(60, 350))
        await overlay.wait_for_timeout(2500)
        layers, visible_parts, stinger = await overlay.evaluate("""(() => { const s = [...document.querySelectorAll('.layer')];
            const visible = s.length ? [...s[s.length - 1].children].filter(e => parseFloat(getComputedStyle(e).opacity) > 0.9).length : 0;
            return [s.length, visible, getComputedStyle(document.querySelector('.stinger')).visibility]; })()""")
        if layers != 1 or visible_parts < 2 or stinger != "hidden":
            bad += 1
            print(f"  own scenes: {layers} layer(s), {visible_parts} visible part(s), stinger {stinger}")
    return bad


async def check_dach_pages(control, overlay) -> int:
    """Quick switches between DACH pages; returns the number of rounds that ended on the wrong page."""
    await control.evaluate("themeChoose('dachcs-official'); send();")
    await overlay.wait_for_timeout(2000)
    bad = 0
    for _ in range(10):
        target = None
        for _ in range(5):
            target = random.choice(list(DACH_PAGES))
            transition = random.choice(["fade", "wipe", "cut", "stinger"])
            await control.evaluate(f"Z.broadcast.transition = {transition!r}; dachSwitch({target!r})")
            await control.wait_for_timeout(random.randint(80, 400))
        await overlay.wait_for_timeout(3000)
        # the address carries the access key (?access=…) – compare the page only
        shown = await overlay.evaluate("[...document.querySelectorAll('.dach-page.on')].map(f => (f.getAttribute('src') || '').split('?')[0])")
        if shown != ["/dach/" + DACH_PAGES[target]]:
            bad += 1
            print(f"  DACH: shows {shown}, expected {target}")
    await control.evaluate("themeChoose('regular'); send();")
    return bad


async def main() -> None:
    async with websockets.serve(fake_obs, "127.0.0.1", OBS_PORT):
        async with control_and_overlay() as (control, overlay, errors):
            # the control page connects to OBS on port 4455 by itself (connection.js) – here: the fake OBS
            await control.evaluate("localStorage.setItem('cast-steps-off', '1'); stepsDraw(); themeChoose('regular'); send();")
            await control.wait_for_timeout(3500)
            random.seed(3)
            audio_ok = await check_audio(control)
            own_bad = await check_own_scenes(control, overlay)
            dach_bad = await check_dach_pages(control, overlay)
            await control.click("#quitButton")
            await control.wait_for_timeout(200)
            choices = await control.evaluate("[...document.querySelectorAll('.question:not(#question) button')].map(b => b.textContent)")
            await control.click(".question:not(#question) [data-w='']")
    close_ok = choices == ["Ganz beenden", "Nur Fenster schließen", "Abbrechen"]
    finish(audio_ok and own_bad == 0 and dach_bad == 0 and close_ok and not errors,
           f"audio {'ok' if audio_ok else 'missing'} · own scenes {6 - own_bad}/6 · DACH {10 - dach_bad}/10 · "
           f"close question {choices} · JavaScript errors: {errors[:3]}")


asyncio.run(main())
