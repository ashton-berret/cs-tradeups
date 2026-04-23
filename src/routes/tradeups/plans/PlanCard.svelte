<script lang="ts">
	import Badge from '$lib/components/Badge.svelte';
	import Button from '$lib/components/Button.svelte';
	import Input from '$lib/components/Input.svelte';
	import Money from '$lib/components/Money.svelte';
	import StatusBadge from '$lib/components/StatusBadge.svelte';
	import { ITEM_RARITIES, RARITY_COLORS } from '$lib/types/enums';
	import type { PlanCardVM } from '$lib/client/viewModels/plans';
	import RuleEditor from './RuleEditor.svelte';
	import OutcomeEditor from './OutcomeEditor.svelte';

	type Props = {
		vm: PlanCardVM;
		ondelete: (vm: PlanCardVM) => void;
		ruleError?: string | null;
	};

	let { vm, ondelete, ruleError = null }: Props = $props();

	let expanded = $state(false);

	const inputColor = $derived(RARITY_COLORS[vm.plan.inputRarity]);
	const targetColor = $derived(RARITY_COLORS[vm.plan.targetRarity]);

	const collectionsVisible = $derived(vm.collections.slice(0, 2));
	const collectionsOverflow = $derived(Math.max(0, vm.collections.length - 2));

	const thresholdLabel = $derived(
		vm.plan.minProfitPctThreshold != null ? `≥ ${vm.plan.minProfitPctThreshold}%` : '—'
	);

	const projectedProfit = $derived.by(() => {
		if (vm.expectedValue == null || vm.estimatedMaxCost == null) return null;
		return vm.expectedValue - vm.estimatedMaxCost;
	});

	const targetTone = $derived.by(() => {
		if (projectedProfit == null || vm.plan.minProfitPctThreshold == null) {
			return 'neutral';
		}
		const projectedPct = vm.estimatedMaxCost ? (projectedProfit / vm.estimatedMaxCost) * 100 : null;
		if (projectedPct == null) return 'neutral';
		return projectedPct >= vm.plan.minProfitPctThreshold ? 'good' : 'bad';
	});
</script>

<div
	class={[
		'group relative overflow-hidden rounded-xl border bg-[var(--color-bg-surface-elevated)] transition-all duration-200',
		expanded
			? 'border-[var(--color-border-hover)] shadow-[0_0_0_1px_var(--color-border-hover),0_8px_24px_-12px_rgba(0,0,0,0.6)]'
			: 'border-[var(--color-border)] hover:border-[var(--color-border-hover)] hover:shadow-[0_8px_20px_-12px_rgba(0,0,0,0.5)]'
	].join(' ')}
