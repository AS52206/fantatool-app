/**
 * Porting fedele di fantatool/mantra.py + gli helper di auction_setup usati
 * (ORDINE_RUOLI_MANTRA, normalizza_ruoli_mantra).
 *
 * Cuore: assegnaGiocatoriModulo = matching massimo bipartito (Kuhn) tra
 * giocatori e gli 11 slot di un modulo, con preferenze deterministiche.
 * Validato da mantra.test.ts contro il modulo Python.
 */
import { pyRound } from './pyround';

export const ORDINE_RUOLI_MANTRA = [
	'Por', 'Dd', 'Ds', 'Dc', 'B', 'E', 'M', 'C', 'W', 'T', 'A', 'Pc'
] as const;
export type RuoloMantra = (typeof ORDINE_RUOLI_MANTRA)[number];

const ORDINE_IDX: Record<string, number> = Object.fromEntries(
	ORDINE_RUOLI_MANTRA.map((r, i) => [r, i])
);
const ALIAS: Record<string, RuoloMantra> = Object.fromEntries(
	ORDINE_RUOLI_MANTRA.map((r) => [r.toLowerCase(), r])
);

export function normalizzaRuoliMantra(valore: unknown): RuoloMantra[] {
	if (valore === null || valore === undefined) return [];
	const trovati: RuoloMantra[] = [];
	for (const parte of String(valore).split(/[;,/]/)) {
		const r = ALIAS[parte.trim().toLowerCase()];
		if (r && !trovati.includes(r)) trovati.push(r);
	}
	return trovati.sort((a, b) => ORDINE_IDX[a] - ORDINE_IDX[b]);
}

export const MODULI_MANTRA: Record<string, string[]> = {
	'3-4-3': ['Por', 'Dc', 'Dc', 'Dc/B', 'E', 'M/C', 'C', 'E', 'W/A', 'A/Pc', 'W/A'],
	'3-4-1-2': ['Por', 'Dc', 'Dc', 'Dc/B', 'E', 'M/C', 'C', 'E', 'T', 'A/Pc', 'A/Pc'],
	'3-4-2-1': ['Por', 'Dc', 'Dc', 'Dc/B', 'E', 'M', 'M/C', 'E/W', 'T', 'T/A', 'A/Pc'],
	'3-5-2': ['Por', 'Dc', 'Dc', 'Dc/B', 'E', 'M', 'M/C', 'C', 'E/W', 'A/Pc', 'A/Pc'],
	'3-5-1-1': ['Por', 'Dc', 'Dc', 'Dc/B', 'E/W', 'M', 'M', 'C', 'E/W', 'T/A', 'A/Pc'],
	'4-3-3': ['Por', 'Ds', 'Dc', 'Dc', 'Dd', 'M', 'M/C', 'C', 'W/A', 'A/Pc', 'W/A'],
	'4-3-1-2': ['Por', 'Ds', 'Dc', 'Dc', 'Dd', 'M', 'M/C', 'C', 'T', 'T/A/Pc', 'A/Pc'],
	'4-4-2': ['Por', 'Ds', 'Dc', 'Dc', 'Dd', 'E', 'M/C', 'C', 'E/W', 'A/Pc', 'A/Pc'],
	'4-1-4-1': ['Por', 'Ds', 'Dc', 'Dc', 'Dd', 'M', 'E/W', 'C/T', 'T', 'W', 'A/Pc'],
	'4-4-1-1': ['Por', 'Ds', 'Dc', 'Dc', 'Dd', 'E/W', 'M', 'C', 'E/W', 'T/A', 'A/Pc'],
	'4-2-3-1': ['Por', 'Ds', 'Dc', 'Dc', 'Dd', 'M', 'M/C', 'W/T', 'T', 'W/A', 'A/Pc']
};

export const LINEE_MODULI_MANTRA: Record<string, number[]> = {
	'3-4-3': [3, 4, 3], '3-4-1-2': [3, 4, 1, 2], '3-4-2-1': [3, 4, 2, 1],
	'3-5-2': [3, 5, 2], '3-5-1-1': [3, 5, 1, 1], '4-3-3': [4, 3, 3],
	'4-3-1-2': [4, 3, 1, 2], '4-4-2': [4, 4, 2], '4-1-4-1': [4, 1, 4, 1],
	'4-4-1-1': [4, 4, 1, 1], '4-2-3-1': [4, 2, 3, 1]
};

