/**
 * Importa una rosa d'asta già fatta da un file esterno e la trasforma in
 * acquisti riconosciuti (giocatore del bundle + proprietario + prezzo).
 *
 * Formati accettati:
 *  - JSON dell'app vecchia (state/asta_backup_*.json):
 *      { "<id>_<Nome> (<Club>)": { proprietario, prezzo, id_clean, nome_puro, ruolo, ... } }
 *  - CSV / TSV / XLSX con colonne riconoscibili
 *      (squadra|proprietario|team, giocatore|nome|calciatore, prezzo|costo|crediti, [ruolo])
 *  - CSV/XLSX "a sezioni": riga col nome squadra, poi i suoi giocatori
 */
import type { Acquisto, Giocatore } from '../domain/types';
import { normalizzaNome } from '../engine/names';

export interface RisultatoImport {
	fonte: string;
	acquisti: Acquisto[];
	squadre: string[];
	nonTrovati: string[];
	speso: Record<string, number>;
}

interface RigaGrezza {
	proprietario: string;
	nome: string;
	prezzo: number;
	ruolo?: string;
	idClean?: number;
	club?: string;
}

const NUM = (v: unknown): number => {
	if (typeof v === 'number') return v;
	const n = parseFloat(String(v ?? '').replace(/[^\d.,-]/g, '').replace(',', '.'));
	return Number.isFinite(n) ? n : 0;
};

// --- riconoscimento colonne per i formati tabellari -------------------------
const COL = {
	proprietario: ['proprietario', 'squadra', 'team', 'fantasquadra', 'allenatore', 'owner', 'fantallenatore'],
	nome: ['giocatore', 'nome', 'calciatore', 'player', 'name'],
	prezzo: ['prezzo', 'costo', 'crediti', 'cr', 'valore', 'price', 'paid', 'costo asta'],
	ruolo: ['ruolo', 'r', 'rm', 'role'],
	club: ['club', 'serie a', 'squadra serie a', 'squadraseriea']
};
function trovaCol(headers: string[], nomi: string[]): number {
	const low = headers.map((h) => String(h).trim().toLowerCase());
	for (const n of nomi) {
		const i = low.indexOf(n);
		if (i >= 0) return i;
	}
	// match parziale
	for (let i = 0; i < low.length; i++) if (nomi.some((n) => low[i].includes(n))) return i;
	return -1;
}

// --- risoluzione giocatore contro il bundle --------------------------------
function creaResolver(giocatori: Giocatore[]) {
	const perId = new Map<number, Giocatore>();
	const perNome = new Map<string, Giocatore>();
	for (const g of giocatori) {
		if (g.id) perId.set(g.id, g);
		perNome.set(g.chiave, g);
	}
	return (nome: string, idClean?: number, club?: string): Giocatore | null => {
		if (idClean && perId.has(idClean)) return perId.get(idClean)!;
		const chiave = normalizzaNome(nome);
		if (perNome.has(chiave)) return perNome.get(chiave)!;
		// disambigua per club se il cognome è ambiguo (es. "Martinez")
		if (club) {
			const cands = giocatori.filter((g) => g.chiave === chiave && normalizzaNome(g.squadra) === normalizzaNome(club));
			if (cands.length === 1) return cands[0];
		}
		// prova col solo primo token (es. "Martinez L." -> "martinez")
		const primo = chiave.split(' ')[0];
		const parziali = giocatori.filter((g) => g.chiave.split(' ')[0] === primo && (!club || normalizzaNome(g.squadra) === normalizzaNome(club)));
		return parziali.length === 1 ? parziali[0] : null;
	};
}

function assembla(righe: RigaGrezza[], giocatori: Giocatore[], fonte: string): RisultatoImport {
	const risolvi = creaResolver(giocatori);
	const acquisti: Acquisto[] = [];
	const nonTrovati: string[] = [];
	const speso: Record<string, number> = {};
	const squadreOrd: string[] = [];
	let ordine = 0;
	for (const r of righe) {
		if (!r.nome || !r.proprietario) continue;
		if (!squadreOrd.includes(r.proprietario)) squadreOrd.push(r.proprietario);
		const g = risolvi(r.nome, r.idClean, r.club);
		if (!g) {
			nonTrovati.push(`${r.nome}${r.club ? ` (${r.club})` : ''} → ${r.proprietario}`);
			continue;
		}
		if (acquisti.some((a) => a.giocatoreId === g.id)) continue; // no doppioni
		const prezzo = Math.max(1, Math.round(r.prezzo || 1));
		acquisti.push({
			giocatoreId: g.id,
			nome: g.nome,
			nomePuro: g.chiave,
			ruolo: g.ruolo,
			squadraSerieA: g.squadra,
			prezzo,
			proprietario: r.proprietario,
			ordine: ++ordine,
			timestamp: Date.now() + ordine
		});
		speso[r.proprietario] = (speso[r.proprietario] ?? 0) + prezzo;
	}
	return { fonte, acquisti, squadre: squadreOrd, nonTrovati, speso };
}

