<script lang="ts">
	import Modal from '$lib/components/Modal.svelte';
	import Button from '$lib/components/Button.svelte';
	import Input from '$lib/components/Input.svelte';
	import CatalogCollectionSelect from '$lib/components/CatalogCollectionSelect.svelte';
	import { ITEM_EXTERIORS, ITEM_RARITIES, getNextRarity, type ItemRarity } from '$lib/types/enums';

	type Props = {
		open?: boolean;
		error?: string | null;
		issues?: unknown[] | null;
	};

	let { open = $bindable(false), error = null, issues = null }: Props = $props();

	let inputRarity = $state<ItemRarity | ''>('');
	let maxFloat = $state('');
	let maxBuyPrice = $state('');

	const targetRarity = $derived(inputRarity ? getNextRarity(inputRarity) : null);
	const maxFloatNumber = $derived(maxFloat === '' ? null : Number(maxFloat));
	const maxBuyPriceNumber = $derived(maxBuyPrice === '' ? null : Number(maxBuyPrice));
	const basketMaxPrice = $derived(maxBuyPriceNumber != null ? maxBuyPriceNumber * 10 : null);
	const issueText = $derived(JSON.stringify(issues ?? []));
</script>

<Modal bind:open title="Create trade-up plan" size="lg">
	<form method="POST" action="?/create" class="space-y-5">
		<input type="hidden" name="simplePlan" value="true" />

		{#if error}
			<div class="rounded-md border border-[var(--color-danger)]/40 bg-[var(--color-danger)]/10 p-3 text-sm text-[var(--color-danger)]">
				{error}
			</div>
		{:else if issueText !== '[]'}
			<div class="rounded-md border border-[var(--color-danger)]/40 bg-[var(--color-danger)]/10 p-3 text-sm text-[var(--color-danger)]">
				The plan could not be created. Check the required fields.
			</div>
		{/if}

		<div class="grid gap-4 md:grid-cols-2">
			<Input
				name="name"
				label="Plan name"
				placeholder="Optional; generated if blank"
				help="Leave blank to use collection, rarity, and max float."
			/>

			<CatalogCollectionSelect
				name="collection"
				placeholder="Input collection"
				help="Pick the input collection from the catalog. This also determines the output pool."
			/>

			<div>
				<label class="mb-2 block text-sm font-medium text-[var(--color-text-secondary)]" for="plan-input-rarity">
					Input rarity
				</label>
				<select
					id="plan-input-rarity"
					name="inputRarity"
					bind:value={inputRarity}
					required
					class="w-full rounded-md border border-[var(--color-border)] bg-[var(--color-bg-surface-overlay)] px-3 py-2 text-sm"
				>
					<option value="">Input rarity</option>
					{#each ITEM_RARITIES.slice(0, -1) as rarity}
						<option value={rarity}>{rarity.replaceAll('_', ' ')}</option>
					{/each}
				</select>
			</div>

			<div>
				<label class="mb-2 block text-sm font-medium text-[var(--color-text-secondary)]" for="plan-exterior">
					Exterior condition
				</label>
				<select
					id="plan-exterior"
					name="exterior"
					class="w-full rounded-md border border-[var(--color-border)] bg-[var(--color-bg-surface-overlay)] px-3 py-2 text-sm"
				>
					<option value="">Any exterior</option>
					{#each ITEM_EXTERIORS as exterior}
						<option value={exterior}>{exterior.replaceAll('_', ' ')}</option>
					{/each}
				</select>
			</div>

			<Input
				name="maxFloat"
				type="number"
				step="0.000001"
				min="0"
				max="1"
				label="Maximum input float"
				placeholder="0.07"
				bind:value={maxFloat}
				required
			/>

			<Input
				name="maxBuyPrice"
				type="number"
				step="0.01"
				min="0"
				label="Maximum input price"
				placeholder="1.25"
				bind:value={maxBuyPrice}
				required
			/>
		</div>

		<div class="rounded-md border border-[var(--color-border)] bg-[var(--color-bg-surface-overlay)] p-3 text-sm">
			<div class="grid gap-2 md:grid-cols-3">
				<div>
					<div class="text-xs uppercase tracking-wide text-[var(--color-text-secondary)]">Output rarity</div>
					<div class="mt-1 font-medium text-[var(--color-text-primary)]">
						{targetRarity ? targetRarity.replaceAll('_', ' ') : 'Select input rarity'}
					</div>
				</div>
				<div>
					<div class="text-xs uppercase tracking-wide text-[var(--color-text-secondary)]">Basket max float</div>
					<div class="mt-1 font-medium text-[var(--color-text-primary)]">
						{maxFloatNumber != null ? maxFloatNumber : 'Enter max float'}
					</div>
				</div>
				<div>
					<div class="text-xs uppercase tracking-wide text-[var(--color-text-secondary)]">Basket max price</div>
					<div class="mt-1 font-medium text-[var(--color-text-primary)]">
						{basketMaxPrice != null ? `$${basketMaxPrice.toFixed(2)}` : 'Enter max price'}
					</div>
				</div>
			</div>
			<p class="mt-3 text-xs text-[var(--color-text-muted)]">
				Creates one preferred rule for 10 matching inputs and auto-generates catalog-linked output rows from the selected collection's next rarity.
			</p>
		</div>

		<div class="flex justify-end gap-2">
			<Button type="button" variant="secondary" onclick={() => (open = false)}>Cancel</Button>
			<Button type="submit" disabled={!targetRarity}>Create plan</Button>
		</div>
	</form>
</Modal>
