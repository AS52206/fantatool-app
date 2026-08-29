/**
 * Stato centrale dell'asta — local-first.
 * Ogni mutazione persiste immediatamente su localStorage (sincrono, nessun
 * websocket, nessun server). Un crash/refresh riapre esattamente dov'eri.
 * Export/import JSON per backup manuale.
 */
import type { Acquisto, BilancioSquadra, Giocatore, LimitiRuoli, Ruolo, Squadra } from '../domain/types';
import {
	calcolaIndiceInflazioneAsta,
	calcolaPrezzoConsigliatoAvanzato,
	arrotondaCreditoScenario,
	deduciFlagDaFantacrediti,
	MOLTIPLICATORE_DIFESA_DEFAULT
} from '../engine/pricing';
import {
	analizzaPianoDinamico,
	calcolaAllarmiChiusuraAsta,
	calcolaFasciaOperativa,
	calcolaIncidenzeBudget,
	calcolaPoteriAcquisto,
	calcolaScarsitaMercato,
	classificaFaseAsta,
	confrontaScenari,
	costruisciMatriceDomandaClassic,
	profilaRivali,
	raffinaScarsita,
	valutaDecisioneImmediata,
	type BilancioRivale,
	type LiberoLite
} from '../engine/decision';
import { ottimizzaFinaleAsta } from '../engine/endgame';
import {
	analizzaFragilitaModulo,
	analizzaRosaMantra,
	calcolaCateneSostituzioneMantra,
	contaIncompatibiliModuli,
	impattoCandidatoMantra,
	MODULI_MANTRA,
	valutaCandidatoSuModuli,
	type GiocatoreMantraInput
} from '../engine/mantra';

/** Quote di budget per reparto (percentuali), come QUOTE_RUOLO dell'app. */
export const QUOTE_RUOLO: Record<Ruolo, number> = { P: 6, D: 16, C: 30, A: 48 };

// Classic e Mantra sono due aste indipendenti: ognuna ha il suo salvataggio.
const CHIAVE_LEGACY = 'fantatool.asta.v1';
const CHIAVE_ATTIVA = 'fantatool.asta.attiva';
const chiaveMod = (m: string) => `fantatool.asta.${String(m).toLowerCase()}.v1`;
const MODI = ['classic', 'mantra'] as const;
const normModalita = (m: string) =>
	String(m).toLowerCase() === 'mantra' ? 'mantra' : 'classic';

export interface ConfigAsta {
	budgetMax: number;
	limiti: LimitiRuoli;
	squadre: Squadra[];
	stagione: string;
	modalita: string;
	partecipanti: number;
	/** Moduli Mantra su cui valutare i candidati (solo modalità MANTRA). */
	moduliTarget: string[];
}

/** Piano/scenario: nome → { chiave giocatore → prezzo massimo pianificato }. */
export type Scenari = Record<string, Record<string, number>>;

interface Snapshot {
	config: ConfigAsta;
	acquisti: Acquisto[];
	avviata: boolean;
	scenari?: Scenari;
}

const CONFIG_DEFAULT: ConfigAsta = {
	budgetMax: 500,
	limiti: { P: 3, D: 8, C: 8, A: 6, TOT: 25 },
	squadre: [{ nome: 'La mia squadra', isMia: true }],
	stagione: '2026-2027',
	modalita: 'classic',
	partecipanti: 8,
	moduliTarget: ['3-4-1-2']
};

function leggiChiave(chiave: string): Snapshot | null {
	if (typeof localStorage === 'undefined') return null;
	try {
		const raw = localStorage.getItem(chiave);
		return raw ? (JSON.parse(raw) as Snapshot) : null;
	} catch {
		return null;
	}
}

/** Snapshot per una modalità: chiave dedicata, con migrazione dal vecchio unico. */
function caricaMod(modalita: string): Snapshot | null {
	const m = normModalita(modalita);
	const proprio = leggiChiave(chiaveMod(m));
	if (proprio) return proprio;
	// migrazione una tantum dal salvataggio unico legacy
	const legacy = leggiChiave(CHIAVE_LEGACY);
	if (legacy && normModalita(legacy.config?.modalita ?? 'classic') === m) {
		try {
			localStorage.setItem(chiaveMod(m), JSON.stringify(legacy));
			localStorage.removeItem(CHIAVE_LEGACY);
		} catch {
			/* ignora */
		}
		return legacy;
	}
	return null;
}

