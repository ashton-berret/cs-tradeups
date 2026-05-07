<script lang="ts">
  import { page as pageState } from '$app/state';
  import { enhance } from '$app/forms';
  import Badge from '$lib/components/Badge.svelte';
  import Card from '$lib/components/Card.svelte';
  import FilterBar from '$lib/components/FilterBar.svelte';
  import PaginationControl from '$lib/components/PaginationControl.svelte';
  import { EXTERIOR_SHORT, ITEM_RARITIES, RARITY_LABELS } from '$lib/types/enums';
  import type { PageData, ActionData } from './$types';

  let { data, form }: { data: PageData; form: ActionData } = $props();

  const selectClass =
    'h-9 rounded-md border border-[var(--color-border)] bg-[var(--color-bg-surface-overlay)] px-3 py-2 text-sm text-[var(--color-text-primary)]';
  const inputClass =
    'h-9 w-24 rounded-md border border-[var(--color-border)] bg-[var(--color-bg-surface-overlay)] px-3 py-2 text-sm text-[var(--color-text-primary)]';

  function hrefForPage(nextPage: number) {
    const params = new URLSearchParams(pageState.url.searchParams);
    params.set('page', String(nextPage));
    return `?${params.toString()}`;
  }

  function money(value: number) {
    return value >= 0 ? `$${value.toFixed(2)}` : `-$${Math.abs(value).toFixed(2)}`;
  }

  function pct(value: number) {
    return `${(value * 100).toFixed(1)}%`;
  }

  function collectionLabel(names: string[]) {
    if (names.length === 0) return '—';
    if (names.length === 1) return names[0];
    if (names.length === 2) return `${names[0]} + ${names[1]}`;
    return `${names[0]} + ${names.length - 1} more`;
  }

  function evColor(ev: number): string {
    if (ev > 0) return 'var(--color-success)';
    if (ev < 0) return 'var(--color-error)';
    return 'var(--color-text-secondary)';
  }
</script>

<svelte:head>
  <title>Engine Theses · CS Tradeups</title>
</svelte:head>

