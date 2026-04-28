<script lang="ts">
	import { apiFetch } from '$lib/client/api';
	import Badge from '$lib/components/Badge.svelte';
	import Button from '$lib/components/Button.svelte';
	import Modal from '$lib/components/Modal.svelte';
	import Money from '$lib/components/Money.svelte';
	import Percent from '$lib/components/Percent.svelte';
	import { emptySlots } from '$lib/client/viewModels/baskets';
	import type { BasketDTO, BasketEvaluation, InventoryItemDTO, PlanDTO } from '$lib/types/services';
	import type { PaginatedResponse } from '$lib/types/domain';
	import BasketSlotGrid from './BasketSlotGrid.svelte';
	import EligibleInventoryList from './EligibleInventoryList.svelte';

	type Props = {
		open?: boolean;
		basket: BasketDTO | null;
		plan: PlanDTO | null;
	};

	let { open = $bindable(false), basket, plan }: Props = $props();
	let freshBasket = $state<BasketDTO | null>(null);
	let inventory = $state<InventoryItemDTO[]>([]);
	let loading = $state(false);
	let loadError = $state<string | null>(null);
	let evaluation = $state<BasketEvaluation | null>(null);
	let selectedInventoryIds = $state(new Set<string>());

	const currentBasket = $derived(freshBasket ?? basket);
	const eligibleInventory = $derived(inventory);
	const selectedInventory = $derived(
		eligibleInventory.filter((item) => selectedInventoryIds.has(item.id))
	);
	const availableSlots = $derived(currentBasket ? emptySlots(currentBasket) : []);
	const bulkItems = $derived(
		selectedInventory.slice(0, availableSlots.length).map((item, index) => ({
			inventoryItemId: item.id,
			slotIndex: availableSlots[index]
		}))
	);
	const selectedOverflow = $derived(Math.max(0, selectedInventory.length - availableSlots.length));

	$effect(() => {
		if (open && basket) {
			void loadBuilderData();
		}
	});

	async function loadBuilderData() {
		if (!basket) return;
		loading = true;
		loadError = null;
		try {
			const inventoryResult = await apiFetch<PaginatedResponse<InventoryItemDTO>>(
				fetch,
				`/api/inventory/eligible?planId=${encodeURIComponent(basket.planId)}&limit=100`
			);
			const evaluationResult = await apiFetch<{ kind: 'basket'; result: BasketEvaluation }>(
				fetch,
				'/api/tradeups/evaluate',
				{
					method: 'POST',
					body: JSON.stringify({ kind: 'basket', id: basket.id })
				}
			);
			freshBasket = basket;
			inventory = inventoryResult.data;
			evaluation = evaluationResult.result;
			selectedInventoryIds = new Set();
		} catch (err) {
			loadError = err instanceof Error ? err.message : 'Builder data could not be loaded.';
		} finally {
			loading = false;
		}
	}

	function toggleInventory(id: string, checked: boolean) {
		const next = new Set(selectedInventoryIds);
		if (checked) next.add(id);
		else next.delete(id);
		selectedInventoryIds = next;
	}

	function clearInventorySelection() {
		selectedInventoryIds = new Set();
	}

	function formatExterior(value: string | null) {
		return value ? value.replaceAll('_', ' ') : 'Unprojected';
	}

	function priceSourceLabel(value: BasketEvaluation['ev']['perOutcomeContribution'][number]['priceSource']) {
		return value === 'OBSERVED_MARKET' ? 'Observed market' : 'Plan fallback';
	}

	function priceBasisLabel(value: BasketEvaluation['ev']['perOutcomeContribution'][number]['priceBasis']) {
		if (value === 'STEAM_NET') return 'Steam net';
		if (value === 'STEAM_GROSS') return 'Steam gross';
		if (value === 'THIRD_PARTY_REFERENCE') return 'Third-party ref';
		return 'Manual estimate';
	}

	function freshnessLabel(value: string | null) {
		if (!value) return 'Fallback';
		return value.toLowerCase().replace(/^\w/, (letter) => letter.toUpperCase());
	}

	function freshnessTone(value: string | null): 'success' | 'primary' | 'warning' | 'muted' {
		if (value === 'FRESH') return 'success';
		if (value === 'RECENT') return 'primary';
		if (value === 'STALE') return 'warning';
		return 'muted';
	}

	function relativeAge(value: Date | string | null) {
		if (!value) return null;
		const ageMs = Math.max(0, Date.now() - new Date(value).getTime());
		const minutes = Math.floor(ageMs / 60000);
		if (minutes < 1) return 'just now';
		if (minutes < 60) return `${minutes} min${minutes === 1 ? '' : 's'} ago`;
		const hours = Math.floor(minutes / 60);
		if (hours < 48) return `${hours} hr${hours === 1 ? '' : 's'} ago`;
		const days = Math.floor(hours / 24);
		return `${days} day${days === 1 ? '' : 's'} ago`;
	}
</script>

