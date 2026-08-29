import { describe, it, expect } from 'vitest';
import cases from './__reference__/cases.json';
import {
	calcolaPrezzoConsigliatoAvanzato,
	calcolaInflazionePerRuolo,
	deduciFlagDaFantacrediti,
	arrotondaCreditoScenario,
	type PrezzoInput
} from './pricing';
import { normalizzaNome } from './names';
import {
	calcolaScarsitaMercato,
	calcolaDomandaSlotRivali,
	type BilancioRivale,
	type LiberoLite
} from './decision';
import type { Acquisto, LimitiRuoli } from '../domain/types';

const LIMITI = cases.limiti as unknown as LimitiRuoli;
const ALLENATORI = cases.allenatori as string[];

describe('calcolaPrezzoConsigliatoAvanzato — parità col motore Python', () => {
	for (const c of cases.prezzo) {
		it(c.nome, () => {
			const inp = c.input as unknown as {
				acquisti: Partial<Acquisto>[];
			} & Omit<PrezzoInput, 'acquisti'>;
			const acquisti: Acquisto[] = inp.acquisti.map((a, i) => ({
				giocatoreId: a.giocatoreId ?? 0,
				nome: '',
				nomePuro: '',
				ruolo: a.ruolo ?? '',
				squadraSerieA: a.squadraSerieA ?? '',
				prezzo: a.prezzo ?? 0,
				proprietario: a.proprietario ?? '',
				ordine: i,
				timestamp: 0
			}));
			const res = calcolaPrezzoConsigliatoAvanzato({ ...inp, acquisti } as PrezzoInput);
			expect(res.prezzo).toBe(c.atteso.prezzo);
			expect(res.etichetta).toBe(c.atteso.etichetta);
		});
	}
});

describe('calcolaInflazionePerRuolo', () => {
	for (const c of cases.inflazioneRuolo) {
		it(c.nome, () => {
			const acquisti = c.acquisti.map((a, i) => ({
				giocatoreId: 0, nome: '', nomePuro: '', ruolo: a.ruolo as Acquisto['ruolo'],
				squadraSerieA: '', prezzo: a.prezzo, proprietario: '', ordine: i, timestamp: 0
			}));
			const val = calcolaInflazionePerRuolo('A', acquisti, 500, ALLENATORI, LIMITI);
			expect(val).toBeCloseTo(c.atteso, 10);
		});
	}
});

describe('deduciFlagDaFantacrediti', () => {
	for (const c of cases.flag) {
		it(c.nome, () => {
			expect(deduciFlagDaFantacrediti(c.fc as never)).toBe(c.atteso);
		});
	}
});

describe('arrotondaCreditoScenario', () => {
	for (const c of cases.arrotonda) {
		it(String(c.valore), () => {
			expect(arrotondaCreditoScenario(c.valore)).toBe(c.atteso);
		});
	}
});

describe('normalizzaNome', () => {
	for (const c of cases.nomi) {
		it(c.input, () => {
			expect(normalizzaNome(c.input)).toBe(c.atteso);
		});
	}
});

describe('calcolaScarsitaMercato — parità con engine.py', () => {
	const liberi = cases.scarsita.liberi as unknown as LiberoLite[];
	for (const t of cases.scarsita.casi) {
		it(`${t.ruolo} slot=${t.slotTarget} domanda=${t.domandaSquadre}`, () => {
			const res = calcolaScarsitaMercato(liberi, t.ruolo, t.slotTarget, t.domandaSquadre, t.idTarget);
			expect(res).toEqual(t.atteso);
		});
	}
});

describe('calcolaDomandaSlotRivali', () => {
	const { bilanci, acquisti, limiti, casi } = cases.domandaSlot;
	for (const t of casi) {
		it(`slotTarget=${t.slotTarget}`, () => {
			expect(
				calcolaDomandaSlotRivali(
					bilanci as Record<string, BilancioRivale>,
					acquisti,
					'A',
					t.slotTarget,
					limiti,
					'Io'
				)
			).toBe(t.atteso);
		});
	}
});
