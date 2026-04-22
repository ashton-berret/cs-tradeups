// POST /api/extension/candidates
//
// Third-party Chrome extension ingestion point. The payload shape is
// whatever the CS2 Trader extension sends; `extensionCandidateSchema` is
// permissive (`.passthrough()`) and only requires the minimum fields
// needed to persist a candidate.
//
// Guarded by the shared-secret header (see requireExtensionSecret).
//
// Pipeline:
//   1. Verify X-Extension-Secret
//   2. Parse body with extensionCandidateSchema
//   3. Delegate to candidateService.ingestExtensionCandidate
//   4. Return { candidate, wasDuplicate } so the extension can show the
//      user whether this listing was already known.
//
// Response codes:
//   201 Created          new candidate persisted (or a duplicate was merged)
//   400 ValidationError  body failed schema validation
//   401 Unauthorized     missing/bad shared-secret header
//   503 Unavailable      EXTENSION_SHARED_SECRET env var not configured

import { json, type RequestHandler } from '@sveltejs/kit';
import { extensionCandidateSchema } from '$lib/schemas/candidate';
import { ingestExtensionCandidate } from '$lib/server/candidates/candidateService';
import { requireExtensionSecret } from '$lib/server/http/extensionAuth';
import { toErrorResponse } from '$lib/server/http/errors';

export const POST: RequestHandler = async ({ request }) => {
  try {
    requireExtensionSecret(request);
    const body = await request.json();
    const payload = extensionCandidateSchema.parse(body);
    const result = await ingestExtensionCandidate(payload);
    return json(result, { status: 201 });
  } catch (err) {
    return toErrorResponse(err);
  }
};
