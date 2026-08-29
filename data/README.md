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
        └── fantacrediti/
            └── 8-partecipanti.xlsx
```

- `listone.xlsx` è la sorgente attiva dell'annata e della modalità.
- `originali/` conserva il download originale con il suo nome.
- `fantacrediti/` separa le metriche per numero di partecipanti.
- `statistiche.xlsx` sotto la stagione precedente alimenta i confronti storici.

I vecchi nomi (`dati.xlsx`, `Fantacrediti - 8.xlsx`, ecc.) restano supportati
dal resolver in `fantatool/paths.py`: non creare copie duplicate nella radice
di `data/`.
