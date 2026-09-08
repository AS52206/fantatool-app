import { describe, it, expect } from 'vitest';
import { checkPurchase } from './operation';
import type { Acquisto } from '../domain/types';

const base = {
	teams: [{ id: 'a', nome: 'A', isMia: true }, { id: 'b', nome: 'B', isMia: false }],
	purchases: [] as Acquisto[], budget: 10, limits: { P: 1, D: 1, C: 1, A: 1, TOT: 4 },
	mantra: false, playerId: 100, role: 'C' as const, owner: 'A', price: 7
};
const purchase = (id: number, ruolo: Acquisto['ruolo'], prezzo = 1): Acquisto => ({
	giocatoreId: id, nome: `P${id}`, nomePuro: `p${id}`, ruolo, squadraSerieA: 'Club',
	prezzo, proprietario: 'A', proprietarioId: 'a', ordine: id, timestamp: id
});

describe('legal auction operations', () => {
	it('reserves one credit per remaining slot and accepts exactly the ceiling', () => {
		expect(checkPurchase(base)).toMatchObject({ maximum: 7, error: '', remainingAfter: 3 });
		expect(checkPurchase({ ...base, price: 8 }).error).toContain('Massimo 7');
	});
	it.each([NaN, Infinity, 0, -1, 1.5])('rejects invalid price %s', (price) => {
		expect(checkPurchase({ ...base, price }).error).toContain('intero');
	});
	it('blocks duplicate players, unknown owners, full roster and full Classic role', () => {
		expect(checkPurchase({ ...base, purchases: [purchase(100, 'C')] }).error).toContain('già assegnato');
		expect(checkPurchase({ ...base, owner: 'missing' }).error).toContain('squadra valida');
		expect(checkPurchase({ ...base, purchases: ['P','D','C','A'].map((r,i) => purchase(i, r as Acquisto['ruolo'])) }).error).toContain('Rosa completa');
		expect(checkPurchase({ ...base, purchases: [purchase(1,'C')] }).error).toContain('reparto C');
	});
	it('Mantra enforces goalkeeper/movement counts, not descriptive Classic role caps', () => {
		const purchases = [purchase(1,'C'),purchase(2,'C')];
		expect(checkPurchase({ ...base, mantra: true, purchases, price: 1 }).error).toBe('');
		expect(checkPurchase({ ...base, mantra: true, purchases: [...purchases,purchase(3,'D')], price: 1 }).error).toContain('movimento');
		expect(checkPurchase({ ...base, mantra: true, role: 'P', purchases: [purchase(1,'P')], price: 1 }).error).toContain('portieri');
	});
	it('editing excludes the old charge and slot; moving charges only the destination', () => {
		const purchases = [purchase(100,'C',7)];
		expect(checkPurchase({ ...base, purchases, editing: 100 }).error).toBe('');
		expect(checkPurchase({ ...base, purchases, editing: 100, owner: 'B' })).toMatchObject({ error: '', remaining: 10, remainingAfter: 3 });
		expect(checkPurchase({ ...base, purchases, editing: 100, owner: 'B', price: 8 }).error).toContain('Massimo 7');
	});
});
