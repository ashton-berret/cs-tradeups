import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it } from 'bun:test';
import { catalogSnapshotSchema } from '$lib/schemas/catalog';

const SNAPSHOT_PATH = path.resolve('src/lib/server/catalog/generated/cs2-catalog.snapshot.json');

describe('catalog snapshot', () => {
	it('validates the committed CS2 catalog snapshot', async () => {
		const raw = await readFile(SNAPSHOT_PATH, 'utf8');
		const snapshot = catalogSnapshotSchema.parse(JSON.parse(raw));

		expect(snapshot.stats.collectionCount).toBeGreaterThan(0);
		expect(snapshot.stats.weaponCount).toBeGreaterThan(0);
		expect(snapshot.stats.paintKitCount).toBeGreaterThan(0);
		expect(snapshot.stats.skinCount).toBeGreaterThan(0);
		expect(snapshot.skins.some((skin) => skin.baseMarketHashName.startsWith('AK-47 | '))).toBe(true);
	});
});
