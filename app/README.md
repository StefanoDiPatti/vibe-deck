# Vibe Deck

Turn an old Android 4.x tablet into a **wireless Stream Deck** for your PC.
The PC (Windows or Linux) runs a small Node.js server. The tablet opens a web page in its browser: nothing to install on it.

> This is the **full reference**. To get started read the three guides in the [main README](../README.md): installation, user guide and developer guide.

- Buttons configured in JSON: launch apps, shortcuts, text, macros, commands.
- **Music**: cover art, track queue, seek, shuffle and repeat, app volume (not system volume). Works with Apple Music web and YouTube through a browser extension, and with desktop apps (Spotify, VLC, ...). Games and launchers (e.g. Riot Client) are ignored.
- **Claude**: the Claude Code sessions of the desktop app, grouped by the PC's sections. Type (or dictate) on the tablet and the message is sent from the app on the PC, with the session's permissions.
- PC monitor: CPU, RAM, NVIDIA GPU (load, temperature, VRAM), network.
- **Discord**: servers, voice channels, who is in the room and who is talking, mute and deafen, webcam and Go Live.
- **Games**: your games, added from the control panel with the file picker and an icon (if the game is already running it is brought to the front).
- **Audio**: pick the default output (speakers, headphones, monitor) and microphone, with volume and mute, and set the volume of every app.
- **Screens**: choose which monitor apps launched from the tablet open on and arrange windows in zones, like Windows Snap.
- **Control panel on the PC** to choose and drag-sort the tablet pages and the buttons of each page.
- **Windows and Linux** detected automatically: on Linux the Windows buttons become their equivalents (PowerShell → Terminal, Task Mgr → System Monitor...).
- **Email**: inbox read from Thunderbird on the PC (Gmail, Outlook, iCloud, university and company mail...), read-only.
- **QR code** to connect a phone or a tablet: scan it and you are done.
- Ollama, GitHub summary, TODO on Windows Sticky Notes, clock.
- Shortcut pages for Blender and DaVinci Resolve (add them to the bar from the control panel), which bring the program to the front before pressing the keys.

## Quick start

> Just want to see it? `npm run demo` starts a deck with **fake data** (music, PC, TODO, sessions) at `http://127.0.0.1:8790/?t=DEMO1234`, without reading your configuration or your `.env`.

**Windows:** double-click `start.bat` (or the "Vibe Deck" shortcut on the desktop).
**Linux:** `./start.sh` (or `bash start.sh`).

On the first run the script does everything:

1. if Node.js is missing it offers to install it (winget on Windows, the package manager on Linux);
2. installs the dependencies (`npm ci`);
3. creates `.env` with a random **access code** and your configuration in `config/`;
4. asks whether to open the firewall port, create the desktop shortcut and start automatically at login;
5. starts the server and restarts it if it crashes.

To answer the questions again: `start.bat --setup` (or `./start.sh --setup`).

### Windows: in the background, with an icon next to the clock

On Windows the deck runs **in the background**, with no open windows. Look for its icon (four small blue squares) in the notification area, under the arrow next to the clock. From the icon menu you can:

- open the **control panel** (also by double-clicking the icon, or the *Vibe Deck* desktop shortcut);
- open the deck on this PC;
- see the address and code for the tablet (they are also copied to the clipboard);
- open the log (`data/dock.log`);
- restart it;
- quit it.

A grey icon means the deck is stopped: the reason is in the log.
To see the messages in a window: `start.bat --console`.

> It is deliberately not a real Windows "service": services run in a separate session and could not press keys or read the user's music. The icon starts with your account, like your other apps.

### The address for the tablet

You find it in the icon menu (Windows) or in the server window (Linux / `--console`):

```text
  Apri sul tablet:  http://192.168.1.50:8787   (Ethernet)
  Codice di accesso: ABCD2345
  Link diretto (salva il codice):  http://192.168.1.50:8787/?t=ABCD2345
  Pannello di controllo (solo da questo PC):  http://127.0.0.1:8787/control
```

That is: the address to open on the tablet, the access code, the direct link (which saves the code) and the control panel (from this PC only).

## On the tablet

1. The quickest way: scan the **QR code** shown in the terminal at startup or at the top of the control panel.
2. Open the **direct link**: the code is saved and you will not be asked again. Otherwise open the address and type the code.
   The tablet remembers every code it connected with (up to 6): if on the same PC you switch between Windows and Linux, each with its own code, you enter it once per system and then it switches by itself.
3. Chrome: menu > *Add to Home screen*. From that icon the deck opens full screen.
4. To keep the screen on: *Developer options > Stay awake* (with the tablet charging).
5. Tap the clock at the top right for full screen, if the browser supports it.
6. To open a page directly add its id to the address: `http://IP:8787/#media`, `#claude`, `#blender`.

At the top right you see the PC network (Wi-Fi name and signal, or Ethernet), download/upload speed and RAM, then the **settings gear**: theme, language (IT / EN) and **Always on**.

**Battery:** after a minute without touches the deck refreshes data more slowly (PC status every 15 seconds instead of 2); after 10 minutes the screensaver starts, black with a dim clock, and it stops calling the PC entirely. One tap wakes it up, without pressing the button underneath. Timings in `services.json` → `tablet`; to never start the screensaver on a tablet: gear at the top → *Always on*. The screen is still the biggest drain: lower the Android brightness, and if the tablet stays on charge use *Stay awake* only when needed.

**Swipe** left or right on the page to go to the next or previous page of the bottom bar (on a phone held in portrait, swipe along the rotated page). Swipes that start on a slider, a text field or something you can drag do not change the page; at the first and last page the page bounces.

Buttons with an orange bar at the bottom (e.g. LOCK) must be **held** for about 1 second.
Volume and undo buttons repeat while you hold them.

## Default pages

