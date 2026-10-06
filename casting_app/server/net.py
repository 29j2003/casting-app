"""Small HTTP building blocks shared by the app server (port 8787) and the CS2 network receiver (port 8788).

ExclusiveHTTPServer – a threading HTTP server that really owns its port. Python's default lets a second
                      server bind a port that is already listening on Windows (SO_REUSEADDR), so an old and a
                      new app could both answer on 8787; here the second one gets OSError instead.
content_length()    – the Content-Length header as a number, refusing "-1", "abc" and absurdly long values.
"""

import socket
import sys
from http.server import ThreadingHTTPServer


class ExclusiveHTTPServer(ThreadingHTTPServer):
    """ThreadingHTTPServer that fails with OSError if another program already listens on the port."""

    daemon_threads = True
    allow_reuse_address = sys.platform != "win32"      # on Linux/macOS it only skips TIME_WAIT after a restart

    def server_bind(self):
        if sys.platform == "win32":
            self.socket.setsockopt(socket.SOL_SOCKET, socket.SO_EXCLUSIVEADDRUSE, 1)
        super().server_bind()


def content_length(headers) -> int | None:
    """Content-Length as a number (0 if missing); None if it is not a plain non-negative number."""
    value = (headers.get("Content-Length") or "0").strip()
    return int(value) if value.isascii() and value.isdigit() and len(value) < 12 else None
