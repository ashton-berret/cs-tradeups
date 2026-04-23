<script lang="ts">
	import Button from '$lib/components/Button.svelte';
	import FloatValue from '$lib/components/FloatValue.svelte';
	import Money from '$lib/components/Money.svelte';
	import StatusBadge from '$lib/components/StatusBadge.svelte';
	import type { InventoryRowVM } from '$lib/client/viewModels/inventory';

	type Props = {
		row: InventoryRowVM;
		checked?: boolean;
		onselect?: (id: string, checked: boolean) => void;
		onedit: (row: InventoryRowVM) => void;
		ondelete: (row: InventoryRowVM) => void;
	};

	let { row, checked = false, onselect, onedit, ondelete }: Props = $props();
</script>

<td class="px-4 py-3 align-top">
	<input
		type="checkbox"
		checked={checked}
		aria-label="Select {row.marketHashName}"
		onchange={(event) => onselect?.(row.id, (event.target as HTMLInputElement).checked)}
	/>
</td>
<td class="px-4 py-3">
	<div class="font-medium text-[var(--color-text-primary)]">{row.marketHashName}</div>
	<div class="mt-1 text-xs text-[var(--color-text-muted)]">
		{row.rarityLabel} · {row.exteriorLabel} · held {row.ageDays}d
	</div>
</td>
<td class="px-4 py-3"><StatusBadge status={row.status} /></td>
<td class="px-4 py-3"><Money value={row.purchasePrice} currency={row.purchaseCurrency} /></td>
<td class="px-4 py-3"><Money value={row.currentEstValue} /></td>
<td class="px-4 py-3">
	<span class={row.unrealizedDelta == null ? '' : row.unrealizedDelta >= 0 ? 'text-[var(--color-success)]' : 'text-[var(--color-danger)]'}>
		<Money value={row.unrealizedDelta} />
	</span>
</td>
<td class="px-4 py-3"><FloatValue value={row.floatValue} /></td>
<td class="px-4 py-3">
	<div class="flex flex-wrap gap-2">
		<Button size="sm" variant="secondary" onclick={() => onedit(row)}>Edit</Button>
		<Button size="sm" variant="danger" onclick={() => ondelete(row)}>Delete</Button>
	</div>
</td>
