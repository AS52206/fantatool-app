<script lang="ts">
	import { asta } from '$lib/stores/auction.svelte';
	import { normalizzaNome } from '$lib/engine/names';
	import { calcolaScarsitaRuoliMantra } from '$lib/engine/mantra';
	import RoleTag from '$lib/ui/RoleTag.svelte';
	import Crest from '$lib/ui/Crest.svelte';
	import type { Ruolo } from '$lib/domain/types';

	const RUOLI: Ruolo[] = ['P', 'D', 'C', 'A'];
	type Ord = 'quotazione' | 'pma' | 'fl' | 'tit' | 'fm' | 'nome';

	let query = $state('');
	let ruoloFiltro = $state<Ruolo | 'TUTTI'>('TUTTI');
	let ord = $state<Ord>('quotazione');
	let soloConPma = $state(false);

	const presi = $derived(asta.giocatoreIdPresi);
	const liberi = $derived.by(() => {
		const q = normalizzaNome(query);
		let list = asta.giocatori.filter((g) => !presi.has(g.id));
		if (ruoloFiltro !== 'TUTTI') list = list.filter((g) => g.ruolo === ruoloFiltro);
		if (soloConPma) list = list.filter((g) => g.fc?.pma);
		if (q) list = list.filter((g) => g.chiave.includes(q) || normalizzaNome(g.squadra).includes(q));
		const key = (g: (typeof list)[number]) =>
			ord === 'nome'
				? g.nome
				: ord === 'pma'
					? (g.fc?.pma ?? 0)
					: ord === 'fl'
						? (g.fantalab?.prezzo_atteso ?? 0)
						: ord === 'tit'
							? (g.fc?.expectedTitolarita ?? 0)
							: ord === 'fm'
								? (g.fc?.expectedFantamedia ?? 0)
								: g.quotazione;
		return [...list].sort((a, b) => {
			const ka = key(a);
			const kb = key(b);
			return typeof ka === 'string' ? ka.localeCompare(kb as string) : (kb as number) - (ka as number);
		});
	});

	const scarsitaMantra = $derived.by(() =>
		asta.isMantra
			? calcolaScarsitaRuoliMantra(
					asta.giocatori
						.filter((g) => !presi.has(g.id))
						.map((g) => ({ ruoli: g.ruoloMantra, titolarita: g.fc?.expectedTitolarita ?? 0 })),
					asta.config.squadre.length
				)
			: []
	);
	const statoColore = { CRITICA: 'var(--bad)', STRETTA: 'var(--warn)', OK: 'var(--muted)' } as Record<string, string>;
</script>

{#if asta.isMantra && scarsitaMantra.length}
	<div class="panel" style="margin-bottom:16px;">
		<h2 style="margin:0 0 6px;font-size:15px;">Scarsità ruoli Mantra (titolari liberi per squadra)</h2>
		<div style="display:flex;gap:14px;flex-wrap:wrap;font-size:12px;">
			{#each scarsitaMantra as s}
				<span style="color:{statoColore[s.stato]};" class="mono">
					{s.ruolo} {s.affidabili}/{s.liberi} · {s.per_squadra.toFixed(1)}×
				</span>
			{/each}
		</div>
	</div>
{/if}

<div class="panel">
	<div style="display:flex;gap:8px;margin-bottom:10px;flex-wrap:wrap;">
		<input placeholder="Cerca…" bind:value={query} style="flex:1;min-width:160px;" />
		<select bind:value={ruoloFiltro}>
			<option value="TUTTI">Tutti i ruoli</option>
			{#each RUOLI as r}<option value={r}>{r}</option>{/each}
		</select>
		<select bind:value={ord}>
			<option value="quotazione">Quotazione</option>
			<option value="pma">PMA Fantacrediti</option>
			<option value="fl">PMA Fantalab</option>
			<option value="tit">% titolarità</option>
			<option value="fm">FM attesa</option>
			<option value="nome">Nome</option>
		</select>
		<label class="muted" style="font-size:12px;display:flex;align-items:center;gap:4px;">
			<input type="checkbox" bind:checked={soloConPma} /> solo con PMA
		</label>
	</div>
	<div class="muted" style="font-size:11px;margin-bottom:6px;">{liberi.length} liberi</div>
	<div style="max-height:65vh;overflow:auto;">
		<table style="width:100%;border-collapse:collapse;font-size:12px;">
			<thead><tr style="text-align:left;position:sticky;top:0;background:var(--panel);">
				<th>R</th><th>Giocatore</th><th>Club</th><th>Qt</th><th title="PMA Fantacrediti">PMA</th><th>PFC</th><th title="PMA Fantalab">FL</th><th title="% titolarità attesa">%TIT</th><th>Slot</th><th>FM~</th>
			</tr></thead>
			<tbody>
				{#each liberi.slice(0, 300) as g (g.id)}
					{@const tit = g.fc?.expectedTitolarita ?? 0}
					<tr style="border-top:1px solid var(--border);">
						<td><RoleTag ruolo={g.ruolo} ruoloMantra={g.ruoloMantra} /></td>
						<td>{g.nome}</td>
						<td class="muted" style="white-space:nowrap;"><Crest nome={g.squadra} size={14} /> {g.squadra}</td>
						<td class="mono">{g.quotazione}</td>
						<td class="mono" style="color:var(--cyan);">{g.fc?.pma ?? '—'}</td>
						<td class="mono">{g.fc?.pfc ?? '—'}</td>
						<td class="mono" style="color:var(--warn);">{g.fantalab?.prezzo_atteso ?? '—'}</td>
						<td class="mono" style:color={tit >= 70 ? 'var(--ok)' : tit >= 45 ? 'var(--warn)' : tit > 0 ? 'var(--bad)' : 'var(--muted)'}>{tit ? Math.round(tit) + '%' : '—'}</td>
						<td class="mono">{g.fc?.slot ?? '—'}</td>
						<td class="mono">{g.fc?.expectedFantamedia ? g.fc.expectedFantamedia.toFixed(1) : '—'}</td>
					</tr>
				{/each}
			</tbody>
		</table>
	</div>
</div>
