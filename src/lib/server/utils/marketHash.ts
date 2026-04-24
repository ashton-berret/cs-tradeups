import type { ItemExterior } from '$lib/types/enums';
import { EXTERIOR_LABELS } from '$lib/types/enums';

const QUALITY_PREFIXES = [/^StatTrak™\s+/i, /^Souvenir\s+/i];

export function parseMarketHashName(marketHashName: string): {
	weaponName?: string;
	skinName?: string;
	exteriorLabel?: string;
} {
	const trimmed = marketHashName.trim();
	const match = /^(?<weapon>[^|()]+?)\s*\|\s*(?<skin>[^()]+?)(?:\s*\((?<exterior>[^)]+)\))?$/.exec(trimmed);

	if (!match?.groups) {
		return {};
	}

	return {
		weaponName: normalizeWeaponName(cleanOptional(match.groups.weapon)),
		skinName: cleanOptional(match.groups.skin),
		exteriorLabel: cleanOptional(match.groups.exterior),
	};
}

export function exteriorFromLabel(label: string | undefined): ItemExterior | undefined {
	if (!label) {
		return undefined;
	}

	const normalized = label.toLowerCase().replace(/[-_\s]+/g, ' ');

	return (Object.entries(EXTERIOR_LABELS) as Array<[ItemExterior, string]>).find(
		([key, value]) =>
			value.toLowerCase().replace(/[-_\s]+/g, ' ') === normalized ||
			key.toLowerCase().replace(/_/g, ' ') === normalized,
	)?.[0];
}

export function normalizeWeaponName(value: string | undefined): string | undefined {
	if (!value) {
		return undefined;
	}

	let normalized = value.trim();
	for (const pattern of QUALITY_PREFIXES) {
		normalized = normalized.replace(pattern, '');
	}

	return normalized || undefined;
}

export function normalizeMarketHashLookup(value: string): string {
	return value.trim().replace(/\s+/g, ' ').toLowerCase();
}

function cleanOptional(value: string | undefined): string | undefined {
	const trimmed = value?.trim();
	return trimmed ? trimmed : undefined;
}
