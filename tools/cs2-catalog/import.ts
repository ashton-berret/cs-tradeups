import { createHash } from 'node:crypto';
import { mkdir, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import {
	catalogSnapshotSchema,
	type CatalogCollection,
	type CatalogPaintKit,
	type CatalogSkin,
	type CatalogSourceFile,
	type CatalogWeapon,
	type ItemExterior,
	type ItemRarity,
} from '../../src/lib/schemas/catalog';
import { EXTERIOR_FLOAT_RANGES, EXTERIOR_LABELS, ITEM_EXTERIORS } from '../../src/lib/types/enums';
import { kvEntries, kvMergedObject, kvObject, kvString, parseKeyValuesText, type KeyValue, type KeyValueObject } from './keyvalues';
import { loadVpkDirectory, readVpkEntry } from './vpk';

const DEFAULT_GAME_PATH = 'D:\\SteamLibrary\\steamapps\\common\\Counter-Strike Global Offensive';
const DEFAULT_OUTPUT_PATH = 'src/lib/server/catalog/generated/cs2-catalog.snapshot.json';

const TARGET_FILES = {
	itemsGame: 'scripts/items/items_game.txt',
	localization: 'resource/csgo_english.txt',
} as const;

interface CliOptions {
	gamePath: string;
	outputPath: string;
	inspectOnly: boolean;
	listEntriesPattern: string | null;
}

interface LocalizationMap {
	get(token: string | undefined): string | null;
}

interface NormalizedCatalog {
	collections: CatalogCollection[];
	weapons: CatalogWeapon[];
	paintKits: CatalogPaintKit[];
	skins: CatalogSkin[];
}

async function main(): Promise<void> {
	const options = parseArgs(process.argv.slice(2));
	const directoryFilePath = path.join(options.gamePath, 'game', 'csgo', 'pak01_dir.vpk');
	const { buffer: directoryBuffer, directory } = await loadVpkDirectory(directoryFilePath);

	const itemsGameEntry = findEntryOrThrow(directory, TARGET_FILES.itemsGame);
	const localizationEntry = findEntryOrThrow(directory, TARGET_FILES.localization);

	const [itemsGameBuffer, localizationBuffer] = await Promise.all([
		readVpkEntry(directoryFilePath, directoryBuffer, directory, itemsGameEntry),
		readVpkEntry(directoryFilePath, directoryBuffer, directory, localizationEntry),
	]);

	if (options.listEntriesPattern) {
		const pattern = options.listEntriesPattern.toLowerCase();
		const entries = Array.from(directory.entries.values())
			.map((entry) => entry.fullPath)
			.filter((entryPath) => entryPath.toLowerCase().includes(pattern))
			.sort();

		console.log(JSON.stringify({ pattern: options.listEntriesPattern, entries }, null, 2));
		return;
	}

	const itemsGameText = decodeText(itemsGameBuffer);
	const localizationText = decodeText(localizationBuffer);

	const itemsGame = parseKeyValuesText(itemsGameText);
	const localization = buildLocalizationMap(parseKeyValuesText(localizationText));

	if (options.inspectOnly) {
		printInspection(itemsGame, itemsGameEntry.fullPath, localizationEntry.fullPath);
		return;
	}

	const normalized = buildCatalog(itemsGame, localization);
	const sourceFiles = await Promise.all([
		buildSourceFile(directoryFilePath, itemsGameEntry.fullPath, itemsGameBuffer),
		buildSourceFile(directoryFilePath, localizationEntry.fullPath, localizationBuffer),
	]);

	const snapshot = catalogSnapshotSchema.parse({
		snapshotVersion: 1,
		generatedAt: new Date().toISOString(),
		gamePath: path.resolve(options.gamePath),
		sourceFiles,
		stats: {
			collectionCount: normalized.collections.length,
			weaponCount: normalized.weapons.length,
			paintKitCount: normalized.paintKits.length,
			skinCount: normalized.skins.length,
		},
		...normalized,
	});

	const outputPath = path.resolve(options.outputPath);
	await mkdir(path.dirname(outputPath), { recursive: true });
	await writeFile(outputPath, `${JSON.stringify(snapshot, null, 2)}\n`, 'utf8');

	console.log(
		JSON.stringify(
			{
				outputPath,
				stats: snapshot.stats,
			},
			null,
			2,
		),
	);
}

function parseArgs(args: string[]): CliOptions {
	const options: CliOptions = {
		gamePath: DEFAULT_GAME_PATH,
		outputPath: DEFAULT_OUTPUT_PATH,
		inspectOnly: false,
		listEntriesPattern: null,
	};

	for (let index = 0; index < args.length; index += 1) {
		const arg = args[index];
		switch (arg) {
			case '--game-path':
				options.gamePath = expectValue(args, ++index, '--game-path');
				break;
			case '--output':
				options.outputPath = expectValue(args, ++index, '--output');
				break;
			case '--inspect':
				options.inspectOnly = true;
				break;
			case '--list-entries':
				options.listEntriesPattern = expectValue(args, ++index, '--list-entries');
				break;
			default:
				throw new Error(`Unknown argument: ${arg}`);
		}
	}

	return options;
}

function expectValue(args: string[], index: number, flag: string): string {
	const value = args[index];
	if (!value) {
		throw new Error(`Missing value for ${flag}`);
	}
	return value;
}

function findEntryOrThrow(
	directory: Awaited<ReturnType<typeof loadVpkDirectory>>['directory'],
	targetPath: string,
) {
	const entry = directory.entries.get(targetPath.toLowerCase());
	if (!entry) {
		throw new Error(`Required VPK entry not found: ${targetPath}`);
	}
	return entry;
}

function decodeText(buffer: Buffer): string {
	if (buffer.length >= 2) {
		const bom = buffer.readUInt16LE(0);
		if (bom === 0xfeff || bom === 0xfffe) {
			return buffer.toString('utf16le');
		}
	}

	if (buffer.length >= 3 && buffer[0] === 0xef && buffer[1] === 0xbb && buffer[2] === 0xbf) {
		return buffer.toString('utf8');
	}

	return buffer.toString('utf8');
}

function buildLocalizationMap(root: KeyValueObject): LocalizationMap {
	const lang = kvMergedObject(root.lang) ?? kvMergedObject(root.Language) ?? root;
	const tokens = kvMergedObject(lang.Tokens) ?? kvMergedObject(lang.tokens) ?? {};
	const normalized = new Map<string, string>();

	for (const [key, value] of kvEntries(tokens)) {
		const resolved = kvString(value);
		if (resolved != null) {
			normalized.set(key.toLowerCase(), resolved);
		}
	}

	return {
		get(token: string | undefined): string | null {
			if (!token) return null;
			const normalizedToken = token.replace(/^#/, '').toLowerCase();
			return normalized.get(normalizedToken) ?? null;
		},
	};
}

function printInspection(itemsGame: KeyValueObject, itemsGamePath: string, localizationPath: string): void {
	const rootKey = Object.keys(itemsGame)[0] ?? '(unknown)';
	const root = kvMergedObject(itemsGame[rootKey]) ?? itemsGame;
	const topLevelKeys = Object.keys(root).sort();
	const itemSets = kvMergedObject(root.item_sets);
	const paintKitRarity = kvMergedObject(root.paint_kits_rarity);
	const itemsGameLive = kvMergedObject(root.items_game_live);
	const clientLootLists = kvMergedObject(root.client_loot_lists);

	console.log(JSON.stringify({
		itemsGamePath,
		localizationPath,
		rootKey,
		topLevelKeys,
		sectionCounts: {
			items: kvEntries(kvObject(root.items)).length,
			itemsMerged: kvEntries(kvMergedObject(root.items)).length,
			itemSets: kvEntries(itemSets).length,
			paintKits: kvEntries(kvObject(root.paint_kits)).length,
			paintKitsMerged: kvEntries(kvMergedObject(root.paint_kits)).length,
			paintKitRarity: kvEntries(paintKitRarity).length,
			alternateIcons: kvEntries(kvMergedObject(kvMergedObject(root.alternate_icons2)?.weapon_icons)).length,
			itemsGameLive: kvEntries(itemsGameLive).length,
			clientLootLists: kvEntries(clientLootLists).length,
		},
		sectionKeys: {
			itemSets: kvEntries(itemSets)
				.slice(0, 10)
				.map(([key]) => key),
			paintKitRarity: kvEntries(paintKitRarity)
				.slice(0, 10)
				.map(([key]) => key),
			itemsGameLive: kvEntries(itemsGameLive)
				.slice(0, 10)
				.map(([key]) => key),
			clientLootLists: kvEntries(clientLootLists)
				.slice(0, 10)
				.map(([key]) => key),
		},
		samples: {
			itemSet: takeSampleObject(itemSets),
			paintKit: takeSampleObject(kvObject(root.paint_kits)),
			item: takeSampleObject(kvMergedObject(root.items)),
			paintKitRarity: takeSampleObject(paintKitRarity),
			itemsGameLive: takeSampleObject(itemsGameLive),
			clientLootLists: takeSampleObject(clientLootLists),
		},
	}, null, 2));
}

function takeSampleObject(object: KeyValueObject | undefined): unknown {
	const [key, value] = kvEntries(object)[0] ?? [];
	return key ? { key, value } : null;
}

function buildCatalog(itemsGameDocument: KeyValueObject, localization: LocalizationMap): NormalizedCatalog {
	const root = kvMergedObject(itemsGameDocument.items_game) ?? itemsGameDocument;
	const paintKitsSection = kvMergedObject(root.paint_kits) ?? {};
	const paintKitRaritySection = kvMergedObject(root.paint_kits_rarity) ?? {};
	const itemsSection = kvMergedObject(root.items) ?? {};
	const itemSetsSection = kvMergedObject(root.item_sets) ?? {};
	const prefabsSection = kvMergedObject(root.prefabs) ?? {};
	const weaponIconsSection = kvMergedObject(kvMergedObject(root.alternate_icons2)?.weapon_icons) ?? {};

	const weaponDefs = extractWeaponDefinitions(itemsSection, prefabsSection, localization);
	const collectionDefs = extractCollections(itemSetsSection, localization);
	const paintKitDefs = extractPaintKits(paintKitsSection, paintKitRaritySection, localization);
	const iconPairs = extractWeaponPaintPairs(weaponIconsSection);

	const collectionBySetKey = new Map(collectionDefs.map((collection) => [collection.itemSetKey, collection]));
	const weaponByKey = new Map(weaponDefs.map((weapon) => [weapon.key, weapon]));
	const paintKitByKey = new Map(paintKitDefs.map((paintKit) => [paintKit.key, paintKit]));

	const skins: CatalogSkin[] = [];
	const seenSkinIds = new Set<string>();
	const paintKitWeaponMap = new Map<number, Set<number>>();
	const paintKitCollectionMap = new Map<number, Set<string>>();
	const collectionSkinCounts = new Map<string, number>();

	for (const collectionEntry of kvEntries(itemSetsSection)) {
		const [itemSetKey, rawCollection] = collectionEntry;
		const collectionObject = kvObject(rawCollection);
		if (!collectionObject) continue;

		const collection = collectionBySetKey.get(itemSetKey);
		if (!collection) continue;

		for (const itemRef of extractCollectionItemRefs(collectionObject)) {
			const weapon = weaponByKey.get(itemRef.weaponKey);
			const paintKit = paintKitByKey.get(itemRef.paintKitKey);

			if (!weapon || !paintKit) {
				continue;
			}

			const skinId = `${weapon.defIndex}:${paintKit.paintIndex}`;
			if (seenSkinIds.has(skinId)) {
				continue;
			}

			const marketHashNames = paintKit.exteriors.map((exterior) => ({
				exterior,
				marketHashName: `${weapon.marketName} | ${paintKit.name} (${EXTERIOR_LABELS[exterior]})`,
			}));

			skins.push({
				id: skinId,
				defIndex: weapon.defIndex,
				paintIndex: paintKit.paintIndex,
				weaponKey: weapon.key,
				weaponName: weapon.marketName,
				skinName: paintKit.name,
				baseMarketHashName: `${weapon.marketName} | ${paintKit.name}`,
				collectionId: collection.id,
				collectionName: collection.name,
				rarity: paintKit.rarity,
				minFloat: paintKit.minFloat,
				maxFloat: paintKit.maxFloat,
				exteriors: paintKit.exteriors,
				marketHashNames,
				source: {
					primarySource: 'LOCAL_CS2_VPK',
					details: [
						`scripts/items/items_game.txt:item_sets/${itemSetKey}`,
						`scripts/items/items_game.txt:paint_kits/${paintKit.paintIndex}`,
						`resource/csgo_english.txt:${paintKit.descriptionTag ?? paintKit.key}`,
					],
				},
			});

			seenSkinIds.add(skinId);
			incrementSetMap(paintKitWeaponMap, paintKit.paintIndex, weapon.defIndex);
			incrementSetMap(paintKitCollectionMap, paintKit.paintIndex, collection.id);
			collectionSkinCounts.set(collection.id, (collectionSkinCounts.get(collection.id) ?? 0) + 1);
		}
	}

	for (const { weaponKey, paintKitKey } of iconPairs) {
		const weapon = weaponByKey.get(weaponKey);
		const paintKit = paintKitByKey.get(paintKitKey);
		if (!weapon || !paintKit) continue;
		incrementSetMap(paintKitWeaponMap, paintKit.paintIndex, weapon.defIndex);
	}

	const collections = collectionDefs
		.map((collection) => ({
			...collection,
			skinCount: collectionSkinCounts.get(collection.id) ?? 0,
		}))
		.filter((collection) => collection.skinCount > 0)
		.sort((left, right) => left.name.localeCompare(right.name));

	const paintKits = paintKitDefs
		.filter((paintKit) => paintKitWeaponMap.has(paintKit.paintIndex))
		.map((paintKit) => ({
			...paintKit,
			weaponDefIndexes: Array.from(paintKitWeaponMap.get(paintKit.paintIndex) ?? []).sort((a, b) => a - b),
			collectionIds: Array.from(paintKitCollectionMap.get(paintKit.paintIndex) ?? []).sort((a, b) => a.localeCompare(b)),
		}))
		.sort((left, right) => left.paintIndex - right.paintIndex);

	const weaponIds = new Set(skins.map((skin) => skin.defIndex));
	const weapons = weaponDefs
		.filter((weapon) => weaponIds.has(weapon.defIndex))
		.sort((left, right) => left.marketName.localeCompare(right.marketName));

	return {
		collections,
		weapons,
		paintKits,
		skins: skins.sort((left, right) => left.marketHashNames[0]!.marketHashName.localeCompare(right.marketHashNames[0]!.marketHashName)),
	};
}

function extractWeaponDefinitions(
	itemsSection: KeyValueObject,
	prefabsSection: KeyValueObject,
	localization: LocalizationMap,
): CatalogWeapon[] {
	const weapons: CatalogWeapon[] = [];

	for (const [defIndexKey, rawItem] of kvEntries(itemsSection)) {
		if (!/^\d+$/.test(defIndexKey)) continue;

		const item = kvObject(rawItem);
		if (!item) continue;

		const resolvedItem = resolveItemWithPrefabs(item, prefabsSection);
		const name = kvString(resolvedItem.name);
		const itemClass = kvString(resolvedItem.item_class);
		if (!name?.startsWith('weapon_') || !itemClass?.startsWith('weapon_')) {
			continue;
		}

		if (kvString(resolvedItem.baseitem) !== '1') {
			continue;
		}

		const defIndex = Number(defIndexKey);
		const marketName =
			localization.get(kvString(resolvedItem.item_name)) ??
			localization.get(kvString(resolvedItem.item_name_prefixed)) ??
			humanizeWeaponKey(name);

		weapons.push({
			defIndex,
			key: name,
			className: itemClass,
			marketName,
			source: {
				primarySource: 'LOCAL_CS2_VPK',
				details: [
					`scripts/items/items_game.txt:items/${defIndex}`,
					...extractPrefabDetails(resolvedItem),
				],
			},
		});
	}

	return weapons;
}

function extractCollections(itemSetsSection: KeyValueObject, localization: LocalizationMap): Array<
	Omit<CatalogCollection, 'skinCount'>
> {
	const collections: Array<Omit<CatalogCollection, 'skinCount'>> = [];

	for (const [itemSetKey, rawItemSet] of kvEntries(itemSetsSection)) {
		const itemSet = kvObject(rawItemSet);
		if (!itemSet) continue;
		if (!kvObject(itemSet.items)) continue;

		const id = itemSetKey;
		const name = localization.get(kvString(itemSet.name)) ?? humanizeCollectionKey(itemSetKey);

		collections.push({
			id,
			key: itemSetKey,
			itemSetKey,
			name,
			source: {
				primarySource: 'LOCAL_CS2_VPK',
				details: [`scripts/items/items_game.txt:item_sets/${itemSetKey}`],
			},
		});
	}

	return collections;
}

function extractPaintKits(
	paintKitsSection: KeyValueObject,
	paintKitRaritySection: KeyValueObject,
	localization: LocalizationMap,
): Array<Omit<CatalogPaintKit, 'weaponDefIndexes' | 'collectionIds'>> {
	const paintKits: Array<Omit<CatalogPaintKit, 'weaponDefIndexes' | 'collectionIds'>> = [];

	for (const [paintIndexKey, rawPaintKit] of kvEntries(paintKitsSection)) {
		if (!/^\d+$/.test(paintIndexKey)) continue;

		const paintKit = kvObject(rawPaintKit);
		if (!paintKit) continue;

		const paintIndex = Number(paintIndexKey);
		const key = kvString(paintKit.name);
		if (!key || key === 'default') continue;

		const minFloat = parseFloatSafe(kvString(paintKit.wear_remap_min)) ?? 0;
		const maxFloat = parseFloatSafe(kvString(paintKit.wear_remap_max)) ?? 1;
		const descriptionTag = kvString(paintKit.description_tag) ?? null;
		const name = localization.get(descriptionTag) ?? humanizePaintKitKey(key);
		const rarity = normalizeRarity(kvString(paintKitRaritySection[key]));
		const exteriors = supportedExteriors(minFloat, maxFloat);

		paintKits.push({
			paintIndex,
			key,
			name,
			descriptionTag,
			rarity,
			minFloat,
			maxFloat,
			exteriors,
			source: {
				primarySource: 'LOCAL_CS2_VPK',
				details: [
					`scripts/items/items_game.txt:paint_kits/${paintIndex}`,
					`scripts/items/items_game.txt:paint_kits_rarity/${key}`,
					`resource/csgo_english.txt:${descriptionTag ?? key}`,
				],
			},
		});
	}

	return paintKits;
}

function extractCollectionItemRefs(itemSet: KeyValueObject): Array<{ weaponKey: string; paintKitKey: string }> {
	const items = kvObject(itemSet.items);
	if (!items) return [];

	const refs: Array<{ weaponKey: string; paintKitKey: string }> = [];

	for (const [rawItemRef] of kvEntries(items)) {
		const match =
			/^\[(?<paintKit>[^\]]+)\](?<weapon>weapon_[^ ]+)$/i.exec(rawItemRef) ??
			/^(?<weapon>weapon_[^ ]+)\[(?<paintKit>[^\]]+)\]$/i.exec(rawItemRef);

		if (!match?.groups) continue;

		refs.push({
			weaponKey: match.groups.weapon,
			paintKitKey: match.groups.paintKit,
		});
	}

	return refs;
}

