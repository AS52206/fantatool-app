<script lang="ts">
	import { asta } from '$lib/stores/auction.svelte';
	import Crest from '$lib/ui/Crest.svelte';
	import type { Ruolo } from '$lib/domain/types';
	const RUOLI: Ruolo[] = ['P', 'D', 'C', 'A'];

	let vista = $state<'reparto' | 'giocatore'>('reparto');
	const pct = (v: number) => `${((100 * v) / Math.max(1, asta.config.budgetMax)).toFixed(1)}%`;
</script>

<div style="display:flex;gap:8px;margin-bottom:12px;align-items:center;">
	<span class="muted" style="font-size:12px;">Percentuali sul budget:</span>
	<button class:primary={vista === 'reparto'} onclick={() => (vista = 'reparto')} style="font-size:12px;">per reparto</button>
	<button class:primary={vista === 'giocatore'} onclick={() => (vista = 'giocatore')} style="font-size:12px;">per giocatore</button>
</div>

<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:16px;align-items:start;">
	{#each asta.config.squadre as sq}
		{@const b = asta.bilanci[sq.nome]}
		{@const rosa = asta.rosa(sq.nome)}
		{@const speso = asta.config.budgetMax - b.c_rimasti}
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
			<div class="mono" style="font-size:11px;color:var(--muted);margin-top:2px;">
				speso {speso} · <span style="color:var(--cyan);">{pct(speso)}</span> del budget
			</div>

			{#each RUOLI as r}
				{@const gr = rosa.filter((a) => a.ruolo === r).sort((x, y) => y.prezzo - x.prezzo)}
				{@const spesoR = gr.reduce((s, a) => s + a.prezzo, 0)}
				<div style="display:flex;justify-content:space-between;font-size:11px;margin-top:8px;font-family:var(--mono);letter-spacing:1px;color:var(--role-{r.toLowerCase()});">
					<span>{r} · {gr.length}/{asta.config.limiti[r]}</span>
					<span>{spesoR} · {pct(spesoR)}</span>
				</div>
				{#if vista === 'giocatore'}
					{#each gr as a}
						<div style="display:flex;gap:6px;font-size:12px;padding:2px 0;align-items:center;">
							<Crest nome={a.squadraSerieA} size={14} />
							<span>{a.nome}</span>
							{#if asta.isMantra && a.player?.ruoloMantra}<span class="muted mono" style="font-size:10px;">{a.player.ruoloMantra}</span>{/if}
							<span class="muted">{a.squadraSerieA}</span>
							<span class="mono" style="margin-left:auto;color:var(--cyan);">{a.prezzo}</span>
							<span class="mono muted" style="width:44px;text-align:right;">{pct(a.prezzo)}</span>
						</div>
					{/each}
				{/if}
			{/each}
			{#if !rosa.length}<p class="muted" style="font-size:12px;">Vuota.</p>{/if}
		</div>
	{/each}
</div>
