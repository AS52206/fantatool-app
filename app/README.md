# Fantatool — App asta (Svelte SPA local-first)

Riscrittura del tool d'asta per eliminare i crash di Streamlit durante l'asta live.
Stato in `localStorage` con autosave a ogni azione. Il recupero richiede un salvataggio riuscito e lo stesso browser/profilo e indirizzo; conserva anche un backup esterno.

## Sviluppo
```
cd app
npm install
npm run dev
```

## Dati
Il bundle giocatori si genera dai file .xlsx/.json del progetto:
```
python3 tools/export_json.py --stagione 2026-2027 --modalita classic --partecipanti 8
```
Output: `app/static/data/<stagione>/<modalita>-<partecipanti>.json`

## Test di parità col motore Python
```
python3 tools/gen_reference_cases.py   # rigenera i casi di riferimento dal motore originale
cd app && npm run test
```

## Build (app statica)
```
cd app && npm run build   # -> app/build/ , servibile da qualunque static server
```

## Avvio rapido (Mac)
Prima dell'asta: doppio click su `app/aggiorna-asta.command`. Rigenera i quattro
bundle e le immagini, esegue `npm ci`, controlli, test e build. Richiede Node.js/npm
e Python 3 con pandas/openpyxl. Ogni errore interrompe la preparazione ed è visibile.
Chiudi il server dell'asta prima di aggiornare: la preparazione rifiuta la porta 8770 occupata.

Durante l'asta: doppio click su `app/asta-stabile.command` (o sul collegamento
Desktop già configurato). Serve esclusivamente `app/build/` su `http://localhost:8770`.
Non aggiorna dati, installa dipendenze o compila. Build mancante e porta occupata
producono un errore chiaro, senza terminare processi esistenti. Il browser predefinito
si apre solo dopo l'avvio riuscito; usa sempre il browser/profilo della tua asta.

## Stato del porting
- [x] Motore prezzo (`calcola_prezzo_consigliato_avanzato`, inflazione ruolo/globale, flag) — 55 test di parità
- [x] Decision support completo (`decision.ts`): `calcola_fascia_operativa` (il prezzo mostrato),
      `classifica_fase_asta`, `profila_rivali`, `valuta_decisione_immediata`, `calcola_allarmi_chiusura_asta`,
      `calcola_poteri_acquisto`, `calcola_incidenze_budget`, `confronta_candidati/scenari`,
      `analizza_piano_dinamico`, `valuta_affidabilita_giocatore` — 56 test di parità
- [x] Scarsità di mercato (`calcola_scarsita_mercato`, `calcola_domanda_slot_rivali`) — 8 test
- [x] Endgame (`endgame.ts`): beam search percorsi di chiusura rosa, rami CLASSIC **e MANTRA** — 12 test
- [x] Mantra (`mantra.ts`): matching moduli, fragilità, catene sostituzione, priorità ruoli,
      matrice domanda — 46 test
- [x] `round()` half-to-even di Python (`pyround.ts`) per la parità numerica
- [x] Store asta + autosave + undo + export/import JSON + bilanci arricchiti (poteri, slot, spesi per ruolo)
- [x] UI asta CLASSIC **e MANTRA**: ricerca, prezzo consigliato con fonte/fascia/scarsità,
      decisione COMPRA/VALUTA/LASCIA live, profili rivali, allarmi di chiusura, percorsi di chiusura,
      impatto Mantra sui moduli target, copertura Mantra, pannello fragilità
- [x] Export: rose CSV + **Tabellone Excel** a 3 fogli (`export_xlsx.ts`, exceljs) —
      Riepilogo grafico + Registro_Asta + Controlli con formule SUMIF/COUNTIFS, port di `export_excel.py`
- **181 test di parità / struttura** col codice Python originale (`cd app && npm test`)

### Da fare
- [ ] Loghi/stemmi squadra nel foglio Riepilogo (openpyxl li incorpora; qui saltati)
- [ ] `_punteggio_affidabilita_ai` — ora il "punteggio" endgame/Mantra usa FVM / FM attesa come proxy
- [ ] Storico stagione precedente (fm_old/pg_old) — a 0 finché non c'è un file `dati_vecchi`
- [ ] campi `fase` / `fonte` per acquisto nel Registro Excel (ora vuoti: non salvati al momento dell'assegnazione)
- [ ] Pannello "catene di sostituzione" — logica in `mantra.ts` (`calcolaCateneSostituzioneMantra`,
      testata), manca solo la vista

## Rigenerare i casi di parità
```
python3 tools/gen_reference_cases.py    # motore prezzo + scarsità
python3 tools/gen_decision_cases.py     # decision support
python3 tools/gen_endgame_cases.py      # endgame (classic + mantra)
python3 tools/gen_mantra_cases.py       # mantra
cd app && npm test
```