function modalitaAttiva(): string {
	if (typeof localStorage === 'undefined') return 'classic';
	const salvata = localStorage.getItem(CHIAVE_ATTIVA);
	if (salvata && MODI.includes(salvata as (typeof MODI)[number])) return salvata;
	// se esiste solo il legacy, parti dalla sua modalità
	const legacy = leggiChiave(CHIAVE_LEGACY);
	return normModalita(legacy?.config?.modalita ?? 'classic');
}

export class Asta {
	config = $state<ConfigAsta>(structuredClone(CONFIG_DEFAULT));
	acquisti = $state<Acquisto[]>([]);
	avviata = $state(false);
	giocatori = $state<Giocatore[]>([]);
	scenari = $state<Scenari>({});
	ultimoSalvataggio = $state<number | null>(null);

	/** true durante il caricamento/switch: sospende l'autosave. */
	private caricando = false;

	constructor() {
		const m = modalitaAttiva();
		this.applicaSnapshot(caricaMod(m), m);
		if (typeof localStorage !== 'undefined') localStorage.setItem(CHIAVE_ATTIVA, m);

		// autosave: ogni cambiamento persiste nella chiave della modalità attiva.
		$effect.root(() => {
			$effect(() => {
				const chiave = chiaveMod(this.config.modalita);
				const snap: Snapshot = {
					config: this.config,
					acquisti: this.acquisti,
					avviata: this.avviata,
					scenari: this.scenari
				};
				if (this.caricando) return;
				try {
					localStorage.setItem(chiave, JSON.stringify(snap));
					this.ultimoSalvataggio = Date.now();
				} catch {
					/* quota piena o storage non disponibile: la UI mostra l'avviso */
				}
			});
		});
	}

	/** Carica uno snapshot (o i default) nello store, forzando la modalità. */
	private applicaSnapshot(s: Snapshot | null, modalita: string) {
		const m = normModalita(modalita);
		this.config = {
			...structuredClone(CONFIG_DEFAULT),
			...(s?.config ?? {}),
			modalita: m
		};
		if (![8, 10].includes(this.config.partecipanti)) this.config.partecipanti = 8;
		if (!Array.isArray(this.config.moduliTarget) || !this.config.moduliTarget.length)
			this.config.moduliTarget = ['3-4-1-2'];
		this.acquisti = s?.acquisti ?? [];
		this.avviata = s?.avviata ?? false;
		this.scenari = s?.scenari ?? {};
	}

	private salvaCorrente() {
		if (typeof localStorage === 'undefined') return;
		try {
			localStorage.setItem(
				chiaveMod(this.config.modalita),
				JSON.stringify({
					config: this.config,
					acquisti: this.acquisti,
					avviata: this.avviata,
					scenari: this.scenari
				})
			);
		} catch {
			/* ignora */
		}
	}

	/** Passa a Classic/Mantra: salva l'asta corrente e carica quella dell'altra modalità. */
	cambiaModalita(nuova: string) {
		const m = normModalita(nuova);
		if (m === normModalita(this.config.modalita)) return;
		this.caricando = true;
		this.salvaCorrente();
		this.applicaSnapshot(caricaMod(m), m);
		if (typeof localStorage !== 'undefined') localStorage.setItem(CHIAVE_ATTIVA, m);
		this.caricando = false;
		this.salvaCorrente();
	}

	setGiocatori(g: Giocatore[]) {
		this.giocatori = g;
	}

	get squadreNomi(): string[] {
		return this.config.squadre.map((s) => s.nome);
	}

	/** Chiave da passare a <Crest tipo="stemmi"> per una squadra partecipante. */
	stemmaDi(nome: string): string {
		const sq = this.config.squadre.find((s) => s.nome === nome);
		return sq?.stemma || nome;
	}

	get miaSquadra(): string {
		return this.config.squadre.find((s) => s.isMia)?.nome ?? this.config.squadre[0]?.nome ?? '';
	}

	get giocatoreIdPresi(): Set<number> {
		return new Set(this.acquisti.map((a) => a.giocatoreId));
	}

