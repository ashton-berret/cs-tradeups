<script lang="ts">
	import Button from '$lib/components/Button.svelte';
	import FloatValue from '$lib/components/FloatValue.svelte';
	import Money from '$lib/components/Money.svelte';
	import Percent from '$lib/components/Percent.svelte';
	import StatusBadge from '$lib/components/StatusBadge.svelte';
	import type { CandidateRowVM } from '$lib/client/viewModels/candidates';

	type Props = {
		row: CandidateRowVM;
		ondetail: (row: CandidateRowVM) => void;
		onbuy: (row: CandidateRowVM) => void;
		ondelete: (row: CandidateRowVM) => void;
	};

	let { row, ondetail, onbuy, ondelete }: Props = $props();
</script>

<td class="px-4 py-3">
	<div class="font-medium text-[var(--color-text-primary)]">{row.marketHashName}</div>
	<div class="mt-1 text-xs text-[var(--color-text-muted)]">
		{row.rarityLabel} · {row.exteriorLabel} · {row.stalenessLabel}
	</div>
</td>
<td class="px-4 py-3"><StatusBadge status={row.status} /></td>
<td class="px-4 py-3"><Money value={row.listPrice} currency={row.currency} /></td>
<td class="px-4 py-3"><FloatValue value={row.floatValue} /></td>
<td class="px-4 py-3">{row.matchedPlanName ?? '—'}</td>
<td class="px-4 py-3">
	<div><Money value={row.expectedProfit} /></div>
	<div class="text-xs"><Percent value={row.expectedProfitPct} /></div>
</td>
<td class="px-4 py-3">
	<div class="flex flex-wrap gap-2">
		<Button size="sm" variant="secondary" onclick={() => ondetail(row)}>Details</Button>
		<form method="POST" action="?/setStatus">
			<input type="hidden" name="id" value={row.id} />
			<input type="hidden" name="status" value="PASSED" />
			<Button type="submit" size="sm" variant="ghost">Pass</Button>
		</form>
		<form method="POST" action="?/setStatus">
			<input type="hidden" name="id" value={row.id} />
			<input type="hidden" name="status" value="GOOD_BUY" />
			<Button type="submit" size="sm" variant="ghost">Good</Button>
		</form>
		<form method="POST" action="?/reevaluate">
			<input type="hidden" name="id" value={row.id} />
			<Button type="submit" size="sm" variant="ghost">Re-eval</Button>
		</form>
		<Button size="sm" variant="primary" disabled={!row.canBuy} onclick={() => onbuy(row)}>Buy</Button>
		<Button size="sm" variant="danger" onclick={() => ondelete(row)}>Delete</Button>
	</div>
</td>
