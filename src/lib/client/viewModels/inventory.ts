import type { InventoryFilter } from '$lib/types/domain';
import type { InventoryItemDTO } from '$lib/types/services';
import { EXTERIOR_LABELS, RARITY_LABELS } from '$lib/types/enums';

export type InventoryRowVM = InventoryItemDTO & {
	ageDays: number;
	unrealizedDelta: number | null;
	rarityLabel: string;
	exteriorLabel: string;
};

export function toInventoryRows(items: InventoryItemDTO[]): InventoryRowVM[] {
	const now = Date.now();

	return items.map((item) => ({
		...item,
		ageDays: Math.max(0, Math.floor((now - new Date(item.purchaseDate).getTime()) / 86_400_000)),
		unrealizedDelta:
			item.currentEstValue == null ? null : Number((item.currentEstValue - item.purchasePrice).toFixed(2)),
		rarityLabel: item.rarity ? RARITY_LABELS[item.rarity] : '—',
		exteriorLabel: item.exterior ? EXTERIOR_LABELS[item.exterior] : '—'
	}));
}

export function hasInventoryFilters(filter: InventoryFilter): boolean {
	return Boolean(
		filter.status ||
			filter.collection ||
			filter.rarity ||
			filter.exterior ||
			filter.availableForBasket ||
			filter.search
	);
}
