<script lang="ts">
	import { page } from '$app/state';
	import Badge from '$lib/components/Badge.svelte';
	import Button from '$lib/components/Button.svelte';
	import Card from '$lib/components/Card.svelte';
	import FilterBar from '$lib/components/FilterBar.svelte';
	import Input from '$lib/components/Input.svelte';
	import Money from '$lib/components/Money.svelte';
	import PaginationControl from '$lib/components/PaginationControl.svelte';
	import Percent from '$lib/components/Percent.svelte';
	import { EXTERIOR_FLOAT_RANGES, ITEM_RARITIES, type ItemExterior } from '$lib/types/enums';
	import { ApiError, apiFetch } from '$lib/client/api';
	import { invalidateAll } from '$app/navigation';
	import type { ActionData, PageData } from './$types';
	import type { CombinationDTO } from '$lib/server/tradeups/combinationService';

	let { data, form }: { data: PageData; form?: ActionData } = $props();

	let pendingId = $state<string | null>(null);
	let errorMessage = $state<string | null>(null);
	let bulkRunning = $state(false);
	let bulkSummary = $state<string | null>(null);
	let checkedIds = $state(new Set<string>());
	let expandedInputs = $state(new Set<string>());
	let expandedDupes = $state(new Set<string>());
	const selectClass =
		'h-9 rounded-md border border-[var(--color-border)] bg-[var(--color-bg-surface-overlay)] px-3 py-2 text-sm text-[var(--color-text-primary)]';

	function toggleInputs(id: string) {
		const next = new Set(expandedInputs);
		if (next.has(id)) next.delete(id);
		else next.add(id);
		expandedInputs = next;
	}

	function toggleDupes(id: string) {
		const next = new Set(expandedDupes);
		if (next.has(id)) next.delete(id);
		else next.add(id);
		expandedDupes = next;
	}

	const EXTERIOR_LABEL: Record<ItemExterior, string> = {
		FACTORY_NEW: 'Factory New',
		MINIMAL_WEAR: 'Minimal Wear',
		FIELD_TESTED: 'Field-Tested',
		WELL_WORN: 'Well-Worn',
		BATTLE_SCARRED: 'Battle-Scarred',
	};

	function exteriorLabelForFloat(floatValue: number | null): string | null {
		if (floatValue == null || !Number.isFinite(floatValue)) return null;
		for (const [exterior, [min, max]] of Object.entries(EXTERIOR_FLOAT_RANGES) as Array<
			[ItemExterior, [number, number]]
		>) {
			if (floatValue >= min - 0.0005 && floatValue <= max + 0.0005) {
				return EXTERIOR_LABEL[exterior];
			}
		}
		return null;
	}

	function inputDisplayName(input: CombinationDTO['inputs'][number]): string {
		if (input.weaponName && input.skinName) return `${input.weaponName} | ${input.skinName}`;
		return shortCollection(input.collection);
	}

	const combinations = $derived(data.page.data);
	const allVisibleSelected = $derived(
		combinations.length > 0 && combinations.every((c) => checkedIds.has(c.id)),
	);
	const selectedCount = $derived(combinations.filter((c) => checkedIds.has(c.id)).length);

	function toggleRow(id: string, checked: boolean) {
		const next = new Set(checkedIds);
		if (checked) next.add(id);
		else next.delete(id);
		checkedIds = next;
	}

	function toggleAllVisible(checked: boolean) {
		const next = new Set(checkedIds);
		for (const c of combinations) {
			if (checked) next.add(c.id);
			else next.delete(c.id);
		}
		checkedIds = next;
	}

	function clearSelection() {
		checkedIds = new Set();
	}

	function hrefForPage(nextPage: number) {
		const params = new URLSearchParams(page.url.searchParams);
		params.set('page', String(nextPage));
		return `?${params.toString()}`;
	}

	async function recheck(id: string) {
		errorMessage = null;
		pendingId = id;
		try {
			await apiFetch<{ combination: CombinationDTO }>(
				fetch,
				`/api/tradeups/combinations/${id}/recheck`,
				{ method: 'POST' },
			);
			await invalidateAll();
		} catch (err) {
			errorMessage = err instanceof ApiError ? err.message : 'Recheck failed.';
		} finally {
			pendingId = null;
		}
	}

	async function toggleActive(c: CombinationDTO) {
		errorMessage = null;
		pendingId = c.id;
		try {
			await apiFetch<CombinationDTO>(fetch, `/api/tradeups/combinations/${c.id}`, {
				method: 'PATCH',
				body: JSON.stringify({ isActive: !c.isActive }),
			});
			await invalidateAll();
		} catch (err) {
			errorMessage = err instanceof ApiError ? err.message : 'Update failed.';
		} finally {
			pendingId = null;
		}
	}

	async function remove(id: string) {
		if (!confirm('Delete this saved combination? Snapshots and history will be lost.')) return;
		errorMessage = null;
		pendingId = id;
		try {
			await fetch(`/api/tradeups/combinations/${id}`, { method: 'DELETE' });
			await invalidateAll();
		} catch (err) {
			errorMessage = err instanceof Error ? err.message : 'Delete failed.';
		} finally {
			pendingId = null;
		}
	}

	async function recheckSelected() {
		if (selectedCount === 0) return;
		const ids = combinations.filter((c) => checkedIds.has(c.id)).map((c) => c.id);
		if (
			!confirm(
				`Recheck ${ids.length} combination${ids.length === 1 ? '' : 's'}? ` +
					`Each is re-evaluated against current observed prices.`,
			)
		)
			return;
		errorMessage = null;
		bulkSummary = null;
		bulkRunning = true;
		try {
			const result = await apiFetch<{
				succeeded: string[];
				failed: Array<{ id: string; message: string }>;
			}>(fetch, `/api/tradeups/combinations/recheck-batch`, {
				method: 'POST',
				body: JSON.stringify({ ids }),
			});
			bulkSummary =
				`Rechecked ${result.succeeded.length} of ${ids.length}` +
				(result.failed.length > 0 ? ` · ${result.failed.length} failed` : '');
			clearSelection();
			await invalidateAll();
		} catch (err) {
			errorMessage = err instanceof ApiError ? err.message : 'Bulk recheck failed.';
		} finally {
			bulkRunning = false;
		}
	}

	function shortRarity(r: string): string {
		const map: Record<string, string> = {
			CONSUMER_GRADE: 'Consumer',
			INDUSTRIAL_GRADE: 'Industrial',
			MIL_SPEC: 'Mil-Spec',
			RESTRICTED: 'Restricted',
			CLASSIFIED: 'Classified',
			COVERT: 'Covert',
		};
		return map[r] ?? r.replaceAll('_', ' ');
	}

	function shortCollection(name: string): string {
		// "The Chroma 3 Collection" → "Chroma 3"
		return name
			.replace(/^The\s+/i, '')
			.replace(/\s+Collection$/i, '')
			.trim();
	}

	function collectionLabel(c: CombinationDTO): string {
		const cols = c.collections.map(shortCollection);
		if (cols.length === 0) return '—';
		if (cols.length === 1) return `${cols[0]} Collection`;
		if (cols.length === 2) return `${cols[0]} + ${cols[1]} Collections`;
		return `${cols[0]} + ${cols.length - 1} Collections`;
	}

	function profitToneClass(value: number): string {
		if (value > 0) return 'text-[var(--color-success)]';
		if (value < 0) return 'text-[var(--color-danger)]';
		return 'text-[var(--color-text-primary)]';
	}

	/**
	 * Concise input-skin label. When all inputs share weapon+skin, shows "Weapon | Skin"
	 * (the typical tradeuplab-import case). When mixed, falls back to a count of distinct
	 * skins so the row stays informative without growing tall.
	 */
	function inputNameLabel(c: CombinationDTO): string {
		if (c.inputs.length === 0) return 'No inputs';
		const distinct = new Map<string, { weapon: string | null; skin: string | null; collection: string }>();
		for (const input of c.inputs) {
			const key = `${input.weaponName ?? ''}::${input.skinName ?? ''}::${input.collection}`;
			if (!distinct.has(key)) {
				distinct.set(key, {
					weapon: input.weaponName,
					skin: input.skinName,
					collection: input.collection,
				});
			}
		}
		if (distinct.size === 1) {
			const only = distinct.values().next().value!;
			if (only.weapon && only.skin) return `${only.weapon} | ${only.skin}`;
			return shortCollection(only.collection);
		}
		return `Mixed (${distinct.size} skins)`;
	}

	/** Index of the best (highest priced) output, or -1 when no priced outputs exist. */
	function bestOutputIndex(c: CombinationDTO): number {
		let bestIdx = -1;
		let bestPrice = -Infinity;
		for (let i = 0; i < c.outputs.length; i++) {
			const p = c.outputs[i].price;
			if (p != null && p > bestPrice) {
				bestPrice = p;
				bestIdx = i;
			}
		}
		return bestIdx;
	}