	/** Bilancio per squadra: crediti rimasti e giocatori presi. */
	get bilanci(): Record<string, BilancioSquadra & { perRuolo: Record<Ruolo, number> }> {
		const out: Record<string, BilancioSquadra & { perRuolo: Record<Ruolo, number> }> = {};
		for (const s of this.config.squadre) {
			out[s.nome] = {
				c_rimasti: this.config.budgetMax,
				g_presi: 0,
				perRuolo: { P: 0, D: 0, C: 0, A: 0 }
			};
		}
		for (const a of this.acquisti) {
			const b = out[a.proprietario];
			if (!b) continue;
			b.c_rimasti -= a.prezzo;
			b.g_presi += 1;
			if (a.ruolo) b.perRuolo[a.ruolo as Ruolo] += 1;
		}
		return out;
	}

	get bilancioGlobalEngine(): Record<string, BilancioSquadra> {
		const b = this.bilanci;
		const out: Record<string, BilancioSquadra> = {};
		for (const k of Object.keys(b)) out[k] = { c_rimasti: b[k].c_rimasti, g_presi: b[k].g_presi };
		return out;
	}

	/** Bilanci arricchiti per il centro decisionale (poteri, slot, spesi per ruolo). */
	get bilanciCompleti(): Record<string, BilancioRivale & { perRuolo: Record<Ruolo, number> }> {
		const RUOLI: Ruolo[] = ['P', 'D', 'C', 'A'];
		const limiti = this.config.limiti;
		const slotTot = limiti.TOT;
		const out: Record<string, BilancioRivale & { perRuolo: Record<Ruolo, number> }> = {};
		for (const s of this.config.squadre) {
			const presi = this.acquisti.filter((a) => a.proprietario === s.nome);
			const spesi: Record<string, number> = {};
			const cnt: Record<Ruolo, number> = { P: 0, D: 0, C: 0, A: 0 };
			for (const a of presi) {
				if (a.ruolo) {
					cnt[a.ruolo as Ruolo] += 1;
					spesi[`spesi_${a.ruolo}`] = (spesi[`spesi_${a.ruolo}`] ?? 0) + a.prezzo;
				}
			}
			const cRimasti = this.config.budgetMax - presi.reduce((x, a) => x + a.prezzo, 0);
			const slotVuoti = Math.max(0, slotTot - presi.length);
			const bilBase: BilancioRivale = {
				c_rimasti: cRimasti,
				slot_vuoti: slotVuoti,
				diff_medio_pct: null,
				P: cnt.P, D: cnt.D, C: cnt.C, A: cnt.A,
				...spesi
			};
			let potereMax = 0;
			for (const r of RUOLI) {
				const p = calcolaPoteriAcquisto(bilBase, r, limiti, this.config.budgetMax, QUOTE_RUOLO);
				bilBase[`potere_ruolo_${r}`] = p.ruolo;
				bilBase[`potere_strategico_${r}`] = p.strategico;
				bilBase[`potere_assoluto_${r}`] = p.assoluto;
				potereMax = Math.max(potereMax, p.assoluto);
			}
			bilBase.potere_max = potereMax;
			out[s.nome] = { ...bilBase, perRuolo: cnt };
		}
		return out;
	}

	private get pmaPerId(): Map<number, number> {
		const m = new Map<number, number>();
		for (const g of this.giocatori) if (g.fc?.pma) m.set(g.id, g.fc.pma);
		return m;
	}

	rosa(squadra: string): (Acquisto & { player?: Giocatore })[] {
		const byId = new Map(this.giocatori.map((g) => [g.id, g]));
		return this.acquisti
			.filter((a) => a.proprietario === squadra)
			.map((a) => ({ ...a, player: byId.get(a.giocatoreId) }));
	}

	// ----------------------------------------------------------------- MANTRA
	get isMantra(): boolean {
		return String(this.config.modalita).toUpperCase() === 'MANTRA';
	}

	/** I ruoli Mantra dei giocatori di una rosa, per i calcoli tattici. */
	rosaMantraInput(
		squadra: string
	): { chiave: string; nome: string; ruoli: string; punteggio: number }[] {
		const byId = new Map(this.giocatori.map((g) => [g.id, g]));
		return this.acquisti
			.filter((a) => a.proprietario === squadra)
			.map((a) => {
				const g = byId.get(a.giocatoreId);
				return {
					chiave: String(a.giocatoreId),
					nome: a.nome,
					ruoli: g?.ruoloMantra ?? '',
					punteggio: g?.fvm || (g?.fc?.expectedFantamedia ?? 0) * 10 || g?.quotazione || 0
				};
			});
	}

	get moduliTargetValidi(): string[] {
		const m = this.config.moduliTarget.filter((x) => x in MODULI_MANTRA);
		return m.length ? m : ['3-4-1-2'];
	}

