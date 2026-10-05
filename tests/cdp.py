"""Minimal Chrome DevTools Protocol client for tests that drive the app window.

The desktop app exposes DevTools when started with QTWEBENGINE_REMOTE_DEBUGGING=9222.
(Playwright cannot attach to Qt WebEngine, so the tests talk CDP directly.)
"""

import itertools
import json
import urllib.request

import websockets


class PageConnection:
    """CDP connection to the control page of the app window."""

    def __init__(self, socket):
        self._socket = socket
        self._ids = itertools.count(1)

    @classmethod
    async def open(cls, port: int = 9222, url_part: str = "steuerung.html") -> "PageConnection":
        targets = json.load(urllib.request.urlopen(f"http://127.0.0.1:{port}/json"))
        target = next(t for t in targets if t.get("type") == "page" and url_part in t.get("url", ""))
        socket = await websockets.connect(target["webSocketDebuggerUrl"], max_size=50_000_000)
        return cls(socket)

    async def send(self, method: str, params: dict | None = None) -> dict:
        message_id = next(self._ids)
        await self._socket.send(json.dumps({"id": message_id, "method": method, "params": params or {}}))
        while True:
            answer = json.loads(await self._socket.recv())
            if answer.get("id") == message_id:
                if "error" in answer:
                    raise RuntimeError(answer["error"])
                return answer.get("result", {})

    async def evaluate(self, expression: str):
        """Evaluate JavaScript in the control page and return the (JSON) result."""
        result = await self.send("Runtime.evaluate", {"expression": expression, "awaitPromise": True, "returnByValue": True})
        if "exceptionDetails" in result:
            raise RuntimeError(result["exceptionDetails"].get("text"))
        return result.get("result", {}).get("value")

    async def close(self) -> None:
        await self._socket.close()
