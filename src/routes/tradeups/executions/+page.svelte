<script lang="ts">
	import Button from '$lib/components/Button.svelte';
	import DataTable from '$lib/components/DataTable.svelte';
	import FilterBar from '$lib/components/FilterBar.svelte';
	import PaginationControl from '$lib/components/PaginationControl.svelte';
	import { hasExecutionFilters, toExecutionRows, type ExecutionRowVM } from '$lib/client/viewModels/executions';
	import ExecutionRow from './ExecutionRow.svelte';
	import NewExecutionModal from './NewExecutionModal.svelte';
	import RecordResultModal from './RecordResultModal.svelte';
	import RecordSaleModal from './RecordSaleModal.svelte';
	import type { ActionData, PageData } from './$types';

	let { data, form }: { data: PageData; form?: ActionData } = $props();

	let createOpen = $state(false);
	let resultOpen = $state(false);
	let saleOpen = $state(false);
	let selected = $state<ExecutionRowVM | null>(null);

	const rows = $derived(toExecutionRows(data.page.data));
	const hasFilters = $derived(hasExecutionFilters(data.filter));
	const planIds = $derived(Array.from(new Set(data.readyBaskets.map((basket) => basket.planId))));

	function hrefForPage(page: number) {
		const params = new URLSearchParams(window.location.search);
		params.set('page', String(page));
		return `?${params.toString()}`;
	}

	function openResult(row: ExecutionRowVM) {
		selected = row;
		resultOpen = true;
	}

	function openSale(row: ExecutionRowVM) {
		selected = row;
		saleOpen = true;
	}
</script>

<div class="space-y-6">
	<div class="flex flex-wrap items-start justify-between gap-4">
		<div>
			<h1 class="text-2xl font-semibold text-[var(--color-text-primary)]">Trade-up executions</h1>
			<p class="mt-1 text-sm text-[var(--color-text-secondary)]">
				Record completed contracts, their results, and eventual sales.
			</p>
		</div>
		<Button onclick={() => (createOpen = true)}>Record execution</Button>
	</div>

	{#if form?.error}
		<div class="rounded-md border border-[var(--color-danger)]/40 bg-[var(--color-danger)]/10 p-3 text-sm text-[var(--color-danger)]">{form.error}</div>
	{:else if form?.success}
		<div class="rounded-md border border-[var(--color-success)]/40 bg-[var(--color-success)]/10 p-3 text-sm text-[var(--color-success)]">{form.success}</div>
	{/if}

	<FilterBar resetHref="/tradeups/executions">
		<select name="planId" value={data.filter.planId ?? ''} class="rounded-md border border-[var(--color-border)] bg-[var(--color-bg-surface-overlay)] px-3 py-2 text-sm">
			<option value="">Any plan</option>
			{#each planIds as planId}
				<option value={planId}>{planId}</option>
			{/each}
		</select>
		<select name="hasResult" value={data.filter.hasResult == null ? '' : String(data.filter.hasResult)} class="rounded-md border border-[var(--color-border)] bg-[var(--color-bg-surface-overlay)] px-3 py-2 text-sm">
			<option value="">Any result state</option>
			<option value="true">Has result</option>
			<option value="false">Needs result</option>
		</select>
		<select name="hasSale" value={data.filter.hasSale == null ? '' : String(data.filter.hasSale)} class="rounded-md border border-[var(--color-border)] bg-[var(--color-bg-surface-overlay)] px-3 py-2 text-sm">
			<option value="">Any sale state</option>
			<option value="true">Has sale</option>
			<option value="false">Needs sale</option>
		</select>
	</FilterBar>

	<DataTable
		columns={['Executed', 'Stage', 'Input cost', 'Expected profit', 'Result', 'Realized profit', 'EV delta', 'Actions']}
		rows={rows}
		emptyTitle="No executions yet."
		emptyDescription="Mark a basket READY and record it here."
		clearHref={hasFilters ? '/tradeups/executions' : null}
	>
		{#snippet row(row)}
			<ExecutionRow {row} onresult={openResult} onsale={openSale} />
		{/snippet}
	</DataTable>

	<PaginationControl
		page={data.page.page}
		limit={data.page.limit}
		total={data.page.total}
		totalPages={data.page.totalPages}
		{hrefForPage}
	/>
</div>

<NewExecutionModal bind:open={createOpen} readyBaskets={data.readyBaskets} />
<RecordResultModal bind:open={resultOpen} execution={selected} />
<RecordSaleModal bind:open={saleOpen} execution={selected} />
