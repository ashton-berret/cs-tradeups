import { describe, expect, it } from 'bun:test';
import { basketReadinessIssues } from '$lib/server/tradeups/evaluation/readiness';
import { rule, slot } from '../helpers/factories';

describe('basket readiness', () => {
  it('accepts 10 items that match plan rarity and a rule band', () => {
    const slots = Array.from({ length: 10 }, (_, index) => slot({ inventoryItemId: `item-${index}` }));

    expect(basketReadinessIssues('MIL_SPEC', [rule()], slots)).toEqual([]);
  });

  it('reports a missing slot issue for a 9-item basket', () => {
    const slots = Array.from({ length: 9 }, (_, index) => slot({ inventoryItemId: `item-${index}` }));

    expect(basketReadinessIssues('MIL_SPEC', [rule()], slots)).toContainEqual({ code: 'ITEM_COUNT', actual: 9 });
  });

  it('reports a rarity issue when an item has the wrong rarity', () => {
    const slots = Array.from({ length: 10 }, (_, index) =>
      slot({ inventoryItemId: `item-${index}`, rarity: index === 0 ? 'INDUSTRIAL_GRADE' : 'MIL_SPEC' }),
    );

    expect(basketReadinessIssues('MIL_SPEC', [rule()], slots)).toContainEqual({
      code: 'RARITY_MISMATCH',
      expected: 'MIL_SPEC',
      actual: 'INDUSTRIAL_GRADE',
    });
  });

  it('reports a rule mismatch when an item float is outside every rule band', () => {
    const slots = Array.from({ length: 10 }, (_, index) =>
      slot({ inventoryItemId: `item-${index}`, floatValue: index === 0 ? 0.35 : 0.1 }),
    );

    expect(basketReadinessIssues('MIL_SPEC', [rule({ minFloat: 0, maxFloat: 0.2 })], slots)).toContainEqual({
      code: 'RULE_MISMATCH',
      itemId: 'item-0',
    });
  });
});
