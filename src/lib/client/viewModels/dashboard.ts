import type { ActivityEntry, EvRealizedPoint, PlanPerformanceRow } from '$lib/types/services';

export interface AnalyticsSummaryDTO {
	candidateCount: number;
	goodBuyCount: number;
	boughtCount: number;
	inventoryCount: number;
	inventoryCostBasis: number;
	activeBasketsCount: number;
	readyBasketsCount: number;
	executionCount: number;
	totalRealizedProfit: number;
	avgExpectedProfit: number;
}

export type DashboardKpi = {
	label: string;
	value: string;
	help: string;
};

export function toDashboardKpis(summary: AnalyticsSummaryDTO): DashboardKpi[] {
	return [
		{ label: 'Open candidates', value: String(summary.candidateCount), help: `${summary.goodBuyCount} good buys` },
		{ label: 'Bought candidates', value: String(summary.boughtCount), help: 'Converted to inventory' },
		{ label: 'Active inventory', value: String(summary.inventoryCount), help: currency(summary.inventoryCostBasis) },
		{ label: 'Active baskets', value: String(summary.activeBasketsCount), help: `${summary.readyBasketsCount} ready` },
		{ label: 'Executions', value: String(summary.executionCount), help: 'Lifetime contracts' },
		{ label: 'Realized profit', value: currency(summary.totalRealizedProfit), help: `Avg expected ${currency(summary.avgExpectedProfit)}` }
	];
}

export function activityLabel(entry: ActivityEntry): string {
	return entry.kind.replaceAll('_', ' ').toLowerCase();
}

export function evDelta(point: EvRealizedPoint): number | null {
	if (point.expectedProfit == null || point.realizedProfit == null) return null;
	return Number((point.expectedProfit - point.realizedProfit).toFixed(2));
}

export function planDelta(row: PlanPerformanceRow): number | null {
	return row.evRealizedDelta == null ? null : Number(row.evRealizedDelta.toFixed(2));
}

function currency(value: number) {
	return new Intl.NumberFormat('en-US', {
		style: 'currency',
		currency: 'USD',
		maximumFractionDigits: 2
	}).format(value);
}
