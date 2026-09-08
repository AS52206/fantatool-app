<script lang="ts">
	import { asta } from '$lib/stores/auction.svelte';
	import EditPurchase from '$lib/ui/EditPurchase.svelte';
	import Crest from '$lib/ui/Crest.svelte';
	import BudgetBar from '$lib/ui/BudgetBar.svelte';
	import SlotDots from '$lib/ui/SlotDots.svelte';
	import type { Ruolo } from '$lib/domain/types';
	const rc = { P: 'var(--role-p)', D: 'var(--role-d)', C: 'var(--role-c)', A: 'var(--role-a)' } as Record<string, string>;
	const RUOLI: Ruolo[] = ['P', 'D', 'C', 'A'];

	let vista = $state<'reparto' | 'giocatore'>('giocatore');
	const pct = (v: number) => `${((100 * v) / Math.max(1, asta.config.budgetMax)).toFixed(1)}%`;
</script>

<div style="display:flex;gap:8px;margin-bottom:12px;align-items:center;">
	<span class="muted" style="font-size:12px;">Percentuali sul budget:</span>
	<button class:primary={vista === 'reparto'} onclick={() => (vista = 'reparto')} style="font-size:12px;">per reparto</button>
	<button class:primary={vista === 'giocatore'} onclick={() => (vista = 'giocatore')} style="font-size:12px;">per giocatore</button>
</div>

<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:16px;align-items:start;">
	{#each asta.config.squadre as sq}
		{@const b = asta.bilanci[sq.nome]}
		{@const rosa = asta.rosa(sq.nome)}
		{@const speso = asta.config.budgetMax - b.c_rimasti}
		<div class="panel squad-card" class:mine={sq.isMia} style="--club-color:{asta.coloreDi(sq.nome)};border-top:3px solid {asta.coloreDi(sq.nome)};">
			<div style="display:flex;justify-content:space-between;align-items:center;">
				<h2 style="margin:0;font-size:15px;display:flex;align-items:center;gap:6px;">
					<span style="width:9px;height:9px;border-radius:2px;background:{asta.coloreDi(sq.nome)};"></span>
					<span class="squad-crest"><Crest nome={sq.stemma || sq.nome} tipo="stemmi" size={32} /></span>
					{sq.nome}{sq.isMia ? ' ★' : ''}
				</h2>
				<span class="muted mono" style="font-size:12px;">
					{b.g_presi}/{asta.config.limiti.TOT} · <span style:color={b.c_rimasti < 0 ? 'var(--bad)' : 'var(--cyan)'}>{b.c_rimasti} cr</span>
				</span>
			</div>
			<div class="mono" style="font-size:11px;color:var(--muted);margin-top:2px;">
				speso {speso} · <span style="color:var(--cyan);">{pct(speso)}</span> del budget
			</div>
			<div style="margin:6px 0 2px;"><BudgetBar squadra={sq.nome} height={9} /></div>

			{#each RUOLI as r}
				{@const gr = rosa.filter((a) => a.ruolo === r).sort((x, y) => y.prezzo - x.prezzo)}
				{@const spesoR = gr.reduce((s, a) => s + a.prezzo, 0)}
				<div style="display:flex;align-items:center;gap:8px;font-size:11px;margin-top:9px;font-family:var(--mono);letter-spacing:1px;color:{rc[r]};">
					<span>{r}</span>
					<SlotDots presi={gr.length} limite={asta.config.limiti[r]} colore={rc[r]} />
					<span style="margin-left:auto;">{spesoR} · {pct(spesoR)}</span>
				</div>
				{#if vista === 'giocatore'}
					{#each gr as a}
						{@const tit = a.player?.fc?.expectedTitolarita ?? 0}
						<div style="display:flex;gap:6px;font-size:12px;padding:2px 0;align-items:center;">
							<Crest nome={a.squadraSerieA} size={14} />
							<span>{a.nome}</span><EditPurchase acquisto={a} />
							{#if asta.isMantra && a.player?.ruoloMantra}<span class="muted mono" style="font-size:10px;">{a.player.ruoloMantra}</span>{/if}
							{#if tit}<span class="mono" style="font-size:10px;color:{tit >= 70 ? 'var(--ok)' : tit >= 45 ? 'var(--warn)' : 'var(--bad)'};">{Math.round(tit)}%</span>{/if}
							{#if a.player?.fantalab?.prezzo_atteso}<span class="mono muted" style="font-size:10px;">FL{a.player.fantalab.prezzo_atteso}</span>{/if}
							<span class="mono" style="margin-left:auto;color:var(--cyan);">{a.prezzo}</span>
							<span class="mono muted" style="width:44px;text-align:right;">{pct(a.prezzo)}</span>
						</div>
					{/each}
				{/if}
			{/each}
			{#if !rosa.length}<p class="muted" style="font-size:12px;">Vuota.</p>{/if}
		</div>
	{/each}
</div>

<style>
	.squad-card { overflow:hidden; }
	.squad-card::after { content:''; position:absolute; top:-46px; right:-44px; width:150px; height:150px; border:24px solid color-mix(in srgb,var(--club-color) 9%,transparent); border-radius:50%; pointer-events:none; }
	.squad-card.mine { background:linear-gradient(135deg,var(--accent-soft),transparent 70%),var(--panel); box-shadow:var(--shadow),inset 0 0 0 1px color-mix(in srgb,var(--accent) 30%,transparent); }
	.squad-crest { display:inline-flex; align-items:center; justify-content:center; width:46px; height:46px; background:var(--panel-3); border-radius:50%; border:1px solid color-mix(in srgb,var(--club-color) 40%,var(--border)); }
</style>
