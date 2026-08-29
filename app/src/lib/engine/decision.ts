/**
 * Porting fedele di fantatool/decision_support.py — calcoli puri del centro
 * decisionale dell'asta. Validato da decision.test.ts contro il modulo Python.
 *
 * Convenzioni: Python int() -> Math.trunc; Python round() -> pyRound (half-to-even).
 */
import { pyRound } from './pyround';

const trunc = Math.trunc;
const clamp = (x: number, lo: number, hi: number) => Math.min(Math.max(x, lo), hi);
function toFloat(v: unknown, def = 0): number {
	const n = typeof v === 'number' ? v : parseFloat(String(v));
	return Number.isFinite(n) ? n : def;
}

// ---------------------------------------------------------------------------
// calcola_fascia_operativa — IL prezzo consigliato mostrato in asta.
// ---------------------------------------------------------------------------
export interface FasciaOperativaInput {
	pma: number | null;
	pfc: number | null;
	fallback: number;
	budgetIniziale: number;
	moltiplicatoreFase?: number;
	inflazionePercentuale?: number;
	scarsita?: string;
	limiteMassimo?: number | null;
}

export interface FasciaOperativa {
	fonte: 'PMA' | 'PFC' | 'FALLBACK';
	pma: number;
	pfc: number;
	base: number;
	riferimento: number;
	min: number;
	max: number;
	fattore_mercato: number;
}

export function calcolaFasciaOperativa(inp: FasciaOperativaInput): FasciaOperativa {
	const {
		pma, pfc, fallback, budgetIniziale,
		moltiplicatoreFase = 1.0, inflazionePercentuale = 0.0,
		scarsita = 'NORMALE', limiteMassimo = null
	} = inp;

	const pmaVal = toFloat(pma, 0);
	const pfcVal = toFloat(pfc, 0);

	let base: number;
	let fonte: FasciaOperativa['fonte'];
	if (pmaVal > 0) {
		base = pmaVal;
		fonte = 'PMA';
	} else if (pfcVal > 0) {
		base = pfcVal;
		fonte = 'PFC';
	} else {
		base = Math.max(1, trunc(fallback));
		fonte = 'FALLBACK';
	}

	const fattoreBudget = Math.max(0.1, budgetIniziale / 500.0);
	const fattoreInflazione = clamp(1.0 + (inflazionePercentuale || 0) / 100.0, 0.85, 1.2);
	const fattoreScarsita = ({ CRITICA: 1.06, ALTA: 1.03 } as Record<string, number>)[
		String(scarsita).toUpperCase()
	] ?? 1.0;
	const fattoreFase = clamp(moltiplicatoreFase || 1.0, 0.94, 1.12);

	let riferimento = Math.max(
		1,
		pyRound(base * fattoreBudget * fattoreInflazione * fattoreScarsita * fattoreFase)
	);
	const limite = limiteMassimo !== null && limiteMassimo !== undefined
		? Math.max(1, trunc(limiteMassimo))
		: null;
	if (limite !== null) riferimento = Math.min(riferimento, limite);

	let minimo = Math.max(1, trunc(pyRound(riferimento * 0.9)));
	let massimo = Math.max(minimo, trunc(pyRound(riferimento * 1.1)));
	if (limite !== null) {
		minimo = Math.min(minimo, limite);
		massimo = Math.min(massimo, limite);
	}

	return {
		fonte,
		pma: pmaVal,
		pfc: pfcVal,
		base: pyRound(base, 1),
		riferimento,
		min: minimo,
		max: massimo,
		fattore_mercato: pyRound(fattoreInflazione * fattoreScarsita * fattoreFase, 3)
	};
}

// ---------------------------------------------------------------------------
// calcola_incidenze_budget
// ---------------------------------------------------------------------------
export interface IncidenzeInput {
	budgetIniziale: number;
	pma: number;
	pfc: number;
	fasciaMin: number;
	fasciaMax: number;
	riferimento: number;
	quotaReparto: number;
	spesoReparto: number;
}

