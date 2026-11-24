# Instructions for AI assistants (and developers) working on Vibe Deck

This file tells an AI assistant (Claude, Copilot, Cursor, Codex…) how to add features to Vibe Deck without
breaking anything. The guide for people is in the [README](README.md), section *Developer guide*.

## In short

- **What it is**: an old Android tablet (even 4.x, with its own browser) used as a Stream Deck for the PC. A Node.js
  server runs on the PC (Windows or Linux); the tablet opens a web page. It works on a phone too.
- **Language**: documentation, commits, pull requests and issues are in **English**. Tablet UI text is written in
  Italian in the code and translated to English at runtime through `app/public/js/lang-en.js`. Answer the user in their language.
- **Zero comments**: no comments in any file of the repository (see rule 1).
- **First of all** read `README.md` (developer guide) and `app/README.md` (full reference).
- **Commands** (in `app/`): `npm install`, `npm test`, `npm run demo` (fake data on :8790), `npm run themes`,
  `npm run new:page -- <id>`, `npm run new:widget -- <name>`, `npm run screenshots`.

## Where things live

| Path in `app/` | What it is |
|---|---|
| `server/index.js` | Express API and startup |
| `server/config.js` | JSON loading, hot reload, defaults + user files + plugins |
| `server/actions/` | action engine (`HANDLERS`): launch, hotkey, key, text, media, command, macro... |
| `server/plugins.js` | plugin loader |
| `server/home.js` | HOME configurable from the panel: widget catalog, positions, checks |
| `server/check.js` | configuration check (errors shown in the panel and in the log) |
| `server/platform/` | `windows.js` (+ PowerShell helper), `linux.js`: everything that depends on the OS |
| `server/services/` | one file per feature (media, discord, mail, github, screens, mixer, claude...) |
| `public/js/` | ES5 tablet client: `core.js` (`D`), `i18n.js` + `lang-en.js`, `icons.js`, `widgets.js`, `app.js` |
| `public/css/dock.css` | tablet style; `public/css/themes/*.css` are GENERATED |
| `control/` | PC control panel (modern browser, only from 127.0.0.1) |
| `config/defaults/` | default configuration (in git): `pages/`, `apps/`, `commands/`, `dock.json`... |
| `official-plugins/<id>/` | official plugins (in git), each with `plugin.json`: features outside the base (HOME, MUSIC, APPS) move here |
| `plugins/<name>/` | local plugins (and later market plugins): actions, routes, pages, widgets, icons, translations |
| `schema/` | JSON schemas for the editor |
| `tests/` | `node --test` |

`config/` (except `defaults`) and `data/` are personal: never in git, never in commits.

## Rules not to break

1. **Zero comments**: no comments in code, styles, scripts, templates or configuration files (`//`, `/* */`, `#`,
   `<# #>`, `<!-- -->`, `rem`, `'`). Use clear names and small functions; explanations go in the README, in this
   file or in the pull request. Generated files and scaffolding templates must not produce comments either.
   `tests/no-comments.test.js` fails on any comment in a tracked file.
2. **Tablet client in ES5** (`app/public/js`, plugin scripts in `public/`): `var` and `function`, no
   `let/const`, arrow functions, template strings, classes, `Promise`, `fetch`, `classList`, `Object.assign`, `Array.find`,
   `.includes`, `.bind`. Use `D.api`, `D.el`, `D.addClass`... `tests/client-es5.test.js` checks it.
3. **Tablet CSS without flexbox, grid, `gap`, CSS variables, `calc()`**: absolute positions, floats, inline-block.
4. **Generated themes**: after every change to `public/css/dock.css` run `npm run themes` (a test checks it).
   Theme-specific style goes in `scripts/themes/<theme>.js`.
5. **Tablet text in Italian + English translation**: every new text visible on the tablet is written in Italian
   and added to `public/js/lang-en.js` (`'Testo': 'Text'`, case-insensitive; for text with numbers or names
   a rule in `I18n.rules`). User text (tracks, names, messages, email) goes in an element with
   `class="notr"`, so it is never translated. `tests/i18n.test.js` lists untranslated text.
6. **Security**: the tablet never sends free commands. It sends `{ page, tile }` and the server looks the action up in the
   configuration; system commands are only those listed in `commands` (no free shell). The panel
   (`/api/control/*`) only answers from 127.0.0.1. Never bypass these rules and never weaken `auth.js`.
