# Sorgenti dati FantaLive

I file sono separati per **stagione** e **modalità d'asta**.

```text
data/
├── 2025-2026/
│   └── classic/
│       └── statistiche.xlsx
└── 2026-2027/
    ├── classic/
    │   ├── listone.xlsx
    │   ├── originali/
    │   │   └── dati_2026_2027.xlsx
    │   └── fantacrediti/
    │       ├── 8-partecipanti.xlsx
    │       └── 10-partecipanti.xlsx
    └── mantra/
        ├── listone.xlsx
        ├── fantacrediti/
        │   └── 8-partecipanti.xlsx
        └── fantalab/
            └── 8-partecipanti.xlsx      # listone Mantra FantaLab con "PMA a 8"
```

- `listone.xlsx` è la sorgente attiva dell'annata e della modalità.
- `originali/` conserva il download originale con il suo nome.
- `fantacrediti/` separa le metriche per numero di partecipanti.
- `mantra/fantalab/<N>-partecipanti.xlsx` (opzionale): listone Mantra di FantaLab
  con le colonne `Ruoli Mantra` e `PMA a <N> (crediti su 500)`. Se presente ha la
  **priorità** in modalità Mantra: il prezzo consigliato è ancorato alla colonna
  crediti (budget 500) e i ruoli Mantra vengono da `Ruoli Mantra`. Nient'altro
  (quotazione, ruolo classic, presenze) viene importato da quel file. I giocatori
  con cella PMA vuota ripiegano sul PMA Fantacrediti.
- `statistiche.xlsx` sotto la stagione precedente alimenta i confronti storici.

I vecchi nomi (`dati.xlsx`, `Fantacrediti - 8.xlsx`, ecc.) restano supportati
dal resolver in `fantatool/paths.py`: non creare copie duplicate nella radice
di `data/`.
