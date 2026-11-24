# Vibe Deck

**The Stream Deck from developer to developers.**

Turn an **old Android tablet or the phone in your pocket** into a **wireless Stream Deck** for your PC.
A small Node.js server runs on the PC (Windows or Linux); the tablet or phone opens a web page: nothing to install on it.

<p align="center">
  <a href="https://github.com/StefanoDiPatti/vibe-deck/releases/latest"><img src="docs/screenshots/promo.gif" width="720" alt="Vibe Deck promo video: an old tablet becomes a Stream Deck"></a><br>
  <sub>High-quality videos (landscape and vertical, mp4) are attached to the <a href="https://github.com/StefanoDiPatti/vibe-deck/releases/latest">release</a>.</sub>
</p>

![HOME page on the tablet: music, notes and PC diagnostics](docs/screenshots/tablet-main.png)

## Features

- **Buttons** you configure: apps, shortcuts, text, macros, commands. A green dot shows when the app is already running.
- **Music**: cover art, queue, seek, shuffle, repeat and per-app volume (Apple Music and YouTube in the browser, Spotify, VLC...).
- **PC status**: CPU, RAM, NVIDIA GPU (load, temperature, VRAM) and network.
- **Discord**: servers, voice channels, who is talking, mute, webcam and Go Live.
- **Audio**: default output and microphone, volume of every app.
- **Screens**: which monitor apps open on, window zones (like Snap), virtual desktops, drag windows around.
- **Claude Code**: the desktop app sessions grouped by section; type or dictate on the tablet and the message is sent on the PC. Subscription usage.
- **Games** picked from the control panel, with their own icons. **Email** from Thunderbird, read-only.
- **TODO** on Windows Sticky Notes (or a local list on Linux), with dictation. GitHub, Ollama, Viber, shortcuts for Blender and DaVinci Resolve.
- **Four themes** (Classic, Material, Neon Elgato, Neo-brutalist) on the tablet and in the PC control panel.
- **Tablet UI in English or Italian**, switched from the gear in the top bar.
- **Control panel** on the PC to arrange pages and buttons by drag and drop, and a **QR code** to connect a phone.

| Buttons (APPS page) | Claude Code sessions |
|---|---|
| ![APPS page](docs/screenshots/tablet-apps.png) | ![CLAUDE page](docs/screenshots/tablet-claude.png) |
| **Audio, Neon Elgato theme** | **GitHub with deployments, Neo-brutalist theme, in English** |
| ![AUDIO page, Neon Elgato theme](docs/screenshots/tablet-audio-neon.png) | ![GITHUB page in English, Neo-brutalist theme](docs/screenshots/tablet-github-brutal-en.png) |

*Screenshots from the demo with fake data (`npm run demo`, then `npm run screenshots`).*

### Control panel on the PC

| Neon Elgato | Neo-brutalist | Material |
|---|---|---|
| ![Control panel, Neon Elgato theme](docs/screenshots/pannello-neon.png) | ![Control panel, Neo-brutalist theme](docs/screenshots/pannello-brutal.png) | ![Control panel, Material theme](docs/screenshots/pannello-material.png) |

## Contents

