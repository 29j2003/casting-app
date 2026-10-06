"""Casting-App: control page and OBS overlays for CS2 casts.

Package layout:
    __main__.py       – start: desktop app or server only (--no-window)
    version.py        – the app version (must match pyproject.toml and web/cast-core.js)
    paths.py          – where the app keeps its data and finds its web files
    app_log.py        – the app log (memory + log.txt), shown in the "Log" tab
    settings.py       – settings of the app itself (settings.json): language, update check, vault offer
    texts.py          – texts of the Python side (tray, dialogs) in German and English
    secret_store.py   – FACEIT key, DACH CS access and OBS password, kept in the system keyring
    password_vault.py – password-protected storage for systems without a keyring
    legacy.py         – taking over data of version 2.1 and older (German names)
    instance.py       – detecting / replacing an already running Casting-App
    updater.py        – update from inside the app (GitHub Releases, checksum, replace and restart)
    files.py          – safe writing/reading of the app's own files
    server/           – local HTTP server for the control page and the overlays
    desktop/          – the desktop window (Qt), tray icon and app-window audio

The control page and the overlays themselves live in web/ (see ENTWICKLUNG.md).
"""
