<script lang="ts">
	import { page } from '$app/state';
	import { enhance } from '$app/forms';
	import Badge from '$lib/components/Badge.svelte';
	import Button from '$lib/components/Button.svelte';
	import Card from '$lib/components/Card.svelte';
	import DataTable from '$lib/components/DataTable.svelte';
	import FilterBar from '$lib/components/FilterBar.svelte';
	import Input from '$lib/components/Input.svelte';
	import Money from '$lib/components/Money.svelte';
	import PaginationControl from '$lib/components/PaginationControl.svelte';
	import type { ActionData, PageData } from './$types';

	let { data, form }: { data: PageData; form?: ActionData } = $props();

	const rows = $derived(data.page.data);
	const hasFilters = $derived(Boolean(data.filter.search || data.filter.source || data.filter.currency));
	const formIssues = $derived(getFormIssues(form));
	const formRowErrors = $derived(getFormRowErrors(form));
	const importResult = $derived(getImportResult(form));
	const summaryRows = $derived(data.summary);
	const defaultPayload = `{
  "source": "LOCAL_IMPORT",
  "observations": [
    {
      "marketHashName": "AK-47 | Slate (Field-Tested)",
      "currency": "USD",
      "lowestSellPrice": 1.25,
      "medianSellPrice": 1.40,
      "volume": 120,
      "observedAt": "2026-04-24T18:00:00.000Z"
    }
  ]
}`;
	const defaultCsvPayload = `marketHashName,currency,lowestSellPrice,medianSellPrice,volume,observedAt
AK-47 | Slate (Field-Tested),USD,1.25,1.40,120,2026-04-24T18:00:00.000Z`;
	const importPayload = $derived(getImportPayload(form));
	const csvPayload = $derived(getCsvPayload(form));
	const csvSource = $derived(getCsvSource(form));

	function hrefForPage(nextPage: number) {
		const params = new URLSearchParams(page.url.searchParams);
		params.set('page', String(nextPage));
		return `?${params.toString()}`;
	}

	function formatDate(value: Date | string) {
		return new Intl.DateTimeFormat('en-US', {
			month: 'short',
			day: 'numeric',
			hour: 'numeric',
			minute: '2-digit'
		}).format(new Date(value));
	}

	function formatExterior(value: string | null) {
		return value ? value.replaceAll('_', ' ') : 'Unlinked';
	}

	function freshnessLabel(value: string | null | undefined) {
		if (!value) return 'Unknown';
		return value.replaceAll('_', ' ').toLowerCase().replace(/^\w/, (letter) => letter.toUpperCase());
	}

	function freshnessTone(value: string | null | undefined): 'success' | 'primary' | 'warning' | 'muted' {
		if (value === 'FRESH') return 'success';
		if (value === 'RECENT') return 'primary';
		if (value === 'STALE') return 'warning';
		return 'muted';
	}

	function sourceTone(value: string | null | undefined): 'success' | 'primary' | 'warning' | 'muted' {
		if (value === 'CSV_IMPORT') return 'primary';
		if (value === 'JSON_IMPORT') return 'success';
		if (value === 'MANUAL') return 'warning';
		if (value === 'STEAM_MARKET') return 'success';
		return 'muted';
	}

	function relativeAge(value: Date | string | null | undefined) {
		if (!value) return 'unknown age';
		const ageMs = Math.max(0, Date.now() - new Date(value).getTime());
		const minutes = Math.floor(ageMs / 60000);
		if (minutes < 1) return 'just now';
		if (minutes < 60) return `${minutes} min${minutes === 1 ? '' : 's'} ago`;
		const hours = Math.floor(minutes / 60);
		if (hours < 48) return `${hours} hr${hours === 1 ? '' : 's'} ago`;
		const days = Math.floor(hours / 24);
		return `${days} day${days === 1 ? '' : 's'} ago`;
	}

	function relativeAgeRange(newest: Date | string, oldest: Date | string) {
		return `newest ${relativeAge(newest)} · oldest ${relativeAge(oldest)}`;
	}

	function formatIssue(issue: unknown) {
		if (isRowError(issue)) return `Row ${issue.rowNumber}, ${issue.field}: ${issue.message}`;
		if (typeof issue === 'string') return issue;
		if (issue && typeof issue === 'object' && 'message' in issue) {
			const message = (issue as { message?: unknown }).message;
			if (typeof message === 'string') return message;
		}
		return JSON.stringify(issue);
	}

	function isRowError(issue: unknown): issue is { rowNumber: number; field: string; message: string } {
		return (
			Boolean(issue) &&
			typeof issue === 'object' &&
			typeof (issue as { rowNumber?: unknown }).rowNumber === 'number' &&
			typeof (issue as { field?: unknown }).field === 'string' &&
			typeof (issue as { message?: unknown }).message === 'string'
		);
	}

	function getFormIssues(form: ActionData | undefined): unknown[] | undefined {
		if (!form || !('issues' in form) || !Array.isArray(form.issues)) return undefined;
		return form.issues;
	}

	function getFormRowErrors(form: ActionData | undefined): unknown[] | undefined {
		if (!form || !('rowErrors' in form) || !Array.isArray(form.rowErrors)) return undefined;
		return form.rowErrors;
	}

	function getImportResult(form: ActionData | undefined):
		| {
				count: number;
				observations?: PageData['page']['data'];
				refresh?: {
					candidatesReevaluated: number;
					basketsRecomputed: number;
					basketErrors: Array<{ id: string; message: string }>;
				};
				priceRefresh?: {
					watchlistCount: number;
					summaries: Array<{
						adapter: string;
						requested: number;
						written: number;
						skipped: number;
						errors: Array<{ marketHashName: string; message: string }>;
					}>;
				};
		  }
		| undefined {
		if (!form || !('importResult' in form) || !form.importResult) return undefined;
		return form.importResult;
	}

	function importedDistinctCount(result: NonNullable<typeof importResult>) {
		return new Set(result.observations?.map((observation) => observation.marketHashName) ?? []).size;
	}

	function importedCatalogLinkedCount(result: NonNullable<typeof importResult>) {
		return result.observations?.filter((observation) => observation.catalogSkinId != null).length ?? 0;
	}

	function getImportPayload(form: ActionData | undefined) {
		if (!form || !('values' in form) || !form.values) return defaultPayload;
		return typeof form.values.payload === 'string' ? form.values.payload : defaultPayload;
	}

	function getCsvPayload(form: ActionData | undefined) {
		if (!form || !('values' in form) || !form.values) return defaultCsvPayload;
		return typeof form.values.csvPayload === 'string' ? form.values.csvPayload : defaultCsvPayload;
	}

	function getCsvSource(form: ActionData | undefined) {
		if (!form || !('values' in form) || !form.values) return 'LOCAL_CSV_IMPORT';
		return typeof form.values.csvSource === 'string' ? form.values.csvSource : 'LOCAL_CSV_IMPORT';
	}

	function formatFreshnessCounts(counts: Record<string, number>) {
		return Object.entries(counts)
			.sort(([a], [b]) => freshnessSort(a) - freshnessSort(b))
			.map(([freshness, count]) => `${freshnessLabel(freshness)} ${count}`)
			.join(' · ');
	}

	function formatDuration(ms: number) {
		if (ms < 1000) return `${ms}ms`;
		const seconds = Math.round(ms / 1000);
		if (seconds < 60) return `${seconds}s`;
		const minutes = Math.floor(seconds / 60);
		const remSeconds = seconds % 60;
		return remSeconds === 0 ? `${minutes}m` : `${minutes}m ${remSeconds}s`;
	}

	function freshnessSort(value: string) {
		if (value === 'FRESH') return 0;
		if (value === 'RECENT') return 1;
		if (value === 'STALE') return 2;
		return 3;
	}
