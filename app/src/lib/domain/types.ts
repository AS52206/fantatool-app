// Modello dati condiviso dall'app d'asta.

export type Ruolo = 'P' | 'D' | 'C' | 'A';

export interface BallottaggioInfo {
	contendente: string;
	rischio: string;
	expectedTitolarita: number;
	rilevatoIl: string;
	fonte: string;
}

export interface FantacreditiInfo {
	pma: number;
	pfc: number;
	slot: number | null;
	expectedTitolarita: number;
	expectedFantamedia: number;
	penaltyProbability: number;
	unavailableUntilRound: number;
	playerStatus: string;
	fasciaFc: string;
	newArrival: boolean;
	ballottaggio?: BallottaggioInfo | null;
}

export interface Giocatore {
	id: number;
	nome: string;
	chiave: string;
	ruolo: Ruolo | '';
	ruoloMantra: string;
	squadra: string;
	quotazione: number;
	fvm: number;
	fm: number;
	pg: number;
	fmOld: number;
	pgOld: number;
	ballottaggio?: BallottaggioInfo | null;
	fc: FantacreditiInfo | null;
	fantalab: { prezzo_atteso: number; pma_pct: number } | null;
}

export interface BundleMeta {
	stagione: string;
	modalita: string;
	partecipanti: number;
	generato: string;
	totale_giocatori: number;
	con_fantacrediti: number;
	sorgenti: Record<string, { file: string; impronta: string } | null>;
}

export interface Bundle {
	meta: BundleMeta;
	players: Giocatore[];
}

/** Un acquisto registrato durante l'asta. */
export interface Acquisto {
	/** Stable owner identity; optional only for legacy imports. */
	proprietarioId?: string;
	giocatoreId: number;
	nome: string;
	nomePuro: string;
	ruolo: Ruolo | '';
	squadraSerieA: string;
	prezzo: number;
	proprietario: string;
	ordine: number; // progressivo per l'undo
	timestamp: number;
}

export interface Squadra {
	id?: string;
	nome: string;
	isMia: boolean;
	/** Chiave stemma scelta manualmente (override); altrimenti si abbina per nome. */
	stemma?: string;
	/** Colore identità squadra (es. "#ff0000"). Se assente si usa la palette per indice. */
	colore?: string;
}

export interface LimitiRuoli {
	P: number;
	D: number;
	C: number;
	A: number;
	TOT: number;
	[ruolo: string]: number;
}

export interface BilancioSquadra {
	c_rimasti: number;
	g_presi: number;
}

export type FlagManuale =
	| 'Normale'
	| '🟡 Ballottaggio'
	| '🔴 Infortunato/Dubbio'
	| '🎯 Rigorista designato'
	| '🎯🟡 Rigorista in Ballottaggio'
	| '📈 Nuovo titolare confermato'
	| '🪑 Riserva Fissa (da fasciaFc)';
