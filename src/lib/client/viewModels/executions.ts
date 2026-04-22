import type { ExecutionFilter } from '$lib/types/domain';
import type { ExecutionDTO } from '$lib/types/services';

export type ExecutionRowVM = ExecutionDTO & {
	stage: 'PENDING_RESULT' | 'PENDING_SALE' | 'COMPLETE';
	expectedProfit: number | null;
	expectedVsRealizedDelta: number | null;
};

export function toExecutionRows(executions: ExecutionDTO[]): ExecutionRowVM[] {
	return executions.map((execution) => {
		const expectedProfit =
			execution.expectedEV == null ? null : Number((execution.expectedEV - execution.inputCost).toFixed(2));
		const stage =
			execution.resultMarketHashName == null
				? 'PENDING_RESULT'
				: execution.salePrice == null
					? 'PENDING_SALE'
					: 'COMPLETE';
		return {
			...execution,
			stage,
			expectedProfit,
			expectedVsRealizedDelta:
				expectedProfit == null || execution.realizedProfit == null
					? null
					: Number((expectedProfit - execution.realizedProfit).toFixed(2))
		};
	});
}

export function hasExecutionFilters(filter: ExecutionFilter): boolean {
	return Boolean(filter.planId || filter.hasResult != null || filter.hasSale != null);
}
