# Writing a Vibe Deck plugin with an AI assistant

This page is meant to be handed to an AI assistant (Claude, ChatGPT, Gemini...) together with your idea. It is self-contained: the assistant should be able to produce a working plugin from it without reading the rest of the repository. The long reference is [`AGENTS.md`](../AGENTS.md) and [`app/README.md`](../app/README.md).

## How to use it

1. Open a new chat with your AI assistant and attach this file.
2. Describe what you want in one or two sentences, for example: *"A widget that shows my Twitch followers, with a refresh tap"* or *"A button that starts my NAS with Wake-on-LAN"*.
3. Ask the assistant to answer with the **complete files** and to follow the checklist at the bottom.
4. Put the folder in `app/plugins/<id>/`, restart the deck if there is an `index.js`, then in the control panel open **Pagine con widget**, choose HOME or **Nuova pagina**, click the widget in the catalog (it is in the section of its category) and press **Salva**. The panel card of the plugin appears at the bottom of the control panel.

A ready prompt:

> You are writing a plugin for Vibe Deck. Read the attached guide completely. Pick the simplest kind of plugin that does the job (decision table), write every file in full, and finish by ticking the checklist. Do not add comments to code, do not use flexbox or ES6 in tablet files. My idea: …

## What a plugin is

A folder with a `plugin.json` and any of: JSON widgets, a server module (`index.js`), a tablet script, a control-panel script, pages, translations. **Choose the smallest thing that works:**

| You want | Use | Needs code? |
|---|---|---|
| Show numbers or text from the PC, a web API, a file or a command | **JSON widget** (`widgets/<name>.json`) | no |
| Show data that only your own code can read (a local app, a device, a private API) | JSON widget + **source** in `index.js` | yes (server) |
| A button or tap that does something new | JSON widget + **action** in `index.js` | yes (server) |
| Settings, a device list or a login in the control panel | **panel card** (`control/<id>.js`) + `control` in `index.js` | yes |
| A completely new look on the tablet | **tablet widget** (`public/<id>.js`) | yes (ES5) |

Almost every idea is a JSON widget, sometimes with a source or an action. Only write a tablet widget when none of the eight shapes fits.

## Layout

```
app/plugins/<id>/
  plugin.json
  index.js              server side (optional)
  widgets/<name>.json   JSON widgets (optional)
  home.json             HOME catalog entries of tablet widgets (optional)
  pages/<page>.json     whole pages (optional)
  lang/en.json          English text for what the tablet shows (optional)
  control/<id>.js       panel card (optional)
  control/<id>.css
  public/<id>.js        tablet widget, ES5 (optional)
  public/<id>.css
```

`<id>`: lowercase letters, digits, `-` and `_`. The current app version is `2.2.0`, so `"engine": ">=2.2.0"` is right. The folder name must equal `"id"` in `plugin.json`. Ids of official plugins cannot be reused.

## plugin.json

```json
{
  "id": "followers",
  "name": "Followers",
  "version": "1.0.0",
  "author": "Your name",
  "icon": "star",
  "description": "Follower count of a channel",
  "type": "plugin",
  "category": "streaming",
  "tags": ["streaming"],
  "platforms": ["windows", "linux"],
  "engine": ">=2.2.0",
  "permissions": { "http": ["api.example.com"], "network": false, "exec": false }
}
```

- `version` must be `x.y.z`. `icon` is a name from the icon list (`home music apps mail code github chat check cube film lock play pause stop folder terminal cpu camera settings info desktop robot refresh save keyboard link globe palette person star gamepad power bolt mic radio cloud sun moon calendar` and more in `app/public/js/icons.js`).
- `category` groups the widgets in the HOME catalog: `system music streaming gaming developer ai communication productivity creative weather finance news science sport home tools fun other`. Without it the first known entry of `tags` is used.
- `permissions.exec` must be `true` if the code starts programs (`child_process`); `permissions.network` must be `true` if the code uses the network (`fetch`, `http`, sockets) unless every host is listed in `permissions.http`. `permissions.local` is an optional list of short human descriptions of what the plugin touches (`"discord-ipc"`). The deck refuses to load a plugin whose code needs a permission it does not declare.
- `permissions.http` lists every host the plugin or its JSON widgets contact. A JSON widget with `"source": {"type": "http", "url": …}` is refused if the host is not listed.
- `platforms`: put only the systems where it really works.

