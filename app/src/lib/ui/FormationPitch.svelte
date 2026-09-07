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
								<div class="kit" title={s.club ?? ''}>
									<Jersey club={s.club} size={44} />
									<span class="dot" style="background:{colStato[st]};"></span>
								</div>
								<div class="name">{s.nome}</div>
								<div class="sub">
									{#if s.etichetta}<span class="muted">{s.etichetta}</span>{/if}
									{#if s.prezzo != null}<span style="color:var(--cyan);">{s.prezzo}</span>{/if}
									{#if s.titolarita != null && s.titolarita > 0}<span style="color:{titColor(s.titolarita)};">{Math.round(s.titolarita)}%</span>{/if}
								</div>
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
											<span
												class="ris"
												style="z-index:{20 - ri};"
												title={r.nome +
													(r.ruolo ? ` — ${r.ruolo}` : '') +
													(r.titolarita ? ` · ${Math.round(r.titolarita)}%` : '')}
											>
												<Jersey club={r.club} size={26} />
											</span>
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
		border: 1px solid rgba(255, 255, 255, 0.12);
		border-radius: var(--r);
		background:
			radial-gradient(140% 75% at 50% 0%, rgba(120, 255, 175, 0.14), transparent 60%),
			repeating-linear-gradient(0deg, #1f5138 0 40px, #245c40 40px 80px);
		box-shadow: inset 0 0 60px rgba(0, 0, 0, 0.28);
		overflow: hidden;
	}
	.mark {
		position: absolute;
		border: 1px solid rgba(255, 255, 255, 0.16);
		pointer-events: none;
	}
	.circle {
		width: 120px;
		height: 120px;
		border-radius: 50%;
		left: 50%;
		top: 50%;
		transform: translate(-50%, -50%);
	}
	.halfway {
		left: 12px;
		right: 12px;
		top: 50%;
		border: none;
		border-top: 1px solid rgba(255, 255, 255, 0.16);
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
		border-radius: 50%;
		background: rgba(6, 20, 14, 0.72);
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
</style>
