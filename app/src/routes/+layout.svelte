<script lang="ts">
	import { onMount } from 'svelte';
	import { base } from '$app/paths';
	import favicon from '$lib/assets/favicon.svg';
	import './app.css';
	let { children } = $props();

	// L'app e i listoni vengono salvati sul dispositivo: dopo la prima apertura
	// online, la PWA resta utilizzabile anche senza rete.
	onMount(async () => {
		if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;
		try {
			await navigator.serviceWorker.register(`${base}/service-worker.js`, { scope: `${base}/` });
			await navigator.serviceWorker.ready;
			if (!navigator.serviceWorker.controller && !sessionStorage.getItem('pwa-cache-pronta')) {
				sessionStorage.setItem('pwa-cache-pronta', '1');
				location.reload();
			}
		} catch {
			/* L'app continua a funzionare online se il browser non supporta le PWA. */
		}
	});
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
	<title>Fantatool — Asta</title>
</svelte:head>

{@render children()}