>
	<div
		class="pointer-events-none absolute left-0 top-0 h-full w-1"
		style:background={`linear-gradient(180deg, ${inputColor} 0%, ${targetColor} 100%)`}
	></div>

	<button
		type="button"
		onclick={() => (expanded = !expanded)}
		aria-expanded={expanded}
		class="flex w-full items-center gap-5 py-4 pl-6 pr-5 text-left transition-colors hover:bg-[var(--color-bg-surface-overlay)]/30"
	>
		<span
			class={[
				'flex h-7 w-7 shrink-0 items-center justify-center rounded-md border transition-all',
				expanded
					? 'rotate-90 border-[var(--color-primary)]/40 bg-[var(--color-primary)]/10 text-[var(--color-primary)]'
					: 'border-[var(--color-border)] text-[var(--color-text-muted)] group-hover:border-[var(--color-border-hover)] group-hover:text-[var(--color-text-secondary)]'
			].join(' ')}
			aria-hidden="true"
		>
			<svg class="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
				<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M9 5l7 7-7 7" />
			</svg>
		</span>

		<div class="flex min-w-0 flex-[1.4] flex-col gap-1">
			<div class="flex min-w-0 items-center gap-2">
				<span class="truncate text-[15px] font-semibold text-[var(--color-text-primary)]">{vm.plan.name}</span>
				<StatusBadge status={vm.plan.isActive ? 'ACTIVE' : 'INACTIVE'} />
				{#if !vm.isCompositionValid}
					<Badge tone="warning">Needs review</Badge>
				{/if}
			</div>
			{#if vm.plan.description}
				<span class="truncate text-xs text-[var(--color-text-muted)]">{vm.plan.description}</span>
			{:else}
				<span class="text-[10px] uppercase tracking-wider text-[var(--color-text-muted)]">
					{vm.ruleCount} rule{vm.ruleCount === 1 ? '' : 's'} · {vm.outcomeCount} outcome{vm.outcomeCount === 1 ? '' : 's'}
				</span>
			{/if}
		</div>

		<div class="hidden shrink-0 items-center gap-2 text-xs sm:flex">
			<span
				class="inline-flex items-center gap-1.5 rounded-md border px-2 py-1 font-medium"
				style:color={inputColor}
				style:border-color={`${inputColor}55`}
				style:background-color={`${inputColor}15`}
			>
				<span class="h-1.5 w-1.5 rounded-full" style:background-color={inputColor}></span>
				{vm.inputRarityLabel}
			</span>
			<svg class="h-3 w-3 shrink-0 text-[var(--color-text-muted)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
				<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M13 5l7 7-7 7M5 12h15" />
			</svg>
			<span
				class="inline-flex items-center gap-1.5 rounded-md border px-2 py-1 font-medium"
				style:color={targetColor}
				style:border-color={`${targetColor}55`}
				style:background-color={`${targetColor}15`}
			>
				<span class="h-1.5 w-1.5 rounded-full" style:background-color={targetColor}></span>
				{vm.targetRarityLabel}
			</span>
		</div>

		<div class="hidden min-w-0 flex-[1] lg:block" title={vm.collections.join(', ')}>
			{#if vm.collections.length === 0}
				<span class="text-xs italic text-[var(--color-text-muted)]">Any collection</span>
			{:else}
				<div class="flex flex-wrap items-center gap-1">
					{#each collectionsVisible as collection}
						<span class="max-w-[10rem] truncate rounded-md border border-[var(--color-border)] bg-[var(--color-bg-surface-overlay)] px-2 py-0.5 text-xs text-[var(--color-text-secondary)]">
							{collection}
						</span>
					{/each}
					{#if collectionsOverflow > 0}
						<span class="rounded-md border border-[var(--color-border)] bg-[var(--color-bg-surface-overlay)] px-2 py-0.5 text-xs text-[var(--color-text-muted)]">
							+{collectionsOverflow}
						</span>
					{/if}
				</div>
			{/if}
		</div>

		<div class="flex shrink-0 items-center gap-4 text-right tabular-nums">
			<div>
				<div class="text-[10px] font-medium uppercase tracking-wider text-[var(--color-text-muted)]">Cost</div>
				<div class="text-sm font-semibold text-[var(--color-text-primary)]">
					<Money value={vm.estimatedMaxCost} />
				</div>
			</div>
			<div class="h-8 w-px bg-[var(--color-border)]"></div>
			<div>
				<div class="text-[10px] font-medium uppercase tracking-wider text-[var(--color-text-muted)]">EV</div>
				<div class="text-sm font-semibold text-[var(--color-secondary)]">
					<Money value={vm.expectedValue} />
				</div>
			</div>
			<div class="h-8 w-px bg-[var(--color-border)]"></div>
			<div>
				<div class="text-[10px] font-medium uppercase tracking-wider text-[var(--color-text-muted)]">Target</div>
				<div
					class={[
						'text-sm font-semibold',
						targetTone === 'good' && 'text-[var(--color-success)]',
						targetTone === 'bad' && 'text-[var(--color-danger)]',
						targetTone === 'neutral' && 'text-[var(--color-text-primary)]'
					]
						.filter(Boolean)
						.join(' ')}
				>
					{thresholdLabel}
				</div>
			</div>
		</div>
	</button>

	{#if expanded}
		<div class="border-t border-[var(--color-border)]">
			<section class="space-y-4 bg-[var(--color-bg-surface)]/40 p-6">
				<div class="flex items-baseline justify-between">
					<h3 class="text-xs font-semibold uppercase tracking-wider text-[var(--color-text-secondary)]">
						Plan settings
					</h3>
					<span class="text-xs text-[var(--color-text-muted)]">
						Updated {new Date(vm.plan.updatedAt).toLocaleDateString()}
					</span>
				</div>

				<form method="POST" action="?/updatePlan" class="space-y-4">
					<input type="hidden" name="id" value={vm.plan.id} />

					<div class="grid grid-cols-1 gap-3 md:grid-cols-4">
						<div class="md:col-span-2">
							<Input name="name" label="Name" value={vm.plan.name} required />
						</div>
						<div>
							<label for={`plan-input-rarity-${vm.plan.id}`} class="mb-2 block text-sm font-medium text-[var(--color-text-secondary)]">Input rarity</label>
							<select id={`plan-input-rarity-${vm.plan.id}`} name="inputRarity" value={vm.plan.inputRarity} class="w-full rounded-md border border-[var(--color-border)] bg-[var(--color-bg-surface-overlay)] px-3 py-2 text-sm">
								{#each ITEM_RARITIES as rarity}
									<option value={rarity}>{rarity.replaceAll('_', ' ')}</option>
								{/each}
							</select>
						</div>
						<div>
							<label for={`plan-target-rarity-${vm.plan.id}`} class="mb-2 block text-sm font-medium text-[var(--color-text-secondary)]">Target rarity</label>
							<select id={`plan-target-rarity-${vm.plan.id}`} name="targetRarity" value={vm.plan.targetRarity} class="w-full rounded-md border border-[var(--color-border)] bg-[var(--color-bg-surface-overlay)] px-3 py-2 text-sm">
								{#each ITEM_RARITIES as rarity}
									<option value={rarity}>{rarity.replaceAll('_', ' ')}</option>
								{/each}
							</select>
						</div>
					</div>

					<div class="grid grid-cols-2 gap-3 md:grid-cols-4">
						<Input name="minProfitThreshold" type="number" step="0.01" min="0" label="Min profit" value={vm.plan.minProfitThreshold ?? ''} />
						<Input name="minProfitPctThreshold" type="number" step="0.01" label="Min profit %" value={vm.plan.minProfitPctThreshold ?? ''} />
						<Input name="minLiquidityScore" type="number" step="0.01" min="0" max="1" label="Min liquidity" value={vm.plan.minLiquidityScore ?? ''} />
						<Input name="minCompositeScore" type="number" step="0.01" min="0" max="1" label="Min composite" value={vm.plan.minCompositeScore ?? ''} />
					</div>

					<div class="grid grid-cols-1 gap-3 md:grid-cols-2">
						<div>
							<label for={`plan-description-${vm.plan.id}`} class="mb-2 block text-sm font-medium text-[var(--color-text-secondary)]">Description</label>
							<textarea id={`plan-description-${vm.plan.id}`} name="description" rows="2" placeholder="Short summary" class="w-full rounded-md border border-[var(--color-border)] bg-[var(--color-bg-surface-overlay)] px-3 py-2 text-sm">{vm.plan.description ?? ''}</textarea>
						</div>
						<div>
							<label for={`plan-notes-${vm.plan.id}`} class="mb-2 block text-sm font-medium text-[var(--color-text-secondary)]">Notes</label>
							<textarea id={`plan-notes-${vm.plan.id}`} name="notes" rows="2" placeholder="Operator notes" class="w-full rounded-md border border-[var(--color-border)] bg-[var(--color-bg-surface-overlay)] px-3 py-2 text-sm">{vm.plan.notes ?? ''}</textarea>
						</div>
					</div>

					<div class="flex items-center justify-between">
						<label class="inline-flex cursor-pointer items-center gap-2 text-sm text-[var(--color-text-secondary)]">
							<input type="checkbox" name="isActive" checked={vm.plan.isActive} class="h-4 w-4 accent-[var(--color-primary)]" />
							<span>Active</span>
						</label>
						<Button type="submit" size="sm" variant="secondary">Save metadata</Button>
					</div>
				</form>
			</section>

			<section class="space-y-3 p-6">
				<div class="flex items-baseline justify-between">
					<h3 class="text-xs font-semibold uppercase tracking-wider text-[var(--color-text-secondary)]">
						Input rules
						<span class="ml-1 font-normal text-[var(--color-text-muted)]">({vm.ruleCount})</span>
					</h3>
					<p class="text-xs text-[var(--color-text-muted)]">Hard filters. A candidate must match at least one rule.</p>
				</div>

				{#each vm.plan.rules as rule, i}
					<div>
						<div class="mb-1.5 flex items-center justify-between px-0.5">
							<span class="text-[10px] font-semibold uppercase tracking-wider text-[var(--color-text-muted)]">
								Rule {i + 1}
							</span>
							<form method="POST" action="?/deleteRule">
								<input type="hidden" name="ruleId" value={rule.id} />
								<button type="submit" class="text-xs text-[var(--color-text-muted)] transition-colors hover:text-[var(--color-danger)]">
									Delete
								</button>
							</form>
						</div>
						<RuleEditor {rule} mode="update" error={ruleError} />
					</div>
				{/each}

				<div class="pt-2">
					<div class="mb-1.5 flex items-center gap-2 px-0.5">
						<span class="inline-flex h-4 w-4 items-center justify-center rounded-full bg-[var(--color-primary)]/15 text-[var(--color-primary)]">
							<svg class="h-2.5 w-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
								<path stroke-linecap="round" stroke-linejoin="round" stroke-width="3" d="M12 5v14M5 12h14" />
							</svg>
						</span>
						<span class="text-[10px] font-semibold uppercase tracking-wider text-[var(--color-text-secondary)]">
							New rule
						</span>
					</div>
					<RuleEditor planId={vm.plan.id} mode="add" error={ruleError} />
				</div>
			</section>

			<section class="space-y-3 border-t border-[var(--color-border)] bg-[var(--color-bg-surface)]/40 p-6">
				<div class="flex items-baseline justify-between">
					<h3 class="text-xs font-semibold uppercase tracking-wider text-[var(--color-text-secondary)]">
						Outcomes
						<span class="ml-1 font-normal text-[var(--color-text-muted)]">
							({vm.outcomeCount} · weight {vm.totalProbabilityWeight.toFixed(2)})
						</span>
					</h3>
					<p class="text-xs text-[var(--color-text-muted)]">Feed expected value. Do not control matching.</p>
				</div>

				{#each vm.plan.outcomeItems as outcome, i}
					<div>
						<div class="mb-1.5 flex items-center justify-between px-0.5">
							<span class="text-[10px] font-semibold uppercase tracking-wider text-[var(--color-text-muted)]">
								Outcome {i + 1}
							</span>
							<form method="POST" action="?/deleteOutcome">
								<input type="hidden" name="outcomeId" value={outcome.id} />
								<button type="submit" class="text-xs text-[var(--color-text-muted)] transition-colors hover:text-[var(--color-danger)]">
									Delete
								</button>
							</form>
						</div>
						<OutcomeEditor {outcome} mode="update" />
					</div>
				{/each}

				<div class="pt-2">
					<div class="mb-1.5 flex items-center gap-2 px-0.5">
						<span class="inline-flex h-4 w-4 items-center justify-center rounded-full bg-[var(--color-primary)]/15 text-[var(--color-primary)]">
							<svg class="h-2.5 w-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
								<path stroke-linecap="round" stroke-linejoin="round" stroke-width="3" d="M12 5v14M5 12h14" />
							</svg>
						</span>
						<span class="text-[10px] font-semibold uppercase tracking-wider text-[var(--color-text-secondary)]">
							New outcome
						</span>
					</div>
					<OutcomeEditor planId={vm.plan.id} mode="add" />
				</div>
			</section>

			<div class="flex items-center justify-between border-t border-[var(--color-danger)]/20 bg-[var(--color-danger)]/5 px-6 py-4">
				<div>
					<div class="text-xs font-semibold uppercase tracking-wider text-[var(--color-danger)]">Danger zone</div>
					<p class="text-xs text-[var(--color-text-muted)]">Deleting a plan is blocked if baskets or executions reference it.</p>
				</div>
				<Button variant="danger" size="sm" onclick={() => ondelete(vm)}>Delete plan</Button>
			</div>
		</div>
	{/if}
</div>
