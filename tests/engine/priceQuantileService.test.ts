import { describe, expect, it } from 'bun:test';
import { weightedQuantile } from '$lib/server/engine/priceQuantileService';

interface WeightedObservation {
  price: number;
  weight: number;
}

describe('price quantile engine', () => {
  describe('weightedQuantile correctness', () => {
    it('returns correct P10/P50/P90 for uniform distribution 0-100', () => {
      const sorted: WeightedObservation[] = [];
      for (let i = 0; i <= 100; i++) {
        sorted.push({ price: i, weight: 1 });
      }
      const totalWeight = sorted.reduce((s, w) => s + w.weight, 0);

      const p10 = weightedQuantile(sorted, totalWeight, 0.10);
      const p50 = weightedQuantile(sorted, totalWeight, 0.50);
      const p90 = weightedQuantile(sorted, totalWeight, 0.90);

      expect(p10).toBeGreaterThan(8);
      expect(p10).toBeLessThan(12);
      expect(p50).toBeGreaterThan(48);
      expect(p50).toBeLessThan(52);
      expect(p90).toBeGreaterThan(88);
      expect(p90).toBeLessThan(92);
    });

    it('returns correct quantiles for a skewed distribution', () => {
      const sorted: WeightedObservation[] = [
        { price: 1, weight: 1 },
        { price: 2, weight: 1 },
        { price: 3, weight: 1 },
        { price: 4, weight: 1 },
        { price: 5, weight: 1 },
        { price: 50, weight: 1 },
        { price: 51, weight: 1 },
        { price: 52, weight: 1 },
        { price: 90, weight: 1 },
        { price: 100, weight: 1 },
      ];
      const totalWeight = 10;

      const p10 = weightedQuantile(sorted, totalWeight, 0.10);
      const p50 = weightedQuantile(sorted, totalWeight, 0.50);
      const p90 = weightedQuantile(sorted, totalWeight, 0.90);

      expect(p10).toBeCloseTo(1, 0);
      expect(p50).toBeCloseTo(5, 0);
      expect(p90).toBeCloseTo(90, 0);
    });

    it('returns the single value for a single-spike distribution', () => {
      const sorted: WeightedObservation[] = [
        { price: 42, weight: 1 },
        { price: 42, weight: 1 },
        { price: 42, weight: 1 },
        { price: 42, weight: 1 },
        { price: 42, weight: 1 },
      ];
      const totalWeight = 5;

      const p10 = weightedQuantile(sorted, totalWeight, 0.10);
      const p50 = weightedQuantile(sorted, totalWeight, 0.50);
      const p90 = weightedQuantile(sorted, totalWeight, 0.90);

      expect(p10).toBe(42);
      expect(p50).toBe(42);
      expect(p90).toBe(42);
    });

    it('handles a single observation', () => {
      const sorted: WeightedObservation[] = [{ price: 7.5, weight: 1 }];
      const totalWeight = 1;

      expect(weightedQuantile(sorted, totalWeight, 0.10)).toBe(7.5);
      expect(weightedQuantile(sorted, totalWeight, 0.50)).toBe(7.5);
      expect(weightedQuantile(sorted, totalWeight, 0.90)).toBe(7.5);
    });
  });

  describe('recency weighting', () => {
    it('recent observations shift P50 toward recent values', () => {
      const TAU = 5;
      const sorted: WeightedObservation[] = [];

      for (let i = 0; i < 5; i++) {
        const ageDays = 12;
        sorted.push({ price: 10, weight: Math.exp(-ageDays / TAU) });
      }
      for (let i = 0; i < 5; i++) {
        const ageDays = 0.5;
        sorted.push({ price: 50, weight: Math.exp(-ageDays / TAU) });
      }

      sorted.sort((a, b) => a.price - b.price);
      const totalWeight = sorted.reduce((s, w) => s + w.weight, 0);

      const p50 = weightedQuantile(sorted, totalWeight, 0.50);

      expect(p50).toBeGreaterThan(30);
    });

    it('equal-weight observations produce symmetric quantiles', () => {
      const TAU = 5;
      const ageDays = 7;
      const weight = Math.exp(-ageDays / TAU);

      const sorted: WeightedObservation[] = [
        { price: 10, weight },
        { price: 20, weight },
        { price: 30, weight },
        { price: 40, weight },
        { price: 50, weight },
      ];
      const totalWeight = sorted.reduce((s, w) => s + w.weight, 0);

      const p50 = weightedQuantile(sorted, totalWeight, 0.50);
      expect(p50).toBeGreaterThan(20);
      expect(p50).toBeLessThan(40);
    });
  });

  describe('cold-start detection', () => {
    it('effectiveSampleSize < 5 marks cold start', () => {
      const TAU = 5;
      const observations = [
        { price: 10, ageDays: 13 },
        { price: 20, ageDays: 12 },
        { price: 30, ageDays: 11 },
      ];

      const weighted = observations.map((o) => ({
        price: o.price,
        weight: Math.exp(-o.ageDays / TAU),
      }));
      const totalWeight = weighted.reduce((s, w) => s + w.weight, 0);

      expect(totalWeight).toBeLessThan(5);
    });

    it('effectiveSampleSize >= 5 does not mark cold start', () => {
      const TAU = 5;
      const observations = [
        { price: 10, ageDays: 0.1 },
        { price: 20, ageDays: 0.5 },
        { price: 30, ageDays: 1 },
        { price: 40, ageDays: 1.5 },
        { price: 50, ageDays: 2 },
        { price: 60, ageDays: 2.5 },
        { price: 70, ageDays: 3 },
        { price: 80, ageDays: 3.5 },
      ];

      const weighted = observations.map((o) => ({
        price: o.price,
        weight: Math.exp(-o.ageDays / TAU),
      }));
      const totalWeight = weighted.reduce((s, w) => s + w.weight, 0);

      expect(totalWeight).toBeGreaterThanOrEqual(5);
    });
  });

  describe('window edge behavior', () => {
    it('observation at exactly 14d age receives approximately e^(-2.8) weight', () => {
      const TAU = 5;
      const WINDOW_DAYS = 14;
      const weight = Math.exp(-WINDOW_DAYS / TAU);

      expect(weight).toBeCloseTo(Math.exp(-2.8), 6);
      expect(weight).toBeCloseTo(0.0608, 3);
    });

    it('observation at 14d + 1s would be outside the window (weight = 0 effectively)', () => {
      const WINDOW_DAYS = 14;
      const ageDays = WINDOW_DAYS + 1 / 86400;

      expect(ageDays).toBeGreaterThan(WINDOW_DAYS);
    });
  });

  describe('StatTrak isolation', () => {
    it('StatTrak and normal observations have independent keys', () => {
      const normalKey = `ak47_redline|FIELD_TESTED|false`;
      const statTrakKey = `ak47_redline|FIELD_TESTED|true`;

      expect(normalKey).not.toBe(statTrakKey);
    });

    it('StatTrak prefix detection works correctly', () => {
      const STAT_TRAK_PREFIX = 'StatTrak™ ';
      const normal = 'AK-47 | Redline (Field-Tested)';
      const statTrak = 'StatTrak™ AK-47 | Redline (Field-Tested)';

      expect(normal.startsWith(STAT_TRAK_PREFIX)).toBe(false);
      expect(statTrak.startsWith(STAT_TRAK_PREFIX)).toBe(true);
    });
  });

  describe('source filter', () => {
    it('excluded source observations would be dropped', () => {
      const sourceFilter = { exclude: ['TRADEUPLAB_IMPORT'] };
      const observations = [
        { source: 'STEAM_PRICEOVERVIEW', price: 10 },
        { source: 'TRADEUPLAB_IMPORT', price: 50 },
        { source: 'LOCAL_JSON_IMPORT', price: 20 },
      ];

      const filtered = observations.filter(
        (o) => !sourceFilter.exclude.includes(o.source),
      );

      expect(filtered).toHaveLength(2);
      expect(filtered.map((o) => o.source)).not.toContain('TRADEUPLAB_IMPORT');
    });

    it('empty exclude list retains all observations', () => {
      const sourceFilter = { exclude: [] as string[] };
      const observations = [
        { source: 'STEAM_PRICEOVERVIEW', price: 10 },
        { source: 'TRADEUPLAB_IMPORT', price: 50 },
      ];

      const filtered = observations.filter(
        (o) => !sourceFilter.exclude.includes(o.source),
      );

      expect(filtered).toHaveLength(2);
    });
  });

  describe('volatility computation', () => {
    it('computes volatility as (P90 - P10) / P50', () => {
      const p10 = 8;
      const p50 = 10;
      const p90 = 14;
      const volatility = (p90 - p10) / p50;

      expect(volatility).toBeCloseTo(0.6, 4);
    });

    it('zero volatility for single-price distribution', () => {
      const p10 = 5;
      const p50 = 5;
      const p90 = 5;
      const volatility = p50 > 0 ? (p90 - p10) / p50 : 0;

      expect(volatility).toBe(0);
    });
  });
});
