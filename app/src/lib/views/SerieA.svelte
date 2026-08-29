<script lang="ts">
	import { asta } from '$lib/stores/auction.svelte';
	import RoleTag from '$lib/ui/RoleTag.svelte';
	import Crest from '$lib/ui/Crest.svelte';

	const ORDINE = { P: 0, D: 1, C: 2, A: 3 } as Record<string, number>;

	const perClub = $derived.by(() => {
		const acqById = new Map(asta.acquisti.map((a) => [a.giocatoreId, a]));
		const map = new Map<string, typeof asta.giocatori>();
		for (const g of asta.giocatori) {
			if (!g.squadra) continue;
			if (!map.has(g.squadra)) map.set(g.squadra, []);
			map.get(g.squadra)!.push(g);
		}
		return [...map.entries()]
			.sort((a, b) => a[0].localeCompare(b[0]))
			.map(([club, players]) => ({
				club,
				players: [...players].sort(
					(a, b) => (ORDINE[a.ruolo] ?? 9) - (ORDINE[b.ruolo] ?? 9) || b.quotazione - a.quotazione
				),
				acqById
			}));
	});
</script>

<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:16px;align-items:start;">
	{#each perClub as { club, players, acqById }}
		<div class="panel">
			<h2 style="margin:0 0 6px;font-size:15px;display:flex;align-items:center;gap:8px;">
				<Crest nome={club} size={22} />{club}
			</h2>
			{#each players as g}
				{@const a = acqById.get(g.id)}
				<div style="display:flex;gap:6px;font-size:12px;padding:2px 0;align-items:baseline;{a ? 'opacity:0.55;' : ''}">
					<RoleTag ruolo={g.ruolo} ruoloMantra={g.ruoloMantra} />
					<span>{g.nome}</span>
					<span class="muted mono" style="margin-left:auto;">
						{#if a}{a.proprietario} · {a.prezzo}{:else}Qt {g.quotazione}{#if g.fc?.pma}· PMA {g.fc.pma}{/if}{#if g.fantalab?.prezzo_atteso}· FL {g.fantalab.prezzo_atteso}{/if}{#if g.fc?.expectedTitolarita}· {Math.round(g.fc.expectedTitolarita)}%{/if}{/if}
					</span>
				</div>
			{/each}
		</div>
	{/each}
</div>
