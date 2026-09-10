import { checkPurchase } from '../engine/operation';
import { identifyTeams } from '../persistence/teams';
import { WriterLock } from '../persistence/writerLock';
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
import { ottimizzaFinaleAsta, type OttimizzaInput, type OttimizzaResult } from '../engine/endgame';
import { EndgameClient } from '../engine/endgameClient';
import {
	analizzaFragilitaModulo,
	analizzaRosaMantra,
	calcolaCateneSostituzioneMantra,
	calcolaScarsitaRuoliMantra,
	contaIncompatibiliModuli,
	impattoCandidatoMantra,
	MODULI_MANTRA,
	valutaCandidatoSuModuli,
	type GiocatoreMantraInput
} from '../engine/mantra';
import {
	allertaRuoliChiave,
	giocatoriPerno,
	raccomandaFamiglie
} from '../mantraHints';

/** Quote di budget per reparto (percentuali), come QUOTE_RUOLO dell'app. */
export const QUOTE_RUOLO: Record<Ruolo, number> = { P: 6, D: 16, C: 30, A: 48 };

/** Palette di ripiego per l'identità colore delle squadre. */
export const PALETTE_SQUADRE = [
	'#5eff9c', '#5ce1ff', '#ffcd4d', '#ff6b6b', '#c084fc',
	'#fb923c', '#4ade80', '#38bdf8', '#f472b6', '#a3e635',
	'#facc15', '#f87171', '#2dd4bf', '#818cf8', '#e879f9', '#fdba74'
];

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
	/** Modulo scelto per ogni piano (nome piano → modulo). Indipendente per piano. */
	scenariModulo?: Record<string, string>;
	/** Coda chiamate: id dei giocatori che stai per chiamare / aspettando. */
	codaChiamate?: number[];
}

interface RingItem {
	t: number;
	n: number;
	snap: Snapshot;
}
const chiaveRing = (m: string) => `${chiaveMod(m)}.ring`;
const MAX_RING = 15;
const MAX_STORIA = 60;

const CONFIG_DEFAULT: ConfigAsta = {
	budgetMax: 500,
	limiti: { P: 3, D: 8, C: 8, A: 6, TOT: 25 },
	squadre: [{ nome: 'La mia squadra', isMia: true }],
	stagione: '2026-2027',
	modalita: 'classic',
	partecipanti: 8,
	moduliTarget: ['3-4-1-2']
};

/** Rosa Mantra standard: 3 portieri + 27 di movimento = 30. */
const LIMITI_MANTRA_DEFAULT: LimitiRuoli = { P: 3, D: 11, C: 8, A: 8, TOT: 30 };

function leggiChiave(chiave: string): Snapshot | null {
	if (typeof localStorage === 'undefined') return null;
	const raw = localStorage.getItem(chiave);
	return raw ? (JSON.parse(raw) as Snapshot) : null;
}

/** Snapshot per una modalità: chiave dedicata, con migrazione dal vecchio unico. */
function caricaMod(modalita: string): Snapshot | null {
	const m = normModalita(modalita);
	const proprio = leggiChiave(chiaveMod(m));
	if (proprio) return proprio;
	// migrazione una tantum dal salvataggio unico legacy
	const legacy = leggiChiave(CHIAVE_LEGACY);
	if (legacy && normModalita(legacy.config?.modalita ?? 'classic') === m) {
		return legacy;
	}
	return null;
}

function modalitaAttiva(): string {
	if (typeof localStorage === 'undefined') return 'classic';
	let salvata: string | null = null;
	try { salvata = localStorage.getItem(CHIAVE_ATTIVA); } catch { return 'classic'; }
	if (salvata && MODI.includes(salvata as (typeof MODI)[number])) return salvata;
	// se esiste solo il legacy, parti dalla sua modalità
	try { return normModalita(leggiChiave(CHIAVE_LEGACY)?.config?.modalita ?? 'classic'); } catch { return 'classic'; }
}

export class Asta {
	config = $state<ConfigAsta>(structuredClone(CONFIG_DEFAULT));
	acquisti = $state<Acquisto[]>([]);
	avviata = $state(false);
	giocatori = $state<Giocatore[]>([]);
	scenari = $state<Scenari>({});
	/** Modulo scelto per ogni piano — indipendente da piano a piano. */
	scenariModulo = $state<Record<string, string>>({});
	codaChiamate = $state<number[]>([]);
	ultimoSalvataggio = $state<number | null>(null);
	/** Messaggio d'errore se l'ultima scrittura su localStorage è fallita (quota/privato). */
	erroreSalvataggio = $state<string | null>(null);
	/** true se un'altra scheda ha modificato la stessa asta: questa è ormai disallineata. */
	altraSchedaAttiva = $state(true);
	recuperoNecessario = $state(false);
	private writer = new WriterLock();
	private disposeEffects?: () => void;
	private storageListener?: (e: StorageEvent) => void;
	private lastSaved = "";
	/** Only results for the current auction input are displayed. */
	private chiusuraStato = $state<OttimizzaResult>({ attivo: false, stato: "ATTESA", motivo: "Preparazione dei percorsi…", percorsi: [] });
	private endgameRevision = 0;
	private endgameClient: EndgameClient | null = null;

