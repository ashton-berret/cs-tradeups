import { z } from 'zod';
import { cuidSchema } from './shared';

// Body schema for POST /api/tradeups/evaluate.
// Mirrors the `EvaluateTarget` discriminated union in $lib/types/services so
// the route boundary can hand the parsed value straight to
// `evaluationService.evaluate` without shape conversion.
export const evaluateTargetSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('candidate'), id: cuidSchema }),
  z.object({ kind: z.literal('inventory'), id: cuidSchema }),
  z.object({ kind: z.literal('basket'), id: cuidSchema }),
]);
