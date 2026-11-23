#!/usr/bin/env bash
cd "$(dirname "$0")" || exit 1

if ! command -v node >/dev/null 2>&1; then
  echo
  echo "Node.js non è installato (serve la versione 18 o più recente)."
  PM=""
  if command -v apt-get >/dev/null 2>&1; then PM="sudo apt-get install -y nodejs npm"
  elif command -v dnf >/dev/null 2>&1; then PM="sudo dnf install -y nodejs npm"
  elif command -v pacman >/dev/null 2>&1; then PM="sudo pacman -S --noconfirm nodejs npm"
  elif command -v zypper >/dev/null 2>&1; then PM="sudo zypper install -y nodejs npm"
  fi
  if [ -n "$PM" ]; then
    read -r -p "Lo installo con: $PM ? [s/N] " ans
    case "$ans" in
      s|S|y|Y) $PM || exit 1 ;;
      *) echo "Installa Node.js da https://nodejs.org e rilancia ./start.sh"; exit 1 ;;
    esac
  else
    echo "Installa Node.js da https://nodejs.org e rilancia ./start.sh"
    exit 1
  fi
fi

exec node scripts/bootstrap.js "$@"
