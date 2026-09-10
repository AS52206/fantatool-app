<script lang="ts">
	import { asta } from '$lib/stores/auction.svelte';
	import { normalizzaNome } from '$lib/engine/names';
	import { badgeStato, affidabile } from '$lib/statoGiocatore';
	import Crest from '$lib/ui/Crest.svelte';

	const RUOLI_CLASSIC = ['P', 'D', 'C', 'A'] as const;
	const NOME_REPARTO: Record<string, string> = {
		P: 'Portieri',
		D: 'Difensori',
		C: 'Centrocampisti',
		A: 'Attaccanti'
	};

	let query = $state('');
	let ruoloFiltro = $state('TUTTI');
	let ordina = $state<'quota' | 'pma' | 'titolarita' | 'nome'>('quota');
	let soloAffidabili = $state(true);
	let mostraPresi = $state(false);

	/** Ruoli Mantra che ti mancano ancora nei moduli target: li marchiamo "ti serve". */
	const ruoliServono = $derived(
		new Set(asta.isMantra ? asta.allertaRuoliChiaveMantra.map((a) => a.ruolo as string) : [])
	);

	const RUOLI_MANTRA = ['Por', 'Dd', 'Ds', 'Dc', 'B', 'E', 'M', 'C', 'W', 'T', 'A', 'Pc'];
	const tokenRuoliMantra = (v: unknown) =>
		String(v ?? '')
			.split(/[;,/\s]+/)
			.map((s) => s.trim())
			.filter(Boolean);

	const pma = (g: (typeof asta.giocatori)[number]) =>
		g.fc?.pma != null ? Math.round(g.fc.pma) : null;
	const tit = (g: (typeof asta.giocatori)[number]) =>
		g.fc?.expectedTitolarita != null
			? Math.round(g.fc.expectedTitolarita)
			: g.ballottaggio ? Math.round(g.ballottaggio.expectedTitolarita) : null;
	const coloreTit = (t: number | null) =>
		t == null ? 'var(--muted)' : t >= 80 ? 'var(--ok)' : t >= 60 ? 'var(--text)' : 'var(--warn)';

	const acqById = $derived(new Map(asta.acquisti.map((a) => [a.giocatoreId, a])));

	const perClub = $derived.by(() => {
		const q = normalizzaNome(query);
		const map = new Map<string, (typeof asta.giocatori)[number][]>();
		for (const g of asta.giocatori) {
			if (!g.squadra) continue;
			(map.get(g.squadra) ?? map.set(g.squadra, []).get(g.squadra)!).push(g);
		}

		return [...map.entries()]
			.filter(([club]) => !q || normalizzaNome(club).includes(q))
			.sort((a, b) => a[0].localeCompare(b[0]))
			.map(([club, tutti]) => {
				let players = tutti.filter((g) => {
					const preso = acqById.has(g.id);
					if (q && !normalizzaNome(g.nome).includes(q) && !normalizzaNome(club).includes(q))
						return false;
					if (preso && !mostraPresi) return false;
					if (!preso && soloAffidabili && !affidabile(g.fc, 55, g.ballottaggio)) return false;
					if (ruoloFiltro !== 'TUTTI') {
						return asta.isMantra
							? tokenRuoliMantra(g.ruoloMantra).includes(ruoloFiltro)
							: g.ruolo === ruoloFiltro;
					}
					return true;
				});
				players = [...players].sort((a, b) => {
					if (ordina === 'nome') return a.nome.localeCompare(b.nome);
					if (ordina === 'pma') return (pma(b) ?? 0) - (pma(a) ?? 0);
					if (ordina === 'titolarita') return (tit(b) ?? -1) - (tit(a) ?? -1);
					return b.quotazione - a.quotazione;
				});

				const reparti = RUOLI_CLASSIC.map((r) => ({
					ruolo: r,
					players: players.filter((g) => (g.ruolo || 'C') === r)
				})).filter((x) => x.players.length);

				const presiClub = tutti.filter((g) => acqById.has(g.id));
				const spesa = presiClub.reduce((s, g) => s + (acqById.get(g.id)?.prezzo ?? 0), 0);
				const liberiAff = tutti.filter((g) => !acqById.has(g.id) && affidabile(g.fc)).length;

				return {
					club,
					reparti,
					visibili: players.length,
					liberiAff,
					presi: presiClub.length,
					spesa
				};
			})
			.filter((c) => c.visibili > 0);
	});

	const totali = $derived({
		giocatori: asta.giocatori.filter((g) => g.squadra).length,
		presi: asta.acquisti.length
	});
</script>

