<script lang="ts">
  import { page as pageState } from '$app/state';
  import Badge from '$lib/components/Badge.svelte';
  import Card from '$lib/components/Card.svelte';
  import FilterBar from '$lib/components/FilterBar.svelte';
  import PaginationControl from '$lib/components/PaginationControl.svelte';
  import { EXTERIOR_SHORT, ITEM_RARITIES, RARITY_LABELS } from '$lib/types/enums';
  import type { PageData } from './$types';

  let { data }: { data: PageData } = $props();

  const selectClass =
    'h-9 rounded-md border border-[var(--color-border)] bg-[var(--color-bg-surface-overlay)] px-3 py-2 text-sm text-[var(--color-text-primary)]';

  function hrefForPage(nextPage: number) {
    const params = new URLSearchParams(pageState.url.searchParams);
    params.set('page', String(nextPage));
    return `?${params.toString()}`;
  }

  function partitionLabel(partition: Record<string, number>, names: string[]) {
    return Object.entries(partition)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([collectionId, count], index) => `${names[index] ?? collectionId}: ${count}`)
      .join(' · ');
  }

  function probability(value: number) {
    return `${(value * 100).toFixed(2)}%`;
  }

  function floatValue(value: number) {
    return value.toFixed(6);
  }
</script>

<svelte:head>
  <title>Engine Combos · CS Tradeups</title>
</svelte:head>

<div class="space-y-6">
  <div class="flex flex-wrap items-end justify-between gap-4">
    <div>
      <h1 class="text-2xl font-semibold text-[var(--color-text-primary)]">Engine Combos</h1>
      <p class="mt-1 text-sm text-[var(--color-text-secondary)]">
        Read-only Tier-0 combo table generated from the static catalog.
      </p>
    </div>
    <div class="text-right text-sm text-[var(--color-text-secondary)]">
      <div>{data.page.total} combos</div>
      <div>{data.page.catalogVersions.length} catalog version{data.page.catalogVersions.length === 1 ? '' : 's'}</div>
    </div>
  </div>

  <FilterBar resetHref="/tradeups/engine/combos">
    <label class="space-y-1 text-sm">
      <span class="text-[var(--color-text-secondary)]">Rarity</span>
      <select class={selectClass} name="rarity" value={data.filter.rarity}>
        <option value="">All</option>
        {#each ITEM_RARITIES.slice(0, -1) as rarity}
          <option value={rarity}>{RARITY_LABELS[rarity]}</option>
        {/each}
      </select>
    </label>

    <label class="space-y-1 text-sm">
      <span class="text-[var(--color-text-secondary)]">Collection</span>
      <select class={`${selectClass} max-w-72`} name="collectionId" value={data.filter.collectionId}>
        <option value="">All</option>
        {#each data.collections as collection}
          <option value={collection.id}>{collection.name}</option>
        {/each}
      </select>
    </label>

    <label class="space-y-1 text-sm">
      <span class="text-[var(--color-text-secondary)]">StatTrak</span>
      <select class={selectClass} name="statTrak" value={data.filter.statTrak}>
        <option value="">All</option>
        <option value="false">Normal</option>
        <option value="true">StatTrak</option>
      </select>
    </label>

    <label class="space-y-1 text-sm">
      <span class="text-[var(--color-text-secondary)]">Single-output</span>
      <select class={selectClass} name="hasSingleOutputCollection" value={data.filter.hasSingleOutputCollection}>
        <option value="">All</option>
        <option value="true">Yes</option>
        <option value="false">No</option>
      </select>
    </label>

    <label class="space-y-1 text-sm">
      <span class="text-[var(--color-text-secondary)]">Catalog</span>
      <select class={`${selectClass} max-w-64`} name="catalogVersion" value={data.filter.catalogVersion}>
        <option value="">All</option>
        {#each data.page.catalogVersions as version}
          <option value={version}>{version}</option>
        {/each}
      </select>
    </label>
  </FilterBar>

  <div class="space-y-3">
    {#if data.page.data.length === 0}
      <Card>
        <p class="text-sm text-[var(--color-text-secondary)]">
          No generated combos match these filters. Run <code>tools/enumerate-combos.ts</code> first.
        </p>
      </Card>
    {:else}
      {#each data.page.data as combo}
        <Card padding="sm">
          <div class="flex flex-wrap items-start justify-between gap-3 border-b border-[var(--color-border)] pb-3">
            <div class="space-y-1">
              <div class="flex flex-wrap items-center gap-2">
                <Badge>{RARITY_LABELS[combo.inputRarity]}</Badge>
                <Badge tone={combo.statTrak ? 'warning' : 'muted'}>{combo.statTrak ? 'StatTrak' : 'Normal'}</Badge>
                {#if combo.crossCollection}<Badge tone="primary">Cross-collection</Badge>{/if}
                {#if combo.hasSingleOutputCollection}<Badge tone="success">Single-output anchor</Badge>{/if}
              </div>
              <div class="text-sm font-medium text-[var(--color-text-primary)]">
                {partitionLabel(combo.partition, combo.collectionNames)}
              </div>
              <div class="text-xs text-[var(--color-text-muted)]">
                Regime {combo.wearRegimeIndex}: {combo.wearIntervalLow.toFixed(6)}-{combo.wearIntervalHigh.toFixed(6)}
                sampled at {combo.targetAvgWearProp.toFixed(6)}
              </div>
            </div>
            <div class="text-right text-xs text-[var(--color-text-muted)]">
              <div>{combo.outputs.length} outputs</div>
              <div>{combo.catalogVersion}</div>
            </div>
          </div>

          <div class="overflow-x-auto pt-3">
            <table class="min-w-full text-sm">
              <thead class="text-left text-xs uppercase tracking-wide text-[var(--color-text-muted)]">
                <tr>
                  <th class="px-2 py-2">Output</th>
                  <th class="px-2 py-2">Collection</th>
                  <th class="px-2 py-2">Probability</th>
                  <th class="px-2 py-2">Exterior</th>
                  <th class="px-2 py-2">Float</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-[var(--color-border)]">
                {#each combo.outputs.slice(0, 12) as output}
                  <tr>
                    <td class="px-2 py-2 text-[var(--color-text-primary)]">{output.weaponName} | {output.skinName}</td>
                    <td class="px-2 py-2 text-[var(--color-text-secondary)]">{output.collectionName}</td>
                    <td class="px-2 py-2">{probability(output.probability)}</td>
                    <td class="px-2 py-2">{EXTERIOR_SHORT[output.projectedExterior]}</td>
                    <td class="px-2 py-2 font-mono text-xs">{floatValue(output.projectedFloat)}</td>
                  </tr>
                {/each}
              </tbody>
            </table>
            {#if combo.outputs.length > 12}
              <div class="px-2 pt-2 text-xs text-[var(--color-text-muted)]">
                Showing 12 of {combo.outputs.length} outputs.
              </div>
            {/if}
          </div>
        </Card>
      {/each}
    {/if}
  </div>

  <PaginationControl
    page={data.page.page}
    limit={data.page.limit}
    total={data.page.total}
    totalPages={data.page.totalPages}
    hrefForPage={hrefForPage}
  />
</div>
