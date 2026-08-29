import { describe, it, expect } from 'vitest';
import c from './__reference__/mantra_cases.json';
import {
	assegnaGiocatoriModulo,
	analizzaRosaMantra,
	analizzaFragilitaModulo,
	calcolaCateneSostituzioneMantra,
	valutaCandidatoSuModuli,
	prioritaRuoliMantra,
	calcolaScarsitaRuoliMantra,
	contaIncompatibiliModuli,
	impattoCandidatoMantra,
	calcolaMatriceDomandaMantra,
	analizzaPianoRosaMantra,
	type GiocatoreMantraInput
} from './mantra';

const ROSA = [
	{ chiave: 'por1', ruoli: 'Por', punteggio: 70 },
	{ chiave: 'por2', ruoli: 'Por', punteggio: 45 },
	{ chiave: 'dc1', ruoli: 'Dc', punteggio: 68 },
	{ chiave: 'dc2', ruoli: 'Dc;B', punteggio: 60 },
	{ chiave: 'dc3', ruoli: 'Dc', punteggio: 52 },
	{ chiave: 'dd1', ruoli: 'Dd;E', punteggio: 64 },
	{ chiave: 'ds1', ruoli: 'Ds', punteggio: 58 },
	{ chiave: 'e1', ruoli: 'E', punteggio: 62 },
	{ chiave: 'e2', ruoli: 'E;W', punteggio: 55 },
	{ chiave: 'm1', ruoli: 'M', punteggio: 66 },
	{ chiave: 'm2', ruoli: 'M;C', punteggio: 61 },
	{ chiave: 'c1', ruoli: 'C', punteggio: 59 },
	{ chiave: 'c2', ruoli: 'C;T', punteggio: 57 },
	{ chiave: 'w1', ruoli: 'W;A', punteggio: 72 },
	{ chiave: 't1', ruoli: 'T', punteggio: 63 },
	{ chiave: 'a1', ruoli: 'A;Pc', punteggio: 80 },
	{ chiave: 'a2', ruoli: 'A', punteggio: 67 },
	{ chiave: 'pc1', ruoli: 'Pc', punteggio: 54 },
	{ chiave: 'x1', ruoli: 'Dc', punteggio: 30 },
	{ chiave: 'x2', ruoli: 'E', punteggio: 28 }
] satisfies GiocatoreMantraInput[];

const rose: Record<string, GiocatoreMantraInput[]> = {
	piena: ROSA,
	ridotta: ROSA.slice(0, 13),
	mini: ROSA.slice(0, 8)
};

function slim(e: ReturnType<typeof assegnaGiocatoriModulo>) {
	return {
		modulo: e.modulo,
		coperti: e.coperti,
		completo: e.completo,
		mancanti: e.mancanti,
		punteggio: e.punteggio,
		slot_chiave: e.assegnazioni.map((a) => [a.slot, a.giocatore ? a.giocatore.chiave : null]),
		panchina: e.panchina.map((p) => p.chiave)
	};
}

describe('assegnaGiocatoriModulo — matching, parità con mantra.py', () => {
	for (const t of c.assegna) {
		it(`${t.rosa} · ${t.modulo}`, () => {
			expect(slim(assegnaGiocatoriModulo(rose[t.rosa], t.modulo))).toEqual(t.atteso);
		});
	}
});

describe('analizzaRosaMantra', () => {
	for (const t of c.rosa) {
		it(t.n, () => {
			const r = analizzaRosaMantra(rose[t.n]);
			expect({
				portieri: r.portieri,
				rosa_minima_ok: r.rosa_minima_ok,
				giocatori_mancanti: r.giocatori_mancanti,
				portieri_mancanti: r.portieri_mancanti,
				moduli_completi: r.moduli_completi,
				migliore: r.migliore.modulo,
				coperti_migliore: r.migliore.coperti,
				moduli: r.moduli.map((v) => [v.modulo, v.coperti, v.completo])
			}).toEqual(t.atteso);
		});
	}
});

describe('analizzaFragilitaModulo', () => {
	for (const t of c.fragilita) {
		it(t.modulo, () => {
			const f = analizzaFragilitaModulo(ROSA.slice(0, 13), t.modulo);
			expect({
				livello: f.livello,
				numero_critici: f.numero_critici,
				critici: f.critici.map((x) => [x.chiave, x.coperti_senza, x.mancanti_senza])
			}).toEqual(t.atteso);
		});
	}
});

