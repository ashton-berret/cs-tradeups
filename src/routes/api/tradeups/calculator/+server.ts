// POST /api/tradeups/calculator
//
// Scratchpad EV evaluation: punch in 10 hypothetical inputs against a plan,
// see EV/profit/breakdown. No persistence — every call is independent.
//
// Response codes:
//   200  CalculatorResult
//   400  ValidationError
//   404  NotFoundError (plan id)

import { json, type RequestHandler } from '@sveltejs/kit';
import { calculatorRequestSchema } from '$lib/schemas/calculator';
import { calculate } from '$lib/server/tradeups/calculatorService';
import { toErrorResponse } from '$lib/server/http/errors';

export const POST: RequestHandler = async ({ request }) => {
  try {
    const body = await request.json();
    const parsed = calculatorRequestSchema.parse(body);
    const result = await calculate(parsed);
    return json(result);
  } catch (err) {
    return toErrorResponse(err);
  }
};