function extractWeaponPaintPairs(weaponIconsSection: KeyValueObject): Array<{ weaponKey: string; paintKitKey: string }> {
	const pairs: Array<{ weaponKey: string; paintKitKey: string }> = [];

	for (const [iconPath] of kvEntries(weaponIconsSection)) {
		const match =
			/econ\/default_generated\/(?<weapon>weapon_[^_]+(?:_[^_]+)*)_(?<paintKit>[^_]+(?:_[^_]+)*)_light_large$/i.exec(iconPath) ??
			/econ\/default_generated\/(?<weapon>weapon_[^_]+(?:_[^_]+)*)_(?<paintKit>[^_]+(?:_[^_]+)*)_large$/i.exec(iconPath);

		if (!match?.groups) continue;

		pairs.push({
			weaponKey: match.groups.weapon,
			paintKitKey: match.groups.paintKit,
		});
	}

	return pairs;
}

function supportedExteriors(minFloat: number, maxFloat: number): ItemExterior[] {
	return ITEM_EXTERIORS.filter((exterior) => {
		const [rangeMin, rangeMax] = EXTERIOR_FLOAT_RANGES[exterior];
		return maxFloat > rangeMin && minFloat < rangeMax;
	});
}

function normalizeRarity(value: string | undefined): ItemRarity | null {
	if (!value) return null;

	const normalized = value
		.replace(/^rarity_/i, '')
		.replace(/([a-z])([A-Z])/g, '$1_$2')
		.replace(/[-\s]+/g, '_')
		.toUpperCase();

	switch (normalized) {
		case 'COMMON':
		case 'CONSUMER':
		case 'CONSUMER_GRADE':
			return 'CONSUMER_GRADE';
		case 'UNCOMMON':
		case 'INDUSTRIAL':
		case 'INDUSTRIAL_GRADE':
			return 'INDUSTRIAL_GRADE';
		case 'RARE':
		case 'MILSPEC':
		case 'MIL_SPEC':
			return 'MIL_SPEC';
		case 'MYTHICAL':
		case 'RESTRICTED':
			return 'RESTRICTED';
		case 'LEGENDARY':
		case 'CLASSIFIED':
			return 'CLASSIFIED';
		case 'ANCIENT':
		case 'COVERT':
			return 'COVERT';
		default:
			return null;
	}
}