export function calcolaIncidenzeBudget(inp: IncidenzeInput) {
	const budget = Math.max(1, trunc(inp.budgetIniziale));
	const quotaPct = inp.quotaReparto > 1 ? inp.quotaReparto : inp.quotaReparto * 100;
	const budgetReparto = pyRound((budget * quotaPct) / 100);
	const speso = Math.max(0, trunc(inp.spesoReparto));
	const residuo = budgetReparto - speso;
	const perc = (v: number) => pyRound((100 * v) / budget, 1);
	return {
		budget,
		pma_pct: perc(Math.max(0, inp.pma)),
		pfc_pct: perc(Math.max(0, inp.pfc)),
		fascia_min_pct: perc(Math.max(0, trunc(inp.fasciaMin))),
		fascia_max_pct: perc(Math.max(0, trunc(inp.fasciaMax))),
		riferimento_pct: perc(Math.max(0, trunc(inp.riferimento))),
		quota_reparto_pct: pyRound(quotaPct, 1),
		budget_reparto: budgetReparto,
		speso_reparto: speso,
		speso_reparto_pct: perc(speso),
		residuo_reparto: residuo,
		residuo_reparto_pct: perc(residuo)
	};
}

function quotaFrazione(v: number): number {
	const x = toFloat(v, 0);
	return x > 1 ? x / 100.0 : x;
}

// ---------------------------------------------------------------------------
// calcola_poteri_acquisto
// ---------------------------------------------------------------------------
export interface BilancioRivale {
	c_rimasti?: number;
	slot_vuoti?: number;
	potere_max?: number;
	diff_medio_pct?: number | null;
	// P/D/C/A, spesi_X, potere_ruolo_X e simili; il chiamante può aggiungere
	// campi extra (es. perRuolo) senza rompere il tipo.
	[k: string]: unknown;
}

export function calcolaPoteriAcquisto(
	bilancio: BilancioRivale,
	ruolo: string,
	limitiRuoli: Record<string, number>,
	budgetIniziale: number,
	quoteRuolo: Record<string, number>
): { assoluto: number; ruolo: number; strategico: number } {
	ruolo = String(ruolo).toUpperCase();
	const crediti = Math.max(0, trunc(bilancio.c_rimasti ?? 0));
	const slotTotaliVuoti = Math.max(0, trunc(bilancio.slot_vuoti ?? 0));
	const slotRuoloVuoti = Math.max(
		0,
		trunc(limitiRuoli[ruolo] ?? 0) - trunc((bilancio[ruolo] as number) ?? 0)
	);

	const assoluto = Math.max(0, crediti - Math.max(0, slotTotaliVuoti - 1));
	if (slotRuoloVuoti <= 0) return { assoluto, ruolo: 0, strategico: 0 };

	const quotaTotale = pyRound(trunc(budgetIniziale) * quotaFrazione(quoteRuolo[ruolo] ?? 0));
	const residuoFinestra = Math.max(0, quotaTotale - trunc((bilancio[`spesi_${ruolo}`] as number) ?? 0));
	let ruoloMax = Math.max(1, residuoFinestra - Math.max(0, slotRuoloVuoti - 1));
	ruoloMax = Math.min(assoluto, ruoloMax);
	const strategico = Math.min(assoluto, ruoloMax);
	return { assoluto: trunc(assoluto), ruolo: trunc(ruoloMax), strategico: trunc(strategico) };
}

// ---------------------------------------------------------------------------
// classifica_fase_asta
// ---------------------------------------------------------------------------
export interface FaseAsta {
	codice: string;
	etichetta: string;
	progresso: number;
	pressione: number;
	moltiplicatore: number;
	affidabilita: 'ALTA' | 'MEDIA';
}

export function classificaFaseAsta(
	slotAssegnati: number,
	slotTotali: number,
	offertaComparabile: number | null = null,
	domandaEquivalente: number | null = null,
	budgetResiduoLega: number | null = null,
	budgetInizialeLega: number | null = null
): FaseAsta {
	const progresso = (100.0 * Math.max(0, slotAssegnati)) / Math.max(1, slotTotali);
	const pressione =
		offertaComparabile !== null && domandaEquivalente !== null
			? domandaEquivalente / Math.max(1, trunc(offertaComparabile))
			: 0.0;
	const quotaBudget =
		budgetResiduoLega !== null && budgetInizialeLega !== null
			? budgetResiduoLega / Math.max(1, trunc(budgetInizialeLega))
			: null;

	let codice: string, etichetta: string, moltiplicatore: number;
	if (progresso >= 92) [codice, etichetta, moltiplicatore] = ['FINE_REPARTO', 'Fine reparto', 1.08];
	else if ((offertaComparabile !== null && offertaComparabile <= 2) || pressione >= 1.5)
		[codice, etichetta, moltiplicatore] = ['SCARSITA', 'Scarsità', 1.12];
	else if (quotaBudget !== null && quotaBudget <= 0.18)
		[codice, etichetta, moltiplicatore] = ['OCCASIONI_FINALI', 'Occasioni finali', 0.94];
	else if (progresso < 20) [codice, etichetta, moltiplicatore] = ['APERTURA', 'Apertura', 0.98];
	else if (progresso < 60) [codice, etichetta, moltiplicatore] = ['REGOLARE', 'Mercato regolare', 1.0];
	else [codice, etichetta, moltiplicatore] = ['ACCELERAZIONE', 'Accelerazione', 1.05];

	return {
		codice,
		etichetta,
		progresso: pyRound(progresso, 1),
		pressione: pyRound(pressione, 2),
		moltiplicatore,
		affidabilita: slotTotali >= 10 ? 'ALTA' : 'MEDIA'
	};
}

