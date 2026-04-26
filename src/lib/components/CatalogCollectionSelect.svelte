<script lang="ts" module>
	// Module-scoped cache: the catalog snapshot is static and large enough that
	// re-fetching per-component instance would cost meaningful time. Every
	// instance shares the same in-flight promise and resolved value.
	let collectionsPromise: Promise<Array<{ id: string; name: string }>> | null = null;

	async function loadCollections(): Promise<Array<{ id: string; name: string }>> {
		if (collectionsPromise) return collectionsPromise;
		collectionsPromise = fetch('/api/catalog/summary')
			.then((response) => {
				if (!response.ok) throw new Error(`Catalog summary failed: ${response.status}`);
				return response.json();
			})
			.then((body: { collections: Array<{ id: string; name: string }> }) => body.collections)
			.catch((err) => {
				// Reset so a later focus retries; otherwise the component is stuck.
				collectionsPromise = null;
				throw err;
			});
		return collectionsPromise;
	}

	function rankSuggestions(
		collections: Array<{ id: string; name: string }>,
		query: string,
		limit: number,
	): Array<{ id: string; name: string }> {
		const trimmed = query.trim().toLowerCase();
		if (!trimmed) {
			return collections.slice(0, limit);
		}
		// Prefix match first, then substring match. Stable alphabetical within bucket.
		const prefix: Array<{ id: string; name: string }> = [];
		const substring: Array<{ id: string; name: string }> = [];
		for (const collection of collections) {
			const lower = collection.name.toLowerCase();
			if (lower.startsWith(trimmed)) {
				prefix.push(collection);
			} else if (lower.includes(trimmed)) {
				substring.push(collection);
			}
		}
		return [...prefix, ...substring].slice(0, limit);
	}
</script>

<script lang="ts">
	import { onMount } from 'svelte';

	type Props = {
		/** Form field name. The submitted value is the canonical collection display string. */
		name: string;
		/** Initial value — typically the rule/outcome's existing collection text. */
		value?: string;
		placeholder?: string;
		help?: string;
		/** Visible label above the input. */
		label?: string;
		/** Inline error from the parent's form action result. */
		error?: string;
		/** Maximum number of dropdown suggestions. Defaults to 8. */
		limit?: number;
	};

	let {
		name,
		value = $bindable(''),
		placeholder = 'Collection',
		help,
		label,
		error,
		limit = 8,
	}: Props = $props();

	let collections = $state<Array<{ id: string; name: string }>>([]);
	let loadError = $state<string | null>(null);
	let open = $state(false);
	let highlightedIndex = $state(0);
	let inputEl: HTMLInputElement | undefined;
	let containerEl: HTMLDivElement | undefined;

	const suggestions = $derived(rankSuggestions(collections, value ?? '', limit));
	const trimmedValue = $derived((value ?? '').trim().toLowerCase());
	const isCatalogLinked = $derived(
		trimmedValue.length > 0 &&
			collections.some((collection) => collection.name.toLowerCase() === trimmedValue),
	);
	const showFreeTextWarning = $derived(
		(value ?? '').trim().length > 0 && collections.length > 0 && !isCatalogLinked,
	);

	onMount(() => {
		loadCollections()
			.then((result) => {
				collections = result;
			})
			.catch((err) => {
				loadError = err instanceof Error ? err.message : 'Failed to load catalog';
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
				selectCollection(choice.name);
				event.preventDefault();
			}
		} else if (event.key === 'Escape') {
			open = false;
		}
	}

	function selectCollection(canonicalName: string) {
		value = canonicalName;
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
		{#if (value ?? '').trim().length > 0}
			<span
				class={[
					'pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 rounded-full border px-2 py-0.5 text-[10px] uppercase tracking-wide',
					isCatalogLinked
						? 'border-[var(--color-success)]/40 bg-[var(--color-success)]/10 text-[var(--color-success)]'
						: 'border-[var(--color-warning)]/40 bg-[var(--color-warning)]/10 text-[var(--color-warning)]',
				].join(' ')}
				title={isCatalogLinked
					? 'Matches a known catalog collection — rules will catalog-link.'
					: 'Free text — rules will only match by exact string. Pick from the dropdown to catalog-link.'}
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
								'flex w-full items-center justify-between px-3 py-1.5 text-left transition-colors',
								idx === highlightedIndex
									? 'bg-[var(--color-primary)]/10 text-[var(--color-primary)]'
									: 'text-[var(--color-text-primary)] hover:bg-[var(--color-bg-surface-overlay)]',
							].join(' ')}
							onmouseenter={() => (highlightedIndex = idx)}
							onmousedown={(event) => {
								event.preventDefault();
								selectCollection(suggestion.name);
							}}
						>
							<span>{suggestion.name}</span>
							<span class="text-xs text-[var(--color-text-muted)]">{suggestion.id}</span>
						</button>
					</li>
				{/each}
			</ul>
		{/if}
	</div>
	{#if loadError}
		<p class="mt-2 text-xs text-[var(--color-danger)]">
			Catalog suggestions unavailable: {loadError}. You can still type a collection name; the server will try to resolve it.
		</p>
	{:else if showFreeTextWarning}
		<p class="mt-2 text-xs text-[var(--color-warning)]">
			This text doesn't match any known catalog collection. Rule will only match candidates whose collection string is exactly this text.
		</p>
	{:else if help}
		<p class="mt-2 text-xs text-[var(--color-text-muted)]">{help}</p>
	{/if}
	{#if error}
		<p class="mt-2 text-sm text-[var(--color-danger)]">{error}</p>
	{/if}
</div>