export const PROFILI_ROSA_MANTRA: [string, string, string[]][] = [
	['Por', 'Portieri', ['Por']],
	['Dc/B', 'Centrali e braccetti', ['Dc', 'B']],
	['Dd/Ds', 'Laterali difensivi', ['Dd', 'Ds']],
	['E', 'Esterni', ['E']],
	['M/C', 'Centrocampisti', ['M', 'C']],
	['W/T', 'Ali e trequartisti', ['W', 'T']],
	['A/Pc', 'Attaccanti', ['A', 'Pc']]
];

export const PIANO_ROSA_MANTRA_30: Record<string, number> = {
	Por: 3, 'Dc/B': 5, 'Dd/Ds': 2, E: 4, 'M/C': 6, 'W/T': 5, 'A/Pc': 5
};

/**
 * Quanti giocatori tenere in rosa per profilo, **per modulo** — tabella di
 * BABBOFANTACALCIO (ipotesi rose con 3 portieri + 25 di movimento = 28).
 * Le sigle atomiche del video sono aggregate ai 7 profili del tool:
 *   dc → Dc/B · ds/dd/(ds/dd) → Dd/Ds · e → E · m,c → M/C · w,t,(w/t) → W/T · a,pc → A/Pc
 * Va scalata alla rosa reale (vedi `pianoRosaPerModulo` in ricambi.ts).
 */
export const PIANO_ROSA_MANTRA_PER_MODULO: Record<string, Record<string, number>> = {
	'3-4-3':   { Por: 3, 'Dc/B': 8, 'Dd/Ds': 0, E: 5, 'M/C': 5, 'W/T': 1, 'A/Pc': 6 },
	'3-4-1-2': { Por: 3, 'Dc/B': 8, 'Dd/Ds': 0, E: 5, 'M/C': 5, 'W/T': 3, 'A/Pc': 4 },
	'3-4-2-1': { Por: 3, 'Dc/B': 8, 'Dd/Ds': 0, E: 3, 'M/C': 5, 'W/T': 5, 'A/Pc': 4 },
	'3-5-2':   { Por: 3, 'Dc/B': 8, 'Dd/Ds': 0, E: 3, 'M/C': 8, 'W/T': 3, 'A/Pc': 3 },
	'3-5-1-1': { Por: 3, 'Dc/B': 8, 'Dd/Ds': 0, E: 0, 'M/C': 6, 'W/T': 6, 'A/Pc': 5 },
	'4-3-3':   { Por: 3, 'Dc/B': 6, 'Dd/Ds': 6, E: 0, 'M/C': 7, 'W/T': 0, 'A/Pc': 6 },
	'4-3-1-2': { Por: 3, 'Dc/B': 6, 'Dd/Ds': 6, E: 0, 'M/C': 7, 'W/T': 3, 'A/Pc': 3 },
	'4-4-2':   { Por: 3, 'Dc/B': 6, 'Dd/Ds': 6, E: 2, 'M/C': 5, 'W/T': 3, 'A/Pc': 3 },
	'4-1-4-1': { Por: 3, 'Dc/B': 6, 'Dd/Ds': 6, E: 0, 'M/C': 4, 'W/T': 6, 'A/Pc': 3 },
	'4-4-1-1': { Por: 3, 'Dc/B': 6, 'Dd/Ds': 6, E: 0, 'M/C': 5, 'W/T': 4, 'A/Pc': 4 },
	'4-2-3-1': { Por: 3, 'Dc/B': 6, 'Dd/Ds': 5, E: 0, 'M/C': 5, 'W/T': 5, 'A/Pc': 4 }
};

function opzioniSlot(etichetta: string): string[] {
	return String(etichetta)
		.split('/')
		.map((p) => p.trim())
		.filter(Boolean);
}

export function ruoliCompatibiliConSlot(ruoli: unknown, slot: string): boolean {
	const set = new Set(normalizzaRuoliMantra(ruoli));
	return opzioniSlot(slot).some((o) => set.has(o as RuoloMantra));
}

