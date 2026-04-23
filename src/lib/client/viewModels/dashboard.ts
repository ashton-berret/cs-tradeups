import type { ActivityEntry, EvRealizedPoint, PlanPerformanceRow } from '$lib/types/services';
import type { EChartsOption } from 'echarts';
import { baseChartOption, chartPalette } from '$lib/components/charts/theme';

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

export function toEvRealizedSeries(points: EvRealizedPoint[]): EChartsOption {
	return {
		...baseChartOption(),
		legend: {
			top: 0,
			textStyle: { color: chartPalette.text }
		},
		xAxis: {
			type: 'category',
			boundaryGap: false,
			data: points.map((point) => new Date(point.executedAt).toLocaleDateString()),
			axisLabel: { color: chartPalette.text },
			axisLine: { lineStyle: { color: chartPalette.border } },
			axisTick: { show: false }
		},
		yAxis: {
			type: 'value',
			axisLabel: { color: chartPalette.text },
			splitLine: { lineStyle: { color: chartPalette.border } }
		},
		series: [
			{
				name: 'Expected',
				type: 'line',
				smooth: true,
				connectNulls: false,
				data: points.map((point) => point.expectedProfit),
				symbolSize: 6
			},
			{
				name: 'Realized',
				type: 'line',
				smooth: true,
				connectNulls: false,
				data: points.map((point) => point.realizedProfit),
				symbolSize: 6
			}
		]
	};
}

export function toPlanPerformanceBars(rows: PlanPerformanceRow[]): EChartsOption {
	return {
		...baseChartOption(),
		legend: {
			top: 0,
			textStyle: { color: chartPalette.text }
		},
		xAxis: {
			type: 'value',
			axisLabel: { color: chartPalette.text },
			splitLine: { lineStyle: { color: chartPalette.border } }
		},
		yAxis: {
			type: 'category',
			inverse: true,
			data: rows.map((row) => row.planName),
			axisLabel: { color: chartPalette.text },
			axisLine: { lineStyle: { color: chartPalette.border } },
			axisTick: { show: false }
		},
		series: [
			{
				name: 'Avg expected',
				type: 'bar',
				data: rows.map((row) => row.avgExpectedProfit),
				itemStyle: { color: chartPalette.barExpected }
			},
			{
				name: 'Avg realized',
				type: 'bar',
				data: rows.map((row) => row.avgRealizedProfit),
				itemStyle: { color: chartPalette.barRealized }
			}
		]
	};
}

function currency(value: number) {
	return new Intl.NumberFormat('en-US', {
		style: 'currency',
		currency: 'USD',
		maximumFractionDigits: 2
	}).format(value);
}
