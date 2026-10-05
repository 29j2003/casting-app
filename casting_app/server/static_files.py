"""Serving files: app files from web/, the user's videos and fonts.

Supports ETag/304 and byte ranges (needed for video seeking).
"""

import re
from pathlib import Path

CONTENT_TYPES = {
    ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8",
    ".ttf": "font/ttf", ".otf": "font/otf", ".woff": "font/woff", ".woff2": "font/woff2",
    ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp", ".gif": "image/gif",
    ".svg": "image/svg+xml", ".mp4": "video/mp4", ".m4v": "video/mp4", ".webm": "video/webm",
    ".mov": "video/quicktime", ".md": "text/plain; charset=utf-8",
}
CHUNK_SIZE = 256 * 1024
RANGE_HEADER = re.compile(r"^bytes=(\d*)-(\d*)$")


def path_inside(folder: Path, relative: str) -> Path | None:
    """`relative` resolved inside `folder`, or None if it would leave the folder."""
    base = folder.resolve()
    full = (base / relative).resolve()
    return full if base in full.parents else None


def send_file(handler, path: Path, content_type: str, version: str, extra_headers: dict | None = None) -> None:
    """Answer the request of `handler` (a BaseHTTPRequestHandler) with the file at `path`."""
    try:
        info = path.stat()
        if not path.is_file():
            raise FileNotFoundError
    except OSError:
        return handler.send_json(404, {"error": "nicht gefunden"})
    size = info.st_size
    etag = f'"{version}-{size:x}-{int(info.st_mtime * 1000):x}"'
    cacheable = re.match(r"^(video|image|font)/", content_type)
    headers = {"Content-Type": content_type, "Accept-Ranges": "bytes", "ETag": etag,
               "Cache-Control": "max-age=3600" if cacheable else "no-store", **(extra_headers or {})}
    range_header = handler.headers.get("Range", "")
    if handler.headers.get("If-None-Match") == etag and not range_header:
        return handler.send_plain(304, headers)

    start, end, status = 0, size - 1, 200
    match = RANGE_HEADER.match(range_header)
    if match:
        first, last = match.groups()
        if first == "" and last != "":
            start = max(0, size - int(last))       # "bytes=-500": the last 500 bytes
        else:
            start = int(first or 0)
            if last != "":
                end = min(int(last), size - 1)
        if start >= size:
            return handler.send_plain(416, {"Content-Range": f"bytes */{size}"})
        status = 206
        headers["Content-Range"] = f"bytes {start}-{end}/{size}"
    headers["Content-Length"] = str(end - start + 1)
    handler.send_plain(status, headers, end_headers_only=True)
    if handler.command == "HEAD":
        return
    remaining = end - start + 1
    with open(path, "rb") as f:
        f.seek(start)
        while remaining > 0:
            chunk = f.read(min(CHUNK_SIZE, remaining))
            if not chunk:
                break
            handler.wfile.write(chunk)
            remaining -= len(chunk)