	/** Analisi Mantra della mia rosa: modulo migliore, copertura, moduli completi. */
	get analisiMiaRosaMantra() {
		return analizzaRosaMantra(this.rosaMantraInput(this.miaSquadra));
	}

	/** Fragilità della mia rosa sul primo modulo target (o sul migliore se non completo). */
	get fragilitaMiaRosaMantra() {
		const an = this.analisiMiaRosaMantra;
		const modulo = this.moduliTargetValidi[0] ?? an.migliore.modulo;
		return analizzaFragilitaModulo(this.rosaMantraInput(this.miaSquadra), modulo);
	}

	/** Catene di sostituzione (chi entra togliendo ogni titolare) sul modulo target. */
	get cateneMiaRosaMantra() {
		const an = this.analisiMiaRosaMantra;
		const modulo = this.moduliTargetValidi[0] ?? an.migliore.modulo;
		return calcolaCateneSostituzioneMantra(this.rosaMantraInput(this.miaSquadra), modulo);
	}

	/** Righe rosa di una squadra per export (CSV / clipboard). */
	rigaExport(squadra: string) {
		const byId = new Map(this.giocatori.map((g) => [g.id, g]));
		return this.acquisti
			.filter((a) => a.proprietario === squadra)
			.sort((x, y) => x.ordine - y.ordine)
			.map((a) => {
				const g = byId.get(a.giocatoreId);
				return {
					ruolo: a.ruolo,
					ruoloMantra: g?.ruoloMantra ?? '',
					nome: a.nome,
					squadra: a.squadraSerieA,
					prezzo: a.prezzo,
					quotazione: g?.quotazione ?? '',
					pma: g?.fc?.pma ?? ''
				};
			});
	}

	/** Tabellone Excel formattato (3 fogli), come fantatool/export_excel.py. */
	async esportaXlsx(): Promise<Blob> {
		const { generaExcelFormattato } = await import('../engine/export_xlsx');
		const { crestBase64 } = await import('../assets');
		const byId = new Map(this.giocatori.map((g) => [g.id, g]));
		const squadre = await Promise.all(
			this.config.squadre.map(async (s) => ({
				name: s.nome,
				crest: await crestBase64(s.stemma || s.nome, 'stemmi')
			}))
		);
		return generaExcelFormattato({
			astaAttiva: `Asta ${this.config.modalita.toUpperCase()}`,
			squadre,
			limitiRuoli: {
				P: this.config.limiti.P,
				D: this.config.limiti.D,
				C: this.config.limiti.C,
				A: this.config.limiti.A
			},
			acquisti: this.acquisti.map((a) => {
				const g = byId.get(a.giocatoreId);
				return {
					ordine: a.ordine,
					assegnatoIl: new Date(a.timestamp).toISOString(),
					nome: a.nome,
					club: a.squadraSerieA,
					ruolo: a.ruolo,
					ruoloMantra: g?.ruoloMantra ?? '',
					proprietario: a.proprietario,
					prezzo: a.prezzo,
					idClean: a.giocatoreId,
					pma: g?.fc?.pma ?? null,
					pfc: g?.fc?.pfc ?? null,
					fase: '',
					fonte: ''
				};
			}),
			budgetIniziale: this.config.budgetMax,
			numSquadre: this.config.squadre.length,
			quoteRuolo: QUOTE_RUOLO
		});
	}

	esportaCsv(squadra?: string): string {
		const squadre = squadra ? [squadra] : this.squadreNomi;
		const righe = ['squadra,ruolo,ruoloMantra,nome,club,prezzo,quotazione,pma'];
		for (const s of squadre)
			for (const r of this.rigaExport(s))
				righe.push(
					[s, r.ruolo, r.ruoloMantra, r.nome, r.squadra, r.prezzo, r.quotazione, r.pma]
						.map((v) => (String(v).includes(',') ? `"${v}"` : String(v)))
						.join(',')
				);
		return righe.join('\n');
	}