	/** true durante il caricamento/switch: sospende l'autosave. */
	private caricando = false;

	/** Cronologia acquisti per annulla/ripeti (solo sessione, non persistita). */
	private storiaUndo = $state<Acquisto[][]>([]);
	private storiaRedo = $state<Acquisto[][]>([]);
	/** Ultimo contenuto salvato nel ring di backup. */
	private ultimoRingN = "";

	constructor() {
		const m = modalitaAttiva();
		try { this.applicaSnapshot(caricaMod(m), m); }
		catch (e) { this.recuperoNecessario = true; this.erroreSalvataggio = `Salvataggio non leggibile: ripristina un backup. ${String(e)}`; }

		// autosave: ogni cambiamento persiste nella chiave della modalità attiva.
		this.disposeEffects = $effect.root(() => {
			$effect(() => {
				const snap: Snapshot = {
					config: this.config,
					acquisti: this.acquisti,
					avviata: this.avviata,
					scenari: this.scenari,
					scenariModulo: this.scenariModulo,
					codaChiamate: this.codaChiamate
				};
				if (this.caricando || this.altraSchedaAttiva) return;
				this.persisti(snap);
			});

			// Serialize reactive proxies before postMessage; never calculate a heavy fallback on the UI thread.
			$effect(() => {
				const input: OttimizzaInput = JSON.parse(JSON.stringify(this.chiusuraInput));
				const revision = ++this.endgameRevision;
				const vuoti = Math.max(0, Math.trunc(input.slotVuoti));
				if (vuoti === 0 || vuoti > (input.sogliaAttivazione ?? 10) || input.budgetResiduo < vuoti) {
					this.chiusuraStato = ottimizzaFinaleAsta(input); // only constant-time early exits
					return;
				}
				this.chiusuraStato = { attivo: false, stato: 'ATTESA', motivo: 'Calcolo dei percorsi in corso…', percorsi: [] };
				(this.endgameClient ??= new EndgameClient()).compute(input,
					(result) => { if (revision === this.endgameRevision) this.chiusuraStato = result; },
					() => { if (revision === this.endgameRevision) this.chiusuraStato = {
						attivo: false, stato: 'ERRORE', motivo: 'Percorsi non disponibili. Puoi continuare a registrare l’asta.', percorsi: []
					}; }
				);
			});
		});

		// Un'altra scheda che scrive sulla stessa asta rende questa disallineata:
		// l'evento `storage` scatta solo nelle altre schede, mai in quella che scrive.
		if (typeof window !== 'undefined') {
			this.storageListener = (e) => {
				if (this.caricando) return;
				if (e.key === chiaveMod(this.config.modalita) && !this.altraSchedaAttiva) {
					// Also stop on writes from an older app that does not honor Web Locks.
					this.altraSchedaAttiva = true;
					this.writer.dispose();
				}
			};
			window.addEventListener('storage', this.storageListener);
		}
	}

	async attivaScrittura() {
		if (typeof navigator === 'undefined' || !navigator.locks) {
			this.erroreSalvataggio = 'Questo browser non supporta la protezione dell’asta. Apri Chrome o Brave aggiornato.';
			return;
		}
		try {
			await this.writer.acquire(navigator.locks, () => {
				const m = modalitaAttiva();
				try { this.applicaSnapshot(caricaMod(m), m); this.recuperoNecessario = false; }
				catch (e) { this.recuperoNecessario = true; this.erroreSalvataggio = `Salvataggio non leggibile: ripristina un backup. ${String(e)}`; }
				this.altraSchedaAttiva = false;
				this.salvaCorrente();
			});
		} catch (e) { this.erroreSalvataggio = String(e); }
	}

	dispose() {
		this.altraSchedaAttiva = true;
		this.writer.dispose();
		this.disposeEffects?.();
		this.endgameRevision++;
		this.endgameClient?.dispose();
		this.endgameClient = null;
		if (this.storageListener && typeof window !== 'undefined') window.removeEventListener('storage', this.storageListener);
	}

	private verificaScrittura(ripristino = false) {
		if (this.recuperoNecessario && !ripristino) throw new Error("Ripristina un backup prima di modificare l’asta.");
		if (this.altraSchedaAttiva) throw new Error('Questa scheda è di sola lettura. Attiva qui l’asta dopo aver chiuso l’altra scheda.');
	}

	ricaricaDaStorage() {
		if (!this.altraSchedaAttiva) return;
		this.applicaSnapshot(caricaMod(this.config.modalita), this.config.modalita);
	}

