import { describe, expect, it } from 'vitest';
import {
	buildCampoMantra,
	fasciaFattoreDifensivo,
	stimaVotoMantra,
	analisiFattoreDifensivo,
	repartoDifensivoMantra,
	type GiocatoreCampo
} from './campo';

describe('fasciaFattoreDifensivo', () => {
	it('mappa la media voto alla fascia bonus', () => {
		expect(fasciaFattoreDifensivo(0).bonus).toBe(0);
		expect(fasciaFattoreDifensivo(5.9).bonus).toBe(0);
		expect(fasciaFattoreDifensivo(6).bonus).toBe(0.5);
		expect(fasciaFattoreDifensivo(6.24).bonus).toBe(0.5);
		expect(fasciaFattoreDifensivo(6.25).bonus).toBe(1);
		expect(fasciaFattoreDifensivo(6.5).bonus).toBe(1.5);
		expect(fasciaFattoreDifensivo(6.75).bonus).toBe(2);
		expect(fasciaFattoreDifensivo(7).bonus).toBe(2.5);
		expect(fasciaFattoreDifensivo(7.4).bonus).toBe(2.5);
	});
});

const g = (nome: string, ruoloMantra: string, fantamedia: number): GiocatoreCampo => ({
	chiave: nome,
	nome,
	ruolo: 'D',
	ruoloMantra,
	fantamedia,
	stato: 'PRESO'
});

describe('analisiFattoreDifensivo', () => {
	it('il portiere: fantamedia corretta di +0.65 verso il voto', () => {
		expect(stimaVotoMantra(5.5, 'Por')).toBeCloseTo(6.15, 5);
		expect(stimaVotoMantra(6.4, 'Dc')).toBe(6.4);
	});

	it('media del reparto = portiere + 5 arretrati, con fascia', () => {
		const rosa = [
			g('P1', 'Por', 5.35), // stima voto ≈ 6.0
			g('D1', 'Dc', 6.0),
			g('D2', 'Dc', 6.0),
			g('D3', 'Dc', 6.0),
			g('E1', 'E', 6.0),
			g('M1', 'M', 6.0)
		];
		const campo = buildCampoMantra(rosa, '3-4-1-2');
		expect(repartoDifensivoMantra(campo)).toHaveLength(6);
		const a = analisiFattoreDifensivo(campo);
		expect(a.titolari.length).toBe(6);
		expect(a.vuoti).toBe(0);
		expect(a.media).toBeCloseTo(6.0, 2);
		expect(a.fascia.bonus).toBe(0.5);
	});

	it('conta slot vuoti e fa la media sui presenti', () => {
		const campo = buildCampoMantra([g('P1', 'Por', 5.65), g('D1', 'Dc', 6.3)], '3-4-1-2');
		const a = analisiFattoreDifensivo(campo);
		expect(a.vuoti).toBeGreaterThan(0);
		expect(a.media).toBeCloseTo(6.3, 2);
	});

	it('candidato idoneo alza la media; non idoneo la lascia uguale', () => {
		const rosa = [g('P1', 'Por', 6.0), g('D1', 'Dc', 6.0), g('D2', 'Dc', 6.0)];
		const campo = buildCampoMantra(rosa, '3-4-1-2');
		const top = analisiFattoreDifensivo(campo, { nome: 'X', fantamedia: 7.2, ruoloMantra: 'Dc' });
		expect(top.conCandidato?.idoneo).toBe(true);
		expect(top.conCandidato!.media).toBeGreaterThan(top.media);

		const att = analisiFattoreDifensivo(campo, { nome: 'Y', fantamedia: 8, ruoloMantra: 'Pc' });
		expect(att.conCandidato?.idoneo).toBe(false);
		expect(att.conCandidato!.media).toBeCloseTo(top.media, 5);
	});
});
