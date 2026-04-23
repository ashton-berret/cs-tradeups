<script lang="ts">
	import Modal from '$lib/components/Modal.svelte';
	import Button from '$lib/components/Button.svelte';
	import Input from '$lib/components/Input.svelte';
	import { ITEM_EXTERIORS, ITEM_RARITIES } from '$lib/types/enums';

	type Props = {
		open?: boolean;
		error?: string | null;
		issues?: unknown[] | null;
	};

	let { open = $bindable(false), error = null, issues = null }: Props = $props();

	const targetRarityError = $derived(issueMessage('targetRarity'));
	const floatError = $derived(issueMessage('minFloat'));

	function issueMessage(field: string) {
		const serialized = JSON.stringify(issues ?? []);
		if (field === 'targetRarity' && serialized.includes('targetRarity must be exactly one tier above inputRarity')) {
			return 'targetRarity must be exactly one tier above inputRarity';
		}
		if (field === 'minFloat' && serialized.includes('minFloat must be <= maxFloat')) {
			return 'minFloat must be <= maxFloat';
		}
		return null;
	}
</script>

<Modal bind:open title="Create trade-up plan">
	<form method="POST" action="?/create" class="space-y-5">
		{#if error}
			<div class="rounded-md border border-[var(--color-danger)]/40 bg-[var(--color-danger)]/10 p-3 text-sm text-[var(--color-danger)]">{error}</div>
		{/if}
		<div class="grid grid-cols-2 gap-3">
			<Input name="name" label="Name" required />
			<label class="flex items-end gap-2 pb-2 text-sm text-[var(--color-text-secondary)]">
				<input type="checkbox" name="isActive" checked />
				Active
			</label>
			<select name="inputRarity" required class="rounded-md border border-[var(--color-border)] bg-[var(--color-bg-surface-overlay)] px-3 py-2 text-sm">
				<option value="">Input rarity</option>
				{#each ITEM_RARITIES as rarity}
					<option value={rarity}>{rarity.replaceAll('_', ' ')}</option>
				{/each}
			</select>
			<div>
				<select name="targetRarity" required aria-invalid={targetRarityError ? 'true' : undefined} class="w-full rounded-md border border-[var(--color-border)] bg-[var(--color-bg-surface-overlay)] px-3 py-2 text-sm">
					<option value="">Target rarity</option>
					{#each ITEM_RARITIES as rarity}
						<option value={rarity}>{rarity.replaceAll('_', ' ')}</option>
					{/each}
				</select>
				{#if targetRarityError}
					<p class="mt-2 text-sm text-[var(--color-danger)]">{targetRarityError}</p>
				{/if}
			</div>
			<Input name="minProfitThreshold" type="number" step="0.01" min="0" label="Min profit" />
			<Input name="minProfitPctThreshold" type="number" step="0.01" label="Min profit %" />
			<Input name="minLiquidityScore" type="number" step="0.01" min="0" max="1" label="Min liquidity" />
			<Input name="minCompositeScore" type="number" step="0.01" min="0" max="1" label="Min composite" />
		</div>
		<textarea name="description" rows="2" placeholder="Description" class="w-full rounded-md border border-[var(--color-border)] bg-[var(--color-bg-surface-overlay)] px-3 py-2 text-sm"></textarea>

		<section class="space-y-3">
			<h3 class="text-sm font-semibold text-[var(--color-text-secondary)]">Initial rule</h3>
			<div class="grid grid-cols-2 gap-3 md:grid-cols-4">
				<Input name="collection" placeholder="Collection" />
				<select name="rarity" class="rounded-md border border-[var(--color-border)] bg-[var(--color-bg-surface-overlay)] px-3 py-2 text-sm">
					<option value="">Rule rarity</option>
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
				<Input name="maxBuyPrice" type="number" step="0.01" min="0" placeholder="Max buy" />
				<Input name="minFloat" type="number" step="0.000001" min="0" max="1" placeholder="Min float" error={floatError ?? undefined} />
				<Input name="maxFloat" type="number" step="0.000001" min="0" max="1" placeholder="Max float" />
				<Input name="minQuantity" type="number" step="1" min="1" max="10" placeholder="Min qty" />
				<Input name="maxQuantity" type="number" step="1" min="1" max="10" placeholder="Max qty" />
			</div>
		</section>

		<section class="space-y-3">
			<h3 class="text-sm font-semibold text-[var(--color-text-secondary)]">Initial outcome</h3>
			<div class="grid grid-cols-2 gap-3 md:grid-cols-4">
				<Input name="marketHashName" placeholder="Market hash name" />
				<Input name="weaponName" placeholder="Weapon" />
				<Input name="skinName" placeholder="Skin" />
				<Input name="outcomeCollection" placeholder="Collection" />
				<select name="outcomeRarity" class="rounded-md border border-[var(--color-border)] bg-[var(--color-bg-surface-overlay)] px-3 py-2 text-sm">
					<option value="">Outcome rarity</option>
					{#each ITEM_RARITIES as rarity}
						<option value={rarity}>{rarity.replaceAll('_', ' ')}</option>
					{/each}
				</select>
				<Input name="estimatedMarketValue" type="number" step="0.01" min="0" placeholder="Value" />
				<Input name="probabilityWeight" type="number" step="0.01" min="0.01" placeholder="Weight" value="1" />
			</div>
		</section>

		<div class="flex justify-end gap-2">
			<Button variant="secondary" onclick={() => (open = false)}>Cancel</Button>
			<Button type="submit">Create plan</Button>
		</div>
	</form>
</Modal>
