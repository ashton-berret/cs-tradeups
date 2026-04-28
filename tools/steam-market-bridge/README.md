# Steam Market Bridge

This is a small companion Chrome extension for `cs-tradeups`.

It runs on Steam Market listing pages, reads:

- Steam page globals (`g_rgListingInfo`, `g_rgAssets`) for listing id, price,
  asset metadata, and inspect-link templates
- float-enrichment DOM added by CS2 Trader / CSFloat-style page scripts for
  float, paint seed, min float, max float, and paint index
  - rows without float enrichment can still be ingested, but they will save
    without float-derived fields

Then it posts a normalized payload to the app's existing
`POST /api/extension/candidates` endpoint.

## Why it lives here

This is operator tooling, not app runtime code. Keeping it under
`tools/steam-market-bridge/` matches the repo architecture better than
embedding browser-extension concerns inside `src/`.

## Install

1. Set `EXTENSION_SHARED_SECRET` in the app `.env`.
2. Open Chrome and go to `chrome://extensions`.
3. Enable Developer Mode.
4. Choose **Load unpacked** and select `tools/steam-market-bridge/`.
5. Open the extension's options page.
6. Set:
   - app URL: usually `http://127.0.0.1:5173`
   - shared secret: the same value as `EXTENSION_SHARED_SECRET`

## Use

1. Start the local app.
2. Open a Steam Market listing page for a CS2 item.
3. Let CS2 Trader / CSFloat finish rendering float data for listing rows.
4. Click `Ingest` next to the row you want to send into `cs-tradeups`.

The extension reports whether the candidate was saved or merged as a duplicate,
whether the app catalog-linked the item, and whether normalization warnings
were returned.

## Discovery collector

The app's `/buy-queue` page and the extension options page include a
`Run Discovery` control. It:

1. Fetches `GET /api/discovery/targets` from the local app using the shared
   secret.
2. Opens the returned Steam Market listing pages one at a time in a background
   tab.
3. Waits for Steam and float-enrichment DOM to render.
4. Extracts visible listing rows and filters them against the target's
   max-buy, exterior, and float constraints.
5. Posts matching rows to `POST /api/extension/candidates`.

The collector does not click buy buttons, create orders, confirm purchases,
log in, answer Steam Guard, list items, or create trade offers. It only reads
visible listing facts and submits candidate observations.

If the `/buy-queue` button does not respond, reload the unpacked extension in
`chrome://extensions`, then refresh the app page. The app talks to the
extension through a local-only content bridge injected on `localhost` and
`127.0.0.1`.

For live smoke testing, ingest a small spread of rows:

- a normal catalog-match row with float enrichment
- a StatTrak or Souvenir row
- a row before/without float enrichment
- a row with no inspect link
- the same listing twice, to confirm duplicate merging

## Notes

- No build step is required.
- Prices are sourced from Steam listing metadata, not OCR or scraped text.
- The bridge intentionally posts a lean payload. The app remains responsible
  for validation, duplicate handling, persistence, and evaluation.
