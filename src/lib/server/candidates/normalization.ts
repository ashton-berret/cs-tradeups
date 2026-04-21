// Extension payload normalization.
//
// The third-party CS2 Trader extension emits whatever shape it wants. This
// module is the single place the app tolerates that shape — every downstream
// consumer sees the app's canonical `CreateCandidateInput`.
//
// Normalization is best-effort: missing rarity/exterior/collection are OK
// (they will be null on the stored row) but the market hash name, list
// price, and source are required.

import type { CreateCandidateInput, ExtensionCandidateInput } from '$lib/types/domain';
import type { ItemExterior } from '$lib/types/enums';
import { EXTERIOR_LABELS } from '$lib/types/enums';
import { exteriorForFloat } from '$lib/server/utils/float';

export interface NormalizationWarning {
  field: string;
  reason: string;
}

export interface NormalizationResult {
  input: CreateCandidateInput;
  warnings: NormalizationWarning[];
}

/**
 * Convert a validated extension payload into the internal create shape.
 * Infers `exterior` from `floatValue` when missing, leaves rarity/collection
 * null when the extension did not provide them.
 *
 * Throws if the payload is missing the minimum fields required to create a
 * candidate row.
 */
export function normalizeExtensionPayload(
  payload: ExtensionCandidateInput,
): NormalizationResult {
  const warnings: NormalizationWarning[] = [];
  const marketHashName = payload.marketHashName?.trim();

  if (!marketHashName) {
    throw new Error('Extension payload is missing marketHashName');
  }

  if (!Number.isFinite(payload.listPrice)) {
    throw new Error('Extension payload is missing a valid listPrice');
  }

  const parsed = parseMarketHashName(marketHashName);
  const parsedExterior = exteriorFromLabel(parsed.exteriorLabel);
  const floatExterior = payload.floatValue != null ? exteriorForFloat(payload.floatValue) : undefined;

  if (!payload.weaponName && !parsed.weaponName) {
    warnings.push({ field: 'weaponName', reason: 'Unable to infer weapon from marketHashName' });
  }

  if (!payload.skinName && !parsed.skinName) {
    warnings.push({ field: 'skinName', reason: 'Unable to infer skin from marketHashName' });
  }

  if (!payload.exterior && !parsedExterior && payload.floatValue == null) {
    warnings.push({ field: 'exterior', reason: 'Missing exterior and floatValue' });
  }

  const input: CreateCandidateInput = {
    marketHashName,
    weaponName: cleanOptional(payload.weaponName) ?? parsed.weaponName,
    skinName: cleanOptional(payload.skinName) ?? parsed.skinName,
    collection: cleanOptional(payload.collection),
    rarity: payload.rarity,
    exterior: payload.exterior ?? parsedExterior ?? floatExterior,
    floatValue: payload.floatValue,
    pattern: payload.pattern,
    inspectLink: cleanOptional(payload.inspectLink),
    listPrice: payload.listPrice,
    currency: cleanOptional(payload.currency) ?? 'USD',
    listingUrl: cleanOptional(payload.listingUrl),
    listingId: cleanOptional(payload.listingId),
    source: 'EXTENSION',
  };

  return { input, warnings };
}

/**
 * Attempt to split `"AK-47 | Slate (Field-Tested)"` into
 * `{ weaponName: 'AK-47', skinName: 'Slate', exterior: 'FIELD_TESTED' }`.
 * Returns partial fields; missing pieces stay undefined.
 */
export function parseMarketHashName(marketHashName: string): {
  weaponName?: string;
  skinName?: string;
  exteriorLabel?: string;
} {
  const trimmed = marketHashName.trim();
  const match = /^(?<weapon>[^|()]+?)\s*\|\s*(?<skin>[^()]+?)(?:\s*\((?<exterior>[^)]+)\))?$/.exec(
    trimmed,
  );

  if (!match?.groups) {
    return {};
  }

  return {
    weaponName: cleanOptional(match.groups.weapon),
    skinName: cleanOptional(match.groups.skin),
    exteriorLabel: cleanOptional(match.groups.exterior),
  };
}

function cleanOptional(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

function exteriorFromLabel(label: string | undefined): ItemExterior | undefined {
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
