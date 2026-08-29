#!/bin/zsh
# Avvia Fantatool (app Svelte, Mac). Doppio click da Finder.
# Modalità sviluppo: il server resta in ascolto sui file.
# Quando il codice cambia, la pagina si aggiorna da sola — basta il refresh, mai riavviare.
set -e
cd "$(dirname "$0")"

PORT=8770
URL="http://localhost:$PORT"

command -v node >/dev/null 2>&1 || {
	osascript -e 'display alert "Node non trovato" message "Installa Node: brew install node" as critical'
	exit 1
}

# Rigenera i bundle dati e i loghi se i file sorgente sono cambiati.
if command -v python3 >/dev/null 2>&1; then
	for mod in classic mantra; do
		for n in 8 10; do
			python3 ../tools/export_json.py --modalita $mod --partecipanti $n >/dev/null 2>&1 || true
		done
	done
	python3 ../tools/sync_assets.py >/dev/null 2>&1 || true
fi

# Dipendenze solo alla prima esecuzione (o dopo un aggiornamento).
if [[ ! -d node_modules ]] || [[ package.json -nt node_modules ]]; then
	echo "Preparo le dipendenze…"
	npm install --silent
fi

# Libera la porta da un'eventuale istanza precedente.
lsof -tiTCP:"$PORT" -sTCP:LISTEN 2>/dev/null | xargs kill 2>/dev/null || true
sleep 0.3

echo "Servo su $URL  (Ctrl+C per fermare)"
echo "Le modifiche si vedono con un semplice refresh della pagina."
(sleep 2; open -a "Google Chrome" "$URL" 2>/dev/null || open "$URL") &

# Vite dev server: watch dei file + hot reload. Tutto locale, nessun dato in rete.
exec npm run dev -- --port "$PORT" --strictPort --host 127.0.0.1
