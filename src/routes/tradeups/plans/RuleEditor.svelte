<script lang="ts">
	import Button from '$lib/components/Button.svelte';
	import Input from '$lib/components/Input.svelte';
	import { ITEM_EXTERIORS, ITEM_RARITIES } from '$lib/types/enums';
	import type { PlanRuleDTO } from '$lib/types/services';

	type Props = {
		rule?: PlanRuleDTO;
		planId?: string;
		mode: 'add' | 'update';
		error?: string | null;
	};

	let { rule, planId, mode, error = null }: Props = $props();
	const action = $derived(mode === 'add' ? '?/addRule' : '?/updateRule');
</script>

<form method="POST" action={action} class="rounded-md border border-[var(--color-border)] p-3">
	{#if planId}
		<input type="hidden" name="planId" value={planId} />
	{/if}
	{#if rule}
		<input type="hidden" name="ruleId" value={rule.id} />
	{/if}
	<p class="mb-3 text-xs text-[var(--color-text-muted)]">
		This rule is a hard filter. Any filled field must match for the candidate to qualify under this rule.
	</p>
	<div class="grid grid-cols-2 gap-2 md:grid-cols-4">
		<Input name="collection" placeholder="Collection" value={rule?.collection ?? ''} help="Exact collection name to allow." />
		<div>
			<select name="rarity" value={rule?.rarity ?? ''} class="w-full rounded-md border border-[var(--color-border)] bg-[var(--color-bg-surface-overlay)] px-3 py-2 text-sm">
				<option value="">Rarity</option>
				{#each ITEM_RARITIES as rarity}
					<option value={rarity}>{rarity.replaceAll('_', ' ')}</option>
				{/each}
			</select>
			<p class="mt-2 text-xs text-[var(--color-text-muted)]">Optional extra rarity gate.</p>
		</div>
		<div>
			<select name="exterior" value={rule?.exterior ?? ''} class="w-full rounded-md border border-[var(--color-border)] bg-[var(--color-bg-surface-overlay)] px-3 py-2 text-sm">
				<option value="">Exterior</option>
				{#each ITEM_EXTERIORS as exterior}
					<option value={exterior}>{exterior.replaceAll('_', ' ')}</option>
				{/each}
			</select>
			<p class="mt-2 text-xs text-[var(--color-text-muted)]">Optional wear restriction.</p>
		</div>
		<Input name="maxBuyPrice" type="number" step="0.01" min="0" placeholder="Max buy" value={rule?.maxBuyPrice ?? ''} help="Hard reject if the listing price is above this." />
		<Input name="minFloat" type="number" step="0.000001" min="0" max="1" placeholder="Min float" value={rule?.minFloat ?? ''} help="Lower bound of allowed float band." error={error ?? undefined} />
		<Input name="maxFloat" type="number" step="0.000001" min="0" max="1" placeholder="Max float" value={rule?.maxFloat ?? ''} help="Upper bound of allowed float band." />
		<Input name="minQuantity" type="number" step="1" min="1" max="10" placeholder="Min qty" value={rule?.minQuantity ?? ''} help="Basket planning hint." />
		<Input name="maxQuantity" type="number" step="1" min="1" max="10" placeholder="Max qty" value={rule?.maxQuantity ?? ''} help="Basket planning cap." />
	</div>
	<div class="mt-3 flex items-center justify-between gap-3">
		<label class="flex items-center gap-2 text-sm text-[var(--color-text-secondary)]">
			<input type="checkbox" name="isPreferred" checked={rule?.isPreferred ?? false} />
			<span>
				Preferred
				<span class="mt-1 block text-xs text-[var(--color-text-muted)]">
					Small ranking bonus when multiple rules match.
				</span>
			</span>
		</label>
		<div class="flex gap-2">
			{#if mode === 'update' && rule}
				<Button type="submit" size="sm" variant="secondary">Save rule</Button>
			{:else}
				<Button type="submit" size="sm" variant="secondary">Add rule</Button>
			{/if}
		</div>
	</div>
</form>
