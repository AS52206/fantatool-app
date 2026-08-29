#!/usr/bin/env python3
"""
sync_assets.py
==============
Copia i loghi Serie A (assets/Loghi) e gli stemmi dei partecipanti
(assets/Stemmi) dentro app/static/assets/, con nomi file normalizzati, e
genera app/static/assets/manifest.json:

    { "loghi": {"inter": "inter.png", ...}, "stemmi": {"bojondc": "bojon-dc.png", ...} }

La chiave è il nome normalizzato (minuscolo, senza spazi/apostrofi) usato dal
componente Crest.svelte per la ricerca.
"""
from __future__ import annotations

import json
import re
import shutil
import sys
from pathlib import Path

RADICE = Path(__file__).resolve().parents[1]
SORGENTI = {"loghi": RADICE / "assets" / "Loghi", "stemmi": RADICE / "assets" / "Stemmi"}
DEST = RADICE / "app" / "static" / "assets"


def norm(nome: str) -> str:
    return re.sub(r"[\s'’.]", "", nome.strip().lower())


def slug(nome: str) -> str:
    s = re.sub(r"[^a-z0-9]+", "-", nome.strip().lower()).strip("-")
    return s or "x"


def main() -> None:
    manifest: dict[str, dict[str, str]] = {}
    for tipo, sorgente in SORGENTI.items():
        out_dir = DEST / tipo
        if out_dir.exists():
            shutil.rmtree(out_dir)
        out_dir.mkdir(parents=True, exist_ok=True)
        mappa: dict[str, str] = {}
        if not sorgente.exists():
            print(f"  ! cartella mancante: {sorgente}", file=sys.stderr)
            manifest[tipo] = {}
            continue
        for f in sorted(sorgente.iterdir()):
            if f.suffix.lower() not in (".png", ".jpg", ".jpeg", ".webp", ".svg"):
                continue
            nome_file = f"{slug(f.stem)}{f.suffix.lower()}"
            shutil.copy2(f, out_dir / nome_file)
            mappa[norm(f.stem)] = nome_file
        manifest[tipo] = mappa
        print(f"  {tipo}: {len(mappa)} file")

    DEST.mkdir(parents=True, exist_ok=True)
    (DEST / "manifest.json").write_text(
        json.dumps(manifest, ensure_ascii=False, indent=1), encoding="utf-8"
    )
    print(f"OK  {(DEST / 'manifest.json').relative_to(RADICE)}")


if __name__ == "__main__":
    main()
