# Tradeup Engine — Design

**Status:** Design locked. Ready for Slice 1 implementation.
**Last Updated:** 2026-05-01
**Companion:** `docs/PLAN.md` (intended architecture), `docs/PROGRESS.md` (current state).

---

## 1. Purpose

The existing system can evaluate trade-ups the operator types in or imports from
TradeUpLab. That is fundamentally a *replication* loop: someone else found the
opportunity, posted it, and now everyone executes it until the input prices
inflate and the edge disappears.

The Tradeup Engine is a *generation* loop. Given the static CS2 catalog and a
running price-observation history, it autonomously enumerates the universe of
structurally valid trade-up contracts, scores them against price distributions,
and surfaces a small ranked set of high-EV theses for the operator to pursue.
The operator never has to ask "is this contract good?" — the engine has already
asked it for every contract that exists.

The engine is plan-targeted discovery's *upstream*: discovery hunts listings
that fit a thesis; the engine produces theses worth hunting.

### 1.1 Non-Goals

- Real-time per-listing pricing of every catalog skin. The engine is not a
  market-data firehose.
- Replacing manual plan authoring. The operator can still hand-craft plans;
  the engine is additive.
- Automating Steam transactions. Engine output is decision-support; the
  human still buys.
- Modeling sticker value, pattern premiums, StatTrak-only collections, or
  Souvenir items in v1. Each is a known follow-up.

---

## 2. Glossary

| Term | Meaning |
| --- | --- |
| **Skin** | A specific (weapon, paint kit) pair, e.g. `AK-47 \| Slate`. Has a fixed `[minFloat, maxFloat]` range and a fixed rarity tier within its collection. StatTrak™ variants are treated as separate market hashes for pricing but share float ranges and rarity. |
| **Collection** | The set of skins that drop together (e.g. `The Dust 2 Collection`). Trade-up output distribution is *bounded* to skins from the collections of the input slots. |
| **Rarity tier** | One of `CONSUMER → INDUSTRIAL → MIL_SPEC → RESTRICTED → CLASSIFIED → COVERT`. A trade-up consumes 10 inputs of rarity `R` and produces one output of rarity `R+1`. |
| **Exterior** | One of `FN, MW, FT, WW, BS`. Derived from a listing's float via fixed boundaries (`0.07, 0.15, 0.38, 0.45`). Skin-specific because each skin has a clamped float range. |
| **Wear proportion** | A skin's float normalized into its own `[minFloat, maxFloat]` range: `(f − min)/(max − min)`. The *output* wear proportion of a contract equals the *average* wear proportion of its 10 inputs. |
| **Partition** | A composition of 10 across collections, e.g. `{Mirage:7, Cache:2, Anubis:1}`. The fundamental unit of thesis identity. |
| **Combo** | A partition + an input rarity + a chosen target wear-proportion regime. Produces a deterministic output distribution. |
| **Thesis** | A combo + scored EV/profit/feasibility metadata + price-quantile context. The artifact the operator interacts with. |
| **Quantile snapshot** | The P10/P50/P90 of a skin's price across a rolling observation window. The engine's primary input to scoring. |

---

## 3. Conceptual Model

### 3.1 The Combinatorial Space

Naïvely: "choose 10 skins from the input-rarity universe with replacement." For
~600 trade-up-eligible skins that's `C(609, 10) ≈ 10^17`. Untractable.

But trade-up math is structured:

- **Output distribution is collection-determined, not skin-determined.** Two
  inputs from the same collection at the same rarity produce the same output
  distribution from that collection, regardless of which input skin they are.
- **Per-input wear contributes only through the average.** Output exterior
  depends on `avgWearProportion`, not on each input's float individually.
- **Cost per slot is "cheapest viable skin in (collection, rarity, exterior
  band)."** The operator buys the cheapest input that satisfies the contract;
  they don't enumerate listings.

These three facts collapse the search to:

```
(input_rarity) × (statTrak flag) × (partition of 10 across viable collections) × (per-combo wear regime)
```

Number of integer partitions of 10 is **42**. Number of trade-up-eligible
collections is roughly **30–40** depending on rarity tier, but per partition
only the *non-zero* parts matter and most partitions reference 1–4
collections. Per-combo wear regimes typically yield 3–8. StatTrak doubles
the resulting combo count. Total cardinality is on the order of **10⁴–2×10⁵**
combos, not 10¹⁷. Storable. Enumerable. Scoreable offline.

### 3.2 Why Partitions, Not Listings

A listing is ephemeral; a partition is permanent. If the engine scored at the
listing level, every refresh would invalidate the entire ranked set. Scoring at
the partition level lets us:

- precompute structural metadata (output distribution, float feasibility,
  rarity uplift) **once** and cache it forever
- recompute *valuation* incrementally as price quantiles drift
- separate "is this thesis structurally sound?" (static) from "is it
  profitable right now?" (dynamic)

A partition's *value* changes with prices; its *identity* never does.

### 3.3 What's Static, What's Dynamic

**Static (computed once per catalog snapshot):**

- skin → `[minFloat, maxFloat]`
- skin → collection, rarity
- collection → `{rarity → [skins]}` (the output table)
- partition → output skin set + per-skin probability
- partition × wear-regime → per-output-skin projected exterior + feasibility flag

**Dynamic (recomputed as observations land):**

- skin × exterior → P10/P50/P90 over the last N days
- thesis → EV, max-buy, profit, profit chance, robust EV
- thesis → "feasible right now?" (do listings exist within max-buy?)

The static side is a one-shot enumeration job; the dynamic side is a periodic
re-score against the static table.

---

## 4. Architecture: The Four-Tier Cascade

The engine is a four-tier funnel. Each tier is cheaper-per-unit than the next,
and each tier prunes aggressively before the next runs.

