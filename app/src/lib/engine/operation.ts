import type { Acquisto, LimitiRuoli, Ruolo, Squadra } from '../domain/types';

/** Hard constraints only; a strategic recommendation must never prevent a legal purchase. */
export function checkPurchase(input: {
	teams: Squadra[]; purchases: Acquisto[]; budget: number; limits: LimitiRuoli;
	mantra: boolean; playerId: number; role: Ruolo | ''; owner: string; price: number; editing?: number;
}) {
	const { teams, budget, limits, mantra, playerId, role, owner, price, editing } = input;
	const team = teams.find((s) => s.nome === owner);
	const purchases = input.purchases.filter((a) => a.giocatoreId !== editing);
	const own = purchases.filter((a) => team?.id ? a.proprietarioId === team.id : a.proprietario === owner);
	const remaining = budget - own.reduce((sum, a) => sum + a.prezzo, 0);
	const slots = Math.max(0, limits.TOT - own.length);
	const maximum = slots ? Math.max(0, Math.floor(remaining - (slots - 1))) : 0;
	let error = '';
	if (!team) error = 'Scegli una squadra valida.';
	else if (purchases.some((a) => a.giocatoreId === playerId)) error = 'Giocatore già assegnato.';
	else if (!Number.isInteger(price) || price < 1) error = 'Il prezzo deve essere un numero intero di almeno 1 credito.';
	else if (!slots) error = 'Rosa completa: nessun posto disponibile.';
	else if (!role) error = 'Ruolo del giocatore non disponibile: verifica il listone.';
	else if (mantra && role === 'P' && own.filter((a) => a.ruolo === 'P').length >= limits.P) error = 'Tutti i posti per portieri sono occupati.';
	else if (mantra && role !== 'P' && own.filter((a) => a.ruolo !== 'P').length >= limits.TOT - limits.P) error = 'Tutti i posti di movimento sono occupati.';
	else if (!mantra && own.filter((a) => a.ruolo === role).length >= limits[role]) error = `Tutti i posti del reparto ${role} sono occupati.`;
	else if (price > maximum) error = `Massimo ${maximum} crediti: devi conservare almeno 1 credito per ciascun posto restante.`;
	return { error, maximum, remaining, slots, remainingAfter: remaining - price };
}