	/**
	 * Valutazione completa di un giocatore chiamato all'asta — rispecchia la
	 * pipeline di fantatool/app.py: fallback engine -> PMA/PFC preliminare ->
	 * calcola_fascia_operativa -> decisione immediata + profili rivali.
	 */
	valutazione(g: Giocatore, opts: { flagOverride?: string; prezzoLive?: number } = {}) {
		const budget = this.config.budgetMax;
		const ruolo = (g.ruolo || 'A') as Ruolo;
		const flag = opts.flagOverride ?? deduciFlagDaFantacrediti(g.fc);

		const fallback = calcolaPrezzoConsigliatoAvanzato({
			ruolo: g.ruolo,
			fm: g.fm,
			pg: g.pg,
			quotazione: g.quotazione,
			budgetMax: budget,
			bilancioGlobal: this.acquisti.length ? this.bilancioGlobalEngine : null,
			acquisti: this.acquisti,
			flagManuale: flag,
			listaAllenatori: this.squadreNomi,
			limitiRuoli: this.config.limiti,
			fmOld: g.fmOld,
			pgOld: g.pgOld,
			squadraSerieA: g.squadra,
			miaSquadraScelta: this.miaSquadra,
			quoteRuolo: null,
			moltiplicatoriDifesa: MOLTIPLICATORE_DIFESA_DEFAULT
		});

		// PMA preliminare: preferisci la % Fantalab, poi il PMA Fantacrediti.
		const pmaPct = g.fantalab?.pma_pct ?? 0;
		let fontePma: string;
		let pmaPrelim: number;
		if (pmaPct > 0) {
			pmaPrelim = arrotondaCreditoScenario((pmaPct / 100) * budget);
			fontePma = 'FANTALAB';
		} else {
			pmaPrelim = g.fc?.pma ?? 0;
			fontePma = 'PMA';
		}
		const pfcPrelim = g.fc?.pfc ?? 0;

		const bilanci = this.bilanciCompleti;
		const bMia = bilanci[this.miaSquadra];
		const acquistiLite = this.acquisti.map((a) => ({
			proprietario: a.proprietario,
			ruolo: a.ruolo,
			slot: this.giocatori.find((x) => x.id === a.giocatoreId)?.fc?.slot ?? null
		}));

		// Scarsità di mercato per lo slot del giocatore chiamato.
		const presi = this.giocatoreIdPresi;
		const liberi: LiberoLite[] = this.giocatori
			.filter((x) => !presi.has(x.id))
			.map((x) => ({ id: x.id, ruolo: x.ruolo, slot: x.fc?.slot ?? null }));
		const domandaSquadreRuolo = Object.values(bilanci).filter(
			(b) => (b.perRuolo[ruolo] ?? 0) < (this.config.limiti[ruolo] ?? 0)
		).length;
		const scarsita = raffinaScarsita(
			calcolaScarsitaMercato(liberi, ruolo, g.fc?.slot ?? null, domandaSquadreRuolo, g.id),
			bilanci,
			acquistiLite,
			ruolo,
			this.config.limiti,
			this.miaSquadra
		);

		const slotAssegnatiRuolo = Object.values(bilanci).reduce((s, b) => s + (b.perRuolo[ruolo] ?? 0), 0);
		const fase = classificaFaseAsta(
			slotAssegnatiRuolo,
			this.config.squadre.length * (this.config.limiti[ruolo] ?? 1),
			scarsita.slot !== null ? scarsita.offerta : null,
			scarsita.slot !== null ? scarsita.domanda : null,
			Object.values(bilanci).reduce((s, b) => s + (b.c_rimasti ?? 0), 0),
			this.config.squadre.length * budget
		);
		const indice = calcolaIndiceInflazioneAsta(this.acquisti, this.pmaPerId).indice;

		const fascia = calcolaFasciaOperativa({
			pma: pmaPrelim,
			pfc: pfcPrelim,
			fallback: fallback.prezzo,
			budgetIniziale: budget,
			moltiplicatoreFase: fase.moltiplicatore,
			inflazionePercentuale: indice ?? 0,
			scarsita: scarsita.livello,
			limiteMassimo: Math.max(1, bMia.potere_max ?? budget)
		});
		const fonte = fascia.fonte === 'PMA' && fontePma === 'FANTALAB' ? 'FANTALAB' : fascia.fonte;

		const poteri = calcolaPoteriAcquisto(bMia, ruolo, this.config.limiti, budget, QUOTE_RUOLO);
		const slotRuoloVuoti = Math.max(0, (this.config.limiti[ruolo] ?? 0) - (bMia.perRuolo[ruolo] ?? 0));
		const decisione = valutaDecisioneImmediata({
			prezzoCorrente: opts.prezzoLive ?? fascia.riferimento,
			fasciaMin: fascia.min,
			fasciaMax: fascia.max,
			limiteStrategico: poteri.strategico,
			budgetResiduo: bMia.c_rimasti ?? 0,
			slotVuoti: bMia.slot_vuoti ?? 0,
			slotRuoloVuoti
		});

		const profili = profilaRivali(
			bilanci,
			acquistiLite,
			ruolo,
			g.fc?.slot ?? null,
			this.config.limiti,
			this.miaSquadra,
			fascia.riferimento
		);

		// Impatto tattico Mantra sul giocatore chiamato.
		let mantra: {
			delta_copertura: number;
			nuovi_moduli_completi: string[];
			per_modulo: { modulo: string; delta: number; completato: boolean }[];
		} | null = null;
		if (this.isMantra) {
			const rosaInput = this.rosaMantraInput(this.miaSquadra);
			const cand: GiocatoreMantraInput = {
				chiave: String(g.id),
				nome: g.nome,
				ruoli: g.ruoloMantra,
				punteggio: g.fvm || (g.fc?.expectedFantamedia ?? 0) * 10 || g.quotazione || 0
			};
			const imp = valutaCandidatoSuModuli(rosaInput, cand, this.moduliTargetValidi);
			const glob = impattoCandidatoMantra(
				rosaInput.map((x) => String(x.ruoli ?? '')),
				g.ruoloMantra
			);
			mantra = {
				delta_copertura: imp.delta_copertura,
				nuovi_moduli_completi: glob.nuovi_moduli_completi,
				per_modulo: imp.dettagli.map((d) => ({
					modulo: d.modulo,
					delta: d.delta_copertura,
					completato: d.completato
				}))
			};
		}

		return {
			flag, fallback, fascia, fonte, decisione, poteri, profili, fase, scarsita, mantra,
			indiceInflazione: indice
		};
	}

