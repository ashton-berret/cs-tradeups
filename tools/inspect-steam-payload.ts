// @ts-nocheck
// Inspect the raw Steam inventory payload to see whether floatvalue /
// paintseed / wear are present in the public JSON. One-shot diagnostic —
// not part of the running app.
//
// Usage:
//   bun run tools/inspect-steam-payload.ts
//
// Reads STEAM_ID from .env (or the environment). Fetches one page (1000
// items max — Steam caps at 2000 per call) of the public inventory and
// dumps:
//   1. All top-level keys.
//   2. Sample asset / description / asset_property records.
//   3. Suspect fields (deep-search across the entire body).
//   4. The first asset that has any asset_properties attached so we can
//      confirm the new fields and their format.

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const SUSPECT_NAMES = /float|wear|seed|paint|pattern/i;
const SUSPECT_VALUES = /float|wear|seed|paint|pattern/i;

function loadDotenv(): Record<string, string> {
	const path = join(process.cwd(), '.env');
	if (!existsSync(path)) return {};
	const out: Record<string, string> = {};
	for (const line of readFileSync(path, 'utf8').split(/\r?\n/)) {
		const trimmed = line.trim();
		if (!trimmed || trimmed.startsWith('#')) continue;
		const eq = trimmed.indexOf('=');
		if (eq < 0) continue;
		const key = trimmed.slice(0, eq).trim();
		let value = trimmed.slice(eq + 1).trim();
		if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
			value = value.slice(1, -1);
		}
		out[key] = value;
	}
	return out;
}

function findSuspectFields(node: unknown, path: string[] = [], hits: Array<{ path: string; value: unknown }> = [], maxHits = 80): typeof hits {
	if (hits.length >= maxHits) return hits;
	if (node === null || node === undefined) return hits;
	if (typeof node === 'string' && SUSPECT_VALUES.test(node) && path.length > 0) {
		hits.push({ path: path.join('.'), value: node });
	}
	if (Array.isArray(node)) {
		for (let i = 0; i < Math.min(node.length, 5); i++) {
			findSuspectFields(node[i], [...path, `[${i}]`], hits, maxHits);
		}
		return hits;
	}
	if (typeof node === 'object') {
		for (const [key, value] of Object.entries(node as Record<string, unknown>)) {
			if (SUSPECT_NAMES.test(key)) {
				hits.push({ path: [...path, key].join('.'), value });
			}
			findSuspectFields(value, [...path, key], hits, maxHits);
		}
	}
	return hits;
}