## 1. A JSON widget

`widgets/followers.json`:

```json
{
  "name": "Followers",
  "description": "Followers of the channel",
  "icon": "star",
  "shape": "value",
  "source": { "type": "http", "url": "https://api.example.com/channel/42" },
  "every": 60,
  "show": {
    "label": "FOLLOWERS",
    "value": "{{followers|thousands}}",
    "sub": "{{name}}",
    "icon": "star"
  },
  "tap": { "type": "open_url", "url": "https://example.com/channel/42" },
  "size": { "w": 2, "h": 1, "minW": 1, "minH": 1 }
}
```

- **Shapes** and their `show` fields: `value` (`label icon value unit sub bar warn hot`; `value` can be any text, for example `25:00`, not only numbers), `text` (`label icon text sub`: a free text), `bars`, `status` (green or grey dot), `buttons` (up to 12), `voice`, `list` (scrolling rows, each tappable), `slider`. The exact fields of each are in `app/schema/widget.schema.json` and in the editor on the site (it shows every field with help).
- **Sources** (`"source": {"type": …}`): `pc` (CPU, GPU, RAM, network, open apps), `static` (fixed data), `http` (public JSON, no keys), `file` (a file under `data/`), `command` (an allowed command from `commands.json`), `push` (a value sent with the incoming webhook), or `<plugin>.<name>` (a source of the same plugin, below).
- **Templates**: `{{path.to.value}}` reads the data, `{{value|filter}}` transforms it. Filters: `round`, `div`, `mul`, `thousands`, `percent`, `bytes`, `duration`, `ago`, `upper`, `lower`, `default:text`, `yesno`, `url`, `count`, `map:name`, `zip`, `first`, `join`, `date`. `{{.}}` is the whole data. Inside lists: `{{item.field}}`.
- **Actions** (`tap`, `set` for sliders, per row in lists): `{ "type": "open_url" | "open_path" | "launch" | "focus" | "hotkey" | "key" | "text" | "command" | "media" | "macro" | "wait" | "<plugin>.<action>", … }`. `macro` has `steps`.
- Use `"platforms": ["windows"]` in the widget when it depends on the system.
- **Refresh**: the tablet **asks** (polling, nothing is pushed). `every` is the number of seconds between two reads of the widget; a source never refreshes faster than its own `every` (plugin sources can go down to `1`). A source is read only while a widget that uses it is on screen, so keep no timers: compute the state lazily inside `read`.
- `tap` for an action of your plugin is just `{ "type": "<id>.<action>" }` plus the params you declared.

Every widget in `widgets/` shows up automatically in the HOME catalog, in the right category. Nothing else to register.

## 2. A source in `index.js`

For data only your code can fetch. Referenced in widgets as `"source": {"type": "<id>.<name>"}`.

```js
'use strict';

module.exports = {
  description: 'Follower count',
  sources: {
    channel: {
      label: 'Channel',
      description: 'Followers and name of my channel',
      every: 30,
      params: [{ name: 'channel', label: 'Channel', type: 'text', required: true }],
      fields: [
        { path: 'followers', label: 'Followers', type: 'number' },
        { path: 'name', label: 'Name', type: 'text' }
      ],
      read: async function (src, ctx) {
        const res = await fetch('https://api.example.com/channel/' + encodeURIComponent(src.channel));
        if (!res.ok) throw Object.assign(new Error('The service answered ' + res.status), { code: 'UNAVAILABLE' });
        return res.json();
      }
    }
  }
};
```

`read(src, ctx)` returns a plain object (or throws an `Error`; the widget shows the message). `fields[].type` is one of `text`, `number`, `boolean`, `list`. Use `params: []` and `fields: []` when there are none. `src` holds the fields written in the widget JSON. `every` is the minimum seconds between reads. Never block: use `fetch` with a timeout (`AbortController`) for anything that can hang.

## 3. An action in `index.js`

```js
module.exports = {
  actions: {
    ping: {
      label: 'Ping a device',
      description: 'Sends a ping and reports the answer',
      params: [{ name: 'host', label: 'Host', type: 'template', required: true }],
      run: async function (action, ctx) {
        ctx.log.info('ping ' + action.host);
        return { message: 'Done' };
      }
    }
  }
};
```

