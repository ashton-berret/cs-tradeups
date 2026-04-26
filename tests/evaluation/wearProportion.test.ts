import { describe, expect, it } from 'bun:test';
import {
  averageFloat,
  averageWearProportion,
  projectOutputFloat,
  wearProportion,
} from '$lib/server/utils/float';
import { computeBasketEV } from '$lib/server/tradeups/evaluation/expectedValue';
import type { BasketSlotContext } from '$lib/server/tradeups/evaluation/expectedValue';
import { decimal, outcome, plan, slot } from '../helpers/factories';
import { COLLECTION_A } from '../helpers/fixtures';

describe('wearProportion', () => {
  it('returns the float divided by the input range', () => {
    expect(wearProportion(0.4, 0, 0.5)).toBe(0.8);
    expect(wearProportion(0.4, 0, 1)).toBe(0.4);
    expect(wearProportion(0.43, 0.06, 0.8)).toBe(0.5);
  });

  it('clamps slightly out-of-range floats to [0, 1]', () => {
    expect(wearProportion(0.6, 0, 0.5)).toBe(1);
    expect(wearProportion(-0.01, 0, 0.5)).toBe(0);
  });

  it('returns null when any input is missing or the range is degenerate', () => {
    expect(wearProportion(null, 0, 1)).toBeNull();
    expect(wearProportion(0.4, null, 1)).toBeNull();
    expect(wearProportion(0.4, 0, null)).toBeNull();
    expect(wearProportion(0.4, 0.5, 0.5)).toBeNull();
    expect(wearProportion(0.4, 0.6, 0.5)).toBeNull();
  });
});

describe('averageWearProportion', () => {
  it('returns the simple mean of per-input wear proportions when all inputs have ranges', () => {
    const inputs = [
      { floatValue: 0.4, inputMinFloat: 0, inputMaxFloat: 1 },
      { floatValue: 0.4, inputMinFloat: 0, inputMaxFloat: 0.5 },
    ];
    // proportions = [0.4, 0.8] → average = 0.6
    expect(averageWearProportion(inputs)).toBe(0.6);
  });

  it('agrees with raw mean when every input is full-range [0, 1]', () => {
    const inputs = Array.from({ length: 10 }, (_, idx) => ({
      floatValue: 0.05 + idx * 0.05,
      inputMinFloat: 0,
      inputMaxFloat: 1,
    }));
    const proportion = averageWearProportion(inputs);
    const raw = averageFloat(inputs.map((it) => it.floatValue));
    expect(proportion).toBe(raw);
  });

  it('returns null if any input is missing min/max', () => {
    expect(
      averageWearProportion([
        { floatValue: 0.4, inputMinFloat: 0, inputMaxFloat: 1 },
        { floatValue: 0.4, inputMinFloat: null, inputMaxFloat: 1 },
      ]),
    ).toBeNull();
  });

  it('returns null if the input list is empty', () => {
    expect(averageWearProportion([])).toBeNull();
  });
});

describe('projectOutputFloat with corrected semantics', () => {
  it('maps the average wear proportion through the output range', () => {
    expect(projectOutputFloat(0.5, 0, 1)).toBe(0.5);
    expect(projectOutputFloat(0.5, 0, 0.5)).toBe(0.25);
    expect(projectOutputFloat(0.8, 0, 1)).toBe(0.8);
  });

  it('rejects values outside [0, 1]', () => {
    expect(() => projectOutputFloat(1.2, 0, 1)).toThrow();
    expect(() => projectOutputFloat(-0.1, 0, 1)).toThrow();
  });
});

describe('computeBasketEV float-driven exterior projection', () => {
  it('projects different output exteriors for input ranges [0, 0.5] vs [0, 1] at the same raw float', () => {
    // 10 inputs at raw float 0.4. With range [0, 0.5] each, proportion = 0.8.
    // With range [0, 1] each, proportion = 0.4. Output range is [0, 1].
    const slotsRestrictedRange: BasketSlotContext[] = Array.from({ length: 10 }, (_, idx) => ({
      ...slot({ inventoryItemId: `r-${idx}`, floatValue: 0.4 }),
      inputMinFloat: 0,
      inputMaxFloat: 0.5,
    }));
    const slotsFullRange: BasketSlotContext[] = Array.from({ length: 10 }, (_, idx) => ({
      ...slot({ inventoryItemId: `f-${idx}`, floatValue: 0.4 }),
      inputMinFloat: 0,
      inputMaxFloat: 1,
    }));
    const testPlan = plan(
      {},
      {
        outcomeItems: [
          {
            ...outcome({ id: 'o1', collection: COLLECTION_A, estimatedMarketValue: decimal(20) }),
            // simulate output range [0, 1] via withCatalogOutcomeFloatRanges-style enrichment
            minFloat: 0,
            maxFloat: 1,
            marketHashNames: [
              { exterior: 'FACTORY_NEW', marketHashName: 'Out (Factory New)' },
              { exterior: 'MINIMAL_WEAR', marketHashName: 'Out (Minimal Wear)' },
              { exterior: 'FIELD_TESTED', marketHashName: 'Out (Field-Tested)' },
              { exterior: 'WELL_WORN', marketHashName: 'Out (Well-Worn)' },
              { exterior: 'BATTLE_SCARRED', marketHashName: 'Out (Battle-Scarred)' },
            ],
          } as never,
        ],
      },
    );

    const restrictedAvg = averageWearProportion(slotsRestrictedRange);
    const fullAvg = averageWearProportion(slotsFullRange);
    expect(restrictedAvg).toBe(0.8);
    expect(fullAvg).toBe(0.4);

    const restrictedEv = computeBasketEV(slotsRestrictedRange, testPlan, {
      averageWearProportion: restrictedAvg,
    });
    const fullEv = computeBasketEV(slotsFullRange, testPlan, {
      averageWearProportion: fullAvg,
    });

    // Restricted-range inputs project to BS exterior (output_float = 0.8);
    // full-range inputs project to WW (output_float = 0.4).
    // The point of the test is that the same raw input float produces
    // different output exteriors depending on the input skin's range —
    // which is exactly what the previous (raw-float) code missed.
    expect(restrictedEv.perOutcomeContribution[0].projectedExterior).toBe('BATTLE_SCARRED');
    expect(fullEv.perOutcomeContribution[0].projectedExterior).toBe('WELL_WORN');
    expect(restrictedEv.perOutcomeContribution[0].projectedFloat).toBe(0.8);
    expect(fullEv.perOutcomeContribution[0].projectedFloat).toBe(0.4);
  });

  it('skips output projection when any input is missing min/max float', () => {
    const slots: BasketSlotContext[] = Array.from({ length: 10 }, (_, idx) => ({
      ...slot({ inventoryItemId: `s-${idx}`, floatValue: 0.4 }),
      inputMinFloat: idx === 0 ? null : 0,
      inputMaxFloat: idx === 0 ? null : 0.5,
    }));
    const testPlan = plan(
      {},
      {
        outcomeItems: [
          {
            ...outcome({ id: 'o1', collection: COLLECTION_A, estimatedMarketValue: decimal(20) }),
            minFloat: 0,
            maxFloat: 1,
            marketHashNames: [],
          } as never,
        ],
      },
    );
    const avg = averageWearProportion(slots);
    expect(avg).toBeNull();
    const ev = computeBasketEV(slots, testPlan, { averageWearProportion: avg });
    expect(ev.perOutcomeContribution[0].projectedExterior).toBeNull();
    // Total EV still computes correctly from collection weighting.
    expect(ev.totalEV).toBe(20);
  });
});
