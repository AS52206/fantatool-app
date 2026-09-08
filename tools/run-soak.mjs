/** Eight-hour browser test on a frozen build, isolated from the real auction. */
import { spawn } from 'node:child_process';
import { cp, mkdir, mkdtemp, open, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const self = fileURLToPath(import.meta.url);
const root = dirname(dirname(self));
const artifacts = join(root, 'artifacts');
const report = join(artifacts, 'soak-mantra-8h.json');
await mkdir(artifacts, { recursive: true });

if (!process.argv.includes('--worker')) {
	const log = await open(join(artifacts, 'soak-mantra-8h.log'), 'w');
	const worker = spawn(process.execPath, [self, '--worker'], {
		cwd: root, detached: true, stdio: ['ignore', log.fd, log.fd]
	});
	await writeFile(join(artifacts, 'soak-process.json'), JSON.stringify({ pid: worker.pid, report, launched: new Date().toISOString() }, null, 2));
	worker.unref();
	await log.close();
	console.log(JSON.stringify({ pid: worker.pid, report }));
} else {
	let server, test, awake;
	try {
		const snapshot = await mkdtemp(join(tmpdir(), 'fantatool-soak-'));
		await cp(join(root, 'app/build'), join(snapshot, 'build'), { recursive: true });
		await cp(join(root, 'app/serve.mjs'), join(snapshot, 'serve.mjs'));
		server = spawn(process.execPath, [join(snapshot, 'serve.mjs'), '8791'], { stdio: ['ignore', 'pipe', 'inherit'] });
		await new Promise((resolve, reject) => {
			const timeout = setTimeout(() => reject(new Error('Test server did not start')), 10_000);
			server.once('error', (error) => { clearTimeout(timeout); reject(error); });
			server.once('exit', (code) => { clearTimeout(timeout); reject(new Error(`Test server exited: ${code}`)); });
			server.stdout.on('data', (data) => {
				process.stdout.write(data);
				if (String(data).includes('Fantatool servito')) { clearTimeout(timeout); resolve(); }
			});
		});
		// Prevent idle sleep only for the duration of this test. Closing the lid may still suspend it.
		if (process.platform === 'darwin') {
			awake = spawn('/usr/bin/caffeinate', ['-i', '-w', String(process.pid)], { stdio: 'ignore' });
			awake.on('error', (error) => console.error(error.message));
		}
		test = spawn(process.execPath, [join(root, 'tools/browser-recovery.mjs'), '--mantra', '--soak-hours=8', '--url=http://localhost:8791', `--report=${report}`], { cwd: root, stdio: 'inherit' });
		process.on('SIGTERM', () => { test?.kill(); server?.kill(); awake?.kill(); process.exitCode = 1; });
		process.exitCode = await new Promise((resolve, reject) => { test.once('error', reject); test.once('exit', (code) => resolve(code ?? 1)); });
	} catch (error) {
		await writeFile(report, JSON.stringify({ status: 'failed', error: String(error), finished: new Date().toISOString() }, null, 2));
		process.exitCode = 1;
	} finally {
		test?.kill(); server?.kill(); awake?.kill();
	}
}