Used as `{"type": "<id>.ping", "host": "nas.local"}` in any widget, button or rule. `params: []` is fine for an action without parameters. `run(action, ctx)` returns `{ message }` (shown as a toast; `message: null` shows nothing) or throws. Parameter types: `text template number boolean select keys key app command actions json icon url path`. A `select` needs `options: [{ value, label }]`.

## 4. A control-panel card (settings, device lists)

`index.js`:

```js
module.exports = {
  control: {
    info: function (ctx) { return { devices: [] }; },
    routes: function (router, ctx) {
      const only = ctx.controlOnly, r = ctx.route;
      router.post('/add', only, r(function (req) {
        return ctx.controlInfo();
      }));
    }
  }
};
```

`info(ctx)` must return **the plugin's own object**: the panel puts it under the plugin id (`info.<id>`). Do not wrap it again. Routes are mounted at `/api/control/<id>/…` (so `router.post('/settings', …)` is `POST /api/control/<id>/settings`), only reachable from the PC itself.

How a route works: it is an Express router, `req.body` is already the parsed JSON, `ctx.route(fn)` wraps `fn(req)`: what it returns is sent as `{ ok: true, data }`, and an `Error` it throws is sent as `{ ok: false, error: { code, message } }` (give the error a `code` such as `BAD_REQUEST`). When the card must refresh after the change, return `ctx.controlInfo()` (the **full** info of the panel) and call `Panel.update` with it in the browser. Secrets (tokens, keys) must go through `require('../../server/secrets')` (`loadJson` / `writeJson`, encrypted) and must never be returned by `info`.

`control/<id>.js`:

```js
(function () {
  'use strict';
  const { $, esc, api, toast } = window.Panel;

  window.Panel.card('<id>-card', `
    <div class="card-head"><div><h2>Followers</h2><p class="hint">What this does.</p></div><span id="fo-count" class="pill"></span></div>
    <div id="fo-list" class="mk-list"></div>`);

  function render(info) {
    const mine = info.<id>;
    if (!mine) return;
    $('fo-count').textContent = mine.devices.length;
  }

  window.Panel.register(render);
})();
```

`Panel` offers `$`, `esc` (always escape what you put in HTML), `icon`, `api(method, url, body)` (returns a Promise with the `data`, `url` is the absolute path such as `/api/control/<id>/settings`, a failure rejects with an `Error` whose message you can show with `toast(err.message, 'err')`), `toast(text, kind)` (`'ok'` or `'err'`), `card(id, html)`, `register(fn)` (runs on every refresh with the **full** info, so read `info.<id>`), `update(info)` (pass the full info that a route returned with `ctx.controlInfo()`) and `refresh()`. The control panel is in **Italian**: write the texts of the card in Italian. Reuse the existing classes (`card-head`, `hint`, `pill`, `btn`, `btn primary`, `small-btn`, `mk-list`, `mk-row`); put your own CSS in `control/<id>.css` with a plugin prefix.

## 5. A tablet widget (only if no shape fits)

The tablet runs old browsers (Android 4.x): **ES5 only** (`var`, `function`, no arrow functions, no `let`/`const`, no template strings, no `fetch`, no flexbox; use absolute or float layout).

`public/<id>.js`:

