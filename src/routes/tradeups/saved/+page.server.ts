import { error, fail, type Actions } from '@sveltejs/kit';
import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { promisify } from 'node:util';
import type { PageServerLoad } from './$types';
import { ApiError, apiFetch } from '$lib/client/api';
import type { CombinationDTO } from '$lib/server/tradeups/combinationService';
import { deleteTradeupLabCombinations } from '$lib/server/tradeups/combinationService';
import type { PaginatedResponse } from '$lib/types/domain';

const execFileAsync = promisify(execFile);

const filterKeys = [
	'search',
	'collection',
	'mode',
	'targetRarity',
	'inputRarity',
	'status',
	'source',
	'minProfit',
	'minProfitPct',
	'minProfitChance',
	'maxInputFloat',
	'maxInputPrice',
	'recheckStatus',
	'outputs',
	'sortBy',
	'sortDir',
	'page',
	'limit',
	'showDuplicates',
];

export const load: PageServerLoad = async ({ fetch, url }) => {
	try {
		const page = await apiFetch<PaginatedResponse<CombinationDTO>>(
			fetch,
			`/api/tradeups/combinations${copySearch(url, filterKeys)}`,
		);
		return { page, filter: filterFromUrl(url) };
	} catch (err) {
		if (err instanceof ApiError) error(err.status, err.message);
		throw err;
	}
};

export const actions: Actions = {
	importTradeupLab: async ({ request, url }) => {
		const form = await request.formData();
		const minProbability = clampNumber(numberField(form, 'minProbability') ?? 90, 1, 100);
		const maxPages = clampNumber(numberField(form, 'maxPages') ?? 3, 1, 25);
		const apiBase = `${url.protocol}//${url.host}`;

		try {
			const bunCommand = resolveBunCommand();
			const { stdout, stderr } = await execFileAsync(
				bunCommand.command,
				[
					...bunCommand.prefixArgs,
					'run',
					'tools/import-tradeuplab.ts',
					`--min-probability=${minProbability}`,
					`--max-pages=${maxPages}`,
					`--api-base=${apiBase}`,
				],
				{
					cwd: process.cwd(),
					timeout: 180_000,
					maxBuffer: 1024 * 1024,
				},
			);
			const summary = summarizeImportOutput(`${stdout}\n${stderr}`);
			return { success: summary || 'TradeUpLab import finished.' };
		} catch (err) {
			const output =
				typeof err === 'object' && err && 'stdout' in err
					? `${String((err as { stdout?: unknown }).stdout ?? '')}\n${String((err as { stderr?: unknown }).stderr ?? '')}`
					: '';
			return fail(500, {
				error: summarizeImportOutput(output) || (err instanceof Error ? err.message : 'TradeUpLab import failed.'),
			});
		}
	},

	deleteTradeupLab: async () => {
		try {
			const result = await deleteTradeupLabCombinations();
			const skipped =
				result.generatedPlansSkipped > 0
					? ` Skipped ${result.generatedPlansSkipped} generated plan${result.generatedPlansSkipped === 1 ? '' : 's'} with baskets/executions.`
					: '';
			return {
				success:
					`Deleted ${result.combinationsDeleted} TradeUpLab saved tradeup${result.combinationsDeleted === 1 ? '' : 's'} ` +
					`and ${result.generatedPlansDeleted} generated plan${result.generatedPlansDeleted === 1 ? '' : 's'}.${skipped}`,
			};
		} catch (err) {
			return fail(500, {
				error: err instanceof Error ? err.message : 'Failed to delete TradeUpLab tradeups.',
			});
		}
	},
};

function numberField(form: FormData, name: string): number | undefined {
	const value = form.get(name);
	if (typeof value !== 'string' || value.trim() === '') return undefined;
	const parsed = Number(value);
	return Number.isFinite(parsed) ? parsed : undefined;
}

function clampNumber(value: number, min: number, max: number): number {
	return Math.min(max, Math.max(min, Math.trunc(value)));
}

function resolveBunCommand(): { command: string; prefixArgs: string[] } {
	if (process.platform === 'win32') {
		const appData = process.env.APPDATA;
		const bunShim = appData ? join(appData, 'npm', 'bun.cmd') : null;
		if (bunShim && existsSync(bunShim)) {
			return { command: 'cmd.exe', prefixArgs: ['/c', bunShim] };
		}
		return { command: 'cmd.exe', prefixArgs: ['/c', 'bun'] };
	}

	return { command: 'bun', prefixArgs: [] };
}

function summarizeImportOutput(output: string): string {
	const lines = output
		.split(/\r?\n/)
		.map((line) => line.trim())
		.filter(Boolean);
	const summaryStart = lines.findIndex((line) => line.includes('--- Import summary ---'));
	const summaryLines = summaryStart >= 0 ? lines.slice(summaryStart + 1, summaryStart + 7) : lines.slice(-6);
	const created = summaryLines.find((line) => line.startsWith('Created:'))?.replace(/\s+/g, ' ');
	const duplicate = summaryLines.find((line) => line.startsWith('Duplicates:'))?.replace(/\s+/g, ' ');
	const quarantined = summaryLines.find((line) => line.startsWith('Quarantined:'))?.replace(/\s+/g, ' ');
	const failed = summaryLines.find((line) => line.startsWith('Failed:'))?.replace(/\s+/g, ' ');
	const pages = summaryLines.find((line) => line.startsWith('Pages fetched:'))?.replace(/\s+/g, ' ');
	return [pages, created, duplicate, quarantined, failed].filter(Boolean).join(' · ');
}

function copySearch(url: URL, keys: string[]) {
	const params = new URLSearchParams();
	for (const key of keys) {
		const value = url.searchParams.get(key);
		if (value) params.set(key, value);
	}
	const qs = params.toString();
	return qs ? `?${qs}` : '';
}

function filterFromUrl(url: URL) {
	return {
		search: url.searchParams.get('search') ?? '',
		collection: url.searchParams.get('collection') ?? '',
		mode: url.searchParams.get('mode') ?? '',
		targetRarity: url.searchParams.get('targetRarity') ?? '',
		inputRarity: url.searchParams.get('inputRarity') ?? '',
		status: url.searchParams.get('status') ?? '',
		source: url.searchParams.get('source') ?? '',
		minProfit: url.searchParams.get('minProfit') ?? '',
		minProfitPct: url.searchParams.get('minProfitPct') ?? '',
		minProfitChance: url.searchParams.get('minProfitChance') ?? '',
		maxInputFloat: url.searchParams.get('maxInputFloat') ?? '',
		maxInputPrice: url.searchParams.get('maxInputPrice') ?? '',
		recheckStatus: url.searchParams.get('recheckStatus') ?? '',
		outputs: url.searchParams.get('outputs') ?? '',
		sortBy: url.searchParams.get('sortBy') ?? 'createdAt',
		sortDir: url.searchParams.get('sortDir') ?? 'desc',
		page: Number(url.searchParams.get('page') ?? '1'),
		limit: Number(url.searchParams.get('limit') ?? '25'),
		showDuplicates: url.searchParams.get('showDuplicates') === '1',
	};
}
