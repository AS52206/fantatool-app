/**
 * Costruisce la disposizione in campo (linee di slot) da una lista di
 * giocatori, per Classic (per ruolo P/D/C/A) e per Mantra (matching modulo).
 */
import {
	LINEE_MODULI_MANTRA,
	MODULI_MANTRA,
	assegnaGiocatoriModulo,
	type GiocatoreMantraInput
} from './engine/mantra';
import type { LineaCampo, SlotCampo } from './ui/FormationPitch.svelte';

export interface GiocatoreCampo {
	chiave: string;
	nome: string;
	club?: string;
	ruolo: string; // classico P/D/C/A
	ruoloMantra?: string;
	prezzo?: number | null;
	titolarita?: number | null;
	pmaFl?: number | null;
	stato?: 'PRESO' | 'LIBERO' | 'VUOTO';
	punteggio?: number;
}

export interface Campo {
	modulo: string;
	linee: LineaCampo[];
	panchina: GiocatoreCampo[];
}

const NOMI_LINEE = ['PORTA', 'DIFESA', 'CENTROCAMPO', 'TREQUARTI', 'ATTACCO'];

/** Ruoli Mantra che possono comporre il reparto difensivo del modificatore. */
const RUOLI_REPARTO_DIFESA = new Set(['Dc', 'B', 'Dd', 'Ds', 'E', 'M']);

/**
 * Indici piatti degli slot coinvolti nel **modificatore di difesa** Mantra:
 * il portiere + i 5 uomini più arretrati del modulo tra Dc/B/Dd/Ds/E/M.
 * Gli slot di `campo.linee` sono già in ordine dal fondo (porta → attacco),
 * quindi bastano il portiere e i primi 5 slot difensivamente idonei.
 * Ritorna [] se il campo non ha 6 slot idonei (es. modalità Classic).
 */
export function repartoDifensivoMantra(campo: Campo): number[] {
	const flat: SlotCampo[] = [];
	for (const linea of campo.linee) for (const s of linea.slot) flat.push(s);
	if (flat.length < 6) return [];
	const idx: number[] = [0]; // portiere
	for (let i = 1; i < flat.length && idx.length < 6; i++) {
		const opzioni = String(flat[i].etichetta ?? flat[i].ruolo ?? '')
			.split('/')
			.map((x) => x.trim());
		if (opzioni.some((o) => RUOLI_REPARTO_DIFESA.has(o))) idx.push(i);
	}
	return idx.length === 6 ? idx : [];
}

/** Moduli "classici" comuni: cifre = reparti di movimento dalla difesa. */
export const MODULI_CLASSIC = ['3-4-3', '4-3-3', '4-4-2', '3-5-2', '4-2-3-1', '3-4-1-2', '4-3-1-2', '4-4-1-1'];

export function buildCampoClassic(giocatori: GiocatoreCampo[], modulo: string): Campo {
	const cifre = modulo.split('-').map(Number).filter((n) => n > 0);
	// linee: P(1) + una linea per cifra; ruolo: prima cifra = D, ultima = A, resto = C
	const ruoloLinea = ['P', ...cifre.map((_, i) => (i === 0 ? 'D' : i === cifre.length - 1 ? 'A' : 'C'))];
	const conteggi = [1, ...cifre];

	const perRuolo: Record<string, GiocatoreCampo[]> = { P: [], D: [], C: [], A: [] };
	for (const g of giocatori) (perRuolo[g.ruolo] ?? (perRuolo[g.ruolo] = [])).push(g);
	for (const k of Object.keys(perRuolo))
		perRuolo[k].sort((a, b) => (b.prezzo ?? 0) - (a.prezzo ?? 0) || (b.punteggio ?? 0) - (a.punteggio ?? 0));

	const usati = new Set<string>();
	const linee: LineaCampo[] = [];
	ruoloLinea.forEach((ruolo, i) => {
		const slot: SlotCampo[] = [];
		const pool = perRuolo[ruolo] ?? [];
		for (let s = 0; s < conteggi[i]; s++) {
			const g = pool.find((x) => !usati.has(x.chiave));
			if (g) {
				usati.add(g.chiave);
				slot.push({
					nome: g.nome, club: g.club, ruolo, prezzo: g.prezzo,
					titolarita: g.titolarita, pmaFl: g.pmaFl, stato: g.stato ?? 'PRESO'
				});
			} else {
				slot.push({ ruolo, stato: 'VUOTO' });
			}
		}
		linee.push({ nome: NOMI_LINEE[i === 0 ? 0 : ruolo === 'A' ? 4 : ruolo === 'D' ? 1 : 2] + (i > 1 && ruolo === 'C' ? ` ${i}` : ''), slot });
	});

	const panchina = giocatori.filter((g) => !usati.has(g.chiave));
	return { modulo, linee, panchina };
}

export function buildCampoMantra(giocatori: GiocatoreCampo[], modulo: string): Campo {
	if (!(modulo in MODULI_MANTRA)) modulo = '3-4-1-2';
	const slots = MODULI_MANTRA[modulo];
	const linee_n = LINEE_MODULI_MANTRA[modulo]; // movimento, difesa -> attacco

	const input: GiocatoreMantraInput[] = giocatori.map((g, i) => ({
		chiave: g.chiave || String(i),
		nome: g.nome,
		ruoli: g.ruoloMantra || g.ruolo,
		punteggio: g.prezzo ?? g.punteggio ?? 0
	}));
	const esito = assegnaGiocatoriModulo(input, modulo);
	const perChiave = new Map(giocatori.map((g) => [g.chiave, g]));

	// assegnazioni[indice_slot] -> giocatore
	const assegnato: (GiocatoreCampo | null)[] = slots.map((_, i) => {
		const a = esito.assegnazioni.find((x) => x.indice_slot === i);
		const chiave = a?.giocatore?.chiave;
		return chiave !== undefined ? (perChiave.get(String(chiave)) ?? null) : null;
	});

	const nomiLinee =
		linee_n.length === 3
			? ['DIFESA', 'CENTROCAMPO', 'ATTACCO']
			: linee_n.length === 4
				? ['DIFESA', 'CENTROCAMPO', 'RIFINITURA', 'ATTACCO']
				: linee_n.map((_, i) => (i === 0 ? 'DIFESA' : i === linee_n.length - 1 ? 'ATTACCO' : `LINEA ${i + 1}`));

	const linee: LineaCampo[] = [
		{
			nome: 'PORTA',
			slot: [slotDa(slots[0], assegnato[0])]
		}
	];
	let cur = 1;
	linee_n.forEach((n, li) => {
		const slot: SlotCampo[] = [];
		for (let k = 0; k < n; k++) {
			slot.push(slotDa(slots[cur], assegnato[cur]));
			cur++;
		}
		linee.push({ nome: nomiLinee[li], slot });
	});

	const usati = new Set(assegnato.filter(Boolean).map((g) => (g as GiocatoreCampo).chiave));
	const panchina = giocatori.filter((g) => !usati.has(g.chiave));
	return { modulo, linee, panchina };
}

function slotDa(etichetta: string, g: GiocatoreCampo | null): SlotCampo {
	if (!g) return { etichetta, stato: 'VUOTO' };
	return {
		etichetta,
		nome: g.nome,
		club: g.club,
		ruolo: g.ruoloMantra || g.ruolo,
		prezzo: g.prezzo,
		titolarita: g.titolarita,
		pmaFl: g.pmaFl,
		stato: g.stato ?? 'PRESO'
	};
}