| Page | Content |
|---|---|
| HOME | music (basic controls), PC status, todo |
| MUSIC | full player (seek, shuffle, repeat, app volume) and track queue |
| APPS | programs (green dot = already running, another tap closes it), Claude, PowerShell/Terminal, screenshot, lock PC, screen off, **system volume**, Blender and DaVinci |
| DEV *(official plugin `dev`)* | VS Code, Claude Code, PowerShell, OpenClaw, VS Code shortcuts |
| GITHUB *(official plugin `github`)* | PRs, issues, CI, latest deployment (GitHub Actions workflows with deploy, release, publish or pages in their name: DEPLOY ✓/✗/… badge) and latest commit of your repositories |
| OLLAMA *(official plugin `ollama`)* | chat with local models |
| DEEPSEEK *(official plugin `deepseek`)* | chat with DeepSeek: write or dictate, the answer appears while it is written (STOP to cut it), model choice, account balance |
| CLAUDE *(official plugin `claude`)* | chat, Claude Code sessions, dictation, typing on the PC |
| DISCORD *(official plugin `discord`)* | servers, voice channels with who is inside, who is talking, mute/deafen, webcam, Go Live, per-person volume and mute just for you |
| GAMES *(official plugin `games`)* | the games picked in the control panel, with their icons (green dot when running; if running it is brought to the front) |
| EMAIL *(official plugin `mail`)* | inbox of the Thunderbird accounts chosen in the control panel, message reading, opening Thunderbird on the PC |
| SCREENS *(official plugin `screens`; Windows; Linux with KDE Plasma 6 + kdotool)* | PC monitors, window layouts, monitor apps open on, **virtual desktops** (switch, create, close, drag a window onto one) and a **GUIDE** button with the shortcuts |
| AUDIO *(official plugin `audio`)* | outputs and microphones (default, volume, mute), volume and mute of every app playing audio |
| VIRTUAL DESKTOPS *(official plugin `screens`, Linux only)* | guide to virtual desktop shortcuts (KDE Plasma, GNOME, Windows too); on Windows the same guide is in the SCREENS page |
| VIBER *(official plugin `viber`, add it from the panel)* | switch to Viber's open panels (terminal, git, browser, chat, tasks, files), change view (tabs, agents, focus), show the tasks of the open project |
| BROWSER DEV *(available)* | official plugin `official-plugins/browserdev/`: browser shortcuts: HARD RELOAD, DEVTOOLS, CONSOLE, INSPECT, DEVICE, CLEAR DATA (hold), LOCALHOST:5173 and :3000; keys go to the window in front |
| ANDROID *(available)* | adb (Android SDK platform-tools): DEVICES, logcat ERRORS and CRASHES, SCREENSHOT to Pictures, SCREEN with scrcpy, HOME/BACK/RECENTS, React Native DEV MENU and RELOAD, METRO 8081, RESTART ADB. Official plugin `official-plugins/android/` (page, adb commands, scrcpy) |
| BLENDER, DAVINCI, UNREAL *(available: add them to the bar from the panel)* | shortcuts for the three programs (UNREAL: play, simulate, compile C++ with Live Coding, W/E/R tools, views) |

## Viber

The **VIBER** page controls the Viber window in front on the PC (Windows and Linux). On the left **the buttons** in a grid, chosen and ordered from the control panel like for BLENDER; on the right two full-height columns, **Projects** and **Tasks**:

- **Projects**: the projects open in Viber, the one shown highlighted, with the state of their agents (red dot *waiting for you*, orange *working*, green *done*). A tap switches to that project with Viber's "next/previous project" shortcuts, read from its settings; after each step the deck checks that the project changed. With an Italian keyboard the default shortcuts (Ctrl+] and Ctrl+[) cannot be pressed: in Viber > Settings > Shortcuts pick others (e.g. Ctrl+PgDn / Ctrl+PgUp).
- **Tasks**: the tasks of the project shown, in-progress ones first, with their steps. The *Tasks* box in Viber's title bar has no commands in the API: it cannot be opened from the tablet.
- **Panels**: terminal, git, browser, chat, tasks, files (and, available but hidden, team, notes, pull requests, deploy, debug, simulator). The active one is lit. A panel that is not among the tabs open in Viber cannot be used (the API can only switch to an open tab): it leaves the grid by itself (the others close the gap) and comes back when you open it in Viber (**ALL** brings them all back).
- **Layouts** (Viber API): **ALL** (one box with every tab); also available **SPLIT** (browser + terminal), **REVIEW** (git + files + terminal), **FULL** (the active panel full screen).
- **Views** (Ctrl+Alt+1/2/3 shortcuts): **TABS** (projects at the top), **AGENTS** (agent bar on the left); **FOCUS** is also available. Viber is brought to the front before the keys are pressed.

For buttons in your pages: `{ "type": "viber", "panel": "terminal" }`, `{ "type": "viber", "layout": "review" }`, `{ "type": "viber", "view": "agents" }`, `{ "type": "viber", "project": "next" }`.

The official plugin `official-plugins/viber/` talks to Viber as an **MCP client**: it starts Viber's own MCP server (`browser-mcp-server.cjs`, the one Viber registers as `viber-browser` in `~/.claude.json`; otherwise it is looked for in the Viber install folder, or set `VIBER_MCP_SERVER`) and calls its tools. Projects, agents and tasks come from the `--agents` tools (`viber_agent_projects`, `viber_agent_list`, `viber_task_list`); panels and layouts from `viber_focus_panel` and `viber_set_layout`, run in the folder of the project on screen, because Viber only lets a window be changed by a client working in the project it shows. Views and project switching use Viber's keyboard shortcuts. Viber must be open: the deck checks it from `~/.viber/browser-mcp.json` before calling. With several Viber windows, the one in front wins. If Viber rejects a command (for example a tab closed in the meantime) the tablet shows a warning.

## Phone

The deck works on a phone too (scan the QR in the control panel). The layout is always the tablet's landscape one:

- with the phone in landscape the page fills the screen, with slightly shorter top and bottom bars;
- with the phone in portrait (or with rotation lock) the page is shown **rotated by 90°**: turn the phone with its top to the left and read it straight.

This applies to screens whose short side is under 600 px; the tablet does not change.

## Tablet themes

The **gear** in the top bar, next to the clock, opens the settings menu: theme, language (IT / EN) and *Always on*. The themes:

| Theme | Look |
|---|---|
| Classic | midnight blue, the original one |
| Material | dark Material 3: tonal surfaces, very rounded corners, active page with a pill under the icon |
| Neon Elgato | raised black keys like a Stream Deck, glowing colored icons |
| Neo-brutalist | light: cream background, thick black borders, solid shadows, pastel colors |

The screensaver clock changes with the theme too: thin (Classic), rounded (Material), digital with a glow (Neon), heavy with a solid shadow (Neo-brutalist). The fonts are in `public/fonts`, reduced to digits only (licenses in `public/fonts/LICENSE.md`).

The choice stays on that tablet. Buttons with `"color"` change with the theme: in Neon the color goes on the icon, in Neo-brutalist it becomes pastel.

### Your colors (control panel → Tablet themes)

Every theme is a **style** (shapes, corners, fonts: the four above) plus a **palette** of 10 colors: background, tiles, buttons, borders, text, secondary text, accent, OK, warning, error. In the control panel, card **Tablet themes**:

