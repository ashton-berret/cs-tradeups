// GET  /api/candidates  — paginated, filtered candidate list
// POST /api/candidates  — manual candidate creation (not the extension path)
//
// GET query-string keys correspond to fields on `candidateFilterSchema`
// ($lib/schemas/candidate). Values are coerced from strings via
// `coerceSearchParams` before Zod parsing.
//
// POST body is validated with `createCandidateSchema`. The service
// performs duplicate-merge + evaluation; the returned DTO already has
// evaluation fields populated.
//
// Response codes:
//   GET  200  PaginatedResponse<CandidateDTO>
//   POST 201  CandidateDTO
//   400 ValidationError
//   409 ConflictError on service-level invariant failures

import { json, type RequestHandler } from '@sveltejs/kit';
import { createCandidateSchema, candidateFilterSchema } from '$lib/schemas/candidate';
import { createCandidate, listCandidates } from '$lib/server/candidates/candidateService';
import { coerceSearchParams } from '$lib/server/http/query';
import { toErrorResponse } from '$lib/server/http/errors';

export const GET: RequestHandler = async ({ url }) => {
  try {
    const filter = candidateFilterSchema.parse(
      coerceSearchParams(url.searchParams, candidateFilterSchema),
    );
    const page = await listCandidates(filter);
    return json(page);
  } catch (err) {
    return toErrorResponse(err);
  }
};

export const POST: RequestHandler = async ({ request }) => {
  try {
    const body = await request.json();
    const input = createCandidateSchema.parse(body);
    const candidate = await createCandidate(input);
    return json(candidate, { status: 201 });
  } catch (err) {
    return toErrorResponse(err);
  }
};
