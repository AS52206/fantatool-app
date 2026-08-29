import { base } from '$app/paths';
import type { Bundle } from '../domain/types';

/** Carica il bundle giocatori generato da tools/export_json.py. */
export async function caricaBundle(
	stagione: string,
	modalita: string,
	partecipanti: number
): Promise<Bundle> {
	const url = `${base}/data/${stagione}/${modalita}-${partecipanti}.json`;
	const r = await fetch(url);
	if (!r.ok) throw new Error(`Bundle dati non trovato (${url}). Esegui: python3 tools/export_json.py`);
	return (await r.json()) as Bundle;
}
