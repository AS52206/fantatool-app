<script lang="ts">
	/** Puntini pieni/vuoti = slot occupati di un reparto. */
	let {
		presi,
		limite,
		colore = 'var(--accent)'
	}: { presi: number; limite: number; colore?: string } = $props();
</script>

<span style="display:inline-flex;gap:3px;align-items:center;">
	{#each Array(Math.max(limite, presi)) as _, i}
		<span
			style="width:7px;height:7px;border-radius:2px;{i < presi
				? `background:${colore};`
				: 'background:transparent;border:1px solid var(--border-strong);'}"
		></span>
	{/each}
</span>
