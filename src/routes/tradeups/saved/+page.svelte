<script lang="ts">
	import Badge from '$lib/components/Badge.svelte';
	import Button from '$lib/components/Button.svelte';
	import Card from '$lib/components/Card.svelte';
	import Money from '$lib/components/Money.svelte';
	import Percent from '$lib/components/Percent.svelte';
	import { ApiError, apiFetch } from '$lib/client/api';
	import type { PageData } from './$types';
	import type { CombinationDTO } from '$lib/server/tradeups/combinationService';

	let { data }: { data: PageData } = $props();

	// svelte-ignore state_referenced_locally
	let combinations = $state<CombinationDTO[]>([...data.combinations]);
	let pendingId = $state<string | null>(null);
	let errorMessage = $state<string | null>(null);

	async function recheck(id: string) {
		errorMessage = null;
		pendingId = id;
		try {
			const result = await apiFetch<{ combination: CombinationDTO }>(
				fetch,
				`/api/tradeups/combinations/${id}/recheck`,
				{ method: 'POST' },
			);
			combinations = combinations.map((c) => (c.id === id ? result.combination : c));
		} catch (err) {
			errorMessage = err instanceof ApiError ? err.message : 'Recheck failed.';
		} finally {
			pendingId = null;
		}
	}

	async function toggleActive(c: CombinationDTO) {
		errorMessage = null;
		pendingId = c.id;
		try {
			const updated = await apiFetch<CombinationDTO>(fetch, `/api/tradeups/combinations/${c.id}`, {
				method: 'PATCH',
				body: JSON.stringify({ isActive: !c.isActive }),
			});
			combinations = combinations.map((row) => (row.id === c.id ? updated : row));
		} catch (err) {
			errorMessage = err instanceof ApiError ? err.message : 'Update failed.';
		} finally {
			pendingId = null;
		}
	}

	async function remove(id: string) {
		if (!confirm('Delete this saved combination? Snapshots and history will be lost.')) return;
		errorMessage = null;
		pendingId = id;
		try {
			await fetch(`/api/tradeups/combinations/${id}`, { method: 'DELETE' });
			combinations = combinations.filter((c) => c.id !== id);
		} catch (err) {
			errorMessage = err instanceof Error ? err.message : 'Delete failed.';
		} finally {
			pendingId = null;
		}
	}
</script>

<div class="space-y-6">
	<div>
		<h1 class="text-2xl font-semibold text-[var(--color-text-primary)]">Saved tradeups</h1>
		<p class="mt-1 text-sm text-[var(--color-text-secondary)]">
			Combinations you saved from the calculator. Each row keeps the original "thesis" totals frozen
			and shows the latest recheck delta. Active combinations are graduated; inactive are drafts.
		</p>
	</div>

	{#if errorMessage}
		<p class="text-sm text-[var(--color-danger)]">{errorMessage}</p>
	{/if}

	{#if combinations.length === 0}
		<Card padding="md">
			<p class="text-sm text-[var(--color-text-muted)]">
				No saved combinations yet. Build one in the
				<a class="underline" href="/calculator">calculator</a>.
			</p>
		</Card>
	{:else}
		<div class="space-y-3">
			{#each combinations as combination}
				<Card padding="md">
					<div class="flex items-start justify-between gap-4">
						<div class="min-w-0 flex-1">
							<div class="flex items-center gap-2">
								<h2 class="truncate text-lg font-semibold text-[var(--color-text-primary)]">
									{combination.name}
								</h2>
								<Badge tone={combination.isActive ? 'success' : 'muted'}>
									{combination.isActive ? 'Active' : 'Draft'}
								</Badge>
								<Badge tone="primary">{combination.mode}</Badge>
								<span class="text-xs text-[var(--color-text-muted)]">
									{combination.inputRarity.replaceAll('_', ' ')} →
									{combination.targetRarity.replaceAll('_', ' ')}
								</span>
							</div>
							{#if combination.notes}
								<p class="mt-1 text-sm text-[var(--color-text-secondary)]">{combination.notes}</p>
							{/if}
							<p class="mt-1 text-xs text-[var(--color-text-muted)]">
								Saved {new Date(combination.thesisAt).toLocaleString()} · {combination.inputs.length}
								inputs
							</p>
						</div>
						<div class="flex shrink-0 gap-2">
							<Button
								variant="secondary"
								onclick={() => recheck(combination.id)}
								disabled={pendingId === combination.id}
							>
								{pendingId === combination.id ? 'Rechecking…' : 'Recheck'}
							</Button>
							<Button
								variant="secondary"
								onclick={() => toggleActive(combination)}
								disabled={pendingId === combination.id}
							>
								{combination.isActive ? 'Deactivate' : 'Activate'}
							</Button>
							<Button
								variant="danger"
								onclick={() => remove(combination.id)}
								disabled={pendingId === combination.id}
							>
								Delete
							</Button>
						</div>
					</div>

					<div class="mt-4 grid grid-cols-1 gap-3 md:grid-cols-3">
						<div class="rounded-md border border-[var(--color-border)] p-3">
							<div class="text-xs uppercase tracking-wide text-[var(--color-text-secondary)]">
								Thesis
							</div>
							<div class="mt-1 text-sm">
								Cost <Money value={combination.thesis.totalCost} /> · EV
								<Money value={combination.thesis.totalEV} />
							</div>
							<div class="mt-1 text-sm">
								Profit <Money value={combination.thesis.expectedProfit} />
								<span class="ml-1 text-xs text-[var(--color-text-secondary)]">
									<Percent value={combination.thesis.expectedProfitPct} />
								</span>
							</div>
						</div>
						<div class="rounded-md border border-[var(--color-border)] p-3">
							<div class="text-xs uppercase tracking-wide text-[var(--color-text-secondary)]">
								Latest recheck
							</div>
							{#if combination.latestSnapshot}
								<div class="mt-1 text-sm">
									EV <Money value={combination.latestSnapshot.totalEV} /> · Profit
									<Money value={combination.latestSnapshot.expectedProfit} />
								</div>
								<div class="mt-1 text-xs text-[var(--color-text-muted)]">
									{new Date(combination.latestSnapshot.observedAt).toLocaleString()}
								</div>
							{:else}
								<p class="mt-1 text-sm text-[var(--color-text-muted)]">No rechecks yet.</p>
							{/if}
						</div>
						<div class="rounded-md border border-[var(--color-border)] p-3">
							<div class="text-xs uppercase tracking-wide text-[var(--color-text-secondary)]">
								Delta vs thesis
							</div>
							{#if combination.latestSnapshot}
								<div
									class={[
										'mt-1 text-sm font-semibold',
										combination.latestSnapshot.evDeltaVsThesis >= 0
											? 'text-[var(--color-success)]'
											: 'text-[var(--color-danger)]',
									].join(' ')}
								>
									EV <Money value={combination.latestSnapshot.evDeltaVsThesis} />
								</div>
								<div
									class={[
										'mt-1 text-sm',
										combination.latestSnapshot.profitDeltaVsThesis >= 0
											? 'text-[var(--color-success)]'
											: 'text-[var(--color-danger)]',
									].join(' ')}
								>
									Profit <Money value={combination.latestSnapshot.profitDeltaVsThesis} />
								</div>
							{:else}
								<p class="mt-1 text-sm text-[var(--color-text-muted)]">
									Run recheck to compare against current prices.
								</p>
							{/if}
						</div>
					</div>
				</Card>
			{/each}
		</div>
	{/if}
</div>
