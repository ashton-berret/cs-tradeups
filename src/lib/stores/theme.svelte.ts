type Theme = 'dark' | 'light';

const STORAGE_KEY = 'cs-tradeups-theme';

let current = $state<Theme>('dark');

function applyTheme(theme: Theme) {
	document.documentElement.classList.toggle('light', theme === 'light');
}

function readStoredTheme(): Theme {
	const stored = localStorage.getItem(STORAGE_KEY);
	return stored === 'light' ? 'light' : 'dark';
}

export const theme = {
	get current() {
		return current;
	},
	initialize() {
		if (typeof window === 'undefined') return;
		current = readStoredTheme();
		applyTheme(current);
	},
	toggle() {
		if (typeof window === 'undefined') return;
		current = current === 'dark' ? 'light' : 'dark';
		localStorage.setItem(STORAGE_KEY, current);
		applyTheme(current);
	},
	set(theme: Theme) {
		if (typeof window === 'undefined') return;
		current = theme;
		localStorage.setItem(STORAGE_KEY, current);
		applyTheme(current);
	}
};
