"""Checking the user's background videos: codec, resolution and whether the MP4 is "faststart"."""

import re
import struct
from pathlib import Path

SCAN_BYTES = 4 * 1024 * 1024      # look at the first and last 4 MB only
CODEC_MARKERS = (
    (re.compile(rb"hvc1|hev1|V_MPEGH/ISO/HEVC"), "H.265"),
    (re.compile(rb"avc1|V_MPEG4/ISO/AVC"), "H.264"),
    (re.compile(rb"vp09|V_VP9"), "VP9"),
    (re.compile(rb"V_VP8"), "VP8"),
    (re.compile(rb"av01|V_AV1"), "AV1"),
)


def video_info(path: Path) -> dict:
    """Info shown in the setup page (German keys are part of the page's API)."""
    size = path.stat().st_size
    info = {"name": path.name, "groesse": size}
    with open(path, "rb") as f:
        head = f.read(min(size, SCAN_BYTES))
        tail = b""
        if size > SCAN_BYTES:
            f.seek(size - SCAN_BYTES)
            tail = f.read(SCAN_BYTES)
    data = head + tail
    info["codec"] = next((name for pattern, name in CODEC_MARKERS if pattern.search(data)), "unbekannt")
    if path.suffix.lower() in (".mp4", ".m4v", ".mov"):
        moov, mdat = head.find(b"moov"), head.find(b"mdat")
        info["faststart"] = moov >= 0 and (mdat < 0 or moov < mdat)
        size_from_track = _resolution(head) or _resolution(tail)
        if size_from_track:
            info["breite"], info["hoehe"] = size_from_track
    return info


def _resolution(block: bytes) -> tuple[int, int] | None:
    """Width/height from the first video track header ("tkhd" box)."""
    position = -1
    while (position := block.find(b"tkhd", position + 1)) >= 0:
        if position + 96 > len(block):
            continue
        version_1 = block[position + 4] == 1
        offset = position + (92 if version_1 else 80)
        width, height = (v / 65536 for v in struct.unpack(">II", block[offset:offset + 8]))
        if 16 < width < 20000 and height > 16:
            return round(width), round(height)
    return None
