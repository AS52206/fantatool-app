/**
 * Porting fedele di fantatool/engine.py — sezione prezzo consigliato.
 * Funzioni: calcolaInflazionePerRuolo, calcolaPrezzoConsigliatoAvanzato,
 * deduciFlagDaFantacrediti, calcolaIndiceInflazioneAsta, arrotondaCreditoScenario.
 *
 * `int(x)` di Python tronca verso zero -> qui Math.trunc.
 */
import type { Acquisto, BilancioSquadra, FantacreditiInfo, FlagManuale, LimitiRuoli, Ruolo } from '../domain/types';

const trunc = Math.trunc;

export const QUOTA_BUDGET_PER_RUOLO: Record<string, number> = { P: 0.06, D: 0.16, C: 0.3, A: 0.48 };

export const MOLTIPLICATORE_DIFESA_DEFAULT: Record<string, number> = {
	Como: 1.19, Inter: 1.18, Roma: 1.16, Juventus: 1.12,
	Napoli: 1.11, Milan: 1.09, Bologna: 1.08, Atalanta: 1.05,
	Venezia: 0.85, Frosinone: 0.85, Monza: 0.85
};

export const MOLTIPLICATORI_FLAG_MANUALE: Record<string, number> = {
	Normale: 1.0,
	'🟡 Ballottaggio': 0.75,
	'🔴 Infortunato/Dubbio': 0.5,
	'🎯 Rigorista designato': 1.15,
	'🎯🟡 Rigorista in Ballottaggio': 0.9,
	'📈 Nuovo titolare confermato': 1.2,
	'🪑 Riserva Fissa (da fasciaFc)': 0.6
};

function clamp(x: number, lo: number, hi: number): number {
	return Math.min(Math.max(x, lo), hi);
}

export function calcolaInflazionePerRuolo(
	ruolo: string,
	acquisti: Acquisto[],
	budgetMax: number,
	listaAllenatori: string[],
	limitiRuoli: LimitiRuoli,
	quoteRuolo?: Record<string, number> | null
): number {
	const acquistiRuolo = acquisti.filter((a) => a.ruolo === ruolo);
	if (acquistiRuolo.length < 3) return 1.0;
	const spesaRealeRuolo = acquistiRuolo.reduce((s, a) => s + a.prezzo, 0);
	const ritmoReale = spesaRealeRuolo / acquistiRuolo.length;
	const creditiTotaliIniziali = listaAllenatori.length * budgetMax;
	const quotaFrazione = quoteRuolo
		? (quoteRuolo[ruolo] ?? 25) / 100.0
		: (QUOTA_BUDGET_PER_RUOLO[ruolo] ?? 0.25);
	const quotaTeoricaRuolo = creditiTotaliIniziali * quotaFrazione;
	const slotTeoriciRuolo = Math.max(
		1,
		listaAllenatori.length * ((limitiRuoli as unknown as Record<string, number>)[ruolo] ?? 1)
	);
	const ritmoTeorico = quotaTeoricaRuolo / slotTeoriciRuolo;
	const moltiplicatore = ritmoReale / Math.max(0.1, ritmoTeorico);
	return clamp(moltiplicatore, 0.7, 1.5);
}

export interface PrezzoInput {
	ruolo: Ruolo | '';
	fm: number;
	pg: number;
	quotazione: number;
	budgetMax: number;
	bilancioGlobal: Record<string, BilancioSquadra> | null;
	acquisti: Acquisto[];
	flagManuale: FlagManuale | string;
	listaAllenatori: string[];
	limitiRuoli: LimitiRuoli;
	fmOld?: number;
	pgOld?: number;
	squadraSerieA?: string;
	miaSquadraScelta?: string;
	quoteRuolo?: Record<string, number> | null;
	moltiplicatoriDifesa?: Record<string, number> | null;
}

export interface PrezzoResult {
	prezzo: number;
	etichetta: string;
}

