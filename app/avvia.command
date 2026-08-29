#!/bin/zsh
# Avvia Fantatool (nuova app Svelte, Mac). Doppio click da Finder.
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
	for mod in classic mantra; do
		for n in 8 10; do
			python3 ../tools/export_json.py --modalita $mod --partecipanti $n >/dev/null 2>&1 || true
		done
	done
fi

# Build solo se manca o se il sorgente è più recente dell'ultima build.
if [[ ! -d build ]] || [[ -n "$(find src static -newer build -type f -print -quit 2>/dev/null)" ]]; then
	echo "Compilo l'app…"
	npm install --silent
	npm run build
fi

# Libera la porta da un'eventuale istanza precedente (evita di servire una build vecchia).
lsof -tiTCP:"$PORT" -sTCP:LISTEN 2>/dev/null | xargs kill 2>/dev/null || true
sleep 0.3

echo "Servo su $URL  (Ctrl+C per fermare)"
(sleep 1; open -a "Google Chrome" "$URL" 2>/dev/null || open "$URL") &

# Server statico con no-cache: il browser prende sempre l'ultima build,
# niente websocket, niente dev server. Se cade, si riapre e basta.
cd build
exec python3 - "$PORT" <<'PYEOF'
import sys, http.server, socketserver
port = int(sys.argv[1])
class H(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control", "no-store, must-revalidate")
        self.send_header("Pragma", "no-cache")
        self.send_header("Expires", "0")
        super().end_headers()
    def log_message(self, *a):
        pass
socketserver.TCPServer.allow_reuse_address = True
with socketserver.TCPServer(("127.0.0.1", port), H) as httpd:
    print(f"pronto su http://localhost:{port}")
    httpd.serve_forever()
PYEOF
