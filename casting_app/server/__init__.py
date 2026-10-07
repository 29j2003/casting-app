"""Local HTTP server of the Casting-App (http://localhost:8787, this PC only).

    app_server.py    – the server itself: request checks, API routes, start/stop
    event_hub.py     – live connection to pages and overlays (Server-Sent Events)
    static_files.py  – serving app files, videos and fonts (with ranges and ETags)
    game_state.py    – CS2 live data (Game State Integration), incl. the LAN receiver on port 8788
    cs2_setup.py     – finding the CS2 cfg folder and writing the GSI cfg file
    faceit.py        – fetching FACEIT match, tournament and team data (with the user's API key)
    workshop.py      – name and preview image of Steam Workshop maps
    video_info.py    – checking the user's videos (codec, size, faststart)
    media_converter.py – H.264 → WebM with FFmpeg for the app window (/api/media), with a size-limited cache
    net.py           – HTTP server building blocks shared by port 8787 and 8788
"""
