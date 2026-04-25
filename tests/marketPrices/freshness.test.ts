import { describe, expect, it } from 'bun:test';
import { classifyPriceFreshness } from '$lib/server/marketPrices/freshness';

describe('price freshness', () => {
  const now = new Date('2026-04-24T18:00:00Z');

  it('classifies observations under six hours as fresh', () => {
    expect(classifyPriceFreshness(new Date('2026-04-24T12:01:00Z'), now)).toBe('FRESH');
  });

  it('classifies observations under one day as recent', () => {
    expect(classifyPriceFreshness(new Date('2026-04-24T12:00:00Z'), now)).toBe('RECENT');
  });

  it('classifies observations under seven days as stale', () => {
    expect(classifyPriceFreshness(new Date('2026-04-20T18:00:00Z'), now)).toBe('STALE');
  });

  it('classifies observations at seven days or older as old', () => {
    expect(classifyPriceFreshness(new Date('2026-04-17T18:00:00Z'), now)).toBe('OLD');
  });
});
