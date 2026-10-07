"""The desktop app (Qt): its own window for the control page, tray icon and app-window audio.

    app.py          – start-up, single instance, quitting
    main_window.py  – the window with the control page and the close question
    web_page.py     – the web page: bridge to the control page, permissions, links, downloads
    bridge.py       – messages between the control page and Python
    audio.py        – "Ton im App-Fenster": mute and volume for everything in the window
    media.py        – H.264 videos in the app window (rewritten to /api/media)
    tray.py         – tray icon with its menu
    vault_dialog.py – password dialogs for the vault (systems without a keyring)
    scripts/        – JavaScript injected into the window (bridge, volume, codecs)
"""