// ---------------------------------------------------------------------------
// _prepara_giocatore
// ---------------------------------------------------------------------------
export type GiocatoreMantraInput =
	| string
	| {
			chiave?: string | number;
			id?: string | number;
			nome?: string;
			ruoli?: string;
			ruolo_mantra?: string;
			Ruoli_Mantra_Clean?: string;
			punteggio?: number;
			[k: string]: unknown;
	  };

interface DatiGiocatore {
	nome: string;
	chiave: string | number;
	ruoli: string;
	punteggio: number;
	indice: number;
	[k: string]: unknown;
}

interface Preparato {
	dati: DatiGiocatore;
	ruoli: Set<string>;
	punteggio: number;
	specificita: number;
}

function preparaGiocatore(g: GiocatoreMantraInput, indice: number): Preparato {
	let dati: Record<string, unknown>;
	let valoreRuoli: unknown;
	let nome: string;
	let chiave: string | number;
	let punteggio: number;
	if (typeof g === 'object' && g !== null) {
		dati = { ...g };
		valoreRuoli = g.ruoli || g.ruolo_mantra || g.Ruoli_Mantra_Clean || '';
		nome = String(g.nome || (g as Record<string, unknown>).Nome_Clean || `Giocatore ${indice + 1}`);
		chiave = (g.chiave ?? g.id ?? nome) as string | number;
		const p = typeof g.punteggio === 'number' ? g.punteggio : parseFloat(String(g.punteggio ?? 0));
		punteggio = Number.isFinite(p) ? p : 0;
	} else {
		valoreRuoli = g;
		nome = `Giocatore ${indice + 1}`;
		chiave = indice;
		punteggio = 0;
		dati = {};
	}
	const ruoli = normalizzaRuoliMantra(valoreRuoli);
	const datiFull: DatiGiocatore = {
		...dati,
		nome,
		chiave,
		ruoli: ruoli.join(';'),
		punteggio,
		indice
	};
	return {
		dati: datiFull,
		ruoli: new Set(ruoli),
		punteggio,
		specificita: 1.0 / Math.max(1, ruoli.length)
	};
}

// ---------------------------------------------------------------------------
// assegna_giocatori_modulo — matching massimo (Kuhn) deterministico
// ---------------------------------------------------------------------------
export interface Assegnazione {
	indice_slot: number;
	slot: string;
	giocatore: DatiGiocatore | null;
}

export interface EsitoModulo {
	modulo: string;
	coperti: number;
	totale: number;
	completo: boolean;
	mancanti: string[];
	assegnazioni: Assegnazione[];
	panchina: DatiGiocatore[];
	punteggio: number;
}

