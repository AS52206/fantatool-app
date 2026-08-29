/**
 * Porting di fantatool/endgame.py — chiusura rosa (percorsi teorici sugli
 * ultimi slot). Per ora è implementato il ramo CLASSIC; il ramo MANTRA
 * arriverà col porting di mantra.py.
 *
 * Validato da endgame.test.ts contro il modulo Python (ramo classic).
 */
import { pyRound } from './pyround';
import {
	MODULI_MANTRA,
	normalizzaRuoliMantra,
	valutaModuloMantra,
	type GiocatoreMantraInput
} from './mantra';

const trunc = Math.trunc;

export const PROFILI_FINALE = ['QUALITA', 'EQUILIBRIO', 'RISPARMIO'] as const;
export type ProfiloFinale = (typeof PROFILI_FINALE)[number];

function numero(v: unknown, def = 0): number {
	const n = typeof v === 'number' ? v : parseFloat(String(v));
	return Number.isFinite(n) ? n : def;
}

export interface CandidatoFinale {
	chiave?: string | number;
	id?: string | number;
	nome?: string;
	ruolo?: string;
	ruoli_mantra?: string | string[];
	ruoli?: string;
	prezzo?: number;
	punteggio?: number;
	fonte_prezzo?: string;
	[k: string]: unknown;
}

interface CandidatoPreparato {
	chiave: string;
	nome: string;
	ruolo: string;
	ruoli_mantra: string[];
	prezzo: number;
	punteggio: number;
	fonte_prezzo: string;
	[k: string]: unknown;
}

function preparaCandidati(candidati: CandidatoFinale[]): CandidatoPreparato[] {
	const preparati: CandidatoPreparato[] = [];
	const viste = new Set<string>();
	(candidati || []).forEach((c, indice) => {
		const chiave = String(c.chiave ?? c.id ?? c.nome ?? indice);
		if (viste.has(chiave)) return;
		viste.add(chiave);
		const prezzo = Math.max(1, trunc(pyRound(numero(c.prezzo, 1))));
		const punteggio = Math.max(0, numero(c.punteggio, 0));
		const ruolo = String(c.ruolo ?? '').trim().toUpperCase();
		const ruoliMantra = normalizzaRuoliMantra(
			(c.ruoli_mantra as unknown) ?? (c as Record<string, unknown>).ruoli ?? ''
		);
		preparati.push({
			...c,
			chiave,
			nome: String(c.nome || chiave),
			ruolo,
			ruoli_mantra: ruoliMantra,
			prezzo,
			punteggio,
			fonte_prezzo: String(c.fonte_prezzo || 'STIMA')
		});
	});
	return preparati;
}

function utilita(c: CandidatoPreparato, profilo: string): number {
	const qualita = c.punteggio;
	const prezzo = c.prezzo;
	const valore = qualita / Math.max(1, prezzo);
	if (profilo === 'QUALITA') return qualita * 2.0 + valore * 2.0 - prezzo * 0.03;
	if (profilo === 'RISPARMIO') return qualita * 0.65 + valore * 18.0 - prezzo * 0.3;
	return qualita * 1.2 + valore * 9.0 - prezzo * 0.1;
}

/** Ordinamento multi-chiave stabile, come i tuple-key di Python sorted(). */
function sortBy<T>(arr: T[], ...keyFns: ((x: T) => number | string)[]): T[] {
	return [...arr].sort((a, b) => {
		for (const f of keyFns) {
			const ka = f(a);
			const kb = f(b);
			if (ka < kb) return -1;
			if (ka > kb) return 1;
		}
		return 0;
	});
}

function poolPerPasso(
	candidati: CandidatoPreparato[],
	ammessi: Set<string> | null,
	profilo: string,
	limite = 20
): number[] {
	const indici: number[] = [];
	candidati.forEach((c, i) => {
		if (
			ammessi === null ||
			ammessi.has(c.ruolo) ||
			c.ruoli_mantra.some((r) => ammessi.has(r))
		)
			indici.push(i);
	});
	const perUtilita = sortBy(
		indici,
		(i) => -utilita(candidati[i], profilo),
		(i) => candidati[i].prezzo,
		(i) => candidati[i].nome
	).slice(0, limite);
	const economici = sortBy(
		indici,
		(i) => candidati[i].prezzo,
		(i) => -candidati[i].punteggio,
		(i) => candidati[i].nome
	).slice(0, Math.max(5, Math.trunc(limite / 3)));
	const migliori = sortBy(
		indici,
		(i) => -candidati[i].punteggio,
		(i) => candidati[i].prezzo
	).slice(0, Math.max(5, Math.trunc(limite / 3)));
	return [...new Set([...perUtilita, ...economici, ...migliori])];
}

interface Stato {
	indici: number[];
	costo: number;
	utilita: number;
}

