<script lang="ts">
	import { asta } from '$lib/stores/auction.svelte';
	import Crest from '$lib/ui/Crest.svelte';
	import type { Ruolo } from '$lib/domain/types';
	const RUOLI: Ruolo[] = ['P', 'D', 'C', 'A'];
</script>

<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:16px;align-items:start;">
	{#each asta.config.squadre as sq}
		{@const b = asta.bilanci[sq.nome]}
		{@const rosa = asta.rosa(sq.nome)}
		<div class="panel">
			<div style="display:flex;justify-content:space-between;align-items:center;">
				<h2 style="margin:0;font-size:15px;display:flex;align-items:center;gap:6px;">
					<Crest nome={sq.stemma || sq.nome} tipo="stemmi" size={22} />
					{sq.nome}{sq.isMia ? ' ★' : ''}
				</h2>
				<span class="muted mono" style="font-size:12px;">
					{b.g_presi}/{asta.config.limiti.TOT} · <span style:color={b.c_rimasti < 0 ? 'var(--bad)' : 'var(--cyan)'}>{b.c_rimasti} cr</span>
				</span>
			</div>
			{#each RUOLI as r}
				{@const gr = rosa.filter((a) => a.ruolo === r).sort((x, y) => y.prezzo - x.prezzo)}
				<div style="font-size:11px;margin-top:8px;font-family:var(--mono);letter-spacing:1px;color:var(--role-{r.toLowerCase()});">
					{r} · {gr.length}/{asta.config.limiti[r]}
				</div>
				{#each gr as a}
					<div style="display:flex;gap:6px;font-size:12px;padding:2px 0;align-items:center;">
						<Crest nome={a.squadraSerieA} size={14} />
						<span>{a.nome}</span>
						{#if asta.isMantra && a.player?.ruoloMantra}<span class="muted mono" style="font-size:10px;">{a.player.ruoloMantra}</span>{/if}
						<span class="muted">{a.squadraSerieA}</span>
						<span class="mono" style="margin-left:auto;color:var(--cyan);">{a.prezzo}</span>
					</div>
				{/each}
			{/each}
			{#if !rosa.length}<p class="muted" style="font-size:12px;">Vuota.</p>{/if}
		</div>
	{/each}
</div>
