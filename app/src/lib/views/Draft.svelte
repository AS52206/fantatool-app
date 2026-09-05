<script lang="ts">
	import { asta } from '$lib/stores/auction.svelte';
	import { normalizzaNome } from '$lib/engine/names';
	import { MOLTIPLICATORI_FLAG_MANUALE } from '$lib/engine/pricing';
	import { ORDINE_RUOLI_MANTRA, MODULI_MANTRA } from '$lib/engine/mantra';
	import { buildCampoClassic, buildCampoMantra, MODULI_CLASSIC, type GiocatoreCampo } from '$lib/campo';
	import { ricambiMantraDa, ricambiClassicDa } from '$lib/ricambi';
	import RoleTag from '$lib/ui/RoleTag.svelte';
	import Crest from '$lib/ui/Crest.svelte';
	import BudgetBar from '$lib/ui/BudgetBar.svelte';
	import FormationPitch from '$lib/ui/FormationPitch.svelte';
	import type { Giocatore, Ruolo } from '$lib/domain/types';

	const RUOLI: Ruolo[] = ['P', 'D', 'C', 'A'];
	const tokensRuoloMantra = (v: unknown) =>
		String(v ?? '')
			.split(/[;,/\s]+/)
			.map((x) => x.trim())
			.filter(Boolean);
	const coloreLivello: Record<string, string> = {
		OK: 'var(--ok)',
		ATTENZIONE: 'var(--warn)',
		CRITICO: 'var(--bad)'
	};

	let query = $state('');
	let ruoloFiltro = $state<string>('TUTTI');
	$effect(() => {
		void asta.isMantra;
		ruoloFiltro = 'TUTTI';
	});
	let selezionato = $state<Giocatore | null>(null);
	let flagScelto = $state('');
	let prezzoInput = $state(1);
	let proprietarioScelto = $state(asta.miaSquadra);
	let ricercaEl: HTMLInputElement;
	let listaEl: HTMLElement;
	let evidenziato = $state(0);

	const gById = $derived(new Map(asta.giocatori.map((g) => [g.id, g])));
	const presi = $derived(asta.giocatoreIdPresi);
	const risultati = $derived.by(() => {
		const q = normalizzaNome(query);
		let list = asta.giocatori.filter((g) => !presi.has(g.id));
		if (ruoloFiltro !== 'TUTTI') {
			list = asta.isMantra
				? list.filter((g) => tokensRuoloMantra(g.ruoloMantra).includes(ruoloFiltro))
				: list.filter((g) => g.ruolo === ruoloFiltro);
		}
		if (q) list = list.filter((g) => g.chiave.includes(q) || normalizzaNome(g.squadra).includes(q));
		return [...list].sort((a, b) => b.quotazione - a.quotazione).slice(0, 40);
	});
	$effect(() => {
		void risultati;
		evidenziato = 0;
	});
	$effect(() => {
		const el = listaEl?.querySelector(`[data-i="${evidenziato}"]`) as HTMLElement | null;
		el?.scrollIntoView({ block: 'nearest' });
	});

	// --- mini campo: come si sta riempiendo la mia rosa ---
	let moduloMio = $state('');
	const moduliDisponibiliMio = $derived(asta.isMantra ? Object.keys(MODULI_MANTRA) : MODULI_CLASSIC);
	$effect(() => {
		if (!moduliDisponibiliMio.includes(moduloMio))
			moduloMio = asta.isMantra ? (asta.moduliTargetValidi[0] ?? '3-4-1-2') : '4-3-3';
	});
	const campoInputMio = $derived(
		asta.rosa(asta.miaSquadra).map(
			(a): GiocatoreCampo => ({
				chiave: String(a.giocatoreId),
				nome: a.nome,
				club: a.squadraSerieA,
				ruolo: a.ruolo || 'C',
				ruoloMantra: a.player?.ruoloMantra,
				prezzo: a.prezzo,
				titolarita: a.player?.fc?.expectedTitolarita ?? null,
				pmaFl: a.player?.fantalab?.prezzo_atteso ?? null,
				stato: 'PRESO'
			})
		)
	);
	const campoMio = $derived(
		asta.isMantra ? buildCampoMantra(campoInputMio, moduloMio) : buildCampoClassic(campoInputMio, moduloMio)
	);
	/** Slot ancora scoperti nell'XI del modulo scelto. */
	const ruoliDaCoprireMio = $derived.by(() => {
		const m = new Map<string, { etichetta: string; linea: string; n: number }>();
		for (const linea of campoMio.linee)
			for (const s of linea.slot)
				if ((s.stato ?? 'VUOTO') === 'VUOTO') {
					const key = s.etichetta ?? s.ruolo ?? '?';
					const cur = m.get(key) ?? { etichetta: s.etichetta ?? key, linea: linea.nome, n: 0 };
					cur.n += 1;
					m.set(key, cur);
				}
		return [...m.values()];
	});
	const totalePianoMio = $derived(asta.rosa(asta.miaSquadra).length);
	const ricambiMio = $derived(
		asta.isMantra
			? ricambiMantraDa(campoInputMio.map((g) => g.ruoloMantra), asta.config.limiti.TOT, moduloMio)
			: ricambiClassicDa(campoInputMio.map((g) => g.ruolo), asta.config.limiti)
	);

	const ultimiAcquisti = $derived(
		[...asta.acquisti].sort((a, b) => b.ordine - a.ordine).slice(0, 8)
	);
	const consigliatoRapido = (g: Giocatore) =>
		g.fantalab?.prezzo_atteso || g.fc?.pma || g.quotazione || 1;

	function daTastiera(e: KeyboardEvent) {
		const t = e.target as HTMLElement | null;
		const tag = t?.tagName;
		const inCampo = tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA';
		const inRicerca = t === ricercaEl;

		if (e.key === '/' && !inCampo) {
			e.preventDefault();
			ricercaEl?.focus();
			return;
		}
		if ((inRicerca || !inCampo) && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
			if (!risultati.length) return;
			e.preventDefault();
			evidenziato =
				(evidenziato + (e.key === 'ArrowDown' ? 1 : -1) + risultati.length) % risultati.length;
			return;
		}
		if (e.key === 'Enter') {
			if (inRicerca) {
				e.preventDefault();
				const g = risultati[evidenziato];
				if (g) seleziona(g);
				ricercaEl?.blur();
				return;
			}
			if (!inCampo && selezionato) {
				e.preventDefault();
				assegna();
				return;
			}
		}
		if (e.key === 'Escape') {
			if (inRicerca) ricercaEl.blur();
			else if (selezionato) selezionato = null;
			return;
		}
		if (!inCampo && selezionato && (e.key === '+' || e.key === '=')) {
			e.preventDefault();
			prezzoInput = Math.max(1, prezzoInput + 1);
		}
		if (!inCampo && selezionato && (e.key === '-' || e.key === '_')) {
			e.preventDefault();
			prezzoInput = Math.max(1, prezzoInput - 1);
		}
		if (!inCampo && selezionato && (e.key === 'm' || e.key === 'M'))
			proprietarioScelto = asta.miaSquadra;
	}

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
	const coloreAzione = (a: string) =>
		a === 'COMPRA' ? 'var(--ok)' : a === 'VALUTA' ? 'var(--warn)' : 'var(--bad)';
