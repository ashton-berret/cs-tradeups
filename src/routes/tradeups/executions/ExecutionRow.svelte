<script lang="ts">
	import Button from '$lib/components/Button.svelte';
	import Money from '$lib/components/Money.svelte';
	import StatusBadge from '$lib/components/StatusBadge.svelte';
	import type { ExecutionRowVM } from '$lib/client/viewModels/executions';

	type Props = {
		row: ExecutionRowVM;
		onresult: (row: ExecutionRowVM) => void;
		onsale: (row: ExecutionRowVM) => void;
	};

	let { row, onresult, onsale }: Props = $props();
</script>

<td class="px-4 py-3">
	<div class="font-medium text-[var(--color-text-primary)]">{new Date(row.executedAt).toLocaleDateString()}</div>
	<div class="mt-1 text-xs text-[var(--color-text-muted)]">{row.id}</div>
</td>
<td class="px-4 py-3"><StatusBadge status={row.stage} /></td>
<td class="px-4 py-3"><Money value={row.inputCost} /></td>
<td class="px-4 py-3"><Money value={row.expectedProfit} /></td>
<td class="px-4 py-3">{row.resultMarketHashName ?? '—'}</td>
<td class="px-4 py-3"><Money value={row.realizedProfit} /></td>
<td class="px-4 py-3"><Money value={row.expectedVsRealizedDelta} /></td>
<td class="px-4 py-3">
	<div class="flex flex-wrap gap-2">
		<Button size="sm" variant="secondary" onclick={() => onresult(row)}>Result</Button>
		<Button size="sm" variant="secondary" disabled={!row.resultMarketHashName} onclick={() => onsale(row)}>Sale</Button>
	</div>
</td>