<div class="panel toolbar">
	<input placeholder="Cerca club o giocatore…" bind:value={query} style="flex:1;min-width:160px;" />
	<select bind:value={ruoloFiltro}>
		<option value="TUTTI">Tutti i ruoli</option>
		{#if asta.isMantra}
			{#each RUOLI_MANTRA as r}<option value={r}>{r}</option>{/each}
		{:else}
			{#each RUOLI_CLASSIC as r}<option value={r}>{NOME_REPARTO[r]}</option>{/each}
		{/if}
	</select>
	<select bind:value={ordina} title="Ordina i giocatori">
		<option value="quota">Quotazione</option>
		<option value="pma">PMA</option>
		<option value="titolarita">Titolarità</option>
		<option value="nome">Nome</option>
	</select>
	<label class="chk" title="Nasconde riserve e giocatori a bassa titolarità attesa">
		<input type="checkbox" bind:checked={soloAffidabili} /> solo affidabili
	</label>
	<label class="chk">
		<input type="checkbox" bind:checked={mostraPresi} /> mostra presi
	</label>
	<span class="muted mono" style="margin-left:auto;font-size:11px;white-space:nowrap;">
		{totali.presi}/{totali.giocatori} presi
	</span>
</div>

<div class="griglia">
	{#each perClub as c (c.club)}
		<div class="panel club">
			<header>
				<Crest nome={c.club} size={22} />
				<h2>{c.club}</h2>
				<span class="meta mono">
					{#if c.presi}<span style="color:var(--cyan);">{c.presi} presi · {c.spesa}</span> ·{/if}
					<span title="giocatori liberi affidabili">{c.liberiAff} lib.</span>
				</span>
			</header>

			{#each c.reparti as rep}
				<div class="rep-label" style="color:var(--role-{rep.ruolo.toLowerCase()});">
					{NOME_REPARTO[rep.ruolo]} <span class="muted">{rep.players.length}</span>
				</div>
				{#each rep.players as g (g.id)}
					{@const a = acqById.get(g.id)}
					{@const badge = badgeStato(g.fc, g.ballottaggio)}
					{@const serve = !a && asta.isMantra && tokenRuoliMantra(g.ruoloMantra).some((t) => ruoliServono.has(t))}
					<div class="riga" class:presa={a}>
						<span class="tag" data-ruolo={g.ruolo || 'C'}>
							{asta.isMantra ? g.ruoloMantra || g.ruolo : g.ruolo || '—'}
						</span>
						<span class="nomewrap">
							{#if serve}<span class="serve" title="Ruolo che ti manca nei moduli target">•</span>{/if}
							<span class="nome" title={g.nome}>{g.nome}</span>
							{#each badge as b}<span class="bdg bdg--{b.tono}" title={b.titolo}>{b.icona}</span>{/each}
						</span>
						{#if a}
							<span class="stat-presa mono">
								<span class="owner" style="color:{asta.coloreDi(a.proprietario)};">{a.proprietario}</span>
								<b>{a.prezzo}</b>
							</span>
						{:else}
							<span class="stats mono">
								<b>{g.quotazione}</b>
								<span class="muted">{pma(g) ?? '–'}</span>
								<span style="color:{coloreTit(tit(g))};">{tit(g) != null ? tit(g) + '%' : '–'}</span>
							</span>
						{/if}
					</div>
				{/each}
			{/each}
		</div>
	{:else}
		<p class="muted" style="grid-column:1/-1;">Nessun giocatore corrisponde ai filtri.</p>
	{/each}
</div>

<div class="muted legenda mono">
	<b>Qt</b> quotazione · <b>PMA</b> prezzo medio d'asta · <b>%</b> titolarità attesa ·
	🔴 fuori · ⚽ rigorista · ⏱ ballottaggio · ✨ nuovo{#if asta.isMantra} · <span style="color:var(--cyan);">•</span> ruolo che ti manca{/if}
</div>

<style>
	.toolbar {
		display: flex;
		gap: 8px;
		align-items: center;
		flex-wrap: wrap;
		margin-bottom: 14px;
		position: sticky;
		top: 0;
		z-index: 4;
	}
	.chk {
		display: flex;
		align-items: center;
		gap: 5px;
		font-size: 12px;
		color: var(--muted);
		white-space: nowrap;
	}
	.griglia {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(290px, 1fr));
		gap: 14px;
		align-items: start;
	}
	.club {
		padding-top: 10px;
	}
	.club header {
		display: flex;
		align-items: center;
		gap: 8px;
		padding-bottom: 6px;
		margin-bottom: 4px;
		border-bottom: 1px solid var(--border);
	}
	.club header h2 {
		margin: 0;
		font-size: 14px;
		letter-spacing: 0.3px;
	}
	.club header .meta {
		margin-left: auto;
		font-size: 10px;
		color: var(--text);
		text-align: right;
	}
	.rep-label {
		font: 600 10px/1 var(--mono);
		letter-spacing: 1px;
		text-transform: uppercase;
		margin: 9px 0 3px;
		opacity: 0.85;
	}
	.riga {
		display: grid;
		grid-template-columns: minmax(34px, auto) 1fr auto;
		align-items: center;
		gap: 8px;
		font-size: 12px;
		padding: 3px 0;
		border-bottom: 1px solid color-mix(in srgb, var(--border) 45%, transparent);
	}
	.riga .tag {
		font-size: 10px;
		padding: 1px 4px;
		justify-self: start;
	}
	.nomewrap {
		display: flex;
		align-items: center;
		gap: 4px;
		min-width: 0;
	}
	.nome {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.serve {
		color: var(--cyan);
		font-size: 15px;
		line-height: 0;
		flex: 0 0 auto;
	}
	.bdg {
		font-size: 10px;
		flex: 0 0 auto;
		filter: grayscale(0.15);
	}
	.bdg--bad {
		filter: none;
	}
	.riga.presa .nome {
		color: var(--muted);
		text-decoration: line-through;
		text-decoration-color: color-mix(in srgb, var(--muted) 60%, transparent);
	}
	.stats {
		display: grid;
		grid-template-columns: 30px 38px 34px;
		gap: 6px;
		text-align: right;
		font-size: 11px;
		font-variant-numeric: tabular-nums;
	}
	.stats b {
		color: var(--text-strong);
		font-weight: 600;
	}
	.stat-presa {
		display: flex;
		align-items: baseline;
		gap: 6px;
		font-size: 11px;
		max-width: 150px;
	}
	.stat-presa .owner {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.stat-presa b {
		color: var(--cyan);
	}
	.legenda {
		font-size: 10px;
		margin-top: 12px;
		padding: 0 2px;
	}
</style>
