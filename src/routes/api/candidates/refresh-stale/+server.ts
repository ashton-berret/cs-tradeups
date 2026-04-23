// POST /api/candidates/refresh-stale
//
// Re-score open candidates whose stored evaluation is older than the
// reevaluationPolicy cutoff. Use this when marketplace prices have moved
// and the persisted expected-profit numbers on the /candidates page may
// no longer reflect reality. Safe to hit repeatedly.
//
// Body (optional):
//   { "olderThanMs": 21600000 }   // defaults to 6h when omitted
//
// Response codes:
//   200  { count: number } — number of rows re-evaluated
//   400  ValidationError

import { json, type RequestHandler } from '@sveltejs/kit';
import { refreshStaleCandidatesSchema } from '$lib/schemas/candidate';
import { reevaluateOpenCandidates } from '$lib/server/candidates/candidateService';
import { REEVAL_THRESHOLDS } from '$lib/server/candidates/reevaluationPolicy';
import { toErrorResponse } from '$lib/server/http/errors';

export const POST: RequestHandler = async ({ request }) => {
  try {
    const raw = await safeReadJson(request);
    const { olderThanMs } = refreshStaleCandidatesSchema.parse(raw ?? {});
    const result = await reevaluateOpenCandidates({
      olderThanMs: olderThanMs ?? REEVAL_THRESHOLDS.STALE_AFTER_MS,
    });
    return json(result);
  } catch (err) {
    return toErrorResponse(err);
  }
};

async function safeReadJson(request: Request): Promise<unknown> {
  const contentType = request.headers.get('content-type') ?? '';
  if (!contentType.includes('application/json')) {
    return null;
  }

  const text = await request.text();
  if (!text) {
    return null;
  }

  return JSON.parse(text);
}
