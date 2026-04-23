import { describe, expect, it } from 'bun:test';
import { deriveRecommendation } from '$lib/server/tradeups/evaluation/recommendation';
import { recommendationPlan, statuses } from '../helpers/factories';

describe('recommendation', () => {
  it('preserves a user-pinned status across re-evaluation', () => {
    const result = deriveRecommendation({
      plan: recommendationPlan(),
      expectedProfit: 10,
      expectedProfitPct: 50,
      qualityScore: 1,
      liquidityScore: 1,
      previousStatus: statuses.watching,
      previousPinnedByUser: true,
    });

    expect(result).toBe('WATCHING');
  });

  it('uses a per-plan composite floor to move weak matches into WATCHING', () => {
    const result = deriveRecommendation({
      plan: recommendationPlan({ minCompositeScore: 0.7 }),
      expectedProfit: 10,
      expectedProfitPct: 50,
      qualityScore: 0.8,
      liquidityScore: 0.75,
      previousStatus: statuses.watching,
      previousPinnedByUser: false,
    });

    expect(result).toBe('WATCHING');
  });

  it('does not overwrite BOUGHT or DUPLICATE statuses', () => {
    for (const status of [statuses.bought, statuses.duplicate]) {
      expect(
        deriveRecommendation({
          plan: null,
          expectedProfit: null,
          expectedProfitPct: null,
          qualityScore: 0,
          liquidityScore: 0,
          previousStatus: status,
          previousPinnedByUser: false,
        }),
      ).toBe(status);
    }
  });
});