// --- JSON app vecchia -----------------------------------------------------
function daBackupVecchio(obj: Record<string, unknown>, giocatori: Giocatore[]): RisultatoImport | null {
	const valori = Object.values(obj);
	const sembra = valori.length > 0 && valori.every(
		(v) => v && typeof v === 'object' && 'proprietario' in (v as object) && 'prezzo' in (v as object)
	);
	if (!sembra) return null;
	const righe: RigaGrezza[] = valori.map((v) => {
		const o = v as Record<string, unknown>;
		return {
			proprietario: String(o.proprietario ?? '').trim(),
			nome: String(o.nome_puro ?? o.nome ?? '').trim(),
			prezzo: NUM(o.prezzo),
			ruolo: String(o.ruolo ?? ''),
			idClean: NUM(o.id_clean) || undefined,
			club: String(o.squadra_seriea ?? '') || undefined
		};
	});
	return assembla(righe, giocatori, 'backup asta (app precedente)');
}

// --- tabelle (CSV/TSV/XLSX come array di righe) ---------------------------
/**
 * Formato "a colonne" (export rose Fantacalcio.it / lega): riga 0 con i nomi
 * squadra ripetuti ogni ~3 colonne (name, "costo", vuota), poi una colonna di
 * giocatori e una di prezzi per squadra, terminate da "totale". Le squadre che
 * hanno solo "totale" (nessun giocatore) vengono ignorate.
 */
function daRoseColonne(matrice: string[][], giocatori: Giocatore[], fonte: string): RisultatoImport | null {
	if (!matrice.length) return null;
	const testa = matrice[0].map((x) => String(x ?? '').trim());
	const marcatoriCosto = testa.filter((c) => /^costo$/i.test(c)).length;
	if (marcatoriCosto < 2) return null; // non è questo formato

	// colonne di intestazione squadra: cella non vuota, non "costo",
	// e la cella accanto (o a +1) è "costo"
	const blocchi: { nome: string; colNome: number; colPrezzo: number }[] = [];
	for (let c = 0; c < testa.length; c++) {
		const v = testa[c];
		if (!v || /^costo$/i.test(v)) continue;
		if (/^costo$/i.test(testa[c + 1] ?? '')) blocchi.push({ nome: v, colNome: c, colPrezzo: c + 1 });
	}
	if (blocchi.length < 2) return null;

	const righe: RigaGrezza[] = [];
	for (const b of blocchi) {
		for (let r = 1; r < matrice.length; r++) {
			const nome = String(matrice[r]?.[b.colNome] ?? '').trim();
			if (!nome) continue;
			if (/^totale$/i.test(nome)) break; // fine rosa
			const prezzo = NUM(matrice[r][b.colPrezzo]);
			righe.push({ proprietario: b.nome, nome, prezzo });
		}
	}
	const res = assembla(righe, giocatori, fonte);
	// squadre vuote fuori
	res.squadre = res.squadre.filter((s) => res.acquisti.some((a) => a.proprietario === s));
	return res;
}