</script>

<div class="space-y-6">
	<div class="flex flex-wrap items-start justify-between gap-4">
		<div>
			<h1 class="text-2xl font-semibold text-[var(--color-text-primary)]">Saved tradeups</h1>
			<p class="mt-1 text-sm text-[var(--color-text-secondary)]">
				Combinations you saved from the calculator. Each row keeps the original "thesis" totals
				frozen and shows the latest recheck delta. Active combinations are graduated; inactive are
				drafts.
			</p>
		</div>
		<div class="flex flex-wrap items-end gap-2">
			<form method="POST" action="?/importTradeupLab" class="flex flex-wrap items-end gap-2">
				<label class="flex flex-col gap-1 text-xs text-[var(--color-text-secondary)]">
					Min %
					<input
						name="minProbability"
						type="number"
						min="1"
						max="100"
						value="90"
						class="h-9 w-20 rounded-md border border-[var(--color-border)] bg-[var(--color-bg-surface-overlay)] px-2 text-sm text-[var(--color-text-primary)]"
					/>
				</label>
				<label class="flex flex-col gap-1 text-xs text-[var(--color-text-secondary)]">
					Pages
					<input
						name="maxPages"
						type="number"
						min="1"
						max="25"
						value="3"
						class="h-9 w-20 rounded-md border border-[var(--color-border)] bg-[var(--color-bg-surface-overlay)] px-2 text-sm text-[var(--color-text-primary)]"
					/>
				</label>
				<Button type="submit" variant="secondary">Import TradeUpLab</Button>
			</form>
			<form
				method="POST"
				action="?/deleteTradeupLab"
				onsubmit={(event) => {
					if (
						!confirm(
							'Delete all saved TradeUpLab imports? This also deletes generated plans from activated TradeUpLab imports when they have no baskets or executions.',
						)
					) {
						event.preventDefault();
					}
				}}
			>
				<Button type="submit" variant="danger">Delete TradeUpLab imports</Button>
			</form>
		</div>
	</div>

	{#if form?.error}
		<p class="text-sm text-[var(--color-danger)]">{form.error}</p>
	{:else if form?.success}
		<p class="text-sm text-[var(--color-success)]">{form.success}</p>
	{/if}

	<FilterBar resetHref="/tradeups/saved">
		<div class="grid w-full grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-12">
			<label class="flex flex-col gap-1 text-xs text-[var(--color-text-secondary)]">
				Search
				<Input
					name="search"
					value={data.filter.search}
					placeholder="name, weapon, skin, collection"
				/>
			</label>
			<label class="flex flex-col gap-1 text-xs text-[var(--color-text-secondary)]">
				Collection
				<Input
					name="collection"
					value={data.filter.collection}
					placeholder="exact pool"
				/>
			</label>
			<label class="flex flex-col gap-1 text-xs text-[var(--color-text-secondary)]">
				Status
				<select
					name="status"
					value={data.filter.status}
					class={selectClass}
				>
					<option value="">All</option>
					<option value="active">Active</option>
					<option value="draft">Draft</option>
				</select>
			</label>
			<label class="flex flex-col gap-1 text-xs text-[var(--color-text-secondary)]">
				Mode
				<select
					name="mode"
					value={data.filter.mode}
					class={selectClass}
				>
					<option value="">All</option>
					<option value="PLAN">Plan</option>
					<option value="AD_HOC">Ad-hoc</option>
				</select>
			</label>
			<label class="flex flex-col gap-1 text-xs text-[var(--color-text-secondary)]">
				Input rarity
				<select
					name="inputRarity"
					value={data.filter.inputRarity}
					class={selectClass}
				>
					<option value="">All</option>
					{#each ITEM_RARITIES as rarity}
						<option value={rarity}>{shortRarity(rarity)}</option>
					{/each}
				</select>
			</label>
			<label class="flex flex-col gap-1 text-xs text-[var(--color-text-secondary)]">
				Target rarity
				<select
					name="targetRarity"
					value={data.filter.targetRarity}
					class={selectClass}
				>
					<option value="">All</option>
					{#each ITEM_RARITIES as rarity}
						<option value={rarity}>{shortRarity(rarity)}</option>
					{/each}
				</select>
			</label>
			<label class="flex flex-col gap-1 text-xs text-[var(--color-text-secondary)]">
				Source
				<select
					name="source"
					value={data.filter.source}
					class={selectClass}
				>
					<option value="">All</option>
					<option value="imported">Imported</option>
					<option value="local">Local</option>
				</select>
			</label>
			<label class="flex flex-col gap-1 text-xs text-[var(--color-text-secondary)]">
				Recheck
				<select
					name="recheckStatus"
					value={data.filter.recheckStatus}
					class={selectClass}
				>
					<option value="">Any</option>
					<option value="rechecked">Rechecked</option>
					<option value="never">Never</option>
				</select>
			</label>
			<label class="flex flex-col gap-1 text-xs text-[var(--color-text-secondary)]">
				Outputs
				<select
					name="outputs"
					value={data.filter.outputs}
					class={selectClass}
				>
					<option value="">Any</option>
					<option value="with">With outputs</option>
					<option value="without">No outputs</option>
				</select>
			</label>
			<label class="flex flex-col gap-1 text-xs text-[var(--color-text-secondary)]">
				Min profit
				<Input
					name="minProfit"
					type="number"
					step="0.01"
					value={data.filter.minProfit}
					placeholder="0.00"
				/>
			</label>
			<label class="flex flex-col gap-1 text-xs text-[var(--color-text-secondary)]">
				Min profit %
				<Input
					name="minProfitPct"
					type="number"
					step="0.1"
					value={data.filter.minProfitPct}
					placeholder="10"
				/>
			</label>
			<label class="flex flex-col gap-1 text-xs text-[var(--color-text-secondary)]">
				Min chance %
				<Input
					name="minProfitChance"
					type="number"
					step="0.1"
					min="0"
					max="100"
					value={data.filter.minProfitChance}
					placeholder="80"
				/>
			</label>
			<label class="flex flex-col gap-1 text-xs text-[var(--color-text-secondary)]">
				Max float
				<Input
					name="maxInputFloat"
					type="number"
					step="0.0001"
					min="0"
					max="1"
					value={data.filter.maxInputFloat}
					placeholder="0.15"
				/>
			</label>
			<label class="flex flex-col gap-1 text-xs text-[var(--color-text-secondary)]">
				Max price
				<Input
					name="maxInputPrice"
					type="number"
					step="0.01"
					min="0"
					value={data.filter.maxInputPrice}
					placeholder="2.50"
				/>
			</label>
			<label class="flex flex-col gap-1 text-xs text-[var(--color-text-secondary)]">
				Sort by
				<select
					name="sortBy"
					value={data.filter.sortBy}
					class={selectClass}
				>
					<optgroup label="Identity">
						<option value="createdAt">Saved date</option>
						<option value="name">Name</option>
						<option value="collection">Collection</option>
						<option value="targetRarity">Target rarity</option>
						<option value="inputRarity">Input rarity</option>
					</optgroup>
					<optgroup label="Cost & value">
						<option value="inputCost">Input cost</option>
						<option value="estimatedValue">Estimated value</option>
						<option value="maxInputPrice">Max price/item</option>
						<option value="maxFloat">Max input float</option>
					</optgroup>
					<optgroup label="Profit">
						<option value="thesisProfit">Thesis profit</option>
						<option value="thesisProfitPct">Thesis profit %</option>
						<option value="profitChance">Profit chance %</option>
						<option value="latestProfit">Latest profit</option>
						<option value="latestDelta">Latest delta vs thesis</option>
					</optgroup>
				</select>
			</label>
			<label class="flex flex-col gap-1 text-xs text-[var(--color-text-secondary)]">
				Direction
				<select
					name="sortDir"
					value={data.filter.sortDir}
					class={selectClass}
				>
					<option value="desc">Desc</option>
					<option value="asc">Asc</option>
				</select>
			</label>
			<label class="flex flex-col gap-1 text-xs text-[var(--color-text-secondary)]">
				Per page
				<select
					name="limit"
					value={String(data.filter.limit)}
					class={selectClass}
				>
					<option value="25">25</option>
					<option value="50">50</option>
					<option value="100">100</option>
					<option value="200">200</option>
				</select>
			</label>
			<label
				class="col-span-2 flex items-center gap-2 self-end pb-1 text-xs text-[var(--color-text-secondary)] sm:col-span-4 lg:col-span-12"
			>
				<input
					type="checkbox"
					name="showDuplicates"
					value="1"
					checked={data.filter.showDuplicates}
				/>
				<span>Show duplicates (rows with identical structural inputs)</span>
			</label>
		</div>
	</FilterBar>

	{#if errorMessage}
		<p class="text-sm text-[var(--color-danger)]">{errorMessage}</p>
	{/if}
	{#if bulkSummary}
		<p class="text-sm text-[var(--color-text-secondary)]">{bulkSummary}</p>
	{/if}

	<div class="flex flex-wrap items-center gap-3">
		<label class="flex items-center gap-2 text-sm text-[var(--color-text-secondary)]">
			<input
				type="checkbox"
				checked={allVisibleSelected}
				onchange={(e) => toggleAllVisible((e.currentTarget as HTMLInputElement).checked)}
			/>
			Select page ({combinations.length})
		</label>
		{#if selectedCount > 0}
			<span class="text-sm text-[var(--color-text-muted)]">{selectedCount} selected</span>
			<Button variant="secondary" onclick={recheckSelected} disabled={bulkRunning}>
				{bulkRunning ? 'Rechecking…' : `Recheck ${selectedCount}`}
			</Button>
			<Button variant="ghost" onclick={clearSelection} disabled={bulkRunning}>Clear</Button>
		{/if}
		<div class="ml-auto">
			<PaginationControl
				page={data.page.page}
				limit={data.page.limit}
				total={data.page.total}
				totalPages={data.page.totalPages}
				{hrefForPage}
			/>
		</div>
	</div>

	{#if combinations.length === 0}
		<Card padding="md">
			<p class="text-sm text-[var(--color-text-muted)]">
				No combinations match the current filters. Try clearing them, or build one in the
				<a class="underline" href="/calculator">calculator</a>.
			</p>
		</Card>
	{:else}
		<div class="space-y-3">
			{#each combinations as combination (combination.id)}
				{@const inputCount = combination.inputs.length}
				{@const profit = combination.thesis.expectedProfit}
				<Card padding="md">
					<!-- Header strip: select + title + status + actions -->
					<div class="flex items-start gap-3 pb-3">
						<input
							type="checkbox"
							class="mt-1.5 shrink-0"
							checked={checkedIds.has(combination.id)}
							onchange={(e) =>
								toggleRow(combination.id, (e.currentTarget as HTMLInputElement).checked)}
						/>
						<div class="min-w-0 flex-1">
							<div class="flex flex-wrap items-center gap-2">
								<Badge tone={combination.isActive ? 'success' : 'muted'}>
									{combination.isActive ? 'Active' : 'Draft'}
								</Badge>
								<Badge tone="primary">{combination.mode}</Badge>
								<h2 class="truncate text-base font-semibold text-[var(--color-text-primary)]">
									{combination.name}
								</h2>
								{#if combination.duplicates.length > 0}
									<button
										type="button"
										class="inline-flex items-center gap-1 rounded-full border border-[var(--color-warning,#d97706)]/40 bg-[var(--color-warning,#d97706)]/10 px-2 py-0.5 text-xs text-[var(--color-warning,#d97706)] hover:bg-[var(--color-warning,#d97706)]/20"
										onclick={() => toggleDupes(combination.id)}
										aria-expanded={expandedDupes.has(combination.id)}
									>
										× {combination.duplicates.length + 1} duplicates
										<svg
											class={[
												'h-3 w-3 transition-transform',
												expandedDupes.has(combination.id) ? 'rotate-180' : '',
											].join(' ')}
											viewBox="0 0 12 12"
											fill="none"
											aria-hidden="true"
										>
											<path
												d="M3 4.5L6 7.5L9 4.5"
												stroke="currentColor"
												stroke-width="1.5"
												stroke-linecap="round"
												stroke-linejoin="round"
											/>
										</svg>
									</button>
								{/if}
							</div>
							<p class="mt-0.5 text-xs text-[var(--color-text-muted)]">
								Saved {new Date(combination.thesisAt).toLocaleDateString()}
								{#if combination.tradeupLabId != null}
									· tradeuplab #{combination.tradeupLabId}
								{/if}
							</p>
							{#if combination.duplicates.length > 0 && expandedDupes.has(combination.id)}
								<div
									class="mt-2 rounded-md border border-[var(--color-border)] bg-[var(--color-bg-surface-elevated)] p-2 text-xs"
								>
									<p class="mb-1 text-[var(--color-text-secondary)]">
										{combination.duplicates.length} other combination{combination.duplicates
											.length === 1
											? ''
											: 's'} share the same structural inputs (representative shown above):
									</p>
									<ul class="space-y-0.5 font-mono text-[var(--color-text-primary)]">
										{#each combination.duplicates as dupe (dupe.id)}
											<li class="flex items-center gap-2">
												{#if dupe.tradeupLabId != null}
													<span>#{dupe.tradeupLabId}</span>
												{:else}
													<span class="text-[var(--color-text-muted)]">{dupe.id.slice(0, 10)}</span>
												{/if}
												{#if dupe.isActive}
													<Badge tone="success">Active</Badge>
												{/if}
												<span class="text-[var(--color-text-muted)]">
													{new Date(dupe.createdAt).toLocaleDateString()}
												</span>
											</li>
										{/each}
									</ul>
								</div>
							{/if}
						</div>
						<div class="flex shrink-0 gap-2">
							<Button
								variant="secondary"
								size="sm"
								onclick={() => recheck(combination.id)}
								disabled={pendingId === combination.id}
							>
								{pendingId === combination.id ? 'Rechecking…' : 'Recheck'}
							</Button>
							<Button
								variant="secondary"
								size="sm"
								onclick={() => toggleActive(combination)}
								disabled={pendingId === combination.id}
							>
								{combination.isActive ? 'Deactivate' : 'Activate'}
							</Button>
							<Button
								variant="danger"
								size="sm"
								onclick={() => remove(combination.id)}
								disabled={pendingId === combination.id}
							>
								Delete
							</Button>
						</div>
					</div>

					<!-- Stats row: Collection · Class→Class · Cost · EV · Profit · Profit% · Chance -->
					<div
						class="grid grid-cols-2 gap-3 border-y border-[var(--color-border)] py-3 sm:grid-cols-4 lg:grid-cols-7"
					>
						<div class="min-w-0">
							<div class="text-xs uppercase tracking-wide text-[var(--color-text-secondary)]">
								Collection
							</div>
							<div class="mt-0.5 truncate text-sm text-[var(--color-text-primary)]">
								{collectionLabel(combination)}
							</div>
						</div>
						<div class="min-w-0">
							<div class="text-xs uppercase tracking-wide text-[var(--color-text-secondary)]">
								Tier
							</div>
							<div class="mt-0.5 truncate text-sm text-[var(--color-text-primary)]">
								{shortRarity(combination.inputRarity)} → {shortRarity(combination.targetRarity)}
							</div>
						</div>
						<div class="min-w-0">
							<div class="text-xs uppercase tracking-wide text-[var(--color-text-secondary)]">
								Input cost
							</div>
							<div class="mt-0.5 text-sm font-medium text-[var(--color-text-primary)]">
								<Money value={combination.thesis.totalCost} />
							</div>
						</div>
						<div class="min-w-0">
							<div class="text-xs uppercase tracking-wide text-[var(--color-text-secondary)]">
								Est. net value
							</div>
							<div class="mt-0.5 text-sm font-medium text-[var(--color-text-primary)]">
								<Money value={combination.thesis.totalEV} />
							</div>
						</div>
						<div class="min-w-0">
							<div class="text-xs uppercase tracking-wide text-[var(--color-text-secondary)]">
								Profit
							</div>
							<div class={['mt-0.5 text-sm font-medium', profitToneClass(profit)].join(' ')}>
								<Money value={profit} />
							</div>
						</div>
						<div class="min-w-0">
							<div class="text-xs uppercase tracking-wide text-[var(--color-text-secondary)]">
								Profit %
							</div>
							<div class={['mt-0.5 text-sm font-medium', profitToneClass(profit)].join(' ')}>
								<Percent value={combination.thesis.expectedProfitPct} />
							</div>
						</div>
						<div class="min-w-0">
							<div class="text-xs uppercase tracking-wide text-[var(--color-text-secondary)]">
								Profit chance
							</div>
							<div class="mt-0.5 text-sm font-medium text-[var(--color-text-primary)]">
								{#if combination.profitChance != null}
									{combination.profitChance.toFixed(1)}%
								{:else}
									<span class="text-[var(--color-text-muted)]">—</span>
								{/if}
							</div>
						</div>
					</div>

					<!-- Bottom row: inputs spec (left) | outputs (right) -->
					<div class="grid gap-4 pt-3 lg:grid-cols-[minmax(240px,280px)_1fr]">
						<div>
							<div
								class="mb-2 flex items-center justify-between text-xs font-medium uppercase tracking-wide text-[var(--color-text-secondary)]"
							>
								<span>Inputs required</span>
								<button
									type="button"
									class="inline-flex items-center gap-1 rounded px-1 py-0.5 text-[var(--color-text-secondary)] transition-colors hover:bg-[var(--color-bg-surface-elevated)] hover:text-[var(--color-text-primary)]"
									onclick={() => toggleInputs(combination.id)}
									aria-expanded={expandedInputs.has(combination.id)}
									aria-controls="inputs-detail-{combination.id}"
								>
									<span class="text-[10px]">
										{expandedInputs.has(combination.id) ? 'Hide' : 'Show all'}
									</span>
									<svg
										class={[
											'h-3 w-3 transition-transform',
											expandedInputs.has(combination.id) ? 'rotate-180' : '',
										].join(' ')}
										viewBox="0 0 12 12"
										fill="none"
										aria-hidden="true"
									>
										<path
											d="M3 4.5L6 7.5L9 4.5"
											stroke="currentColor"
											stroke-width="1.5"
											stroke-linecap="round"
											stroke-linejoin="round"
										/>
									</svg>
								</button>
							</div>
							<dl class="space-y-1.5 text-sm">
								<div class="flex justify-between gap-2">
									<dt class="text-[var(--color-text-secondary)]">Quantity</dt>
									<dd
										class="min-w-0 truncate text-right text-[var(--color-text-primary)]"
										title={inputNameLabel(combination)}
									>
										<span class="font-mono">{inputCount}×</span>
										{inputNameLabel(combination)}
									</dd>
								</div>
								<div class="flex justify-between gap-2">
									<dt class="text-[var(--color-text-secondary)]">Max float</dt>
									<dd class="font-mono text-[var(--color-text-primary)]">
										{combination.maxInputFloat != null
											? combination.maxInputFloat.toFixed(4)
											: '—'}
									</dd>
								</div>
								<div class="flex justify-between gap-2">
									<dt class="text-[var(--color-text-secondary)]">Max price/item</dt>
									<dd class="font-mono text-[var(--color-text-primary)]">
										{#if combination.maxInputPrice != null}
											<Money value={combination.maxInputPrice} />
										{:else}
											—
										{/if}
									</dd>
								</div>
							</dl>

							{#if expandedInputs.has(combination.id)}
								<ul
									id="inputs-detail-{combination.id}"
									class="mt-3 space-y-1 border-t border-[var(--color-border)] pt-2 text-xs"
								>
									{#each combination.inputs as input (input.slotIndex)}
										{@const ext = exteriorLabelForFloat(input.floatValue)}
										<li class="flex items-baseline justify-between gap-2">
											<span class="min-w-0 flex-1 truncate text-[var(--color-text-primary)]">
												<span
													class="mr-1 inline-block w-4 text-right font-mono text-[var(--color-text-muted)]"
													>{input.slotIndex + 1}.</span
												>
												{inputDisplayName(input)}
												{#if ext}
													<span class="text-[var(--color-text-secondary)]">({ext})</span>
												{/if}
											</span>
											<span class="shrink-0 font-mono text-[var(--color-text-secondary)]">
												{input.floatValue != null ? input.floatValue.toFixed(4) : '—'} ·
												<Money value={input.price} />
											</span>
										</li>
									{/each}
								</ul>
							{/if}
						</div>

						<div>
							<div
								class="mb-2 text-xs font-medium uppercase tracking-wide text-[var(--color-text-secondary)]"
							>
								Possible outputs ({combination.outputs.length})
							</div>
							{#if combination.outputs.length === 0}
								<p class="text-sm text-[var(--color-text-muted)]">No output data available.</p>
							{:else}
								{@const bestIdx = bestOutputIndex(combination)}
								{@const totalCost = combination.thesis.totalCost}
								<div
									class="overflow-hidden rounded-md border border-[var(--color-border)] text-sm"
								>
									<table class="w-full">
										<thead
											class="bg-[var(--color-bg-surface-elevated)] text-xs uppercase tracking-wide text-[var(--color-text-secondary)]"
										>
											<tr>
												<th class="px-3 py-1.5 text-left font-medium">Output</th>
												<th class="px-3 py-1.5 text-right font-medium">Chance</th>
												<th class="px-3 py-1.5 text-right font-medium">Float</th>
												<th class="px-3 py-1.5 text-right font-medium">Net price</th>
												<th class="px-3 py-1.5 text-right font-medium">Profit</th>
											</tr>
										</thead>
										<tbody>
											{#each combination.outputs as output, i (i)}
												{@const isBest = i === bestIdx}
												{@const outProfit = output.price != null ? output.price - totalCost : null}
												<tr
													class={[
														'border-t border-[var(--color-border)] text-[var(--color-text-primary)]',
														isBest ? 'best-output-row' : '',
													].join(' ')}
												>
													<td class="truncate px-3 py-1.5">
														{#if isBest}
															<span
																class="mr-1 align-middle text-[var(--color-success)]"
																aria-label="Best outcome"
																title="Best outcome">★</span
															>
														{/if}
														{output.displayName}
														{#if output.exterior}
															<span class="ml-1 text-xs text-[var(--color-text-muted)]"
																>({output.exterior})</span
															>
														{/if}
													</td>
													<td class="px-3 py-1.5 text-right font-mono">
														{(output.probability * 100).toFixed(1)}%
													</td>
													<td class="px-3 py-1.5 text-right font-mono">
														{output.floatValue != null ? output.floatValue.toFixed(4) : '—'}
													</td>
													<td class="px-3 py-1.5 text-right font-mono">
														{#if output.price != null}
															<Money value={output.price} />
														{:else}
															—
														{/if}
													</td>
													<td
														class={[
															'px-3 py-1.5 text-right font-mono',
															outProfit != null ? profitToneClass(outProfit) : '',
														].join(' ')}
													>
														{#if outProfit != null}
															<Money value={outProfit} />
														{:else}
															—
														{/if}
													</td>
												</tr>
											{/each}
										</tbody>
									</table>
								</div>
							{/if}
						</div>
					</div>

					<!-- Latest recheck strip (only when present) -->
					{#if combination.latestSnapshot}
						{@const snap = combination.latestSnapshot}
						<div
							class="mt-3 flex flex-wrap items-center gap-x-6 gap-y-1 border-t border-[var(--color-border)] pt-3 text-sm"
						>
							<span class="text-xs uppercase tracking-wide text-[var(--color-text-secondary)]">
								Latest recheck
							</span>
							<span class="text-[var(--color-text-secondary)]">
								EV <Money value={snap.totalEV} />
							</span>
							<span class="text-[var(--color-text-secondary)]">
								Profit <Money value={snap.expectedProfit} />
							</span>
							<span class={profitToneClass(snap.evDeltaVsThesis)}>
								ΔEV <Money value={snap.evDeltaVsThesis} />
							</span>
							<span class={profitToneClass(snap.profitDeltaVsThesis)}>
								ΔProfit <Money value={snap.profitDeltaVsThesis} />
							</span>
							<span class="ml-auto text-xs text-[var(--color-text-muted)]">
								{new Date(snap.observedAt).toLocaleString()}
							</span>
						</div>
					{/if}
				</Card>
			{/each}
		</div>

		<PaginationControl
			page={data.page.page}
			limit={data.page.limit}
			total={data.page.total}
			totalPages={data.page.totalPages}
			{hrefForPage}
		/>
	{/if}
</div>

<style>
	/* Best-outcome row: subtle green tint + inner glow without overpowering the table. */
	:global(.best-output-row) {
		background: color-mix(in srgb, var(--color-success) 10%, transparent);
		box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--color-success) 35%, transparent),
			inset 0 0 14px color-mix(in srgb, var(--color-success) 18%, transparent);
	}
	:global(.best-output-row td) {
		font-weight: 500;
	}
</style>