<Modal bind:open title="Basket builder">
	{#if currentBasket}
		<div class="space-y-4">
			<div class="flex flex-wrap items-center justify-between gap-3 text-sm text-[var(--color-text-secondary)]">
				<div>{plan?.name ?? 'Unknown plan'}</div>
				<div>
					Cost <Money value={currentBasket.totalCost} /> · EV <Money value={currentBasket.expectedEV} /> ·
					<Percent value={currentBasket.expectedProfitPct} />
				</div>
			</div>
			{#if loading}
				<p class="text-sm text-[var(--color-text-secondary)]">Loading builder data...</p>
			{:else if loadError}
				<p class="text-sm text-[var(--color-danger)]">{loadError}</p>
			{/if}
			<div class="grid gap-4 xl:grid-cols-[1fr_22rem]">
				<BasketSlotGrid basket={currentBasket} />
				<div class="max-h-[36rem] overflow-y-auto">
					<div class="mb-2 flex flex-wrap items-center justify-between gap-2">
						<h3 class="text-sm font-semibold text-[var(--color-text-secondary)]">Eligible inventory</h3>
						{#if selectedInventory.length > 0}
							<button type="button" class="text-xs underline text-[var(--color-text-secondary)]" onclick={clearInventorySelection}>clear</button>
						{/if}
					</div>
					{#if selectedInventory.length > 0}
						<form method="POST" action="?/bulkAddItems" class="mb-3 rounded-md border border-[var(--color-border)] bg-[var(--color-bg-surface)] p-3">
							<input type="hidden" name="id" value={currentBasket.id} />
							{#each bulkItems as item}
								<input type="hidden" name="inventoryItemId" value={item.inventoryItemId} />
								<input type="hidden" name="slotIndex" value={item.slotIndex} />
							{/each}
							<div class="flex items-center justify-between gap-3">
								<div class="text-xs text-[var(--color-text-secondary)]">
									{selectedInventory.length} selected · {availableSlots.length} open slots
									{#if selectedOverflow > 0}
										<span class="text-[var(--color-warning)]"> · {selectedOverflow} will not fit</span>
									{/if}
								</div>
								<Button type="submit" size="sm" variant="secondary" disabled={bulkItems.length === 0}>Add {bulkItems.length}</Button>
							</div>
						</form>
					{/if}
					<EligibleInventoryList
						basket={currentBasket}
						items={eligibleInventory}
						selectedIds={selectedInventoryIds}
						onselect={toggleInventory}
					/>
				</div>
			</div>
			<div class="rounded-md border border-[var(--color-border)] bg-[var(--color-bg-surface)]/40">
				<div class="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--color-border)] px-3 py-2">
					<h3 class="text-sm font-semibold text-[var(--color-text-secondary)]">EV outcome pricing</h3>
					<div class="text-xs text-[var(--color-text-muted)]">
						{evaluation?.ev.perOutcomeContribution.length ?? 0} priced outcomes
					</div>
				</div>
				{#if evaluation && evaluation.ev.perOutcomeContribution.length > 0}
					<div class="max-h-72 overflow-y-auto">
						<table class="w-full min-w-max text-left text-xs">
							<thead class="text-[10px] font-semibold uppercase tracking-wider text-[var(--color-text-muted)]">
								<tr>
									<th class="px-3 py-2">Outcome</th>
									<th class="px-3 py-2">Projected</th>
									<th class="px-3 py-2">Price</th>
									<th class="px-3 py-2">Source</th>
									<th class="px-3 py-2">Contribution</th>
								</tr>
							</thead>
							<tbody class="divide-y divide-[var(--color-border)]/60">
								{#each evaluation.ev.perOutcomeContribution as outcome}
									<tr>
										<td class="px-3 py-2">
											<div class="font-medium text-[var(--color-text-primary)]">{outcome.marketHashName}</div>
											<div class="text-[var(--color-text-muted)]">{outcome.priceMarketHashName}</div>
										</td>
										<td class="px-3 py-2 text-[var(--color-text-secondary)]">
											<div>{formatExterior(outcome.projectedExterior)}</div>
											<div>{outcome.projectedFloat == null ? '—' : outcome.projectedFloat.toFixed(6)}</div>
										</td>
										<td class="px-3 py-2 font-medium">
											<Money value={outcome.estimatedValue} />
										</td>
										<td class="px-3 py-2">
											<Badge tone={outcome.priceSource === 'OBSERVED_MARKET' ? 'success' : 'muted'}>
												{outcome.priceSource === 'OBSERVED_MARKET' ? priceBasisLabel(outcome.priceBasis) : priceSourceLabel(outcome.priceSource)}
											</Badge>
											<div class="mt-1 text-[var(--color-text-muted)]">
												<Badge tone={freshnessTone(outcome.priceFreshness)}>
													{freshnessLabel(outcome.priceFreshness)}
												</Badge>
											</div>
											{#if relativeAge(outcome.priceObservedAt)}
												<div class="mt-1 text-[var(--color-text-muted)]">
													({relativeAge(outcome.priceObservedAt)})
												</div>
											{/if}
										</td>
										<td class="px-3 py-2 text-[var(--color-text-secondary)]">
											<div><Money value={outcome.contribution} /></div>
											<div>{(outcome.probability * 100).toFixed(2)}%</div>
										</td>
									</tr>
								{/each}
							</tbody>
						</table>
					</div>
				{:else if loading}
					<div class="px-3 py-4 text-sm text-[var(--color-text-secondary)]">Loading EV pricing...</div>
				{:else}
					<div class="px-3 py-4 text-sm text-[var(--color-text-secondary)]">
						No EV outcome pricing is available for this basket yet.
					</div>
				{/if}
			</div>
			<form method="POST" action="?/updateMeta" class="space-y-2">
				<input type="hidden" name="id" value={currentBasket.id} />
				<input name="name" value={currentBasket.name ?? ''} placeholder="Basket name" class="w-full rounded-md border border-[var(--color-border)] bg-[var(--color-bg-surface-overlay)] px-3 py-2 text-sm" />
				<textarea name="notes" rows="2" class="w-full rounded-md border border-[var(--color-border)] bg-[var(--color-bg-surface-overlay)] px-3 py-2 text-sm">{currentBasket.notes ?? ''}</textarea>
				<div class="flex justify-end gap-2">
					<Button variant="secondary" onclick={() => (open = false)}>Close</Button>
					<Button type="submit" variant="secondary">Save basket</Button>
				</div>
			</form>
		</div>
	{/if}
</Modal>
