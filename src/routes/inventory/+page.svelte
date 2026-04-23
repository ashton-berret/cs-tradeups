<script lang="ts">
	import { enhance } from '$app/forms';
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
	let checkedIds = $state(new Set<string>());

	const rows = $derived(toInventoryRows(data.page.data));
	const hasFilters = $derived(hasInventoryFilters(data.filter));
	const selectedIds = $derived(rows.filter((row) => checkedIds.has(row.id)).map((row) => row.id));
	const allVisibleSelected = $derived(rows.length > 0 && rows.every((row) => checkedIds.has(row.id)));

	function toggleRow(id: string, checked: boolean) {
		const next = new Set(checkedIds);
		if (checked) next.add(id);
		else next.delete(id);
		checkedIds = next;
	}

	function toggleAllVisible(checked: boolean) {
		const next = new Set(checkedIds);
		for (const row of rows) {
			if (checked) next.add(row.id);
			else next.delete(row.id);
		}
		checkedIds = next;
	}

	function clearSelection() {
		checkedIds = new Set();
	}

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

	<div class="flex items-center gap-3">
		<label class="flex items-center gap-2 text-xs text-[var(--color-text-muted)]">
			<input
				type="checkbox"
				checked={allVisibleSelected}
				onchange={(event) => toggleAllVisible((event.target as HTMLInputElement).checked)}
			/>
			Select all on this page
		</label>
		{#if selectedIds.length > 0}
			<span class="text-xs text-[var(--color-text-secondary)]">{selectedIds.length} selected</span>
			<button type="button" class="text-xs underline text-[var(--color-text-secondary)]" onclick={clearSelection}>clear</button>
		{/if}
	</div>

	<DataTable
		columns={['', 'Item', 'Status', 'Cost', 'Est. value', 'Delta', 'Float', 'Actions']}
		rows={rows}
		emptyTitle="No inventory items match these filters."
		emptyDescription="Bought candidates and manual purchases appear here."
		clearHref={hasFilters ? '/inventory' : null}
	>
		{#snippet row(row)}
			<InventoryRow
				{row}
				checked={checkedIds.has(row.id)}
				onselect={toggleRow}
				onedit={openEdit}
				ondelete={openDelete}
			/>
		{/snippet}
	</DataTable>

	{#if selectedIds.length > 0}
		<div class="sticky bottom-4 z-20 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-surface)] p-3 shadow-lg">
			<span class="text-sm text-[var(--color-text-secondary)]">{selectedIds.length} selected</span>
			<div class="flex flex-wrap gap-2">
				<form method="POST" action="?/bulkArchive" use:enhance>
					{#each selectedIds as id}
						<input type="hidden" name="ids" value={id} />
					{/each}
					<Button type="submit" size="sm" variant="secondary">Archive</Button>
				</form>
				<form method="POST" action="?/bulkDelete" use:enhance>
					{#each selectedIds as id}
						<input type="hidden" name="ids" value={id} />
					{/each}
					<Button type="submit" size="sm" variant="danger">Delete</Button>
				</form>
			</div>
		</div>
	{/if}

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
