<script lang="ts">
	import { page } from '$app/state';
	import Button from '$lib/components/Button.svelte';
	import Card from '$lib/components/Card.svelte';
	import ConfirmModal from '$lib/components/ConfirmModal.svelte';
	import FilterBar from '$lib/components/FilterBar.svelte';
	import Input from '$lib/components/Input.svelte';
	import Modal from '$lib/components/Modal.svelte';
	import PaginationControl from '$lib/components/PaginationControl.svelte';
	import { TRADEUP_BASKET_STATUSES } from '$lib/types/enums';
	import {
		hasBasketFilters,
		toBasketCards,
		type BasketCardVM
	} from '$lib/client/viewModels/baskets';
	import BasketCard from './BasketCard.svelte';
	import BasketBuilderModal from './BasketBuilderModal.svelte';
	import type { ActionData, PageData } from './$types';

	let { data, form }: { data: PageData; form?: ActionData } = $props();

	let createOpen = $state(false);
	let builderOpen = $state(false);
	let cancelOpen = $state(false);
	let deleteOpen = $state(false);
	let selected = $state<BasketCardVM | null>(null);

	const cards = $derived(toBasketCards(data.page.data, data.activePlans));
	const hasFilters = $derived(hasBasketFilters(data.filter));

	function hrefForPage(nextPage: number) {
		const params = new URLSearchParams(page.url.searchParams);
		params.set('page', String(nextPage));
		return `?${params.toString()}`;
	}

	function openBuilder(vm: BasketCardVM) {
		selected = vm;
		builderOpen = true;
	}

	function openCancel(vm: BasketCardVM) {
		selected = vm;
		cancelOpen = true;
	}

	function openDelete(vm: BasketCardVM) {
		selected = vm;
		deleteOpen = true;
	}
</script>

<div class="space-y-6">
	<div class="flex flex-wrap items-start justify-between gap-4">
		<div>
			<h1 class="text-2xl font-semibold text-[var(--color-text-primary)]">Trade-up baskets</h1>
			<p class="mt-1 text-sm text-[var(--color-text-secondary)]">
				Build 10-item baskets from inventory and mark them ready for execution.
			</p>
		</div>
		<Button onclick={() => (createOpen = true)}>New basket</Button>
	</div>

	{#if form?.error}
		<div class="rounded-md border border-[var(--color-danger)]/40 bg-[var(--color-danger)]/10 p-3 text-sm text-[var(--color-danger)]">
			{form.error}
			{#if form.issues}
				<pre class="mt-2 whitespace-pre-wrap text-xs">{JSON.stringify(form.issues, null, 2)}</pre>
			{/if}
		</div>
	{:else if form?.success}
		<div class="rounded-md border border-[var(--color-success)]/40 bg-[var(--color-success)]/10 p-3 text-sm text-[var(--color-success)]">{form.success}</div>
	{/if}

	<FilterBar resetHref="/tradeups/baskets">
		<select name="status" value={data.filter.status ?? ''} class="rounded-md border border-[var(--color-border)] bg-[var(--color-bg-surface-overlay)] px-3 py-2 text-sm">
			<option value="">Any status</option>
			{#each TRADEUP_BASKET_STATUSES as status}
				<option value={status}>{status.replaceAll('_', ' ')}</option>
			{/each}
		</select>
		<select name="planId" value={data.filter.planId ?? ''} class="rounded-md border border-[var(--color-border)] bg-[var(--color-bg-surface-overlay)] px-3 py-2 text-sm">
			<option value="">Any plan</option>
			{#each data.activePlans as plan}
				<option value={plan.id}>{plan.name}</option>
			{/each}
		</select>
	</FilterBar>

	{#if cards.length === 0}
		<Card class="flex min-h-48 flex-col items-center justify-center gap-3 text-center">
			<h2 class="text-base font-semibold text-[var(--color-text-primary)]">No baskets match these filters.</h2>
			<p class="max-w-md text-sm text-[var(--color-text-secondary)]">
				Create a basket from an active plan, then add eligible inventory.
			</p>
			{#if hasFilters}
				<a href="/tradeups/baskets">
					<Button variant="secondary" size="sm">Clear filters</Button>
				</a>
			{/if}
		</Card>
	{:else}
		<div class="grid gap-3 xl:grid-cols-2">
			{#each cards as vm (vm.basket.id)}
				<BasketCard {vm} onbuild={openBuilder} oncancel={openCancel} ondelete={openDelete} />
			{/each}
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

<Modal bind:open={createOpen} title="Create basket">
	<form method="POST" action="?/create" class="space-y-4">
		<select name="planId" required class="w-full rounded-md border border-[var(--color-border)] bg-[var(--color-bg-surface-overlay)] px-3 py-2 text-sm">
			<option value="">Choose active plan</option>
			{#each data.activePlans as plan}
				<option value={plan.id}>{plan.name}</option>
			{/each}
		</select>
		<Input name="name" label="Name" />
		<textarea name="notes" rows="3" placeholder="Notes" class="w-full rounded-md border border-[var(--color-border)] bg-[var(--color-bg-surface-overlay)] px-3 py-2 text-sm"></textarea>
		<div class="flex justify-end gap-2">
			<Button variant="secondary" onclick={() => (createOpen = false)}>Cancel</Button>
			<Button type="submit">Create</Button>
		</div>
	</form>
</Modal>

<BasketBuilderModal bind:open={builderOpen} basket={selected?.basket ?? null} plan={selected?.plan ?? null} />
<ConfirmModal
	bind:open={cancelOpen}
	title="Cancel basket"
	message={selected ? `Cancel ${selected.basket.name ?? 'this basket'}? Reserved inventory will be released.` : ''}
	action="?/cancel"
	fields={{ id: selected?.basket.id }}
	confirmLabel="Cancel basket"
/>
<ConfirmModal
	bind:open={deleteOpen}
	title="Delete basket"
	message={selected ? `Delete ${selected.basket.name ?? 'this basket'}? This cannot be undone.` : ''}
	action="?/delete"
	fields={{ id: selected?.basket.id }}
	confirmLabel="Delete"
/>