export function assegnaGiocatoriModulo(
	giocatori: GiocatoreMantraInput[],
	modulo: string
): EsitoModulo {
	if (!(modulo in MODULI_MANTRA)) throw new Error(`modulo Mantra non supportato: ${modulo}`);
	const preparati = giocatori.map((g, i) => preparaGiocatore(g, i));
	const slots = MODULI_MANTRA[modulo];

	// player index -> slot index
	const assegnazioneGiocatore = new Map<number, number>();

	const candidatiPerSlot = (indiceSlot: number): number[] => {
		const opzioni = new Set(opzioniSlot(slots[indiceSlot]));
		const cand: number[] = [];
		preparati.forEach((p, i) => {
			for (const r of p.ruoli) if (opzioni.has(r)) { cand.push(i); break; }
		});
		cand.sort((a, b) => {
			if (preparati[b].punteggio !== preparati[a].punteggio)
				return preparati[b].punteggio - preparati[a].punteggio;
			if (preparati[b].specificita !== preparati[a].specificita)
				return preparati[b].specificita - preparati[a].specificita;
			return a - b;
		});
		return cand;
	};

	const assegna = (indiceSlot: number, visitati: Set<number>): boolean => {
		for (const ig of candidatiPerSlot(indiceSlot)) {
			if (visitati.has(ig)) continue;
			visitati.add(ig);
			const slotPrec = assegnazioneGiocatore.get(ig);
			if (slotPrec === undefined || assegna(slotPrec, visitati)) {
				assegnazioneGiocatore.set(ig, indiceSlot);
				return true;
			}
		}
		return false;
	};

	const ordineSlot = [...slots.keys()].sort((a, b) => {
		const la = opzioniSlot(slots[a]).length;
		const lb = opzioniSlot(slots[b]).length;
		return la !== lb ? la - lb : a - b;
	});
	for (const indiceSlot of ordineSlot) assegna(indiceSlot, new Set());

	const mappa = new Map<number, number>(); // slot -> player
	for (const [ig, is] of assegnazioneGiocatore) mappa.set(is, ig);
	const schierati = new Set(mappa.values());

	const assegnazioni: Assegnazione[] = [];
	const mancanti: string[] = [];
	slots.forEach((slot, indiceSlot) => {
		const ig = mappa.get(indiceSlot);
		const dg = ig !== undefined ? preparati[ig].dati : null;
		assegnazioni.push({ indice_slot: indiceSlot, slot, giocatore: dg });
		if (dg === null) mancanti.push(slot);
	});

	const coperti = mappa.size;
	let punteggioTot = 0;
	for (const i of schierati) punteggioTot += preparati[i].punteggio;

	return {
		modulo,
		coperti,
		totale: slots.length,
		completo: coperti === slots.length,
		mancanti,
		assegnazioni,
		panchina: preparati.filter((_, i) => !schierati.has(i)).map((p) => p.dati),
		punteggio: punteggioTot
	};
}

export const valutaModuloMantra = assegnaGiocatoriModulo;

// ---------------------------------------------------------------------------
// analizza_rosa_mantra
// ---------------------------------------------------------------------------
export interface AnalisiRosa {
	giocatori: number;
	portieri: number;
	rosa_minima_ok: boolean;
	giocatori_mancanti: number;
	portieri_mancanti: number;
	moduli: EsitoModulo[];
	moduli_completi: string[];
	migliore: EsitoModulo;
}

export function analizzaRosaMantra(ruoliGiocatori: GiocatoreMantraInput[]): AnalisiRosa {
	const val = Object.keys(MODULI_MANTRA).map((m) => valutaModuloMantra(ruoliGiocatori, m));
	val.sort((a, b) => (b.coperti !== a.coperti ? b.coperti - a.coperti : a.modulo < b.modulo ? -1 : 1));
	// estrae la stringa ruoli sia da stringa che da oggetto {ruoli|ruolo_mantra|…}
	const estraiRuoli = (r: GiocatoreMantraInput): unknown =>
		typeof r === 'string'
			? r
			: (r?.ruoli ?? r?.ruolo_mantra ?? r?.Ruoli_Mantra_Clean ?? '');
	const portieri = ruoliGiocatori.filter((r) =>
		normalizzaRuoliMantra(estraiRuoli(r)).includes('Por')
	).length;
	return {
		giocatori: ruoliGiocatori.length,
		portieri,
		rosa_minima_ok: ruoliGiocatori.length >= 23 && portieri >= 2,
		giocatori_mancanti: Math.max(0, 23 - ruoliGiocatori.length),
		portieri_mancanti: Math.max(0, 2 - portieri),
		moduli: val,
		moduli_completi: val.filter((v) => v.completo).map((v) => v.modulo),
		migliore: val[0]
	};
}

// ---------------------------------------------------------------------------
// analizza_fragilita_modulo
// ---------------------------------------------------------------------------
export interface Fragilita {
	modulo: string;
	livello: 'SOLIDA' | 'ATTENZIONE' | 'FRAGILE';
	numero_critici: number;
	critici: {
		indice: number;
		chiave: string | number;
		nome: string;
		ruoli: string;
		coperti_senza: number;
		mancanti_senza: string[];
	}[];
	base: EsitoModulo;
}

