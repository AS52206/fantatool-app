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


## Protezioni e verifica dell’asta live

- Una sola scheda può scrivere: le altre sono di sola lettura. Dopo aver chiuso la scheda attiva, usa **Attiva asta qui** nell’altra.
- Il backup su file registra ogni modifica in sequenza; va attivato nuovamente dopo una riapertura. L’indicatore **Browser** e quello **File** descrivono due salvataggi distinti.
- Durante un’asta avviata, le impostazioni sono protette. Una rinomina conserva gli identificativi delle squadre e i collegamenti agli acquisti.
- Un backup non valido viene respinto prima del ripristino. Un salvataggio locale non leggibile viene conservato e richiede il ripristino da un backup valido.
- Il calcolo dei percorsi finali usa un worker: mentre lavora viene mostrata l’attesa. In caso di errore il resto dell’asta resta utilizzabile; non vengono mostrati percorsi vecchi come se fossero aggiornati.

Verifiche ripetibili dalla cartella principale del progetto, con un server di prova sulla porta 8771:

```sh
node tools/browser-recovery.mjs
node tools/browser-recovery.mjs --mantra
node tools/run-soak.mjs
```

L’ultimo comando avvia otto ore reali in background su una copia della build, porta 8791 e profilo browser isolato. Non usa i dati dell’asta reale. Il rapporto è in `artifacts/soak-mantra-8h.json`, il processo in `artifacts/soak-process.json`. Evita lo stop automatico del Mac per la sola durata del test; una sospensione lunga invalida la continuità. Non avviare due prove prolungate contemporaneamente.

Il test Mantra parte da 8 squadre, 165 acquisti complessivi e 25 nella propria rosa, e ripete ricerca, assegnazione e annullamento. Registra memoria e tempi di risposta. Il selettore file è simulato nel test automatico, ma il contenuto del backup viene scritto e verificato su disco. La prova non copre ogni possibile combinazione di dati o guasto hardware.


## Uso della vista live

Il Draft apre la vista **Asta live**: ricerca e offerta a sinistra, squadre e ultimi acquisti a destra. **Apri vista completa** ripristina i dettagli; **Apri analisi tattiche e chiusura** mostra moduli, campo e percorsi senza lasciare il Draft.

La scheda del giocatore distingue il valore stimato, il limite strategico per la propria squadra e il massimo da budget per la squadra destinataria. Il limite strategico è un consiglio: non blocca un’offerta legale. La fonte della stima è esplicita; la percentuale Fantalab mantiene la priorità prevista dal motore esistente, senza mescolarla silenziosamente a PMA/PFC.

Il pulsante **✎** accanto agli acquisti apre la correzione di squadra e prezzo, con riepilogo prima/dopo. È disponibile anche nella vista Rose per giocatore. La correzione conserva ordine e identità dell’acquisto, aggiorna budget e backup e si annulla con **Annulla**.

Le nuove assegnazioni e correzioni rispettano prezzo intero positivo, giocatore unico, capacità della rosa e riserva di un credito per posto residuo. In Classic valgono i limiti per reparto; in Mantra valgono portieri e movimento, senza applicare artificialmente i limiti Classic ai polivalenti. I vecchi acquisti importati non vengono modificati automaticamente.