<div class="space-y-6">
  <div class="flex flex-wrap items-end justify-between gap-4">
    <div>
      <h1 class="text-2xl font-semibold text-[var(--color-text-primary)]">Engine Theses</h1>
      <p class="mt-1 text-sm text-[var(--color-text-secondary)]">
        Scored combos ranked by expected value. Uses latest price quantiles.
      </p>
    </div>
    <div class="flex items-center gap-3">
      <div class="text-right text-sm text-[var(--color-text-secondary)]">
        {data.page.total} theses
      </div>
      <form method="POST" action="?/score" use:enhance>
        <button
          type="submit"
          class="rounded-md bg-[var(--color-accent)] px-4 py-2 text-sm font-medium text-white hover:opacity-90"
        >
          Score combos
        </button>
      </form>
    </div>
  </div>

  {#if form?.success}
    <div class="rounded-md bg-[color-mix(in_srgb,var(--color-success)_10%,transparent)] border border-[var(--color-success)] px-4 py-3 text-sm text-[var(--color-success)]">
      {form.success}
    </div>
  {/if}
  {#if form?.error}
    <div class="rounded-md bg-[color-mix(in_srgb,var(--color-error)_10%,transparent)] border border-[var(--color-error)] px-4 py-3 text-sm text-[var(--color-error)]">
      {form.error}
    </div>
  {/if}

  <FilterBar resetHref="/tradeups/engine">
    <label class="space-y-1 text-sm">
      <span class="text-[var(--color-text-secondary)]">Rarity</span>
      <select class={selectClass} name="inputRarity" value={data.filter.inputRarity}>
        <option value="">All</option>
        {#each ITEM_RARITIES.slice(0, -1) as rarity}
          <option value={rarity}>{RARITY_LABELS[rarity]}</option>
        {/each}
      </select>
    </label>

    <label class="space-y-1 text-sm">
      <span class="text-[var(--color-text-secondary)]">StatTrak</span>
      <select class={selectClass} name="statTrak" value={data.filter.statTrak}>
        <option value="">Both</option>
        <option value="false">Normal</option>
        <option value="true">StatTrak</option>
      </select>
    </label>

    <label class="space-y-1 text-sm">
      <span class="text-[var(--color-text-secondary)]">Collection</span>
      <select class={selectClass} name="collectionId" value={data.filter.collectionId}>
        <option value="">All</option>
        {#each data.collections as col}
          <option value={col.id}>{col.name}</option>
        {/each}
      </select>
    </label>

    <label class="space-y-1 text-sm">
      <span class="text-[var(--color-text-secondary)]">Min EV ($)</span>
      <input type="number" step="0.01" name="minEv" value={data.filter.minEv} class={inputClass} placeholder="0" />
    </label>

    <label class="space-y-1 text-sm">
      <span class="text-[var(--color-text-secondary)]">Min Profit %</span>
      <input type="number" step="0.01" name="minProfitChance" value={data.filter.minProfitChance} class={inputClass} placeholder="0" />
    </label>

    <label class="space-y-1 text-sm">
      <span class="text-[var(--color-text-secondary)]">Sort</span>
      <select class={selectClass} name="sortBy" value={data.filter.sortBy}>
        <option value="score">Score</option>
        <option value="evMedian">EV</option>
        <option value="profitChance">Profit chance</option>
        <option value="inputCostP50">Input cost</option>
        <option value="outputValueNetP50">Output value</option>
        <option value="createdAt">Date</option>
      </select>
    </label>

    <label class="space-y-1 text-sm">
      <span class="text-[var(--color-text-secondary)]">Dir</span>
      <select class={selectClass} name="sortDir" value={data.filter.sortDir}>
        <option value="desc">Desc</option>
        <option value="asc">Asc</option>
      </select>
    </label>
  </FilterBar>

  {#if data.page.data.length === 0}
    <Card>
      <p class="py-8 text-center text-[var(--color-text-secondary)]">
        No scored theses yet. Click "Score combos" to run the scorer against latest quantiles, or collect more price data first.
      </p>
    </Card>
  {:else}
    <div class="space-y-4">
      {#each data.page.data as thesis}
        <Card>
          <div class="space-y-3">
            <!-- Header -->
            <div class="flex flex-wrap items-center gap-2">
              <span class="font-mono text-sm font-semibold" style="color: {evColor(thesis.evMedian)}">
                EV {money(thesis.evMedian)}
              </span>
              <Badge tone={thesis.evMedian > 0 ? 'success' : 'danger'}>
                {pct(thesis.profitChance)} chance
              </Badge>
              <Badge tone="muted">{RARITY_LABELS[thesis.inputRarity]} → {RARITY_LABELS[ITEM_RARITIES[ITEM_RARITIES.indexOf(thesis.inputRarity) + 1] ?? thesis.inputRarity]}</Badge>
              {#if thesis.statTrak}
                <Badge tone="warning">StatTrak</Badge>
              {/if}
              {#if thesis.missingOutputPrices > 0}
                <Badge tone="warning">{thesis.missingOutputPrices}/{thesis.totalOutputSkins} prices missing</Badge>
              {/if}
            </div>

            <!-- Stats row -->
            <div class="grid grid-cols-2 gap-x-6 gap-y-1 text-sm sm:grid-cols-4 lg:grid-cols-6">
              <div>
                <span class="text-[var(--color-text-secondary)]">Collection:</span>
                <span class="ml-1 text-[var(--color-text-primary)]">{collectionLabel(thesis.collectionNames)}</span>
              </div>
              <div>
                <span class="text-[var(--color-text-secondary)]">Input cost:</span>
                <span class="ml-1 text-[var(--color-text-primary)]">{money(thesis.inputCostP50)}</span>
              </div>
              <div>
                <span class="text-[var(--color-text-secondary)]">Output (net):</span>
                <span class="ml-1 text-[var(--color-text-primary)]">{money(thesis.outputValueNetP50)}</span>
              </div>
              <div>
                <span class="text-[var(--color-text-secondary)]">Output (gross):</span>
                <span class="ml-1 text-[var(--color-text-primary)]">{money(thesis.outputValueGrossP50)}</span>
              </div>
              <div>
                <span class="text-[var(--color-text-secondary)]">Wear regime:</span>
                <span class="ml-1 text-[var(--color-text-primary)]">#{thesis.wearRegimeIndex} ({thesis.targetAvgWearProp.toFixed(3)})</span>
              </div>
              <div>
                <span class="text-[var(--color-text-secondary)]">Score:</span>
                <span class="ml-1 font-mono text-[var(--color-text-primary)]">{thesis.score.toFixed(2)}</span>
              </div>
            </div>

            <!-- Input resolution -->
            <details class="text-sm">
              <summary class="cursor-pointer text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]">
                Inputs ({thesis.inputResolution.length} collections, {money(thesis.inputCostP50)} total)
              </summary>
              <div class="mt-2 overflow-x-auto">
                <table class="w-full text-left text-xs">
                  <thead>
                    <tr class="border-b border-[var(--color-border)] text-[var(--color-text-secondary)]">
                      <th class="px-2 py-1">Collection</th>
                      <th class="px-2 py-1">Slots</th>
                      <th class="px-2 py-1">Cheapest skin</th>
                      <th class="px-2 py-1">Exterior</th>
                      <th class="px-2 py-1 text-right">P50</th>
                      <th class="px-2 py-1 text-right">Slot cost</th>
                    </tr>
                  </thead>
                  <tbody>
                    {#each thesis.inputResolution as input}
                      <tr class="border-b border-[var(--color-border)]" class:opacity-50={input.missing}>
                        <td class="px-2 py-1">{input.collectionName}</td>
                        <td class="px-2 py-1">{input.slotCount}</td>
                        <td class="px-2 py-1">{input.skinName ?? '—'}</td>
                        <td class="px-2 py-1">{input.exterior ? EXTERIOR_SHORT[input.exterior] : '—'}</td>
                        <td class="px-2 py-1 text-right">{input.priceP50 != null ? money(input.priceP50) : '—'}</td>
                        <td class="px-2 py-1 text-right">{input.priceP50 != null ? money(input.priceP50 * input.slotCount) : '—'}</td>
                      </tr>
                    {/each}
                  </tbody>
                </table>
              </div>
            </details>

            <!-- Output resolution -->
            <details class="text-sm">
              <summary class="cursor-pointer text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]">
                Outputs ({thesis.outputResolution.length} skins, {money(thesis.outputValueNetP50)} net EV)
              </summary>
              <div class="mt-2 overflow-x-auto">
                <table class="w-full text-left text-xs">
                  <thead>
                    <tr class="border-b border-[var(--color-border)] text-[var(--color-text-secondary)]">
                      <th class="px-2 py-1">Skin</th>
                      <th class="px-2 py-1">Ext</th>
                      <th class="px-2 py-1 text-right">Prob</th>
                      <th class="px-2 py-1 text-right">Gross</th>
                      <th class="px-2 py-1 text-right">Net</th>
                      <th class="px-2 py-1 text-right">Contribution</th>
                    </tr>
                  </thead>
                  <tbody>
                    {#each thesis.outputResolution.sort((a, b) => (b.netPrice ?? 0) * b.probability - (a.netPrice ?? 0) * a.probability) as output}
                      <tr class="border-b border-[var(--color-border)]" class:opacity-50={output.missing}>
                        <td class="px-2 py-1">{output.skinName}</td>
                        <td class="px-2 py-1">{EXTERIOR_SHORT[output.exterior]}</td>
                        <td class="px-2 py-1 text-right">{pct(output.probability)}</td>
                        <td class="px-2 py-1 text-right">{output.grossPrice != null ? money(output.grossPrice) : '—'}</td>
                        <td class="px-2 py-1 text-right">{output.netPrice != null ? money(output.netPrice) : '—'}</td>
                        <td class="px-2 py-1 text-right">{output.netPrice != null ? money(output.netPrice * output.probability) : '—'}</td>
                      </tr>
                    {/each}
                  </tbody>
                </table>
              </div>
            </details>

            <!-- Footer -->
            <div class="flex items-center gap-4 text-xs text-[var(--color-text-secondary)]">
              <span>Score version: {thesis.scoreVersion}</span>
              <span>Scored: {new Date(thesis.createdAt).toLocaleDateString()}</span>
              <a href="/tradeups/engine/combos?collectionId={thesis.collections[0]}&rarity={thesis.inputRarity}" class="text-[var(--color-accent)] hover:underline">
                View combos
              </a>
            </div>
          </div>
        </Card>
      {/each}
    </div>

    <PaginationControl
      page={data.page.page}
      limit={data.page.limit}
      total={data.page.total}
      totalPages={data.page.totalPages}
      {hrefForPage}
    />
  {/if}
</div>
