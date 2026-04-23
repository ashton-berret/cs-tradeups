import type { BasketFilter } from '$lib/types/domain';
import type { BasketDTO, InventoryItemDTO, PlanDTO } from '$lib/types/services';

export type BasketCardVM = {
	basket: BasketDTO;
	plan: PlanDTO | null;
	planName: string;
	slotsFilled: number;
	readinessLabel: BasketDTO['status'];
	profitBadge: 'GOOD' | 'NEUTRAL' | 'BAD' | 'UNKNOWN';
};

export function toBasketCards(baskets: BasketDTO[], activePlans: PlanDTO[]): BasketCardVM[] {
	const plans = new Map(activePlans.map((plan) => [plan.id, plan]));
	return baskets.map((basket) => {
		const profit = basket.expectedProfitPct;
		return {
			basket,
			plan: plans.get(basket.planId) ?? null,
			planName: plans.get(basket.planId)?.name ?? 'Unknown plan',
			slotsFilled: basket.itemCount,
			readinessLabel: basket.status,
			profitBadge: profit == null ? 'UNKNOWN' : profit > 0 ? 'GOOD' : profit < 0 ? 'BAD' : 'NEUTRAL'
		};
	});
}

export function hasBasketFilters(filter: BasketFilter): boolean {
	return Boolean(filter.status || filter.planId);
}

export function nextEmptySlot(basket: BasketDTO): number | null {
	const used = new Set(basket.items.map((item) => item.slotIndex));
	for (let slot = 0; slot < 10; slot += 1) {
		if (!used.has(slot)) return slot;
	}
	return null;
}

export function emptySlots(basket: BasketDTO): number[] {
	const used = new Set(basket.items.map((item) => item.slotIndex));
	return Array.from({ length: 10 }, (_, slot) => slot).filter((slot) => !used.has(slot));
}

export function eligibleInventoryForPlan(items: InventoryItemDTO[], plan: PlanDTO | null): InventoryItemDTO[] {
	if (!plan) return items;
	return items.filter((item) => {
		if (item.rarity !== plan.inputRarity) return false;
		if (plan.rules.length === 0) return true;
		return plan.rules.some((rule) => {
			if (rule.collection && rule.collection !== item.collection) return false;
			if (rule.rarity && rule.rarity !== item.rarity) return false;
			if (rule.exterior && rule.exterior !== item.exterior) return false;
			if (rule.minFloat != null && (item.floatValue == null || item.floatValue < rule.minFloat)) return false;
			if (rule.maxFloat != null && (item.floatValue == null || item.floatValue > rule.maxFloat)) return false;
			if (rule.maxBuyPrice != null && item.purchasePrice > rule.maxBuyPrice) return false;
			return true;
		});
	});
}
