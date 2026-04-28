<script lang="ts">
	import BarChart from '$lib/components/charts/BarChart.svelte';
	import LineChart from '$lib/components/charts/LineChart.svelte';
	import DataTable from '$lib/components/DataTable.svelte';
	import Money from '$lib/components/Money.svelte';
	import {
		evDelta,
		planDelta,
		toDashboardKpis,
		toEvRealizedSeries,
		toNetWorthSeries,
		toPlanPerformanceBars
	} from '$lib/client/viewModels/dashboard';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();
	const kpis = $derived(toDashboardKpis(data.summary));
	const evRealizedOption = $derived(toEvRealizedSeries(data.evRealized));
	const planPerformanceOption = $derived(toPlanPerformanceBars(data.planPerformance));
	const netWorthOption = $derived(toNetWorthSeries(data.netWorth));
	const planChartHeight = $derived(`${Math.max(280, data.planPerformance.length * 54 + 90)}px`);
	const latestNetWorth = $derived(data.netWorth.at(-1) ?? null);
</script>

<div class="space-y-6">
	<div>
		<h1 class="text-2xl font-semibold text-[var(--color-text-primary)]">Dashboard</h1>
		<p class="mt-1 text-sm text-[var(--color-text-secondary)]">
			Current workflow health, activity, and plan performance.
		</p>
	</div>

	<section class="card-accent rounded-xl border p-5 shadow-sm">
		<div class="flex flex-wrap items-end justify-between gap-3">
			<div>
				<div class="text-[10px] font-semibold uppercase tracking-wider text-[var(--color-text-muted)]">
					Inventory net worth
				</div>
				{#if latestNetWorth}
					<div class="mt-1 flex items-baseline gap-3">
						<span class="text-3xl font-semibold tabular-nums text-[var(--color-text-primary)]">
							<Money value={latestNetWorth.estValue} />
						</span>
						<span class="text-sm text-[var(--color-text-secondary)]">
							est. value · cost basis <Money value={latestNetWorth.costBasis} />
						</span>
					</div>
				{:else}
					<div class="mt-1 text-sm text-[var(--color-text-muted)]">
						No inventory yet — buy a candidate to start the chart.
					</div>
				{/if}
			</div>
		</div>
		{#if data.netWorth.length > 1}
			<div class="mt-4">
				<LineChart option={netWorthOption} height="220px" />
			</div>
		{/if}
	</section>

	<section class="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
		{#each kpis as kpi}
			<div class="group relative overflow-hidden rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-surface-elevated)] p-5 shadow-sm transition-all duration-200 hover:border-[var(--color-border-hover)] hover:shadow-[0_8px_20px_-12px_rgba(0,0,0,0.5)]">
				<div class="pointer-events-none absolute left-0 top-0 h-full w-1 bg-gradient-to-b from-[var(--color-primary)] to-[var(--color-secondary)] opacity-60 transition-opacity group-hover:opacity-100"></div>
				<div class="pl-2">
					<div class="text-[10px] font-semibold uppercase tracking-wider text-[var(--color-text-muted)]">{kpi.label}</div>
					<div class="mt-2 text-3xl font-semibold tabular-nums text-[var(--color-text-primary)]">{kpi.value}</div>
					<div class="mt-1 text-xs text-[var(--color-text-muted)]">{kpi.help}</div>
				</div>
			</div>
		{/each}
	</section>

	<section class="space-y-3">
		<div class="flex flex-wrap items-center justify-between gap-2">
			<h2 class="section-anchor text-lg font-semibold">Expected vs realized</h2>
			<a
				href="/api/exports/expected-vs-realized.csv"
				class="text-sm font-medium text-[var(--color-text-secondary)] underline hover:text-[var(--color-text-primary)]"
			>
				Export expected vs realized
			</a>
		</div>
		<LineChart option={evRealizedOption} />
		<details class="rounded-md border border-[var(--color-border)] bg-[var(--color-bg-surface)]">
			<summary class="cursor-pointer px-4 py-3 text-sm font-medium text-[var(--color-text-secondary)]">Raw expected vs realized rows</summary>
			<div class="border-t border-[var(--color-border)]">
				<DataTable
					columns={['Executed', 'Plan', 'Expected', 'Realized', 'Delta']}
					rows={data.evRealized}
					emptyTitle="No completed execution sales yet."
					emptyDescription="Record an execution result and sale to compare expected against realized profit."
				>
					{#snippet row(point)}
						<td class="px-4 py-3">{new Date(point.executedAt).toLocaleDateString()}</td>
						<td class="px-4 py-3">{point.planName}</td>
						<td class="px-4 py-3"><Money value={point.expectedProfit} /></td>
						<td class="px-4 py-3"><Money value={point.realizedProfit} /></td>
						<td class="px-4 py-3"><Money value={evDelta(point)} /></td>
					{/snippet}
				</DataTable>
			</div>
		</details>
	</section>

	<section class="space-y-3">
		<h2 class="section-anchor text-lg font-semibold">Plan performance</h2>
		<BarChart option={planPerformanceOption} height={planChartHeight} />
		<details class="rounded-md border border-[var(--color-border)] bg-[var(--color-bg-surface)]">
			<summary class="cursor-pointer px-4 py-3 text-sm font-medium text-[var(--color-text-secondary)]">Raw plan performance rows</summary>
			<div class="border-t border-[var(--color-border)]">
				<DataTable
					columns={['Plan', 'Executions', 'Input cost', 'Realized', 'Realized profit', 'Avg expected', 'Avg realized', 'EV delta']}
					rows={data.planPerformance}
					emptyTitle="No plan performance yet."
					emptyDescription="Plan rollups appear after baskets are executed."
				>
					{#snippet row(plan)}
						<td class="px-4 py-3">{plan.planName}</td>
						<td class="px-4 py-3">{plan.executions}</td>
						<td class="px-4 py-3"><Money value={plan.totalInputCost} /></td>
						<td class="px-4 py-3"><Money value={plan.totalRealized} /></td>
						<td class="px-4 py-3"><Money value={plan.totalRealizedProfit} /></td>
						<td class="px-4 py-3"><Money value={plan.avgExpectedProfit} /></td>
						<td class="px-4 py-3"><Money value={plan.avgRealizedProfit} /></td>
						<td class="px-4 py-3"><Money value={planDelta(plan)} /></td>
					{/snippet}
				</DataTable>
			</div>
		</details>
	</section>
</div>
