<script lang="ts">
	import Crest from '$lib/ui/Crest.svelte';

	export interface SlotCampo {
		etichetta?: string;
		nome?: string;
		club?: string;
		ruolo?: string;
		prezzo?: number | null;
		titolarita?: number | null;
		pmaFl?: number | null;
		stato?: 'PRESO' | 'LIBERO' | 'VUOTO';
	}
	export interface LineaCampo {
		nome: string;
		slot: SlotCampo[];
	}

	let { linee, titolo = '' }: { linee: LineaCampo[]; titolo?: string } = $props();

	const colStato: Record<string, string> = {
		PRESO: 'var(--ok)',
		LIBERO: 'var(--cyan)',
		VUOTO: 'var(--border-strong)'
	};
</script>

<div class="pitch">
	{#if titolo}<div class="pitch-title">{titolo}</div>{/if}
	<div class="pitch-lines">
		{#each linee as linea}
			<div class="pitch-line">
				{#each linea.slot as s}
					<div class="slot" style="border-color:{colStato[s.stato ?? 'VUOTO']};">
						{#if s.nome}
							<div class="slot-crest"><Crest nome={s.club} size={20} /></div>
							<div class="slot-name">{s.nome}</div>
							<div class="slot-sub mono">
								{#if s.etichetta}<span class="muted">{s.etichetta}</span>{/if}
								{#if s.prezzo != null}· <span style="color:var(--cyan);">{s.prezzo}</span>{/if}
							</div>
							<div class="slot-sub mono muted">
								{#if s.titolarita != null && s.titolarita > 0}<span style:color={s.titolarita >= 70 ? 'var(--ok)' : s.titolarita >= 45 ? 'var(--warn)' : 'var(--bad)'}>{Math.round(s.titolarita)}%</span> tit{/if}
								{#if s.pmaFl != null && s.pmaFl > 0}· FL {s.pmaFl}{/if}
							</div>
						{:else}
							<div class="slot-empty">{s.etichetta ?? s.ruolo ?? '—'}</div>
						{/if}
					</div>
				{/each}
			</div>
		{/each}
	</div>
</div>

<style>
	.pitch {
		background:
			radial-gradient(120% 80% at 50% 0%, rgba(94, 255, 156, 0.05), transparent 60%),
			repeating-linear-gradient(0deg, #0c1a14 0 34px, #0e1e16 34px 68px);
		border: 1px solid var(--border-strong);
		border-radius: var(--r);
		padding: 18px 12px;
		box-shadow: inset 0 0 60px rgba(0, 0, 0, 0.4);
	}
	.pitch-title {
		text-align: center;
		font: 700 12px/1 var(--mono);
		letter-spacing: 3px;
		color: var(--muted);
		margin-bottom: 12px;
	}
	.pitch-lines {
		display: flex;
		flex-direction: column-reverse; /* attacco in alto */
		gap: 14px;
	}
	.pitch-line {
		display: flex;
		justify-content: space-around;
		gap: 8px;
	}
	.slot {
		width: 84px;
		min-height: 70px;
		background: rgba(6, 12, 9, 0.7);
		border: 1.5px solid var(--border-strong);
		border-radius: 8px;
		padding: 4px;
		text-align: center;
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 1px;
	}
	.slot-crest {
		line-height: 0;
	}
	.slot-name {
		font-size: 11px;
		font-weight: 600;
		color: var(--text-strong);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
		max-width: 74px;
	}
	.slot-sub {
		font-size: 9px;
	}
	.slot-empty {
		font: 700 10px/1.2 var(--mono);
		color: var(--muted-dim);
		letter-spacing: 0.5px;
		margin: auto 0;
	}
</style>
