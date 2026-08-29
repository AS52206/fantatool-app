<script lang="ts">
	import { asta } from '$lib/stores/auction.svelte';
	import { normalizzaNome } from '$lib/engine/names';
	import RoleTag from '$lib/ui/RoleTag.svelte';
	import Crest from '$lib/ui/Crest.svelte';

	let attivo = $state<string>('');
	let query = $state('');
	let confrontaCon = $state<string>('');

	const nomi = $derived(Object.keys(asta.scenari));
	$effect(() => {
		if (!attivo || !(attivo in asta.scenari)) attivo = nomi[0] ?? '';
	});

	const suggerimenti = $derived.by(() => {
		const q = normalizzaNome(query);
		if (!q || !attivo) return [];
		const inPiano = new Set(Object.keys(asta.scenari[attivo] ?? {}));
		return asta.giocatori
			.filter((g) => !inPiano.has(g.chiave) && g.chiave.includes(q))
			.sort((a, b) => b.quotazione - a.quotazione)
			.slice(0, 6);
	});

	const stColor = { PRESO: 'var(--ok)', PERSO: 'var(--bad)', LIBERO: 'var(--muted)' } as Record<string, string>;

	function aggiungi(chiave: string, consigliato: number | null) {
		asta.setTargetScenario(attivo, chiave, consigliato ?? 1);
		query = '';
	}
</script>

<div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-bottom:12px;">
	{#each nomi as n}
		<button onclick={() => (attivo = n)} class:primary={n === attivo}>{n}</button>
	{/each}
	<button onclick={() => (attivo = asta.nuovoScenario())}>+ Nuovo piano</button>
</div>

{#if attivo}
	{@const righe = asta.righeScenario(attivo)}
	{@const an = asta.analisiScenario(attivo)}
	<div style="display:grid;grid-template-columns:1.4fr 1fr;gap:16px;align-items:start;">
		<div class="panel">
			<div style="display:flex;gap:8px;align-items:center;margin-bottom:10px;">
				<input
					value={attivo}
					onchange={(e) => asta.rinominaScenario(attivo, (e.target as HTMLInputElement).value)}
					style="font-weight:700;flex:1;" />
				<button style="color:var(--bad);" onclick={() => { if (confirm('Eliminare il piano?')) asta.eliminaScenario(attivo); }}>Elimina</button>
			</div>

			<div style="position:relative;margin-bottom:10px;">
				<input placeholder="Aggiungi giocatore al piano…" bind:value={query} style="width:100%;" />
				{#if suggerimenti.length}
					<div class="panel" style="position:absolute;z-index:5;left:0;right:0;padding:4px;">
						{#each suggerimenti as g}
							{@const cons = asta.valutazione(g).fascia.riferimento}
							<button class="row-player" onclick={() => aggiungi(g.chiave, cons)}>
								<RoleTag ruolo={g.ruolo} ruoloMantra={g.ruoloMantra} />
								<Crest nome={g.squadra} size={15} />
								<strong>{g.nome}</strong><span class="muted">{g.squadra}</span>
								<span class="muted mono" style="margin-left:auto;">cons. {cons}</span>
							</button>
						{/each}
					</div>
				{/if}
			</div>

			<table style="width:100%;border-collapse:collapse;font-size:13px;">
				<thead><tr style="text-align:left;"><th>R</th><th>Giocatore</th><th>Max</th><th>Cons.</th><th>Stato</th><th></th></tr></thead>
				<tbody>
					{#each righe as r (r.chiave)}
						<tr style="border-top:1px solid var(--border);">
							<td><RoleTag ruolo={r.ruolo} ruoloMantra={r.ruoloMantra} /></td>
							<td style="white-space:nowrap;">
								<Crest nome={r.giocatore?.squadra} size={14} /> {r.nome}{#if r.stato !== 'LIBERO'}<span class="muted" style="font-size:11px;"> · {r.proprietario} {r.prezzoEffettivo}</span>{/if}</td>
							<td>
								<input type="number" min="1" value={r.max} style="width:70px;"
									onchange={(e) => asta.setTargetScenario(attivo, r.chiave, +(e.target as HTMLInputElement).value)} />
							</td>
							<td class="mono muted">{r.consigliato ?? '—'}</td>
							<td class="mono" style="color:{stColor[r.stato]};">{r.stato}</td>
							<td><button style="padding:0 6px;font-size:11px;" onclick={() => asta.rimuoviDaScenario(attivo, r.chiave)}>✕</button></td>
						</tr>
					{/each}
				</tbody>
			</table>
			{#if !righe.length}<p class="muted" style="font-size:12px;">Piano vuoto — aggiungi i tuoi obiettivi con il prezzo massimo che sei disposto a pagare.</p>{/if}
		</div>

		<div style="display:flex;flex-direction:column;gap:16px;">
			<div class="panel">
				<h2 style="margin:0 0 6px;font-size:15px;">Stato del piano</h2>
				<div style="font-size:13px;">
					Totale pianificato: <span class="mono" style="color:var(--cyan);">{an.righe.reduce((s, x) => s + x.massimo, 0)}</span>
					· margine sul budget: <span class="mono" style:color={an.realizzabile ? 'var(--ok)' : 'var(--bad)'}>{an.margine}</span>
				</div>
				<div class="muted" style="font-size:12px;margin-top:4px;">
					presi {an.conteggi.presi} · persi {an.conteggi.persi} · liberi {an.conteggi.liberi}
					{#if an.prossimo_target}· prossimo obiettivo: <strong>{an.prossimo_target}</strong>{/if}
				</div>
				{#if !an.realizzabile}
					<div style="color:var(--bad);font-size:12px;margin-top:4px;">Il piano supera il budget di lega.</div>
				{/if}
			</div>

			<div class="panel">
				<h2 style="margin:0 0 6px;font-size:15px;">Confronta con</h2>
				<select bind:value={confrontaCon} style="width:100%;">
					<option value="">—</option>
					{#each nomi.filter((n) => n !== attivo) as n}<option value={n}>{n}</option>{/each}
				</select>
				{#if confrontaCon && confrontaCon in asta.scenari}
					{@const c = asta.confrontaScenari(attivo, confrontaCon)}
					<div style="font-size:12px;margin-top:8px;">
						<div>{attivo}: <span class="mono">{c.a.totale}</span> ({c.a.giocatori} gioc.) · {confrontaCon}: <span class="mono">{c.b.totale}</span> ({c.b.giocatori})</div>
						<div class="muted" style="margin-top:4px;">Δ crediti: {c.delta_crediti > 0 ? '+' : ''}{c.delta_crediti}</div>
						{#if c.comuni.length}<div class="muted" style="margin-top:4px;">In comune: {c.comuni.join(', ')}</div>{/if}
						{#if c.solo_a.length}<div class="muted">Solo {attivo}: {c.solo_a.join(', ')}</div>{/if}
						{#if c.solo_b.length}<div class="muted">Solo {confrontaCon}: {c.solo_b.join(', ')}</div>{/if}
					</div>
				{/if}
			</div>
		</div>
	</div>
{:else}
	<div class="panel"><button class="primary" onclick={() => (attivo = asta.nuovoScenario())}>Crea il primo piano</button></div>
{/if}