	private snapshot(): Snapshot {
		return { config: this.config, acquisti: this.acquisti, avviata: this.avviata,
			scenari: this.scenari, scenariModulo: this.scenariModulo, codaChiamate: this.codaChiamate };
	}

	private persisti(snap: Snapshot) {
		if (this.altraSchedaAttiva || this.recuperoNecessario) return;
		try {
			const json = JSON.stringify(snap);
			const key = chiaveMod(snap.config.modalita);
			if (this.lastSaved !== key + json) {
				localStorage.setItem(key, json);
				this.lastSaved = key + json;
				this.ultimoSalvataggio = Date.now();
				this.aggiornaRing(snap);
			}
			localStorage.setItem(CHIAVE_ATTIVA, normModalita(snap.config.modalita));
			this.erroreSalvataggio = null;
		} catch {
			this.erroreSalvataggio = 'Salvataggio nel browser non riuscito: scarica subito un backup.';
		}
	}

	/** Carica uno snapshot (o i default) nello store, forzando la modalità. */
	private applicaSnapshot(s: Snapshot | null, modalita: string) {
		const m = normModalita(modalita);
		if (s) this.validaSnapshot(s);
		const identified = identifyTeams(s?.config.squadre ?? structuredClone(CONFIG_DEFAULT.squadre), s?.acquisti ?? []);
		this.config = {
			...structuredClone(CONFIG_DEFAULT),
			// asta Mantra nuova: parte da 3 portieri + 27 di movimento
			...(!s && m === 'mantra' ? { limiti: { ...LIMITI_MANTRA_DEFAULT } } : {}),
			...(s?.config ?? {}),
			modalita: m
		};
		if (![8, 10].includes(this.config.partecipanti)) this.config.partecipanti = 8;
		if (!Array.isArray(this.config.moduliTarget) || !this.config.moduliTarget.length)
			this.config.moduliTarget = ['3-4-1-2'];
		this.ricalcolaTot();
		this.config.squadre = identified.squadre;
		this.acquisti = identified.acquisti;
		this.lastSaved = "";
		this.avviata = s?.avviata ?? false;
		this.scenari = s?.scenari ?? {};
		this.scenariModulo = s?.scenariModulo ?? {};
		this.codaChiamate = s?.codaChiamate ?? [];
		this.storiaUndo = [];
		this.storiaRedo = [];
		this.ultimoRingN = "";
	}

	// ------------------------------------------------- annulla / ripeti
	private registra() {
		this.storiaUndo = [
			...this.storiaUndo.slice(-(MAX_STORIA - 1)),
			this.acquisti.map((a) => ({ ...a }))
		];
		this.storiaRedo = [];
	}
	get puoiAnnullare(): boolean {
		return this.storiaUndo.length > 0;
	}
	get puoiRipetere(): boolean {
		return this.storiaRedo.length > 0;
	}
	annulla() {
		this.verificaScrittura();
		const prev = this.storiaUndo.at(-1);
		if (!prev) return;
		this.storiaRedo = [...this.storiaRedo, this.acquisti.map((a) => ({ ...a }))];
		this.storiaUndo = this.storiaUndo.slice(0, -1);
		this.acquisti = identifyTeams(this.config.squadre, prev).acquisti;
	}
	ripeti() {
		this.verificaScrittura();
		const next = this.storiaRedo.at(-1);
		if (!next) return;
		this.storiaUndo = [...this.storiaUndo, this.acquisti.map((a) => ({ ...a }))];
		this.storiaRedo = this.storiaRedo.slice(0, -1);
		this.acquisti = identifyTeams(this.config.squadre, next).acquisti;
	}

	// ------------------------------------------------- ring di backup automatico
	private aggiornaRing(snap: Snapshot) {
		if (typeof localStorage === 'undefined' || !snap.avviata) return;
		const n = snap.acquisti.length;
		const fingerprint = JSON.stringify(snap);
		if (fingerprint === this.ultimoRingN) return;
		const k = chiaveRing(this.config.modalita);
		let ring: RingItem[] = [];
		try {
			ring = JSON.parse(localStorage.getItem(k) ?? '[]');
		} catch {
			ring = [];
		}
		ring.push({ t: Date.now(), n, snap: JSON.parse(JSON.stringify(snap)) });
		try {
			localStorage.setItem(k, JSON.stringify(ring.slice(-MAX_RING)));
			this.ultimoRingN = fingerprint;
		} catch {
			/* quota piena: salta */
		}
	}
	/** Metadati dei backup automatici disponibili (più recente in fondo). */
	get elencoBackup(): { t: number; n: number }[] {
		void this.acquisti.length; // dipendenza reattiva
		if (typeof localStorage === 'undefined') return [];
		try {
			const ring: RingItem[] = JSON.parse(
				localStorage.getItem(chiaveRing(this.config.modalita)) ?? '[]'
			);
			return ring.map((r) => ({ t: r.t, n: r.n }));
		} catch {
			return [];
		}
	}
	ripristinaDaBackup(t: number) {
		this.verificaScrittura();
		if (typeof localStorage === 'undefined') return;
		let ring: RingItem[] = [];
		try {
			ring = JSON.parse(localStorage.getItem(chiaveRing(this.config.modalita)) ?? '[]');
		} catch {
			return;
		}
		const item = ring.find((r) => r.t === t);
		if (!item) return;
		const prima = this.acquisti.map((a) => ({ ...a }));
		this.caricando = true;
		try { this.applicaSnapshot(item.snap, this.config.modalita); }
		finally { this.caricando = false; }
		this.storiaUndo = [prima];
		this.storiaRedo = [];
		this.salvaCorrente();
	}

