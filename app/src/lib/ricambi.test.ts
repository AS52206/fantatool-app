import { describe, expect, it } from 'vitest';
import { pianoRosaPerModulo, ricambiMantraDa, ricambiMantraDaModuli } from './ricambi';
import { PIANO_ROSA_MANTRA_PER_MODULO } from './engine/mantra';

const MODULI = Object.keys(PIANO_ROSA_MANTRA_PER_MODULO);

describe('pianoRosaPerModulo — tabella BABBOFANTACALCIO', () => {
	it('a 28 (3+25) riproduce la tabella esatta', () => {
		for (const m of MODULI) {
			const p = pianoRosaPerModulo(m, 28, 3)!;
			expect(p).toEqual(PIANO_ROSA_MANTRA_PER_MODULO[m]);
		}
	});

	it('scala mantenendo la somma = rosa totale', () => {
		for (const tot of [25, 28, 30, 32]) {
			for (const m of MODULI) {
				const p = pianoRosaPerModulo(m, tot, 3)!;
				const somma = Object.values(p).reduce((s, n) => s + n, 0);
				expect(somma).toBe(tot);
				expect(p.Por).toBe(3);
				for (const v of Object.values(p)) expect(v).toBeGreaterThanOrEqual(0);
			}
		}
	});

	it('a 30 la difesa a 3 tiene 8+ centrali, la difesa a 4 tiene i laterali', () => {
		const treDietro = pianoRosaPerModulo('3-5-2', 30, 3)!;
		expect(treDietro['Dc/B']).toBeGreaterThanOrEqual(8);
		expect(treDietro['Dd/Ds']).toBe(0);

		const quattroDietro = pianoRosaPerModulo('4-3-3', 30, 3)!;
		expect(quattroDietro['Dd/Ds']).toBeGreaterThanOrEqual(6);
	});

	it('modulo sconosciuto → null', () => {
		expect(pianoRosaPerModulo('5-3-2', 30, 3)).toBeNull();
	});
});

describe('ricambiMantraDa / DaModuli', () => {
	it('obiettivi sommano alla rosa totale', () => {
		const r = ricambiMantraDa([], 30, '3-4-1-2', 3);
		expect(r.reduce((s, x) => s + x.obiettivo, 0)).toBe(30);
	});

	it('più moduli target: media, somma ancora alla rosa', () => {
		const r = ricambiMantraDaModuli([], 30, ['3-4-1-2', '3-5-2', '4-3-1-2'], 3);
		expect(r.reduce((s, x) => s + x.obiettivo, 0)).toBe(30);
	});

	it('un polivalente Dd;E conta sia in Dd/Ds sia in E', () => {
		const r = ricambiMantraDa(['Dd;E'], 30, '4-4-2', 3);
		expect(r.find((x) => x.chiave === 'Dd/Ds')!.presenti).toBe(1);
		expect(r.find((x) => x.chiave === 'E')!.presenti).toBe(1);
	});
});
