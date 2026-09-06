# Fantatool — App Asta

Strumento d'asta per il fantacalcio (Classic e Mantra), riscritto da Streamlit
a una **web-app locale**: tutto lo stato vive nel browser e viene salvato a ogni
azione, quindi un crash o un refresh riaprono l'asta esattamente dov'era.

## Avvio rapido (Mac)

Doppio click su **`app/avvia.command`**.
Rigenera i dati, compila l'app se serve, la serve **come file statici** su
`http://localhost:8770` e apre il browser. Nessun server di sviluppo, nessun
watcher, nessun websocket: il runtime dell'asta è solo file su disco.

Da Chrome/Brave puoi fare **"Installa app"** una volta: Fantatool finisce nel
dock con finestra propria e funziona offline (service worker + manifest).

La prima volta serve **Node.js**:

```bash
brew install node
```

## Sviluppo

```bash
cd app
npm install
npm run dev        # http://localhost:5173 (sviluppo, con hot reload)
npm test           # 204 test di parità col motore Python originale
npm run build      # build statica in app/build/
npm run serve      # serve app/build/ su http://localhost:8770 (come avvia.command)
```

## Struttura

```
app/                 web-app SvelteKit (SPA statica, local-first)
  src/lib/engine/    motore portato in TypeScript + test di parità
  src/lib/stores/    stato asta + autosave
  src/routes/        interfaccia
  static/data/       bundle giocatori generati (JSON)
  avvia.command      launcher Mac
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
