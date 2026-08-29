<script lang="ts">
	import { asta } from '$lib/stores/auction.svelte';
	import type { Ruolo } from '$lib/domain/types';

	/** Barra budget: quota spesa per reparto (colorata) + residuo. */
	let {
		squadra,
		height = 8,
		labels = false
	}: { squadra: string; height?: number; labels?: boolean } = $props();

	const RUOLI: Ruolo[] = ['P', 'D', 'C', 'A'];
	const colore: Record<Ruolo, string> = {
		P: 'var(--role-p)',
		D: 'var(--role-d)',
		C: 'var(--role-c)',
		A: 'var(--role-a)'
	};

	let dati = $derived.by(() => {
		const budget = Math.max(1, asta.config.budgetMax);
		const rosa = asta.rosa(squadra);
		const perR = RUOLI.map((r) => ({
			r,
			speso: rosa.filter((a) => a.ruolo === r).reduce((s, a) => s + a.prezzo, 0)
		}));
		const speso = perR.reduce((s, x) => s + x.speso, 0);
		return { budget, perR, speso, residuo: Math.max(0, budget - speso) };
	});
</script>

<div class="bar" style="height:{height}px;">
	{#each dati.perR as x}
		{#if x.speso > 0}
			<i style="width:{(100 * x.speso) / dati.budget}%;background:{colore[x.r]};" title="{x.r} {x.speso}"></i>
		{/if}
	{/each}
</div>
{#if labels}
	<div style="display:flex;gap:10px;margin-top:4px;font-size:10px;" class="mono muted">
		{#each dati.perR as x}
			<span style="color:{x.speso ? colore[x.r] : 'var(--muted-dim)'};">{x.r} {x.speso}</span>
		{/each}
		<span style="margin-left:auto;">residuo {dati.residuo}</span>
	</div>
{/if}