async function main() {
	const env = { ...loadDotenv(), ...process.env };
	const steamId = env.STEAM_ID?.trim();
	if (!steamId) {
		console.error('STEAM_ID is not set in .env or the environment.');
		process.exit(1);
	}

	const url = `https://steamcommunity.com/inventory/${steamId}/730/2?l=english&count=2000`;
	console.log(`Fetching ${url}\n`);

	const response = await fetch(url, { headers: { Accept: 'application/json' } });
	if (!response.ok) {
		console.error(`Steam returned ${response.status}: ${await response.text()}`);
		process.exit(1);
	}

	const body = (await response.json()) as Record<string, unknown> & {
		assets?: Array<Record<string, unknown>>;
		descriptions?: Array<Record<string, unknown>>;
		asset_properties?: unknown;
		total_inventory_count?: number;
		more_items?: number;
		last_assetid?: string;
	};

	console.log('--- top-level keys ---');
	console.log(Object.keys(body).sort().join(', '));
	console.log(`total_inventory_count = ${body.total_inventory_count} · more_items = ${body.more_items} · last_assetid = ${body.last_assetid}`);
	console.log(`assets returned: ${body.assets?.length ?? 0} · descriptions returned: ${body.descriptions?.length ?? 0}`);

	if (body.asset_properties !== undefined) {
		console.log('\n--- asset_properties (NEW — this is what we want) ---');
		console.log('shape:', Array.isArray(body.asset_properties) ? 'array' : typeof body.asset_properties);
		if (Array.isArray(body.asset_properties)) {
			console.log(`length: ${body.asset_properties.length}`);
			if (body.asset_properties.length > 0) {
				console.log('keys on first entry:', Object.keys(body.asset_properties[0] as object).sort().join(', '));
				console.log('first 3 entries:');
				console.log(JSON.stringify(body.asset_properties.slice(0, 3), null, 2));
			}
		} else if (typeof body.asset_properties === 'object' && body.asset_properties !== null) {
			console.log('top-level keys on object:', Object.keys(body.asset_properties as object).sort().join(', '));
			console.log(JSON.stringify(body.asset_properties, null, 2).slice(0, 4000));
		}
	}

	if (body.assets && body.assets.length > 0) {
		console.log('\n--- first asset keys ---');
		console.log(Object.keys(body.assets[0]).sort().join(', '));
	}
	if (body.descriptions && body.descriptions.length > 0) {
		console.log('\n--- first description keys ---');
		console.log(Object.keys(body.descriptions[0]).sort().join(', '));
	}

	console.log('\n--- suspect fields (deep search across entire body for /float|wear|seed|paint|pattern/i) ---');
	const hits = findSuspectFields(body);
	if (hits.length === 0) {
		console.log('NONE FOUND. Float is not in the public payload anywhere.');
	} else {
		const seen = new Set<string>();
		for (const hit of hits) {
			const valueStr = typeof hit.value === 'string' ? hit.value : JSON.stringify(hit.value);
			const truncated = valueStr.length > 200 ? valueStr.slice(0, 200) + '…' : valueStr;
			const normalized = hit.path.split('.').map((p) => p.replace(/\[\d+\]/, '[*]')).join('.');
			const sig = normalized + ':' + truncated;
			if (seen.has(sig)) continue;
			seen.add(sig);
			console.log(`  ${hit.path} = ${truncated}`);
		}
	}

	// Find a higher-rarity item that's most likely to have float data (Covert,
	// Classified, Restricted, then anything not Consumer Grade).
	const rarityRank = (description: Record<string, unknown>): number => {
		const tags = description.tags as Array<Record<string, unknown>> | undefined;
		const rarity = tags?.find((t) => t.category === 'Rarity');
		const name = rarity?.internal_name as string | undefined;
		if (!name) return 0;
		if (name.includes('Ancient')) return 100; // Covert
		if (name.includes('Legendary')) return 90; // Classified
		if (name.includes('Mythical')) return 80; // Restricted
		if (name.includes('Rare')) return 70; // Mil-Spec
		if (name.includes('Uncommon')) return 60; // Industrial
		return 50;
	};
	if (body.descriptions && body.descriptions.length > 0) {
		const sorted = [...body.descriptions].sort((a, b) => rarityRank(b) - rarityRank(a));
		const target = sorted[0];
		console.log(`\n--- highest-rarity description (${target.market_hash_name}) ---`);
		console.log(JSON.stringify(target, null, 2));

		// Now find the corresponding asset(s) by classid+instanceid and dump.
		const matchingAsset = body.assets?.find(
			(a) => a.classid === target.classid && a.instanceid === target.instanceid,
		);
		if (matchingAsset) {
			console.log(`\n--- matching asset for ${target.market_hash_name} ---`);
			console.log(JSON.stringify(matchingAsset, null, 2));
			// And the asset_properties entry for it, if asset_properties is an
			// array indexed by assetid or similar.
			if (Array.isArray(body.asset_properties)) {
				const assetId = matchingAsset.assetid as string;
				const matchingProperty = body.asset_properties.find((p) => {
					const candidate = p as Record<string, unknown>;
					return (
						candidate.assetid === assetId ||
						candidate.asset_id === assetId ||
						candidate.id === assetId
					);
				});
				if (matchingProperty) {
					console.log(`\n--- asset_properties entry for assetid ${assetId} ---`);
					console.log(JSON.stringify(matchingProperty, null, 2));
				} else {
					console.log(`\nNo asset_properties entry found by assetid for ${assetId}. asset_properties may be keyed differently — see the dump above.`);
				}
			}
		}
	}
}

await main();
