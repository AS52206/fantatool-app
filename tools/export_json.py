#!/usr/bin/env python3
"""
export_json.py
==============
Converte i file dati dell'asta (listone .xlsx + fantacrediti .xlsx + fantalab .json)
in un unico bundle JSON consumato dalla nuova app Svelte (cartella app/).

Uso:
    python3 tools/export_json.py --stagione 2026-2027 --modalita classic --partecipanti 8

Output:
    app/static/data/<stagione>/<modalita>-<partecipanti>.json

Il bundle contiene:
    - players[]      lista giocatori normalizzati (listone + metriche fantacrediti unite per nome/id)
    - meta           stagione, modalita, partecipanti, data generazione, impronte file sorgente

La logica di normalizzazione nome replica engine.normalizza_nome del progetto Python
così che le chiavi combacino tra le due implementazioni.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import re
import sys
import unicodedata
from datetime import datetime, timezone
from pathlib import Path

import pandas as pd

RADICE = Path(__file__).resolve().parents[1]


def normalizza_nome(nome) -> str:
    """Replica esatta di fantatool.engine.normalizza_nome."""
    if nome is None or (isinstance(nome, float) and pd.isna(nome)):
        return ""
    s = str(nome).strip().lower()
    s = "".join(c for c in unicodedata.normalize("NFD", s) if unicodedata.category(c) != "Mn")
    s = s.replace("'", "").replace("’", "").replace(".", "").replace("-", "")
    return " ".join(s.split())


def impronta(percorso: Path) -> str:
    try:
        h = hashlib.sha256()
        with open(percorso, "rb") as f:
            for blocco in iter(lambda: f.read(1 << 20), b""):
                h.update(blocco)
        return h.hexdigest()[:16]
    except OSError:
        return "nohash"


def num(v, default=0.0) -> float:
    try:
        if v is None:
            return default
        if isinstance(v, str):
            v = v.strip().replace("%", "").replace(",", ".")
            if not v:
                return default
        f = float(v)
        return f if f == f else default  # scarta NaN
    except (TypeError, ValueError):
        return default


def leggi_listone(percorso: Path) -> pd.DataFrame:
    """Il listone Fantacalcio ha una riga titolo: prova header standard, poi skiprows=1."""
    df = pd.read_excel(percorso, sheet_name=0)
    cols = [str(c).lower() for c in df.columns]
    if not any(x in cols for x in ("nome", "calciatore", "giocatore")):
        df = pd.read_excel(percorso, sheet_name=0, skiprows=1)
    df.columns = [str(c).strip() for c in df.columns]
    return df


def col(df: pd.DataFrame, *nomi: str):
    bassi = {str(c).strip().lower(): c for c in df.columns}
    for n in nomi:
        if n.lower() in bassi:
            return bassi[n.lower()]
    return None


def leggi_fantacrediti(percorso: Path) -> dict[str, dict]:
    """Ritorna mappa nome_normalizzato -> riga fantacrediti (dict). Sceglie il primo
    foglio con colonne name/pma/pfc, preferendo 'Tutti'/'ALL'."""
    xl = pd.ExcelFile(percorso)
    ordine = [s for s in ("Tutti", "ALL") if s in xl.sheet_names]
    ordine += [s for s in xl.sheet_names if s not in ordine]
    df = None
    for foglio in ordine:
        cand = pd.read_excel(xl, sheet_name=foglio)
        low = {str(c).strip().lower() for c in cand.columns}
        if ("name" in low or "nome" in low) and "pma" in low and "pfc" in low:
            df = cand
            break
    if df is None:
        print(f"  ! nessun foglio fantacrediti valido in {percorso.name}", file=sys.stderr)
        return {}

    c_nome = col(df, "name", "nome")
    c_id = col(df, "idFantacalcio", "idfantacalcio", "id")
    mappa: dict[str, dict] = {}
    per_id: dict[int, dict] = {}
    for _, r in df.iterrows():
        chiave = normalizza_nome(r.get(c_nome))
        if not chiave:
            continue
        rec = {
            "pma": round(num(r.get(col(df, "pma"))), 2),
            "pfc": round(num(r.get(col(df, "pfc"))), 2),
            "slot": int(num(r.get(col(df, "slot")), 0)) or None,
            "expectedTitolarita": round(num(r.get(col(df, "expectedTitolarita"))), 2),
            "expectedFantamedia": round(num(r.get(col(df, "expectedFantamedia"))), 2),
            "lastYearFantamedia": round(num(r.get(col(df, "lastYearFantamedia"))), 2),
            "lastYearTitolarity": round(num(r.get(col(df, "lastYearTitolarity"))), 2),
            "currentSeasonFantamedia": round(num(r.get(col(df, "currentSeasonFantamedia"))), 2),
            "penaltyProbability": round(num(r.get(col(df, "penaltyProbability"))), 2),
            "freeKickProbability": round(num(r.get(col(df, "freeKickProbability"))), 2),
            "unavailableUntilRound": num(r.get(col(df, "unavailableUntilRound"))),
            "playerStatus": str(r.get(col(df, "playerStatus") or "", "") or "").strip(),
            "fasciaFc": str(r.get(col(df, "fasciaFc") or "", "") or "").strip(),
            "roleMantra": str(r.get(col(df, "roleMantra") or "", "") or "").strip(),
            "newArrival": bool(r.get(col(df, "newArrival"))) if col(df, "newArrival") else False,
            "idFantacalcio": int(num(r.get(c_id), 0)) if c_id else 0,
        }
        mappa[chiave] = rec
        if rec["idFantacalcio"] > 0:
            per_id[rec["idFantacalcio"]] = rec
    mappa["__per_id__"] = per_id  # type: ignore
    return mappa


def leggi_mantra_post(percorso: Path) -> dict[str, dict]:
    """Listone Mantra "post mercato": un foglio Excel per ruolo atomico
    (Por, Dc, B, Ds, Dd, E, M, C, W, T, A, Pc). Ogni giocatore compare in un
    foglio per ciascun ruolo che può coprire, con lo stesso Prezzo/PMA
    ripetuto: l'insieme dei fogli in cui appare è quindi il suo ruoloMantra
    completo (più affidabile del solo testo della colonna RM del listone).
    Aggiorna solo prezzo atteso / PMA% (fantalab) e ruoloMantra: gli altri
    campi del foglio (Fascia, Titolarità, Note...) sono annotazioni personali
    dell'utente, non dati puliti da importare automaticamente."""
    try:
        xl = pd.ExcelFile(percorso)
    except (OSError, ValueError) as exc:
        print(f"  ! impossibile leggere {percorso.name}: {exc}", file=sys.stderr)
        return {}
    righe: dict[str, dict] = {}
    for foglio in xl.sheet_names:
        try:
            df = pd.read_excel(xl, sheet_name=foglio)
        except (ValueError, OSError):
            continue
        c_nome = col(df, "nome")
        c_prezzo = col(df, "prezzo")
        c_pma = col(df, "pma")
        if not c_nome:
            continue
        for _, r in df.iterrows():
            chiave = normalizza_nome(r.get(c_nome))
            if not chiave:
                continue
            rec = righe.setdefault(chiave, {"prezzo_atteso": 0.0, "pma_pct": 0.0, "ruoli": []})
            if foglio not in rec["ruoli"]:
                rec["ruoli"].append(foglio)
            if c_prezzo:
                rec["prezzo_atteso"] = num(r.get(c_prezzo))
            if c_pma:
                rec["pma_pct"] = num(str(r.get(c_pma, "")).replace("%", ""))
    return righe


