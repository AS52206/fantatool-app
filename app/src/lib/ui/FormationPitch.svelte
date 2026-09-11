<script lang="ts">
	import Jersey from '$lib/ui/Jersey.svelte';

	export interface RiservaCampo {
		chiave?: string;
		nome: string;
		club?: string;
		ruolo?: string;
		titolarita?: number | null;
		prezzo?: number | null;
		punteggio?: number;
	}
	export interface SlotCampo {
		etichetta?: string;
		nome?: string;
		club?: string;
		ruolo?: string;
		prezzo?: number | null;
		titolarita?: number | null;
		pmaFl?: number | null;
		fantamedia?: number | null;
		stato?: 'PRESO' | 'LIBERO' | 'VUOTO';
		/** Riserve che coprono questo slot, dalla più forte. */
		riserve?: RiservaCampo[];
	}
	export interface LineaCampo {
		nome: string;
		slot: SlotCampo[];
	}

	let {
		linee,
		titolo = '',
		onSlotVuoto,
		evidenzia = []
	}: {
		linee: LineaCampo[];
		titolo?: string;
		onSlotVuoto?: (info: { ruolo?: string; etichetta?: string; linea: string }) => void;
		/** Indici piatti degli slot da evidenziare (contorno verde + linea). */
		evidenzia?: number[];
	} = $props();

	// offset dell'indice piatto per ogni linea (per mappare slot → indice globale)
	const offsets = $derived.by(() => {
		const o: number[] = [];
		let acc = 0;
		for (const l of linee) {
			o.push(acc);
			acc += l.slot.length;
		}
		return o;
	});
	const evSet = $derived(new Set(evidenzia));
	type DettaglioGiocatore = {
		nome: string;
		club?: string;
		ruolo?: string;
		titolarita?: number | null;
		prezzo?: number | null;
		tipo: 'TITOLARE' | 'RICAMBIO';
		riserve?: RiservaCampo[];
	};
	let dettaglio = $state<DettaglioGiocatore | null>(null);

	function mostraTitolare(s: SlotCampo) {
		if (!s.nome) return;
		dettaglio = {
			nome: s.nome,
			club: s.club,
			ruolo: s.ruolo ?? s.etichetta,
			titolarita: s.titolarita,
			prezzo: s.prezzo,
			tipo: 'TITOLARE',
			riserve: s.riserve
		};
	}
	function mostraRiserva(r: RiservaCampo) {
		dettaglio = { ...r, tipo: 'RICAMBIO' };
	}

	let frameEl: HTMLDivElement | undefined = $state();
	let linePts = $state('');

	function misura() {
		if (!frameEl || evidenzia.length < 2) {
			linePts = '';
			return;
		}
		const fb = frameEl.getBoundingClientRect();
		// gli slot evidenziati sono nel DOM in ordine piatto (porta → attacco)
		const els = [...frameEl.querySelectorAll<HTMLElement>('.slot.evid')];
		const pts = els.map((el) => {
			const r = el.getBoundingClientRect();
			return `${(r.left + r.width / 2 - fb.left).toFixed(1)},${(r.top + 24 - fb.top).toFixed(1)}`;
		});
		linePts = pts.length >= 2 ? pts.join(' ') : '';
	}

	$effect(() => {
		// dipendenze: rimisura quando cambiano modulo / rosa / evidenziati
		void linee;
		void evidenzia;
		void evSet;
		void frameEl;

		// il chain di derived + il layout (font, maglie) si assestano dopo il
		// primo paint: rimisura a più riprese finché gli slot .evid ci sono.
		const timers = [0, 50, 150, 400].map((ms) => setTimeout(misura, ms));
		const raf = requestAnimationFrame(misura);

		let ro: ResizeObserver | undefined;
		if (frameEl && typeof ResizeObserver !== 'undefined') {
			ro = new ResizeObserver(() => misura());
			ro.observe(frameEl);
		}
		return () => {
			timers.forEach(clearTimeout);
			cancelAnimationFrame(raf);
			ro?.disconnect();
		};
	});

	const colStato: Record<string, string> = {
		PRESO: 'var(--ok)',
		LIBERO: 'var(--cyan)',
		VUOTO: 'var(--border-strong)'
	};
	const titColor = (t: number) => (t >= 70 ? 'var(--ok)' : t >= 45 ? 'var(--warn)' : 'var(--bad)');