describe('calcolaCateneSostituzioneMantra', () => {
	for (const t of c.catene) {
		it(t.modulo, () => {
			const r = calcolaCateneSostituzioneMantra(ROSA.slice(0, 13), t.modulo);
			expect(
				r.catene.map((item) => ({
					slot: item.slot,
					titolare: item.titolare.chiave,
					entranti: item.entranti.map((e) => e!.chiave),
					spostamenti: item.spostamenti.map((s) => [s.giocatore.chiave, s.da, s.a]),
					coperti_dopo: item.coperti_dopo,
					resta_completo: item.resta_completo,
					alternativa: item.alternativa ? item.alternativa.modulo : null
				}))
			).toEqual(t.atteso);
		});
	}
});

describe('valutaCandidatoSuModuli', () => {
	for (const t of c.candidato) {
		it(t.ruoli, () => {
			const r = valutaCandidatoSuModuli(
				ROSA.slice(0, 12),
				{ chiave: 'cand', ruoli: t.ruoli, punteggio: 50 },
				['3-4-1-2', '4-3-3', '3-5-2']
			);
			expect({ delta_copertura: r.delta_copertura, moduli_completati: r.moduli_completati }).toEqual(
				t.atteso
			);
		});
	}
});

describe('prioritaRuoliMantra', () => {
	for (const t of c.priorita) {
		it(JSON.stringify(t.moduli), () => {
			const r = prioritaRuoliMantra(ROSA.slice(0, 14), t.moduli);
			expect(
				r.map((it) => [
					it.ruolo,
					it.punteggio,
					it.delta_copertura,
					it.slot_mancanti_compatibili,
					it.fragilita_ridotta
				])
			).toEqual(t.atteso);
		});
	}
});

describe('calcolaScarsitaRuoliMantra', () => {
	it('8 squadre', () => {
		expect(calcolaScarsitaRuoliMantra(c.scarsita.liberi, 8, 60)).toEqual(c.scarsita.atteso);
	});
});

describe('contaIncompatibiliModuli', () => {
	for (const t of c.incompatibili) {
		it(JSON.stringify(t.moduli), () => {
			expect(contaIncompatibiliModuli(t.ruoli, t.moduli)).toBe(t.atteso);
		});
	}
});

describe('impattoCandidatoMantra', () => {
	for (const t of c.impatto) {
		it(t.candidato, () => {
			const r = impattoCandidatoMantra(
				ROSA.slice(0, 12).map((g) => g.ruoli),
				t.candidato
			);
			expect({
				delta_copertura: r.delta_copertura,
				nuovi_moduli_completi: r.nuovi_moduli_completi,
				migliore_dopo: r.migliore_dopo.modulo
			}).toEqual(t.atteso);
		});
	}
});

describe('calcolaMatriceDomandaMantra', () => {
	it('4 squadre', () => {
		const md = calcolaMatriceDomandaMantra(c.matriceDomanda.roseRuoli, {
			rosaTotale: 25,
			miaSquadra: 'Io'
		});
		expect(
			md.map((r) => ({
				ruolo: r.ruolo,
				squadre_interessate: r.squadre_interessate,
				domanda_equivalente: r.domanda_equivalente,
				stati: Object.fromEntries(
					Object.entries(r.squadre).map(([s, cella]) => [s, (cella as { stato: string }).stato])
				)
			}))
		).toEqual(c.matriceDomanda.atteso);
	});
});

describe('analizzaPianoRosaMantra', () => {
	it('15 giocatori', () => {
		const r = analizzaPianoRosaMantra(c.pianoRosa.ruoli);
		expect({
			somma_obiettivi: r.somma_obiettivi,
			altri: r.altri,
			modulo_principale: r.modulo_principale,
			profili: Object.fromEntries(
				Object.entries(r.profili).map(([k, v]) => [
					k,
					{
						presenti: (v as { presenti: number }).presenti,
						mancanti: (v as { mancanti: number }).mancanti,
						eccesso: (v as { eccesso: number }).eccesso
					}
				])
			),
			copertura_coperti: r.copertura_modulo.coperti
		}).toEqual(c.pianoRosa.atteso);
	});
});
