import { describe, expect, it } from 'bun:test';
import { computeLiquidityScore, floatFitScore } from '$lib/server/tradeups/evaluation/scoring';

describe('scoring', () => {
  it('scores float fit at safe core, band edge, and out-of-band points', () => {
    expect(floatFitScore(0.5, 0, 1)).toBe(1);
    expect(floatFitScore(0, 0, 1)).toBe(0.5);
    expect(floatFitScore(1.1, 0, 1)).toBe(0);
  });

  it('uses the cold-start liquidity fallback before saturating at 10 observations', () => {
    const args = { marketHashName: 'Input Skin', collection: 'Alpha Collection', rarity: 'MIL_SPEC' };

    expect(computeLiquidityScore(args)).toBe(0.5);
    expect(computeLiquidityScore(args, { observationCount: 0 })).toBe(0.5);
    expect(computeLiquidityScore(args, { observationCount: 10 })).toBe(1);
  });
});
