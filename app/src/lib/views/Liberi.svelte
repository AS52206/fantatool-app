<script lang="ts">
	import { asta } from '$lib/stores/auction.svelte';
	import { normalizzaNome } from '$lib/engine/names';
	import { calcolaScarsitaRuoliMantra, ORDINE_RUOLI_MANTRA, normalizzaRuoliMantra, type RuoloMantra } from '$lib/engine/mantra';
	import RoleTag from '$lib/ui/RoleTag.svelte';
	import Crest from '$lib/ui/Crest.svelte';
	import type { Giocatore, Ruolo } from '$lib/domain/types';

	const RUOLI: Ruolo[] = ['P', 'D', 'C', 'A'];
	const ORDINE_RUOLO: Record<string, number> = { P: 0, D: 1, C: 2, A: 3 };
	const NOME_RUOLO_MANTRA: Record<string, string> = {
		Por: 'Portieri', Dd: 'Terzini dx', Ds: 'Terzini sx', Dc: 'Difensori centrali', B: 'Braccetti',
		E: 'Esterni', M: 'Mediani', C: 'Centrocampisti', W: 'Ali', T: 'Trequartisti', A: 'Attaccanti', Pc: 'Punte centrali'
	};

	type Col = 'ruolo' | 'nome' | 'club' | 'qt' | 'pma' | 'pfc' | 'fl' | 'tit' | 'slot' | 'fm' | 'fascia';
	const COLONNE: { id: Col; label: string; title?: string; num: boolean }[] = [
		{ id: 'ruolo', label: 'R', num: false },
		{ id: 'nome', label: 'Giocatore', num: false },
		{ id: 'club', label: 'Club', num: false },
		{ id: 'qt', label: 'Qt', num: true },
		{ id: 'pma', label: 'PMA', title: 'PMA Fantacrediti', num: true },
		{ id: 'pfc', label: 'PFC', num: true },
		{ id: 'fl', label: 'FL', title: 'PMA Fantalab', num: true },
		{ id: 'tit', label: '%TIT', title: '% titolarità attesa', num: true },
		{ id: 'slot', label: 'Slot', num: true },
		{ id: 'fm', label: 'FM~', title: 'FM attesa', num: true },
		{ id: 'fascia', label: 'Fascia', num: false }
	];
	// null = dato mancante → sempre in fondo, in qualsiasi direzione
	const valore = (g: Giocatore, c: Col): number | string | null => {
		switch (c) {
			case 'ruolo': return ORDINE_RUOLO[g.ruolo] ?? 9;
			case 'nome': return g.nome.toLowerCase();
			case 'club': return g.squadra.toLowerCase();
			case 'qt': return g.quotazione;
			case 'pma': return g.fc?.pma || null;
			case 'pfc': return g.fc?.pfc || null;
			case 'fl': return g.fantalab?.prezzo_atteso || null;
			case 'tit': return g.fc?.expectedTitolarita || null;
			case 'slot': return g.fc?.slot ?? null;
			case 'fm': return g.fc?.expectedFantamedia || null;
			case 'fascia': return g.fc?.fasciaFc?.toLowerCase() ?? null;
		}
	};

	let query = $state('');
	let ruoloTab = $state<string>('TUTTI');
	let soloConPma = $state(false);
	let ordCol = $state<Col>('qt');
	let ordDir = $state<1 | -1>(-1); // -1 = decrescente

	const tabs = $derived(asta.isMantra ? ['TUTTI', ...ORDINE_RUOLI_MANTRA] : ['TUTTI', ...RUOLI]);
	$effect(() => {
		// se cambio modalità e il ruolo selezionato non esiste più, torno a TUTTI
		if (!tabs.includes(ruoloTab)) ruoloTab = 'TUTTI';
	});

	function ordina(c: Col) {
		if (ordCol === c) ordDir = ordDir === -1 ? 1 : -1;
		else {
			ordCol = c;
			ordDir = c === 'nome' || c === 'club' || c === 'ruolo' || c === 'slot' || c === 'fascia' ? 1 : -1;
		}
	}

	const presi = $derived(asta.giocatoreIdPresi);

	// lista dopo ricerca + filtro PMA, ma PRIMA del ruolo (serve per i conteggi delle tab)
	const baseListe = $derived.by(() => {
		const q = normalizzaNome(query);
		let list = asta.giocatori.filter((g) => !presi.has(g.id));
		if (soloConPma) list = list.filter((g) => g.fc?.pma);
		if (q) list = list.filter((g) => g.chiave.includes(q) || normalizzaNome(g.squadra).includes(q));
		return list;
	});

	const conteggi = $derived.by(() => {
		const m: Record<string, number> = { TUTTI: baseListe.length };
		for (const t of tabs) if (t !== 'TUTTI') m[t] = 0;
		for (const g of baseListe) {
			if (asta.isMantra) {
				for (const r of normalizzaRuoliMantra(g.ruoloMantra)) if (r in m) m[r]++;
			} else {
				m[g.ruolo] = (m[g.ruolo] ?? 0) + 1;
			}
		}
		return m;
	});

	const liberi = $derived.by(() => {
		let list = baseListe;
		if (ruoloTab !== 'TUTTI') {
			list = asta.isMantra
				? list.filter((g) => normalizzaRuoliMantra(g.ruoloMantra).includes(ruoloTab as RuoloMantra))
				: list.filter((g) => g.ruolo === ruoloTab);
		}
		return [...list].sort((a, b) => {
			const ka = valore(a, ordCol);
			const kb = valore(b, ordCol);
			if (ka === null && kb === null) return a.nome.localeCompare(b.nome);
			if (ka === null) return 1; // mancante sempre in fondo
			if (kb === null) return -1;
			const cmp = typeof ka === 'string' ? ka.localeCompare(kb as string) : ka - (kb as number);
			return cmp * ordDir || a.nome.localeCompare(b.nome);
		});
	});

	const scarsitaMantra = $derived.by(() =>
		asta.isMantra
			? calcolaScarsitaRuoliMantra(
					asta.giocatori
						.filter((g) => !presi.has(g.id))
						.map((g) => ({ ruoli: g.ruoloMantra, titolarita: g.fc?.expectedTitolarita ?? 0 })),
					asta.config.squadre.length
				)
			: []
	);
	const statoColore = { CRITICA: 'var(--bad)', STRETTA: 'var(--warn)', OK: 'var(--muted)' } as Record<string, string>;
	const fasciaColore: Record<string, string> = {
		Top: 'var(--accent)', 'Semi-Top': 'var(--ok)', OttimoTit: 'var(--cyan)',
		TitLowCost: 'var(--warn)', Jolly: 'var(--muted)', Riserva: 'var(--muted-dim)'
	};
