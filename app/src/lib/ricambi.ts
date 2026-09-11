/**
 * Ricambi consigliati per una rosa completa: quanti giocatori per ruolo
 * servono in base al modulo/rosa di lega. Condiviso tra Scenari e Draft.
 */
import { PROFILI_ROSA_MANTRA, MODULI_MANTRA, PIANO_ROSA_MANTRA_PER_MODULO } from './engine/mantra';
import type { LimitiRuoli, Ruolo } from './domain/types';

const CHIAVI_PROFILO = PROFILI_ROSA_MANTRA.map((p) => p[0]);
/** Movimento nella tabella BABBOFANTACALCIO (3 portieri + 25 = 28). */
const BASE_MOVIMENTO = 25;

/** Ripartisce `tot` sui `pesi` (uno per chiave) con il metodo dei resti massimi. */
function ripartisci(chiavi: string[], pesi: number[], tot: number): Record<string, number> {
	const interi = pesi.map((g) => Math.max(0, Math.floor(g)));
	let resto = tot - interi.reduce((s, n) => s + n, 0);
	const ord = pesi
		.map((g, i) => ({ i, frac: g - Math.floor(g) }))
		.sort((a, b) => b.frac - a.frac || pesi[b.i] - pesi[a.i]);
	for (let j = 0; j < resto && j < ord.length; j++) interi[ord[j].i] += 1;
	const out: Record<string, number> = {};
	chiavi.forEach((k, i) => (out[k] = interi[i]));
	return out;
}

/**
 * Target per profilo dalla tabella BABBOFANTACALCIO (modulo → giocatori per
 * ruolo), **scalato** alla rosa reale: portieri fissi = `portieri`, i restanti
 * scalati da 25 a `totRosa - portieri`. Ritorna null se il modulo non è in
 * tabella (si usa allora il calcolo derivato dal peso dell'undici).
 */
export function pianoRosaPerModulo(
	modulo: string,
	totRosa: number,
	portieri = 3
): Record<string, number> | null {
	const base = PIANO_ROSA_MANTRA_PER_MODULO[modulo];
	if (!base) return null;
	const por = Math.max(0, Math.round(portieri));
	const movKeys = CHIAVI_PROFILO.filter((k) => k !== 'Por');
	const movTarget = Math.max(0, Math.round(totRosa) - por);
	const pesi = movKeys.map((k) => ((base[k] ?? 0) * movTarget) / BASE_MOVIMENTO);
	return { Por: por, ...ripartisci(movKeys, pesi, movTarget) };
}

