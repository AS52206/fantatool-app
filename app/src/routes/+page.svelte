<script lang="ts">
	import { onMount } from 'svelte';
	import { asta } from '$lib/stores/auction.svelte';
	import { caricaBundle } from '$lib/data/load';
	import { stemmiDisponibili } from '$lib/assets';
	import { ui } from '$lib/ui.svelte';
	import { importaRoseDaFile, type RisultatoImport } from '$lib/data/importRose';
	import { MODULI_MANTRA } from '$lib/engine/mantra';
	import Crest from '$lib/ui/Crest.svelte';
	import Logo from '$lib/ui/Logo.svelte';
	import type { Ruolo } from '$lib/domain/types';
	import Draft from '$lib/views/Draft.svelte';
	import Rose from '$lib/views/Rose.svelte';
	import Liberi from '$lib/views/Liberi.svelte';
	import SerieA from '$lib/views/SerieA.svelte';
	import Confronto from '$lib/views/Confronto.svelte';
	import Scenari from '$lib/views/Scenari.svelte';

	const MODULI = Object.keys(MODULI_MANTRA);
	const RUOLI: Ruolo[] = ['P', 'D', 'C', 'A'];

	const TABS = [
		{ id: 'draft', label: '📢 Draft', view: Draft },
		{ id: 'scenari', label: '🧪 Scenari', view: Scenari },
		{ id: 'confronto', label: '🕸️ Confronto', view: Confronto },
		{ id: 'rose', label: '📊 Rose', view: Rose },
		{ id: 'liberi', label: '🔍 Liberi', view: Liberi },
		{ id: 'seriea', label: '👕 Serie A', view: SerieA }
	];
	let tab = $state('draft');
	const ViewCorrente = $derived(TABS.find((t) => t.id === tab)?.view ?? Draft);

	let statoDati = $state<'carico' | 'ok' | 'errore'>('carico');
	let erroreDati = $state('');
	let metaTxt = $state('');
	let bundleCon = $state(0);
	let bundleTot = $state(0);
	let mostraSetup = $state(false);
	let fileInput: HTMLInputElement;
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
		} catch (e) {
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
	const stemmi = stemmiDisponibili();
	$effect(() => {
		caricaDati(asta.config.stagione, asta.config.modalita, asta.config.partecipanti);
	});

	function impostaModalita(m: string) {
		asta.cambiaModalita(m);
	}
	function toggleModulo(mod: string) {
		const s = new Set(asta.config.moduliTarget);
		s.has(mod) ? s.delete(mod) : s.add(mod);
		asta.config.moduliTarget = [...s];
	}
	function impostaNumeroSquadre(n: number) {
		n = Math.max(2, Math.min(20, n || 2));
		const nuove = [...asta.config.squadre];
		while (nuove.length < n) nuove.push({ nome: `Squadra ${nuove.length + 1}`, isMia: false });
		nuove.length = n;
		if (!nuove.some((s) => s.isMia) && nuove[0]) nuove[0].isMia = true;
		asta.config.squadre = nuove;
	}

	function scarica(contenuto: string | Blob, nome: string, tipo?: string) {
		const blob = contenuto instanceof Blob ? contenuto : new Blob([contenuto], { type: tipo });
		const a = document.createElement('a');
		a.href = URL.createObjectURL(blob);
		a.download = nome;
		a.click();
		URL.revokeObjectURL(a.href);
	}
	const oggi = () => new Date().toISOString().slice(0, 10);
	let esportandoXlsx = $state(false);
	async function esportaXlsx() {
		esportandoXlsx = true;
		try {
			scarica(await asta.esportaXlsx(), `tabellone-${oggi()}.xlsx`);
		} catch (e) {
			alert('Export Excel fallito: ' + (e instanceof Error ? e.message : e));
		} finally {
			esportandoXlsx = false;
		}
	}
	async function importaFile(ev: Event) {
		const f = (ev.target as HTMLInputElement).files?.[0];
		if (!f) return;
		(ev.target as HTMLInputElement).value = '';
		try {
			asta.importa(await f.text());
			mostraSetup = false;
		} catch (e) {
			alert('Ripristino fallito: ' + (e instanceof Error ? e.message : e));
		}
	}

	// --- Importa rose da file esterno (backup app precedente, CSV, Excel) ---
	let roseInput: HTMLInputElement;
	let anteprima = $state<RisultatoImport | null>(null);
	let importando = $state(false);
	async function scegliRoseFile(ev: Event) {
		const f = (ev.target as HTMLInputElement).files?.[0];
		(ev.target as HTMLInputElement).value = '';
		if (!f) return;
		importando = true;
		try {
			anteprima = await importaRoseDaFile(f, asta.giocatori);
		} catch (e) {
			alert('Import rose fallito: ' + (e instanceof Error ? e.message : e));
		} finally {
			importando = false;
		}
	}
	function confermaImportRose() {
		if (!anteprima) return;
		asta.applicaImportRose(anteprima.squadre, anteprima.acquisti);
		anteprima = null;
		mostraSetup = false;
		tab = 'rose';
	}
	function ora(ts: number | null) {
		return ts
			? new Date(ts).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
			: '—';
	}

	let mostraSnapshot = $state(false);
	function scorciatoieGlobali(e: KeyboardEvent) {
		const tag = (e.target as HTMLElement | null)?.tagName;
		if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
		if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z') {
			e.preventDefault();
			e.shiftKey ? asta.ripeti() : asta.annulla();
		}
	}
