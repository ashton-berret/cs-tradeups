<script lang="ts">
	import Modal from '$lib/components/Modal.svelte';
	import Button from '$lib/components/Button.svelte';
	import Input from '$lib/components/Input.svelte';
	import { ITEM_EXTERIORS, ITEM_RARITIES } from '$lib/types/enums';

	type Props = {
		open?: boolean;
	};

	let { open = $bindable(false) }: Props = $props();
	const today = new Date().toISOString().slice(0, 10);
</script>

<Modal bind:open title="Manual inventory item">
	<form method="POST" action="?/create" class="space-y-4">
		<Input name="marketHashName" label="Market hash name" required />
		<div class="grid grid-cols-2 gap-3">
			<Input name="weaponName" label="Weapon" />
			<Input name="skinName" label="Skin" />
			<Input name="collection" label="Collection" />
			<Input name="purchasePrice" type="number" step="0.01" min="0" label="Purchase price" required />
			<Input name="purchaseFees" type="number" step="0.01" min="0" label="Fees" />
			<Input name="purchaseDate" type="date" label="Purchase date" value={today} />
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
		<Input name="inspectLink" type="url" label="Inspect link" />
		<textarea name="notes" rows="3" placeholder="Notes" class="w-full rounded-md border border-[var(--color-border)] bg-[var(--color-bg-surface-overlay)] px-3 py-2 text-sm"></textarea>
		<div class="flex justify-end gap-2">
			<Button variant="secondary" onclick={() => (open = false)}>Cancel</Button>
			<Button type="submit">Create</Button>
		</div>
	</form>
</Modal>
