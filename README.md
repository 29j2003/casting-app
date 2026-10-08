# Casting-App

Control and overlays for CS2 casts in OBS – one desktop app for Windows, Linux and macOS, one browser source.
Scenes with transitions, graphics, themes (including DACH CS – official), FACEIT import, CS2 live data (GSI),
brackets/tables and audio control via OBS. Interface and overlays in English or German.

**Download:** [latest version](https://github.com/29j2003/casting-app/releases/latest) –
Windows `…-Setup.exe`, Linux `…-linux-x86_64.AppImage`, macOS `…-mac-arm64.dmg` (Apple Silicon) or `…-mac-x64.dmg` (Intel).

## About the project

An experiment to see how far you can get with Claude. The app was built entirely with Claude – I don't code myself.
I'm not a caster either; I help with the production of casts, and that's what the app is made for.
Use it, change it, pass it on: everything is allowed, no need to ask.

License: [The Unlicense](LICENSE). Bundled FFmpeg: GPL, see [LICENSES/FFmpeg.txt](LICENSES/FFmpeg.txt).

## Getting started

### Install

* **Windows:** run `Casting-App-<version>-Setup.exe` (installs for your account, no admin rights, with start menu and
  desktop shortcut) – or, without installing, unzip `Casting-App-<version>-windows-portable.zip` and start
  `Casting-App.exe` in it (e.g. from a USB stick). On first start Windows may say “Windows protected your PC”:
  **More info → Run anyway** (the file is not signed).
* **Linux:** make `Casting-App-<version>-linux-x86_64.AppImage` executable (`chmod +x …`) and start it.
* **macOS:** open the `.dmg` (Apple Silicon: `…-mac-arm64.dmg`, Intel: `…-mac-x64.dmg`) and drag the app into
  “Applications”. The app is not notarized by Apple: on first start **right-click → Open → Open**.

The app installs new versions itself (⚙ → Update, see below).

### First start

1. Start **Casting-App**. The window opens in the tidy workspace *Beginner* (preview, scenes, scene panel). The language
   is set under ⚙ → **Sprache · Language**. Top right shows **“First steps 0/5”** – one click opens the list, which guides
   you through the rest:
   * **Connect OBS:** OBS → Tools → WebSocket Server Settings → “Enable WebSocket server”. Enter port and password
     (“Show Connect Info”) in the app under **⚙ → Connections & access**.
   * **Create the scene:** Setup → **Scenes & OBS** → **“Create the scene ‘Cast – Sendung’ in OBS”**. OBS then has the
     scene “Cast – Sendung” with one browser source (carrying the app's access key). Prefer to add the browser source
     yourself? **“Copy overlay address”** and paste it into OBS as a browser source (1920 × 1080).
   * Enter theme, teams and casters.
   * **Game picture:** in OBS, put the game capture in the scene “Cast – Sendung” **below** the browser source. In the
     **Ingame** scene the overlay is transparent; only sponsor and graphics are visible.
2. In the **Live** tab, switch scenes with a click, pick a transition, show graphics.

## The interface

### Tabs

* **Live** – only what you need on air: program preview, scenes, **scene panel**, **Match** (score, map, series, timer),
  **Tournament live** (group, highlight a team, “show table”), graphics and audio.
* **Match** – the current game. Sub-pages: Matchday & import · Teams & players · Map veto & series · Casters & cameras ·
  Timer & texts (and “All”).
* **Tournament** – bracket, table and FACEIT sync.
* **Setup** – sub-pages: Appearance · Sponsors · Map pool · Background · Scenes & OBS · Scene panels · CS2 live data.
* **Log** – status, folders, protocol.

**Ctrl 1–4** jumps to Live, Match, Tournament and Setup. **Ctrl K** opens “Search & commands”: switch scene, show a
graphic, open or dock an area – all by keyboard.

**Sub-pages with status:** in Match, Tournament and Setup each sub-page has a dot and one line – green = done,
yellow = something missing (e.g. “caster names missing”, “1 logo missing”), accent colour = customised, grey = default.
In Match and Tournament, **“Next: …”** and **“← …”** below each sub-page guide you through the preparation step by step.

### At a glance

* **Buttons** (raised, light up on hover) = clickable · **switches** = on/off · **dot + text** = display only.
* Colours: **red** = LIVE (scene on program) · **green** = OK/on · **yellow** = running/waiting · **grey** = off ·
  **accent colour** (purple in dark, orange in light) = your next step.
* **“?” next to an area title** shows the explanation of that area – areas stay calm, help is still there.
* **Size:** follows the window automatically (1920 px = 100 %, 2560 px = 130 %). “Auto” top right or ⚙ → Interface;
  − / + sets it by hand.
* Top right: connection status (“… of 3 connected”: OBS, overlays, music), **Search & commands**, collapse/expand all,
  Edit layout, **⚙** app settings, **power** (close window or quit completely).

### Workspaces

Top left you choose the workspace: *Beginner*, *Operator*, *Caster – big buttons*, *Laptop / next to OBS*, *Preparation*
or your own (“Save current arrangement as …”). A workspace remembers docks, sizes, positions, locks and button size.
* *Beginner* (used on first start) shows only preview, scenes and the scene panel; everything else is ready, collapsed.
* *Operator*: scenes, scene tools and graphics are open; audio, match bar and tournament are collapsed (click the title to
  open them; the state is remembered).

### Edit layout

Icon top right next to ⚙, in the workspace menu or Ctrl K: a bar “EDIT LAYOUT” appears at the top with “Save as
workspace” and “Done”. Only then can areas be dragged, docked and resized – in normal use nothing moves by accident.

* **Left** the tabs, **centre** the preview. Areas can be docked **below the preview** or **to its right**: grab the title
  (handle with dots) and drag – possible drop zones light up, a line shows where the area will land. Back into a tab:
  drag it onto the left column. Alternatively use the dock icon on the area → choose a place.
* Over a docked card a **compass** appears: edge = sort in before/after, **centre = as a tab**. Click tabs to switch,
  drag them out of the tab bar again.
* **Stacked below the preview:** drag an area onto the **top or bottom quarter** of an area below the preview – that half
  lights up and “Above: …” / “Below: …” shows the target. This way e.g. Audio and Match sit on top of each other in one
  column; each scrolls on its own, a collapsed one only takes its title row. Drag one out and the stack dissolves itself.
* **Reorder:** drag areas up/down inside a tab – the order is remembered. Empty tab columns hide themselves.
* **Arrange scenes:** in the “Scenes” area click **Arrange** – drag buttons to where you want them, tick = scene is shown.
* **Docks always show everything:** if space runs out, each card scrolls on its own. Double-click the divider above the
  preview dock to fit its height to the content. Drag **dividers** to change width or height; the button top left on the
  preview collapses and expands it.
* **Lock** in the middle of the divider between tab column, preview dock and side dock: when locked nothing changes
  there – nothing dragged in or out, no resizing, workspaces leave that area alone.
* **Free positions** (⚙ → Interface or Ctrl K): tab column left/right, side dock left/right of the preview, preview dock
  below or above the preview.

## On air (Live)

### Scenes

By default there are five groups, each with its own colour: **Before the match** (Intro, Cast Solo, Cast Duo, Cast trio,
4 people, Line-ups, Team intro, Map-Veto) · **In the match** (Ingame) · **Stats & tournament** (Scoreboard, Team A/B,
Head-to-Head, Bracket, Series) · **Pause** (Pause, Sponsors, Clips, Viewers + casters) · **After the match** (Interviews, End).
More scenes (e.g. *Trio – large host*, *Viewer cams*) are switched on under Setup → Scenes & OBS.

**Scene changes:** whatever appears in both scenes (logo, ticker, match-up, sponsor, cameras …) **stays or glides to its
new place**. Only what changes fades out or in – depending on the transition (fade, slide, wipe, cut, stinger; button
“Transition: …” on the program card). Cameras keep running without reloading.

In the **Ingame** scene all positions avoid the game HUD (minimap, scoreboard, killfeed, player cards).

### Scene panel

The panel shows what the scene on program needs right now – it changes with every scene and opens by itself:

| Scene | Fields (default) |
|---|---|
| Intro, Pause | Timer, texts in the overlay (title, ticker), sponsors |
| Cast Solo/Duo | Timer, texts in the overlay, note |
| Map-Veto | Map veto, series |
| Ingame | Score, series, note |
| Scoreboard, Team A/B, Head-to-Head | Score, series |
| Bracket | Group (All · Group A · Group B …), note |
| Interview, End | Series, texts in the overlay (End: sponsors) |

* **Fields** (top of the panel): one switch per field – applies to the scene on program and is remembered. “Back to
  default” restores them. There is also the switch **“Panel opens when the scene changes”**.
* All fields use the same data as Match and Setup – award a point or change the title here and it shows there at once.
* **Note:** just for you, per scene – never on stream and never in backups.
* **Map veto:** while the Map-Veto scene runs, the panel shows who's next, the free maps as buttons, all steps at a
  glance and the side for picks. Under Match you edit the same veto – both always show the same state.
* **Series:** once a team has won a map (13 rounds, in overtime 16, 19 …), **“✓ Finish map?”** appears – one click
  marks the map as finished.

### Studio mode

Like in OBS: button **Studio mode** at the top of the program card. On the left the **preview** appears, on the right the
**program** stays. Clicking a scene only puts it into the preview (green border); **“Transition”** in the middle takes it
live – with the chosen transition. Afterwards the previous program scene sits in the preview. Click “Studio mode” again
to go back to direct switching. Only available with one browser source (overlay.html); with separate OBS scenes use the
studio mode of OBS.

### Stats over the game

While **Ingame** runs, a field **“Over the game”** opens below the Ingame button: Scoreboard, Team A/B, Head-to-Head,
Bracket and Series. One click shows the view over the game picture (slightly dimmed), a second click hides it – Ingame
keeps running. After the set time (button “Transition: …” → “Hide stats over the game (during ingame) after … seconds”,
default 15, 0 = stays) it disappears by itself. The buttons of the same scenes further down the list always switch to the
full scene. The same buttons are in the **scene panel** of Ingame.

When **no CS2 data** is coming in, Scoreboard, Team A/B and Head-to-Head are grey and marked “CS2” – before you click.
The scene can still be shown; the overlay then says “Waiting for CS2 data …”.

### Cleanfeed

In **Ingame**, **Cleanfeed** appears at the top of the program card: hides all graphics of the app, only the game picture
stays on program (switched off automatically on the next scene change). For a permanent second output: Setup → Scenes &
OBS → **“Create cleanfeed scene in OBS”** – “Cast – Cleanfeed” with the same sources as the Ingame scene but without
graphics (output it e.g. via the virtual camera with output “Scene”, NDI or Source Record).

### Graphics

The Graphics area lists your **favourites (star)** with a switch; “All …” shows all, “+ New” creates one. **More** (three
dots) on a graphic opens its settings: **name in the list**, **position**, **duration** (switches off afterwards),
**repeat every … min.** (e.g. a sponsor notice every 10 min for 15 s) and **only in these scenes**; plus duplicate,
move up/down and delete (with undo). Types:
* **Casters:** all casters at once, stacked or side by side, optionally with a guest.
* **Lower third:** name + subline.
* **Notice:** e.g. “Back in a moment”.
* **Score:** logos + score.
* **Map info:** Pick · Map · Next, automatically from veto & series.
* **Map fact:** facts about the current map (entered in the map pool, one per line); they rotate automatically.
* **Scoreboard (live)** and **Player (live)** from the CS2 live data.

### Audio (controlled directly in OBS)

Like the OBS mixer: **all sources with audio in OBS** (also microphone, desktop audio, game), the app's own first. The app
controls them live via OBS – **volume** (up to 300 %), **mute**, **sync offset** (−950 to 20 000 ms, under “More” – three
dots) and **monitoring**, as a choice like in OBS:

* *Monitor Off* – only in the stream/recording, not in your headphones
* *Monitor Only (mute output)* – only in your headphones, not in the stream
* *Monitor and Output* – in the stream and in your headphones

**Remember volume per scene** (switch at the top of the Audio area): a volume you set in a scene applies to that scene
only – e.g. the content break louder than the rest. On scene changes the app sets the stored values in OBS; sources
without their own value in a scene keep their normal volume. “Scene back to standard” clears the values of the current
scene. Without an OBS connection the area only shows the button “Connect to OBS …”.

The app's own rows: “Cast – Overlay” (everything that sounds in the overlay: clips, DACH pages, videos), “Cast –
Hintergrund” (when OBS plays the background video) and one source per caster/guest: for VDO.Ninja guests click “As its
own OBS audio source” – their audio can then be controlled individually and no longer plays twice in the overlay.
Changes made directly in OBS show up here as well.

**Audio in the app window** (top of the Audio area, default: off): mutes or unmutes everything that sounds in the app
window – videos, cameras, clips (YouTube, Twitch), VDO.Ninja and DACH pages – with its own volume. The stream is not
affected. Switching reloads nothing: videos, cameras and DACH pages keep running, only the sound goes on or off.
* **Off** mutes the whole window – reliably, also for all embedded third-party pages.
* **Volume** applies to all video and audio elements and to Web Audio in all pages of the window (also VDO.Ninja, clips
  and DACH CS). The pages' players keep showing their own volume; the app only controls what you finally hear. Sound a
  third-party page creates in a very unusual way (e.g. in a hidden shadow DOM without playing via script) may only be
  controllable with **Off**.

## Preparing a match (Match tab)

### Matchday, sessions & FACEIT (Matchday & import)

* **Match day:** all games of the day in order, with time. Games come from the tournament (one by one or “All open
  games”), from the team library or from the current match. **“Load”** or **“Load next game”** sets teams, short names,
  logos and players and clears score, veto and series. If the game comes from a tournament you run yourself, its result
  is entered in the tournament automatically when you move on.
* **Sessions:** save a match (“Save”, “Save as …”) and bring it back later with “Load”. “Back up (.json)” and
  “Load (.json)” move everything to another PC. “Reset everything” asks first.
* **FACEIT:** save an API key (server side, from developers.faceit.com) under ⚙ → Connections & access → FACEIT; then
  paste the matchroom link here and click “Fetch data” (optionally “refresh every 15 s”).

### Teams & players

* **Short name** (next to the name): if a long team name would have to shrink a lot in the overlay (below 70 %), the
  overlay shows the short name instead. Without a short name the name is only scaled down.
* **Team library:** “Save team A/B” stores name, short name, logo, colours and players on this PC; “→ Team A/B” loads a
  saved team (the score stays).
* **Team intro** (its own scene): three slides in a row – **Team A** and **Team B** (logo with seed, five player cards,
  win rate, matches, streak, last 5) and the **comparison** (both logos, the values row by row). The area has three tabs
  like the slides – **Team A · Team B · Comparison** (dot: green = values present, yellow = missing, grey = slide off). Per
  team: “Show slide”, the values in one row, “Last 5” by click (win → loss → empty) and **“Change display name”** – a
  name only for this scene (CS2 and the score keep the name from the match). If the team is in the tournament, a row
  below shows its values there; different ones are yellow, **“Take over”** copies them (seed = order in the tournament,
  statistics from FACEIT). In the **Comparison** tab every row has its own switch; **“Head to head”** (wins against each
  other) only appears with values. **Next slide** (top right of the area): by hand (buttons in the Live panel “Slides”)
  or every 8–30 s. Empty values show as “–” in the overlay.

### Map veto & series

Source “Manual” or “FACEIT”, choose format/preset, “Restart”. “↶ Undo” takes back the last step. Build your own
sequences with “+ Step” and “Save as preset”. Won maps can count towards the score automatically. On air you run the
veto in the scene panel (see above).

### Casters & cameras

Per camera frame: a VDO.Ninja link, a device (webcam/capture card, “Find devices”), a picture – or empty if you place
your own source over it in OBS. The speaker indicator lights up the name tag when someone talks (threshold adjustable).
**More people** (names for Cast trio, 4 people and the viewer scenes; viewers with name only, as a small tag in the
tile) and **More cameras** (VDO.Ninja, device, picture or empty).

### Timer & texts

* Set the timer in minutes or run it “until time of day”; start/pause and ±1 min also work in Live → Match.
* **Timer at 0:00:** your own text instead of “00:00” (e.g. “STARTING SOON”) and, optionally, an automatic switch to a
  scene – once, exactly when it runs out.
* Ticker: one message per line, speed adjustable; plus a big title.

## Tournament (Tournament tab, scene “Bracket”)

Four sub-pages with status: **Setup** (name, format, points rule) · **Teams & FACEIT** · **Games** · **In the overlay**.

* **“Import tournament”** (FACEIT link or ID): fetches teams with logos, players and statistics and takes over the
  **exact structure** – groups with table (round robin), **Swiss** (with records like 2–1; pairings come from FACEIT,
  nothing is drawn) or the bracket exactly as FACEIT has it. “Update results” fetches new scores, “Load team statistics
  from FACEIT” win rate, matches, streak and last results.
* **Corrections stay:** a FACEIT result changed by hand is **corrected** (yellow label on the game) and is not
  overwritten when updating. “corrected ↺” goes back to the FACEIT value. Below the games the source is shown
  (“FACEIT · 2 corrected” or “entered by hand”).
* **Formats by hand:** **groups with table** (number of groups, places that advance, open games below the table),
  **single elimination**, **double elimination** (upper/lower + grand final), **Swiss** (wins/losses adjustable, “Draw
  the next round” – only without FACEIT) and **groups (GSL)** – up to 32 teams. Team order = seeding, byes are assigned
  automatically. Teams with short name, logo, players and optional FACEIT team ID.
* **Points rule per tournament** (groups with table): presets like “Win 3 · loss with a map won 1 · loss 0” or your own
  values for win 2:0, win 2:1, loss 1:2, loss 0:2 and draw. On equal points the head-to-head counts first, then the round
  difference (RD, fetched from FACEIT), then the wins.
* **Group in the overlay:** all groups or just one – the tables fit the space (one group large, several side by side).
  Faster in Live: while the bracket runs, the scene panel has buttons **All · Group A · Group B …** – the scene stays,
  only the group changes (also for GSL).
* **Click a team** in the bracket to highlight it in the overlay and show its profile.
* **Visibility:** everything, **reveal round by round** (up to round X), **only from round X**, hide results (only who advances).

## Setting up (Setup tab)

### Appearance & themes

* **Themes:** Regular (night purple with a neutral logo field for your org or streamer logo), DACH CS – own style,
  **DACH CS – official** (see below), ESEA, Uniliga. Create, **duplicate**, **delete** (with undo), **export** and
  **import** themes – an export is one file with all colours, logos, pictures and sponsors, for sharing or as a backup.
  Built-in themes can't be deleted, only reset (“Customise theme” → “Reset this theme to default”).
* **Box style** (Customise theme): **Light** (white boxes), **Dark** (dark boxes) or **Mixed** (dark, only the title
  stays light). Logo fields (sponsors, brand) always stay light so dark logos remain visible.

### Sponsors

* The **sponsor** sits in Intro, Pause, End and the cast scenes as a fourth box in the bottom bar – same height, bar
  centred. Under **Place of the sponsor box** it can be shown **top right** instead; if no sponsor is visible (off or
  none entered), the bar closes up to the centre without a gap.
* Without a logo the sponsor name appears large in the box; long names get smaller and wrap onto two lines if needed.
* Optionally a **countdown bar** under the logo – it shows when the next sponsor comes.

### Map pool

Tiles with pictures – at the top the maps in the pool (drag = order in the veto), below the others. At the top it says
whether the pool matches Active Duty, at the bottom which formats it is enough for. **Own map:** paste a Workshop link →
“Get from the Workshop” takes name and preview picture from Steam; otherwise “By hand: name + picture”. New maps land
under **“More maps”** – the active pool only changes when you switch a map on there. Per map you can enter facts for the
graphic “Map fact”.

### Background

* **Playlists:** a playlist is one of three kinds: **One video · endless loop**, **Several videos** (in order or
  shuffled; transition cut, fade or through black, duration in seconds) or **Clips** (once through, with sound, then back
  to the background). Each scene plays the playlist that has the scene ticked; Ingame never. Tick videos from the library
  (videos folder), order with ↑ ↓.
* **In Live**, below the program preview, the corner **BACKGROUND**: another playlist for the running scene (until the
  next scene change), “Keep for this scene”, and **“Show clip”** / “Stop clip”.
* **Who plays the videos?**
  * **OBS** (recommended): every format OBS supports, also H.265/AV1 and 4K, with hardware decoding, several videos with
    VLC. As soon as an overlay in OBS is connected, the app offers “Let OBS play it – set up” at the top: one click, confirm –
    the media source “Cast – Hintergrund” then sits directly below the overlay (above the game capture). The app hides it
    in “Cast – Sendung” only during Ingame and matches it to the running scene on every scene change and when connecting
    to OBS.
  * **The overlay:** WebM (VP9) is safest. The browser source in OBS doesn't play videos reliably; the app checks every video.

### Scenes & OBS

“Create the scene ‘Cast – Sendung’ in OBS”, “Copy overlay address”, the cleanfeed scene and which scenes appear in Live
(e.g. the variants *Trio – large host* and *Viewer cams*). The people scenes share the style of the cast scenes, with the
sponsor in the bar: **Cast trio** (three casters side by side) · **Trio – large host** (caster 1 large, two smaller on
the right) · **4 people** (2 × 2 grid) · **Viewers + casters** (four viewer tiles, casters on the right) · **Viewer cams**
(wall with six tiles and a header). Under **Scene panels** you choose which fields the scene panel shows per scene.

### CS2 live data

Setup → CS2 live data guides you through the setup step by step – for CS2 on this PC (“Set up automatically”, “Search
all drives”, type the path directly – with suggestions – or “Browse folders …” with a search field) or on an observer PC
in the network (port 8788, a file with address and key to download). Open the match as a spectator (GOTV/observer) and
CS2 delivers all 10 players.
* Scenes **Scoreboard**, **Team A**, **Team B**, **Head-to-Head** · graphics **Scoreboard (live)**, **Player (live)**.
* At half time the app swaps the sides itself; ADR and HS % are calculated from the round data.
* **“Play test data”** plays a short sample match – only in the app's preview, never on stream – so you can check the
  scoreboard and team scenes without a running game.

## DACH CS – official

Setup → Appearance → choose the style **“DACH CS – official”** and enter **user ID** and **key** from the DACH CS user
area (Casting → Browserquellen) under **⚙ → Connections & access**. The key is stored encrypted and never shown again.

* Everything runs in **one** browser source: Live → Scenes shows the 25 DACH pages (overview, single/duo cam, lineup,
  map veto, ingame, table, playoffs, matches, MVP, breaks, interaction, interviews, end screen). The next page is
  preloaded and then switched with the chosen transition (cut, fade, slide, wipe, stinger). The **fade** goes through the
  dark blue of the DACH pages: first the old page fades out, then the new one in – never two pages half on top of each
  other. The cameras appear in the new page's frames together with the page, the picture keeps running. No scrollbars,
  exactly 1920 × 1080.
* **Cameras and content** (caster, guest, clip) are placed automatically in the frames of each page (single cam, duo cam,
  interaction single/duo, own content break, interview single/duo – measured from the real DACH pages). They sit
  **below** the page: the yellow line and name tag of DACH CS stay visible. An empty frame is black – never the
  background of a DACH page, not even during a change. “Adjust camera and content frames” shows the frames in the
  preview and lets you move them pixel by pixel; “Default” restores the measured sizes.
* **Match entered at DACH CS** (switch above the DACH scenes): the app can't see whether a match is entered at DACH CS.
  When the switch is off, the scenes that need a match (team lineup, map veto, positions, table, playoffs, last/next 5,
  match day, MVP) are grey and marked “MATCH” – otherwise they only show “TBA”. Clicking still works.
* **Videos in the app window:** H.264 videos (MP4, e.g. the DACH content break) are converted for the app's own window
  when first played (with the bundled FFmpeg) – afterwards they play with picture and sound. Nothing changes in OBS. On
  macOS Intel this only works with FFmpeg installed (`brew install ffmpeg`); otherwise the preview shows a notice.
* The content of the graphics (teams, results, table …) comes from the DACH CS live dashboard. The app's graphics sit on top.
* “DACH CS – own style” is the free design in the DACH look, without the official pages.

## App settings (⚙)

A panel that slides in from the right over the control page – for everything that only concerns the app on this PC. At
the top the sections as buttons (with status dot, one click jumps there), below all sections in a row; **Close**, Esc or
a click next to it takes you back.

* **Connections & access** – OBS (port, password), **FACEIT key**, **DACH CS** (user ID, key), music (Spotify via Tuna),
  “Open control page in browser”. Keys are kept in the system keychain and never shown again after saving – only
  replaced or deleted.
* **Sprache · Language** – two independent settings (e.g. the app in English, the overlays in German):
  * **App language** (Deutsch / English): control page, dialogs and tray menu. The control page reloads briefly.
  * **Overlay language** (Deutsch / English): the fixed texts on stream – headings like “BREAK”/“PAUSE”, “FINAL
    SCORE”/“ENDSTAND”, tournament rounds, statistics headers. Texts you changed yourself stay as they are; only texts
    still on their default switch language. The overlays in OBS change immediately.
* **Interface** – **Dark** (“Arena”: blue-violet, the running scene glows red-orange), **Light** (warm white with
  orange) or like the system; both colour the scene groups (Before the match blue, In the match green, Stats orange,
  Pause purple, After the match pink). Size automatic or by hand; position of tab column, side dock and preview dock;
  “Reset arrangement”, “Show ‘First steps’ again”.
* **Update** – see below.
* **Data & backup** – back up/load (.json), videos, fonts and data folders · **About the app**.

### Update

“Check for updates” asks GitHub whether there is a newer version. If there is, **“Update now”** updates the app with one
click: it downloads the matching file, checks it against GitHub's checksum, quits, puts the new version in place and
restarts. Settings, pictures and access data stay.

| Installed as | Update |
|---|---|
| Windows with `…-Setup.exe` | automatic (the installer runs invisibly) |
| Linux AppImage | automatic (the AppImage file is replaced) |
| macOS (`.dmg`/`.zip`) | automatic (the app in Applications is replaced) |
| Windows portable, from source | “Open download page” – replace by hand |

* **Check for updates at every start** (default: on) – when the app finds a new version it says so in the tray; a click
  opens the Update section.
* On the first start after an update it shows “updated from v…”.
* Don't update during a live show: the overlays in OBS are briefly gone.

## Good to know

### Closing the window

Click the **X**: the window stays open for the moment and the app asks right away **Quit completely · Close window only ·
Cancel**. The power button top right opens the same choice.
* **Close window only:** the window disappears, the overlays in OBS keep running. The **29 icon** stays in the system tray
  (macOS: menu bar) with the menu **Open · Reload overlays in OBS · Quit completely**. Clicking the icon (macOS: opens
  the menu) or starting the app again brings the window back.
* **Reload overlays in OBS** reloads the browser sources via OBS (like the button in the app); without an OBS connection
  the app reloads the connected overlays itself.
* When the window is closed and no overlay is connected any more (OBS closed), the app quits by itself after 30 s.

### Folders, start options, problems

* **Only one app:** start the app a second time and the existing window simply comes to the front. A **newer version**
  replaces a running older one automatically (the overlays reconnect by themselves).
* **Videos** (background) and **your own fonts** live in *Documents → Casting-App*. The app opens the folders with a button.
* **Settings, pictures and log** live in *%APPDATA%\Casting-App* (Linux/macOS: *~/.casting-app*).
* **Problems?** The **Log** tab shows what is happening, which overlays are connected (also those in OBS) and messages
  from the overlays, e.g. when a video doesn't play.
* **Preview stutters or the window stays black** (old graphics driver)? Start the app with `--no-gpu`.
* **Without a window:** `Casting-App --no-window` only starts the server for the overlays (no window, no tray icon).

### Confirmations

* **Everything that changes OBS** (creating scenes, setting up the background source) first shows a list of exactly what
  will happen – only “Run in OBS” changes anything. Nothing is deleted in OBS – only “Create cleanfeed scene in OBS”
  replaces an existing scene “Cast – Cleanfeed”.
* **Restart / clear veto, load session, take over FACEIT data, reset everything, quit the app** ask first if something
  you entered would be lost.
* **Removing** (graphic, map, sponsor, player, veto step) can be **undone** for a few seconds.

### Security & privacy

* The app only accepts requests from **this PC**. Other devices on the network are rejected. Only its own pages may
  access it, no websites from the internet.
* **Access key:** on first start the app creates a secret key (in the keychain). Only pages with this key – the app
  window and the browser sources the app creates in OBS – may change anything, open the DACH CS pages or log in to OBS.
  Other programs on the PC can't get in. Camera links (which may contain passwords) only go to sources with the key.
  To use the control page in a normal browser: ⚙ → Connections & access → “Open control page in browser” (the link
  works once and for 2 minutes – it's worthless in the browser history afterwards).
* **Keys and passwords** (FACEIT key, user ID and key for DACH CS, OBS password) live only in the system keychain –
  Windows: Credential Manager (bound to your Windows account) · macOS: Keychain · Linux: Secret Service or KWallet.
  Nothing of it is in the app's data folder. If there is no keychain (some Linux systems), the app asks at start whether
  to store the keys protected by **your own password** instead (file `secrets.vault`, unreadable without the password;
  the password is asked for at every start). Without a password they only last until the app quits. Without a window
  (`--no-window`) the environment variable `CASTING_APP_VAULT_PASSWORD` opens the vault.
* Keys are never shown again after saving – not in the app, not in backups, sessions, exports or the log – and no
  interface hands them out. The app only uses them internally (FACEIT requests, OBS login, forwarding to the DACH CS
  pages). DACH CS requires ID and key in the address of its pages – so they are in the address of the DACH frames in the
  overlay. Don't show the properties of the browser source or the OBS developer tools on stream.
* **What leaves the PC:** FACEIT requests (match, tournament, team statistics – with your API key), the DACH CS pages
  (with ID and key), cameras and clips you enter yourself, the Workshop number to Steam when you click “Get from the
  Workshop” (name and preview picture come back), and the question to GitHub whether there is a newer version (only the
  list of versions; can be switched off under ⚙ → Update) – plus the download when updating. Updates only come from this
  project's releases and only with a matching checksum. Videos from the web that you play in the app window are fetched
  by FFmpeg for conversion (only http/https, no other devices on your own network).
* Only the app's own pages run in the app window; links to the outside open in the default browser. Only the app's own
  pages may use camera and microphone.
* The network receiver for CS2 (port 8788) is off until you switch it on, and then only accepts CS2 game states with your key.
* The app only serves its own files plus videos and fonts from your folders.
* **Damaged files don't stop the app:** if a file in the data folder is damaged (e.g. after a power cut), the app puts it
  aside as `….damaged`, starts with default values and writes it to the log.

### Signing

The Windows files are not signed, so Windows warns on first start. A trusted signature needs a code signing certificate
issued in your name (e.g. Microsoft Trusted Signing or an OV/EV certificate from a certificate authority); with it the
build signs installer and app itself, see the [developer docs](docs/ENTWICKLUNG.md) (German). The macOS app is only
ad-hoc signed (no Apple account); notarization by Apple is prepared but switched off.

---

For developers: [docs/ENTWICKLUNG.md](docs/ENTWICKLUNG.md) (German – structure, tests, building, releases).