function parseFloatSafe(value: string | undefined): number | null {
	if (value == null) return null;
	const parsed = Number(value);
	return Number.isFinite(parsed) ? parsed : null;
}

function humanizeCollectionKey(value: string): string {
	return value
		.replace(/^set_/i, '')
		.split(/[_-]+/)
		.map(capitalize)
		.join(' ');
}

function humanizePaintKitKey(value: string): string {
	return value
		.replace(/^(am|an|aq|cu|gs|hy|so|sp)_/i, '')
		.split(/[_-]+/)
		.map(capitalize)
		.join(' ');
}

function humanizeWeaponKey(value: string): string {
	return value
		.replace(/^weapon_/i, '')
		.split(/[_-]+/)
		.map((segment) => {
			if (segment.toUpperCase() === segment) return segment;
			if (segment.length <= 2) return segment.toUpperCase();
			return capitalize(segment);
		})
		.join('-')
		.replace('Mp', 'MP')
		.replace('M4a1', 'M4A1')
		.replace('M4a4', 'M4A4')
		.replace('Usp', 'USP')
		.replace('Ssg', 'SSG')
		.replace('Mag', 'MAG')
		.replace('P250', 'P250');
}

function capitalize(value: string): string {
	return value.length === 0 ? value : value[0]!.toUpperCase() + value.slice(1);
}

