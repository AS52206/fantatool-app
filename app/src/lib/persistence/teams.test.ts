import { describe, expect, it } from 'vitest';
import type { Acquisto, Squadra } from '../domain/types';
import { identifyTeams } from './teams';

const purchase = (owner: string, ownerId?: string): Acquisto => ({
	giocatoreId: 1, nome: 'Giocatore', nomePuro: 'Giocatore', ruolo: 'A',
	squadraSerieA: 'Roma', prezzo: 10, proprietario: owner,
	proprietarioId: ownerId, ordine: 1, timestamp: 1
});

describe('identifyTeams', () => {
	it('migrates legacy names to stable IDs without mutating the import', () => {
		const teams: Squadra[] = [{ nome: 'Prima', isMia: true }, { nome: 'Seconda', isMia: false }];
		const purchases = [purchase('Prima')];
		const normalized = identifyTeams(teams, purchases);
		expect(normalized.squadre[0].id).toBeTruthy();
		expect(normalized.squadre[1].id).not.toBe(normalized.squadre[0].id);
		expect(normalized.acquisti[0].proprietarioId).toBe(normalized.squadre[0].id);
		expect(identifyTeams(normalized.squadre, normalized.acquisti)).toEqual(normalized);
		expect(teams[0].id).toBeUndefined();
		expect(purchases[0].proprietarioId).toBeUndefined();
	});

	it('resolves an undo snapshot with an old name against the renamed team ID', () => {
		const restored = identifyTeams([{ id: 'team-1', nome: 'Nuovo nome', isMia: true }], [purchase('Vecchio nome', 'team-1')]);
		expect(restored.acquisti[0]).toMatchObject({ proprietario: 'Nuovo nome', proprietarioId: 'team-1' });
	});

	it('does not reassign purchases to a different team that reused the old name', () => {
		const restored = identifyTeams([
			{ id: 'team-1', nome: 'Nuovo nome', isMia: true },
			{ id: 'team-2', nome: 'Vecchio nome', isMia: false }
		], [purchase('Vecchio nome', 'team-1')]);
		expect(restored.acquisti[0].proprietario).toBe('Nuovo nome');
	});

	it.each([
		[{ nome: 'Prima', isMia: true }, { nome: ' Prima ', isMia: false }],
		[{ nome: '   ', isMia: true }]
	])('rejects duplicate or empty normalized names', (...teams) => {
		expect(() => identifyTeams(teams, [])).toThrow('distinti e non vuoti');
	});

	it('rejects duplicate IDs', () => {
		expect(() => identifyTeams([
			{ id: 'duplicate', nome: 'Prima', isMia: true },
			{ id: 'duplicate', nome: 'Seconda', isMia: false }
		], [])).toThrow('duplicato');
	});

	it.each([purchase('Assente'), purchase('Prima', 'missing-id')])('rejects an unknown owner rather than falling back to a possibly reused name', (unknown) => {
		expect(() => identifyTeams([{ id: 'team-1', nome: 'Prima', isMia: true }], [unknown])).toThrow('Squadra non trovata');
	});
});
