// URL normalization for listing comparisons.
//
// Duplicate detection uses URL equality as a fallback when listingId is not
// present. Marketplace listings often carry tracking/session parameters that
// would otherwise force us to create new rows for the same underlying listing.

const TRACKING_PARAM_PREFIXES = ['utm_', 'fb', 'gclid', 'msclkid'];
const TRACKING_PARAM_EXACT = new Set(['ref', 'source', 'campaign']);

/**
 * Canonicalize a listing URL for equality comparison.
 *   - lowercase protocol + host
 *   - strip hash fragments
 *   - strip tracking query params (utm_*, gclid, etc.)
 *   - drop trailing slashes on the path (but keep the root "/")
 *
 * Returns null when the input is not a parseable URL — callers treat that
 * as "no URL match available."
 */
export function normalizeListingUrl(input: string | null | undefined): string | null {
  if (!input) {
    return null;
  }

  let url: URL;

  try {
    url = new URL(input);
  } catch {
    return null;
  }

  url.hash = '';
  url.protocol = url.protocol.toLowerCase();
  url.host = url.host.toLowerCase();

  const filtered = new URLSearchParams();
  for (const [key, value] of url.searchParams) {
    const lowered = key.toLowerCase();
    if (TRACKING_PARAM_EXACT.has(lowered)) continue;
    if (TRACKING_PARAM_PREFIXES.some((prefix) => lowered.startsWith(prefix))) continue;
    filtered.append(key, value);
  }
  url.search = filtered.toString();

  if (url.pathname.length > 1 && url.pathname.endsWith('/')) {
    url.pathname = url.pathname.replace(/\/+$/, '');
  }

  return url.toString();
}
