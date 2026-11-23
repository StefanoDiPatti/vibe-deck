#!/usr/bin/env bash
set -u

ROOT="$(cd "$(dirname "$(readlink -f "$0")")/../.." && pwd)"
DATA="${DOCK_DATA_DIR:-$ROOT/data}"
LOG="$DATA/dock.log"
PIDFILE="$DATA/dock.pid"
SELF="$ROOT/scripts/linux/vibe-deck.sh"
ICON="$ROOT/scripts/linux/vibe-deck.svg"
APP_ID="vibe-deck"
OLD_ID="command-dock"

port() {
  if [ -n "${DOCK_PORT:-}" ]; then echo "$DOCK_PORT"; return; fi
  local p
  p="$(grep -E '^[[:space:]]*PORT[[:space:]]*=' "$ROOT/.env" 2>/dev/null | tail -1 | cut -d= -f2 | tr -d '[:space:]"'"'")"
  echo "${p:-8787}"
}
PORT="$(port)"
PANEL="http://127.0.0.1:$PORT/control"

say() {
  if command -v notify-send >/dev/null 2>&1 && [ -n "${DISPLAY:-}${WAYLAND_DISPLAY:-}" ]; then
    notify-send -a "Vibe Deck" -i "$ICON" "Vibe Deck" "$1" 2>/dev/null || echo "$1"
  else
    echo "$1"
  fi
}

running() { curl -s -m 2 -o /dev/null -w '%{http_code}' "http://127.0.0.1:$PORT/api/health" 2>/dev/null | grep -q '^200$'; }

node_bin() {
  if command -v node >/dev/null 2>&1; then command -v node; return; fi
  for n in /usr/bin/node /usr/local/bin/node "$HOME"/.nvm/versions/node/*/bin/node; do [ -x "$n" ] && { echo "$n"; return; }; done
  return 1
}

start() {
  if running; then return 0; fi
  local node
  if ! node="$(node_bin)"; then say "Node.js non trovato: installalo (sudo pacman -S nodejs npm) e riprova."; return 1; fi
  mkdir -p "$DATA"
  printf '\n==== %s  avvio dal desktop (porta %s) ====\n' "$(date '+%F %T')" "$PORT" >> "$LOG"
  ( cd "$ROOT" && PORT="$PORT" setsid "$node" scripts/bootstrap.js --service >> "$LOG" 2>&1 < /dev/null & echo $! > "$PIDFILE" )
  local i
  for i in $(seq 1 60); do
    if running; then return 0; fi
    if ! kill -0 "$(cat "$PIDFILE" 2>/dev/null)" 2>/dev/null; then break; fi
    sleep 0.5
  done
  if running; then return 0; fi
  say "La dock non è partita: guarda il log (tasto destro sull'icona > Apri il log)."
  return 1
}

stop() {
  local stopped=1 pid
  pid="$(cat "$PIDFILE" 2>/dev/null)"
  if [ -n "$pid" ] && kill -0 "$pid" 2>/dev/null; then kill -TERM "$pid" 2>/dev/null; stopped=0; fi
  pid="$(sed -n 's/.*"pid": *\([0-9][0-9]*\).*/\1/p' "$DATA/runtime.json" 2>/dev/null | head -1)"
  if [ -n "$pid" ] && kill -0 "$pid" 2>/dev/null && tr '\0' ' ' < "/proc/$pid/cmdline" 2>/dev/null | grep -q 'server/index.js'; then
    kill -INT "$pid" 2>/dev/null; stopped=0
  fi
  local i
  for i in $(seq 1 20); do running || break; sleep 0.25; done
  rm -f "$PIDFILE"
  if running; then say "La dock non si è fermata: chiudila dal terminale in cui l'hai avviata."; return 1; fi
  [ $stopped -eq 0 ] && say "Dock fermata." || say "La dock era già spenta."
  return 0
}

open_url() { xdg-open "$1" >/dev/null 2>&1 & }

desktop_file() {
  mkdir -p "$(dirname "$1")"
  cat > "$1" <<EOF
[Desktop Entry]
Type=Application
Name=Vibe Deck
GenericName=Stream Deck per il tablet
Comment=Avvia la dock in background e apre il pannello di controllo
Exec="$SELF" panel
Icon=$ICON
Terminal=false
Categories=Utility;
StartupNotify=false
Keywords=stream;deck;tablet;dock;
Actions=start;restart;stop;log;
$2
[Desktop Action start]
Name=Avvia senza aprire il pannello
Exec="$SELF" start

[Desktop Action restart]
Name=Riavvia la dock
Exec="$SELF" restart

[Desktop Action stop]
Name=Ferma la dock
Exec="$SELF" stop

[Desktop Action log]
Name=Apri il log
Exec="$SELF" log
EOF
  chmod +x "$1"
  command -v gio >/dev/null 2>&1 && gio set "$1" metadata::trusted true 2>/dev/null
  echo "  creato: $1"
}

desktop_dir() { command -v xdg-user-dir >/dev/null 2>&1 && xdg-user-dir DESKTOP || echo "$HOME/Desktop"; }

install() {
  chmod +x "$SELF"
  local what="${*:-desktop menu}"
  rm -f "$(desktop_dir)/$OLD_ID.desktop" "$HOME/.local/share/applications/$OLD_ID.desktop" "$HOME/.config/autostart/$OLD_ID.desktop"
  case " $what " in *" desktop "*) desktop_file "$(desktop_dir)/$APP_ID.desktop" "" ;; esac
  case " $what " in *" menu "*) desktop_file "$HOME/.local/share/applications/$APP_ID.desktop" "" ;; esac
  case " $what " in *" autostart "*)
    desktop_file "$HOME/.config/autostart/$APP_ID.desktop" "X-GNOME-Autostart-enabled=true
X-KDE-autostart-after=panel"
    sed -i "0,/^Exec=.*/s||Exec=\"$SELF\" start|" "$HOME/.config/autostart/$APP_ID.desktop" ;;
  esac
  command -v update-desktop-database >/dev/null 2>&1 && update-desktop-database "$HOME/.local/share/applications" 2>/dev/null
  return 0
}

uninstall() {
  rm -fv "$(desktop_dir)/$OLD_ID.desktop" "$HOME/.local/share/applications/$OLD_ID.desktop" "$HOME/.config/autostart/$OLD_ID.desktop" "$(desktop_dir)/$APP_ID.desktop" "$HOME/.local/share/applications/$APP_ID.desktop" "$HOME/.config/autostart/$APP_ID.desktop"
}

case "${1:-panel}" in
  panel|"")  start && open_url "$PANEL" ;;
  start)     start && say "Dock avviata (porta $PORT)." ;;
  stop)      stop ;;
  restart)   stop >/dev/null; start && say "Dock riavviata." ;;
  log)       mkdir -p "$DATA"; touch "$LOG"; open_url "$LOG" ;;
  status)    if running; then echo "accesa (porta $PORT)"; else echo "spenta"; exit 1; fi ;;
  install)   shift; install "$@" ;;
  uninstall) uninstall ;;
  *)         sed -n '2,16p' "$0" | sed 's/^# \{0,1\}//'; exit 2 ;;
esac