	/**
	 * Percorsi di chiusura rosa (endgame). Attivo negli ultimi ~10 slot.
	 * prezzo teorico = PMA -> PFC -> quotazione; punteggio = FVM -> FM attesa*10 -> quotazione.
	 */
	get chiusuraFinale() {
		const presi = this.giocatoreIdPresi;
		const b = this.bilanciCompleti[this.miaSquadra];
		const candidati = this.giocatori
			.filter((g) => !presi.has(g.id) && g.ruolo)
			.map((g) => ({
				chiave: String(g.id),
				nome: g.nome,
				ruolo: g.ruolo,
				prezzo: g.fc?.pma || g.fc?.pfc || g.quotazione || 1,
				punteggio: g.fvm || (g.fc?.expectedFantamedia ?? 0) * 10 || g.quotazione || 0,
				fonte_prezzo: g.fc?.pma ? 'PMA' : g.fc?.pfc ? 'PFC' : 'QUOTAZIONE'
			}));
		const rosaMantra = this.isMantra ? this.rosaMantraInput(this.miaSquadra) : undefined;
		return ottimizzaFinaleAsta({
			candidati: this.isMantra
				? this.giocatori
						.filter((g) => !presi.has(g.id) && g.ruoloMantra)
						.map((g) => ({
							chiave: String(g.id),
							nome: g.nome,
							ruoli_mantra: g.ruoloMantra,
							prezzo: g.fc?.pma || g.fc?.pfc || g.quotazione || 1,
							punteggio: g.fvm || (g.fc?.expectedFantamedia ?? 0) * 10 || g.quotazione || 0
						}))
				: candidati,
			budgetResiduo: b.c_rimasti ?? 0,
			slotVuoti: b.slot_vuoti ?? 0,
			modalita: this.config.modalita,
			conteggiRuolo: b.perRuolo,
			limitiRuolo: this.config.limiti,
			rosaMantra,
			moduliTarget: this.isMantra ? this.moduliTargetValidi : undefined
		});
	}

	/** Allarmi di chiusura per la mia squadra. */
	get allarmiChiusura() {
		const b = this.bilanciCompleti[this.miaSquadra];
		let mantraArgs = {};
		if (this.isMantra) {
			const an = this.analisiMiaRosaMantra;
			mantraArgs = {
				portieriMantra: an.portieri,
				moduliCompletiMantra: an.moduli_completi.length,
				miglioreCoperturaMantra: an.migliore.coperti,
				incompatibiliModuli: contaIncompatibiliModuli(
					this.rosaMantraInput(this.miaSquadra).map((x) => String(x.ruoli ?? '')),
					this.moduliTargetValidi
				)
			};
		}
		return calcolaAllarmiChiusuraAsta({
			budgetResiduo: b.c_rimasti ?? 0,
			slotVuoti: b.slot_vuoti ?? 0,
			conteggiRuolo: b.perRuolo,
			limitiRuolo: this.config.limiti,
			modalita: this.config.modalita,
			...mantraArgs
		});
	}