export function calcolaPrezzoConsigliatoAvanzato(inp: PrezzoInput): PrezzoResult {
	const {
		ruolo, fm, pg, quotazione, budgetMax, bilancioGlobal, acquisti,
		flagManuale, listaAllenatori, limitiRuoli,
		fmOld = 0, pgOld = 0, squadraSerieA = '', miaSquadraScelta = '',
		quoteRuolo = null, moltiplicatoriDifesa = null
	} = inp;

	let moltInflazioneGlobale = 1.0;
	if (bilancioGlobal && Object.keys(bilancioGlobal).length) {
		const creditiTotaliIniziali = listaAllenatori.length * budgetMax;
		const creditiRimasti = Object.values(bilancioGlobal).reduce((s, b) => s + b.c_rimasti, 0);
		const creditiSpesiTot = creditiTotaliIniziali - creditiRimasti;
		if (creditiSpesiTot > creditiTotaliIniziali * 0.15) {
			const slotTotali = listaAllenatori.length * limitiRuoli.TOT;
			const slotRiempiti = Object.values(bilancioGlobal).reduce((s, b) => s + b.g_presi, 0);
			const ritmoReale = creditiSpesiTot / Math.max(1, slotRiempiti);
			const ritmoTeorico = creditiTotaliIniziali / slotTotali;
			moltInflazioneGlobale = clamp(ritmoReale / Math.max(0.1, ritmoTeorico), 0.75, 1.4);
		}
	}

	let moltInflazioneRuolo = 1.0;
	if (acquisti !== null && acquisti !== undefined) {
		moltInflazioneRuolo = calcolaInflazionePerRuolo(
			ruolo, acquisti, budgetMax, listaAllenatori, limitiRuoli, quoteRuolo
		);
	}

	const moltInflazione = moltInflazioneGlobale * 0.35 + moltInflazioneRuolo * 0.65;

	let moltDifesa = 1.0;
	let tagDifesa = '';
	if ((ruolo === 'P' || ruolo === 'D') && moltiplicatoriDifesa) {
		moltDifesa = moltiplicatoriDifesa[squadraSerieA] ?? 1.0;
		if (moltDifesa > 1.0) tagDifesa = ` · 🛡️ +${Math.round((moltDifesa - 1) * 100)}% (difesa solida)`;
		else if (moltDifesa < 1.0)
			tagDifesa = ` · 🕳️ ${Math.round((moltDifesa - 1) * 100)}% (difesa fragile/neopromossa)`;
	}

	const moltBudget = (budgetMax / 500.0) * moltInflazione * moltDifesa;
	const moltFlag = MOLTIPLICATORI_FLAG_MANUALE[flagManuale] ?? 1.0;

	let moltDoppione = 1.0;
	if (acquisti.length && squadraSerieA && miaSquadraScelta) {
		const stessiClub = acquisti.filter(
			(g) => g.squadraSerieA === squadraSerieA && g.proprietario === miaSquadraScelta
		);
		if (stessiClub.length === 1 && ruolo !== 'P') moltDoppione = 0.9;
		else if (stessiClub.length >= 2 && ruolo !== 'P') moltDoppione = 0.7;
	}

	const M = moltBudget * moltFlag * moltDoppione;

	if (pg < 5) {
		const soglieNuovoArrivo: Record<string, [number, number, number]> = {
			P: [12, 2.0, 1.1], D: [12, 1.6, 1.0], C: [10, 1.9, 1.15], A: [8, 2.4, 1.35]
		};
		const [sogliaTop, multTop, multRot] = soglieNuovoArrivo[ruolo] ?? [10, 2.0, 1.2];
		const soglieFmStoricoTop: Record<string, number> = { P: 6.0, D: 6.3, C: 6.5, A: 6.8 };
		const storicoAffidabile = pgOld >= 10 && fmOld > 0;
		if (storicoAffidabile) {
			const sogliaFmTop = soglieFmStoricoTop[ruolo] ?? 6.3;
			if (fmOld >= sogliaFmTop) {
				return {
					prezzo: Math.max(1, trunc(quotazione * multTop * 1.15 * M)),
					etichetta: `🌟 Rientro Confermato TOP (storico solido)${tagDifesa}`
				};
			}
			if (fmOld >= sogliaFmTop - 0.4) {
				return {
					prezzo: Math.max(1, trunc(quotazione * multRot * 1.1 * M)),
					etichetta: `Rientro Affidabile (storico buono)${tagDifesa}`
				};
			}
		}
		if (quotazione >= sogliaTop)
			return { prezzo: Math.max(1, trunc(quotazione * multTop * M)), etichetta: `🌟 Nuovo Arrivo TOP${tagDifesa}` };
		if (quotazione >= sogliaTop * 0.6)
			return { prezzo: Math.max(1, trunc(quotazione * multRot * M)), etichetta: `Nuovo Arrivo (Rotazione)${tagDifesa}` };
		return { prezzo: Math.max(1, trunc(1 * M)), etichetta: `Scommessa / Sconosciuto${tagDifesa}` };
	}

	let valBase = 1;
	let slotLabel = 'Scommessa / Slot di Copertura';

	if (ruolo === 'P') {
		if (fm > 5.0) {
			valBase = trunc((fm - 5.0) ** 2 * 20 + quotazione * 0.5);
			slotLabel = fm >= 5.3 ? 'Portiere Titolare' : 'Portiere Low-Cost';
		}
	} else if (ruolo === 'D') {
		if (fm > 5.5) {
			valBase = trunc((fm - 5.5) * 35 + quotazione * 0.7);
			slotLabel = fm >= 6.4 ? 'Top di Reparto (1°-2° Slot)' : 'Regolarista da Modificatore';
		}
	} else if (ruolo === 'C') {
		if (fm > 5.5) {
			valBase = trunc((fm - 5.5) ** 1.3 * 30 + quotazione * 0.8);
			slotLabel = fm >= 6.7 ? 'Centrocampista Offensivo' : 'Titolare da Voto';
		}
	} else if (ruolo === 'A') {
		if (fm > 6.0) {
			valBase = trunc((fm - 6.0) ** 1.6 * 55 + quotazione * 1.5);
			slotLabel = fm >= 7.5 ? 'Inamovibile / Top Slot' : 'Punta di Rotazione';
		}
	}

	let trendTag =
		moltInflazione > 1.05 ? '🔥 Asta Calda' : moltInflazione < 0.95 ? '❄️ Asta Fredda' : '⚖️ Trend Normale';
	if (flagManuale !== 'Normale') trendTag += ` · ${flagManuale}`;
	if (moltDoppione < 1.0)
		trendTag += ' · ⚠️ [RISCHIO PALINSESTO: Troppi doppioni dello stesso club]';
	trendTag += tagDifesa;

	const prezzoFinale = Math.max(1, trunc(valBase * M));
	return { prezzo: prezzoFinale, etichetta: `${slotLabel} (${trendTag})` };
}

