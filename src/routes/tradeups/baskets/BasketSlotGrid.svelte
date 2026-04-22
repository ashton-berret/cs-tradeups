<script lang="ts">
	import Button from '$lib/components/Button.svelte';
	import FloatValue from '$lib/components/FloatValue.svelte';
	import Money from '$lib/components/Money.svelte';
	import type { BasketDTO } from '$lib/types/services';

	type Props = {
		basket: BasketDTO;
	};

	let { basket }: Props = $props();
	const slots = $derived(
		Array.from({ length: 10 }, (_, slotIndex) => ({
			slotIndex,
			item: basket.items.find((entry) => entry.slotIndex === slotIndex)
		}))
	);
</script>

<div class="grid grid-cols-2 gap-2 md:grid-cols-5">
	{#each slots as slot}
		<div class="min-h-32 rounded-md border border-[var(--color-border)] bg-[var(--color-bg-surface)] p-3">
			<div class="text-xs font-medium text-[var(--color-text-muted)]">Slot {slot.slotIndex + 1}</div>
			{#if slot.item}
				<div class="mt-2 text-sm font-medium">{slot.item.inventoryItem.marketHashName}</div>
				<div class="mt-1 text-xs text-[var(--color-text-secondary)]">
					<FloatValue value={slot.item.inventoryItem.floatValue} /> ·
					<Money value={slot.item.inventoryItem.purchasePrice} />
				</div>
				<form method="POST" action="?/removeItem" class="mt-3">
					<input type="hidden" name="id" value={basket.id} />
					<input type="hidden" name="inventoryItemId" value={slot.item.inventoryItemId} />
					<Button type="submit" size="sm" variant="ghost">Remove</Button>
				</form>
			{:else}
				<div class="mt-8 text-center text-xs text-[var(--color-text-muted)]">Empty</div>
			{/if}
		</div>
	{/each}
</div>
