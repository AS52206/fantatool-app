/**
 * Nessun service worker attivo in questa app.
 * Questo file esiste solo per DISINSTALLARE le versioni precedenti che avevano
 * registrato un SW con cache aggressiva: i browser che ancora lo richiedono
 * ricevono questo, che si auto-rimuove, svuota le cache e ricarica la pagina.
 */
self.addEventListener('install', () => self.skipWaiting());

self.addEventListener('activate', (event) => {
	event.waitUntil(
		(async () => {
			try {
				const keys = await caches.keys();
				await Promise.all(keys.map((k) => caches.delete(k)));
			} catch {
				/* ignora */
			}
			await self.registration.unregister();
			const clients = await self.clients.matchAll({ type: 'window' });
			for (const c of clients) c.navigate(c.url);
		})()
	);
});