export function deduciFlagDaFantacrediti(fc: FantacreditiInfo | null): FlagManuale {
	if (!fc) return 'Normale';
	if (fc.unavailableUntilRound > 0) return '🔴 Infortunato/Dubbio';
	const eRigorista = fc.penaltyProbability >= 50;
	const eBallottaggio = (fc.expectedTitolarita > 0 && fc.expectedTitolarita < 50) || fc.playerStatus === 'B';
	if (eRigorista && eBallottaggio) return '🎯🟡 Rigorista in Ballottaggio';
	if (eRigorista) return '🎯 Rigorista designato';
	if (eBallottaggio) return '🟡 Ballottaggio';
	if (fc.fasciaFc === 'Riserva') return '🪑 Riserva Fissa (da fasciaFc)';
	return 'Normale';
}

export interface IndiceInflazione {
	indice: number | null;
	spesaReale: number;
	spesaPma: number;
	confrontabili: number;
}

/** Porting di calcola_indice_inflazione_asta: pma preso dal bundle giocatori. */
export function calcolaIndiceInflazioneAsta(
	acquisti: Acquisto[],
	pmaPerGiocatoreId: Map<number, number>
): IndiceInflazione {
	let spesaReale = 0;
	let spesaPma = 0;
	let confrontabili = 0;
	for (const a of acquisti) {
		const pma = pmaPerGiocatoreId.get(a.giocatoreId) ?? 0;
		const prezzo = a.prezzo;
		if (!(prezzo > 0) || !(pma > 0)) continue;
		spesaReale += prezzo;
		spesaPma += pma;
		confrontabili += 1;
	}
	const indice = spesaPma > 0 ? (spesaReale / spesaPma - 1) * 100 : null;
	return { indice, spesaReale, spesaPma, confrontabili };
}

/** Porting di arrotonda_credito_scenario. */
export function arrotondaCreditoScenario(valore: unknown): number {
	const n = typeof valore === 'number' ? valore : Number(valore);
	if (!Number.isFinite(n) || n <= 0) return 1;
	const round6 = Math.round(n * 1e6) / 1e6;
	return Math.max(1, Math.ceil(round6));
}
