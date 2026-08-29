/**
 * round() di Python: half-to-even (banker's rounding), diverso da Math.round
 * di JS che fa half-up. Serve per la parità coi moduli Python portati.
 */
export function pyRound(x: number, ndigits = 0): number {
	if (!Number.isFinite(x)) return x;
	const m = 10 ** ndigits;
	const y = x * m;
	const floor = Math.floor(y);
	const diff = y - floor;
	let r: number;
	// Solo un vero halfway del double va a metà-pari. Un valore come
	// 28.5000000000000018 (rumore di 0.55+0.4) NON è halfway: Python su quello
	// stesso double arrotonda per eccesso, quindi qui serve il confronto esatto.
	if (diff === 0.5) {
		r = floor % 2 === 0 ? floor : floor + 1;
	} else {
		r = Math.round(y); // half-up; per i negativi non-halfway va comunque bene
	}
	return r / m;
}
