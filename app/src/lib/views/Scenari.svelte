<script lang="ts">
	import { asta } from '$lib/stores/auction.svelte';
	import { normalizzaNome } from '$lib/engine/names';
	import { MODULI_MANTRA, ORDINE_RUOLI_MANTRA, normalizzaRuoliMantra } from '$lib/engine/mantra';
	import {
		buildCampoClassic,
		buildCampoMantra,
		MODULI_CLASSIC,
		repartoDifensivoMantra,
		type GiocatoreCampo
	} from '$lib/campo';
	import { ricambiMantraDa, ricambiClassicDa } from '$lib/ricambi';
	import RoleTag from '$lib/ui/RoleTag.svelte';
	import Crest from '$lib/ui/Crest.svelte';
	import FormationPitch from '$lib/ui/FormationPitch.svelte';

	let attivo = $state<string>('');
	let query = $state('');
	let confrontaCon = $state<string>('');
	const moduliDisponibili = $derived(asta.isMantra ? Object.keys(MODULI_MANTRA) : MODULI_CLASSIC);
	const moduloDefault = $derived(
		asta.isMantra ? (asta.moduliTargetValidi[0] ?? '3-4-1-2') : '4-3-3'
	);
	// Il modulo è per-piano: ogni piano ricorda il suo, cambiarlo non tocca gli altri.
	const modulo = $derived.by(() => {
		const m = asta.moduloScenario(attivo);
		return m && moduliDisponibili.includes(m) ? m : moduloDefault;
	});
	function impostaModulo(m: string) {
		if (attivo) asta.setModuloScenario(attivo, m);
	}

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

	/** Prezzo di default per un obiettivo: PMA Fantalab, poi consigliato, poi 1. */
	function prezzoDefault(g: { fantalab?: { prezzo_atteso: number } | null }, consigliato: number | null) {
		return Math.max(1, Math.round(g.fantalab?.prezzo_atteso || consigliato || 1));
	}
	let selezioneMultipla = $state<string[]>([]);
	let prezziMultipli = $state<Record<string, number>>({});
	const giocatoriMultipli = $derived(
		asta.giocatori.filter((g) => selezioneMultipla.includes(g.chiave) && !(g.chiave in (asta.scenari[attivo] ?? {})))
	);
	function cambiaSelezioneMultipla(g: { chiave: string; fantalab?: { prezzo_atteso: number } | null }) {
		if (selezioneMultipla.includes(g.chiave)) {
			selezioneMultipla = selezioneMultipla.filter((chiave) => chiave !== g.chiave);
			return;
		}
		const consigliato = asta.valutazione(g as never).fascia.riferimento;
		selezioneMultipla = [...selezioneMultipla, g.chiave];
		prezziMultipli = { ...prezziMultipli, [g.chiave]: prezzoDefault(g, consigliato) };
	}
	function aggiornaPrezzoMultiplo(chiave: string, prezzo: number) {
		prezziMultipli = { ...prezziMultipli, [chiave]: prezzo };
	}
	function svuotaSelezioneMultipla() {
		selezioneMultipla = [];
		prezziMultipli = {};
	}
	function aggiungiMultipli() {
		if (!attivo || !giocatoriMultipli.length) return;
		asta.setTargetScenarioMultipli(
			attivo,
			giocatoriMultipli.map((g) => ({ chiave: g.chiave, prezzoMax: prezziMultipli[g.chiave] }))
		);
		svuotaSelezioneMultipla();
		query = '';
	}
	function aggiungi(chiave: string, prezzo: number) {
		asta.setTargetScenario(attivo, chiave, prezzo);
		query = '';
	}

	// --- click su maglia vuota: elenco giocatori del ruolo ---
	let picker = $state<{ ruolo?: string; etichetta?: string; linea: string } | null>(null);
	let pickerQuery = $state('');
	$effect(() => {
		void picker;
		pickerQuery = '';
	});
	const valFL = (g: { fantalab?: { prezzo_atteso: number } | null; quotazione: number }) =>
		g.fantalab?.prezzo_atteso || g.quotazione || 0;
	const tokens = (v: unknown) =>
		String(v ?? '')
			.split(/[;,/\s]+/)
			.map((x) => x.trim())
			.filter(Boolean);
	const candidatiPicker = $derived.by(() => {
		if (!picker || !attivo) return [];
		const inPiano = new Set(Object.keys(asta.scenari[attivo] ?? {}));
		const opzioni = tokens(picker.etichetta);
		const q = normalizzaNome(pickerQuery);
		return asta.giocatori
			.filter((g) => !inPiano.has(g.chiave))
			.filter((g) => {
				if (asta.isMantra && opzioni.length)
					return tokens(g.ruoloMantra).some((x) => opzioni.includes(x));
				return !picker!.ruolo || g.ruolo === picker!.ruolo;
			})
			.filter((g) => !q || g.chiave.includes(q) || normalizzaNome(g.squadra).includes(q))
			.sort((a, b) => valFL(b) - valFL(a))
			.slice(0, 150);
	});
	function aggiungiDaPicker(g: { chiave: string; fantalab?: { prezzo_atteso: number } | null }) {
		const cons = asta.valutazione(g as never).fascia.riferimento;
		aggiungi(g.chiave, prezzoDefault(g, cons));
		picker = null;
	}

	const righe = $derived(attivo ? asta.righeScenario(attivo) : []);
	const campoInput = $derived(
		righe
			.filter((r) => r.stato !== 'PERSO')
			.map(
				(r): GiocatoreCampo => ({
					chiave: r.chiave,
					nome: r.nome,
					club: r.giocatore?.squadra,
					ruolo: r.ruolo || 'C',
					ruoloMantra: r.ruoloMantra,
					prezzo: r.stato === 'PRESO' ? r.prezzoEffettivo : r.max,
					titolarita: r.giocatore?.fc?.expectedTitolarita ?? null,
					pmaFl: r.giocatore?.fantalab?.prezzo_atteso ?? null,
					fantamedia: r.giocatore?.fc?.expectedFantamedia ?? null,
					stato: r.stato === 'PRESO' ? 'PRESO' : 'LIBERO'
				})
			)
	);
	const campo = $derived(
		asta.isMantra ? buildCampoMantra(campoInput, modulo) : buildCampoClassic(campoInput, modulo)
	);
	/** Slot del reparto difensivo (modificatore difesa) sul modulo scelto. */
	const repartoDif = $derived(asta.isMantra ? repartoDifensivoMantra(campo) : []);

	const righePianoAttive = $derived(righe.filter((r) => r.stato !== 'PERSO'));
	const ricambi = $derived(
		asta.isMantra
			? ricambiMantraDa(righePianoAttive.map((r) => r.ruoloMantra || r.ruolo), asta.config.limiti.TOT, modulo, asta.config.limiti.P)
			: ricambiClassicDa(righePianoAttive.map((r) => r.ruolo), asta.config.limiti)
	);
	const totalePiano = $derived(righePianoAttive.length);
	const righePerse = $derived(righe.filter((r) => r.stato === 'PERSO'));

	// ordine reparto per la tabella del piano
	const ORDINE_CLASSIC: Record<string, number> = { P: 0, D: 1, C: 2, A: 3 };
	function chiaveOrdine(r: { ruolo: string; ruoloMantra: string }): number {
		if (asta.isMantra) {
			const rm = normalizzaRuoliMantra(r.ruoloMantra);
			return rm.length ? ORDINE_RUOLI_MANTRA.indexOf(rm[0]) : 99;
		}
		return ORDINE_CLASSIC[r.ruolo] ?? 99;
	}
	const righeTabella = $derived(
		[...righe].sort(
			(a, b) =>
				chiaveOrdine(a) - chiaveOrdine(b) ||
				(b.max ?? 0) - (a.max ?? 0) ||
				a.nome.localeCompare(b.nome)
		)
	);

	/** Slot ancora scoperti nel modulo scelto, raggruppati per ruolo. */
	const ruoliDaCoprire = $derived.by(() => {
		const m = new Map<string, { etichetta: string; ruolo?: string; linea: string; n: number }>();
		for (const linea of campo.linee)
			for (const s of linea.slot)
				if ((s.stato ?? 'VUOTO') === 'VUOTO') {
					const key = s.etichetta ?? s.ruolo ?? '?';
					const cur = m.get(key) ?? {
						etichetta: s.etichetta ?? key,
						ruolo: s.ruolo,
						linea: linea.nome,
						n: 0
					};
					cur.n += 1;
					m.set(key, cur);
				}
		return [...m.values()];
	});

	// --- esporta / importa SOLO i piani (utile per spostarli tra browser/PC) ---
	let pianiInput: HTMLInputElement;
	function scaricaTesto(txt: string, nome: string) {
		const a = document.createElement('a');
		a.href = URL.createObjectURL(new Blob([txt], { type: 'application/json' }));
		a.download = nome;
		a.click();
		URL.revokeObjectURL(a.href);
	}
	function esportaPiani() {
		const oggi = new Date().toISOString().slice(0, 10);
		scaricaTesto(asta.esportaScenari(), `piani-${asta.config.modalita}-${oggi}.json`);
	}
	async function importaPiani(e: Event) {
		const inp = e.target as HTMLInputElement;
		const f = inp.files?.[0];
		inp.value = '';
		if (!f) return;
		try {
			const n = asta.importaScenari(await f.text());
			alert(`${n} pian${n === 1 ? 'o' : 'i'} importat${n === 1 ? 'o' : 'i'} in ${asta.config.modalita.toUpperCase()}.`);
		} catch (err) {
			alert('Import piani fallito: ' + (err instanceof Error ? err.message : err));
		}
	}
