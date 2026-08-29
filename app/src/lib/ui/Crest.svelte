<script lang="ts">
	import { urlCrest } from '$lib/assets';

	let {
		nome,
		tipo = 'loghi',
		size = 18,
		title
	}: { nome?: string | null; tipo?: 'loghi' | 'stemmi'; size?: number; title?: string } = $props();

	let url = $derived(urlCrest(nome, tipo));
	let errore = $state(false);
	$effect(() => {
		void url;
		errore = false;
	});
</script>

{#if url && !errore}
	<img
		src={url}
		alt={nome ?? ''}
		title={title ?? nome ?? ''}
		width={size}
		height={size}
		onerror={() => (errore = true)}
		style="border-radius:3px;object-fit:contain;vertical-align:middle;flex:0 0 auto;"
	/>
{:else if tipo === 'stemmi' && nome}
	<!-- niente stemma: mostra un segnaposto con l'iniziale -->
	<span
		style="display:inline-flex;align-items:center;justify-content:center;width:{size}px;height:{size}px;border-radius:3px;background:var(--panel-2);border:1px solid var(--border);font:700 {Math.round(
			size * 0.5
		)}px/1 var(--mono);color:var(--muted);flex:0 0 auto;"
	>{nome.trim().charAt(0).toUpperCase()}</span>
{/if}
