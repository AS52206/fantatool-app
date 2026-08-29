<script lang="ts">
	import { onMount } from 'svelte';
	import { asta } from '$lib/stores/auction.svelte';
	import { caricaBundle } from '$lib/data/load';
	import { stemmiDisponibili } from '$lib/assets';
	import { MODULI_MANTRA } from '$lib/engine/mantra';
	import Crest from '$lib/ui/Crest.svelte';
	import type { Ruolo } from '$lib/domain/types';
	import Draft from '$lib/views/Draft.svelte';
	import Rose from '$lib/views/Rose.svelte';
	import Liberi from '$lib/views/Liberi.svelte';
	import SerieA from '$lib/views/SerieA.svelte';
	import Budget from '$lib/views/Budget.svelte';
	import Scenari from '$lib/views/Scenari.svelte';

	const MODULI = Object.keys(MODULI_MANTRA);
	const RUOLI: Ruolo[] = ['P', 'D', 'C', 'A'];

	const TABS = [
		{ id: 'draft', label: '📢 Draft', view: Draft },
		{ id: 'scenari', label: '🧪 Scenari', view: Scenari },
		{ id: 'budget', label: '🧮 Budget', view: Budget },
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
		try {
			asta.importa(await f.text());
			mostraSetup = false;
		} catch (e) {
			alert('Import fallito: ' + (e instanceof Error ? e.message : e));
		}
	}
	function ora(ts: number | null) {
		return ts
			? new Date(ts).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
			: '—';
	}
</script>

<div style="max-width:1280px;margin:0 auto;padding:16px;">
	<header style="display:flex;align-items:center;gap:12px;flex-wrap:wrap;margin-bottom:12px;border-bottom:1px solid var(--border);padding-bottom:12px;">
		<h1 style="margin:0;font-size:19px;text-transform:uppercase;letter-spacing:1.5px;">
			<span style="color:var(--accent);">▮</span> Fantatool <span class="muted" style="font-weight:400;">/ asta</span>
		</h1>
		<span class="muted mono" style="font-size:11px;">{metaTxt}</span>
		<div style="margin-left:auto;display:flex;gap:8px;align-items:center;flex-wrap:wrap;">
			<span class="tag" title="Salvataggio automatico locale">💾 {ora(asta.ultimoSalvataggio)}</span>
			<button onclick={() => (mostraSetup = !mostraSetup)}>⚙️ Setup</button>
			<button onclick={() => scarica(asta.esporta(), `asta-${oggi()}.json`, 'application/json')}>⬇︎ Backup</button>
			{#if asta.acquisti.length}
				<button onclick={() => scarica(asta.esportaCsv(), `rose-${oggi()}.csv`, 'text/csv')}>⬇︎ CSV</button>
				<button onclick={esportaXlsx} disabled={esportandoXlsx}>{esportandoXlsx ? '…' : '⬇︎ Excel'}</button>
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
							<button onclick={() => toggleModulo(mod)}
								style="padding:3px 8px;font-size:12px;{asta.config.moduliTarget.includes(mod) ? 'border-color:var(--accent);background:var(--accent);color:#04150c;' : ''}">{mod}</button>
						{/each}
					</div>
				{/if}
				<h3 style="font-size:14px;">Squadre partecipanti</h3>
				<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:8px;">
					{#each asta.config.squadre as sq, i}
						<div style="display:flex;gap:6px;align-items:center;">
							<Crest nome={sq.stemma || sq.nome} tipo="stemmi" size={26} />
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
				<div style="margin-top:12px;display:flex;gap:8px;">
					<button class="primary" onclick={() => (mostraSetup = false)}>Inizia l'asta</button>
					{#if asta.acquisti.length}
						<button onclick={() => { if (confirm('Cancellare tutti gli acquisti?')) asta.reset(); }} style="color:var(--bad);">Azzera asta</button>
					{/if}
				</div>
			</div>
		{/if}

		<nav style="display:flex;gap:4px;margin-bottom:16px;flex-wrap:wrap;">
			{#each TABS as t}
				<button onclick={() => (tab = t.id)} class:primary={tab === t.id} style="font-size:13px;">{t.label}</button>
			{/each}
		</nav>

		<ViewCorrente />
	{/if}
</div>