	private salvaCorrente() {
		this.persisti(this.snapshot());
	}

	/** Passa a Classic/Mantra: salva l'asta corrente e carica quella dell'altra modalità. */
	cambiaModalita(nuova: string) {
		this.verificaScrittura();
		const m = normModalita(nuova);
		if (m === normModalita(this.config.modalita)) return;
		this.salvaCorrente();
		if (this.erroreSalvataggio) throw new Error('Prima di cambiare asta, scarica un backup: il salvataggio nel browser non è riuscito.');
		const next = caricaMod(m);
		if (next) this.validaSnapshot(next);
		this.caricando = true;
		try { this.applicaSnapshot(next, m); }
		finally { this.caricando = false; }
		this.salvaCorrente();
	}

	setGiocatori(g: Giocatore[]) {
		this.giocatori = g;
	}

	/** TOT dei limiti = somma di P+D+C+A (mai a mano). */
	private ricalcolaTot() {
		const L = this.config.limiti;
		const t =
			(Number(L.P) || 0) + (Number(L.D) || 0) + (Number(L.C) || 0) + (Number(L.A) || 0);
		L.TOT = t > 0 ? t : 25;
	}

	/** Imposta gli slot di un reparto (Classic) e ricalcola il totale rosa. */
	setSlotRuolo(ruolo: Ruolo, valore: number) {
		this.verificaScrittura();
		this.config.limiti[ruolo] = Math.max(0, Math.round(valore) || 0);
		this.ricalcolaTot();
	}

	/** Rosa Mantra: portieri + giocatori di movimento (il movimento è ripartito
	 *  in D/C/A solo per le viste per reparto; l'incastro usa i ruoli Mantra). */
	setSlotMantra(portieri: number, movimento: number) {
		this.verificaScrittura();
		const p = Math.max(1, Math.round(portieri) || 3);
		const m = Math.max(3, Math.round(movimento) || 27);
		const d = Math.round(m * 0.42);
		const c = Math.round(m * 0.31);
		this.config.limiti = { P: p, D: d, C: c, A: m - d - c, TOT: p + m };
	}

	setNumeroSquadre(n: number) {
		this.verificaScrittura();
		const size = Math.max(2, Math.min(20, Math.round(n) || 2));
		if (this.config.squadre.slice(size).some((s) => this.acquisti.some((a) => a.proprietarioId === s.id)))
			throw new Error('Non puoi eliminare una squadra con acquisti.');
		const teams = this.config.squadre.slice(0, size);
		while (teams.length < size) {
			let n = teams.length + 1;
			while (teams.some((s) => s.nome === `Squadra ${n}`)) n++;
			teams.push({ id: crypto.randomUUID(), nome: `Squadra ${n}`, isMia: false });
		}
		if (!teams.some((s) => s.isMia)) teams[0].isMia = true;
		this.config.squadre = teams;
	}

	rinominaSquadra(index: number, name: string) {
		this.verificaScrittura();
		const teams = this.config.squadre.map((s, i) => ({ ...s, nome: i === index ? name.trim() : s.nome }));
		const next = identifyTeams(teams, this.acquisti);
		this.config.squadre = next.squadre;
		this.acquisti = next.acquisti;
		this.storiaUndo = this.storiaUndo.map((a) => identifyTeams(teams, a).acquisti);
		this.storiaRedo = this.storiaRedo.map((a) => identifyTeams(teams, a).acquisti);
	}

	get squadreNomi(): string[] {
		return this.config.squadre.map((s) => s.nome);
	}

	/** Chiave da passare a <Crest tipo="stemmi"> per una squadra partecipante. */
	stemmaDi(nome: string): string {
		const sq = this.config.squadre.find((s) => s.nome === nome);
		return sq?.stemma || nome;
	}