// ---------------------------------------------------------------------------
// profila_rivali
// ---------------------------------------------------------------------------
export interface AcquistoLite {
	proprietario?: string;
	ruolo?: string;
	slot?: number | null; // slot Fantacrediti del giocatore acquistato
}

function migliorSlotSquadra(squadra: string, ruolo: string, acquisti: AcquistoLite[]): number {
	let miglior = 99;
	for (const a of acquisti) {
		if (a.proprietario !== squadra || String(a.ruolo ?? '').toUpperCase() !== ruolo) continue;
		if (a.slot === null || a.slot === undefined) continue;
		const s = trunc(a.slot);
		if (Number.isFinite(s)) miglior = Math.min(miglior, s);
	}
	return miglior;
}

export interface ProfiloRivale {
	squadra: string;
	punteggio: number;
	interesse: 'POTENZIALE' | 'ALTO' | 'MEDIO' | 'BASSO';
	potere: number;
	min: number;
	max: number;
	affidabilita: 'ALTA' | 'MEDIA' | 'BASSA';
	motivo: string;
}

export function profilaRivali(
	bilanci: Record<string, BilancioRivale>,
	acquisti: AcquistoLite[],
	ruolo: string,
	slotTarget: number | null,
	limitiRuoli: Record<string, number>,
	miaSquadra: string,
	riferimentoPrezzo: number
): ProfiloRivale[] {
	ruolo = String(ruolo).toUpperCase();
	const riferimento = Math.max(1, trunc(riferimentoPrezzo));
	const profili: ProfiloRivale[] = [];

	for (const [squadra, bilancio] of Object.entries(bilanci)) {
		if (squadra === miaSquadra) continue;
		const mancanti = Math.max(0, (limitiRuoli[ruolo] ?? 0) - trunc((bilancio[ruolo] as number) ?? 0));
		if (mancanti <= 0) continue;

		const potere = trunc(
			(bilancio[`potere_ruolo_${ruolo}`] as number) ?? (bilancio.potere_max ?? 0)
		);
		const migliorSlot = migliorSlotSquadra(squadra, ruolo, acquisti);
		const necessitaFascia = slotTarget !== null && migliorSlot > slotTarget;
		const profiloSpesa = bilancio.diff_medio_pct;

		let punteggio = 25.0;
		punteggio += Math.min(20.0, (20.0 * mancanti) / Math.max(1, limitiRuoli[ruolo] ?? 1));
		punteggio += Math.min(25.0, (15.0 * potere) / riferimento);
		if (necessitaFascia) punteggio += 20.0;
		else if (slotTarget !== null && migliorSlot <= slotTarget) punteggio -= 15.0;
		if (profiloSpesa !== null && profiloSpesa !== undefined)
			punteggio += Math.max(-10.0, Math.min(10.0, profiloSpesa / 2));
		punteggio = Math.max(0, Math.min(100, pyRound(punteggio)));

		const acquistiRuolo = acquisti.filter(
			(a) => a.proprietario === squadra && String(a.ruolo ?? '').toUpperCase() === ruolo
		).length;
		const affidabilita = acquistiRuolo >= 4 ? 'ALTA' : acquistiRuolo >= 2 ? 'MEDIA' : 'BASSA';
		const interesseCalcolato = punteggio >= 70 ? 'ALTO' : punteggio >= 45 ? 'MEDIO' : 'BASSO';
		const interesse = acquistiRuolo < 2 ? 'POTENZIALE' : interesseCalcolato;

		const centro = Math.min(
			Math.max(1, potere),
			Math.max(1, pyRound(riferimento * (0.55 + (0.5 * punteggio) / 100)))
		);
		const minimo = Math.max(1, pyRound(centro * 0.86));
		const massimo = Math.min(Math.max(1, potere), Math.max(minimo, pyRound(centro * 1.12)));
		const motivi = [`${mancanti} slot ${ruolo} mancanti`];
		if (acquistiRuolo < 2) motivi.push('comportamento non ancora osservabile');
		if (necessitaFascia) motivi.push('fascia ancora scoperta');
		if (profiloSpesa !== null && profiloSpesa !== undefined && profiloSpesa > 15)
			motivi.push('spende sopra le stime');
		if (potere < riferimento) motivi.push('potere limitato');

		profili.push({
			squadra,
			punteggio: trunc(punteggio),
			interesse,
			potere,
			min: trunc(minimo),
			max: trunc(massimo),
			affidabilita,
			motivo: motivi.join(' · ')
		});
	}

	return profili.sort((a, b) =>
		b.punteggio !== a.punteggio ? b.punteggio - a.punteggio : b.potere - a.potere
	);
}

