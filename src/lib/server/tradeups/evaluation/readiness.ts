import type { TradeupPlanRule } from '@prisma/client';
import type { BasketReadinessIssue } from '$lib/types/services';
import type { ItemRarity } from '$lib/types/enums';
import type { BasketSlotContext } from './expectedValue';
import { isWithinFloatRange } from '$lib/server/utils/float';

type ReadinessRule = Pick<
  TradeupPlanRule,
  'collection' | 'rarity' | 'exterior' | 'minFloat' | 'maxFloat'
>;

export function basketReadinessIssues(
  expectedRarity: ItemRarity,
  rules: ReadinessRule[],
  slots: BasketSlotContext[],
): BasketReadinessIssue[] {
  const issues: BasketReadinessIssue[] = [];

  if (slots.length !== 10) {
    issues.push({ code: 'ITEM_COUNT', actual: slots.length });
  }

  const rarities = Array.from(new Set(slots.map((slot) => slot.rarity).filter(Boolean))) as ItemRarity[];
  if (rarities.length > 1) {
    issues.push({ code: 'MIXED_RARITY', rarities });
  }

  for (const rarity of rarities) {
    if (rarity !== expectedRarity) {
      issues.push({ code: 'RARITY_MISMATCH', expected: expectedRarity, actual: rarity });
    }
  }

  for (const slot of slots) {
    if (slot.floatValue == null) {
      issues.push({ code: 'MISSING_FLOAT', itemId: slot.inventoryItemId });
    }

    if (!slot.collection) {
      issues.push({ code: 'MISSING_COLLECTION', itemId: slot.inventoryItemId });
    }

    if (slot.rarity === expectedRarity && slot.floatValue != null && slot.collection && !matchesAnyRule(slot, rules)) {
      issues.push({ code: 'RULE_MISMATCH', itemId: slot.inventoryItemId });
    }
  }

  return issues;
}

function matchesAnyRule(slot: BasketSlotContext, rules: ReadinessRule[]): boolean {
  if (rules.length === 0) {
    return true;
  }

  return rules.some((rule) => {
    if (rule.rarity && slot.rarity !== rule.rarity) {
      return false;
    }

    if (rule.collection && slot.collection !== rule.collection) {
      return false;
    }

    if (rule.exterior && slot.exterior !== rule.exterior) {
      return false;
    }

    if ((rule.minFloat != null || rule.maxFloat != null) && slot.floatValue == null) {
      return false;
    }

    return isWithinFloatRange(slot.floatValue ?? Number.NaN, rule.minFloat, rule.maxFloat);
  });
}