</script>

{#if asta.isMantra && scarsitaMantra.length}
	<div class="panel" style="margin-bottom:16px;">
		<h2 style="margin:0 0 6px;font-size:15px;">Scarsità ruoli Mantra (titolari liberi per squadra)</h2>
		<div style="display:flex;gap:14px;flex-wrap:wrap;font-size:12px;">
			{#each scarsitaMantra as s}
				<span style="color:{statoColore[s.stato]};" class="mono">
					{s.ruolo} {s.affidabili}/{s.liberi} · {s.per_squadra.toFixed(1)}×
				</span>
			{/each}
		</div>
	</div>
{/if}

<div class="role-tabs" role="tablist" aria-label="Ruolo">
	{#each tabs as t}
		<button
			role="tab"
			aria-selected={ruoloTab === t}
			class:on={ruoloTab === t}
			title={t === 'TUTTI' ? 'Tutti i ruoli' : NOME_RUOLO_MANTRA[t] ?? t}
			onclick={() => (ruoloTab = t)}
		>
			{t === 'TUTTI' ? 'Tutti' : t}<span class="cnt">{conteggi[t] ?? 0}</span>
		</button>
	{/each}
</div>

<div class="panel">
	<div style="display:flex;gap:8px;margin-bottom:10px;flex-wrap:wrap;align-items:center;">
		<input placeholder="Cerca giocatore o club…" bind:value={query} style="flex:1;min-width:160px;" />
		<label class="muted" style="font-size:12px;display:flex;align-items:center;gap:4px;">
			<input type="checkbox" bind:checked={soloConPma} /> solo con PMA
		</label>
		<span class="muted" style="font-size:11px;margin-left:auto;">
			{liberi.length}{#if ruoloTab !== 'TUTTI'} {asta.isMantra ? (NOME_RUOLO_MANTRA[ruoloTab] ?? ruoloTab) : ruoloTab}{:else} liberi{/if} · clicca un'intestazione per ordinare
		</span>
	</div>
	<div style="max-height:65vh;overflow:auto;">
		<table style="width:100%;border-collapse:collapse;font-size:12px;">
			<thead>
				<tr style="position:sticky;top:0;background:var(--panel);z-index:1;">
					{#each COLONNE as c}
						<th
							title={c.title}
							onclick={() => ordina(c.id)}
							style="text-align:{c.num ? 'right' : 'left'};cursor:pointer;user-select:none;padding:2px 4px;white-space:nowrap;color:{ordCol === c.id ? 'var(--accent)' : 'var(--muted)'};"
						>
							{c.label}<span style="opacity:{ordCol === c.id ? 1 : 0.25};">{ordCol === c.id ? (ordDir === -1 ? ' ▼' : ' ▲') : ' ⇅'}</span>
						</th>
					{/each}
				</tr>
			</thead>
			<tbody>
				{#each liberi.slice(0, 300) as g (g.id)}
					{@const tit = g.fc?.expectedTitolarita ?? 0}
					<tr style="border-top:1px solid var(--border);">
						<td style="padding:2px 4px;"><RoleTag ruolo={g.ruolo} ruoloMantra={g.ruoloMantra} /></td>
						<td style="padding:2px 4px;">{g.nome}</td>
						<td class="muted" style="white-space:nowrap;padding:2px 4px;"><Crest nome={g.squadra} size={14} /> {g.squadra}</td>
						<td class="mono" style="text-align:right;padding:2px 4px;">{g.quotazione}</td>
						<td class="mono" style="text-align:right;padding:2px 4px;color:var(--cyan);">{g.fc?.pma ?? '—'}</td>
						<td class="mono" style="text-align:right;padding:2px 4px;">{g.fc?.pfc ?? '—'}</td>
						<td class="mono" style="text-align:right;padding:2px 4px;color:var(--warn);">{g.fantalab?.prezzo_atteso ?? '—'}</td>
						<td class="mono" style="text-align:right;padding:2px 4px;" style:color={tit >= 70 ? 'var(--ok)' : tit >= 45 ? 'var(--warn)' : tit > 0 ? 'var(--bad)' : 'var(--muted)'}>{tit ? Math.round(tit) + '%' : '—'}</td>
						<td class="mono" style="text-align:right;padding:2px 4px;">{g.fc?.slot ?? '—'}</td>
						<td class="mono" style="text-align:right;padding:2px 4px;">{g.fc?.expectedFantamedia ? g.fc.expectedFantamedia.toFixed(1) : '—'}</td>
						<td style="padding:2px 4px;white-space:nowrap;color:{fasciaColore[g.fc?.fasciaFc ?? ''] ?? 'var(--muted)'};">{g.fc?.fasciaFc ?? '—'}</td>
					</tr>
				{/each}
			</tbody>
		</table>
	</div>
</div>

<style>
	.role-tabs {
		display: flex;
		gap: 3px;
		flex-wrap: wrap;
		margin-bottom: 12px;
		padding: 5px;
		border-radius: 12px;
		background: linear-gradient(180deg, var(--panel-3), var(--panel));
		border: 1px solid var(--border);
	}
	.role-tabs button {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		background: transparent;
		border: 1px solid transparent;
		border-radius: 8px;
		padding: 6px 11px;
		font: 700 14px/1 var(--display);
		letter-spacing: 0.6px;
		text-transform: uppercase;
		color: var(--muted);
		min-height: 0;
	}
	.role-tabs button:hover {
		color: var(--text-strong);
		background: var(--panel-hi);
	}
	.role-tabs button.on {
		background: var(--accent);
		border-color: var(--accent);
		color: var(--bg);
		box-shadow: 0 4px 16px -6px color-mix(in srgb, var(--accent) 70%, transparent);
	}
	:root[data-theme='chiaro'] .role-tabs button.on { color: #fff; }
	.role-tabs .cnt {
		font: 600 10px/1 var(--mono);
		padding: 2px 5px;
		border-radius: 999px;
		background: color-mix(in srgb, currentColor 16%, transparent);
	}
	.role-tabs button.on .cnt { background: color-mix(in srgb, var(--bg) 22%, transparent); }
</style>
