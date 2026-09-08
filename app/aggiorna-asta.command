#!/bin/zsh
# Preparazione esplicita da completare prima dell'asta, con errori visibili.
set -eu
cd "$(dirname "$0")"

for requisito in node npm python3 lsof; do
	if ! command -v "$requisito" >/dev/null 2>&1; then
		print -u2 "Requisito mancante: $requisito. Preparazione interrotta."
		exit 1
	fi
done
if lsof -tiTCP:8770 -sTCP:LISTEN >/dev/null 2>&1; then
	print -u2 "Porta 8770 in uso. Chiudi il server dell'asta prima di aggiornare. Nessun processo è stato arrestato."
	exit 1
fi

print "Rigenero i dati e le immagini…"
for modalita in classic mantra; do
	for partecipanti in 8 10; do
		python3 ../tools/export_json.py --modalita "$modalita" --partecipanti "$partecipanti"
	done
done
python3 ../tools/sync_assets.py

print "Preparo le dipendenze e verifico l'app…"
npm ci
npm run check
npm test
npm run build
[[ -f build/index.html ]] || { print -u2 "Build incompleta: index.html mancante."; exit 1; }
print "Preparazione completata. Avvia app/asta-stabile.command per aprire l'asta."
