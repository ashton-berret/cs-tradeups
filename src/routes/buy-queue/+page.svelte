<script lang="ts">
	import { enhance } from '$app/forms';
	import Badge from '$lib/components/Badge.svelte';
	import Button from '$lib/components/Button.svelte';
	import Card from '$lib/components/Card.svelte';
	import Money from '$lib/components/Money.svelte';
	import Percent from '$lib/components/Percent.svelte';
	import type {
		AssignmentRole,
		CandidateAssignment,
		ProposedBasketSummary
	} from '$lib/types/services';
	import type { ActionData, PageData } from './$types';

	let { data, form }: { data: PageData; form?: ActionData } = $props();

	const queue = $derived(data.queue);
	const groups = $derived(groupAssignments(queue.assignments, queue.baskets));
	const expanded = $state<Record<string, boolean>>({});

	function groupAssignments(
		assignments: CandidateAssignment[],
		baskets: ProposedBasketSummary[]
	) {
		const summaryById = new Map(baskets.map((b) => [b.basketGroupId, b]));
		const planMap = new Map<
			string,
			{
				planId: string;
				planName: string;
				baskets: Array<{
					summary: ProposedBasketSummary | null;
					basketGroupId: string;
					rows: CandidateAssignment[];
				}>;
			}
		>();
		for (const a of assignments) {
			const plan = planMap.get(a.planId) ?? {
				planId: a.planId,
				planName: a.planName,
				baskets: []
			};
			let basketEntry = plan.baskets.find((b) => b.basketGroupId === a.basketGroupId);
			if (!basketEntry) {
				basketEntry = {
					summary: summaryById.get(a.basketGroupId) ?? null,
					basketGroupId: a.basketGroupId,
					rows: []
				};
				plan.baskets.push(basketEntry);
			}
			basketEntry.rows.push(a);
			planMap.set(a.planId, plan);
		}
		return [...planMap.values()].sort((a, b) => a.planName.localeCompare(b.planName));
	}

	function roleTone(role: AssignmentRole): 'success' | 'primary' | 'warning' | 'muted' {
		if (role === 'BASKET_FILL') return 'success';
		if (role === 'NEW_BASKET') return 'primary';
		if (role === 'PINNED') return 'muted';
		return 'warning';
	}

	function roleLabel(role: AssignmentRole): string {
		switch (role) {
			case 'BASKET_FILL':
				return 'Fill';
			case 'NEW_BASKET':
				return 'New';
			case 'PINNED':
				return 'Pinned';
			case 'RESERVE':
				return 'Reserve';
		}
	}

	function basketLabel(summary: ProposedBasketSummary | null, basketGroupId: string) {
		if (!summary) return basketGroupId;
		if (summary.basketId) return `Basket ${summary.basketId.slice(-6)}`;
		const idx = basketGroupId.split(':').pop();
		return `Proposed #${idx ?? ''}`;
	}

	function priceOverMax(price: number, max: number | null): boolean {
		return max != null && price > max;
	}

	function toggle(key: string) {
		expanded[key] = !expanded[key];
	}
</script>

