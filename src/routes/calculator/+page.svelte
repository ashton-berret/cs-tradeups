<script lang="ts">
	import Badge from '$lib/components/Badge.svelte';
	import Button from '$lib/components/Button.svelte';
	import Card from '$lib/components/Card.svelte';
	import CatalogCollectionSelect from '$lib/components/CatalogCollectionSelect.svelte';
	import Input from '$lib/components/Input.svelte';
	import Money from '$lib/components/Money.svelte';
	import Percent from '$lib/components/Percent.svelte';
	import { ApiError, apiFetch } from '$lib/client/api';
	import type { PageData } from './$types';
	import type { BasketEVBreakdown } from '$lib/types/services';

	let { data }: { data: PageData } = $props();

	type Row = { collection: string; floatValue: string; price: string };

	function emptyRow(): Row {
		return { collection: '', floatValue: '', price: '' };
	}

	let planId = $state<string>('');
	$effect(() => {
		if (!planId && data.plans.length > 0) {
			planId = data.plans[0].id;
		}
	});
	let rows = $state<Row[]>(Array.from({ length: 10 }, () => emptyRow()));
	let result = $state<{
		totalCost: number;
		averageFloat: number | null;
		totalEV: number;
		expectedProfit: number;
		expectedProfitPct: number;
		ev: BasketEVBreakdown;
		warnings: string[];
	} | null>(null);
	let pending = $state(false);
	let errorMessage = $state<string | null>(null);

	const filledRowCount = $derived(rows.filter((r) => r.collection.trim() && r.price.trim()).length);
	const selectedPlan = $derived(data.plans.find((p) => p.id === planId) ?? null);

	async function calculate() {
		errorMessage = null;
		pending = true;
		try {
			const inputs = rows
				.filter((r) => r.collection.trim() && r.price.trim())
				.map((r) => {
					const float = r.floatValue.trim();
					return {
						collection: r.collection.trim(),
						floatValue: float ? Number(float) : undefined,
						price: Number(r.price),
					};
				});
			if (inputs.length === 0) {
				errorMessage = 'Fill at least one input row (collection + price required).';
				pending = false;
				return;
			}
			if (!planId) {
				errorMessage = 'Pick a plan first.';
				pending = false;
				return;
			}
			result = await apiFetch(fetch, '/api/tradeups/calculator', {
				method: 'POST',
				body: JSON.stringify({ planId, inputs }),
			});
		} catch (err) {
			if (err instanceof ApiError) {
				errorMessage = err.message;
			} else {
				errorMessage = err instanceof Error ? err.message : 'Calculation failed.';
			}
			result = null;
		} finally {
			pending = false;
		}
	}

	function clearAll() {
		rows = Array.from({ length: 10 }, () => emptyRow());
		result = null;
		errorMessage = null;
	}
</script>

