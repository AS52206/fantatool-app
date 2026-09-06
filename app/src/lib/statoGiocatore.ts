/**
 * Badge di stato compatti derivati dai dati Fantacrediti: infortuni/squalifiche,
 * rigoristi, ballottaggi, nuovi arrivi. Sintesi leggera per le liste.
 */
import type { FantacreditiInfo } from './domain/types';

export interface BadgeStato {
	icona: string;
	titolo: string;
	tono: 'bad' | 'warn' | 'ok' | 'info';
}

export function badgeStato(fc: FantacreditiInfo | null | undefined): BadgeStato[] {
	if (!fc) return [];
	const out: BadgeStato[] = [];
	if (fc.unavailableUntilRound > 0)
		out.push({
			icona: '🔴',
			titolo: `Non disponibile fino alla ${fc.unavailableUntilRound}ª giornata`,
			tono: 'bad'
		});
	if (fc.penaltyProbability >= 50)
		out.push({ icona: '⚽', titolo: 'Rigorista designato', tono: 'ok' });
	// "B" da Fantacrediti è spesso conservativo: lo mostriamo solo se anche la
	// titolarità attesa non è già da titolare pieno.
	const ballottaggio =
		(fc.expectedTitolarita > 0 && fc.expectedTitolarita < 50) ||
		(fc.playerStatus === 'B' && fc.expectedTitolarita < 70);
	if (ballottaggio && fc.unavailableUntilRound === 0)
		out.push({ icona: '⏱', titolo: 'In ballottaggio per una maglia', tono: 'warn' });
	if (fc.newArrival) out.push({ icona: '✨', titolo: 'Nuovo acquisto', tono: 'info' });
	return out;
}

/** Un giocatore è "affidabile" se ha titolarità attesa alta e non è fuori. */
export function affidabile(fc: FantacreditiInfo | null | undefined, soglia = 55): boolean {
	if (!fc) return false;
	return fc.unavailableUntilRound === 0 && fc.expectedTitolarita >= soglia;
}