function incrementSetMap(map: Map<number, Set<number>>, key: number, value: number): void;
function incrementSetMap(map: Map<number, Set<string>>, key: number, value: string): void;
function incrementSetMap<T>(map: Map<number, Set<T>>, key: number, value: T): void {
	const current = map.get(key) ?? new Set<T>();
	current.add(value);
	map.set(key, current);
}

function resolveItemWithPrefabs(item: KeyValueObject, prefabsSection: KeyValueObject): KeyValueObject {
	const prefabNames = (kvString(item.prefab) ?? '')
		.split(/\s+/)
		.map((value) => value.trim())
		.filter(Boolean);

	let resolved: KeyValueObject = {};
	for (const prefabName of prefabNames) {
		resolved = mergeKeyValueObjects(resolved, resolvePrefab(prefabName, prefabsSection, new Set()));
	}

	return mergeKeyValueObjects(resolved, item);
}

function resolvePrefab(prefabName: string, prefabsSection: KeyValueObject, seen: Set<string>): KeyValueObject {
	if (seen.has(prefabName)) {
		return {};
	}

	const prefab = kvObject(prefabsSection[prefabName]);
	if (!prefab) {
		return {};
	}

	seen.add(prefabName);

	const parentNames = (kvString(prefab.prefab) ?? '')
		.split(/\s+/)
		.map((value) => value.trim())
		.filter(Boolean);

	let resolved: KeyValueObject = {};
	for (const parentName of parentNames) {
		resolved = mergeKeyValueObjects(resolved, resolvePrefab(parentName, prefabsSection, seen));
	}

	return mergeKeyValueObjects(resolved, prefab);
}