function beamSearch(
	candidati: CandidatoPreparato[],
	passi: (Set<string> | null)[],
	budget: number,
	profilo: string,
	ampiezza = 700
): Stato[] {
	let stati: Stato[] = [{ indici: [], costo: 0, utilita: 0 }];
	const totale = passi.length;
	for (let numeroPasso = 0; numeroPasso < totale; numeroPasso++) {
		const opzioni = poolPerPasso(candidati, passi[numeroPasso], profilo);
		if (!opzioni.length) return [];
		const nuovi = new Map<string, Stato>();
		const restanti = totale - numeroPasso - 1;
		for (const stato of stati) {
			const usati = new Set(stato.indici);
			for (const indice of opzioni) {
				if (usati.has(indice)) continue;
				const costo = stato.costo + candidati[indice].prezzo;
				if (costo + restanti > budget) continue;
				const indici = [...stato.indici, indice].sort((a, b) => a - b);
				const u = stato.utilita + utilita(candidati[indice], profilo);
				const key = indici.join(',');
				const prec = nuovi.get(key);
				if (prec === undefined || u > prec.utilita) nuovi.set(key, { indici, costo, utilita: u });
			}
		}
		stati = sortBy(
			[...nuovi.values()],
			(s) => -s.utilita,
			(s) => s.costo
		).slice(0, ampiezza);
		if (!stati.length) return [];
	}
	return stati;
}

export interface PercorsoFinale {
	profilo: string;
	modulo: string | null;
	giocatori: CandidatoPreparato[];
	costo: number;
	residuo: number;
	punteggio_medio: number;
	copertura: number | null;
	modulo_completo: boolean | null;
}

function percorso(
	stato: Stato,
	candidati: CandidatoPreparato[],
	profilo: string,
	budget: number
): PercorsoFinale {
	const scelti = sortBy(
		stato.indici.map((i) => candidati[i]),
		(c) => c.ruolo,
		(c) => c.prezzo,
		(c) => c.nome
	);
	return {
		profilo,
		modulo: null,
		giocatori: scelti,
		costo: trunc(stato.costo),
		residuo: trunc(budget - stato.costo),
		punteggio_medio: pyRound(
			scelti.reduce((s, c) => s + c.punteggio, 0) / Math.max(1, scelti.length),
			1
		),
		copertura: null,
		modulo_completo: null
	};
}

function percorsiClassic(
	candidati: CandidatoPreparato[],
	budget: number,
	mancanti: Record<string, number>
): PercorsoFinale[] {
	const passi: (Set<string> | null)[] = [];
	for (const ruolo of ['P', 'D', 'C', 'A']) {
		for (let k = 0; k < Math.max(0, trunc(mancanti[ruolo] ?? 0)); k++) passi.push(new Set([ruolo]));
	}
	const percorsi: PercorsoFinale[] = [];
	const firme = new Set<string>();
	for (const profilo of PROFILI_FINALE) {
		for (const stato of beamSearch(candidati, passi, budget, profilo)) {
			const firma = stato.indici.join(',');
			if (firme.has(firma)) continue;
			firme.add(firma);
			percorsi.push(percorso(stato, candidati, profilo, budget));
			break;
		}
	}
	return percorsi;
}

// ---------------------------------------------------------------------------
// Ramo MANTRA
// ---------------------------------------------------------------------------
function passiMantra(
	rosa: GiocatoreMantraInput[],
	modulo: string,
	slotVuoti: number,
	minPortieri: number
): { passi: (Set<string> | null)[]; base: ReturnType<typeof valutaModuloMantra> } {
	const base = valutaModuloMantra(rosa, modulo);
	const passi: (Set<string> | null)[] = base.mancanti.map(
		(slot) => new Set(String(slot).split('/'))
	);
	const portieriAttuali = rosa.filter((g) =>
		normalizzaRuoliMantra(
			typeof g === 'object' && g !== null ? (g.ruoli ?? g.ruolo_mantra ?? '') : g
		).includes('Por')
	).length;
	const portieriNeiPassi = passi.filter((p) => p!.has('Por')).length;
	const portieriExtra = Math.max(0, trunc(minPortieri) - portieriAttuali - portieriNeiPassi);
	for (let k = 0; k < portieriExtra; k++) passi.push(new Set(['Por']));
	for (let k = passi.length; k < Math.max(0, trunc(slotVuoti)); k++) passi.push(null);
	return { passi, base };
}