export function analizzaFragilitaModulo(
	giocatori: GiocatoreMantraInput[],
	modulo: string
): Fragilita {
	const base = assegnaGiocatoriModulo(giocatori, modulo);
	const schierati = base.assegnazioni
		.filter((s) => s.giocatore !== null)
		.map((s) => (s.giocatore as DatiGiocatore).indice as number)
		.sort((a, b) => a - b);
	const critici: Fragilita['critici'] = [];
	for (const indice of schierati) {
		const ridotta = giocatori.filter((_, i) => i !== indice);
		const dopo = assegnaGiocatoriModulo(ridotta, modulo);
		if (dopo.coperti < base.coperti) {
			const dati = preparaGiocatore(giocatori[indice], indice).dati;
			critici.push({
				indice,
				chiave: dati.chiave,
				nome: dati.nome,
				ruoli: dati.ruoli,
				coperti_senza: dopo.coperti,
				mancanti_senza: dopo.mancanti
			});
		}
	}
	const n = critici.length;
	return {
		modulo,
		livello: n === 0 ? 'SOLIDA' : n <= 2 ? 'ATTENZIONE' : 'FRAGILE',
		numero_critici: n,
		critici,
		base
	};
}

// ---------------------------------------------------------------------------
// valuta_candidato_su_moduli
// ---------------------------------------------------------------------------
export function valutaCandidatoSuModuli(
	giocatori: GiocatoreMantraInput[],
	candidato: GiocatoreMantraInput,
	moduliTarget: string[]
) {
	const moduli = [...new Set(moduliTarget)].filter((m) => m in MODULI_MANTRA);
	const dettagli = moduli.map((modulo) => {
		const prima = valutaModuloMantra(giocatori, modulo);
		const dopo = valutaModuloMantra([...giocatori, candidato], modulo);
		return {
			modulo,
			prima,
			dopo,
			delta_copertura: dopo.coperti - prima.coperti,
			completato: !prima.completo && dopo.completo
		};
	});
	return {
		delta_copertura: dettagli.reduce((s, d) => s + d.delta_copertura, 0),
		moduli_completati: dettagli.filter((d) => d.completato).map((d) => d.modulo),
		dettagli
	};
}

// ---------------------------------------------------------------------------
// priorita_ruoli_mantra
// ---------------------------------------------------------------------------
export interface PrioritaRuolo {
	ruolo: RuoloMantra;
	punteggio: number;
	delta_copertura: number;
	moduli_completati: string[];
	fragilita_ridotta: number;
	slot_mancanti_compatibili: number;
}

export function prioritaRuoliMantra(
	giocatori: GiocatoreMantraInput[],
	moduliTarget: string[]
): PrioritaRuolo[] {
	let moduli = [...new Set(moduliTarget)].filter((m) => m in MODULI_MANTRA);
	if (!moduli.length) moduli = Object.keys(MODULI_MANTRA);

	const basePerModulo: Record<string, EsitoModulo> = {};
	for (const m of moduli) basePerModulo[m] = valutaModuloMantra(giocatori, m);
	const fragilitaPrima: Record<string, Fragilita> = {};
	for (const m of moduli)
		if (basePerModulo[m].completo) fragilitaPrima[m] = analizzaFragilitaModulo(giocatori, m);

	const priorita: PrioritaRuolo[] = [];
	for (const ruolo of ORDINE_RUOLI_MANTRA) {
		const candidato = { nome: `Candidato ${ruolo}`, chiave: `candidato-${ruolo}`, ruoli: ruolo, punteggio: 0 };
		const impatto = valutaCandidatoSuModuli(giocatori, candidato, moduli);
		let compatMancanti = 0;
		for (const base of Object.values(basePerModulo))
			for (const slot of base.mancanti) if (opzioniSlot(slot).includes(ruolo)) compatMancanti += 1;
		let fragRidotta = 0;
		for (const fr of Object.values(fragilitaPrima))
			for (const cr of fr.critici)
				if (cr.mancanti_senza.some((slot) => opzioniSlot(slot).includes(ruolo))) fragRidotta += 1;
		const punteggio =
			impatto.moduli_completati.length * 100 +
			impatto.delta_copertura * 10 +
			fragRidotta * 2 +
			compatMancanti;
		priorita.push({
			ruolo,
			punteggio,
			delta_copertura: impatto.delta_copertura,
			moduli_completati: impatto.moduli_completati,
			fragilita_ridotta: fragRidotta,
			slot_mancanti_compatibili: compatMancanti
		});
	}
	return priorita.sort((a, b) =>
		b.punteggio !== a.punteggio ? b.punteggio - a.punteggio : ORDINE_IDX[a.ruolo] - ORDINE_IDX[b.ruolo]
	);
}

