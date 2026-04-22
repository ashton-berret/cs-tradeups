<script lang="ts">
	import Modal from '$lib/components/Modal.svelte';
	import Button from '$lib/components/Button.svelte';
	import Input from '$lib/components/Input.svelte';
	import { INVENTORY_STATUSES } from '$lib/types/enums';
	import type { InventoryRowVM } from '$lib/client/viewModels/inventory';

	type Props = {
		open?: boolean;
		item: InventoryRowVM | null;
	};

	let { open = $bindable(false), item }: Props = $props();
</script>

<Modal bind:open title="Edit inventory item">
	{#if item}
		<form method="POST" action="?/update" class="space-y-4">
			<input type="hidden" name="id" value={item.id} />
			<p class="text-sm text-[var(--color-text-secondary)]">{item.marketHashName}</p>
			<select name="status" value={item.status} class="w-full rounded-md border border-[var(--color-border)] bg-[var(--color-bg-surface-overlay)] px-3 py-2 text-sm">
				{#each INVENTORY_STATUSES as status}
					<option value={status}>{status.replaceAll('_', ' ')}</option>
				{/each}
			</select>
			<Input name="currentEstValue" type="number" step="0.01" min="0" label="Current estimated value" value={item.currentEstValue ?? ''} />
			<textarea name="notes" rows="4" class="w-full rounded-md border border-[var(--color-border)] bg-[var(--color-bg-surface-overlay)] px-3 py-2 text-sm">{item.notes ?? ''}</textarea>
			<div class="flex justify-end gap-2">
				<Button variant="secondary" onclick={() => (open = false)}>Cancel</Button>
				<Button type="submit">Save</Button>
			</div>
		</form>
	{/if}
</Modal>
