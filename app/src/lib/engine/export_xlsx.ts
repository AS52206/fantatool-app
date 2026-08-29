/**
 * Porting di fantatool/export_excel.py — "Tabellone ufficiale draft".
 * Genera un workbook a 3 fogli (Riepilogo grafico, Registro_Asta, Controlli)
 * con exceljs, lato browser. I loghi squadra non sono ancora inclusi.
 *
 * openpyxl usa colori RGB "RRGGBB"; exceljs vuole ARGB "FFRRGGBB".
 */
import ExcelJS from 'exceljs';

const A = (rgb: string) => `FF${rgb}`;
function solid(rgb: string): ExcelJS.Fill {
	return { type: 'pattern', pattern: 'solid', fgColor: { argb: A(rgb) } };
}

const FILL_HEADER = solid('0A1B3A');
const FILL_P = solid('D29E1E');
const FILL_D = solid('3B8E53');
const FILL_C = solid('2B73B3');
const FILL_A = solid('C5433A');
const FILL_SUB = solid('F2F4F8');

const B_LIGHT: Partial<ExcelJS.Border> = { style: 'thin', color: { argb: A('D3D3D3') } };
const B_DOUBLE: Partial<ExcelJS.Border> = { style: 'double', color: { argb: A('A0A0A0') } };
const CELL_BORDER: Partial<ExcelJS.Borders> = {
	top: B_LIGHT, bottom: B_LIGHT, left: B_LIGHT, right: B_LIGHT
};
const TOTAL_BORDER: Partial<ExcelJS.Borders> = { top: B_LIGHT, bottom: B_DOUBLE };

export interface AcquistoExport {
	ordine: number;
	assegnatoIl: string;
	nome: string;
	club: string;
	ruolo: string;
	ruoloMantra: string;
	proprietario: string;
	prezzo: number;
	idClean: number;
	pma: number | null;
	pfc: number | null;
	fase: string;
	fonte: string;
}

export interface SquadraExport {
	name: string;
	color?: string;
	text?: string;
	/** data-URL PNG dello stemma (opzionale). */
	crest?: string | null;
}

export interface ExportXlsxInput {
	astaAttiva: string;
	squadre: SquadraExport[];
	limitiRuoli: { P: number; D: number; C: number; A: number };
	acquisti: AcquistoExport[];
	budgetIniziale: number;
	numSquadre?: number;
	quoteRuolo?: Record<string, number>;
	sourceMetadata?: Record<string, string>;
}

function colLetter(n: number): string {
	let s = '';
	while (n > 0) {
		const m = (n - 1) % 26;
		s = String.fromCharCode(65 + m) + s;
		n = Math.floor((n - 1) / 26);
	}
	return s;
}

