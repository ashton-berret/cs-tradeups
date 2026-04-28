// @ts-nocheck
// One-shot importer for tradeuplab.com community combinations.
//
// Usage:
//   bun run tools/import-tradeuplab.ts                        # default: 90%+ success rate
//   bun run tools/import-tradeuplab.ts --min-probability=80
//   bun run tools/import-tradeuplab.ts --max-pages=3 --dry-run
//
// Behavior:
//   1. Pages tradeuplab.com/tradeups/?min_probability=N until no more cards
//      or `--max-pages` is reached. Polite 1.5s rate limit between pages.
//   2. For each combo card on the page:
//      - Reads data-tradeup-id (skipped if already imported).
//      - Pulls the canonical market_hash_name out of the embedded Steam
//        marketplace link (the `|`-separated form), since the visible card
//        text uses space-separated names that are ambiguous to parse.
//      - Resolves each input/outcome to a catalog skin via the local
//        snapshot.
//   3. POSTs the combination to `http://localhost:5173/api/tradeups/combinations`
//      with `tradeupLabId` set so re-runs are idempotent. Requires the dev
//      server to be running.
//   4. Combos with any unresolvable input go to a quarantine list (not
//      imported, logged at end).
//
// Notes:
//   - Float values are rounded to 2 decimals on the source. We accept the
//     loss of precision; the recheck flow will compute results from current
//     prices anyway.
//   - tradeuplab's published numbers (cost / EV / profit / success%) are
//     stashed in `notes` for comparison; thesis totals come from our own
//     `calculate()` for consistency with recheck.

import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';
import { load as loadHtml } from 'cheerio';

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = resolve(SCRIPT_DIR, '..');
const SNAPSHOT_PATH = join(
	PROJECT_ROOT,
	'src',
	'lib',
	'server',
	'catalog',
	'generated',
	'cs2-catalog.snapshot.json',
);

const ARGS = parseArgs(process.argv.slice(2));
const MIN_PROBABILITY = Number(ARGS['min-probability'] ?? 90);
const MAX_PAGES = ARGS['max-pages'] ? Number(ARGS['max-pages']) : Infinity;
const DRY_RUN = ARGS['dry-run'] === 'true' || ARGS['dry-run'] === '';
const API_BASE = ARGS['api-base'] ?? 'http://localhost:5173';
const PAGE_DELAY_MS = 1500;

const RARITY_BY_LABEL: Record<string, string> = {
	'consumer grade': 'CONSUMER_GRADE',
	'industrial grade': 'INDUSTRIAL_GRADE',
	'mil-spec': 'MIL_SPEC',
	'mil-spec grade': 'MIL_SPEC',
	restricted: 'RESTRICTED',
	classified: 'CLASSIFIED',
	covert: 'COVERT',
};

const RARITY_ORDER = [
	'CONSUMER_GRADE',
	'INDUSTRIAL_GRADE',
	'MIL_SPEC',
	'RESTRICTED',
	'CLASSIFIED',
	'COVERT',
];

interface CatalogSkin {
	id: string;
	collectionId: string;
	collectionName: string;
	rarity: string | null;
	weaponName: string;
	skinName: string;
	baseMarketHashName: string;
	marketHashNames: Array<{ exterior: string; marketHashName: string }>;
}

interface CatalogIndex {
	byMarketHashName: Map<string, CatalogSkin>;
	weaponNames: string[]; // sorted longest-first for prefix matching
}

const EXTERIOR_LABELS: Record<string, string> = {
	'factory new': 'Factory New',
	'minimal wear': 'Minimal Wear',
	'field-tested': 'Field-Tested',
	'well-worn': 'Well-Worn',
	'battle-scarred': 'Battle-Scarred',
};

interface ParsedInput {
	count: number;
	marketHashName: string; // canonical from Steam URL
	displayName: string; // raw text shown on card
	exterior: string | null;
	floatValue: number | null;
	price: number;
}

interface ParsedOutcome {
	probability: number;
	marketHashName: string | null;
	displayName: string;
	exterior: string | null;
	floatValue: number | null;
	price: number | null;
}

interface ParsedCard {
	tradeupLabId: number;
	identifiedAt: string | null;
	collections: string;
	rarityLabel: string;
	avgInputFloat: string;
	inputCost: number;
	expectedValue: number;
	profit: number;
	profitabilityPct: number;
	successRate: number;
	inputs: ParsedInput[];
	outcomes: ParsedOutcome[];
}

