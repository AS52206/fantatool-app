# Fantatool — App Asta

Strumento d'asta per il fantacalcio (Classic e Mantra), riscritto da Streamlit
a una **web-app locale**: tutto lo stato vive nel browser e viene salvato a ogni
azione. Il recupero dipende dal salvataggio riuscito e dallo stesso browser/profilo.

## Avvio rapido (Mac)

Prima dell'asta esegui **`app/aggiorna-asta.command`**: rigenera dati e immagini,
installa le dipendenze dal lockfile, esegue controlli e test e prepara la build.
Richiede Node.js/npm e Python 3 con `pandas` e `openpyxl`; gli errori interrompono
la preparazione e restano visibili. Chiudi prima il server locale.

Il giorno dell'asta apri **`Fantatool.app`** sul Desktop (se collegata al launcher)
o **`app/asta-stabile.command`**. Avvia solo la build già pronta su
`http://localhost:8770`: nessuna conversione, installazione o compilazione.
Se manca la build o la porta è occupata, si ferma con un messaggio; non arresta
altri processi. Il browser si apre solo quando il server è pronto.
Usa sempre lo stesso browser/profilo e indirizzo per ritrovare il salvataggio locale.

## Sviluppo

```bash
cd app
npm install
npm run dev        # http://localhost:5173 (sviluppo, con hot reload)
npm test           # 204 test di parità col motore Python originale
npm run build      # build statica in app/build/
npm run serve      # serve app/build/ su http://localhost:8770
```

## Struttura

```
app/                 web-app SvelteKit (SPA statica, local-first)
  src/lib/engine/    motore portato in TypeScript + test di parità
  src/lib/stores/    stato asta + autosave
  src/routes/        interfaccia
  static/data/       bundle giocatori generati (JSON)
  asta-stabile.command  launcher Mac della build già pronta
  aggiorna-asta.command preparazione dati, controlli e build prima dell’asta
  serve.mjs             server statico Node (anche npm run serve)
tools/               script Python: conversione dati + generazione casi di test
data/<stagione>/     file sorgente (listone .xlsx, fantacrediti .xlsx, fantalab .json)
```

## Aggiornare i dati

Metti i nuovi file in `data/2026-2027/{classic,mantra}/` e rigenera i bundle:

```bash
python3 tools/export_json.py --modalita classic --partecipanti 8
python3 tools/export_json.py --modalita mantra  --partecipanti 8
```

(richiede `python3` con `pandas` e `openpyxl`)

## Stato del porting

Vedi `app/README.md`. In sintesi: motore prezzo, decision support completo,
scarsità di mercato, endgame (Classic + Mantra), tutto `mantra.py`, ed export
Excel a 3 fogli sono portati e verificati con **204 test di parità** contro il
codice Python originale.
