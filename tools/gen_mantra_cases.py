#!/usr/bin/env python3
"""Casi di riferimento da fantatool/mantra.py per mantra.test.ts."""
from __future__ import annotations

import json
import sys
from pathlib import Path

RADICE = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(RADICE))

import fantatool.mantra as M  # noqa: E402


def slim_esito(e):
    return {
        "modulo": e["modulo"],
        "coperti": e["coperti"],
        "completo": e["completo"],
        "mancanti": e["mancanti"],
        "punteggio": e["punteggio"],
        "slot_chiave": [
            [a["slot"], a["giocatore"]["chiave"] if a["giocatore"] else None]
            for a in e["assegnazioni"]
        ],
        "panchina": [p["chiave"] for p in e["panchina"]],
    }


# Rosa Mantra realistica (chiave, ruoli, punteggio).
ROSA = [
    {"chiave": "por1", "ruoli": "Por", "punteggio": 70},
    {"chiave": "por2", "ruoli": "Por", "punteggio": 45},
    {"chiave": "dc1", "ruoli": "Dc", "punteggio": 68},
    {"chiave": "dc2", "ruoli": "Dc;B", "punteggio": 60},
    {"chiave": "dc3", "ruoli": "Dc", "punteggio": 52},
    {"chiave": "dd1", "ruoli": "Dd;E", "punteggio": 64},
    {"chiave": "ds1", "ruoli": "Ds", "punteggio": 58},
    {"chiave": "e1", "ruoli": "E", "punteggio": 62},
    {"chiave": "e2", "ruoli": "E;W", "punteggio": 55},
    {"chiave": "m1", "ruoli": "M", "punteggio": 66},
    {"chiave": "m2", "ruoli": "M;C", "punteggio": 61},
    {"chiave": "c1", "ruoli": "C", "punteggio": 59},
    {"chiave": "c2", "ruoli": "C;T", "punteggio": 57},
    {"chiave": "w1", "ruoli": "W;A", "punteggio": 72},
    {"chiave": "t1", "ruoli": "T", "punteggio": 63},
    {"chiave": "a1", "ruoli": "A;Pc", "punteggio": 80},
    {"chiave": "a2", "ruoli": "A", "punteggio": 67},
    {"chiave": "pc1", "ruoli": "Pc", "punteggio": 54},
    {"chiave": "x1", "ruoli": "Dc", "punteggio": 30},
    {"chiave": "x2", "ruoli": "E", "punteggio": 28},
]

MODULI = list(M.MODULI_MANTRA)

out = {}

# assegna_giocatori_modulo su tutti i moduli, con rosa piena e ridotta
out["assegna"] = []
for rosa_nome, rosa in [("piena", ROSA), ("ridotta", ROSA[:13])]:
    for modulo in MODULI:
        out["assegna"].append({
            "rosa": rosa_nome, "modulo": modulo,
            "atteso": slim_esito(M.assegna_giocatori_modulo(rosa, modulo)),
        })

out["rosa"] = [
    {"n": n, "atteso": {
        "portieri": r["portieri"], "rosa_minima_ok": r["rosa_minima_ok"],
        "giocatori_mancanti": r["giocatori_mancanti"], "portieri_mancanti": r["portieri_mancanti"],
        "moduli_completi": r["moduli_completi"], "migliore": r["migliore"]["modulo"],
        "coperti_migliore": r["migliore"]["coperti"],
        "moduli": [[v["modulo"], v["coperti"], v["completo"]] for v in r["moduli"]],
    }}
    for n, rr in [("piena", ROSA), ("ridotta", ROSA[:13]), ("mini", ROSA[:8])]
    for r in [M.analizza_rosa_mantra(rr)]
]

out["fragilita"] = []
for modulo in ("3-4-1-2", "4-3-3", "3-5-2"):
    f = M.analizza_fragilita_modulo(ROSA[:13], modulo)
    out["fragilita"].append({
        "modulo": modulo, "atteso": {
            "livello": f["livello"], "numero_critici": f["numero_critici"],
            "critici": [[c["chiave"], c["coperti_senza"], c["mancanti_senza"]] for c in f["critici"]],
        },
    })

out["catene"] = []
for modulo in ("3-4-1-2", "4-4-2"):
    c = M.calcola_catene_sostituzione_mantra(ROSA[:13], modulo)
    out["catene"].append({
        "modulo": modulo, "atteso": [
            {
                "slot": item["slot"],
                "titolare": item["titolare"]["chiave"],
                "entranti": [e["chiave"] for e in item["entranti"]],
                "spostamenti": [[s["giocatore"]["chiave"], s["da"], s["a"]] for s in item["spostamenti"]],
                "coperti_dopo": item["coperti_dopo"],
                "resta_completo": item["resta_completo"],
                "alternativa": item["alternativa"]["modulo"] if item["alternativa"] else None,
            }
            for item in c["catene"]
        ],
    })

