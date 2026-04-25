import { z } from 'zod';
import { itemExteriorSchema, moneySchema, paginationSchema, sortDirectionSchema } from './shared';

const marketPriceObservationFields = {
    marketHashName: z.string().min(1),
    currency: z.string().default('USD'),
    lowestSellPrice: moneySchema.optional(),
    medianSellPrice: moneySchema.optional(),
    volume: z.number().int().nonnegative().optional(),
    source: z.string().min(1).default('LOCAL_IMPORT'),
    observedAt: z.coerce.date().optional(),
    rawPayload: z.unknown().optional(),
  };

function hasPriceField(value: { lowestSellPrice?: number; medianSellPrice?: number }) {
  return value.lowestSellPrice != null || value.medianSellPrice != null;
}

export const marketPriceObservationSchema = z
  .object(marketPriceObservationFields)
  .refine(
    hasPriceField,
    {
      message: 'At least one price field is required',
      path: ['lowestSellPrice'],
    },
  );

export const marketPriceImportObservationSchema = z
  .object({
    marketHashName: marketPriceObservationFields.marketHashName,
    currency: marketPriceObservationFields.currency,
    lowestSellPrice: marketPriceObservationFields.lowestSellPrice,
    medianSellPrice: marketPriceObservationFields.medianSellPrice,
    volume: marketPriceObservationFields.volume,
    observedAt: marketPriceObservationFields.observedAt,
    rawPayload: marketPriceObservationFields.rawPayload,
  })
  .refine(hasPriceField, {
    message: 'At least one price field is required',
    path: ['lowestSellPrice'],
  });

export const marketPriceImportSchema = z.object({
  source: z.string().min(1).default('LOCAL_IMPORT'),
  observations: z.array(marketPriceImportObservationSchema).min(1).max(500),
});

export const marketPriceLookupSchema = z.object({
  marketHashName: z.string().min(1).optional(),
  catalogSkinId: z.string().min(1).optional(),
  exterior: itemExteriorSchema.optional(),
  currency: z.string().default('USD'),
});

export const marketPriceLatestListSchema = z
  .object({
    search: z.string().optional(),
    source: z.string().optional(),
    currency: z.string().optional(),
    latestOnly: z.boolean().default(true),
    sortBy: z.enum(['observedAt', 'marketValue', 'source', 'currency']).default('observedAt'),
    sortDir: sortDirectionSchema,
  })
  .merge(paginationSchema);
