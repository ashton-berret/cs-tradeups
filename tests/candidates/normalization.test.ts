import { describe, expect, it } from 'bun:test';
import { normalizeExtensionPayload } from '$lib/server/candidates/normalization';

describe('extension payload normalization', () => {
  it('warns but accepts contradictory float enrichment metadata', () => {
    const result = normalizeExtensionPayload({
      marketHashName: 'AK-47 | Slate (Field-Tested)',
      listPrice: 1.5,
      floatValue: 0.5,
      exterior: 'FIELD_TESTED',
      minFloat: 0.6,
      maxFloat: 0.4,
      currency: 'USD',
    });

    expect(result.input.marketHashName).toBe('AK-47 | Slate (Field-Tested)');
    expect(result.warnings).toContainEqual({
      field: 'exterior',
      reason: 'Payload exterior FIELD_TESTED conflicts with floatValue-derived exterior BATTLE_SCARRED',
    });
    expect(result.warnings).toContainEqual({
      field: 'floatRange',
      reason: 'minFloat is greater than maxFloat',
    });
    expect(result.warnings).toContainEqual({
      field: 'floatValue',
      reason: 'floatValue is below payload minFloat',
    });
    expect(result.warnings).toContainEqual({
      field: 'floatValue',
      reason: 'floatValue is above payload maxFloat',
    });
  });

  it('warns when the market hash exterior conflicts with the float-derived exterior', () => {
    const result = normalizeExtensionPayload({
      marketHashName: 'AK-47 | Slate (Field-Tested)',
      listPrice: 1.5,
      floatValue: 0.01,
      currency: 'USD',
    });

    expect(result.input.exterior).toBe('FIELD_TESTED');
    expect(result.warnings).toContainEqual({
      field: 'exterior',
      reason: 'marketHashName exterior FIELD_TESTED conflicts with floatValue-derived exterior FACTORY_NEW',
    });
  });

  it('drops placeholder zero floats when the item exterior is not factory new', () => {
    const result = normalizeExtensionPayload({
      marketHashName: 'AK-47 | Slate (Field-Tested)',
      listPrice: 1.5,
      floatValue: 0,
      currency: 'USD',
    });

    expect(result.input.floatValue).toBeUndefined();
    expect(result.input.exterior).toBe('FIELD_TESTED');
    expect(result.warnings).toContainEqual({
      field: 'floatValue',
      reason: 'Dropped placeholder zero float because exterior FIELD_TESTED is not FACTORY_NEW',
    });
  });
});