</script>

<svelte:window onkeydown={daTastiera} />

<div style="display:grid;grid-template-columns:1.3fr 1fr;gap:16px;align-items:start;">
	<!-- SINISTRA: ricerca + consiglio -->
	<div style="display:flex;flex-direction:column;gap:16px;">
		<div class="panel">
			<div style="display:flex;gap:8px;margin-bottom:8px;">
				<input bind:this={ricercaEl} placeholder="Cerca giocatore o squadra…  ( / )" bind:value={query} style="flex:1;" />
				<select bind:value={ruoloFiltro}>
					<option value="TUTTI">Tutti</option>
					{#if asta.isMantra}
						{#each ORDINE_RUOLI_MANTRA as r}<option value={r}>{r}</option>{/each}
					{:else}
						{#each RUOLI as r}<option value={r}>{r}</option>{/each}
					{/if}
				</select>
			</div>
			<div class="muted" style="font-size:10px;margin-bottom:8px;letter-spacing:0.3px;">
				<kbd>/</kbd> cerca · <kbd>↑↓</kbd> scorri · <kbd>invio</kbd> seleziona / assegna · <kbd>+</kbd><kbd>−</kbd> prezzo · <kbd>m</kbd> a me · <kbd>esc</kbd> annulla scelta
			</div>
			<div bind:this={listaEl} style="max-height:280px;overflow:auto;">
				{#each risultati as g, i (g.id)}
					<div
						class="row-player {selezionato?.id === g.id || evidenziato === i ? 'sel' : ''}"
						data-i={i}
						role="button"
						tabindex="-1"
						onclick={() => seleziona(g)}
						onkeydown={(e) => e.key === 'Enter' && seleziona(g)}
					>
						<RoleTag ruolo={g.ruolo} ruoloMantra={g.ruoloMantra} />
						<Crest nome={g.squadra} size={16} />
						<strong>{g.nome}</strong>
						<span class="muted">{g.squadra}</span>
						<span style="margin-left:auto;" class="muted mono">
							Qt {g.quotazione}{#if g.fc?.pma}· PMA {g.fc.pma}{/if}{#if g.fantalab?.prezzo_atteso}· FL {g.fantalab.prezzo_atteso}{/if}{#if g.fc?.expectedTitolarita}· {Math.round(g.fc.expectedTitolarita)}%{/if}
						</span>
						<button
							class="coda-add"
							title={asta.inCoda(g.id) ? 'Togli dalla coda' : 'Aggiungi alla coda chiamate'}
							onclick={(e) => {
								e.stopPropagation();
								asta.inCoda(g.id) ? asta.rimuoviCoda(g.id) : asta.aggiungiCoda(g.id);
							}}
						>{asta.inCoda(g.id) ? '★' : '☆'}</button>
					</div>
				{:else}
					<p class="muted">Nessun risultato.</p>
				{/each}
			</div>
		</div>

		<div class="panel">
			<div style="display:flex;align-items:center;gap:8px;margin-bottom:10px;flex-wrap:wrap;">
				<h2 style="margin:0;font-size:15px;">Il mio campo</h2>
				<select bind:value={moduloMio} style="font-family:var(--mono);">
					{#each moduliDisponibiliMio as m}<option value={m}>{m}</option>{/each}
				</select>
				<span class="muted" style="font-size:11px;">
					{campoMio.linee.reduce((s, l) => s + l.slot.filter((x) => x.stato !== 'VUOTO').length, 0)}/11 coperti
				</span>
			</div>
			<div class="campo-wrap">
				<div style="flex:1 1 340px;min-width:0;">
					<FormationPitch linee={campoMio.linee} titolo={campoMio.modulo} />
					{#if campoMio.panchina.length}
						<div style="margin-top:8px;display:flex;flex-wrap:wrap;gap:6px;font-size:11px;">
							<span class="muted mono" style="align-self:center;">PANCHINA</span>
							{#each campoMio.panchina as p}
								<span class="tag" data-ruolo={asta.isMantra ? undefined : p.ruolo}>
									{asta.isMantra ? p.ruoloMantra || p.ruolo : p.ruolo} {p.nome}
								</span>
							{/each}
						</div>
					{/if}
				</div>
				<div class="campo-side">
					<div>
						<h3 style="margin:0 0 6px;font-size:13px;">Ruoli da coprire <span class="muted mono" style="font-size:11px;">· {moduloMio}</span></h3>
						{#if ruoliDaCoprireMio.length}
							<div style="display:flex;flex-direction:column;gap:5px;">
								{#each ruoliDaCoprireMio as r}
									<div style="display:flex;align-items:center;gap:6px;font-size:12px;background:var(--panel-3);border:1px solid var(--border);border-radius:var(--r-sm);padding:var(--pad-row) 10px;">
										<span class="tag" data-ruolo={asta.isMantra ? undefined : r.etichetta}>{r.etichetta}</span>
										{#if r.n > 1}<span class="mono" style="color:var(--cyan);">×{r.n}</span>{/if}
										<span class="muted" style="font-size:11px;">{r.linea}</span>
									</div>
								{/each}
							</div>
						{:else}
							<p class="muted" style="font-size:12px;margin:0;">XI completo per questo modulo. ✓</p>
						{/if}
					</div>
					<div>
						<h3 style="margin:0 0 2px;font-size:13px;">
							Ricambi consigliati
							<span class="mono" style="font-size:11px;color:{totalePianoMio >= asta.config.limiti.TOT ? 'var(--ok)' : 'var(--muted)'};">
								· {totalePianoMio}/{asta.config.limiti.TOT} in rosa
							</span>
						</h3>
						<p class="muted" style="font-size:10px;margin:0 0 6px;">
							{#if asta.isMantra}per il modulo {moduloMio} · un giocatore polivalente (es. Dd;E) conta in ogni ruolo che può coprire{:else}giocatori per reparto per la rosa completa{/if}
						</p>
						<div style="display:flex;flex-direction:column;gap:4px;">
							{#each ricambiMio as p}
								<div style="display:flex;align-items:center;gap:6px;font-size:12px;background:var(--panel-3);border:1px solid var(--border);border-radius:var(--r-sm);padding:var(--pad-row) 10px;{p.mancanti === 0 ? 'opacity:0.6;' : ''}">
									<span class="tag" data-ruolo={asta.isMantra ? undefined : p.chiave}>{asta.isMantra ? p.chiave : p.etichetta}</span>
									{#if asta.isMantra}<span class="muted" style="font-size:11px;">{p.etichetta}</span>{/if}
									<span class="mono" style="margin-left:auto;">
										<span style:color={p.presenti >= p.obiettivo ? 'var(--ok)' : 'var(--text)'}>{p.presenti}</span
										><span class="muted">/{p.obiettivo}</span>
									</span>
									{#if p.mancanti > 0}
										<span class="mono" style="color:var(--cyan);width:34px;text-align:right;">+{p.mancanti}</span>
									{:else}
										<span class="mono" style="color:var(--ok);width:34px;text-align:right;">✓</span>
									{/if}
								</div>
							{/each}
						</div>
					</div>
				</div>
			</div>
		</div>

		{#if selezionato && val}
			{@const sc = val.scarsita.livello === 'CRITICA' ? 'CRITICO' : val.scarsita.livello === 'ALTA' ? 'ATTENZIONE' : 'OK'}
			{@const span = Math.max(1, val.fascia.max - val.fascia.min)}
			{@const markerPct = Math.max(0, Math.min(100, (100 * (prezzoInput - val.fascia.min)) / span))}
			<div class="panel" style="border-color:color-mix(in srgb, {coloreAzione(val.decisione.azione)} 55%, var(--border));">
				<div style="display:flex;align-items:center;gap:10px;">
					<Crest nome={selezionato.squadra} size={26} />
					<h2 style="margin:0;font-size:19px;">{selezionato.nome}</h2>
					<RoleTag ruolo={selezionato.ruolo} ruoloMantra={selezionato.ruoloMantra} />
					<span class="muted">{selezionato.squadra}</span>
					<span class="mono muted" style="margin-left:auto;font-size:11px;">
						Qt {selezionato.quotazione}{#if selezionato.fc}· PMA {selezionato.fc.pma} · PFC {selezionato.fc.pfc} · Slot {selezionato.fc.slot ?? '—'} · tit {Math.round(selezionato.fc.expectedTitolarita)}%{/if}{#if selezionato.fantalab}· FL {selezionato.fantalab.prezzo_atteso} ({selezionato.fantalab.pma_pct}%){/if}
					</span>
				</div>

				<div style="display:flex;align-items:center;gap:22px;margin:14px 0 6px;flex-wrap:wrap;">
					<div style="min-width:140px;">
						<div class="muted" style="font-size:10px;letter-spacing:1.5px;">CONSIGLIATO · {val.fonte}</div>
						<div class="prezzo-hero">{val.fascia.riferimento}</div>
					</div>
					<div style="flex:1;min-width:200px;">
						<div style="position:relative;height:26px;">
							<div class="bar" style="height:6px;margin-top:10px;">
								<i style="width:100%;background:linear-gradient(90deg,var(--ok),var(--warn) 60%,var(--bad));opacity:0.45;"></i>
							</div>
							<div style="position:absolute;left:calc({markerPct}% - 1px);top:2px;width:2px;height:22px;background:var(--cyan);box-shadow:0 0 8px var(--cyan);"></div>
							<div style="position:absolute;left:calc({(100 * (val.fascia.riferimento - val.fascia.min)) / span}% - 3px);top:6px;width:6px;height:6px;border-radius:50%;background:var(--text-strong);border:2px solid var(--panel);"></div>
						</div>
						<div style="display:flex;justify-content:space-between;font-size:10px;" class="mono muted">
							<span>{val.fascia.min}</span><span>fascia · base {val.fascia.base}</span><span>{val.fascia.max}</span>
						</div>
					</div>
					<div style="display:flex;flex-direction:column;gap:4px;align-items:flex-start;">
						<span class="pill {pillClass(val.decisione.azione)}">{val.decisione.azione}</span>
						<span class="muted" style="font-size:11px;max-width:170px;">{val.decisione.motivo}</span>
					</div>
				</div>

				<div style="display:flex;gap:8px;flex-wrap:wrap;margin:10px 0;">
					<span class="chip"><b>{val.fase.etichetta}</b><span>fase</span></span>
					<span class="chip"><b style="color:{coloreLivello[sc]};">{val.scarsita.livello}</b><span>scarsità sl.{val.scarsita.slot ?? '–'}</span></span>
					{#if val.indiceInflazione !== null}
						<span class="chip"><b style:color={val.indiceInflazione > 3 ? 'var(--bad)' : val.indiceInflazione < -3 ? 'var(--ok)' : 'var(--text-strong)'}>{val.indiceInflazione > 0 ? '+' : ''}{val.indiceInflazione.toFixed(1)}%</b><span>inflazione</span></span>
					{/if}
					<span class="chip"><b class="mono">{val.poteri.strategico}</b><span>tuo potere</span></span>
					<span class="chip"><b class="mono">{val.fallback.prezzo}</b><span>fallback</span></span>
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
					<button
						title={asta.inCoda(selezionato.id) ? 'Togli dalla coda' : 'Aggiungi alla coda chiamate'}
						onclick={() => (asta.inCoda(selezionato!.id) ? asta.rimuoviCoda(selezionato!.id) : asta.aggiungiCoda(selezionato!.id))}
					>{asta.inCoda(selezionato.id) ? '★ in coda' : '☆ coda'}</button>
				</div>

				{#if val.profili.length}
					<div style="margin-top:14px;">
						<div class="muted" style="font-size:11px;margin-bottom:4px;">RIVALI PROBABILI SU QUESTO GIOCATORE</div>
						{#each val.profili.slice(0, 5) as p}
							<div style="display:flex;gap:8px;font-size:12px;padding:2px 0 2px 6px;align-items:center;border-left:2px solid {asta.coloreDi(p.squadra)};">
								<span style="width:16px;text-align:right;" class="muted">{p.punteggio}</span>
								<Crest nome={asta.stemmaDi(p.squadra)} tipo="stemmi" size={16} />
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
		{#if asta.coda.length}
			<div class="panel" style="border-color:color-mix(in srgb, var(--accent) 35%, var(--border));">
				<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px;">
					<h2 style="margin:0;font-size:15px;">★ Coda chiamate <span class="muted mono" style="font-size:12px;">({asta.coda.length})</span></h2>
					<button style="font-size:11px;" onclick={() => asta.svuotaCoda()}>Svuota</button>
				</div>
				{#each asta.coda as g (g.id)}
					<div class="row-player" style="cursor:pointer;" role="button" tabindex="-1"
						onclick={() => seleziona(g)} onkeydown={(e) => e.key === 'Enter' && seleziona(g)}>
						<RoleTag ruolo={g.ruolo} ruoloMantra={g.ruoloMantra} />
						<Crest nome={g.squadra} size={15} />
						<strong>{g.nome}</strong>
						<span class="muted" style="font-size:11px;">{g.squadra}</span>
						<span class="muted mono" style="margin-left:auto;font-size:11px;">~{Math.round(consigliatoRapido(g))}</span>
						<button class="coda-add" title="Togli dalla coda" onclick={(e) => { e.stopPropagation(); asta.rimuoviCoda(g.id); }}>✕</button>
					</div>
				{/each}
			</div>
		{/if}

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
			<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">
				<h2 style="margin:0;font-size:16px;">Squadre</h2>
				<div style="display:flex;gap:6px;">
					<button disabled={!asta.puoiAnnullare} title="Annulla (Cmd+Z)" onclick={() => asta.annulla()}>↩︎ Annulla</button>
					<button disabled={!asta.puoiRipetere} title="Ripeti (Cmd+Shift+Z)" onclick={() => asta.ripeti()}>↪︎ Ripeti</button>
				</div>
			</div>
			{#each asta.config.squadre as sq}
				{@const b = asta.bilanci[sq.nome]}
				<div style="padding:7px 0 7px 8px;border-top:1px solid var(--border);border-left:3px solid {asta.coloreDi(sq.nome)};margin-left:-8px;">
					<div style="display:flex;align-items:center;gap:7px;font-size:13px;">
						<span style="width:8px;height:8px;border-radius:2px;background:{asta.coloreDi(sq.nome)};flex:0 0 auto;"></span>
						<Crest nome={sq.stemma || sq.nome} tipo="stemmi" size={18} />
						<span style={sq.isMia ? 'font-weight:700;color:var(--text-strong);' : ''}>{sq.nome}</span>
						{#if sq.isMia}<span style="color:var(--accent);">★</span>{/if}
						<span class="mono muted" style="margin-left:auto;font-size:11px;">
							{b.g_presi}/{asta.config.limiti.TOT} · <span style:color={b.c_rimasti < 0 ? 'var(--bad)' : 'var(--cyan)'}>{b.c_rimasti} cr</span>
						</span>
					</div>
					<div style="margin-top:5px;"><BudgetBar squadra={sq.nome} /></div>
				</div>
			{/each}
		</div>

		{#if ultimiAcquisti.length}
			<div class="panel">
				<h2 style="margin:0 0 6px;font-size:15px;">Ultimi acquisti</h2>
				{#each ultimiAcquisti as a (a.ordine)}
					{@const pma = gById.get(a.giocatoreId)?.fc?.pma ?? null}
					{@const delta = pma != null ? a.prezzo - pma : null}
					<div style="display:flex;gap:7px;align-items:center;font-size:12px;padding:2px 0;border-top:1px solid var(--border);">
						<RoleTag ruolo={a.ruolo || 'C'} />
						<Crest nome={a.squadraSerieA} size={14} />
						<span>{a.nome}</span>
						<span style="color:{asta.coloreDi(a.proprietario)};">→ {a.proprietario}</span>
						<span class="mono" style="margin-left:auto;color:var(--cyan);">{a.prezzo}</span>
						{#if delta != null}
							<span class="mono" style="width:44px;text-align:right;color:{delta > 1 ? 'var(--bad)' : delta < -1 ? 'var(--ok)' : 'var(--muted)'};">
								{delta > 0 ? '+' : ''}{Math.round(delta)}
							</span>
						{:else}
							<span class="mono muted" style="width:44px;text-align:right;">—</span>
						{/if}
					</div>
				{/each}
				<div class="muted" style="font-size:10px;margin-top:4px;">scarto vs PMA</div>
			</div>
		{/if}

		<div class="panel">
			<h2 style="margin:0 0 8px;font-size:16px;">Rosa · {asta.miaSquadra}</h2>
			{#each RUOLI as r}
				{@const gr = asta.rosa(asta.miaSquadra).filter((a) => a.ruolo === r)}
				{#if gr.length}
					<div style="font-size:11px;margin-top:8px;font-family:var(--mono);letter-spacing:1px;color:var(--role-{r.toLowerCase()});">{r}</div>
					{#each gr as a}
						<div style="display:flex;gap:8px;font-size:13px;padding:3px 0;border-bottom:1px solid var(--border);align-items:center;">
							<Crest nome={a.squadraSerieA} size={15} />
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

<style>
	kbd {
		font: 600 10px/1 var(--mono);
		background: var(--tag-bg);
		border: 1px solid var(--border-strong);
		border-radius: 4px;
		padding: 1px 4px;
		color: var(--muted);
	}
	.coda-add {
		padding: 0 6px;
		font-size: 13px;
		line-height: 1;
		background: transparent;
		border-color: transparent;
		color: var(--muted);
	}
	.coda-add:hover {
		color: var(--accent);
		border-color: transparent;
		background: transparent;
	}
	.row-player {
		cursor: pointer;
	}
</style>
