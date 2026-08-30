<script lang="ts">
	import { asta } from '$lib/stores/auction.svelte';
	import { normalizzaNome } from '$lib/engine/names';
	import { MODULI_MANTRA, PROFILI_ROSA_MANTRA, PIANO_ROSA_MANTRA_30 } from '$lib/engine/mantra';
	import { buildCampoClassic, buildCampoMantra, MODULI_CLASSIC, type GiocatoreCampo } from '$lib/campo';
	import type { Ruolo } from '$lib/domain/types';
	import RoleTag from '$lib/ui/RoleTag.svelte';
	import Crest from '$lib/ui/Crest.svelte';
	import FormationPitch from '$lib/ui/FormationPitch.svelte';

	let attivo = $state<string>('');
	let query = $state('');
	let confrontaCon = $state<string>('');
	let modulo = $state('');
	const moduliDisponibili = $derived(asta.isMantra ? Object.keys(MODULI_MANTRA) : MODULI_CLASSIC);
	$effect(() => {
		if (!moduliDisponibili.includes(modulo))
			modulo = asta.isMantra ? (asta.moduliTargetValidi[0] ?? '3-4-1-2') : '4-3-3';
	});

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
	function aggiungi(chiave: string, prezzo: number) {
		asta.setTargetScenario(attivo, chiave, prezzo);
		query = '';
	}

	// --- click su maglia vuota: elenco giocatori del ruolo ---
	let picker = $state<{ ruolo?: string; etichetta?: string; linea: string } | null>(null);
	const valFL = (g: { fantalab?: { prezzo_atteso: number } | null; quotazione: number }) =>
		g.fantalab?.prezzo_atteso || g.quotazione || 0;
	const candidatiPicker = $derived.by(() => {
		if (!picker || !attivo) return [];
		const inPiano = new Set(Object.keys(asta.scenari[attivo] ?? {}));
		const opzioni = (picker.etichetta ?? '').split('/').map((s) => s.trim()).filter(Boolean);
		return asta.giocatori
			.filter((g) => !inPiano.has(g.chiave))
			.filter((g) => {
				if (asta.isMantra && opzioni.length) {
					const suoi = String(g.ruoloMantra ?? '')
						.split(/[;,/]/)
						.map((x) => x.trim())
						.filter(Boolean);
					return suoi.some((x) => opzioni.includes(x));
				}
				return !picker!.ruolo || g.ruolo === picker!.ruolo;
			})
			.sort((a, b) => valFL(b) - valFL(a))
			.slice(0, 60);
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
					stato: r.stato === 'PRESO' ? 'PRESO' : 'LIBERO'
				})
			)
	);
	const campo = $derived(
		asta.isMantra ? buildCampoMantra(campoInput, modulo) : buildCampoClassic(campoInput, modulo)
	);

	const tokensRuolo = (rm: unknown) =>
		String(rm ?? '')
			.split(/[;,/]/)
			.map((s) => s.trim())
			.filter(Boolean);

	/** Ricambi consigliati per la rosa Mantra completa (modulo + n° giocatori di lega).
	 *  Un giocatore polivalente (es. Dd;E) conta in OGNI ruolo che può coprire. */
	const ricambiMantra = $derived.by(() => {
		if (!asta.isMantra) return [];
		const tot = asta.config.limiti.TOT || 25;
		const somma30 = Object.values(PIANO_ROSA_MANTRA_30).reduce((s, n) => s + n, 0);
		const chiavi = PROFILI_ROSA_MANTRA.map((p) => p[0]);
		const piano: Record<string, number> = {};
		let acc = 0;
		chiavi.forEach((k, i) => {
			if (i === chiavi.length - 1) piano[k] = Math.max(0, tot - acc);
			else {
				piano[k] = Math.round((PIANO_ROSA_MANTRA_30[k] * tot) / somma30);
				acc += piano[k];
			}
		});
		const ruoliPlan = righe
			.filter((r) => r.stato !== 'PERSO')
			.map((r) => tokensRuolo(r.ruoloMantra || r.ruolo));
		return PROFILI_ROSA_MANTRA.map(([chiave, etichetta, roli]) => {
			const obiettivo = piano[chiave] ?? 0;
			const presenti = ruoliPlan.filter((toks) => toks.some((t) => roli.includes(t))).length;
			return { chiave, etichetta, roli, presenti, obiettivo, mancanti: Math.max(0, obiettivo - presenti) };
		});
	});

	/** Ricambi consigliati Classic: slot rimanenti per reparto sul totale di lega. */
	const ricambiClassic = $derived.by(() => {
		if (asta.isMantra) return [];
		return (['P', 'D', 'C', 'A'] as Ruolo[]).map((r) => {
			const presenti = righe.filter((x) => x.stato !== 'PERSO' && x.ruolo === r).length;
			const obiettivo = asta.config.limiti[r] ?? 0;
			return { chiave: r, etichetta: r, roli: [r], presenti, obiettivo, mancanti: Math.max(0, obiettivo - presenti) };
		});
	});
	const ricambi = $derived(asta.isMantra ? ricambiMantra : ricambiClassic);
	const totalePiano = $derived(righe.filter((r) => r.stato !== 'PERSO').length);

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
</script>

<svelte:window onkeydown={(e) => e.key === 'Escape' && (picker = null)} />

