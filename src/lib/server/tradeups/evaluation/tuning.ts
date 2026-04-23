// Evaluation tuning knobs.
//
// Single home for every magic number the evaluation engine uses. Each
// constant gets a one-line `Why:` comment so downstream readers can judge
// whether the value is still correct for a given change.
//
// Changing any value here affects candidate ranking and recommendation
// output. Re-evaluate open candidates after edits so the persisted scores
// reflect the new weights.

// ---------------------------------------------------------------------------
// Scoring weights — contribute to the 0..1 composite quality score.
// ---------------------------------------------------------------------------

export const QUALITY_WEIGHTS = {
  // Why: float-fit is the most correctable component — operators can shop
  // by float. Weighted highest so mid-band floats dominate the score.
  floatFit: 0.4,
  // Why: price headroom directly drives expected profit; second-most-important
  // signal inside the quality composite.
  priceHeadroom: 0.4,
  // Why: exterior alignment is a thin tiebreaker — many rules skip the
  // constraint, and when they set it they already reject off-band via the
  // hard gate above.
  exteriorAlignment: 0.1,
  // Why: operator-tagged preferred rules get a visible nudge in ranking.
  preferredRule: 0.1,
} as const;

// ---------------------------------------------------------------------------
// Float-fit curve — two-piece: flat inside safe core, linear falloff at edges.
// ---------------------------------------------------------------------------

// Why: operators care about "well inside the band," not dead-center. The
// middle 60% of the rule band scores a flat 1.0; the remaining 40% falls
// linearly to FLOAT_EDGE_MIN at the band edges.
export const FLOAT_SAFE_CORE_WIDTH = 0.6;
// Why: edge floats still match the rule but are less desirable; 0.5 keeps
// them in the running while visibly de-ranking them versus core floats.
export const FLOAT_EDGE_MIN = 0.5;

// ---------------------------------------------------------------------------
// Recommendation floors.
// ---------------------------------------------------------------------------

// Why: default floor for qualityScore * liquidityScore. Plans can override via
// `minCompositeScore`. Picked at 0.25 to reject the weakest quarter of
// matches while letting proxied-liquidity candidates (Phase 5 proxy) through.
export const DEFAULT_MIN_COMPOSITE_SCORE = 0.25;

// ---------------------------------------------------------------------------
// Max-buy-price fallback margin.
// ---------------------------------------------------------------------------

// Why: historically computeMaxBuyPrice silently assumed a 10% margin when a
// plan had no explicit threshold. That magic number now lives here. Set to
// null to disable the silent fallback (`computeMaxBuyPrice` returns null so
// the UI can show "—" with a tooltip).
export const DEFAULT_MAX_BUY_MARGIN_PCT: number | null = null;

// ---------------------------------------------------------------------------
// Liquidity proxy.
// ---------------------------------------------------------------------------

// Why: until real marketplace-volume data is wired in, derive a weak
// liquidity signal from how many distinct candidates we've seen with the
// same hash recently. Saturates at DENSITY_SATURATION observations → 1.0.
export const LIQUIDITY_DENSITY_SATURATION = 10;
// Why: how far back the density query looks. 7 days covers a normal week of
// ingestion without overlapping month-long price drift.
export const LIQUIDITY_DENSITY_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;
// Why: cold-start fallback. When the window has fewer than MIN_OBSERVATIONS
// samples, return LIQUIDITY_COLD_START instead of a derived score so a
// sparse seed DB doesn't look systematically illiquid.
export const LIQUIDITY_MIN_OBSERVATIONS = 3;
export const LIQUIDITY_COLD_START = 0.5;