1. [Installation guide](#1-installation-guide): requirements, Windows, Linux, connecting the tablet, updating.
2. [User guide](#2-user-guide): the tablet, the pages, the control panel, services to connect.
3. [Developer guide](#3-developer-guide-make-vibe-deck-your-own): pages, buttons, apps and commands as single files, actions, plugins (new widgets and actions) and the code.

The full reference for every feature is in [`app/README.md`](app/README.md).

---

# 1. Installation guide

## Requirements

- A PC with **Windows 10/11** or **Linux** (KDE Plasma recommended; GNOME works, without the SCREENS page).
- **Node.js 18+**: if it is missing, the start script offers to install it.
- A tablet or phone with any browser, even a very old one (the client is ES5).
- PC and tablet on the **same network**.

## Download

```bash
git clone https://github.com/StefanoDiPatti/vibe-deck.git
cd vibe-deck/app
```

(or download the ZIP from GitHub and extract it; everything you need is in the `app/` folder).

Just want a look? `npm run demo` (in `app/`, after `npm install`) starts a deck with **fake data** at
`http://127.0.0.1:8790/?t=DEMO1234`, without touching your configuration.

## Windows

1. Double-click **`app\start.bat`**.
2. On the first run the script does everything: it offers to install Node.js (with winget) if missing, installs the dependencies,
   creates the `.env` file with a random **access code** and your configuration in `app\config\`.
3. Then it asks whether to open the firewall port, create the **Vibe Deck** shortcut on the desktop and start automatically at login.
4. The deck runs **in the background**: look for its icon (four small blue squares) next to the clock, possibly under the arrow.
   From its menu you open the control panel, see the address and code for the tablet, open the log, restart or quit.

> **"Public" network:** the firewall rule only applies to private networks. If the tablet cannot connect,
> set the Windows network to *Private* (Settings → Network & Internet → your network).

To answer the setup questions again: `start.bat --setup`. To see the messages in a window: `start.bat --console`.

## Linux

```bash
cd vibe-deck/app
./start.sh
```

The first run installs dependencies, creates `.env` and the configuration, and asks the same questions as on Windows.

Recommended programs (used by music, shortcuts and the SCREENS page):

```bash
sudo pacman -S playerctl wtype
paru -S kdotool
```

on Arch / CachyOS (`kdotool` is for the SCREENS page on KDE Plasma 6), or on Debian / Ubuntu:

```bash
sudo apt install playerctl xdotool wtype pulseaudio-utils
```

If a firewall is active: `sudo ufw allow 8787/tcp`.

To run it in the background with an icon on the desktop and in the app menu:

```bash
scripts/linux/vibe-deck.sh install
scripts/linux/vibe-deck.sh install autostart
```

The first command adds the icon (double-click = start and open the control panel), the second one (optional) starts the deck at login.

## Connecting the tablet

1. The quickest way: scan the **QR code** at the top of the control panel (or in the terminal at startup).
2. Or open on the tablet the **direct link** shown in the icon menu, for example `http://192.168.1.50:8787/?t=ABCD2345`:
   the code is saved and you will not be asked again.
3. Chrome: menu → *Add to Home screen*. From that icon the deck opens full screen.
4. To keep the screen on: *Developer options → Stay awake* (with the tablet charging), and turn on **Always on** in the deck's
   settings (gear in the top bar) so the clock screensaver never starts.

The **control panel** only opens on the PC: double-click the Vibe Deck icon, or go to `http://127.0.0.1:8787/control`.

## What you get on the first run (standard setup)

A simple Vibe Deck, made for anyone (you do not need to be a developer or a gamer):

| In the bar | What it does |
|---|---|
| **HOME** | music playing, notes and TODO, PC status (diagnostics) |
| **MUSIC** | cover art, controls, queue and app volume |
| **APPS** | Apple Music, Discord, folders, screenshot, show desktop, lock PC, screen off, volume |
| **SCREENS** | monitors, window layout and virtual desktops (on Linux it needs KDE Plasma: add it yourself) |
| **AUDIO** | output, microphone and the volume of every app |

Everything else is ready among the **available pages** of the control panel: CLAUDE, GITHUB, DEV, OLLAMA, VIBER,
DISCORD, GAMES, EMAIL, BROWSER DEV, ANDROID, BLENDER, DAVINCI, UNREAL. Drag them into the bar when you need them.
On the APPS page the developer programs (VS Code, Docker, Blender…) are **hidden**: *Pulsanti delle pagine* (page buttons) >
APP > *Mostra tutti* (show all), or drag only the ones you want. You change the HOME from the control panel (*HOME*), language and
theme from the tablet (gear at the top). To go back to this setup: *Predefinite* (defaults) in the bar at the bottom of the panel.

> The control panel on the PC is in Italian for now; the tablet can be switched to English.

## Updating

```bash
cd vibe-deck
git pull
```

Then restart the deck (icon menu → *Riavvia* / restart). Configuration files you never changed are upgraded automatically;
the ones you changed stay as they are. Your data (`app/data/`, `app/config/`, `app/.env`) is not in git.

If something goes wrong: [Troubleshooting](app/README.md#troubleshooting).

---

# 2. User guide

## The tablet

- **Bottom bar**: the pages. You choose which ones and their order in the control panel.
- **Buttons**: a tap runs the action. Buttons with an orange bar at the bottom (e.g. LOCK) must be **held** for about
  a second. Volume and undo repeat while you hold them. The **green dot** means the app is running.
- **Top right**: PC network, speed, the **settings gear** and the clock (tap it for full screen).
  The gear opens a menu with **theme**, **language** (IT / EN) and **Always on** (no clock screensaver).
  The choices are remembered on the tablet.
- **Battery**: after a minute without touches the deck refreshes data more slowly; after 10 minutes the **screensaver**
  starts (a dim clock). One tap wakes it up.
- **Phone**: it works on a phone too, in landscape.
- To open a page directly: `http://IP:8787/#media`, `#claude`, `#games`...

## The pages

| Page | What it does | Windows | Linux |
|---|---|---|---|
| HOME | Music, PC status and TODO; **you design it in the control panel** (Claude usage, GitHub, email, clock…) | ✅ | ✅ (TODO in a deck list instead of Sticky Notes) |
| MUSIC | Cover art, queue, position in the track, app volume | ✅ | ✅ with `playerctl` |
| APPS | App and system buttons (Docker Desktop too) | ✅ | ✅ (Terminal, System Monitor, Spectacle instead of the Windows ones) |
| DEV | Developer tools | ✅ | ✅ |
| GITHUB | Repositories, PRs, issues, CI and **deployment status** (GitHub Actions); git command guide | ✅ | ✅ |
| OLLAMA | Chat with a local model | ✅ | ✅ |
| CLAUDE | Claude Code sessions, usage, chat | ✅ (Claude desktop app) | ✅ (with `claude -p`) |
| DISCORD | Servers, voice channels, mute, webcam, Go Live | ✅ | ✅ |
| GAMES | Your games, with a green dot when running | ✅ | ✅ |
| EMAIL | Inbox from Thunderbird, read-only | ✅ | ✅ |
| SCREENS | Monitors, window zones, virtual desktops, drag and drop | ✅ | ⚠️ KDE Plasma 6 only, with `kdotool` |
| AUDIO | Output, microphone, volume of every app | ✅ | ✅ with `pactl` |
| VIBER | Viber panels, projects and tasks | ✅ | ✅ |
| BLENDER, DAVINCI RESOLVE, UNREAL | Shortcuts for the three programs (Unreal: play, compile C++, tools and views) | ✅ | ✅ |
| BROWSER DEV | Browser shortcuts for web development: hard reload, DevTools, console, device mode, localhost | ✅ | ✅ |
| ANDROID | adb and logcat: devices, errors and crashes, screenshot, phone screen (scrcpy), React Native | ✅ needs adb | ✅ needs adb |
| VIRTUAL DESKTOPS | Shortcut guide | ❌ (it is inside SCREENS) | ✅ |

On the first run the bar holds HOME, MUSIC, APPS, SCREENS and AUDIO (see *What you get on the first run*): add the others from the control panel.

## The control panel

It opens on the PC (double-click the **Vibe Deck** icon). From here:

- **Pages**: drag them to change the order of the bar, move them between *Nella barra* (in the bar) and *Disponibili* (available); the star picks the start page.
- **HOME**: build the HOME page on the tablet grid. From the catalog on the right (one widget per page: Music, Notes and TODO,
  Diagnostics, Clock, Claude usage, GitHub, Email, Audio, Discord (room and microphone), Virtual desktops, Viber projects
  and Viber tasks, Ollama, Games, plus plugin widgets) a tap puts the widget in the first free spot. **Drag** a widget
  to move it, drag its **edges and corners** to resize it: it snaps to cells, stops against the others
  and never goes below its minimum size. Dashed cells are free. **Salva HOME** saves; *Torna alla HOME predefinita* resets everything.
- **Page buttons**: reorder or hide them; the grid adapts by itself. **Salva sul tablet** and the tablet updates.
- **Games**: *Aggiungi un gioco* (add a game) opens the file picker; choose name and icon (the file's own or one found on the web).
- **Email**: Thunderbird status, accounts found and which ones to show on the tablet.
- **Discord**: connection and authorization.
- **QR code** to connect a phone or tablet, and the panel **theme**.

## Services to connect

| Service | What to do | Details |
|---|---|---|
| Email | Install [Thunderbird](https://www.thunderbird.net/download/) and add your accounts there (university and work ones too) | [Email](app/README.md#email) |
| Discord | Create a free app in the Developer Portal and authorize it from the control panel | [Discord](app/README.md#discord) |
| Apple Music web, YouTube | Install the included browser extension (`app/extension/`) | [Music](app/README.md#music) |
| Claude Code | Claude Code installed on the PC (`claude` in the terminal) | [Claude](app/README.md#claude) |
| GitHub | Optional: `gh auth login`, or `GITHUB_TOKEN` in `.env` | [GitHub](app/README.md#github) |

---

# 3. Developer guide: make Vibe Deck your own

## Where things live

All configuration files are **JSON**. When you save, the tablet updates by itself, without restarting.
Customizations are made **one file at a time**: one page, app or command per file.

| In `app/` | What it contains | In git? |
|---|---|---|
| `config/pages/<id>.json` | **your pages** (one per file) and edited copies of the default ones | no, they are yours |
| `config/apps/<id>.json` | **your apps** (one per file; `id` = file name) | no |
| `config/commands/<id>.json` | **your allowed commands** (one per file) | no |
| `config/dock.json` | title, grid, start page and page order | no |
| `config/apps.json`, `config/commands.json` | default apps and commands (you can add more here too) | no |
| `config/services.json` | music, Claude, GitHub, Ollama, TODO, tablet timings ([reference](app/README.md#servicesjson)) | no |
| `config/layout.json` | control panel choices (pages in the bar, button order) | no, the panel writes it |
| `config/defaults/` | the project defaults: `pages/` (one page per file) and the other JSON files | yes |
| `official-plugins/<id>/` | **official plugins** shipped with Vibe Deck (one per feature: `blender`, `davinci`, `unreal`, `android`, `browserdev`, `dev`, `claude`, `ollama`, `github`, `screens`, `audio`, `mail`, `todo`, `discord`, `games`, `viber`) and **packs** that group them (`creative`: Blender, DaVinci, Unreal; `developer`: Dev, Claude, Ollama, GitHub, Android, Browser dev; `pc`: Screens, Audio, Email, TODO; `gaming`: Discord, Games), each with its `plugin.json` | yes |
| `plugins/<name>/` | **your plugins** (and, later, the ones from the market): extra actions, routes, pages, widgets and icons (see [Plugins](#plugins-new-widgets-and-actions)) | your choice |
| `schema/` | JSON schemas for the editor (suggestions and field checks) | yes |
| `data/` | personal data: games, accounts to show, log, encrypted secrets | no |
| `.env` | port, access code, tokens and API keys | no |

**Rules:**

- do not edit `config/defaults/`: your versions in `config/` always win over the defaults;
- to go back to a default, delete your file;
- with **VS Code** open on the project folder, files in `config/pages/`, `config/apps/` and `config/commands/` get
  suggestions and field checks (`.vscode/settings.json` links the schemas in `app/schema/`);
- the **control panel**, at the bottom (*Pulsanti e nuove pagine*, buttons and new pages), lists the problems: a button using an app or a command
  that does not exist, a broken page, an unknown icon or widget, an invalid file. The same errors go to the log at startup.

## Adding a page

Create `config/pages/stream.json`: the page appears on the tablet by itself, at the end of the bar.
To start from a ready-made file: `npm run new:page -- stream` (or `npm run new:page -- stream "LIVE"` to choose the title).

```json
{
  "id": "stream",
  "title": "STREAM",
  "icon": "live",
  "description": "Scenes and microphone",
  "autoGrid": true,
  "tiles": [
    { "id": "obs", "label": "OBS", "icon": "camera", "color": "#5b3fa0", "action": { "type": "launch", "app": "obs" } },
    { "id": "scene1", "label": "SCENE 1", "action": { "type": "hotkey", "keys": ["CTRL", "F1"], "focus": "obs64" } },
    { "id": "mic", "label": "MUTE", "icon": "mic", "action": { "type": "discord", "command": "mute" } },
    { "widget": "clock", "w": 2, "h": 1 }
  ]
}
```

- `"id"`: fixed page name, same as the file name. Open the page from a button (`{ "type": "page", "page": "stream" }`) or from the address (`#stream`).
- `"tab": false`: the page is available but not in the bar (add it from the control panel).
- `"columns"`/`"rows"`: fixed grid; `"autoGrid": true`: adapts to the number of buttons.
- `"buttonGrid": true`: buttons in a grid on the left and widgets on the right (`"widgetWidth": 0.5`), like the VIBER page.
- Available **widgets**: `system`, `nowplaying`, `queue`, `github`, `todo`, `clock`, `claude`, `claudeusage` (usage only), `chat` (with `"provider": "ollama"`),
  `discord`, `screens`, `mail`, `audio`, `vdesk`, `viber`.
- **Icons**: `home music apps code github chat sparkle check cube film lock play pause stop next prev volup voldown mute shuffle repeat
  folder terminal cpu camera desktop robot refresh save keyboard undo redo fullscreen cut flag back add close send trash power bolt mic link
  headset gamepad cards tank sword layout live camoff window target mail attach settings`.

**The HOME** is designed in the control panel (*HOME*): it is saved in `config/layout.json` (`"homePage"`, each widget with column `x`, row `y`,
width `w` and height `h`) and wins over the `main` page in the files. In your own pages `"x"` and `"y"` pin a widget to a cell too;
without them, widgets go in order into the first free cell. To add a widget to the HOME catalog, add it to `CATALOG`
in `server/home.js` (plugin widgets are already there); small widgets made for the HOME: `claudeusage`, `desks`, `games`,
`discordmini`, and `viber` with `"show": "projects"` or `"tasks"`.

**Changing a default page:** copy its file from `config/defaults/pages/` or `official-plugins/<id>/pages/` (e.g. `apps.json`) to `config/pages/` and edit
the copy. For order and hidden buttons the control panel is enough, no files to touch.

**Page order:** in `config/dock.json`, `"pages"` is a list of ids (`["main", "media", "stream", ...]`). Pages not
listed go at the end. You can still write a whole page inside `dock.json`, as in older versions.

## Adding a button (and its app)

The button goes in the page's `tiles` (see `obs` in the example above). The app it launches goes in `config/apps/obs.json`:

```json
{
  "label": "OBS Studio",
  "toggle": true,
  "windows": { "path": "C:\\Program Files\\obs-studio\\bin\\64bit\\obs64.exe", "cwd": "C:\\Program Files\\obs-studio\\bin\\64bit" },
  "linux": { "path": "obs" }
}
```

- Button `"id"`: fixed name; the control panel uses it to remember order and hidden buttons.
- `"sub"`: second line. `"color"`: color (adapts to the theme). `"w"`/`"h"`: cells taken.
- `"confirm": true`: must be held. `"repeat": true`: repeats while held. `"hidden": true`: hidden until you show it from the panel.
- `"toggle": true` (in the app): green dot when running, and another tap closes it. `"whenRunning": "focus"`: if it is running, bring it to the front.
- In paths: `%USERPROFILE%`, `%LOCALAPPDATA%`, `~`, `$HOME`, `*` for the version; also `.lnk` shortcuts and `shell:AppsFolder\<AppID>` (Store apps).
- Several apps in one file: `{ "apps": { "obs": { ... }, "spotify": { ... } } }`.

All app fields: [apps.json](app/README.md#appsjson).

## A different button on Windows and Linux

```json
{ "id": "terminal", "label": "POWERSHELL", "linux": { "label": "TERMINAL" }, "action": { "type": "launch", "app": "powershell" } },
{ "id": "viber", "os": "linux", "label": "VIBER", "action": { "type": "launch", "app": "viber" } }
```

- `"os": "linux"` (or `"windows"`): the button, or the whole page, exists only on that system.
- `"linux": { ... }` (or `"windows"`): the fields that change on that system, `action` included.
- In apps and commands the `"linux"` variant can be a **list of alternatives**: the first one installed wins.

## Action types

| Action | Example |
|---|---|
| Launch app | `{ "type": "launch", "app": "vscode" }` |
| Shortcut | `{ "type": "hotkey", "keys": ["CTRL", "SHIFT", "P"], "focus": "Code" }` |
| Single key | `{ "type": "key", "key": "F12" }` |
| Type text | `{ "type": "text", "value": "Hello!\n" }` |
| Music and volume | `{ "type": "media", "command": "play_pause" }` (`next`, `volume_up`, `app_mute`...) |
| Open URL / folder | `{ "type": "open_url", "url": "https://github.com" }`, `{ "type": "open_path", "path": "~/Documents" }` |
| Command | `{ "type": "command", "id": "lock_pc" }` → an allowed command (below) |
| Switch page | `{ "type": "page", "page": "blender" }` |
| Discord | `{ "type": "discord", "command": "mute" }` (`deaf`, `video`, `stream`) |
| Macro | `{ "type": "macro", "steps": [ {…}, { "type": "wait", "ms": 300 }, {…} ] }` |

Available keys, options and details: [Action types](app/README.md#action-types).

## A new command

The tablet cannot run arbitrary commands: only allowed ones. Create `config/commands/ip_addresses.json`:

```json
{
  "label": "IP addresses",
  "showOutput": true,
  "windows": { "cmd": "ipconfig" },
  "linux": { "cmd": "ip", "args": ["-brief", "address"] }
}
```

Then the button: `{ "label": "IP", "icon": "link", "action": { "type": "command", "id": "ip_addresses" } }`: the output shows up on the tablet.

## Create a widget from the control panel

No files to write: open the control panel on the PC (`/control`), card **Crea un widget**:

1. **What to show**: pick a shape (big number, bars, on/off, text, buttons, voice commands, list, slider).
2. **Where the data comes from**: the PC, data written by hand, an internet address without keys (tick "allow this site"),
   a file in `data/`, an allowed command. Press **Prova la fonte**: the data found become buttons; tap a text field, then a
   data button, and `{{field}}` is written for you.
3. **What it shows**: title, value, icon or weather picture, rows of a list…
4. **What a tap does**: pick an action from the menu (apps and commands come from your setup).
5. **Name and size**, then **Salva widget**.

The preview on the right is drawn with the tablet's own code, in the panel theme. Saved widgets go to
`plugins/miei/widgets/` (your files, not in git), show up at once in **Aggiungi un widget** of the HOME card, and can be
edited or deleted from **I tuoi widget**. The JSON is there too, for whoever prefers writing it.

## JSON widgets: no code needed

A widget can be **a single JSON file** in the `widgets/` folder of a plugin: a **shape**, **where the data comes from**,
**what to show** and **what a tap does**. The PC fills the placeholders and the tablet only draws the result, so it
works on old browsers and with every theme. Example (`official-plugins/pcinfo/widgets/cpu.json`):

```json
{
  "name": "CPU",
  "shape": "value",
  "source": { "type": "pc" },
  "every": 3,
  "show": { "label": "CPU", "value": "{{cpu.usage}}", "unit": "%", "sub": "{{cpu.cores}} core", "bar": "{{cpu.usage}}", "warn": 60, "hot": 85 },
  "tap": { "type": "hotkey", "keys": ["CTRL", "SHIFT", "ESC"] },
  "size": { "w": 2, "h": 1 }
}
```

The widget shows up by itself in the HOME catalog of the control panel (`<plugin>.<file name>`); in a page use
`{ "widget": "shape", "def": "pcinfo/cpu" }`. VS Code suggests every field ([schema](app/schema/widget.schema.json)).

| Shape | Shows | Main fields |
|---|---|---|
| `value` | a big number with unit, subtitle and optional colored bar | `show.value`, `unit`, `sub`, `bar` (0-100), `warn`, `hot` |
| `bars` | rows "name, bar, value" | `show.rows: [{ label, value, bar, warn, hot }]` |
| `status` | colored dot and text | `show.on` (true/false), `onText`, `offText`, `sub` |
| `text` | free text that updates | `show.text`, `sub` |
| `buttons` | grid of up to 12 buttons | `buttons: [{ label, icon, color, action }]` |
| `voice` | voice commands and dictation (browser microphone or transcription on the PC) | `voice.commands: [{ say: [...], action, reply }]`, `voice.action` with `{{text}}` when nothing matches |
| `list` | rows from a list in the data (scrolls), each row can be tapped | `show.items` (e.g. `{{results}}`), `show.item: { title, sub, right, bar }` with `{{item.field}}`, `max`, `empty` |
| `slider` | a value to drag (volume, brightness…) | `show.value`, `min`, `max`, `step`, `unit`; `set` = action with the chosen `{{value}}` |

**Sources:**

| Source | Data | Limits |
|---|---|---|
| `pc` | `cpu`, `gpu`, `ram`, `net`, `uptimeSeconds`, `hostname`, `apps.<id>` (app open) | — |
| `static` | the `"data"` written in the file | — |
| `http` | JSON from a public address (`"url"`), **no API keys** | only sites listed in `permissions.http` of `plugin.json`; 8 s, 512 KB, no redirects, every 30 s at most |
| `file` | a JSON or text file (`"path"`) | only inside `data/` |
| `command` | the output of a command (`"id"`) | only commands in `commands.json` |
| `<plugin>.<name>` | a **connector** written in code by a plugin (e.g. `audio.mixer`) | only the widgets of that same plugin |

Text that is not JSON becomes `{ text, lines }`. `"every"` sets the seconds between updates; the PC reads each source only
once per period and shares it between tablets.

**Placeholders:** `{{field.sub}}` with filters `round[:digits]`, `percent`, `bytes`, `duration`, `ago`, `upper`, `lower`,
`default:x`, `yesno:yes:no`, `url`, `count`, `first`, `join:sep`, `zip` (parallel lists → rows, e.g. Open-Meteo `daily`),
`date` / `date:day` / `date:weekday` / `date:time`, `map:table` with tables in `"maps": { "table": { "0": "Clear", "*": "other" } }`.
No code inside the JSON.

**Actions** (`tap`, buttons, slider `set`, voice) are the same as the page buttons. The tablet only says "widget X, row/button N"
or sends the slider value: what runs is decided on the PC. Optional `"platforms": ["windows"]` hides a widget on the other system.

**Translations** of a JSON-only plugin: `lang/en.json` with `{ "Italian text": "English text" }` and, for text with
numbers, `"$rules": [["^vento (.+)$", "wind $1"]]`.

**Connectors for developers:** a plugin with code can offer data and actions to JSON widgets. Describe them, so the
widget editor can show them in its menus (label, parameters, fields):

```js
module.exports = {
  sources: {
    state: {
      label: 'Router status', description: 'Clients and traffic', every: 5,
      params: [{ name: 'zone', label: 'Zone', type: 'text' }],
      fields: [{ path: 'clients', label: 'Connected clients', type: 'number' }],
      read: async function (source, ctx) { return { clients: 7 }; }
    }
  },
  actions: {
    reboot: {
      label: 'Restart the router', params: [{ name: 'delay', label: 'Delay (s)', type: 'number' }],
      run: async function (action, ctx) { return 'Restarting'; }
    }
  }
};
```

Parameter types: `text`, `template` (accepts `{{...}}`), `number`, `boolean`, `select` (with `options`), `keys`, `key`, `app`,
`command`, `actions`, `json`, `icon`, `url`, `path`. A plain function still works as an action (it shows up without a description).
Without `fields`, the editor discovers the fields by reading the source once.

The control panel (only on this PC) exposes `GET /api/control/catalog` (shapes, sources, actions, filters, icons, apps and
commands, all described), `POST /api/control/shapes/sample` (`{ plugin, source }` → fields found with a sample, lists and
parallel columns recognised) and `POST /api/control/shapes/preview` (`{ plugin, def }` → problems or the ready view of a
widget that is not saved yet). Example: `official-plugins/audio` (`audio.mixer` + `audio.volume`, used by the Volume and
Microphone sliders). Examples of JSON-only plugins: `official-plugins/pcinfo` and `official-plugins/meteo` (to change city,
copy a widget and change `latitude`/`longitude` in the address).

## Plugins: new widgets and actions

A plugin adds widgets, actions, icons and pages **without touching the project files**: it is a folder in `app/plugins/`,
loaded automatically at startup. The quickest way to start:

```bash
cd app
npm run new:widget -- weather
```

It creates a working plugin (a widget with the PC time and a counter, plus a SALUTA button). Restart the deck and in the control panel
add the WEATHER page to the bar. Then change the files:

| File | What it is | After a change |
|---|---|---|
| `plugins/weather/index.js` | server: actions and routes | restart the deck |
| `plugins/weather/public/weather.js` | tablet: the widget and the icons (ES5) | reloads by itself |
| `plugins/weather/public/weather.css` | widget style (no flexbox); the themes recolor it by themselves | reloads by itself |
| `plugins/weather/pages/weather.json` | plugin pages (like `config/defaults/pages`) | reloads by itself |
| `plugins/weather/apps/`, `commands/` | apps and allowed commands, if needed | reloads by itself |
| `plugins/weather/plugin.json` | name, version, systems, minimum Vibe Deck version, permissions ([schema](app/schema/plugin.schema.json)) | reloads by itself |

**Server (`index.js`)**:

```js
module.exports = {
  description: 'Home weather',
  actions: {
    refresh: async function (action, ctx) {
      await ctx.execute({ type: 'key', key: 'F5' });
      return { message: 'Refreshed' };
    }
  },
  routes: function (router, ctx) {
    router.get('/today', ctx.route(async function () {
      return { degrees: 21 };
    }));
  }
};
```

- A button runs an action with `{ "type": "weather.refresh" }`: the type is always `"<plugin>.<action>"`.
- An action can use the deck's own actions through `ctx.execute(...)`; the returned `message` is shown on the tablet.
- Routes are protected by the access code: the one above is `GET /api/plugins/weather/today`, and what it returns reaches the tablet as data.

`ctx` contains `name`, `log` (writes to the deck log), `config`, `platform`, `paths`, `execute(action)`, `route(fn)` and
`ensureDataDir()` (the plugin data folder in `data/plugins/<name>/`).

**Tablet (`public/*.js`)**, in ES5 like the rest of the client:

```js
(function () {
  Icons.register('sun', 'M12 7c-2.76 0-5 2.24-5 5s2.24 5 5 5 5-2.24 5-5-2.24-5-5-5z');
  Widgets.register('weather', function (root, tile, app) {
    var H = Widgets.helpers;
    H.header(root, 'WEATHER');
    var t = H.el('div', 'pl-weather', '…');
    root.appendChild(t);
    function load() { D.api.get('/api/plugins/weather/today', function (err, d) { D.setText(t, err ? err.message : d.degrees + '°'); }); }
    load();
    var timer = D.every(60000, 300000, load);
    return { update: function (state) {}, resize: function (w, h) {}, destroy: function () { D.stop(timer); } };
  });
})();
```

- `Icons.register` takes an SVG path in a 24×24 box.
- `Widgets.helpers` (`el`, `header`, `smallBtn`, `setHtml`) are the same helpers the project widgets use.
- `D.every(active, idle, fn)` refreshes every minute while the tablet is in use and every 5 minutes when idle.

Then in the pages: `{ "widget": "weather", "w": 2, "h": 1 }` and `"icon": "sun"`.

- Project widget and icon names cannot be replaced.
- Plugin pages, apps and commands count as defaults: your copy in `config/` wins.
- A folder starting with `_` is disabled (e.g. `plugins/_weather`).
- The **control panel** lists the plugins (what they add) and their errors; the configuration check also knows
  their widgets, icons and actions. In VS Code plugin pages get the same suggestions as those in `config/pages/`.

## A widget for the HOME

Every plugin widget appears automatically in the HOME catalog (panel > HOME, group *PLUGIN &lt;NAME&gt;*). How it appears
is set in `plugins/<name>/home.json` (`npm run new:widget` already creates it; it is reloaded by itself, no restart):

```json
{
  "weather": { "label": "Weather", "icon": "sun", "description": "Home temperature", "w": 2, "h": 2, "minW": 2, "minH": 1 },
  "weather-rome": { "widget": "weather", "label": "Weather Rome", "props": { "city": "Rome" } }
}
```

- `w`/`h`: size proposed when you add it; `minW`/`minH`: the smallest size it is still readable at (the editor will not go below).
- Several versions of the same widget: add entries with `"widget"` and different `"props"`; the widget reads them in `tile.city`.
- The widget must adapt to its size: `resize(w, h)` receives the box size in pixels. Try the HOME with 6×4 and 8×4 grids.
- For data use your routes (`D.api.get('/api/plugins/<name>/...')`) with `D.every(active, idle, fn)`: when idle the tablet
  refreshes less often and saves battery.

## Working on the code

| Command (in `app/`) | What it does |
|---|---|
| `npm install` | dependencies, development ones included |
| `npm test` | tests for server, actions, configuration, themes, client ES5 compatibility and the zero-comments rule |
| `npm run server` | the server only, without the start script |
| `npm run demo` | deck with fake data on :8790 |
| `npm run themes` | regenerates the themes after a change to `public/css/dock.css` |
| `npm run new:page -- <id>` | new page in `config/pages/` |
| `npm run new:widget -- <name>` | plugin with a widget in `plugins/` |
| `npm run screenshots` | redoes the README images from the demo (with `npm run demo` running) |

| In `app/` | What it is |
|---|---|
| `server/index.js` | API (Express) and startup |
| `server/config.js` | JSON loading, hot reload, merge of defaults, your files and folders |
| `server/check.js` | configuration check (problems shown in the control panel) |
| `server/actions/` | action engine (`HANDLERS`) and macros |
| `server/plugins.js` | plugin loader (actions, routes, pages, tablet scripts) |
| `server/home.js` | HOME from the control panel: widget catalog, checks, layout |
| `official-plugins/` | official plugins, one per folder, with `plugin.json` |
| `plugins/` | local plugins, one per folder |
| `server/platform/` | `windows.js` (+ PowerShell helpers), `linux.js`: everything that depends on the OS |
| `server/services/` | one file per feature: media, discord, mail, games, screens, mixer, claude... |
| `public/` | tablet client (ES5, no framework): `app.js`, `widgets.js`, `icons.js`, `css/` |
| `control/` | PC control panel |
| `config/defaults/` | default configuration: `pages/` (one page per file), JSON, `history.json` |
| `schema/` | JSON schemas for pages, apps and commands (for the editor) |
| `scripts/` | startup (`bootstrap.js`), themes, demo, Windows/Linux icon |
| `tests/` | tests with `node --test` |

How to add the most common things **inside the project** (for your personal additions use a [plugin](#plugins-new-widgets-and-actions)):

- **An action type**: a function in `HANDLERS` (`server/actions/index.js`). If it needs the operating system, add the method
  to both `server/platform/windows.js` and `server/platform/linux.js`. Add it to `schema/page.schema.json` too (the tests check they match).
- **An icon**: one line in `public/js/icons.js` (`name: 'SVG path'`, 24×24 viewBox).
- **A widget**: a function `function myWidget(root, tile, app)` in `public/js/widgets.js` that returns
  `{ update: function (state) {}, resize: function (w, h) {}, destroy: function () {} }`, registered in the `TYPES` map
  (the configuration check reads it from there). Then its name in the schema (`schema/page.schema.json`, tile > widget:
  if it is missing, a test tells you) and, for the HOME, a line in `CATALOG` in `server/home.js`
  (`{ id, widget, label, icon, page, description, w, h, minW, minH }`). Data comes from `/api/state` (in `update`)
  or from a new route in `server/index.js`.
- **A new feature or page**: an **official plugin** in `official-plugins/<id>/` with its `plugin.json` (see below). Only the base
  (HOME, MUSIC, APPS) stays in `config/defaults/`, where a page also needs its id in the `"pages"` list of `config/defaults/dock.json`.
  Before changing a JSON file in `config/defaults/` (not the pages) add the fingerprint of the old version to
  `config/defaults/history.json` (so users who never edited it get the update).

**Plugin manifest (`plugin.json`).** Every official plugin has one, local plugins may have one (`npm run new:widget` creates it):

A **plugin** is one feature (here the BLENDER page, in `official-plugins/blender/pages/blender.json`):

```json
{
  "id": "blender",
  "name": "Blender",
  "version": "1.0.0",
  "description": "Shortcut page for Blender",
  "type": "plugin",
  "platforms": ["windows", "linux"],
  "engine": ">=2.1.1",
  "permissions": { "apps": ["blender"] }
}
```

A **pack** groups plugins and contains nothing but its `plugin.json`:

```json
{
  "id": "creative",
  "name": "Creative pack",
  "version": "1.0.0",
  "description": "Blender, DaVinci Resolve and Unreal Editor shortcut pages",
  "type": "pack",
  "includes": ["blender", "davinci", "unreal"]
}
```

- `id` must match the folder name; an official plugin wins over a local folder with the same name.
- `platforms` and `engine`: on another system, or with an older Vibe Deck, the plugin stays off and the control panel says why.
- `type: "pack"` with `includes: [...]`: a bundle of existing plugins; the control panel reports packs with other files or unknown plugins.
  Packs are only ready-made suggestions: **every plugin installs and works on its own**, using only the core and its own files.
- `permissions` lists what the plugin uses (sites, apps, commands, local resources): it will be shown before installing from the market.
- **Actions**: `actions.<name>` in `index.js` becomes the type `"<plugin>.<name>"`; an action named like the plugin is just `"<plugin>"` (the `viber` plugin keeps `{ "type": "viber", ... }`).
- **Hooks**: `hooks.launch({ app, processes })` in `index.js` runs before an app is started from the tablet and may return a
  function called right after it starts (the `screens` plugin uses it to move the new window to the chosen monitor).
- **HOME**: every widget of a plugin is listed in its `home.json`, either offered in the HOME catalog or turned off with
  `"<widget>": false` (for widgets that only make sense on their own page).
- **Control panel**: `control: { info, prepare, routes }` in `index.js` adds the plugin's data to the panel (under its name)
  and routes under `/api/control/<plugin>/` (local only, guard them with `ctx.controlOnly`); `control/*.js` and `*.css`
  add its card through `window.Panel` (`card`, `register`, `api`, `toast`, `update`). Without the plugin the card is gone.
- **Generated pages and apps**: `sources.<name>` fills the tiles of pages with `"source": "<name>"`, `hooks.apps` adds apps,
  `hooks.stamp` tells the tablet to reload when the plugin's data changes, `hooks.start` runs when the server starts.
- **Tabs**: a plugin page joins the bar by default only when its file says `"tab": true` (per-system variants work too);
  otherwise it is among the available pages.
- **Themes**: the CSS in `public/` is recolored for Material, Neon and Neo-brutalist by the server (`/plugins-theme/<theme>.css`) with the same rules as `dock.css`: no generated files for plugins.

**Tablet language.** Tablet text is written in Italian (code and pages); with English selected the tablet translates what
appears on screen on the fly, using the dictionary in `public/js/lang-en.js` (`I18n.add({ 'Testo': 'Text' })`, case-insensitive;
for text with numbers or names `I18n.rules([[/^(\d+) finestre$/, '$1 windows']])`). New text on the tablet = one line in the dictionary.
User text (tracks, tasks, messages) goes in an element with `class="notr"`, so it is never translated.
A plugin adds its own translations with `I18n.add` in its scripts.

Rules:

- **Zero comments**: no comments anywhere in the code, styles, scripts or configuration files. Names and small functions carry
  the meaning; explanations go in the README, in AGENTS.md or in the pull request. `tests/no-comments.test.js` enforces it.
- **English** for commits, pull requests, issues and documentation.
- The **tablet client** (`public/js`, `public/css`) stays **ES5 with no flexbox**: it must run on the Android 4 browser.
  `tests/client-es5.test.js` checks it.
- The **themes** in `public/css/themes/` are generated: after a change to `dock.css` run `npm run themes`.
- **PowerShell** files are UTF-8 with BOM.
- Tests touching data, Discord or the Windows helper use `DOCK_DATA_DIR` (and `DOCK_CONFIG_DIR`) so real data is never touched.

---

## Security

The deck only answers with the access code, the control panel only from `127.0.0.1`, and the secrets in `data/` are encrypted
with the system keychain. Some features (typing text on the PC, letting Claude Code work) give the tablet a lot of power:
do not share the code. Details: [Security](app/README.md#security).

## Contributing

Bug reports, ideas and pull requests are welcome: see [CONTRIBUTING.md](CONTRIBUTING.md). Every change is
reviewed and merged by the repository owner. If you use an AI assistant (Claude, Copilot, Cursor, Codex…) to
write widgets, plugins or pages, have it read [AGENTS.md](AGENTS.md): architecture, rules and steps in a single file.

## License

[MIT](LICENSE) © 2026 Stefano Di Patti
