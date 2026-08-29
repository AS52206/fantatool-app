<script lang="ts">
	import { asta } from '$lib/stores/auction.svelte';
	import Crest from '$lib/ui/Crest.svelte';

	const roleColor = { P: 'var(--role-p)', D: 'var(--role-d)', C: 'var(--role-c)', A: 'var(--role-a)' } as Record<string, string>;
	const statoColor = { ALTA: 'var(--bad)', MEDIA: 'var(--warn)', BASSA: 'var(--muted)', COPERTA: 'var(--muted)' } as Record<string, string>;
</script>

<h2 style="margin:0 0 10px;font-size:16px;">Budget per reparto — tutte le squadre</h2>
<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(320px,1fr));gap:16px;align-items:start;">
	{#each asta.config.squadre as sq}
		{@const b = asta.bilanci[sq.nome]}
		{@const rip = asta.budgetPerRepartoDi(sq.nome)}
		{@const speso = asta.config.budgetMax - b.c_rimasti}
		<div class="panel" style="border-top:3px solid {asta.coloreDi(sq.nome)};">
			<div style="display:flex;justify-content:space-between;align-items:center;">
				<h3 style="margin:0;font-size:14px;display:flex;align-items:center;gap:6px;">
					<span style="width:9px;height:9px;border-radius:2px;background:{asta.coloreDi(sq.nome)};"></span>
					<Crest nome={sq.stemma || sq.nome} tipo="stemmi" size={20} />{sq.nome}{sq.isMia ? ' ★' : ''}
				</h3>
				<span class="mono" style="font-size:12px;">
					speso <span style="color:var(--cyan);">{speso}</span> · {((100 * speso) / Math.max(1, asta.config.budgetMax)).toFixed(1)}%
				</span>
			</div>
			<table style="width:100%;border-collapse:collapse;font-size:12px;margin-top:6px;">
				<thead><tr style="text-align:left;"><th>R</th><th>Rosa</th><th>Speso</th><th>% budget</th><th>Quota</th><th>Potere</th></tr></thead>
				<tbody>
					{#each rip as x}
						<tr style="border-top:1px solid var(--border);">
							<td style="color:{roleColor[x.ruolo]};font-family:var(--mono);font-weight:700;">{x.ruolo}</td>
							<td class="mono">{x.presi}/{x.limite}</td>
							<td class="mono" style="color:var(--cyan);">{x.speso}</td>
							<td class="mono">{x.speso_pct}%</td>
							<td class="mono muted">{x.quota_pct}%</td>
							<td class="mono muted">{x.poteri.strategico}</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>
	{/each}
</div>

<div class="panel" style="margin-top:16px;max-width:640px;">
	<h2 style="margin:0 0 8px;font-size:16px;">Domanda rivali per ruolo</h2>
	{#if asta.isMantra}
		<p class="muted" style="font-size:12px;">
			In Mantra la domanda è per ruolo atomico — vedi "Scarsità ruoli Mantra" nella tab Liberi.
		</p>
	{:else}
		<table style="width:100%;border-collapse:collapse;font-size:13px;">
			<thead><tr style="text-align:left;"><th>R</th><th>Slot liberi rivali</th><th>Squadre interessate</th></tr></thead>
			<tbody>
				{#each asta.matriceDomanda as m}
					<tr style="border-top:1px solid var(--border);">
						<td style="color:{roleColor[m.ruolo]};font-family:var(--mono);font-weight:700;">{m.ruolo}</td>
						<td class="mono">{m.domanda_rivali}</td>
						<td class="mono">{m.squadre_interessate}</td>
					</tr>
				{/each}
			</tbody>
		</table>
		<div style="margin-top:10px;">
			{#each asta.matriceDomanda as m}
				<div style="font-size:11px;margin-top:6px;">
					<span style="color:{roleColor[m.ruolo]};font-family:var(--mono);font-weight:700;">{m.ruolo}</span>
					{#each Object.entries(m.squadre) as [nome, cella]}
						<span class="muted" style="margin-left:8px;">{nome}: <span style="color:{statoColor[cella.stato]};">{cella.mancanti}</span></span>
					{/each}
				</div>
			{/each}
		</div>
	{/if}
</div>
