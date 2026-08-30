<script lang="ts">
	import { asta } from '$lib/stores/auction.svelte';
	import Crest from '$lib/ui/Crest.svelte';
	import { analizzaRosaMantra, MODULI_MANTRA } from '$lib/engine/mantra';
	import { MODULI_CLASSIC } from '$lib/campo';
	import type { Ruolo } from '$lib/domain/types';

	const RUOLI: Ruolo[] = ['P', 'D', 'C', 'A'];
	const N_MODULI = Object.keys(MODULI_MANTRA).length;
	const MIN_ACQ_EFFICIENZA = 5;

	let moduloRif = $state('3-4-3');
	// modulo "3-4-3" -> { P:1, D:3, C:4, A:3 }
	const formazione = $derived.by<Record<Ruolo, number>>(() => {
		const cifre = moduloRif.split('-').map(Number).filter((x) => x > 0);
		const [d = 3, ...resto] = cifre;
		const a = resto.length ? resto[resto.length - 1] : 3;
		const c = cifre.slice(1, -1).reduce((s, x) => s + x, 0) || (cifre.length <= 2 ? 3 : 0);
		return { P: 1, D: d, C: c, A: a };
	});

	type Xi = { fanta: number; tit: number; n: number };
	function xiDi(sq: string): Xi {
		const rosa = asta.rosa(sq);
		const form = formazione;
		const val = (a: (typeof rosa)[number]) =>
			a.player?.fc?.expectedFantamedia || a.player?.fc?.pma || a.player?.quotazione || 0;
		let fanta = 0;
		let titSum = 0;
		let titN = 0;
		let n = 0;
		for (const r of RUOLI) {
			const pool = rosa
				.filter((a) => a.ruolo === r)
				.sort((x, y) => val(y) - val(x))
				.slice(0, form[r]);
			for (const a of pool) {
				fanta += a.player?.fc?.expectedFantamedia ?? 0;
				const t = a.player?.fc?.expectedTitolarita;
				if (t != null) {
					titSum += t;
					titN++;
				}
				n++;
			}
		}
		return { fanta, tit: titN ? titSum / titN : 0, n };
	}

	function pmaTotale(sq: string) {
		return asta.rosa(sq).reduce((s, a) => s + (a.player?.fc?.pma ?? 0), 0);
	}
	function spesaDi(sq: string) {
		return asta.config.budgetMax - asta.bilanci[sq].c_rimasti;
	}
	function equilibrio(sq: string) {
		const rip = asta.budgetPerRepartoDi(sq);
		const scartoMax = Math.max(0, ...rip.map((x) => Math.abs(x.speso_pct - x.quota_pct)));
		return Math.max(0, 100 - scartoMax);
	}
	function fantamediaRosa(sq: string) {
		const vals = asta
			.rosa(sq)
			.map((a) => a.player?.fc?.expectedFantamedia)
			.filter((v): v is number => v != null && v > 0);
		return vals.length ? vals.reduce((s, v) => s + v, 0) / vals.length : 0;
	}
	function bigIndex(sq: string) {
		return asta.rosa(sq).reduce((s, a) => {
			const f = a.player?.fc?.fasciaFc;
			return s + (f === 'Top' ? 2 : f === 'Semi-Top' ? 1 : 0);
		}, 0);
	}
	function modularita(sq: string) {
		return analizzaRosaMantra(asta.rosaMantraInput(sq)).moduli_completi.length;
	}

	type Metrica = { id: string; label: string; nota: string; fmt: 'n' | 'pct' | 'dec'; v: (sq: string) => number };
	const METRICHE = $derived.by<Metrica[]>(() => {
		const base: Metrica[] = [
			{ id: 'proiezione', label: 'Proiezione XI', nota: 'Somma fantamedia attesa dei migliori 11', fmt: 'dec', v: (s) => xiDi(s).fanta },
			{ id: 'titxi', label: 'Titolarità XI', nota: '% titolarità media dei soli 11 titolari', fmt: 'pct', v: (s) => xiDi(s).tit / 100 },
			{ id: 'efficienza', label: 'Efficienza', nota: `PMA acquistato per credito speso (da ${MIN_ACQ_EFFICIENZA} giocatori)`, fmt: 'dec', v: (s) => (asta.bilanci[s].g_presi < MIN_ACQ_EFFICIENZA ? 0 : pmaTotale(s) / Math.max(1, spesaDi(s))) },
			{ id: 'equilibrio', label: 'Equilibrio reparti', nota: '100 − scarto max dalla quota P/D/C/A', fmt: 'n', v: (s) => equilibrio(s) },
			{ id: 'fmrosa', label: 'Fantamedia rosa', nota: 'Fantamedia attesa media dell\'intera rosa', fmt: 'dec', v: (s) => fantamediaRosa(s) },
			{ id: 'big', label: 'Big in rosa', nota: 'Top = 2, Semi-Top = 1', fmt: 'n', v: (s) => bigIndex(s) }
		];
		if (asta.isMantra)
			base.push({ id: 'moduli', label: 'Modularità', nota: `Moduli target coperti su ${N_MODULI}`, fmt: 'n', v: (s) => modularita(s) });
		return base;
	});

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

	const dati = $derived.by(() => {
		const teams = squadreSel.map((s) => s.nome);
		const maxPerAsse = METRICHE.map((m) => Math.max(1e-9, ...teams.map((t) => m.v(t))));
		return teams.map((t) => ({
			nome: t,
			colore: asta.coloreDi(t),
			grezzi: METRICHE.map((m) => m.v(t)),
			norm: METRICHE.map((m, i) => m.v(t) / maxPerAsse[i])
		}));
	});

	const RIGHE_ASSOLUTE: { label: string; val: (sq: string) => string }[] = [
		{ label: 'Crediti spesi', val: (s) => `${spesaDi(s)}` },
		{ label: 'Crediti residui', val: (s) => `${asta.bilanci[s].c_rimasti}` },
		{ label: 'Giocatori presi', val: (s) => `${asta.bilanci[s].g_presi}/${asta.config.limiti.TOT}` },
		{ label: 'PMA totale', val: (s) => `${Math.round(pmaTotale(s))}` },
		{ label: 'Fantamedia XI', val: (s) => xiDi(s).fanta.toFixed(1) }
	];

	// geometria radar
	const R = 128;
	const cx = 170;
	const cy = 160;
	const ang = (i: number, n: number) => -Math.PI / 2 + (i * 2 * Math.PI) / n;
	const pt = (i: number, r: number, n: number) => [cx + Math.cos(ang(i, n)) * R * r, cy + Math.sin(ang(i, n)) * R * r];
	const poly = (rs: number[]) => rs.map((r, i) => pt(i, r, rs.length).join(',')).join(' ');
	const anelli = [0.25, 0.5, 0.75, 1];

	function fmt(m: Metrica, v: number) {
		if (m.fmt === 'pct') return `${Math.round(v * 100)}%`;
		if (m.fmt === 'dec') return v >= 100 ? Math.round(v).toString() : v.toFixed(1);
		return Math.round(v).toString();
	}
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
	<label class="muted" style="font-size:12px;margin-left:auto;">
		XI di riferimento
		<select bind:value={moduloRif} style="font-family:var(--mono);margin-left:4px;">
			{#each MODULI_CLASSIC as m}<option value={m}>{m}</option>{/each}
		</select>
	</label>
</div>

{#if squadreSel.length < 2}
	<div class="panel"><p class="muted">Seleziona almeno due squadre per confrontarle.</p></div>
{:else}
	<div style="display:flex;gap:20px;flex-wrap:wrap;align-items:flex-start;">
		<div class="panel" style="flex:0 0 auto;">
			<svg viewBox="-55 0 450 340" style="width:390px;max-width:100%;height:auto;">
				{#each anelli as a}
					<polygon points={poly(METRICHE.map(() => a))} fill="none" stroke="var(--border)" stroke-width="1" />
				{/each}
				{#each METRICHE as m, i}
					{@const p = pt(i, 1, METRICHE.length)}
					<line x1={cx} y1={cy} x2={p[0]} y2={p[1]} stroke="var(--border)" stroke-width="1" />
					{@const lp = pt(i, 1.16, METRICHE.length)}
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
					<polygon points={poly(d.norm)} fill={d.colore} fill-opacity="0.12" stroke={d.colore} stroke-width="2" stroke-linejoin="round" />
					{#each d.norm as r, i}
						{@const p = pt(i, r, d.norm.length)}
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
			<p class="muted" style="font-size:10px;margin-top:6px;max-width:360px;">
				Ogni asse è normalizzato sul valore più alto fra le squadre a confronto. XI di riferimento: {moduloRif}.
			</p>
		</div>

		<div style="flex:1;min-width:280px;display:flex;flex-direction:column;gap:16px;">
			<div class="panel" style="overflow:auto;">
				<h3 style="margin:0 0 6px;font-size:13px;">Indici</h3>
				<table style="width:100%;border-collapse:collapse;font-size:12px;">
					<thead>
						<tr style="text-align:left;">
							<th>Metrica</th>
							{#each dati as d}<th style="text-align:right;color:{d.colore};">{d.nome}</th>{/each}
						</tr>
					</thead>
					<tbody>
						{#each METRICHE as m, i}
							{@const best = Math.max(...dati.map((d) => d.grezzi[i]))}
							<tr style="border-top:1px solid var(--border);">
								<td>{m.label}<div class="muted" style="font-size:10px;">{m.nota}</div></td>
								{#each dati as d}
									<td class="mono" style="text-align:right;{d.grezzi[i] === best && best > 0 ? 'color:var(--ok);font-weight:700;' : ''}">
										{fmt(m, d.grezzi[i])}
									</td>
								{/each}
							</tr>
						{/each}
					</tbody>
				</table>
			</div>

			<div class="panel" style="overflow:auto;">
				<h3 style="margin:0 0 6px;font-size:13px;">Valori assoluti</h3>
				<table style="width:100%;border-collapse:collapse;font-size:12px;">
					<thead>
						<tr style="text-align:left;">
							<th>Voce</th>
							{#each squadreSel as s}<th style="text-align:right;color:{asta.coloreDi(s.nome)};">{s.nome}</th>{/each}
						</tr>
					</thead>
					<tbody>
						{#each RIGHE_ASSOLUTE as r}
							<tr style="border-top:1px solid var(--border);">
								<td>{r.label}</td>
								{#each squadreSel as s}
									<td class="mono" style="text-align:right;">{r.val(s.nome)}</td>
								{/each}
							</tr>
						{/each}
					</tbody>
				</table>
			</div>
		</div>
	</div>
{/if}
