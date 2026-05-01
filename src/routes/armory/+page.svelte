<script lang="ts">
	import { enhance } from '$app/forms';
	import Card from '$lib/components/Card.svelte';
	import Modal from '$lib/components/Modal.svelte';
	import { ITEM_EXTERIORS, ITEM_RARITIES, RARITY_LABELS, type ItemRarity } from '$lib/types/enums';
	import type { ActionData, PageData } from './$types';

	let { data, form }: { data: PageData; form?: ActionData } = $props();
	let editingRewardId = $state<string | null>(null);
	let passModalOpen = $state(false);
	let oddsModalOpen = $state(false);

	const currency = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });
	const pct = new Intl.NumberFormat('en-US', { maximumFractionDigits: 1 });
	const recentRewards = $derived(data.rewards.slice(0, 12));
	const oddsCollections = $derived([...new Set(data.odds.map((row) => row.collection))]);

	function money(value: number | null | undefined) {
		return value == null ? '—' : currency.format(value);
	}

	function grossFromNet(value: number | null | undefined) {
		return value == null ? '' : (value / 0.85).toFixed(2);
	}

	function percent(value: number | null | undefined) {
		return value == null ? '—' : `${pct.format(value)}%`;
	}

	function dateValue(value: Date | string | null | undefined) {
		if (!value) return '';
		const date = new Date(value);
		const year = date.getUTCFullYear();
		const month = String(date.getUTCMonth() + 1).padStart(2, '0');
		const day = String(date.getUTCDate()).padStart(2, '0');
		return `${year}-${month}-${day}`;
	}

	function displayDate(value: Date | string | null | undefined) {
		const date = dateValue(value);
		if (!date) return '—';
		const [year, month, day] = date.split('-');
		return `${month}/${day}/${year}`;
	}

	function todayValue() {
		const now = new Date();
		const year = now.getFullYear();
		const month = String(now.getMonth() + 1).padStart(2, '0');
		const day = String(now.getDate()).padStart(2, '0');
		return `${year}-${month}-${day}`;
	}

	function rarityLabel(rarity: string | null) {
		return rarity ? RARITY_LABELS[rarity as ItemRarity] ?? rarity.replaceAll('_', ' ') : 'Unknown';
	}

	function profitClass(value: number | null | undefined) {
		if (value == null) return 'text-[var(--color-text-secondary)]';
		return value >= 0 ? 'text-[var(--color-success)]' : 'text-[var(--color-danger)]';
	}
</script>

