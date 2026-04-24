import { readFile, stat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { catalogSnapshotSchema, type CatalogCollection, type CatalogSnapshot, type CatalogWeapon } from '$lib/schemas/catalog';

const SNAPSHOT_PATH = fileURLToPath(new URL('./generated/cs2-catalog.snapshot.json', import.meta.url));

let cachedSnapshot: { mtimeMs: number; value: CatalogSnapshot } | null = null;

export interface CatalogSummaryDTO {
	snapshotVersion: number;
	generatedAt: string;
	gamePath: string;
	stats: CatalogSnapshot['stats'];
	sourceFiles: CatalogSnapshot['sourceFiles'];
	collections: CatalogCollection[];
	weapons: CatalogWeapon[];
}

export async function getCatalogSnapshot(): Promise<CatalogSnapshot> {
	const snapshotStat = await stat(SNAPSHOT_PATH);

	if (cachedSnapshot && cachedSnapshot.mtimeMs === snapshotStat.mtimeMs) {
		return cachedSnapshot.value;
	}

	const raw = await readFile(SNAPSHOT_PATH, 'utf8');
	const parsed = catalogSnapshotSchema.parse(JSON.parse(raw));

	cachedSnapshot = {
		mtimeMs: snapshotStat.mtimeMs,
		value: parsed,
	};

	return parsed;
}

export async function getCatalogSummary(): Promise<CatalogSummaryDTO> {
	const snapshot = await getCatalogSnapshot();

	return {
		snapshotVersion: snapshot.snapshotVersion,
		generatedAt: snapshot.generatedAt,
		gamePath: snapshot.gamePath,
		stats: snapshot.stats,
		sourceFiles: snapshot.sourceFiles,
		collections: snapshot.collections,
		weapons: snapshot.weapons,
	};
}
