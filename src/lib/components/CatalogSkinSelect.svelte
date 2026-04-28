<script lang="ts" module>
	import type { CatalogSkinSummary } from '../../routes/api/catalog/skins/+server';

	let skinsPromise: Promise<CatalogSkinSummary[]> | null = null;

	export async function loadSkins(): Promise<CatalogSkinSummary[]> {
		if (skinsPromise) return skinsPromise;
		skinsPromise = fetch('/api/catalog/skins')
			.then((response) => {
				if (!response.ok) throw new Error(`Catalog skins failed: ${response.status}`);
				return response.json();
			})
			.then((body: { skins: CatalogSkinSummary[] }) => body.skins)
			.catch((err) => {
				skinsPromise = null;
				throw err;
			});
		return skinsPromise;
	}

	function rankSuggestions(
		skins: CatalogSkinSummary[],
		query: string,
		limit: number,
	): CatalogSkinSummary[] {
		const trimmed = query.trim().toLowerCase();
		if (!trimmed) {
			return skins.slice(0, limit);
		}
		const prefix: CatalogSkinSummary[] = [];
		const substring: CatalogSkinSummary[] = [];
		for (const skin of skins) {
			const lower = skin.displayName.toLowerCase();
			if (lower.startsWith(trimmed)) {
				prefix.push(skin);
			} else if (lower.includes(trimmed)) {
				substring.push(skin);
			}
		}
		return [...prefix, ...substring].slice(0, limit);
	}
</script>

<script lang="ts">
	import { onMount } from 'svelte';
	import type { ItemRarity } from '$lib/types/enums';

	type Props = {
		name: string;
		/** Display value — typically `${weapon} | ${skin}`. */
		value?: string;
		/** Canonical catalog skin id. Empty string when value is free text. */
		skinId?: string;
		/** Optional scope: only show skins from this catalog collection id. */
		collectionId?: string | null;
		/** Optional scope: only show skins of this rarity. */
		rarity?: ItemRarity | null;
		placeholder?: string;
		help?: string;
		label?: string;
		error?: string;
		limit?: number;
	};

	let {
		name,
		value = $bindable(''),
		skinId = $bindable(''),
		collectionId = null,
		rarity = null,
		placeholder = 'Skin',
		help,
		label,
		error,
		limit = 10,
	}: Props = $props();

	let skins = $state<CatalogSkinSummary[]>([]);
	let loadError = $state<string | null>(null);
	let open = $state(false);
	let highlightedIndex = $state(0);
	let inputEl: HTMLInputElement | undefined;
	let containerEl: HTMLDivElement | undefined;

	const scopedSkins = $derived(
		skins.filter((skin) => {
			if (collectionId && skin.collectionId !== collectionId) return false;
			if (rarity && skin.rarity !== rarity) return false;
			return true;
		}),
	);
	const suggestions = $derived(rankSuggestions(scopedSkins, value ?? '', limit));
	const trimmedValue = $derived((value ?? '').trim().toLowerCase());
	const isCatalogLinked = $derived(
		trimmedValue.length > 0 &&
			scopedSkins.some((skin) => skin.displayName.toLowerCase() === trimmedValue),
	);
	const showFreeTextWarning = $derived(
		(value ?? '').trim().length > 0 && skins.length > 0 && !isCatalogLinked,
	);

	onMount(() => {
		loadSkins()
			.then((result) => {
				skins = result;
			})
			.catch((err) => {
				loadError = err instanceof Error ? err.message : 'Failed to load catalog skins';
			});

		function handleClickOutside(event: MouseEvent) {
			if (!containerEl) return;
			if (!containerEl.contains(event.target as Node)) {
				open = false;
			}
		}
		document.addEventListener('mousedown', handleClickOutside);
		return () => document.removeEventListener('mousedown', handleClickOutside);
	});

	function handleFocus() {
		open = true;
	}

	function handleInput() {
		open = true;
		highlightedIndex = 0;
		// Free-text edits invalidate any prior catalog selection.
		if (skinId) skinId = '';
	}

	function handleKeydown(event: KeyboardEvent) {
		if (!open) {
			if (event.key === 'ArrowDown' || event.key === 'Enter') {
				open = true;
				event.preventDefault();
			}
			return;
		}
		if (event.key === 'ArrowDown') {
			highlightedIndex = Math.min(highlightedIndex + 1, suggestions.length - 1);
			event.preventDefault();
		} else if (event.key === 'ArrowUp') {
			highlightedIndex = Math.max(highlightedIndex - 1, 0);
			event.preventDefault();
		} else if (event.key === 'Enter') {
			const choice = suggestions[highlightedIndex];
			if (choice) {
				selectSkin(choice);
				event.preventDefault();
			}
		} else if (event.key === 'Escape') {
			open = false;
		}
	}

	function selectSkin(skin: CatalogSkinSummary) {
		value = skin.displayName;
		skinId = skin.id;
		open = false;
		highlightedIndex = 0;
	}
