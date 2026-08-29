#!/usr/bin/env python3
"""Casi di riferimento da fantatool/decision_support.py per validare decision.ts."""
from __future__ import annotations

import json
import sys
from pathlib import Path

RADICE = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(RADICE))

import pandas as pd  # noqa: E402

import fantatool.decision_support as ds  # noqa: E402

LIMITI = {"P": 3, "D": 8, "C": 8, "A": 6}
QUOTE = {"P": 6, "D": 16, "C": 30, "A": 48}

out: dict[str, list] = {}


# --- calcola_fascia_operativa ---
fascia = []
combos = [
    dict(pma=20, pfc=25, fallback=15, budget_iniziale=500),
    dict(pma=0, pfc=25, fallback=15, budget_iniziale=500),
    dict(pma=0, pfc=0, fallback=15, budget_iniziale=500),
    dict(pma=None, pfc=None, fallback=1, budget_iniziale=500),
    dict(pma=33, pfc=0, fallback=10, budget_iniziale=300),
    dict(pma=33, pfc=0, fallback=10, budget_iniziale=500, inflazione_percentuale=25),
    dict(pma=33, pfc=0, fallback=10, budget_iniziale=500, inflazione_percentuale=-30),
    dict(pma=33, pfc=0, fallback=10, budget_iniziale=500, scarsita="CRITICA"),
    dict(pma=33, pfc=0, fallback=10, budget_iniziale=500, scarsita="ALTA"),
    dict(pma=33, pfc=0, fallback=10, budget_iniziale=500, moltiplicatore_fase=1.12),
    dict(pma=33, pfc=0, fallback=10, budget_iniziale=500, moltiplicatore_fase=0.9),
    dict(pma=33, pfc=0, fallback=10, budget_iniziale=500, limite_massimo=20),
    dict(pma=7.5, pfc=9.2, fallback=5, budget_iniziale=500),
    dict(pma=2.5, pfc=0, fallback=5, budget_iniziale=500),  # half-to-even
    dict(pma=100, pfc=0, fallback=10, budget_iniziale=500, inflazione_percentuale=15, scarsita="ALTA", moltiplicatore_fase=1.05),
]
for kw in combos:
    fascia.append({"input": kw, "atteso": ds.calcola_fascia_operativa(**kw)})
out["fascia"] = fascia


# --- classifica_fase_asta ---
fase = []
for args in [
    (0, 25), (5, 25), (10, 25), (18, 25), (24, 25),
    (23, 25, 2), (10, 25, 5, 9.0), (10, 25, None, None, 40, 500),
    (10, 25, None, None, 90, 500), (5, 8),
]:
    fase.append({"args": list(args), "atteso": ds.classifica_fase_asta(*args)})
out["fase"] = fase


# --- valuta_decisione_immediata ---
dec = []
for kw in [
    dict(prezzo_corrente=10, fascia_min=15, fascia_max=22, limite_strategico=40, budget_residuo=300, slot_vuoti=10, slot_ruolo_vuoti=3),
    dict(prezzo_corrente=20, fascia_min=15, fascia_max=22, limite_strategico=40, budget_residuo=300, slot_vuoti=10, slot_ruolo_vuoti=3),
    dict(prezzo_corrente=45, fascia_min=15, fascia_max=22, limite_strategico=40, budget_residuo=300, slot_vuoti=10, slot_ruolo_vuoti=3),
    dict(prezzo_corrente=10, fascia_min=15, fascia_max=22, limite_strategico=40, budget_residuo=300, slot_vuoti=10, slot_ruolo_vuoti=0),
    dict(prezzo_corrente=10, fascia_min=15, fascia_max=22, limite_strategico=40, massimo_personale=12, budget_residuo=300, slot_vuoti=10, slot_ruolo_vuoti=3),
    dict(prezzo_corrente=299, fascia_min=15, fascia_max=400, limite_strategico=400, budget_residuo=300, slot_vuoti=10, slot_ruolo_vuoti=3),
    dict(prezzo_corrente=5, fascia_min=5, fascia_max=8, limite_strategico=10, budget_residuo=6, slot_vuoti=3, slot_ruolo_vuoti=1),
]:
    dec.append({"input": kw, "atteso": ds.valuta_decisione_immediata(**kw)})
