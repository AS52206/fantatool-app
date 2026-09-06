#!/bin/zsh
# Avvia Fantatool (Mac). Doppio click da Finder.
#
# Modalità PRODUZIONE: compila l'app in file statici e li serve con un server
# minimale (nessun dev server, nessun watcher, nessun compilatore a runtime).
# È il runtime pensato per l'asta: molto più stabile.
# Dopo aver cambiato il codice, rilancia questo comando: ricompila da solo.
set -e
cd "$(dirname "$0")"

PORT=8770
URL="http://localhost:$PORT"

command -v node >/dev/null 2>&1 || {
	osascript -e 'display alert "Node non trovato" message "Installa Node: brew install node" as critical'
	exit 1
}

# Rigenera i bundle dati dai file Excel (listone / fantacrediti) a ogni avvio.
# NB: sostituire un file in data/ NON basta: il tool legge i bundle JSON,
# che vengono ricreati QUI. Dopo aver cambiato un file, rilancia questo comando.
if command -v python3 >/dev/null 2>&1; then
	echo "Aggiorno i dati…"
	for mod in classic mantra; do
		for n in 8 10; do
			python3 ../tools/export_json.py --modalita $mod --partecipanti $n 2>&1 | grep -E "giocatori|⚠|mancante" || true
		done
	done
	python3 ../tools/sync_assets.py >/dev/null 2>&1 || true
	echo ""
fi

# Dipendenze solo alla prima esecuzione (o dopo un aggiornamento).
if [[ ! -d node_modules ]] || [[ package.json -nt node_modules ]]; then
	echo "Preparo le dipendenze…"
	npm install --silent
fi

# Ricompila solo se serve: build mancante, oppure codice/dati più recenti.
serve_da_compilare=0
if [[ ! -f build/index.html ]]; then
	serve_da_compilare=1
else
	if [[ -n "$(find src static package.json svelte.config.js vite.config.js -newer build/index.html 2>/dev/null | head -1)" ]]; then
		serve_da_compilare=1
	fi
fi
if [[ $serve_da_compilare -eq 1 ]]; then
	echo "Compilo l'app…"
	npm run build
	echo ""
fi

# Libera la porta da un'eventuale istanza precedente.
lsof -tiTCP:"$PORT" -sTCP:LISTEN 2>/dev/null | xargs kill 2>/dev/null || true
sleep 0.3

echo "Servo su $URL  (Ctrl+C per fermare)"
(sleep 1.5; open -a "Brave Browser" "$URL" 2>/dev/null || open -a "Google Chrome" "$URL" 2>/dev/null || open "$URL") &

# Server statico: solo file su disco, nessun processo di build attivo.
exec node serve.mjs "$PORT"
