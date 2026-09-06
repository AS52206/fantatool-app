<script lang="ts">
	import { onMount } from 'svelte';
	import favicon from '$lib/assets/favicon.svg';
	import './app.css';
	let { children } = $props();

	// Quando entra in scena un service worker aggiornato (dopo una ricompila),
	// ricarica una volta sola per servire subito la versione fresca.
	onMount(() => {
		if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;
		navigator.serviceWorker.addEventListener('controllerchange', () => {
			try {
				if (sessionStorage.getItem('sw-reloaded')) return;
				sessionStorage.setItem('sw-reloaded', '1');
			} catch {
				/* storage non disponibile: ricarica comunque */
			}
			location.reload();
		});
	});
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
	<title>Fantatool — Asta</title>
</svelte:head>

{@render children()}
