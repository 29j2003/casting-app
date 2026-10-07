"""Folders used by the app.

DATA_DIR      – settings, state, images and log (Windows: %APPDATA%\\Casting-App, else ~/.casting-app)
user folders  – videos and fonts the user adds (Documents/Casting-App/Videos and /Schriften)
WEB_DIR       – the bundled web files (control page and overlays)
"""

import os
import sys
from dataclasses import dataclass
from pathlib import Path

from .version import APP_NAME

IS_WINDOWS = sys.platform == "win32"
IS_MAC = sys.platform == "darwin"


def resource_root() -> Path:
    """Root of the bundled files: the PyInstaller bundle or the source checkout."""
    bundle = getattr(sys, "_MEIPASS", None)
    return Path(bundle) if bundle else Path(__file__).resolve().parent.parent


WEB_DIR = resource_root() / "web"

if IS_WINDOWS:
    DATA_DIR = Path(os.environ.get("APPDATA") or Path.home()) / APP_NAME
else:
    DATA_DIR = Path.home() / ".casting-app"


@dataclass(frozen=True)
class AppFolders:
    """All folders the app reads from or writes to."""

    data: Path
    images: Path
    own_files: Path
    videos: Path
    fonts: Path

    def as_dict(self) -> dict:
        """Folder paths as shown in the "Log" tab."""
        return {"data": str(self.data), "images": str(self.images), "custom": str(self.own_files),
                "videos": str(self.videos), "fonts": str(self.fonts)}


def documents_dir() -> Path:
    """The user's "Documents" folder (Qt knows it on every system; plain fallback otherwise)."""
    try:
        from PySide6.QtCore import QStandardPaths
        location = QStandardPaths.writableLocation(QStandardPaths.StandardLocation.DocumentsLocation)
        if location:
            return Path(location)
    except ImportError:
        pass
    return Path.home() / "Documents" if IS_WINDOWS else Path.home()


def create_folders(documents: Path | None = None, log=None) -> AppFolders:
    """Create (if needed) and return the app folders; log(text, level) reports the take-over of old data."""
    own_files = (documents or documents_dir()) / APP_NAME
    # Folders of the predecessor "Cast-Overlay" are taken over once
    for new, old in ((DATA_DIR, DATA_DIR.with_name(".cast-overlay" if DATA_DIR.name.startswith(".") else "Cast-Overlay")),
                     (own_files, own_files.with_name("Cast-Overlay"))):
        _take_over(old, new)
    from .legacy import migrate_data_folder        # data of version 2.1 and older (German names)
    migrate_data_folder(DATA_DIR, log or (lambda text, level="info": None))
    folders = AppFolders(data=DATA_DIR, images=DATA_DIR / "images", own_files=own_files,
                         videos=own_files / "Videos", fonts=own_files / "Schriften")
    for folder in (folders.data, folders.images, folders.own_files, folders.videos, folders.fonts):
        folder.mkdir(parents=True, exist_ok=True)
    if not IS_WINDOWS:
        try:                                       # state, log and browser profile: only for this user
            DATA_DIR.chmod(0o700)
        except OSError:
            pass
    return folders


# what a fresh start may already have put into the new data folder before the take-over (the log opens first)
_FRESH_FILES = {"log.txt", "log.txt.old"}


def _take_over(old: Path, new: Path) -> None:
    """Move the predecessor's folder to the new place – also when the new one only holds the log of this start."""
    try:
        if old == new or not old.is_dir():
            return
        if not new.exists():
            old.rename(new)
            return
        if any(p.name not in _FRESH_FILES for p in new.iterdir()):
            return                                  # the new folder is already in use: leave both alone
        for item in old.iterdir():
            target = new / item.name
            if target.exists() and item.name in _FRESH_FILES:
                continue                            # keep this start's log
            item.rename(target)
        old.rmdir()
    except OSError:
        pass