out["decisione"] = dec


# --- calcola_allarmi_chiusura_asta ---
allarmi = []
for kw in [
    dict(budget_residuo=200, slot_vuoti=10, conteggi_ruolo={"P": 1, "D": 3, "C": 3, "A": 2}, limiti_ruolo=LIMITI),
    dict(budget_residuo=0, slot_vuoti=0, conteggi_ruolo={"P": 3, "D": 8, "C": 8, "A": 6}, limiti_ruolo=LIMITI),
    dict(budget_residuo=3, slot_vuoti=5, conteggi_ruolo={"P": 3, "D": 6, "C": 6, "A": 4}, limiti_ruolo=LIMITI),
    dict(budget_residuo=5, slot_vuoti=5, conteggi_ruolo={"P": 3, "D": 6, "C": 6, "A": 4}, limiti_ruolo=LIMITI),
    dict(budget_residuo=6, slot_vuoti=5, conteggi_ruolo={"P": 2, "D": 6, "C": 7, "A": 4}, limiti_ruolo=LIMITI),
    dict(budget_residuo=50, slot_vuoti=4, conteggi_ruolo={"P": 3, "D": 7, "C": 6, "A": 4}, limiti_ruolo=LIMITI),
    dict(budget_residuo=40, slot_vuoti=5, conteggi_ruolo={"P": 1, "D": 5}, limiti_ruolo=LIMITI, modalita="MANTRA", portieri_mantra=1, moduli_completi_mantra=0, migliore_copertura_mantra=8, incompatibili_moduli=4),
]:
    allarmi.append({"input": kw, "atteso": ds.calcola_allarmi_chiusura_asta(**kw)})
out["allarmi"] = allarmi


# --- profila_rivali ---
def bil(**kw):
    base = dict(c_rimasti=300, slot_vuoti=15, potere_max=200, P=1, D=3, C=3, A=2, diff_medio_pct=None)
    base.update(kw)
    return base

bilanci = {
    "Io": bil(),
    "Rivale1": bil(c_rimasti=350, potere_max=280, A=1, diff_medio_pct=20),
    "Rivale2": bil(c_rimasti=120, potere_max=90, A=5, diff_medio_pct=-10),
    "Rivale3": bil(c_rimasti=400, potere_max=380, A=6),
    "Rivale4": bil(c_rimasti=250, potere_max=210, A=3),
}
acquisti_rivali = {
    "k0": {"proprietario": "Rivale1", "ruolo": "A", "id_clean": 0, "nome_puro": "aa"},
    "k1": {"proprietario": "Rivale2", "ruolo": "A", "id_clean": 0, "nome_puro": "bb"},
    "k2": {"proprietario": "Rivale2", "ruolo": "A", "id_clean": 0, "nome_puro": "cc"},
    "k3": {"proprietario": "Rivale4", "ruolo": "A", "id_clean": 0, "nome_puro": "dd"},
}
# df_fc realistico: indicizzato per nome normalizzato, con colonna slot.
_slot_per_nome = {"aa": 2, "bb": 1, "cc": 3, "dd": 5}
df_fc_fake = pd.DataFrame(
    [{"slot": s, "idFantacalcio": 0} for s in _slot_per_nome.values()],
    index=list(_slot_per_nome),
)
prof = []
for slot_target in (None, 1, 3):
    res = ds.profila_rivali(bilanci, acquisti_rivali, df_fc_fake, "A", slot_target, LIMITI, "Io", 30)
    prof.append({"slot_target": slot_target, "atteso": res})
# versione TS degli acquisti (slot Fantacrediti già risolto dal nome)
acquisti_ts = [
    {"proprietario": v["proprietario"], "ruolo": v["ruolo"], "slot": _slot_per_nome[v["nome_puro"]]}
    for v in acquisti_rivali.values()
]
out["profilaRivali"] = {"bilanci": bilanci, "acquisti": acquisti_ts, "limiti": LIMITI, "casi": prof}