// ---------------------------------------------------------------------------
// calcola_scarsita_mercato + calcola_domanda_slot_rivali (da engine.py)
// ---------------------------------------------------------------------------
export interface LiberoLite {
	id: number;
	ruolo: string;
	slot: number | null;
}

export function calcolaDomandaSlotRivali(
	bilanci: Record<string, BilancioRivale>,
	acquisti: AcquistoLite[],
	ruolo: string,
	slotTarget: number | null,
	limitiRuoli: Record<string, number>,
	miaSquadra: string | null = null
): number {
	ruolo = String(ruolo).toUpperCase();
	let domanda = 0.0;
	for (const [squadra, bilancio] of Object.entries(bilanci)) {
		if (squadra === miaSquadra || ((bilancio[ruolo] as number) ?? 0) >= (limitiRuoli[ruolo] ?? 0))
			continue;
		let migliorSlot = 99;
		for (const a of acquisti) {
			if (a.proprietario !== squadra || String(a.ruolo ?? '').toUpperCase() !== ruolo) continue;
			if (a.slot === null || a.slot === undefined) continue;
			const s = trunc(a.slot);
			if (Number.isFinite(s)) migliorSlot = Math.min(migliorSlot, s);
		}
		domanda += slotTarget !== null && migliorSlot <= slotTarget ? 0.35 : 1.0;
	}
	return pyRound(domanda, 1);
}

export interface Scarsita {
	slot: number | null;
	offerta: number;
	domanda: number;
	pressione: number;
	livello: 'CRITICA' | 'ALTA' | 'NORMALE';
}

function livelloScarsita(offerta: number, pressione: number): Scarsita['livello'] {
	if (offerta <= 2 || pressione >= 1.5) return 'CRITICA';
	if (pressione >= 0.8) return 'ALTA';
	return 'NORMALE';
}

export function calcolaScarsitaMercato(
	liberi: LiberoLite[],
	ruolo: string,
	slotTarget: number | null,
	domandaSquadre: number,
	idTarget = 0
): Scarsita {
	ruolo = String(ruolo).toUpperCase();
	let offerta = 0;
	if (slotTarget !== null) {
		for (const g of liberi) {
			if (String(g.ruolo).toUpperCase() !== ruolo) continue;
			if (idTarget && g.id === idTarget) continue;
			if (g.slot !== null && g.slot !== undefined && trunc(g.slot) === slotTarget) offerta += 1;
		}
	}
	const domanda = Math.max(0, trunc(domandaSquadre));
	const pressione = domanda / Math.max(1, offerta);
	return { slot: slotTarget, offerta, domanda, pressione, livello: livelloScarsita(offerta, pressione) };
}

/** Combina scarsità grezza + domanda pesata per slot, come fa app.py dopo la chiamata. */
export function raffinaScarsita(
	base: Scarsita,
	bilanci: Record<string, BilancioRivale>,
	acquisti: AcquistoLite[],
	ruolo: string,
	limitiRuoli: Record<string, number>,
	miaSquadra: string
): Scarsita {
	if (base.slot === null) return base;
	const domanda = calcolaDomandaSlotRivali(bilanci, acquisti, ruolo, base.slot, limitiRuoli, miaSquadra);
	const pressione = domanda / Math.max(1, base.offerta);
	return { ...base, domanda, pressione, livello: livelloScarsita(base.offerta, pressione) };
}

