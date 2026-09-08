/** Isolated production-browser recovery checks; SOAK_HOURS=8 enables eight REAL hours. */
import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const runtime = process.env.PLAYWRIGHT_PATH ?? '/Users/adrianoschiavon/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
const { chromium } = await import(pathToFileURL(runtime).href);
const url = process.env.TEST_URL ?? 'http://localhost:8771';
const mode = process.env.TEST_MODE === 'mantra' ? 'mantra' : 'classic';
const output = resolve(process.env.TEST_REPORT ?? 'artifacts/browser-recovery.json');
const hours = Number(process.env.SOAK_HOURS ?? 0);
assert(Number.isFinite(hours) && hours >= 0, 'SOAK_HOURS must be nonnegative');
const report = { started: new Date().toISOString(), url, requestedSoakHours: hours, mode, status: 'running', checks: [], samples: [], pageErrors: [] };
async function record(name, details = {}) {
	report.checks.push({ name, at: new Date().toISOString(), ...details });
	await save();
	console.log(JSON.stringify(report.checks.at(-1)));
}
async function save() { await mkdir(dirname(output), { recursive: true }); await writeFile(output, JSON.stringify(report, null, 2)); }
const bundleResponse = await fetch(`${url}/data/2026-2027/${mode}-8.json`);
assert(bundleResponse.ok, 'Static player bundle must be available');
const { players } = await bundleResponse.json();
const selected = ['P', 'D', 'C', 'A'].map((role) => players.find((p) => p.ruolo === role));
assert(selected.every(Boolean));
const teams = Array.from({ length: 8 }, (_, i) => ({ nome: `Test Squadra ${i + 1}`, isMia: i === 0 }));
const seedPlayers = mode === 'classic' ? selected.slice(0, 2).map((p, i) => ({ p, owner: i })) : (() => {
	const reserved = new Set(selected.slice(2).map((p) => p.id));
	const pool = players.filter((p) => !reserved.has(p.id));
	const mine = Object.entries({ P: 3, D: 8, C: 7, A: 7 }).flatMap(([role, count]) => pool.filter((p) => p.ruolo === role).slice(0, count));
	assert.equal(mine.length, 25);
	const used = new Set(mine.map((p) => p.id));
	const rivals = pool.filter((p) => !used.has(p.id)).slice(0, 140);
	assert.equal(rivals.length, 140);
	return [...mine.map((p) => ({ p, owner: 0 })), ...rivals.map((p, i) => ({ p, owner: 1 + i % 7 }))];
})();
const initialCount = seedPlayers.length;
report.workload = { teams: 8, initialPurchases: initialCount, ownPurchases: seedPlayers.filter((x) => x.owner === 0).length, repeatedAction: 'search, assign one free player, undo; external backup on each mutation' };
const snapshot = {
	config: { budgetMax: 500, limiti: mode === 'classic' ? { P: 3, D: 8, C: 8, A: 6, TOT: 25 } : { P: 3, D: 11, C: 8, A: 8, TOT: 30 }, squadre: teams, stagione: '2026-2027', modalita: mode, partecipanti: 8, moduliTarget: ['3-4-1-2'] },
	acquisti: seedPlayers.map(({ p, owner }, i) => ({ giocatoreId: p.id, nome: p.nome, nomePuro: p.nome, ruolo: p.ruolo, squadraSerieA: p.squadra, prezzo: i === 0 ? 10 : 2, proprietario: teams[owner].nome, ordine: i + 1, timestamp: Date.now() + i })),
	avviata: true
};
const key = `fantatool.asta.${mode}.v1`;
const browser = await chromium.launch({ headless: process.env.HEADED !== '1', executablePath: process.env.CHROME_PATH ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' });
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, acceptDownloads: true,
	storageState: { cookies: [], origins: [{ origin: new URL(url).origin, localStorage: [{ name: 'fantatool.asta.v1', value: JSON.stringify(snapshot) }] }] }
});
context.on('page', (page) => {
	page.on('pageerror', (error) => report.pageErrors.push(error.message));
	page.on('dialog', (dialog) => dialog.accept());
});
await context.addInitScript(() => {
	window.__backupWrites = [];
	window.__backupActive = 0;
	window.__backupMaxActive = 0;
	window.showSaveFilePicker = async () => ({ createWritable: async () => {
		window.__backupActive++;
		window.__backupMaxActive = Math.max(window.__backupMaxActive, window.__backupActive);
		let text;
		return { write: async (value) => { text = value; await new Promise((r) => setTimeout(r, 15)); },
			close: async () => { window.__backupWrites.push(text); window.__backupActive--; },
			abort: async () => { window.__backupActive--; } };
	} });
});
let page;
const state = (p = page) => p.evaluate((k) => JSON.parse(localStorage.getItem(k)), key);
async function ready(p) { await p.getByPlaceholder('Cerca giocatore o squadra…  ( / )').waitFor(); }
async function purchase(p, player, price = 7) {
	await p.getByPlaceholder('Cerca giocatore o squadra…  ( / )').fill(player.nome);
	await p.locator('.row-player').filter({ has: p.locator('strong', { hasText: player.nome }) }).first().click();
	await p.getByLabel('Prezzo pagato / offerta').fill(String(price));
	await p.getByLabel('Assegna a').selectOption({ label: 'Test Rinominata' });
	await p.getByRole('button', { name: 'Assegna →', exact: true }).click();
}
async function waitCount(count) { await page.waitForFunction(({ key, count }) => JSON.parse(localStorage.getItem(key))?.acquisti.length === count, { key, count }); }
async function waitBackup(count) { await page.waitForFunction(({count, mode}) => { const text = window.__backupWrites.at(-1); return text && JSON.parse(text)[mode].acquisti.length === count; }, {count, mode}); }
try {
	page = await context.newPage();
	await page.goto(url);
	await ready(page);
	await waitCount(initialCount);
	const migrated = await state();
	assert(migrated.config.squadre.every((t) => t.id));
	assert.equal(migrated.acquisti[0].proprietarioId, migrated.config.squadre[0].id);
	await page.reload(); await ready(page); await waitCount(initialCount);
	assert.deepEqual((await state()).acquisti, migrated.acquisti);
	await record('legacy migration and reload preserve purchases and IDs');
	const second = await context.newPage(); await second.goto(url);
	await second.getByText('Sola lettura — un’altra scheda può essere attiva.', { exact: true }).waitFor();
	assert(await second.locator('div[inert]').count() > 0);
	const before = await state();
	await assert.rejects(second.getByRole('button', { name: '⚙️ Setup', exact: true }).click({ timeout: 500 }));
	assert.deepEqual(await state(second), before);
	await page.close(); page = second;
	await page.getByRole('button', { name: 'Attiva asta qui', exact: true }).click();
	await page.waitForFunction(() => !document.querySelector('div[inert]'));
	await ready(page); await waitCount(initialCount);
	assert.deepEqual((await state()).acquisti, migrated.acquisti);
	await record('second tab is inert; ownership and saved state recover after first closes');
	await page.getByRole('button', { name: '⚙️ Setup', exact: true }).click();
	assert(await page.getByLabel('Budget per squadra').isDisabled());
	await page.getByRole('button', { name: 'Sblocca impostazioni', exact: true }).click();
	const teamInput = page.locator('fieldset input:not([type])').first();
	await teamInput.fill('Test Rinominata'); await teamInput.press('Tab');
	await page.waitForFunction((key) => JSON.parse(localStorage.getItem(key)).config.squadre[0].nome === 'Test Rinominata', key);
	const renamed = await state();
	assert.equal(renamed.acquisti[0].proprietario, 'Test Rinominata');
	assert.equal(renamed.acquisti[0].proprietarioId, migrated.acquisti[0].proprietarioId);
	assert.equal(renamed.config.budgetMax, 500);
	assert.equal(renamed.acquisti[0].prezzo, 10);
	await page.getByRole('button', { name: 'Chiudi impostazioni', exact: true }).click();
	await record('setup protection and rename retain owner identity and budget');
	await page.getByRole('button', { name: '○ Backup file', exact: true }).click();
	await waitBackup(initialCount);
	await purchase(page, selected[2]); await waitCount(initialCount + 1); await waitBackup(initialCount + 1);
	await page.getByRole('button', { name: '↩︎ Annulla', exact: true }).click();
	await waitCount(initialCount); await waitBackup(initialCount);
	assert.equal(await page.evaluate(() => window.__backupMaxActive), 1);
	assert.equal((await state()).acquisti[0].proprietario, 'Test Rinominata');
	await record('file backup captures purchase and undo with no overlapping writes');
	if (hours > 0) {
		const started = Date.now();
		const deadline = started + hours * 3_600_000;
		let cycle = 0;
		const cdp = await context.newCDPSession(page);
		await cdp.send('Performance.enable');
		while (Date.now() < deadline) {
			const t = Date.now();
			await purchase(page, selected[2]); await waitCount(initialCount + 1); await waitBackup(initialCount + 1);
			await page.getByRole('button', { name: '↩︎ Annulla', exact: true }).click();
			await waitCount(initialCount); await waitBackup(initialCount);
			const metrics = Object.fromEntries((await cdp.send('Performance.getMetrics')).metrics.map(({ name, value }) => [name, value]));
			report.samples.push({ cycle: ++cycle, elapsedMs: Date.now() - started, actionMs: Date.now() - t, heapUsed: metrics.JSHeapUsedSize, nodes: metrics.Nodes });
			assert.equal(report.pageErrors.length, 0, 'Unexpected browser error during soak');
			await save();
			console.log(JSON.stringify({ soak: report.samples.at(-1) }));
			await new Promise((r) => setTimeout(r, Math.min(30_000, Math.max(0, deadline - Date.now()))));
		}
		await record('real-time browser soak completed', { elapsedMs: Date.now() - started, cycles: cycle });
	}
	await page.evaluate(() => { Storage.prototype.setItem = function () { throw new DOMException('Test quota exceeded', 'QuotaExceededError'); }; });
	await purchase(page, selected[3], 9);
	await page.getByRole('alert').waitFor();
	const downloading = page.waitForEvent('download');
	await page.getByRole('button', { name: '⬇︎ Scarica backup ora', exact: true }).click();
	const download = await downloading;
	const exported = JSON.parse(await readFile(await download.path(), 'utf8'));
	assert.equal(exported[mode].acquisti.length, initialCount + 1);
	assert(exported[mode].acquisti.some((p) => p.giocatoreId === selected[3].id && p.prezzo === 9));
	assert.equal((await state()).acquisti.length, initialCount);
	await record('storage failure visible; emergency download preserves current unsaved purchase');
	assert.deepEqual(report.pageErrors, []);
	report.status = 'passed';
} catch (error) {
	report.status = 'failed'; report.error = error.stack ?? String(error);
	if (page) await page.screenshot({ path: output.replace(/\.json$/, '') + '.png', fullPage: true }).catch(() => {});
	process.exitCode = 1;
} finally {
	report.finished = new Date().toISOString(); await save();
	await context.close(); await browser.close();
	console.log(JSON.stringify({ status: report.status, report: output, error: report.error }));
}