function parseArgs(argv: string[]): Record<string, string> {
	const out: Record<string, string> = {};
	for (const arg of argv) {
		if (!arg.startsWith('--')) continue;
		const stripped = arg.slice(2);
		const eq = stripped.indexOf('=');
		if (eq < 0) {
			out[stripped] = '';
		} else {
			out[stripped.slice(0, eq)] = stripped.slice(eq + 1);
		}
	}
	return out;
}

function loadCatalogIndex(): CatalogIndex {
	if (!existsSync(SNAPSHOT_PATH)) {
		throw new Error(`Catalog snapshot not found at ${SNAPSHOT_PATH}`);
	}
	const raw = readFileSync(SNAPSHOT_PATH, 'utf8');
	const snapshot = JSON.parse(raw) as {
		skins: CatalogSkin[];
		weapons?: Array<{ marketName: string }>;
	};
	const byMarketHashName = new Map<string, CatalogSkin>();
	const weaponSet = new Set<string>();
	for (const skin of snapshot.skins) {
		byMarketHashName.set(normalize(skin.baseMarketHashName), skin);
		for (const entry of skin.marketHashNames ?? []) {
			byMarketHashName.set(normalize(entry.marketHashName), skin);
		}
		if (skin.weaponName) weaponSet.add(skin.weaponName);
	}
	for (const weapon of snapshot.weapons ?? []) {
		if (weapon.marketName) weaponSet.add(weapon.marketName);
	}
	const weaponNames = Array.from(weaponSet).sort((a, b) => b.length - a.length);
	return { byMarketHashName, weaponNames };
}

const QUALITY_PREFIXES = ['StatTrak™ ', 'Souvenir '];

/**
 * Reconstruct a canonical CS2 market_hash_name from a tradeuplab card's
 * display string and exterior label.
 *
 *   "P250 Asiimov" + "Battle-Scarred" → "P250 | Asiimov (Battle-Scarred)"
 *   "StatTrak™ UMP-45 Primal Saber" + "Field-Tested"
 *     → "StatTrak™ UMP-45 | Primal Saber (Field-Tested)"
 *
 * Strategy: peel off any quality prefix, then find the longest catalog
 * weapon name that is a prefix of the rest. The remainder is the skin name.
 * Returns null when no weapon prefix matches — caller should quarantine.
 */
function reconstructCanonicalName(
	displayName: string,
	exterior: string | null,
	index: CatalogIndex,
): string | null {
	let remaining = displayName.trim();
	let qualityPrefix = '';
	for (const prefix of QUALITY_PREFIXES) {
		if (remaining.startsWith(prefix)) {
			qualityPrefix = prefix;
			remaining = remaining.slice(prefix.length).trim();
			break;
		}
	}
	let weapon: string | null = null;
	for (const candidate of index.weaponNames) {
		if (
			remaining.length > candidate.length &&
			remaining.startsWith(candidate) &&
			(remaining[candidate.length] === ' ' || remaining[candidate.length] === '\t')
		) {
			weapon = candidate;
			break;
		}
	}
	if (!weapon) return null;
	const skinName = remaining.slice(weapon.length).trim();
	if (!skinName) return null;
	const exteriorLabel = exterior ? (EXTERIOR_LABELS[exterior.toLowerCase()] ?? exterior) : null;
	return exteriorLabel
		? `${qualityPrefix}${weapon} | ${skinName} (${exteriorLabel})`
		: `${qualityPrefix}${weapon} | ${skinName}`;
}

function normalize(value: string): string {
	return value.trim().toLowerCase();
}

function previousRarity(rarity: string): string {
	const idx = RARITY_ORDER.indexOf(rarity);
	return idx > 0 ? RARITY_ORDER[idx - 1] : rarity;
}

const ITEM_TEXT_PATTERN = /^(\d+)\s*x\s*(.+?)\s*\[(.+?)\]\s*$/;

function parseInputText(text: string): {
	count: number;
	displayName: string;
	exterior: string | null;
	price: number;
	floatValue: number | null;
} | null {
	const match = text.trim().match(ITEM_TEXT_PATTERN);
	if (!match) return null;
	const [, countStr, displayName, bracket] = match;
	const count = Number(countStr);
	const parts = bracket.split(',').map((p) => p.trim());
	let exterior: string | null = null;
	let price: number | null = null;
	let floatValue: number | null = null;
	for (const part of parts) {
		if (part.startsWith('$')) {
			price = Number(part.slice(1).replace(/,/g, ''));
		} else if (/^float\s*=/i.test(part)) {
			floatValue = Number(part.split('=')[1]);
		} else {
			exterior = part;
		}
	}
	if (price == null) return null;
	return { count, displayName, exterior, price, floatValue };
}