export interface Ricambio {
	chiave: string;
	etichetta: string;
	roli: string[];
	presenti: number;
	obiettivo: number;
	mancanti: number;
	/**
	 * Controllo prudenziale dei singoli ruoli contenuti nel profilo. Il totale
	 * del profilo resta quello della tabella, ma C non può più far sparire il
	 * fabbisogno di M, né Dd quello di Ds.
	 */
	mancantiPerRuolo: { ruolo: string; presenti: number; mancanti: number }[];
	criterioCoperto: boolean;
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

/** Costruisce le righe Ricambio da un piano (profilo → obiettivo) e dai ruoli
 *  dei giocatori posseduti. Un polivalente conta nel profilo, ma il controllo
 *  prudenziale non permette che un ruolo puro copra gli altri ruoli del gruppo. */
function costruisciRicambi(
	piano: Record<string, number>,
	ruoliMantra: (string | null | undefined)[]
): Ricambio[] {
	const tokensPerGiocatore = ruoliMantra.map(tokensRuolo);
	return PROFILI_ROSA_MANTRA.map(([chiave, etichetta, roli]) => {
		const obiettivo = piano[chiave] ?? 0;
		const presenti = tokensPerGiocatore.filter((toks) => toks.some((t) => roli.includes(t))).length;
		const mancantiPerRuolo = roli
			.map((ruolo) => {
				const presentiRuolo = tokensPerGiocatore.filter((toks) => toks.includes(ruolo)).length;
				return { ruolo, presenti: presentiRuolo, mancanti: Math.max(0, obiettivo - presentiRuolo) };
			})
			.filter((r) => r.mancanti > 0);
		return {
			chiave,
			etichetta,
			roli: [...roli],
			presenti,
			obiettivo,
			mancanti: Math.max(0, obiettivo - presenti),
			mancantiPerRuolo,
			criterioCoperto: mancantiPerRuolo.length === 0
		};
	});
}

/** Piano derivato dal peso dell'undici titolare (fallback se il modulo non è
 *  nella tabella BABBOFANTACALCIO). */
function pianoDerivato(pesi: Record<string, number>, tot: number): Record<string, number> {
	const sommaPesi = Object.values(pesi).reduce((s, n) => s + n, 0) || 1;
	const piano: Record<string, number> = {};
	let acc = 0;
	CHIAVI_PROFILO.forEach((k, i) => {
		if (i === CHIAVI_PROFILO.length - 1) piano[k] = Math.max(0, tot - acc);
		else {
			piano[k] = Math.round((pesi[k] * tot) / sommaPesi);
			acc += piano[k];
		}
	});
	return piano;
}

/**
 * Mantra: quanti giocatori per profilo tenere in rosa sul modulo scelto.
 * Usa la tabella per-modulo di BABBOFANTACALCIO (scalata alla rosa reale);
 * se il modulo non c'è, ripiega sul calcolo pesato dell'undici titolare.
 */
export function ricambiMantraDa(
	ruoliMantra: (string | null | undefined)[],
	totRosa: number,
	modulo: string,
	portieri = 3
): Ricambio[] {
	const tot = totRosa || 25;
	const piano =
		pianoRosaPerModulo(modulo, tot, portieri) ?? pianoDerivato(pesiProfiloPerModulo(modulo), tot);
	return costruisciRicambi(piano, ruoliMantra);
}

/** Mantra, più moduli target: media dei piani per-modulo, così la spesa segue
 *  l'intera "famiglia" e non un singolo modulo. */
export function ricambiMantraDaModuli(
	ruoliMantra: (string | null | undefined)[],
	totRosa: number,
	moduli: string[],
	portieri = 3
): Ricambio[] {
	const validi = [...new Set(moduli)].filter((m) => m in MODULI_MANTRA);
	if (validi.length <= 1) return ricambiMantraDa(ruoliMantra, totRosa, validi[0] ?? '', portieri);

	const tot = totRosa || 25;
	const piani = validi
		.map((m) => pianoRosaPerModulo(m, tot, portieri))
		.filter((p): p is Record<string, number> => p !== null);

	let piano: Record<string, number>;
	if (piani.length) {
		const por = piani[0].Por ?? Math.max(0, Math.round(portieri));
		const movKeys = CHIAVI_PROFILO.filter((k) => k !== 'Por');
		const movTarget = Math.max(0, Math.round(tot) - por);
		const media = movKeys.map(
			(k) => piani.reduce((s, p) => s + (p[k] ?? 0), 0) / piani.length
		);
		piano = { Por: por, ...ripartisci(movKeys, media, movTarget) };
	} else {
		const pesi: Record<string, number> = Object.fromEntries(CHIAVI_PROFILO.map((k) => [k, 0]));
		for (const m of validi) {
			const pm = pesiProfiloPerModulo(m);
			for (const k of CHIAVI_PROFILO) pesi[k] += (pm[k] ?? 0) / validi.length;
		}
		piano = pianoDerivato(pesi, tot);
	}
	return costruisciRicambi(piano, ruoliMantra);
}

/** Classic: slot rimanenti per reparto P/D/C/A sul totale di lega. */
export function ricambiClassicDa(ruoli: (string | null | undefined)[], limiti: LimitiRuoli): Ricambio[] {
	const RUOLI: Ruolo[] = ['P', 'D', 'C', 'A'];
	return RUOLI.map((r) => {
		const presenti = ruoli.filter((x) => x === r).length;
		const obiettivo = limiti[r] ?? 0;
		const mancanti = Math.max(0, obiettivo - presenti);
		return {
			chiave: r,
			etichetta: r,
			roli: [r],
			presenti,
			obiettivo,
			mancanti,
			mancantiPerRuolo: mancanti ? [{ ruolo: r, presenti, mancanti }] : [],
			criterioCoperto: mancanti === 0
		};
	});
}
