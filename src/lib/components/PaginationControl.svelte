<script lang="ts">
	import Button from './Button.svelte';

	type Props = {
		page: number;
		limit: number;
		total: number;
		totalPages: number;
		hrefForPage: (page: number) => string;
	};

	let { page, limit, total, totalPages, hrefForPage }: Props = $props();
	const start = $derived(total === 0 ? 0 : (page - 1) * limit + 1);
	const end = $derived(Math.min(page * limit, total));
</script>

<div class="flex flex-wrap items-center justify-between gap-3 text-sm text-[var(--color-text-secondary)]">
	<div>{start}-{end} of {total}</div>
	<div class="flex items-center gap-2">
		<a href={hrefForPage(Math.max(1, page - 1))} aria-disabled={page <= 1}>
			<Button variant="secondary" size="sm" disabled={page <= 1}>Previous</Button>
		</a>
		<span>Page {page} of {Math.max(totalPages, 1)}</span>
		<a href={hrefForPage(Math.min(totalPages, page + 1))} aria-disabled={page >= totalPages}>
			<Button variant="secondary" size="sm" disabled={page >= totalPages}>Next</Button>
		</a>
	</div>
</div>