	/** Colore identità di una squadra: quello scelto, o dalla palette per indice. */
	coloreDi(nome: string): string {
		const i = this.config.squadre.findIndex((s) => s.nome === nome);
		const sq = this.config.squadre[i];
		return sq?.colore || PALETTE_SQUADRE[(i < 0 ? 0 : i) % PALETTE_SQUADRE.length];
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

	/** Verso quale famiglia di moduli conviene costruire la rosa (primo anno). */
	get raccomandazioneFamiglieMantra() {
		return raccomandaFamiglie(this.rosaMantraInput(this.miaSquadra));
	}

	/** I polivalenti che tengono in piedi più moduli target contemporaneamente. */
	get giocatoriPernoMantra() {
		return giocatoriPerno(this.rosaMantraInput(this.miaSquadra), this.moduliTargetValidi);
	}

	/** Scarsità nel mercato libero per ruolo Mantra (giocatori affidabili / squadra). */
	get scarsitaRuoliMantra() {
		const presi = this.giocatoreIdPresi;
		const liberi: GiocatoreMantraInput[] = this.giocatori
			.filter((g) => !presi.has(g.id) && g.ruoloMantra)
			.map((g) => ({
				chiave: String(g.id),
				nome: g.nome,
				ruoli: g.ruoloMantra,
				titolarita: g.fc?.expectedTitolarita ?? 0
			}));
		return calcolaScarsitaRuoliMantra(liberi, this.config.partecipanti);
	}

	/** Ruoli chiave richiesti dai moduli target ma scoperti nella mia rosa. */
	get allertaRuoliChiaveMantra() {
		const scarsita: Record<string, string> = {};
		for (const s of this.scarsitaRuoliMantra) scarsita[s.ruolo] = s.stato;
		return allertaRuoliChiave(
			this.rosaMantraInput(this.miaSquadra),
			this.moduliTargetValidi,
			scarsita
		);
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
		const base = this.valutazioneBase(g, opts);
		return { ...base, decisione: this.decisionePrezzo(base, opts.prezzoLive) };
	}

	/**
	 * Parte "pesante" della valutazione: dipende dal giocatore e dallo stato
	 * dell'asta, NON dal prezzo live. Separata così la UI può ricalcolare solo
	 * la `decisione` a ogni +/- sul prezzo senza rifare tutta la pipeline.
	 */
	valutazioneBase(g: Giocatore, opts: { flagOverride?: string } = {}) {
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
		const slotRuoloVuoti = this.isMantra
			? Math.max(0, ruolo === 'P' ? this.config.limiti.P - bMia.perRuolo.P
				: this.config.limiti.TOT - this.config.limiti.P - (this.acquisti.filter((a) => a.proprietario === this.miaSquadra && a.ruolo !== 'P').length))
			: Math.max(0, (this.config.limiti[ruolo] ?? 0) - (bMia.perRuolo[ruolo] ?? 0));

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
			flag, fallback, fascia, fonte, poteri, profili, fase, scarsita, mantra,
			indiceInflazione: indice,
			// parametri prezzo-indipendenti per decisionePrezzo()
			_dec: {
				fasciaMin: fascia.min,
				fasciaMax: fascia.max,
				riferimento: fascia.riferimento,
				limiteStrategico: poteri.strategico,
				budgetResiduo: bMia.c_rimasti ?? 0,
				slotVuoti: bMia.slot_vuoti ?? 0,
				slotRuoloVuoti
			}
		};
	}

	/** Decisione immediata per un prezzo live (parte "leggera" della valutazione). */
	decisionePrezzo(base: { _dec: {
		fasciaMin: number; fasciaMax: number; riferimento: number; limiteStrategico: number;
		budgetResiduo: number; slotVuoti: number; slotRuoloVuoti: number;
	} }, prezzoLive?: number) {
		const d = base._dec;
		return valutaDecisioneImmediata({
			prezzoCorrente: prezzoLive ?? d.riferimento,
			fasciaMin: d.fasciaMin,
			fasciaMax: d.fasciaMax,
			limiteStrategico: d.limiteStrategico,
			budgetResiduo: d.budgetResiduo,
			slotVuoti: d.slotVuoti,
			slotRuoloVuoti: d.slotRuoloVuoti
		});
	}

	/** Input per l'endgame — parte "leggera" (mapping candidati), senza beam search. */
	private get chiusuraInput(): OttimizzaInput {
		const presi = this.giocatoreIdPresi;
		const b = this.bilanciCompleti[this.miaSquadra];
		const candidati = this.isMantra
			? this.giocatori
					.filter((g) => !presi.has(g.id) && g.ruoloMantra)
					.map((g) => ({
						chiave: String(g.id),
						nome: g.nome,
						ruoli_mantra: g.ruoloMantra,
						prezzo: g.fc?.pma || g.fc?.pfc || g.quotazione || 1,
						punteggio: g.fvm || (g.fc?.expectedFantamedia ?? 0) * 10 || g.quotazione || 0
					}))
			: this.giocatori
					.filter((g) => !presi.has(g.id) && g.ruolo)
					.map((g) => ({
						chiave: String(g.id),
						nome: g.nome,
						ruolo: g.ruolo,
						prezzo: g.fc?.pma || g.fc?.pfc || g.quotazione || 1,
						punteggio: g.fvm || (g.fc?.expectedFantamedia ?? 0) * 10 || g.quotazione || 0,
						fonte_prezzo: g.fc?.pma ? 'PMA' : g.fc?.pfc ? 'PFC' : 'QUOTAZIONE'
					}));
		return {
			candidati,
			budgetResiduo: b.c_rimasti ?? 0,
			slotVuoti: b.slot_vuoti ?? 0,
			modalita: this.config.modalita,
			conteggiRuolo: b.perRuolo,
			limitiRuolo: this.config.limiti,
			rosaMantra: this.isMantra ? this.rosaMantraInput(this.miaSquadra) : undefined,
			moduliTarget: this.isMantra ? this.moduliTargetValidi : undefined
		};
	}