</script>

<div class="space-y-6">
	<div>
		<div class="flex flex-wrap items-start justify-between gap-4">
			<div>
				<h1 class="text-2xl font-semibold text-[var(--color-text-primary)]">Market Prices</h1>
				<p class="mt-1 text-sm text-[var(--color-text-secondary)]">
					Inspect local price observations and refresh Steam watchlist prices for EV.
				</p>
			</div>
			<div class="flex flex-col items-end gap-1">
				<form method="POST" action="?/refreshDependent" use:enhance>
					<Button type="submit" variant="secondary">Run sweep now</Button>
				</form>
				{#if data.sweeps.length > 0}
					{@const last = data.sweeps[0]}
					<div class="text-xs text-[var(--color-text-muted)]">
						Last sweep: {relativeAge(last.startedAt)}
						{#if last.finishedAt} · {last.written} written, {last.skipped} skipped{/if}
						{#if last.errorCount > 0} · <span class="text-[var(--color-warning)]">{last.errorCount} error{last.errorCount === 1 ? '' : 's'}</span>{/if}
					</div>
				{:else}
					<div class="text-xs text-[var(--color-text-muted)]">No sweeps recorded yet.</div>
				{/if}
			</div>
		</div>
	</div>

	{#if form?.error}
		<div class="space-y-2 rounded-md border border-[var(--color-danger)]/40 bg-[var(--color-danger)]/10 p-3 text-sm text-[var(--color-danger)]">
			<div>{form.error}</div>
			{#if formIssues}
				<ul class="list-disc space-y-1 pl-5">
					{#each formIssues as issue}
						<li>{formatIssue(issue)}</li>
					{/each}
				</ul>
			{/if}
			{#if formRowErrors}
				<ul class="list-disc space-y-1 pl-5">
					{#each formRowErrors as issue}
						<li>{formatIssue(issue)}</li>
					{/each}
				</ul>
			{/if}
		</div>
	{:else if form?.success}
		<div class="space-y-3 rounded-md border border-[var(--color-success)]/40 bg-[var(--color-success)]/10 p-3 text-sm text-[var(--color-success)]">
			<div>{form.success}</div>
			{#if importResult}
				<div class="grid gap-2 text-xs text-[var(--color-text-secondary)] sm:grid-cols-5">
					<div class="rounded-md border border-[var(--color-success)]/30 bg-[var(--color-bg-surface)]/70 p-2">
						<div class="font-semibold text-[var(--color-text-primary)]">{importResult.count}</div>
						<div>{importResult.priceRefresh ? 'Steam observations written' : 'observations imported'}</div>
					</div>
					<div class="rounded-md border border-[var(--color-success)]/30 bg-[var(--color-bg-surface)]/70 p-2">
						<div class="font-semibold text-[var(--color-text-primary)]">{importedDistinctCount(importResult)}</div>
						<div>distinct items</div>
					</div>
					<div class="rounded-md border border-[var(--color-success)]/30 bg-[var(--color-bg-surface)]/70 p-2">
						<div class="font-semibold text-[var(--color-text-primary)]">{importedCatalogLinkedCount(importResult)}</div>
						<div>catalog linked</div>
					</div>
					<div class="rounded-md border border-[var(--color-success)]/30 bg-[var(--color-bg-surface)]/70 p-2">
						<div class="font-semibold text-[var(--color-text-primary)]">{importResult.refresh?.candidatesReevaluated ?? 0}</div>
						<div>open candidates refreshed</div>
					</div>
					<div class="rounded-md border border-[var(--color-success)]/30 bg-[var(--color-bg-surface)]/70 p-2">
						<div class="font-semibold text-[var(--color-text-primary)]">{importResult.refresh?.basketsRecomputed ?? 0}</div>
						<div>active baskets recomputed</div>
					</div>
				</div>
				{#if importResult.priceRefresh}
					<div class="rounded-md border border-[var(--color-border)] bg-[var(--color-bg-surface)]/70 p-2 text-xs text-[var(--color-text-secondary)]">
						<div class="font-semibold text-[var(--color-text-primary)]">Steam watchlist refresh</div>
						<div class="mt-1">Watchlist: {importResult.priceRefresh.watchlistCount} item{importResult.priceRefresh.watchlistCount === 1 ? '' : 's'}</div>
						<div class="mt-2 grid gap-2 sm:grid-cols-3">
							{#each importResult.priceRefresh.summaries as summary}
								<div class="rounded-md border border-[var(--color-border)] bg-[var(--color-bg-surface-overlay)]/40 p-2">
									<div class="font-semibold text-[var(--color-text-primary)]">{summary.adapter}</div>
									<div>{summary.written} written · {summary.skipped} skipped · {summary.requested} requested</div>
									{#if summary.errors.length > 0}
										<div class="mt-1 text-[var(--color-warning)]">{summary.errors.length} error{summary.errors.length === 1 ? '' : 's'}</div>
									{/if}
								</div>
							{/each}
						</div>
					</div>
				{/if}
				{#if importResult.refresh && importResult.refresh.basketErrors.length > 0}
					<div class="rounded-md border border-[var(--color-warning)]/40 bg-[var(--color-warning)]/10 p-2 text-xs text-[var(--color-warning)]">
						<div class="font-semibold">Basket refresh errors</div>
						<ul class="mt-1 list-disc space-y-1 pl-5">
							{#each importResult.refresh.basketErrors as issue}
								<li>{issue.id}: {issue.message}</li>
							{/each}
						</ul>
					</div>
				{/if}
			{/if}
		</div>
	{/if}

	<div class="space-y-4">
		{#if data.sweeps.length > 0}
			<details class="rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-surface)]">
				<summary class="cursor-pointer px-4 py-2.5 text-sm font-medium text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]">
					Recent sweeps ({data.sweeps.length})
				</summary>
				<div class="border-t border-[var(--color-border)] p-4">
					<div class="grid gap-2">
						{#each data.sweeps as sweep}
							<div class="flex flex-wrap items-center justify-between gap-3 rounded-md border border-[var(--color-border)] bg-[var(--color-bg-surface)]/60 px-3 py-2 text-xs">
								<div>
									<div class="font-semibold text-[var(--color-text-primary)]">
										{sweep.trigger} · {formatDate(sweep.startedAt)}
									</div>
									<div class="mt-1 text-[var(--color-text-muted)]">
										{relativeAge(sweep.startedAt)}
										{#if sweep.durationMs != null} · {formatDuration(sweep.durationMs)}{/if}
										{#if !sweep.finishedAt} · <span class="text-[var(--color-warning)]">in progress</span>{/if}
									</div>
								</div>
								<div class="flex flex-wrap items-center gap-2 text-[var(--color-text-secondary)]">
									<span>watchlist {sweep.watchlistCount}</span>
									<span>·</span>
									<span>{sweep.written} written</span>
									<span>·</span>
									<span>{sweep.skipped} skipped</span>
									<span>·</span>
									<span>{sweep.requested} req</span>
									{#if sweep.errorCount > 0}
										<Badge tone="warning">{sweep.errorCount} error{sweep.errorCount === 1 ? '' : 's'}</Badge>
									{/if}
									<span class="text-[var(--color-text-muted)]">· {sweep.candidatesReevaluated} cand · {sweep.basketsRecomputed} baskets</span>
								</div>
							</div>
						{/each}
					</div>
				</div>
			</details>
		{/if}

		<details class="rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-surface)]">
			<summary class="cursor-pointer px-4 py-2.5 text-sm font-medium text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]">
				Import prices (CSV / JSON)
			</summary>
			<div class="grid gap-4 border-t border-[var(--color-border)] p-4 md:grid-cols-2">
				<form method="POST" action="?/importCsv" enctype="multipart/form-data" class="space-y-3" use:enhance>
					<div class="text-xs font-semibold uppercase tracking-wider text-[var(--color-text-muted)]">CSV</div>
					<p class="text-xs text-[var(--color-text-secondary)]">
						Columns: marketHashName, currency, lowestSellPrice, medianSellPrice, volume, observedAt.
					</p>
					<Input name="csvSource" placeholder="Source" value={csvSource} />
					<input
						name="csvFile"
						type="file"
						accept=".csv,text/csv"
						class="block w-full rounded-md border border-[var(--color-border)] bg-[var(--color-bg-surface-overlay)] px-3 py-2 text-sm file:mr-3 file:rounded-md file:border-0 file:bg-[var(--color-bg-surface)] file:px-3 file:py-1.5 file:text-sm file:text-[var(--color-text-primary)]"
					/>
					<textarea
						name="csvPayload"
						class="min-h-32 w-full resize-y rounded-md border border-[var(--color-border)] bg-[var(--color-bg-surface-overlay)] px-3 py-2 font-mono text-xs text-[var(--color-text-primary)] focus:border-[var(--color-primary)] focus:outline-none focus:ring-1 focus:ring-[var(--color-primary)]"
						spellcheck="false"
						placeholder="Or paste CSV here…"
						value={csvPayload}
					></textarea>
					<div class="flex justify-end">
						<Button type="submit" size="sm">Import CSV</Button>
					</div>
				</form>
				<form method="POST" action="?/importJson" class="space-y-3" use:enhance>
					<div class="text-xs font-semibold uppercase tracking-wider text-[var(--color-text-muted)]">JSON</div>
					<p class="text-xs text-[var(--color-text-secondary)]">
						Same payload as <code class="text-xs">POST /api/market-prices/import</code>.
					</p>
					<textarea
						name="payload"
						class="min-h-32 w-full resize-y rounded-md border border-[var(--color-border)] bg-[var(--color-bg-surface-overlay)] px-3 py-2 font-mono text-xs text-[var(--color-text-primary)] focus:border-[var(--color-primary)] focus:outline-none focus:ring-1 focus:ring-[var(--color-primary)]"
						spellcheck="false"
						value={importPayload}
					></textarea>
					<div class="flex justify-end">
						<Button type="submit" size="sm">Import JSON</Button>
					</div>
				</form>
			</div>
		</details>

		<div class="space-y-4">
			<FilterBar resetHref="/market-prices">
				<Input name="search" placeholder="Search item or catalog id" value={data.filter.search ?? ''} class="w-72" />
				<Input name="source" placeholder="Source" value={data.filter.source ?? ''} list="market-price-sources" class="w-44" />
				<datalist id="market-price-sources">
					{#each data.sources as source}
						<option value={source.source}>{source.sourceLabel} · {source.count}</option>
					{/each}
				</datalist>
				<Input name="currency" placeholder="Currency" value={data.filter.currency ?? ''} class="w-32" />
				<select name="latestOnly" value={data.filter.latestOnly === false ? 'false' : 'true'} class="rounded-md border border-[var(--color-border)] bg-[var(--color-bg-surface-overlay)] px-3 py-2 text-sm">
					<option value="true">Latest per item</option>
					<option value="false">All observations</option>
				</select>
				<select name="sortBy" value={data.filter.sortBy ?? 'observedAt'} class="rounded-md border border-[var(--color-border)] bg-[var(--color-bg-surface-overlay)] px-3 py-2 text-sm">
					<option value="observedAt">Observed time</option>
					<option value="marketValue">Market value</option>
					<option value="source">Source</option>
					<option value="currency">Currency</option>
				</select>
				<select name="sortDir" value={data.filter.sortDir ?? 'desc'} class="rounded-md border border-[var(--color-border)] bg-[var(--color-bg-surface-overlay)] px-3 py-2 text-sm">
					<option value="desc">Descending</option>
					<option value="asc">Ascending</option>
				</select>
				<select name="limit" value={String(data.filter.limit ?? 25)} class="rounded-md border border-[var(--color-border)] bg-[var(--color-bg-surface-overlay)] px-3 py-2 text-sm">
					<option value="25">25 rows</option>
					<option value="50">50 rows</option>
					<option value="100">100 rows</option>
				</select>
			</FilterBar>

			{#if summaryRows.length > 0}
				<Card padding="sm">
					<div class="flex flex-wrap items-center justify-between gap-3">
						<div>
							<h2 class="text-sm font-semibold text-[var(--color-text-primary)]">Observation summary</h2>
							<p class="mt-0.5 text-xs text-[var(--color-text-muted)]">
								Current filters · {data.filter.latestOnly === false ? 'all observations' : 'latest per item'}
							</p>
						</div>
						<div class="text-xs text-[var(--color-text-secondary)]">{data.page.total} total matches</div>
					</div>
					<div class="mt-3 grid gap-2">
						{#each summaryRows as summary}
							<div class="flex flex-wrap items-center justify-between gap-3 rounded-md border border-[var(--color-border)] bg-[var(--color-bg-surface)]/60 px-3 py-2 text-xs">
								<div>
									<div class="font-semibold text-[var(--color-text-primary)]">
										{summary.source} · {summary.currency} · {summary.count} observation{summary.count === 1 ? '' : 's'}
									</div>
									<div class="mt-1 flex flex-wrap items-center gap-2">
										<Badge tone={sourceTone(summary.sourceType)}>{summary.sourceLabel}</Badge>
										<span class="text-[var(--color-text-muted)]">{relativeAgeRange(summary.newestObservedAt, summary.oldestObservedAt)}</span>
									</div>
								</div>
								<div class="text-[var(--color-text-secondary)]">{formatFreshnessCounts(summary.freshness)}</div>
							</div>
						{/each}
					</div>
				</Card>
			{/if}

			<DataTable
				columns={['Item', 'Market value', 'Sell prices', 'Volume', 'Source', 'Freshness', 'Catalog']}
				rows={rows}
				emptyTitle="No price observations match these filters."
				emptyDescription="Import a JSON batch to start building local price history."
				clearHref={hasFilters ? '/market-prices' : null}
			>
				{#snippet row(row)}
					<td class="px-4 py-3">
						<div class="font-medium text-[var(--color-text-primary)]">{row.marketHashName}</div>
						<div class="mt-1 text-xs text-[var(--color-text-muted)]">{row.currency} · {formatExterior(row.exterior)}</div>
					</td>
					<td class="px-4 py-3 font-medium">
						<Money value={row.marketValue} currency={row.currency} />
					</td>
					<td class="px-4 py-3 text-xs text-[var(--color-text-secondary)]">
						<div>Low: <Money value={row.lowestSellPrice} currency={row.currency} /></div>
						<div>Median: <Money value={row.medianSellPrice} currency={row.currency} /></div>
					</td>
					<td class="px-4 py-3 text-[var(--color-text-secondary)]">{row.volume ?? '—'}</td>
					<td class="px-4 py-3 text-[var(--color-text-secondary)]">
						<div>{row.source}</div>
						<div class="mt-1">
							<Badge tone={sourceTone(row.sourceType)}>{row.sourceLabel}</Badge>
						</div>
					</td>
					<td class="px-4 py-3 text-[var(--color-text-secondary)]">
						<Badge tone={freshnessTone(row.freshness)}>{freshnessLabel(row.freshness)}</Badge>
						<div class="mt-1 text-xs text-[var(--color-text-muted)]">({relativeAge(row.observedAt)})</div>
						<div class="text-xs text-[var(--color-text-muted)]">{formatDate(row.observedAt)}</div>
					</td>
					<td class="px-4 py-3 text-xs text-[var(--color-text-muted)]">
						{#if row.catalogSkinId}
							<div>{row.catalogSkinId}</div>
							<div>{row.catalogCollectionId ?? 'No collection id'}</div>
						{:else}
							Unmatched
						{/if}
					</td>
				{/snippet}
			</DataTable>

			<PaginationControl
				page={data.page.page}
				limit={data.page.limit}
				total={data.page.total}
				totalPages={data.page.totalPages}
				{hrefForPage}
			/>
		</div>

	</div>
</div>
