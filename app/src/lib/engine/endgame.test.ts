import { describe, it, expect } from 'vitest';
import data from './__reference__/endgame_cases.json';
import { ottimizzaFinaleAsta, type CandidatoFinale } from './endgame';
import type { GiocatoreMantraInput } from './mantra';

describe('ottimizzaFinaleAsta — ramo CLASSIC, parità con endgame.py', () => {
	const candidati = data.candidati as CandidatoFinale[];
	for (const t of data.casi) {
		it(t.nome, () => {
			const res = ottimizzaFinaleAsta({
				candidati,
				modalita: 'CLASSIC',
				budgetResiduo: t.input.budgetResiduo,
				slotVuoti: t.input.slotVuoti,
				conteggiRuolo: t.input.conteggiRuolo,
				limitiRuolo: t.input.limitiRuolo,
				sogliaAttivazione: t.input.sogliaAttivazione
			});
			// confronta i campi stabili (i candidati preparati contengono anche i
			// campi originali: verifichiamo profilo/costo/residuo/chiavi/medio).
			expect(res.stato).toBe(t.atteso.stato);
			expect(res.attivo).toBe(t.atteso.attivo);
			expect(res.motivo).toBe(t.atteso.motivo);
			expect(res.percorsi.length).toBe(t.atteso.percorsi.length);
			res.percorsi.forEach((p, i) => {
				const a = t.atteso.percorsi[i];
				expect(p.profilo).toBe(a.profilo);
				expect(p.costo).toBe(a.costo);
				expect(p.residuo).toBe(a.residuo);
				expect(p.punteggio_medio).toBe(a.punteggio_medio);
				expect(p.giocatori.map((g) => g.chiave)).toEqual(a.giocatori.map((g: { chiave: string }) => g.chiave));
			});
		});
	}
});

describe('ottimizzaFinaleAsta — ramo MANTRA, parità con endgame.py', () => {
	const { rosa, candidati, casi } = data.mantra;
	for (const t of casi) {
		it(t.nome, () => {
			const res = ottimizzaFinaleAsta({
				candidati,
				modalita: 'MANTRA',
				budgetResiduo: t.input.budgetResiduo,
				slotVuoti: t.input.slotVuoti,
				rosaMantra: rosa as GiocatoreMantraInput[],
				moduliTarget: t.input.moduliTarget,
				minPortieriMantra: 2
			});
			expect(res.stato).toBe(t.atteso.stato);
			expect(res.attivo).toBe(t.atteso.attivo);
			expect(res.percorsi.length).toBe(t.atteso.percorsi.length);
			res.percorsi.forEach((p, i) => {
				const a = t.atteso.percorsi[i];
				expect(p.profilo).toBe(a.profilo);
				expect(p.modulo).toBe(a.modulo);
				expect(p.costo).toBe(a.costo);
				expect(p.copertura).toBe(a.copertura);
				expect(p.modulo_completo).toBe(a.modulo_completo);
				expect(p.giocatori.map((g) => g.chiave)).toEqual(a.chiavi);
			});
		});
	}
});
