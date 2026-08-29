#!/usr/bin/env python3
"""Casi di riferimento da fantatool/endgame.py (ramo CLASSIC) per endgame.test.ts."""
from __future__ import annotations

import json
import sys
from pathlib import Path

RADICE = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(RADICE))

from fantatool.endgame import ottimizza_finale_asta  # noqa: E402

# Pool di candidati liberi (prezzi teorici già pronti, come li passa l'app).
CAND = [
    {"chiave": "p1", "nome": "Port Uno", "ruolo": "P", "prezzo": 12, "punteggio": 62},
    {"chiave": "p2", "nome": "Port Due", "ruolo": "P", "prezzo": 5, "punteggio": 48},
    {"chiave": "p3", "nome": "Port Tre", "ruolo": "P", "prezzo": 1, "punteggio": 30},
    {"chiave": "d1", "nome": "Dif Uno", "ruolo": "D", "prezzo": 20, "punteggio": 70},
    {"chiave": "d2", "nome": "Dif Due", "ruolo": "D", "prezzo": 9, "punteggio": 58},
    {"chiave": "d3", "nome": "Dif Tre", "ruolo": "D", "prezzo": 4, "punteggio": 44},
    {"chiave": "d4", "nome": "Dif Quattro", "ruolo": "D", "prezzo": 2, "punteggio": 33},
    {"chiave": "d5", "nome": "Dif Cinque", "ruolo": "D", "prezzo": 1, "punteggio": 20},
    {"chiave": "c1", "nome": "Cen Uno", "ruolo": "C", "prezzo": 30, "punteggio": 78},
    {"chiave": "c2", "nome": "Cen Due", "ruolo": "C", "prezzo": 14, "punteggio": 63},
    {"chiave": "c3", "nome": "Cen Tre", "ruolo": "C", "prezzo": 6, "punteggio": 50},
    {"chiave": "c4", "nome": "Cen Quattro", "ruolo": "C", "prezzo": 2, "punteggio": 35},
    {"chiave": "a1", "nome": "Att Uno", "ruolo": "A", "prezzo": 45, "punteggio": 85},
    {"chiave": "a2", "nome": "Att Due", "ruolo": "A", "prezzo": 22, "punteggio": 68},
    {"chiave": "a3", "nome": "Att Tre", "ruolo": "A", "prezzo": 8, "punteggio": 52},
    {"chiave": "a4", "nome": "Att Quattro", "ruolo": "A", "prezzo": 3, "punteggio": 38},
]

LIMITI = {"P": 3, "D": 8, "C": 8, "A": 6}

casi = []
scenari = [
    # (nome, budget, slot_vuoti, conteggi_ruolo, soglia)
    ("2P+2D+1C+1A, budget largo", 120, 6, {"P": 1, "D": 6, "C": 7, "A": 5}, 10),
    ("stretto sul budget", 20, 6, {"P": 1, "D": 6, "C": 7, "A": 5}, 10),
    ("solo attaccanti", 60, 2, {"P": 3, "D": 8, "C": 8, "A": 4}, 10),
    ("un solo slot D", 15, 1, {"P": 3, "D": 7, "C": 8, "A": 6}, 10),
    ("rosa completa", 30, 0, {"P": 3, "D": 8, "C": 8, "A": 6}, 10),
    ("troppo presto", 100, 15, {"P": 0, "D": 0, "C": 0, "A": 0}, 10),
    ("budget impossibile", 3, 6, {"P": 1, "D": 6, "C": 7, "A": 5}, 10),
    ("incoerente slot/limiti", 50, 3, {"P": 1, "D": 6, "C": 7, "A": 5}, 10),
    ("nessun percorso (budget al minimo)", 6, 6, {"P": 1, "D": 6, "C": 7, "A": 5}, 10),
]
for nome, budget, vuoti, conteggi, soglia in scenari:
    res = ottimizza_finale_asta(
        CAND,
        budget_residuo=budget,
        slot_vuoti=vuoti,
        modalita="CLASSIC",
        conteggi_ruolo=conteggi,
        limiti_ruolo=LIMITI,
        soglia_attivazione=soglia,
    )
    casi.append({
        "nome": nome,
        "input": {"budgetResiduo": budget, "slotVuoti": vuoti, "conteggiRuolo": conteggi,
                  "limitiRuolo": LIMITI, "sogliaAttivazione": soglia},
        "atteso": res,
    })

# --- ramo MANTRA ---
ROSA_MANTRA = [
    {"chiave": f"r{i}", "ruoli": r, "punteggio": 55}
    for i, r in enumerate([
        "Por", "Dc", "Dc", "Dc;B", "Ds", "E", "M", "M;C", "W;A", "A;Pc",
    ])
]  # 10 titolari quasi pronti per 3-4-1-2
CAND_MANTRA = [
    {"chiave": "cm1", "nome": "Cand T", "ruoli_mantra": "T", "prezzo": 12, "punteggio": 60},
    {"chiave": "cm2", "nome": "Cand A", "ruoli_mantra": "A;Pc", "prezzo": 20, "punteggio": 70},
    {"chiave": "cm3", "nome": "Cand Por", "ruoli_mantra": "Por", "prezzo": 3, "punteggio": 40},
    {"chiave": "cm4", "nome": "Cand E", "ruoli_mantra": "E;W", "prezzo": 8, "punteggio": 52},
    {"chiave": "cm5", "nome": "Cand C", "ruoli_mantra": "C;M", "prezzo": 6, "punteggio": 48},
    {"chiave": "cm6", "nome": "Cand Dc", "ruoli_mantra": "Dc", "prezzo": 5, "punteggio": 44},
    {"chiave": "cm7", "nome": "Cand T2", "ruoli_mantra": "T;W", "prezzo": 2, "punteggio": 35},
]
casi_mantra = []
for nome, budget, vuoti, moduli in [
    ("chiude 3-4-1-2", 60, 5, ["3-4-1-2"]),
    ("due moduli target", 60, 5, ["3-4-1-2", "4-3-3"]),
    ("budget stretto", 15, 5, ["3-4-1-2"]),
]:
    res = ottimizza_finale_asta(
        CAND_MANTRA, budget_residuo=budget, slot_vuoti=vuoti, modalita="MANTRA",
        rosa_mantra=ROSA_MANTRA, moduli_target=moduli, min_portieri_mantra=2,
    )
    casi_mantra.append({
        "nome": nome,
        "input": {"budgetResiduo": budget, "slotVuoti": vuoti, "moduliTarget": moduli},
        "atteso": {
            "stato": res["stato"], "attivo": res["attivo"],
            "percorsi": [
                {"profilo": p["profilo"], "modulo": p["modulo"], "costo": p["costo"],
                 "copertura": p["copertura"], "modulo_completo": p["modulo_completo"],
                 "chiavi": [g["chiave"] for g in p["giocatori"]]}
                for p in res["percorsi"]
            ],
        },
    })

dest = RADICE / "app" / "src" / "lib" / "engine" / "__reference__" / "endgame_cases.json"
dest.write_text(json.dumps({
    "candidati": CAND, "casi": casi,
    "mantra": {"rosa": ROSA_MANTRA, "candidati": CAND_MANTRA, "casi": casi_mantra},
}, ensure_ascii=False, indent=1), encoding="utf-8")
print(f"OK {dest.relative_to(RADICE)}: {len(casi)} classic + {len(casi_mantra)} mantra")
