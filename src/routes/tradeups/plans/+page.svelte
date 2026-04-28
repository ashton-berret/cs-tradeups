<script lang="ts">
	import { page } from '$app/state';
	import Button from '$lib/components/Button.svelte';
	import Card from '$lib/components/Card.svelte';
	import ConfirmModal from '$lib/components/ConfirmModal.svelte';
	import FilterBar from '$lib/components/FilterBar.svelte';
	import Input from '$lib/components/Input.svelte';
	import PaginationControl from '$lib/components/PaginationControl.svelte';
	import { ITEM_RARITIES } from '$lib/types/enums';
	import { hasPlanFilters, toPlanCards, type PlanCardVM } from '$lib/client/viewModels/plans';
	import PlanCard from './PlanCard.svelte';
	import PlanEditorModal from './PlanEditorModal.svelte';
	import type { ActionData, PageData } from './$types';

	let { data, form }: { data: PageData; form?: ActionData } = $props();

	let createOpen = $state(false);
	let deleteOpen = $state(false);
	let selected = $state<PlanCardVM | null>(null);

	const cards = $derived(toPlanCards(data.page.data));
	const hasFilters = $derived(hasPlanFilters(data.filter));
	const formIssues = $derived((form as { issues?: unknown[] } | undefined)?.issues ?? null);
	const issueText = $derived(JSON.stringify(formIssues ?? []));
	const ruleError = $derived(issueText.includes('minFloat must be <= maxFloat') ? 'minFloat must be <= maxFloat' : null);

	function hrefForPage(nextPage: number) {
		const params = new URLSearchParams(page.url.searchParams);
		params.set('page', String(nextPage));
		return `?${params.toString()}`;
	}

	function openDelete(vm: PlanCardVM) {
		selected = vm;
		deleteOpen = true;
	}
</script>

<div class="space-y-6">
	<div class="flex flex-wrap items-start justify-between gap-4">
		<div>
			<h1 class="text-2xl font-semibold text-[var(--color-text-primary)]">Trade-up plans</h1>
			<p class="mt-1 text-sm text-[var(--color-text-secondary)]">
				Maintain plan metadata, input rules, and expected outcome values.
			</p>
		</div>
		<Button onclick={() => (createOpen = true)}>New plan</Button>
	</div>

	{#if form?.error}
		<div class="rounded-md border border-[var(--color-danger)]/40 bg-[var(--color-danger)]/10 p-3 text-sm text-[var(--color-danger)]">{form.error}</div>
	{:else if form?.success}
		<div class="rounded-md border border-[var(--color-success)]/40 bg-[var(--color-success)]/10 p-3 text-sm text-[var(--color-success)]">{form.success}</div>
	{/if}

	<FilterBar resetHref="/tradeups/plans">
		<select name="isActive" value={data.filter.isActive == null ? '' : String(data.filter.isActive)} class="rounded-md border border-[var(--color-border)] bg-[var(--color-bg-surface-overlay)] px-3 py-2 text-sm">
			<option value="">Any status</option>
			<option value="true">Active</option>
			<option value="false">Inactive</option>
		</select>
		<select name="inputRarity" value={data.filter.inputRarity ?? ''} class="rounded-md border border-[var(--color-border)] bg-[var(--color-bg-surface-overlay)] px-3 py-2 text-sm">
			<option value="">Input rarity</option>
			{#each ITEM_RARITIES as rarity}
				<option value={rarity}>{rarity.replaceAll('_', ' ')}</option>
			{/each}
		</select>
		<select name="targetRarity" value={data.filter.targetRarity ?? ''} class="rounded-md border border-[var(--color-border)] bg-[var(--color-bg-surface-overlay)] px-3 py-2 text-sm">
			<option value="">Target rarity</option>
			{#each ITEM_RARITIES as rarity}
				<option value={rarity}>{rarity.replaceAll('_', ' ')}</option>
			{/each}
		</select>
		<Input name="search" placeholder="Search" value={data.filter.search ?? ''} class="w-56" />
	</FilterBar>

	{#if cards.length === 0}
		<Card class="flex min-h-48 flex-col items-center justify-center gap-3 text-center">
			<h2 class="text-base font-semibold text-[var(--color-text-primary)]">No plans match these filters.</h2>
			<p class="max-w-md text-sm text-[var(--color-text-secondary)]">
				Create a plan to start evaluating candidates against trade-up rules.
			</p>
			{#if hasFilters}
				<a href="/tradeups/plans">
					<Button variant="secondary" size="sm">Clear filters</Button>
				</a>
			{/if}
		</Card>
	{:else}
		<div class="space-y-3">
			{#each cards as vm (vm.plan.id)}
				<PlanCard {vm} ondelete={openDelete} {ruleError} />
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

<PlanEditorModal bind:open={createOpen} error={form?.error ?? null} issues={formIssues ?? null} />
<ConfirmModal
	bind:open={deleteOpen}
	title="Delete plan"
	message={selected ? `Delete ${selected.plan.name}? Existing baskets or executions may block this.` : ''}
	action="?/deletePlan"
	fields={{ id: selected?.plan.id }}
	confirmLabel="Delete"
/>