function daTabella(matrice: string[][], giocatori: Giocatore[], fonte: string): RisultatoImport {
	const colonne = daRoseColonne(matrice, giocatori, fonte);
	if (colonne && colonne.acquisti.length) return colonne;

	// cerca la riga di intestazione (una delle prime 5 righe con >=2 colonne note)
	let hIdx = -1;
	for (let i = 0; i < Math.min(6, matrice.length); i++) {
		const h = matrice[i].map((x) => String(x).toLowerCase());
		const hits = [COL.nome, COL.prezzo, COL.proprietario].filter((set) =>
			h.some((c) => set.some((n) => c.includes(n)))
		).length;
		if (hits >= 2) {
			hIdx = i;
			break;
		}
	}

	if (hIdx >= 0) {
		const headers = matrice[hIdx];
		const cP = trovaCol(headers, COL.proprietario);
		const cN = trovaCol(headers, COL.nome);
		const cPr = trovaCol(headers, COL.prezzo);
		const cR = trovaCol(headers, COL.ruolo);
		const cCl = trovaCol(headers, COL.club);
		if (cN >= 0 && cPr >= 0) {
			const righe: RigaGrezza[] = [];
			let ultimoProp = '';
			for (let i = hIdx + 1; i < matrice.length; i++) {
				const row = matrice[i];
				const nome = String(row[cN] ?? '').trim();
				const propCell = cP >= 0 ? String(row[cP] ?? '').trim() : '';
				const nonVuote = row.map((x) => String(x).trim()).filter(Boolean);
				// riga "a sezioni": una sola cella non vuota = nome squadra
				if (nonVuote.length === 1 && !NUM(nonVuote[0])) {
					ultimoProp = nonVuote[0];
					continue;
				}
				if (propCell && !nome && nonVuote.length <= 2) {
					ultimoProp = propCell;
					continue;
				}
				if (propCell) ultimoProp = propCell;
				if (!nome) continue;
				righe.push({
					proprietario: ultimoProp,
					nome,
					prezzo: NUM(row[cPr]),
					ruolo: cR >= 0 ? String(row[cR] ?? '') : undefined,
					club: cCl >= 0 ? String(row[cCl] ?? '') : undefined
				});
			}
			return assembla(righe, giocatori, fonte);
		}
	}

	// nessuna intestazione: prova "a sezioni" pura → [Ruolo, Nome, Club, Costo]
	const righe: RigaGrezza[] = [];
	let prop = '';
	for (const row of matrice) {
		const celleP = row.map((x) => String(x).trim()).filter(Boolean);
		if (celleP.length === 1) {
			prop = celleP[0];
			continue;
		}
		if (celleP.length >= 3 && prop) {
			// euristica: ultima cella numerica = prezzo, prima cella corta = ruolo
			const prezzo = NUM(celleP[celleP.length - 1]);
			const ruolo = celleP[0].length <= 4 ? celleP[0] : undefined;
			const nome = ruolo ? celleP[1] : celleP[0];
			const club = celleP.length >= 4 ? celleP[celleP.length - 2] : undefined;
			if (nome && prezzo) righe.push({ proprietario: prop, nome, prezzo, ruolo, club });
		}
	}
	return assembla(righe, giocatori, fonte);
}

function parseCsv(testo: string): string[][] {
	const sep = testo.includes('\t') && !testo.includes(',') ? '\t' : testo.split('\n')[0].includes(';') ? ';' : ',';
	return testo
		.split(/\r?\n/)
		.filter((l) => l.trim())
		.map((l) => {
			// gestione base delle virgolette
			const out: string[] = [];
			let cur = '';
			let q = false;
			for (const ch of l) {
				if (ch === '"') q = !q;
				else if (ch === sep && !q) {
					out.push(cur);
					cur = '';
				} else cur += ch;
			}
			out.push(cur);
			return out.map((c) => c.trim().replace(/^"|"$/g, ''));
		});
}

export async function importaRoseDaFile(file: File, giocatori: Giocatore[]): Promise<RisultatoImport> {
	const nome = file.name.toLowerCase();
	if (nome.endsWith('.json')) {
		const obj = JSON.parse(await file.text());
		if (obj && !Array.isArray(obj) && typeof obj === 'object') {
			const r = daBackupVecchio(obj as Record<string, unknown>, giocatori);
			if (r) return r;
		}
		throw new Error('JSON non riconosciuto come rosa d\'asta. Per i backup dell\'app usa "Ripristina".');
	}
	if (nome.endsWith('.csv') || nome.endsWith('.tsv') || nome.endsWith('.txt')) {
		return daTabella(parseCsv(await file.text()), giocatori, `file ${file.name}`);
	}
	if (nome.endsWith('.xlsx') || nome.endsWith('.xls')) {
		const XLSX = await import('xlsx');
		const wb = XLSX.read(await file.arrayBuffer(), { type: 'array' });
		// prova ogni foglio, tieni il risultato con più acquisti
		let migliore: RisultatoImport | null = null;
		for (const sheetName of wb.SheetNames) {
			const m = XLSX.utils.sheet_to_json<string[]>(wb.Sheets[sheetName], { header: 1, blankrows: false, defval: '' }) as string[][];
			const r = daTabella(m, giocatori, `${file.name} · ${sheetName}`);
			if (!migliore || r.acquisti.length > migliore.acquisti.length) migliore = r;
		}
		if (!migliore) throw new Error('Nessun foglio leggibile nel file Excel.');
		return migliore;
	}
	throw new Error('Formato non supportato. Usa .json, .csv o .xlsx');
}
