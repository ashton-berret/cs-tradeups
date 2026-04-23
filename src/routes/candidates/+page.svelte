<script lang="ts">
	import { page } from '$app/state';
	import { enhance } from '$app/forms';
	import Badge from '$lib/components/Badge.svelte';
	import Button from '$lib/components/Button.svelte';
	import ConfirmModal from '$lib/components/ConfirmModal.svelte';
	import DataTable from '$lib/components/DataTable.svelte';
	import FilterBar from '$lib/components/FilterBar.svelte';
	import Input from '$lib/components/Input.svelte';
	import Modal from '$lib/components/Modal.svelte';
	import PaginationControl from '$lib/components/PaginationControl.svelte';
	import { CANDIDATE_DECISION_STATUSES, ITEM_EXTERIORS, ITEM_RARITIES } from '$lib/types/enums';
	import {
		hasCandidateFilters,
		toCandidateRows,
		type CandidateRowVM
	} from '$lib/client/viewModels/candidates';
	import CandidateRow from './CandidateRow.svelte';
	import CandidateDetailModal from './CandidateDetailModal.svelte';
	import BuyCandidateModal from './BuyCandidateModal.svelte';
	import type { ActionData, PageData } from './$types';

	let { data, form }: { data: PageData; form?: ActionData } = $props();

	let createOpen = $state(false);
	let detailOpen = $state(false);
	let buyOpen = $state(false);
	let deleteOpen = $state(false);
	let selected = $state<CandidateRowVM | null>(null);
	let checkedIds = $state(new Set<string>());

	const rows = $derived(toCandidateRows(data.page.data, data.activePlans));
	const hasFilters = $derived(hasCandidateFilters(data.filter));
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

	function hrefForPage(nextPage: number) {
		const params = new URLSearchParams(page.url.searchParams);
		params.set('page', String(nextPage));
		return `?${params.toString()}`;
	}

	function openDetail(row: CandidateRowVM) {
		selected = row;
		detailOpen = true;
	}

	function openBuy(row: CandidateRowVM) {
		selected = row;
		buyOpen = true;
	}

	function openDelete(row: CandidateRowVM) {
		selected = row;
		deleteOpen = true;
	}
</script>