- pick a theme and change its colors: a **preset** (the four originals plus Nordic, Dracula, Forest, Sunset, Solarized, Paper), each in a **Dark** and a **Light** version (the switch next to *Preset*: on a preset you picked it swaps to the other version), or **one color at a time** with the RGB picker or the hex code;
- **New theme** makes a theme of your own: name, style and palette (for example the Neo-brutalist shapes with the Dracula colors);
- the preview on the right is the real tablet, with live data; a note warns when text and background have too little contrast;
- **Save**: on the tablet the theme shows up in the gear menu (a tablet already using it updates by itself). **Original colors** / **Delete theme** undo it;
- **Export** / **Import** save and load a theme as a `.json` file (`{ "vibeDeckTheme": 1, "name", "style", "palette" }`), ready to share.

The **control panel** uses the same themes: the picker at the top lists the four styles and your themes, and a theme with your colors restyles the panel too.

Your themes are in `config/themes.json` (personal, not in git). The server builds the CSS of a palette on the fly (`/theme-css/<id>.css`): every color of `dock.css`, of the style and of the plugins is recomputed from the 10 colors of the palette, so plugin widgets follow your colors too.

For style changes: the files in `public/css/themes/` are generated from `public/css/dock.css` and `scripts/themes/<theme>.js` (color tables and theme shapes). After a change to `dock.css` run `npm run themes`.

## Control panel (on the PC)

Double-click the **Vibe Deck** icon (desktop or next to the clock): a page opens in the PC browser to choose the tablet pages. The panel is in Italian; the labels below are quoted as they appear.

- **Drag** the pages to change the order of the bottom bar, or move them between *Nella barra* (in the bar) and *Disponibili* (available).
- The **star** picks the page that opens at startup.
- ***Pulsanti delle pagine*** (page buttons): pick a page of buttons (APPS, DEV, GAMES, VIBER, BLENDER, DAVINCI, UNREAL; in VIBER they are the ones left of the Projects and Tasks columns) and drag the buttons to reorder them, or move them between *Sul tablet* (on the tablet) and *Nascosti* (hidden), also with the ✕ and + on each button. The grid adapts by itself: with fewer buttons they get bigger. *Mostra tutti* (show all) puts every button back in the default order.
- ***Salva sul tablet*** (save to tablet): the tablet updates by itself. *Predefinite* (defaults) goes back to the pages and buttons of `dock.json`.
- **Theme** (top right): Classic, Material, Neon Elgato or Neo-brutalist, the same as the tablet. The choice stays on this PC and is separate from the tablet's; `/control?theme=neon` opens the panel with a theme without remembering it.

The choices go to `config/layout.json`, including the **HOME** built in the panel (widgets of the other pages, sizes and order: *HOME* tab). Buttons added later to the pages appear at the end of the page. The panel only answers from this PC (`http://127.0.0.1:8787/control`), not from the tablet or the network. Available pages are reached only through buttons that open them (`{ "type": "page" }`): for the Blender and DaVinci shortcuts add their pages to the bar. Page content is always edited in the page files (`config/pages/`).

### Connecting a phone or a tablet (QR)

At the top of the panel there is a QR code with the direct link (address + access code): scan it with the camera and the deck opens already connected. If the PC is on both cable and Wi-Fi, pick the network the phone is on. The same QR shows up in the terminal at startup (`DOCK_NO_QR=1` hides it).

### Email