export async function generaExcelFormattato(inp: ExportXlsxInput): Promise<Blob> {
	const {
		astaAttiva, squadre, limitiRuoli, acquisti, budgetIniziale,
		numSquadre, quoteRuolo, sourceMetadata
	} = inp;
	const wb = new ExcelJS.Workbook();

	// ------------------------------------------------------------- Riepilogo
	const titolo = String(astaAttiva).replace(/[:\\/?*[\]]/g, '-').trim();
	const ws = wb.addWorksheet(`Riepilogo_${titolo}`.slice(0, 31), {
		pageSetup: { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 1, horizontalCentered: true }
	});

	ws.mergeCells('A2:T2');
	const t = ws.getCell('A2');
	t.value = `TABELLONE UFFICIALE DRAFT - ${astaAttiva.toUpperCase().replace(/_/g, ' ')}`;
	t.font = { name: 'Segoe UI', size: 16, bold: true, color: { argb: A('FFFFFF') } };
	t.fill = FILL_HEADER;
	t.alignment = { horizontal: 'center', vertical: 'middle' };
	ws.getRow(2).height = 40;

	const metaSquadre = Math.floor(squadre.length / 2);
	const blocchi = [squadre.slice(0, metaSquadre), squadre.slice(metaSquadre)];
	blocchi.forEach((blocco, bIdx) => {
		const rStart = [4, 44][bIdx];
		ws.getRow(rStart).height = 38;

		blocco.forEach((sq, sIdx) => {
			const cStart = sIdx * 4 + 1;
			ws.mergeCells(rStart, cStart, rStart, cStart + 2);
			const cName = ws.getCell(rStart, cStart);
			cName.value = sq.name.toUpperCase();
			const cColor = sq.color || '104bb3';
			const cText = sq.text || 'FFFFFF';
			cName.font = { name: 'Segoe UI', size: 11, bold: true, color: { argb: A(cText) } };
			cName.fill = solid(cColor);
			cName.alignment = { horizontal: sq.crest ? 'right' : 'center', vertical: 'middle' };
			if (sq.crest) {
				const m = /^data:image\/(png|jpeg);base64,(.+)$/.exec(sq.crest);
				if (m) {
					const imgId = wb.addImage({ base64: m[2], extension: m[1] === 'jpeg' ? 'jpeg' : 'png' });
					ws.addImage(imgId, {
						tl: { col: cStart - 1 + 0.1, row: rStart - 1 + 0.1 },
						ext: { width: 34, height: 34 }
					});
				}
			}

			const presi: Record<string, [string, number, string, string][]> = { P: [], D: [], C: [], A: [] };
			for (const g of acquisti)
				if (g.proprietario === sq.name && presi[g.ruolo])
					presi[g.ruolo].push([g.nome, g.prezzo, g.club, g.ruoloMantra]);

			let curr = rStart + 1;
			let spesaTot = 0;
			for (const [code, label, fill] of [
				['P', 'PORTIERI', FILL_P],
				['D', 'DIFENSORI', FILL_D],
				['C', 'CENTROCAMPISTI', FILL_C],
				['A', 'ATTACCANTI', FILL_A]
			] as const) {
				const slotMax = limitiRuoli[code];
				ws.mergeCells(curr, cStart, curr, cStart + 2);
				const rh = ws.getCell(curr, cStart);
				rh.value = label;
				rh.font = { name: 'Segoe UI', size: 9, bold: true, color: { argb: A('FFFFFF') } };
				rh.fill = fill;
				rh.alignment = { horizontal: 'center', vertical: 'middle' };
				curr += 1;

				const startSlotRow = curr;
				for (let slotIdx = 0; slotIdx < slotMax; slotIdx++) {
					ws.getRow(curr).height = 22;
					const cg = ws.getCell(curr, cStart);
					const ct = ws.getCell(curr, cStart + 1);
					const cp = ws.getCell(curr, cStart + 2);
					if (slotIdx < presi[code].length) {
						const [nome, prezzo, club, rm] = presi[code][slotIdx];
						cg.value = rm ? `${nome.toUpperCase()} [${rm}]` : nome.toUpperCase();
						const pct = (100 * prezzo) / Math.max(1, budgetIniziale);
						ct.value = `${club ? club.toUpperCase() : '-'} · ${pct.toFixed(1)}%`;
						cp.value = Math.trunc(prezzo);
						spesaTot += Math.trunc(prezzo);
					} else {
						cg.value = '';
						ct.value = '';
						cp.value = 0;
					}
					cg.font = { name: 'Segoe UI', size: 10, color: { argb: A('333333') } };
					ct.font = { name: 'Segoe UI', size: 9, color: { argb: A('777777') } };
					cp.font = { name: 'Segoe UI', size: 10, bold: true, color: { argb: A('111111') } };
					cg.alignment = { horizontal: 'left', vertical: 'middle' };
					ct.alignment = { horizontal: 'center', vertical: 'middle' };
					cp.alignment = { horizontal: 'right', vertical: 'middle' };
					cp.numFmt = '#,##0';
					cg.border = CELL_BORDER;
					ct.border = CELL_BORDER;
					cp.border = CELL_BORDER;
					curr += 1;
				}

				ws.mergeCells(curr, cStart, curr, cStart + 1);
				const totRuolo = presi[code].reduce((s, g) => s + Math.trunc(g[1]), 0);
				const pctRuolo = (100 * totRuolo) / Math.max(1, budgetIniziale);
				ws.getCell(curr, cStart).value = `Totale ${label[0]}${label.slice(1).toLowerCase()} · ${pctRuolo.toFixed(1)}%`;
				const colP = colLetter(cStart + 2);
				ws.getCell(curr, cStart + 2).value = {
					formula: `SUM(${colP}${startSlotRow}:${colP}${curr - 1})`,
					date1904: false
				};
				for (let o = 0; o < 3; o++) {
					const c = ws.getCell(curr, cStart + o);
					c.fill = FILL_SUB;
					c.border = TOTAL_BORDER;
				}
				curr += 1;
			}

			ws.mergeCells(curr, cStart, curr, cStart + 1);
			ws.getCell(curr, cStart).value = `TOTALE ROSA · ${spesaTot} cr · ${((100 * spesaTot) / Math.max(1, budgetIniziale)).toFixed(1)}%`;
			const cRes = ws.getCell(curr, cStart + 2);
			cRes.value = budgetIniziale - spesaTot;
			cRes.numFmt = '#,##0';
			for (let o = 0; o < 3; o++) {
				const c = ws.getCell(curr, cStart + o);
				c.fill = FILL_HEADER;
				c.font = { name: 'Segoe UI', size: 9, bold: true, color: { argb: A('FFFFFF') } };
				c.border = TOTAL_BORDER;
			}
		});
	});

	for (let col = 1; col <= squadre.length * 2 + 2; col++) {
		const m = col % 4;
		ws.getColumn(col).width = m === 3 ? 9 : m === 2 ? 18 : m === 0 ? 11 : 21;
	}

	// --------------------------------------------------------- Registro_Asta
	const reg = wb.addWorksheet('Registro_Asta', {
		views: [{ state: 'frozen', ySplit: 1, showGridLines: false }],
		pageSetup: { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0 }
	});
	const headers = [
		'Ordine', 'Data/Ora', 'Giocatore', 'Club', 'Ruolo', 'Proprietario', 'Prezzo',
		'% Budget', 'PMA', 'PFC', 'Delta vs PMA', 'Delta % vs PMA', 'Fase', 'Fonte',
		'Partecipanti', 'Ruolo Mantra'
	];
	reg.addRow(headers);
	reg.getRow(1).eachCell((cell) => {
		cell.fill = FILL_HEADER;
		cell.font = { name: 'Segoe UI', size: 10, bold: true, color: { argb: A('FFFFFF') } };
		cell.alignment = { horizontal: 'center', vertical: 'middle' };
	});

	const righe = [...acquisti].sort((a, b) =>
		a.assegnatoIl !== b.assegnatoIl
			? a.assegnatoIl < b.assegnatoIl ? -1 : 1
			: a.nome < b.nome ? -1 : a.nome > b.nome ? 1 : 0
	);
	righe.forEach((a, i) => {
		const prezzo = Math.trunc(a.prezzo || 0);
		const pma = a.pma && a.pma > 0 ? a.pma : null;
		const pfc = a.pfc && a.pfc > 0 ? a.pfc : null;
		const delta = pma ? prezzo - pma : null;
		const deltaPct = pma ? (prezzo - pma) / pma : null;
		reg.addRow([
			i + 1, a.assegnatoIl, a.nome, a.club, a.ruolo, a.proprietario, prezzo,
			prezzo / Math.max(1, budgetIniziale), pma, pfc, delta, deltaPct,
			a.fase, a.fonte, Math.trunc(numSquadre || 0), a.ruoloMantra
		]);
	});
	reg.autoFilter = `A1:P${Math.max(1, reg.rowCount)}`;
	for (let r = 2; r <= reg.rowCount; r++) {
		const row = reg.getRow(r);
		row.getCell(7).numFmt = '#,##0';
		row.getCell(8).numFmt = '0.0%';
		row.getCell(9).numFmt = '0.0';
		row.getCell(10).numFmt = '0.0';
		row.getCell(11).numFmt = '0.0';
		row.getCell(12).numFmt = '0.0%';
	}
	[8, 21, 24, 16, 8, 22, 10, 11, 10, 10, 14, 16, 18, 14, 13, 18].forEach((w, i) => {
		reg.getColumn(i + 1).width = w;
	});

	// -------------------------------------------------------------- Controlli
	const ctr = wb.addWorksheet('Controlli', {
		views: [{ showGridLines: false }],
		pageSetup: { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 1 }
	});
	ctr.mergeCells('A1:J1');
	ctr.getCell('A1').value = 'CONTROLLO INTEGRITÀ ASTA';
	ctr.getCell('A1').font = { name: 'Segoe UI', size: 15, bold: true, color: { argb: A('FFFFFF') } };
	ctr.getCell('A1').fill = FILL_HEADER;
	ctr.getCell('A3').value = 'Budget iniziale';
	ctr.getCell('B3').value = Math.trunc(budgetIniziale);
	ctr.getCell('D3').value = 'Partecipanti';
	ctr.getCell('E3').value = Math.trunc(numSquadre || squadre.length);
	ctr.getCell('G3').value = 'Quote ruolo';
	ctr.getCell('H3').value = ['P', 'D', 'C', 'A']
		.map((r) => `${r} ${Math.round((quoteRuolo || {})[r] || 0)}%`)
		.join(' · ');
	['Squadra', 'Spesi', 'Residui', 'P', 'D', 'C', 'A', 'Slot', 'Anomalia'].forEach((h, i) => {
		const cell = ctr.getCell(5, i + 1);
		cell.value = h;
		cell.fill = FILL_HEADER;
		cell.font = { name: 'Segoe UI', size: 9, bold: true, color: { argb: A('FFFFFF') } };
	});

	const last = Math.max(2, reg.rowCount);
	squadre.forEach((sq, i) => {
		const r = 6 + i;
		ctr.getCell(r, 1).value = sq.name;
		ctr.getCell(r, 2).value = {
			formula: `SUMIF('Registro_Asta'!$F$2:$F$${last},A${r},'Registro_Asta'!$G$2:$G$${last})`,
			date1904: false
		};
		ctr.getCell(r, 3).value = { formula: `$B$3-B${r}`, date1904: false };
		['P', 'D', 'C', 'A'].forEach((ruolo, ci) => {
			ctr.getCell(r, 4 + ci).value = {
				formula: `COUNTIFS('Registro_Asta'!$F$2:$F$${last},A${r},'Registro_Asta'!$E$2:$E$${last},"${ruolo}")`,
				date1904: false
			};
		});
		ctr.getCell(r, 8).value = { formula: `SUM(D${r}:G${r})`, date1904: false };
		ctr.getCell(r, 9).value = {
			formula: `IF(AND(C${r}>=0,D${r}<=${limitiRuoli.P},E${r}<=${limitiRuoli.D},F${r}<=${limitiRuoli.C},G${r}<=${limitiRuoli.A}),"OK","VERIFICA")`,
			date1904: false
		};
	});
	ctr.views = [{ state: 'frozen', ySplit: 5, showGridLines: false }];
	ctr.autoFilter = `A5:I${5 + squadre.length}`;
	[24, 11, 11, 13, 7, 7, 13, 32, 14].forEach((w, i) => {
		ctr.getColumn(i + 1).width = w;
	});

	const metaRow = 8 + squadre.length;
	ctr.getCell(metaRow, 1).value = 'SORGENTI DATI';
	ctr.getCell(metaRow, 1).font = { name: 'Segoe UI', bold: true };
	Object.entries(sourceMetadata || {}).forEach(([label, value], o) => {
		ctr.getCell(metaRow + o + 1, 1).value = String(label);
		ctr.getCell(metaRow + o + 1, 2).value = String(value);
	});

	const buf = await wb.xlsx.writeBuffer();
	return new Blob([buf], {
		type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
	});
}
