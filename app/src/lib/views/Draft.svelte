<script lang="ts">
	import { flip } from 'svelte/animate';
	import { asta } from '$lib/stores/auction.svelte';
	import { normalizzaNome } from '$lib/engine/names';
	import { MOLTIPLICATORI_FLAG_MANUALE } from '$lib/engine/pricing';
	import { ORDINE_RUOLI_MANTRA, MODULI_MANTRA, assegnaGiocatoriModulo } from '$lib/engine/mantra';
	import {
		buildCampoClassic,
		buildCampoMantra,
		MODULI_CLASSIC,
		repartoDifensivoMantra,
		analisiFattoreDifensivo,
		type GiocatoreCampo
	} from '$lib/campo';
	import { ricambiMantraDaModuli, ricambiClassicDa } from '$lib/ricambi';
	import { coperturaGiocatoreModuli, famigliaDelModulo, spiegaSceltaModulo } from '$lib/mantraHints';
	import EditPurchase from '$lib/ui/EditPurchase.svelte';
	import RoleTag from '$lib/ui/RoleTag.svelte';
	import Crest from '$lib/ui/Crest.svelte';
	import BudgetBar from '$lib/ui/BudgetBar.svelte';
	import FormationPitch from '$lib/ui/FormationPitch.svelte';
	import Jersey, { kitColore } from '$lib/ui/Jersey.svelte';
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

	let live = $state(true);
	let analisiAperta = $state(false);
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
		// senza ricerca né filtro ruolo mostra i 40 più quotati; appena filtri, tutti.
		const limite = q || ruoloFiltro !== 'TUTTI' ? 300 : 40;
		return [...list].sort((a, b) => b.quotazione - a.quotazione).slice(0, limite);
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
				fantamedia: a.player?.fc?.expectedFantamedia ?? null,
				stato: 'PRESO'
			})
		)
	);
	const campoMio = $derived(
		asta.isMantra ? buildCampoMantra(campoInputMio, moduloMio) : buildCampoClassic(campoInputMio, moduloMio)
	);
	/** Slot del reparto difensivo (modificatore difesa) sul modulo disegnato. */
	const repartoDifMio = $derived(asta.isMantra ? repartoDifensivoMantra(campoMio) : []);
	const fattoreDif = $derived(
		asta.isMantra
			? analisiFattoreDifensivo(
					campoMio,
					selezionato
						? {
								nome: selezionato.nome,
								fantamedia: selezionato.fc?.expectedFantamedia ?? 0,
								ruoloMantra: selezionato.ruoloMantra
							}
						: undefined
				)
			: null
	);
	/** Moduli su cui ragionano "ruoli da coprire" e "ricambi": in Mantra tutti i
	 *  target impostati (la famiglia), non solo quello disegnato in campo. */
	const moduliRagionamento = $derived(
		asta.isMantra ? asta.moduliTargetValidi : [moduloMio]
	);
	/** Slot ancora scoperti: in Classic sul modulo scelto, in Mantra come unione
	 *  degli slot mancanti su tutti i moduli target. */
	const ruoliDaCoprireMio = $derived.by(() => {
		const m = new Map<string, { etichetta: string; linea: string; n: number }>();
		if (asta.isMantra) {
			const rosaInput = asta.rosaMantraInput(asta.miaSquadra);
			for (const modulo of moduliRagionamento) {
				const esito = assegnaGiocatoriModulo(rosaInput, modulo);
				const perSlot = new Map<string, number>();
				for (const s of esito.mancanti) perSlot.set(s, (perSlot.get(s) ?? 0) + 1);
				for (const [etichetta, n] of perSlot) {
					const cur = m.get(etichetta) ?? { etichetta, linea: modulo, n: 0 };
					// tieni il massimo tra i moduli: se 3-5-2 chiede 2 A/Pc e 3-4-3 ne chiede 1
					cur.n = Math.max(cur.n, n);
					if (!m.has(etichetta)) cur.linea = 'target';
					m.set(etichetta, cur);
				}
			}
			return [...m.values()];
		}
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
			? ricambiMantraDaModuli(
					campoInputMio.map((g) => g.ruoloMantra),
					asta.config.limiti.TOT,
					moduliRagionamento,
					asta.config.limiti.P
				)
			: ricambiClassicDa(campoInputMio.map((g) => g.ruolo), asta.config.limiti)
	);

	// --- guida Mantra (primo anno): apri/chiudi ricordato ---
	let guidaAperta = $state(false);
	try {
		guidaAperta = localStorage.getItem('fantatool.guidaMantra') !== 'chiusa';
	} catch {
		guidaAperta = true;
	}
	function toggleGuida() {
		guidaAperta = !guidaAperta;
		try {
			localStorage.setItem('fantatool.guidaMantra', guidaAperta ? 'aperta' : 'chiusa');
		} catch {
			/* ignora */
		}
	}
	/** Quanto è "jolly" un giocatore sui moduli target. */
	const coperturaMantraDi = (rm: unknown) =>
		coperturaGiocatoreModuli(rm, asta.moduliTargetValidi);

	const ultimiAcquisti = $derived(
		[...asta.acquisti].sort((a, b) => b.ordine - a.ordine).slice(0, 8)
	);

	// Squadre ordinate per crediti residui: chi ne ha di più in alto.
	const squadreOrdinate = $derived(
		[...asta.config.squadre].sort((a, b) => {
			const ba = asta.bilanci[a.nome];
			const bb = asta.bilanci[b.nome];
			return (bb?.c_rimasti ?? 0) - (ba?.c_rimasti ?? 0) || (ba?.g_presi ?? 0) - (bb?.g_presi ?? 0);
		})
	);
	const consigliatoRapido = (g: Giocatore) =>
		g.fantalab?.prezzo_atteso || g.fc?.pma || g.quotazione || 1;

	function daTastiera(e: KeyboardEvent) {
		const t = e.target as HTMLElement | null;
		if (asta.altraSchedaAttiva || t?.closest('dialog')) return;
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

	// Parte pesante: ricalcolata solo al cambio giocatore / flag / stato asta.
	const valBase = $derived.by(() =>
		selezionato
			? asta.valutazioneBase(selezionato, { flagOverride: flagScelto || undefined })
			: null
	);
	// Parte leggera: solo la decisione segue il prezzo live a ogni +/-.
	const val = $derived(
		valBase ? { ...valBase, decisione: asta.decisionePrezzo(valBase, prezzoInput) } : null
	);

	const operation = $derived(selezionato ? asta.controllaAcquisto(selezionato, prezzoInput, proprietarioScelto) : null);
	const ownOperation = $derived(selezionato ? asta.controllaAcquisto(selezionato, prezzoInput, asta.miaSquadra) : null);
	const kit = $derived(selezionato ? kitColore(selezionato.squadra) : '#555c68');
	const capienzaAsta = $derived(Math.max(1, asta.config.squadre.length * asta.config.limiti.TOT));
	const avanzamentoAsta = $derived(Math.min(100, Math.round((asta.acquisti.length / capienzaAsta) * 100)));
	const faseAsta = $derived.by(() => {
		if (avanzamentoAsta < 34)
			return { nome: 'Apertura', nota: 'Costruisci le fondamenta', tono: 'open' };
		if (avanzamentoAsta < 72)
			return { nome: 'Partita centrale', nota: 'Il budget decide il ritmo', tono: 'middle' };
		return { nome: 'Finale', nota: 'Ogni credito pesa', tono: 'final' };
	});

	// Lampo "aggiudicato" dopo un'assegnazione: informativo, non bloccante.
	let aggiudicato = $state<{ nome: string; club: string; team: string; prezzo: number; kit: string } | null>(null);
	let aggiudicatoTimer: ReturnType<typeof setTimeout> | undefined;
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
			const g = selezionato;
			const prezzo = prezzoInput;
			const team = proprietarioScelto;
			asta.assegna(g, prezzo, team);
			aggiudicato = { nome: g.nome, club: g.squadra, team, prezzo, kit: kitColore(g.squadra) };
			clearTimeout(aggiudicatoTimer);
			aggiudicatoTimer = setTimeout(() => (aggiudicato = null), 1600);
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

{#if aggiudicato}
	<div class="aggiudicato" style="--kit:{aggiudicato.kit};" role="status">
		<span class="agg-stamp">Aggiudicato</span>
		<span class="agg-name">{aggiudicato.nome}</span>
		<span class="agg-line"><Crest nome={aggiudicato.club} size={16} /> → {aggiudicato.team}</span>
		<span class="agg-price">{aggiudicato.prezzo}<small> cr</small></span>
	</div>
{/if}

{#if asta.isMantra && !live}
	<div class="panel" style="margin-bottom:16px;border-color:color-mix(in srgb, var(--accent) 30%, var(--border));">
		<button
			onclick={toggleGuida}
			style="width:100%;text-align:left;background:transparent;border:none;padding:0;display:flex;align-items:center;gap:8px;cursor:pointer;color:var(--text-strong);"
		>
			<span style="font-size:13px;">{guidaAperta ? '▾' : '▸'}</span>
			<strong style="font-size:14px;">Guida Mantra · primo anno</strong>
			<span class="muted" style="margin-left:auto;font-size:11px;">
				{guidaAperta ? 'nascondi' : 'mostra'}
			</span>
		</button>
		{#if guidaAperta}
			<div style="font-size:12px;line-height:1.55;margin-top:8px;display:grid;gap:6px;">
				<div>
					<strong>Notazione slot.</strong> <code>Dc/B</code> = lo slot accetta un centrale
					<em>o</em> un braccetto; <code>W/A</code> = ala <em>o</em> attaccante. Uno slot
					"ibrido" a cavallo di due reparti pesa metà su ciascuno nel calcolo dei ricambi.
				</div>
				<div>
					<strong>Ragiona per famiglia di moduli, non per uno solo.</strong> Imposta 2–3 moduli
					target compatibili (in Serie A → Impostazioni): la rosa va costruita per coprirli
					tutti, così un infortunio o un cambio modulo non ti blocca.
				</div>
				<div>
					<strong>La polivalenza vale più del punteggio.</strong> Un <code>Dd;E</code> o
					<code>M;C</code> copre slot su più linee e più moduli: in lista trovi l'indicatore
					<span class="jolly">🔗 jolly</span>. Pagali un sovrapprezzo.
				</div>
				<div>
					<strong>Ruoli rari:</strong> i <code>T</code> (trequartisti) e i <code>Pc</code>
					(punte centrali pure) sono pochi. Se un modulo target li richiede, prendi titolare
					+ riserva presto — il pannello "Ruoli chiave scoperti" te lo ricorda.
				</div>
				<div>
					<strong>Difesa a 3 o a 4?</strong> Deciditi presto: a 3 servono <code>Dc/B</code>
					e tanti <code>E</code>; a 4 servono <code>Dd</code>/<code>Ds</code> di ruolo.
				</div>
			</div>
		{/if}
	</div>
{/if}

<section class="market-header" aria-label="Panoramica dell’asta">
	<div class="market-title"><span class="eyebrow">{#if live}<span class="live-badge">Live</span>{:else}<i></i>{/if} {asta.config.modalita} / {asta.config.stagione}</span><h2>{live ? 'Asta live' : 'Visione completa'}</h2><span class="market-caption">La prossima scelta fa la differenza.</span></div>
	<div class="market-stat"><span>Squadre</span><b>{asta.config.squadre.length.toString().padStart(2, '0')}</b></div>
	<div class="market-stat"><span>Acquisti registrati</span><b>{asta.acquisti.length}<small> / {capienzaAsta}</small></b><div class="market-progress"><i style:width={`${avanzamentoAsta}%`}></i></div></div>
	<div class="auction-phase" data-tone={faseAsta.tono} aria-label={`Fase d'asta: ${faseAsta.nome}, ${avanzamentoAsta}% completata`}>
		<div class="phase-dial"><span>{avanzamentoAsta}</span><small>%</small></div>
		<div><span>Fase d'asta</span><b>{faseAsta.nome}</b><small>{faseAsta.nota}</small></div>
	</div>
	<button class="view-switch" aria-pressed={live} onclick={() => live = !live}>{live ? 'Apri vista completa' : 'Torna ad asta live'} <span aria-hidden="true">↗</span></button>
</section>
<div class="draft-grid" class:live>

	<!-- SINISTRA: ricerca + consiglio -->
	<div style="display:flex;flex-direction:column;gap:16px;">
		<div class="panel search-panel">
			<div class="section-eyebrow">SCOUTING <span>Cerca la prossima chiamata</span></div>
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
			<div bind:this={listaEl} style="max-height:{live && selezionato ? 72 : 280}px;overflow:auto;">
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
						{#if asta.isMantra}
							{@const cop = coperturaMantraDi(g.ruoloMantra)}
							{#if cop.ponte}
								<span class="jolly" title="Jolly: copre slot su {cop.linee.join(', ')} — {cop.slotCompatibili}/{cop.slotTotali} slot nei moduli target">🔗 {cop.slotCompatibili}</span>
							{:else if cop.slotCompatibili >= Math.max(3, cop.slotTotali * 0.35)}
								<span class="jolly jolly--soft" title="{cop.slotCompatibili}/{cop.slotTotali} slot nei moduli target">{cop.slotCompatibili}</span>
							{/if}
						{/if}
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
			{#if query === '' && ruoloFiltro === 'TUTTI' && risultati.length >= 40}
				<div class="muted" style="font-size:10px;margin-top:4px;">
					Mostrati i 40 più quotati · scrivi un nome o scegli un ruolo per vedere tutti gli altri (tab <b>Liberi</b> per la lista completa)
				</div>
			{/if}
		</div>
		{#if selezionato && val}
			{@const sc = val.scarsita.livello === 'CRITICA' ? 'CRITICO' : val.scarsita.livello === 'ALTA' ? 'ATTENZIONE' : 'OK'}
			<div class="panel active-player" style="--kit:{kit};border-color:color-mix(in srgb, {coloreAzione(val.decisione.azione)} 55%, var(--border));">
				<span class="kit-watermark" aria-hidden="true"><Jersey club={selezionato.squadra} size={150} /></span>
				<div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;position:relative;">
					<span class="club-medallion"><Crest nome={selezionato.squadra} size={30} /></span>
					<div class="player-heading"><span>GIOCATORE IN CHIAMATA</span><h2>{selezionato.nome}</h2></div>
					<RoleTag ruolo={selezionato.ruolo} ruoloMantra={selezionato.ruoloMantra} />
					<span class="muted">{selezionato.squadra}</span>
					{#if !live}<span class="mono muted" style="margin-left:auto;font-size:11px;">
						Qt {selezionato.quotazione}{#if selezionato.fc}· PMA {selezionato.fc.pma} · PFC {selezionato.fc.pfc} · Slot {selezionato.fc.slot ?? '—'} · tit {Math.round(selezionato.fc.expectedTitolarita)}%{/if}{#if selezionato.fantalab}· FL {selezionato.fantalab.prezzo_atteso} ({selezionato.fantalab.pma_pct}%){/if}
					</span>{/if}
					<button style="margin-left:auto;font-size:11px;" onclick={() => selezionato = null}>Cambia giocatore</button>
				</div>

				{#if selezionato.ballottaggio}
					<div class="ballottaggio-callout" aria-label={`Ballottaggio con ${selezionato.ballottaggio.contendente}`}>
						<span class="ballottaggio-callout__icon" aria-hidden="true">⏱</span>
						<div>
							<span class="ballottaggio-callout__eyebrow">Ballottaggio {selezionato.ballottaggio.rischio}</span>
							<strong>Si gioca il posto con {selezionato.ballottaggio.contendente}</strong>
							<small>Titolarità stimata <b>{Math.round(selezionato.ballottaggio.expectedTitolarita)}%</b> · rilevato il {selezionato.ballottaggio.rilevatoIl.slice(0, 10).split('-').reverse().join('/')}</small>
						</div>
					</div>
				{/if}

				<div class="price-grid">
					<div><span>Valore di riferimento</span><b>{val.fascia.riferimento} <small>cr</small></b><small>Stima · {val.fonte}</small></div>
					<div><span>Limite strategico · tua squadra</span><b>{val.poteri.strategico} <small>cr</small></b><small>Consiglio per distribuire il budget</small></div>
					<div><span>Massimo da budget · {proprietarioScelto}</span><b>{operation?.maximum ?? 0} <small>cr</small></b><small>Conserva 1 credito per ogni posto restante</small></div>
				</div>
				<div class="decision-summary">
					<span class="pill {pillClass(val.decisione.azione)}">{val.decisione.azione}</span>
					<b>Per la tua squadra: {val.decisione.motivo}</b>
					{#if val.mantra?.delta_copertura}<span>Copertura dei moduli: +{val.mantra.delta_copertura}.</span>{:else if val.mantra}<span>Non aumenta la copertura dei moduli target.</span>{/if}
					{#if ownOperation}<span>A {prezzoInput ?? '—'} crediti, ti resterebbero {ownOperation.remainingAfter} crediti per {Math.max(0, ownOperation.slots - 1)} posti.</span>{/if}
				</div>
				<p class="source-note">Fonte della stima: <b>{val.fonte}</b>.
					{#if val.fonte === 'PMA'}Valore editoriale, adattato alla situazione dell’asta.
					{:else if val.fonte === 'PFC'}Confronto PFC: riferimento PMA non disponibile.
					{:else if val.fonte === 'FANTALAB'}Percentuale Fantalab scelta dal motore e rapportata al tuo budget; il PMA Fantacrediti resta un confronto separato.
					{:else}Stima sostitutiva: PMA/PFC non disponibili. Trattala con maggiore cautela.{/if}
					{#if !selezionato.fc?.expectedTitolarita} Dato di titolarità non disponibile o pari a zero.{/if}
				</p>
				{#if !live}

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
					{@const cop = coperturaMantraDi(selezionato.ruoloMantra)}
					<div style="border:1px solid var(--border);border-radius:6px;padding:6px 8px;margin-bottom:10px;font-size:12px;">
						<strong>Mantra</strong> · ruoli {selezionato.ruoloMantra || '—'} · Δ copertura:
						<span style:color={val.mantra.delta_copertura > 0 ? 'var(--ok)' : 'var(--muted)'}>{val.mantra.delta_copertura > 0 ? '+' : ''}{val.mantra.delta_copertura}</span>
						{#if val.mantra.nuovi_moduli_completi.length}· completa: {val.mantra.nuovi_moduli_completi.join(', ')}{/if}
						<div class="muted" style="font-size:11px;">
							{val.mantra.per_modulo.map((m) => `${m.modulo} ${m.delta >= 0 ? '+' : ''}${m.delta}${m.completato ? ' ✓' : ''}`).join(' · ')}
						</div>
						<div style="font-size:11px;margin-top:3px;">
							{#if cop.ponte}<span class="jolly">🔗 jolly</span> {/if}copre
							<b>{cop.slotCompatibili}/{cop.slotTotali}</b> slot dei moduli target
							{#if cop.linee.length}· linee: {cop.linee.join(', ')}{/if}
						</div>
					</div>
				{/if}

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
					<button class="primary" onclick={assegna} disabled={!!operation?.error}>Assegna →</button>
					<button
						title={asta.inCoda(selezionato.id) ? 'Togli dalla coda' : 'Aggiungi alla coda chiamate'}
						onclick={() => (asta.inCoda(selezionato!.id) ? asta.rimuoviCoda(selezionato!.id) : asta.aggiungiCoda(selezionato!.id))}
					>{asta.inCoda(selezionato.id) ? '★ in coda' : '☆ coda'}</button>
				</div>

				{#if operation?.error}<p role="alert" style="color:var(--bad);font-size:12px;">{operation.error}</p>
				{:else if operation}<p class="muted" style="font-size:12px;">{proprietarioScelto}: {operation.remaining} crediti disponibili · dopo l’acquisto {operation.remainingAfter} per {Math.max(0, operation.slots - 1)} posti.</p>{/if}
				{#if val.profili.length && !live}
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

		{#if live}<button class="analytics-toggle" aria-expanded={analisiAperta} onclick={() => analisiAperta = !analisiAperta}>{analisiAperta ? 'Nascondi analisi tattiche' : 'Apri analisi tattiche e chiusura'}</button>{/if}
		{#if !live || analisiAperta}

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
			{:else if ['PRESTO', 'ATTESA', 'ERRORE'].includes(cf.stato)}
				<div class="muted" style="font-size:11px;padding:0 4px;">Chiusura rosa: {cf.motivo}</div>
			{/if}
		{/if}

		{#if asta.isMantra}
			{@const am = asta.analisiMiaRosaMantra}
			{@const rosaInputMio = asta.rosaMantraInput(asta.miaSquadra)}
			{@const classificaModuli = [...am.moduli].sort(
				(a, b) => b.coperti - a.coperti || b.punteggio - a.punteggio || (a.modulo < b.modulo ? -1 : 1)
			)}
			{@const leaderMod = classificaModuli[0]}
			{@const famLeader = leaderMod ? famigliaDelModulo(leaderMod.modulo) : undefined}
			{@const targetSuggeriti = famLeader
				? classificaModuli.filter((m) => famLeader.moduli.includes(m.modulo)).slice(0, 3).map((m) => m.modulo)
				: leaderMod
					? [leaderMod.modulo]
					: []}
			{@const targetGiaAllineati =
				targetSuggeriti.length > 0 &&
				targetSuggeriti.every((m) => asta.config.moduliTarget.includes(m)) &&
				asta.config.moduliTarget.length === targetSuggeriti.length}
			<div class="panel">
				<h2 style="margin:0 0 6px;font-size:15px;">Il tuo modulo</h2>
				{#if leaderMod && am.giocatori > 0}
					<div style="font-size:13px;">
						<strong>{leaderMod.modulo}</strong> —
						<span style:color={leaderMod.completo ? 'var(--ok)' : 'var(--warn)'}>{leaderMod.coperti}/11</span>
						{#if famLeader}<span class="muted" style="font-size:11px;">· {famLeader.nome}</span>{/if}
						{#if am.portieri_mancanti}· <span style="color:var(--bad);">manca {am.portieri_mancanti} portiere</span>{/if}
					</div>
					<div class="muted" style="font-size:11px;margin:2px 0 4px;">
						{spiegaSceltaModulo(rosaInputMio, leaderMod.modulo)}
					</div>
					<div class="muted mono" style="font-size:11px;">
						poi: {classificaModuli
							.slice(1, 4)
							.map((m) => `${m.modulo} ${m.coperti}/11`)
							.join(' · ')}
					</div>
					{#if am.moduli_completi.length}
						<div class="muted" style="font-size:11px;margin-top:3px;">Già completi: {am.moduli_completi.join(', ')}</div>
					{/if}
					{#if targetSuggeriti.length && !targetGiaAllineati}
						<button
							style="font-size:11px;margin-top:6px;"
							onclick={() => (asta.config.moduliTarget = targetSuggeriti)}
							title="Allinea i moduli target (usati da Ricambi e Ruoli chiave) a quello che stai comprando"
						>
							Usa {targetSuggeriti.join(' / ')} come target
						</button>
					{:else if targetGiaAllineati}
						<div class="muted" style="font-size:11px;margin-top:5px;">✓ moduli target allineati</div>
					{/if}
				{:else}
					<div class="muted" style="font-size:12px;">Compra qualche giocatore: qui vedrai il modulo che ti rende di più.</div>
				{/if}
				<div class="muted" style="font-size:11px;margin-top:6px;border-top:1px solid var(--border);padding-top:4px;">
					target attuali: {asta.moduliTargetValidi
						.map((m) => `${m} ${am.moduli.find((x) => x.modulo === m)?.coperti ?? 0}/11`)
						.join(' · ')}
				</div>
			</div>

			{#if fattoreDif}
				<div class="panel">
					<h2 style="margin:0 0 6px;font-size:15px;">Fattore difensivo</h2>
					{#if fattoreDif.titolari.length}
						<div style="font-size:13px;">
							Media reparto <strong>{fattoreDif.media.toFixed(2)}</strong>
							<span
								style:color={fattoreDif.fascia.bonus >= 1.5
									? 'var(--ok)'
									: fattoreDif.fascia.bonus > 0
										? 'var(--warn)'
										: 'var(--bad)'}
							>· bonus {fattoreDif.fascia.testo} a giornata</span>
						</div>
						<div class="muted" style="font-size:11px;margin:2px 0 4px;">
							portiere + 5 arretrati ({campoMio.modulo}){#if fattoreDif.vuoti}
								· <span style="color:var(--warn);">{fattoreDif.vuoti} slot vuoti, media sui presenti</span>{/if}
						</div>
						<div style="display:flex;flex-wrap:wrap;gap:4px 10px;font-size:11px;">
							{#each fattoreDif.titolari as t}
								<span class="mono">
									{t.nome}
									<span
										style:color={t.fantamedia >= 6.25
											? 'var(--ok)'
											: t.fantamedia >= 6
												? 'var(--warn)'
												: 'var(--bad)'}
									>{t.fantamedia ? t.fantamedia.toFixed(2) : '—'}</span>
								</span>
							{/each}
						</div>
						{#if fattoreDif.conCandidato?.idoneo && selezionato}
							<div
								style="font-size:12px;margin-top:6px;border-top:1px solid var(--border);padding-top:5px;"
							>
								Se prendi <strong>{selezionato.nome}</strong>: media
								{fattoreDif.media.toFixed(2)} → <strong>{fattoreDif.conCandidato.media.toFixed(2)}</strong>
								{#if fattoreDif.conCandidato.fascia.testo !== fattoreDif.fascia.testo}
									<span style="color:var(--ok);">· {fattoreDif.fascia.testo} → {fattoreDif.conCandidato.fascia.testo}</span>
								{:else}
									<span class="muted">· resta {fattoreDif.fascia.testo}</span>
								{/if}
							</div>
						{/if}
					{:else}
						<div class="muted" style="font-size:12px;">
							Prendi portiere e difensori: qui vedrai la media voto del reparto e il bonus a giornata.
						</div>
					{/if}
					<div class="muted" style="font-size:10px;margin-top:5px;">
						fasce: &lt;6 → 0 · 6 → +0.5 · 6.25 → +1 · 6.5 → +1.5 · 6.75 → +2 · 7 → +2.5
						<br />voto stimato dalla fantamedia attesa (portiere +0.65 per i gol subiti)
					</div>
				</div>
			{/if}

			{#if asta.acquisti.some((a) => a.proprietario === asta.miaSquadra)}
				{@const fam = asta.raccomandazioneFamiglieMantra}
				{@const perni = asta.giocatoriPernoMantra}
				<div class="panel">
					<h2 style="margin:0 0 6px;font-size:15px;">Famiglia di moduli consigliata</h2>
					{#each fam as f, i}
						<div style="padding:6px 0;{i > 0 ? 'border-top:1px solid var(--border);opacity:0.75;' : ''}">
							<div style="display:flex;gap:8px;align-items:baseline;">
								<strong style="font-size:13px;">{f.nome}</strong>
								{#if i === 0}<span class="tag" style="color:var(--ok);">punta qui</span>{/if}
								<span class="muted mono" style="margin-left:auto;font-size:11px;">
									{f.moduloMigliore} {f.coperturaMax}/11{#if f.moduliCompleti.length} · {f.moduliCompleti.length} compl.{/if}
								</span>
							</div>
							{#if i === 0}
								<div class="muted" style="font-size:11px;margin:2px 0;">{f.descrizione}</div>
								{#if f.ruoliMancanti.length}
									<div style="font-size:11px;">Slot ancora scoperti: <span class="mono">{f.ruoliMancanti.slice(0, 8).join(' · ')}{f.ruoliMancanti.length > 8 ? ' …' : ''}</span></div>
								{/if}
							{/if}
						</div>
					{/each}
					{#if perni.length}
						<div style="border-top:1px solid var(--border);margin-top:4px;padding-top:6px;">
							<div class="muted" style="font-size:11px;margin-bottom:2px;">Giocatori-perno (tengono più moduli target):</div>
							{#each perni as p}
								<div style="font-size:12px;padding:1px 0;">
									<strong>{p.nome}</strong> <span class="muted">({p.ruoli})</span>
									<span class="mono muted" style="font-size:11px;">· {p.moduliSchierato}/{p.moduliTotali} moduli</span>
								</div>
							{/each}
						</div>
					{/if}
				</div>

				{@const alr = asta.allertaRuoliChiaveMantra}
				{#if alr.length}
					<div class="panel" style="border-color:{alr.some((a) => a.livello === 'CRITICO') ? 'var(--bad)' : 'var(--warn)'};">
						<h2 style="margin:0 0 4px;font-size:15px;">Ruoli chiave scoperti</h2>
						<div class="muted" style="font-size:11px;margin-bottom:4px;">
							Richiesti in modo rigido dai tuoi moduli target.
						</div>
						{#each alr.slice(0, 6) as a}
							<div style="font-size:12px;padding:2px 0;display:flex;gap:6px;align-items:center;">
								<span class="tag" style="color:{a.livello === 'CRITICO' ? 'var(--bad)' : 'var(--warn)'};">{a.ruolo}</span>
								<span>hai <b>{a.inRosa}</b>/{a.slotRichiesti}</span>
								<span class="muted" style="font-size:11px;">{a.moduli.join(', ')}</span>
								{#if a.scarsita && a.scarsita !== 'OK'}
									<span class="mono" style="margin-left:auto;color:var(--bad);font-size:11px;">mercato {a.scarsita}</span>
								{/if}
							</div>
						{/each}
						{#if alr.length > 6}<div class="muted" style="font-size:11px;">+{alr.length - 6} altri</div>{/if}
					</div>
				{/if}
			{/if}

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
				<div style="flex:1 1 320px;min-width:0;">
					<FormationPitch linee={campoMio.linee} titolo={campoMio.modulo} evidenzia={repartoDifMio} />
					{#if repartoDifMio.length}
						<div class="muted" style="font-size:11px;text-align:center;margin-top:3px;">
							<span style="color:var(--ok);">▬</span> reparto del modificatore difesa · portiere + 5 arretrati
						</div>
					{/if}
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
						<h3 style="margin:0 0 6px;font-size:13px;">Ruoli da coprire <span class="muted mono" style="font-size:11px;">· {asta.isMantra ? moduliRagionamento.join(' / ') : moduloMio}</span></h3>
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
							<p class="muted" style="font-size:12px;margin:0;">XI completo{asta.isMantra ? ' su tutti i moduli target' : ' per questo modulo'}. ✓</p>
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
							{#if asta.isMantra}quanti tenerne per profilo sui moduli target {moduliRagionamento.join(' / ')} · tabella BABBOFANTACALCIO scalata alla rosa da {asta.config.limiti.TOT} · un polivalente (es. Dd;E) conta in ogni profilo{:else}giocatori per reparto per la rosa completa{/if}
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
						{#if asta.isMantra && ricambiMio.every((p) => p.mancanti === 0) && totalePianoMio < asta.config.limiti.TOT}
							<div class="muted" style="font-size:10px;margin-top:5px;border-top:1px solid var(--border);padding-top:4px;">
								Tutti i profili coperti con <b>{totalePianoMio}</b> giocatori (i polivalenti contano
								su più profili). Restano <b>{asta.config.limiti.TOT - totalePianoMio}</b> slot
								che nessun ruolo richiede: riserve extra o scommesse.
							</div>
						{/if}
					</div>
				</div>
			</div>
		</div>

		{/if}

		<div class="panel league-card">
			<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">
				<h2 style="margin:0;font-size:16px;">Squadre</h2>
				<div style="display:flex;gap:6px;">
					<button disabled={!asta.puoiAnnullare} title="Annulla (Cmd+Z)" onclick={() => asta.annulla()}>↩︎ Annulla</button>
					<button disabled={!asta.puoiRipetere} title="Ripeti (Cmd+Shift+Z)" onclick={() => asta.ripeti()}>↪︎ Ripeti</button>
				</div>
			</div>
			{#each squadreOrdinate as sq, i (sq.nome)}
				{@const b = asta.bilanci[sq.nome]}
				{@const primo = i === 0}
				{@const ultimo = i === squadreOrdinate.length - 1}
				<div
					animate:flip={{ duration: 160 }}
					class="league-row"
					style="padding:7px 0 7px 8px;border-top:1px solid var(--border);border-left:3px solid {asta.coloreDi(sq.nome)};margin-left:-8px;"
				>
					<div style="display:flex;align-items:center;gap:7px;font-size:13px;">
						<span class="rank">{String(i + 1).padStart(2, '0')}</span>
						<Crest nome={sq.stemma || sq.nome} tipo="stemmi" size={18} />
						<span style={sq.isMia ? 'font-weight:700;color:var(--text-strong);' : ''}>{sq.nome}</span>
						{#if sq.isMia}<span style="color:var(--accent);">★</span>{/if}
						{#if primo && asta.avviata}<span class="tag" style="color:var(--ok);font-size:10px;">💰 più crediti</span>
						{:else if ultimo && asta.avviata}<span class="tag muted" style="font-size:10px;">meno crediti</span>{/if}
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
						<span>{a.nome}</span><EditPurchase acquisto={a} />
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
							<span>{a.nome}</span><EditPurchase acquisto={a} />
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
	.jolly {
		font: 600 10px/1 var(--mono);
		background: color-mix(in srgb, var(--cyan) 18%, transparent);
		color: var(--cyan);
		border: 1px solid color-mix(in srgb, var(--cyan) 45%, transparent);
		border-radius: 4px;
		padding: 2px 4px;
		white-space: nowrap;
	}
	.jolly--soft {
		background: var(--tag-bg);
		color: var(--muted);
		border-color: var(--border-strong);
	}
	code {
		font: 600 11px/1.4 var(--mono);
		background: var(--tag-bg);
		border-radius: 3px;
		padding: 0 3px;
	}

	.draft-grid { display:grid; grid-template-columns:minmax(0,1.3fr) minmax(0,1fr); gap:16px; align-items:start; }
	.price-grid { display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); gap:8px; margin:14px 0; }
	.price-grid > div { padding:12px; border:1px solid var(--border); border-radius:12px; background:var(--panel-3); }
	.price-grid span, .price-grid small { display:block; font-size:10px; color:var(--muted); }
	.price-grid b { display:block; font:700 46px/1 var(--display); letter-spacing:0.5px; color:var(--text-strong); margin:6px 0; }
	.price-grid b small { display:inline; }
	.decision-summary { display:flex; flex-direction:column; align-items:flex-start; gap:6px; font-size:12px; }
	.source-note { font-size:11px; color:var(--muted); line-height:1.5; }
	@media (max-width:850px) { .draft-grid { grid-template-columns:1fr; } }
	@media (max-width:480px) { .price-grid { grid-template-columns:1fr; } }

	.market-header { position:relative; overflow:hidden; display:flex; align-items:center; gap:30px; margin:2px 0 18px; padding:18px 22px; border-radius:16px; border:1px solid var(--border-strong); border-bottom:3px solid color-mix(in srgb,var(--accent) 60%,var(--border)); background:linear-gradient(115deg,var(--panel-2) 0%,var(--panel) 55%,color-mix(in srgb,var(--panel-2) 88%,var(--accent)) 100%); box-shadow:var(--shadow); }
	.market-header::before { content:''; position:absolute; inset:0; pointer-events:none; background:linear-gradient(105deg,transparent 58%,color-mix(in srgb,var(--accent) 14%,transparent) 72%,transparent 86%); }
	.market-header::after { content:''; position:absolute; pointer-events:none; width:180px; height:180px; border:2px solid color-mix(in srgb,var(--accent) 14%,transparent); border-radius:50%; right:170px; top:-72px; }
	.market-title { margin-right:auto; position:relative; }
	.market-title h2 { display:block; font:700 42px/0.9 var(--display); text-transform:uppercase; letter-spacing:0.5px; margin:6px 0 5px; }
	.eyebrow { display:inline-flex; align-items:center; gap:8px; font:700 10px/1 var(--display); letter-spacing:2px; text-transform:uppercase; color:var(--muted); }
	.eyebrow i { width:6px; height:6px; border-radius:50%; background:var(--accent); }
	.market-caption { font-size:11px; color:var(--muted); }
	.market-stat { min-width:70px; position:relative; z-index:1; }
	.market-stat > span { display:block; font-size:10px; color:var(--muted); margin-bottom:4px; text-transform:uppercase; letter-spacing:0.6px; }
	.market-stat b { font:700 36px/1 var(--display); letter-spacing:0.5px; color:var(--text-strong); }
	.market-stat small { font-size:13px; font-weight:500; color:var(--muted); }
	.market-progress { height:3px; background:var(--border); margin-top:6px; border-radius:5px; overflow:hidden; }
	.market-progress i { display:block; height:100%; background:var(--accent); }
	.auction-phase { --phase:var(--accent); min-width:158px; display:flex; align-items:center; gap:9px; position:relative; z-index:1; padding:7px 10px 7px 7px; border:1px solid color-mix(in srgb,var(--phase) 35%,var(--border)); border-radius:11px; background:color-mix(in srgb,var(--phase) 7%,var(--panel-3)); }
	.auction-phase[data-tone='middle'] { --phase:var(--cyan); }
	.auction-phase[data-tone='final'] { --phase:#ffbd61; }
	.phase-dial { width:40px; height:40px; flex:none; display:flex; align-items:baseline; justify-content:center; position:relative; border:2px solid color-mix(in srgb,var(--phase) 65%,var(--border)); border-radius:50%; color:var(--phase); background:radial-gradient(circle at 50% 45%,color-mix(in srgb,var(--phase) 19%,var(--panel-2)),var(--panel-3) 68%); }
	.phase-dial::before { content:''; position:absolute; inset:3px; border-top:2px solid var(--phase); border-radius:50%; transform:rotate(32deg); opacity:.9; }
	.phase-dial span { font:700 17px/40px var(--display); letter-spacing:-.2px; }
	.phase-dial small { margin-left:1px; font:700 8px var(--display); }
	.auction-phase > div:last-child { display:grid; gap:1px; }
	.auction-phase > div:last-child > span { font:700 8px/1 var(--display); letter-spacing:1.2px; color:var(--muted); text-transform:uppercase; }
	.auction-phase b { font:700 16px/1 var(--display); letter-spacing:.3px; text-transform:uppercase; color:var(--text-strong); }
	.auction-phase > div:last-child small { font-size:9px; color:var(--muted); white-space:nowrap; }
	.view-switch { position:relative; font-size:11px; margin-left:14px; }
	.view-switch span { margin-left:14px; color:var(--accent); }
	.section-eyebrow { display:flex; justify-content:space-between; margin:0 0 10px; font-size:9px; letter-spacing:1.5px; color:var(--accent); font-weight:750; }
	.section-eyebrow span { color:var(--muted); font-weight:400; text-transform:none; letter-spacing:0; font-size:10px; }
	.search-panel input { min-width:0; }
	.active-player { position:relative; overflow:hidden; border-width:1px; box-shadow:0 18px 50px -12px #0008, 0 0 0 1px color-mix(in srgb,var(--kit) 26%,transparent); background:linear-gradient(150deg, color-mix(in srgb,var(--kit) 26%,var(--panel)) 0%, var(--panel) 44%, var(--panel-3) 100%); }
	.active-player::after { content:''; position:absolute; inset:0 auto 0 0; width:5px; background:linear-gradient(180deg,var(--kit),color-mix(in srgb,var(--kit) 35%,transparent)); }
	.active-player > *:not(.kit-watermark) { position:relative; z-index:1; }
	.kit-watermark { position:absolute; z-index:0; top:-38px; right:-30px; opacity:0.22; transform:rotate(10deg); filter:drop-shadow(0 8px 22px #000a); pointer-events:none; }
	.club-medallion { display:flex; width:48px; height:48px; flex:none; align-items:center; justify-content:center; border:1px solid var(--border-strong); border-radius:12px; background:var(--panel-3); }
	.player-heading > span { font:700 8px/1 var(--display); letter-spacing:1.8px; color:var(--muted); text-transform:uppercase; }
	.player-heading h2 { display:block; margin:3px 0 0; font:700 32px/0.9 var(--display); text-transform:uppercase; letter-spacing:0.4px; }
	.ballottaggio-callout { display:flex; align-items:center; gap:10px; margin:14px 0 2px; padding:10px 12px; border:1px solid color-mix(in srgb,var(--warn) 52%,var(--border)); border-left:3px solid var(--warn); border-radius:10px; background:color-mix(in srgb,var(--warn) 10%,var(--panel-3)); }
	.ballottaggio-callout__icon { display:grid; place-items:center; width:31px; height:31px; flex:none; border-radius:8px; background:color-mix(in srgb,var(--warn) 18%,transparent); font-size:16px; }
	.ballottaggio-callout__eyebrow, .ballottaggio-callout small { display:block; font-size:10px; color:var(--muted); }
	.ballottaggio-callout__eyebrow { margin-bottom:2px; font:700 9px/1 var(--display); letter-spacing:1.2px; text-transform:uppercase; color:var(--warn); }
	.ballottaggio-callout strong { display:block; font-size:13px; color:var(--text-strong); }
	.ballottaggio-callout small { margin-top:3px; }
	.ballottaggio-callout small b { color:var(--warn); }
	.price-grid > div:first-child { background:linear-gradient(140deg,#d3fa8e,#b6ed68); border-color:#c7f789; }
	.price-grid > div:first-child b { color:#153016; }
	.price-grid > div:first-child span, .price-grid > div:first-child small { color:#34532b; }
	.price-grid > div:nth-child(2) { background:color-mix(in srgb,var(--cyan) 8%,var(--panel-3)); border-color:color-mix(in srgb,var(--cyan) 28%,var(--border)); }
	.price-grid > div:nth-child(2) b { color:var(--cyan); }
	.price-grid > div:nth-child(3) b { color:var(--text-strong); }
	.price-grid span { min-height:25px; line-height:1.25; }
	.decision-summary { border-left:2px solid var(--accent); padding-left:10px; margin:12px 0; }
	.source-note { margin:7px 0; font-size:10px; line-height:1.4; }
	.rank { font:600 11px var(--mono); color:var(--muted); width:20px; }
	.league-row:hover { background:var(--accent-soft); border-radius:6px; }
	.analytics-toggle { text-align:left; padding:12px 14px; color:var(--accent); font-size:11px; border-style:dashed; }
	@media (max-width:1000px) { .market-header { gap:20px; } .market-caption { display:none; } .market-title h2 { font-size:34px; } .view-switch { margin:0; } .auction-phase { display:none; } }
	@media (max-width:700px) { .market-header { flex-wrap:wrap; padding:15px; gap:15px; } .market-title { width:100%; } .view-switch { margin-left:auto; } .market-stat b { font-size:30px; } }

	/* Lampo "AGGIUDICATO" — appare a centro schermo dopo un'assegnazione. */
	.aggiudicato {
		position:fixed; left:50%; top:38%; z-index:200; transform:translate(-50%,-50%);
		display:grid; justify-items:center; gap:5px; padding:26px 46px;
		border-radius:18px; pointer-events:none; text-align:center;
		background:linear-gradient(150deg, color-mix(in srgb,var(--kit) 62%,#0a0a0a), #0c1712 80%);
		border:1px solid color-mix(in srgb,var(--kit) 55%,#fff);
		box-shadow:0 40px 100px -20px #000e, 0 0 0 1px #0007, 0 0 60px -10px color-mix(in srgb,var(--kit) 50%,transparent), inset 0 1px 0 #ffffff26;
		animation:agg-in 0.3s cubic-bezier(.2,1.4,.4,1) both, agg-out 0.4s ease-in 1.3s forwards;
	}
	.agg-stamp { font:700 13px/1 var(--display); letter-spacing:6px; text-transform:uppercase; color:#fff; opacity:.65; }
	.agg-name { font:700 40px/0.9 var(--display); text-transform:uppercase; letter-spacing:0.5px; color:#fff; }
	.agg-line { display:inline-flex; align-items:center; gap:7px; font:600 13px/1 var(--sans); color:#ffffffcc; }
	.agg-price { margin-top:2px; font:700 56px/0.85 var(--display); letter-spacing:1px; color:#fff; -webkit-text-stroke:2px color-mix(in srgb,var(--accent) 65%,transparent); }
	.agg-price small { -webkit-text-stroke:0; font-size:16px; opacity:.7; margin-left:2px; }
	@keyframes agg-in { from { opacity:0; transform:translate(-50%,-50%) scale(0.82) rotate(-4deg); } to { opacity:1; transform:translate(-50%,-50%) scale(1) rotate(-2deg); } }
	@keyframes agg-out { to { opacity:0; transform:translate(-50%,-62%) scale(0.96) rotate(-2deg); } }
	@media (prefers-reduced-motion:reduce) { .aggiudicato { animation:none; } }

</style>
