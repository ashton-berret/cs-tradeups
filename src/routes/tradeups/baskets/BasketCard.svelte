<script lang="ts">
	import Badge from '$lib/components/Badge.svelte';
	import Button from '$lib/components/Button.svelte';
	import Money from '$lib/components/Money.svelte';
	import Percent from '$lib/components/Percent.svelte';
	import StatusBadge from '$lib/components/StatusBadge.svelte';
	import type { BasketCardVM } from '$lib/client/viewModels/baskets';

	type Props = {
		vm: BasketCardVM;
		onbuild: (vm: BasketCardVM) => void;
		oncancel: (vm: BasketCardVM) => void;
		ondelete: (vm: BasketCardVM) => void;
	};

	let { vm, onbuild, oncancel, ondelete }: Props = $props();

	const slotPct = $derived(Math.min(100, (vm.slotsFilled / 10) * 100));

	const profitTone = $derived(
		vm.profitBadge === 'GOOD' ? 'success' : vm.profitBadge === 'BAD' ? 'danger' : 'muted'
	);

	const profitColor = $derived.by(() => {
		if (vm.basket.expectedProfit == null) return 'text-[var(--color-text-primary)]';
		return vm.basket.expectedProfit >= 0
			? 'text-[var(--color-success)]'
			: 'text-[var(--color-danger)]';
	});
</script>

<div class="group relative overflow-hidden rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-surface-elevated)] p-5 shadow-sm transition-all duration-200 hover:border-[var(--color-border-hover)] hover:shadow-[0_8px_20px_-12px_rgba(0,0,0,0.5)]">
	<div class="flex flex-wrap items-start justify-between gap-3">
		<div class="min-w-0 flex-1">
			<div class="flex flex-wrap items-center gap-2">
				<h2 class="truncate text-base font-semibold text-[var(--color-text-primary)]">
					{vm.basket.name ?? 'Untitled basket'}
				</h2>
				<StatusBadge status={vm.basket.status} />
				<Badge tone={profitTone}>{vm.profitBadge}</Badge>
			</div>
			<p class="mt-1 text-xs text-[var(--color-text-muted)]">
				{vm.planName} · {vm.slotsFilled}/10 slots
			</p>
		</div>

		<div class="text-right">
			<div class="text-[10px] font-semibold uppercase tracking-wider text-[var(--color-text-muted)]">
				Expected profit
			</div>
			<div class={`text-lg font-semibold tabular-nums ${profitColor}`}>
				<Money value={vm.basket.expectedProfit} />
			</div>
			<div class="text-xs tabular-nums text-[var(--color-text-secondary)]">
				<Percent value={vm.basket.expectedProfitPct} />
			</div>
		</div>
	</div>

	<div class="mt-4">
		<div class="h-1.5 w-full overflow-hidden rounded-full bg-[var(--color-bg-surface-overlay)]">
			<div
				class="h-full rounded-full bg-gradient-to-r from-[var(--color-primary)] to-[var(--color-secondary)] transition-all"
				style:width={`${slotPct}%`}
			></div>
		</div>
	</div>

	<div class="mt-4 grid grid-cols-3 gap-3 rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-surface)]/40 p-3 text-sm tabular-nums">
		<div>
			<div class="text-[10px] font-semibold uppercase tracking-wider text-[var(--color-text-muted)]">Cost</div>
			<div class="mt-0.5 font-semibold text-[var(--color-text-primary)]">
				<Money value={vm.basket.totalCost} />
			</div>
		</div>
		<div class="border-l border-[var(--color-border)] pl-3">
			<div class="text-[10px] font-semibold uppercase tracking-wider text-[var(--color-text-muted)]">EV</div>
			<div class="mt-0.5 font-semibold text-[var(--color-secondary)]">
				<Money value={vm.basket.expectedEV} />
			</div>
		</div>
		<div class="border-l border-[var(--color-border)] pl-3">
			<div class="text-[10px] font-semibold uppercase tracking-wider text-[var(--color-text-muted)]">Avg float</div>
			<div class="mt-0.5 font-semibold text-[var(--color-text-primary)]">
				{vm.basket.averageFloat == null ? '—' : vm.basket.averageFloat.toFixed(6)}
			</div>
		</div>
	</div>

	<div class="mt-4 flex flex-wrap gap-2">
		<Button size="sm" variant="secondary" onclick={() => onbuild(vm)}>Build</Button>
		<form method="POST" action="?/markReady">
			<input type="hidden" name="id" value={vm.basket.id} />
			<Button type="submit" size="sm" variant="primary" disabled={vm.basket.status !== 'BUILDING'}>Ready</Button>
		</form>
		<Button size="sm" variant="ghost" disabled={vm.basket.status === 'CANCELLED' || vm.basket.status === 'EXECUTED'} onclick={() => oncancel(vm)}>Cancel</Button>
		<Button size="sm" variant="danger" onclick={() => ondelete(vm)}>Delete</Button>
	</div>
</div>
