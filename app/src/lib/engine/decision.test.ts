import { describe, it, expect } from 'vitest';
import c from './__reference__/decision_cases.json';
import {
	calcolaFasciaOperativa,
	classificaFaseAsta,
	valutaDecisioneImmediata,
	calcolaAllarmiChiusuraAsta,
	profilaRivali,
	calcolaPoteriAcquisto,
	costruisciMatriceDomandaClassic,
	confrontaCandidati,
	confrontaScenari,
	analizzaPianoDinamico,
	valutaAffidabilitaGiocatore,
	type BilancioRivale
} from './decision';

/** snake_case (Python) -> camelCase (input TS) per gli oggetti-parametro. */
function camel(o: Record<string, unknown>): Record<string, unknown> {
	const out: Record<string, unknown> = {};
	for (const [k, v] of Object.entries(o)) {
		out[k.replace(/_([a-z])/g, (_, x) => x.toUpperCase())] = v;
	}
	return out;
}

describe('calcolaFasciaOperativa', () => {
	for (const t of c.fascia) {
		it(JSON.stringify(t.input), () => {
			expect(calcolaFasciaOperativa(camel(t.input) as never)).toEqual(t.atteso);
		});
	}
});

describe('classificaFaseAsta', () => {
	for (const t of c.fase) {
		it(JSON.stringify(t.args), () => {
			// @ts-expect-error spread posizionale
			expect(classificaFaseAsta(...t.args)).toEqual(t.atteso);
		});
	}
});

describe('valutaDecisioneImmediata', () => {
	for (const t of c.decisione) {
		it(JSON.stringify(t.input), () => {
			expect(valutaDecisioneImmediata(camel(t.input) as never)).toEqual(t.atteso);
		});
	}
});

describe('calcolaAllarmiChiusuraAsta', () => {
	for (const t of c.allarmi) {
		it(JSON.stringify(t.input).slice(0, 60), () => {
			expect(calcolaAllarmiChiusuraAsta(camel(t.input) as never)).toEqual(t.atteso);
		});
	}
});

describe('profilaRivali', () => {
	const { bilanci, acquisti, limiti, casi } = c.profilaRivali;
	for (const t of casi) {
		it(`slot_target=${t.slot_target}`, () => {
			const res = profilaRivali(
				bilanci as Record<string, BilancioRivale>,
				acquisti,
				'A',
				t.slot_target,
				limiti,
				'Io',
				30
			);
			expect(res).toEqual(t.atteso);
		});
	}
});

describe('calcolaPoteriAcquisto', () => {
	const { limiti, quote, casi } = c.poteri;
	for (const t of casi) {
		it(JSON.stringify(t.bilancio).slice(0, 50), () => {
			expect(calcolaPoteriAcquisto(t.bilancio as BilancioRivale, t.ruolo, limiti, 500, quote)).toEqual(
				t.atteso
			);
		});
	}
});

describe('costruisciMatriceDomandaClassic', () => {
	it('classic', () => {
		const { bilanci, limiti, atteso } = c.matriceDomanda;
		expect(costruisciMatriceDomandaClassic(bilanci as Record<string, BilancioRivale>, limiti, 'Io')).toEqual(
			atteso
		);
	});
});

describe('confrontaCandidati', () => {
	it('3 candidati', () => {
		expect(confrontaCandidati(c.confrontaCandidati.candidati)).toEqual(c.confrontaCandidati.atteso);
	});
});

describe('confrontaScenari', () => {
	it('a vs b', () => {
		const { a, b, ruoli, atteso } = c.confrontaScenari;
		expect(confrontaScenari(a, b, ruoli, 500)).toEqual(atteso);
	});
});

describe('analizzaPianoDinamico', () => {
	it('piano', () => {
		const { piano, acquisti, mia, budget, atteso } = c.analizzaPiano;
		expect(analizzaPianoDinamico(piano, acquisti, mia, budget)).toEqual(atteso);
	});
});

describe('valutaAffidabilitaGiocatore', () => {
	for (const t of c.affidabilita) {
		it(JSON.stringify(t.input).slice(0, 60), () => {
			expect(valutaAffidabilitaGiocatore(camel(t.input) as never)).toEqual(t.atteso);
		});
	}
});