</script>

<div class="pitch">
	<div class="pitch-frame" bind:this={frameEl}>
		<span class="mark circle"></span>
		<span class="mark halfway"></span>
		{#if titolo}<div class="pitch-title">{titolo}</div>{/if}
		{#if linePts}
			<svg class="reparto-svg" aria-hidden="true"><polyline points={linePts} /></svg>
		{/if}
		<div class="lines">
			{#each linee as linea, li}
				<div class="line" style="--n:{linea.slot.length};">
					{#each linea.slot as s, si}
						{@const st = s.stato ?? 'VUOTO'}
						{@const fi = offsets[li] + si}
						<div class="slot" class:libero={st === 'LIBERO'} class:evid={evSet.has(fi)}>
							{#if s.nome}
								<button class="slot-player" type="button" onclick={() => mostraTitolare(s)} aria-label={`Mostra ${s.nome}, ${s.ruolo ?? s.etichetta ?? 'ruolo non disponibile'}`}>
									<div class="kit">
										<Jersey club={s.club} size={44} />
										<span class="dot" style="background:{colStato[st]};"></span>
									</div>
									<div class="name">{s.nome}</div>
									<div class="sub">
										{#if s.etichetta}<span class="muted">{s.etichetta}</span>{/if}
										{#if s.prezzo != null}<span style="color:var(--cyan);">{s.prezzo}</span>{/if}
										{#if s.titolarita != null && s.titolarita > 0}<span style="color:{titColor(s.titolarita)};">{Math.round(s.titolarita)}%</span>{/if}
									</div>
								</button>
								{#if s.riserve?.length}
									<div
										class="riserve"
										title={'Riserve: ' +
											s.riserve
												.map(
													(r) =>
														r.nome +
														(r.ruolo ? ` (${r.ruolo})` : '') +
														(r.titolarita ? ` ${Math.round(r.titolarita)}%` : '')
												)
												.join(' · ')}
									>
										{#each s.riserve.slice(0, 4) as r, ri}
											<button
												type="button"
												class="ris"
												style="z-index:{20 - ri};"
												onclick={() => mostraRiserva(r)}
												aria-label={`Mostra ricambio ${r.nome}, ${r.ruolo ?? 'ruolo non disponibile'}`}
												title={r.nome +
													(r.ruolo ? ` — ${r.ruolo}` : '') +
													(r.titolarita ? ` · ${Math.round(r.titolarita)}%` : '')}
											>
												<Jersey club={r.club} size={26} />
											</button>
										{/each}
										{#if s.riserve.length > 4}<span class="ris-more">+{s.riserve.length - 4}</span>{/if}
									</div>
								{/if}
							{:else if onSlotVuoto}
								<button
									class="slot-add"
									title="Aggiungi un giocatore per questo ruolo"
									onclick={() => onSlotVuoto?.({ ruolo: s.ruolo, etichetta: s.etichetta, linea: linea.nome })}
								>
									<Jersey ghost size={44} />
									<div class="empty">＋ {s.etichetta ?? s.ruolo ?? '—'}</div>
								</button>
							{:else}
								<Jersey ghost size={44} />
								<div class="empty">{s.etichetta ?? s.ruolo ?? '—'}</div>
							{/if}
						</div>
					{/each}
				</div>
			{/each}
		</div>
		{#if dettaglio}
			<div class="player-detail" role="status">
				<div class="detail-head">
					<span>{dettaglio.tipo}</span>
					<button type="button" onclick={() => (dettaglio = null)} aria-label="Chiudi dettagli giocatore">Chiudi ×</button>
				</div>
				<strong>{dettaglio.nome}</strong>
				<span class="detail-role">{dettaglio.ruolo ?? 'ruolo non disponibile'}</span>
				{#if dettaglio.club}<span class="muted">{dettaglio.club}</span>{/if}
				{#if dettaglio.prezzo != null}<span class="detail-stat">{dettaglio.prezzo} cr</span>{/if}
				{#if dettaglio.titolarita != null && dettaglio.titolarita > 0}<span class="detail-stat">{Math.round(dettaglio.titolarita)}% tit.</span>{/if}
				{#if dettaglio.riserve?.length}
					<div class="detail-riserve">
						<span>Ricambi nello slot:</span>
						{#each dettaglio.riserve as r}
							<button type="button" onclick={() => mostraRiserva(r)}>{r.nome} · {r.ruolo ?? '—'}</button>
						{/each}
					</div>
				{/if}
			</div>
		{/if}
	</div>
</div>

<style>
	.pitch {
		display: flex;
		justify-content: center;
		padding: 4px 0;
	}
	.pitch-frame {
		position: relative;
		width: 100%;
		max-width: 620px;
		padding: 34px 16px 18px;
		border: 1px solid rgba(255, 255, 255, 0.14);
		border-radius: var(--r);
		background:
			radial-gradient(150% 90% at 50% -10%, rgba(150, 255, 190, 0.18), transparent 55%),
			radial-gradient(120% 80% at 50% 120%, rgba(0, 0, 0, 0.4), transparent 55%),
			repeating-linear-gradient(90deg, #1f5138 0 56px, #245e41 56px 112px);
		box-shadow: inset 0 0 70px rgba(0, 0, 0, 0.34), inset 0 2px 0 rgba(255, 255, 255, 0.08);
		overflow: hidden;
	}
	/* aree di rigore + linee perimetrali */
	.pitch-frame::before,
	.pitch-frame::after {
		content: '';
		position: absolute;
		left: 50%;
		transform: translateX(-50%);
		width: 52%;
		height: 62px;
		border: 1px solid rgba(255, 255, 255, 0.16);
		border-top: none;
		pointer-events: none;
	}
	.pitch-frame::before { top: -1px; border-top: 1px solid rgba(255, 255, 255, 0.16); border-bottom: none; }
	.pitch-frame::after { bottom: -1px; }
	.mark {
		position: absolute;
		border: 1px solid rgba(255, 255, 255, 0.2);
		pointer-events: none;
	}
	.circle {
		width: 132px;
		height: 132px;
		border-radius: 50%;
		left: 50%;
		top: 50%;
		transform: translate(-50%, -50%);
		box-shadow: 0 0 0 1px rgba(0, 0, 0, 0.12);
	}
	.circle::after {
		content: '';
		position: absolute;
		left: 50%;
		top: 50%;
		width: 5px;
		height: 5px;
		border-radius: 50%;
		background: rgba(255, 255, 255, 0.5);
		transform: translate(-50%, -50%);
	}
	.halfway {
		left: 12px;
		right: 12px;
		top: 50%;
		border: none;
		border-top: 1px solid rgba(255, 255, 255, 0.2);
	}
	.pitch-title {
		position: absolute;
		top: 10px;
		left: 0;
		right: 0;
		text-align: center;
		font: 700 12px/1 var(--mono);
		letter-spacing: 4px;
		color: rgba(255, 255, 255, 0.72);
	}
	/* il campo è sempre verde scuro: testo chiaro a prescindere dal tema */
	.pitch-frame :global(*) {
		--muted: rgba(255, 255, 255, 0.62);
	}
	.lines {
		position: relative;
		z-index: 2;
		display: flex;
		flex-direction: column-reverse; /* attacco in alto */
		gap: 12px;
	}
	.reparto-svg {
		position: absolute;
		inset: 0;
		width: 100%;
		height: 100%;
		z-index: 1;
		pointer-events: none;
		overflow: visible;
	}
	.reparto-svg polyline {
		fill: none;
		stroke: var(--ok);
		stroke-width: 2;
		stroke-dasharray: 4 5;
		stroke-linejoin: round;
		stroke-linecap: round;
		opacity: 0.75;
	}
	.slot.evid {
		border-radius: 12px;
		background: color-mix(in srgb, var(--ok) 12%, transparent);
		box-shadow:
			0 0 0 2px var(--ok),
			0 0 14px color-mix(in srgb, var(--ok) 40%, transparent);
	}
	.line {
		display: grid;
		grid-template-columns: repeat(var(--n), minmax(0, 1fr));
		gap: 10px;
		justify-items: center;
	}
	.slot {
		width: 100%;
		max-width: 96px;
		min-height: 82px;
		padding: 2px;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: flex-start;
		gap: 3px;
		text-align: center;
	}
	.slot.libero {
		opacity: 0.72;
	}
	.slot-player {
		width: 100%;
		padding: 0;
		border: 0;
		background: transparent;
		color: inherit;
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 3px;
		cursor: pointer;
		border-radius: 9px;
	}
	.slot-player:focus-visible,
	.ris:focus-visible {
		outline: 2px solid var(--accent);
		outline-offset: 2px;
	}
	.slot-add {
		background: transparent;
		border: 1px dashed transparent;
		border-radius: 10px;
		padding: 2px;
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 3px;
		cursor: pointer;
		transition: border-color 0.14s ease, background 0.14s ease;
	}
	.slot-add:hover {
		border-color: var(--accent);
		background: color-mix(in srgb, var(--accent) 12%, transparent);
	}
	.slot-add:hover :global(svg) {
		filter: drop-shadow(0 0 6px color-mix(in srgb, var(--accent) 60%, transparent));
	}
	.kit {
		position: relative;
		filter: drop-shadow(0 2px 5px rgba(0, 0, 0, 0.55));
	}
	.dot {
		position: absolute;
		right: -1px;
		bottom: 2px;
		width: 7px;
		height: 7px;
		border-radius: 50%;
		box-shadow: 0 0 0 1.5px #0b1a13;
	}
	.name {
		font-size: 11px;
		font-weight: 600;
		color: #f6f8fb;
		line-height: 1.1;
		max-width: 100%;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}
	.sub {
		display: flex;
		gap: 4px;
		font: 600 9px/1 var(--mono);
	}
	.riserve {
		display: flex;
		align-items: center;
		margin-top: 3px;
	}
	.ris {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		margin-left: -9px;
		padding: 2px;
		border: 0;
		border-radius: 50%;
		background: rgba(6, 20, 14, 0.72);
		cursor: pointer;
		box-shadow:
			0 0 0 1px rgba(255, 255, 255, 0.35),
			0 2px 4px rgba(0, 0, 0, 0.5);
	}
	.ris:first-child {
		margin-left: 0;
	}
	.ris-more {
		font: 700 9px/1 var(--mono);
		color: #fff;
		margin-left: 4px;
		background: rgba(6, 20, 14, 0.72);
		border-radius: 8px;
		padding: 2px 4px;
	}
	.empty {
		font: 700 11px/1 var(--mono);
		color: rgba(255, 255, 255, 0.5);
		letter-spacing: 1px;
	}
	.player-detail {
		position: absolute;
		z-index: 5;
		left: 10px;
		right: 10px;
		bottom: 10px;
		display: flex;
		align-items: center;
		gap: 7px;
		flex-wrap: wrap;
		padding: 8px 10px;
		border: 1px solid rgba(180, 255, 205, 0.55);
		border-radius: 10px;
		background: rgba(5, 24, 15, 0.96);
		box-shadow: 0 8px 28px rgba(0, 0, 0, 0.42);
		font-size: 12px;
		color: #f6f8fb;
	}
	.detail-head { display: contents; }
	.detail-head > span {
		font: 700 9px/1 var(--mono);
		letter-spacing: 0.8px;
		color: var(--cyan);
	}
	.detail-head > button {
		margin-left: auto;
		border: 0;
		background: transparent;
		color: rgba(255,255,255,0.78);
		font: 600 10px/1 var(--mono);
		padding: 3px;
		cursor: pointer;
	}
	.detail-role { color: var(--ok); font-family: var(--mono); }
	.detail-stat { color: var(--cyan); font: 600 10px/1 var(--mono); }
	.detail-riserve {
		width: 100%;
		display: flex;
		align-items: center;
		gap: 5px;
		flex-wrap: wrap;
		padding-top: 3px;
		border-top: 1px solid rgba(255,255,255,0.13);
		font-size: 10px;
	}
	.detail-riserve > button {
		border: 1px solid rgba(180,255,205,0.34);
		border-radius: 6px;
		background: rgba(255,255,255,0.06);
		color: #fff;
		font: 600 10px/1 var(--mono);
		padding: 3px 5px;
		cursor: pointer;
	}
</style>
