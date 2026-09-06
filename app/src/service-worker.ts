/// <reference types="@sveltejs/kit" />
/**
 * Service worker: rende l'app installabile e utilizzabile offline.
 *
 * Strategia **network-first** (con cache di ripiego): l'app è servita in locale,
 * quindi quasi sempre la rete c'è ed è la copia più fresca — così una ricompila
 * si vede subito, senza restare bloccati su una versione vecchia in cache.
 * La cache serve solo da rete di sicurezza quando il server locale non risponde.
 */
import { build, files, version } from '$service-worker';

const CACHE = `fantatool-${version}`;
const PRECACHE = [...build, ...files];

self.addEventListener('install', (event: any) => {
	event.waitUntil(
		caches
			.open(CACHE)
			.then((c) => c.addAll(PRECACHE))
			.then(() => (self as any).skipWaiting())
	);
});

self.addEventListener('activate', (event: any) => {
	event.waitUntil(
		caches
			.keys()
			.then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
			.then(() => (self as any).clients.claim())
	);
});

self.addEventListener('fetch', (event: any) => {
	const req = event.request as Request;
	if (req.method !== 'GET') return;
	const url = new URL(req.url);
	if (url.origin !== location.origin) return;

	event.respondWith(
		(async () => {
			const cache = await caches.open(CACHE);
			try {
				const res = await fetch(req);
				// aggiorna la copia offline con l'ultima versione servita
				if (res.ok && res.type === 'basic') cache.put(req, res.clone());
				return res;
			} catch {
				const cached = await cache.match(req);
				if (cached) return cached;
				if (req.mode === 'navigate') {
					const home = await cache.match('/');
					if (home) return home;
				}
				throw new Error('offline e nessuna copia in cache');
			}
		})()
	);
});
