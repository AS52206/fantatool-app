#!/usr/bin/env python3
"""
Genera casi di riferimento dal motore Python originale per validare il porting TS.
Output: app/src/lib/engine/__reference__/pricing_cases.json
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

RADICE = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(RADICE))

import pandas as pd  # noqa: E402

from fantatool.engine import (  # noqa: E402
    calcola_prezzo_consigliato_avanzato,
    calcola_inflazione_per_ruolo,
    deduci_flag_da_fantacrediti,
    arrotonda_credito_scenario,
    normalizza_nome,
    calcola_scarsita_mercato,
    calcola_domanda_slot_rivali,
    MOLTIPLICATORE_DIFESA_DEFAULT,
)

LIMITI = {"P": 3, "D": 8, "C": 8, "A": 6, "TOT": 25}
ALLENATORI = ["Io", "Rivale1", "Rivale2", "Rivale3", "Rivale4", "Rivale5", "Rivale6", "Rivale7"]


def acquisto(ruolo, prezzo, squadra="Inter", prop="Rivale1", idc=0, nome=""):
    return {"ruolo": ruolo, "prezzo": prezzo, "squadra_seriea": squadra,
            "proprietario": prop, "id_clean": idc, "nome_puro": nome}


def bilancio(spesi_per_squadra):
    return {
        nome: {"c_rimasti": 500 - spesi_per_squadra.get(nome, 0),
               "g_presi": 0 if not spesi_per_squadra.get(nome) else 3}
        for nome in ALLENATORI
    }


CASI_PREZZO = []


def caso(nome, **kw):
    base = dict(
        ruolo="A", fm=7.0, pg=30, quotazione=30, budget_max=500,
        bilancio_global=None, giocatori_acquistati={}, flag_manuale="Normale",
        lista_allenatori=ALLENATORI, limiti_ruoli=LIMITI,
        fm_old=0.0, pg_old=0, squadra_seriea="", mia_squadra_scelta="",
        quote_ruolo=None, moltiplicatori_difesa=None,
    )
    base.update(kw)
    prezzo, etichetta = calcola_prezzo_consigliato_avanzato(**base)
    # serializza input come lista acquisti per il lato TS
    ga = base["giocatori_acquistati"]
    acquisti_ts = [
        {"ruolo": v["ruolo"], "prezzo": v["prezzo"],
         "squadraSerieA": v.get("squadra_seriea", ""), "proprietario": v.get("proprietario", ""),
         "giocatoreId": v.get("id_clean", 0)}
        for v in ga.values()
    ]
    bg = base["bilancio_global"]
    bg_ts = {k: {"c_rimasti": v["c_rimasti"], "g_presi": v["g_presi"]} for k, v in bg.items()} if bg else None
    CASI_PREZZO.append({
        "nome": nome,
        "input": {
            "ruolo": base["ruolo"], "fm": base["fm"], "pg": base["pg"],
            "quotazione": base["quotazione"], "budgetMax": base["budget_max"],
            "bilancioGlobal": bg_ts, "acquisti": acquisti_ts,
            "flagManuale": base["flag_manuale"], "listaAllenatori": base["lista_allenatori"],
            "limitiRuoli": base["limiti_ruoli"], "fmOld": base["fm_old"], "pgOld": base["pg_old"],
            "squadraSerieA": base["squadra_seriea"], "miaSquadraScelta": base["mia_squadra_scelta"],
            "quoteRuolo": base["quote_ruolo"], "moltiplicatoriDifesa": base["moltiplicatori_difesa"],
        },
        "atteso": {"prezzo": prezzo, "etichetta": etichetta},
    })


# --- scenari base per ruolo/fascia ---
caso("A top", ruolo="A", fm=8.2, pg=34, quotazione=40)
caso("A rotazione", ruolo="A", fm=6.4, pg=20, quotazione=12)
caso("A scommessa", ruolo="A", fm=5.5, pg=15, quotazione=5)
caso("C offensivo", ruolo="C", fm=7.1, pg=32, quotazione=25)
caso("C da voto", ruolo="C", fm=6.0, pg=28, quotazione=10)
caso("D top reparto", ruolo="D", fm=6.6, pg=33, quotazione=18)
caso("D modificatore", ruolo="D", fm=5.9, pg=30, quotazione=8)
caso("P titolare", ruolo="P", fm=5.6, pg=34, quotazione=16)
caso("P low cost", ruolo="P", fm=5.1, pg=20, quotazione=5)
caso("slot copertura", ruolo="C", fm=5.0, pg=25, quotazione=1)

# --- nuovi arrivi (pg < 5) ---
caso("nuovo arrivo A top", ruolo="A", fm=0, pg=0, quotazione=30)
caso("nuovo arrivo A rotazione", ruolo="A", fm=0, pg=0, quotazione=6)
caso("nuovo arrivo sconosciuto", ruolo="A", fm=0, pg=0, quotazione=2)
caso("rientro TOP storico", ruolo="C", fm=0, pg=2, quotazione=20, fm_old=6.8, pg_old=30)
caso("rientro affidabile storico", ruolo="C", fm=0, pg=2, quotazione=20, fm_old=6.2, pg_old=25)

# --- flag manuali ---
caso("A infortunato", ruolo="A", fm=7.5, pg=30, quotazione=30, flag_manuale="🔴 Infortunato/Dubbio")
caso("A rigorista", ruolo="A", fm=7.5, pg=30, quotazione=30, flag_manuale="🎯 Rigorista designato")
caso("A ballottaggio", ruolo="A", fm=7.5, pg=30, quotazione=30, flag_manuale="🟡 Ballottaggio")

# --- inflazione ruolo/globale ---
_ga = {f"k{i}": acquisto("A", 60 + i) for i in range(4)}
caso("A con inflazione ruolo alta", ruolo="A", fm=7.5, pg=30, quotazione=30, giocatori_acquistati=_ga)
_ga2 = {f"k{i}": acquisto("A", 8 + i) for i in range(4)}
caso("A con inflazione ruolo bassa", ruolo="A", fm=7.5, pg=30, quotazione=30, giocatori_acquistati=_ga2)
caso("A con inflazione globale", ruolo="A", fm=7.5, pg=30, quotazione=30,
     bilancio_global=bilancio({n: 120 for n in ALLENATORI[:6]}),
     giocatori_acquistati={f"k{i}": acquisto("A", 60) for i in range(3)})

# --- difesa + doppioni ---
caso("D difesa solida", ruolo="D", fm=6.6, pg=33, quotazione=18, squadra_seriea="Inter",
     moltiplicatori_difesa=MOLTIPLICATORE_DIFESA_DEFAULT)
caso("D difesa fragile", ruolo="D", fm=6.6, pg=33, quotazione=18, squadra_seriea="Monza",
     moltiplicatori_difesa=MOLTIPLICATORE_DIFESA_DEFAULT)
caso("A doppione singolo", ruolo="A", fm=7.5, pg=30, quotazione=30, squadra_seriea="Inter",
     mia_squadra_scelta="Io",
     giocatori_acquistati={"k0": acquisto("C", 20, "Inter", "Io")})
caso("A doppione multiplo", ruolo="A", fm=7.5, pg=30, quotazione=30, squadra_seriea="Inter",
     mia_squadra_scelta="Io",
     giocatori_acquistati={"k0": acquisto("C", 20, "Inter", "Io"), "k1": acquisto("D", 15, "Inter", "Io")})

# --- inflazione per ruolo isolata ---
CASI_INFLAZIONE_RUOLO = []
for nome, ga in [
    ("meno di 3", {f"k{i}": acquisto("A", 30) for i in range(2)}),
    ("3 medi", {f"k{i}": acquisto("A", 40) for i in range(3)}),
    ("5 costosi", {f"k{i}": acquisto("A", 70) for i in range(5)}),
    ("4 economici", {f"k{i}": acquisto("A", 5) for i in range(4)}),
]:
    val = calcola_inflazione_per_ruolo("A", ga, 500, ALLENATORI, LIMITI)
    CASI_INFLAZIONE_RUOLO.append({
        "nome": nome,
        "acquisti": [{"ruolo": v["ruolo"], "prezzo": v["prezzo"]} for v in ga.values()],
        "atteso": val,
    })

# --- deduci flag ---
CASI_FLAG = []
for nome, riga in [
    ("nessuna riga", None),
    ("infortunato", {"unavailableUntilRound": 3}),
    ("rigorista", {"penaltyProbability": 60, "expectedTitolarita": 80}),
    ("ballottaggio titolarita", {"expectedTitolarita": 40}),
    ("ballottaggio status B", {"playerStatus": "B", "expectedTitolarita": 70}),
    ("rigorista in ballottaggio", {"penaltyProbability": 55, "expectedTitolarita": 40}),
    ("riserva fascia", {"fasciaFc": "Riserva", "expectedTitolarita": 70}),
    ("normale", {"expectedTitolarita": 90, "penaltyProbability": 10}),
]:
    fc_ts = None
    if riga is not None:
        fc_ts = {
            "pma": 0, "pfc": 0, "slot": None,
            "expectedTitolarita": riga.get("expectedTitolarita", 0),
            "expectedFantamedia": 0,
            "penaltyProbability": riga.get("penaltyProbability", 0),
            "unavailableUntilRound": riga.get("unavailableUntilRound", 0),
            "playerStatus": riga.get("playerStatus", ""),
            "fasciaFc": riga.get("fasciaFc", ""),
            "newArrival": False,
        }
    CASI_FLAG.append({"nome": nome, "fc": fc_ts, "atteso": deduci_flag_da_fantacrediti(riga)})

# --- arrotonda credito ---
CASI_ARROTONDA = []
for v in [0, -3, 1, 1.0, 14.4 / 100 * 500, 72.00000000000001, 71.2, 0.3, "abc", None]:
    try:
        CASI_ARROTONDA.append({"valore": v if not isinstance(v, float) else round(v, 10),
                               "atteso": arrotonda_credito_scenario(v)})
    except Exception:
        pass

# --- normalizza nome ---
CASI_NOMI = [
    {"input": n, "atteso": normalizza_nome(n)}
    for n in ["Martinez L.", "O'Brien", "N'Golo Kanté", "  Doppio   Spazio ",
              "Peña", "D-Ambrosio", "José María", "Çalhanoğlu"]
]

# --- calcola_scarsita_mercato / calcola_domanda_slot_rivali ---
# df_liberi: colonna ruolo classico "R", + Id_Clean/Nome_Clean; df_fc indicizzato per nome con slot.
_liberi_rows = [
    {"R": "A", "Id_Clean": 1, "Nome_Clean": "Aa"},
    {"R": "A", "Id_Clean": 2, "Nome_Clean": "Bb"},
    {"R": "A", "Id_Clean": 3, "Nome_Clean": "Cc"},
    {"R": "A", "Id_Clean": 4, "Nome_Clean": "Dd"},
    {"R": "A", "Id_Clean": 5, "Nome_Clean": "Ee"},
    {"R": "D", "Id_Clean": 6, "Nome_Clean": "Ff"},
]
_df_liberi = pd.DataFrame(_liberi_rows)
_slot_liberi = {"aa": 1, "bb": 1, "cc": 2, "dd": 2, "ee": 3, "ff": 1}
_df_fc_scars = pd.DataFrame(
    [{"slot": s, "idFantacalcio": 0} for s in _slot_liberi.values()],
    index=list(_slot_liberi),
)
CASI_SCARSITA = []
_liberi_ts = [
    {"id": r["Id_Clean"], "ruolo": r["R"], "slot": _slot_liberi[r["Nome_Clean"].lower()]}
    for r in _liberi_rows
]
for nome_target, idt, ruolo_t, domanda in [
    ("Aa", 1, "A", 3), ("Cc", 3, "A", 2), ("Ee", 5, "A", 5), ("Ff", 6, "D", 1), ("Aa", 1, "A", 8),
]:
    res = calcola_scarsita_mercato(_df_liberi, ruolo_t, _df_fc_scars, "R", domanda,
                                   id_giocatore=idt, nome_clean=nome_target)
    res.pop("colore", None)
    CASI_SCARSITA.append({
        "idTarget": idt, "ruolo": ruolo_t, "slotTarget": res["slot"], "domandaSquadre": domanda,
        "atteso": res,
    })

# domanda slot rivali
_bilanci_dsr = {
    "Io": {"A": 1},
    "R1": {"A": 0},
    "R2": {"A": 6},  # completo -> escluso
    "R3": {"A": 2},
}
_acq_dsr = {
    "k0": {"proprietario": "R1", "ruolo": "A", "id_clean": 0, "nome_puro": "x1"},
    "k1": {"proprietario": "R3", "ruolo": "A", "id_clean": 0, "nome_puro": "x2"},
}
_slot_dsr = {"x1": 1, "x2": 4}
_df_fc_dsr = pd.DataFrame([{"slot": s, "idFantacalcio": 0} for s in _slot_dsr.values()], index=list(_slot_dsr))
_acq_dsr_ts = [{"proprietario": v["proprietario"], "ruolo": v["ruolo"], "slot": _slot_dsr[v["nome_puro"]]}
               for v in _acq_dsr.values()]
CASI_DOMANDA_SLOT = []
for slot_target in (None, 1, 3):
    val = calcola_domanda_slot_rivali(_bilanci_dsr, _acq_dsr, _df_fc_dsr, "A", slot_target,
                                      {"A": 6}, mia_squadra="Io")
    CASI_DOMANDA_SLOT.append({"slotTarget": slot_target, "atteso": val})


out = RADICE / "app" / "src" / "lib" / "engine" / "__reference__" / "cases.json"
out.parent.mkdir(parents=True, exist_ok=True)
out.write_text(json.dumps({
    "prezzo": CASI_PREZZO,
    "inflazioneRuolo": CASI_INFLAZIONE_RUOLO,
    "flag": CASI_FLAG,
    "arrotonda": CASI_ARROTONDA,
    "nomi": CASI_NOMI,
    "scarsita": {"liberi": _liberi_ts, "casi": CASI_SCARSITA},
    "domandaSlot": {"bilanci": _bilanci_dsr, "acquisti": _acq_dsr_ts, "limiti": {"A": 6}, "casi": CASI_DOMANDA_SLOT},
    "limiti": LIMITI,
    "allenatori": ALLENATORI,
}, ensure_ascii=False, indent=1), encoding="utf-8")
print(f"OK {out.relative_to(RADICE)}: {len(CASI_PREZZO)} casi prezzo, "
      f"{len(CASI_FLAG)} flag, {len(CASI_ARROTONDA)} arrotonda, {len(CASI_NOMI)} nomi")
