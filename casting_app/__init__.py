"""Casting-App: control page and OBS overlays for CS2 casts.

Package layout:
    version.py       – the app version (must match pyproject.toml and web/cast-kern.js)
    paths.py         – where the app keeps its data and finds its web files
    app_log.py       – the app log (memory + log.txt), shown in the "Log" tab
    secret_store.py  – FACEIT key and DACH CS access, kept in the system keyring
    instance.py      – detecting / replacing an already running Casting-App
    server/          – local HTTP server for the control page and the overlays
    desktop/         – the desktop window (Qt), tray icon and app-window audio
"""
