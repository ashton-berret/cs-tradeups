import type { PlanFilter } from '$lib/types/domain';
import type { PlanDTO } from '$lib/types/services';
import { RARITY_LABELS } from '$lib/types/enums';

export type PlanCardVM = {
	plan: PlanDTO;
	ruleCount: number;
	outcomeCount: number;
	totalProbabilityWeight: number;
	isCompositionValid: boolean;
	inputRarityLabel: string;
	targetRarityLabel: string;
};

export function toPlanCards(plans: PlanDTO[]): PlanCardVM[] {
	return plans.map((plan) => {
		const totalProbabilityWeight = plan.outcomeItems.reduce(
			(total, outcome) => total + outcome.probabilityWeight,
			0
		);
		const requiredSlots = plan.rules.reduce((total, rule) => total + (rule.minQuantity ?? 0), 0);

		return {
			plan,
			ruleCount: plan.rules.length,
			outcomeCount: plan.outcomeItems.length,
			totalProbabilityWeight,
			isCompositionValid: totalProbabilityWeight > 0 && (requiredSlots === 0 || requiredSlots === 10),
			inputRarityLabel: RARITY_LABELS[plan.inputRarity],
			targetRarityLabel: RARITY_LABELS[plan.targetRarity]
		};
	});
}

export function hasPlanFilters(filter: PlanFilter): boolean {
	return Boolean(filter.isActive != null || filter.inputRarity || filter.targetRarity || filter.search);
}