<div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-bottom:12px;">
	{#each nomi as n}
		<button onclick={() => (attivo = n)} class:primary={n === attivo}>{n}</button>
	{/each}
	<button onclick={() => (attivo = asta.nuovoScenario())}>+ Nuovo piano</button>
</div>

{#if attivo}
	{@const an = asta.analisiScenario(attivo)}

	<div class="panel" style="margin-bottom:16px;">
		<div style="display:flex;align-items:center;gap:10px;margin-bottom:10px;flex-wrap:wrap;">
			<h2 style="margin:0;font-size:15px;">Disposizione in campo</h2>
			<select bind:value={modulo} style="font-family:var(--mono);">
				{#each moduliDisponibili as m}<option value={m}>{m}</option>{/each}
			</select>
			<span class="muted" style="font-size:11px;">
				{#if asta.isMantra}incastro reale sui ruoli Mantra{:else}reparti P/D/C/A, titolari per prezzo{/if}
				· <span style="color:var(--ok);">■</span> preso · <span style="color:var(--cyan);">■</span> obiettivo
			</span>
		</div>
		<div class="campo-wrap">
			<div style="flex:1 1 420px;min-width:0;">
				<FormationPitch linee={campo.linee} titolo={campo.modulo} onSlotVuoto={(i) => (picker = i)} />
				<div class="muted" style="font-size:11px;text-align:center;margin-top:2px;">
					Clicca una maglia vuota (o un ruolo qui a destra) per scegliere un giocatore.
				</div>
			</div>
			<div class="campo-side">
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
						{#if asta.isMantra}un giocatore polivalente (es. Dd;E) conta in ogni ruolo che può coprire{:else}giocatori per reparto per la rosa completa{/if}
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
				</div>

				{#if campo.panchina.length}
					<div>
						<h3 style="margin:0 0 6px;font-size:13px;">
							In panchina nel piano <span class="muted mono" style="font-size:11px;">({campo.panchina.length})</span>
						</h3>
						<div style="display:flex;flex-direction:column;gap:4px;">
							{#each campo.panchina as p}
								<div style="display:flex;align-items:center;gap:6px;font-size:12px;">
									<span class="tag" data-ruolo={asta.isMantra ? undefined : p.ruolo}>{asta.isMantra ? p.ruoloMantra || p.ruolo : p.ruolo}</span>
									<Crest nome={p.club} size={14} />
									<span>{p.nome}</span>
									{#if p.prezzo != null}<span class="mono muted" style="margin-left:auto;">{p.prezzo}</span>{/if}
								</div>
							{/each}
						</div>
					</div>
				{/if}
			</div>
		</div>
	</div>

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
							{@const def = prezzoDefault(g, cons)}
							<button class="row-player" onclick={() => aggiungi(g.chiave, def)}>
								<RoleTag ruolo={g.ruolo} ruoloMantra={g.ruoloMantra} />
								<Crest nome={g.squadra} size={15} />
								<strong>{g.nome}</strong><span class="muted">{g.squadra}</span>
								<span class="muted mono" style="margin-left:auto;">
									{#if g.fantalab?.prezzo_atteso}FL {g.fantalab.prezzo_atteso} · {/if}cons. {cons} → <span style="color:var(--cyan);">{def}</span>
								</span>
							</button>
						{/each}
					</div>
				{/if}
			</div>

			<table style="width:100%;border-collapse:collapse;font-size:13px;">
				<thead><tr style="text-align:left;"><th>R</th><th>Giocatore</th><th>Max</th><th>Cons.</th><th title="PMA Fantalab">FL</th><th title="% titolarità">%TIT</th><th>Stato</th><th></th></tr></thead>
				<tbody>
					{#each righe as r (r.chiave)}
						{@const tit = r.giocatore?.fc?.expectedTitolarita ?? 0}
						<tr style="border-top:1px solid var(--border);">
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
				onkeydown={(e) => e.stopPropagation()}
			>
				<div style="display:flex;align-items:center;gap:8px;margin-bottom:8px;">
					<h2 style="margin:0;font-size:15px;">
						Scegli un <span style="color:var(--cyan);">{picker.etichetta ?? picker.ruolo}</span>
						<span class="muted" style="font-weight:400;font-size:12px;">· {picker.linea}</span>
					</h2>
					<button style="margin-left:auto;font-size:11px;" onclick={() => (picker = null)}>Chiudi ✕</button>
				</div>
				<div style="overflow:auto;max-height:60vh;">
					{#each candidatiPicker as g (g.chiave)}
						{@const cons = asta.valutazione(g).fascia.riferimento}
						{@const def = prezzoDefault(g, cons)}
						<button class="row-player" onclick={() => aggiungiDaPicker(g)}>
							<RoleTag ruolo={g.ruolo} ruoloMantra={g.ruoloMantra} />
							<Crest nome={g.squadra} size={15} />
							<strong>{g.nome}</strong><span class="muted">{g.squadra}</span>
							{#if g.fc?.expectedTitolarita}<span class="mono" style="font-size:10px;color:{g.fc.expectedTitolarita >= 70 ? 'var(--ok)' : g.fc.expectedTitolarita >= 45 ? 'var(--warn)' : 'var(--bad)'};">{Math.round(g.fc.expectedTitolarita)}%</span>{/if}
							<span class="muted mono" style="margin-left:auto;">
								{#if g.fantalab?.prezzo_atteso}FL {g.fantalab.prezzo_atteso} · {/if}cons. {cons} → <span style="color:var(--cyan);">{def}</span>
							</span>
						</button>
					{:else}
						<p class="muted" style="font-size:12px;">Nessun giocatore disponibile per questo ruolo.</p>
					{/each}
				</div>
			</div>
		</div>
	{/if}
{:else}
	<div class="panel"><button class="primary" onclick={() => (attivo = asta.nuovoScenario())}>Crea il primo piano</button></div>
{/if}

<style>
	.campo-wrap {
		display: flex;
		gap: 16px;
		align-items: flex-start;
		flex-wrap: wrap;
	}
	.campo-side {
		flex: 1 1 220px;
		min-width: 200px;
		display: flex;
		flex-direction: column;
		gap: 14px;
	}
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
</style>
