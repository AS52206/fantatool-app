import { describe, it, expect } from 'vitest';
import ExcelJS from 'exceljs';
import { generaExcelFormattato, type AcquistoExport } from './export_xlsx';

function acq(p: Partial<AcquistoExport>): AcquistoExport {
	return {
		ordine: 1,
		assegnatoIl: '2026-08-29T10:00:00.000Z',
		nome: 'Tizio',
		club: 'Inter',
		ruolo: 'A',
		ruoloMantra: 'A;Pc',
		proprietario: 'Io',
		prezzo: 50,
		idClean: 1,
		pma: 40,
		pfc: 38,
		fase: 'Apertura',
		fonte: 'PMA',
		...p
	};
}

const INPUT = {
	astaAttiva: 'Asta CLASSIC',
	squadre: [{ name: 'Io' }, { name: 'Rivale 1' }, { name: 'Rivale 2' }, { name: 'Rivale 3' }],
	limitiRuoli: { P: 3, D: 8, C: 8, A: 6 },
	budgetIniziale: 500,
	numSquadre: 4,
	quoteRuolo: { P: 6, D: 16, C: 30, A: 48 },
	acquisti: [
		acq({ ordine: 1, nome: 'Portiere A', ruolo: 'P', proprietario: 'Io', prezzo: 20, pma: 18 }),
		acq({ ordine: 2, nome: 'Bomber', ruolo: 'A', proprietario: 'Io', prezzo: 150, pma: 120 }),
		acq({ ordine: 3, nome: 'Mezzala', ruolo: 'C', proprietario: 'Io', prezzo: 45, pma: 50 }),
		acq({ ordine: 4, nome: 'Centrale', ruolo: 'D', proprietario: 'Rivale 1', prezzo: 30, pma: 25 })
	]
};

async function apri(blob: Blob) {
	const wb = new ExcelJS.Workbook();
	await wb.xlsx.load(await blob.arrayBuffer());
	return wb;
}

describe('generaExcelFormattato', () => {
	it('produce i 3 fogli attesi', async () => {
		const wb = await apri(await generaExcelFormattato(INPUT));
		expect(wb.worksheets.map((w) => w.name)).toEqual([
			'Riepilogo_Asta CLASSIC',
			'Registro_Asta',
			'Controlli'
		]);
	});

	it('Riepilogo: titolo, giocatore con ruolo mantra, subtotale come formula SUM', async () => {
		const wb = await apri(await generaExcelFormattato(INPUT));
		const ws = wb.getWorksheet('Riepilogo_Asta CLASSIC')!;
		expect(ws.getCell('A2').value).toBe('TABELLONE UFFICIALE DRAFT - ASTA CLASSIC');
		// prima squadra "Io": blocco a colonna 1, header a riga 4, PORTIERI a riga 5, primo slot riga 6
		expect(ws.getCell('A4').value).toBe('IO');
		expect(ws.getCell('A5').value).toBe('PORTIERI');
		expect(ws.getCell('A6').value).toBe('PORTIERE A [A;Pc]');
		expect(ws.getCell('C6').value).toBe(20);
		// subtotale portieri: riga 6+3 = 9 (3 slot P), formula SUM(C6:C8)
		const sub = ws.getCell('C9').value as ExcelJS.CellFormulaValue;
		expect(sub.formula).toBe('SUM(C6:C8)');
	});

	it('Registro_Asta: header, ordinamento, delta vs PMA', async () => {
		const wb = await apri(await generaExcelFormattato(INPUT));
		const reg = wb.getWorksheet('Registro_Asta')!;
		expect(reg.getRow(1).values).toContain('Delta vs PMA');
		// tutti stesso timestamp -> ordina per nome: Bomber, Centrale, Mezzala, Portiere A
		const nomi = [2, 3, 4, 5].map((r) => reg.getCell(r, 3).value);
		expect(nomi).toEqual(['Bomber', 'Centrale', 'Mezzala', 'Portiere A']);
		// Bomber: prezzo 150, pma 120 -> delta 30, delta% 0.25
		expect(reg.getCell(2, 7).value).toBe(150);
		expect(reg.getCell(2, 11).value).toBe(30);
		expect(reg.getCell(2, 12).value).toBeCloseTo(0.25, 10);
	});

	it('Controlli: formule SUMIF / COUNTIFS / anomalia per squadra', async () => {
		const wb = await apri(await generaExcelFormattato(INPUT));
		const ctr = wb.getWorksheet('Controlli')!;
		expect(ctr.getCell('A1').value).toBe('CONTROLLO INTEGRITÀ ASTA');
		expect(ctr.getCell('B3').value).toBe(500);
		expect(ctr.getCell('A6').value).toBe('Io');
		const spesi = ctr.getCell('B6').value as ExcelJS.CellFormulaValue;
		expect(spesi.formula).toBe(
			"SUMIF('Registro_Asta'!$F$2:$F$5,A6,'Registro_Asta'!$G$2:$G$5)"
		);
		const contP = ctr.getCell('D6').value as ExcelJS.CellFormulaValue;
		expect(contP.formula).toBe(
			"COUNTIFS('Registro_Asta'!$F$2:$F$5,A6,'Registro_Asta'!$E$2:$E$5,\"P\")"
		);
		const anom = ctr.getCell('I6').value as ExcelJS.CellFormulaValue;
		expect(anom.formula).toContain('IF(AND(C6>=0,D6<=3,E6<=8,F6<=8,G6<=6)');
	});
});
