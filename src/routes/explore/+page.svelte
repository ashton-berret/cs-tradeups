<script lang="ts">
	import { page } from '$app/state';
	import Badge from '$lib/components/Badge.svelte';
	import Card from '$lib/components/Card.svelte';
	import { EXTERIOR_SHORT, RARITY_COLORS, RARITY_LABELS, type ItemRarity } from '$lib/types/enums';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	const rarityCounts = $derived(countRarities(data.skins));

	function changeCollection(event: Event) {
		const select = event.currentTarget as HTMLSelectElement;
		const params = new URLSearchParams(page.url.searchParams);
		if (select.value === 'all') {
			params.delete('collectionId');
		} else {
			params.set('collectionId', select.value);
		}
		window.location.href = `/explore?${params.toString()}`;
	}

	function applyFloatFloorFilter(event: SubmitEvent) {
		event.preventDefault();
		const form = event.currentTarget as HTMLFormElement;
		const formData = new FormData(form);
		const threshold = String(formData.get('minFloatFloor') ?? '').trim();
		const params = new URLSearchParams(page.url.searchParams);
		if (threshold) {
			params.set('minFloatFloor', threshold);
		} else {
			params.delete('minFloatFloor');
		}
		window.location.href = `/explore?${params.toString()}`;
	}

	function countRarities(skins: PageData['skins']) {
		const counts = new Map<string, number>();
		for (const skin of skins) {
			const key = skin.rarity ?? 'UNKNOWN';
			counts.set(key, (counts.get(key) ?? 0) + 1);
		}
		return [...counts.entries()];
	}

	function rarityLabel(rarity: string | null) {
		return rarity ? RARITY_LABELS[rarity as ItemRarity] ?? rarity.replaceAll('_', ' ') : 'Unknown';
	}

	function rarityStyle(rarity: string | null) {
		const color = rarity ? RARITY_COLORS[rarity as ItemRarity] : null;
		return color ? `border-color: ${color}66; color: ${color}; background: ${color}14;` : '';
	}
</script>

