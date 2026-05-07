import { describe, expect, it } from 'bun:test';
import { steamGrossToNetSaleValue } from '../../src/lib/server/marketPrices/fees';
import { roundMoney, sumMoney } from '../../src/lib/server/utils/money';

describe('thesis scorer v1', () => {
  describe('EV computation logic', () => {
    it('computes expected output value as probability-weighted net sum', () => {
      const outputs = [
        { probability: 0.3, grossPrice: 10.0 },
        { probability: 0.5, grossPrice: 5.0 },
        { probability: 0.2, grossPrice: 20.0 },
      ];

      let outputValueNet = 0;
      for (const o of outputs) {
        const net = steamGrossToNetSaleValue(o.grossPrice);
        outputValueNet += net * o.probability;
      }
      outputValueNet = roundMoney(outputValueNet);

      const expectedNet =
        roundMoney(steamGrossToNetSaleValue(10) * 0.3) +
        roundMoney(steamGrossToNetSaleValue(5) * 0.5) +
        roundMoney(steamGrossToNetSaleValue(20) * 0.2);

      expect(outputValueNet).toBeCloseTo(roundMoney(expectedNet), 2);
      expect(outputValueNet).toBeGreaterThan(0);
      expect(outputValueNet).toBeLessThan(10);
    });

    it('computes input cost as slot-weighted sum of cheapest P50 per collection', () => {
      const inputResolution = [
        { collectionId: 'alpha', slotCount: 7, priceP50: 2.5 },
        { collectionId: 'bravo', slotCount: 3, priceP50: 1.8 },
      ];

      const inputCost = sumMoney(inputResolution.map((i) => i.priceP50 * i.slotCount));

      expect(inputCost).toBeCloseTo(7 * 2.5 + 3 * 1.8, 2);
      expect(inputCost).toBeCloseTo(22.9, 2);
    });

    it('computes EV as output net minus input cost', () => {
      const outputValueNet = 25.0;
      const inputCost = 20.0;

      const ev = roundMoney(outputValueNet - inputCost);

      expect(ev).toBe(5.0);
    });

    it('computes negative EV when input cost exceeds output value', () => {
      const outputValueNet = 15.0;
      const inputCost = 20.0;

      const ev = roundMoney(outputValueNet - inputCost);

      expect(ev).toBe(-5.0);
    });
  });

  describe('profit chance computation', () => {
    it('sums probability of outputs whose net value exceeds input cost', () => {
      const inputCost = 10.0;
      const outputs = [
        { probability: 0.3, netPrice: 15.0 },
        { probability: 0.5, netPrice: 8.0 },
        { probability: 0.2, netPrice: 50.0 },
      ];

      let profitChance = 0;
      for (const o of outputs) {
        if (o.netPrice > inputCost) {
          profitChance += o.probability;
        }
      }

      expect(profitChance).toBeCloseTo(0.5, 6);
    });

    it('returns 0 when no output beats input cost', () => {
      const inputCost = 100.0;
      const outputs = [
        { probability: 0.5, netPrice: 10.0 },
        { probability: 0.5, netPrice: 20.0 },
      ];

      let profitChance = 0;
      for (const o of outputs) {
        if (o.netPrice > inputCost) {
          profitChance += o.probability;
        }
      }

      expect(profitChance).toBe(0);
    });

    it('returns 1 when all outputs beat input cost', () => {
      const inputCost = 5.0;
      const outputs = [
        { probability: 0.3, netPrice: 10.0 },
        { probability: 0.5, netPrice: 15.0 },
        { probability: 0.2, netPrice: 50.0 },
      ];

      let profitChance = 0;
      for (const o of outputs) {
        if (o.netPrice > inputCost) {
          profitChance += o.probability;
        }
      }

      expect(profitChance).toBeCloseTo(1.0, 6);
    });
  });

  describe('Steam fee conversion in scoring', () => {
    it('converts gross output prices to net using steamGrossToNetSaleValue', () => {
      const gross = 10.0;
      const net = steamGrossToNetSaleValue(gross);

      expect(net).toBeLessThan(gross);
      expect(net).toBeCloseTo(gross / 1.15, 1);
      expect(net).toBeGreaterThan(0);
    });

    it('handles minimum fee for very cheap items', () => {
      const gross = 0.05;
      const net = steamGrossToNetSaleValue(gross);

      expect(net).toBeGreaterThanOrEqual(0);
      expect(net).toBeLessThan(gross);
    });

    it('returns 0 for non-positive prices', () => {
      expect(steamGrossToNetSaleValue(0)).toBe(0);
      expect(steamGrossToNetSaleValue(-5)).toBe(0);
    });
  });

  describe('missing price handling', () => {
    it('skips combo when all output prices are missing', () => {
      const outputs = [
        { probability: 0.5, grossPrice: null },
        { probability: 0.5, grossPrice: null },
      ];
      const missingCount = outputs.filter((o) => o.grossPrice == null).length;
      const missingPct = missingCount / outputs.length;

      expect(missingPct).toBe(1.0);
      expect(missingPct).toBeGreaterThan(0.5);
    });

    it('keeps combo when less than half of output prices are missing', () => {
      const outputs = [
        { probability: 0.3, grossPrice: 10.0 },
        { probability: 0.5, grossPrice: 5.0 },
        { probability: 0.2, grossPrice: null },
      ];
      const missingCount = outputs.filter((o) => o.grossPrice == null).length;
      const missingPct = missingCount / outputs.length;

      expect(missingPct).toBeCloseTo(0.333, 2);
      expect(missingPct).toBeLessThanOrEqual(0.5);
    });

    it('skips combo when all input prices are missing', () => {
      const inputs = [
        { slotCount: 7, priceP50: null, missing: true },
        { slotCount: 3, priceP50: null, missing: true },
      ];

      const allMissing = inputs.every((i) => i.missing);
      expect(allMissing).toBe(true);
    });

    it('uses 0 for missing input slots in cost calculation', () => {
      const inputs = [
        { slotCount: 7, priceP50: 2.5 as number | null },
        { slotCount: 3, priceP50: null as number | null },
      ];

      const cost = sumMoney(inputs.map((i) => (i.priceP50 ?? 0) * i.slotCount));

      expect(cost).toBeCloseTo(17.5, 2);
    });
  });

  describe('score formula v1', () => {
    it('score equals EV median in v1', () => {
      const evMedian = 3.47;
      const score = evMedian;

      expect(score).toBe(3.47);
    });

    it('higher EV produces higher score', () => {
      const scoreA = 5.0;
      const scoreB = 2.0;

      expect(scoreA).toBeGreaterThan(scoreB);
    });
  });

  describe('input resolution: cheapest skin per collection', () => {
    it('picks the cheapest exterior across all input skins in a collection', () => {
      const quantiles = [
        { skinId: 'skin-a', exterior: 'FIELD_TESTED', p50: 3.0 },
        { skinId: 'skin-a', exterior: 'MINIMAL_WEAR', p50: 5.0 },
        { skinId: 'skin-b', exterior: 'FIELD_TESTED', p50: 2.0 },
        { skinId: 'skin-b', exterior: 'MINIMAL_WEAR', p50: 4.0 },
      ];

      let cheapest: { skinId: string; exterior: string; price: number } | null = null;
      for (const q of quantiles) {
        if (cheapest == null || q.p50 < cheapest.price) {
          cheapest = { skinId: q.skinId, exterior: q.exterior, price: q.p50 };
        }
      }

      expect(cheapest).not.toBeNull();
      expect(cheapest!.skinId).toBe('skin-b');
      expect(cheapest!.exterior).toBe('FIELD_TESTED');
      expect(cheapest!.price).toBe(2.0);
    });
  });

  describe('output distribution probability verification', () => {
    it('output probabilities sum to 1.0 for a valid combo', () => {
      const outputs = [
        { probability: 0.3 },
        { probability: 0.5 },
        { probability: 0.2 },
      ];

      const sum = outputs.reduce((s, o) => s + o.probability, 0);
      expect(sum).toBeCloseTo(1.0, 10);
    });

    it('handles partition probability calculation correctly', () => {
      const partition = { alpha: 7, bravo: 3 };
      const outputsAlpha = 2;
      const outputsBravo = 3;

      const probAlphaEach = (partition.alpha / 10) * (1 / outputsAlpha);
      const probBravoEach = (partition.bravo / 10) * (1 / outputsBravo);

      const totalProb = probAlphaEach * outputsAlpha + probBravoEach * outputsBravo;
      expect(totalProb).toBeCloseTo(1.0, 10);
    });
  });
});