# --- calcola_poteri_acquisto ---
poteri = []
for kw in [
    dict(bilancio=bil(c_rimasti=300, slot_vuoti=15, A=2), ruolo="A"),
    dict(bilancio=bil(c_rimasti=300, slot_vuoti=15, A=6), ruolo="A"),
    dict(bilancio=bil(c_rimasti=50, slot_vuoti=15, A=1, **{"spesi_A": 180}), ruolo="A"),
    dict(bilancio=bil(c_rimasti=400, slot_vuoti=5, A=0), ruolo="A"),
]:
    res = ds.calcola_poteri_acquisto(kw["bilancio"], kw["ruolo"], LIMITI, 500, QUOTE)
    poteri.append({"bilancio": kw["bilancio"], "ruolo": kw["ruolo"], "atteso": res})
out["poteri"] = {"limiti": LIMITI, "quote": QUOTE, "casi": poteri}


# --- costruisci_matrice_domanda_classic ---
out["matriceDomanda"] = {
    "bilanci": bilanci, "limiti": LIMITI,
    "atteso": ds.costruisci_matrice_domanda_classic(bilanci, LIMITI, mia_squadra="Io"),
}


# --- confronta_candidati ---
cand = [
    {"nome": "Alfa", "fm": 7.5, "prezzo": 30, "titolarita": 80},
    {"nome": "Beta", "fm": 6.8, "prezzo": 12, "titolarita": 60, "rischio": True},
    {"nome": "Gamma", "fm": 7.1, "prezzo": 20, "titolarita": None},
]
out["confrontaCandidati"] = {"candidati": cand, "atteso": ds.confronta_candidati(cand)}


# --- confronta_scenari ---
pa = {"Alfa": 40, "Beta": 20, "Delta": 10}
pb = {"Alfa": 45, "Gamma": 25, "Delta": 10}
ruoli = {"Alfa": "A", "Beta": "C", "Gamma": "A", "Delta": "D"}
out["confrontaScenari"] = {"a": pa, "b": pb, "ruoli": ruoli, "atteso": ds.confronta_scenari(pa, pb, ruoli=ruoli, budget_iniziale=500)}


# --- analizza_piano_dinamico ---
piano = {"alfa": 40, "beta": 20, "gamma": 15}
acq = {
    "k0": {"nome_puro": "Alfa", "proprietario": "Io", "prezzo": 38},
    "k1": {"nome_puro": "Beta", "proprietario": "Rivale1", "prezzo": 22},
}
acq_ts = [v for v in acq.values()]
out["analizzaPiano"] = {"piano": piano, "acquisti": acq_ts, "mia": "Io", "budget": 500,
                        "atteso": ds.analizza_piano_dinamico(piano, acq, "Io", 500)}


# --- valuta_affidabilita_giocatore ---
aff = []
for kw in [
    dict(id_ufficiale=123, ruolo_presente=True, presenze_correnti=10, storico_disponibile=True, pma=20, pfc=25, mercato_aperto=False),
    dict(id_ufficiale=0, ruolo_presente=True, presenze_correnti=10, storico_disponibile=True, pma=20, pfc=25, mercato_aperto=False),
    dict(id_ufficiale=123, ruolo_presente=True, presenze_correnti=1, storico_disponibile=False, pma=0, pfc=0, mercato_aperto=False),
    dict(id_ufficiale=123, ruolo_presente=True, presenze_correnti=2, storico_disponibile=True, pma=0, pfc=0, mercato_aperto=True),
    dict(id_ufficiale=123, ruolo_presente=False, presenze_correnti=10, storico_disponibile=True, pma=20, pfc=0, mercato_aperto=False),
    dict(id_ufficiale=123, ruolo_presente=True, presenze_correnti=6, storico_disponibile=False, pma=20, pfc=0, mercato_aperto=False),
]:
    aff.append({"input": kw, "atteso": ds.valuta_affidabilita_giocatore(**kw)})
out["affidabilita"] = aff


dest = RADICE / "app" / "src" / "lib" / "engine" / "__reference__" / "decision_cases.json"
dest.write_text(json.dumps(out, ensure_ascii=False, indent=1), encoding="utf-8")
print(f"OK {dest.relative_to(RADICE)}")
for k, v in out.items():
    n = len(v) if isinstance(v, list) else len(v.get("casi", v.get("atteso", [1])) if isinstance(v, dict) else [])
    print(f"  {k}: {n if isinstance(v, list) else 'ok'}")
