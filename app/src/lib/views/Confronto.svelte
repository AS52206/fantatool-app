<script lang="ts">
	import { asta } from '$lib/stores/auction.svelte';
	import Crest from '$lib/ui/Crest.svelte';

	type Metrica = { id: string; label: string; nota: string; valore: (sq: string) => number };

	const rosaDi = (sq: string) => asta.rosa(sq);

	const METRICHE: Metrica[] = [
		{
			id: 'rosa',
			label: 'Rosa',
			nota: 'Slot riempiti sul totale',
			valore: (sq) => asta.bilanci[sq].g_presi / Math.max(1, asta.config.limiti.TOT)
		},
		{
			id: 'spesa',
			label: 'Spesa',
			nota: 'Crediti spesi sul budget',
			valore: (sq) =>
				(asta.config.budgetMax - asta.bilanci[sq].c_rimasti) / Math.max(1, asta.config.budgetMax)
		},
		{
			id: 'residuo',
			label: 'Potere residuo',
			nota: 'Crediti ancora disponibili',
			valore: (sq) => Math.max(0, asta.bilanci[sq].c_rimasti) / Math.max(1, asta.config.budgetMax)
		},
		{
			id: 'pma',
			label: 'PMA totale',
			nota: 'Somma PMA della rosa',
			valore: (sq) => rosaDi(sq).reduce((s, a) => s + (a.player?.fc?.pma ?? 0), 0)
		},
		{
			id: 'tit',
			label: 'Titolarità media',
			nota: '% titolarità media dei giocatori',
			valore: (sq) => {
				const r = rosaDi(sq).filter((a) => a.player?.fc?.expectedTitolarita != null);
				if (!r.length) return 0;
				return (
					r.reduce((s, a) => s + (a.player!.fc!.expectedTitolarita ?? 0), 0) / r.length / 100
				);
			}
		},
		{
			id: 'top11',
			label: 'Undici titolare',
			nota: 'Somma FL dei migliori 11',
			valore: (sq) =>
				rosaDi(sq)
					.map((a) => a.player?.fantalab?.prezzo_atteso ?? a.prezzo)
					.sort((x, y) => y - x)
					.slice(0, 11)
					.reduce((s, v) => s + v, 0)
		}
	];

	let selezione = $state<Set<string>>(new Set());
	$effect(() => {
		if (selezione.size === 0 && asta.config.squadre.length) {
			const mia = asta.miaSquadra;
			selezione = new Set(
				[mia, ...asta.config.squadre.map((s) => s.nome).filter((n) => n !== mia)].slice(0, 3)
			);
		}
	});
	function toggle(nome: string) {
		const s = new Set(selezione);
		s.has(nome) ? s.delete(nome) : s.add(nome);
		selezione = s;
	}

	const squadreSel = $derived(asta.config.squadre.filter((s) => selezione.has(s.nome)));

	// valori grezzi + normalizzazione per asse (max fra le squadre selezionate)
	const dati = $derived.by(() => {
		const teams = squadreSel.map((s) => s.nome);
		const maxPerAsse = METRICHE.map((m) => Math.max(1e-9, ...teams.map((t) => m.valore(t))));
		return teams.map((t) => ({
			nome: t,
			colore: asta.coloreDi(t),
			grezzi: METRICHE.map((m) => m.valore(t)),
			norm: METRICHE.map((m, i) => m.valore(t) / maxPerAsse[i])
		}));
	});

	// geometria radar
	const N = METRICHE.length;
	const R = 130;
	const cx = 170;
	const cy = 160;
	const ang = (i: number) => -Math.PI / 2 + (i * 2 * Math.PI) / N;
	const pt = (i: number, r: number) => [cx + Math.cos(ang(i)) * R * r, cy + Math.sin(ang(i)) * R * r];
	const poly = (rs: number[]) => rs.map((r, i) => pt(i, r).join(',')).join(' ');
	const anelli = [0.25, 0.5, 0.75, 1];

	const fmt = (m: Metrica, v: number) => {
		if (['rosa', 'spesa', 'residuo', 'tit'].includes(m.id)) return `${Math.round(v * 100)}%`;
		return Math.round(v).toString();
	};