// ---------------------------------------------------------------------------
// calcola_scarsita_ruoli_mantra
// ---------------------------------------------------------------------------
export function calcolaScarsitaRuoliMantra(
	giocatoriLiberi: GiocatoreMantraInput[],
	numSquadre = 8,
	sogliaTitolarita = 60
) {
	numSquadre = Math.max(1, Math.trunc(numSquadre));
	const conteggi: Record<string, { liberi: number; affidabili: number }> = {};
	for (const r of ORDINE_RUOLI_MANTRA) conteggi[r] = { liberi: 0, affidabili: 0 };
	giocatoriLiberi.forEach((g, i) => {
		const prep = preparaGiocatore(g, i);
		let tit = 0;
		if (typeof g === 'object' && g !== null) {
			const t = parseFloat(String((g as Record<string, unknown>).titolarita ?? 0));
			tit = Number.isFinite(t) ? t : 0;
		}
		for (const ruolo of prep.ruoli) {
			conteggi[ruolo].liberi += 1;
			if (tit >= sogliaTitolarita) conteggi[ruolo].affidabili += 1;
		}
	});
	return ORDINE_RUOLI_MANTRA.map((ruolo) => {
		const affidabili = conteggi[ruolo].affidabili;
		const perSquadra = affidabili / numSquadre;
		const stato = perSquadra < 0.75 ? 'CRITICA' : perSquadra < 1.25 ? 'STRETTA' : 'OK';
		return { ruolo, liberi: conteggi[ruolo].liberi, affidabili, per_squadra: perSquadra, stato };
	});
}

// ---------------------------------------------------------------------------
// conta_incompatibili_moduli
// ---------------------------------------------------------------------------
export function contaIncompatibiliModuli(
	ruoliGiocatori: unknown[],
	moduliTarget: string[]
): number {
	const moduli = [...new Set(moduliTarget)].filter((m) => m in MODULI_MANTRA);
	if (!moduli.length) return 0;
	const utili = new Set<string>();
	for (const m of moduli) for (const slot of MODULI_MANTRA[m]) for (const r of opzioniSlot(slot)) utili.add(r);
	return ruoliGiocatori.filter((v) => !normalizzaRuoliMantra(v).some((r) => utili.has(r))).length;
}

// ---------------------------------------------------------------------------
// impatto_candidato_mantra
// ---------------------------------------------------------------------------
export function impattoCandidatoMantra(
	ruoliRosa: GiocatoreMantraInput[],
	ruoliCandidato: GiocatoreMantraInput
) {
	const prima = analizzaRosaMantra(ruoliRosa);
	const dopo = analizzaRosaMantra([...ruoliRosa, ruoliCandidato]);
	const cp = new Set(prima.moduli_completi);
	const cd = new Set(dopo.moduli_completi);
	return {
		delta_copertura: dopo.migliore.coperti - prima.migliore.coperti,
		nuovi_moduli_completi: [...cd].filter((m) => !cp.has(m)).sort(),
		migliore_dopo: dopo.migliore
	};
}

// ---------------------------------------------------------------------------
// classifica_profilo_rosa_mantra / analizza_piano_rosa_mantra
// ---------------------------------------------------------------------------
export function classificaProfiloRosaMantra(ruoli: unknown): string {
	const set = new Set(normalizzaRuoliMantra(ruoli));
	for (const [chiave, , ruoliProfilo] of PROFILI_ROSA_MANTRA)
		if (ruoliProfilo.some((r) => set.has(r as RuoloMantra))) return chiave;
	return 'Altro';
}

export function normalizzaPianoRosaMantra(piano?: Record<string, number>): Record<string, number> {
	const p = piano && typeof piano === 'object' ? piano : {};
	const out: Record<string, number> = {};
	for (const [chiave] of PROFILI_ROSA_MANTRA)
		out[chiave] = Math.max(0, Math.trunc(p[chiave] ?? PIANO_ROSA_MANTRA_30[chiave] ?? 0));
	return out;
}