out["candidato"] = []
for ruoli_cand in ("A", "Dc", "T;W", "Por"):
    cand = {"chiave": "cand", "ruoli": ruoli_cand, "punteggio": 50}
    r = M.valuta_candidato_su_moduli(ROSA[:12], cand, ["3-4-1-2", "4-3-3", "3-5-2"])
    out["candidato"].append({
        "ruoli": ruoli_cand,
        "atteso": {"delta_copertura": r["delta_copertura"], "moduli_completati": r["moduli_completati"]},
    })

out["priorita"] = []
for moduli_t in [["3-4-1-2"], ["3-4-1-2", "4-3-3"], []]:
    r = M.priorita_ruoli_mantra(ROSA[:14], moduli_t)
    out["priorita"].append({
        "moduli": moduli_t,
        "atteso": [[it["ruolo"], it["punteggio"], it["delta_copertura"],
                    it["slot_mancanti_compatibili"], it["fragilita_ridotta"]] for it in r],
    })

liberi = [
    {"ruoli": "Dc", "titolarita": 80}, {"ruoli": "Dc;B", "titolarita": 40},
    {"ruoli": "E;W", "titolarita": 70}, {"ruoli": "M;C", "titolarita": 90},
    {"ruoli": "A", "titolarita": 65}, {"ruoli": "A;Pc", "titolarita": 30},
    {"ruoli": "Por", "titolarita": 75}, {"ruoli": "T", "titolarita": 55},
]
out["scarsita"] = {
    "liberi": liberi,
    "atteso": M.calcola_scarsita_ruoli_mantra(liberi, num_squadre=8, soglia_titolarita=60),
}

out["incompatibili"] = []
for moduli_t in [["3-4-1-2"], ["4-3-3", "3-5-2"], []]:
    ruoli_test = ["Dc", "A", "Por", "Pc", "Dd", "T", "B"]
    out["incompatibili"].append({
        "moduli": moduli_t, "ruoli": ruoli_test,
        "atteso": M.conta_incompatibili_moduli(ruoli_test, moduli_t),
    })

out["impatto"] = []
for cand in ("A", "Dc", "W;T"):
    r = M.impatto_candidato_mantra([g["ruoli"] for g in ROSA[:12]], cand)
    out["impatto"].append({
        "candidato": cand,
        "atteso": {"delta_copertura": r["delta_copertura"],
                   "nuovi_moduli_completi": r["nuovi_moduli_completi"],
                   "migliore_dopo": r["migliore_dopo"]["modulo"]},
    })

# matrice domanda mantra
rose_ruoli = {
    "Io": [g["ruoli"] for g in ROSA[:10]],
    "R1": [g["ruoli"] for g in ROSA[:15]],
    "R2": [g["ruoli"] for g in ROSA],  # 20 < 25 -> aperta
    "R3": [g["ruoli"] for g in ROSA] + ["Dc"] * 5,  # 25 -> chiusa
}
md = M.calcola_matrice_domanda_mantra(rose_ruoli, rosa_totale=25, mia_squadra="Io")
out["matriceDomanda"] = {
    "roseRuoli": rose_ruoli,
    "atteso": [
        {"ruolo": r["ruolo"], "squadre_interessate": r["squadre_interessate"],
         "domanda_equivalente": r["domanda_equivalente"],
         "stati": {s: c["stato"] for s, c in r["squadre"].items()}}
        for r in md
    ],
}

# analizza_piano_rosa_mantra
apr = M.analizza_piano_rosa_mantra([g["ruoli"] for g in ROSA[:15]])
out["pianoRosa"] = {
    "ruoli": [g["ruoli"] for g in ROSA[:15]],
    "atteso": {
        "somma_obiettivi": apr["somma_obiettivi"], "altri": apr["altri"],
        "modulo_principale": apr["modulo_principale"],
        "profili": {k: {"presenti": v["presenti"], "mancanti": v["mancanti"], "eccesso": v["eccesso"]}
                    for k, v in apr["profili"].items()},
        "copertura_coperti": apr["copertura_modulo"]["coperti"],
    },
}

dest = RADICE / "app" / "src" / "lib" / "engine" / "__reference__" / "mantra_cases.json"
dest.write_text(json.dumps(out, ensure_ascii=False, indent=1), encoding="utf-8")
tot = sum(len(v) for v in out.values() if isinstance(v, list))
print(f"OK {dest.relative_to(RADICE)}: {tot} casi in liste + oggetti")
