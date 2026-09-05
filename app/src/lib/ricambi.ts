/**
 * Ricambi consigliati per una rosa completa: quanti giocatori per ruolo
 * servono in base al modulo/rosa di lega. Condiviso tra Scenari e Draft.
 */
import { PROFILI_ROSA_MANTRA, PIANO_ROSA_MANTRA_30 } from './engine/mantra';
import type { LimitiRuoli, Ruolo } from './domain/types';

export interface Ricambio {
	chiave: string;
	etichetta: string;
	roli: string[];
	presenti: number;
	obiettivo: number;
	mancanti: number;
}

const tokensRuolo = (rm: unknown) =>
	String(rm ?? '')
		.split(/[;,/\s]+/)
		.map((s) => s.trim())
		.filter(Boolean);

/** Mantra: un giocatore polivalente (es. Dd;E) conta in ogni ruolo che può coprire. */
export function ricambiMantraDa(ruoliMantra: (string | null | undefined)[], totRosa: number): Ricambio[] {
	const tot = totRosa || 25;
	const somma30 = Object.values(PIANO_ROSA_MANTRA_30).reduce((s, n) => s + n, 0);
	const chiavi = PROFILI_ROSA_MANTRA.map((p) => p[0]);
	const piano: Record<string, number> = {};
	let acc = 0;
	chiavi.forEach((k, i) => {
		if (i === chiavi.length - 1) piano[k] = Math.max(0, tot - acc);
		else {
			piano[k] = Math.round((PIANO_ROSA_MANTRA_30[k] * tot) / somma30);
			acc += piano[k];
		}
	});
	const tokensPerGiocatore = ruoliMantra.map(tokensRuolo);
	return PROFILI_ROSA_MANTRA.map(([chiave, etichetta, roli]) => {
		const obiettivo = piano[chiave] ?? 0;
		const presenti = tokensPerGiocatore.filter((toks) => toks.some((t) => roli.includes(t))).length;
		return {
			chiave,
			etichetta,
			roli: [...roli],
			presenti,
			obiettivo,
			mancanti: Math.max(0, obiettivo - presenti)
		};
	});
}

/** Classic: slot rimanenti per reparto P/D/C/A sul totale di lega. */
export function ricambiClassicDa(ruoli: (string | null | undefined)[], limiti: LimitiRuoli): Ricambio[] {
	const RUOLI: Ruolo[] = ['P', 'D', 'C', 'A'];
	return RUOLI.map((r) => {
		const presenti = ruoli.filter((x) => x === r).length;
		const obiettivo = limiti[r] ?? 0;
		return { chiave: r, etichetta: r, roli: [r], presenti, obiettivo, mancanti: Math.max(0, obiettivo - presenti) };
	});
}
