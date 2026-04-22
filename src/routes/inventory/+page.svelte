<script lang="ts">
	import Button from '$lib/components/Button.svelte';
	import ConfirmModal from '$lib/components/ConfirmModal.svelte';
	import DataTable from '$lib/components/DataTable.svelte';
	import FilterBar from '$lib/components/FilterBar.svelte';
	import Input from '$lib/components/Input.svelte';
	import PaginationControl from '$lib/components/PaginationControl.svelte';
	import { INVENTORY_STATUSES, ITEM_EXTERIORS, ITEM_RARITIES } from '$lib/types/enums';
	import {
		hasInventoryFilters,
		toInventoryRows,
		type InventoryRowVM
	} from '$lib/client/viewModels/inventory';
	import InventoryRow from './InventoryRow.svelte';
	import InventoryEditModal from './InventoryEditModal.svelte';
	import ManualAddInventoryModal from './ManualAddInventoryModal.svelte';
	import type { ActionData, PageData } from './$types';

	let { data, form }: { data: PageData; form?: ActionData } = $props();

	let createOpen = $state(false);
	let editOpen = $state(false);
	let deleteOpen = $state(false);
	let selected = $state<InventoryRowVM | null>(null);

	const rows = $derived(toInventoryRows(data.page.data));
	const hasFilters = $derived(hasInventoryFilters(data.filter));

	function hrefForPage(page: number) {
		const params = new URLSearchParams(window.location.search);
		params.set('page', String(page));
		return `?${params.toString()}`;
	}

	function openEdit(row: InventoryRowVM) {
		selected = row;
		editOpen = true;
	}

	function openDelete(row: InventoryRowVM) {
		selected = row;
		deleteOpen = true;
	}
</script>

<div class="space-y-6">
	<div class="flex flex-wrap items-start justify-between gap-4">
		<div>
			<h1 class="text-2xl font-semibold text-[var(--color-text-primary)]">Inventory</h1>
			<p class="mt-1 text-sm text-[var(--color-text-secondary)]">
				Manage held items, estimated value, status, and notes.
			</p>
		</div>
		<Button onclick={() => (createOpen = true)}>Manual item</Button>
	</div>

	{#if form?.error}
		<div class="rounded-md border border-[var(--color-danger)]/40 bg-[var(--color-danger)]/10 p-3 text-sm text-[var(--color-danger)]">{form.error}</div>
	{:else if form?.success}
		<div class="rounded-md border border-[var(--color-success)]/40 bg-[var(--color-success)]/10 p-3 text-sm text-[var(--color-success)]">{form.success}</div>
	{/if}

	<FilterBar resetHref="/inventory">
		<select name="status" value={data.filter.status ?? ''} class="rounded-md border border-[var(--color-border)] bg-[var(--color-bg-surface-overlay)] px-3 py-2 text-sm">
			<option value="">Any status</option>
			{#each INVENTORY_STATUSES as status}
				<option value={status}>{status.replaceAll('_', ' ')}</option>
			{/each}
		</select>
		<select name="rarity" value={data.filter.rarity ?? ''} class="rounded-md border border-[var(--color-border)] bg-[var(--color-bg-surface-overlay)] px-3 py-2 text-sm">
			<option value="">Any rarity</option>
			{#each ITEM_RARITIES as rarity}
				<option value={rarity}>{rarity.replaceAll('_', ' ')}</option>
			{/each}
		</select>
		<select name="exterior" value={data.filter.exterior ?? ''} class="rounded-md border border-[var(--color-border)] bg-[var(--color-bg-surface-overlay)] px-3 py-2 text-sm">
			<option value="">Any exterior</option>
			{#each ITEM_EXTERIORS as exterior}
				<option value={exterior}>{exterior.replaceAll('_', ' ')}</option>
			{/each}
		</select>
		<select name="availableForBasket" value={data.filter.availableForBasket ? 'true' : ''} class="rounded-md border border-[var(--color-border)] bg-[var(--color-bg-surface-overlay)] px-3 py-2 text-sm">
			<option value="">All availability</option>
			<option value="true">Available for basket</option>
		</select>
		<Input name="search" placeholder="Search" value={data.filter.search ?? ''} class="w-56" />
	</FilterBar>

	<DataTable
		columns={['Item', 'Status', 'Cost', 'Est. value', 'Delta', 'Float', 'Actions']}
		rows={rows}
		emptyTitle="No inventory items match these filters."
		emptyDescription="Bought candidates and manual purchases appear here."
		clearHref={hasFilters ? '/inventory' : null}
	>
		{#snippet row(row)}
			<InventoryRow {row} onedit={openEdit} ondelete={openDelete} />
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

<ManualAddInventoryModal bind:open={createOpen} />
<InventoryEditModal bind:open={editOpen} item={selected} />
<ConfirmModal
	bind:open={deleteOpen}
	title="Delete inventory item"
	message={selected ? `Delete ${selected.marketHashName}? This cannot be undone.` : ''}
	action="?/delete"
	fields={{ id: selected?.id }}
	confirmLabel="Delete"
/>