<div class="space-y-6">
	<div class="flex flex-wrap items-start justify-between gap-4">
		<div>
			<h1 class="text-2xl font-semibold text-[var(--color-text-primary)]">Armory</h1>
			<p class="mt-1 text-sm text-[var(--color-text-secondary)]">
				Track pass spend, star cost basis, reward pulls, sale results, and expected-versus-actual rarity odds.
			</p>
		</div>
		<div class="flex flex-wrap gap-2">
			<button
				type="button"
				class="rounded-md bg-[var(--color-primary)] px-3 py-2 text-sm font-medium text-black"
				onclick={() => (passModalOpen = true)}
			>
				Add new pass
			</button>
			<button
				type="button"
				class="rounded-md border border-[var(--color-border)] bg-[var(--color-bg-surface)] px-3 py-2 text-sm font-medium"
				onclick={() => (oddsModalOpen = true)}
			>
				Expected odds
			</button>
		</div>
	</div>

	{#if form?.error}
		<div class="rounded-md border border-[var(--color-danger)]/40 bg-[var(--color-danger)]/10 p-3 text-sm text-[var(--color-danger)]">
			{form.error}
		</div>
	{:else if form?.success}
		<div class="rounded-md border border-[var(--color-success)]/40 bg-[var(--color-success)]/10 p-3 text-sm text-[var(--color-success)]">
			{form.success}
		</div>
	{/if}

	<div class="grid grid-cols-1 gap-4 md:grid-cols-4">
		<Card padding="md" accent>
			<div class="text-xs uppercase tracking-wide text-[var(--color-text-secondary)]">Pass spend</div>
			<div class="mt-1 text-2xl font-semibold">{money(data.summary.totalSpent)}</div>
			<div class="mt-1 text-xs text-[var(--color-text-secondary)]">
				{data.summary.passCount} pass{data.summary.passCount === 1 ? '' : 'es'} · {data.summary.totalStars} stars
			</div>
		</Card>
		<Card padding="md">
			<div class="text-xs uppercase tracking-wide text-[var(--color-text-secondary)]">Stars</div>
			<div class="mt-1 text-2xl font-semibold">{data.summary.starsSpent} spent</div>
			<div class="mt-1 text-xs text-[var(--color-text-secondary)]">
				{data.summary.starsRemaining} remaining · {money(data.summary.averageCostPerStar)} / star
			</div>
		</Card>
		<Card padding="md">
			<div class="text-xs uppercase tracking-wide text-[var(--color-text-secondary)]">Net value</div>
			<div class="mt-1 text-2xl font-semibold">{money(data.summary.totalNetValue)}</div>
			<div class="mt-1 text-xs text-[var(--color-text-secondary)]">
				Realized {money(data.summary.totalRealizedNet)} · unsold value {money(data.summary.totalEstimatedValue)}
			</div>
		</Card>
		<Card padding="md">
			<div class="text-xs uppercase tracking-wide text-[var(--color-text-secondary)]">ROI</div>
			<div class={['mt-1 text-2xl font-semibold', profitClass(data.summary.roiPct)].join(' ')}>
				{percent(data.summary.roiPct)}
			</div>
			<div class="mt-1 text-xs text-[var(--color-text-secondary)]">
				Realized {money(data.summary.totalRealizedProfit)} · open {money(data.summary.totalUnrealizedProfit)}
			</div>
		</Card>
	</div>

	<div>
		<Card padding="md">
			<h2 class="text-sm font-semibold text-[var(--color-text-primary)]">Add reward</h2>
			<form method="POST" action="?/addReward" use:enhance class="mt-4 grid grid-cols-1 gap-3 md:grid-cols-4">
				<label class="block text-xs text-[var(--color-text-secondary)] md:col-span-2">
					Market hash name
					<input name="marketHashName" required placeholder="AK-47 | Example (Field-Tested)" class="mt-1 w-full rounded-md border border-[var(--color-border)] bg-[var(--color-bg-surface-overlay)] px-3 py-2 text-sm" />
				</label>
				<label class="block text-xs text-[var(--color-text-secondary)]">
					Stars spent
					<input name="starsSpent" type="number" min="1" step="1" required class="mt-1 w-full rounded-md border border-[var(--color-border)] bg-[var(--color-bg-surface-overlay)] px-3 py-2 text-sm" />
				</label>
				<label class="block text-xs text-[var(--color-text-secondary)]">
					Received
					<input name="receivedAt" type="date" value={todayValue()} class="mt-1 w-full rounded-md border border-[var(--color-border)] bg-[var(--color-bg-surface-overlay)] px-3 py-2 text-sm" />
				</label>
				<label class="block text-xs text-[var(--color-text-secondary)]">
					Weapon
					<input name="weaponName" class="mt-1 w-full rounded-md border border-[var(--color-border)] bg-[var(--color-bg-surface-overlay)] px-3 py-2 text-sm" />
				</label>
				<label class="block text-xs text-[var(--color-text-secondary)]">
					Skin
					<input name="skinName" class="mt-1 w-full rounded-md border border-[var(--color-border)] bg-[var(--color-bg-surface-overlay)] px-3 py-2 text-sm" />
				</label>
				<label class="block text-xs text-[var(--color-text-secondary)]">
					Collection
					<input name="collection" class="mt-1 w-full rounded-md border border-[var(--color-border)] bg-[var(--color-bg-surface-overlay)] px-3 py-2 text-sm" />
				</label>
				<label class="block text-xs text-[var(--color-text-secondary)]">
					Rarity
					<select name="rarity" class="mt-1 w-full rounded-md border border-[var(--color-border)] bg-[var(--color-bg-surface-overlay)] px-3 py-2 text-sm">
						<option value="">Auto/unknown</option>
						{#each ITEM_RARITIES as rarity}
							<option value={rarity}>{rarityLabel(rarity)}</option>
						{/each}
					</select>
				</label>
				<label class="block text-xs text-[var(--color-text-secondary)]">
					Exterior
					<select name="exterior" class="mt-1 w-full rounded-md border border-[var(--color-border)] bg-[var(--color-bg-surface-overlay)] px-3 py-2 text-sm">
						<option value="">Auto/none</option>
						{#each ITEM_EXTERIORS as exterior}
							<option value={exterior}>{exterior.replaceAll('_', ' ')}</option>
						{/each}
					</select>
				</label>
				<label class="block text-xs text-[var(--color-text-secondary)]">
					Float
					<input name="floatValue" type="number" min="0" max="1" step="0.0000001" class="mt-1 w-full rounded-md border border-[var(--color-border)] bg-[var(--color-bg-surface-overlay)] px-3 py-2 text-sm" />
				</label>
				<label class="block text-xs text-[var(--color-text-secondary)]">
					Pattern
					<input name="pattern" type="number" step="1" class="mt-1 w-full rounded-md border border-[var(--color-border)] bg-[var(--color-bg-surface-overlay)] px-3 py-2 text-sm" />
				</label>
				<label class="block text-xs text-[var(--color-text-secondary)]">
					Steam gross value
					<input name="estimatedGrossValue" type="number" min="0" step="0.01" class="mt-1 w-full rounded-md border border-[var(--color-border)] bg-[var(--color-bg-surface-overlay)] px-3 py-2 text-sm" />
				</label>
				<label class="block text-xs text-[var(--color-text-secondary)] md:col-span-2">
					Inspect link
					<input name="inspectLink" class="mt-1 w-full rounded-md border border-[var(--color-border)] bg-[var(--color-bg-surface-overlay)] px-3 py-2 text-sm" />
				</label>
				<label class="block text-xs text-[var(--color-text-secondary)] md:col-span-2">
					Notes
					<input name="notes" class="mt-1 w-full rounded-md border border-[var(--color-border)] bg-[var(--color-bg-surface-overlay)] px-3 py-2 text-sm" />
				</label>
				<div class="md:col-span-4">
					<button class="rounded-md bg-[var(--color-primary)] px-3 py-2 text-sm font-medium text-black" type="submit">
						Add reward
					</button>
				</div>
			</form>
		</Card>
	</div>

	<div class="grid grid-cols-1 gap-4 xl:grid-cols-2">
		<Card padding="md">
			<h2 class="text-sm font-semibold text-[var(--color-text-primary)]">Expected vs actual odds</h2>
			<div class="mt-4 overflow-x-auto">
				<table class="w-full text-sm">
					<thead class="text-left text-xs uppercase tracking-wide text-[var(--color-text-secondary)]">
						<tr>
							<th class="py-2">Rarity</th>
							<th class="py-2 text-right">Expected</th>
							<th class="py-2 text-right">Actual</th>
							<th class="py-2 text-right">Pulls</th>
							<th class="py-2 text-right">Delta</th>
						</tr>
					</thead>
					{#each oddsCollections as collection}
						<tbody>
							<tr class="border-t border-[var(--color-border)] bg-[var(--color-bg-surface-overlay)]">
								<td colspan="5" class="py-2 text-xs font-semibold uppercase tracking-wide text-[var(--color-text-secondary)]">
									{collection}
								</td>
							</tr>
						{#each data.odds.filter((row) => row.collection === collection) as row}
							<tr class="border-t border-[var(--color-border)]">
								<td class="py-2">{rarityLabel(row.rarity)}</td>
								<td class="py-2 text-right tabular-nums">{percent(row.expectedPct)}</td>
								<td class="py-2 text-right tabular-nums">{percent(row.actualPct)}</td>
								<td class="py-2 text-right tabular-nums">{row.actualCount}</td>
								<td class={['py-2 text-right tabular-nums', profitClass(row.deltaPct)].join(' ')}>
									{percent(row.deltaPct)}
								</td>
							</tr>
						{/each}
						</tbody>
					{/each}
				</table>
			</div>
		</Card>

		<Card padding="md">
			<h2 class="text-sm font-semibold text-[var(--color-text-primary)]">Passes</h2>
			<div class="mt-4 space-y-2">
				{#each data.passes.slice(0, 8) as pass}
					<div class="grid grid-cols-[1fr_auto] gap-3 border-b border-[var(--color-border)] pb-2 text-sm">
						<div>
							<div>{displayDate(pass.purchasedAt)}</div>
							<div class="text-xs text-[var(--color-text-secondary)]">{pass.stars} stars · {money(pass.pricePerStar)} / star</div>
						</div>
						<div class="font-medium">{money(pass.totalCost)}</div>
					</div>
				{:else}
					<div class="text-sm text-[var(--color-text-secondary)]">No passes tracked yet.</div>
				{/each}
			</div>
		</Card>
	</div>

	<Card padding="md">
		<h2 class="text-sm font-semibold text-[var(--color-text-primary)]">Rewards</h2>
		<div class="mt-4 overflow-x-auto">
			<table class="w-full text-sm">
				<thead class="text-left text-xs uppercase tracking-wide text-[var(--color-text-secondary)]">
					<tr>
						<th class="px-2 py-2">Item</th>
						<th class="px-2 py-2">Rarity</th>
						<th class="px-2 py-2 text-right">Stars</th>
						<th class="px-2 py-2 text-right">Cost</th>
						<th class="px-2 py-2 text-right">Value</th>
						<th class="px-2 py-2 text-right">Profit</th>
						<th class="px-2 py-2">Actions</th>
					</tr>
				</thead>
				<tbody>
					{#each recentRewards as reward}
						<tr class="border-t border-[var(--color-border)] align-top">
							<td class="px-2 py-3">
								<div class="font-medium text-[var(--color-text-primary)]">{reward.marketHashName}</div>
								<div class="text-xs text-[var(--color-text-secondary)]">
									{reward.collection ?? 'No collection'} · {displayDate(reward.receivedAt)}
									{#if reward.inventoryItemId}
										· <a class="text-[var(--color-primary)]" href={`/inventory?search=${encodeURIComponent(reward.marketHashName)}`}>inventory</a>
									{/if}
								</div>
							</td>
							<td class="px-2 py-3">{rarityLabel(reward.rarity)}</td>
							<td class="px-2 py-3 text-right tabular-nums">{reward.starsSpent}</td>
							<td class="px-2 py-3 text-right tabular-nums">{money(reward.costBasis)}</td>
							<td class="px-2 py-3 text-right tabular-nums">
								{#if reward.salePrice != null}
									{money(reward.salePrice - (reward.saleFees ?? 0))}
									<div class="text-xs text-[var(--color-text-secondary)]">sold net</div>
								{:else}
									{money(reward.estimatedValue)}
								{/if}
							</td>
							<td class={['px-2 py-3 text-right tabular-nums', profitClass(reward.realizedProfit ?? reward.unrealizedProfit)].join(' ')}>
								{money(reward.realizedProfit ?? reward.unrealizedProfit)}
								<div class="text-xs">{percent(reward.realizedProfitPct ?? reward.unrealizedProfitPct)}</div>
							</td>
							<td class="px-2 py-3">
								<div class="flex flex-col gap-2">
									<div class="flex flex-wrap gap-1">
										<button
											type="button"
											class="w-fit rounded-md border border-[var(--color-border)] px-2 py-1 text-xs"
											onclick={() => (editingRewardId = editingRewardId === reward.id ? null : reward.id)}
										>
											{editingRewardId === reward.id ? 'Close edit' : 'Edit'}
										</button>
										<form method="POST" action="?/duplicateReward" use:enhance>
											<input type="hidden" name="id" value={reward.id} />
											<button
												type="submit"
												class="w-fit rounded-md border border-[var(--color-border)] px-2 py-1 text-xs"
											>
												Duplicate
											</button>
										</form>
									</div>
									{#if reward.soldAt}
										<div class="text-xs text-[var(--color-text-secondary)]">
											Sold {displayDate(reward.soldAt)}
										</div>
									{:else}
									<form method="POST" action="?/recordSale" use:enhance class="grid grid-cols-[80px_70px_auto] gap-1">
										<input type="hidden" name="id" value={reward.id} />
										<input name="salePrice" type="number" min="0" step="0.01" placeholder="gross" class="rounded-md border border-[var(--color-border)] bg-[var(--color-bg-surface-overlay)] px-2 py-1 text-xs" />
										<input name="saleFees" type="number" min="0" step="0.01" placeholder="fees" class="rounded-md border border-[var(--color-border)] bg-[var(--color-bg-surface-overlay)] px-2 py-1 text-xs" />
										<button type="submit" class="rounded-md border border-[var(--color-border)] px-2 py-1 text-xs">Sold</button>
									</form>
									{/if}
								</div>
							</td>
						</tr>
						{#if editingRewardId === reward.id}
							<tr class="border-t border-[var(--color-border)] bg-[var(--color-bg-surface-overlay)]">
								<td colspan="7" class="px-2 py-3">
									<form method="POST" action="?/updateReward" use:enhance class="grid grid-cols-1 gap-3 md:grid-cols-4">
										<input type="hidden" name="id" value={reward.id} />
										<label class="block text-xs text-[var(--color-text-secondary)] md:col-span-2">
											Market hash name
											<input name="marketHashName" value={reward.marketHashName} required class="mt-1 w-full rounded-md border border-[var(--color-border)] bg-[var(--color-bg-surface)] px-3 py-2 text-sm" />
										</label>
										<label class="block text-xs text-[var(--color-text-secondary)]">
											Stars spent
											<input name="starsSpent" type="number" min="1" step="1" value={reward.starsSpent} required class="mt-1 w-full rounded-md border border-[var(--color-border)] bg-[var(--color-bg-surface)] px-3 py-2 text-sm" />
										</label>
										<label class="block text-xs text-[var(--color-text-secondary)]">
											Received
											<input name="receivedAt" type="date" value={dateValue(reward.receivedAt)} class="mt-1 w-full rounded-md border border-[var(--color-border)] bg-[var(--color-bg-surface)] px-3 py-2 text-sm" />
										</label>
										<label class="block text-xs text-[var(--color-text-secondary)]">
											Weapon
											<input name="weaponName" value={reward.weaponName ?? ''} class="mt-1 w-full rounded-md border border-[var(--color-border)] bg-[var(--color-bg-surface)] px-3 py-2 text-sm" />
										</label>
										<label class="block text-xs text-[var(--color-text-secondary)]">
											Skin
											<input name="skinName" value={reward.skinName ?? ''} class="mt-1 w-full rounded-md border border-[var(--color-border)] bg-[var(--color-bg-surface)] px-3 py-2 text-sm" />
										</label>
										<label class="block text-xs text-[var(--color-text-secondary)]">
											Collection
											<input name="collection" value={reward.collection ?? ''} class="mt-1 w-full rounded-md border border-[var(--color-border)] bg-[var(--color-bg-surface)] px-3 py-2 text-sm" />
										</label>
										<label class="block text-xs text-[var(--color-text-secondary)]">
											Rarity
											<select name="rarity" value={reward.rarity ?? ''} class="mt-1 w-full rounded-md border border-[var(--color-border)] bg-[var(--color-bg-surface)] px-3 py-2 text-sm">
												<option value="">Auto/unknown</option>
												{#each ITEM_RARITIES as rarity}
													<option value={rarity}>{rarityLabel(rarity)}</option>
												{/each}
											</select>
										</label>
										<label class="block text-xs text-[var(--color-text-secondary)]">
											Exterior
											<select name="exterior" value={reward.exterior ?? ''} class="mt-1 w-full rounded-md border border-[var(--color-border)] bg-[var(--color-bg-surface)] px-3 py-2 text-sm">
												<option value="">Auto/none</option>
												{#each ITEM_EXTERIORS as exterior}
													<option value={exterior}>{exterior.replaceAll('_', ' ')}</option>
												{/each}
											</select>
										</label>
										<label class="block text-xs text-[var(--color-text-secondary)]">
											Float
											<input name="floatValue" type="number" min="0" max="1" step="0.0000001" value={reward.floatValue ?? ''} class="mt-1 w-full rounded-md border border-[var(--color-border)] bg-[var(--color-bg-surface)] px-3 py-2 text-sm" />
										</label>
										<label class="block text-xs text-[var(--color-text-secondary)]">
											Steam gross value
											<input name="estimatedGrossValue" type="number" min="0" step="0.01" value={grossFromNet(reward.estimatedValue)} class="mt-1 w-full rounded-md border border-[var(--color-border)] bg-[var(--color-bg-surface)] px-3 py-2 text-sm" />
										</label>
										<label class="block text-xs text-[var(--color-text-secondary)] md:col-span-2">
											Notes
											<input name="notes" value={reward.notes ?? ''} class="mt-1 w-full rounded-md border border-[var(--color-border)] bg-[var(--color-bg-surface)] px-3 py-2 text-sm" />
										</label>
										<div class="md:col-span-4">
											<button type="submit" class="rounded-md bg-[var(--color-primary)] px-3 py-2 text-sm font-medium text-black">
												Save reward
											</button>
										</div>
									</form>
								</td>
							</tr>
						{/if}
					{:else}
						<tr>
							<td colspan="7" class="px-2 py-8 text-center text-sm text-[var(--color-text-secondary)]">
								Add a pass, then record rewards as you spend stars.
							</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>
	</Card>
</div>

<Modal bind:open={passModalOpen} title="Add Armory Pass">
	<form method="POST" action="?/addPass" use:enhance class="space-y-3">
		<label class="block text-xs text-[var(--color-text-secondary)]">
			Purchase date
			<input
				name="purchasedAt"
				type="date"
				value={todayValue()}
				class="mt-1 w-full rounded-md border border-[var(--color-border)] bg-[var(--color-bg-surface-overlay)] px-3 py-2 text-sm"
			/>
		</label>
		<label class="block text-xs text-[var(--color-text-secondary)]">
			Total cost
			<input
				name="totalCost"
				type="number"
				min="0"
				step="0.01"
				required
				class="mt-1 w-full rounded-md border border-[var(--color-border)] bg-[var(--color-bg-surface-overlay)] px-3 py-2 text-sm"
			/>
		</label>
		<label class="block text-xs text-[var(--color-text-secondary)]">
			Notes
			<input
				name="notes"
				class="mt-1 w-full rounded-md border border-[var(--color-border)] bg-[var(--color-bg-surface-overlay)] px-3 py-2 text-sm"
			/>
		</label>
		<button class="rounded-md bg-[var(--color-primary)] px-3 py-2 text-sm font-medium text-black" type="submit">
			Add new pass
		</button>
	</form>
</Modal>

<Modal bind:open={oddsModalOpen} title="Expected Odds">
	<form method="POST" action="?/updateOdds" use:enhance class="space-y-2">
		<label class="block text-xs text-[var(--color-text-secondary)]">
			Collection
			<input
				name="oddsCollection"
				placeholder="Default or collection name"
				class="mt-1 w-full rounded-md border border-[var(--color-border)] bg-[var(--color-bg-surface-overlay)] px-3 py-2 text-sm"
			/>
		</label>
		{#each ITEM_RARITIES as rarity}
			<label class="grid grid-cols-[1fr_90px] items-center gap-2 text-xs text-[var(--color-text-secondary)]">
				<span>{rarityLabel(rarity)}</span>
				<input
					name={`expectedPct_${rarity}`}
					type="number"
					min="0"
					max="100"
					step="0.0001"
					placeholder="%"
					class="rounded-md border border-[var(--color-border)] bg-[var(--color-bg-surface-overlay)] px-2 py-1 text-right text-sm"
				/>
			</label>
		{/each}
		<button class="mt-2 rounded-md bg-[var(--color-primary)] px-3 py-2 text-sm font-medium text-black" type="submit">
			Save odds
		</button>
	</form>
</Modal>
