<script lang="ts">
	import Badge from '$lib/components/Badge.svelte';
	import Button from '$lib/components/Button.svelte';
	import Card from '$lib/components/Card.svelte';
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
</script>

<Card class="space-y-4">
	<div class="flex flex-wrap items-start justify-between gap-3">
		<div>
			<div class="flex flex-wrap items-center gap-2">
				<h2 class="text-lg font-semibold">{vm.basket.name ?? 'Untitled basket'}</h2>
				<StatusBadge status={vm.basket.status} />
				<Badge tone={vm.profitBadge === 'GOOD' ? 'success' : vm.profitBadge === 'BAD' ? 'danger' : 'muted'}>{vm.profitBadge}</Badge>
			</div>
			<p class="mt-1 text-sm text-[var(--color-text-secondary)]">
				{vm.planName} · {vm.slotsFilled}/10 slots
			</p>
		</div>
		<div class="text-right text-sm">
			<div><Money value={vm.basket.expectedProfit} /></div>
			<div><Percent value={vm.basket.expectedProfitPct} /></div>
		</div>
	</div>
	<div class="grid grid-cols-3 gap-3 text-sm">
		<div>
			<div class="text-xs text-[var(--color-text-muted)]">Cost</div>
			<Money value={vm.basket.totalCost} />
		</div>
		<div>
			<div class="text-xs text-[var(--color-text-muted)]">EV</div>
			<Money value={vm.basket.expectedEV} />
		</div>
		<div>
			<div class="text-xs text-[var(--color-text-muted)]">Average float</div>
			{vm.basket.averageFloat == null ? '—' : vm.basket.averageFloat.toFixed(6)}
		</div>
	</div>
	<div class="flex flex-wrap gap-2">
		<Button size="sm" variant="secondary" onclick={() => onbuild(vm)}>Build</Button>
		<form method="POST" action="?/markReady">
			<input type="hidden" name="id" value={vm.basket.id} />
			<Button type="submit" size="sm" variant="primary" disabled={vm.basket.status !== 'BUILDING'}>Ready</Button>
		</form>
		<Button size="sm" variant="ghost" disabled={vm.basket.status === 'CANCELLED' || vm.basket.status === 'EXECUTED'} onclick={() => oncancel(vm)}>Cancel</Button>
		<Button size="sm" variant="danger" onclick={() => ondelete(vm)}>Delete</Button>
	</div>
</Card>
