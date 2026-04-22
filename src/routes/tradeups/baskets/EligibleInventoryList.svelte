<script lang="ts">
	import Button from '$lib/components/Button.svelte';
	import FloatValue from '$lib/components/FloatValue.svelte';
	import Money from '$lib/components/Money.svelte';
	import type { BasketDTO, InventoryItemDTO } from '$lib/types/services';
	import { nextEmptySlot } from '$lib/client/viewModels/baskets';

	type Props = {
		basket: BasketDTO;
		items: InventoryItemDTO[];
	};

	let { basket, items }: Props = $props();
	const slot = $derived(nextEmptySlot(basket));
</script>

<div class="space-y-2">
	{#if items.length === 0}
		<p class="rounded-md border border-[var(--color-border)] p-4 text-sm text-[var(--color-text-secondary)]">
			No available inventory matches this plan.
		</p>
	{:else}
		{#each items as item}
			<form method="POST" action="?/addItem" class="rounded-md border border-[var(--color-border)] p-3">
				<input type="hidden" name="id" value={basket.id} />
				<input type="hidden" name="inventoryItemId" value={item.id} />
				<input type="hidden" name="slotIndex" value={slot ?? 0} />
				<div class="flex items-start justify-between gap-3">
					<div>
						<div class="text-sm font-medium">{item.marketHashName}</div>
						<div class="mt-1 text-xs text-[var(--color-text-secondary)]">
							<FloatValue value={item.floatValue} /> · <Money value={item.purchasePrice} currency={item.purchaseCurrency} />
						</div>
					</div>
					<Button type="submit" size="sm" variant="secondary" disabled={slot == null}>Add</Button>
				</div>
			</form>
		{/each}
	{/if}
</div>