<div class="space-y-6">
	<div class="flex flex-wrap items-start justify-between gap-4">
		<div>
			<h1 class="text-2xl font-semibold text-[var(--color-text-primary)]">Explore</h1>
			<p class="mt-1 text-sm text-[var(--color-text-secondary)]">
				Inspect the local CS2 catalog snapshot by collection, weapon, rarity, exterior, and float range.
			</p>
		</div>
		<div class="flex flex-wrap items-end gap-3">
			<div class="min-w-80">
				<label class="mb-2 block text-sm font-medium text-[var(--color-text-secondary)]" for="collection">
					Collection
				</label>
				<select
					id="collection"
					value={data.selectedCollectionId}
					onchange={changeCollection}
					class="w-full rounded-md border border-[var(--color-border)] bg-[var(--color-bg-surface-overlay)] px-3 py-2 text-sm"
				>
					<option value="all">All collections ({data.stats.skinCount})</option>
					{#each data.collections as collection}
						<option value={collection.id}>{collection.name} ({collection.skinCount})</option>
					{/each}
				</select>
			</div>
			<form class="flex items-end gap-2" onsubmit={applyFloatFloorFilter}>
				<div class="w-36">
					<label class="mb-2 block text-sm font-medium text-[var(--color-text-secondary)]" for="minFloatFloor">
						Min float floor
					</label>
					<input
						id="minFloatFloor"
						name="minFloatFloor"
						type="number"
						min="0"
						max="1"
						step="0.000001"
						value={data.floatFloorMin ?? ''}
						placeholder="0.15"
						class="h-10 w-full rounded-md border border-[var(--color-border)] bg-[var(--color-bg-surface-overlay)] px-3 text-sm tabular-nums"
					/>
				</div>
				<button
					type="submit"
					class="h-10 rounded-md border border-[var(--color-border)] bg-[var(--color-bg-surface-overlay)] px-3 text-sm font-medium text-[var(--color-text-primary)] hover:border-[var(--color-primary)]"
				>
					Apply
				</button>
			</form>
		</div>
	</div>

	<div class="grid grid-cols-1 gap-4 md:grid-cols-4">
		<Card padding="md" accent>
			<div class="text-xs uppercase tracking-wide text-[var(--color-text-secondary)]">Selected</div>
			<div class="mt-1 text-lg font-semibold">{data.selectedCollection?.name ?? 'All collections'}</div>
			{#if data.floatFloorMin != null}
				<div class="mt-1 text-xs text-[var(--color-text-secondary)]">
					Filtered to min float above {data.floatFloorMin.toFixed(6)}
				</div>
			{/if}
		</Card>
		<Card padding="md">
			<div class="text-xs uppercase tracking-wide text-[var(--color-text-secondary)]">Visible skins</div>
			<div class="mt-1 text-2xl font-semibold">{data.skins.length}</div>
		</Card>
		<Card padding="md">
			<div class="text-xs uppercase tracking-wide text-[var(--color-text-secondary)]">Catalog skins</div>
			<div class="mt-1 text-2xl font-semibold">{data.stats.skinCount}</div>
		</Card>
		<Card padding="md">
			<div class="text-xs uppercase tracking-wide text-[var(--color-text-secondary)]">Generated</div>
			<div class="mt-1 text-sm font-medium">{new Date(data.generatedAt).toLocaleString()}</div>
		</Card>
	</div>

	<Card padding="md">
		<div class="mb-3 flex flex-wrap items-center gap-2">
			<span class="text-sm font-medium text-[var(--color-text-primary)]">Rarity distribution</span>
			{#each rarityCounts as [rarity, count]}
				<span
					class="rounded-full border px-2 py-0.5 text-xs"
					style={rarityStyle(rarity === 'UNKNOWN' ? null : rarity)}
				>
					{rarityLabel(rarity === 'UNKNOWN' ? null : rarity)}: {count}
				</span>
			{/each}
		</div>

		<div class="overflow-x-auto">
			<table class="w-full text-sm">
				<thead>
					<tr class="border-b border-[var(--color-border)] text-left text-xs uppercase tracking-wide text-[var(--color-text-secondary)]">
						<th class="px-3 py-2">Collection</th>
						<th class="px-3 py-2">Weapon</th>
						<th class="px-3 py-2">Skin</th>
						<th class="px-3 py-2">Rarity</th>
						<th class="px-3 py-2">Float range</th>
						<th class="px-3 py-2">Exteriors</th>
						<th class="px-3 py-2">IDs</th>
						<th class="px-3 py-2">Market hashes</th>
					</tr>
				</thead>
				<tbody>
					{#each data.skins as skin}
						<tr class="border-b border-[var(--color-border)] align-top">
							<td class="px-3 py-2 text-[var(--color-text-secondary)]">{skin.collectionName}</td>
							<td class="px-3 py-2 font-medium text-[var(--color-text-primary)]">{skin.weaponName}</td>
							<td class="px-3 py-2">{skin.skinName}</td>
							<td class="px-3 py-2">
								<span class="rounded-full border px-2 py-0.5 text-xs" style={rarityStyle(skin.rarity)}>
									{rarityLabel(skin.rarity)}
								</span>
							</td>
							<td class="px-3 py-2 font-mono text-xs tabular-nums">
								{skin.minFloat.toFixed(6)} - {skin.maxFloat.toFixed(6)}
							</td>
							<td class="px-3 py-2">
								<div class="flex flex-wrap gap-1">
									{#each skin.exteriors as exterior}
										<Badge tone="muted">{EXTERIOR_SHORT[exterior]}</Badge>
									{/each}
								</div>
							</td>
							<td class="px-3 py-2 font-mono text-xs text-[var(--color-text-secondary)]">
								def {skin.defIndex}<br />
								paint {skin.paintIndex}
							</td>
							<td class="px-3 py-2">
								<details>
									<summary class="cursor-pointer text-xs text-[var(--color-primary)]">
										{skin.marketHashNames.length} name{skin.marketHashNames.length === 1 ? '' : 's'}
									</summary>
									<ul class="mt-2 space-y-1 text-xs text-[var(--color-text-secondary)]">
										{#each skin.marketHashNames as marketHash}
											<li>
												<span class="font-mono">{EXTERIOR_SHORT[marketHash.exterior]}</span>
												{marketHash.marketHashName}
											</li>
										{/each}
									</ul>
								</details>
							</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>
	</Card>
</div>
