/* Cache locale per l'uso in assenza di rete. */
const CACHE_VERSION = 'fantatool-offline-v2';
const ROOT = new URL('./', self.registration.scope).href;

const CORE_PATHS = [
	'./', './index.html', './manifest.webmanifest', './favicon.svg', './apple-touch-icon.png',
	'./icon-192.png', './icon-512.png',
	'./data/2026-2027/classic-8.json', './data/2026-2027/classic-10.json',
	'./data/2026-2027/mantra-8.json', './data/2026-2027/mantra-10.json'
];

const CRESTS = [
	'loghi/atalanta.png', 'loghi/bologna.png', 'loghi/cagliari.png', 'loghi/como.png', 'loghi/cremonese.png',
	'loghi/fiorentina.png', 'loghi/frosinone.png', 'loghi/genoa.png', 'loghi/inter.png', 'loghi/juventus.png',
	'loghi/lazio.png', 'loghi/lecce.png', 'loghi/milan.png', 'loghi/monza.png', 'loghi/napoli.png',
	'loghi/parma.png', 'loghi/pisa.png', 'loghi/roma.png', 'loghi/sassuolo.png', 'loghi/torino.png',
	'loghi/udinese.png', 'loghi/venezia.png', 'loghi/verona.png', 'stemmi/ac-pix.png',
	'stemmi/acf-bisettricks.png', 'stemmi/atleticopippao.png', 'stemmi/barcollona.png',
	'stemmi/bojon-dc.png', 'stemmi/cacio-cavallo-ft.png', 'stemmi/cassacarragno.png',
	'stemmi/copaya.png', 'stemmi/deportivo-la-carogna.png', 'stemmi/fc-sant-ignazio.png',
	'stemmi/joga-benito.png', 'stemmi/nottingham-foreskin.png', 'stemmi/paris-saint-peterle.png',
	'stemmi/partizan-degrado.png', 'stemmi/pdor-saint-germain.png', 'stemmi/pro-tagonista.png',
	'stemmi/real-sborra.png', 'stemmi/temptation-haaland.png'
].map((path) => `./assets/${path}`);

async function precache() {
	const cache = await caches.open(CACHE_VERSION);
	const urls = [...CORE_PATHS, ...CRESTS].map((path) => new URL(path, ROOT).href);
	// Un logo non disponibile non deve impedire di usare tutta l'asta offline.
	// I quattro listoni sono parte del gruppo di URL essenziali e vengono
	// verificati nel test di rilascio.
	await Promise.all(
		urls.map(async (url) => {
			try {
				const response = await fetch(url, { cache: 'reload' });
				if (response.ok) await cache.put(url, response);
			} catch {
				/* la richiesta sarà ritentata alla prima apertura online */
			}
		})
	);
}

self.addEventListener('install', (event) => {
	event.waitUntil(precache().then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
	event.waitUntil(
		caches.keys()
			.then((keys) => Promise.all(keys.filter((key) => key !== CACHE_VERSION).map((key) => caches.delete(key))))
			.then(() => self.clients.claim())
	);
});

async function networkFirst(request, fallback) {
	try {
		const response = await fetch(request);
		if (response.ok) (await caches.open(CACHE_VERSION)).put(request, response.clone());
		return response;
	} catch {
		return (await caches.match(request)) || (fallback ? caches.match(fallback) : undefined) || Response.error();
	}
}

async function cacheFirst(request) {
	const cached = await caches.match(request);
	if (cached) return cached;
	try {
		const response = await fetch(request);
		if (response.ok) (await caches.open(CACHE_VERSION)).put(request, response.clone());
		return response;
	} catch {
		return Response.error();
	}
}

self.addEventListener('fetch', (event) => {
	const { request } = event;
	if (request.method !== 'GET' || new URL(request.url).origin !== self.location.origin) return;
	const url = new URL(request.url);
	if (request.mode === 'navigate') {
		event.respondWith(networkFirst(request, new URL('./index.html', ROOT).href));
	} else if (url.pathname.includes('/data/')) {
		// Online prende il listone più recente; offline usa l'ultima copia salvata.
		event.respondWith(networkFirst(request));
	} else {
		event.respondWith(cacheFirst(request));
	}
});
