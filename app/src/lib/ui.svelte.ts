/** Preferenze d'aspetto: tema chiaro/scuro e densità righe. Persistite. */
const CHIAVE = 'fantatool.ui';

type Tema = 'scuro' | 'chiaro';
type Densita = 'comoda' | 'compatta';

function carica(): { tema: Tema; densita: Densita } {
	if (typeof localStorage !== 'undefined') {
		try {
			const s = JSON.parse(localStorage.getItem(CHIAVE) || '{}');
			return {
				tema: s.tema === 'chiaro' ? 'chiaro' : 'scuro',
				densita: s.densita === 'compatta' ? 'compatta' : 'comoda'
			};
		} catch {
			/* default */
		}
	}
	return { tema: 'scuro', densita: 'comoda' };
}

class UI {
	tema = $state<Tema>('scuro');
	densita = $state<Densita>('comoda');

	constructor() {
		const s = carica();
		this.tema = s.tema;
		this.densita = s.densita;
		$effect.root(() => {
			$effect(() => {
				if (typeof document !== 'undefined') {
					document.documentElement.dataset.theme = this.tema;
					document.documentElement.dataset.density = this.densita;
				}
				try {
					localStorage.setItem(CHIAVE, JSON.stringify({ tema: this.tema, densita: this.densita }));
				} catch {
					/* ignora */
				}
			});
		});
	}

	toggleTema() {
		this.tema = this.tema === 'scuro' ? 'chiaro' : 'scuro';
	}
	toggleDensita() {
		this.densita = this.densita === 'comoda' ? 'compatta' : 'comoda';
	}
}

export const ui = new UI();