```
        Tier 0:  Enumerate combos                  ~10–50k rows, offline, no prices
            │
            ▼  prune: float-infeasible, no output uplift
        Tier 1:  Score with cached price quantiles ~all surviving combos
            │
            ▼  rank, keep top-K per (rarity × price-window) bucket
        Tier 2:  Refresh live prices for survivors ~hundreds of skin×exterior cells
            │
            ▼  rescore, demote regressors
        Tier 3:  Hunt actual listings via discovery ~tens of theses
            │
            ▼  feedback: feasibility actually observed?
        Operator surface: ranked actionable theses
```

### 4.1 Tier 0 — Combo Enumeration (offline, catalog-only)

**Inputs:** catalog snapshot.
**Output:** `TradeupCombo` rows with structural metadata. Recomputed only when
the catalog snapshot changes.

For each input rarity `R ∈ {CONSUMER..CLASSIFIED}` and each `statTrak ∈
{false, true}`:

1. Enumerate trade-up-eligible collections at rarity `R` (collections with at
   least one skin at `R` *and* at least one skin at `R+1`). For `statTrak =
   true`, restrict to collections whose skins ship in StatTrak variants
   (most non-Souvenir collections; some legacy Souvenir-only collections
   are excluded here).
2. Enumerate integer partitions of 10 across those collections, capped at
   `MAX_COLLECTIONS_PER_PARTITION = 5` (above five distinct collections in a
   contract is rare and usually noise).
3. For each partition, enumerate target wear regimes via **per-combo
   breakpoint sampling** (see Section 5.3.1 for the math). Compute the set
   of `W̄` values where *any* output skin in the combo crosses an exterior
   boundary. Between consecutive breakpoints, the full output-exterior
   vector is constant, so sample one regime per interval at the midpoint.
   Result: every regime produces a distinct, meaningful output-exterior
   vector; no redundancy, no missed transitions. Typical combo yields
   3–8 regimes; pathological cross-collection combos can yield 12+.
   Single-band-clamped combos yield 1.
4. For each `(partition, wear_regime)`, derive the output distribution:
   - For each collection `c` with count `n_c`, list its `R+1` skins
     `{s_{c,1}..s_{c,k_c}}` with per-input-slot probability `1/k_c`.
   - Aggregate: `P(output = s_{c,i}) = (n_c / 10) × (1 / k_c)`.
5. For each output skin `s_{c,i}`, compute `projectedExterior(s_{c,i},
   avg_wear_proportion)` from the skin's static `[minFloat, maxFloat]`. Mark
   the output as `feasible` if the projected float falls in a *real* exterior
   band for that skin (some skins are float-capped and cannot reach FN, etc.).
6. Tag each combo with structural flags: `hasSingleOutputCollection` (1-of-1
   anchor), `dominantOutputProbability`, `rarityUplift` (always 1 in v1),
   `crossCollection` (count > 1).

**Pruning at this tier:**

- Drop combos where *every* output skin is float-infeasible.
- Drop combos whose output set is identical (up to weights) to a strictly
  cheaper combo at the same input rarity. Identical-output combos differ only
  in input cost, so the cheap-input one dominates.
- Drop wear regimes that are strictly dominated: if regime A produces a
  superset of regime B's exterior options at the same combo, B is dropped.

**Expected size:** after pruning, on the order of **40–80k rows total**
across all rarities and both StatTrak flags. Each row is small (partition
fits in a JSON blob, output set is usually <30 skins). SQLite handles
this trivially.

**Frequency:** rerun on catalog snapshot change. Manual trigger via a CLI tool
(`tools/enumerate-combos.ts`) similar to the existing catalog importer.

### 4.2 Tier 1 — Thesis Scoring (offline, cached price quantiles)

**Inputs:** Tier 0 combos + latest `PriceQuantileSnapshot` per skin × exterior.
**Output:** `TradeupThesis` rows ranked by score. Recomputed periodically
(e.g., once an hour, or after every N price-observation imports).

For each combo, and for each **price window** `W` (operator-defined buckets
like `[$0.10, $0.50]`, `[$0.50, $2]`, `[$2, $8]`, `[$8, $30]`):

1. **Resolve cheapest input per slot:** for each collection in the partition
   and each candidate input exterior, look up `cheapestInputSkin(collection,
   R, exterior_band, W)`. This is the skin in collection at rarity R whose
   median price falls within `W` and whose float range supports the combo's
   target wear regime. If no such skin exists for any partition slot, mark
   the thesis `infeasible_in_window` and skip.
2. **Compute input-cost distribution:** for each slot, the cost is a
   distribution `(P10, P50, P90)` from the chosen skin's quantile snapshot at
   the chosen input exterior. Total contract input cost is the sum of 10
   slot-cost distributions. Approximation: treat slot costs as independent and
   sum quantile-by-quantile, or use a Cornish–Fisher correction; v1 uses
   straight quantile addition (acceptable since slot costs of independent
   skins really are roughly independent and we want a directional signal, not
   a confidence interval).
3. **Compute output-value distribution:** for each output skin `s` with
   contract probability `p_s` and projected exterior `e_s`, look up the skin's
   `(P10, P50, P90)` at exterior `e_s`. The contract's output-value
   distribution is the probability-weighted mixture across output skins.
4. **Apply Steam fee model:** output value is converted to net seller proceeds
   using the existing Steam fee approximation (the system already does this
   for displayed EV — leverage `convertSteamGrossToNet` or its equivalent).
5. **Compute thesis metrics:**
   - `EV_median = E[output_net | P50 prices] − E[input_cost | P50 prices]`
   - `EV_robust = E[output_net | P10 output, P90 input] − E[input_cost | P90]`
     (worst-case across both sides)
   - `EV_optimistic = (P90 output, P10 input)`
   - `profitChance` = probability that net output value of any single
     realization exceeds the realized contract cost. Closed-form: enumerate
     output-skin draws weighted by `p_s`, compare each `output_net(s)` against
     `expected_input_cost`. Returns a value in `[0, 1]`.
   - `score` = a composite ranking signal. v1: `score = EV_median × (1 −
     volatility_penalty) + α × EV_robust` with `α ∈ [0.3, 0.7]` operator-tunable.
     The point of `EV_robust` in the score is to bias toward theses whose
     edge survives bad price draws on either side.