const OUTCOME_TEXT_PATTERN = /^([\d.]+)%\s*→\s*(.+?)\s*\(\$([\d.]+)\)\s*$/;

function parseOutcomeText(text: string): {
	probability: number;
	displayName: string;
	exterior: string | null;
	floatValue: number | null;
	price: number;
} | null {
	const match = text.trim().match(OUTCOME_TEXT_PATTERN);
	if (!match) return null;
	const [, probStr, body, priceStr] = match;
	// Body looks like: "M4A1-S Chantico's Fire Battle-Scarred float 0.81"
	const floatMatch = body.match(/\bfloat\s+([\d.]+)\s*$/i);
	const floatValue = floatMatch ? Number(floatMatch[1]) : null;
	const withoutFloat = floatMatch ? body.slice(0, floatMatch.index).trim() : body.trim();
	// Try to peel off a known exterior from the end.
	const exteriorMatch = withoutFloat.match(
		/\s+(Factory New|Minimal Wear|Field-Tested|Well-Worn|Battle-Scarred)\s*$/,
	);
	const exterior = exteriorMatch ? exteriorMatch[1] : null;
	return {
		probability: Number(probStr) / 100,
		displayName: withoutFloat,
		exterior,
		floatValue,
		price: Number(priceStr),
	};
}

function parseCard(html: string, index: CatalogIndex): ParsedCard | null {
	// Load the card as its own cheerio fragment so .find / .closest stay
	// scoped to it. Sharing a cheerio context across the whole page caused
	// closest()/find() lookups to miss the right ancestors in the first
	// version of this tool.
	const $ = loadHtml(html);
	const saveButton = $('button[data-tradeup-id]').first();
	const tradeupLabId = Number(saveButton.attr('data-tradeup-id'));
	if (!Number.isFinite(tradeupLabId) || tradeupLabId <= 0) return null;
	const identifiedAt = saveButton.attr('data-created-at') ?? null;

	const collections = $('.text-white.font-medium').first().text().trim();

	// Stat blocks — find label divs and pull their value sibling.
	const statValue = (label: string): string | null => {
		let value: string | null = null;
		$('div').each((_, el) => {
			const $el = $(el);
			if ($el.text().trim() === label) {
				value = $el.nextAll('div').first().text().trim();
				return false;
			}
			return undefined;
		});
		return value;
	};
	const rarityLabel = (statValue('Rarity:') ?? '').replace(/[\u{1F300}-\u{1FAFF}]/gu, '').trim();
	const avgInputFloat = statValue('Avg Input Float:') ?? '';
	const inputCost = parseDollar(statValue('Input Cost:'));
	const expectedValue = parseDollar(statValue('Expected Value:'));
	const profit = parseDollar(statValue('Profit:'));
	const profitabilityPct = parsePercent(statValue('Profitability:'));
	const successRate = parsePercent(statValue('Success Rate:'));

	const inputs: ParsedInput[] = [];
	$('.item-text').each((_, el) => {
		const text = $(el).text().trim();
		const parsed = parseInputText(text);
		if (!parsed) return;
		const canonical =
			reconstructCanonicalName(parsed.displayName, parsed.exterior, index) ?? parsed.displayName;
		inputs.push({
			count: parsed.count,
			marketHashName: canonical,
			displayName: parsed.displayName,
			exterior: parsed.exterior,
			floatValue: parsed.floatValue,
			price: parsed.price,
		});
	});

	const outcomes: ParsedOutcome[] = [];
	$('.outcome-text').each((_, el) => {
		const text = $(el).text().trim();
		const parsed = parseOutcomeText(text);
		if (!parsed) return;
		const canonical = reconstructCanonicalName(parsed.displayName, parsed.exterior, index);
		outcomes.push({
			probability: parsed.probability,
			marketHashName: canonical,
			displayName: parsed.displayName,
			exterior: parsed.exterior,
			floatValue: parsed.floatValue,
			price: parsed.price,
		});
	});

	return {
		tradeupLabId,
		identifiedAt,
		collections,
		rarityLabel,
		avgInputFloat,
		inputCost: inputCost ?? 0,
		expectedValue: expectedValue ?? 0,
		profit: profit ?? 0,
		profitabilityPct: profitabilityPct ?? 0,
		successRate: successRate ?? 0,
		inputs,
		outcomes,
	};
}

