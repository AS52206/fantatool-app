/**
 * Badge di stato compatti derivati dai dati Fantacrediti: infortuni/squalifiche,
 * rigoristi, ballottaggi, nuovi arrivi. Sintesi leggera per le liste.
 */
import type { BallottaggioInfo, FantacreditiInfo } from './domain/types';

export interface BadgeStato {
	icona: string;
	titolo: string;
	tono: 'bad' | 'warn' | 'ok' | 'info';
}

export function badgeStato(
	fc: FantacreditiInfo | null | undefined,
	ballottaggioFonte?: BallottaggioInfo | null
): BadgeStato[] {
	if (!fc && !ballottaggioFonte) return [];
	const out: BadgeStato[] = [];
	const dettaglioBallottaggio = ballottaggioFonte ?? fc?.ballottaggio;
	if (fc?.unavailableUntilRound && fc.unavailableUntilRound > 0)
		out.push({
			icona: '🔴',
			titolo: `Non disponibile fino alla ${fc.unavailableUntilRound}ª giornata`,
			tono: 'bad'
		});
	if ((fc?.penaltyProbability ?? 0) >= 50)
		out.push({ icona: '⚽', titolo: 'Rigorista designato', tono: 'ok' });
	// "B" da Fantacrediti è spesso conservativo: lo mostriamo solo se anche la
	// titolarità attesa non è già da titolare pieno.
	const ballottaggio =
		!!dettaglioBallottaggio ||
		((fc?.expectedTitolarita ?? 0) > 0 && (fc?.expectedTitolarita ?? 0) < 50) ||
		(fc?.playerStatus === 'B' && (fc?.expectedTitolarita ?? 0) < 70);
	if (ballottaggio && (fc?.unavailableUntilRound ?? 0) === 0)
		out.push({
			icona: '⏱',
			titolo: dettaglioBallottaggio
				? `Ballottaggio ${dettaglioBallottaggio.rischio.toLowerCase()}: contro ${dettaglioBallottaggio.contendente} (${Math.round(dettaglioBallottaggio.expectedTitolarita)}%). Rilevato il ${dettaglioBallottaggio.rilevatoIl.slice(0, 10)}.`
				: 'In ballottaggio per una maglia',
			tono: 'warn'
		});
	if (fc?.newArrival) out.push({ icona: '✨', titolo: 'Nuovo acquisto', tono: 'info' });
	return out;
}

/** Un giocatore è "affidabile" se ha titolarità attesa alta e non è fuori. */
export function affidabile(
	fc: FantacreditiInfo | null | undefined,
	soglia = 55,
	ballottaggioFonte?: BallottaggioInfo | null
): boolean {
	if (!fc) return (ballottaggioFonte?.expectedTitolarita ?? 0) >= soglia;
	return fc.unavailableUntilRound === 0 && fc.expectedTitolarita >= soglia;
}