	assegna(g: Giocatore, prezzo: number, proprietario: string) {
		if (this.giocatoreIdPresi.has(g.id)) throw new Error(`${g.nome} è già stato assegnato`);
		const ordine = this.acquisti.reduce((m, a) => Math.max(m, a.ordine), 0) + 1;
		this.acquisti = [
			...this.acquisti,
			{
				giocatoreId: g.id,
				nome: g.nome,
				nomePuro: g.chiave,
				ruolo: g.ruolo,
				squadraSerieA: g.squadra,
				prezzo: Math.max(1, Math.round(prezzo)),
				proprietario,
				ordine,
				timestamp: Date.now()
			}
		];
		this.avviata = true;
	}

	annullaUltimo() {
		if (!this.acquisti.length) return;
		const maxOrdine = this.acquisti.reduce((m, a) => Math.max(m, a.ordine), 0);
		this.acquisti = this.acquisti.filter((a) => a.ordine !== maxOrdine);
	}

	rimuovi(giocatoreId: number) {
		this.acquisti = this.acquisti.filter((a) => a.giocatoreId !== giocatoreId);
	}

	/** Backup completo: entrambe le aste (Classic + Mantra) in un solo file. */
	esporta(): string {
		this.salvaCorrente();
		return JSON.stringify(
			{
				fantatool: 'asta',
				attiva: normModalita(this.config.modalita),
				classic: leggiChiave(chiaveMod('classic')),
				mantra: leggiChiave(chiaveMod('mantra')),
				esportato: new Date().toISOString()
			},
			null,
			2
		);
	}

	importa(json: string) {
		const raw = JSON.parse(json);
		if (raw && (raw.classic !== undefined || raw.mantra !== undefined)) {
			// backup completo: ripristina entrambe le modalità
			this.caricando = true;
			for (const m of MODI) {
				const snap = raw[m] as Snapshot | null;
				if (snap && typeof localStorage !== 'undefined')
					localStorage.setItem(chiaveMod(m), JSON.stringify(snap));
			}
			const attiva = normModalita(raw.attiva ?? this.config.modalita);
			this.applicaSnapshot(caricaMod(attiva), attiva);
			if (typeof localStorage !== 'undefined') localStorage.setItem(CHIAVE_ATTIVA, attiva);
			this.caricando = false;
			return;
		}
		// file a singola modalità (vecchio formato): entra solo in quella modalità
		const s = raw as Snapshot;
		if (!s.config || !Array.isArray(s.acquisti)) throw new Error('File non valido');
		const m = normModalita(s.config.modalita ?? this.config.modalita);
		this.caricando = true;
		this.applicaSnapshot(s, m);
		this.avviata = s.avviata ?? this.acquisti.length > 0;
		if (typeof localStorage !== 'undefined') localStorage.setItem(CHIAVE_ATTIVA, m);
		this.caricando = false;
		this.salvaCorrente();
	}

	/** Azzera SOLO l'asta della modalità corrente. */
	reset() {
		const m = normModalita(this.config.modalita);
		this.applicaSnapshot(null, m);
	}

	// ---------------------------------------------------------------- SCENARI
	private giocatorePerChiave(chiave: string): Giocatore | undefined {
		return this.giocatori.find((g) => g.chiave === chiave || String(g.id) === chiave);
	}

	nuovoScenario(nome?: string): string {
		const base = nome?.trim() || `Piano ${Object.keys(this.scenari).length + 1}`;
		let n = base;
		let i = 2;
		while (n in this.scenari) n = `${base} ${i++}`;
		this.scenari = { ...this.scenari, [n]: {} };
		return n;
	}

	eliminaScenario(nome: string) {
		const { [nome]: _, ...resto } = this.scenari;
		this.scenari = resto;
	}

	rinominaScenario(vecchio: string, nuovo: string) {
		const nome = nuovo.trim();
		if (!nome || nome === vecchio || nome in this.scenari) return;
		const { [vecchio]: piano, ...resto } = this.scenari;
		this.scenari = { ...resto, [nome]: piano ?? {} };
	}