<div class="space-y-6">
	<div class="flex items-start justify-between gap-4">
		<div>
			<h1 class="text-2xl font-semibold text-[var(--color-text-primary)]">Buy Queue</h1>
			<p class="mt-1 text-sm text-[var(--color-text-secondary)]">
				Global partition of candidates and held inventory across active plans. Recomputed on every load.
			</p>
		</div>
		<form method="get">
			<select
				name="planId"
				value={data.planId ?? ''}
				onchange={(e) => (e.currentTarget.form as HTMLFormElement | null)?.submit()}
				class="rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-surface)] px-3 py-2 text-sm text-[var(--color-text-primary)]"
			>
				<option value="">All plans</option>
				{#each data.plans as plan}
					<option value={plan.id}>{plan.name}</option>
				{/each}
			</select>
		</form>
	</div>

	<div class="grid grid-cols-1 gap-4 md:grid-cols-3">
		<Card padding="md">
			<div class="text-xs uppercase tracking-wide text-[var(--color-text-secondary)]">
				Total expected profit
			</div>
			<div class="mt-1 text-2xl font-semibold">
				<Money value={queue.totalExpectedProfit} />
			</div>
		</Card>
		<Card padding="md">
			<div class="text-xs uppercase tracking-wide text-[var(--color-text-secondary)]">
				Viable baskets (10/10)
			</div>
			<div class="mt-1 text-2xl font-semibold">{queue.viableBasketCount}</div>
		</Card>
		<Card padding="md">
			<div class="text-xs uppercase tracking-wide text-[var(--color-text-secondary)]">
				Proposed groupings
			</div>
			<div class="mt-1 text-2xl font-semibold">{queue.baskets.length}</div>
		</Card>
	</div>

	{#if form?.error}
		<Card padding="sm">
			<div class="text-sm text-[var(--color-danger)]">{form.error}</div>
		</Card>
	{/if}
	{#if form?.success}
		<Card padding="sm">
			<div class="text-sm text-[var(--color-success)]">{form.success}</div>
		</Card>
	{/if}

	{#if groups.length === 0}
		<Card padding="md">
			<div class="text-sm text-[var(--color-text-secondary)]">
				No assignments. Either no active plans accept the current pool, or there are no candidates and no held inventory.
			</div>
		</Card>
	{/if}

	{#each groups as group}
		<div class="space-y-3">
			<div class="flex items-center gap-3">
				<h2 class="text-lg font-semibold text-[var(--color-text-primary)]">{group.planName}</h2>
				<Badge tone="muted">{group.baskets.length} grouping{group.baskets.length === 1 ? '' : 's'}</Badge>
			</div>

			{#each group.baskets as basket}
				<Card padding="md">
					<div class="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--color-border)] pb-3">
						<div class="flex items-center gap-3">
							<span class="font-medium">{basketLabel(basket.summary, basket.basketGroupId)}</span>
							<Badge tone={basket.summary?.isFull ? 'success' : 'warning'}>
								{basket.summary?.itemCount ?? basket.rows.length}/10
							</Badge>
							{#if basket.summary?.basketId}
								<Badge tone="muted">Existing</Badge>
							{:else if !basket.basketGroupId.startsWith('reserve:')}
								<Badge tone="primary">Proposed</Badge>
							{:else}
								<Badge tone="warning">Reserve pool</Badge>
							{/if}
						</div>
						<div class="flex items-center gap-4 text-sm text-[var(--color-text-secondary)]">
							<span>Cost: <Money value={basket.summary?.totalCost ?? null} /></span>
							<span>EV: <Money value={basket.summary?.expectedEV ?? null} /></span>
							<span>
								Profit: <Money value={basket.summary?.expectedProfit ?? null} />
								{#if basket.summary?.expectedProfitPct != null}
									(<Percent value={basket.summary.expectedProfitPct} />)
								{/if}
							</span>
						</div>
					</div>

					<div class="mt-3 overflow-x-auto">
						<table class="w-full text-sm">
							<thead>
								<tr class="text-left text-xs uppercase tracking-wide text-[var(--color-text-secondary)]">
									<th class="px-2 py-2 w-12">Slot</th>
									<th class="px-2 py-2">Item</th>
									<th class="px-2 py-2">Role</th>
									<th class="px-2 py-2 text-right">Price</th>
									<th class="px-2 py-2 text-right">Max buy</th>
									<th class="px-2 py-2 text-right">Marginal EV</th>
									<th class="px-2 py-2">Reason</th>
									<th class="px-2 py-2"></th>
								</tr>
							</thead>
							<tbody>
								{#each basket.rows as row (row.poolItemId)}
									{@const candidate = row.poolItemKind === 'CANDIDATE'}
									{@const overMax = priceOverMax(row.currentPrice, row.maxBuyPrice)}
									<tr class="border-t border-[var(--color-border)] align-top">
										<td class="px-2 py-2 font-mono text-xs text-[var(--color-text-secondary)]">
											{row.basketSlotIndex + 1}
										</td>
										<td class="px-2 py-2">
											<div class="font-medium">{candidate ? 'Candidate' : 'Inventory'}: {row.sourceId.slice(-8)}</div>
											<div class="text-xs text-[var(--color-text-secondary)]">{row.floatFit.explanation}</div>
										</td>
										<td class="px-2 py-2">
											<Badge tone={roleTone(row.role)}>{roleLabel(row.role)}</Badge>
										</td>
										<td class="px-2 py-2 text-right">
											<span class={overMax ? 'text-[var(--color-danger)]' : ''}>
												<Money value={row.currentPrice} />
											</span>
										</td>
										<td class="px-2 py-2 text-right text-[var(--color-text-secondary)]">
											<Money value={row.maxBuyPrice} />
										</td>
										<td class="px-2 py-2 text-right">
											<Money value={row.marginalEVContribution} />
										</td>
										<td class="px-2 py-2 text-xs text-[var(--color-text-secondary)]">
											{row.reason}
											{#if row.alternatives.length > 0}
												<button
													type="button"
													class="ml-2 underline"
													onclick={() => toggle(row.poolItemId)}
												>
													{expanded[row.poolItemId] ? 'Hide' : 'Show'} alts ({row.alternatives.length})
												</button>
												{#if expanded[row.poolItemId]}
													<ul class="mt-1 list-disc space-y-0.5 pl-5">
														{#each row.alternatives as alt}
															<li>
																{alt.planName}: <Money value={alt.marginalEVContribution} />
																(−<Money value={alt.deltaFromPrimary} />). {alt.whyNotChosen}
															</li>
														{/each}
													</ul>
												{/if}
											{/if}
										</td>
										<td class="px-2 py-2">
											{#if candidate && row.role !== 'RESERVE'}
												<form method="post" action="?/markBought" use:enhance>
													<input type="hidden" name="candidateId" value={row.sourceId} />
													<input type="hidden" name="purchasePrice" value={row.currentPrice} />
													<input type="hidden" name="intendedBasketId" value={row.basketId ?? ''} />
													<input type="hidden" name="intendedSlotIndex" value={row.basketSlotIndex} />
													<Button type="submit" size="sm" disabled={overMax}>Mark bought</Button>
												</form>
											{/if}
										</td>
									</tr>
								{/each}
							</tbody>
						</table>
					</div>
				</Card>
			{/each}
		</div>
	{/each}

	{#if queue.unassigned.length > 0}
		<Card padding="md">
			<div class="font-medium">Unassigned ({queue.unassigned.length})</div>
			<ul class="mt-2 space-y-1 text-sm text-[var(--color-text-secondary)]">
				{#each queue.unassigned as item}
					<li>
						{item.poolItemKind} {item.sourceId.slice(-8)} — {item.reason}
					</li>
				{/each}
			</ul>
		</Card>
	{/if}
</div>