<div class="space-y-6">
	<div>
		<h1 class="text-2xl font-semibold text-[var(--color-text-primary)]">Trade-up calculator</h1>
		<p class="mt-1 text-sm text-[var(--color-text-secondary)]">
			Scratchpad: punch in 10 hypothetical inputs against an active plan and see the EV/profit immediately.
			Nothing is saved — refresh to start over.
		</p>
	</div>

	<Card padding="md">
		<div class="space-y-3">
			<div>
				<label for="calc-plan" class="mb-2 block text-sm font-medium text-[var(--color-text-secondary)]">
					Plan
				</label>
				<select
					id="calc-plan"
					bind:value={planId}
					class="w-full max-w-md rounded-md border border-[var(--color-border)] bg-[var(--color-bg-surface-overlay)] px-3 py-2 text-sm"
				>
					<option value="">—</option>
					{#each data.plans as plan}
						<option value={plan.id}>
							{plan.name} ({plan.inputRarity.replaceAll('_', ' ')} →
							{plan.targetRarity.replaceAll('_', ' ')})
						</option>
					{/each}
				</select>
				{#if selectedPlan}
					<p class="mt-2 text-xs text-[var(--color-text-muted)]">
						Inputs must be {selectedPlan.inputRarity.replaceAll('_', ' ')}; outputs are
						{selectedPlan.targetRarity.replaceAll('_', ' ')}. Plan defines
						{selectedPlan.outcomeItems.length} possible outcomes.
					</p>
				{/if}
			</div>
		</div>
	</Card>

	<Card padding="md">
		<div class="mb-3 flex items-center justify-between">
			<h2 class="text-sm font-semibold text-[var(--color-text-secondary)]">Inputs</h2>
			<span class="text-xs text-[var(--color-text-muted)]">
				{filledRowCount}/10 rows filled
			</span>
		</div>
		<div class="space-y-2">
			{#each rows as row, idx}
				<div class="grid grid-cols-1 gap-2 md:grid-cols-[40px_1fr_140px_140px]">
					<div class="flex items-center text-xs text-[var(--color-text-muted)]">
						{idx + 1}
					</div>
					<CatalogCollectionSelect
						name={`row-${idx}-collection`}
						bind:value={row.collection}
						placeholder="Collection"
					/>
					<Input
						name={`row-${idx}-float`}
						type="number"
						step="0.000001"
						min="0"
						max="1"
						placeholder="Float"
						bind:value={row.floatValue}
					/>
					<Input
						name={`row-${idx}-price`}
						type="number"
						step="0.01"
						min="0"
						placeholder="Price"
						bind:value={row.price}
					/>
				</div>
			{/each}
		</div>
		<div class="mt-4 flex items-center gap-3">
			<Button onclick={calculate} disabled={pending || !planId}>
				{pending ? 'Calculating…' : 'Calculate'}
			</Button>
			<Button variant="secondary" onclick={clearAll} disabled={pending}>Clear</Button>
		</div>
		{#if errorMessage}
			<p class="mt-3 text-sm text-[var(--color-danger)]">{errorMessage}</p>
		{/if}
	</Card>

	{#if result}
		<div class="grid grid-cols-1 gap-4 md:grid-cols-4">
			<Card padding="md">
				<div class="text-xs uppercase tracking-wide text-[var(--color-text-secondary)]">
					Total cost
				</div>
				<div class="mt-1 text-2xl font-semibold"><Money value={result.totalCost} /></div>
			</Card>
			<Card padding="md">
				<div class="text-xs uppercase tracking-wide text-[var(--color-text-secondary)]">
					Expected EV
				</div>
				<div class="mt-1 text-2xl font-semibold"><Money value={result.totalEV} /></div>
			</Card>
			<Card padding="md">
				<div class="text-xs uppercase tracking-wide text-[var(--color-text-secondary)]">
					Expected profit
				</div>
				<div class="mt-1 text-2xl font-semibold">
					<Money value={result.expectedProfit} />
					<span class="ml-2 text-sm text-[var(--color-text-secondary)]">
						<Percent value={result.expectedProfitPct} />
					</span>
				</div>
			</Card>
			<Card padding="md">
				<div class="text-xs uppercase tracking-wide text-[var(--color-text-secondary)]">
					Average input float
				</div>
				<div class="mt-1 text-2xl font-semibold">
					{result.averageFloat != null ? result.averageFloat.toFixed(4) : '—'}
				</div>
			</Card>
		</div>

		<Card padding="md">
			<h2 class="mb-3 text-sm font-semibold text-[var(--color-text-secondary)]">
				Per-collection chance
			</h2>
			{#if Object.keys(result.ev.perCollectionChance).length === 0}
				<p class="text-sm text-[var(--color-text-muted)]">
					No outcomes match any input collection at the plan's target rarity.
				</p>
			{:else}
				<ul class="space-y-1 text-sm">
					{#each Object.entries(result.ev.perCollectionChance) as [collection, chance]}
						<li class="flex items-center justify-between border-b border-[var(--color-border)] py-1">
							<span>{collection}</span>
							<Badge tone="primary">{(chance * 100).toFixed(0)}%</Badge>
						</li>
					{/each}
				</ul>
			{/if}
		</Card>

		<Card padding="md">
			<h2 class="mb-3 text-sm font-semibold text-[var(--color-text-secondary)]">
				Per-outcome contribution
			</h2>
			{#if result.ev.perOutcomeContribution.length === 0}
				<p class="text-sm text-[var(--color-text-muted)]">No outcome contributions.</p>
			{:else}
				<table class="w-full text-sm">
					<thead>
						<tr class="text-left text-xs uppercase tracking-wide text-[var(--color-text-secondary)]">
							<th class="px-2 py-2">Outcome</th>
							<th class="px-2 py-2 text-right">Probability</th>
							<th class="px-2 py-2 text-right">Estimated value</th>
							<th class="px-2 py-2 text-right">Contribution</th>
							<th class="px-2 py-2">Pricing</th>
						</tr>
					</thead>
					<tbody>
						{#each result.ev.perOutcomeContribution as outcome}
							<tr class="border-t border-[var(--color-border)]">
								<td class="px-2 py-2">{outcome.marketHashName}</td>
								<td class="px-2 py-2 text-right">{(outcome.probability * 100).toFixed(2)}%</td>
								<td class="px-2 py-2 text-right"><Money value={outcome.estimatedValue} /></td>
								<td class="px-2 py-2 text-right"><Money value={outcome.contribution} /></td>
								<td class="px-2 py-2 text-xs text-[var(--color-text-secondary)]">
									{outcome.priceSource === 'OBSERVED_MARKET' ? 'Observed' : 'Plan fallback'}
								</td>
							</tr>
						{/each}
					</tbody>
				</table>
			{/if}
		</Card>

		{#if result.warnings.length > 0}
			<Card padding="md">
				<h2 class="mb-2 text-sm font-semibold text-[var(--color-text-secondary)]">Notes</h2>
				<ul class="list-disc space-y-1 pl-5 text-sm text-[var(--color-text-muted)]">
					{#each result.warnings as warning}
						<li>{warning}</li>
					{/each}
				</ul>
			</Card>
		{/if}
	{/if}
</div>
