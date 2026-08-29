/**
 * Porting di fantatool.engine.normalizza_nome.
 * Deve produrre ESATTAMENTE la stessa stringa dello script Python
 * (tools/export_json.py usa la stessa logica) perché le chiavi combacino.
 */
export function normalizzaNome(nome: unknown): string {
	if (nome === null || nome === undefined) return '';
	let s = String(nome).trim().toLowerCase();
	// NFD + rimozione dei segni diacritici (unicode category "Mn")
	s = s.normalize('NFD').replace(/\p{Mn}/gu, '');
	s = s.replace(/['’.\-]/g, '');
	return s.split(/\s+/).filter(Boolean).join(' ');
}
