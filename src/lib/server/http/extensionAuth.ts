// Shared-secret guard for the extension ingestion endpoint.
//
// Policy (Phase 3, local-only MVP):
//   - Required header: `X-Extension-Secret`
//   - Required env var: `EXTENSION_SHARED_SECRET`
//   - If the env var is unset at request time, the guard rejects with 503
//     rather than allowing the endpoint to run unauthenticated. This is a
//     deliberate fail-closed stance — we'd rather a dev notice the missing
//     env var than silently accept any request.
//   - If the header is missing or does not match the env value, the guard
//     throws `UnauthorizedError` (401).
//
// This is intentionally minimal: no rotating secrets, no request signing,
// no rate limiting. See PLAN.md > MVP Security.

import { env } from '$env/dynamic/private';
import { ServiceUnavailableError, UnauthorizedError } from './errors';

export const EXTENSION_SECRET_HEADER = 'x-extension-secret';
export const EXTENSION_SECRET_ENV = 'EXTENSION_SHARED_SECRET';

/**
 * Assert the request carries the shared secret. Throws on failure; the
 * route's try/catch converts the throw into the appropriate HTTP response.
 */
export function requireExtensionSecret(request: Request): void {
  const expected = env[EXTENSION_SECRET_ENV];

  if (!expected) {
    throw new ServiceUnavailableError(
      `Extension endpoint misconfigured: ${EXTENSION_SECRET_ENV} is not set`,
    );
  }

  const provided = request.headers.get(EXTENSION_SECRET_HEADER);
  if (!provided || provided !== expected) {
    throw new UnauthorizedError('Invalid or missing extension shared secret');
  }
}