// ---------------------------------------------------------------------------
// valuta_decisione_immediata — COMPRA / VALUTA / LASCIA
// ---------------------------------------------------------------------------
export interface DecisioneInput {
	prezzoCorrente: number;
	fasciaMin: number;
	fasciaMax: number;
	limiteStrategico: number;
	massimoPersonale?: number;
	budgetResiduo: number;
	slotVuoti: number;
	slotRuoloVuoti: number;
}

export function valutaDecisioneImmediata(inp: DecisioneInput) {
	const prezzo = Math.max(1, trunc(inp.prezzoCorrente));
	const minimo = Math.max(1, trunc(inp.fasciaMin));
	const massimoFascia = Math.max(minimo, trunc(inp.fasciaMax));
	const strategico = Math.max(0, trunc(inp.limiteStrategico));
	const personale = Math.max(0, trunc(inp.massimoPersonale ?? 0));
	const budget = Math.max(0, trunc(inp.budgetResiduo));
	const vuoti = Math.max(0, trunc(inp.slotVuoti));
	const vuotiRuolo = Math.max(0, trunc(inp.slotRuoloVuoti));

	const tetti = [massimoFascia];
	if (strategico > 0) tetti.push(strategico);
	if (personale > 0) tetti.push(personale);
	const massimoOperativo = Math.min(...tetti);

	const budgetDopo = budget - prezzo;
	const slotDopo = Math.max(0, vuoti - 1);
	const minimoSlot = slotDopo;
	const liberoReale = budgetDopo - minimoSlot;
	const rosaCompletabile = vuoti > 0 && vuotiRuolo > 0 && budgetDopo >= minimoSlot;

	let azione: 'COMPRA' | 'VALUTA' | 'LASCIA';
	let motivo: string;
	if (vuotiRuolo <= 0) [azione, motivo] = ['LASCIA', 'slot del ruolo gia\' completo'];
	else if (!rosaCompletabile) [azione, motivo] = ['LASCIA', 'non consente di completare la rosa'];
	else if (prezzo > massimoOperativo) [azione, motivo] = ['LASCIA', 'supera il massimo operativo'];
	else if (prezzo <= minimo) [azione, motivo] = ['COMPRA', 'prezzo nella zona conveniente'];
	else [azione, motivo] = ['VALUTA', 'prezzo sostenibile ma non conveniente'];

	return {
		azione,
		motivo,
		prezzo_corrente: prezzo,
		massimo_operativo: trunc(massimoOperativo),
		budget_dopo: trunc(budgetDopo),
		slot_dopo: trunc(slotDopo),
		minimo_slot: trunc(minimoSlot),
		libero_reale: trunc(liberoReale),
		rosa_completabile: rosaCompletabile
	};
}

// ---------------------------------------------------------------------------
// costruisci_matrice_domanda_classic
// ---------------------------------------------------------------------------
export function costruisciMatriceDomandaClassic(
	bilanci: Record<string, BilancioRivale>,
	limitiRuolo: Record<string, number>,
	miaSquadra: string
) {
	const risultato = [];
	for (const ruolo of ['P', 'D', 'C', 'A'] as const) {
		const limite = Math.max(0, trunc(limitiRuolo[ruolo] ?? 0));
		const squadre: Record<string, { mancanti: number; stato: string; potere: number }> = {};
		let domandaRivali = 0;
		let squadreInteressate = 0;
		for (const [squadra, bilancio] of Object.entries(bilanci)) {
			const mancanti = Math.max(0, limite - trunc((bilancio[ruolo] as number) ?? 0));
			let stato: string;
			if (mancanti === 0) stato = 'COPERTA';
			else if (limite && mancanti / limite >= 0.5) stato = 'ALTA';
			else stato = 'MEDIA';
			squadre[squadra] = { mancanti, stato, potere: Math.max(0, trunc(bilancio.potere_max ?? 0)) };
			if (squadra !== miaSquadra && mancanti > 0) {
				domandaRivali += mancanti;
				squadreInteressate += 1;
			}
		}
		risultato.push({ ruolo, squadre, domanda_rivali: domandaRivali, squadre_interessate: squadreInteressate });
	}
	return risultato;
}

