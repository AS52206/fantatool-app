/**
 * Aiuti tattici Mantra pensati per chi è al primo anno: famiglie di moduli
 * compatibili, "quanto è jolly" un giocatore, giocatori-perno della rosa e
 * allarme sui ruoli chiave scoperti rispetto ai moduli target.
 *
 * Non è un porting dal Python: sono euristiche dell'app, costruite sopra il
 * motore fedele di engine/mantra.ts.
 */
import {
	MODULI_MANTRA,
	assegnaGiocatoriModulo,
	normalizzaRuoliMantra,
	type GiocatoreMantraInput,
	type RuoloMantra
} from './engine/mantra';

const opzioniSlot = (s: string): string[] =>
	String(s)
		.split('/')
		.map((x) => x.trim())
		.filter(Boolean);

/** Linea di campo "grossa" a cui appartiene ogni ruolo Mantra. */
const LINEA_DI_RUOLO: Record<string, string> = {
	Por: 'Porta',
	Dd: 'Difesa',
	Ds: 'Difesa',
	Dc: 'Difesa',
	B: 'Difesa',
	E: 'Esterni',
	M: 'Centrocampo',
	C: 'Centrocampo',
	W: 'Trequarti',
	T: 'Trequarti',
	A: 'Attacco',
	Pc: 'Attacco'
};

function ruoliDi(g: GiocatoreMantraInput): RuoloMantra[] {
	if (typeof g === 'string') return normalizzaRuoliMantra(g);
	return normalizzaRuoliMantra(
		g.ruoli ?? g.ruolo_mantra ?? (g as Record<string, unknown>).Ruoli_Mantra_Clean ?? ''
	);
}

// ---------------------------------------------------------------------------
// Famiglie di moduli compatibili
// ---------------------------------------------------------------------------
export interface FamigliaModuli {
	nome: string;
	descrizione: string;
	moduli: string[];
}

export const FAMIGLIE_MODULI_MANTRA: FamigliaModuli[] = [
	{
		nome: 'Difesa a 3',
		descrizione:
			'Tre centrali con braccetto (Dc/B) e due esterni a tutta fascia (E). Da avere: 4–5 Dc/B e 3–4 E affidabili.',
		moduli: ['3-4-3', '3-4-1-2', '3-4-2-1', '3-5-2', '3-5-1-1']
	},
	{
		nome: 'Difesa a 4',
		descrizione:
			'Terzini di ruolo (Dd/Ds) e due Dc puri. Meno esterni alti, serve un centrocampo più folto (M/C).',
		moduli: ['4-3-3', '4-3-1-2', '4-4-2', '4-1-4-1', '4-4-1-1', '4-2-3-1']
	}
];

export function famigliaDelModulo(modulo: string): FamigliaModuli | undefined {
	return FAMIGLIE_MODULI_MANTRA.find((f) => f.moduli.includes(modulo));
}

/** Conteggio dei ruoli Mantra posseduti (un polivalente conta in ogni ruolo). */
function conteggioRuoli(giocatori: GiocatoreMantraInput[]): Record<string, number> {
	const cnt: Record<string, number> = {};
	for (const g of giocatori) for (const r of ruoliDi(g)) cnt[r] = (cnt[r] ?? 0) + 1;
	return cnt;
}

/**
 * Frase corta sul perché un modulo calza alla rosa attuale (per il pannello
 * "Il tuo modulo" nel Draft).
 */
export function spiegaSceltaModulo(giocatori: GiocatoreMantraInput[], modulo: string): string {
	const fam = famigliaDelModulo(modulo);
	if (!fam) return '';
	const cnt = conteggioRuoli(giocatori);
	const centrali = (cnt.Dc ?? 0) + (cnt.B ?? 0);
	const terzini = (cnt.Dd ?? 0) + (cnt.Ds ?? 0);
	const esterni = cnt.E ?? 0;
	if (fam.nome === 'Difesa a 3')
		return `${centrali} tra Dc/B${esterni ? ` e ${esterni} E` : ', pochi E'}: la difesa a 3 sfrutta meglio la tua rosa`;
	return `${terzini} terzini di ruolo (Dd/Ds) e ${centrali} centrali: la difesa a 4 ti calza`;
}