</script>

<div bind:this={containerEl} class="relative">
	{#if label}
		<label for={name} class="mb-2 block text-sm font-medium text-[var(--color-text-secondary)]">
			{label}
		</label>
	{/if}
	<div class="relative">
		<input
			bind:this={inputEl}
			{name}
			id={name}
			type="text"
			autocomplete="off"
			{placeholder}
			bind:value
			onfocus={handleFocus}
			oninput={handleInput}
			onkeydown={handleKeydown}
			role="combobox"
			aria-invalid={error ? 'true' : undefined}
			aria-autocomplete="list"
			aria-expanded={open}
			aria-controls={`${name}-listbox`}
			class={[
				'w-full rounded-md border bg-[var(--color-bg-surface-overlay)] px-4 py-2 pr-20 text-sm text-[var(--color-text-primary)] transition-colors placeholder:text-[var(--color-text-muted)] focus:outline-none focus:ring-2 focus:ring-offset-0',
				error
					? 'border-[var(--color-danger)] focus:border-[var(--color-danger)] focus:ring-[var(--color-danger)]/20'
					: 'border-[var(--color-border)] focus:border-[var(--color-primary)] focus:ring-[var(--color-primary)]/20',
			].join(' ')}
		/>
		<input type="hidden" name={`${name}-id`} value={skinId} />
		{#if (value ?? '').trim().length > 0}
			<span
				class={[
					'pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 rounded-full border px-2 py-0.5 text-[10px] uppercase tracking-wide',
					isCatalogLinked
						? 'border-[var(--color-success)]/40 bg-[var(--color-success)]/10 text-[var(--color-success)]'
						: 'border-[var(--color-warning)]/40 bg-[var(--color-warning)]/10 text-[var(--color-warning)]',
				].join(' ')}
				title={isCatalogLinked
					? 'Matches a known catalog skin — output exterior projection enabled.'
					: 'Free text — pick from the dropdown to enable output projection.'}
			>
				{isCatalogLinked ? 'Linked' : 'Free'}
			</span>
		{/if}
		{#if open && suggestions.length > 0}
			<ul
				id={`${name}-listbox`}
				role="listbox"
				class="absolute left-0 right-0 top-full z-20 mt-1 max-h-72 overflow-y-auto rounded-md border border-[var(--color-border)] bg-[var(--color-bg-surface-elevated)] py-1 text-sm shadow-lg"
			>
				{#each suggestions as suggestion, idx}
					<li>
						<button
							type="button"
							role="option"
							aria-selected={idx === highlightedIndex}
							class={[
								'flex w-full items-center justify-between gap-3 px-3 py-1.5 text-left transition-colors',
								idx === highlightedIndex
									? 'bg-[var(--color-primary)]/10 text-[var(--color-primary)]'
									: 'text-[var(--color-text-primary)] hover:bg-[var(--color-bg-surface-overlay)]',
							].join(' ')}
							onmouseenter={() => (highlightedIndex = idx)}
							onmousedown={(event) => {
								event.preventDefault();
								selectSkin(suggestion);
							}}
						>
							<span class="truncate">{suggestion.displayName}</span>
							<span class="shrink-0 text-xs text-[var(--color-text-muted)]">
								{suggestion.collectionName}
							</span>
						</button>
					</li>
				{/each}
			</ul>
		{/if}
	</div>
	{#if loadError}
		<p class="mt-2 text-xs text-[var(--color-danger)]">
			Catalog skins unavailable: {loadError}.
		</p>
	{:else if showFreeTextWarning}
		<p class="mt-2 text-xs text-[var(--color-warning)]">
			This text doesn't match any known catalog skin. Pick from the dropdown to enable output projection.
		</p>
	{:else if help}
		<p class="mt-2 text-xs text-[var(--color-text-muted)]">{help}</p>
	{/if}
	{#if error}
		<p class="mt-2 text-sm text-[var(--color-danger)]">{error}</p>
	{/if}
</div>
