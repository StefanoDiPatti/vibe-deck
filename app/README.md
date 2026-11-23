# Vibe Deck

Trasforma un vecchio tablet Android 4.x in una **Stream Deck wireless** per il PC.
Il PC (Windows o Linux) fa girare un piccolo server Node.js. Il tablet apre una pagina web dal browser: niente app da installare.

> Questo è il **riferimento completo**. Per cominciare leggi le tre guide nel [README principale](../README.md): installazione, guida utente e guida per sviluppatori.

- Pulsanti configurabili da JSON: avvio app, scorciatoie, testo, macro, comandi.
- **Musica**: copertina, coda dei brani, salto a un punto del brano, shuffle e ripeti, volume dell'app (non di sistema). Funziona con Apple Music web e YouTube tramite un'estensione del browser, e con le app desktop (Spotify, VLC, ...). Giochi e launcher (es. Riot Client) vengono ignorati.
- **Claude**: le sessioni di Claude Code dell'app desktop, divise per le sezioni del PC. Scrivi (o detti) dal tablet e il messaggio parte dall'app sul PC, con i permessi della sessione.
- Monitor PC: CPU, RAM, GPU NVIDIA (uso, temperatura, VRAM), rete.
- **Discord**: server, canali vocali, chi c'è in stanza e chi parla, mute e audio, webcam e Go Live.
- **Games**: i tuoi giochi, aggiunti dal pannello con il selettore di file e un'icona (se il gioco è già aperto lo porta in primo piano).
- **Audio**: scegli uscita (casse, cuffie, monitor) e microfono predefiniti, con volume e mute, e regola il volume di ogni app.
- **Schermi**: scegli su quale monitor si aprono le app dal tablet e disponi le finestre nelle zone, come Snap di Windows.
- **Pannello di controllo sul PC** per scegliere e ordinare con il trascinamento le pagine del tablet e i pulsanti di ogni pagina.
- **Windows e Linux** riconosciuti da soli: su Linux i pulsanti di Windows diventano i loro equivalenti (PowerShell → Terminale, Task Mgr → Monitor di sistema...).
- **Email**: posta in arrivo letta da Thunderbird sul PC (Gmail, Outlook, iCloud, mail di università e aziende...), in sola lettura.
- **QR code** per collegare un telefono o un tablet: lo inquadri ed è fatta.
- Ollama, riepilogo GitHub, TODO sulle Memo di Windows, orologio.
- Pagine di scorciatoie per Blender e DaVinci Resolve (da aggiungere alla barra dal pannello), che mettono in primo piano il programma prima di premere i tasti.

## Avvio rapido

> Vuoi solo vederla? `npm run demo` apre una dock con **dati finti** (musica, PC, TODO, sessioni) su `http://127.0.0.1:8790/?t=DEMO1234`, senza leggere la tua configurazione né il `.env`.

**Windows:** doppio click su `start.bat` (o sul collegamento "Vibe Deck" sul desktop).
**Linux:** `./start.sh` (oppure `bash start.sh`).

Al primo avvio lo script fa tutto da solo:

1. se manca Node.js propone di installarlo (winget su Windows, il gestore pacchetti su Linux);
2. installa le dipendenze (`npm ci`);
3. crea `.env` con un **codice di accesso** casuale e la tua configurazione in `config/`;
4. chiede se aprire la porta nel firewall, creare il collegamento sul desktop e attivare l'avvio automatico;
5. avvia il server e lo riavvia da solo se va in crash.

Per ripetere le domande: `start.bat --setup` (o `./start.sh --setup`).

### Windows: in background, con l'icona vicino all'orologio

Su Windows la dock gira **in background**, senza finestre aperte. La trovi come icona (quattro quadratini blu) nell'area di notifica, sotto la freccetta vicino all'orologio. Dal menu dell'icona puoi:

- aprire il **pannello di controllo** (anche con doppio clic sull'icona, o sul collegamento *Vibe Deck* del desktop);
- aprire la dock su questo PC;
- vedere indirizzo e codice per il tablet (vengono anche copiati negli appunti);
- aprire il log (`data/dock.log`);
- riavviarla;
- chiuderla.

L'icona grigia indica che la dock è ferma: il motivo è scritto nel log.
Per vedere i messaggi in una finestra: `start.bat --console`.

> Non è un "servizio" di Windows in senso stretto apposta: i servizi girano in una sessione separata e non potrebbero premere tasti né leggere la musica dell'utente. L'icona parte con il tuo account, come le altre app.

### L'indirizzo per il tablet

Lo trovi dal menu dell'icona (Windows) o nella finestra del server (Linux / `--console`):

```text
  Apri sul tablet:  http://192.168.1.50:8787   (Ethernet)
  Codice di accesso: ABCD2345
  Link diretto (salva il codice):  http://192.168.1.50:8787/?t=ABCD2345
  Pannello di controllo (solo da questo PC):  http://127.0.0.1:8787/control
```

## Sul tablet

0. Il modo più veloce: inquadra il **QR code** che compare nel terminale all'avvio o in cima al pannello di controllo.
1. Apri il **link diretto**: il codice viene salvato e non te lo chiede più. In alternativa apri l'indirizzo e scrivi il codice.
   Il tablet ricorda tutti i codici con cui si è collegato (fino a 6): se sullo stesso PC alterni Windows e Linux, ognuno con il suo codice, lo inserisci una volta per sistema e poi passa da uno all'altro da solo.
2. Chrome: menu > *Aggiungi a schermata Home*. Dall'icona la dock si apre a schermo intero.
3. Per tenere lo schermo acceso: *Opzioni sviluppatore > Rimani attivo* (con il tablet in carica).
4. Tocca l'orologio in alto a destra per il fullscreen, se il browser lo supporta.
5. Per aprire direttamente una pagina aggiungi il suo id all'indirizzo: `http://IP:8787/#media`, `#claude`, `#blender`.

In alto a destra trovi la rete del PC (nome del Wi-Fi e segnale, oppure Ethernet), la velocità di download/upload e la RAM.

**Batteria:** dopo un minuto senza tocchi la dock aggiorna i dati più lentamente (stato del PC ogni 15 secondi invece di 2); dopo 10 minuti parte il salvaschermo, nero con un orologio fioco, e smette del tutto di chiamare il PC. Un tocco la riattiva, senza premere il pulsante sotto. Tempi in `services.json` → `tablet`; per non far mai partire il salvaschermo su un tablet: rotellina in alto → *Sempre attivo*. Il consumo maggiore resta lo schermo: abbassa la luminosità di Android, e se il tablet resta in carica usa *Rimani attivo* solo quando serve.

Pulsanti con la barra arancione in basso (es. BLOCCA): vanno **tenuti premuti** circa 1 secondo.
I pulsanti volume e annulla si ripetono se tieni premuto.

## Pagine predefinite

| Pagina | Contenuto |
|---|---|
| HOME | musica (comandi base), stato del PC, todo |
| MUSICA | lettore completo (seek, shuffle, ripeti, volume dell'app) e coda dei brani |
| APP | programmi (pallino verde = già aperto, un altro tocco lo chiude), Claude, PowerShell/Terminale, screenshot, blocco PC, schermo spento, **volume di sistema**, Blender e DaVinci |
| DEV | VS Code, Claude Code, PowerShell, OpenClaw, scorciatoie di VS Code |
| GITHUB | PR, issue, CI, ultimo deploy (workflow di GitHub Actions con deploy, release, publish o pages nel nome: badge DEPLOY ✓/✗/…) e ultimo commit dei tuoi repository |
| OLLAMA | chat con i modelli locali |
| CLAUDE | chat, sessioni di Claude Code, dettatura, scrittura sul PC |
| DISCORD | server, canali vocali con chi c'è dentro, chi parla, mute/audio, webcam, Go Live, volume e muto di una persona solo per te |
<<<<<<< HEAD
| GAMES | i giochi scelti dal pannello, con la loro icona (pallino verde se aperti; se già aperto lo porta in primo piano) |
| EMAIL *(disponibile)* | posta in arrivo degli account scelti dal pannello, lettura dei messaggi, apertura della webmail sul PC |
=======
| GAMES | Hearthstone, World of Tanks, League of Legends (pallino verde se aperti; se già aperto lo porta in primo piano) |
| EMAIL *(disponibile)* | posta in arrivo degli account di Thunderbird scelti dal pannello, lettura dei messaggi, apertura di Thunderbird sul PC |
>>>>>>> origin/main
| SCHERMI *(Windows; Linux con KDE Plasma 6 + kdotool)* | monitor del PC, disposizioni delle finestre, monitor su cui aprire le app, **desktop virtuali** (passa, crea, chiudi, trascinaci una finestra) e pulsante **GUIDA** con le scorciatoie |
| AUDIO | uscite e microfoni (predefinito, volume, mute), volume e mute di ogni app che usa l'audio |
| DESKTOP VIRTUALI *(solo Linux)* | guida alle scorciatoie dei desktop virtuali (KDE Plasma, GNOME, anche Windows); su Windows la stessa guida è nella pagina SCHERMI |
| VIBER *(aggiungila dal pannello)* | passa ai pannelli aperti di Viber (terminale, git, browser, chat, task, file), cambia vista (schede, agenti, focus), mostra le task del progetto aperto |
| BROWSER DEV *(disponibile)* | scorciatoie del browser: RICARICA PULITA, DEVTOOLS, CONSOLE, ISPEZIONA, DISPOSITIVO, CANCELLA DATI (tenuto premuto), LOCALHOST:5173 e :3000; i tasti vanno alla finestra in primo piano |
| ANDROID *(disponibile)* | adb (Android SDK platform-tools): DISPOSITIVI, ERRORI e CRASH di logcat, SCREENSHOT nelle Immagini, SCHERMO con scrcpy, HOME/INDIETRO/RECENTI, DEV MENU e RICARICA di React Native, METRO 8081, RIAVVIA ADB. Comandi in `config/defaults/commands/android.json` |
| BLENDER, DAVINCI, UNREAL *(disponibili: aggiungile alla barra dal pannello)* | scorciatoie dei tre programmi (UNREAL: play, simula, compila C++ con Live Coding, strumenti W/E/R, viste) |

## Viber

La pagina **VIBER** comanda la finestra di Viber in primo piano sul PC (Windows e Linux). A sinistra **i pulsanti** in una griglia, che si scelgono e ordinano dal pannello di controllo come per BLENDER; a destra due colonne a tutta altezza, **Progetti** e **Task**:

- **Progetti**: i progetti aperti in Viber, quello mostrato evidenziato, con lo stato dei loro agenti (pallino rosso *ti aspetta*, arancione *al lavoro*, verde *pronto*). Un tocco passa a quel progetto con le scorciatoie di Viber "progetto successivo/precedente", lette dalle sue impostazioni; dopo ogni passo la dock controlla che il progetto sia cambiato. Con la tastiera italiana le scorciatoie di default (Ctrl+] e Ctrl+[) non si possono premere: in Viber > Impostazioni > Scorciatoie scegline altre (es. Ctrl+PagGiù / Ctrl+PagSu).
- **Task**: le task del progetto mostrato, prima quelle in corso, con i loro passi. Il riquadro *Tasks* della barra del titolo di Viber non ha comandi nell'API: dal tablet non si apre.
- **Pannelli**: terminale, git, browser, chat, task, file (e, disponibili ma nascosti, team, note, pull request, deploy, debug, simulatore). Quello attivo è acceso. Un pannello che non è tra le schede aperte in Viber non si può usare (l'API sa solo passare a una scheda già aperta): esce dalla griglia da solo (gli altri si ricompattano) e ritorna quando lo apri in Viber (**TUTTE** le rimette tutte).
- **Disposizioni** (API di Viber): **TUTTE** (un riquadro con tutte le schede); disponibili anche **DIVIDI** (browser + terminale), **REVIEW** (git + file + terminale), **INTERO** (il pannello attivo a schermo intero).
- **Viste** (scorciatoie Ctrl+Alt+1/2/3): **SCHEDE** (progetti in alto), **AGENTI** (barra degli agenti a sinistra); disponibile anche **FOCUS**. Viber viene portato in primo piano prima di premere i tasti.

Per i pulsanti in `dock.json`: `{ "type": "viber", "panel": "terminal" }`, `{ "type": "viber", "layout": "review" }`, `{ "type": "viber", "view": "agents" }`, `{ "type": "viber", "project": "next" }`.

La dock usa l'API locale di Viber: porta e token stanno in `~/.viber/browser-mcp.json`, che Viber scrive quando è aperto (si parla solo con `127.0.0.1`). Se hai più finestre di Viber, vale quella in primo piano. Se Viber rifiuta un comando (ad esempio una scheda chiusa nel frattempo) il tablet mostra l'avviso.

## Telefono

La dock funziona anche da telefono (inquadra il QR del pannello). La disposizione è sempre quella orizzontale del tablet:

- con il telefono in orizzontale la pagina occupa lo schermo, con le barre in alto e in basso un po' più basse;
- con il telefono in verticale (o con il blocco della rotazione) la pagina appare **girata di 90°**: gira il telefono con la parte alta verso sinistra e la leggi dritta.

Vale per gli schermi con il lato corto sotto i 600 px; il tablet non cambia.
## Temi del tablet

La **rotellina** nella barra in alto, accanto all'orario, apre il menù delle impostazioni: tema, lingua (IT / EN) e *Sempre attivo*. I temi:

| Tema | Com'è |
|---|---|
| Classico | blu notte, quello di sempre |
| Material | Material 3 scuro: superfici a toni, angoli molto arrotondati, pagina attiva con la pillola sotto l'icona |
| Neon Elgato | tasti neri in rilievo come uno Stream Deck, icone colorate che brillano |
| Neo-brutalista | chiaro: fondo crema, bordi neri spessi, ombra piena, colori pastello |

Anche l'orario del salvaschermo cambia con il tema: sottile (Classico), arrotondato (Material), digitale con bagliore (Neon), pesante con ombra piena (Neo-brutalista). I font sono in `public/fonts`, ridotti alle sole cifre (licenze in `public/fonts/LICENSE.md`).

La scelta resta su quel tablet. I pulsanti con `"color"` cambiano con il tema: nel Neon il colore va sull'icona, nel Neo-brutalista diventa pastello.

Per chi modifica lo stile: i file in `public/css/themes/` sono generati da `public/css/dock.css` e `scripts/themes/<tema>.js` (tabelle dei colori e forme del tema). Dopo una modifica a `dock.css` esegui `npm run themes`.

## Pannello di controllo (sul PC)

Doppio clic sull'icona **Vibe Deck** (desktop o vicino all'orologio): si apre nel browser del PC una pagina per scegliere le pagine del tablet.

- **Trascina** le pagine per cambiare l'ordine della barra in basso, o spostale tra *Nella barra* e *Disponibili*.
- La **stella** sceglie la pagina che si apre all'avvio.
- **Pulsanti delle pagine**: scegli una pagina di pulsanti (APP, DEV, GAMES, VIBER, BLENDER, DAVINCI, UNREAL; in VIBER sono quelli a sinistra delle colonne Progetti e Task) e trascina i pulsanti per riordinarli, o spostali tra *Sul tablet* e *Nascosti* (anche con la ✕ e il + su ogni pulsante). La griglia si adatta da sola: con meno pulsanti diventano più grandi. *Mostra tutti* rimette tutti i pulsanti nell'ordine predefinito.
- **Salva sul tablet**: il tablet si aggiorna da solo. *Predefinite* torna alle pagine e ai pulsanti di `dock.json`.
- **Tema** (in alto a destra): Classico, Material, Neon Elgato o Neo-brutalista, gli stessi del tablet. La scelta resta su questo PC ed è separata da quella del tablet; `/control?theme=neon` apre il pannello con un tema senza ricordarlo.

Le scelte finiscono in `config/layout.json`, anche la **HOME** scelta dal pannello (widget delle altre pagine, misure e ordine: scheda *HOME*). I pulsanti aggiunti in seguito a `dock.json` compaiono in fondo alla pagina. Il pannello risponde solo da questo PC (`http://127.0.0.1:8787/control`), non dal tablet né dalla rete. Le pagine disponibili si raggiungono solo dai pulsanti che le aprono (`{ "type": "page" }`): per le scorciatoie di Blender e DaVinci aggiungi le loro pagine alla barra. Il contenuto delle pagine si modifica sempre in `config/dock.json`.

### Collegare un telefono o un tablet (QR)

In cima al pannello c'è un QR code con il link diretto (indirizzo + codice di accesso): inquadralo con la fotocamera e la dock si apre già collegata. Se il PC è collegato sia via cavo sia in Wi-Fi scegli la rete su cui sta il telefono. Lo stesso QR compare nel terminale all'avvio (`DOCK_NO_QR=1` per nasconderlo).

### Email

La posta si collega **solo tramite [Thunderbird](https://www.thunderbird.net/download/)** (gratis, open source, di Mozilla, per Windows e Linux). È l'unico modo che funziona con tutti i servizi senza password per le app né app da registrare: l'accesso lo fa Thunderbird con i metodi ufficiali di ogni servizio (Gmail con la conferma sul telefono, Outlook, iCloud, Yahoo, Libero, e anche le mail di **università e aziende** con Microsoft 365 o Google Workspace, se l'organizzazione permette Thunderbird) e lo rinnova da solo.

1. Installa Thunderbird e aggiungi i tuoi account (*Account email esistente*: per Gmail e Microsoft lascia vuota la password, si apre la pagina di accesso del servizio).
2. Lascia attivo **"Conserva i messaggi di questo account sul computer"** (è il valore di partenza; impostazioni dell'account → Sincronizzazione e archiviazione): serve per leggere il testo dal tablet.
3. Nella sezione **Email** del pannello gli account compaiono da soli: scegli quali mostrare sul tablet, poi aggiungi la pagina **EMAIL** alla barra.

Sul tablet vedi la posta in arrivo (le non lette in evidenza), apri un messaggio per leggerlo e con **APRI SUL PC** apri Thunderbird. Con più account, **CAMBIA** passa da uno all'altro. Thunderbird deve restare aperto (anche ridotto a icona) per scaricare le email nuove.

**Riservatezza:** la dock non chiede e non salva password o token. Legge in **sola lettura** i file del profilo di Thunderbird (`INBOX.msf` per l'elenco, il file della posta per il testo): non segna le email come lette, non le sposta e non le cancella, e le manda solo al tablet sulla rete di casa. I file della posta sul disco non sono cifrati (vale per ogni programma di posta): proteggi l'account del PC con una password e, se puoi, con la cifratura del disco. `data/mail.json` tiene solo quali account mostrare.

Profili cercati: `%APPDATA%\Thunderbird` su Windows; `~/.thunderbird`, Flatpak (`~/.var/app/org.mozilla.Thunderbird/.thunderbird`) e Snap su Linux. `DOCK_THUNDERBIRD_DIR` indica un'altra cartella (quella con `profiles.ini`).

### Giochi

Nella sezione **Giochi** del pannello premi **Aggiungi un gioco**: si apre il selettore di file del sistema (Windows: `.exe`, collegamenti `.lnk` e `.url` di Steam; Linux: file `.desktop`, script, AppImage). La dock propone il nome (dalle informazioni del file) e le icone:

- l'icona del file stesso (fino a 256 px);
- le immagini del gioco trovate sul web: copertina e intestazione di **Steam**, immagine della voce di **Wikipedia** e loghi di **Wikimedia Commons** (nessuna chiave API). Puoi cercare con un altro nome; senza icona resta quella di riserva.

Il campo **Processo del gioco** serve per il pallino verde e per riportare il gioco in primo piano: se il file è un launcher (Battle.net, Riot, Game Center...) scrivi il nome del processo del gioco vero (più nomi separati da virgola). Con le frecce cambi l'ordine dei pulsanti, con **Icona** ne scegli un'altra.

I giochi sono dati personali: stanno in `data/games.json` e le icone in `data/game-icons/`, solo su questo PC. Il progetto non contiene giochi né percorsi di un PC.

### Discord

Usa il collegamento locale dell'app Discord (lo stesso delle Stream Deck): niente bot, funziona con Discord aperto sul PC. Discord lo concede solo alle applicazioni registrate, quindi serve una configurazione, una volta sola, guidata dal pannello:

1. sul [Developer Portal](https://discord.com/developers/applications) crea una *New Application*;
2. in *OAuth2* copia **Client ID** e **Client Secret**; sotto *Redirects* premi *Add Redirect*, scrivi `http://localhost` (senza barra finale) e premi **Save Changes**. Se manca, Discord risponde *"invalid_request: missing redirect_uri"*;
3. incollali nel pannello e premi **Collega**: Discord chiede di autorizzare la dock.

Dal tablet: tocca un server, poi un canale per entrarci; tocca una persona nella tua stanza per aprire il suo menu: **volume per te** da 0 a 200% (barra, − e +, 50/100/150/200%) e **MUTA PER ME**, come il tasto destro su Discord (gli altri non lo vedono); **MIC** e **AUDIO** per mutarti o silenziare; **CAM** accende la webcam; **LIVE** avvia il Go Live del gioco aperto (uno di quelli della pagina GAMES, o qualsiasi app con `"game": true`); **ESCI** (tieni premuto) per lasciare la stanza.

Webcam e Go Live usano due comandi di Discord non documentati (`TOGGLE_VIDEO`, `TOGGLE_SCREENSHARE`) e un permesso in più: se avevi già collegato la dock, premi **Riautorizza** nel pannello. Se Discord non concede quel permesso, l'autorizzazione prosegue senza, e CAM e LIVE restano spenti. Senza configurazione MIC e AUDIO funzionano lo stesso, con le scorciatoie predefinite di Discord (Ctrl+Shift+M / Ctrl+Shift+D). Le credenziali stanno in `data/discord.json`, solo su questo PC.

## Musica

### Estensione per Apple Music web e YouTube (consigliata)

Apple Music è una web app, e Windows dà pochissime informazioni sulle schede del browser: niente coda, niente volume della scheda e durate a volte sbagliate. La piccola estensione nella cartella `extension/` legge direttamente il player del sito e lo comanda.

Installazione (una volta sola, in Brave, Chrome o Edge):

1. Apri `brave://extensions` (o `chrome://extensions`, `edge://extensions`).
2. Attiva **Modalità sviluppatore** (in alto a destra).
3. **Carica estensione non pacchettizzata** e scegli la cartella `extension` di questo progetto.
4. Le schede di Apple Music / YouTube già aperte vengono collegate da sole (senza ricaricarle).

Dopo un aggiornamento della dock, in `brave://extensions` premi la freccia circolare sull'estensione per caricare la versione nuova.

Cliccando l'icona dell'estensione vedi se è collegata alla dock. Funziona con `music.apple.com`, `music.youtube.com` e `www.youtube.com`. L'estensione parla solo con la dock sullo stesso PC (`127.0.0.1`).

Con l'estensione:

- **Coda**: nella pagina MUSICA tocchi un brano per farlo partire. Su YouTube la coda è quella della playlist aperta.
- **Volume dell'app**: i tasti volume del lettore regolano Apple Music o YouTube, non il volume di Windows.
- **Durata e posizione esatte**, e tocco sulla barra per spostarti nel brano.
- **Shuffle e ripeti** (Apple Music).

### App desktop

Spotify, VLC, Tidal, Deezer, MusicBee e simili si comandano con i controlli multimediali del sistema, ognuno direttamente, senza passare dall'app che Windows considera "attiva". Il volume dei tasti del lettore è quello della singola app (mixer di Windows).
Sono accettate solo app musicali: l'elenco si personalizza in `config/services.json` → `media` (`allowApps`, `blockApps`).

Il volume **di sistema** sta nella pagina APP (VOL -, MUTE, VOL +).

## Claude

La pagina CLAUDE ha due elenchi.

**Consumi**: in fondo alla colonna sinistra della pagina CLAUDE ci sono le barre dell'abbonamento: **sessione di 5 ore**, **settimana** e, se Anthropic li dà, i limiti settimanali per modello, ognuno con l'ora in cui si azzera (arancione dal 70%, rosso dal 90%). Tocca il riquadro per aggiornarlo. La dock usa l'accesso di Claude Code già fatto sul PC (`~/.claude/.credentials.json`, come Viber): il token resta sul PC, al tablet arrivano solo le percentuali.

**CLAUDE CODE**: le sessioni dell'app desktop di Claude, raggruppate per le sezioni della barra laterale del PC (le tue cartelle, come Lavoro o Progetti personali). Le sessioni fuori dalle sezioni sono raggruppate per progetto, come nell'app. Il pallino arancione indica che Claude sta lavorando.

- **Scrivere**: quello che scrivi (o detti) parte dall'**app sul PC**, nella sessione vera. La dock apre la sessione nell'app, mette il testo nel campo e preme Invia tramite l'accessibilità di Windows: lo vedi comparire subito sul PC, senza riavviare l'app, e valgono i permessi scelti per quella sessione (es. *Auto*).
- Se Claude sta lavorando, il messaggio resta **in coda** e parte quando ha finito.
- Se sul PC c'è già del testo scritto in quella sessione, la dock non lo sovrascrive e te lo dice.
- **STOP** (tieni premuto) ferma Claude; **SUL PC** apre la sessione nell'app.
- **+** accanto a una sezione apre una nuova sessione lì, con lo stesso pulsante "Nuova sessione in …" della barra laterale. Le nuove sessioni da link esterno chiederebbero ogni volta di confermare la cartella sul PC, e quella conferma resta tua.
- Mentre la dock scrive, l'app sul PC passa a quella sessione.

Senza l'app aperta (e su Linux) la dock continua la sessione con `claude -p --resume`, usando la modalità di permessi della sessione (`auto` se non ne ha una). Prima le scritture venivano negate. Le modifiche fatte così compaiono nell'app quando riapri la sessione.

**CHAT**: le conversazioni fatte dal tablet (Claude Code con il tuo abbonamento, o la Claude API con `ANTHROPIC_API_KEY` nel `.env`), salvate in `data/claude-chats.json`. Le chat di claude.ai e della scheda Chat dell'app stanno sul tuo account, non sul PC: la dock non le può leggere senza entrare nel tuo account.

### TODO e Memo di Windows

Su Windows il TODO mostra le **Memo** (Sticky Notes): ogni riga di una memo è un'attività, una riga barrata è fatta, la prima riga in grassetto è il titolo. Dal tablet puoi aggiungere righe (anche a voce), spuntarle (la riga viene barrata) e toglierle; le modifiche fatte sul PC compaiono sul tablet in pochi secondi.

L'app Memo non vede le modifiche fatte da fuori, quindi a ogni modifica dal tablet la dock la chiude, aggiorna la memo, la mette in coda per la sincronizzazione con il cloud e la riapre (circa un secondo). Più tocchi ravvicinati causano un solo riavvio. La dock non crea e non cancella mai memo intere.

Con più memo, tocca un titolo nel TODO per scegliere dove aggiungere. In `services.json` → `todo`: `"memo"` sceglie la memo predefinita (parte del titolo), `"source": "local"` torna alla lista interna della dock (usata anche su Linux).

### TODO uguali su Windows e Linux (GitHub)

I TODO possono essere copiati in `todo.json` sul branch **`dock-todo`** di un remote git, con le stesse credenziali git che usi per il push: niente token da configurare e nessun commit nella cronologia del codice.

**È spenta di default.** Le attività finiscono sul remote, quindi accendila (`"enabled": true` in `config/services.json` → `todo.sync`) solo se il remote è **privato**: se la tua copia della dock è un fork pubblico, aggiungi un remote privato (es. `git remote add todo <url-della-repo-privata>`) e scrivi `"remote": "todo"`.

- La copia si aggiorna pochi secondi dopo ogni modifica dal tablet e ogni 2 minuti. Così prende anche le modifiche fatte direttamente nelle Memo, e quelle arrivate dall'altro PC.
- Su Windows la fonte restano le Memo: le aggiunte, le spunte e le cancellazioni fatte su Linux vengono scritte nelle Memo (il testo di una riga si cambia solo nell'app Memo). Su Linux la lista locale riceve tutto, divisa per memo come su Windows.
- Se la stessa attività cambia su entrambi i PC tra una sincronizzazione e l'altra, vince il PC che sincronizza.
- Al primo avvio su un PC nuovo la dock adotta la lista che trova su GitHub. Su Linux la lista locale precedente viene salvata in `data/todo.prima-della-sync.json`.
- La nuvoletta **GitHub** nel titolo del TODO è verde quando è tutto sincronizzato e rossa in caso di errore: toccala per sincronizzare subito o leggere l'errore.

Impostazioni in `services.json` → `todo.sync`: `enabled`, `remote` (`origin`), `branch` (`dock-todo`), `intervalSec`.

### Dettatura vocale

Il pulsante 🎤 accanto al campo di testo (Claude e TODO):

1. usa il riconoscimento vocale del browser, se presente;
2. altrimenti, se hai configurato una trascrizione sul PC (`services.json` → `voice`, ad esempio whisper.cpp), apre il registratore di Android e il PC trascrive l'audio;
3. altrimenti apre la tastiera: tocca il microfono della tastiera di Android (Google voice typing), che è il modo più affidabile su Android 4.

## Configurazione

Tutti i file accettano commenti `//`. **Salva e il tablet si aggiorna da solo**, senza riavviare.

| File | Cosa contiene |
|---|---|
| `config/pages/<id>.json` | le tue pagine, una per file (anche le copie modificate di quelle predefinite) |
| `config/apps/<id>.json`, `config/commands/<id>.json` | le tue app e i tuoi comandi, uno per file |
| `config/dock.json` | titolo, griglia, pagina iniziale e ordine delle pagine (`"pages"`: lista di id) |
| `config/apps.json` | programmi avviabili (percorsi per Windows e Linux) |
| `config/commands.json` | comandi consentiti (whitelist) |
| `config/services.json` | musica, Claude, voce, GitHub, Ollama, monitor di sistema |
| `.env` | porta, codice di accesso, token e chiavi API |

I file in `config/` sono tuoi e non vanno su git. I default stanno in `config/defaults/` (le pagine in `config/defaults/pages/`, una per file): cancella un file da `config/` per ripristinarlo. Esempi passo passo nella [guida per sviluppatori](../README.md#3-guida-per-sviluppatori-personalizza-la-tua-vibe-deck); in fondo al pannello di controllo trovi l'elenco dei problemi della configurazione.
Se un file in `config/` non l'hai mai modificato, all'avvio passa da solo alla nuova versione predefinita (dopo un `git pull`). Quelli modificati restano come sono.

### Windows e Linux

La dock riconosce il sistema e mostra i pulsanti adatti. In `dock.json`:

```json
{ "id": "viber", "os": "linux", "label": "VIBER", "action": { "type": "launch", "app": "viber" } },
{ "id": "terminal", "label": "POWERSHELL", "linux": { "label": "TERMINALE" }, "action": { "type": "launch", "app": "powershell" } }
```

- `"os": "linux"` (o `"windows"`): il pulsante, o la pagina, c'è solo su quel sistema.
- `"linux": { ... }` (o `"windows"`): i campi che cambiano su quel sistema, anche `action`.
- `"id"`: nome fisso del pulsante, con cui il pannello ricorda ordine e pulsanti nascosti.
- `"autoGrid": true` sulla pagina: colonne e righe scelte in base a quanti pulsanti ci sono.
- `"buttonGrid": true` sulla pagina: pulsanti in griglia a sinistra, personalizzabili dal pannello, e widget a destra (`"widgetWidth": 0.5` = metà larghezza). Come la pagina VIBER.
- `"hidden": true`: pulsante disponibile ma nascosto finché non lo mostri dal pannello.

In `apps.json` e `commands.json` la variante `"linux"` può essere una lista di alternative: vale la prima installata.

```json
"linux": [ { "path": "konsole", "args": ["-e", "claude"] }, { "path": "gnome-terminal", "args": ["--", "claude"] } ]
```

### Aggiungere un pulsante

In `tiles` della pagina (`config/pages/<id>.json`; per una pagina predefinita copiala prima da `config/defaults/pages/`):

```json
{ "label": "OBS", "icon": "camera", "color": "#5b3fa0", "action": { "type": "launch", "app": "obs" } }
```

e in `config/apps.json` (oppure in un file `config/apps/obs.json` con solo l'oggetto dell'app):

```json
"obs": {
  "label": "OBS Studio",
  "windows": { "path": "C:\\Program Files\\obs-studio\\bin\\64bit\\obs64.exe", "cwd": "C:\\Program Files\\obs-studio\\bin\\64bit" },
  "linux": { "path": "obs" }
}
```

Nei percorsi puoi usare `%USERPROFILE%`, `%LOCALAPPDATA%`, `~`, `$HOME` e `*` per la versione (`Blender *\blender.exe`). Funzionano anche i collegamenti `.lnk` (così si apre Apple Music dal collegamento sul desktop).
Le app dello Store di Windows si avviano con `shell:AppsFolder\<AppID>`; l'AppID lo trovi in PowerShell con `Get-StartApps`.

## Audio

Nella pagina **AUDIO**:

- a sinistra le **uscite** (casse, cuffie, monitor) e gli **ingressi** (microfoni): tocca il nome per renderlo predefinito; sotto quello predefinito ci sono mute, −, barra del volume (tocca un punto per impostarlo) e +;
- a destra le **app** che usano l'audio (pallino verde = sta suonando), ognuna con il suo volume e il suo mute, come il Mixer volume di Windows.

I pulsanti VOL+ / VOL− / MUTE della pagina APP restano: comandano sempre il volume di sistema.

Su Windows usa Core Audio (il cambio di dispositivo predefinito usa la stessa interfaccia del pannello Audio di Windows, come SoundSwitch o EarTrumpet). Su Linux usa `pactl` (PulseAudio o PipeWire con pipewire-pulse, versione 15 o successiva): cambiando l'uscita predefinita anche le app che stanno suonando passano lì.

## Schermi

Nella pagina **SCHERMI** del tablet vedi i monitor come sono disposti sulla scrivania (numerati da sinistra) e le finestre aperte.

- **Disporre le finestre**: tocca un monitor, scegli una disposizione (metà, terzi, 2/3 + 1/3, quarti, ...), tocca una zona e poi una finestra nella lista a destra. La zona successiva si seleziona da sola, come lo Snap Assist di Windows. Sui monitor verticali le colonne diventano righe.
- Senza una zona scelta, toccare una finestra la porta in primo piano. I due pulsanti di ogni riga la riducono a icona o la ingrandiscono.
- **Apri le app su**: AUTO lascia decidere a Windows; con un monitor scelto, le app avviate dal tablet (pulsanti *launch*) vengono spostate lì appena compare la loro finestra, mantenendo dimensioni e posizione relative.

A destra le finestre aperte (usano tutto lo spazio libero, la lista scorre) e in basso i **desktop virtuali** (al massimo 3): una scheda per desktop con numero, nome e quante finestre ha (quello attivo in blu). Tocca un desktop per passarci, la scheda **+** ne crea uno e ci entra (sparisce quando ce ne sono 3), la **X** nell'angolo (da tenere premuta) lo chiude: le sue finestre non si chiudono, passano al desktop vicino. L'elenco si legge dal registro di Windows, le finestre di ogni desktop con l'API pubblica `IVirtualDesktopManager`, e i comandi sono le scorciatoie Win+Ctrl+←/→, Win+Ctrl+D e Win+Ctrl+F4. Il pulsante **GUIDA** in alto mostra tutte le scorciatoie dei desktop virtuali di Windows e Linux.

**Trascinare una finestra**: tieni premuta una finestra della lista (col mouse basta trascinarla) e lasciala su un **desktop virtuale** (ci va senza che tu cambi desktop, come in Win+Tab), su **Nuovo** (crea un desktop e ce la mette) o su una **zona di un monitor** della mappa: mentre trascini ogni monitor mostra le zone della divisione scelta in basso (Metà, Terzi, Quarti...) e la finestra si ancora nella zona dove la lasci, con quella misura. Per i desktop la dock usa l'interfaccia interna di Explorer (quella di Win+Tab, non documentata: l'API pubblica sposta solo le finestre del proprio programma), con i GUID di Windows 11 24H2 e successivi; su versioni diverse il tablet dice che non riesce invece di fare danni.

**SCHERMI su Linux** (KDE Plasma 6, Wayland o X11): finestre, monitor, desktop virtuali e trascinamento passano da KWin, con [kdotool](https://github.com/jinliu/kdotool) 0.3 o più recente (comando `kwinscript`: la dock manda a KWin un piccolo script e legge la risposta). Su Wayland nessun altro programma vede le finestre degli altri. Installalo (`paru -S kdotool` su Arch/CachyOS, oppure `cargo install kdotool`), riavvia la dock e aggiungi la pagina SCHERMI dal pannello. Senza KDE o senza kdotool la pagina lo dice. Su Linux la finestra trascinata su **Nuovo** crea un desktop in fondo senza passarci; il **+** crea un desktop e ci va, come su Windows.

Le finestre dei programmi avviati come amministratore non si possono spostare (limite di Windows). I giochi a schermo intero esclusivo non si spostano. La scelta del monitor sta in `data/screens.json`.

### Giochi

I giochi si aggiungono dal pannello (sezione **Giochi**, vedi sopra) e stanno in `data/games.json`. Ognuno diventa un'app con `"game": true` e `"whenRunning": "focus"`: il pulsante mostra il pallino verde se il gioco è aperto e, in quel caso, lo porta in primo piano invece di riavviarlo. Anche in `config/apps.json` puoi segnare un'app come gioco con `"game": true`: `"path"` può essere una lista di percorsi (vale il primo che esiste), `"process"` una lista di processi (es. client e partita).

### App aperte: pallino verde e chiusura

Le app con `"toggle": true` in `config/apps.json` mostrano un pallino verde quando sono aperte; un altro tocco le chiude come la X della finestra (l'app può chiedere di salvare). È attivo per Blender, DaVinci, VS Code, Unreal, Apple Music, Spotify, Claude e Discord; volutamente no per PowerShell, Esplora file, Gestione attività e Claude Code, per non interrompere lavori in corso.
Apple Music (web) si riconosce tramite l'estensione: "chiudere" chiude la sua scheda. Per un pulsante che non avvia l'app (es. uno che apre la pagina BLENDER) il pallino si ottiene con `"showRunning": "blender"`.
Su Linux serve `wmctrl`.

### Tipi di azione

| Azione | Esempio |
|---|---|
| Avvia app | `{ "type": "launch", "app": "vscode" }` |
| Scorciatoia | `{ "type": "hotkey", "keys": ["CTRL", "SHIFT", "P"], "focus": "Code" }` |
| Tasto singolo | `{ "type": "key", "key": "F12", "repeat": 1 }` |
| Scrivi testo | `{ "type": "text", "value": "Ciao!\n" }` |
| Musica (app attiva) | `{ "type": "media", "command": "play_pause" }` (anche `next`, `previous`, `stop`) |
| Volume dell'app musicale | `{ "type": "media", "command": "app_volume_up" }` (anche `app_volume_down`, `app_mute`) |
| Volume di sistema | `{ "type": "media", "command": "volume_up" }` (anche `volume_down`, `mute`) |
| Apri URL sul PC | `{ "type": "open_url", "url": "https://github.com" }` |
| Apri cartella o file | `{ "type": "open_path", "path": "~/Documents" }` |
| Comando | `{ "type": "command", "id": "lock_pc" }` → `commands.json` |
| Cambia pagina | `{ "type": "page", "page": "blender" }` |
| Macro | `{ "type": "macro", "steps": [ {…}, { "type": "wait", "ms": 300 }, {…} ] }` |
| Discord | `{ "type": "discord", "command": "stream" }` (anche `mute`, `deaf`, `video`) |

`focus` (opzionale) porta in primo piano il programma prima di premere i tasti. Il valore è il nome del processo: `blender`, `Resolve`, `Code`.

Opzioni del pulsante: `"sub"` (seconda riga), `"color"`, `"repeat": true` (ripete tenendo premuto), `"confirm": true` (va tenuto premuto), `"w"`/`"h"` (celle occupate). Ogni pagina può avere la sua griglia con `"columns"` e `"rows"`.

**Tasti:** `CTRL SHIFT ALT WIN`, `A`–`Z`, `0`–`9`, `F1`–`F24`, `ENTER ESC TAB SPACE BACKSPACE DELETE INSERT HOME END PAGEUP PAGEDOWN UP DOWN LEFT RIGHT`, `NUM0`–`NUM9`, `PRINTSCREEN MINUS EQUALS COMMA PERIOD SLASH BACKQUOTE`, `MEDIA_PLAY_PAUSE VOLUME_UP`…

**Widget:** `system`, `nowplaying`, `queue`, `github`, `todo`, `clock`, `claude`, `chat` (con `"provider": "ollama"`), `discord`, `screens`, `mail`, `audio`, `vdesk` (guida ai desktop virtuali), `viber`.

**Icone:** `home music apps code github chat sparkle check cube film lock play pause stop next prev volup voldown mute shuffle repeat folder terminal cpu camera desktop robot refresh save keyboard undo redo fullscreen cut flag back add close send trash power bolt mic link headset gamepad cards tank sword layout live camoff window target mail attach`.

### GitHub

Metti un token personale (fine-grained, sola lettura) in `GITHUB_TOKEN` nel `.env`. In alternativa installa GitHub CLI e fai `gh auth login`: il token viene preso da lì.
Senza `repositories` in `services.json` vengono mostrati i 6 repository aggiornati più di recente.
Tocca un repository per aprirlo sul PC; tocca i badge PR, ISSUE o CI per aprire quella sezione.

### Ollama

Basta che Ollama sia acceso sul PC. Il tablet non parla mai direttamente con Ollama: passa sempre dal server.

## Linux

Funziona tutto tranne le parti che dipendono da Windows (Memo), sostituite da strumenti standard. La pagina SCHERMI su Linux va con KDE Plasma 6 e kdotool (vedi sopra).
Nella pagina APP: **TERMINALE** (Konsole, GNOME Terminal, Alacritty...), **MONITOR** di sistema, **SCREENSHOT** di un'area (Spectacle), **DESKTOP** (mostra il desktop di KDE), **CLAUDE** apre la web app di Claude installata da Brave (altrimenti claude.ai), **VIBER** l'app dal desktop. Su CachyOS / Arch:

```bash
sudo pacman -S playerctl wtype
paru -S kdotool          # pagina SCHERMI (finestre e desktop virtuali in KDE)
sudo ufw allow 8787/tcp
```

Su Debian/Ubuntu:

```bash
sudo apt install playerctl xdotool wtype pulseaudio-utils
```

- **playerctl**: musica, coda esclusa (qualsiasi player MPRIS: Spotify, Firefox, VLC…), compreso il volume della singola app.
- **Estensione del browser**: identica a Windows, per Apple Music web e YouTube.
- **wpctl / pactl / amixer**: volume di sistema.
- **xdotool** (X11) o **wtype** (Wayland con KDE/Sway/Hyprland): scorciatoie, testo e "scrivi sul PC". Su GNOME Wayland le scorciatoie simulate non sono permesse dal sistema.
- La temperatura CPU si legge da `/sys/class/hwmon`; le GPU AMD da sysfs.
- Firewall: `sudo ufw allow 8787/tcp`.

### Icona sul desktop (Linux)

Come su Windows, la dock può girare **in background**, senza terminale:

```bash
scripts/linux/vibe-deck.sh install            # icona sul desktop + menu delle app
scripts/linux/vibe-deck.sh install autostart  # avvio automatico all'accesso (facoltativo)
```

(o rispondi sì alle domande di `./start.sh --setup`).

- **Doppio clic** sull'icona: avvia la dock se è spenta e apre il pannello di controllo.
- **Tasto destro**: *Avvia senza aprire il pannello*, *Riavvia*, *Ferma*, *Apri il log* (`data/dock.log`).
- Funziona anche con una dock avviata da terminale: *Ferma* chiude anche quella.
- Da terminale: `scripts/linux/vibe-deck.sh status|start|stop|restart|log`; `uninstall` toglie icona e voci.

Se sposti la cartella del progetto, rilancia `install`: l'icona punta al percorso attuale.

## Sicurezza

### Dati cifrati

Password, token e client secret non stanno in chiaro sul disco:

- `data/mail.json` (solo gli account da mostrare) e `data/discord.json` sono cifrati (AES-256-GCM);
- nel `.env` i segreti (`GITHUB_TOKEN`, `ANTHROPIC_API_KEY` e ogni variabile che finisce in `TOKEN`, `SECRET`, `PASSWORD`, `_KEY`) vengono cifrati al primo avvio: diventano `enc:v1:...`. Per cambiarne uno scrivi il valore nuovo in chiaro: al riavvio viene cifrato di nuovo. `DOCK_TOKEN` resta leggibile perché è il codice che il tablet ti chiede.

La chiave sta nel **portachiavi del sistema**: su Linux il Secret Service (KWallet su KDE, GNOME Keyring), letto con `secret-tool` (pacchetto `libsecret`); su Windows la DPAPI del tuo account. Se il portachiavi non c'è, la chiave finisce in `data/secret-key` (permessi 600) e il log lo segnala. `data/secret-key.json` dice dove sta.

La cifratura protegge i file copiati, sincronizzati o finiti per sbaglio in un backup o su GitHub; non protegge da un programma che gira con il tuo account mentre la sessione è aperta. Se perdi la chiave (portachiavi azzerato), i dati cifrati non si recuperano: ricollega gli account dal pannello.

- Il server accetta solo connessioni dalla rete locale.
- Ogni API richiede il codice di accesso (cookie o header `X-Dock-Token`).
- Il tablet invia solo "ho premuto il pulsante X della pagina Y": l'azione la legge il server da `dock.json`. Dal tablet non si possono lanciare comandi arbitrari.
- **Attenzione:** "scrivi sul PC" e le sessioni di Claude Code danno al tablet la possibilità di scrivere testo sul PC e di far lavorare Claude Code nelle tue cartelle. Per questo il codice di accesso è importante: non condividerlo.
- L'estensione del browser è accettata solo da questo PC (`127.0.0.1`) e con un header che i siti web non possono inviare.
- Token GitHub, chiave API di Claude e Ollama restano sul PC; per la posta la dock non ha credenziali (le tiene Thunderbird).
- Sotto Windows la regola firewall vale solo per le reti **private**. Se la tua rete è "Pubblica", il tablet potrebbe non collegarsi: impostala come privata.

## Problemi comuni

| Problema | Soluzione |
|---|---|
| Il tablet non si collega | PC e tablet sulla stessa rete? Rete Windows impostata come *Privata*? Firewall: `start.bat --setup` |
| Non vedo l'icona | Cerca sotto la freccetta vicino all'orologio. Se l'icona è grigia, apri il log dal suo menu |
| "Porta già in uso" | La dock è già avviata (icona o un'altra finestra): chiudi l'altra |
| Musica non rilevata | Apple Music web / YouTube: installa l'estensione e ricarica la scheda. App desktop: deve essere un'app musicale (vedi `services.json` → `media`) |
| Coda vuota | La coda c'è solo con l'estensione (Apple Music, YouTube Music, playlist di YouTube) |
| Scorciatoie ignorate in un programma | Windows blocca i tasti simulati verso programmi avviati come amministratore |
| "App non trovata" | Correggi il percorso in `config/apps.json` |
| Errore "Chiave di cifratura non trovata nel portachiavi" | KWallet / GNOME Keyring chiuso: sbloccalo e riavvia la dock |
| Claude Code non risponde | Prova `claude -p "ciao"` in un terminale: deve funzionare senza login interattivo |
| Temperatura CPU N/D su Windows | Avvia LibreHardwareMonitor con *Remote Web Server* e imposta `libreHardwareMonitorUrl` |

## Sviluppo

La guida per personalizzare pagine, pulsanti, azioni e widget è nel [README principale](../README.md#3-guida-per-sviluppatori-personalizza-la-tua-vibe-deck).

```bash
npm install     # anche le dipendenze di sviluppo
npm test        # test di server, musica, azioni, configurazione e compatibilità ES5 del client
npm run server  # avvia solo il server, senza lo script di avvio
# DOCK_CONFIG_DIR / DOCK_DATA_DIR: cartelle alternative di configurazione e dati (prove)
```

```text
server/
  index.js            API Express
  config.js           lettura JSON con commenti e ricarica a caldo
  auth.js             solo rete locale + codice di accesso
  secrets.js          cifratura dei dati sensibili (chiave nel portachiavi del sistema)
  actions/            motore delle azioni e macro
  plugins.js          caricatore dei plugin (cartella plugins/)
  platform/           windows.js (+ windows-helper.ps1), linux.js, keys.js
  services/           system, media, bridge, claude, claudecode, voice, github, ollama, todo, mail, pairing (QR)
public/               client per il tablet (ES5, niente framework)
extension/            estensione del browser per Apple Music web e YouTube
config/defaults/      configurazione predefinita
plugins/<nome>/       plugin: azioni, rotte, pagine e widget in più (npm run new:widget -- <nome>)
scripts/bootstrap.js  avvio automatico (uguale su Windows e Linux)
scripts/windows/      icona nell'area di notifica e avvio nascosto
scripts/linux/        avvio in background, icona sul desktop e nel menu delle app
```

**Aggiungere una funzione senza toccare il progetto:** un plugin (`npm run new:widget -- <nome>`), vedi *Plugin* nel README principale.

**Aggiungere un tipo di azione al progetto:** aggiungi una funzione a `HANDLERS` in `server/actions/index.js`. Se serve il sistema operativo, aggiungi il metodo sia in `server/platform/windows.js` sia in `server/platform/linux.js`.

Il client deve restare ES5 e senza flexbox/grid: `tests/client-es5.test.js` lo controlla.

## Licenza

MIT, vedi [LICENSE](../LICENSE).