function percorsiMantra(
	candidati: CandidatoPreparato[],
	budget: number,
	slotVuoti: number,
	rosa: GiocatoreMantraInput[],
	moduliTarget: string[],
	minPortieri: number
): PercorsoFinale[] {
	interface RisultatoM {
		stato: Stato;
		profilo: string;
		modulo: string;
		copertura: number;
		completo: boolean;
		rango: [number, number, number, number];
	}
	const risultati: RisultatoM[] = [];
	for (const modulo of moduliTarget) {
		if (!(modulo in MODULI_MANTRA)) continue;
		const { passi } = passiMantra(rosa, modulo, slotVuoti, minPortieri);
		if (passi.length > slotVuoti) continue;
		for (const profilo of PROFILI_FINALE) {
			const stati = beamSearch(candidati, passi, budget, profilo);
			for (const stato of stati.slice(0, 30)) {
				const scelti = stato.indici.map((i) => candidati[i]);
				const rosaFinale: GiocatoreMantraInput[] = [
					...rosa,
					...scelti.map((c) => ({
						chiave: c.chiave,
						nome: c.nome,
						ruoli: c.ruoli_mantra.join(';'),
						punteggio: c.punteggio
					}))
				];
				const verifica = valutaModuloMantra(rosaFinale, modulo);
				risultati.push({
					stato,
					profilo,
					modulo,
					copertura: verifica.coperti,
					completo: verifica.completo,
					rango: [Number(verifica.completo), verifica.coperti, stato.utilita, -stato.costo]
				});
				if (verifica.completo) break;
			}
		}
	}
	risultati.sort((a, b) => {
		for (let i = 0; i < 4; i++) if (a.rango[i] !== b.rango[i]) return b.rango[i] - a.rango[i];
		return 0;
	});
	const percorsi: PercorsoFinale[] = [];
	const firme = new Set<string>();
	const profiliUsati = new Set<string>();
	for (const item of risultati) {
		const firma = item.stato.indici.join(',');
		if (firme.has(firma) || profiliUsati.has(item.profilo)) continue;
		firme.add(firma);
		profiliUsati.add(item.profilo);
		const p = percorso(item.stato, candidati, item.profilo, budget);
		p.modulo = item.modulo;
		p.copertura = item.copertura;
		p.modulo_completo = item.completo;
		percorsi.push(p);
		if (percorsi.length === 3) break;
	}
	return percorsi;
}

export interface OttimizzaInput {
	candidati: CandidatoFinale[];
	budgetResiduo: number;
	slotVuoti: number;
	modalita: string;
	conteggiRuolo?: Record<string, number>;
	limitiRuolo?: Record<string, number>;
	rosaMantra?: GiocatoreMantraInput[];
	moduliTarget?: string[];
	minPortieriMantra?: number;
	sogliaAttivazione?: number;
}

export interface OttimizzaResult {
	attivo: boolean;
	stato: string;
	motivo: string;
	percorsi: PercorsoFinale[];
	candidati_considerati?: number;
	ipotesi?: string;
}

export function ottimizzaFinaleAsta(inp: OttimizzaInput): OttimizzaResult {
	const budget = Math.max(0, trunc(inp.budgetResiduo));
	const vuoti = Math.max(0, trunc(inp.slotVuoti));
	const modalita = String(inp.modalita || 'CLASSIC').toUpperCase();
	const soglia = inp.sogliaAttivazione ?? 10;

	if (vuoti === 0)
		return { attivo: false, stato: 'COMPLETA', motivo: 'Rosa gia\' completa.', percorsi: [] };
	if (vuoti > trunc(soglia))
		return {
			attivo: false,
			stato: 'PRESTO',
			motivo: `Si attiva automaticamente a ${trunc(soglia)} slot residui; ora ne restano ${vuoti}.`,
			percorsi: []
		};
	if (budget < vuoti)
		return {
			attivo: false,
			stato: 'IMPOSSIBILE',
			motivo: `Servono almeno ${vuoti} crediti per ${vuoti} acquisti.`,
			percorsi: []
		};

	const preparati = preparaCandidati(inp.candidati);

	if (modalita === 'MANTRA') {
		const percorsi = percorsiMantra(
			preparati,
			budget,
			vuoti,
			[...(inp.rosaMantra ?? [])],
			[...new Set(inp.moduliTarget ?? [])],
			inp.minPortieriMantra ?? 2
		);
		return {
			attivo: percorsi.length > 0,
			stato: percorsi.length ? 'OK' : 'NESSUN_PERCORSO',
			motivo: percorsi.length
				? 'Percorsi completi trovati.'
				: 'Nessuna combinazione completa rispetta budget, ruoli e disponibilita\'.',
			percorsi: percorsi.slice(0, 3),
			candidati_considerati: preparati.length,
			ipotesi:
				'Prezzi teorici: PMA principale, PFC o quotazione solo come fallback; nessuna previsione dei rilanci avversari.'
		};
	}

	const conteggi = inp.conteggiRuolo ?? {};
	const limiti = inp.limitiRuolo ?? {};
	const mancanti: Record<string, number> = {};
	for (const ruolo of ['P', 'D', 'C', 'A'])
		mancanti[ruolo] = Math.max(0, trunc(limiti[ruolo] ?? 0) - trunc(conteggi[ruolo] ?? 0));
	if (Object.values(mancanti).reduce((s, n) => s + n, 0) !== vuoti)
		return {
			attivo: false,
			stato: 'INCOERENTE',
			motivo: 'Gli slot residui non coincidono con i limiti dei reparti.',
			percorsi: []
		};

	const percorsi = percorsiClassic(preparati, budget, mancanti);
	return {
		attivo: percorsi.length > 0,
		stato: percorsi.length ? 'OK' : 'NESSUN_PERCORSO',
		motivo: percorsi.length
			? 'Percorsi completi trovati.'
			: 'Nessuna combinazione completa rispetta budget, ruoli e disponibilita\'.',
		percorsi: percorsi.slice(0, 3),
		candidati_considerati: preparati.length,
		ipotesi:
			'Prezzi teorici: PMA principale, PFC o quotazione solo come fallback; nessuna previsione dei rilanci avversari.'
	};
}
