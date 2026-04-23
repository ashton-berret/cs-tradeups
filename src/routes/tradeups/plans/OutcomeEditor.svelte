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
	<p class="mb-3 text-xs text-[var(--color-text-muted)]">
		Outcome rows are EV inputs. They do not control matching; they control what value the plan assumes after a contract hits an output.
	</p>
	<div class="grid grid-cols-2 gap-2 md:grid-cols-4">
		<Input name="marketHashName" placeholder="Market hash name" value={outcome?.marketHashName ?? ''} help="Full market name of the possible output item." required />
		<Input name="weaponName" placeholder="Weapon" value={outcome?.weaponName ?? ''} help="Optional display field." />
		<Input name="skinName" placeholder="Skin" value={outcome?.skinName ?? ''} help="Optional display field." />
		<Input name="outcomeCollection" placeholder="Collection" value={outcome?.collection ?? ''} help="For candidate EV, this should match the candidate collection." required />
		<div>
			<select name="outcomeRarity" value={outcome?.rarity ?? ''} required class="w-full rounded-md border border-[var(--color-border)] bg-[var(--color-bg-surface-overlay)] px-3 py-2 text-sm">
				<option value="">Rarity</option>
				{#each ITEM_RARITIES as rarity}
					<option value={rarity}>{rarity.replaceAll('_', ' ')}</option>
				{/each}
			</select>
			<p class="mt-2 text-xs text-[var(--color-text-muted)]">Must equal the plan target rarity.</p>
		</div>
		<Input name="estimatedMarketValue" type="number" step="0.01" min="0" placeholder="Value" value={outcome?.estimatedMarketValue ?? ''} help="Estimated sale value used in EV." required />
		<Input name="probabilityWeight" type="number" step="0.01" min="0.01" placeholder="Weight" value={outcome?.probabilityWeight ?? 1} help="Relative probability inside the same collection." />
	</div>
	<div class="mt-3 flex justify-end">
		<Button type="submit" size="sm" variant="secondary">{mode === 'add' ? 'Add outcome' : 'Save outcome'}</Button>
	</div>
</form>
