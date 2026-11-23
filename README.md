# Vibe Deck

**La Stream Deck da developer, per developer.**

Trasforma un **vecchio tablet Android o il telefono che hai in tasca** in una **Stream Deck wireless** per il PC.
Sul PC (Windows o Linux) gira un piccolo server Node.js; tablet o telefono aprono una pagina web: niente app da installare.

<p align="center">
  <a href="https://github.com/StefanoDiPatti/vibe-deck/releases/latest"><img src="docs/screenshots/promo.gif" width="720" alt="Video promo di Vibe Deck: il vecchio tablet diventa una Stream Deck"></a><br>
  <sub>I video in alta qualità (orizzontale e verticale, in mp4) sono tra i file della <a href="https://github.com/StefanoDiPatti/vibe-deck/releases/latest">release</a>.</sub>
</p>

![Pagina HOME sul tablet: musica, note e diagnostica del PC](docs/screenshots/tablet-main.png)

## Cosa fa

- **Pulsanti** configurabili: app, scorciatoie, testo, macro, comandi. Un pallino verde dice se l'app è già aperta.
- **Musica**: copertina, coda, salto a un punto del brano, shuffle, ripeti e volume dell'app (Apple Music e YouTube nel browser, Spotify, VLC...).
- **Stato del PC**: CPU, RAM, GPU NVIDIA (uso, temperatura, VRAM) e rete.
- **Discord**: server, canali vocali, chi parla, mute, webcam e Go Live.
- **Audio**: uscita e microfono predefiniti, volume di ogni app.
- **Schermi**: su quale monitor aprire le app, finestre nelle zone (come Snap), desktop virtuali, trascinamento delle finestre.
- **Claude Code**: le sessioni dell'app desktop divise per sezioni; scrivi o detti dal tablet e il messaggio parte sul PC. Consumi dell'abbonamento.
- **Giochi** scelti dal pannello, con la loro icona. **Email** da Thunderbird, in sola lettura.
- **TODO** sulle Memo di Windows (o in locale su Linux), con dettatura. GitHub, Ollama, Viber, scorciatoie per Blender e DaVinci Resolve.
- **Quattro temi** (Classico, Material, Neon Elgato, Neo-brutalista) sul tablet e nel pannello del PC.
- **Pannello di controllo** sul PC per ordinare pagine e pulsanti con il trascinamento, e **QR code** per collegare un telefono.

| Pulsanti (pagina APP) | Sessioni di Claude Code |
|---|---|
| ![Pagina APP](docs/screenshots/tablet-apps.png) | ![Pagina CLAUDE](docs/screenshots/tablet-claude.png) |
| **Audio, tema Neon Elgato** | **GitHub con deploy, tema Neo-brutalista, in inglese** |
| ![Pagina AUDIO, tema Neon Elgato](docs/screenshots/tablet-audio-neon.png) | ![Pagina GITHUB in inglese, tema Neo-brutalista](docs/screenshots/tablet-github-brutal-en.png) |

*Screenshot dalla demo con dati finti (`npm run demo`, poi `npm run screenshots`).*

### Pannello di controllo sul PC

| Neon Elgato | Neo-brutalista | Material |
|---|---|---|
| ![Pannello, tema Neon Elgato](docs/screenshots/pannello-neon.png) | ![Pannello, tema Neo-brutalista](docs/screenshots/pannello-brutal.png) | ![Pannello, tema Material](docs/screenshots/pannello-material.png) |

## Indice