</script>

<svelte:window onkeydown={(e) => e.key === 'Escape' && (picker = null)} />

<div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-bottom:12px;">
	{#each nomi as n}
		<button onclick={() => (attivo = n)} class:primary={n === attivo}>{n}</button>
	{/each}
	<button onclick={() => (attivo = asta.nuovoScenario())}>+ Nuovo piano</button>
	<span style="width:1px;height:20px;background:var(--border);margin:0 2px;"></span>
	<button onclick={esportaPiani} disabled={!nomi.length} title="Scarica solo i piani di questa modalità (non tocca rose e squadre)">⬇︎ Esporta piani</button>
	<button onclick={() => pianiInput.click()} title="Aggiungi piani da un file (li unisce a quelli esistenti)">⬆︎ Importa piani</button>
	<input bind:this={pianiInput} type="file" accept=".json" style="display:none" onchange={importaPiani} />
</div>

{#if attivo}
	{@const an = asta.analisiScenario(attivo)}

	<div class="panel" style="margin-bottom:16px;">
		<div style="display:flex;align-items:center;gap:10px;margin-bottom:10px;flex-wrap:wrap;">
			<h2 style="margin:0;font-size:15px;">Disposizione in campo</h2>
			<select
				value={modulo}
				onchange={(e) => impostaModulo((e.currentTarget as HTMLSelectElement).value)}
				style="font-family:var(--mono);"
				title="Modulo di questo piano (ogni piano ha il suo)"
			>
				{#each moduliDisponibili as m}<option value={m}>{m}</option>{/each}
			</select>
			<span class="muted" style="font-size:11px;">
				{#if asta.isMantra}incastro reale sui ruoli Mantra{:else}reparti P/D/C/A, titolari per prezzo{/if}
				· <span style="color:var(--ok);">■</span> preso · <span style="color:var(--cyan);">■</span> obiettivo
			</span>
		</div>
		<div class="campo-wrap">
			<div style="flex:1 1 420px;min-width:0;">
				<FormationPitch
					linee={campo.linee}
					titolo={campo.modulo}
					evidenzia={repartoDif}
					onSlotVuoto={(i) => (picker = i)}
				/>
				<div class="muted" style="font-size:11px;text-align:center;margin-top:2px;">
					{#if repartoDif.length}
						<span style="color:var(--ok);">▬</span> reparto del modificatore difesa (portiere + 5 arretrati) ·
					{/if}
					Clicca una maglia vuota (o un ruolo qui a destra) per scegliere un giocatore.
				</div>
			</div>
			<div class="campo-side">
				<div>
					<h3 style="margin:0 0 6px;font-size:13px;">
						In panchina nel piano
						<span class="muted mono" style="font-size:11px;">
							({campo.panchina.length}) · {totalePiano} in piano su {asta.config.limiti.TOT}
						</span>
					</h3>
					{#if campo.panchina.length}
						<div style="display:flex;flex-wrap:wrap;gap:4px;">
							{#each campo.panchina as p}
								<span
									class="tag"
									data-ruolo={asta.isMantra ? undefined : p.ruolo}
									style="gap:4px;font-size:11px;{p.nome === p.chiave ? 'opacity:0.5;' : ''}"
									title={p.club ?? ''}
								>
									<Crest nome={p.club} size={12} />
									{p.nome}
									{#if asta.isMantra && p.ruoloMantra}<span class="muted">{p.ruoloMantra}</span>{/if}
									{#if p.prezzo != null}<span style="color:var(--cyan);">{p.prezzo}</span>{/if}
								</span>
							{/each}
						</div>
					{:else}
						<p class="muted" style="font-size:12px;margin:0;">Nel piano non ci sono riserve oltre l'XI.</p>
					{/if}
					{#if righePerse.length}
						<div style="margin-top:6px;">
							<span class="muted" style="font-size:10px;">Presi dai rivali ({righePerse.length}) — fuori dal piano:</span>
							<div style="display:flex;flex-wrap:wrap;gap:4px;margin-top:3px;">
								{#each righePerse as r}
									<span class="tag" style="font-size:10px;opacity:0.55;">
										<s>{r.nome}</s>
										<span class="muted">{r.proprietario} {r.prezzoEffettivo}</span>
									</span>
								{/each}
							</div>
						</div>
					{/if}
				</div>

				<div>
					<h3 style="margin:0 0 6px;font-size:13px;">
						Ruoli da coprire <span class="muted mono" style="font-size:11px;">· {modulo}</span>
					</h3>
					{#if ruoliDaCoprire.length}
						<div style="display:flex;flex-direction:column;gap:5px;">
							{#each ruoliDaCoprire as r}
								<button
									class="row-player"
									style="justify-content:flex-start;"
									onclick={() => (picker = { ruolo: r.ruolo, etichetta: r.etichetta, linea: r.linea })}
								>
									<span class="tag" data-ruolo={asta.isMantra ? undefined : r.etichetta}>{r.etichetta}</span>
									{#if r.n > 1}<span class="mono" style="color:var(--cyan);">×{r.n}</span>{/if}
									<span class="muted" style="font-size:11px;">{r.linea}</span>
									<span class="muted" style="margin-left:auto;font-size:11px;">＋ scegli</span>
								</button>
							{/each}
						</div>
					{:else}
						<p class="muted" style="font-size:12px;margin:0;">XI completo per questo modulo. ✓</p>
					{/if}
				</div>

				<div>
					<h3 style="margin:0 0 2px;font-size:13px;">
						Ricambi consigliati
						<span class="mono" style="font-size:11px;color:{totalePiano >= asta.config.limiti.TOT ? 'var(--ok)' : 'var(--muted)'};">
							· {totalePiano}/{asta.config.limiti.TOT} in rosa
						</span>
					</h3>
					<p class="muted" style="font-size:10px;margin:0 0 6px;">
						{#if asta.isMantra}quanti tenerne per profilo sul modulo {modulo} · tabella BABBOFANTACALCIO scalata alla rosa da {asta.config.limiti.TOT} · un polivalente (es. Dd;E) conta in ogni profilo{:else}giocatori per reparto per la rosa completa{/if}
					</p>
					<div style="display:flex;flex-direction:column;gap:4px;">
						{#each ricambi as p}
							<button
								class="row-player"
								style="justify-content:flex-start;{p.mancanti === 0 ? 'opacity:0.6;' : ''}"
								onclick={() => (picker = { ruolo: asta.isMantra ? undefined : p.chiave, etichetta: p.roli.join('/'), linea: 'ricambio' })}
							>
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
							</button>
						{/each}
					</div>
					{#if asta.isMantra && ricambi.every((p) => p.mancanti === 0) && totalePiano < asta.config.limiti.TOT}
						<div class="muted" style="font-size:11px;margin-top:6px;border-top:1px solid var(--border);padding-top:5px;">
							Tutti i profili coperti con <b>{totalePiano}</b> giocatori (diversi sono polivalenti e
							contano su più profili). Restano <b>{asta.config.limiti.TOT - totalePiano}</b> slot
							che nessun ruolo richiede: riserve extra o scommesse.
						</div>
					{/if}
				</div>
			</div>
		</div>
	</div>

	<div style="display:grid;grid-template-columns:1.4fr 1fr;gap:16px;align-items:start;">
		<div class="panel">
			<div style="display:flex;gap:8px;align-items:center;margin-bottom:10px;">
				<input
					value={attivo}
					onchange={(e) => {
						const nuovo = (e.currentTarget as HTMLInputElement).value.trim();
						asta.rinominaScenario(attivo, nuovo);
						if (nuovo in asta.scenari) attivo = nuovo;
					}}
					style="font-weight:700;flex:1;" />
				<button style="color:var(--bad);" onclick={() => { if (confirm('Eliminare il piano?')) asta.eliminaScenario(attivo); }}>Elimina</button>
			</div>

			<div style="position:relative;margin-bottom:10px;">
				<input placeholder="Aggiungi giocatore al piano…" bind:value={query} style="width:100%;" />
				{#if suggerimenti.length}
					<div class="panel" style="position:absolute;z-index:5;left:0;right:0;padding:4px;">
						{#each suggerimenti as g}
							{@const cons = asta.valutazione(g).fascia.riferimento}
							{@const def = prezzoDefault(g, cons)}
							<div class="row-player scenario-suggestion">
								<input
									class="scenario-check"
									type="checkbox"
									checked={selezioneMultipla.includes(g.chiave)}
									aria-label={`Seleziona ${g.nome} per il piano`}
									onchange={() => cambiaSelezioneMultipla(g)}
								/>
								<RoleTag ruolo={g.ruolo} ruoloMantra={g.ruoloMantra} />
								<Crest nome={g.squadra} size={15} />
								<strong>{g.nome}</strong><span class="muted">{g.squadra}</span>
								<span class="muted mono" style="margin-left:auto;">
									{#if g.fantalab?.prezzo_atteso}FL {g.fantalab.prezzo_atteso} · {/if}cons. {cons} → <span style="color:var(--cyan);">{def}</span>
								</span>
								<button class="scenario-add-one" title={`Aggiungi solo ${g.nome}`} onclick={() => aggiungi(g.chiave, def)}>＋</button>
							</div>
						{/each}
					</div>
				{/if}
			</div>

			{#if giocatoriMultipli.length}
				<div class="scenario-batch" aria-label="Aggiunta multipla al piano">
					<div class="scenario-batch-head"><span>Aggiunta multipla</span><b>{giocatoriMultipli.length} nel piano</b><button onclick={svuotaSelezioneMultipla}>Svuota</button></div>
					<div class="scenario-batch-list">
						{#each giocatoriMultipli as g (g.chiave)}
							<div>
								<RoleTag ruolo={g.ruolo} ruoloMantra={g.ruoloMantra} /><Crest nome={g.squadra} size={15} />
								<strong>{g.nome}</strong><span>{g.squadra}</span>
								<label>Max <input type="number" min="1" value={prezziMultipli[g.chiave]} oninput={(e) => aggiornaPrezzoMultiplo(g.chiave, Number(e.currentTarget.value))} /></label>
								<button aria-label={`Rimuovi ${g.nome} dalla selezione`} onclick={() => cambiaSelezioneMultipla(g)}>×</button>
							</div>
						{/each}
					</div>
					<button class="primary" onclick={aggiungiMultipli}>Aggiungi {giocatoriMultipli.length} al piano →</button>
				</div>
			{/if}

			<table style="width:100%;border-collapse:collapse;font-size:13px;">
				<thead><tr style="text-align:left;"><th title="Numero progressivo">#</th><th>R</th><th>Giocatore</th><th>Max</th><th title="Quota del budget di lega ({asta.config.budgetMax} cr)">%Bud</th><th>Cons.</th><th title="PMA Fantalab">FL</th><th title="% titolarità">%TIT</th><th>Stato</th><th></th></tr></thead>
				<tbody>
					{#each righeTabella as r, i (r.chiave)}
						{@const tit = r.giocatore?.fc?.expectedTitolarita ?? 0}
						{@const spesa = r.stato === 'PRESO' ? (r.prezzoEffettivo ?? 0) : r.max}
						{@const pctBud = asta.config.budgetMax > 0 ? (spesa / asta.config.budgetMax) * 100 : 0}
						<tr style="border-top:1px solid var(--border);">
							<td class="mono muted">{i + 1}</td>
							<td><RoleTag ruolo={r.ruolo} ruoloMantra={r.ruoloMantra} /></td>
							<td style="white-space:nowrap;">
								<Crest nome={r.giocatore?.squadra} size={14} /> {r.nome}{#if r.stato !== 'LIBERO'}<span class="muted" style="font-size:11px;"> · {r.proprietario} {r.prezzoEffettivo}</span>{/if}</td>
							<td style="white-space:nowrap;">
								<input type="number" min="1" value={r.max} style="width:58px;"
									onchange={(e) => asta.setTargetScenario(attivo, r.chiave, +(e.target as HTMLInputElement).value)} />
								{#if r.giocatore?.fantalab?.prezzo_atteso && r.giocatore.fantalab.prezzo_atteso !== r.max}
									<button style="padding:1px 5px;font-size:10px;" title="Imposta al PMA Fantalab"
										onclick={() => asta.setTargetScenario(attivo, r.chiave, r.giocatore!.fantalab!.prezzo_atteso)}>→FL</button>
								{/if}
							</td>
							<td
								class="mono"
								style:color={pctBud >= 25
									? 'var(--bad)'
									: pctBud >= 15
										? 'var(--warn)'
										: 'var(--muted)'}
								title="{spesa} su {asta.config.budgetMax} cr"
							>{pctBud ? pctBud.toFixed(1) + '%' : '—'}</td>
							<td class="mono muted">{r.consigliato ?? '—'}</td>
							<td class="mono" style="color:var(--warn);">{r.giocatore?.fantalab?.prezzo_atteso ?? '—'}</td>
							<td class="mono" style:color={tit >= 70 ? 'var(--ok)' : tit >= 45 ? 'var(--warn)' : tit > 0 ? 'var(--bad)' : 'var(--muted)'}>{tit ? Math.round(tit) + '%' : '—'}</td>
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

	{#if picker}
		<div
			class="picker-overlay"
			role="button"
			tabindex="-1"
			onclick={() => (picker = null)}
			onkeydown={(e) => e.key === 'Enter' && (picker = null)}
		>
			<div
				class="panel picker-box"
				role="dialog"
				tabindex="-1"
				onclick={(e) => e.stopPropagation()}
				onkeydown={(e) => e.key !== 'Escape' && e.stopPropagation()}
			>
				<div style="display:flex;align-items:center;gap:8px;margin-bottom:8px;">
					<h2 style="margin:0;font-size:15px;">
						Scegli un <span style="color:var(--cyan);">{picker.etichetta ?? picker.ruolo}</span>
						<span class="muted" style="font-weight:400;font-size:12px;">· {picker.linea}</span>
					</h2>
					<button style="margin-left:auto;font-size:11px;" onclick={() => (picker = null)}>Chiudi ✕</button>
				</div>
				<!-- svelte-ignore a11y_autofocus -->
				<input
					autofocus
					placeholder="Filtra per nome o squadra…"
					bind:value={pickerQuery}
					style="width:100%;margin-bottom:8px;"
				/>
				<div style="overflow:auto;max-height:56vh;">
					{#each candidatiPicker as g (g.chiave)}
						{@const cons = asta.valutazione(g).fascia.riferimento}
						{@const def = prezzoDefault(g, cons)}
						<div class="row-player picker-suggestion" role="button" tabindex="-1" onclick={() => aggiungiDaPicker(g)} onkeydown={(e) => e.key === 'Enter' && aggiungiDaPicker(g)}>
							<input
								class="scenario-check"
								type="checkbox"
								checked={selezioneMultipla.includes(g.chiave)}
								aria-label={`Seleziona ${g.nome} per il piano`}
								onclick={(e) => e.stopPropagation()}
								onchange={() => cambiaSelezioneMultipla(g)}
							/>
							<RoleTag ruolo={g.ruolo} ruoloMantra={g.ruoloMantra} />
							<Crest nome={g.squadra} size={15} />
							<strong>{g.nome}</strong><span class="muted">{g.squadra}</span>
							{#if g.fc?.expectedTitolarita}<span class="mono" style="font-size:10px;color:{g.fc.expectedTitolarita >= 70 ? 'var(--ok)' : g.fc.expectedTitolarita >= 45 ? 'var(--warn)' : 'var(--bad)'};">{Math.round(g.fc.expectedTitolarita)}%</span>{/if}
							<span class="muted mono" style="margin-left:auto;">
								{#if g.fantalab?.prezzo_atteso}FL {g.fantalab.prezzo_atteso} · {/if}cons. {cons} → <span style="color:var(--cyan);">{def}</span>
							</span>
						</div>
					{:else}
						<p class="muted" style="font-size:12px;">Nessun giocatore disponibile per questo ruolo.</p>
					{/each}
				</div>
				{#if giocatoriMultipli.length}
					<div class="picker-batch">
						<span><b>{giocatoriMultipli.length}</b> selezionati · potrai modificare i massimali nella tabella</span>
						<button class="primary" onclick={() => { aggiungiMultipli(); picker = null; }}>Aggiungi al piano →</button>
					</div>
				{/if}
			</div>
		</div>
	{/if}
{:else}
	<div class="panel"><button class="primary" onclick={() => (attivo = asta.nuovoScenario())}>Crea il primo piano</button></div>
{/if}

<style>
	.picker-overlay {
		position: fixed;
		inset: 0;
		z-index: 100;
		background: rgba(0, 0, 0, 0.55);
		backdrop-filter: blur(3px);
		display: flex;
		align-items: flex-start;
		justify-content: center;
		padding: 8vh 16px 16px;
	}
	.picker-box {
		width: 100%;
		max-width: 560px;
		max-height: 80vh;
		display: flex;
		flex-direction: column;
	}
	.picker-suggestion { cursor:pointer; }
	.picker-batch { display:flex; align-items:center; justify-content:space-between; gap:10px; margin-top:8px; padding-top:8px; border-top:1px solid var(--border); color:var(--muted); font-size:11px; }
	.picker-batch b { color:var(--cyan); }
	.picker-batch .primary { flex:none; font-size:11px; }
	.scenario-suggestion { cursor:default; }
	.scenario-check { width:14px; height:14px; flex:none; accent-color:var(--cyan); cursor:pointer; }
	.scenario-add-one { min-width:26px; padding:3px 6px; color:var(--cyan); font-size:15px; line-height:1; }
	.scenario-batch { display:grid; gap:8px; margin:0 0 10px; padding:10px; border:1px solid color-mix(in srgb,var(--cyan) 45%,var(--border)); border-radius:9px; background:linear-gradient(135deg,color-mix(in srgb,var(--cyan) 8%,var(--panel)),var(--panel)); }
	.scenario-batch-head { display:flex; align-items:center; gap:8px; }
	.scenario-batch-head span { color:var(--cyan); font:700 9px var(--display); letter-spacing:1.2px; text-transform:uppercase; }
	.scenario-batch-head b { font:700 16px var(--display); text-transform:uppercase; }
	.scenario-batch-head button { margin-left:auto; font-size:10px; }
	.scenario-batch-list { display:grid; max-height:170px; overflow:auto; border-top:1px solid var(--border); border-bottom:1px solid var(--border); }
	.scenario-batch-list > div { display:grid; grid-template-columns:auto auto minmax(80px,1fr) minmax(48px,.5fr) auto auto; align-items:center; gap:6px; min-height:34px; border-bottom:1px solid color-mix(in srgb,var(--border) 75%,transparent); font-size:11px; }
	.scenario-batch-list > div:last-child { border-bottom:0; }
	.scenario-batch-list span { color:var(--muted); overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
	.scenario-batch-list label { display:flex; align-items:center; gap:3px; color:var(--muted); font:700 10px var(--mono); }
	.scenario-batch-list input { width:55px; padding:4px 5px; font-size:12px; }
	.scenario-batch-list button { min-width:24px; padding:3px 6px; color:var(--muted); border-color:transparent; font-size:16px; line-height:1; }
	.scenario-batch > .primary { justify-self:end; font-size:11px; }
	@media (max-width:700px) { .scenario-batch-list > div { grid-template-columns:auto auto minmax(70px,1fr) auto auto; } .scenario-batch-list span { display:none; } .scenario-batch > .primary { justify-self:stretch; } .picker-batch { align-items:stretch; flex-direction:column; } .picker-batch .primary { width:100%; } }
</style>