	/** Reading the latest result never runs the optimizer on the UI thread. */
	get chiusuraFinale(): OttimizzaResult { return this.chiusuraStato; }

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

	controllaAcquisto(g: { id: number; ruolo: Ruolo | '' }, prezzo: number, proprietario: string, editing?: number) {
		return checkPurchase({ teams: this.config.squadre, purchases: this.acquisti, budget: this.config.budgetMax,
			limits: this.config.limiti, mantra: this.isMantra, playerId: g.id, role: g.ruolo, owner: proprietario, price: prezzo, editing });
	}

	correggiAcquisto(id: number, prezzo: number, proprietario: string) {
		this.verificaScrittura();
		const old = this.acquisti.find((a) => a.giocatoreId === id);
		if (!old) throw new Error('Acquisto non trovato.');
		const check = this.controllaAcquisto({ id, ruolo: old.ruolo }, prezzo, proprietario, id);
		if (check.error) throw new Error(check.error);
		if (old.prezzo === prezzo && old.proprietario === proprietario) return;
		this.registra();
		const team = this.config.squadre.find((s) => s.nome === proprietario)!;
		this.acquisti = this.acquisti.map((a) => a.giocatoreId === id
			? { ...a, prezzo, proprietario: team.nome, proprietarioId: team.id } : a);
	}

