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
		<div class="rounded-md border border-[var(--color-border)] bg-[var(--color-bg-surface-overlay)] p-3 text-sm text-[var(--color-text-secondary)]">
			A plan has three parts: metadata, rules that decide whether a candidate matches, and outcomes that drive EV. For a candidate to stop being <span class="font-medium text-[var(--color-text-primary)]">INVALID</span>, it needs to match an active plan's input rarity and at least one rule if rules exist.
		</div>
		<div class="grid grid-cols-2 gap-3">
			<Input
				name="name"
				label="Name"
				help="Operator-facing label only. Use something you will recognize in the queue."
				required
			/>
			<label class="flex items-end gap-2 pb-2 text-sm text-[var(--color-text-secondary)]">
				<input type="checkbox" name="isActive" checked />
				<span>
					Active
					<span class="mt-1 block text-xs text-[var(--color-text-muted)]">
						Inactive plans are ignored by candidate evaluation.
					</span>
				</span>
			</label>
			<div>
				<label class="mb-2 block text-sm font-medium text-[var(--color-text-secondary)]" for="plan-input-rarity">Input rarity</label>
				<select id="plan-input-rarity" name="inputRarity" required class="w-full rounded-md border border-[var(--color-border)] bg-[var(--color-bg-surface-overlay)] px-3 py-2 text-sm">
					<option value="">Input rarity</option>
					{#each ITEM_RARITIES as rarity}
						<option value={rarity}>{rarity.replaceAll('_', ' ')}</option>
					{/each}
				</select>
				<p class="mt-2 text-xs text-[var(--color-text-muted)]">
					Must match the candidate rarity exactly. Your Black Lotus candidate is <span class="font-medium text-[var(--color-text-primary)]">CLASSIFIED</span>.
				</p>
			</div>
			<div>
				<label class="mb-2 block text-sm font-medium text-[var(--color-text-secondary)]" for="plan-target-rarity">Target rarity</label>
				<select id="plan-target-rarity" name="targetRarity" required aria-invalid={targetRarityError ? 'true' : undefined} class="w-full rounded-md border border-[var(--color-border)] bg-[var(--color-bg-surface-overlay)] px-3 py-2 text-sm">
					<option value="">Target rarity</option>
					{#each ITEM_RARITIES as rarity}
						<option value={rarity}>{rarity.replaceAll('_', ' ')}</option>
					{/each}
				</select>
				<p class="mt-2 text-xs text-[var(--color-text-muted)]">
					Must be exactly one tier above input rarity. This is the rarity of the possible trade-up outputs.
				</p>
				{#if targetRarityError}
					<p class="mt-2 text-sm text-[var(--color-danger)]">{targetRarityError}</p>
				{/if}
			</div>
			<Input
				name="minProfitThreshold"
				type="number"
				step="0.01"
				min="0"
				label="Min profit"
				help="Absolute dollar profit floor. If EV minus buy price is below this, the candidate becomes PASSED."
			/>
			<Input
				name="minProfitPctThreshold"
				type="number"
				step="0.01"
				label="Min profit %"
				help="Percent profit floor. Leave blank until you need it."
			/>
			<Input
				name="minLiquidityScore"
				type="number"
				step="0.01"
				min="0"
				max="1"
				label="Min liquidity"
				help="Below this, a matched candidate is WATCHING instead of GOOD_BUY."
			/>
			<Input
				name="minCompositeScore"
				type="number"
				step="0.01"
				min="0"
				max="1"
				label="Min composite"
				help="Quality times liquidity floor. Leave blank to use the app default."
			/>
		</div>
		<div>
			<label class="mb-2 block text-sm font-medium text-[var(--color-text-secondary)]" for="plan-description">Description</label>
			<textarea id="plan-description" name="description" rows="2" placeholder="Description" class="w-full rounded-md border border-[var(--color-border)] bg-[var(--color-bg-surface-overlay)] px-3 py-2 text-sm"></textarea>
			<p class="mt-2 text-xs text-[var(--color-text-muted)]">
				Optional notes about the strategy. This does not affect matching.
			</p>
		</div>

		<section class="space-y-3">
			<h3 class="text-sm font-semibold text-[var(--color-text-secondary)]">Initial rule</h3>
			<p class="text-xs text-[var(--color-text-muted)]">
				Rules are input filters. If you add any rules, a candidate must satisfy at least one of them to match the plan.
			</p>
			<div class="grid grid-cols-2 gap-3 md:grid-cols-4">
				<Input name="collection" placeholder="Collection" help="Exact collection name to allow. For your candidate: The Kilowatt Collection." />
				<div>
					<select name="rarity" class="w-full rounded-md border border-[var(--color-border)] bg-[var(--color-bg-surface-overlay)] px-3 py-2 text-sm">
						<option value="">Rule rarity</option>
						{#each ITEM_RARITIES as rarity}
							<option value={rarity}>{rarity.replaceAll('_', ' ')}</option>
						{/each}
					</select>
					<p class="mt-2 text-xs text-[var(--color-text-muted)]">
						Optional extra rarity gate. Usually leave blank because the plan input rarity already gates matching.
					</p>
				</div>
				<div>
					<select name="exterior" class="w-full rounded-md border border-[var(--color-border)] bg-[var(--color-bg-surface-overlay)] px-3 py-2 text-sm">
						<option value="">Exterior</option>
						{#each ITEM_EXTERIORS as exterior}
							<option value={exterior}>{exterior.replaceAll('_', ' ')}</option>
						{/each}
					</select>
					<p class="mt-2 text-xs text-[var(--color-text-muted)]">
						Optional exterior gate. Leave blank unless you only want one wear tier.
					</p>
				</div>
				<Input name="maxBuyPrice" type="number" step="0.01" min="0" placeholder="Max buy" help="Hard ceiling for candidate price. Above this, the rule rejects the item." />
				<Input name="minFloat" type="number" step="0.000001" min="0" max="1" placeholder="Min float" help="Start of allowed float band." error={floatError ?? undefined} />
				<Input name="maxFloat" type="number" step="0.000001" min="0" max="1" placeholder="Max float" help="End of allowed float band." />
				<Input name="minQuantity" type="number" step="1" min="1" max="10" placeholder="Min qty" help="Planning-only quantity hint for basket composition." />
				<Input name="maxQuantity" type="number" step="1" min="1" max="10" placeholder="Max qty" help="Planning-only quantity cap for basket composition." />
			</div>
		</section>

		<section class="space-y-3">
			<h3 class="text-sm font-semibold text-[var(--color-text-secondary)]">Initial outcome</h3>
			<p class="text-xs text-[var(--color-text-muted)]">
				Outcomes drive expected value. For candidate EV, the app only uses outcomes in the candidate's collection and the plan's target rarity.
			</p>
			<div class="grid grid-cols-2 gap-3 md:grid-cols-4">
				<Input name="marketHashName" placeholder="Market hash name" help="Full market name of a possible output skin." />
				<Input name="weaponName" placeholder="Weapon" help="Optional display field only." />
				<Input name="skinName" placeholder="Skin" help="Optional display field only." />
				<Input name="outcomeCollection" placeholder="Collection" help="Must match the input collection if you want candidate EV for that collection." />
				<div>
					<select name="outcomeRarity" class="w-full rounded-md border border-[var(--color-border)] bg-[var(--color-bg-surface-overlay)] px-3 py-2 text-sm">
						<option value="">Outcome rarity</option>
						{#each ITEM_RARITIES as rarity}
							<option value={rarity}>{rarity.replaceAll('_', ' ')}</option>
						{/each}
					</select>
					<p class="mt-2 text-xs text-[var(--color-text-muted)]">
						Must equal the plan target rarity.
					</p>
				</div>
				<Input name="estimatedMarketValue" type="number" step="0.01" min="0" placeholder="Value" help="Estimated sale value used in EV math." />
				<Input name="probabilityWeight" type="number" step="0.01" min="0.01" placeholder="Weight" value="1" help="Relative chance among outcomes in the same collection. Equal weights is fine to start." />
			</div>
		</section>

		<div class="flex justify-end gap-2">
			<Button variant="secondary" onclick={() => (open = false)}>Cancel</Button>
			<Button type="submit">Create plan</Button>
		</div>
	</form>
</Modal>
