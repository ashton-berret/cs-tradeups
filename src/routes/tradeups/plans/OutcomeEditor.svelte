<script lang="ts">
	import Button from '$lib/components/Button.svelte';
	import Input from '$lib/components/Input.svelte';
	import { ITEM_RARITIES } from '$lib/types/enums';
	import type { OutcomeItemDTO } from '$lib/types/services';

	type Props = {
		outcome?: OutcomeItemDTO;
		planId?: string;
		mode: 'add' | 'update';
	};

	let { outcome, planId, mode }: Props = $props();
	const action = $derived(mode === 'add' ? '?/addOutcome' : '?/updateOutcome');
</script>

<form method="POST" action={action} class="rounded-md border border-[var(--color-border)] p-3">
	{#if planId}
		<input type="hidden" name="planId" value={planId} />
	{/if}
	{#if outcome}
		<input type="hidden" name="outcomeId" value={outcome.id} />
	{/if}
	<div class="grid grid-cols-2 gap-2 md:grid-cols-4">
		<Input name="marketHashName" placeholder="Market hash name" value={outcome?.marketHashName ?? ''} required />
		<Input name="weaponName" placeholder="Weapon" value={outcome?.weaponName ?? ''} />
		<Input name="skinName" placeholder="Skin" value={outcome?.skinName ?? ''} />
		<Input name="outcomeCollection" placeholder="Collection" value={outcome?.collection ?? ''} required />
		<select name="outcomeRarity" value={outcome?.rarity ?? ''} required class="rounded-md border border-[var(--color-border)] bg-[var(--color-bg-surface-overlay)] px-3 py-2 text-sm">
			<option value="">Rarity</option>
			{#each ITEM_RARITIES as rarity}
				<option value={rarity}>{rarity.replaceAll('_', ' ')}</option>
			{/each}
		</select>
		<Input name="estimatedMarketValue" type="number" step="0.01" min="0" placeholder="Value" value={outcome?.estimatedMarketValue ?? ''} required />
		<Input name="probabilityWeight" type="number" step="0.01" min="0.01" placeholder="Weight" value={outcome?.probabilityWeight ?? 1} />
	</div>
	<div class="mt-3 flex justify-end">
		<Button type="submit" size="sm" variant="secondary">{mode === 'add' ? 'Add outcome' : 'Save outcome'}</Button>
	</div>
</form>