export function analizzaPianoRosaMantra(
	ruoliGiocatori: unknown[],
	piano?: Record<string, number>,
	rosaTotale = 30,
	moduloPrincipale = '3-4-1-2'
) {
	const rg = [...(ruoliGiocatori || [])];
	const obiettivi = normalizzaPianoRosaMantra(piano);
	const conteggi: Record<string, number> = {};
	for (const k of Object.keys(obiettivi)) conteggi[k] = 0;
	let altri = 0;
	for (const ruoli of rg) {
		const profilo = classificaProfiloRosaMantra(ruoli);
		if (profilo in conteggi) conteggi[profilo] += 1;
		else altri += 1;
	}
	const dettagli: Record<string, unknown> = {};
	for (const [chiave, etichetta] of PROFILI_ROSA_MANTRA)
		dettagli[chiave] = {
			etichetta,
			presenti: conteggi[chiave],
			obiettivo: obiettivi[chiave],
			mancanti: Math.max(0, obiettivi[chiave] - conteggi[chiave]),
			eccesso: Math.max(0, conteggi[chiave] - obiettivi[chiave])
		};
	const mp = moduloPrincipale in MODULI_MANTRA ? moduloPrincipale : '3-4-1-2';
	const somma = Object.values(obiettivi).reduce((s, n) => s + n, 0);
	const rt = Math.max(23, Math.trunc(rosaTotale));
	return {
		profili: dettagli,
		obiettivi,
		somma_obiettivi: somma,
		rosa_totale: rt,
		totale_coerente: somma === rt,
		giocatori: rg.length,
		altri,
		modulo_principale: mp,
		copertura_modulo: valutaModuloMantra(rg as GiocatoreMantraInput[], mp)
	};
}

// ---------------------------------------------------------------------------
// calcola_catene_sostituzione_mantra
// ---------------------------------------------------------------------------
function mappaSchierati(esito: EsitoModulo) {
	const m = new Map<string | number, { indice_slot: number; slot: string; giocatore: DatiGiocatore }>();
	for (const a of esito.assegnazioni)
		if (a.giocatore !== null)
			m.set(a.giocatore.chiave, { indice_slot: a.indice_slot, slot: a.slot, giocatore: a.giocatore });
	return m;
}

export function calcolaCateneSostituzioneMantra(giocatori: GiocatoreMantraInput[], modulo: string) {
	if (!(modulo in MODULI_MANTRA)) throw new Error(`modulo Mantra non supportato: ${modulo}`);
	const rosa = giocatori.map((g, i) => preparaGiocatore(g, i).dati);
	const base = assegnaGiocatoriModulo(rosa, modulo);
	const baseSchierati = mappaSchierati(base);
	const catene = [];
	for (const ab of base.assegnazioni) {
		const titolare = ab.giocatore;
		if (titolare === null) continue;
		const chiaveAssente = titolare.chiave;
		const ridotta = rosa.filter((g) => g.chiave !== chiaveAssente);
		const dopo = assegnaGiocatoriModulo(ridotta, modulo);
		const dopoSchierati = mappaSchierati(dopo);
		const entranti = dopo.assegnazioni
			.filter((a) => a.giocatore !== null && !baseSchierati.has(a.giocatore.chiave))
			.map((a) => a.giocatore);
		const spostamenti = [];
		for (const [chiave, nuova] of dopoSchierati) {
			const vecchia = baseSchierati.get(chiave);
			if (vecchia && vecchia.indice_slot !== nuova.indice_slot && vecchia.slot !== nuova.slot)
				spostamenti.push({ giocatore: nuova.giocatore, da: vecchia.slot, a: nuova.slot });
		}
		let alternativa: { modulo: string; coperti: number; completo: boolean; mancanti: string[] } | null = null;
		if (!dopo.completo) {
			const esiti = Object.keys(MODULI_MANTRA)
				.filter((m) => m !== modulo)
				.map((m) => assegnaGiocatoriModulo(ridotta, m));
			let migliore: EsitoModulo | null = null;
			for (const e of esiti) {
				if (
					migliore === null ||
					(Number(e.completo) !== Number(migliore.completo)
						? Number(e.completo) > Number(migliore.completo)
						: e.coperti !== migliore.coperti
							? e.coperti > migliore.coperti
							: e.punteggio > migliore.punteggio)
				)
					migliore = e;
			}
			if (migliore && (migliore.completo || migliore.coperti > dopo.coperti))
				alternativa = {
					modulo: migliore.modulo,
					coperti: migliore.coperti,
					completo: migliore.completo,
					mancanti: migliore.mancanti
				};
		}
		catene.push({
			slot: ab.slot,
			titolare,
			entranti,
			spostamenti,
			coperti_dopo: dopo.coperti,
			copertura_preservata: dopo.coperti === base.coperti,
			resta_completo: dopo.completo,
			mancanti: dopo.mancanti,
			alternativa
		});
	}
	return { modulo, base, catene };
}

