import type { Acquisto, Squadra } from '../domain/types';

/** Preserve legacy names for exports, resolve identity before every restore. */
export function identifyTeams(teams: Squadra[], purchases: Acquisto[]) {
	const names = new Set<string>();
	const ids = new Set<string>();
	const squadre = teams.map((s) => {
		const nome = s.nome.trim();
		if (!nome || names.has(nome)) throw new Error('I nomi delle squadre devono essere distinti e non vuoti.');
		names.add(nome);
		const id = s.id || crypto.randomUUID();
		if (ids.has(id)) throw new Error('Identificativo squadra duplicato.');
		ids.add(id);
		return { ...s, nome, id };
	});
	const acquisti = purchases.map((a) => {
		const team = a.proprietarioId
			? squadre.find((s) => s.id === a.proprietarioId)
			: squadre.find((s) => s.nome === a.proprietario);
		if (!team) throw new Error(`Squadra non trovata per ${a.nome}: ${a.proprietario}`);
		return { ...a, proprietarioId: team.id, proprietario: team.nome };
	});
	return { squadre, acquisti };
}
