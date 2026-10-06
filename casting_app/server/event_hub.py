"""Live connection to the control page and the overlays (Server-Sent Events).

Every connected page gets a queue; any thread can broadcast into the queues and the
page's own request thread writes them to the socket. A page that stops reading
(its queue overflows) is disconnected instead of letting memory grow.
"""

import json
import queue
import threading
import time

MAX_CLIENTS = 40
KEEPALIVE_SECONDS = 20
MAX_QUEUED_EVENTS = 500
CONTROL_PAGE = "control"          # page name the control page reports itself with


class EventClient:
    """One connected page (control page or overlay)."""

    def __init__(self, page: str, from_obs: bool, version: str, trusted: bool = False):
        """page: name the page reported (scene or "control"); from_obs: runs inside OBS; version: its app version;
        trusted: the page has the access key (otherwise it gets the state without camera links)."""
        self.page = page
        self.trusted = trusted
        self.from_obs = from_obs
        self.version = version
        self.connected_at = int(time.time() * 1000)
        self._queue: queue.Queue = queue.Queue(MAX_QUEUED_EVENTS)
        self.closed = False

    @property
    def is_control_page(self) -> bool:
        """True for the control page (it gets the client list; overlays get state and reload)."""
        return self.page == CONTROL_PAGE

    def send(self, event: str, data: str) -> None:
        """Queue one event; data must not contain line breaks."""
        try:
            self._queue.put_nowait(f"event: {event}\ndata: {data}\n\n")
        except queue.Full:
            self.closed = True

    def next_message(self) -> str:
        """Next message to write, or a keepalive comment after a quiet period."""
        try:
            return self._queue.get(timeout=KEEPALIVE_SECONDS)
        except queue.Empty:
            return ": still\n\n"

    def describe(self) -> dict:
        """Client info for the control page."""
        return {"page": self.page, "obs": self.from_obs, "since": self.connected_at, "v": self.version, "key": self.trusted}


class EventHub:
    """All connected pages and the broadcasts to them."""

    def __init__(self):
        self._clients: set[EventClient] = set()
        self._lock = threading.Lock()

    def clients(self) -> list[EventClient]:
        """All connected pages (a copy)."""
        with self._lock:
            return list(self._clients)

    def count(self) -> int:
        """Number of connected pages."""
        with self._lock:
            return len(self._clients)

    def add(self, client: EventClient) -> bool:
        """Register a page; False when too many are connected."""
        with self._lock:
            if len(self._clients) >= MAX_CLIENTS:
                return False
            self._clients.add(client)
        self.send_client_list()
        return True

    def remove(self, client: EventClient) -> None:
        """Forget a page that disconnected and tell the control page."""
        client.closed = True
        with self._lock:
            self._clients.discard(client)
        self.send_client_list()

    def broadcast(self, event: str, data: str, *, overlays_only: bool = False, public_data: str | None = None) -> int:
        """Send an event to all pages (or only to overlays); returns the number of receivers.

        public_data: what pages without the access key get instead of `data` (None = the same for all).
        """
        receivers = [c for c in self.clients() if not (overlays_only and c.is_control_page)]
        for client in receivers:
            client.send(event, data if client.trusted or public_data is None else public_data)
        return len(receivers)

    def send_client_list(self) -> None:
        """Tell the control page(s) which pages are connected."""
        listing = json.dumps({"clients": [c.describe() for c in self.clients()]})
        for client in self.clients():
            if client.is_control_page:
                client.send("status", listing)
