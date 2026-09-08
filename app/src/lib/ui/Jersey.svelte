<script lang="ts" module>
	type Kit = { base: string; alt: string; type: 'strisce' | 'meta' | 'tinta'; scuro?: boolean };

	// Colori maglia casalinga delle squadre di Serie A (approssimati, per riconoscibilità).
	const KIT: Record<string, Kit> = {
		atalanta: { base: '#1961ac', alt: '#0a0a0a', type: 'strisce' },
		bologna: { base: '#a01c28', alt: '#1c2a52', type: 'strisce' },
		cagliari: { base: '#a4123b', alt: '#0f2350', type: 'meta' },
		como: { base: '#1f4ba3', alt: '#ffffff', type: 'tinta' },
		cremonese: { base: '#8b1a1a', alt: '#3f3f3f', type: 'strisce' },
		fiorentina: { base: '#5a2d81', alt: '#ffffff', type: 'tinta' },
		frosinone: { base: '#ffd200', alt: '#12235c', type: 'strisce', scuro: true },
		genoa: { base: '#c8102e', alt: '#1a2f52', type: 'meta' },
		inter: { base: '#0b1f8f', alt: '#0a0a0a', type: 'strisce' },
		juventus: { base: '#ffffff', alt: '#111111', type: 'strisce', scuro: true },
		lazio: { base: '#8bd3ec', alt: '#ffffff', type: 'tinta', scuro: true },
		lecce: { base: '#d4a017', alt: '#a01324', type: 'strisce', scuro: true },
		milan: { base: '#c8102e', alt: '#0a0a0a', type: 'strisce' },
		monza: { base: '#e2001a', alt: '#ffffff', type: 'tinta' },
		napoli: { base: '#12a0d7', alt: '#ffffff', type: 'tinta' },
		parma: { base: '#ffd200', alt: '#003b7f', type: 'meta', scuro: true },
		pisa: { base: '#1a3b8b', alt: '#0a0a0a', type: 'strisce' },
		roma: { base: '#8e1616', alt: '#f0bc42', type: 'tinta' },
		sassuolo: { base: '#00a752', alt: '#0a0a0a', type: 'strisce' },
		torino: { base: '#7b1a2b', alt: '#ffffff', type: 'tinta' },
		udinese: { base: '#ffffff', alt: '#111111', type: 'strisce', scuro: true },
		venezia: { base: '#0a0a0a', alt: '#f2a900', type: 'tinta' },
		verona: { base: '#12235c', alt: '#ffd200', type: 'meta' },
		// alias / storiche
		empoli: { base: '#1f6fd0', alt: '#ffffff', type: 'tinta' },
		salernitana: { base: '#7a1f2b', alt: '#ffffff', type: 'tinta' }
	};

	function kitDi(club: string | undefined): Kit {
		if (!club) return { base: '#555c68', alt: '#2c313a', type: 'tinta', scuro: false };
		const k = club
			.toLowerCase()
			.normalize('NFD')
			.replace(/[^a-z]/g, '');
		return KIT[k] ?? KIT[Object.keys(KIT).find((n) => k.includes(n) || n.includes(k)) ?? ''] ?? { base: '#555c68', alt: '#2c313a', type: 'tinta' };
	}

	/** Colore maglia casalinga di un club (per accenti UI). */
	export function kitColore(club: string | undefined): string {
		return kitDi(club).base;
	}
</script>

<script lang="ts">
	let {
		club,
		size = 46,
		ghost = false
	}: { club?: string; size?: number; ghost?: boolean } = $props();

	const kit = $derived(kitDi(club));
	const uid = 'jsy' + Math.random().toString(36).slice(2, 8);
	// silhouette maglia dentro un box 64x60
	const shirt =
		'M22 3 L27 7 Q32 9 37 7 L42 3 L61 13 L54 25 L47 21 L47 57 L17 57 L17 21 L10 25 L3 13 Z';
</script>

<svg viewBox="0 0 64 60" width={size} height={size * 0.94} style="display:block;overflow:visible;">
	<defs>
		<clipPath id={uid}><path d={shirt} /></clipPath>
	</defs>
	{#if ghost}
		<path d={shirt} fill="rgba(255,255,255,0.03)" stroke="rgba(255,255,255,0.28)" stroke-width="1.5" stroke-dasharray="3 3" />
	{:else}
		<g clip-path="url(#{uid})">
			<rect x="0" y="0" width="64" height="60" fill={kit.base} />
			{#if kit.type === 'strisce'}
				{#each [0, 1, 2, 3, 4] as i}
					<rect x={6 + i * 12} y="-4" width="6" height="68" fill={kit.alt} />
				{/each}
			{:else if kit.type === 'meta'}
				<rect x="32" y="0" width="32" height="60" fill={kit.alt} />
			{/if}
			<!-- ombreggiatura -->
			<rect x="0" y="0" width="64" height="60" fill="url(#shade{uid})" />
		</g>
		<linearGradient id="shade{uid}" x1="0" y1="0" x2="0" y2="1">
			<stop offset="0" stop-color="rgba(255,255,255,0.14)" />
			<stop offset="0.5" stop-color="rgba(255,255,255,0)" />
			<stop offset="1" stop-color="rgba(0,0,0,0.22)" />
		</linearGradient>
		<!-- colletto -->
		<path d="M27 7 Q32 12 37 7" fill="none" stroke={kit.scuro ? 'rgba(0,0,0,0.35)' : 'rgba(255,255,255,0.5)'} stroke-width="2" />
	{/if}
	<path d={shirt} fill="none" stroke="rgba(0,0,0,0.3)" stroke-width="1.2" />
</svg>