// ---------------------------------------------------------------------------
// calcola_matrice_domanda_mantra (rivali Mantra)
// ---------------------------------------------------------------------------
export function calcolaMatriceDomandaMantra(
	roseRuoli: Record<string, unknown[]>,
	opts: { rosaTotale?: number; moduliPreferiti?: Record<string, string[]>; miaSquadra?: string } = {}
) {
	const { rosaTotale = 25, moduliPreferiti = {}, miaSquadra } = opts;
	const totale = Math.max(1, Math.trunc(rosaTotale));
	const cellePerSquadra: Record<string, Record<string, Record<string, unknown>>> = {};

	for (const [squadra, ruoliInput] of Object.entries(roseRuoli)) {
		const ruoli = [...(ruoliInput || [])];
		const slotVuoti = Math.max(0, totale - ruoli.length);
		if (slotVuoti === 0) {
			cellePerSquadra[squadra] = Object.fromEntries(
				ORDINE_RUOLI_MANTRA.map((r) => [r, { stato: 'CHIUSA', slot_vuoti: 0, modulo: null }])
			);
			continue;
		}
		const analisi = analizzaRosaMantra(ruoli as GiocatoreMantraInput[]);
		let moduli = [...new Set(moduliPreferiti[squadra] ?? [])].filter((m) => m in MODULI_MANTRA);
		if (!moduli.length) moduli = [analisi.migliore.modulo];
		const priorita = Object.fromEntries(
			prioritaRuoliMantra(ruoli as GiocatoreMantraInput[], moduli).map((it) => [it.ruolo, it])
		);
		const portieri = analisi.portieri;
		const celle: Record<string, Record<string, unknown>> = {};
		for (const ruolo of ORDINE_RUOLI_MANTRA) {
			const item = priorita[ruolo];
			let stato: string;
			if (ruolo === 'Por') stato = portieri < 2 ? 'ALTA' : portieri < 3 ? 'MEDIA' : 'BASSA';
			else if (item.moduli_completati.length || item.delta_copertura > 0) stato = 'ALTA';
			else if (item.slot_mancanti_compatibili > 0 || item.fragilita_ridotta > 0) stato = 'MEDIA';
			else stato = 'BASSA';
			celle[ruolo] = { stato, slot_vuoti: slotVuoti, modulo: moduli.join('/'), punteggio: item.punteggio };
		}
		cellePerSquadra[squadra] = celle;
	}

	return ORDINE_RUOLI_MANTRA.map((ruolo) => {
		const squadre = Object.fromEntries(
			Object.entries(cellePerSquadra).map(([s, celle]) => [s, celle[ruolo]])
		);
		const rivali = Object.entries(squadre)
			.filter(([s, cella]) => s !== miaSquadra && (cella as Record<string, unknown>).stato !== 'CHIUSA')
			.map(([, cella]) => cella as Record<string, unknown>);
		return {
			ruolo,
			squadre,
			squadre_interessate: rivali.filter((c) => c.stato === 'ALTA' || c.stato === 'MEDIA').length,
			domanda_equivalente: rivali.reduce(
				(s, c) => s + (c.stato === 'ALTA' ? 1.0 : c.stato === 'MEDIA' ? 0.5 : 0.0),
				0
			)
		};
	});
}

// pyRound riesportato per comodità dei consumatori del modulo.
export { pyRound };