<div class="space-y-6">
	<div class="flex flex-wrap items-start justify-between gap-4">
		<div>
			<h1 class="text-2xl font-semibold text-[var(--color-text-primary)]">Candidates</h1>
			<p class="mt-1 text-sm text-[var(--color-text-secondary)]">
				Review evaluated listings and convert purchased items into inventory.
			</p>
		</div>
		<div class="flex flex-wrap gap-2">
			<form method="POST" action="?/refreshStale" use:enhance>
				<Button type="submit" variant="secondary">Refresh stale</Button>
			</form>
			<Button onclick={() => (createOpen = true)}>Manual candidate</Button>
		</div>
	</div>

	{#if form?.error}
		<div class="rounded-md border border-[var(--color-danger)]/40 bg-[var(--color-danger)]/10 p-3 text-sm text-[var(--color-danger)]">
			{form.error}
		</div>
	{:else if form?.success}
		<div class="rounded-md border border-[var(--color-success)]/40 bg-[var(--color-success)]/10 p-3 text-sm text-[var(--color-success)]">
			{form.success}
		</div>
	{/if}

	<FilterBar resetHref="/candidates">
		<select name="status" value={data.filter.status ?? ''} class="rounded-md border border-[var(--color-border)] bg-[var(--color-bg-surface-overlay)] px-3 py-2 text-sm">
			<option value="">Any status</option>
			{#each CANDIDATE_DECISION_STATUSES as status}
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
		<Input name="search" placeholder="Search" value={data.filter.search ?? ''} class="w-56" />
		<Input name="minFloat" type="number" step="0.000001" min="0" max="1" placeholder="Min float" value={data.filter.minFloat ?? ''} class="w-32" />
		<Input name="maxFloat" type="number" step="0.000001" min="0" max="1" placeholder="Max float" value={data.filter.maxFloat ?? ''} class="w-32" />
		<Input name="minPrice" type="number" step="0.01" min="0" placeholder="Min $" value={data.filter.minPrice ?? ''} class="w-28" />
		<Input name="maxPrice" type="number" step="0.01" min="0" placeholder="Max $" value={data.filter.maxPrice ?? ''} class="w-28" />
		<select name="sortBy" value={data.filter.sortBy ?? 'createdAt'} class="rounded-md border border-[var(--color-border)] bg-[var(--color-bg-surface-overlay)] px-3 py-2 text-sm">
			<option value="createdAt">Sort: newest</option>
			<option value="listPrice">Sort: price</option>
			<option value="floatValue">Sort: float</option>
			<option value="qualityScore">Sort: quality</option>
			<option value="expectedProfit">Sort: expected profit</option>
			<option value="marginalBasketValue">Sort: basket Δ</option>
		</select>
		<select name="sortDir" value={data.filter.sortDir ?? 'desc'} class="rounded-md border border-[var(--color-border)] bg-[var(--color-bg-surface-overlay)] px-3 py-2 text-sm">
			<option value="desc">desc</option>
			<option value="asc">asc</option>
		</select>
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
		columns={['', 'Item', 'Status', 'Price', 'Float', 'Plan', 'EV', 'Basket Δ', 'Actions']}
		rows={rows}
		emptyTitle="No candidates match these filters."
		emptyDescription="New extension or manual candidates will appear here after they are evaluated."
		clearHref={hasFilters ? '/candidates' : null}
	>
		{#snippet row(row)}
			<CandidateRow
				{row}
				checked={checkedIds.has(row.id)}
				onselect={toggleRow}
				ondetail={openDetail}
				onbuy={openBuy}
				ondelete={openDelete}
			/>
		{/snippet}
	</DataTable>

	{#if selectedIds.length > 0}
		<div class="sticky bottom-4 z-20 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-surface)] p-3 shadow-lg">
			<span class="text-sm text-[var(--color-text-secondary)]">{selectedIds.length} selected</span>
			<div class="flex flex-wrap gap-2">
				<form method="POST" action="?/bulkStatus" use:enhance>
					{#each selectedIds as id}
						<input type="hidden" name="ids" value={id} />
					{/each}
					<input type="hidden" name="status" value="WATCHING" />
					<Button type="submit" size="sm" variant="ghost">Watch</Button>
				</form>
				<form method="POST" action="?/bulkStatus" use:enhance>
					{#each selectedIds as id}
						<input type="hidden" name="ids" value={id} />
					{/each}
					<input type="hidden" name="status" value="PASSED" />
					<Button type="submit" size="sm" variant="ghost">Pass</Button>
				</form>
				<form method="POST" action="?/bulkStatus" use:enhance>
					{#each selectedIds as id}
						<input type="hidden" name="ids" value={id} />
					{/each}
					<input type="hidden" name="status" value="GOOD_BUY" />
					<Button type="submit" size="sm" variant="ghost">Good</Button>
				</form>
				<form method="POST" action="?/bulkReevaluate" use:enhance>
					{#each selectedIds as id}
						<input type="hidden" name="ids" value={id} />
					{/each}
					<Button type="submit" size="sm" variant="secondary">Re-eval</Button>
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

<Modal bind:open={createOpen} title="Manual candidate">
	<form method="POST" action="?/create" class="space-y-4" use:enhance>
		<Input id="marketHashName" name="marketHashName" label="Market hash name" required />
		<div class="grid grid-cols-2 gap-3">
			<Input name="weaponName" label="Weapon" />
			<Input name="skinName" label="Skin" />
			<Input name="collection" label="Collection" />
			<Input name="listPrice" type="number" step="0.01" min="0" label="List price" required />
		</div>
		<div class="grid grid-cols-2 gap-3">
			<select name="rarity" class="rounded-md border border-[var(--color-border)] bg-[var(--color-bg-surface-overlay)] px-3 py-2 text-sm">
				<option value="">Rarity</option>
				{#each ITEM_RARITIES as rarity}
					<option value={rarity}>{rarity.replaceAll('_', ' ')}</option>
				{/each}
			</select>
			<select name="exterior" class="rounded-md border border-[var(--color-border)] bg-[var(--color-bg-surface-overlay)] px-3 py-2 text-sm">
				<option value="">Exterior</option>
				{#each ITEM_EXTERIORS as exterior}
					<option value={exterior}>{exterior.replaceAll('_', ' ')}</option>
				{/each}
			</select>
			<Input name="floatValue" type="number" step="0.000001" min="0" max="1" label="Float" />
			<Input name="pattern" type="number" step="1" min="0" label="Pattern" />
		</div>
		<Input name="listingUrl" type="url" label="Listing URL" />
		<Input name="inspectLink" type="url" label="Inspect link" />
		<textarea name="notes" rows="3" placeholder="Notes" class="w-full rounded-md border border-[var(--color-border)] bg-[var(--color-bg-surface-overlay)] px-3 py-2 text-sm"></textarea>
		<div class="flex justify-end gap-2">
			<Button variant="secondary" onclick={() => (createOpen = false)}>Cancel</Button>
			<Button type="submit">Create</Button>
		</div>
	</form>
</Modal>

<CandidateDetailModal bind:open={detailOpen} candidate={selected} />
<BuyCandidateModal bind:open={buyOpen} candidate={selected} />
<ConfirmModal
	bind:open={deleteOpen}
	title="Delete candidate"
	message={selected ? `Delete ${selected.marketHashName}? This cannot be undone.` : ''}
	action="?/delete"
	fields={{ id: selected?.id }}
	confirmLabel="Delete"
/>
