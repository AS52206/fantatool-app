import { base } from '$app/paths';

type Manifest = { loghi: Record<string, string>; stemmi: Record<string, string> };
let manifest: Manifest = { loghi: {}, stemmi: {} };
let caricato = false;

/** Carica app/static/assets/manifest.json una volta sola. */
export async function caricaManifestAsset(): Promise<void> {
	if (caricato) return;
	try {
		const r = await fetch(`${base}/assets/manifest.json`);
		if (r.ok) manifest = (await r.json()) as Manifest;
	} catch {
		/* nessun manifest: i crest non vengono mostrati */
	}
	caricato = true;
}

const norm = (s: string) => s.trim().toLowerCase().replace(/[\s'’.]/g, '');

/** URL del logo/stemma per un nome, o null se non c'è. */
export function urlCrest(nome: string | undefined | null, tipo: 'loghi' | 'stemmi'): string | null {
	if (!nome) return null;
	const file = manifest[tipo][norm(nome)];
	return file ? `${base}/assets/${tipo}/${file}` : null;
}

/** Elenco {chiave, url} degli stemmi disponibili, per i selettori. */
export function stemmiDisponibili(): { chiave: string; file: string; url: string }[] {
	return Object.entries(manifest.stemmi).map(([chiave, file]) => ({
		chiave,
		file,
		url: `${base}/assets/stemmi/${file}`
	}));
}

/** Data-URL base64 di un crest, per incorporarlo nell'Excel. null se assente. */
export async function crestBase64(
	nome: string | undefined | null,
	tipo: 'loghi' | 'stemmi'
): Promise<string | null> {
	const url = urlCrest(nome, tipo);
	if (!url) return null;
	try {
		const blob = await (await fetch(url)).blob();
		return await new Promise<string>((res, rej) => {
			const r = new FileReader();
			r.onload = () => res(r.result as string);
			r.onerror = rej;
			r.readAsDataURL(blob);
		});
	} catch {
		return null;
	}
}