	assegna(g: Giocatore, prezzo: number, proprietario: string) {
		this.verificaScrittura();
		const check = this.controllaAcquisto(g, prezzo, proprietario);
		if (check.error) throw new Error(check.error);
		if (!Number.isFinite(prezzo) || prezzo < 1) throw new Error('Prezzo non valido.');
		const team = this.config.squadre.find((s) => s.nome === proprietario);
		if (!team) throw new Error('Squadra non valida.');
		this.registra();
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
				proprietarioId: team.id,
				ordine,
				timestamp: Date.now()
			}
		];
		this.avviata = true;
		if (this.codaChiamate.includes(g.id))
			this.codaChiamate = this.codaChiamate.filter((id) => id !== g.id);
	}

	/** Retrocompat: annulla l'ultima mossa (alias di annulla()). */
	annullaUltimo() {
		this.annulla();
	}

	rimuovi(giocatoreId: number) {
		this.verificaScrittura();
		if (!this.acquisti.some((a) => a.giocatoreId === giocatoreId)) return;
		this.registra();
		this.acquisti = this.acquisti.filter((a) => a.giocatoreId !== giocatoreId);
	}

	// ------------------------------------------------- coda chiamate
	aggiungiCoda(id: number) {
		this.verificaScrittura();
		if (!this.codaChiamate.includes(id)) this.codaChiamate = [...this.codaChiamate, id];
	}
	rimuoviCoda(id: number) {
		this.verificaScrittura();
		this.codaChiamate = this.codaChiamate.filter((x) => x !== id);
	}
	svuotaCoda() {
		this.verificaScrittura();
		this.codaChiamate = [];
	}
	inCoda(id: number): boolean {
		return this.codaChiamate.includes(id);
	}
	/** Giocatori in coda ancora liberi, nell'ordine di inserimento. */
	get coda(): Giocatore[] {
		const presi = this.giocatoreIdPresi;
		const byId = new Map(this.giocatori.map((g) => [g.id, g]));
		return this.codaChiamate
			.filter((id) => !presi.has(id))
			.map((id) => byId.get(id))
			.filter((g): g is Giocatore => !!g);
	}

	/** Backup completo: entrambe le aste (Classic + Mantra) in un solo file. */
	esporta(): string {
		return JSON.stringify(
			{
				fantatool: 'asta',
				attiva: normModalita(this.config.modalita),
				classic: this.config.modalita === 'classic' ? this.snapshot() : leggiChiave(chiaveMod('classic')),
				mantra: this.config.modalita === 'mantra' ? this.snapshot() : leggiChiave(chiaveMod('mantra')),
				esportato: new Date().toISOString()
			},
			null,
			2
		);
	}

	private validaSnapshot(s: Snapshot) {
		if (!s?.config || !Array.isArray(s.config.squadre) || !s.config.squadre.length ||
			!s.config.limiti || !Array.isArray(s.acquisti) || !Number.isFinite(s.config.budgetMax) || s.config.budgetMax < 1)
			throw new Error('Backup non valido.');
		const ids = new Set<number>();
		for (const a of s.acquisti) {
			if (!Number.isFinite(a.giocatoreId) || ids.has(a.giocatoreId) || !Number.isFinite(a.prezzo) || a.prezzo < 1)
				throw new Error('Backup con acquisti duplicati o prezzi non validi.');
			ids.add(a.giocatoreId);
		}
		identifyTeams(s.config.squadre, s.acquisti);
	}

	importa(json: string) {
		this.verificaScrittura(true);
		const raw = JSON.parse(json);
		const multi = raw && (raw.classic !== undefined || raw.mantra !== undefined);
		const attiva = normModalita(multi ? raw.attiva ?? this.config.modalita : raw?.config?.modalita ?? this.config.modalita);
		const snapshots: Partial<Record<'classic' | 'mantra', Snapshot>> = {};
		if (multi) {
			for (const m of MODI) if (raw[m]) snapshots[m] = raw[m];
		} else snapshots[attiva] = raw;
		if (!Object.keys(snapshots).length) throw new Error('Backup vuoto.');
		for (const snap of Object.values(snapshots)) this.validaSnapshot(snap);
		// Keep an independent recovery copy before a multi-key restore. Validate first.
		const previous = MODI.map((m) => [chiaveMod(m), localStorage.getItem(chiaveMod(m))] as const);
		localStorage.setItem('fantatool.pre-import.v1', this.recuperoNecessario ? JSON.stringify(previous) : this.esporta());
		this.caricando = true;
		try {
			for (const m of MODI) if (snapshots[m]) localStorage.setItem(chiaveMod(m), JSON.stringify(snapshots[m]));
			this.applicaSnapshot(snapshots[attiva] ?? caricaMod(attiva), attiva);
			this.recuperoNecessario = false;
		} catch (error) {
			for (const [key, value] of previous) {
				try { if (value === null) localStorage.removeItem(key); else localStorage.setItem(key, value); } catch { /* pre-import copy retained */ }
			}
			throw error;
		} finally { this.caricando = false; }
		this.salvaCorrente();
	}

	/** Azzera SOLO l'asta della modalità corrente. */
	reset() {
		this.verificaScrittura();
		const m = normModalita(this.config.modalita);
		this.applicaSnapshot(null, m);
	}

	/**
	 * Applica una rosa importata da file alla modalità corrente: ricostruisce
	 * le squadre partecipanti dai proprietari e popola gli acquisti.
	 */
	applicaImportRose(squadre: string[], acquisti: Acquisto[]) {
		this.verificaScrittura();
		const esistenti = new Map(
			this.config.squadre.map((s) => [s.nome, { stemma: s.stemma, colore: s.colore }] as const)
		);
		const miaAttuale = this.miaSquadra;
		const nuove: Squadra[] = squadre.map((nome) => ({
			nome,
			isMia: nome === miaAttuale,
			stemma: esistenti.get(nome)?.stemma,
			colore: esistenti.get(nome)?.colore
		}));
		if (nuove.length && !nuove.some((s) => s.isMia)) nuove[0].isMia = true;
		this.config.squadre = nuove.length ? nuove : this.config.squadre;
		const identified = identifyTeams(this.config.squadre, acquisti.map((a) => ({ ...a, proprietarioId: undefined })));
		this.config.squadre = identified.squadre;
		this.acquisti = identified.acquisti;
		this.avviata = true;
		this.codaChiamate = [];
		this.storiaUndo = [];
		this.storiaRedo = [];
		this.ultimoRingN = "";
	}

	// ---------------------------------------------------------------- SCENARI
	private giocatorePerChiave(chiave: string): Giocatore | undefined {
		return this.giocatori.find((g) => g.chiave === chiave || String(g.id) === chiave);
	}

	nuovoScenario(nome?: string): string {
		this.verificaScrittura();
		const base = nome?.trim() || `Piano ${Object.keys(this.scenari).length + 1}`;
		let n = base;
		let i = 2;
		while (n in this.scenari) n = `${base} ${i++}`;
		this.scenari = { ...this.scenari, [n]: {} };
		return n;
	}

	eliminaScenario(nome: string) {
		this.verificaScrittura();
		const { [nome]: _, ...resto } = this.scenari;
		this.scenari = resto;
		const { [nome]: _m, ...restoMod } = this.scenariModulo;
		this.scenariModulo = restoMod;
	}

	/** Modulo salvato per un piano (o undefined se non ancora scelto). */
	moduloScenario(nome: string): string | undefined {
		return this.scenariModulo[nome];
	}

	/** Imposta il modulo di UN piano, senza toccare gli altri. */
	setModuloScenario(nome: string, modulo: string) {
		this.verificaScrittura();
		if (!nome) return;
		this.scenariModulo = { ...this.scenariModulo, [nome]: modulo };
	}

	/** Esporta SOLO i piani/scenari della modalità corrente (non tocca rose/squadre). */
	esportaScenari(): string {
		return JSON.stringify(
			{
				fantatool: 'scenari',
				modalita: normModalita(this.config.modalita),
				esportato: new Date().toISOString(),
				scenari: this.scenari,
				scenariModulo: this.scenariModulo
			},
			null,
			2
		);
	}

	/** Importa piani da file: li unisce a quelli esistenti (sovrascrive per nome). */
	importaScenari(json: string): number {
		this.verificaScrittura();
		const raw = JSON.parse(json);
		const src =
			raw && typeof raw === 'object' && raw.scenari && typeof raw.scenari === 'object'
				? raw.scenari
				: raw;
		if (!src || typeof src !== 'object') throw new Error('File piani non valido');
		const puliti: Scenari = {};
		for (const [nome, piano] of Object.entries(src as Record<string, unknown>)) {
			if (!piano || typeof piano !== 'object') continue;
			const p: Record<string, number> = {};
			for (const [k, v] of Object.entries(piano as Record<string, unknown>)) {
				const n = Math.max(1, Math.round(Number(v) || 0));
				if (Number.isFinite(n)) p[k] = n;
			}
			puliti[nome] = p;
		}
		if (!Object.keys(puliti).length) throw new Error('Nessun piano valido nel file');
		this.scenari = { ...this.scenari, ...puliti };
		// moduli per piano, se presenti nel file
		const modSrc = raw?.scenariModulo;
		if (modSrc && typeof modSrc === 'object') {
			const modPuliti: Record<string, string> = {};
			for (const [nome, m] of Object.entries(modSrc as Record<string, unknown>))
				if (nome in puliti && typeof m === 'string' && m) modPuliti[nome] = m;
			this.scenariModulo = { ...this.scenariModulo, ...modPuliti };
		}
		return Object.keys(puliti).length;
	}

	rinominaScenario(vecchio: string, nuovo: string) {
		this.verificaScrittura();
		const nome = nuovo.trim();
		if (!nome || nome === vecchio || nome in this.scenari) return;
		const { [vecchio]: piano, ...resto } = this.scenari;
		this.scenari = { ...resto, [nome]: piano ?? {} };
		const { [vecchio]: mod, ...restoMod } = this.scenariModulo;
		this.scenariModulo = mod ? { ...restoMod, [nome]: mod } : restoMod;
	}

	setTargetScenario(nome: string, chiave: string, prezzoMax: number) {
		this.verificaScrittura();
		const piano = { ...(this.scenari[nome] ?? {}), [chiave]: Math.max(1, Math.round(prezzoMax)) };
		this.scenari = { ...this.scenari, [nome]: piano };
	}

	/** Aggiunge più obiettivi allo stesso piano con una sola scrittura. */
	setTargetScenarioMultipli(nome: string, obiettivi: { chiave: string; prezzoMax: number }[]) {
		this.verificaScrittura();
		if (!nome || !obiettivi.length) return;
		const piano = { ...(this.scenari[nome] ?? {}) };
		for (const { chiave, prezzoMax } of obiettivi)
			piano[chiave] = Math.max(1, Math.round(prezzoMax));
		this.scenari = { ...this.scenari, [nome]: piano };
	}

	rimuoviDaScenario(nome: string, chiave: string) {
		this.verificaScrittura();
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
	/** Ripartizione budget per reparto di una squadra: quota, speso, %, residuo, poteri. */
	budgetPerRepartoDi(squadra: string) {
		const bil = this.bilanciCompleti[squadra] ?? this.bilanciCompleti[this.miaSquadra];
		const budget = this.config.budgetMax;
		return (['P', 'D', 'C', 'A'] as Ruolo[]).map((r) => {
			const speso = (bil[`spesi_${r}`] as number) ?? 0;
			const inc = calcolaIncidenzeBudget({
				budgetIniziale: budget,
				pma: 0,
				pfc: 0,
				fasciaMin: 0,
				fasciaMax: 0,
				riferimento: 0,
				quotaReparto: QUOTE_RUOLO[r],
				spesoReparto: speso
			});
			const poteri = calcolaPoteriAcquisto(bil, r, this.config.limiti, budget, QUOTE_RUOLO);
			return {
				ruolo: r,
				presi: bil.perRuolo[r],
				limite: this.config.limiti[r],
				quota_pct: inc.quota_reparto_pct,
				budget_reparto: inc.budget_reparto,
				speso,
				speso_pct: inc.speso_reparto_pct,
				residuo: inc.residuo_reparto,
				poteri
			};
		});
	}

	get budgetPerReparto() {
		return this.budgetPerRepartoDi(this.miaSquadra);
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
