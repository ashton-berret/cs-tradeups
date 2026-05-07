import { json, type RequestHandler } from '@sveltejs/kit';
import { z } from 'zod';
import { recomputeQuantiles } from '$lib/server/engine/priceQuantileService';
import { toErrorResponse } from '$lib/server/http/errors';

const bodySchema = z
  .object({
    catalogSkinIds: z.array(z.string()).optional(),
    exteriors: z.array(z.string()).optional(),
    statTrakValues: z.array(z.boolean()).optional(),
    sourceFilter: z
      .object({
        exclude: z.array(z.string()).optional(),
      })
      .optional(),
  })
  .optional();

export const POST: RequestHandler = async ({ request }) => {
  try {
    const raw = request.headers.get('content-length') === '0' ? undefined : await request.json().catch(() => undefined);
    const body = bodySchema.parse(raw);

    const result = await recomputeQuantiles(
      body
        ? {
            catalogSkinIds: body.catalogSkinIds,
            exteriors: body.exteriors as import('$lib/types/enums').ItemExterior[] | undefined,
            statTrakValues: body.statTrakValues,
          }
        : undefined,
      body?.sourceFilter,
    );

    return json(result);
  } catch (err) {
    return toErrorResponse(err);
  }
};
