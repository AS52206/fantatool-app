/**
 * Server statico minimale per la build di produzione (app/build/).
 * Nessuna dipendenza, nessun watcher, nessun compilatore: solo file su disco.
 * È il runtime dell'asta — molto più stabile del dev server di Vite.
 *
 *   node serve.mjs [porta]
 */
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(fileURLToPath(new URL('.', import.meta.url)), 'build');
const PORT = Number(process.argv[2]) || 8770;

const MIME = {
	'.html': 'text/html; charset=utf-8',
	'.js': 'text/javascript; charset=utf-8',
	'.mjs': 'text/javascript; charset=utf-8',
	'.css': 'text/css; charset=utf-8',
	'.json': 'application/json; charset=utf-8',
	'.webmanifest': 'application/manifest+json; charset=utf-8',
	'.svg': 'image/svg+xml',
	'.png': 'image/png',
	'.jpg': 'image/jpeg',
	'.jpeg': 'image/jpeg',
	'.ico': 'image/x-icon',
	'.woff2': 'font/woff2',
	'.woff': 'font/woff',
	'.txt': 'text/plain; charset=utf-8'
};

async function leggi(percorso) {
	const info = await stat(percorso);
	if (!info.isFile()) throw new Error('non è un file');
	return readFile(percorso);
}

const server = createServer(async (req, res) => {
	try {
		const url = new URL(req.url, 'http://localhost');
		const rel = normalize(decodeURIComponent(url.pathname)).replace(/^(\.\.[/\\])+/, '');
		const indice = join(ROOT, 'index.html');
		let percorso = rel === '/' || rel === '' ? indice : join(ROOT, rel);

		let corpo;
		try {
			corpo = await leggi(percorso);
		} catch {
			// SPA fallback: qualsiasi rotta sconosciuta → index.html
			percorso = indice;
			corpo = await readFile(percorso);
		}

		const tipo = MIME[extname(percorso).toLowerCase()] ?? 'application/octet-stream';
		const immutabile = percorso.includes('_app') && percorso.includes('immutable');
		res.writeHead(200, {
			'content-type': tipo,
			'cache-control': immutabile ? 'public, max-age=31536000, immutable' : 'no-cache'
		});
		res.end(corpo);
	} catch (err) {
		res.writeHead(500, { 'content-type': 'text/plain; charset=utf-8' });
		res.end('Errore server: ' + (err?.message ?? err));
	}
});

server.listen(PORT, '127.0.0.1', () => {
	console.log(`Fantatool servito su http://localhost:${PORT}  (Ctrl+C per fermare)`);
});