Mail is connected **only through [Thunderbird](https://www.thunderbird.net/download/)** (free, open source, by Mozilla, for Windows and Linux). It is the only way that works with every service without app passwords or apps to register: Thunderbird signs in with each service's official methods (Gmail with confirmation on the phone, Outlook, iCloud, Yahoo, Libero, and also **university and company** mail on Microsoft 365 or Google Workspace, if the organization allows Thunderbird) and renews the sign-in by itself.

1. Install Thunderbird and add your accounts (*Existing email account*: for Gmail and Microsoft leave the password empty, the service's sign-in page opens).
2. Keep **"Keep messages for this account on this computer"** on (it is the default; account settings → Synchronization & Storage): it is needed to read the text on the tablet.
3. In the **Email** section of the panel the accounts appear by themselves: choose which ones to show on the tablet, then add the **EMAIL** page to the bar.

On the tablet you see the inbox (unread messages highlighted), open a message to read it, and **APRI SUL PC** (open on the PC) opens Thunderbird. With several accounts, **CAMBIA** (switch) goes from one to the next. Thunderbird must stay open (even minimized) to download new mail.

**Privacy:** the deck never asks for or stores passwords or tokens. It reads the Thunderbird profile files **read-only** (`INBOX.msf` for the list, the mail file for the text): it does not mark mail as read, move or delete it, and sends it only to the tablet on your home network. Mail files on disk are not encrypted (true for every mail program): protect the PC account with a password and, if you can, with disk encryption. `data/mail.json` only keeps which accounts to show.

Profiles searched: `%APPDATA%\Thunderbird` on Windows; `~/.thunderbird`, Flatpak (`~/.var/app/org.mozilla.Thunderbird/.thunderbird`) and Snap on Linux. `DOCK_THUNDERBIRD_DIR` points to another folder (the one with `profiles.ini`).

### Games

In the **Giochi** (games) section of the panel press **Aggiungi un gioco** (add a game): the system file picker opens (Windows: `.exe`, `.lnk` shortcuts and Steam `.url` files; Linux: `.desktop` files, scripts, AppImage). The deck suggests the name (from the file information) and the icons:

- the file's own icon (up to 256 px);
- game images found on the web: **Steam** cover and header, the **Wikipedia** article image and **Wikimedia Commons** logos (no API key). You can search with another name; without an icon the fallback one stays.

The **game process** field is used for the green dot and to bring the game back to the front: if the file is a launcher (Battle.net, Riot, Game Center...) write the process name of the actual game (several names separated by commas). The arrows change the order of the buttons, **Icona** picks another icon.

Games are personal data: they live in `data/games.json` and the icons in `data/game-icons/`, on this PC only. The project contains no games and no paths from any PC.

### Discord

It uses the Discord app's local connection (the same one Stream Decks use): no bot, it works with Discord open on the PC. Discord only grants it to registered applications, so a one-time setup is needed, guided by the panel:

1. on the [Developer Portal](https://discord.com/developers/applications) create a *New Application*;
2. under *OAuth2* copy the **Client ID** and **Client Secret**; under *Redirects* press *Add Redirect*, type `http://localhost` (no trailing slash) and press **Save Changes**. If it is missing, Discord answers *"invalid_request: missing redirect_uri"*;
3. paste them in the panel and press **Collega** (connect): Discord asks you to authorize the deck.

From the tablet: tap a server, then a channel to join it; tap a person in your room to open their menu: **volume for you** from 0 to 200% (slider, − and +, 50/100/150/200%) and **MUTE FOR ME**, like right-click in Discord (the others do not see it); **MIC** and **AUDIO** to mute or deafen yourself; **CAM** turns on the webcam; **LIVE** starts Go Live of the running game (one from the GAMES page, or any app with `"game": true`); **LEAVE** (hold) to leave the room.

Webcam and Go Live use two undocumented Discord commands (`TOGGLE_VIDEO`, `TOGGLE_SCREENSHARE`) and one extra permission: if you had already connected the deck, press **Riautorizza** (re-authorize) in the panel. If Discord does not grant that permission, authorization goes on without it, and CAM and LIVE stay off. Without any setup MIC and AUDIO still work, through Discord's default shortcuts (Ctrl+Shift+M / Ctrl+Shift+D). Credentials live in `data/discord.json`, on this PC only.

## Music

### Extension for Apple Music web and YouTube (recommended)

Apple Music is a web app, and Windows exposes very little about browser tabs: no queue, no tab volume and sometimes wrong durations. The small extension in the `extension/` folder reads the site's player directly and controls it.

Installation (once, in Brave, Chrome or Edge):

1. Open `brave://extensions` (or `chrome://extensions`, `edge://extensions`).
2. Turn on **Developer mode** (top right).
3. **Load unpacked** and pick the `extension` folder of this project.
4. Apple Music / YouTube tabs already open are connected by themselves (no reload needed).

After a deck update, in `brave://extensions` press the circular arrow on the extension to load the new version.

Clicking the extension icon shows whether it is connected to the deck. It works with `music.apple.com`, `music.youtube.com` and `www.youtube.com`. The extension only talks to the deck on the same PC (`127.0.0.1`).

With the extension:

- **Queue**: on the MUSIC page tap a track to play it. On YouTube the queue is the open playlist.
- **App volume**: the player's volume keys control Apple Music or YouTube, not the Windows volume.
- **Exact duration and position**, and tap on the bar to seek.
- **Shuffle and repeat** (Apple Music).

### Desktop apps

Spotify, VLC, Tidal, Deezer, MusicBee and similar are controlled through the system media controls, each one directly, without going through the app Windows considers "active". The volume of the player keys is that single app's volume (Windows mixer).
Only music apps are accepted: the list is customized in `config/services.json` → `media` (`allowApps`, `blockApps`).

The **system** volume is on the APPS page (VOL -, MUTE, VOL +).

## Claude

The CLAUDE page has two lists.

**Usage**: at the bottom of the left column of the CLAUDE page are the subscription bars: **5-hour session**, **week** and, when Anthropic provides them, the weekly per-model limits, each with the time it resets (orange from 70%, red from 90%). Tap the box to refresh it. The deck uses the Claude Code sign-in already done on the PC (`~/.claude/.credentials.json`, like Viber): the token stays on the PC, the tablet only gets the percentages.

**CLAUDE CODE**: the Claude desktop app sessions, grouped by the sections of the PC sidebar (your folders, like Work or Personal projects). Sessions outside the sections are grouped by project, as in the app. The orange dot means Claude is working.

- **Typing**: what you type (or dictate) is sent from the **app on the PC**, in the real session. The deck opens the session in the app, puts the text in the field and presses Send through Windows accessibility: you see it appear on the PC right away, without restarting the app, and the permissions chosen for that session apply (e.g. *Auto*).
- If Claude is working, the message is **queued** and sent when it is done.
- If there is already text typed in that session on the PC, the deck does not overwrite it and tells you.
- **STOP** (hold) stops Claude; **SUL PC** (on the PC) opens the session in the app.
- **+** next to a section opens a new session there, with the same "New session in …" button of the sidebar. New sessions from an external link would ask every time to confirm the folder on the PC, and that confirmation stays yours.
- While the deck is typing, the app on the PC switches to that session.

Without the app open (and on Linux) the deck continues the session with `claude -p --resume`, using the session's permission mode (`auto` if it has none). Changes made this way show up in the app when you reopen the session.

**CHAT**: conversations started from the tablet (Claude Code with your subscription, or the Claude API with `ANTHROPIC_API_KEY` in `.env`), saved in `data/claude-chats.json`. Chats on claude.ai and in the app's Chat tab live in your account, not on the PC: the deck cannot read them without signing in to your account.

### TODO and Windows Sticky Notes

On Windows the TODO shows the **Sticky Notes**: each line of a note is a task, a struck-through line is done, the bold first line is the title. From the tablet you can add lines (by voice too), tick them (the line gets struck through) and remove them; changes made on the PC show up on the tablet within a few seconds.

The Sticky Notes app does not see changes made from outside, so on every change from the tablet the deck closes it, updates the note, queues it for cloud sync and reopens it (about a second). Several quick taps cause a single restart. The deck never creates or deletes whole notes.

With several notes, tap a title in the TODO to choose where to add. In `services.json` → `todo`: `"memo"` picks the default note (part of its title), `"source": "local"` switches back to the deck's own list (also used on Linux).

### Same TODO on Windows and Linux (GitHub)

The TODO can be copied to `todo.json` on the **`dock-todo`** branch of a git remote, with the same git credentials you use to push: no token to configure and no commits in the code history.

**It is off by default.** Tasks end up on the remote, so turn it on (`"enabled": true` in `config/services.json` → `todo.sync`) only if the remote is **private**: if your copy of the deck is a public fork, add a private remote (e.g. `git remote add todo <private-repo-url>`) and set `"remote": "todo"`.

- The copy is updated a few seconds after every change from the tablet and every 2 minutes. That way it also picks up changes made directly in Sticky Notes, and those coming from the other PC.
- On Windows Sticky Notes remain the source: additions, ticks and deletions made on Linux are written to the notes (a line's text can only be changed in the Sticky Notes app). On Linux the local list receives everything, split by note as on Windows.
- If the same task changes on both PCs between two syncs, the PC that syncs wins.
- On the first start on a new PC the deck adopts the list it finds on GitHub. On Linux the previous local list is saved to `data/todo.prima-della-sync.json`.
- The **GitHub** cloud in the TODO title is green when everything is synced and red on error: tap it to sync right away or read the error.

Settings in `services.json` → `todo.sync`: `enabled`, `remote` (`origin`), `branch` (`dock-todo`), `intervalSec`.

### Voice dictation

The 🎤 button next to the text field (Claude and TODO):

1. uses the browser's speech recognition, if available;
2. otherwise, if you configured transcription on the PC (`services.json` → `voice`, for example whisper.cpp), opens the Android recorder and the PC transcribes the audio;
3. otherwise opens the keyboard: tap the microphone on the Android keyboard (Google voice typing), the most reliable way on Android 4.

## Configuration

All files are JSON. **Save and the tablet updates by itself**, without restarting.

| File | What it contains |
|---|---|
| `config/pages/<id>.json` | your pages, one per file (also edited copies of the default ones) |
| `config/apps/<id>.json`, `config/commands/<id>.json` | your apps and commands, one per file |
| `config/dock.json` | title, grid, start page and page order (`"pages"`: list of ids) |
| `config/apps.json` | launchable programs (paths for Windows and Linux) |
| `config/commands.json` | allowed commands (whitelist) |
| `config/services.json` | music, Claude, voice, GitHub, Ollama, system monitor |
| `.env` | port, access code, tokens and API keys |

The files in `config/` are yours and do not go to git. The defaults live in `config/defaults/` (pages in `config/defaults/pages/`, one per file) and in the official plugins (`official-plugins/<id>/pages/`): delete a file from `config/` to restore it. Step-by-step examples in the [developer guide](../README.md#3-developer-guide-make-vibe-deck-your-own); at the bottom of the control panel you find the list of configuration problems.
If you never edited a file in `config/`, it is upgraded to the new default at startup (after a `git pull`). Edited files stay as they are.

### dock.json

- `"pages"`: the page order. Each entry is the id of a page stored in its own file (`config/pages/<id>.json`, then `config/defaults/pages/<id>.json`), or a whole page written inline. A new `config/pages/<id>.json` is added at the end by itself.
- Each page is a grid (5 columns × 3 rows by default, or the page's `"columns"`/`"rows"`). Tiles are laid out left to right; `"w"`/`"h"` = cells.
- `"description"` on a page = text shown in the control panel, where you choose which pages are in the tablet bar and in which order (`config/layout.json`).

Button tile fields:

| Field | Meaning |
|---|---|
| `"label"`, `"icon"`, `"color"`, `"sub"` | text, icon, color and second line |
| `"action"` | what the button does (see [Action types](#action-types)) |
| `"repeat": true` | the action repeats while held (volume) |
| `"confirm": true` | must be held for about 1 s (delicate actions) |
| `"showRunning": "<app id>"` | green dot when that app from `apps.json` is running |
| `"id"` | fixed button name, used by the control panel to remember order and hidden buttons (without it, the position counts) |
| `"hidden": true` | available but hidden until you show it from the panel |
| `"os": "linux"` / `"windows"` | button or page only on that system |
| `"linux": { ... }` / `"windows": { ... }` | fields that change on that system, `action` included |

Page fields: `"autoGrid": true` (columns and rows chosen from the number of buttons), `"buttonGrid": true` (buttons in a grid on the left, customizable from the panel, and widgets on the right; `"widgetWidth": 0.5` = half width, like the VIBER page), `"tab": false` (available but not in the bar).

### apps.json

Apps launched by `{ "type": "launch", "app": "<id>" }`. Each app can have a `"windows"` and/or `"linux"` variant.

| Field | Meaning |
|---|---|
| `path` | executable, `.lnk` shortcut, absolute path or command in the PATH. `%VAR%` (Windows), `$VAR` and `~` (Linux) and `*` for versions are allowed (`Blender *\blender.exe`). Windows: `shell:AppsFolder\<AppID>` starts Store apps (find the AppID with PowerShell: `Get-StartApps`). Can also be a list of possible paths: the first one that exists wins |
| `args`, `cwd` | argument list and working folder (optional) |
| `toggle` | `true` = the button shows whether the app is running and, if it is, closes it (like the window X: the app may ask to save) |
| `process` | process name, if different from the file (e.g. `"discord"`); can be a list (e.g. client and match) |
| `whenRunning` | `"focus"` = if already running, the button brings it to the front |
| `game` | `true` = it is a game: Discord's Go Live streams it, if it is running |
| `title` | regex on the window title, to tell apart apps sharing the same process |
| `bridge` | `"apple"`, `"youtube"` or `"ytmusic"` = web app recognized by the browser extension |

The `"linux"` (or `"windows"`) variant can also be a **list of alternatives**: the first one installed wins (e.g. Konsole, then GNOME Terminal...). `.desktop` files (Brave/Chrome web apps, downloaded apps) are started with `gtk-launch`.

```json
"linux": [ { "path": "konsole", "args": ["-e", "claude"] }, { "path": "gnome-terminal", "args": ["--", "claude"] } ]
```

Games (GAMES page) are added from the control panel: they live in `data/games.json`, not here.

### commands.json

Allowed commands for `{ "type": "command", "id": "<id>" }`. The tablet can only pick an id from this list: no free shell.

| Field | Meaning |
|---|---|
| `cmd`, `args` | program and arguments (`"windows"` / `"linux"` variants; `"linux"` can be a list of alternatives, the first one installed wins) |
| `showOutput` | show the output on the tablet in a window |
| `timeoutMs` | maximum time (20 s by default) |

`{root}` in arguments = the deck folder. The ANDROID page commands (adb and logcat) are in the official plugin, `official-plugins/android/commands/android.json`: on Windows the adb of the standard SDK folder is used, otherwise the one in the PATH. To change one, copy an entry to `config/commands/<id>.json`.

### services.json

Service settings. Secrets (tokens, API keys) go in `.env`.

| Section | Keys |
|---|---|
| `system` | `gpu`: `false` to never query `nvidia-smi`. `libreHardwareMonitorUrl`: CPU temperature on Windows; start LibreHardwareMonitor with *Remote Web Server* on and set it to `"http://127.0.0.1:8085/data.json"` |
| `github` | `repositories`: e.g. `["your-user/project-one", "your-user/project-two"]`; empty = the most recently updated repositories of your account (needs `GITHUB_TOKEN` in `.env`, or GitHub CLI `gh` signed in). `owner`: without a token, the public user whose repositories to show. `autoRepos`, `refreshSeconds` |
| `ollama` | `url`, `defaultModel` (empty = the first installed model), `timeoutMs`, `keepAlive`, `system` (system prompt) |
| `claude` | `backend`: `"auto"` = API if `ANTHROPIC_API_KEY` is in `.env`, otherwise Claude Code (`claude` command); `"api"` = Claude API only; `"cli"` = Claude Code only (uses your subscription). `model`, `effort`, `maxTokens`, `system`: API backend only. `cliModel` (empty = default) and `cliCwd`: CLI backend only. `cliPermissionMode`: Claude Code permissions when driven from the tablet; empty = your own settings (tools that ask for confirmation are denied), `"acceptEdits"` = can edit files without asking. `remoteTargets`: windows the tablet can "type into like a keyboard" (PC mode); `focus` = process to bring to the front (empty = the active window) |
| `media` | `allowApps`: system music sources accepted on top of the default ones (Spotify, VLC, Tidal, Deezer, MusicBee, ...), regex on the app id. `blockApps`: never treated as music (games, launchers...). Without the browser extension, the browser controls are used as a fallback |
| `todo` | `source`: `"memo"` = Windows Sticky Notes if present, `"local"` = the deck's own list. `memo`: note where new tasks go (part of the title, i.e. the bold first line); empty = the most recently edited note, and from the tablet you can choose by tapping the title. `sync`: see [Same TODO on Windows and Linux](#same-todo-on-windows-and-linux-github) |
| `tablet` | battery: `idleAfterSec` (seconds without touches before refreshes slow down), `pollSec` and `idlePollSec` (PC status interval when in use and when idle), `sleepAfterMin` (minutes without touches before the screensaver starts: black screen, no refreshes, one tap wakes it; `0` = never) |
| `voice` | optional PC transcription of audio recorded on the tablet. With whisper.cpp: `"command": "C:\\whisper\\whisper-cli.exe"`, `"args": ["-m", "C:\\whisper\\ggml-small.bin", "-l", "en", "-nt", "-f", "{file}"]` |

### Adding a button

In the page's `tiles` (`config/pages/<id>.json`; for a default page copy it first from `config/defaults/pages/`):

```json
{ "label": "OBS", "icon": "camera", "color": "#5b3fa0", "action": { "type": "launch", "app": "obs" } }
```

and in `config/apps.json` (or in a `config/apps/obs.json` file with just the app object):

```json
"obs": {
  "label": "OBS Studio",
  "windows": { "path": "C:\\Program Files\\obs-studio\\bin\\64bit\\obs64.exe", "cwd": "C:\\Program Files\\obs-studio\\bin\\64bit" },
  "linux": { "path": "obs" }
}
```

`.lnk` shortcuts work too (that is how Apple Music opens from the desktop shortcut).

## Audio

On the **AUDIO** page:

- on the left the **outputs** (speakers, headphones, monitors) and **inputs** (microphones): tap a name to make it the default; under the default one there are mute, −, the volume bar (tap a point to set it) and +;
- on the right the **apps** playing audio (green dot = playing), each with its own volume and mute, like the Windows Volume Mixer.

The VOL+ / VOL− / MUTE buttons on the APPS page stay: they always control the system volume.

On Windows it uses Core Audio (changing the default device uses the same interface as the Windows Sound panel, like SoundSwitch or EarTrumpet). On Linux it uses `pactl` (PulseAudio, or PipeWire with pipewire-pulse, version 15 or later): when the default output changes, apps that are playing move there too.

## Screens

On the tablet's **SCREENS** page you see the monitors as they sit on your desk (numbered from the left) and the open windows.

- **Arranging windows**: tap a monitor, pick a layout (halves, thirds, 2/3 + 1/3, quarters, ...), tap a zone and then a window in the list on the right. The next zone is selected by itself, like Windows Snap Assist. On vertical monitors columns become rows.
- Without a zone selected, tapping a window brings it to the front. The two buttons on each row minimize or maximize it.
- **Open apps on**: AUTO lets Windows decide; with a monitor chosen, apps started from the tablet (*launch* buttons) are moved there as soon as their window appears, keeping relative size and position.

On the right the open windows (they use all the free space, the list scrolls) and at the bottom the **virtual desktops** (at most 3): one tab per desktop with number, name and how many windows it has (the active one in blue). Tap a desktop to switch to it, the **+** tab creates one and switches to it (it disappears when there are 3), the **X** in the corner (hold it) closes it: its windows are not closed, they move to the neighboring desktop. The list is read from the Windows registry, the windows of each desktop through the public `IVirtualDesktopManager` API, and the commands are the Win+Ctrl+←/→, Win+Ctrl+D and Win+Ctrl+F4 shortcuts. The **GUIDE** button at the top shows all the virtual desktop shortcuts of Windows and Linux.

**Dragging a window**: hold a window in the list (with the mouse just drag it) and drop it on a **virtual desktop** (it goes there without you switching desktop, like in Win+Tab), on **New** (creates a desktop and puts it there) or on a **monitor zone** of the map: while dragging, every monitor shows the zones of the split chosen at the bottom (Halves, Thirds, Quarters...) and the window snaps into the zone where you drop it, with that size. For desktops the deck uses Explorer's internal interface (the one behind Win+Tab, undocumented: the public API only moves the calling program's own windows), with the GUIDs of Windows 11 24H2 and later; on other versions the tablet says it cannot do it instead of doing damage.

**SCREENS on Linux** (KDE Plasma 6, Wayland or X11): windows, monitors, virtual desktops and dragging go through KWin, with [kdotool](https://github.com/jinliu/kdotool) 0.3 or later (`kwinscript` command: the deck sends KWin a small script and reads the answer). On Wayland no other program can see other programs' windows. Install it (`paru -S kdotool` on Arch/CachyOS, or `cargo install kdotool`), restart the deck and add the SCREENS page from the panel. Without KDE or kdotool the page says so. On Linux a window dragged onto **New** creates a desktop at the end without switching to it; **+** creates a desktop and switches to it, as on Windows.

Windows of programs started as administrator cannot be moved (a Windows limit). Exclusive full-screen games do not move. The monitor choice is stored in `data/screens.json`.

### Games

Games are added from the panel (**Giochi** section, see above) and live in `data/games.json`. Each one becomes an app with `"game": true` and `"whenRunning": "focus"`: the button shows the green dot if the game is running and, in that case, brings it to the front instead of starting it again. In `config/apps.json` you can mark an app as a game too with `"game": true`: `"path"` can be a list of paths (the first one that exists wins), `"process"` a list of processes (e.g. client and match).

### Running apps: green dot and closing

Apps with `"toggle": true` in `config/apps.json` show a green dot while running; another tap closes them like the window X (the app may ask to save). It is on for Blender, DaVinci, VS Code, Unreal, Apple Music, Spotify, Claude and Discord; deliberately off for PowerShell, File Explorer, Task Manager and Claude Code, so work in progress is never interrupted.
Apple Music (web) is recognized through the extension: "closing" closes its tab. For a button that does not launch the app (e.g. one opening the BLENDER page) the dot comes from `"showRunning": "blender"`.
On Linux it needs `wmctrl`.

### Action types

| Action | Example |
|---|---|
| Launch app | `{ "type": "launch", "app": "vscode" }` |
| Shortcut | `{ "type": "hotkey", "keys": ["CTRL", "SHIFT", "P"], "focus": "Code" }` |
| Single key | `{ "type": "key", "key": "F12", "repeat": 1 }` |
| Type text | `{ "type": "text", "value": "Hello!\n" }` |
| Music (active app) | `{ "type": "media", "command": "play_pause" }` (also `next`, `previous`, `stop`) |
| Music app volume | `{ "type": "media", "command": "app_volume_up" }` (also `app_volume_down`, `app_mute`) |
| System volume | `{ "type": "media", "command": "volume_up" }` (also `volume_down`, `mute`) |
| Open URL on the PC | `{ "type": "open_url", "url": "https://github.com" }` |
| Open folder or file | `{ "type": "open_path", "path": "~/Documents" }` |
| Command | `{ "type": "command", "id": "lock_pc" }` → `commands.json` |
| Switch page | `{ "type": "page", "page": "blender" }` |
| Macro | `{ "type": "macro", "steps": [ {…}, { "type": "wait", "ms": 300 }, {…} ] }` |
| Discord | `{ "type": "discord", "command": "stream" }` (also `mute`, `deaf`, `video`) |

`focus` (optional) brings the program to the front before pressing the keys. The value is the process name: `blender`, `Resolve`, `Code`.

Button options: `"sub"` (second line), `"color"`, `"repeat": true` (repeats while held), `"confirm": true` (must be held), `"w"`/`"h"` (cells taken). Each page can have its own grid with `"columns"` and `"rows"`.

**Keys:** `CTRL SHIFT ALT WIN`, `A`–`Z`, `0`–`9`, `F1`–`F24`, `ENTER ESC TAB SPACE BACKSPACE DELETE INSERT HOME END PAGEUP PAGEDOWN UP DOWN LEFT RIGHT`, `NUM0`–`NUM9`, `PRINTSCREEN MINUS EQUALS COMMA PERIOD SLASH BACKQUOTE`, `MEDIA_PLAY_PAUSE VOLUME_UP`…

**Widgets:** `system`, `nowplaying`, `queue`, `github`, `todo`, `clock`, `claude`, `chat` (with `"provider": "ollama"`), `discord`, `screens`, `mail`, `audio`, `vdesk` (virtual desktop guide), `viber`.

**Icons:** `home music apps code github chat sparkle check cube film lock play pause stop next prev volup voldown mute shuffle repeat folder terminal cpu camera desktop robot refresh save keyboard undo redo fullscreen cut flag back add close send trash power bolt mic link headset gamepad cards tank sword layout live camoff window target mail attach settings`.

### GitHub

Put a personal token (fine-grained, read-only) in `GITHUB_TOKEN` in `.env`. Alternatively install GitHub CLI and run `gh auth login`: the token is taken from there.
Without `repositories` in `services.json` the 6 most recently updated repositories are shown.
Tap a repository to open it on the PC; tap the PR, ISSUE or CI badges to open that section.

### Ollama

Ollama just needs to be running on the PC. The tablet never talks to Ollama directly: it always goes through the server.

### DeepSeek

Create an API key on [platform.deepseek.com](https://platform.deepseek.com/api_keys) (pay as you go: top up some credit), then
paste it in the **DeepSeek** card of the control panel and press **Save and test**: the key is saved encrypted on the PC and never
reaches the tablet. The card also picks the default model (the list comes from DeepSeek, e.g. `deepseek-v4-flash` and
`deepseek-v4-pro`) and the instructions sent with every chat. Page **DEEPSEEK** (developer pack) and a HOME widget: write or
dictate, the answer streams from DeepSeek to the PC and the tablet shows it while it grows; tap the red button to stop it (what was
already written stays). The balance is shown at the top (red when it ran out). DeepSeek is also a connector for JSON widgets:
source `deepseek.balance` (fields `total`, `currency`, `toppedUp`, `granted`, `available`). For tests, `DEEPSEEK_URL` points the
plugin to another server.

### OBS Studio

In OBS (28 or later): **Tools > WebSocket Server Settings**, tick **Enable WebSocket server**, then **Show Connect Info** and copy
the password into the **OBS Studio** card of the control panel (saved encrypted). Page **OBS** (streaming pack) and a HOME
widget: go live and stop (**hold** to stop), record, virtual camera, replay buffer, mute audio sources, switch scenes, a
preview of the program scene and the stats (fps, CPU, dropped frames). OBS is also a connector for JSON widgets: source
`obs.state` and actions `obs.stream`, `obs.record`, `obs.scene`, `obs.mute`, `obs.virtualcam`, `obs.replay`.

### Twitch

In the **Twitch** card of the control panel, type a channel name to read its chat (any channel, no login). To control your
own stream, register a free app at [dev.twitch.tv/console/apps](https://dev.twitch.tv/console/apps) (redirect `http://localhost`,
category Broadcaster Suite, client type **Public**), paste its **Client ID** and press **Collega Twitch**: the panel shows a
code to enter at twitch.tv/activate (no secret, tokens saved encrypted). Page **TWITCH** (streaming pack, with OBS below it
when the OBS plugin is installed) and a HOME widget: live chat with colours, subs and moderation, viewers and uptime,
title and category, marker, clip, ads (**hold**), chat modes (slow, emote, subs, followers) and writing in chat (also by
voice). Connector `twitch.state` and actions `twitch.marker`, `twitch.clip`, `twitch.ad`, `twitch.mode`, `twitch.say`.

### League of Legends

Page **LOL** (gaming pack, add it to the bar from the control panel) and a HOME widget: search a champion (or dictate the
name), filter by role, tap an icon to see passive and abilities, then **Build su u.gg** opens the build of that role
(skill order, runes, items) on the PC. Champions, icons and abilities come from Riot Data Dragon (in Italian), roles from
Meraki Analytics; the PC downloads them, keeps them in `data/plugins/lol/` and serves the icons to the tablet (old
browsers can't always open the Riot site). u.gg has no public API, so the build opens on u.gg itself.

## Linux

Everything works except the parts that depend on Windows (Sticky Notes), replaced by standard tools. The SCREENS page on Linux needs KDE Plasma 6 and kdotool (see above).
On the APPS page: **TERMINAL** (Konsole, GNOME Terminal, Alacritty...), system **MONITOR**, area **SCREENSHOT** (Spectacle), **DESKTOP** (shows the KDE desktop), **CLAUDE** opens the Claude web app installed from Brave (otherwise claude.ai), **VIBER** the desktop app. On CachyOS / Arch:

```bash
sudo pacman -S playerctl wtype
paru -S kdotool
sudo ufw allow 8787/tcp
```

(`kdotool` is for the SCREENS page: windows and virtual desktops in KDE.) On Debian/Ubuntu:

```bash
sudo apt install playerctl xdotool wtype pulseaudio-utils
```

- **playerctl**: music, except the queue (any MPRIS player: Spotify, Firefox, VLC…), including the single app's volume.
- **Browser extension**: same as on Windows, for Apple Music web and YouTube.
- **wpctl / pactl / amixer**: system volume.
- **xdotool** (X11) or **wtype** (Wayland with KDE/Sway/Hyprland): shortcuts, text and "type on the PC". On GNOME Wayland simulated shortcuts are not allowed by the system.
- CPU temperature is read from `/sys/class/hwmon`; AMD GPUs from sysfs.
- Firewall: `sudo ufw allow 8787/tcp`.

### Desktop icon (Linux)

As on Windows, the deck can run **in the background**, without a terminal:

```bash
scripts/linux/vibe-deck.sh install
scripts/linux/vibe-deck.sh install autostart
```

The first command adds the desktop icon and the app menu entry, the second (optional) starts the deck at login. You can also answer yes to the questions of `./start.sh --setup`.

- **Double-click** the icon: starts the deck if it is off and opens the control panel.
- **Right-click**: start without opening the panel, restart, stop, open the log (`data/dock.log`).
- It also works with a deck started from a terminal: stop closes that one too.
- From a terminal: `scripts/linux/vibe-deck.sh status|start|stop|restart|panel|log`; `uninstall` removes the icon, menu entry and autostart. `DOCK_DATA_DIR` and `DOCK_PORT` change the data folder and port (for testing).

If you move the project folder, run `install` again: the icon points to the current path.

## Security

### Encrypted data

Passwords, tokens and client secrets are not stored in clear text on disk:

- `data/mail.json` (only the accounts to show) and `data/discord.json` are encrypted (AES-256-GCM);
- in `.env` the secrets (`GITHUB_TOKEN`, `ANTHROPIC_API_KEY` and every variable ending in `TOKEN`, `SECRET`, `PASSWORD`, `_KEY`) are encrypted on the first start: they become `enc:v1:...`. To change one write the new value in clear text: at the next restart it is encrypted again. `DOCK_TOKEN` stays readable because it is the code the tablet asks you for.

The key lives in the **system keychain**: on Linux the Secret Service (KWallet on KDE, GNOME Keyring), read with `secret-tool` (`libsecret` package); on Windows your account's DPAPI. If there is no keychain, the key goes to `data/secret-key` (permissions 600) and the log says so. `data/secret-key.json` says where it is.

Encryption protects files that get copied, synced or accidentally end up in a backup or on GitHub; it does not protect against a program running with your account while the session is open. If you lose the key (keychain reset), the encrypted data cannot be recovered: reconnect the accounts from the panel.

- The server only accepts connections from the local network.
- Every API requires the access code (cookie or `X-Dock-Token` header).
- The tablet only sends "I pressed button X of page Y": the server reads the action from the configuration. Arbitrary commands cannot be run from the tablet.
- **Warning:** "type on the PC" and Claude Code sessions let the tablet type text on the PC and make Claude Code work in your folders. That is why the access code matters: do not share it.
- The browser extension is accepted only from this PC (`127.0.0.1`) and with a header websites cannot send.
- GitHub token, Claude API key and Ollama stay on the PC; for mail the deck has no credentials (Thunderbird keeps them).
- On Windows the firewall rule only applies to **private** networks. If your network is "Public", the tablet may not connect: set it to private.

## Troubleshooting

| Problem | Solution |
|---|---|
| The tablet does not connect | PC and tablet on the same network? Windows network set to *Private*? Firewall: `start.bat --setup` |
| I cannot see the icon | Look under the arrow next to the clock. If the icon is grey, open the log from its menu |
| "Port already in use" | The deck is already running (icon or another window): close the other one |
| Music not detected | Apple Music web / YouTube: install the extension and reload the tab. Desktop app: it must be a music app (see `services.json` → `media`) |
| Empty queue | The queue is only available with the extension (Apple Music, YouTube Music, YouTube playlists) |
| Shortcuts ignored in a program | Windows blocks simulated keys sent to programs started as administrator |
| "App not found" | Fix the path in `config/apps.json` |
| "Encryption key not found in the keychain" error | KWallet / GNOME Keyring locked: unlock it and restart the deck |
| Claude Code does not answer | Try `claude -p "hello"` in a terminal: it must work without an interactive login |
| CPU temperature N/A on Windows | Start LibreHardwareMonitor with *Remote Web Server* and set `libreHardwareMonitorUrl` (see [services.json](#servicesjson)) |

## Development

The guide to customize pages, buttons, actions and widgets is in the [main README](../README.md#3-developer-guide-make-vibe-deck-your-own).

| Command | What it does |
|---|---|
| `npm install` | dependencies, development ones included |
| `npm test` | tests for server, music, actions, configuration, client ES5 compatibility and the zero-comments rule |
| `npm run server` | starts the server only, without the start script |

`DOCK_CONFIG_DIR` / `DOCK_DATA_DIR` point to alternative configuration and data folders (for testing).

| Path | What it is |
|---|---|
| `server/index.js` | Express API |
| `server/config.js` | JSON loading and hot reload |
| `server/auth.js` | local network only + access code |
| `server/secrets.js` | encryption of sensitive data (key in the system keychain) |
| `server/actions/` | action engine and macros |
| `server/plugins.js` | plugin loader (`plugins/` folder) |
| `server/themes/` | palettes: styles (registry), presets, recoloring of the CSS, `config/themes.json` |
| `server/platform/` | `windows.js` (+ `windows-helper.ps1`), `linux.js`, `keys.js` |
| `server/services/` | system, media, bridge, claude, claudecode, voice, github, ollama, todo, mail, pairing (QR) |
| `public/` | tablet client (ES5, no framework) |
| `extension/` | browser extension for Apple Music web and YouTube |
| `config/defaults/` | default configuration |
| `official-plugins/<id>/` | official plugins shipped with Vibe Deck, each with `plugin.json`: one plugin per feature (`blender`, `davinci`, `unreal`) and packs that group them (`creative`) |
| `plugins/<name>/` | local plugins: extra actions, routes, pages and widgets (`npm run new:widget -- <name>`) |
| `scripts/bootstrap.js` | automatic startup (same on Windows and Linux) |
| `scripts/windows/` | notification area icon and hidden startup |
| `scripts/linux/` | background startup, desktop and app menu icon |

**Adding a feature without touching the project:** a plugin (`npm run new:widget -- <name>`), see *Plugins* in the main README.

**Adding an action type to the project:** add a function to `HANDLERS` in `server/actions/index.js`. If it needs the operating system, add the method to both `server/platform/windows.js` and `server/platform/linux.js`.

**Swipe and plugin widgets:** a widget that uses horizontal drags of its own puts `data-noswipe` on that element (or adds a function to `ctx.app.swipeGuards` that returns `true` for the element where the finger starts), so the swipe does not change page.

The client must stay ES5 with no flexbox/grid: `tests/client-es5.test.js` checks it. The repository has **zero comments**: `tests/no-comments.test.js` checks it.

## License

MIT, see [LICENSE](../LICENSE).