// ---------------------------------------------------------------------------
// Quanto è "jolly" un giocatore rispetto a un insieme di moduli
// ---------------------------------------------------------------------------
export interface CoperturaGiocatore {
	/** Etichette-slot distinte, nei moduli dati, che il giocatore può occupare. */
	slotCompatibili: number;
	/** Etichette-slot distinte totali nei moduli dati. */
	slotTotali: number;
	/** Quanti dei moduli dati hanno almeno uno slot per lui. */
	moduli: number;
	moduliTotali: number;
	/** Linee di campo che può coprire (Difesa, Esterni, Centrocampo, …). */
	linee: string[];
	/** true se copre slot su ≥2 linee diverse: è un ponte tra reparti. */
	ponte: boolean;
}

export function coperturaGiocatoreModuli(
	ruoli: GiocatoreMantraInput | unknown,
	moduliTarget: string[]
): CoperturaGiocatore {
	const set = new Set(
		typeof ruoli === 'object' && ruoli !== null && !Array.isArray(ruoli)
			? ruoliDi(ruoli as GiocatoreMantraInput)
			: normalizzaRuoliMantra(ruoli)
	);
	let moduli = [...new Set(moduliTarget)].filter((m) => m in MODULI_MANTRA);
	if (!moduli.length) moduli = Object.keys(MODULI_MANTRA);

	const labelTot = new Set<string>();
	const labelOk = new Set<string>();
	let moduliOk = 0;
	for (const m of moduli) {
		let almenoUno = false;
		for (const slot of MODULI_MANTRA[m]) {
			labelTot.add(slot);
			if (opzioniSlot(slot).some((o) => set.has(o as RuoloMantra))) {
				labelOk.add(slot);
				almenoUno = true;
			}
		}
		if (almenoUno) moduliOk += 1;
	}
	const linee = [...new Set([...set].map((r) => LINEA_DI_RUOLO[r]).filter(Boolean))];
	return {
		slotCompatibili: labelOk.size,
		slotTotali: labelTot.size,
		moduli: moduliOk,
		moduliTotali: moduli.length,
		linee,
		ponte: linee.filter((l) => l !== 'Porta').length >= 2
	};
}

// ---------------------------------------------------------------------------
// Raccomandazione: verso quale famiglia di moduli conviene costruire la rosa
// ---------------------------------------------------------------------------
export interface FamigliaValutata {
	nome: string;
	descrizione: string;
	moduli: string[];
	coperturaMax: number;
	moduloMigliore: string;
	moduliCompleti: string[];
	/** Etichette-slot ancora scoperte, unione su tutti i moduli della famiglia. */
	ruoliMancanti: string[];
	slotMancantiMin: number;
	punteggio: number;
}

export function raccomandaFamiglie(giocatori: GiocatoreMantraInput[]): FamigliaValutata[] {
	const out = FAMIGLIE_MODULI_MANTRA.map((f) => {
		const esiti = f.moduli
			.map((m) => assegnaGiocatoriModulo(giocatori, m))
			.sort((a, b) => b.coperti - a.coperti || (a.modulo < b.modulo ? -1 : 1));
		const best = esiti[0];
		const completi = esiti.filter((e) => e.completo).map((e) => e.modulo);
		const mancanti = new Set<string>();
		for (const e of esiti) for (const s of e.mancanti) mancanti.add(s);
		return {
			nome: f.nome,
			descrizione: f.descrizione,
			moduli: f.moduli,
			coperturaMax: best.coperti,
			moduloMigliore: best.modulo,
			moduliCompleti: completi,
			ruoliMancanti: [...mancanti],
			slotMancantiMin: Math.max(0, best.totale - best.coperti),
			punteggio: best.coperti * 10 + completi.length * 5 - mancanti.size
		};
	});
	return out.sort((a, b) => b.punteggio - a.punteggio);
}

// ---------------------------------------------------------------------------
// Giocatori-perno: i polivalenti che entrano nell'XI di più moduli
// ---------------------------------------------------------------------------
export interface GiocatorePerno {
	chiave: string | number;
	nome: string;
	ruoli: string;
	moduliSchierato: number;
	moduliTotali: number;
}

