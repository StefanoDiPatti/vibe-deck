# Vibe Deck plugins

Every folder in here is a plugin, loaded automatically when the deck starts.
To create one ready to edit:

```bash
npm run new:widget -- weather
```

| File | What it is |
|---|---|
| `plugins/weather/plugin.json` | name, version, systems, minimum Vibe Deck version, permissions (`schema/plugin.schema.json`) |
| `plugins/weather/index.js` | server: actions (`"weather.saluta"`) and routes (`/api/plugins/weather/...`) |
| `plugins/weather/pages/*.json` | pages (turn them on from the control panel) |
| `plugins/weather/apps/*.json`, `commands/*.json` | apps and allowed commands |
| `plugins/weather/public/*.js` | tablet (ES5): `Widgets.register(...)`, `Icons.register(...)` |
| `plugins/weather/public/*.css` | widget style (no flexbox); the themes recolor it by themselves |
| `plugins/weather/home.json` | the widget in the HOME catalog (name, icon, sizes) |

- A folder starting with `_` or `.` is ignored: rename `weather` to `_weather` to turn a plugin off.
- After a change to `index.js` restart the deck. Pages, apps, commands and files in `public/` reload by themselves.
- Plugin errors (code that does not start, unknown widgets or icons) show up in the control panel and in the log.
- No comments in plugin files either: the project has a zero-comments rule.

The full guide is in the main README: *Developer guide > Plugins*.
