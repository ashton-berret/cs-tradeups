<script lang="ts">
	import { onMount } from 'svelte';
	import Modal from './Modal.svelte';
	import type { ActivityEntry } from '$lib/types/services';

	type Props = {
		open?: boolean;
	};

	let { open = $bindable(false) }: Props = $props();

	let entries = $state<ActivityEntry[]>([]);
	let loading = $state(false);
	let errorMessage = $state<string | null>(null);
	let lastLoadedAt = $state<number | null>(null);

	$effect(() => {
		if (open && (lastLoadedAt == null || Date.now() - lastLoadedAt > 30_000)) {
			void load();
		}
	});

	async function load() {
		loading = true;
		errorMessage = null;
		try {
			const response = await fetch('/api/analytics/activity?limit=50');
			if (!response.ok) {
				errorMessage = `Failed (${response.status}).`;
				return;
			}
			entries = (await response.json()) as ActivityEntry[];
			lastLoadedAt = Date.now();
		} catch (err) {
			errorMessage = err instanceof Error ? err.message : 'Failed to load activity.';
		} finally {
			loading = false;
		}
	}

	function activityLabel(entry: ActivityEntry): string {
		return entry.kind.replaceAll('_', ' ').toLowerCase();
	}
</script>

<Modal bind:open title="Recent activity" size="lg">
	<div class="space-y-3">
		<div class="flex items-center justify-between">
			<p class="text-sm text-[var(--color-text-secondary)]">
				Last 50 candidate, inventory, basket, and execution events.
			</p>
			<button
				type="button"
				onclick={load}
				class="text-xs text-[var(--color-text-secondary)] underline hover:text-[var(--color-text-primary)]"
				disabled={loading}
			>
				{loading ? 'Refreshing…' : 'Refresh'}
			</button>
		</div>

		{#if errorMessage}
			<p class="text-sm text-[var(--color-danger)]">{errorMessage}</p>
		{:else if loading && entries.length === 0}
			<p class="text-sm text-[var(--color-text-muted)]">Loading…</p>
		{:else if entries.length === 0}
			<p class="text-sm text-[var(--color-text-muted)]">No activity yet.</p>
		{:else}
			<ul class="divide-y divide-[var(--color-border)] rounded-md border border-[var(--color-border)]">
				{#each entries as entry}
					<li class="flex items-start justify-between gap-3 px-4 py-2.5 text-sm">
						<div class="min-w-0 flex-1">
							<div class="truncate text-[var(--color-text-primary)]">{entry.label}</div>
							<div class="mt-0.5 text-xs capitalize text-[var(--color-text-muted)]">
								{activityLabel(entry)}
							</div>
						</div>
						<div class="shrink-0 text-xs tabular-nums text-[var(--color-text-secondary)]">
							{new Date(entry.at).toLocaleString()}
						</div>
					</li>
				{/each}
			</ul>
		{/if}
	</div>
</Modal>