function parseDollar(value: string | null): number | null {
	if (!value) return null;
	const m = value.replace(/[$,]/g, '').match(/-?\d+(?:\.\d+)?/);
	return m ? Number(m[0]) : null;
}

function parsePercent(value: string | null): number | null {
	if (!value) return null;
	const m = value.match(/-?\d+(?:\.\d+)?/);
	return m ? Number(m[0]) : null;
}

async function fetchPage(page: number): Promise<string> {
	const url = `https://www.tradeuplab.com/tradeups/?page=${page}&min_probability=${MIN_PROBABILITY}`;
	const response = await fetch(url, {
		headers: {
			'User-Agent': 'cs-tradeups-importer/1.0 (personal-use one-shot import)',
			Accept: 'text/html',
		},
	});
	if (!response.ok) {
		throw new Error(`Failed to fetch page ${page}: ${response.status}`);
	}
	return response.text();
}

function extractCards(html: string): string[] {
	const $ = loadHtml(html);
	const cards: string[] = [];
	// Cards are the rounded panels with a `data-tradeup-id` save button inside.
	$('button[data-tradeup-id]').each((_, btn) => {
		const $card = $(btn).closest('div.rounded-2xl');
		if ($card.length === 0) return;
		cards.push($.html($card));
	});
	return cards;
}

interface ImportRequest {
	name: string;
	notes: string;
	isActive: false;
	targetRarity: string;
	inputRarity: string;
	inputs: Array<{
		collection: string;
		catalogSkinId?: string;
		catalogCollectionId?: string;
		floatValue?: number;
		price: number;
	}>;
	tradeupLabId: number;
	thesisOverride: {
		totalCost: number;
		totalEV: number;
		expectedProfit: number;
		expectedProfitPct: number;
	};
}

// Strip a StatTrak™ / Souvenir prefix and retry the catalog lookup. Both
// quality variants share the same underlying skin record (same float range,
// rarity, collection) and our catalog snapshot only indexes the base form.
function lookupSkin(marketHashName: string, index: CatalogIndex) {
	const direct = index.byMarketHashName.get(normalize(marketHashName));
	if (direct) return direct;
	for (const prefix of QUALITY_PREFIXES) {
		if (marketHashName.startsWith(prefix)) {
			const stripped = marketHashName.slice(prefix.length);
			const fallback = index.byMarketHashName.get(normalize(stripped));
			if (fallback) return fallback;
		}
	}
	return null;
}

function buildImportRequest(card: ParsedCard, index: CatalogIndex): ImportRequest | null {
	const targetRarity = RARITY_BY_LABEL[card.rarityLabel.toLowerCase()];
	if (!targetRarity) {
		return null;
	}
	const inputRarity = previousRarity(targetRarity);

	const inputs: ImportRequest['inputs'] = [];
	for (const input of card.inputs) {
		const skin = lookupSkin(input.marketHashName, index);
		if (!skin) {
			return null; // unresolvable input → quarantine the whole combo
		}
		// CS2 trade-ups always take exactly 10 inputs. Tradeup lab encodes
		// "10x same item" as a single row with count=10; we expand to
		// individual slots so our model captures one row per slot.
		for (let i = 0; i < input.count; i++) {
			inputs.push({
				collection: skin.collectionName,
				catalogSkinId: skin.id,
				catalogCollectionId: skin.collectionId,
				floatValue: input.floatValue ?? undefined,
				price: input.price,
			});
		}
	}
	if (inputs.length === 0 || inputs.length > 10) {
		return null;
	}

	const sourceMetadata = {
		source: 'tradeuplab.com',
		tradeupLabId: card.tradeupLabId,
		identifiedAt: card.identifiedAt,
		published: {
			inputCost: card.inputCost,
			expectedValue: card.expectedValue,
			profit: card.profit,
			profitabilityPct: card.profitabilityPct,
			successRate: card.successRate,
			avgInputFloat: card.avgInputFloat,
		},
		outcomes: card.outcomes,
	};

	const targetSummary = card.outcomes[0]?.displayName ?? 'unknown target';
	const name = `TradeUpLab #${card.tradeupLabId} — ${targetSummary} (${card.successRate.toFixed(0)}%)`;

	return {
		name: name.slice(0, 120),
		notes: JSON.stringify(sourceMetadata),
		isActive: false,
		targetRarity,
		inputRarity,
		inputs,
		tradeupLabId: card.tradeupLabId,
		// Use tradeuplab's published numbers as the frozen thesis. Their
		// calculator is the source of truth for the import; ours only kicks
		// in on recheck against current observed prices.
		thesisOverride: {
			totalCost: card.inputCost,
			totalEV: card.expectedValue,
			expectedProfit: card.profit,
			// profitabilityPct on the card is "EV / cost * 100" (e.g., 121.71
			// when EV is 121.71% of cost). We want the *change* — profit/cost
			// * 100 — to match how our calculator reports expectedProfitPct.
			expectedProfitPct:
				card.inputCost > 0 ? Number(((card.profit / card.inputCost) * 100).toFixed(2)) : 0,
		},
	};
}

