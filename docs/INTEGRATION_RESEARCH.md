# Extension And Trade-Up Data Source Notes

**Last Updated:** 2026-04-22

This note captures the current integration path for getting real candidate
listings and external trade-up ideas into `cs-tradeups`.

## CS2 Trader Extension

The extension currently referenced by the project is **CS2 Trader - Steam
Trading Enhancer**.

Relevant facts:

- Chrome Web Store lists it as version 3.6, updated 2026-04-19, with roughly
  400,000 users.
- The extension is open source at
  `https://github.com/gergelyszabo94/csgo-trader-extension`.
- Its manifest runs a content script on Steam market listing pages:
  `*://steamcommunity.com/market/listings/*`.
- The market listing script reads Steam page globals (`g_rgListingInfo`,
  `g_rgAssets`), attaches listing metadata to rows, and stores float, paint
  index, paint seed, and sticker price attributes on listing DOM elements.
- The extension already has host access to Steam and its own pricing APIs,
  but not to this local app.

Recommended bridge:

1. Do **not** fork the whole CS2 Trader extension unless needed. It is large
   and GPL-licensed.
2. Build a tiny companion userscript/bookmarklet or local browser extension
   that runs after CS2 Trader on Steam market pages.
3. Read the enriched DOM/listing data that CS2 Trader already injects:
   listing id, market hash name, inspect link, price, float, paint seed,
   paint index, and listing URL.
4. POST normalized candidates to this app's existing
   `POST /api/extension/candidates` endpoint with `X-Extension-Secret`.

This keeps `cs-tradeups` independent from CS2 Trader internals while still
benefiting from the float enrichment the operator already uses.

## Trade-Up Sources Worth Evaluating

### TradeUpLab

`https://www.tradeuplab.com/tradeups/` is currently the most practical public
scrape candidate found.

Why it is useful:

- The trade-up list renders as ordinary HTML with repeated contract blocks.
- Each block includes collections and counts, input rarity, average input
  float, input cost, expected value, profit, profitability, success rate,
  input items, possible outcomes, and identified date.
- This maps well to local `TradeupPlan`, `TradeupPlanRule`, and
  `TradeupOutcomeItem` drafts.

Suggested MVP importer:

1. Add a local-only import script that fetches the public page and parses
   contract blocks.
2. Store parsed rows as **draft plans**, not active plans.
3. Require operator review before activation because external prices and
   outcome modeling may not match this app's EV engine.

### CSTradeUp

`https://cstradeup.net/` is also relevant. It advertises free trade-up
contracts, real-time prices, a simulator, float finder, and a browser
extension. Its public pages are useful for research, but account-gated or
extension-synced data should not be scraped without explicit permission.

## Production Recommendation

Prioritize these in order:

1. Finish the local candidate pipeline and bulk workflow.
2. Add a companion browser bridge for Steam market pages using CS2 Trader's
   enriched DOM.
3. Add a TradeUpLab draft-plan importer for strategy discovery.
4. Only then evaluate direct marketplace/price APIs or authenticated data
   syncs.

This keeps the system operator-controlled and avoids depending on unstable
third-party private APIs.
