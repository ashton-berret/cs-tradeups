// GET    /api/candidates/[id]  — single candidate with derived staleness
// PATCH  /api/candidates/[id]  — status/notes update (see updateCandidateSchema)
// DELETE /api/candidates/[id]  — hard delete; blocked if linked to inventory
//
// Status transition notes: the service rejects BOUGHT/DUPLICATE/INVALID via
// this path — BOUGHT flows through /api/candidates/[id]/buy and
// DUPLICATE/INVALID are evaluation-owned.
//
// Response codes:
//   GET    200 | 404
//   PATCH  200 CandidateDTO | 400 | 404 | 409
//   DELETE 204 | 404 | 409

import { json, type RequestHandler } from '@sveltejs/kit';
import { updateCandidateSchema } from '$lib/schemas/candidate';
import {
  deleteCandidate,
  getCandidate,
  updateCandidate,
} from '$lib/server/candidates/candidateService';
import { NotFoundError, toErrorResponse } from '$lib/server/http/errors';

export const GET: RequestHandler = async ({ params }) => {
  try {
    const candidate = await getCandidate(params.id!);
    if (!candidate) {
      throw new NotFoundError(`Candidate not found: ${params.id}`);
    }
    return json(candidate);
  } catch (err) {
    return toErrorResponse(err);
  }
};

export const PATCH: RequestHandler = async ({ params, request }) => {
  try {
    const body = await request.json();
    const input = updateCandidateSchema.parse(body);
    const candidate = await updateCandidate(params.id!, input);
    return json(candidate);
  } catch (err) {
    return toErrorResponse(err);
  }
};

export const DELETE: RequestHandler = async ({ params }) => {
  try {
    await deleteCandidate(params.id!);
    return new Response(null, { status: 204 });
  } catch (err) {
    return toErrorResponse(err);
  }
};
