<script lang="ts">
	import Modal from '$lib/components/Modal.svelte';
	import Button from '$lib/components/Button.svelte';
	import Money from '$lib/components/Money.svelte';
	import FloatValue from '$lib/components/FloatValue.svelte';
	import type { CandidateRowVM } from '$lib/client/viewModels/candidates';
	const editableStatuses = ['WATCHING', 'GOOD_BUY', 'PASSED'] as const;

	type Props = {
		open?: boolean;
		candidate: CandidateRowVM | null;
	};

	let { open = $bindable(false), candidate }: Props = $props();

	function value(value: string | number | boolean | null | undefined) {
		if (value === null || value === undefined || value === '') return '—';
		return String(value);
	}
</script>

<Modal bind:open title="Candidate details" size="xl">
	{#if candidate}
		<div class="space-y-4 text-sm">
			<div>
				<h3 class="font-semibold text-[var(--color-text-primary)]">{candidate.marketHashName}</h3>
				<p class="mt-1 text-[var(--color-text-secondary)]">
					{candidate.collection ?? 'No collection'} · <FloatValue value={candidate.floatValue} /> ·
					<Money value={candidate.listPrice} currency={candidate.currency} />
				</p>
			</div>

			<div class="grid gap-3 md:grid-cols-2">
				<section class="space-y-2 rounded-md border border-[var(--color-border)] p-3">
					<h4 class="text-xs font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">Identity</h4>
					<dl class="grid grid-cols-[7.5rem_1fr] gap-x-3 gap-y-1">
						<dt class="text-[var(--color-text-muted)]">Weapon</dt>
						<dd class="break-words text-[var(--color-text-primary)]">{value(candidate.weaponName)}</dd>
						<dt class="text-[var(--color-text-muted)]">Skin</dt>
						<dd class="break-words text-[var(--color-text-primary)]">{value(candidate.skinName)}</dd>
						<dt class="text-[var(--color-text-muted)]">Collection</dt>
						<dd class="break-words text-[var(--color-text-primary)]">{value(candidate.collection)}</dd>
						<dt class="text-[var(--color-text-muted)]">Rarity</dt>
						<dd>{candidate.rarityLabel}</dd>
						<dt class="text-[var(--color-text-muted)]">Exterior</dt>
						<dd>{candidate.exteriorLabel}</dd>
						<dt class="text-[var(--color-text-muted)]">Float</dt>
						<dd><FloatValue value={candidate.floatValue} /></dd>
						<dt class="text-[var(--color-text-muted)]">Pattern</dt>
						<dd>{value(candidate.pattern)}</dd>
					</dl>
				</section>

				<section class="space-y-2 rounded-md border border-[var(--color-border)] p-3">
					<h4 class="text-xs font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">Catalog</h4>
					<dl class="grid grid-cols-[7.5rem_1fr] gap-x-3 gap-y-1">
						<dt class="text-[var(--color-text-muted)]">Linked</dt>
						<dd>{candidate.catalogSkinId ? 'Yes' : 'No'}</dd>
						<dt class="text-[var(--color-text-muted)]">Skin ID</dt>
						<dd class="break-all font-mono text-xs">{value(candidate.catalogSkinId)}</dd>
						<dt class="text-[var(--color-text-muted)]">Collection ID</dt>
						<dd class="break-all font-mono text-xs">{value(candidate.catalogCollectionId)}</dd>
						<dt class="text-[var(--color-text-muted)]">Weapon def</dt>
						<dd>{value(candidate.catalogWeaponDefIndex)}</dd>
						<dt class="text-[var(--color-text-muted)]">Paint index</dt>
						<dd>{value(candidate.catalogPaintIndex)}</dd>
					</dl>
				</section>

				<section class="space-y-2 rounded-md border border-[var(--color-border)] p-3">
					<h4 class="text-xs font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">Listing</h4>
					<dl class="grid grid-cols-[7.5rem_1fr] gap-x-3 gap-y-1">
						<dt class="text-[var(--color-text-muted)]">Source</dt>
						<dd>{candidate.source}</dd>
						<dt class="text-[var(--color-text-muted)]">Listing ID</dt>
						<dd class="break-all font-mono text-xs">{value(candidate.listingId)}</dd>
						<dt class="text-[var(--color-text-muted)]">Listing URL</dt>
						<dd class="break-all">
							{#if candidate.listingUrl}
								<a class="text-[var(--color-primary)] underline" href={candidate.listingUrl} target="_blank" rel="noreferrer">Open listing</a>
							{:else}
								—
							{/if}
						</dd>
						<dt class="text-[var(--color-text-muted)]">Inspect link</dt>
						<dd class="break-all">
							{#if candidate.inspectLink}
								<a class="text-[var(--color-primary)] underline" href={candidate.inspectLink}>Open inspect</a>
							{:else}
								—
							{/if}
						</dd>
						<dt class="text-[var(--color-text-muted)]">Times seen</dt>
						<dd>{candidate.timesSeen}</dd>
						<dt class="text-[var(--color-text-muted)]">Merge count</dt>
						<dd>{candidate.mergeCount}</dd>
					</dl>
				</section>

				<section class="space-y-2 rounded-md border border-[var(--color-border)] p-3">
					<h4 class="text-xs font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">Evaluation</h4>
					<dl class="grid grid-cols-[7.5rem_1fr] gap-x-3 gap-y-1">
						<dt class="text-[var(--color-text-muted)]">Plan</dt>
						<dd>{value(candidate.matchedPlanName)}</dd>
						<dt class="text-[var(--color-text-muted)]">Quality</dt>
						<dd>{value(candidate.qualityScore)}</dd>
						<dt class="text-[var(--color-text-muted)]">Liquidity</dt>
						<dd>{value(candidate.liquidityScore)}</dd>
						<dt class="text-[var(--color-text-muted)]">Expected profit</dt>
						<dd><Money value={candidate.expectedProfit} /></dd>
						<dt class="text-[var(--color-text-muted)]">Max buy</dt>
						<dd><Money value={candidate.maxBuyPrice} currency={candidate.currency} /></dd>
						<dt class="text-[var(--color-text-muted)]">Basket value</dt>
						<dd><Money value={candidate.marginalBasketValue} currency={candidate.currency} /></dd>
					</dl>
				</section>
			</div>

			<form method="POST" action="?/setStatus" class="space-y-3">
				<input type="hidden" name="id" value={candidate.id} />
				<label class="block text-sm font-medium text-[var(--color-text-secondary)]" for="detail-status">
					Status
				</label>
				<select
					id="detail-status"
					name="status"
					value={candidate.status}
					class="w-full rounded-md border border-[var(--color-border)] bg-[var(--color-bg-surface-overlay)] px-3 py-2 text-sm"
				>
					{#each editableStatuses as status}
						<option value={status}>{status.replaceAll('_', ' ')}</option>
					{/each}
				</select>
				<label class="block text-sm font-medium text-[var(--color-text-secondary)]" for="detail-notes">
					Notes
				</label>
				<textarea
					id="detail-notes"
					name="notes"
					rows="4"
					class="w-full rounded-md border border-[var(--color-border)] bg-[var(--color-bg-surface-overlay)] px-3 py-2 text-sm"
				>{candidate.notes ?? ''}</textarea>
				<div class="flex justify-end gap-2">
					<Button variant="secondary" onclick={() => (open = false)}>Close</Button>
					<Button type="submit">Save</Button>
				</div>
			</form>
		</div>
	{/if}
</Modal>
