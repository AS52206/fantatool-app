<script lang="ts">
	import { onMount } from 'svelte';
	import { asta } from '$lib/stores/auction.svelte';
	import { caricaBundle } from '$lib/data/load';
	import { normalizzaNome } from '$lib/engine/names';
	import { MOLTIPLICATORI_FLAG_MANUALE } from '$lib/engine/pricing';
	import { MODULI_MANTRA } from '$lib/engine/mantra';
	import type { Giocatore, Ruolo } from '$lib/domain/types';

	const MODULI = Object.keys(MODULI_MANTRA);

	let statoDati = $state<'carico' | 'ok' | 'errore'>('carico');
	let erroreDati = $state('');
	let metaTxt = $state('');

	let query = $state('');
	let ruoloFiltro = $state<Ruolo | 'TUTTI'>('TUTTI');
	let selezionato = $state<Giocatore | null>(null);
	let flagScelto = $state<string>('');
	let prezzoInput = $state<number>(1);
	let proprietarioScelto = $state('');
	let mostraSetup = $state(false);
	let fileInput: HTMLInputElement;

	const RUOLI: Ruolo[] = ['P', 'D', 'C', 'A'];

	let bundleCaricato = $state('');

	async function caricaDati(stagione: string, modalita: string, partecipanti: number) {
		const chiave = `${stagione}/${modalita}/${partecipanti}`;
		if (chiave === bundleCaricato) return;
		statoDati = 'carico';
		try {
			const b = await caricaBundle(stagione, modalita, partecipanti);
			asta.setGiocatori(b.players);
			bundleCon = b.meta.con_fantacrediti;
			bundleTot = b.meta.totale_giocatori;
			metaTxt = `${b.meta.totale_giocatori} giocatori · ${b.meta.con_fantacrediti} con Fantacrediti · ${b.meta.modalita} · listone ${b.meta.sorgenti.listone?.impronta ?? '?'}`;
			bundleCaricato = chiave;
			statoDati = 'ok';
			selezionato = null;
			proprietarioScelto = asta.miaSquadra;
		} catch (e) {
			// Bundle assente (es. taglio non 8/10 da un salvataggio vecchio): ripiega su 8.
			if (partecipanti !== 8) {
				asta.config.partecipanti = 8;
				return;
			}
			erroreDati = e instanceof Error ? e.message : String(e);
			statoDati = 'errore';
		}
	}

	onMount(() => {
		mostraSetup = !asta.avviata;
	});

	// Ricarica il bundle quando cambiano modalità / partecipanti / stagione.
	$effect(() => {
		caricaDati(asta.config.stagione, asta.config.modalita, asta.config.partecipanti);
	});

	function impostaModalita(m: string) {
		asta.config.modalita = m;
		asta.config.limiti =
			m === 'mantra'
				? { P: 3, D: 8, C: 8, A: 6, TOT: 25 }
				: { P: 3, D: 8, C: 8, A: 6, TOT: 25 };
	}

	function toggleModulo(mod: string) {
		const s = new Set(asta.config.moduliTarget);
		if (s.has(mod)) s.delete(mod);
		else s.add(mod);
		asta.config.moduliTarget = [...s];
	}

	const presi = $derived(asta.giocatoreIdPresi);

	const risultati = $derived.by(() => {
		const q = normalizzaNome(query);
		let list = asta.giocatori.filter((g) => !presi.has(g.id));
		if (ruoloFiltro !== 'TUTTI') list = list.filter((g) => g.ruolo === ruoloFiltro);
		if (q) list = list.filter((g) => g.chiave.includes(q) || normalizzaNome(g.squadra).includes(q));
		list = [...list].sort((a, b) => b.quotazione - a.quotazione);
		return list.slice(0, 40);
	});

	const val = $derived.by(() => {
		if (!selezionato) return null;
		return asta.valutazione(selezionato, {
			flagOverride: flagScelto || undefined,
			prezzoLive: prezzoInput
		});
	});

	let ultimoSelId = $state(-1);
	$effect(() => {
		if (selezionato && val && selezionato.id !== ultimoSelId) {
			ultimoSelId = selezionato.id;
			flagScelto = flagScelto || val.flag;
			prezzoInput = val.fascia.riferimento;
		}
	});

	const coloreLivello: Record<string, string> = {
		OK: 'var(--ok)',
		ATTENZIONE: 'var(--warn)',
		CRITICO: 'var(--bad)'
	};

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

	function scarica(contenuto: string, nome: string, tipo: string) {
		const blob = new Blob([contenuto], { type: tipo });
		const a = document.createElement('a');
		a.href = URL.createObjectURL(blob);
		a.download = nome;
		a.click();
		URL.revokeObjectURL(a.href);
	}

	function esporta() {
		scarica(
			asta.esporta(),
			`asta-${new Date().toISOString().slice(0, 16).replace(':', '')}.json`,
			'application/json'
		);
	}

	function esportaCsv() {
		scarica(asta.esportaCsv(), `rose-${new Date().toISOString().slice(0, 10)}.csv`, 'text/csv');
	}

	let esportandoXlsx = $state(false);
	async function esportaXlsx() {
		esportandoXlsx = true;
		try {
			const blob = await asta.esportaXlsx();
			const a = document.createElement('a');
			a.href = URL.createObjectURL(blob);
			a.download = `tabellone-${new Date().toISOString().slice(0, 10)}.xlsx`;
			a.click();
			URL.revokeObjectURL(a.href);
		} catch (e) {
			alert('Export Excel fallito: ' + (e instanceof Error ? e.message : e));
		} finally {
			esportandoXlsx = false;
		}
	}

	async function importaFile(ev: Event) {
		const f = (ev.target as HTMLInputElement).files?.[0];
		if (!f) return;
		try {
			asta.importa(await f.text());
			mostraSetup = false;
		} catch (e) {
			alert('Import fallito: ' + (e instanceof Error ? e.message : e));
		}
	}

	function impostaNumeroSquadre(n: number) {
		n = Math.max(2, Math.min(20, n || 2));
		const nuove = [...asta.config.squadre];
		while (nuove.length < n) nuove.push({ nome: `Squadra ${nuove.length + 1}`, isMia: false });
		nuove.length = n;
		if (!nuove.some((s) => s.isMia) && nuove[0]) nuove[0].isMia = true;
		asta.config.squadre = nuove;
	}

	// I dati Fantacrediti (PMA/PFC/slot/titolarità) esistono solo per i tagli 8 e 10.
	let bundleCon = $state<number>(0);
	let bundleTot = $state<number>(0);
	function impostaTaglioDati(n: number) {
		asta.config.partecipanti = n;
	}

	function ora(ts: number | null) {
		return ts ? new Date(ts).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : '—';
	}
