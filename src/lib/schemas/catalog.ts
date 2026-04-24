import { z } from 'zod';
import { ITEM_EXTERIORS, ITEM_RARITIES, type ItemExterior, type ItemRarity } from '$lib/types/enums';

export const catalogSourceKindSchema = z.enum(['LOCAL_CS2_VPK', 'STEAM_VALIDATION', 'MANUAL_PATCH']);

export const catalogSourceFileSchema = z.object({
	kind: catalogSourceKindSchema,
	path: z.string().min(1),
	entryPath: z.string().min(1),
	lastModified: z.string().datetime(),
	sha256: z.string().regex(/^[0-9a-f]{64}$/)
});

export const catalogProvenanceSchema = z.object({
	primarySource: catalogSourceKindSchema,
	details: z.array(z.string().min(1)).min(1)
});

export const itemRaritySchema = z.enum(ITEM_RARITIES);
export const itemExteriorSchema = z.enum(ITEM_EXTERIORS);

export const catalogCollectionSchema = z.object({
	id: z.string().min(1),
	key: z.string().min(1),
	itemSetKey: z.string().min(1),
	name: z.string().min(1),
	skinCount: z.number().int().nonnegative(),
	source: catalogProvenanceSchema
});

export const catalogWeaponSchema = z.object({
	defIndex: z.number().int().nonnegative(),
	key: z.string().min(1),
	className: z.string().min(1),
	marketName: z.string().min(1),
	source: catalogProvenanceSchema
});

export const catalogPaintKitSchema = z.object({
	paintIndex: z.number().int().nonnegative(),
	key: z.string().min(1),
	name: z.string().min(1),
	descriptionTag: z.string().min(1).nullable(),
	rarity: itemRaritySchema.nullable(),
	minFloat: z.number().min(0).max(1),
	maxFloat: z.number().min(0).max(1),
	exteriors: z.array(itemExteriorSchema).min(1),
	weaponDefIndexes: z.array(z.number().int().nonnegative()),
	collectionIds: z.array(z.string().min(1)),
	source: catalogProvenanceSchema
});

export const catalogMarketHashNameSchema = z.object({
	exterior: itemExteriorSchema,
	marketHashName: z.string().min(1)
});

export const catalogSkinSchema = z.object({
	id: z.string().min(1),
	defIndex: z.number().int().nonnegative(),
	paintIndex: z.number().int().nonnegative(),
	weaponKey: z.string().min(1),
	weaponName: z.string().min(1),
	skinName: z.string().min(1),
	baseMarketHashName: z.string().min(1),
	collectionId: z.string().min(1),
	collectionName: z.string().min(1),
	rarity: itemRaritySchema.nullable(),
	minFloat: z.number().min(0).max(1),
	maxFloat: z.number().min(0).max(1),
	exteriors: z.array(itemExteriorSchema).min(1),
	marketHashNames: z.array(catalogMarketHashNameSchema).min(1),
	source: catalogProvenanceSchema
});

export const catalogSnapshotSchema = z.object({
	snapshotVersion: z.number().int().positive(),
	generatedAt: z.string().datetime(),
	gamePath: z.string().min(1),
	sourceFiles: z.array(catalogSourceFileSchema).min(1),
	stats: z.object({
		collectionCount: z.number().int().nonnegative(),
		weaponCount: z.number().int().nonnegative(),
		paintKitCount: z.number().int().nonnegative(),
		skinCount: z.number().int().nonnegative()
	}),
	collections: z.array(catalogCollectionSchema),
	weapons: z.array(catalogWeaponSchema),
	paintKits: z.array(catalogPaintKitSchema),
	skins: z.array(catalogSkinSchema)
});

export type CatalogSourceKind = z.infer<typeof catalogSourceKindSchema>;
export type CatalogSourceFile = z.infer<typeof catalogSourceFileSchema>;
export type CatalogProvenance = z.infer<typeof catalogProvenanceSchema>;
export type CatalogCollection = z.infer<typeof catalogCollectionSchema>;
export type CatalogWeapon = z.infer<typeof catalogWeaponSchema>;
export type CatalogPaintKit = z.infer<typeof catalogPaintKitSchema>;
export type CatalogMarketHashName = z.infer<typeof catalogMarketHashNameSchema>;
export type CatalogSkin = z.infer<typeof catalogSkinSchema>;
export type CatalogSnapshot = z.infer<typeof catalogSnapshotSchema>;
export type { ItemExterior, ItemRarity };