7. **Windows and Linux**: everything that depends on the OS goes in `server/platform/windows.js` *and* `linux.js`. Apps and
   commands have `"windows"` and `"linux"` variants (lists of alternatives too). A Windows-only feature must
   degrade with a clear message on Linux.
8. **New features are plugins**: anything outside the base (HOME, MUSIC, APPS) goes in an official plugin
   (`official-plugins/<id>/` with `plugin.json`, see `schema/plugin.schema.json`), never in `config/defaults/`.
   One plugin = one feature (e.g. `blender`); a **pack** (`"type": "pack"`, e.g. `creative`) only lists plugins in
   `includes` and contains nothing but its `plugin.json`. **Every plugin must install and work on its own**: it
   only uses the core and its own files (apps, commands, widgets, actions, pages), never another plugin. Packs are
   only ready-made suggestions, and a plugin is in at most one pack. `tests/plugin-standalone.test.js` checks it.
   Server code of a plugin lives in its `index.js` and `lib/`; official plugins may require core modules
   (`../../server/...`), plugins for the market only use `ctx`. Tablet scripts and styles go in `public/`: the
   themes recolor plugin CSS by themselves. The project is moving every existing page there in the
   `refactor/plugins` branch, to prepare the market.
9. **Default files**: before changing a JSON file in `config/defaults/` that is not a page, add the fingerprint
   of the previous version to `config/defaults/history.json`. Better still: add a new file in the
   `config/defaults/pages|apps|commands/` folders, which does not need it.
10. **PowerShell files** in UTF-8 with BOM. In the helper (`PsHelper.call`) never an argument named `id`.
11. **Tests**: `npm test` in `app/` must pass entirely before every commit. Tests touching data, Discord or
    the Windows helper use `DOCK_DATA_DIR` / `DOCK_CONFIG_DIR` / `DOCK_PLUGINS_DIR` (temporary folders).
    In an environment without Windows the PowerShell helper tests may be skipped: tell the user.
12. **No personal data** in the repository, screenshots or tests: use `npm run demo` (everything fake).

## Adding a widget

### First choice: a JSON widget

If a shape (`value`, `bars`, `status`, `text`, `buttons`, `voice`) and a source (`pc`, `static`) are enough, write only
`<plugin>/widgets/<name>.json` (see "JSON widgets" in the README and `app/schema/widget.schema.json`; examples in
`app/official-plugins/pcinfo/`). No JS, no server code: it is checked by `tests/shapes.test.js` and by the configuration
check. Translations go in `<plugin>/lang/en.json`.

Code map: `server/shapes/` (Registry of shapes, sources and filters; `Shape` base class with a template method per shape;
`SourceCache`; `index.js` is the facade used by routes, HOME catalog and checks) and `public/js/shapes.js` (renderer
registry + a controller per tile). A new shape = a `Shape` subclass on the server + a renderer on the tablet.

### When you need code: a plugin

```bash
cd app
npm run new:widget -- weather
```

It creates a working `app/plugins/weather/` (widget, action, routes, icon, page, HOME catalog entry).
Edit the generated files:

- **`public/weather.js`** (tablet, ES5):

  ```js
  (function () {
    'use strict';
    Icons.register('sun', 'M12 7c-2.76 0-5 2.24-5 5s2.24 5 5 5 5-2.24 5-5-2.24-5-5-5z');
    I18n.add({ 'Temperatura': 'Temperature' });
    Widgets.register('weather', function (root, tile, app) {
      var H = Widgets.helpers;
      H.header(root, tile.title || 'METEO');
      var t = H.el('div', 'pl-weather', '…');
      root.appendChild(t);
      function load() {
        D.api.get('/api/plugins/weather/today', function (err, d) { D.setText(t, err ? err.message : d.degrees + '°'); });
      }
      load();
      var timer = D.every(60000, 300000, load);
      return {
        update: function (state) {},
        resize: function (w, h) {},
        destroy: function () { D.stop(timer); }
      };
    });
  })();
  ```

  - `Icons.register` takes an SVG path in a 24×24 box; `I18n.add` holds the plugin's translations.
  - `Widgets.helpers` offers `el`, `header`, `smallBtn`, `setHtml`, `level`.
  - `D.every(active, idle, fn)` refreshes often while the tablet is used and rarely when idle (battery).
  - `update(state)` receives the PC status (`/api/state`) every few seconds; `resize(w, h)` the box size in pixels,
    to adapt text and parts; `destroy()` stops timers and requests.

