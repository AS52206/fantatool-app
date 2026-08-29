<script lang="ts">
	import { asta } from '$lib/stores/auction.svelte';

	let {
		ruolo = '',
		ruoloMantra = ''
	}: { ruolo?: string; ruoloMantra?: string } = $props();

	// In Mantra mostra il ruolo atomico (Dc;E), colorato dal ruolo classico.
	let label = $derived(asta.isMantra ? ruoloMantra || ruolo : ruolo);
</script>

<span class="tag" data-ruolo={ruolo} style="white-space:nowrap;">{label}</span>
