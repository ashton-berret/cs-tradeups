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
import { exteriorForFloat } from '$lib/server/utils/float';
import { exteriorFromLabel, parseMarketHashName } from '$lib/server/utils/marketHash';

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
  const explicitExterior = payload.exterior ?? parsedExterior;
  const suspiciousZeroFloat =
    payload.floatValue === 0 && explicitExterior != null && explicitExterior !== 'FACTORY_NEW';
  const normalizedFloatValue = suspiciousZeroFloat ? undefined : payload.floatValue;
  const floatExterior = normalizedFloatValue != null ? exteriorForFloat(normalizedFloatValue) : undefined;

  if (!payload.weaponName && !parsed.weaponName) {
    warnings.push({ field: 'weaponName', reason: 'Unable to infer weapon from marketHashName' });
  }

  if (!payload.skinName && !parsed.skinName) {
    warnings.push({ field: 'skinName', reason: 'Unable to infer skin from marketHashName' });
  }

  if (!payload.exterior && !parsedExterior && normalizedFloatValue == null) {
    warnings.push({ field: 'exterior', reason: 'Missing exterior and floatValue' });
  }

  if (suspiciousZeroFloat) {
    warnings.push({
      field: 'floatValue',
      reason: `Dropped placeholder zero float because exterior ${explicitExterior} is not FACTORY_NEW`,
    });
  }

  if (payload.exterior && parsedExterior && payload.exterior !== parsedExterior) {
    warnings.push({
      field: 'exterior',
      reason: `Payload exterior ${payload.exterior} conflicts with marketHashName exterior ${parsedExterior}`,
    });
  }

  if (payload.exterior && floatExterior && payload.exterior !== floatExterior) {
    warnings.push({
      field: 'exterior',
      reason: `Payload exterior ${payload.exterior} conflicts with floatValue-derived exterior ${floatExterior}`,
    });
  }

  if (!payload.exterior && parsedExterior && floatExterior && parsedExterior !== floatExterior) {
    warnings.push({
      field: 'exterior',
      reason: `marketHashName exterior ${parsedExterior} conflicts with floatValue-derived exterior ${floatExterior}`,
    });
  }

  if (payload.minFloat != null && payload.maxFloat != null && payload.minFloat > payload.maxFloat) {
    warnings.push({ field: 'floatRange', reason: 'minFloat is greater than maxFloat' });
  }

  if (
    normalizedFloatValue != null &&
    payload.minFloat != null &&
    normalizedFloatValue < payload.minFloat
  ) {
    warnings.push({ field: 'floatValue', reason: 'floatValue is below payload minFloat' });
  }

  if (
    normalizedFloatValue != null &&
    payload.maxFloat != null &&
    normalizedFloatValue > payload.maxFloat
  ) {
    warnings.push({ field: 'floatValue', reason: 'floatValue is above payload maxFloat' });
  }

  const input: CreateCandidateInput = {
    marketHashName,
    weaponName: cleanOptional(payload.weaponName) ?? parsed.weaponName,
    skinName: cleanOptional(payload.skinName) ?? parsed.skinName,
    collection: cleanOptional(payload.collection),
    rarity: payload.rarity,
    exterior: payload.exterior ?? parsedExterior ?? floatExterior,
    floatValue: normalizedFloatValue,
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
function cleanOptional(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}
