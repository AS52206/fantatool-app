<script lang="ts">
	import { asta } from '$lib/stores/auction.svelte';
	import { normalizzaNome } from '$lib/engine/names';
	import { MOLTIPLICATORI_FLAG_MANUALE } from '$lib/engine/pricing';
	import RoleTag from '$lib/ui/RoleTag.svelte';
	import type { Giocatore, Ruolo } from '$lib/domain/types';

	const RUOLI: Ruolo[] = ['P', 'D', 'C', 'A'];
	const coloreLivello: Record<string, string> = {
		OK: 'var(--ok)',
		ATTENZIONE: 'var(--warn)',
		CRITICO: 'var(--bad)'
	};

	let query = $state('');
	let ruoloFiltro = $state<Ruolo | 'TUTTI'>('TUTTI');
	let selezionato = $state<Giocatore | null>(null);
	let flagScelto = $state('');
	let prezzoInput = $state(1);
	let proprietarioScelto = $state(asta.miaSquadra);

	const presi = $derived(asta.giocatoreIdPresi);
	const risultati = $derived.by(() => {
		const q = normalizzaNome(query);
		let list = asta.giocatori.filter((g) => !presi.has(g.id));
		if (ruoloFiltro !== 'TUTTI') list = list.filter((g) => g.ruolo === ruoloFiltro);
		if (q) list = list.filter((g) => g.chiave.includes(q) || normalizzaNome(g.squadra).includes(q));
		return [...list].sort((a, b) => b.quotazione - a.quotazione).slice(0, 40);
	});

	const val = $derived.by(() =>
		selezionato
			? asta.valutazione(selezionato, { flagOverride: flagScelto || undefined, prezzoLive: prezzoInput })
			: null
	);

	let ultimoSelId = $state(-1);
	$effect(() => {
		if (selezionato && val && selezionato.id !== ultimoSelId) {
			ultimoSelId = selezionato.id;
			flagScelto = flagScelto || val.flag;
			prezzoInput = val.fascia.riferimento;
		}
	});

	function seleziona(g: Giocatore) {
		selezionato = g;
		ultimoSelId = -1;
		flagScelto = '';
		proprietarioScelto = proprietarioScelto || asta.miaSquadra;
	}
	function assegna() {
		if (!selezionato) return;
		try {
			asta.assegna(selezionato, prezzoInput, proprietarioScelto);
			selezionato = null;
			query = '';
			flagScelto = '';
		} catch (e) {
			alert(e instanceof Error ? e.message : String(e));
		}
	}
	const pillClass = (a: string) =>
		a === 'COMPRA' ? 'pill--buy' : a === 'VALUTA' ? 'pill--consider' : 'pill--stop';
</script>

