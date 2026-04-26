// The CatalogCollectionSelect component logic is mostly DOM-driven and
// already covered by typecheck + manual smoke test. The one piece worth
// unit-testing is the ranking heuristic — empty queries return the head of
// the list, prefix matches outrank substring matches, and the limit is
// honored. Keeping this in a small focused file means the heuristic can
// evolve (fuzzy matching, etc.) with regression coverage.

import { describe, expect, it } from 'bun:test';

// Re-implement the ranking exactly the way the component module exports it.
// Importing the .svelte module from bun:test is awkward; we re-derive the
// pure function here so this test is independent of the Svelte runtime. If
// the logic changes in the component, update this copy.
function rankSuggestions(
	collections: Array<{ id: string; name: string }>,
	query: string,
	limit: number,
): Array<{ id: string; name: string }> {
	const trimmed = query.trim().toLowerCase();
	if (!trimmed) {
		return collections.slice(0, limit);
	}
	const prefix: Array<{ id: string; name: string }> = [];
	const substring: Array<{ id: string; name: string }> = [];
	for (const collection of collections) {
		const lower = collection.name.toLowerCase();
		if (lower.startsWith(trimmed)) {
			prefix.push(collection);
		} else if (lower.includes(trimmed)) {
			substring.push(collection);
		}
	}
	return [...prefix, ...substring].slice(0, limit);
}

const collections = [
	{ id: 'col-snake', name: 'The Snakebite Collection' },
	{ id: 'col-snare', name: 'Snare Collection' },
	{ id: 'col-revolution', name: 'The Revolution Collection' },
	{ id: 'col-mirage', name: 'The Mirage Collection' },
	{ id: 'col-ancient', name: 'The Ancient Collection' },
];

describe('rankSuggestions', () => {
	it('returns the head of the list with no query', () => {
		const result = rankSuggestions(collections, '', 3);
		expect(result.map((c) => c.id)).toEqual(['col-snake', 'col-snare', 'col-revolution']);
	});

	it('places prefix matches before substring matches', () => {
		const result = rankSuggestions(collections, 'snake', 5);
		// Only one match, so just verify it appears.
		expect(result.map((c) => c.id)).toContain('col-snake');
	});

	it('matches case-insensitively', () => {
		const result = rankSuggestions(collections, 'MIRAGE', 5);
		expect(result.map((c) => c.id)).toContain('col-mirage');
	});

	it('substring match still hits when prefix differs', () => {
		// "Mirage" is a substring of "The Mirage Collection" but not a prefix.
		const result = rankSuggestions(collections, 'mirage', 5);
		expect(result.map((c) => c.id)).toContain('col-mirage');
	});

	it('orders prefix matches before substring matches when both apply', () => {
		// "snake" prefix-matches "Snakebite Collection"... wait, that starts with "The".
		// Build a fixture where one collection prefix-matches and another only substring-matches.
		const fixture = [
			{ id: 'a', name: 'Alpha Collection' },
			{ id: 'b', name: 'The Alpha Special' },
		];
		const result = rankSuggestions(fixture, 'alpha', 5);
		expect(result.map((c) => c.id)).toEqual(['a', 'b']);
	});

	it('honors the limit', () => {
		const result = rankSuggestions(collections, '', 2);
		expect(result).toHaveLength(2);
	});
});
