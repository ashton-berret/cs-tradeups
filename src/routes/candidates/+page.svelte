<script lang="ts">
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

	const rows = $derived(toCandidateRows(data.page.data, data.activePlans));
	const hasFilters = $derived(hasCandidateFilters(data.filter));

	function hrefForPage(page: number) {
		const params = new URLSearchParams(window.location.search);
		params.set('page', String(page));
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
		<Button onclick={() => (createOpen = true)}>Manual candidate</Button>
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
	</FilterBar>

	<DataTable
		columns={['Item', 'Status', 'Price', 'Float', 'Plan', 'EV', 'Actions']}
		rows={rows}
		emptyTitle="No candidates match these filters."
		emptyDescription="New extension or manual candidates will appear here after they are evaluated."
		clearHref={hasFilters ? '/candidates' : null}
	>
		{#snippet row(row)}
			<CandidateRow {row} ondetail={openDetail} onbuy={openBuy} ondelete={openDelete} />
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
