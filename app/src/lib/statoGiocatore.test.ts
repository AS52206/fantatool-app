import { describe, it, expect } from 'vitest';
import { badgeStato, affidabile } from './statoGiocatore';
import type { FantacreditiInfo } from './domain/types';

const fc = (o: Partial<FantacreditiInfo>): FantacreditiInfo => ({
	pma: 0,
	pfc: 0,
	slot: null,
	expectedTitolarita: 80,
	expectedFantamedia: 6,
	penaltyProbability: 0,
	unavailableUntilRound: 0,
	playerStatus: '',
	fasciaFc: '',
	newArrival: false,
	...o
});

describe('badgeStato', () => {
	it('niente fc => nessun badge', () => {
		expect(badgeStato(null)).toEqual([]);
	});
	it('infortunato ha solo il badge rosso, non il ballottaggio', () => {
		const b = badgeStato(fc({ unavailableUntilRound: 3, expectedTitolarita: 20 }));
		expect(b.map((x) => x.icona)).toEqual(['🔴']);
	});
	it('rigorista designato >= 50', () => {
		expect(badgeStato(fc({ penaltyProbability: 55 })).some((x) => x.icona === '⚽')).toBe(true);
		expect(badgeStato(fc({ penaltyProbability: 40 })).some((x) => x.icona === '⚽')).toBe(false);
	});
	it('status B non segnala ballottaggio se la titolarità è già da titolare', () => {
		expect(badgeStato(fc({ playerStatus: 'B', expectedTitolarita: 85 })).length).toBe(0);
		expect(badgeStato(fc({ playerStatus: 'B', expectedTitolarita: 60 })).some((x) => x.icona === '⏱')).toBe(true);
	});
	it('titolarità bassa => ballottaggio', () => {
		expect(badgeStato(fc({ expectedTitolarita: 40 })).some((x) => x.icona === '⏱')).toBe(true);
	});
	it('nuovo arrivo', () => {
		expect(badgeStato(fc({ newArrival: true })).some((x) => x.icona === '✨')).toBe(true);
	});
	it('usa il dettaglio del file ballottaggi anche senza metriche Fantacrediti', () => {
		const ballottaggio = { contendente: 'Rivale', rischio: 'Pesante', expectedTitolarita: 55, rilevatoIl: '2026-09-10T18:45:00', fonte: 'https://example.test' };
		const badge = badgeStato(null, ballottaggio);
		expect(badge).toMatchObject([{ icona: '⏱', titolo: expect.stringContaining('contro Rivale (55%)') }]);
		expect(affidabile(null, 55, ballottaggio)).toBe(true);
	});
});

describe('affidabile', () => {
	it('titolare e disponibile', () => {
		expect(affidabile(fc({ expectedTitolarita: 70 }))).toBe(true);
	});
	it('sotto soglia o infortunato => no', () => {
		expect(affidabile(fc({ expectedTitolarita: 40 }))).toBe(false);
		expect(affidabile(fc({ expectedTitolarita: 90, unavailableUntilRound: 2 }))).toBe(false);
		expect(affidabile(null)).toBe(false);
	});
});
