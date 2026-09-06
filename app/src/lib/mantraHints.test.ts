import { describe, it, expect } from 'vitest';
import {
	FAMIGLIE_MODULI_MANTRA,
	famigliaDelModulo,
	coperturaGiocatoreModuli,
	raccomandaFamiglie,
	giocatoriPerno,
	allertaRuoliChiave
} from './mantraHints';
import { MODULI_MANTRA, type GiocatoreMantraInput } from './engine/mantra';

const ROSA: GiocatoreMantraInput[] = [
	{ chiave: 'por1', nome: 'Por Uno', ruoli: 'Por', punteggio: 70 },
	{ chiave: 'por2', nome: 'Por Due', ruoli: 'Por', punteggio: 45 },
	{ chiave: 'dc1', nome: 'Dc Uno', ruoli: 'Dc', punteggio: 68 },
	{ chiave: 'dc2', nome: 'Dc Due', ruoli: 'Dc;B', punteggio: 60 },
	{ chiave: 'dc3', nome: 'Dc Tre', ruoli: 'Dc', punteggio: 52 },
	{ chiave: 'dd1', nome: 'Terzo Ino', ruoli: 'Dd;E', punteggio: 64 },
	{ chiave: 'ds1', nome: 'Ds Uno', ruoli: 'Ds', punteggio: 58 },
	{ chiave: 'e1', nome: 'Est Uno', ruoli: 'E', punteggio: 62 },
	{ chiave: 'e2', nome: 'Est Due', ruoli: 'E;W', punteggio: 55 },
	{ chiave: 'm1', nome: 'Med Uno', ruoli: 'M', punteggio: 66 },
	{ chiave: 'm2', nome: 'Med Due', ruoli: 'M;C', punteggio: 61 },
	{ chiave: 'c1', nome: 'Cen Uno', ruoli: 'C', punteggio: 59 },
	{ chiave: 'w1', nome: 'Ala Uno', ruoli: 'W;A', punteggio: 72 },
	{ chiave: 'a1', nome: 'Att Uno', ruoli: 'A;Pc', punteggio: 80 },
	{ chiave: 'a2', nome: 'Att Due', ruoli: 'A', punteggio: 67 }
];

describe('FAMIGLIE_MODULI_MANTRA', () => {
	it('ogni modulo elencato esiste nel motore', () => {
		for (const f of FAMIGLIE_MODULI_MANTRA)
			for (const m of f.moduli) expect(m in MODULI_MANTRA).toBe(true);
	});
	it('famigliaDelModulo trova la famiglia', () => {
		expect(famigliaDelModulo('3-5-2')?.nome).toBe('Difesa a 3');
		expect(famigliaDelModulo('4-3-3')?.nome).toBe('Difesa a 4');
		expect(famigliaDelModulo('x')).toBeUndefined();
	});
});

describe('coperturaGiocatoreModuli', () => {
	it('un ruolo singolo copre meno slot di un polivalente', () => {
		const puro = coperturaGiocatoreModuli('Dc', ['4-3-3', '4-4-2']);
		const jolly = coperturaGiocatoreModuli('Dd;Dc;E', ['4-3-3', '4-4-2']);
		expect(jolly.slotCompatibili).toBeGreaterThan(puro.slotCompatibili);
		expect(puro.ponte).toBe(false);
		expect(jolly.ponte).toBe(true);
	});
	it('W;A è un ponte tra trequarti e attacco', () => {
		const c = coperturaGiocatoreModuli('W;A', Object.keys(MODULI_MANTRA));
		expect(c.linee).toEqual(expect.arrayContaining(['Trequarti', 'Attacco']));
		expect(c.ponte).toBe(true);
	});
	it('lista moduli vuota => usa tutti i moduli', () => {
		const c = coperturaGiocatoreModuli('Por', []);
		expect(c.moduliTotali).toBe(Object.keys(MODULI_MANTRA).length);
	});
});

describe('raccomandaFamiglie', () => {
	it('ordina per punteggio e riporta entrambe le famiglie', () => {
		const r = raccomandaFamiglie(ROSA);
		expect(r).toHaveLength(2);
		expect(r[0].punteggio).toBeGreaterThanOrEqual(r[1].punteggio);
		expect(r[0].coperturaMax).toBeGreaterThan(0);
		expect(r[0].moduloMigliore in MODULI_MANTRA).toBe(true);
	});
});

describe('giocatoriPerno', () => {
	it('sono polivalenti e ordinati per numero di moduli', () => {
		const p = giocatoriPerno(ROSA, ['3-4-1-2', '3-5-2', '4-3-3']);
		expect(p.length).toBeGreaterThan(0);
		for (const g of p) expect(g.ruoli).toMatch(/[;,/]/);
		for (let i = 1; i < p.length; i++)
			expect(p[i - 1].moduliSchierato).toBeGreaterThanOrEqual(p[i].moduliSchierato);
	});
});

describe('allertaRuoliChiave', () => {
	it('segnala CRITICO quando manca un ruolo rigido del modulo target', () => {
		const senzaT = ROSA.filter((g) => typeof g === 'object' && g.chiave !== 'w1'); // nessun W/T rimasto
		const al = allertaRuoliChiave(senzaT, ['4-3-1-2']); // 4-3-1-2 ha uno slot 'T' singolo
		const t = al.find((a) => a.ruolo === 'T');
		expect(t).toBeTruthy();
		expect(t?.livello).toBe('CRITICO');
		expect(t?.inRosa).toBe(0);
	});
	it('nessun modulo target => nessun allarme', () => {
		expect(allertaRuoliChiave(ROSA, [])).toEqual([]);
	});
	it('propaga lo stato di scarsità di mercato', () => {
		const senzaT = ROSA.filter((g) => typeof g === 'object' && g.chiave !== 'w1');
		const al = allertaRuoliChiave(senzaT, ['4-3-1-2'], { T: 'CRITICA' });
		expect(al.find((a) => a.ruolo === 'T')?.scarsita).toBe('CRITICA');
	});
});