RUOLO_MANTRA_A_ESTESO = {
    "Por": "Por", "Dc": "Dc", "Dd": "Dd", "Ds": "Ds", "E": "E", "M": "M",
    "C": "C", "W": "W", "T": "T", "A": "A", "Pc": "Pc",
}


def costruisci(stagione: str, modalita: str, partecipanti: int) -> dict:
    base = RADICE / "data" / stagione / modalita
    p_listone = base / "listone.xlsx"
    p_fc = base / "fantacrediti" / f"{partecipanti}-partecipanti.xlsx"
    p_fantalab = RADICE / "data" / stagione / "fantalab" / "serie_a_listone.json"
    p_mantra_post = base / "mantra-post.xlsx"

    if not p_listone.exists():
        sys.exit(f"listone mancante: {p_listone}")

    df = leggi_listone(p_listone)
    c_id = col(df, "id", "idfantacalcio")
    c_nome = col(df, "nome", "calciatore", "giocatore")
    c_ruolo = col(df, "r", "ruolo")
    c_rm = col(df, "rm")
    c_squadra = col(df, "squadra", "team")
    c_qta = col(df, "qt.a", "qta", "quotazione")
    c_fvm = col(df, "fvm")
    c_fm = col(df, "fm", "fantamedia")
    c_pv = col(df, "pv", "pg", "partite")
    if not c_nome:
        sys.exit(f"colonna Nome non trovata nel listone: {list(df.columns)}")

    fc = leggi_fantacrediti(p_fc) if p_fc.exists() else {}
    fc_per_id = fc.pop("__per_id__", {}) if fc else {}

    # fantalab: pma testuale (percentuale titolarità) per nome
    fantalab: dict[str, dict] = {}
    if p_fantalab.exists():
        try:
            for r in json.load(open(p_fantalab, encoding="utf-8")):
                fantalab[normalizza_nome(r.get("nome"))] = {
                    "prezzo_atteso": num(r.get("prezzo")),
                    "pma_pct": num(str(r.get("pma", "")).replace("%", "")),
                }
        except (ValueError, OSError):
            pass

    # listone Mantra "post mercato" (opzionale): aggiorna prezzo/PMA e ruoloMantra
    mantra_post: dict[str, dict] = {}
    if modalita == "mantra" and p_mantra_post.exists():
        mantra_post = leggi_mantra_post(p_mantra_post)

    players = []
    for _, r in df.iterrows():
        nome = str(r.get(c_nome, "")).strip()
        if not nome or nome.lower() == "nan":
            continue
        pid = int(num(r.get(c_id), 0)) if c_id else 0
        chiave = normalizza_nome(nome)
        m = fc_per_id.get(pid) or fc.get(chiave) or {}
        fl = fantalab.get(chiave, {})
        mp = mantra_post.get(chiave)
        ruolo_mantra_post = None
        if mp:
            fl = {**fl, "prezzo_atteso": mp["prezzo_atteso"], "pma_pct": mp["pma_pct"]}
            ruolo_mantra_post = ";".join(mp["ruoli"])

        quota = num(r.get(c_qta), 1) if c_qta else 1
        # fm / pg: SOLO dal listone corrente (come fa fantatool/app.py, che passa
        # Fm/Pv del listone a calcola_prezzo_consigliato_avanzato). Con un listone
        # precampionato "solo quotazioni" valgono 0 e il prezzo consigliato si
        # basa su PMA/PFC via calcola_fascia_operativa. La stima di FM attesa
        # resta disponibile in fc.expectedFantamedia per la sola visualizzazione.
        fm = num(r.get(c_fm)) if c_fm else 0.0
        pg = int(num(r.get(c_pv))) if c_pv else 0
        # storico stagione precedente: da dati_vecchi se presente, altrimenti 0.
        fm_old = num(r.get(col(df, "fm_old"))) if col(df, "fm_old") else 0.0
        pg_old = int(num(r.get(col(df, "pg_old")))) if col(df, "pg_old") else 0

        players.append({
            "id": pid,
            "nome": nome,
            "chiave": chiave,
            "ruolo": str(r.get(c_ruolo, "")).strip().upper()[:1] if c_ruolo else "",
            "ruoloMantra": ruolo_mantra_post or (str(r.get(c_rm, "")).strip() if c_rm else "") or m.get("roleMantra", ""),
            "squadra": str(r.get(c_squadra, "")).strip() if c_squadra else "",
            "quotazione": quota,
            "fvm": num(r.get(c_fvm)) if c_fvm else 0.0,
            "fm": round(fm, 2),
            "pg": pg,
            "fmOld": round(fm_old, 2),
            "pgOld": pg_old,
            "fc": {
                "pma": m.get("pma", 0.0),
                "pfc": m.get("pfc", 0.0),
                "slot": m.get("slot"),
                "expectedTitolarita": m.get("expectedTitolarita", 0.0),
                "expectedFantamedia": m.get("expectedFantamedia", 0.0),
                "penaltyProbability": m.get("penaltyProbability", 0.0),
                "unavailableUntilRound": m.get("unavailableUntilRound", 0.0),
                "playerStatus": m.get("playerStatus", ""),
                "fasciaFc": m.get("fasciaFc", ""),
                "newArrival": m.get("newArrival", False),
            } if m else None,
            "fantalab": fl or None,
        })

    return {
        "meta": {
            "stagione": stagione,
            "modalita": modalita.upper(),
            "partecipanti": partecipanti,
            "generato": datetime.now(timezone.utc).isoformat(),
            "sorgenti": {
                "listone": {"file": p_listone.name, "impronta": impronta(p_listone)},
                "fantacrediti": {"file": p_fc.name, "impronta": impronta(p_fc)} if p_fc.exists() else None,
                "fantalab": {"file": p_fantalab.name, "impronta": impronta(p_fantalab)} if p_fantalab.exists() else None,
                "mantra_post": {"file": p_mantra_post.name, "impronta": impronta(p_mantra_post)} if mantra_post else None,
            },
            "totale_giocatori": len(players),
            "con_fantacrediti": sum(1 for p in players if p["fc"]),
            "con_mantra_post": sum(1 for p in players if mantra_post.get(p["chiave"])) if mantra_post else 0,
        },
        "players": players,
    }


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--stagione", default="2026-2027")
    ap.add_argument("--modalita", default="classic", choices=["classic", "mantra"])
    ap.add_argument("--partecipanti", type=int, default=8)
    ap.add_argument("--out", default=None)
    args = ap.parse_args()

    bundle = costruisci(args.stagione, args.modalita, args.partecipanti)
    out = Path(args.out) if args.out else (
        RADICE / "app" / "static" / "data" / args.stagione / f"{args.modalita}-{args.partecipanti}.json"
    )
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(bundle, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    m = bundle["meta"]
    print(f"OK  {out.relative_to(RADICE)}")
    print(f"    {m['totale_giocatori']} giocatori, {m['con_fantacrediti']} con metriche Fantacrediti")
    if m["sorgenti"].get("mantra_post"):
        print(f"    {m['con_mantra_post']} giocatori aggiornati da {m['sorgenti']['mantra_post']['file']} (prezzo/PMA/ruoloMantra)")
    tot = max(1, m["totale_giocatori"])
    if m["con_fantacrediti"] / tot < 0.6:
        p_fc = RADICE / "data" / args.stagione / args.modalita / "fantacrediti" / f"{args.partecipanti}-partecipanti.xlsx"
        stato = "manca" if not p_fc.exists() else "incompleto rispetto al listone"
        print(
            f"    ⚠  copertura Fantacrediti bassa: il file {p_fc.name} {stato}.\n"
            f"       PMA/PFC/slot mancheranno per molti giocatori; usa il taglio 8 se disponibile.",
            file=sys.stderr,
        )


if __name__ == "__main__":
    main()
