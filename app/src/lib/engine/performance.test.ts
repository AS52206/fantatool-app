/** Opt-in: FANTATOOL_BENCHMARK=1 npx vitest run src/lib/engine/performance.test.ts --disableConsoleIntercept
 * Real 8-manager bundle and deterministic simulated purchases. These are engine
 * diagnostics, not browser latency guarantees or an eight-hour soak test.
 */
import { describe, expect, it } from 'vitest';
import bundle from '../../../static/data/2026-2027/mantra-8.json';
import { ottimizzaFinaleAsta } from './endgame';
import { analizzaRosaMantra, analizzaFragilitaModulo, calcolaCateneSostituzioneMantra } from './mantra';

describe.skipIf(process.env.FANTATOOL_BENCHMARK !== '1')('real-bundle Mantra performance diagnostics', () => {
	for (const slots of [10, 5]) {
		it(`8 managers, ${30 - slots} owned players, ${slots} remaining slots`, () => {
			// Eight managers buy round-robin in descending FVM order within each family.
			const quotas = slots === 10 ? { P: 3, D: 7, C: 7, A: 3 } : { P: 3, D: 9, C: 9, A: 4 };
			const purchased = new Set<number>();
			const own: typeof bundle.players = [];
			for (const [role, quota] of Object.entries(quotas)) {
				bundle.players.filter((p) => p.ruolo === role).sort((a, b) => b.fvm - a.fvm || a.id - b.id)
					.slice(0, quota * 8).forEach((p, i) => {
						purchased.add(p.id);
						if (i % 8 === 0) own.push(p);
					});
			}
			const rosa = own.map((p) => ({ chiave: String(p.id), nome: p.nome, ruoli: p.ruoloMantra, punteggio: p.fvm }));
			const candidates = bundle.players.filter((p) => !purchased.has(p.id)).map((p) => ({
				chiave: String(p.id), nome: p.nome, ruoli_mantra: p.ruoloMantra,
				prezzo: p.fc?.pma || p.fc?.pfc || p.quotazione || 1,
				punteggio: p.fvm || (p.fc?.expectedFantamedia ?? 0) * 10 || p.quotazione || 0
			}));
			expect(own).toHaveLength(30 - slots);
			expect(purchased.size).toBe((30 - slots) * 8);
			expect(candidates.length).toBeGreaterThan(300);
			const times: Record<string, number[]> = { endgame: [], analysis: [], fragility: [], chains: [] };
			for (let repetition = 0; repetition < 2; repetition++) {
				let start = performance.now();
				const result = ottimizzaFinaleAsta({ candidati: candidates, budgetResiduo: slots * 8,
					slotVuoti: slots, modalita: 'MANTRA', rosaMantra: rosa,
					moduliTarget: ['3-4-1-2', '4-3-3'], minPortieriMantra: 3 });
				times.endgame.push(performance.now() - start);
				expect(result.stato).toBe('OK');
				for (const path of result.percorsi) {
					expect(path.giocatori).toHaveLength(slots);
					expect(path.costo).toBeLessThanOrEqual(slots * 8);
					expect(new Set(path.giocatori.map((p) => p.chiave)).size).toBe(slots);
				}
				start = performance.now();
				analizzaRosaMantra(rosa);
				times.analysis.push(performance.now() - start);
				start = performance.now();
				analizzaFragilitaModulo(rosa, '3-4-1-2');
				times.fragility.push(performance.now() - start);
				start = performance.now();
				calcolaCateneSostituzioneMantra(rosa, '3-4-1-2');
				times.chains.push(performance.now() - start);
			}
			console.info(JSON.stringify({ workload: `mantra-8-${slots}-slots`, roster: own.length,
				candidates: candidates.length, repetitions: 2, milliseconds: times }));
		}, 120_000);
	}
});
