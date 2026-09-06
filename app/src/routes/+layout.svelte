<script lang="ts">
	import { onMount } from 'svelte';
	import favicon from '$lib/assets/favicon.svg';
	import './app.css';
	let { children } = $props();

	// Bonifica: versioni precedenti registravano un service worker che teneva
	// l'app in cache e impediva di vedere gli aggiornamenti. Lo disinstalliamo
	// (e svuotiamo le cache) una volta sola, poi ricarichiamo pulito.
	onMount(async () => {
		if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;
		try {
			const regs = await navigator.serviceWorker.getRegistrations();
			if (!regs.length) return;
			await Promise.all(regs.map((r) => r.unregister()));
			if (typeof caches !== 'undefined') {
				const chiavi = await caches.keys();
				await Promise.all(chiavi.map((k) => caches.delete(k)));
			}
			if (!sessionStorage.getItem('sw-pulito')) {
				sessionStorage.setItem('sw-pulito', '1');
				location.reload();
			}
		} catch {
			/* niente da fare */
		}
	});
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
	<title>Fantatool — Asta</title>
</svelte:head>

{@render children()}
