<script lang="ts">
	import Badge from '$lib/components/Badge.svelte';
	import Button from '$lib/components/Button.svelte';
	import Card from '$lib/components/Card.svelte';
	import Input from '$lib/components/Input.svelte';
	import Money from '$lib/components/Money.svelte';
	import Percent from '$lib/components/Percent.svelte';
	import StatusBadge from '$lib/components/StatusBadge.svelte';
	import type { PlanCardVM } from '$lib/client/viewModels/plans';
	import RuleEditor from './RuleEditor.svelte';
	import OutcomeEditor from './OutcomeEditor.svelte';

	type Props = {
		vm: PlanCardVM;
		ondelete: (vm: PlanCardVM) => void;
		ruleError?: string | null;
	};

	let { vm, ondelete, ruleError = null }: Props = $props();
</script>

<Card class="space-y-5">
	<div class="flex flex-wrap items-start justify-between gap-3">
		<div>
			<div class="flex flex-wrap items-center gap-2">
				<h2 class="text-lg font-semibold">{vm.plan.name}</h2>
				<StatusBadge status={vm.plan.isActive ? 'ACTIVE' : 'INACTIVE'} />
				{#if !vm.isCompositionValid}
					<Badge tone="warning">Needs review</Badge>
				{/if}
			</div>
			<p class="mt-1 text-sm text-[var(--color-text-secondary)]">
				{vm.inputRarityLabel} to {vm.targetRarityLabel} · {vm.ruleCount} rules · {vm.outcomeCount} outcomes · weight {vm.totalProbabilityWeight.toFixed(2)}
			</p>
		</div>
		<Button variant="danger" size="sm" onclick={() => ondelete(vm)}>Delete</Button>
	</div>

	<form method="POST" action="?/updatePlan" class="space-y-3">
		<input type="hidden" name="id" value={vm.plan.id} />
		<div class="grid grid-cols-2 gap-3 md:grid-cols-4">
			<Input name="name" label="Name" value={vm.plan.name} required />
			<Input name="minProfitThreshold" type="number" step="0.01" min="0" label="Min profit" value={vm.plan.minProfitThreshold ?? ''} />
			<Input name="minProfitPctThreshold" type="number" step="0.01" label="Min profit %" value={vm.plan.minProfitPctThreshold ?? ''} />
			<Input name="minLiquidityScore" type="number" step="0.01" min="0" max="1" label="Min liquidity" value={vm.plan.minLiquidityScore ?? ''} />
		</div>
		<label class="flex items-center gap-2 text-sm text-[var(--color-text-secondary)]">
			<input type="checkbox" name="isActive" checked={vm.plan.isActive} />
			Active
		</label>
		<textarea name="notes" rows="2" class="w-full rounded-md border border-[var(--color-border)] bg-[var(--color-bg-surface-overlay)] px-3 py-2 text-sm">{vm.plan.notes ?? ''}</textarea>
		<div class="flex justify-end">
			<Button type="submit" size="sm" variant="secondary">Save metadata</Button>
		</div>
	</form>

	<div class="space-y-3">
		<h3 class="text-sm font-semibold text-[var(--color-text-secondary)]">Rules</h3>
		{#each vm.plan.rules as rule}
			<div class="space-y-2">
				<RuleEditor {rule} mode="update" error={ruleError} />
				<form method="POST" action="?/deleteRule" class="flex justify-end">
					<input type="hidden" name="ruleId" value={rule.id} />
					<Button type="submit" size="sm" variant="ghost">Delete rule</Button>
				</form>
			</div>
		{/each}
		<RuleEditor planId={vm.plan.id} mode="add" error={ruleError} />
	</div>

	<div class="space-y-3">
		<h3 class="text-sm font-semibold text-[var(--color-text-secondary)]">Outcomes</h3>
		{#each vm.plan.outcomeItems as outcome}
			<div class="space-y-2">
				<OutcomeEditor {outcome} mode="update" />
				<form method="POST" action="?/deleteOutcome" class="flex justify-end">
					<input type="hidden" name="outcomeId" value={outcome.id} />
					<Button type="submit" size="sm" variant="ghost">Delete outcome</Button>
				</form>
			</div>
		{/each}
		<OutcomeEditor planId={vm.plan.id} mode="add" />
	</div>
</Card>
