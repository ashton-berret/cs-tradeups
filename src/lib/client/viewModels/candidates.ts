import type { CandidateFilter } from '$lib/types/domain';
import type { CandidateDTO, PlanDTO, StalenessLevel } from '$lib/types/services';
import { EXTERIOR_LABELS, RARITY_LABELS } from '$lib/types/enums';

export type CandidateRowVM = CandidateDTO & {
	matchedPlanName: string | null;
	canBuy: boolean;
	stalenessLabel: string;
	rarityLabel: string;
	exteriorLabel: string;
};

const stalenessLabels: Record<StalenessLevel, string> = {
	FRESH: 'Fresh',
	RECENT: 'Recent',
	STALE: 'Stale',
	COLD: 'Cold'
};

export function toCandidateRows(candidates: CandidateDTO[], activePlans: PlanDTO[]): CandidateRowVM[] {
	const planNames = new Map(activePlans.map((plan) => [plan.id, plan.name]));

	return candidates.map((candidate) => ({
		...candidate,
		matchedPlanName: candidate.matchedPlanId ? (planNames.get(candidate.matchedPlanId) ?? null) : null,
		canBuy: candidate.status !== 'BOUGHT' && candidate.status !== 'INVALID',
		stalenessLabel: stalenessLabels[candidate.staleness],
		rarityLabel: candidate.rarity ? RARITY_LABELS[candidate.rarity] : '—',
		exteriorLabel: candidate.exterior ? EXTERIOR_LABELS[candidate.exterior] : '—'
	}));
}

export function hasCandidateFilters(filter: CandidateFilter): boolean {
	return Boolean(
		filter.status ||
			filter.collection ||
			filter.rarity ||
			filter.exterior ||
			filter.minFloat != null ||
			filter.maxFloat != null ||
			filter.minPrice != null ||
			filter.maxPrice != null ||
			filter.search
	);
}