// ---------------------------------------------------------------------------
// confronta_candidati
// ---------------------------------------------------------------------------
export interface CandidatoConfronto {
	nome?: string;
	fm?: number;
	prezzo?: number;
	titolarita?: number | null;
	rischio?: boolean;
	[k: string]: unknown;
}

export function confrontaCandidati(candidati: CandidatoConfronto[]) {
	const righe = candidati.map((c) => {
		const nome = String(c.nome ?? '?');
		const fm = toFloat(c.fm, 0);
		const prezzo = Math.max(1.0, toFloat(c.prezzo ?? 1, 1));
		const titolarita = c.titolarita === null || c.titolarita === undefined ? 50.0 : toFloat(c.titolarita);
		const rischio = Boolean(c.rischio);
		return {
			...c,
			nome,
			fm,
			prezzo: pyRound(prezzo),
			valore: pyRound(fm / prezzo, 3),
			sicurezza: pyRound(titolarita + fm * 2 - (rischio ? 30 : 0), 1)
		};
	});
	if (!righe.length) return { righe: [], vincitori: {} };
	const maxBy = <T>(arr: T[], f: (x: T) => number) => arr.reduce((a, b) => (f(b) > f(a) ? b : a));
	return {
		righe,
		vincitori: {
			qualita: maxBy(righe, (x) => x.fm).nome,
			valore: maxBy(righe, (x) => x.valore).nome,
			sicurezza: maxBy(righe, (x) => x.sicurezza).nome
		}
	};
}

// ---------------------------------------------------------------------------
// calcola_allarmi_chiusura_asta
// ---------------------------------------------------------------------------
export interface AllarmiInput {
	budgetResiduo: number;
	slotVuoti: number;
	conteggiRuolo: Record<string, number>;
	limitiRuolo: Record<string, number>;
	modalita?: string;
	portieriMantra?: number;
	minPortieriMantra?: number;
	moduliCompletiMantra?: number;
	miglioreCoperturaMantra?: number;
	incompatibiliModuli?: number;
}

export interface Avviso {
	livello: 'OK' | 'ATTENZIONE' | 'CRITICO';
	codice: string;
	testo: string;
}

export function calcolaAllarmiChiusuraAsta(inp: AllarmiInput) {
	const budget = Math.max(0, trunc(inp.budgetResiduo));
	const vuoti = Math.max(0, trunc(inp.slotVuoti));
	const minimo = vuoti;
	const massimoProssimo = vuoti ? Math.max(0, budget - Math.max(0, vuoti - 1)) : 0;
	const modalita = String(inp.modalita ?? 'CLASSIC').toUpperCase();
	const {
		portieriMantra = 0, minPortieriMantra = 2, moduliCompletiMantra = 0,
		miglioreCoperturaMantra = 0, incompatibiliModuli = 0
	} = inp;

	const ruoliMancanti: Record<string, number> = {};
	for (const [ruolo, limite] of Object.entries(inp.limitiRuolo)) {
		if (!['P', 'D', 'C', 'A'].includes(ruolo)) continue;
		const m = Math.max(0, trunc(limite) - trunc(inp.conteggiRuolo[ruolo] ?? 0));
		if (m > 0) ruoliMancanti[ruolo] = m;
	}

	const avvisi: Avviso[] = [];
	const aggiungi = (livello: Avviso['livello'], codice: string, testo: string) =>
		avvisi.push({ livello, codice, testo });

	if (vuoti === 0) aggiungi('OK', 'ROSA_COMPLETA', 'Rosa completa: nessun credito da riservare.');
	else if (budget < minimo)
		aggiungi('CRITICO', 'BUDGET_INSUFFICIENTE', `Mancano ${minimo - budget} crediti per comprare ${vuoti} giocatori a 1 credito.`);
	else if (budget === minimo)
		aggiungi('CRITICO', 'SOLO_UN_CREDITO', `Restano ${vuoti} acquisti possibili soltanto a 1 credito.`);
	else if (massimoProssimo <= 3)
		aggiungi('ATTENZIONE', 'MARGINE_MINIMO', `Il prossimo rilancio non puo' superare ${massimoProssimo} crediti.`);

	if (modalita === 'MANTRA') {
		const portieriMancanti = Math.max(0, trunc(minPortieriMantra) - trunc(portieriMantra));
		if (portieriMancanti)
			aggiungi(vuoti <= 5 ? 'CRITICO' : 'ATTENZIONE', 'PORTIERI_MANTRA', `Mancano ${portieriMancanti} portieri per il minimo Mantra.`);
		if (vuoti <= 5 && vuoti > 0 && trunc(moduliCompletiMantra) === 0) {
			const livello = trunc(miglioreCoperturaMantra) < 10 ? 'CRITICO' : 'ATTENZIONE';
			aggiungi(livello, 'MODULO_NON_COMPLETO', `Nessun modulo completo: il migliore copre ${trunc(miglioreCoperturaMantra)}/11.`);
		}
		if (vuoti <= 8 && trunc(incompatibiliModuli) >= 3)
			aggiungi('ATTENZIONE', 'INCOMPATIBILI', `${trunc(incompatibiliModuli)} giocatori non entrano nei due moduli fissati.`);
	} else if (vuoti <= 5 && vuoti > 0) {
		if (ruoliMancanti.P)
			aggiungi('CRITICO', 'PORTIERE_MANCANTE', `Mancano ${ruoliMancanti.P} portieri obbligatori.`);
		const altri = Object.entries(ruoliMancanti).filter(([r, n]) => r !== 'P' && n > 0);
		if (altri.length) {
			const testo = altri.map(([r, n]) => `${r} +${n}`).join(', ');
			aggiungi('ATTENZIONE', 'RUOLI_MANCANTI', `Slot ancora obbligatori: ${testo}.`);
		}
	}

	const ordine: Record<string, number> = { OK: 0, ATTENZIONE: 1, CRITICO: 2 };
	const livello = avvisi.length
		? avvisi.reduce((a, b) => (ordine[b.livello] > ordine[a.livello] ? b : a)).livello
		: 'OK';
	return {
		livello,
		minimo_completamento: minimo,
		massimo_prossimo: massimoProssimo,
		margine_libero: budget - minimo,
		ruoli_mancanti: ruoliMancanti,
		avvisi
	};
}