</script>

<div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:12px;align-items:center;">
	<span class="muted" style="font-size:12px;">Confronta:</span>
	{#each asta.config.squadre as sq}
		<button
			onclick={() => toggle(sq.nome)}
			class:primary={selezione.has(sq.nome)}
			style="font-size:12px;display:flex;align-items:center;gap:5px;border-left:3px solid {asta.coloreDi(sq.nome)};"
		>
			<Crest nome={sq.stemma || sq.nome} tipo="stemmi" size={16} />{sq.nome}{sq.isMia ? ' ★' : ''}
		</button>
	{/each}
</div>

{#if squadreSel.length < 2}
	<div class="panel"><p class="muted">Seleziona almeno due squadre per confrontarle.</p></div>
{:else}
	<div style="display:flex;gap:20px;flex-wrap:wrap;align-items:flex-start;">
		<div class="panel" style="flex:0 0 auto;">
			<svg viewBox="-55 0 450 340" style="width:390px;max-width:100%;height:auto;">
				{#each anelli as a}
					<polygon
						points={poly(METRICHE.map(() => a))}
						fill="none"
						stroke="var(--border)"
						stroke-width="1"
					/>
				{/each}
				{#each METRICHE as m, i}
					{@const p = pt(i, 1)}
					<line x1={cx} y1={cy} x2={p[0]} y2={p[1]} stroke="var(--border)" stroke-width="1" />
					{@const lp = pt(i, 1.16)}
					<text
						x={lp[0]}
						y={lp[1]}
						text-anchor={Math.abs(lp[0] - cx) < 4 ? 'middle' : lp[0] > cx ? 'start' : 'end'}
						dominant-baseline="middle"
						fill="var(--muted)"
						style="font-size:10px;"
					>
						{m.label}
					</text>
				{/each}
				{#each dati as d}
					<polygon
						points={poly(d.norm)}
						fill={d.colore}
						fill-opacity="0.12"
						stroke={d.colore}
						stroke-width="2"
						stroke-linejoin="round"
					/>
					{#each d.norm as r, i}
						{@const p = pt(i, r)}
						<circle cx={p[0]} cy={p[1]} r="2.5" fill={d.colore} />
					{/each}
				{/each}
			</svg>
			<div style="display:flex;gap:12px;flex-wrap:wrap;margin-top:6px;">
				{#each dati as d}
					<span style="display:flex;align-items:center;gap:5px;font-size:12px;">
						<span style="width:10px;height:10px;border-radius:2px;background:{d.colore};"></span>{d.nome}
					</span>
				{/each}
			</div>
			<p class="muted" style="font-size:10px;margin-top:6px;max-width:340px;">
				Ogni asse è normalizzato sul valore più alto fra le squadre a confronto.
			</p>
		</div>

		<div class="panel" style="flex:1;min-width:280px;overflow:auto;">
			<table style="width:100%;border-collapse:collapse;font-size:12px;">
				<thead>
					<tr style="text-align:left;">
						<th>Metrica</th>
						{#each dati as d}
							<th style="text-align:right;color:{d.colore};">{d.nome}</th>
						{/each}
					</tr>
				</thead>
				<tbody>
					{#each METRICHE as m, i}
						{@const migliore = Math.max(...dati.map((d) => d.grezzi[i]))}
						<tr style="border-top:1px solid var(--border);">
							<td>
								{m.label}
								<div class="muted" style="font-size:10px;">{m.nota}</div>
							</td>
							{#each dati as d}
								<td
									class="mono"
									style="text-align:right;{d.grezzi[i] === migliore && migliore > 0
										? 'color:var(--ok);font-weight:700;'
										: ''}"
								>
									{fmt(m, d.grezzi[i])}
								</td>
							{/each}
						</tr>
					{/each}
				</tbody>
			</table>
		</div>
	</div>
{/if}
