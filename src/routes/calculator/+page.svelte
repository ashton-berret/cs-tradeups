<script lang="ts">
	import Badge from '$lib/components/Badge.svelte';
	import Button from '$lib/components/Button.svelte';
	import Card from '$lib/components/Card.svelte';
	import CatalogSkinSelect from '$lib/components/CatalogSkinSelect.svelte';
	import { loadSkins } from '$lib/components/CatalogSkinSelect.svelte';
	import Input from '$lib/components/Input.svelte';
	import Money from '$lib/components/Money.svelte';
	import Percent from '$lib/components/Percent.svelte';
	import { ApiError, apiFetch } from '$lib/client/api';
	import { ITEM_RARITIES, RARITY_LABELS, type ItemRarity } from '$lib/types/enums';
	import type { PageData } from './$types';
	import type { BasketEVBreakdown } from '$lib/types/services';

	let { data }: { data: PageData } = $props();

	type Mode = 'PLAN' | 'AD_HOC';

	type Row = {
		skinDisplay: string;
		skinId: string;
		collection: string;
		catalogCollectionId: string;
		floatValue: string;
		price: string;
	};

	function emptyRow(): Row {
		return {
			skinDisplay: '',
			skinId: '',
			collection: '',
			catalogCollectionId: '',
			floatValue: '',
			price: '',
		};
	}

	let mode = $state<Mode>('AD_HOC');
	let planId = $state<string>('');
	let targetRarity = $state<ItemRarity>('RESTRICTED');
	let inputRarity = $state<ItemRarity | ''>('');
	let rows = $state<Row[]>(Array.from({ length: 10 }, () => emptyRow()));
	let result = $state<{
		totalCost: number;
		averageFloat: number | null;
		totalEV: number;
		expectedProfit: number;
		expectedProfitPct: number;
		ev: BasketEVBreakdown;
		mode: 'PLAN' | 'AD_HOC';
		warnings: string[];
	} | null>(null);
	let pending = $state(false);
	let errorMessage = $state<string | null>(null);

	// Save-as-combination state.
	let saveName = $state('');
	let saveNotes = $state('');
	let saveActive = $state(false);
	let saving = $state(false);
	let saveError = $state<string | null>(null);
	let savedId = $state<string | null>(null);

	const filledRowCount = $derived(
		rows.filter((r) => (r.collection.trim() || r.skinDisplay.trim()) && r.price.trim()).length,
	);
	const selectedPlan = $derived(data.plans.find((p) => p.id === planId) ?? null);

	// When the user selects a skin from the dropdown, auto-fill the row's
	// collection from the catalog so EV grouping uses the canonical name and
	// stable id. Free-text skin entries leave the collection alone.
	$effect(() => {
		for (const row of rows) {
			if (!row.skinId) continue;
			loadSkins()
				.then((skins) => {
					const skin = skins.find((s) => s.id === row.skinId);
					if (skin && row.catalogCollectionId !== skin.collectionId) {
						row.collection = skin.collectionName;
						row.catalogCollectionId = skin.collectionId;
					}
				})
				.catch(() => {
					// Skin lookup failed silently — UI still shows free-text warning.
				});
		}
	});

	async function calculate() {
		errorMessage = null;
		pending = true;
		try {
			const inputs = rows
				.filter((r) => (r.collection.trim() || r.skinDisplay.trim()) && r.price.trim())
				.map((r) => {
					const float = r.floatValue.trim();
					return {
						collection: r.collection.trim() || r.skinDisplay.trim(),
						catalogSkinId: r.skinId || undefined,
						catalogCollectionId: r.catalogCollectionId || undefined,
						floatValue: float ? Number(float) : undefined,
						price: Number(r.price),
					};
				});
			if (inputs.length === 0) {
				errorMessage = 'Fill at least one input row (collection/skin + price required).';
				pending = false;
				return;
			}
			const body: Record<string, unknown> = { inputs };
			if (mode === 'PLAN') {
				if (!planId) {
					errorMessage = 'Pick a plan first.';
					pending = false;
					return;
				}
				body.planId = planId;
			} else {
				body.targetRarity = targetRarity;
				if (inputRarity) body.inputRarity = inputRarity;
			}
			result = await apiFetch(fetch, '/api/tradeups/calculator', {
				method: 'POST',
				body: JSON.stringify(body),
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
		saveName = '';
		saveNotes = '';
		saveActive = false;
		savedId = null;
		saveError = null;
	}

	function buildInputsForSave() {
		return rows
			.filter((r) => (r.collection.trim() || r.skinDisplay.trim()) && r.price.trim())
			.map((r) => {
				const float = r.floatValue.trim();
				return {
					collection: r.collection.trim() || r.skinDisplay.trim(),
					catalogSkinId: r.skinId || undefined,
					catalogCollectionId: r.catalogCollectionId || undefined,
					floatValue: float ? Number(float) : undefined,
					price: Number(r.price),
				};
			});
	}

	async function saveCombination() {
		saveError = null;
		savedId = null;
		if (!saveName.trim()) {
			saveError = 'Name is required.';
			return;
		}
		saving = true;
		try {
			const body: Record<string, unknown> = {
				name: saveName.trim(),
				notes: saveNotes.trim() || undefined,
				isActive: saveActive,
				inputs: buildInputsForSave(),
			};
			if (mode === 'PLAN') {
				body.sourcePlanId = planId;
			} else {
				body.targetRarity = targetRarity;
				if (inputRarity) body.inputRarity = inputRarity;
			}
			const created = await apiFetch<{ id: string }>(fetch, '/api/tradeups/combinations', {
				method: 'POST',
				body: JSON.stringify(body),
			});
			savedId = created.id;
		} catch (err) {
			saveError = err instanceof ApiError ? err.message : err instanceof Error ? err.message : 'Save failed.';
		} finally {
			saving = false;
		}
	}
</script>

<div class="space-y-6">
	<div>
		<h1 class="text-2xl font-semibold text-[var(--color-text-primary)]">Trade-up calculator</h1>
		<p class="mt-1 text-sm text-[var(--color-text-secondary)]">
			Sandbox: pick 10 hypothetical inputs and see EV, projected exteriors, and profit. Ad-hoc mode
			derives outcomes from the catalog so you don't need a saved plan to experiment.
		</p>
	</div>

	<Card padding="md">
		<div class="space-y-4">
			<div role="tablist" class="inline-flex rounded-md border border-[var(--color-border)] p-0.5">
				<button
					type="button"
					role="tab"
					aria-selected={mode === 'AD_HOC'}
					onclick={() => (mode = 'AD_HOC')}
					class={[
						'rounded px-3 py-1.5 text-sm transition-colors',
						mode === 'AD_HOC'
							? 'bg-[var(--color-primary)] text-white'
							: 'text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]',
					].join(' ')}
				>
					Ad-hoc
				</button>
				<button
					type="button"
					role="tab"
					aria-selected={mode === 'PLAN'}
					onclick={() => (mode = 'PLAN')}
					class={[
						'rounded px-3 py-1.5 text-sm transition-colors',
						mode === 'PLAN'
							? 'bg-[var(--color-primary)] text-white'
							: 'text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]',
					].join(' ')}
				>
					Use plan
				</button>
			</div>

			{#if mode === 'AD_HOC'}
				<div class="grid grid-cols-1 gap-3 md:grid-cols-3">
					<div>
						<label
							for="calc-target-rarity"
							class="mb-2 block text-sm font-medium text-[var(--color-text-secondary)]"
						>
							Target rarity (output)
						</label>
						<select
							id="calc-target-rarity"
							bind:value={targetRarity}
							class="w-full rounded-md border border-[var(--color-border)] bg-[var(--color-bg-surface-overlay)] px-3 py-2 text-sm"
						>
							{#each ITEM_RARITIES as rarity}
								<option value={rarity}>{RARITY_LABELS[rarity]}</option>
							{/each}
						</select>
					</div>
					<div>
						<label
							for="calc-input-rarity"
							class="mb-2 block text-sm font-medium text-[var(--color-text-secondary)]"
						>
							Input rarity (auto = one tier below)
						</label>
						<select
							id="calc-input-rarity"
							bind:value={inputRarity}
							class="w-full rounded-md border border-[var(--color-border)] bg-[var(--color-bg-surface-overlay)] px-3 py-2 text-sm"
						>
							<option value="">Auto</option>
							{#each ITEM_RARITIES as rarity}
								<option value={rarity}>{RARITY_LABELS[rarity]}</option>
							{/each}
						</select>
					</div>
				</div>
				<p class="text-xs text-[var(--color-text-muted)]">
					Outcomes are derived from the catalog: every skin at the target rarity in the same
					collection as one of your inputs. Pricing comes from your latest market observations;
					outcomes without an observation contribute $0 with a warning.
				</p>
			{:else}
				<div>
					<label
						for="calc-plan"
						class="mb-2 block text-sm font-medium text-[var(--color-text-secondary)]"
					>
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
								{plan.targetRarity.replaceAll('_', ' ')}){plan.isActive ? '' : ' [inactive]'}
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
			{/if}
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
				<div class="grid grid-cols-1 gap-2 md:grid-cols-[28px_2fr_1fr_120px_120px]">
					<div class="flex items-center text-xs text-[var(--color-text-muted)]">
						{idx + 1}
					</div>
					<CatalogSkinSelect
						name={`row-${idx}-skin`}
						bind:value={row.skinDisplay}
						bind:skinId={row.skinId}
						placeholder="Weapon | skin"
					/>
					<Input
						name={`row-${idx}-collection`}
						placeholder={row.skinId ? 'Auto from skin' : 'Collection'}
						bind:value={row.collection}
						readonly={Boolean(row.skinId)}
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
			<Button onclick={calculate} disabled={pending}>
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
			<Card padding="md" accent>
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
					No outcomes match any input collection at the target rarity.
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
							<th class="px-2 py-2">Projected exterior</th>
							<th class="px-2 py-2 text-right">Probability</th>
							<th class="px-2 py-2 text-right">Estimated value</th>
							<th class="px-2 py-2 text-right">Contribution</th>
							<th class="px-2 py-2">Pricing</th>
						</tr>
					</thead>
					<tbody>
						{#each result.ev.perOutcomeContribution as outcome}
							<tr class="border-t border-[var(--color-border)]">
								<td class="px-2 py-2">
									{outcome.projectedMarketHashName ?? outcome.marketHashName}
								</td>
								<td class="px-2 py-2 text-xs text-[var(--color-text-secondary)]">
									{outcome.projectedExterior?.replaceAll('_', ' ') ?? '—'}
									{#if outcome.projectedFloat != null}
										<span class="ml-1 text-[var(--color-text-muted)]">
											({outcome.projectedFloat.toFixed(4)})
										</span>
									{/if}
								</td>
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

		<Card padding="md">
			<h2 class="mb-3 text-sm font-semibold text-[var(--color-text-secondary)]">
				Save as combination
			</h2>
			{#if savedId}
				<p class="text-sm text-[var(--color-success)]">
					Saved. <a class="underline" href={`/tradeups/saved/${savedId}`}>View</a>
				</p>
			{:else}
				<div class="grid grid-cols-1 gap-3 md:grid-cols-[2fr_3fr_auto]">
					<Input name="combo-name" placeholder="Combination name" bind:value={saveName} />
					<Input name="combo-notes" placeholder="Notes (optional)" bind:value={saveNotes} />
					<label class="flex items-center gap-2 text-sm text-[var(--color-text-secondary)]">
						<input type="checkbox" bind:checked={saveActive} />
						Active
					</label>
				</div>
				<div class="mt-3 flex items-center gap-3">
					<Button onclick={saveCombination} disabled={saving}>
						{saving ? 'Saving…' : 'Save combination'}
					</Button>
					{#if saveError}
						<p class="text-sm text-[var(--color-danger)]">{saveError}</p>
					{/if}
				</div>
				<p class="mt-2 text-xs text-[var(--color-text-muted)]">
					Saves the current 10 inputs and frozen totals as a thesis snapshot. Recheck later to compare against current prices. Active combinations can graduate into real plans.
				</p>
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