// ---------------------------------------------------------------------------
// confronta_scenari
// ---------------------------------------------------------------------------
export function confrontaScenari(
	pianoA: Record<string, number>,
	pianoB: Record<string, number>,
	ruoli: Record<string, string> = {},
	budgetIniziale = 500
) {
	const budget = Math.max(1, trunc(budgetIniziale));
	const riepilogo = (piano: Record<string, number>) => {
		const spesaRuolo: Record<string, number> = { P: 0, D: 0, C: 0, A: 0 };
		const conteggioRuolo: Record<string, number> = { P: 0, D: 0, C: 0, A: 0 };
		let totale = 0;
		for (const [nome, crediti] of Object.entries(piano)) {
			const prezzo = Math.max(0, trunc(crediti));
			totale += prezzo;
			const ruolo = String(ruoli[nome] ?? '?').trim().toUpperCase();
			if (ruolo in spesaRuolo) {
				spesaRuolo[ruolo] += prezzo;
				conteggioRuolo[ruolo] += 1;
			}
		}
		return {
			totale,
			residuo: budget - totale,
			percentuale: pyRound((100 * totale) / budget, 1),
			giocatori: Object.keys(piano).length,
			spesa_ruolo: spesaRuolo,
			conteggio_ruolo: conteggioRuolo
		};
	};
	const nomiA = new Set(Object.keys(pianoA));
	const nomiB = new Set(Object.keys(pianoB));
	const sintesiA = riepilogo(pianoA);
	const sintesiB = riepilogo(pianoB);
	const inter = [...nomiA].filter((n) => nomiB.has(n)).sort();
	const variazioni: Record<string, number> = {};
	for (const nome of inter)
		if (trunc(pianoB[nome]) !== trunc(pianoA[nome])) variazioni[nome] = trunc(pianoB[nome]) - trunc(pianoA[nome]);
	return {
		a: sintesiA,
		b: sintesiB,
		delta_crediti: sintesiB.totale - sintesiA.totale,
		comuni: inter,
		solo_a: [...nomiA].filter((n) => !nomiB.has(n)).sort(),
		solo_b: [...nomiB].filter((n) => !nomiA.has(n)).sort(),
		variazioni_comuni: variazioni
	};
}

// ---------------------------------------------------------------------------
// analizza_piano_dinamico
// ---------------------------------------------------------------------------
export interface AcquistoPiano {
	nome_puro?: string;
	proprietario?: string;
	prezzo?: number;
}

