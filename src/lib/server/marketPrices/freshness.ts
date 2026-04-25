export type PriceFreshness = 'FRESH' | 'RECENT' | 'STALE' | 'OLD';

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

export function classifyPriceFreshness(observedAt: Date, now = new Date()): PriceFreshness {
  const ageMs = Math.max(0, now.getTime() - observedAt.getTime());

  if (ageMs < 6 * HOUR_MS) return 'FRESH';
  if (ageMs < DAY_MS) return 'RECENT';
  if (ageMs < 7 * DAY_MS) return 'STALE';
  return 'OLD';
}
