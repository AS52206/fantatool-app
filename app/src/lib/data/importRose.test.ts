import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { importaRoseDaFile } from './importRose';
import type { Giocatore } from '../domain/types';

const bundle = JSON.parse(
	readFileSync(
		fileURLToPath(new URL('../../../static/data/2026-2027/classic-8.json', import.meta.url)),
		'utf-8'
	)
) as { players: Giocatore[] };
const GIOCATORI = bundle.players;

function fakeFile(path: string, name: string): File {
	const buf = readFileSync(fileURLToPath(new URL(path, import.meta.url)));
	return new File([buf], name);
}

describe('importaRoseDaFile', () => {
	it('backup JSON dell\'app precndente → acquisti riconosciuti', async () => {
		const r = await importaRoseDaFile(
			fakeFile('./__fixtures__/asta_backup_sample.json', 'asta_backup.json'),
			GIOCATORI
		);
		expect(r.acquisti.length).toBe(40);
		expect(r.nonTrovati.length).toBe(0);
		expect(r.squadre.length).toBeGreaterThan(1);
		// somma crediti coerente
		const tot = Object.values(r.speso).reduce((s, n) => s + n, 0);
		expect(tot).toBe(r.acquisti.reduce((s, a) => s + a.prezzo, 0));
		// ogni acquisto ha un id valido del bundle
		const ids = new Set(GIOCATORI.map((g) => g.id));
		expect(r.acquisti.every((a) => ids.has(a.giocatoreId))).toBe(true);
		// niente doppioni
		expect(new Set(r.acquisti.map((a) => a.giocatoreId)).size).toBe(r.acquisti.length);
	});

	it('CSV con intestazione Squadra/Ruolo/Giocatore/Prezzo', async () => {
		const r = await importaRoseDaFile(fakeFile('./__fixtures__/rose_sample.csv', 'rose.csv'), GIOCATORI);
		expect(r.acquisti.length).toBe(15);
		expect(r.acquisti[0].proprietario).toBeTruthy();
		expect(r.acquisti[0].prezzo).toBeGreaterThan(0);
	});

	it('CSV a sezioni (nome squadra su riga singola)', async () => {
		const csv =
			'Ruolo,Giocatore,Prezzo\nParis Saint Peterle\nP,Svilar,49\nD,Dimarco,20\nCacio Cavallo FT\nA,Malen,120\n';
		const r = await importaRoseDaFile(new File([csv], 'sezioni.csv'), GIOCATORI);
		expect(r.acquisti.map((a) => a.proprietario)).toEqual([
			'Paris Saint Peterle',
			'Paris Saint Peterle',
			'Cacio Cavallo FT'
		]);
		expect(r.acquisti.find((a) => a.nome === 'Malen')?.prezzo).toBe(120);
	});

	it('XLSX "a colonne" (export lega): squadre vuote escluse', async () => {
		const r = await importaRoseDaFile(
			fakeFile('./__fixtures__/rose_colonne.xlsx', 'pdcity-rosters.xlsx'),
			GIOCATORI
		);
		// 8 squadre con rosa (4 vuote nel file: Cacio Cavallo FT, AC PIX, OLD Copaya, Team albert.94)
		expect(r.squadre.length).toBe(8);
		expect(r.squadre).not.toContain('Cacio Cavallo FT');
		expect(r.squadre).toContain('Deportivo La Carogna');
		expect(r.acquisti.length).toBeGreaterThan(150);
		// il totale speso per Deportivo dev'essere ~494 (riga "totale" del file)
		expect(r.speso['Deportivo La Carogna']).toBeGreaterThanOrEqual(480);
		expect(r.speso['Deportivo La Carogna']).toBeLessThanOrEqual(500);
		// Malen a Paris Saint Peterle per 187
		const malen = r.acquisti.find((a) => a.nome === 'Malen');
		expect(malen?.proprietario).toBe('Paris Saint Peterle');
		expect(malen?.prezzo).toBe(187);
	});

	it('rifiuta un JSON che non è una rosa', async () => {
		await expect(
			importaRoseDaFile(new File(['{"foo":1}'], 'x.json'), GIOCATORI)
		).rejects.toThrow();
	});
});