export function analizzaPianoDinamico(
	piano: Record<string, number>,
	acquisti: AcquistoPiano[],
	miaSquadra: string,
	budgetRiferimento: number
) {
	const perNome = new Map<string, AcquistoPiano>();
	for (const a of acquisti) perNome.set(String(a.nome_puro ?? '').trim().toLowerCase(), a);

	const righe = [];
	const conteggi = { presi: 0, persi: 0, liberi: 0 };
	let budgetPianificatoLibero = 0;
	let priorita = 0;
	for (const [nome, massimo] of Object.entries(piano)) {
		priorita += 1;
		const acquisto = perNome.get(String(nome).trim().toLowerCase());
		let stato: string, prezzo: number;
		if (acquisto === undefined) {
			stato = 'LIBERO';
			prezzo = trunc(massimo);
			budgetPianificatoLibero += prezzo;
			conteggi.liberi += 1;
		} else if (acquisto.proprietario === miaSquadra) {
			stato = 'PRESO';
			prezzo = trunc(acquisto.prezzo ?? 0);
			conteggi.presi += 1;
		} else {
			stato = 'PERSO';
			prezzo = trunc(acquisto.prezzo ?? 0);
			conteggi.persi += 1;
		}
		righe.push({
			priorita,
			nome,
			massimo: trunc(massimo),
			stato,
			prezzo_effettivo: prezzo,
			proprietario: acquisto ? (acquisto.proprietario ?? null) : null
		});
	}
	const liberi = righe.filter((r) => r.stato === 'LIBERO');
	const totalePiano = Object.values(piano).reduce((s, m) => s + trunc(m), 0);
	return {
		righe,
		conteggi,
		prossimo_target: liberi.length ? liberi[0].nome : null,
		budget_pianificato_libero: budgetPianificatoLibero,
		margine: trunc(budgetRiferimento) - totalePiano,
		realizzabile: totalePiano <= trunc(budgetRiferimento)
	};
}

// ---------------------------------------------------------------------------
// valuta_affidabilita_giocatore
// ---------------------------------------------------------------------------
export interface AffidabilitaInput {
	idUfficiale: number | null;
	ruoloPresente: boolean;
	presenzeCorrenti: number;
	storicoDisponibile: boolean;
	pma: number | null;
	pfc: number | null;
	mercatoAperto: boolean;
	manuale?: boolean;
	ruoloCorrettoManualmente?: boolean;
}

export function valutaAffidabilitaGiocatore(inp: AffidabilitaInput) {
	const idValido = trunc(inp.idUfficiale ?? 0) > 0;
	const pmaValido = toFloat(inp.pma, 0) > 0;
	const pfcValido = toFloat(inp.pfc, 0) > 0;
	const manuale = Boolean(inp.manuale);
	const ufficiale = idValido && Boolean(inp.ruoloPresente) && !manuale;
	const proiezione = pmaValido || pfcValido;
	const presenze = Math.max(0, trunc(inp.presenzeCorrenti || 0));
	const ruoloIncerto = manuale || !inp.ruoloPresente || Boolean(inp.ruoloCorrettoManualmente);
	const insufficiente = !proiezione && !inp.storicoDisponibile && presenze < 3;

	const tag: string[] = [];
	if (ufficiale) tag.push('UFFICIALE');
	if (inp.storicoDisponibile) tag.push('STORICO');
	if (proiezione) tag.push('PROIEZIONE');
	if (inp.mercatoAperto) tag.push('MERCATO APERTO');
	if (ruoloIncerto) tag.push('RUOLO DA CONFERMARE');
	if (insufficiente) tag.push('DATI INSUFFICIENTI');

	let livello: 'ALTA' | 'MEDIA' | 'BASSA';
	if (insufficiente || ruoloIncerto || !ufficiale) livello = 'BASSA';
	else if (inp.mercatoAperto || presenze < 3)
		livello = inp.storicoDisponibile || proiezione ? 'MEDIA' : 'BASSA';
	else if (proiezione && (inp.storicoDisponibile || presenze >= 5)) livello = 'ALTA';
	else livello = 'MEDIA';

	return {
		livello,
		tag,
		ufficiale,
		storico: Boolean(inp.storicoDisponibile),
		proiezione,
		mercato_aperto: Boolean(inp.mercatoAperto),
		ruolo_da_confermare: ruoloIncerto,
		dati_insufficienti: insufficiente
	};
}
