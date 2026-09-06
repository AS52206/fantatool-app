/// <reference types="@sveltejs/kit" />
/**
 * Service worker: rende l'app installabile e completamente offline.
 * Strategia: precache di tutto il build + asset statici all'installazione,
 * poi cache-first per le richieste GET locali (nessuna rete a runtime).
 */
import { build, files, version } from '$service-worker';

const CACHE = `fantatool-${version}`;
const PRECACHE = [...build, ...files];

self.addEventListener('install', (event: any) => {
	event.waitUntil(
		caches.open(CACHE).then((c) => c.addAll(PRECACHE)).then(() => (self as any).skipWaiting())
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
		caches.open(CACHE).then(async (cache) => {
			const cached = await cache.match(req);
			if (cached) return cached;
			try {
				const res = await fetch(req);
				if (res.ok && res.type === 'basic') cache.put(req, res.clone());
				return res;
			} catch (err) {
				// offline e non in cache: per una navigazione, ripiega sulla home.
				if (req.mode === 'navigate') {
					const fallback = await cache.match('/');
					if (fallback) return fallback;
				}
				throw err;
			}
		})
	);
});
