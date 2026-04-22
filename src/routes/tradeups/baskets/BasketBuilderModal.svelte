<script lang="ts">
	import { apiFetch } from '$lib/client/api';
	import Button from '$lib/components/Button.svelte';
	import Modal from '$lib/components/Modal.svelte';
	import Money from '$lib/components/Money.svelte';
	import Percent from '$lib/components/Percent.svelte';
	import { eligibleInventoryForPlan } from '$lib/client/viewModels/baskets';
	import type { BasketDTO, InventoryItemDTO, PlanDTO } from '$lib/types/services';
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

	const currentBasket = $derived(freshBasket ?? basket);
	const eligibleInventory = $derived(eligibleInventoryForPlan(inventory, plan));

	$effect(() => {
		if (open && basket) {
			void loadBuilderData(basket.id);
		}
	});

	async function loadBuilderData(id: string) {
		loading = true;
		loadError = null;
		try {
			const [basketResult, inventoryResult] = await Promise.all([
				apiFetch<BasketDTO>(fetch, `/api/tradeups/baskets/${id}`),
				apiFetch<PaginatedResponse<InventoryItemDTO>>(
					fetch,
					'/api/inventory?availableForBasket=true&limit=100'
				)
			]);
			freshBasket = basketResult;
			inventory = inventoryResult.data;
		} catch (err) {
			loadError = err instanceof Error ? err.message : 'Builder data could not be loaded.';
		} finally {
			loading = false;
		}
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
					<h3 class="mb-2 text-sm font-semibold text-[var(--color-text-secondary)]">Eligible inventory</h3>
					<EligibleInventoryList basket={currentBasket} items={eligibleInventory} />
				</div>
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