6. **Stash provenance:** every thesis carries the snapshot version, the
   resolved input skin per slot, the price-quantile observation IDs used, and
   the wear regime. Reproducibility matters for debugging "why did this
   thesis tank yesterday?"

**Pruning at this tier:**

- Drop theses with `EV_robust < 0` and `EV_median < threshold` (operator
  tunable; default `$0.50`).
- Drop theses whose `score` is below the top-K within their `(input_rarity,
  price_window)` bucket. K is operator-tunable; default 50.

**Expected output:** ~500–2000 surviving theses globally.

### 4.3 Tier 2 — Targeted Price Refresh (live, narrow)

**Inputs:** surviving Tier-1 theses.
**Output:** updated quantile snapshots for the specific skin × exterior cells
those theses reference. Triggers a Tier-1 rerun on touched theses.

The Steam `priceoverview` adapter already exists and is rate-limited to ~1
req/sec sustained. The Tier-2 watchlist is the union of:

- input skins per surviving thesis × the input exterior they reference
- output skins per surviving thesis × each projected output exterior

For ~1000 surviving theses with average ~6 distinct skins each, that's roughly
**3000–6000 cells**. At 1 req/sec that's ~50–100 minutes for a full sweep,
which is fine as a nightly background job. For interactive operator runs, do
hot-cells-first (the top 50 theses' cells) and stop when the operator clicks
through to a thesis.

The existing `MarketPriceObservation` model already stores observations with
source labels. Tier 2 just adds new observations; the quantile recomputation
is a separate downstream step (Section 5.2).

**Pruning at this tier:** none — every Tier-1 survivor gets refreshed.
Demotion happens at the rescore.

### 4.4 Tier 3 — Discovery & Listing Match (live, narrow)

**Inputs:** top-ranked theses post-Tier-2.
**Output:** discovery targets fed to the existing
`GET /api/discovery/targets` and the Steam Market bridge collector.

For each promoted thesis, the engine emits:

- per slot: `marketHashName` for the chosen input skin at the input exterior,
  with `maxBuyPrice` derived from the thesis's max-buy-per-slot ceiling
  (`thesis.maxBuyPerSlot[c]`), with float band constraints
- target priority weighted by thesis `score` and slot scarcity (slots that are
  hard to fill bubble up first)

This integrates cleanly with the existing buy-queue: a thesis becomes an
*active plan* in the existing model the moment the operator promotes it. The
existing planner then handles cross-thesis basket-slot contention (the same
listing might satisfy multiple theses; the planner already solves this).

### 4.5 Feedback Loop

For every promoted thesis the engine records:

- `firstPromotedAt`, `timesPromoted`, `lastListingFoundAt`
- `listingsFound` (count of candidates from discovery that matched the
  thesis's max-buy and float band)
- `actualContractsExecuted` (from existing executions data)
- `realizedNet − thesisEvMedian` per execution (the existing
  expected-vs-realized analytics already computes this)

These feed back into the score as a multiplier:

```
score_adjusted = score × feasibilityFactor × realizationFactor
```

where `feasibilityFactor` decays a thesis that's been promoted N times but
never produced a buyable listing, and `realizationFactor` rewards theses
whose realized profits track their predictions.

This is the autoresearch closure: theses that *look* good but never
*materialize* get demoted automatically; theses that consistently produce
buyable listings *and* realize their predicted profit get promoted to a
"trusted strategy" tier.

---

## 5. Mathematical Foundation

### 5.1 Notation

- `R`: input rarity tier; `R+1`: output rarity tier.
- `C`: set of trade-up-eligible collections at rarity R.
- `n_c ∈ ℕ`: number of slots in the contract from collection `c`. Constraint:
  `Σ_c n_c = 10`, `n_c ≥ 0`.
- `K_c`: number of `R+1` skins in collection `c`.
- `s_{c,i}`: the i-th `R+1` skin in collection `c`.
- `f_j`: float of input slot `j ∈ {1..10}`.
- `[a_s, b_s]`: float range of skin `s`.
- `w_j = (f_j − a_{skin(j)}) / (b_{skin(j)} − a_{skin(j)})`: per-slot wear
  proportion in `[0, 1]`.
- `W̄ = (1/10) Σ_j w_j`: contract average wear proportion.
- `f_out(s) = a_s + W̄ × (b_s − a_s)`: output float for skin `s`.
- `exterior(f)`: the exterior band of float `f` per the global boundaries
  (`0.07, 0.15, 0.38, 0.45`).

### 5.2 Output Distribution

For a partition `{n_c}` with `Σ n_c = 10`:

```
P(output = s_{c,i}) = (n_c / 10) × (1 / K_c)
```

Verification: `Σ_{c,i} P = Σ_c (n_c/10) × Σ_i (1/K_c) = Σ_c (n_c/10) = 1`. ✓

This expression assumes Steam's actual contract logic, which selects a
contributing collection slot uniformly at random and then picks uniformly
within that collection's `R+1` skins.

### 5.3 Float Feasibility & Output Exterior Projection

The trade-up output formula (CS2 era, per-input normalized; the existing
`utils/float.ts` helpers `wearProportion` and `averageWearProportion`
implement this correctly and the engine reuses them):

```
w_j     = (f_j − a_{skin(j)}) / (b_{skin(j)} − a_{skin(j)})    // per slot j ∈ {1..10}
W̄       = (1/10) Σ w_j
f_out(s)= a_s + W̄ × (b_s − a_s)                               // per output skin s
```

`W̄` is contract-wide; output exterior is per-output-skin because each
output's float range differs.

Given target average wear proportion `W̄_target`, the projected float for
output skin `s_{c,i}` is `f_out = a_{s_{c,i}} + W̄_target × (b_{s_{c,i}} −
a_{s_{c,i}})`, and the projected exterior is `exterior(f_out)`. Different
output skins receive different exteriors from the same `W̄_target` because
their float ranges differ.

A combo's `feasibility` per output skin is binary: either the projected float
falls within the skin's range (always true given the linear interpolation) and
maps to a valid exterior band (always true), so output exterior projection is
always defined. The interesting feasibility question is on the **input** side:
does the partition admit a buyable input slot from collection `c` whose float
range can reach `W̄_target` when averaged across 10 slots?

Concretely, for each collection slot we need an input skin whose
`[a_{input}, b_{input}]` range includes a float value `f_input` such that, when
all 10 slots have appropriate floats, `(1/10) Σ w_j = W̄_target`. The simplest
sufficient condition: every slot's input skin must have *some* float in its
range. Since `w_j ∈ [0, 1]` for any in-range float, and `W̄ = (1/10) Σ w_j ∈
[0, 1]`, *any* `W̄_target ∈ [0, 1]` is achievable as long as inputs are
buyable at floats matching the required `w_j` values.

In practice, the binding constraint is **the input exterior the operator can
actually buy**. If `W̄_target` requires `w_j ≈ 0.05` for most slots and the
cheap available input exterior for those skins is FT (`w_j ∈ [0.27, 0.78]`
roughly, depending on per-skin range), the combo is unbuyable in that wear
regime. Tier 1 enforces this by pairing each `W̄_target` with a feasible input
exterior per slot during cheapest-input resolution.

#### 5.3.1 Per-Combo Breakpoint Sampling

For each output skin `s` in the combo's output set, the `W̄` values at which
its projected exterior crosses a band boundary are:

```
W_FN/MW(s) = (0.07 − a_s) / (b_s − a_s)
W_MW/FT(s) = (0.15 − a_s) / (b_s − a_s)
W_FT/WW(s) = (0.38 − a_s) / (b_s − a_s)
W_WW/BS(s) = (0.45 − a_s) / (b_s − a_s)
```

For each, retain only values in `(0, 1)`; values outside that range mean
the boundary is unreachable for that skin.

The combo's breakpoint set is `B = {0} ∪ {0..1 boundary crossings across all
output skins} ∪ {1}`, deduped and sorted. For every consecutive pair
`(b_k, b_{k+1})`, sample `W̄_target = (b_k + b_{k+1}) / 2` as one wear
regime. Within that interval the entire output-exterior vector is constant,
so sampling more than once is wasted work.

A degenerate combo where every output skin has all four crossings outside
`(0, 1)` (i.e., float-clamped to one exterior band for the entire `W̄`
domain) yields `B = {0, 1}` and a single regime. This is the correct
encoding — the combo only has one possible output-exterior vector.

The breakpoint set also doubles as the **input-feasibility constraint**: to
hit `W̄_target` from interval `(b_k, b_{k+1})`, the chosen input exterior
per slot must allow `w_j` values whose 10-slot average lands in that
interval. Tier 1's cheapest-input resolution validates this per slot.

### 5.4 Per-Combo Expected Value

Let `v_net(s, e)` be the net seller proceeds (after Steam fees) for skin `s`
at exterior `e`. Let `c_in(s, e)` be the gross buyer cost for skin `s` at
exterior `e`.

Expected output value:

```
E[output_net] = Σ_{c,i} P(output = s_{c,i}) × v_net(s_{c,i}, exterior(f_out(s_{c,i})))
              = Σ_c (n_c / 10) × (1 / K_c) × Σ_i v_net(s_{c,i}, exterior_proj(s_{c,i}, W̄))
```

Expected input cost: for each collection slot `j` with chosen input skin
`s_in(j)` at chosen input exterior `e_in(j)`:

```
E[input_cost] = Σ_j c_in(s_in(j), e_in(j))
```

In the partition formulation, all `n_c` slots from collection `c` use the
same chosen cheapest input, so:

```
E[input_cost] = Σ_c n_c × c_in(s_in(c), e_in(c))
```

And finally:

```
EV = E[output_net] − E[input_cost]
```

### 5.5 Profit Chance

The operator's intuition: "what fraction of the time does this contract come
out ahead?" Profit chance is a **per-output** binary outcome, weighted by
output probability:

```
profitChance = Σ_{c,i} P(output = s_{c,i}) × 𝟙[v_net(s_{c,i}, e_proj) > E[input_cost]]
```

This treats input cost as a deterministic point estimate; for the engine, use
`E[input_cost]` at P50. A more sophisticated model integrates over the input
cost distribution (Section 5.7), but the v1 closed form is sufficient.

### 5.6 Price Distribution: P10/P50/P90

For each (skin, exterior, statTrak) triple, we maintain a rolling quantile
snapshot over a window of recent observations. The window is **14 days,
single global setting**, with exponential recency weighting `e^(−age_days /
τ)` and `τ = 5`. This puts the window-edge weight at `e^(−2.8) ≈ 0.06` —
near-zero for stale observations, full weight for fresh ones.

Skins with fewer than `MIN_OBSERVATIONS = 5` in the window are flagged
`cold_start` and excluded from the default Active thesis view rather than
ranked against unreliable quantiles. Cold-start skins surface in a
dedicated "Needs price data" view that prioritizes them for the next
Tier-2 sweep.

**Sources of observations:**

- Steam `priceoverview` median price (the primary signal for volume-weighted
  Steam-side pricing).
- Operator-imported CSV/JSON (e.g., from third-party adapters; tagged with
  source label so quantiles can optionally exclude non-Steam sources).
- Discovery-collected listing observations (each *listing* is a price
  observation; if the bridge submits N candidates with N prices, those become
  N observations of "what people are currently asking" — a different signal
  than `priceoverview`'s median, but useful for the P10 lower-bound).

**Quantile computation:**

- Naive: sort all observations in the window, pick at the percentile
  position. Storage cost is bounded since the window is fixed.
- Recommended: use a streaming quantile estimator (P² or t-digest) keyed by
  (skin, exterior). Storage: ~100 bytes per (skin, exterior) cell. Update is
  O(log n) per observation.
- v1 implementation: naive sort over `MarketPriceObservation` rows in the
  window, materialized into a `PriceQuantileSnapshot` row. Recompute hourly
  or after batch imports. Switch to streaming estimator only if performance
  becomes a problem.

**Volatility metric:**

```
volatility = (P90 − P10) / P50
```

This is the IQR-based coefficient of variation. Used in scoring to penalize
theses whose ranks depend on skins with wide spreads.

**Recency weighting:**

A flat window treats a 13-day-old observation the same as a 1-hour-old one.
That's wrong during regime shifts (e.g., a Steam-wide price drop after a
case-drop event). v1 uses exponential decay `e^(−age_days / τ)` with
`τ = 5` for window aggregation. This keeps the 14-day window as a hard
cutoff but biases quantiles toward recent observations.

### 5.7 Robust EV vs Median EV

`EV_median` uses P50 on both sides. It's the operator's default expectation.

`EV_robust` answers: "if input prices spike to P90 *and* output prices crash
to P10 simultaneously, is this thesis still profitable?"

```
EV_robust = E_P10[output_net] − E_P90[input_cost]
```

A thesis with `EV_median = $5` and `EV_robust = $3` is durable. A thesis with
`EV_median = $5` and `EV_robust = −$2` requires precise execution and is
fragile. The composite `score` weights both:

```
score = β_median × EV_median + β_robust × EV_robust − γ × volatility_penalty
```

**Default weights:** `β_median = 0.55, β_robust = 0.30, γ = 0.15` —
slightly risk-averse, growth-friendly. Tilts toward median EV without
ignoring fragility.

**Risk slider** (operator-tunable, single value `r ∈ [0, 1]` in engine
settings, default `r = 0.4`):

| Slider position | β_median | β_robust | γ    |
| --------------- | -------- | -------- | ---- |
| 0.0 (aggressive) | 0.70    | 0.15     | 0.15 |
| 0.4 (default)    | 0.55    | 0.30     | 0.15 |
| 1.0 (conservative) | 0.35  | 0.50     | 0.15 |

Intermediate positions linearly interpolate `(β_median, β_robust)`; γ
stays fixed because volatility is always penalized regardless of risk
appetite. The slider gives the operator a single knob to retune the entire
ranked list as they learn which theses actually realize. No code changes
required to retune.

The asymmetric-upside theses (1-of-1 anchor collections paired with cheap
fillers) will tend to score well on `EV_robust` because the anchor's output
price is concentrated and predictable. This is the right behavior — those
are the contracts that actually survive at scale.

---

## 6. Data Model Additions

All new tables. No changes to existing models. Migrations land in
`prisma/migrations/<timestamp>_tradeup_engine/`.

### 6.1 `TradeupCombo`

The static enumeration artifact. One row per `(input_rarity × partition × wear
regime)` combo that survived Tier-0 pruning.

```
id                  String  PK (cuid)
inputRarity         String
statTrak            Boolean // false for normal, true for StatTrak™ contracts
partition           Json    // { "<catalogCollectionId>": <count>, ... } sums to 10
partitionHash       String  // canonical hash of the partition for unique-key dedup
wearRegimeIndex     Int     // 0..N-1, ordered ascending by W̄_target
targetAvgWearProp   Float   // numeric W̄_target the regime samples at (interval midpoint)
wearIntervalLow     Float   // breakpoint lower bound
wearIntervalHigh    Float   // breakpoint upper bound
collections         Json    // [<catalogCollectionId>] for fast membership lookup
outputs             Json    // [{ catalogSkinId, probability, projectedExterior, projectedFloat, feasible }]
hasSingleOutputCollection Boolean
crossCollection     Boolean
catalogVersion      String  // hash of the catalog snapshot used
createdAt           DateTime
```

Unique key: `(inputRarity, statTrak, partitionHash, wearRegimeIndex,
catalogVersion)`. Indexed on `(inputRarity, statTrak, catalogVersion)` and
on `(catalogVersion)` for bulk filtering.

**StatTrak note:** StatTrak inputs only produce StatTrak outputs and
cannot be mixed with normal inputs in the same contract. The flag
partitions the combo space cleanly: enumeration runs twice (once per
flag value) and the two halves never reference each other. Pricing is
fully separate because `StatTrak™ <skin>` is a different
`marketHashName` from `<skin>` with an independent price distribution.

### 6.2 `TradeupThesis`

The dynamic scoring artifact. One row per `(combo × price_window)` that's
currently feasible and ranked.

```
id                  String  PK
comboId             String  FK → TradeupCombo
priceWindow         String  // e.g. "0.50_2.00"
inputResolution     Json    // { "<collection>": { skinId, exterior, slotCost: { p10, p50, p90 } } }
inputCostP10        Decimal
inputCostP50        Decimal
inputCostP90        Decimal
outputValueP10      Decimal // probability-weighted, net of Steam fee
outputValueP50      Decimal
outputValueP90      Decimal
evMedian            Decimal
evRobust            Decimal
evOptimistic        Decimal
profitChance        Float   // 0..1
volatilityScore     Float
score               Float
scoreVersion        String  // formula version used for this score
quantileSnapshotIds Json    // [snapshotId] for provenance
maxBuyPerSlot       Json    // { "<collection>": Decimal } for discovery hand-off
feasibilityFactor   Float   // from feedback loop, default 1.0
realizationFactor   Float   // from feedback loop, default 1.0
firstPromotedAt     DateTime?
lastPromotedAt      DateTime?
timesPromoted       Int     default 0
listingsFound       Int     default 0
contractsExecuted   Int     default 0
status              String  // "ACTIVE" | "DEMOTED" | "ARCHIVED"
createdAt           DateTime
updatedAt           DateTime
```

Indexed on `(score DESC, status)` for the operator surface. Indexed on
`(comboId, priceWindow)` unique. Indexed on `(status, lastPromotedAt)` for
the feedback loop's decay job.

### 6.3 `PriceQuantileSnapshot`

The rolling-quantile artifact. One row per `(skin, exterior, window)` per
recompute. Keep the latest per key plus a small history for charting.

```
id                  String  PK
catalogSkinId       String
marketHashName      String  // denormalized for fast lookup; not authoritative
exterior            String
statTrak            Boolean // matches the marketHashName's StatTrak™ prefix
windowDays          Int     // 14 by default
observationCount    Int     // count of observations after window filter, before weighting
effectiveSampleSize Float   // Σ weights, used for the cold_start cutoff
p10                 Decimal
p50                 Decimal
p90                 Decimal
mean                Decimal
volatility          Float   // (P90 − P10) / P50
recencyTau          Int     // exponential decay τ used; 5 by default
coldStart           Boolean // effectiveSampleSize < 5
sourceFilter        Json?   // { "exclude": ["TRADEUPLAB_IMPORT"] } if sources filtered
computedAt          DateTime
isLatest            Boolean
```

Unique latest: `(catalogSkinId, exterior, statTrak, windowDays, isLatest=true)`.
Indexed on `(catalogSkinId, exterior, statTrak, isLatest)` and on
`(coldStart, isLatest)` for the "Needs price data" view. The "latest"
pattern keeps history without churning foreign-key references on every
recompute.

### 6.4 `ThesisExecutionFeedback`

Captures realized vs predicted for each execution against a thesis.

```
id                  String  PK
thesisId            String  FK → TradeupThesis
executionId         String  FK → TradeupExecution
predictedEvMedian   Decimal
predictedEvRobust   Decimal
realizedNet         Decimal
delta               Decimal // realized − predictedEvMedian
recordedAt          DateTime
```

Used by the feedback loop to compute `realizationFactor` per thesis.

### 6.5 Existing Models — No Changes Required

The engine reuses:

- `MarketPriceObservation` for raw observations (Tier 2 writes here).
- `TradeupPlan` and friends for plan promotion (an active thesis can spawn a
  `TradeupPlan` via the existing `saveCombination`/plan-creation paths).
- `CandidateAssignment` and the planner for buy-queue handoff.

This separation means the engine can be added, removed, or rewritten without
touching the operator's existing plan/basket/execution data.

---

## 7. Service Architecture

All new services under `src/lib/server/engine/`.

### 7.1 `comboEnumerator`

- **Entry:** `enumerateCombos(catalogVersion: string): { written, skipped }`.
- **Behavior:** loads catalog, iterates rarities × collections × partitions
  × wear regimes, applies Tier-0 pruning, upserts into `TradeupCombo`.
- **Idempotency:** keyed by `(inputRarity, partition_hash, wearRegime,
  catalogVersion)`. Re-running for the same catalog version is a no-op.
- **Trigger:** CLI tool `tools/enumerate-combos.ts`. Manual; not on a cron.

### 7.2 `priceQuantileService`

- **Entry:** `recomputeQuantiles(filter?: SkinFilter): { snapshots, durationMs }`.
- **Behavior:** for each `(catalogSkinId, exterior)` matching the filter,
  pull observations within window, apply recency weighting, compute P10/P50/P90,
  upsert latest snapshot, archive the previous latest.
- **Triggers:**
  - After `POST /api/market-prices/import` (delta recompute on touched skins)
  - After Tier-2 price refresh (delta recompute on the refreshed cells)
  - Nightly full recompute (catches drift and observation expiry)

### 7.3 `thesisScorer`

- **Entry:** `scoreCombo(combo, priceWindows): TradeupThesis[]`.
- **Behavior:** Tier-1 logic from Section 4.2. Resolves cheapest input per
  slot, looks up output quantiles, computes `EV_*`, `profitChance`, `score`.
  Returns one thesis per price window.
- **Bulk entry:** `rescoreAll({ since? }): { rescored, demoted, promoted }`.
  Picks combos whose underlying snapshots changed since `since` and reruns
  scoring. Default cron: hourly during operator hours, daily otherwise.

### 7.4 `thesisRefresher`

- **Entry:** `refreshTier2(theses): { cellsRefreshed, durationMs }`.
- **Behavior:** Tier-2 logic. Builds the (skin, exterior) refresh set from
  the supplied theses, calls the existing Steam `priceoverview` adapter at
  the rate-limited cadence, writes new observations, triggers
  `priceQuantileService.recomputeQuantiles` on the touched cells, then
  triggers `thesisScorer.rescoreAll({ since: refreshStartTime })`.
- **Cadence:** operator-triggered "refresh top theses" button + nightly cron
  for the full surviving set.

### 7.5 `thesisFeasibilityTracker`

- **Entry:** `recordPromotion(thesisId)`, `recordListingFound(thesisId,
  candidateId)`, `recordExecution(thesisId, executionId, realizedNet)`.
- **Behavior:** updates the feedback fields on `TradeupThesis` and inserts
  `ThesisExecutionFeedback` rows. The decay job runs daily and recomputes
  `feasibilityFactor` and `realizationFactor` from the recent history.

### 7.6 Service Boundaries

```
catalog snapshot ──► comboEnumerator ──► TradeupCombo
                                          │
MarketPriceObservation ──► priceQuantileService ──► PriceQuantileSnapshot
                                          │
                                          ▼
                                    thesisScorer ──► TradeupThesis
                                          │
                                          ▼
                                  thesisRefresher (writes observations,
                                  triggers quantile recompute, triggers rescore)
                                          │
                                          ▼
                              discoveryWatchlistService (existing)
                                          │
                                          ▼
                              steam-market-bridge collector (existing)
                                          │
                                          ▼
                                   CandidateListing (existing)
                                          │
                                          ▼
                                   planner (existing) ──► /buy-queue
                                          │
                                          ▼
                              executions (existing) ──► thesisFeasibilityTracker
```

The engine is a self-contained graph that *plugs into* the existing pipeline
at three points: it reads `MarketPriceObservation`, it writes targets to
`discoveryWatchlistService`, and it reads back `TradeupExecution` for
feedback. Existing operator surfaces continue to work unchanged.

---

## 8. Operator Surfaces

### 8.1 `/tradeups/engine`

The primary engine UI. Default view: top-N theses globally, ranked by `score`.

**Filter bar:**

- input rarity (multi-select)
- price window (multi-select, with current bucket counts visible)
- minimum `EV_robust` (numeric)
- minimum `profitChance` (slider, 0–100%)
- maximum `volatility` (slider)
- structural flags: `hasSingleOutputCollection`, `crossCollection`
- status: `ACTIVE` / `DEMOTED` / `ARCHIVED`

**Card layout (per thesis):**

Header: `score`, `priceWindow`, status badge, structural-flag badges (e.g.
"1-output anchor", "cross-collection"), "Promote" / "Archive" actions.

Body — three columns:

1. **Inputs:** a 10-row mini-table: per-collection slot count, chosen input
   skin name, chosen exterior, slot cost `(P10 / P50 / P90)`, max buy.
2. **Outputs:** the output distribution: per-output-skin name, projected
   exterior, probability, output value `(P10 / P50 / P90)`, feasibility
   marker.
3. **Metrics:** `EV_median`, `EV_robust`, `EV_optimistic`, `profitChance`,
   `volatility`, `feasibilityFactor`, `realizationFactor`. A small sparkline
   showing `score` history for the thesis (helps see drift).

Footer: provenance — "scored with snapshots from 2026-04-30 14:00, formula
v1.2." A "Recompute" link triggers `thesisRefresher` for just this thesis's
cells.

**Promotion path:** clicking "Promote" creates an active `TradeupPlan` from
the thesis (reusing the existing simplified plan-creation flow), feeds the
discovery watchlist, and starts the feedback timer. The thesis card grows a
"View plan" link.

### 8.2 Discovery Integration

The existing `GET /api/discovery/targets` is extended to accept thesis-derived
targets. Active theses contribute targets the same way active plans already
do; the existing `discoveryWatchlistService` merges them. No bridge changes
required — the bridge sees a unified target list.

### 8.3 Plan Generation From Thesis

A promoted thesis becomes a plan via:

1. New `TradeupPlan` with name `"[Engine] <combo signature>"`, target rarity
   = `R+1`, basket-max = `inputCostP90` × 10 × 1.05.
2. One `TradeupPlanRule` per non-zero collection in the partition, with
   `count = n_c`, `inputRarity = R`, `exterior` = the resolved input exterior,
   `maxBuyPrice` = `maxBuyPerSlot[c]`.
3. One `TradeupOutcomeItem` per output skin in the combo, with
   `estimatedMarketValue = outputValueP50` (per-skin), `probability =
   p_{c,i}`, `catalogSkinId` set.

The promoted plan is indistinguishable from a hand-authored plan to the rest
of the system. The thesis link is stored on the plan via a nullable
`engineThesisId` field on `TradeupPlan` — the only existing-model change
required.

---

## 9. Failure Modes & Mitigations

### 9.1 Combinatorial blowup

**Risk:** partition cap of 5 collections, 42 partitions, 5 wear regimes ×
~30 collections × 5 rarities — bound is conservative but the *output set*
per combo can be large in cross-collection cases.

**Mitigation:** Tier-0 dominance pruning. Output-set storage as JSON blob
caps at ~30 skins, well within SQLite Json column limits. If we ever exceed
~100k Tier-0 rows, switch to a relational `TradeupComboOutput` child table.

### 9.2 Stale quantiles

**Risk:** P10/P50/P90 from 30 days ago miss a recent regime shift; thesis
ranks against fictional prices.

**Mitigation:** exponential recency weighting (Section 5.6). Tier-2 refreshes
the surviving set within hours. Volatility penalty in the score deprioritizes
theses whose quantile spread is wide (a leading indicator of regime
instability).

### 9.3 Cold-start: no observation history

**Risk:** new catalog skins or low-volume skins have <10 observations in the
window. Quantiles are unreliable.

**Mitigation:** mark snapshots with `observationCount`; theses depending on
under-observed skins get a `cold_start` flag and are excluded from the
default "Active" view. They show up in "Needs price data" instead, which
prioritizes those skins for the next Tier-2 sweep.

### 9.4 Steam fee drift

**Risk:** the Steam Community Market fee model changes (cent rounding, minimum
fee tweaks); our `convertSteamGrossToNet` falls behind.

**Mitigation:** the fee conversion lives in one place (`utils/steamFee.ts` or
similar). The engine's `EV_*` are derived; if the conversion changes, every
thesis is rescored on the next cron. `scoreVersion` field lets us detect and
force-rescore stale theses.

### 9.5 Feedback signal pollution

**Risk:** the feasibility/realization factors are noisy with low N. A thesis
promoted twice that produced one buyable listing each time has
`feasibilityFactor = 1.0`; with ten promotions and one buyable, it drops
sharply. But "twice" and "ten" are very different evidence levels.

**Mitigation:** Bayesian smoothing. `feasibilityFactor = (k + α) / (n + α + β)`
with prior `(α, β) = (1, 1)` giving small-N values close to 0.5 and
converging to the empirical rate as evidence accumulates. Same for
`realizationFactor`.

### 9.6 Operator over-promotion

**Risk:** the operator promotes 50 theses, the discovery watchlist explodes,
the bridge sees thousands of targets, none of them surface listings reliably.

**Mitigation:** soft cap on `ACTIVE` theses (default 10, tunable). Above the
cap, new promotions auto-archive the lowest-score active thesis. The UI
shows "X of Y slots used."

### 9.7 Catalog drift

**Risk:** Valve adds new cases or changes drop tables; existing combos
reference skins/collections that no longer exist.

**Mitigation:** `catalogVersion` on every combo. `comboEnumerator` rerun on
catalog change creates a new generation; old-generation combos are marked
`status = 'STALE_CATALOG'` and excluded from the active view but kept for
analytical history.

---

## 10. Implementation Phasing

This section sketches *how* the engine is built incrementally. Each slice is
independently shippable and verifiable.

### Slice 1: Combo enumeration

- Implement `comboEnumerator` and `tools/enumerate-combos.ts`.
- New `TradeupCombo` table.
- A read-only `/tradeups/engine/combos` debug page that lets the operator
  inspect generated combos by collection/rarity.
- Tests: enumeration determinism, partition count sanity, output-distribution
  sums to 1.0 across all combos.

**Verifiable:** "we can list every structurally valid combo at rarity
RESTRICTED for the Mirage Collection."

### Slice 2: Price quantiles

- Implement `priceQuantileService` against existing `MarketPriceObservation`.
- New `PriceQuantileSnapshot` table.
- `/market-prices` page surfaces P10/P50/P90 inline alongside the existing
  observation list.
- Tests: quantile correctness on synthetic distributions, recency weighting
  shifts P50 toward recent observations.

**Verifiable:** "for AK-47 | Redline (FT), the engine reports P10/P50/P90 =
$X/Y/Z over the last 30 days, weighted with τ=7."

### Slice 3: Thesis scoring (Tier 1)

- Implement `thesisScorer` and the `EV_*` math.
- New `TradeupThesis` table.
- `/tradeups/engine` page with the full filter bar and card layout.
- "Promote thesis" creates a `TradeupPlan`.
- Tests: per-combo EV math against hand-computed reference cases, scoring
  determinism, top-K selection.

**Verifiable:** "the engine's top-ranked RESTRICTED→CLASSIFIED thesis at the
$2–$8 window has `EV_median = $X` and `profitChance = Y%`."

### Slice 4: Targeted refresh (Tier 2)

- Implement `thesisRefresher` over the existing Steam `priceoverview`
  adapter.
- "Refresh top theses" UI button.
- Cron job for nightly full refresh.
- Tests: refresh budgeting respects rate limits, only touched cells trigger
  rescore.

**Verifiable:** "click refresh, watch ~50 cells repopulate within 60
seconds, top theses re-rank visibly."

### Slice 5: Discovery integration (Tier 3)

- Extend `discoveryWatchlistService` to ingest thesis-derived targets.
- Promoted theses inject targets into the existing bridge collector.
- Tests: thesis promotion produces correct per-slot targets with correct
  max-buy and float band.

**Verifiable:** "promote a thesis, see its target market hashes appear in
the bridge collector's queue with correct constraints."

### Slice 6: Feedback loop

- Implement `thesisFeasibilityTracker` and `ThesisExecutionFeedback`.
- Wire `recordListingFound` from candidate ingestion (when a new candidate
  matches a thesis's max-buy + float).
- Wire `recordExecution` from execution recording.
- Decay job for `feasibilityFactor` and `realizationFactor`.
- Tests: feasibility decay arithmetic, Bayesian smoothing on small N.

**Verifiable:** "promote a thesis, observe `timesPromoted` increment; record
an execution against its plan, observe the realized-vs-predicted delta on
the thesis card."

---

## 11. Resolved Design Decisions

Recorded for future-you's benefit. Each was a real fork; the chosen
direction is now load-bearing.

1. **Quantile window — 14 days, single global, recency-weighted (τ=5).**
   Discarded: 30d default, per-skin adaptive windows. Reason: simpler is
   correct here; cold-start handling addresses the niche-skin problem
   without per-skin tuning. Window length is configurable in code if real
   usage suggests a different default.
2. **Wear regimes — per-combo breakpoint sampling.** Discarded: 5 fixed
   global regimes. Reason: float-clamped output skins make global regimes
   degenerate or wrong, and breakpoint sampling guarantees every regime
   produces a distinct output-exterior vector. See §5.3.1.
3. **Score formula weights — default `(0.55, 0.30, 0.15)` with single
   risk-slider knob.** Discarded: `(0.5, 0.4, 0.1)` from initial draft;
   discarded: per-component sliders. Reason: one knob is enough operator
   surface area, and it interpolates cleanly between aggressive and
   conservative profiles.
4. **StatTrak — included from the start.** Discarded: ship normal-only
   v1, add StatTrak later. Reason: StatTrak partitions combo space
   cleanly along a single boolean and avoiding a re-enumeration migration
   is worth the ~2× upfront enumeration cost.
5. **Cross-thesis basket contention — inherit the existing planner.** The
   engine generates theses; the existing planner already handles "two
   contracts want the same listing" via global basket optimization (see
   `PLAN.md`, "Global Basket Optimization Requirements"). The engine does
   not re-solve this.
6. **Souvenir items — hard catalog-level exclusion.** Souvenirs do not
   trade up. Filter at `comboEnumerator` input.
7. **Pattern premiums — out of scope for v1; flag in UI.** Quantile
   snapshots aggregate across patterns. Theses referencing
   pattern-sensitive skins (Case Hardened, Doppler, Fade, Marble Fade,
   Crimson Web) carry a `patternVariant` flag in the UI so the operator
   knows to inspect listings manually.

---

## 12. Documentation Rules

- This file describes the engine's intended architecture and math.
- `docs/PROGRESS.md` tracks what's actually been built. Update on every
  shipped slice.
- If this document and `docs/PROGRESS.md` disagree, `PROGRESS.md` wins for
  current reality and this document wins for intended direction.
- Major scope changes update both files in the same change.