export function giocatoriPerno(
	giocatori: GiocatoreMantraInput[],
	moduliTarget?: string[],
	limite = 5
): GiocatorePerno[] {
	let moduli = [...new Set(moduliTarget ?? [])].filter((m) => m in MODULI_MANTRA);
	if (!moduli.length) moduli = Object.keys(MODULI_MANTRA);

	const conteggio = new Map<
		string,
		{ chiave: string | number; nome: string; ruoli: string; n: number }
	>();
	for (const m of moduli) {
		const esito = assegnaGiocatoriModulo(giocatori, m);
		for (const a of esito.assegnazioni) {
			if (!a.giocatore) continue;
			const k = String(a.giocatore.chiave);
			const cur =
				conteggio.get(k) ??
				{ chiave: a.giocatore.chiave, nome: a.giocatore.nome, ruoli: a.giocatore.ruoli, n: 0 };
			cur.n += 1;
			conteggio.set(k, cur);
		}
	}
	return [...conteggio.values()]
		.filter((v) => normalizzaRuoliMantra(v.ruoli).length >= 2)
		.sort((a, b) => b.n - a.n || (a.nome < b.nome ? -1 : 1))
		.slice(0, limite)
		.map((v) => ({
			chiave: v.chiave,
			nome: v.nome,
			ruoli: v.ruoli,
			moduliSchierato: v.n,
			moduliTotali: moduli.length
		}));
}

// ---------------------------------------------------------------------------
// Allarme ruoli chiave scoperti rispetto ai moduli target
// ---------------------------------------------------------------------------
export interface AllertaRuolo {
	ruolo: RuoloMantra;
	inRosa: number;
	slotRichiesti: number;
	moduli: string[];
	livello: 'CRITICO' | 'ATTENZIONE';
	scarsita?: string;
}

/**
 * Per ogni ruolo che un modulo target richiede in modo "rigido" (slot a
 * opzione singola, es. `T` in 3-4-1-2), segnala se in rosa non ne hai
 * abbastanza. `scarsitaPerRuolo` opzionale = mappa ruolo → stato mercato.
 */
export function allertaRuoliChiave(
	giocatori: GiocatoreMantraInput[],
	moduliTarget: string[],
	scarsitaPerRuolo?: Record<string, string>
): AllertaRuolo[] {
	const moduli = [...new Set(moduliTarget)].filter((m) => m in MODULI_MANTRA);
	if (!moduli.length) return [];

	const setRosa = giocatori.map((g) => new Set(ruoliDi(g)));
	const richiestiPer: Record<string, { max: number; moduli: Set<string> }> = {};
	for (const m of moduli) {
		const conteggioModulo: Record<string, number> = {};
		for (const slot of MODULI_MANTRA[m]) {
			const opz = opzioniSlot(slot);
			if (opz.length === 1) conteggioModulo[opz[0]] = (conteggioModulo[opz[0]] ?? 0) + 1;
		}
		for (const [r, n] of Object.entries(conteggioModulo)) {
			const cur = (richiestiPer[r] ??= { max: 0, moduli: new Set() });
			cur.max = Math.max(cur.max, n);
			cur.moduli.add(m);
		}
	}

	const out: AllertaRuolo[] = [];
	for (const [ruolo, info] of Object.entries(richiestiPer)) {
		const inRosa = setRosa.filter((s) => s.has(ruolo as RuoloMantra)).length;
		if (inRosa >= info.max) continue;
		out.push({
			ruolo: ruolo as RuoloMantra,
			inRosa,
			slotRichiesti: info.max,
			moduli: [...info.moduli].sort(),
			livello: inRosa === 0 ? 'CRITICO' : 'ATTENZIONE',
			scarsita: scarsitaPerRuolo?.[ruolo]
		});
	}
	return out.sort(
		(a, b) =>
			(a.livello === b.livello ? 0 : a.livello === 'CRITICO' ? -1 : 1) ||
			b.slotRichiesti - a.slotRichiesti
	);
}
