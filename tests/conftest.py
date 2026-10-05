"""Shared setup for the pytest tests (test_secret_store.py, test_server.py, test_desktop.py).

All tests run in a temporary home folder, so they never touch the real app data, and with an
in-memory keyring instead of the system keyring. Must run before casting_app is imported.
"""

import os
import sys
import tempfile
from pathlib import Path

TEST_HOME = Path(tempfile.mkdtemp(prefix="casting-app-test-"))
# Playwright finds its browsers relative to the home folder: keep pointing at the real one
if "PLAYWRIGHT_BROWSERS_PATH" not in os.environ and sys.platform != "win32":
    cache = Path.home() / ("Library/Caches" if sys.platform == "darwin" else ".cache") / "ms-playwright"
    os.environ["PLAYWRIGHT_BROWSERS_PATH"] = str(cache)
os.environ["HOME"] = str(TEST_HOME)
os.environ["APPDATA"] = str(TEST_HOME / "AppData")
os.environ["XDG_DATA_HOME"] = str(TEST_HOME / ".local" / "share")
os.environ["XDG_CONFIG_HOME"] = str(TEST_HOME / ".config")
os.environ.setdefault("QTWEBENGINE_DISABLE_SANDBOX", "1" if hasattr(os, "getuid") and os.getuid() == 0 else "0")
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import keyring                                   # noqa: E402
import pytest                                    # noqa: E402
from keyring.backend import KeyringBackend       # noqa: E402


class MemoryKeyring(KeyringBackend):
    """Keyring that keeps everything in memory (stands in for the system keyring)."""

    priority = 1

    def __init__(self):
        super().__init__()
        self.passwords: dict[tuple[str, str], str] = {}

    def get_password(self, service, username):
        return self.passwords.get((service, username))

    def set_password(self, service, username, password):
        self.passwords[(service, username)] = password

    def delete_password(self, service, username):
        if self.passwords.pop((service, username), None) is None:
            raise keyring.errors.PasswordDeleteError("not stored")


MEMORY_KEYRING = MemoryKeyring()
keyring.set_keyring(MEMORY_KEYRING)


@pytest.fixture(scope="session")
def qapp_args():
    """Settings for the one QApplication of the test session (pytest-qt), made before it exists."""
    from casting_app.desktop import app as desktop_app
    # only for the tests: accept the self-made certificate of the HTTPS test page in test_desktop.py
    os.environ["QTWEBENGINE_CHROMIUM_FLAGS"] = "--ignore-certificate-errors"
    desktop_app.prepare_qt()
    return [sys.argv[0]]
