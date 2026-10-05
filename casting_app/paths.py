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
        """Folder paths as shown in the "Log" tab (German keys are part of the page's API)."""
        return {"daten": str(self.data), "bilder": str(self.images), "eigene": str(self.own_files),
                "videos": str(self.videos), "schriften": str(self.fonts)}


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


def create_folders(documents: Path | None = None) -> AppFolders:
    """Create (if needed) and return the app folders."""
    own_files = (documents or documents_dir()) / APP_NAME
    # Folders of the predecessor "Cast-Overlay" are taken over once
    for new, old in ((DATA_DIR, DATA_DIR.with_name(".cast-overlay" if DATA_DIR.name.startswith(".") else "Cast-Overlay")),
                     (own_files, own_files.with_name("Cast-Overlay"))):
        try:
            if old != new and old.exists() and not new.exists():
                old.rename(new)
        except OSError:
            pass
    folders = AppFolders(data=DATA_DIR, images=DATA_DIR / "bilder", own_files=own_files,
                         videos=own_files / "Videos", fonts=own_files / "Schriften")
    for folder in (folders.data, folders.images, folders.own_files, folders.videos, folders.fonts):
        folder.mkdir(parents=True, exist_ok=True)
    return folders
