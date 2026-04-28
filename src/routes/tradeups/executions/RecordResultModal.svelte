<script lang="ts">
	import Modal from '$lib/components/Modal.svelte';
	import Button from '$lib/components/Button.svelte';
	import Input from '$lib/components/Input.svelte';
	import { ITEM_EXTERIORS } from '$lib/types/enums';
	import type { ExecutionRowVM } from '$lib/client/viewModels/executions';

	type SteamItem = {
		steamAssetId: string;
		marketHashName: string;
		marketName: string;
		exterior: string | null;
		rarity: string | null;
		type: string | null;
		floatValue: number | null;
		paintSeed: number | null;
	};

	type Props = {
		open?: boolean;
		execution: ExecutionRowVM | null;
	};

	let { open = $bindable(false), execution }: Props = $props();

	// Editable form state, seeded from the execution but overridable by the
	// Steam picker so a single click auto-fills several fields.
	let resultMarketHashName = $state('');
	let resultWeaponName = $state('');
	let resultSkinName = $state('');
	let resultCollection = $state('');
	let resultExterior = $state('');
	let resultFloatValue = $state('');
	let estimatedResultValue = $state('');

	$effect(() => {
		if (execution) {
			resultMarketHashName = execution.resultMarketHashName ?? '';
			resultWeaponName = execution.resultWeaponName ?? '';
			resultSkinName = execution.resultSkinName ?? '';
			resultCollection = execution.resultCollection ?? '';
			resultExterior = execution.resultExterior ?? '';
			resultFloatValue = execution.resultFloatValue?.toString() ?? '';
			estimatedResultValue = execution.estimatedResultValue?.toString() ?? '';
		}
	});

	let steamItems = $state<SteamItem[]>([]);
	let steamLoading = $state(false);
	let steamError = $state<string | null>(null);
	let steamFilter = $state('');
	let pickerOpen = $state(false);

	const filteredItems = $derived(
		steamFilter.trim()
			? steamItems.filter((item) =>
					item.marketHashName.toLowerCase().includes(steamFilter.trim().toLowerCase()),
				)
			: steamItems,
	);

	async function loadSteamInventory() {
		pickerOpen = true;
		if (steamItems.length > 0) return;
		steamLoading = true;
		steamError = null;
		try {
			const response = await fetch('/api/steam/inventory');
			const body = await response.json();
			if (!response.ok) {
				steamError = body.message ?? `Failed (${response.status}).`;
				return;
			}
			steamItems = body.items as SteamItem[];
		} catch (err) {
			steamError = err instanceof Error ? err.message : 'Failed to load Steam inventory.';
		} finally {
			steamLoading = false;
		}
	}

	function pickSteamItem(item: SteamItem) {
		resultMarketHashName = item.marketHashName;
		// Best-effort split of "Weapon | Skin (Exterior)" into weapon/skin.
		const stripped = item.marketHashName.replace(/\s*\([^)]*\)\s*$/, '');
		const parts = stripped.split('|').map((p) => p.trim());
		if (parts.length >= 2) {
			resultWeaponName = parts[0];
			resultSkinName = parts.slice(1).join(' | ');
		}
		if (item.exterior) {
			const upper = item.exterior.replaceAll(' ', '_').replaceAll('-', '_').toUpperCase();
			if ((ITEM_EXTERIORS as readonly string[]).includes(upper)) {
				resultExterior = upper;
			}
		}
		if (item.floatValue != null) {
			resultFloatValue = item.floatValue.toString();
		}
		pickerOpen = false;
	}
</script>

<Modal bind:open title="Record result">
	{#if execution}
		<form method="POST" action="?/recordResult" class="space-y-4">
			<input type="hidden" name="id" value={execution.id} />

			<div class="rounded-md border border-[var(--color-border)] bg-[var(--color-bg-surface)] p-3">
				<div class="flex items-center justify-between gap-2">
					<span class="text-xs text-[var(--color-text-secondary)]">
						Pick the resulting item from your live Steam inventory to auto-fill below.
					</span>
					<Button type="button" size="sm" variant="secondary" onclick={loadSteamInventory}>
						{pickerOpen ? 'Refresh' : 'Pick from Steam'}
					</Button>
				</div>
				{#if pickerOpen}
					{#if steamError}
						<p class="mt-2 text-xs text-[var(--color-danger)]">{steamError}</p>
					{:else if steamLoading}
						<p class="mt-2 text-xs text-[var(--color-text-muted)]">Loading…</p>
					{:else}
						<Input
							name="steam-filter"
							placeholder="Filter by name"
							bind:value={steamFilter}
							class="mt-2"
						/>
						<ul class="mt-2 max-h-48 overflow-y-auto rounded border border-[var(--color-border)]">
							{#each filteredItems.slice(0, 50) as item}
								<li>
									<button
										type="button"
										onclick={() => pickSteamItem(item)}
										class="flex w-full items-center justify-between px-3 py-1.5 text-left text-sm hover:bg-[var(--color-primary)]/10"
									>
										<span class="truncate">{item.marketHashName}</span>
										<span class="ml-2 shrink-0 text-xs tabular-nums text-[var(--color-text-muted)]">
											{item.exterior ?? ''}
											{#if item.floatValue != null}
												· {item.floatValue.toFixed(6)}
											{/if}
											· {item.steamAssetId.slice(-6)}
										</span>
									</button>
								</li>
							{:else}
								<li class="px-3 py-2 text-xs text-[var(--color-text-muted)]">No items match.</li>
							{/each}
						</ul>
						<p class="mt-1 text-xs text-[var(--color-text-muted)]">
							Float and pattern auto-fill from Steam. Picking an item also sets the exterior.
						</p>
					{/if}
				{/if}
			</div>

			<Input
				name="resultMarketHashName"
				label="Market hash name"
				bind:value={resultMarketHashName}
				required
			/>
			<div class="grid grid-cols-2 gap-3">
				<Input name="resultWeaponName" label="Weapon" bind:value={resultWeaponName} />
				<Input name="resultSkinName" label="Skin" bind:value={resultSkinName} />
				<Input name="resultCollection" label="Collection" bind:value={resultCollection} />
				<select
					name="resultExterior"
					bind:value={resultExterior}
					class="rounded-md border border-[var(--color-border)] bg-[var(--color-bg-surface-overlay)] px-3 py-2 text-sm"
				>
					<option value="">Exterior</option>
					{#each ITEM_EXTERIORS as exterior}
						<option value={exterior}>{exterior.replaceAll('_', ' ')}</option>
					{/each}
				</select>
				<Input
					name="resultFloatValue"
					type="number"
					step="0.000001"
					min="0"
					max="1"
					label="Float"
					bind:value={resultFloatValue}
				/>
				<Input
					name="estimatedResultValue"
					type="number"
					step="0.01"
					min="0"
					label="Estimated value"
					bind:value={estimatedResultValue}
				/>
			</div>
			<div class="flex justify-end gap-2">
				<Button variant="secondary" onclick={() => (open = false)}>Cancel</Button>
				<Button type="submit">Save result</Button>
			</div>
		</form>
	{/if}
</Modal>