1. [Guida all'installazione](#1-guida-allinstallazione): requisiti, Windows, Linux, collegare il tablet, aggiornare.
2. [Guida utente](#2-guida-utente): il tablet, le pagine, il pannello di controllo, i servizi da collegare.
3. [Guida per sviluppatori](#3-guida-per-sviluppatori-personalizza-la-tua-vibe-deck): pagine, pulsanti, app e comandi a file singoli, azioni, plugin (widget e azioni nuove) e codice.

Il riferimento completo di ogni funzione è in [`app/README.md`](app/README.md).

---

# 1. Guida all'installazione

## Requisiti

- PC con **Windows 10/11** o **Linux** (KDE Plasma consigliato; GNOME va, senza la pagina SCHERMI).
- **Node.js 18+**: se manca, lo script di avvio propone di installarlo.
- Un tablet o telefono con un browser qualsiasi, anche molto vecchio (il client è in ES5).
- PC e tablet sulla **stessa rete**.

## Scaricare

```bash
git clone https://github.com/StefanoDiPatti/vibe-deck.git
cd vibe-deck/app
```

(oppure scarica lo ZIP da GitHub ed estrailo; tutto quello che serve è nella cartella `app/`).

Vuoi solo vedere com'è? `npm run demo` (in `app/`, dopo `npm install`) apre una dock con **dati finti** su
`http://127.0.0.1:8790/?t=DEMO1234`, senza toccare la tua configurazione.

## Windows

1. Doppio clic su **`app\start.bat`**.
2. Al primo avvio lo script fa tutto da solo: propone di installare Node.js (con winget) se manca, installa le dipendenze,
   crea il file `.env` con un **codice di accesso** casuale e la tua configurazione in `app\config\`.
3. Poi chiede se aprire la porta nel firewall, creare il collegamento **Vibe Deck** sul desktop e attivare l'avvio automatico.
4. La dock gira **in background**: la trovi come icona (quattro quadratini blu) vicino all'orologio, anche sotto la freccetta.
   Dal suo menu apri il pannello di controllo, vedi indirizzo e codice per il tablet, apri il log, riavvii o chiudi la dock.

> **Rete "Pubblica":** la regola del firewall vale solo per le reti private. Se il tablet non si collega,
> imposta la rete di Windows come *Privata* (Impostazioni → Rete e Internet → la tua rete).

Per ripetere le domande: `start.bat --setup`. Per vedere i messaggi in una finestra: `start.bat --console`.

## Linux

```bash
cd vibe-deck/app
./start.sh            # al primo avvio: dipendenze, .env, configurazione, domande come su Windows
```

Programmi consigliati (servono a musica, scorciatoie e pagina SCHERMI):

```bash
# Arch / CachyOS
sudo pacman -S playerctl wtype
paru -S kdotool                  # pagina SCHERMI (KDE Plasma 6)
# Debian / Ubuntu
sudo apt install playerctl xdotool wtype pulseaudio-utils
# firewall, se attivo
sudo ufw allow 8787/tcp
```

Per farla girare in background con un'icona sul desktop e nel menu delle app:

```bash
scripts/linux/vibe-deck.sh install            # icona (doppio clic = avvia e apre il pannello)
scripts/linux/vibe-deck.sh install autostart  # avvio automatico all'accesso (facoltativo)
```

## Collegare il tablet

1. Il modo più veloce: inquadra il **QR code** in cima al pannello di controllo (o nel terminale all'avvio).
2. Oppure apri sul tablet il **link diretto** che trovi nel menu dell'icona, per esempio `http://192.168.1.50:8787/?t=ABCD2345`:
   il codice viene salvato e non te lo chiede più.
3. Chrome: menu → *Aggiungi a schermata Home*. Dall'icona la dock si apre a schermo intero.
4. Per tenere lo schermo acceso: *Opzioni sviluppatore → Rimani attivo* (con il tablet in carica).

Il **pannello di controllo** si apre solo dal PC: doppio clic sull'icona Vibe Deck, oppure `http://127.0.0.1:8787/control`.

## Cosa trovi al primo avvio (configurazione standard)

Una Vibe Deck semplice, pensata per chiunque (non serve essere sviluppatori né giocatori):

| Nella barra | Cosa fa |
|---|---|
| **HOME** | musica in riproduzione, note e TODO, stato del PC (diagnostica) |
| **MUSICA** | copertina, comandi, coda e volume dell'app |
| **APP** | Apple Music, Discord, cartelle, screenshot, mostra desktop, blocca PC, spegni schermo, volume |
| **SCHERMI** | monitor, disposizione delle finestre e desktop virtuali (su Linux serve KDE Plasma: la aggiungi tu) |
| **AUDIO** | uscita, microfono e volume di ogni app |

Tutto il resto è già pronto tra le **pagine disponibili** del pannello di controllo: CLAUDE, GITHUB, DEV, OLLAMA, VIBER,
DISCORD, GIOCHI, EMAIL, BROWSER DEV, ANDROID, BLENDER, DAVINCI, UNREAL. Trascinale nella barra quando ti servono.
Nella pagina APP i programmi per sviluppatori (VS Code, Docker, Blender…) sono tra i **nascosti**: *Pulsanti delle pagine* >
APP > *Mostra tutti*, oppure trascina solo quelli che vuoi. La HOME la cambi dal pannello (*HOME*), la lingua e il tema dal tablet
(rotellina in alto). Per tornare a questa configurazione: *Predefinite* nella barra in fondo al pannello.

## Aggiornare

```bash
cd vibe-deck
git pull
```

Poi riavvia la dock (menu dell'icona → *Riavvia*). I file di configurazione che non hai mai modificato passano da soli
alla versione nuova; quelli che hai cambiato restano come sono. I tuoi dati (`app/data/`, `app/config/`, `app/.env`) non sono in git.

Se qualcosa non va: [Problemi comuni](app/README.md#problemi-comuni).

---

# 2. Guida utente

## Il tablet

- **Barra in basso**: le pagine. Quali e in che ordine lo scegli dal pannello di controllo.
- **Pulsanti**: un tocco esegue l'azione. Quelli con la barra arancione in basso (es. BLOCCA) vanno **tenuti premuti** circa
  un secondo. Volume e annulla si ripetono se tieni premuto. Il **pallino verde** dice che l'app è aperta.
- **In alto a destra**: rete del PC, velocità, la **rotellina delle impostazioni** e l'orologio (toccalo per lo schermo intero).
  La rotellina apre un menù con **tema**, **lingua** (IT / EN) e **Sempre attivo** (niente salvaschermo con l'ora).
  Le scelte si ricordano sul tablet; il pannello di controllo sul PC resta in italiano.
- **Batteria**: dopo un minuto senza tocchi la dock aggiorna i dati più lentamente; dopo 10 minuti parte il **salvaschermo**
  (orologio fioco). Un tocco la riattiva.
- **Telefono**: funziona anche da telefono, in orizzontale.
- Per aprire direttamente una pagina: `http://IP:8787/#media`, `#claude`, `#games`...

## Le pagine

| Pagina | Cosa fa | Windows | Linux |
|---|---|---|---|
| HOME | Musica, stato del PC e TODO; **la scegli tu dal pannello** (consumi di Claude, GitHub, email, orologio…) | ✅ | ✅ (TODO in una lista della dock invece delle Memo) |
| MUSICA | Copertina, coda, posizione nel brano, volume dell'app | ✅ | ✅ con `playerctl` |
| APP | Pulsanti delle app e del sistema (anche Docker Desktop) | ✅ | ✅ (Terminale, Monitor di sistema, Spectacle al posto di quelli di Windows) |
| DEV | Strumenti da sviluppatore | ✅ | ✅ |
| GITHUB | Repository, PR, issue, CI e **stato dei deploy** (GitHub Actions); guida ai comandi git | ✅ | ✅ |
| OLLAMA | Chat con un modello locale | ✅ | ✅ |
| CLAUDE | Sessioni di Claude Code, consumi, chat | ✅ (app desktop di Claude) | ✅ (con `claude -p`) |
| DISCORD | Server, canali vocali, mute, webcam, Go Live | ✅ | ✅ |
| GAMES | I tuoi giochi, con pallino verde se aperti | ✅ | ✅ |
| EMAIL | Posta in arrivo da Thunderbird, in sola lettura | ✅ | ✅ |
| SCHERMI | Monitor, zone delle finestre, desktop virtuali, trascinamento | ✅ | ⚠️ solo KDE Plasma 6 con `kdotool` |
| AUDIO | Uscita, microfono, volume di ogni app | ✅ | ✅ con `pactl` |
| VIBER | Pannelli, progetti e task di Viber | ✅ | ✅ |
| BLENDER, DAVINCI RESOLVE, UNREAL | Scorciatoie dei tre programmi (Unreal: play, compila C++, strumenti e viste) | ✅ | ✅ |
| BROWSER DEV | Scorciatoie del browser per sviluppare: ricarica pulita, DevTools, console, modalità dispositivo, localhost | ✅ | ✅ |
| ANDROID | adb e logcat: dispositivi, errori e crash, screenshot, schermo del telefono (scrcpy), React Native | ✅ serve adb | ✅ serve adb |
| DESKTOP VIRTUALI | Guida alle scorciatoie | ❌ (è dentro SCHERMI) | ✅ |

Al primo avvio nella barra ci sono HOME, MUSICA, APP, SCHERMI e AUDIO (vedi *Cosa trovi al primo avvio*): le altre le aggiungi dal pannello di controllo.

## Il pannello di controllo

Si apre sul PC (doppio clic sull'icona **Vibe Deck**). Da qui:

- **Pagine**: trascinale per cambiare l'ordine della barra, spostale tra *Nella barra* e *Disponibili*; la stella sceglie la pagina iniziale.
- **HOME**: costruisci la pagina HOME sulla griglia del tablet. Dal catalogo a destra (un widget per pagina: Musica, Note e TODO,
  Diagnostica, Orologio, Consumi di Claude, GitHub, Email, Audio, Discord (stanza e microfono), Desktop virtuali, Viber progetti
  e Viber task, Ollama, Giochi, più i widget dei plugin) un tocco mette il widget nel primo posto libero. **Trascina** un widget
  per spostarlo, trascina **bordi e angoli** per cambiarne la misura: si muove a scatti di una cella, si ferma contro gli altri
  e non scende sotto la sua misura minima. Le celle tratteggiate sono libere. **Salva HOME**; *Torna alla HOME predefinita* annulla tutto.
- **Pulsanti delle pagine**: riordinali o nascondili; la griglia si adatta da sola. **Salva sul tablet** e il tablet si aggiorna.
- **Giochi**: *Aggiungi un gioco* apre il selettore di file; scegli nome e icona (quella del file o una trovata sul web).
- **Email**: stato di Thunderbird, account trovati e quali mostrare sul tablet.
- **Discord**: collegamento e autorizzazione.
- **QR code** per collegare un telefono o un tablet, e il **tema** del pannello.

## Servizi da collegare

| Servizio | Cosa fare | Dettagli |
|---|---|---|
| Email | Installa [Thunderbird](https://www.thunderbird.net/download/) e aggiungi lì i tuoi account (anche università e lavoro) | [Email](app/README.md#email) |
| Discord | Crea un'app gratuita nel Developer Portal e autorizzala dal pannello | [Discord](app/README.md#discord) |
| Apple Music web, YouTube | Installa l'estensione del browser inclusa (`app/extension/`) | [Musica](app/README.md#musica) |
| Claude Code | Claude Code installato sul PC (`claude` nel terminale) | [Claude](app/README.md#claude) |
| GitHub | Facoltativo: `gh auth login`, oppure `GITHUB_TOKEN` nel `.env` | [GitHub](app/README.md#github) |

---

# 3. Guida per sviluppatori: personalizza la tua Vibe Deck

## Dove stanno le cose

Tutti i file di configurazione sono **JSON con commenti `//`**. Quando salvi, il tablet si aggiorna da solo, senza riavviare.
Le personalizzazioni si fanno **un file per volta**: una pagina, un'app o un comando per file.

| In `app/` | Cosa contiene | In git? |
|---|---|---|
| `config/pages/<id>.json` | **le tue pagine** (una per file) e le copie modificate di quelle predefinite | no, sono tue |
| `config/apps/<id>.json` | **le tue app** (una per file; `id` = nome del file) | no |
| `config/commands/<id>.json` | **i tuoi comandi** consentiti (uno per file) | no |
| `config/dock.json` | titolo, griglia, pagina iniziale e ordine delle pagine | no |
| `config/apps.json`, `config/commands.json` | app e comandi predefiniti (puoi aggiungerne anche qui) | no |
| `config/services.json` | musica, Claude, GitHub, Ollama, TODO, tempi del tablet | no |
| `config/layout.json` | scelte del pannello (pagine nella barra, ordine dei pulsanti) | no, lo scrive il pannello |
| `config/defaults/` | i default del progetto: `pages/` (una pagina per file) e gli altri JSON | sì |
| `plugins/<nome>/` | **plugin**: azioni, rotte, pagine, widget e icone in più (vedi [Plugin](#plugin-widget-e-azioni-nuove)) | a scelta tua |
| `schema/` | schemi JSON per l'editor (suggerimenti e controllo dei campi) | sì |
| `data/` | dati personali: giochi, account da mostrare, log, segreti cifrati | no |
| `.env` | porta, codice di accesso, token e chiavi API | no |

**Regole:**

- non modificare `config/defaults/`: le tue versioni in `config/` vincono sempre su quelle predefinite;
- per tornare al default cancella il tuo file;
- con **VS Code** aperto sulla cartella del progetto i file di `config/pages/`, `config/apps/` e `config/commands/` hanno
  suggerimenti e controllo dei campi (`.vscode/settings.json` collega gli schemi di `app/schema/`);
- il **pannello di controllo**, in fondo (*Pulsanti e nuove pagine*), elenca i problemi: un pulsante che usa un'app o un comando
  che non esiste, una pagina sbagliata, un'icona o un widget sconosciuti, un file non valido. Gli stessi errori finiscono nel log all'avvio.

## Aggiungere una pagina

Crea `config/pages/stream.json`: la pagina compare da sola sul tablet, in fondo alla barra.
Per partire da un file già pronto: `npm run new:page -- stream` (oppure `npm run new:page -- stream "LIVE"` per scegliere il titolo).

```json
// Pagina per lo streaming
{
  "id": "stream",
  "title": "STREAM",
  "icon": "live",
  "description": "Scene e microfono",
  "autoGrid": true,
  "tiles": [
    { "id": "obs", "label": "OBS", "icon": "camera", "color": "#5b3fa0", "action": { "type": "launch", "app": "obs" } },
    { "id": "scena1", "label": "SCENA 1", "action": { "type": "hotkey", "keys": ["CTRL", "F1"], "focus": "obs64" } },
    { "id": "mic", "label": "MUTA", "icon": "mic", "action": { "type": "discord", "command": "mute" } },
    { "widget": "clock", "w": 2, "h": 1 }
  ]
}
```

- `"id"`: nome fisso della pagina, uguale al nome del file. Apre la pagina da un pulsante (`{ "type": "page", "page": "stream" }`) o dall'indirizzo (`#stream`).
- `"tab": false`: la pagina è disponibile ma non nella barra (la aggiungi dal pannello).
- `"columns"`/`"rows"`: griglia fissa; `"autoGrid": true`: si adatta al numero di pulsanti.
- `"buttonGrid": true`: pulsanti in griglia a sinistra e widget a destra (`"widgetWidth": 0.5`), come la pagina VIBER.
- **Widget** disponibili: `system`, `nowplaying`, `queue`, `github`, `todo`, `clock`, `claude`, `claudeusage` (solo i consumi), `chat` (con `"provider": "ollama"`),
  `discord`, `screens`, `mail`, `audio`, `vdesk`, `viber`.
- **Icone**: `home music apps code github chat sparkle check cube film lock play pause stop next prev volup voldown mute shuffle repeat
  folder terminal cpu camera desktop robot refresh save keyboard undo redo fullscreen cut flag back add close send trash power bolt mic link
  headset gamepad cards tank sword layout live camoff window target mail attach`.

**La HOME** si sceglie dal pannello (*HOME*): finisce in `config/layout.json` (`"homePage"`, ogni widget con colonna `x`, riga `y`,
larghezza `w` e altezza `h`) e vince sulla pagina `main` dei file. Anche nelle tue pagine `"x"` e `"y"` fissano un widget in una cella;
senza, i widget si mettono in ordine nella prima cella libera. Per mettere un widget nel catalogo della HOME aggiungilo a `CATALOG`
in `server/home.js` (i widget dei plugin ci sono già); widget piccoli fatti per la HOME: `claudeusage`, `desks`, `games`,
`discordmini`, e `viber` con `"show": "projects"` o `"tasks"`.

**Cambiare una pagina predefinita:** copia il suo file da `config/defaults/pages/` (es. `apps.json`) in `config/pages/` e modifica
la copia. Per l'ordine e i pulsanti nascosti basta il pannello, senza toccare i file.

**Ordine delle pagine:** in `config/dock.json`, `"pages"` è una lista di id (`["main", "media", "stream", ...]`). Le pagine non
elencate vanno in fondo. Puoi ancora scrivere una pagina intera dentro `dock.json`, come nelle versioni vecchie.

## Aggiungere un pulsante (e la sua app)

Il pulsante va nei `tiles` della pagina (vedi `obs` nell'esempio sopra). L'app che avvia si scrive in `config/apps/obs.json`:

```json
{
  "label": "OBS Studio",
  "toggle": true,
  "windows": { "path": "C:\\Program Files\\obs-studio\\bin\\64bit\\obs64.exe", "cwd": "C:\\Program Files\\obs-studio\\bin\\64bit" },
  "linux": { "path": "obs" }
}
```

- `"id"` del pulsante: nome fisso; il pannello lo usa per ricordare ordine e pulsanti nascosti.
- `"sub"`: seconda riga. `"color"`: colore (si adatta al tema). `"w"`/`"h"`: celle occupate.
- `"confirm": true`: va tenuto premuto. `"repeat": true`: si ripete tenendo premuto. `"hidden": true`: nascosto finché non lo mostri dal pannello.
- `"toggle": true` (nell'app): pallino verde se aperta e un altro tocco la chiude. `"whenRunning": "focus"`: se è aperta la porta in primo piano.
- Nei percorsi: `%USERPROFILE%`, `%LOCALAPPDATA%`, `~`, `$HOME`, `*` per la versione; anche collegamenti `.lnk` e `shell:AppsFolder\<AppID>` (app dello Store).
- Più app in un file solo: `{ "apps": { "obs": { ... }, "spotify": { ... } } }`.

## Un pulsante diverso su Windows e Linux

```json
{ "id": "terminal", "label": "POWERSHELL", "linux": { "label": "TERMINALE" }, "action": { "type": "launch", "app": "powershell" } },
{ "id": "viber", "os": "linux", "label": "VIBER", "action": { "type": "launch", "app": "viber" } }
```

- `"os": "linux"` (o `"windows"`): il pulsante, o la pagina intera, c'è solo su quel sistema.
- `"linux": { ... }` (o `"windows"`): i campi che cambiano su quel sistema, anche l'`action`.
- Nelle app e nei comandi la variante `"linux"` può essere una **lista di alternative**: vale la prima installata.

## Tipi di azione

| Azione | Esempio |
|---|---|
| Avvia app | `{ "type": "launch", "app": "vscode" }` |
| Scorciatoia | `{ "type": "hotkey", "keys": ["CTRL", "SHIFT", "P"], "focus": "Code" }` |
| Tasto singolo | `{ "type": "key", "key": "F12" }` |
| Scrivi testo | `{ "type": "text", "value": "Ciao!\n" }` |
| Musica e volume | `{ "type": "media", "command": "play_pause" }` (`next`, `volume_up`, `app_mute`...) |
| Apri URL / cartella | `{ "type": "open_url", "url": "https://github.com" }`, `{ "type": "open_path", "path": "~/Documents" }` |
| Comando | `{ "type": "command", "id": "lock_pc" }` → un comando consentito (sotto) |
| Cambia pagina | `{ "type": "page", "page": "blender" }` |
| Discord | `{ "type": "discord", "command": "mute" }` (`deaf`, `video`, `stream`) |
| Macro | `{ "type": "macro", "steps": [ {…}, { "type": "wait", "ms": 300 }, {…} ] }` |

Tasti disponibili, opzioni e dettagli: [Tipi di azione](app/README.md#tipi-di-azione).

## Un comando nuovo

Il tablet non può lanciare comandi liberi: solo quelli consentiti. Crea `config/commands/indirizzi_ip.json`:

```json
{
  "label": "Indirizzi IP",
  "showOutput": true,
  "windows": { "cmd": "ipconfig" },
  "linux": { "cmd": "ip", "args": ["-brief", "address"] }
}
```

Poi il pulsante: `{ "label": "IP", "icon": "link", "action": { "type": "command", "id": "indirizzi_ip" } }`: l'output compare sul tablet.

## Plugin: widget e azioni nuove

Un plugin aggiunge widget, azioni, icone e pagine **senza toccare i file del progetto**: è una cartella in `app/plugins/`,
caricata da sola all'avvio. Il modo più veloce per iniziare:

```bash
cd app
npm run new:widget -- meteo
```

Crea un plugin che funziona già (un widget con l'ora del PC e un contatore, un pulsante SALUTA). Riavvia la dock e nel pannello
aggiungi la pagina METEO alla barra. Poi cambia i file:

```text
plugins/meteo/
  index.js            server: azioni e rotte            (dopo una modifica riavvia la dock)
  public/meteo.js     tablet: il widget e le icone      (ES5, si ricarica da solo)
  public/meteo.css    stile del widget                  (niente flexbox)
  pages/meteo.json    pagine del plugin                 (come config/defaults/pages)
  apps/, commands/    app e comandi consentiti, se servono
```

**Server (`index.js`)**:

```js
module.exports = {
  description: 'Meteo di casa',
  // pulsante: { "type": "meteo.aggiorna" }  (il tipo è sempre "<plugin>.<azione>")
  actions: {
    aggiorna: async function (azione, ctx) {
      await ctx.execute({ type: 'key', key: 'F5' });   // può usare le azioni della dock
      return { message: 'Aggiornato' };                 // messaggio mostrato sul tablet
    }
  },
  // rotte col codice d'accesso: GET /api/plugins/meteo/oggi
  routes: function (router, ctx) {
    router.get('/oggi', ctx.route(async function () {
      return { gradi: 21 };                             // arriva al tablet come dato
    }));
  }
};
```

`ctx` contiene `name`, `log` (scrive nel log della dock), `config`, `platform`, `paths`, `execute(azione)`, `route(fn)` e
`ensureDataDir()` (cartella dati del plugin in `data/plugins/<nome>/`).

**Tablet (`public/*.js`)**, in ES5 come il resto del client:

```js
(function () {
  Icons.register('sole', 'M12 7c-2.76 0-5 2.24-5 5s2.24 5 5 5 5-2.24 5-5-2.24-5-5-5z');   // path SVG 24x24
  Widgets.register('meteo', function (root, tile, app) {
    var H = Widgets.helpers;                       // el, header, smallBtn, setHtml: gli stessi dei widget del progetto
    H.header(root, 'METEO');
    var t = H.el('div', 'pl-meteo', '…');
    root.appendChild(t);
    function load() { D.api.get('/api/plugins/meteo/oggi', function (err, d) { D.setText(t, err ? err.message : d.gradi + '°'); }); }
    load();
    var timer = D.every(60000, 300000, load);       // ogni minuto se usato, ogni 5 a riposo
    return { update: function (stato) {}, resize: function (w, h) {}, destroy: function () { D.stop(timer); } };
  });
})();
```

Poi nelle pagine: `{ "widget": "meteo", "w": 2, "h": 1 }` e `"icon": "sole"`.

- I nomi dei widget e delle icone del progetto non si possono sostituire.
- Pagine, app e comandi del plugin valgono come quelli predefiniti: una tua copia in `config/` vince.
- Una cartella che inizia con `_` è spenta (es. `plugins/_meteo`).
- Il **pannello di controllo** elenca i plugin (cosa aggiungono) e i loro errori; il controllo della configurazione conosce
  anche i loro widget, icone e azioni. Con VS Code le pagine dei plugin hanno gli stessi suggerimenti di quelle in `config/pages/`.

## Un widget per la HOME

Ogni widget di un plugin compare da solo nel catalogo della HOME (pannello > HOME, gruppo *PLUGIN &lt;NOME&gt;*). Come compare
lo decidi in `plugins/<nome>/home.json` (`npm run new:widget` lo crea già; si rilegge da solo, niente riavvio):

```json
{
  "meteo": { "label": "Meteo", "icon": "sole", "description": "Temperatura di casa", "w": 2, "h": 2, "minW": 2, "minH": 1 },
  // più versioni dello stesso widget, con campi diversi (il widget li legge in tile.citta)
  "meteo-roma": { "widget": "meteo", "label": "Meteo Roma", "props": { "citta": "Roma" } }
}
```

- `w`/`h`: misura proposta quando lo aggiungi; `minW`/`minH`: la più piccola in cui si legge ancora (l'editor non va sotto).
- Il widget deve adattarsi alla misura: `resize(w, h)` riceve i pixel del riquadro. Prova la HOME con griglie 6×4 e 8×4.
- Per i dati usa le tue rotte (`D.api.get('/api/plugins/<nome>/...')`) con `D.every(attivo, riposo, fn)`: a riposo il tablet
  aggiorna più di rado e risparmia batteria.

## Mettere mano al codice

```bash
cd app
npm install       # anche le dipendenze di sviluppo
npm test          # test di server, azioni, configurazione, temi e compatibilità ES5 del client
npm run server    # solo il server, senza lo script di avvio
npm run demo      # dock con dati finti su :8790
npm run themes    # rigenera i temi dopo una modifica a public/css/dock.css
npm run new:page -- <id>      # pagina nuova in config/pages/
npm run new:widget -- <nome>  # plugin con un widget in plugins/
npm run screenshots           # rifà le immagini del README dalla demo (con npm run demo acceso)
```

```text
app/
  server/index.js        API (Express) e avvio
  server/config.js       lettura dei JSON con commenti, ricarica a caldo, unione di default, tuoi file e cartelle
  server/check.js        controllo della configurazione (problemi mostrati nel pannello)
  server/actions/        motore delle azioni (HANDLERS) e macro
  server/plugins.js      caricatore dei plugin (azioni, rotte, pagine, script del tablet)
  server/home.js         HOME dal pannello: catalogo dei widget, controlli, disposizione
  plugins/               i plugin, uno per cartella
  server/platform/       windows.js (+ helper PowerShell), linux.js: tutto ciò che dipende dal sistema
  server/services/       un file per funzione: media, discord, mail, games, screens, mixer, claude...
  public/                client del tablet (ES5, niente framework): app.js, widgets.js, icons.js, css/
  control/               pannello di controllo del PC
  config/defaults/       configurazione predefinita: pages/ (una pagina per file), JSON, history.json
  schema/                schemi JSON di pagine, app e comandi (per l'editor)
  scripts/               avvio (bootstrap.js), temi, demo, icona Windows/Linux
  tests/                 test con node --test
```

Come aggiungere le cose più comuni **dentro il progetto** (per le tue aggiunte personali usa un [plugin](#plugin-widget-e-azioni-nuove)):

- **Un tipo di azione**: una funzione in `HANDLERS` (`server/actions/index.js`). Se serve il sistema operativo, aggiungi il metodo
  sia in `server/platform/windows.js` sia in `server/platform/linux.js`.
- **Un'icona**: una riga in `public/js/icons.js` (`nome: 'path SVG'`, viewBox 24×24).
- **Un widget**: una funzione `function mioWidget(root, tile, app)` in `public/js/widgets.js` che restituisce
  `{ update: function (stato) {}, resize: function (w, h) {}, destroy: function () {} }`, registrata nella mappa `TYPES`
  (il controllo della configurazione la legge da lì). Poi il suo nome nello schema (`schema/page.schema.json`, tile > widget:
  se manca, un test te lo dice) e, per la HOME, una riga in `CATALOG` di `server/home.js`
  (`{ id, widget, label, icon, page, description, w, h, minW, minH }`). I dati arrivano da `/api/state` (in `update`)
  o da una rotta nuova in `server/index.js`.
- **Una pagina predefinita**: un file nuovo in `config/defaults/pages/` e il suo id nella lista `"pages"` di `config/defaults/dock.json`.
  Prima di cambiare un JSON in `config/defaults/` (non le pagine) aggiungi l'impronta della versione vecchia in
  `config/defaults/history.json` (così chi non l'ha modificato riceve l'aggiornamento).
- **Un tipo di azione nuovo**: aggiungilo anche a `schema/page.schema.json` (i test controllano che siano allineati).

**Lingua del tablet.** Il testo si scrive in italiano (codice e pagine); con l'inglese scelto il tablet traduce al volo quello che
compare sullo schermo con il dizionario `public/js/lang-en.js` (`I18n.add({ 'Testo': 'Text' })`, senza badare alle maiuscole;
per i testi con numeri o nomi `I18n.rules([[/^(\d+) finestre$/, '$1 windows']])`). Testo nuovo sul tablet = una riga nel dizionario.
I testi dell'utente (brani, attività, messaggi) vanno in un elemento con `class="notr"`, così non vengono mai tradotti.
Un plugin aggiunge le sue traduzioni con `I18n.add` nei suoi script.

Regole da rispettare:

- Il **client del tablet** (`public/js`, `public/css`) resta **ES5 e senza flexbox**: deve girare sul browser di Android 4.
  Lo controlla `tests/client-es5.test.js`.
- I **temi** in `public/css/themes/` sono generati: dopo una modifica a `dock.css` esegui `npm run themes`.
- I file **PowerShell** sono in UTF-8 con BOM.
- I test che toccano dati, Discord o l'helper di Windows usano `DOCK_DATA_DIR` (e `DOCK_CONFIG_DIR`) per non toccare i dati veri.

---

## Sicurezza

La dock risponde solo con il codice di accesso, il pannello solo da `127.0.0.1`, e i segreti in `data/` sono cifrati
con il portachiavi del sistema. Alcune funzioni (scrivere testo sul PC, far lavorare Claude Code) danno al tablet molto potere:
non condividere il codice. Dettagli: [Sicurezza](app/README.md#sicurezza).

## Contribuire

Segnalazioni, idee e pull request sono benvenute: come fare in [CONTRIBUTING.md](CONTRIBUTING.md). Ogni modifica viene
verificata e unita dal proprietario del repository. Se usi un assistente AI (Claude, Copilot, Cursor, Codex…) per
scrivere widget, plugin o pagine, fagli leggere [AGENTS.md](AGENTS.md): architettura, regole e passi in un solo file.

## Licenza

[MIT](LICENSE) © 2026 Stefano Di Patti
