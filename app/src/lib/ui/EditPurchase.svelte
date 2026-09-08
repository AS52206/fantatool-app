<script lang="ts">
	import { tick } from 'svelte';
	import { asta } from '$lib/stores/auction.svelte';
	import type { Acquisto } from '$lib/domain/types';
	let { acquisto }: { acquisto: Acquisto } = $props();
	let dialog = $state<HTMLDialogElement>();
	let opened = $state(false);
	let price = $state(1);
	let owner = $state('');
	let error = $state('');
	const check = $derived(asta.controllaAcquisto({ id: acquisto.giocatoreId, ruolo: acquisto.ruolo }, price, owner, acquisto.giocatoreId));
	async function open() {
		price = acquisto.prezzo; owner = acquisto.proprietario; error = ''; opened = true;
		await tick(); dialog?.showModal();
	}
	function save(event: SubmitEvent) {
		event.preventDefault();
		try { asta.correggiAcquisto(acquisto.giocatoreId, price, owner); dialog?.close(); }
		catch (e) { error = String(e instanceof Error ? e.message : e); }
	}
</script>

<button class="edit" aria-label={`Correggi acquisto ${acquisto.nome}`} title="Correggi prezzo o squadra" onclick={open}>✎</button>
{#if opened}
<dialog onclose={() => opened = false} bind:this={dialog} aria-label={`Correggi ${acquisto.nome}`}>
	<form onsubmit={save}>
		<h2>Correggi {acquisto.nome}</h2>
		<p class="muted">Attuale: {acquisto.proprietario} · {acquisto.prezzo} crediti</p>
		<label>Nuova squadra<select bind:value={owner}>{#each asta.squadreNomi as name}<option>{name}</option>{/each}</select></label>
		<label>Nuovo prezzo<input type="number" min="1" step="1" bind:value={price} /></label>
		<p>Risultato: <b>{owner} · {price ?? '—'} crediti</b></p>
		<p class="muted">Budget squadra dopo la modifica: {check.remainingAfter} crediti. La correzione è annullabile.</p>
		{#if check.error || error}<p role="alert" style="color:var(--bad);">{check.error || error}</p>{/if}
		<div class="actions"><button type="button" onclick={() => dialog?.close()}>Annulla modifica</button><button class="primary" disabled={!!check.error}>Salva correzione</button></div>
	</form>
</dialog>
{/if}

<style>
	.edit { padding:2px 6px; font-size:12px; }
	dialog { color:var(--text); background:var(--panel); border:1px solid var(--accent); border-radius:12px; padding:24px; max-width:min(480px,90vw); }
	dialog::backdrop { background:#0009; }
	h2 { margin-top:0; font-size:18px; }
	label { display:block; margin:12px 0; }
	input, select { display:block; margin-top:5px; width:100%; }
	.actions { display:flex; justify-content:flex-end; gap:8px; }
</style>