<div style="display:grid;grid-template-columns:1.3fr 1fr;gap:16px;align-items:start;">
	<!-- SINISTRA: ricerca + consiglio -->
	<div style="display:flex;flex-direction:column;gap:16px;">
		<div class="panel">
			<div style="display:flex;gap:8px;margin-bottom:10px;">
				<input placeholder="Cerca giocatore o squadra…" bind:value={query} style="flex:1;" />
				<select bind:value={ruoloFiltro}>
					<option value="TUTTI">Tutti</option>
					{#each RUOLI as r}<option value={r}>{r}</option>{/each}
				</select>
			</div>
			<div style="max-height:280px;overflow:auto;">
				{#each risultati as g (g.id)}
					<button class="row-player {selezionato?.id === g.id ? 'sel' : ''}" onclick={() => seleziona(g)}>
						<RoleTag ruolo={g.ruolo} ruoloMantra={g.ruoloMantra} />
						<strong>{g.nome}</strong>
						<span class="muted">{g.squadra}</span>
						<span style="margin-left:auto;" class="muted mono">
							Qt {g.quotazione}{#if g.fc?.pma}· PMA {g.fc.pma}{/if}{#if g.fc?.expectedFantamedia}· FM~ {g.fc.expectedFantamedia.toFixed(1)}{/if}
						</span>
					</button>
				{:else}
					<p class="muted">Nessun risultato.</p>
				{/each}
			</div>
		</div>

		{#if selezionato && val}
			<div class="panel" style="border-color:var(--accent);">
				<div style="display:flex;align-items:baseline;gap:10px;">
					<h2 style="margin:0;font-size:18px;">{selezionato.nome}</h2>
					<RoleTag ruolo={selezionato.ruolo} ruoloMantra={selezionato.ruoloMantra} />
					<span class="muted">{selezionato.squadra}</span>
				</div>
				<div class="muted" style="font-size:13px;margin:6px 0;">
					Quotazione {selezionato.quotazione}
					{#if selezionato.fc}· PMA {selezionato.fc.pma} · PFC {selezionato.fc.pfc} · Slot {selezionato.fc.slot ?? '—'} · FM attesa {selezionato.fc.expectedFantamedia.toFixed(2)}{/if}
					{#if selezionato.fantalab}· Fantalab {selezionato.fantalab.pma_pct}%{/if}
				</div>

				<div style="display:flex;align-items:flex-end;gap:16px;margin:12px 0;flex-wrap:wrap;">
					<div>
						<div class="muted" style="font-size:11px;letter-spacing:1px;">CONSIGLIATO · {val.fonte}</div>
						<div class="prezzo-hero">{val.fascia.riferimento}</div>
						<div class="muted mono" style="font-size:12px;">fascia {val.fascia.min}–{val.fascia.max} · base {val.fascia.base}</div>
					</div>
					<div style="display:flex;flex-direction:column;gap:4px;">
						<span class="pill {pillClass(val.decisione.azione)}">{val.decisione.azione}</span>
						<span class="muted" style="font-size:11px;max-width:160px;">{val.decisione.motivo}</span>
					</div>
					<div class="muted" style="font-size:11px;">
						fase {val.fase.etichetta}<br />
						scarsità slot {val.scarsita.slot ?? '—'}:
						<span style="color:{coloreLivello[val.scarsita.livello === 'CRITICA' ? 'CRITICO' : val.scarsita.livello === 'ALTA' ? 'ATTENZIONE' : 'OK']};">{val.scarsita.livello}</span>
						({val.scarsita.offerta} liberi · domanda {val.scarsita.domanda})<br />
						{#if val.indiceInflazione !== null}inflazione {val.indiceInflazione > 0 ? '+' : ''}{val.indiceInflazione.toFixed(1)}%<br />{/if}
						tuo potere: {val.poteri.strategico}
					</div>
				</div>

				<div class="muted" style="font-size:11px;margin-bottom:8px;">
					fallback interno: {val.fallback.prezzo} · {val.fallback.etichetta}
				</div>

				{#if val.mantra}
					<div style="border:1px solid var(--border);border-radius:6px;padding:6px 8px;margin-bottom:10px;font-size:12px;">
						<strong>Mantra</strong> · ruoli {selezionato.ruoloMantra || '—'} · Δ copertura:
						<span style:color={val.mantra.delta_copertura > 0 ? 'var(--ok)' : 'var(--muted)'}>{val.mantra.delta_copertura > 0 ? '+' : ''}{val.mantra.delta_copertura}</span>
						{#if val.mantra.nuovi_moduli_completi.length}· completa: {val.mantra.nuovi_moduli_completi.join(', ')}{/if}
						<div class="muted" style="font-size:11px;">
							{val.mantra.per_modulo.map((m) => `${m.modulo} ${m.delta >= 0 ? '+' : ''}${m.delta}${m.completato ? ' ✓' : ''}`).join(' · ')}
						</div>
					</div>
				{/if}

				<div style="display:flex;gap:12px;flex-wrap:wrap;align-items:end;">
					<label>Flag
						<select bind:value={flagScelto} style="display:block;">
							{#each Object.keys(MOLTIPLICATORI_FLAG_MANUALE) as f}<option value={f}>{f}</option>{/each}
						</select>
					</label>
					<label>Prezzo pagato / offerta
						<input type="number" min="1" bind:value={prezzoInput} style="width:110px;display:block;" />
					</label>
					<label>Assegna a
						<select bind:value={proprietarioScelto} style="display:block;">
							{#each asta.squadreNomi as s}<option value={s}>{s}</option>{/each}
						</select>
					</label>
					<button class="primary" onclick={assegna}>Assegna →</button>
				</div>

				{#if val.profili.length}
					<div style="margin-top:14px;">
						<div class="muted" style="font-size:11px;margin-bottom:4px;">RIVALI PROBABILI SU QUESTO GIOCATORE</div>
						{#each val.profili.slice(0, 5) as p}
							<div style="display:flex;gap:8px;font-size:12px;padding:2px 0;align-items:baseline;">
								<span style="width:16px;text-align:right;" class="muted">{p.punteggio}</span>
								<strong>{p.squadra}</strong>
								<span class="tag">{p.interesse}</span>
								<span class="muted">{p.min}–{p.max} cr</span>
								<span class="muted" style="margin-left:auto;font-size:11px;">{p.motivo}</span>
							</div>
						{/each}
					</div>
				{/if}
			</div>
		{/if}
	</div>

	<!-- DESTRA: allarmi + squadre + rosa -->
	<div style="display:flex;flex-direction:column;gap:16px;">
		{#if asta.acquisti.length}
			{@const al = asta.allarmiChiusura}
			<div class="panel" style="border-color:{coloreLivello[al.livello]};">
				<div style="display:flex;gap:8px;align-items:baseline;">
					<h2 style="margin:0;font-size:15px;">Chiusura</h2>
					<span class="tag" style="color:{coloreLivello[al.livello]};">{al.livello}</span>
					<span class="muted" style="font-size:12px;margin-left:auto;">
						min {al.minimo_completamento} · prossimo max {al.massimo_prossimo} · margine {al.margine_libero}
					</span>
				</div>
				{#each al.avvisi as a}
					<div style="font-size:12px;color:{coloreLivello[a.livello]};padding:2px 0;">{a.testo}</div>
				{/each}
			</div>

			{@const cf = asta.chiusuraFinale}
			{#if cf.attivo}
				<div class="panel">
					<h2 style="margin:0 0 4px;font-size:15px;">Percorsi di chiusura</h2>
					<div class="muted" style="font-size:11px;margin-bottom:6px;">{cf.ipotesi}</div>
					{#each cf.percorsi as p}
						<div style="border-top:1px solid var(--border);padding:6px 0;">
							<div style="display:flex;gap:8px;font-size:12px;">
								<strong>{p.profilo}</strong>
								<span class="muted">costo {p.costo} · residuo {p.residuo} · media {p.punteggio_medio}</span>
							</div>
							<div class="muted" style="font-size:12px;">
								{p.giocatori.map((g) => `${g.ruolo} ${g.nome} (${g.prezzo})`).join(' · ')}
							</div>
						</div>
					{/each}
				</div>
			{:else if cf.stato === 'PRESTO'}
				<div class="muted" style="font-size:11px;padding:0 4px;">Chiusura rosa: {cf.motivo}</div>
			{/if}
		{/if}

		{#if asta.isMantra}
			{@const am = asta.analisiMiaRosaMantra}
			<div class="panel">
				<h2 style="margin:0 0 6px;font-size:15px;">Copertura Mantra</h2>
				<div style="font-size:13px;">
					Miglior modulo: <strong>{am.migliore.modulo}</strong> —
					<span style:color={am.migliore.completo ? 'var(--ok)' : 'var(--warn)'}>{am.migliore.coperti}/11</span>
					{#if am.portieri_mancanti}· <span style="color:var(--bad);">manca {am.portieri_mancanti} portiere</span>{/if}
				</div>
				{#if am.moduli_completi.length}
					<div class="muted" style="font-size:12px;">Moduli completi: {am.moduli_completi.join(', ')}</div>
				{/if}
				<div class="muted" style="font-size:11px;margin-top:4px;">
					target: {asta.moduliTargetValidi
						.map((m) => `${m} ${am.moduli.find((x) => x.modulo === m)?.coperti ?? 0}/11`)
						.join(' · ')}
				</div>
			</div>

			{#if asta.acquisti.some((a) => a.proprietario === asta.miaSquadra)}
				{@const fr = asta.fragilitaMiaRosaMantra}
				<div class="panel" style="border-color:{fr.livello === 'FRAGILE' ? 'var(--bad)' : fr.livello === 'ATTENZIONE' ? 'var(--warn)' : 'var(--border)'};">
					<div style="display:flex;gap:8px;align-items:baseline;">
						<h2 style="margin:0;font-size:15px;">Fragilità {fr.modulo}</h2>
						<span class="tag" style="color:{fr.livello === 'FRAGILE' ? 'var(--bad)' : fr.livello === 'ATTENZIONE' ? 'var(--warn)' : 'var(--ok)'};">{fr.livello}</span>
					</div>
					{#if fr.numero_critici === 0}
						<div class="muted" style="font-size:12px;">Nessun interprete insostituibile su questo modulo.</div>
					{:else}
						<div class="muted" style="font-size:11px;margin:2px 0;">Se esce, la copertura cala:</div>
						{#each fr.critici as c}
							<div style="font-size:12px;padding:1px 0;">
								<strong>{c.nome}</strong> <span class="muted">({c.ruoli})</span>
								→ {c.coperti_senza}/11 · scopre {c.mancanti_senza.join(', ')}
							</div>
						{/each}
					{/if}
				</div>
			{/if}
		{/if}

		<div class="panel">
			<div style="display:flex;justify-content:space-between;align-items:center;">
				<h2 style="margin:0;font-size:16px;">Squadre</h2>
				{#if asta.acquisti.length}
					<button onclick={() => asta.annullaUltimo()}>↩︎ Annulla ultimo</button>
				{/if}
			</div>
			<table style="width:100%;border-collapse:collapse;margin-top:8px;font-size:13px;">
				<thead><tr style="text-align:left;"><th>Squadra</th><th>Crediti</th><th>Rosa</th><th>P/D/C/A</th></tr></thead>
				<tbody>
					{#each asta.config.squadre as sq}
						{@const b = asta.bilanci[sq.nome]}
						<tr style="border-top:1px solid var(--border);{sq.isMia ? 'font-weight:600;' : ''}">
							<td>{sq.nome}{sq.isMia ? ' ★' : ''}</td>
							<td style:color={b.c_rimasti < 0 ? 'var(--bad)' : 'inherit'}>{b.c_rimasti}</td>
							<td>{b.g_presi}/{asta.config.limiti.TOT}</td>
							<td class="muted">{b.perRuolo.P}/{b.perRuolo.D}/{b.perRuolo.C}/{b.perRuolo.A}</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>

		<div class="panel">
			<h2 style="margin:0 0 8px;font-size:16px;">Rosa · {asta.miaSquadra}</h2>
			{#each RUOLI as r}
				{@const gr = asta.rosa(asta.miaSquadra).filter((a) => a.ruolo === r)}
				{#if gr.length}
					<div style="font-size:11px;margin-top:8px;font-family:var(--mono);letter-spacing:1px;color:var(--role-{r.toLowerCase()});">{r}</div>
					{#each gr as a}
						<div style="display:flex;gap:8px;font-size:13px;padding:3px 0;border-bottom:1px solid var(--border);align-items:baseline;">
							<span>{a.nome}</span>
							{#if asta.isMantra && a.player?.ruoloMantra}<span class="muted mono" style="font-size:11px;">{a.player.ruoloMantra}</span>{/if}
							<span class="muted">{a.squadraSerieA}</span>
							<span class="mono" style="margin-left:auto;color:var(--cyan);">{a.prezzo}</span>
							<button style="padding:0 6px;font-size:11px;" onclick={() => asta.rimuovi(a.giocatoreId)}>✕</button>
						</div>
					{/each}
				{/if}
			{/each}
			{#if !asta.rosa(asta.miaSquadra).length}<p class="muted">Ancora nessun acquisto.</p>{/if}
		</div>
	</div>
</div>