	setTargetScenario(nome: string, chiave: string, prezzoMax: number) {
		const piano = { ...(this.scenari[nome] ?? {}), [chiave]: Math.max(1, Math.round(prezzoMax)) };
		this.scenari = { ...this.scenari, [nome]: piano };
	}

	rimuoviDaScenario(nome: string, chiave: string) {
		const { [chiave]: _, ...piano } = this.scenari[nome] ?? {};
		this.scenari = { ...this.scenari, [nome]: piano };
	}

	/** Righe di uno scenario con nome/ruolo/consigliato risolti dal bundle. */
	righeScenario(nome: string) {
		const piano = this.scenari[nome] ?? {};
		return Object.entries(piano).map(([chiave, max]) => {
			const g = this.giocatorePerChiave(chiave);
			const acq = g ? this.acquisti.find((a) => a.giocatoreId === g.id) : undefined;
			return {
				chiave,
				max,
				giocatore: g,
				nome: g?.nome ?? chiave,
				ruolo: g?.ruolo ?? '',
				ruoloMantra: g?.ruoloMantra ?? '',
				consigliato: g ? this.valutazione(g).fascia.riferimento : null,
				stato: !acq ? 'LIBERO' : acq.proprietario === this.miaSquadra ? 'PRESO' : 'PERSO',
				prezzoEffettivo: acq?.prezzo ?? null,
				proprietario: acq?.proprietario ?? null
			};
		});
	}

	/** Analisi dinamica di uno scenario (analizza_piano_dinamico) col nome-chiave. */
	analisiScenario(nome: string) {
		const piano = this.scenari[nome] ?? {};
		const perChiave: Record<string, number> = {};
		for (const [chiave, max] of Object.entries(piano)) {
			const g = this.giocatorePerChiave(chiave);
			perChiave[g?.chiave ?? chiave] = max;
		}
		const acquistiPiano = this.acquisti.map((a) => {
			const g = this.giocatori.find((x) => x.id === a.giocatoreId);
			return { nome_puro: g?.chiave ?? a.nomePuro, proprietario: a.proprietario, prezzo: a.prezzo };
		});
		return analizzaPianoDinamico(perChiave, acquistiPiano, this.miaSquadra, this.config.budgetMax);
	}

	// ----------------------------------------------------------------- BUDGET
	/** Ripartizione budget per reparto (mia squadra): quota, speso, residuo, poteri. */
	get budgetPerReparto() {
		const bil = this.bilanciCompleti[this.miaSquadra];
		return (['P', 'D', 'C', 'A'] as Ruolo[]).map((r) => {
			const inc = calcolaIncidenzeBudget({
				budgetIniziale: this.config.budgetMax,
				pma: 0,
				pfc: 0,
				fasciaMin: 0,
				fasciaMax: 0,
				riferimento: 0,
				quotaReparto: QUOTE_RUOLO[r],
				spesoReparto: (bil[`spesi_${r}`] as number) ?? 0
			});
			const poteri = calcolaPoteriAcquisto(bil, r, this.config.limiti, this.config.budgetMax, QUOTE_RUOLO);
			return {
				ruolo: r,
				presi: bil.perRuolo[r],
				limite: this.config.limiti[r],
				quota_pct: inc.quota_reparto_pct,
				budget_reparto: inc.budget_reparto,
				speso: inc.speso_reparto,
				residuo: inc.residuo_reparto,
				poteri
			};
		});
	}

	/** Matrice della domanda per ruolo tra i rivali (classic). */
	get matriceDomanda() {
		return costruisciMatriceDomandaClassic(this.bilanciCompleti, this.config.limiti, this.miaSquadra);
	}

	confrontaScenari(a: string, b: string) {
		const ruoli: Record<string, string> = {};
		for (const chiave of [
			...Object.keys(this.scenari[a] ?? {}),
			...Object.keys(this.scenari[b] ?? {})
		]) {
			const g = this.giocatorePerChiave(chiave);
			if (g) ruoli[g.chiave] = g.ruolo;
		}
		const norm = (nome: string) => {
			const p = this.scenari[nome] ?? {};
			const out: Record<string, number> = {};
			for (const [chiave, max] of Object.entries(p))
				out[this.giocatorePerChiave(chiave)?.chiave ?? chiave] = max;
			return out;
		};
		return confrontaScenari(norm(a), norm(b), ruoli, this.config.budgetMax);
	}
}

export const asta = new Asta();
