<script lang="ts" generics="T">
	import type { Snippet } from 'svelte';
	import Button from './Button.svelte';
	import Card from './Card.svelte';

	type Props = {
		columns: string[];
		rows: T[];
		loading?: boolean;
		error?: string | null;
		emptyTitle?: string;
		emptyDescription?: string;
		clearHref?: string | null;
		row: Snippet<[T]>;
	};

	let {
		columns,
		rows,
		loading = false,
		error = null,
		emptyTitle = 'No rows',
		emptyDescription = '',
		clearHref = null,
		row
	}: Props = $props();
</script>

<Card padding="none" class="overflow-hidden">
	{#if loading}
		<div class="h-1 w-full overflow-hidden bg-[var(--color-bg-surface-overlay)]">
			<div class="h-full w-1/3 animate-pulse bg-[var(--color-primary)]"></div>
		</div>
	{/if}

	{#if error}
		<div class="p-6 text-sm text-[var(--color-danger)]">{error}</div>
	{:else if rows.length === 0}
		<div class="flex min-h-48 flex-col items-center justify-center gap-3 p-8 text-center">
			<h2 class="text-base font-semibold text-[var(--color-text-primary)]">{emptyTitle}</h2>
			{#if emptyDescription}
				<p class="max-w-md text-sm text-[var(--color-text-secondary)]">{emptyDescription}</p>
			{/if}
			{#if clearHref}
				<a href={clearHref}>
					<Button variant="secondary" size="sm">Clear filters</Button>
				</a>
			{/if}
		</div>
	{:else}
		<div class="overflow-x-auto">
			<table class="w-full min-w-max text-left text-sm">
				<thead class="border-b border-[var(--color-border)] bg-[var(--color-bg-surface)]/60 text-[10px] font-semibold uppercase tracking-wider text-[var(--color-text-muted)]">
					<tr>
						{#each columns as column}
							<th class="px-4 py-3">{column}</th>
						{/each}
					</tr>
				</thead>
				<tbody class="divide-y divide-[var(--color-border)]/60">
					{#each rows as item}
						<tr class="align-top transition-colors hover:bg-[var(--color-bg-surface-overlay)]/40">
							{@render row(item)}
						</tr>
					{/each}
				</tbody>
			</table>
		</div>
	{/if}
</Card>