```js
(function () {
  'use strict';
  Widgets.register('<id>', function (root, tile, app) {
    var H = Widgets.helpers;
    H.header(root, tile.title || 'FOLLOWERS');
    var box = H.el('div', 'fo-box', '…');
    root.appendChild(box);
    function load() {
      D.api.get('/api/plugins/<id>/today', function (err, d) {
        D.setText(box, err ? err.message : d.followers);
      });
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

`home.json` makes it appear in the HOME catalog:

```json
{ "<id>": { "widget": "<id>", "label": "Followers", "icon": "star", "description": "Follower count", "w": 2, "h": 1, "minW": 1, "minH": 1, "category": "streaming" } }
```

The widget name in `home.json` must be registered by the plugin's own script. The server route used above is `routes: function (router, ctx) { router.get('/today', ctx.route(…)); }` in `index.js` (mounted at `/api/plugins/<id>/`, protected by the access code).

## Other hooks

- `hooks.homeWidgets()` returns catalog entries computed at runtime (one per thing the user owns).
- `hooks.start` / `hooks.stop` run when the deck starts and stops.
- `publicRoutes(router, ctx)`: read-only routes without the access code, only for public assets like images.
- `ctx` offers `name`, `dir`, `dataDir` (private folder, create it with `ensureDataDir()`), `paths`, `log`, `config`, `platform`, `execute(action)`, `route(fn)`, `controlOnly`, `controlInfo()`.

## Translations

The tablet text is Italian by default. English goes in `lang/en.json`, a flat map from the Italian text (as shown) to English. It also translates text that comes from the data (a source that returns `"PAUSA"` can be translated with `"PAUSA": "BREAK"`). Widget titles are shown in capitals, so list them as they appear (`"PROSSIMO EVENTO": "NEXT EVENT"`).

## Rules that are checked by tests

Every plugin is inspected by the deck (`server/plugin-policy.js`). Breaking a **security** rule means the plugin is **not loaded** and shows as blocked in the panel; breaking a **compatibility** rule is a warning (and a failing test for official plugins).

Security:
- No `eval`, `Function()`, `vm` or string timers (`setTimeout('code')`).
- `child_process` only with `"exec": true`; network only with `"network": true` or `permissions.http`.
- Never read the access code, the encryption key, the webhook key or any private file of the deck (`.env`, `secret-key`, `webhooks.json`).
- Write files only under `ctx.dataDir`.
- Use only the `ctx` object: no `require('../../server/…')` (only official plugins may).
- On the tablet and in the panel nothing is loaded from another site: no CDN scripts, fonts, images, `@import url(http…)`, or requests to other hosts.
- At most 200 files, each under 512 KB.

Compatibility (old tablets, Android 4.x):
- Tablet scripts in `public/` are ES5: no arrow functions, `let`/`const`, template strings, classes, spread, `async`/`await`, `Promise`, `fetch`, `classList`, `closest`, `Object.assign`, `Array.find`, `.includes`, `.bind`.
- Tablet CSS in `public/` has no flexbox, grid, `gap`, CSS variables or `calc()`; use absolute positions, floats and `inline-block`.
- Declare `platforms` honestly and degrade with a clear message where a feature does not exist on a system.

Other rules:
- **No comments** anywhere in code, CSS, HTML or JSON.
- Everything shown in the editor must be **described** (label, description, params). A source without `label`/`fields`, or an action without `params`, fails `tests/catalog.test.js`.
- A plugin test that touches the Windows helper must stub `media.nowPlaying` and `apps.running` and call `system.stop()` and `platform.shutdown()`, or it hangs on Windows.
- Never name an action argument `id` (it clashes with the request number of the PowerShell helper).
- New labels for the editor catalog of the site need an English entry in `app/server/shapes/translate.js` (a test checks it).

These checks are static: they catch mistakes, not a determined attacker. A plugin with code runs with the same access as the deck, so people must install only code they trust.

## Checklist for the assistant

- [ ] Chose the smallest kind of plugin from the decision table, and said which.
- [ ] Folder name equals `id`; `version` is `x.y.z`; `category` set; every contacted host is in `permissions.http`.
- [ ] Every widget JSON has `name`, `description`, `icon`, `shape`, `source`, `show`, `size`.
- [ ] Sources and actions have `label`, `description` and typed `params` (and `fields` for sources).
- [ ] Errors are thrown as `Error` with a message a person can read; nothing can hang (timeouts on network calls).
- [ ] Secrets are stored with `server/secrets` and never sent to the browser.
- [ ] `permissions.exec` / `permissions.network` declared when the code needs them; nothing is loaded from another site; files written only under `ctx.dataDir`.
- [ ] Tablet files are ES5; no flexbox; no comments in any file.
- [ ] Gave the full content of every file, the folder path, and what to click in the panel to see the widget.

## Check it

```bash
cd app
npm run new:widget -- myplugin
npm test
npm run e2e
```

`npm test` includes the configuration check that validates every widget, source and action. The control panel also lists problems per plugin (card *Pulsanti e nuove pagine*, section *Plugin*).