</script>

<svelte:window onkeydown={scorciatoieGlobali} />

<div style="max-width:1280px;margin:0 auto;padding:var(--pad);">
	<header class="appbar">
		<h1 class="brand">
			<span class="mark"><Logo size={30} /></span> Fantatool <span class="sub">/ asta</span>
		</h1>
		<span class="muted mono" style="font-size:11px;">{metaTxt}</span>
		<div style="margin-left:auto;display:flex;gap:8px;align-items:center;flex-wrap:wrap;">
			<span class="tag" title="Salvataggio automatico locale">💾 {ora(asta.ultimoSalvataggio)}</span>
			<button class="icon-btn" onclick={() => ui.toggleTema()} title="Tema chiaro / scuro">{ui.tema === 'scuro' ? '☀︎' : '☾'}</button>
			<button class="icon-btn" onclick={() => ui.toggleDensita()} title="Densità comoda / compatta">{ui.densita === 'comoda' ? '▤' : '▦'}</button>
			<button onclick={() => (mostraSetup = !mostraSetup)}>⚙️ Setup</button>
			<button onclick={() => scarica(asta.esporta(), `asta-${oggi()}.json`, 'application/json')}>⬇︎ Backup</button>
			{#if asta.acquisti.length}
				<button onclick={() => (mostraSnapshot = !mostraSnapshot)} title="Ripristina da uno snapshot automatico">🕑 Snapshot</button>
				<button onclick={() => scarica(asta.esportaCsv(), `rose-${oggi()}.csv`, 'text/csv')}>⬇︎ CSV</button>
				<button onclick={esportaXlsx} disabled={esportandoXlsx}>{esportandoXlsx ? '…' : '⬇︎ Excel'}</button>
			{/if}
			<button onclick={() => roseInput.click()} disabled={importando} title="Carica una rosa già fatta (backup app precedente, CSV o Excel)">
				{importando ? '…' : '📥 Importa asta'}
			</button>
			<button onclick={() => fileInput.click()}>⬆︎ Ripristina</button>
			<input bind:this={fileInput} type="file" accept=".json" style="display:none" onchange={importaFile} />
			<input bind:this={roseInput} type="file" accept=".json,.csv,.tsv,.txt,.xlsx,.xls" style="display:none" onchange={scegliRoseFile} />
		</div>
	</header>

	{#if mostraSnapshot}
		{@const backup = asta.elencoBackup}
		<div class="panel" style="margin-bottom:12px;">
			<div style="display:flex;justify-content:space-between;align-items:center;">
				<h2 style="margin:0;font-size:15px;">Snapshot automatici — {asta.config.modalita.toUpperCase()}</h2>
				<button style="font-size:11px;" onclick={() => (mostraSnapshot = false)}>Chiudi</button>
			</div>
			<p class="muted" style="font-size:11px;margin:4px 0 8px;">
				Copie salvate in automatico a ogni acquisto/rimozione (ultime {backup.length}). Ripristinare è annullabile con Annulla.
			</p>
			{#if !backup.length}
				<p class="muted" style="font-size:12px;">Ancora nessuno snapshot.</p>
			{:else}
				<div style="display:flex;flex-wrap:wrap;gap:6px;">
					{#each [...backup].reverse() as b}
						<button style="font-size:11px;" onclick={() => { asta.ripristinaDaBackup(b.t); mostraSnapshot = false; }}>
							{new Date(b.t).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit', second: '2-digit' })} · {b.n} giocatori
						</button>
					{/each}
				</div>
			{/if}
		</div>
	{/if}

	{#if anteprima}
		{@const p = anteprima}
		<div class="panel" style="border-color:var(--accent);margin-bottom:12px;">
			<h2 style="margin-top:0;font-size:16px;">Importa asta — {asta.config.modalita.toUpperCase()}</h2>
			<p class="muted" style="font-size:12px;margin:4px 0;">Fonte: {p.fonte}</p>
			<div style="display:flex;gap:20px;flex-wrap:wrap;font-size:13px;margin:8px 0;">
				<span><strong style="color:var(--ok);">{p.acquisti.length}</strong> giocatori riconosciuti</span>
				<span><strong>{p.squadre.length}</strong> squadre</span>
				{#if p.nonTrovati.length}<span style="color:var(--warn);"><strong>{p.nonTrovati.length}</strong> non riconosciuti</span>{/if}
			</div>
			<table style="width:100%;border-collapse:collapse;font-size:12px;max-width:520px;">
				<thead><tr style="text-align:left;"><th>Squadra</th><th>Giocatori</th><th>Crediti spesi</th></tr></thead>
				<tbody>
					{#each p.squadre as s}
						<tr style="border-top:1px solid var(--border);">
							<td>{s}</td>
							<td class="mono">{p.acquisti.filter((a) => a.proprietario === s).length}</td>
							<td class="mono" style="color:var(--cyan);">{p.speso[s] ?? 0}</td>
						</tr>
					{/each}
				</tbody>
			</table>
			{#if p.nonTrovati.length}
				<details style="margin-top:8px;font-size:12px;">
					<summary class="muted" style="cursor:pointer;">Non riconosciuti ({p.nonTrovati.length}) — resteranno fuori</summary>
					<div class="muted" style="max-height:120px;overflow:auto;margin-top:4px;">
						{#each p.nonTrovati as n}<div>{n}</div>{/each}
					</div>
				</details>
			{/if}
			<div style="margin-top:12px;display:flex;gap:8px;">
				<button class="primary" onclick={confermaImportRose} disabled={!p.acquisti.length}>
					Importa in {asta.config.modalita.toUpperCase()} e apri le Rose
				</button>
				<button onclick={() => (anteprima = null)}>Annulla</button>
			</div>
			<p class="muted" style="font-size:11px;margin-top:6px;">
				Sostituisce l'asta {asta.config.modalita.toUpperCase()} corrente. L'altra modalità non viene toccata.
			</p>
		</div>
	{/if}

	{#if statoDati === 'carico'}
		<div class="panel">Carico i dati…</div>
	{:else if statoDati === 'errore'}
		<div class="panel" style="border-color:var(--bad);">
			<strong>Dati non disponibili.</strong>
			<p class="muted">{erroreDati}</p>
			<pre style="background:var(--bg);padding:8px;border-radius:6px;overflow:auto;">python3 tools/export_json.py --modalita {asta.config.modalita} --partecipanti {asta.config.partecipanti}</pre>
		</div>
	{:else}
		{#if bundleTot > 0 && bundleCon / bundleTot < 0.6}
			<div class="panel" style="border-color:var(--warn);margin-bottom:12px;">
				<strong style="color:var(--warn);">Dati Fantacrediti parziali</strong> —
				solo {bundleCon}/{bundleTot} giocatori hanno PMA/PFC/slot per il taglio
				<strong>{asta.config.partecipanti} partecipanti</strong>{asta.isMantra ? ' in Mantra' : ''}.
				<div class="muted" style="font-size:12px;margin-top:4px;">
					Per gli altri il prezzo usa solo quotazione + Fantalab.
					{#if asta.isMantra && bundleCon === 0}— manca <code>data/2026-2027/mantra/fantacrediti/{asta.config.partecipanti}-partecipanti.xlsx</code>{/if}
				</div>
			</div>
		{/if}

		{#if mostraSetup}
			<div class="panel" style="margin-bottom:12px;">
				<h2 style="margin-top:0;font-size:16px;">Setup asta</h2>
				<div style="display:flex;gap:20px;flex-wrap:wrap;align-items:flex-start;">
					<label>Modalità
						<select value={asta.config.modalita} onchange={(e) => impostaModalita((e.target as HTMLSelectElement).value)} style="display:block;">
							<option value="classic">Classic</option>
							<option value="mantra">Mantra</option>
						</select>
						<span class="muted" style="font-size:10px;display:block;max-width:160px;">Classic e Mantra sono aste separate: squadre, rose e scenari indipendenti.</span>
					</label>
					<label>Budget per squadra
						<input type="number" min="1" bind:value={asta.config.budgetMax} style="width:90px;display:block;" />
					</label>
					<label>Numero squadre
						<input type="number" min="2" max="20" value={asta.config.squadre.length}
							onchange={(e) => impostaNumeroSquadre(+(e.target as HTMLInputElement).value)} style="width:90px;display:block;" />
					</label>
					<label>Taglio dati (PMA/slot)
						<select value={asta.config.partecipanti} onchange={(e) => (asta.config.partecipanti = +(e.target as HTMLSelectElement).value)} style="display:block;">
							<option value={8}>8 partecipanti</option>
							<option value={10}>10 partecipanti</option>
						</select>
					</label>
					{#if asta.isMantra}
						<label>Portieri
							<input type="number" min="1" value={asta.config.limiti.P}
								onchange={(e) => asta.setSlotMantra(+(e.target as HTMLInputElement).value, asta.config.limiti.TOT - asta.config.limiti.P)}
								style="width:70px;display:block;" />
						</label>
						<label>Giocatori di movimento
							<input type="number" min="3" value={asta.config.limiti.TOT - asta.config.limiti.P}
								onchange={(e) => asta.setSlotMantra(asta.config.limiti.P, +(e.target as HTMLInputElement).value)}
								style="width:90px;display:block;" />
							<span class="muted" style="font-size:10px;display:block;">standard: 3 + 27 = 30</span>
						</label>
					{:else}
						{#each RUOLI as r}
							<label>Slot {r}
								<input type="number" min="0" value={asta.config.limiti[r]}
									onchange={(e) => asta.setSlotRuolo(r, +(e.target as HTMLInputElement).value)} style="width:70px;display:block;" />
							</label>
						{/each}
					{/if}
					<label>Rosa totale
						<input type="number" value={asta.config.limiti.TOT} disabled style="width:70px;display:block;opacity:0.7;" />
					</label>
				</div>
				{#if asta.isMantra}
					<h3 style="font-size:14px;margin-bottom:4px;">Moduli target Mantra</h3>
					<div style="display:flex;gap:6px;flex-wrap:wrap;">
						{#each MODULI as mod}
							<button onclick={() => toggleModulo(mod)}
								style="padding:3px 8px;font-size:12px;{asta.config.moduliTarget.includes(mod) ? 'border-color:var(--accent);background:var(--accent);color:#04150c;' : ''}">{mod}</button>
						{/each}
					</div>
				{/if}
				<h3 style="font-size:14px;">Squadre partecipanti</h3>
				<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:8px;">
					{#each asta.config.squadre as sq, i}
						<div style="display:flex;gap:6px;align-items:center;border-left:3px solid {asta.coloreDi(sq.nome)};padding-left:6px;">
							<input type="color" value={asta.coloreDi(sq.nome)}
								oninput={(e) => (asta.config.squadre[i].colore = (e.target as HTMLInputElement).value)}
								title="Colore squadra" style="width:26px;height:26px;padding:0;border:none;background:none;cursor:pointer;" />
							<Crest nome={sq.stemma || sq.nome} tipo="stemmi" size={24} />
							<input bind:value={asta.config.squadre[i].nome} style="flex:1;min-width:0;" />
							<select value={sq.stemma ?? ''}
								onchange={(e) => (asta.config.squadre[i].stemma = (e.target as HTMLSelectElement).value || undefined)}
								title="Stemma" style="width:38px;padding:4px 2px;">
								<option value="">auto</option>
								{#each stemmi as s}<option value={s.chiave}>{s.chiave}</option>{/each}
							</select>
							<label class="muted" style="font-size:12px;white-space:nowrap;">
								<input type="radio" name="mia" checked={sq.isMia}
									onchange={() => asta.config.squadre.forEach((s, j) => (s.isMia = j === i))} /> mia
							</label>
						</div>
					{/each}
				</div>
				<button style="font-size:11px;margin-top:6px;" onclick={() => asta.config.squadre.forEach((s) => (s.colore = undefined))}>Colori automatici</button>
				<div style="margin-top:12px;display:flex;gap:8px;">
					<button class="primary" onclick={() => (mostraSetup = false)}>Inizia l'asta</button>
					{#if asta.acquisti.length}
						<button onclick={() => { if (confirm('Cancellare tutti gli acquisti?')) asta.reset(); }} style="color:var(--bad);">Azzera asta</button>
					{/if}
				</div>
			</div>
		{/if}

		<nav class="tabbar" style="margin-bottom:16px;">
			{#each TABS as t}
				<button onclick={() => (tab = t.id)} class:on={tab === t.id}>{t.label}</button>
			{/each}
		</nav>

		<ViewCorrente />
	{/if}
</div>
