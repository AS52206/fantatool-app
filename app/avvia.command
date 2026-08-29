#!/bin/zsh
# Avvio Fantatool (nuova app Svelte, Mac M1). Doppio click da Finder.
# Costruisce l'app se serve, poi la serve in locale e apre il browser.
set -e
cd "$(dirname "$0")"

PORT=8770
URL="http://localhost:$PORT"

command -v node >/dev/null 2>&1 || {
	osascript -e 'display alert "Node non trovato" message "Installa Node: brew install node" as critical'
	exit 1
}

# Rigenera il bundle dati se il listone è cambiato (richiede Python + pandas).
if command -v python3 >/dev/null 2>&1; then
	python3 ../tools/export_json.py >/dev/null 2>&1 || true
fi

# Build solo se manca o se il sorgente è più recente dell'ultima build.
if [[ ! -d build ]] || [[ -n "$(find src static -newer build -type f -print -quit 2>/dev/null)" ]]; then
	echo "Compilo l'app…"
	npm install --silent
	npm run build
fi

# Server statico: nessun dev server, nessun websocket. Se cade, si riapre e basta.
echo "Servo su $URL  (Ctrl+C per fermare)"
(sleep 1; open -a "Google Chrome" "$URL" 2>/dev/null || open "$URL") &
cd build
exec python3 -m http.server "$PORT" --bind 127.0.0.1
