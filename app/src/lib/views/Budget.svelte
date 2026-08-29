<script lang="ts">
	import { asta } from '$lib/stores/auction.svelte';

	const roleColor = { P: 'var(--role-p)', D: 'var(--role-d)', C: 'var(--role-c)', A: 'var(--role-a)' } as Record<string, string>;
	const statoColor = { ALTA: 'var(--bad)', MEDIA: 'var(--warn)', BASSA: 'var(--muted)', COPERTA: 'var(--muted)' } as Record<string, string>;
</script>

<div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;align-items:start;">
	<div class="panel">
		<h2 style="margin:0 0 8px;font-size:16px;">Budget per reparto · {asta.miaSquadra}</h2>
		<table style="width:100%;border-collapse:collapse;font-size:13px;">
			<thead><tr style="text-align:left;"><th>R</th><th>Rosa</th><th>Quota</th><th>Stanziato</th><th>Speso</th><th>Residuo</th><th>Potere</th></tr></thead>
			<tbody>
				{#each asta.budgetPerReparto as b}
					<tr style="border-top:1px solid var(--border);">
						<td style="color:{roleColor[b.ruolo]};font-family:var(--mono);font-weight:700;">{b.ruolo}</td>
						<td class="mono">{b.presi}/{b.limite}</td>
						<td class="mono">{b.quota_pct}%</td>
						<td class="mono">{b.budget_reparto}</td>
						<td class="mono">{b.speso}</td>
						<td class="mono" style:color={b.residuo < 0 ? 'var(--bad)' : 'var(--cyan)'}>{b.residuo}</td>
						<td class="mono muted">{b.poteri.strategico}</td>
					</tr>
				{/each}
			</tbody>
		</table>
		<p class="muted" style="font-size:11px;margin-top:8px;">
			Quota = % di budget teorica per reparto · Potere = massimo consigliato per il prossimo acquisto
			lasciando 1 credito per ogni altro slot.
		</p>
	</div>

	<div class="panel">
		<h2 style="margin:0 0 8px;font-size:16px;">Domanda rivali per ruolo</h2>
		{#if asta.isMantra}
			<p class="muted" style="font-size:12px;">
				In Mantra la domanda è per ruolo atomico — vedi il pannello "Scarsità ruoli Mantra" nella tab Liberi.
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
</div>