function mergeKeyValueObjects(left: KeyValueObject, right: KeyValueObject): KeyValueObject {
	const result: KeyValueObject = { ...left };

	for (const [key, value] of Object.entries(right)) {
		const existing = result[key];
		const leftObject = kvMergedObject(existing);
		const rightObject = kvMergedObject(value as KeyValue | undefined);

		if (leftObject && rightObject) {
			result[key] = mergeKeyValueObjects(leftObject, rightObject);
			continue;
		}

		result[key] = value;
	}

	return result;
}

function extractPrefabDetails(item: KeyValueObject): string[] {
	return (kvString(item.prefab) ?? '')
		.split(/\s+/)
		.map((value) => value.trim())
		.filter(Boolean)
		.map((prefabName) => `scripts/items/items_game.txt:prefabs/${prefabName}`);
}

async function buildSourceFile(directoryFilePath: string, entryPath: string, entryBuffer: Buffer): Promise<CatalogSourceFile> {
	const absolutePath = path.resolve(directoryFilePath);
	const fileStat = await stat(absolutePath);

	return {
		kind: 'LOCAL_CS2_VPK',
		path: absolutePath,
		entryPath,
		lastModified: fileStat.mtime.toISOString(),
		sha256: createHash('sha256').update(entryBuffer).digest('hex'),
	};
}

main().catch((error) => {
	console.error(error);
	process.exitCode = 1;
});
