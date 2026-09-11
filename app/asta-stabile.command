#!/bin/zsh
# Giorno dell'asta: avvia esclusivamente la build già preparata.
set -eu
cd "$(dirname "$0")"

if ! command -v node >/dev/null 2>&1; then
	print -u2 "Node.js non trovato. Installalo prima dell'asta."
	exit 1
fi
if [[ ! -f build/index.html ]]; then
	print -u2 "Build pronta non trovata. Esegui prima app/aggiorna-asta.command."
	exit 1
fi

# Il server rifiuta una porta occupata senza arrestare altri processi.
URL="http://localhost:8770"
if curl --silent --fail --max-time 1 "$URL" >/dev/null 2>&1; then
	open -a "Brave Browser" "$URL"
	exit 0
fi

exec node serve.mjs 8770 --open --brave