- **`public/weather.css`**: style (no flexbox), classes with a plugin prefix.
- **`index.js`** (server): `"<plugin>.<action>"` actions and routes under `/api/plugins/<plugin>/` (with the access code).
  `ctx` offers `log`, `config`, `platform`, `paths`, `execute(action)`, `route(fn)`, `ensureDataDir()`.

  ```js
  module.exports = {
    description: 'Home weather',
    actions: { refresh: async function (action, ctx) { return { message: 'Refreshed' }; } },
    routes: function (router, ctx) { router.get('/today', ctx.route(async function () { return { degrees: 21 }; })); }
  };
  ```

- **`home.json`**: how it appears in the HOME catalog (name, icon, description, proposed and minimum size, `props`).
- **`pages/*.json`**: plugin pages (like the default ones; the user adds them from the panel).

After a change to `index.js` the deck must be restarted; everything else reloads by itself.

### A project widget (only if everyone needs it)

1. A function `function myWidget(root, tile, app)` in `public/js/widgets.js` returning
   `{ update, resize, destroy }`, registered in the `TYPES` map (the configuration check reads it from there).
2. Its name in the schema `schema/page.schema.json` (tile > widget): if it is missing, a test says so.
3. For the HOME: a line in `CATALOG` in `server/home.js` (`id, widget, props?, label, icon, page, description, w, h, minW, minH`).
4. Style in `public/css/dock.css` + `npm run themes`; text in `lang-en.js`.
5. Data: from `/api/state` (in `update`) or from a new route in `server/index.js` with a service in `server/services/`.

**A good widget**: adapts to every size (try 6×4 and 8×4 grids and the phone), shows no "…" in titles,
does not redraw the DOM when the data has not changed (`Widgets.helpers.setHtml`), refreshes with `D.every(active, idle, fn)`,
stops everything in `destroy`, shows a clear message when a service is missing (it does not stay on "Caricamento…").

## Other common additions

| What | Where |
|---|---|
| Page of buttons | `npm run new:page -- <id>` (user) or `official-plugins/<id>/pages/<page>.json` with a `plugin.json` (project, `"tab": false` = among the available ones) |
| Launchable app | `config/defaults/apps/<file>.json` (`{ "apps": { "id": { "label", "windows": {"path"}, "linux": {"path"} } } }`) |
| Allowed command | `config/defaults/commands/<file>.json` (`cmd`, `args`, `showOutput`, per-OS variants) |
| Action type | a function in `HANDLERS` (`server/actions/index.js`) + schema; or a plugin action |
| Icon | a line in `public/js/icons.js` (24×24 SVG path) or `Icons.register` in a plugin |
| Translation | `public/js/lang-en.js` (`I18n.add` / `I18n.rules`) |
| Theme | `scripts/themes/<theme>.js` + `npm run themes` |

Typical button: `{ "id": "save", "label": "SALVA", "icon": "save", "sub": "Ctrl+S", "color": "#2e7d32",
"action": { "type": "hotkey", "keys": ["CTRL", "S"], "focus": "blender" } }`. Useful fields: `confirm` (must be
held), `repeat`, `hidden` (hidden until the user shows it), `os`, `windows`/`linux` (per-OS fields),
`w`/`h`, `x`/`y`. All fields are in the schema: with VS Code the files get suggestions and checks.

## How to work

1. Start from an up-to-date `main` and create a branch with a clear name (`feature/...`, `fix/...`, `docs/...`).
2. Make the smallest change that solves the problem, in the style of the surrounding code, with **no comments**.
3. `npm test` in `app/`; if you touch the UI try it with `npm run demo` (in English too and with another theme),
   and if the look changes update the images with `npm run screenshots`.
4. Update the documentation (README and/or `app/README.md`) when you change visible behavior.
5. Clear commit messages **in English**, push the branch, **pull request in English** with what changes, how you tested it
   and what is left to try for real.
6. **Never commit directly to `main` and never merge on your own**: the repository owner reviews and merges every PR
   (see [CONTRIBUTING.md](CONTRIBUTING.md)).
7. Whatever can only be tried on the real PC (tablet, Discord, audio, windows, desktop apps) goes in the PR.
