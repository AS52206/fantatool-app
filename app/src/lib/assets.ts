import { base } from '$app/paths';
import manifest from './assetsManifest.json';

// manifest generato da tools/sync_assets.py — importato in modo sincrono,
// così i <Crest> hanno l'URL già al primo render (niente fetch, niente race).
type Manifest = { loghi: Record<string, string>; stemmi: Record<string, string> };
const m = manifest as Manifest;

// deve restare allineata a `norm` in tools/sync_assets.py
const norm = (s: string) => s.trim().toLowerCase().replace(/[\s'’.\-_]/g, '');

/** URL del logo/stemma per un nome, o null se non c'è. */
export function urlCrest(nome: string | undefined | null, tipo: 'loghi' | 'stemmi'): string | null {
	if (!nome) return null;
	const file = m[tipo]?.[norm(nome)];
	return file ? `${base}/assets/${tipo}/${file}` : null;
}

/** Elenco {chiave, url} degli stemmi disponibili, per i selettori. */
export function stemmiDisponibili(): { chiave: string; file: string; url: string }[] {
	return Object.entries(m.stemmi ?? {}).map(([chiave, file]) => ({
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