async function postCombination(payload: ImportRequest): Promise<'created' | 'duplicate' | 'failed'> {
	const response = await fetch(`${API_BASE}/api/tradeups/combinations`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify(payload),
	});
	if (response.status === 201) return 'created';
	if (response.status === 409) return 'duplicate';
	const body = await response.text();
	console.error(`  POST failed (${response.status}): ${body.slice(0, 300)}`);
	return 'failed';
}

async function main() {
	console.log(`Importing tradeuplab.com combinations with min_probability=${MIN_PROBABILITY}.`);
	if (DRY_RUN) console.log('DRY RUN — nothing will be persisted.');

	const catalog = loadCatalogIndex();
	console.log(
		`Loaded catalog: ${catalog.byMarketHashName.size} indexed market hash names, ${catalog.weaponNames.length} weapons.\n`,
	);

	let stats = { pages: 0, cards: 0, created: 0, duplicate: 0, quarantined: 0, failed: 0 };
	const quarantine: Array<{ tradeupLabId: number; reason: string; sample: string[] }> = [];

	for (let page = 1; page <= MAX_PAGES; page++) {
		let html: string;
		try {
			html = await fetchPage(page);
		} catch (err) {
			console.error(`Aborting: page ${page} failed: ${(err as Error).message}`);
			break;
		}
		stats.pages++;
		const cards = extractCards(html);
		if (cards.length === 0) {
			console.log(`Page ${page}: no cards found — assuming end of results.`);
			break;
		}

		console.log(`Page ${page}: ${cards.length} cards`);

		for (const cardHtml of cards) {
			stats.cards++;
			const parsed = parseCard(cardHtml, catalog);
			if (!parsed) {
				stats.failed++;
				continue;
			}
			const payload = buildImportRequest(parsed, catalog);
			if (!payload) {
				stats.quarantined++;
				const unresolved = parsed.inputs
					.filter((i) => !lookupSkin(i.marketHashName, catalog))
					.map((i) => i.marketHashName);
				quarantine.push({
					tradeupLabId: parsed.tradeupLabId,
					reason: unresolved.length ? `unresolved inputs: ${unresolved.join(', ')}` : 'invalid card',
					sample: parsed.inputs.map((i) => i.marketHashName).slice(0, 3),
				});
				continue;
			}
			if (DRY_RUN) {
				console.log(`  [dry] would import ${parsed.tradeupLabId} (${payload.inputs.length} inputs)`);
				stats.created++;
				continue;
			}
			const result = await postCombination(payload);
			if (result === 'created') stats.created++;
			else if (result === 'duplicate') stats.duplicate++;
			else stats.failed++;
		}

		if (page < MAX_PAGES) {
			await new Promise((r) => setTimeout(r, PAGE_DELAY_MS));
		}
	}

	console.log('\n--- Import summary ---');
	console.log(`Pages fetched:    ${stats.pages}`);
	console.log(`Cards seen:       ${stats.cards}`);
	console.log(`Created:          ${stats.created}`);
	console.log(`Duplicates:       ${stats.duplicate}`);
	console.log(`Quarantined:      ${stats.quarantined}`);
	console.log(`Failed:           ${stats.failed}`);
	if (quarantine.length > 0) {
		console.log('\nQuarantined combos (first 20):');
		for (const entry of quarantine.slice(0, 20)) {
			console.log(`  #${entry.tradeupLabId} — ${entry.reason}`);
		}
		if (quarantine.length > 20) {
			console.log(`  …and ${quarantine.length - 20} more.`);
		}
	}
}

await main();