</script>

<div style="max-width:1200px;margin:0 auto;padding:16px;">
	<header style="display:flex;align-items:center;gap:12px;flex-wrap:wrap;margin-bottom:16px;border-bottom:1px solid var(--border);padding-bottom:12px;">
		<h1 style="margin:0;font-size:19px;text-transform:uppercase;letter-spacing:1.5px;">
			<span style="color:var(--accent);">▮</span> Fantatool
			<span class="muted" style="font-weight:400;">/ asta</span>
		</h1>
		<span class="muted mono" style="font-size:11px;">{metaTxt}</span>
		<div style="margin-left:auto;display:flex;gap:8px;align-items:center;">
			<span class="tag" title="Salvataggio automatico locale">💾 {ora(asta.ultimoSalvataggio)}</span>
			<button onclick={() => (mostraSetup = !mostraSetup)}>⚙️ Setup</button>
			<button onclick={esporta}>⬇︎ Backup</button>
			{#if asta.acquisti.length}
				<button onclick={esportaCsv}>⬇︎ CSV</button>
				<button onclick={esportaXlsx} disabled={esportandoXlsx}>
					{esportandoXlsx ? '…' : '⬇︎ Tabellone Excel'}
				</button>
			{/if}
			<button onclick={() => fileInput.click()}>⬆︎ Ripristina</button>
			<input bind:this={fileInput} type="file" accept=".json" style="display:none" onchange={importaFile} />
		</div>
	</header>

	{#if statoDati === 'carico'}
		<div class="panel">Carico i dati…</div>
	{:else if statoDati === 'errore'}
		<div class="panel" style="border-color:var(--bad);">
			<strong>Dati non disponibili.</strong>
			<p class="muted">{erroreDati}</p>
			<p>Genera il bundle dalla cartella del progetto:</p>
			<pre style="background:var(--bg);padding:8px;border-radius:6px;overflow:auto;">python3 tools/export_json.py --stagione {asta.config.stagione} --modalita {asta.config.modalita} --partecipanti {asta.config.partecipanti}</pre>
		</div>
	{:else}
		{#if bundleTot > 0 && bundleCon / bundleTot < 0.6}
			<div class="panel" style="border-color:var(--warn);margin-bottom:16px;">
				<strong style="color:var(--warn);">Dati Fantacrediti parziali</strong> —
				solo {bundleCon}/{bundleTot} giocatori hanno PMA/PFC/slot per il taglio
				<strong>{asta.config.partecipanti} partecipanti</strong>{asta.isMantra ? ' in modalità Mantra' : ''}.
				<div class="muted" style="font-size:12px;margin-top:4px;">
					Per gli altri il prezzo consigliato usa solo quotazione + Fantalab.
					{#if asta.config.partecipanti === 10}Prova il taglio <strong>8</strong> (più completo){/if}
					{#if asta.isMantra && bundleCon === 0}— manca <code>data/2026-2027/mantra/fantacrediti/{asta.config.partecipanti}-partecipanti.xlsx</code>{/if}
				</div>
			</div>
		{/if}
		{#if mostraSetup}
			<div class="panel" style="margin-bottom:16px;">
				<h2 style="margin-top:0;font-size:16px;">Setup asta</h2>
				<div style="display:flex;gap:24px;flex-wrap:wrap;align-items:flex-start;">
					<label>Modalità
						<select value={asta.config.modalita}
							onchange={(e) => impostaModalita((e.target as HTMLSelectElement).value)}
							style="display:block;">
							<option value="classic">Classic</option>
							<option value="mantra">Mantra</option>
						</select>
					</label>
					<label>Budget per squadra
						<input type="number" min="1" bind:value={asta.config.budgetMax} style="width:90px;display:block;" />
					</label>
					<label>Numero squadre
						<input type="number" min="2" max="20" value={asta.config.squadre.length}
							onchange={(e) => impostaNumeroSquadre(+(e.target as HTMLInputElement).value)}
							style="width:90px;display:block;" />
					</label>
					<label>Taglio dati (PMA/slot)
						<select value={asta.config.partecipanti}
							onchange={(e) => impostaTaglioDati(+(e.target as HTMLSelectElement).value)}
							style="display:block;">
							<option value={8}>8 partecipanti</option>
							<option value={10}>10 partecipanti</option>
						</select>
					</label>
					{#each RUOLI as r}
						<label>Slot {r}
							<input type="number" min="0" bind:value={asta.config.limiti[r]} style="width:70px;display:block;" />
						</label>
					{/each}
				</div>
				{#if asta.isMantra}
					<h3 style="font-size:14px;margin-bottom:4px;">Moduli target Mantra</h3>
					<div style="display:flex;gap:6px;flex-wrap:wrap;">
						{#each MODULI as mod}
							<button
								onclick={() => toggleModulo(mod)}
								style="padding:3px 8px;font-size:12px;{asta.config.moduliTarget.includes(mod)
									? 'border-color:var(--accent);background:var(--accent);color:#fff;'
									: ''}">{mod}</button>
						{/each}
					</div>
				{/if}
				<h3 style="font-size:14px;">Squadre</h3>
				<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:8px;">
					{#each asta.config.squadre as sq, i}
						<div style="display:flex;gap:6px;align-items:center;">
							<input bind:value={asta.config.squadre[i].nome} style="flex:1;" />
							<label class="muted" style="font-size:12px;white-space:nowrap;">
								<input type="radio" name="mia" checked={sq.isMia}
									onchange={() => asta.config.squadre.forEach((s, j) => (s.isMia = j === i))} /> mia
							</label>
						</div>
					{/each}
				</div>
				<div style="margin-top:12px;display:flex;gap:8px;">
					<button class="primary" onclick={() => (mostraSetup = false)}>Inizia l'asta</button>
					{#if asta.acquisti.length}
						<button onclick={() => { if (confirm('Cancellare tutti gli acquisti?')) asta.reset(); }}
							style="color:var(--bad);">Azzera asta</button>
					{/if}
				</div>
			</div>
		{/if}

		<div style="display:grid;grid-template-columns:1.3fr 1fr;gap:16px;align-items:start;">
			<!-- COLONNA SINISTRA: ricerca + consiglio -->
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
							<button
								class="row-player {selezionato?.id === g.id ? 'sel' : ''}"
								onclick={() => seleziona(g)}>
								<span class="tag" data-ruolo={g.ruolo}>{g.ruolo}</span>
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
							<span class="tag" data-ruolo={selezionato.ruolo}>{selezionato.ruolo}</span>
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
								<span class="pill pill--{val.decisione.azione === 'COMPRA' ? 'buy' : val.decisione.azione === 'VALUTA' ? 'consider' : 'stop'}">{val.decisione.azione}</span>
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
								<strong>Mantra</strong> · ruoli {selezionato.ruoloMantra || '—'} ·
								Δ copertura moduli target: <span style:color={val.mantra.delta_copertura > 0 ? 'var(--ok)' : 'var(--muted)'}>{val.mantra.delta_copertura > 0 ? '+' : ''}{val.mantra.delta_copertura}</span>
								{#if val.mantra.nuovi_moduli_completi.length}
									· completa: {val.mantra.nuovi_moduli_completi.join(', ')}
								{/if}
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

			<!-- COLONNA DESTRA: allarmi + squadre + ultimi acquisti -->
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
							target: {asta.moduliTargetValidi.map((m) => {
								const v = am.moduli.find((x) => x.modulo === m);
								return `${m} ${v ? v.coperti : 0}/11`;
							}).join(' · ')}
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
						<thead><tr class="muted" style="text-align:left;">
							<th>Squadra</th><th>Crediti</th><th>Rosa</th><th>P/D/C/A</th>
						</tr></thead>
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
								<div style="display:flex;gap:8px;font-size:13px;padding:3px 0;border-bottom:1px solid var(--border);">
									<span>{a.nome}</span>
									<span class="muted">{a.squadraSerieA}</span>
									<span class="mono" style="margin-left:auto;color:var(--cyan);">{a.prezzo}</span>
									<button style="padding:0 6px;font-size:11px;" onclick={() => asta.rimuovi(a.giocatoreId)}>✕</button>
								</div>
							{/each}
						{/if}
					{/each}
					{#if !asta.rosa(asta.miaSquadra).length}<p class="muted">Ancora nessun acquisto.</p>{/if}
				</div>

				{#if asta.acquisti.length}
					<div class="panel">
						<h2 style="margin:0 0 8px;font-size:16px;">Ultimi acquisti</h2>
						{#each [...asta.acquisti].sort((a, b) => b.ordine - a.ordine).slice(0, 8) as a}
							<div style="display:flex;gap:8px;font-size:13px;padding:2px 0;">
								<span class="tag" data-ruolo={a.ruolo}>{a.ruolo}</span>
								<span>{a.nome}</span>
								<span class="muted">→ {a.proprietario}</span>
								<span style="margin-left:auto;">{a.prezzo}</span>
							</div>
						{/each}
					</div>
				{/if}
			</div>
		</div>
	{/if}
</div>
