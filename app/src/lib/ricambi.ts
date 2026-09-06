/**
 * Ricambi consigliati per una rosa completa: quanti giocatori per ruolo
 * servono in base al modulo/rosa di lega. Condiviso tra Scenari e Draft.
 */
import { PROFILI_ROSA_MANTRA, MODULI_MANTRA } from './engine/mantra';
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

/** Quanto "pesa" ciascun profilo nell'undici titolare di un modulo: uno slot
 *  che accetta ruoli di un solo profilo vale 1 per quel profilo; uno slot
 *  "ibrido" a cavallo di due profili (es. W/A) vale 0.5 per ciascuno. */
function pesiProfiloPerModulo(modulo: string): Record<string, number> {
	const slots = MODULI_MANTRA[modulo] ?? Object.values(MODULI_MANTRA)[0] ?? [];
	const pesi: Record<string, number> = Object.fromEntries(PROFILI_ROSA_MANTRA.map((p) => [p[0], 0]));
	for (const slot of slots) {
		const opzioni = String(slot)
			.split('/')
			.map((s) => s.trim())
			.filter(Boolean);
		const profiliTocchi = PROFILI_ROSA_MANTRA.filter(([, , roli]) => roli.some((r) => opzioni.includes(r)));
		if (!profiliTocchi.length) continue;
		const peso = 1 / profiliTocchi.length;
		for (const [chiave] of profiliTocchi) pesi[chiave] += peso;
	}
	return pesi;
}

/** Mantra: target per profilo calcolati sul modulo scelto (uno slot "ibrido"
 *  come W/A pesa su entrambi i profili che copre). Un giocatore polivalente
 *  (es. Dd;E) conta comunque in ogni ruolo che può coprire. */
export function ricambiMantraDa(
	ruoliMantra: (string | null | undefined)[],
	totRosa: number,
	modulo: string
): Ricambio[] {
	const tot = totRosa || 25;
	const pesi = pesiProfiloPerModulo(modulo);
	const sommaPesi = Object.values(pesi).reduce((s, n) => s + n, 0) || 1;
	const chiavi = PROFILI_ROSA_MANTRA.map((p) => p[0]);
	const piano: Record<string, number> = {};
	let acc = 0;
	chiavi.forEach((k, i) => {
		if (i === chiavi.length - 1) piano[k] = Math.max(0, tot - acc);
		else {
			piano[k] = Math.round((pesi[k] * tot) / sommaPesi);
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

/** Mantra, più moduli target: come `ricambiMantraDa` ma i pesi per profilo
 *  sono la media sui moduli indicati, così la spesa segue l'intera "famiglia"
 *  e non un singolo modulo. */
export function ricambiMantraDaModuli(
	ruoliMantra: (string | null | undefined)[],
	totRosa: number,
	moduli: string[]
): Ricambio[] {
	const validi = [...new Set(moduli)].filter((m) => m in MODULI_MANTRA);
	if (validi.length <= 1) return ricambiMantraDa(ruoliMantra, totRosa, validi[0] ?? '');

	const tot = totRosa || 25;
	const chiavi = PROFILI_ROSA_MANTRA.map((p) => p[0]);
	const pesi: Record<string, number> = Object.fromEntries(chiavi.map((k) => [k, 0]));
	for (const m of validi) {
		const pm = pesiProfiloPerModulo(m);
		for (const k of chiavi) pesi[k] += (pm[k] ?? 0) / validi.length;
	}
	const sommaPesi = Object.values(pesi).reduce((s, n) => s + n, 0) || 1;
	const piano: Record<string, number> = {};
	let acc = 0;
	chiavi.forEach((k, i) => {
		if (i === chiavi.length - 1) piano[k] = Math.max(0, tot - acc);
		else {
			piano[k] = Math.round((pesi[k] * tot) / sommaPesi);
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
