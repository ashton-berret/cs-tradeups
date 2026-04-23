<script lang="ts">
	import Button from '$lib/components/Button.svelte';
	import FloatValue from '$lib/components/FloatValue.svelte';
	import Money from '$lib/components/Money.svelte';
	import Percent from '$lib/components/Percent.svelte';
	import StatusBadge from '$lib/components/StatusBadge.svelte';
	import type { CandidateRowVM } from '$lib/client/viewModels/candidates';

	type Props = {
		row: CandidateRowVM;
		checked?: boolean;
		onselect?: (id: string, checked: boolean) => void;
		ondetail: (row: CandidateRowVM) => void;
		onbuy: (row: CandidateRowVM) => void;
		ondelete: (row: CandidateRowVM) => void;
	};

	let { row, checked = false, onselect, ondetail, onbuy, ondelete }: Props = $props();
</script>

<td class="px-4 py-3 align-top">
	<input
		type="checkbox"
		checked={checked}
		aria-label="Select {row.marketHashName}"
		onchange={(event) => onselect?.(row.id, (event.target as HTMLInputElement).checked)}
	/>
</td>
<td class="px-4 py-3">
	<div class="flex items-center gap-2">
		<span class="font-medium text-[var(--color-text-primary)]">{row.marketHashName}</span>
		{#if row.pinnedByUser}
			<span class="rounded bg-[var(--color-primary)]/15 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-[var(--color-primary)]" title="Pinned by user — engine re-evaluations will not change the status.">Pinned</span>
		{/if}
	</div>
	<div class="mt-1 text-xs text-[var(--color-text-muted)]">
		{row.rarityLabel} · {row.exteriorLabel} · {row.stalenessLabel} · {row.evaluationAgeLabel}
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
	{#if row.marginalBasketValue != null}
		<span
			class="text-sm font-medium"
			class:text-[var(--color-success)]={row.marginalBasketValue > 0}
			class:text-[var(--color-danger)]={row.marginalBasketValue < 0}
		>
			<Money value={row.marginalBasketValue} />
		</span>
	{:else}
		<span class="text-xs text-[var(--color-text-muted)]" title="No in-progress basket for the matched plan.">—</span>
	{/if}
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
		{#if row.pinnedByUser}
			<form method="POST" action="?/unpin">
				<input type="hidden" name="id" value={row.id} />
				<Button type="submit" size="sm" variant="ghost">Unpin</Button>
			</form>
		{/if}
		<Button size="sm" variant="primary" disabled={!row.canBuy} onclick={() => onbuy(row)}>Buy</Button>
		<Button size="sm" variant="danger" onclick={() => ondelete(row)}>Delete</Button>
	</div>
</td>
