<script lang="ts">
	import Jersey from '$lib/ui/Jersey.svelte';

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
	const titColor = (t: number) => (t >= 70 ? 'var(--ok)' : t >= 45 ? 'var(--warn)' : 'var(--bad)');
</script>

<div class="pitch">
	<div class="pitch-frame">
		<span class="mark circle"></span>
		<span class="mark halfway"></span>
		{#if titolo}<div class="pitch-title">{titolo}</div>{/if}
		<div class="lines">
			{#each linee as linea}
				<div class="line" style="--n:{linea.slot.length};">
					{#each linea.slot as s}
						{@const st = s.stato ?? 'VUOTO'}
						<div class="slot" class:libero={st === 'LIBERO'}>
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
									{#if s.pmaFl != null && s.pmaFl > 0}<span class="muted">FL{s.pmaFl}</span>{/if}
								</div>
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
			radial-gradient(140% 70% at 50% 0%, rgba(94, 255, 156, 0.06), transparent 55%),
			repeating-linear-gradient(0deg, #0b1a13 0 40px, #0d1f16 40px 80px);
		box-shadow: inset 0 0 70px rgba(0, 0, 0, 0.45);
		overflow: hidden;
	}
	.mark {
		position: absolute;
		border: 1px solid rgba(255, 255, 255, 0.08);
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
		border-top: 1px solid rgba(255, 255, 255, 0.08);
	}
	.pitch-title {
		position: absolute;
		top: 10px;
		left: 0;
		right: 0;
		text-align: center;
		font: 700 12px/1 var(--mono);
		letter-spacing: 4px;
		color: var(--muted);
	}
	.lines {
		position: relative;
		display: flex;
		flex-direction: column-reverse; /* attacco in alto */
		gap: 12px;
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
	.kit {
		position: relative;
		filter: drop-shadow(0 2px 3px rgba(0, 0, 0, 0.4));
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
		color: var(--text-strong);
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
	.empty {
		font: 700 11px/1 var(--mono);
		color: var(--muted-dim);
		letter-spacing: 1px;
	}
</style>
